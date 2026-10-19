import { and, count, eq, gt, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { invites, matchParticipants, matchRequests, matches, teamMembers, teams } from "@/db/schema";
import { matchmakingQueue } from "@/db/schema-matchmaking";
import { slugify } from "@/lib/slug";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { userName } from "./names";
import { notifyUsers } from "./notifications";
import { cleanBio } from "./account";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

async function memberRole(tx: Tx | typeof db, teamId: string, userId: string) {
  const [m] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return m?.role ?? null;
}

async function requireAdmin(tx: Tx, teamId: string, userId: string) {
  if ((await memberRole(tx, teamId, userId)) !== "admin") throw new DomainError("Nur Team-Admins können das.");
}

async function lockTeam(tx: Tx, teamId: string) {
  const [t] = await tx.select().from(teams).where(eq(teams.id, teamId)).for("update");
  if (!t || t.archivedAt) throw new DomainError("Team nicht gefunden.");
  return t;
}

const adminCount = async (tx: Tx, teamId: string) => (await tx.select({ n: count() }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin"))))[0].n;
const memberCount = async (tx: Tx, teamId: string) => (await tx.select({ n: count() }).from(teamMembers).where(eq(teamMembers.teamId, teamId)))[0].n;

/** Kommende Spiele des Teams (Lobby oder bestätigt). */
async function upcomingMatches(tx: Tx, teamId: string) {
  return tx
    .select({ id: matches.id })
    .from(matches)
    .where(and(or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)), inArray(matches.status, ["lobby", "confirmed"]), gt(matches.startsAt, new Date())));
}

/** Steht die Person in einer kommenden Lobby eines der Spiele dieses Teams? */
async function inUpcomingLobby(tx: Tx, teamId: string, userId: string) {
  const rows = await tx
    .select({ id: matches.id })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(eq(matchParticipants.userId, userId), eq(matchParticipants.teamId, teamId), inArray(matches.status, ["lobby", "confirmed"]), gt(matches.startsAt, new Date())));
  return rows.length > 0;
}

/** Name, Stadt und Selbsteinschätzung ändern. Die Adresse (slug) bleibt gleich, damit Links nicht brechen. */
export async function updateTeam(userId: string, teamId: string, input: { name: string; city: string; strength: number; bio?: string }) {
  const bio = cleanBio(input.bio);
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 40) throw new DomainError("Der Teamname braucht 3 bis 40 Zeichen.");
  if (slugify(name).length < 3) throw new DomainError("Der Teamname enthält zu wenige gültige Zeichen.");
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (!Number.isInteger(input.strength) || input.strength < 1 || input.strength > 5) throw new DomainError("Spielstärke: 1 bis 5.");
  await db.transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    await requireAdmin(tx, teamId, userId);
    const [taken] = await tx.select({ id: teams.id }).from(teams).where(and(ne(teams.id, teamId), sql`lower(${teams.name}) = lower(${name})`));
    if (taken) throw new DomainError("Dieser Teamname ist bereits vergeben.");
    await tx.update(teams).set({ name, city: input.city, strength: input.strength, bio }).where(eq(teams.id, teamId));
    await audit(userId, "team.update", "team", teamId, { before: { name: team.name, city: team.city, strength: team.strength }, after: input }, tx);
  });
}

export async function setMemberRole(userId: string, teamId: string, targetId: string, role: "admin" | "player") {
  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);
    await requireAdmin(tx, teamId, userId);
    const current = await memberRole(tx, teamId, targetId);
    if (!current) throw new DomainError("Dieser Spieler ist nicht im Team.");
    if (current === role) return;
    if (role === "player" && (await adminCount(tx, teamId)) <= 1) throw new DomainError("Das Team braucht mindestens einen Admin. Mache zuerst jemand anderen zum Admin.");
    await tx.update(teamMembers).set({ role }).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
    await audit(userId, "team.role", "team", teamId, { before: { userId: targetId, role: current }, after: { userId: targetId, role } }, tx);
    if (targetId !== userId) {
      await notifyUsers([targetId], { type: "team.joined", title: role === "admin" ? "Du bist jetzt Team-Admin" : "Du bist kein Team-Admin mehr", body: `${await userName(tx, userId)} hat deine Rolle im Team geändert.`, url: `/teams` }, tx, userId);
    }
  });
}

export async function removeMember(userId: string, teamId: string, targetId: string) {
  if (userId === targetId) throw new DomainError("Zum Verlassen nutze „Team verlassen“.");
  await db.transaction(async (tx) => {
    await lockTeam(tx, teamId);
    await requireAdmin(tx, teamId, userId);
    const role = await memberRole(tx, teamId, targetId);
    if (!role) throw new DomainError("Dieser Spieler ist nicht im Team.");
    if (role === "admin") throw new DomainError("Admins können nicht entfernt werden. Nimm zuerst die Admin-Rolle weg.");
    if (await inUpcomingLobby(tx, teamId, targetId)) throw new DomainError("Der Spieler steht in einer kommenden Lobby. Entferne ihn dort zuerst.");
    await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetId)));
    await audit(userId, "team.remove_member", "team", teamId, { before: { userId: targetId } }, tx);
    await notifyUsers([targetId], { type: "system", title: "Aus dem Team entfernt", body: "Ein Team-Admin hat dich aus dem Team entfernt.", url: "/app" }, tx, userId);
  });
}

/** Team verlassen. Als letzter Admin eines Teams mit Mitgliedern erst die Rolle übergeben; als letztes Mitglied wird das Team aufgelöst. */
export async function leaveTeam(userId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    const role = await memberRole(tx, teamId, userId);
    if (!role) throw new DomainError("Du bist nicht in diesem Team.");
    if (await inUpcomingLobby(tx, teamId, userId)) throw new DomainError("Du stehst in einer kommenden Lobby. Melde dich dort zuerst ab.");
    const members = await memberCount(tx, teamId);
    if (members === 1) {
      if ((await upcomingMatches(tx, teamId)).length > 0) throw new DomainError("Das Team hat noch kommende Spiele. Sage sie zuerst ab.");
      await archive(tx, team, userId);
      return;
    }
    if (role === "admin" && (await adminCount(tx, teamId)) <= 1) throw new DomainError("Du bist der einzige Admin. Mache zuerst jemand anderen zum Admin.");
    await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    await audit(userId, "team.leave", "team", teamId, {}, tx);
    const admins = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin")));
    await notifyUsers(admins.map((a) => a.userId), { type: "team.joined", title: "Spieler hat das Team verlassen", body: `${await userName(tx, userId)} ist aus ${team.name} ausgetreten.`, url: `/teams/${team.slug}` }, tx);
  });
}

async function archive(tx: Tx, team: typeof teams.$inferSelect, actorId: string) {
  await tx.update(matchRequests).set({ status: "cancelled" }).where(and(eq(matchRequests.teamId, team.id), eq(matchRequests.status, "open")));
  await tx.update(matchmakingQueue).set({ status: "cancelled" }).where(and(eq(matchmakingQueue.teamId, team.id), eq(matchmakingQueue.status, "waiting")));
  await tx.delete(invites).where(eq(invites.teamId, team.id));
  await tx.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, team.id));
  await audit(actorId, "team.archive", "team", team.id, { before: { name: team.name } }, tx);
}

/** Team auflösen: offene Suchen, Warteschlange und Einladungen enden; Statistik und Spielhistorie bleiben. */
export async function dissolveTeam(userId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const team = await lockTeam(tx, teamId);
    await requireAdmin(tx, teamId, userId);
    if ((await upcomingMatches(tx, teamId)).length > 0) throw new DomainError("Das Team hat noch kommende Spiele. Sage sie zuerst ab.");
    const members = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    await archive(tx, team, userId);
    await notifyUsers(members.map((m) => m.userId), { type: "system", title: "Team aufgelöst", body: `${team.name} wurde von einem Admin aufgelöst.`, url: "/app" }, tx, userId);
  });
}

/** Alle gültigen Einladungslinks ungültig machen (z. B. wenn ein Link in falsche Hände geraten ist). */
export async function revokeInvites(userId: string, teamId: string) {
  await db.transaction(async (tx) => {
    await requireAdmin(tx, teamId, userId);
    const removed = await tx.delete(invites).where(eq(invites.teamId, teamId)).returning({ token: invites.token });
    await audit(userId, "invite.revoke_all", "team", teamId, { after: { count: removed.length } }, tx);
  });
}
