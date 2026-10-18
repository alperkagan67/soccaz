import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, gt } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams } from "@/db/schema";
import { proApplications, proEvents } from "@/db/schema-league";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { notifyUsers, teamAdminIds } from "./notifications";
import { priceFor } from "./pricing";
import { DomainError } from "./teams";

export type ProEventInput = { title: string; description?: string; proTeamId: string; city: string; startsAt: Date; slots: number; slotMinutes: 60 | 90; applyUntil: Date };

export async function createProEvent(actorId: string, input: ProEventInput) {
  const title = input.title.replace(/\s+/g, " ").trim();
  if (title.length < 3 || title.length > 80) throw new DomainError("Der Titel braucht 3 bis 80 Zeichen.");
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (!Number.isInteger(input.slots) || input.slots < 1 || input.slots > 12) throw new DomainError("1 bis 12 Plätze.");
  if (input.slotMinutes !== 60 && input.slotMinutes !== 90) throw new DomainError("Dauer: 60 oder 90 Minuten.");
  if (input.applyUntil.getTime() <= Date.now()) throw new DomainError("Die Bewerbungsfrist liegt in der Vergangenheit.");
  if (input.startsAt.getTime() <= input.applyUntil.getTime()) throw new DomainError("Der Profi-Tag muss nach der Bewerbungsfrist stattfinden.");
  const [pro] = await db.select({ isVerified: teams.isVerified, archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, input.proTeamId));
  if (!pro || pro.archivedAt) throw new DomainError("Das Profi-Team gibt es nicht.");
  if (!pro.isVerified) throw new DomainError("Das Profi-Team muss verifiziert sein.");
  const [row] = await db
    .insert(proEvents)
    .values({ title, description: input.description?.trim().slice(0, 500) || null, proTeamId: input.proTeamId, city: input.city, startsAt: input.startsAt, slots: input.slots, slotMinutes: input.slotMinutes, applyUntil: input.applyUntil, createdBy: actorId })
    .returning();
  await audit(actorId, "pro_event.create", "pro_event", row.id, { after: row });
  return row;
}

export async function listProEvents() {
  await connection();
  return db
    .select({ id: proEvents.id, title: proEvents.title, city: proEvents.city, startsAt: proEvents.startsAt, applyUntil: proEvents.applyUntil, slots: proEvents.slots, status: proEvents.status, proTeam: teams.name, proSlug: teams.slug })
    .from(proEvents)
    .innerJoin(teams, eq(teams.id, proEvents.proTeamId))
    .where(gt(proEvents.startsAt, new Date(Date.now() - 86_400_000)))
    .orderBy(asc(proEvents.startsAt))
    .limit(30);
}

export async function getProEvent(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [event] = await db
    .select({ id: proEvents.id, title: proEvents.title, description: proEvents.description, city: proEvents.city, startsAt: proEvents.startsAt, applyUntil: proEvents.applyUntil, slots: proEvents.slots, slotMinutes: proEvents.slotMinutes, status: proEvents.status, proTeamId: proEvents.proTeamId, proTeam: teams.name, proSlug: teams.slug })
    .from(proEvents)
    .innerJoin(teams, eq(teams.id, proEvents.proTeamId))
    .where(eq(proEvents.id, id));
  if (!event) return null;
  const applicants = await db
    .select({ teamId: teams.id, name: teams.name, slug: teams.slug, selected: proApplications.selected, matchId: proApplications.matchId })
    .from(proApplications)
    .innerJoin(teams, eq(teams.id, proApplications.teamId))
    .where(eq(proApplications.eventId, id))
    .orderBy(desc(proApplications.selected), asc(proApplications.createdAt));
  return { event: { ...event, applyOpen: event.status === "open" && event.applyUntil.getTime() > Date.now() }, applicants };
}

export async function applyToProEvent(userId: string, eventId: string, teamId: string) {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(proEvents).where(eq(proEvents.id, eventId)).for("update");
    if (!event) throw new DomainError("Profi-Tag nicht gefunden.");
    if (event.status !== "open") throw new DomainError("Die Bewerbung ist geschlossen.");
    if (event.applyUntil.getTime() <= Date.now()) throw new DomainError("Die Bewerbungsfrist ist abgelaufen.");
    if (teamId === event.proTeamId) throw new DomainError("Das Profi-Team kann sich nicht bewerben.");
    const [m] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können sich bewerben.");
    const [{ n }] = await tx.select({ n: count() }).from(proApplications).where(eq(proApplications.eventId, eventId));
    if (n >= 200) throw new DomainError("Es gibt schon zu viele Bewerbungen.");
    const [added] = await tx.insert(proApplications).values({ eventId, teamId, appliedBy: userId }).onConflictDoNothing().returning();
    if (!added) throw new DomainError("Euer Team hat sich schon beworben.");
  });
}

export async function withdrawProApplication(userId: string, eventId: string, teamId: string) {
  const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können die Bewerbung zurückziehen.");
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(proEvents).where(eq(proEvents.id, eventId)).for("update");
    if (!event || event.status !== "open") throw new DomainError("Die Bewerbung kann nicht mehr zurückgezogen werden.");
    await tx.delete(proApplications).where(and(eq(proApplications.eventId, eventId), eq(proApplications.teamId, teamId)));
  });
}

const shuffle = <T>(items: T[], rand: (max: number) => number): T[] => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Los: wählt zufällig bis zu `slots` Teams, legt für jedes ein öffentliches Spiel gegen das Profi-Team an (nacheinander),
 * trägt die Profis automatisch als Teilnehmer ein und benachrichtigt alle Bewerber. `rand` ist für Tests austauschbar.
 */
export async function drawProEvent(actorId: string, eventId: string, rand: (max: number) => number = (max) => randomInt(max)) {
  return db.transaction(async (tx) => {
    const [event] = await tx.select().from(proEvents).where(eq(proEvents.id, eventId)).for("update");
    if (!event) throw new DomainError("Profi-Tag nicht gefunden.");
    if (event.status !== "open") throw new DomainError("Es wurde schon gelost oder der Tag ist abgesagt.");
    const applicants = await tx.select({ teamId: proApplications.teamId }).from(proApplications).where(eq(proApplications.eventId, eventId));
    if (applicants.length === 0) throw new DomainError("Es gibt noch keine Bewerbungen.");

    const winners = shuffle(applicants.map((a) => a.teamId), rand).slice(0, event.slots);
    const price = await priceFor(tx, null, event.slotMinutes);
    const pros = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, event.proTeamId));
    const proAdmins = await teamAdminIds(tx, event.proTeamId);

    for (const [i, teamId] of winners.entries()) {
      const startsAt = new Date(event.startsAt.getTime() + i * event.slotMinutes * 60_000);
      const [match] = await tx
        .insert(matches)
        .values({ homeTeamId: event.proTeamId, awayTeamId: teamId, startsAt, durationMin: event.slotMinutes, visibility: "public", priceCents: price?.priceCents ?? null, costCents: price?.costCents ?? null })
        .returning();
      const admins = await teamAdminIds(tx, teamId);
      const participants = [...pros.map((p) => ({ matchId: match.id, userId: p.userId, teamId: event.proTeamId })), ...admins.map((u) => ({ matchId: match.id, userId: u, teamId }))];
      await tx.insert(matchParticipants).values(participants).onConflictDoNothing();
      await tx.update(proApplications).set({ selected: true, matchId: match.id }).where(and(eq(proApplications.eventId, eventId), eq(proApplications.teamId, teamId)));
      await notifyUsers(admins, { type: "request.accepted", title: "Ihr habt gewonnen: Profi-Tag", body: `${event.title}: Euer Spiel gegen das Profi-Team beginnt ${startsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })} Uhr.`, url: `/lobby/${match.id}` }, tx);
    }
    for (const a of applicants.filter((x) => !winners.includes(x.teamId))) {
      await notifyUsers(await teamAdminIds(tx, a.teamId), { type: "system", title: "Profi-Tag: leider nicht gelost", body: `${event.title}: Diesmal hat es nicht geklappt. Beim nächsten Mal wieder bewerben!`, url: `/profitag/${eventId}` }, tx);
    }
    await notifyUsers(proAdmins, { type: "admin.task", title: "Profi-Tag ausgelost", body: `${event.title}: ${winners.length} Spiele angesetzt.`, url: `/profitag/${eventId}` }, tx);
    await tx.update(proEvents).set({ status: "drawn" }).where(eq(proEvents.id, eventId));
    await audit(actorId, "pro_event.draw", "pro_event", eventId, { after: { winners } }, tx);
    return winners;
  });
}

export async function cancelProEvent(actorId: string, eventId: string) {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(proEvents).where(eq(proEvents.id, eventId)).for("update");
    if (!event || event.status === "cancelled") throw new DomainError("Profi-Tag nicht gefunden.");
    if (event.status === "drawn") throw new DomainError("Nach dem Los kannst du die einzelnen Spiele in der Spieleverwaltung absagen.");
    const applicants = await tx.select({ teamId: proApplications.teamId }).from(proApplications).where(eq(proApplications.eventId, eventId));
    for (const a of applicants) await notifyUsers(await teamAdminIds(tx, a.teamId), { type: "system", title: "Profi-Tag abgesagt", body: `${event.title} findet nicht statt.`, url: "/profitag" }, tx);
    await tx.update(proEvents).set({ status: "cancelled" }).where(eq(proEvents.id, eventId));
    await audit(actorId, "pro_event.cancel", "pro_event", eventId, {}, tx);
  });
}

