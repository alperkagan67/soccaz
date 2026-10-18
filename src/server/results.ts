import { and, asc, count, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import { mvpVotes } from "@/db/schema-community";
import { MVP_WINDOW_HOURS, NO_SHOW_WINDOW_DAYS } from "./stats";
import { matchEvents, matchParticipants, matchResults, matches, teamMembers, teams, users } from "@/db/schema";
import { confirmDeadline, isValidScore, minuteAt, phaseOf, scoreFromGoals } from "@/lib/result-rules";
import type { Role } from "@/lib/roles";
import { audit } from "./audit";
import "./finalizers"; // registriert Statistik, Elo und alles, was nach dem Spiel berechnet wird
import { onMatchPlayed } from "./finalize";
import { teamName } from "./names";
import { matchAdminIds, matchParticipantIds, notifyUsers, platformAdminIds, teamAdminIds } from "./notifications";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;
export type Viewer = { id: string; role: Role };

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export async function getMatchPage(matchId: string, viewer?: Viewer | null) {
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
      finalizedAt: matches.finalizedAt,
      mvpClosedAt: matches.mvpClosedAt,
      mvpUserId: matches.mvpUserId,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(eq(matches.id, matchId));
  if (!match) return null;

  const events = await db
    .select({
      id: matchEvents.id,
      type: matchEvents.type,
      teamId: matchEvents.teamId,
      userId: matchEvents.userId,
      scorer: users.name,
      minute: matchEvents.minute,
      createdAt: matchEvents.createdAt,
    })
    .from(matchEvents)
    .leftJoin(users, eq(users.id, matchEvents.userId))
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(asc(matchEvents.createdAt));

  const [result] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
  const goals = events.filter((e) => e.type === "goal");
  const live = scoreFromGoals(goals, match.homeId, match.awayId);
  const phase = phaseOf({ status: match.status, startsAt: match.startsAt, hasPendingResult: Boolean(result) });

  const participants = await db
    .select({ userId: users.id, name: users.name, teamId: matchParticipants.teamId, noShow: matchParticipants.noShow })
    .from(matchParticipants)
    .innerJoin(users, eq(users.id, matchParticipants.userId))
    .where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId)))
    .orderBy(asc(users.name));

  let adminOf: string[] = [];
  let membership: string | null = null;
  if (viewer) {
    const mine = await db
      .select({ teamId: teamMembers.teamId, role: teamMembers.role })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, viewer.id), inArray(teamMembers.teamId, [match.homeId, match.awayId])));
    adminOf = mine.filter((m) => m.role === "admin").map((m) => m.teamId);
    membership = mine[0]?.teamId ?? null;
  }
  const platformAdmin = viewer?.role === "admin";
  const canManage = platformAdmin || adminOf.length > 0;
  const started = match.startsAt.getTime() <= Date.now();
  const openForPlay = (match.status === "lobby" || match.status === "confirmed") && started;

  // Auf welcher Seite steht die Person? (für Bestätigen oder Widersprechen)
  const mySide: "home" | "away" | null = adminOf.includes(match.homeId) ? "home" : adminOf.includes(match.awayId) ? "away" : null;
  const submitterSide: "home" | "away" | null = result ? (result.confirmedHome && !result.confirmedAway ? "home" : result.confirmedAway && !result.confirmedHome ? "away" : null) : null;

  // Spieler des Spiels: 24 Stunden nach Abschluss, nur für Mitspieler, nie für sich selbst
  const votingOpen = match.status === "played" && Boolean(match.finalizedAt) && !match.mvpClosedAt && Date.now() - match.finalizedAt!.getTime() <= MVP_WINDOW_HOURS * 3_600_000;
  const iPlayed = viewer ? participants.some((p) => p.userId === viewer.id && !p.noShow) : false;
  const [myVoteRow] = viewer && votingOpen && iPlayed ? await db.select({ candidateId: mvpVotes.candidateId }).from(mvpVotes).where(and(eq(mvpVotes.matchId, matchId), eq(mvpVotes.voterId, viewer.id))) : [];
  const [mvp] = match.mvpUserId ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, match.mvpUserId)) : [];
  const noShowOpen = match.status === "played" && Date.now() - match.startsAt.getTime() <= NO_SHOW_WINDOW_DAYS * 86_400_000;

  return {
    match,
    events,
    mvp: mvp ?? null,
    voting: { open: votingOpen, canVote: votingOpen && iPlayed, myVote: myVoteRow?.candidateId ?? null, closesAt: match.finalizedAt ? new Date(match.finalizedAt.getTime() + MVP_WINDOW_HOURS * 3_600_000) : null },
    noShowAdminTeams: noShowOpen ? (platformAdmin ? [match.homeId, match.awayId] : adminOf) : [],
    live,
    result: result ?? null,
    phase,
    participants,
    viewer: viewer
      ? {
          id: viewer.id,
          platformAdmin,
          canManage,
          mySide,
          membership,
          canUploadPhoto: started && match.status !== "cancelled" && participants.some((p) => p.userId === viewer.id),
          canRecord: canManage && openForPlay && !result,
          canSubmit: canManage && openForPlay && (!result || submitterSide === mySide || platformAdmin),
          canConfirm: Boolean(result && !result.disputed && match.status !== "played" && mySide && submitterSide && mySide !== submitterSide),
          canDispute: Boolean(result && !result.disputed && match.status !== "played" && mySide && submitterSide && mySide !== submitterSide),
          canDecide: platformAdmin && (match.status === "disputed" || openForPlay || Boolean(result)) && match.status !== "cancelled",
        }
      : null,
  };
}

export type MatchPage = NonNullable<Awaited<ReturnType<typeof getMatchPage>>>;

export function canViewMatch(page: MatchPage): boolean {
  if (page.match.visibility === "public") return true;
  const v = page.viewer;
  return Boolean(v && (v.platformAdmin || v.membership));
}

type ListRow = {
  id: string;
  startsAt: Date;
  status: MatchRow["status"];
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
};

async function listMatches(filter: ReturnType<typeof and>, order: "asc" | "desc", limit: number): Promise<ListRow[]> {
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const goalsFor = (teamCol: typeof matches.homeTeamId | typeof matches.awayTeamId) =>
    sql<number>`(select count(*)::int from ${matchEvents} where ${matchEvents.matchId} = ${matches.id} and ${matchEvents.type} = 'goal' and ${matchEvents.teamId} = ${teamCol})`;

  return db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      status: matches.status,
      homeName: home.name,
      awayName: away.name,
      homeScore: sql<number | null>`coalesce(${matchResults.homeScore}, ${goalsFor(matches.homeTeamId)})`,
      awayScore: sql<number | null>`coalesce(${matchResults.awayScore}, ${goalsFor(matches.awayTeamId)})`,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
    .where(filter)
    .orderBy(order === "asc" ? asc(matches.startsAt) : desc(matches.startsAt))
    .limit(limit);
}

/** Laufende, kommende und beendete öffentliche Spiele für die Livescore-Übersicht. */
export async function getScoreboard() {
  await connection();
  const now = new Date();
  const hours = (h: number) => new Date(now.getTime() + h * 3_600_000);
  const pub = eq(matches.visibility, "public");

  const [live, upcoming, finished] = await Promise.all([
    listMatches(and(pub, inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.startsAt} <= ${now}`, sql`${matches.startsAt} > ${hours(-6)}`), "desc", 20),
    listMatches(and(pub, eq(matches.status, "confirmed"), sql`${matches.startsAt} > ${now}`, sql`${matches.startsAt} < ${hours(24 * 14)}`), "asc", 20),
    listMatches(and(pub, eq(matches.status, "played")), "desc", 20),
  ]);
  return { live, upcoming, finished };
}

// ---------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------

async function loadAdminContext(tx: Tx, userId: string, match: MatchRow) {
  const [u] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId));
  const rows = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), inArray(teamMembers.teamId, [match.homeTeamId, match.awayTeamId])));
  const side: "home" | "away" | null = rows.some((r) => r.teamId === match.homeTeamId) ? "home" : rows.some((r) => r.teamId === match.awayTeamId) ? "away" : null;
  return { platformAdmin: u?.role === "admin", side };
}

async function mutateMatch(
  userId: string,
  matchId: string,
  statuses: MatchRow["status"][],
  fn: (tx: Tx, match: MatchRow, ctx: { platformAdmin: boolean; side: "home" | "away" | null }) => Promise<void>,
) {
  await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match) throw new DomainError("Spiel nicht gefunden.");
    if (!statuses.includes(match.status)) throw new DomainError("Dazu ist das Spiel in einem falschen Zustand.");
    const ctx = await loadAdminContext(tx, userId, match);
    await fn(tx, match, ctx);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

const PLAYING: MatchRow["status"][] = ["lobby", "confirmed"];

function requireStarted(match: MatchRow) {
  if (match.startsAt.getTime() > Date.now()) throw new DomainError("Das Spiel hat noch nicht begonnen.");
}

export type EventInput = { type: "goal" | "yellow_card" | "red_card"; teamId: string; scorerId?: string | null; minute?: number | null };

export function recordEvent(userId: string, matchId: string, input: EventInput) {
  return mutateMatch(userId, matchId, PLAYING, async (tx, match, ctx) => {
    if (!ctx.platformAdmin && !ctx.side) throw new DomainError("Nur Team-Admins können Ereignisse erfassen.");
    requireStarted(match);
    if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) throw new DomainError("Ungültiges Team.");
    const [pending] = await tx.select({ matchId: matchResults.matchId }).from(matchResults).where(eq(matchResults.matchId, matchId));
    if (pending) throw new DomainError("Das Endergebnis ist schon gemeldet.");

    if (input.scorerId) {
      const [p] = await tx
        .select({ userId: matchParticipants.userId })
        .from(matchParticipants)
        .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, input.scorerId), eq(matchParticipants.teamId, input.teamId)));
      if (!p) throw new DomainError("Dieser Spieler gehört nicht zum Team in dieser Lobby.");
    }
    const minute = input.minute ?? minuteAt(match.startsAt, new Date(), match.durationMin);
    if (minute < 0 || minute > match.durationMin + 30) throw new DomainError("Ungültige Spielminute.");

    const [event] = await tx
      .insert(matchEvents)
      .values({ matchId, type: input.type, teamId: input.teamId, userId: input.scorerId ?? null, minute, createdBy: userId })
      .returning();
    await audit(userId, `event.${input.type}`, "match", matchId, { after: event }, tx);
  });
}

export function undoLastEvent(userId: string, matchId: string) {
  return mutateMatch(userId, matchId, PLAYING, async (tx, match, ctx) => {
    if (!ctx.platformAdmin && !ctx.side) throw new DomainError("Nur Team-Admins können Ereignisse zurücknehmen.");
    const [pending] = await tx.select({ matchId: matchResults.matchId }).from(matchResults).where(eq(matchResults.matchId, matchId));
    if (pending) throw new DomainError("Das Endergebnis ist schon gemeldet.");
    const [last] = await tx.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(desc(matchEvents.createdAt)).limit(1);
    if (!last) throw new DomainError("Es gibt nichts zurückzunehmen.");
    await tx.delete(matchEvents).where(eq(matchEvents.id, last.id));
    await audit(userId, "event.undo", "match", match.id, { before: last }, tx);
  });
}

function validateScores(home: number, away: number) {
  if (!isValidScore(home) || !isValidScore(away)) throw new DomainError("Der Spielstand muss eine ganze Zahl von 0 bis 99 sein.");
}

async function finishMatch(tx: Tx, match: MatchRow, actorId: string | null) {
  await tx.update(matches).set({ status: "played" }).where(eq(matches.id, match.id));
  await audit(actorId, "match.played", "match", match.id, { before: { status: match.status }, after: { status: "played" } }, tx);
  await onMatchPlayed(tx, match.id, actorId);
  const [result] = await tx.select().from(matchResults).where(eq(matchResults.matchId, match.id));
  if (result) {
    const [home, away] = [await teamName(tx, match.homeTeamId), await teamName(tx, match.awayTeamId)];
    await notifyUsers(
      [...(await matchParticipantIds(tx, match.id)), ...(await matchAdminIds(tx, match.id))],
      { type: "result.final", title: "Endergebnis", body: `${home} ${result.homeScore} : ${result.awayScore} ${away}`, url: `/spiele/${match.id}` },
      tx,
    );
  }
}

export function submitResult(userId: string, matchId: string, homeScore: number, awayScore: number) {
  validateScores(homeScore, awayScore);
  return mutateMatch(userId, matchId, [...PLAYING, "disputed"], async (tx, match, ctx) => {
    if (!ctx.platformAdmin && !ctx.side) throw new DomainError("Nur Team-Admins können das Ergebnis melden.");
    requireStarted(match);
    const [existing] = await tx.select().from(matchResults).where(eq(matchResults.matchId, matchId));

    if (ctx.platformAdmin && !ctx.side) {
      // Plattform-Admin trägt direkt das endgültige Ergebnis ein
      await upsertFinal(tx, match, userId, homeScore, awayScore, null);
      return;
    }
    if (match.status === "disputed") throw new DomainError("Das Ergebnis ist strittig. Ein Plattform-Admin entscheidet.");

    const side = ctx.side!;
    if (existing) {
      const submitter = existing.confirmedHome && !existing.confirmedAway ? "home" : existing.confirmedAway && !existing.confirmedHome ? "away" : null;
      if (submitter !== side) throw new DomainError("Bitte bestätige das gemeldete Ergebnis oder widersprich ihm.");
    }
    const deadline = confirmDeadline(new Date());
    const values = {
      homeScore,
      awayScore,
      confirmedHome: side === "home",
      confirmedAway: side === "away",
      disputed: false,
      submittedBy: userId,
      submittedAt: new Date(),
      confirmDeadline: deadline,
      updatedAt: new Date(),
    };
    if (existing) {
      await tx.update(matchResults).set(values).where(eq(matchResults.matchId, matchId));
    } else {
      await tx.insert(matchResults).values({ matchId, ...values });
    }
    await audit(userId, "result.submit", "match", matchId, { before: existing ?? null, after: { homeScore, awayScore, side, deadline } }, tx);
    const otherTeamId = side === "home" ? match.awayTeamId : match.homeTeamId;
    const [home, away] = [await teamName(tx, match.homeTeamId), await teamName(tx, match.awayTeamId)];
    await notifyUsers(
      await teamAdminIds(tx, otherTeamId),
      { type: "result.confirm", title: "Bitte Ergebnis bestätigen", body: `Gemeldet: ${home} ${homeScore} : ${awayScore} ${away}. Ohne Antwort gilt es nach 48 Stunden automatisch.`, url: `/spiele/${matchId}` },
      tx,
    );
  });
}

export function confirmResult(userId: string, matchId: string) {
  return mutateMatch(userId, matchId, PLAYING, async (tx, match, ctx) => {
    const [result] = await tx.select().from(matchResults).where(eq(matchResults.matchId, matchId));
    if (!result) throw new DomainError("Es wurde noch kein Ergebnis gemeldet.");
    const submitter = result.confirmedHome && !result.confirmedAway ? "home" : result.confirmedAway && !result.confirmedHome ? "away" : null;
    if (!ctx.side || !submitter || ctx.side === submitter) throw new DomainError("Das gemeldete Ergebnis muss das andere Team bestätigen.");
    await tx.update(matchResults).set({ confirmedHome: true, confirmedAway: true, updatedAt: new Date() }).where(eq(matchResults.matchId, matchId));
    await audit(userId, "result.confirm", "match", matchId, { after: { homeScore: result.homeScore, awayScore: result.awayScore } }, tx);
    await finishMatch(tx, match, userId);
  });
}

export function disputeResult(userId: string, matchId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte gib einen Grund an (mindestens 3 Zeichen).");
  if (text.length > 300) throw new DomainError("Der Grund darf höchstens 300 Zeichen lang sein.");
  return mutateMatch(userId, matchId, PLAYING, async (tx, match, ctx) => {
    const [result] = await tx.select().from(matchResults).where(eq(matchResults.matchId, matchId));
    if (!result) throw new DomainError("Es wurde noch kein Ergebnis gemeldet.");
    const submitter = result.confirmedHome && !result.confirmedAway ? "home" : result.confirmedAway && !result.confirmedHome ? "away" : null;
    if (!ctx.side || !submitter || ctx.side === submitter) throw new DomainError("Nur das andere Team kann widersprechen.");
    await tx.update(matchResults).set({ disputed: true, disputeReason: text, updatedAt: new Date() }).where(eq(matchResults.matchId, matchId));
    await tx.update(matches).set({ status: "disputed" }).where(eq(matches.id, matchId));
    await audit(userId, "result.dispute", "match", matchId, { after: { reason: text } }, tx);
    const submitterTeamId = submitter === "home" ? match.homeTeamId : match.awayTeamId;
    await notifyUsers(
      await teamAdminIds(tx, submitterTeamId),
      { type: "result.disputed", title: "Ergebnis wurde bestritten", body: `Das andere Team widerspricht: ${text}`, url: `/spiele/${matchId}` },
      tx,
    );
    await notifyUsers(
      await platformAdminIds(tx),
      { type: "admin.task", title: "Streitfall zu entscheiden", body: `${await teamName(tx, match.homeTeamId)} gegen ${await teamName(tx, match.awayTeamId)}: ${text}`, url: `/spiele/${matchId}` },
      tx,
    );
  });
}

async function upsertFinal(tx: Tx, match: MatchRow, adminId: string, home: number, away: number, reason: string | null) {
  const [existing] = await tx.select().from(matchResults).where(eq(matchResults.matchId, match.id));
  const values = {
    homeScore: home,
    awayScore: away,
    confirmedHome: true,
    confirmedAway: true,
    disputed: false,
    decidedBy: adminId,
    updatedAt: new Date(),
  };
  if (existing) await tx.update(matchResults).set(values).where(eq(matchResults.matchId, match.id));
  else await tx.insert(matchResults).values({ matchId: match.id, submittedBy: adminId, ...values });
  await audit(adminId, "result.decide", "match", match.id, { before: existing ?? null, after: { home, away, reason } }, tx);
  await finishMatch(tx, match, adminId);
}

export function decideResult(adminId: string, matchId: string, home: number, away: number, reason: string) {
  validateScores(home, away);
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Bitte gib eine Begründung an (mindestens 3 Zeichen).");
  return mutateMatch(adminId, matchId, [...PLAYING, "disputed"], async (tx, match, ctx) => {
    if (!ctx.platformAdmin) throw new DomainError("Nur Plattform-Admins können entscheiden.");
    requireStarted(match);
    await upsertFinal(tx, match, adminId, home, away, text);
  });
}

/** Bestätigt Ergebnisse automatisch, wenn das andere Team 48 Stunden lang weder bestätigt noch widersprochen hat. */
export async function autoConfirmOverdueResults(now: Date = new Date()): Promise<number> {
  const overdue = await db
    .select({ matchId: matchResults.matchId })
    .from(matchResults)
    .innerJoin(matches, eq(matches.id, matchResults.matchId))
    .where(
      and(
        lt(matchResults.confirmDeadline, now),
        eq(matchResults.disputed, false),
        or(eq(matchResults.confirmedHome, false), eq(matchResults.confirmedAway, false)),
        inArray(matches.status, PLAYING),
      ),
    );
  let done = 0;
  for (const { matchId } of overdue) {
    await db.transaction(async (tx) => {
      const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
      if (!match || !PLAYING.includes(match.status)) return;
      await tx
        .update(matchResults)
        .set({ confirmedHome: true, confirmedAway: true, autoConfirmed: true, updatedAt: new Date() })
        .where(eq(matchResults.matchId, matchId));
      await audit(null, "result.auto_confirm", "match", matchId, {}, tx);
      await finishMatch(tx, match, null);
      await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
      done += 1;
    });
  }
  return done;
}

/** Offene Streitfälle und überfällige Ergebnisse für das Admin-Dashboard. */
export async function countDisputed(): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(matches).where(eq(matches.status, "disputed"));
  return n;
}
