import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { connection } from "next/server";
import { db } from "@/db";
import {
  auditLog,
  invites,
  matchEvents,
  matchParticipants,
  matchRequests,
  matchResults,
  matches,
  notifications,
  teamMembers,
  teams,
  users,
} from "@/db/schema";
import type { Role } from "@/lib/roles";
import { audit } from "./audit";
import { DomainError } from "./teams";

export const PAGE_SIZE = 25;
const likeTerm = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

// ---------------------------------------------------------------------------------------------
// Übersicht und Aufgaben
// ---------------------------------------------------------------------------------------------

export async function getOverview() {
  await connection();
  const now = new Date();
  const one = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [usersN, teamsN, openRequests, upcoming, live, disputed, undelivered] = await Promise.all([
    one(db.select({ n: count() }).from(users)),
    one(db.select({ n: count() }).from(teams).where(isNull(teams.archivedAt))),
    one(db.select({ n: count() }).from(matchRequests).where(and(eq(matchRequests.status, "open"), sql`${matchRequests.startsAt} > ${now}`))),
    one(db.select({ n: count() }).from(matches).where(and(inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.startsAt} > ${now}`))),
    one(db.select({ n: count() }).from(matches).where(and(inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.startsAt} <= ${now}`))),
    one(db.select({ n: count() }).from(matches).where(eq(matches.status, "disputed"))),
    one(db.select({ n: count() }).from(notifications).where(isNull(notifications.deliveredAt))),
  ]);
  return { users: usersN, teams: teamsN, openRequests, upcoming, live, disputed, undelivered };
}

export async function listDisputed() {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  return db
    .select({
      matchId: matches.id,
      startsAt: matches.startsAt,
      homeName: home.name,
      awayName: away.name,
      homeScore: matchResults.homeScore,
      awayScore: matchResults.awayScore,
      reason: matchResults.disputeReason,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
    .where(eq(matches.status, "disputed"))
    .orderBy(matches.startsAt);
}

/** Spiele, die schon begonnen haben, aber nach 6 Stunden noch kein Ergebnis haben. */
export async function listStaleMatches() {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const cutoff = new Date(Date.now() - 6 * 3_600_000);
  return db
    .select({ matchId: matches.id, startsAt: matches.startsAt, homeName: home.name, awayName: away.name })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
    .where(and(eq(matches.status, "confirmed"), sql`${matches.startsAt} < ${cutoff}`, isNull(matchResults.matchId)))
    .orderBy(matches.startsAt)
    .limit(20);
}

// ---------------------------------------------------------------------------------------------
// Spiele
// ---------------------------------------------------------------------------------------------

export async function listAllMatches(filter: { status?: string; q?: string; page?: number }) {
  await connection();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const page = Math.max(1, filter.page ?? 1);
  const conditions = [
    filter.status && ["lobby", "confirmed", "played", "disputed", "cancelled"].includes(filter.status)
      ? eq(matches.status, filter.status as "lobby" | "confirmed" | "played" | "disputed" | "cancelled")
      : undefined,
    filter.q ? or(ilike(home.name, likeTerm(filter.q)), ilike(away.name, likeTerm(filter.q))) : undefined,
  ];
  const rows = await db
    .select({
      id: matches.id,
      startsAt: matches.startsAt,
      status: matches.status,
      visibility: matches.visibility,
      venueText: matches.venueText,
      homeName: home.name,
      awayName: away.name,
    })
    .from(matches)
    .innerJoin(home, eq(home.id, matches.homeTeamId))
    .innerJoin(away, eq(away.id, matches.awayTeamId))
    .where(and(...conditions))
    .orderBy(desc(matches.startsAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

// ---------------------------------------------------------------------------------------------
// Nutzer
// ---------------------------------------------------------------------------------------------

export async function listUsers(filter: { q?: string; role?: string; banned?: boolean; page?: number }) {
  await connection();
  const page = Math.max(1, filter.page ?? 1);
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      city: users.city,
      isVerifiedPro: users.isVerifiedPro,
      bannedAt: users.bannedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      and(
        filter.q ? or(ilike(users.name, likeTerm(filter.q)), ilike(users.email, likeTerm(filter.q))) : undefined,
        filter.role && ["player", "admin", "moderator", "finance", "booking"].includes(filter.role) ? eq(users.role, filter.role as Role) : undefined,
        filter.banned ? isNotNull(users.bannedAt) : undefined,
      ),
    )
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function setBanned(actorId: string, userId: string, banned: boolean, reason: string) {
  const text = reason.trim();
  if (banned && text.length < 3) throw new DomainError("Bitte gib einen Grund für die Sperre an.");
  if (actorId === userId) throw new DomainError("Du kannst dich nicht selbst sperren.");
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new DomainError("Nutzer nicht gefunden.");
    if (target.role === "admin") throw new DomainError("Plattform-Admins können nicht gesperrt werden. Entziehe zuerst die Rolle.");
    await tx.update(users).set({ bannedAt: banned ? new Date() : null }).where(eq(users.id, userId));
    await audit(actorId, banned ? "user.ban" : "user.unban", "user", userId, { before: { bannedAt: target.bannedAt }, after: { banned, reason: text || null } }, tx);
  });
}

export async function setRole(actorId: string, userId: string, role: Role) {
  if (actorId === userId) throw new DomainError("Du kannst deine eigene Rolle nicht ändern.");
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new DomainError("Nutzer nicht gefunden.");
    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await audit(actorId, "user.role", "user", userId, { before: { role: target.role }, after: { role } }, tx);
  });
}

export async function setProBadge(actorId: string, userId: string, value: boolean) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new DomainError("Nutzer nicht gefunden.");
    await tx.update(users).set({ isVerifiedPro: value }).where(eq(users.id, userId));
    await audit(actorId, "user.pro_badge", "user", userId, { before: { isVerifiedPro: target.isVerifiedPro }, after: { isVerifiedPro: value } }, tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------------------------

export async function listAdminTeams(filter: { q?: string; page?: number }) {
  await connection();
  const page = Math.max(1, filter.page ?? 1);
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      city: teams.city,
      isVerified: teams.isVerified,
      archivedAt: teams.archivedAt,
      members: sql<number>`(select count(*)::int from team_members where team_id = ${teams.id})`,
    })
    .from(teams)
    .where(filter.q ? or(ilike(teams.name, likeTerm(filter.q)), ilike(teams.city, likeTerm(filter.q))) : undefined)
    .orderBy(teams.name)
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export async function setTeamVerified(actorId: string, teamId: string, value: boolean) {
  await db.transaction(async (tx) => {
    const [team] = await tx.select().from(teams).where(eq(teams.id, teamId)).for("update");
    if (!team) throw new DomainError("Team nicht gefunden.");
    await tx.update(teams).set({ isVerified: value }).where(eq(teams.id, teamId));
    await audit(actorId, "team.verify", "team", teamId, { before: { isVerified: team.isVerified }, after: { isVerified: value } }, tx);
  });
}

/** Führt zwei Teams zusammen: Mitglieder, Suchen, Spiele, Einladungen und Ereignisse wandern ins Zielteam. */
export async function mergeTeams(actorId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new DomainError("Quelle und Ziel müssen verschiedene Teams sein.");
  await db.transaction(async (tx) => {
    const [source] = await tx.select().from(teams).where(eq(teams.id, sourceId)).for("update");
    const [target] = await tx.select().from(teams).where(eq(teams.id, targetId)).for("update");
    if (!source || !target) throw new DomainError("Team nicht gefunden.");

    const [{ between }] = await tx
      .select({ between: count() })
      .from(matches)
      .where(or(and(eq(matches.homeTeamId, sourceId), eq(matches.awayTeamId, targetId)), and(eq(matches.homeTeamId, targetId), eq(matches.awayTeamId, sourceId))));
    if (between > 0) throw new DomainError("Die Teams haben gegeneinander gespielt. Das Zusammenführen würde ein Spiel gegen sich selbst ergeben.");

    // Mitglieder: wer schon im Ziel ist, behält die dortige Rolle
    const existing = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, targetId));
    const have = new Set(existing.map((e) => e.userId));
    const moving = await tx.select().from(teamMembers).where(eq(teamMembers.teamId, sourceId));
    const toAdd = moving.filter((m) => !have.has(m.userId));
    if (toAdd.length) await tx.insert(teamMembers).values(toAdd.map((m) => ({ teamId: targetId, userId: m.userId, role: m.role, joinedAt: m.joinedAt })));
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, sourceId));

    await tx.update(invites).set({ teamId: targetId }).where(eq(invites.teamId, sourceId));
    await tx.update(matchRequests).set({ teamId: targetId }).where(eq(matchRequests.teamId, sourceId));
    await tx.update(matches).set({ homeTeamId: targetId }).where(eq(matches.homeTeamId, sourceId));
    await tx.update(matches).set({ awayTeamId: targetId }).where(eq(matches.awayTeamId, sourceId));
    await tx.update(matchEvents).set({ teamId: targetId }).where(eq(matchEvents.teamId, sourceId));

    // Teilnehmer: ein Spieler kann pro Spiel nur einmal vorkommen
    const clash = await tx.execute(sql`
      select a.match_id, a.user_id from match_participants a
      join match_participants b on b.match_id = a.match_id and b.user_id = a.user_id
      where a.team_id = ${sourceId} and b.team_id = ${targetId}`);
    for (const row of clash.rows as { match_id: string; user_id: string }[]) {
      await tx.delete(matchParticipants).where(and(eq(matchParticipants.matchId, row.match_id), eq(matchParticipants.userId, row.user_id), eq(matchParticipants.teamId, sourceId)));
    }
    await tx.update(matchParticipants).set({ teamId: targetId }).where(eq(matchParticipants.teamId, sourceId));

    await tx.delete(teams).where(eq(teams.id, sourceId));
    await audit(actorId, "team.merge", "team", targetId, { before: { source }, after: { mergedInto: targetId, movedMembers: toAdd.length } }, tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------------------------

export async function listAudit(filter: { q?: string; entity?: string; action?: string; page?: number }) {
  await connection();
  const page = Math.max(1, filter.page ?? 1);
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      before: auditLog.before,
      after: auditLog.after,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      and(
        filter.entity ? eq(auditLog.entity, filter.entity) : undefined,
        filter.action ? ilike(auditLog.action, `${filter.action.replace(/[%_\\]/g, "")}%`) : undefined,
        filter.q ? or(ilike(auditLog.entityId, likeTerm(filter.q)), ilike(users.name, likeTerm(filter.q)), ilike(auditLog.action, likeTerm(filter.q))) : undefined,
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

