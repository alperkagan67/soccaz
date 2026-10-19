import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matchRequests, matches, teamMembers, teams } from "@/db/schema";
import { audit } from "./audit";
import { cancelMatchTx } from "./lobby";
import { teamName } from "./names";
import { notifyUsers, teamAdminIds } from "./notifications";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

export const CHALLENGE_REPLY_HOURS = 48;
const MAX_OPEN_CHALLENGES_PER_TEAM = 5;

/**
 * Ein Klick: Das eigene Team fordert ein anderes direkt heraus. Es entsteht sofort eine öffentliche Lobby (Team A gegen Team B),
 * in der beide Kader mit Ampel zu sehen sind. Das herausgeforderte Team muss annehmen; danach beginnt das Hallen-Veto.
 */
export async function challengeTeam(userId: string, myTeamId: string, targetTeamId: string): Promise<string> {
  if (myTeamId === targetTeamId) throw new DomainError("Du kannst dein eigenes Team nicht herausfordern.");
  return db.transaction(async (tx) => {
    const [role] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, myTeamId), eq(teamMembers.userId, userId)));
    if (role?.role !== "admin") throw new DomainError("Nur Team-Admins können herausfordern.");
    const rows = await tx.select({ id: teams.id, archivedAt: teams.archivedAt }).from(teams).where(inArray(teams.id, [myTeamId, targetTeamId]));
    if (rows.length !== 2 || rows.some((t) => t.archivedAt)) throw new DomainError("Team nicht gefunden.");

    // Pro Team-Paar nur eine offene Herausforderung, und nicht zu viele auf einmal
    const open = await tx
      .select({ id: matches.id, home: matches.homeTeamId, away: matches.awayTeamId })
      .from(matches)
      .where(and(eq(matches.challengeStatus, "pending"), eq(matches.status, "lobby"), inArray(matches.homeTeamId, [myTeamId, targetTeamId])));
    if (open.some((m) => [m.home, m.away].includes(myTeamId) && [m.home, m.away].includes(targetTeamId))) throw new DomainError("Zwischen euch läuft schon eine Herausforderung.");
    if (open.filter((m) => m.home === myTeamId).length >= MAX_OPEN_CHALLENGES_PER_TEAM) throw new DomainError(`Ihr habt schon ${MAX_OPEN_CHALLENGES_PER_TEAM} offene Herausforderungen.`);

    const [match] = await tx
      .insert(matches)
      .values({
        homeTeamId: myTeamId,
        awayTeamId: targetTeamId,
        startsAt: new Date(Date.now() + 14 * 86_400_000), // vorläufig, der echte Termin wird nach dem Veto gewählt
        durationMin: 60,
        visibility: "public",
        schedulingOpen: true,
        challengeStatus: "pending",
        schedulingDeadline: new Date(Date.now() + CHALLENGE_REPLY_HOURS * 3_600_000),
      })
      .returning();
    const admins = await tx
      .select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(inArray(teamMembers.teamId, [myTeamId, targetTeamId]), eq(teamMembers.role, "admin")));
    if (admins.length) await tx.insert(matchParticipants).values(admins.map((a) => ({ matchId: match.id, userId: a.userId, teamId: a.teamId }))).onConflictDoNothing();
    await audit(userId, "challenge.create", "match", match.id, { after: { from: myTeamId, to: targetTeamId } }, tx);
    await notifyUsers(
      await teamAdminIds(tx, targetTeamId),
      { type: "request.challenge", title: "Ihr wurdet herausgefordert", body: `${await teamName(tx, myTeamId)} fordert ${await teamName(tx, targetTeamId)} heraus. Nehmt in der Lobby an oder lehnt ab.`, url: `/lobby/${match.id}` },
      tx,
      userId,
    );
    return match.id;
  });
}

async function lockPending(tx: Tx, matchId: string) {
  const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
  if (!m) throw new DomainError("Spiel nicht gefunden.");
  if (m.challengeStatus !== "pending" || m.status !== "lobby") throw new DomainError("Diese Herausforderung ist nicht mehr offen.");
  return m;
}

/** Das herausgeforderte Team nimmt an: Beide Teams einigen sich auf Tag und Uhrzeit, danach folgen Hallen-Anfrage und Veto. */
export async function acceptChallenge(userId: string, matchId: string) {
  await db.transaction(async (tx) => {
    const m = await lockPending(tx, matchId);
    const [admin] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, m.awayTeamId), eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")));
    if (!admin) throw new DomainError("Nur Team-Admins des herausgeforderten Teams können annehmen.");
    await tx.update(matches).set({ challengeStatus: "accepted", schedulingDeadline: new Date(Date.now() + 48 * 3_600_000) }).where(eq(matches.id, matchId));
    await audit(userId, "challenge.accept", "match", matchId, {}, tx);
    await notifyUsers(
      await teamAdminIds(tx, m.homeTeamId),
      { type: "match.found", title: "Herausforderung angenommen", body: `${await teamName(tx, m.awayTeamId)} hat angenommen. Einigt euch jetzt auf Tag und Uhrzeit, danach folgen die Halle und das Veto.`, url: `/lobby/${matchId}` },
      tx,
      userId,
    );
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Ablehnen (Zielteam) oder Zurückziehen (herausforderndes Team): Die Lobby wird abgesagt. */
export async function declineChallenge(userId: string, matchId: string) {
  await db.transaction(async (tx) => {
    const m = await lockPending(tx, matchId);
    const [admin] = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), inArray(teamMembers.teamId, [m.homeTeamId, m.awayTeamId])));
    if (!admin) throw new DomainError("Nur Team-Admins der beiden Teams können das.");
    const withdrawn = admin.teamId === m.homeTeamId;
    await tx.update(matches).set({ schedulingOpen: false }).where(eq(matches.id, matchId));
    await cancelMatchTx(tx, m, userId, withdrawn ? "Die Herausforderung wurde zurückgezogen." : "Die Herausforderung wurde abgelehnt.");
    await audit(userId, withdrawn ? "challenge.withdraw" : "challenge.decline", "match", matchId, {}, tx);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Offene Direkt-Herausforderungen einer Person (als Admin). `incoming` = ihr Team ist das herausgeforderte. */
export async function pendingChallengeMatches(userId: string) {
  const rows = await db
    .select({ id: matches.id, number: matches.number, home: matches.homeTeamId, away: matches.awayTeamId, deadline: matches.schedulingDeadline, startsAt: matches.startsAt })
    .from(matches)
    .innerJoin(teamMembers, and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), sql`${teamMembers.teamId} in (${matches.homeTeamId}, ${matches.awayTeamId})`))
    .where(and(eq(matches.challengeStatus, "pending"), eq(matches.status, "lobby"), isNotNull(matches.schedulingDeadline)));
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

/**
 * Früher waren Herausforderungen Spielsuchen mit Zielteam (eigene Seite mit Formular). Jetzt sind sie Lobbys.
 * Diese Funktion wandelt alte, noch offene Herausforderungen in Lobbys um (gleiche Nummer, Frist 48 Stunden ab jetzt). Mehrfach ausführbar.
 */
export async function convertLegacyChallenges(): Promise<number> {
  const old = await db
    .select()
    .from(matchRequests)
    .where(and(eq(matchRequests.status, "open"), isNotNull(matchRequests.targetTeamId)));
  let converted = 0;
  for (const r of old) {
    await db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(matchRequests).where(eq(matchRequests.id, r.id)).for("update");
      if (!fresh || fresh.status !== "open" || !fresh.targetTeamId) return;
      const [existing] = await tx.select({ id: matches.id }).from(matches).where(eq(matches.requestId, r.id));
      if (existing) return;
      const [match] = await tx
        .insert(matches)
        .values({
          number: fresh.number,
          requestId: fresh.id,
          homeTeamId: fresh.teamId,
          awayTeamId: fresh.targetTeamId,
          startsAt: fresh.startsAt,
          durationMin: fresh.durationMin,
          visibility: "public",
          schedulingOpen: true,
          challengeStatus: "pending",
          schedulingDeadline: new Date(Date.now() + CHALLENGE_REPLY_HOURS * 3_600_000),
        })
        .returning();
      const admins = await tx.select({ userId: teamMembers.userId, teamId: teamMembers.teamId }).from(teamMembers).where(and(inArray(teamMembers.teamId, [fresh.teamId, fresh.targetTeamId]), eq(teamMembers.role, "admin")));
      if (admins.length) await tx.insert(matchParticipants).values(admins.map((a) => ({ matchId: match.id, userId: a.userId, teamId: a.teamId }))).onConflictDoNothing();
      await tx.update(matchRequests).set({ status: "matched" }).where(eq(matchRequests.id, fresh.id));
      await audit(null, "challenge.convert", "match", match.id, { after: { requestId: fresh.id } }, tx);
      await notifyUsers(
        await teamAdminIds(tx, fresh.targetTeamId),
        { type: "request.challenge", title: "Ihr wurdet herausgefordert", body: `${await teamName(tx, fresh.teamId)} fordert ${await teamName(tx, fresh.targetTeamId)} heraus. Nehmt in der Lobby an oder lehnt ab.`, url: `/lobby/${match.id}` },
        tx,
      );
      converted += 1;
    });
  }
  return converted;
}
