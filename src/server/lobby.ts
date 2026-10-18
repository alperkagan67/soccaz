import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams, users } from "@/db/schema";
import { hasFreeSlot, isConfirmable, isSubstituteByRank, MAX_PENDING_STRANGERS } from "@/lib/lobby-rules";
import { audit } from "./audit";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;

export type Viewer = { id: string; role: "player" | "admin" };

export async function getLobby(matchId: string, viewer?: Viewer | null) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return null;
  const home = alias(teams, "home");
  const away = alias(teams, "away");

  const [match] = await db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      durationMin: matches.durationMin,
      venueText: matches.venueText,
      visibility: matches.visibility,
      status: matches.status,
      homeId: home.id,
      homeName: home.name,
      homeSlug: home.slug,
      awayId: away.id,
      awayName: away.name,
      awaySlug: away.slug,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(eq(matches.id, matchId));
  if (!match) return null;

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      isVerifiedPro: users.isVerifiedPro,
      teamId: matchParticipants.teamId,
      fromOutside: matchParticipants.isSubstitute,
      readyAt: matchParticipants.readyAt,
    })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(eq(matchParticipants.matchId, matchId))
    .orderBy(asc(matchParticipants.joinedAt), asc(users.name));

  const rankInTeam = new Map<string, number>();
  const participants = rows.map((p) => {
    const rank = p.teamId ? (rankInTeam.get(p.teamId) ?? 0) : 0;
    if (p.teamId) rankInTeam.set(p.teamId, rank + 1);
    return { ...p, isSubstitute: isSubstituteByRank(rank, p.fromOutside), ready: p.readyAt !== null };
  });

  const countFor = (teamId: string) => participants.filter((p) => p.teamId === teamId).length;
  const readyFor = (teamId: string) => participants.filter((p) => p.teamId === teamId && p.ready).length;

  let membership: string | null = null;
  let adminOf: string[] = [];
  if (viewer) {
    const mine = await db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, viewer.id), inArray(teamMembers.teamId, [match.homeId, match.awayId])));
    membership = mine[0]?.teamId ?? null;
    adminOf = mine.filter((m) => m.role === "admin").map((m) => m.teamId);
  }
  const me = viewer ? (participants.find((p) => p.userId === viewer.id) ?? null) : null;
  const platformAdmin = viewer?.role === "admin";
  const active = (match.status === "lobby" || match.status === "confirmed") && match.startsAt.getTime() > Date.now();
  const pendingStrangers = participants.filter((p) => p.teamId === null);

  return {
    match,
    participants,
    counts: { home: countFor(match.homeId), away: countFor(match.awayId), readyHome: readyFor(match.homeId), readyAway: readyFor(match.awayId) },
    pendingStrangers,
    viewer: viewer
      ? {
          id: viewer.id,
          platformAdmin,
          membershipTeamId: membership,
          adminOf,
          participant: me,
          canManage: platformAdmin || adminOf.length > 0,
          canJoin: active && !me && membership !== null && hasFreeSlot(countFor(membership)),
          teamFull: active && !me && membership !== null && !hasFreeSlot(countFor(membership)),
          canJoinAsSubstitute:
            active &&
            !me &&
            membership === null &&
            match.visibility === "public" &&
            pendingStrangers.length < MAX_PENDING_STRANGERS &&
            (hasFreeSlot(countFor(match.homeId)) || hasFreeSlot(countFor(match.awayId))),
        }
      : null,
    active,
  };
}

export type LobbyView = NonNullable<Awaited<ReturnType<typeof getLobby>>>;

/** Darf diese Person die Lobby sehen? Private Spiele nur Teilnehmer, Teammitglieder und Plattform-Admins. */
export function canViewLobby(view: LobbyView): boolean {
  if (view.match.visibility === "public") return true;
  const v = view.viewer;
  return Boolean(v && (v.platformAdmin || v.participant || v.membershipTeamId));
}

// ---------------------------------------------------------------------------------------------
// Aktionen. Jede läuft in einer Transaktion, sperrt das Spiel und meldet die Änderung per NOTIFY.
// ---------------------------------------------------------------------------------------------

async function isPlatformAdmin(tx: Tx, userId: string) {
  const [row] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return row?.role === "admin";
}

async function isAdminOf(tx: Tx, userId: string, teamId: string) {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return row?.role === "admin";
}

async function canManageMatch(tx: Tx, userId: string, match: MatchRow) {
  return (
    (await isPlatformAdmin(tx, userId)) ||
    (await isAdminOf(tx, userId, match.homeTeamId)) ||
    (await isAdminOf(tx, userId, match.awayTeamId))
  );
}

async function teamCount(tx: Tx, matchId: string, teamId: string) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.teamId, teamId)));
  return n;
}

/** Bestätigt das Spiel, sobald beide Teams genug bereite Spieler haben, und nimmt es zurück, wenn sie wieder fehlen. */
async function evaluateConfirmation(tx: Tx, match: MatchRow, actorId: string) {
  const [current] = await tx.select({ status: matches.status }).from(matches).where(eq(matches.id, match.id));
  if (!current || (current.status !== "lobby" && current.status !== "confirmed")) return;

  const ready = async (teamId: string) => {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(matchParticipants)
      .where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.teamId, teamId), isNotNull(matchParticipants.readyAt)));
    return n;
  };
  const next = isConfirmable(await ready(match.homeTeamId), await ready(match.awayTeamId)) ? "confirmed" : "lobby";
  if (next !== current.status) {
    await tx.update(matches).set({ status: next }).where(eq(matches.id, match.id));
    await audit(actorId, "match.status", "match", match.id, { before: { status: current.status }, after: { status: next } }, tx);
  }
}

async function mutateLobby(userId: string, matchId: string, fn: (tx: Tx, match: MatchRow) => Promise<void>) {
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match) throw new DomainError("Spiel nicht gefunden.");
    if (match.status !== "lobby" && match.status !== "confirmed") throw new DomainError("Dieses Spiel kann nicht mehr geändert werden.");
    if (match.startsAt.getTime() <= Date.now()) throw new DomainError("Der Anstoß ist schon erreicht.");
    await fn(tx, match);
    await evaluateConfirmation(tx, match, userId);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

async function findParticipant(tx: Tx, matchId: string, userId: string) {
  const [row] = await tx
    .select()
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  return row ?? null;
}

export function joinLobby(userId: string, matchId: string) {
  return mutateLobby(userId, matchId, async (tx, match) => {
    const mine = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, [match.homeTeamId, match.awayTeamId])));
    if (mine.length === 0) throw new DomainError("Nur Mitglieder der beiden Teams können beitreten.");
    if (await findParticipant(tx, matchId, userId)) throw new DomainError("Du bist schon in der Lobby.");
    const teamId = mine.find((m) => m.teamId === match.homeTeamId)?.teamId ?? mine[0].teamId;
    if (!hasFreeSlot(await teamCount(tx, matchId, teamId))) throw new DomainError("Dein Team ist voll (5 Spieler plus 1 Ersatz).");
    await tx.insert(matchParticipants).values({ matchId, userId, teamId });
    await audit(userId, "lobby.join", "match", matchId, { after: { teamId } }, tx);
  });
}

export function leaveLobby(userId: string, matchId: string) {
  return mutateLobby(userId, matchId, async (tx) => {
    const removed = await tx
      .delete(matchParticipants)
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)))
      .returning({ userId: matchParticipants.userId });
    if (removed.length === 0) throw new DomainError("Du bist nicht in dieser Lobby.");
    await audit(userId, "lobby.leave", "match", matchId, {}, tx);
  });
}

export function setReady(userId: string, matchId: string, ready: boolean) {
  return mutateLobby(userId, matchId, async (tx) => {
    const me = await findParticipant(tx, matchId, userId);
    if (!me) throw new DomainError("Tritt zuerst der Lobby bei.");
    if (!me.teamId) throw new DomainError("Erst muss ein Team-Admin dich einem Team zuweisen.");
    await tx
      .update(matchParticipants)
      .set({ readyAt: ready ? new Date() : null })
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
  });
}

export function setVenue(userId: string, matchId: string, venue: string) {
  const text = venue.trim();
  if (text.length > 120) throw new DomainError("Der Ort darf höchstens 120 Zeichen lang sein.");
  return mutateLobby(userId, matchId, async (tx, match) => {
    if (!(await canManageMatch(tx, userId, match))) throw new DomainError("Nur Team-Admins können den Ort festlegen.");
    await tx.update(matches).set({ venueText: text || null }).where(eq(matches.id, matchId));
    await audit(userId, "lobby.venue", "match", matchId, { before: { venue: match.venueText }, after: { venue: text || null } }, tx);
  });
}

export function joinAsSubstitute(userId: string, matchId: string) {
  return mutateLobby(userId, matchId, async (tx, match) => {
    if (match.visibility !== "public") throw new DomainError("Diese Lobby ist privat.");
    const mine = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), inArray(teamMembers.teamId, [match.homeTeamId, match.awayTeamId])));
    if (mine.length > 0) throw new DomainError("Du gehörst zu einem der Teams und trittst darüber bei.");
    if (await findParticipant(tx, matchId, userId)) throw new DomainError("Du bist schon in der Lobby.");

    const [{ pending }] = await tx
      .select({ pending: count() })
      .from(matchParticipants)
      .where(and(eq(matchParticipants.matchId, matchId), isNull(matchParticipants.teamId)));
    if (pending >= MAX_PENDING_STRANGERS) throw new DomainError("Es warten schon genug Ersatzspieler.");
    const free = hasFreeSlot(await teamCount(tx, matchId, match.homeTeamId)) || hasFreeSlot(await teamCount(tx, matchId, match.awayTeamId));
    if (!free) throw new DomainError("Beide Teams sind voll.");

    await tx.insert(matchParticipants).values({ matchId, userId, teamId: null, isSubstitute: true });
    await audit(userId, "lobby.substitute.join", "match", matchId, {}, tx);
  });
}

export function assignSubstitute(actorId: string, matchId: string, targetUserId: string, teamId: string) {
  return mutateLobby(actorId, matchId, async (tx, match) => {
    if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) throw new DomainError("Ungültiges Team.");
    if (!(await isPlatformAdmin(tx, actorId)) && !(await isAdminOf(tx, actorId, teamId))) {
      throw new DomainError("Nur Admins dieses Teams können Ersatzspieler zuweisen.");
    }
    const target = await findParticipant(tx, matchId, targetUserId);
    if (!target || target.teamId !== null) throw new DomainError("Dieser Spieler wartet nicht auf eine Zuweisung.");
    if (!hasFreeSlot(await teamCount(tx, matchId, teamId))) throw new DomainError("Das Team ist voll.");
    await tx
      .update(matchParticipants)
      .set({ teamId, joinedAt: new Date() })
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, targetUserId)));
    await audit(actorId, "lobby.substitute.assign", "match", matchId, { after: { userId: targetUserId, teamId } }, tx);
  });
}

export function removeParticipant(actorId: string, matchId: string, targetUserId: string) {
  return mutateLobby(actorId, matchId, async (tx, match) => {
    if (actorId === targetUserId) throw new DomainError("Zum Verlassen nutze „Abmelden“.");
    const target = await findParticipant(tx, matchId, targetUserId);
    if (!target) throw new DomainError("Spieler nicht gefunden.");
    const allowed =
      (await isPlatformAdmin(tx, actorId)) ||
      (target.teamId ? await isAdminOf(tx, actorId, target.teamId) : await canManageMatch(tx, actorId, match));
    if (!allowed) throw new DomainError("Dazu hast du keine Berechtigung.");
    await tx
      .delete(matchParticipants)
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, targetUserId)));
    await audit(actorId, "lobby.remove", "match", matchId, { before: { userId: targetUserId, teamId: target.teamId } }, tx);
  });
}

export function cancelMatch(actorId: string, matchId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte gib einen Grund an (mindestens 3 Zeichen).");
  if (text.length > 200) throw new DomainError("Der Grund darf höchstens 200 Zeichen lang sein.");
  return mutateLobby(actorId, matchId, async (tx, match) => {
    if (!(await canManageMatch(tx, actorId, match))) throw new DomainError("Nur Team-Admins können das Spiel absagen.");
    await tx.update(matches).set({ status: "cancelled" }).where(eq(matches.id, matchId));
    await audit(actorId, "match.cancel", "match", matchId, { before: { status: match.status }, after: { status: "cancelled", reason: text } }, tx);
  });
}

/** Spiele einer Person: als Teilnehmer oder als Mitglied eines der beiden Teams. */
export async function myMatches(userId: string) {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const rows = await db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      status: matches.status,
      durationMin: matches.durationMin,
      homeName: home.name,
      awayName: away.name,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(
      sql`${matches.id} in (select match_id from match_participants where user_id = ${userId})
        or ${matches.homeTeamId} in (select team_id from team_members where user_id = ${userId})
        or ${matches.awayTeamId} in (select team_id from team_members where user_id = ${userId})`,
    )
    .orderBy(desc(matches.startsAt))
    .limit(30);
  return rows;
}
