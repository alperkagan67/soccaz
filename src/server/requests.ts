import { connection } from "next/server";
import { and, asc, between, count, eq, gt, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matchRequests, matches, teamMembers, teams } from "@/db/schema";
import { berlinDayRange, toBerlinInputValue } from "@/lib/time";
import { audit } from "./audit";
import { teamName } from "./names";
import { priceFor } from "./pricing";
import { notifyUsers, teamAdminIds } from "./notifications";
import { DomainError } from "./teams";

export const MIN_LEAD_HOURS = 24; // Spiele müssen mindestens 24 Stunden vorher angesetzt werden
export const MAX_OPEN_REQUESTS_PER_TEAM = 5;
const OVERLAP_MINUTES = 90; // zwei Spiele eines Teams dürfen nicht näher als 90 Minuten beieinander liegen

/** Frühester erlaubter Anstoß als Wert für datetime-local (Berliner Zeit). */
export function earliestStartInput(): string {
  // auf die nächste Viertelstunde aufrunden, damit das 15-Minuten-Raster des Eingabefelds auf :00/:15/:30/:45 liegt
  const quarter = 15 * 60_000;
  const earliest = Math.ceil((Date.now() + MIN_LEAD_HOURS * 3_600_000) / quarter) * quarter;
  return toBerlinInputValue(new Date(earliest));
}

export type RequestInput = {
  teamId: string;
  city: string;
  startsAt: Date;
  durationMin: 60 | 90;
  strength: number;
  visibility: "public" | "private";
  note?: string;
  targetTeamId?: string; // Herausforderung: nur dieses Team kann annehmen
};

async function isAdmin(tx: Pick<typeof db, "select">, userId: string, teamId: string) {
  const [row] = await tx
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return row?.role === "admin";
}

/** Hat das Team um diese Zeit schon eine offene Suche oder ein Spiel? */
async function hasConflict(tx: Pick<typeof db, "select">, teamId: string, startsAt: Date, ignoreRequestId?: string) {
  const from = new Date(startsAt.getTime() - OVERLAP_MINUTES * 60_000);
  const to = new Date(startsAt.getTime() + OVERLAP_MINUTES * 60_000);

  const [{ requests }] = await tx
    .select({ requests: count() })
    .from(matchRequests)
    .where(
      and(
        eq(matchRequests.teamId, teamId),
        eq(matchRequests.status, "open"),
        between(matchRequests.startsAt, from, to),
        ignoreRequestId ? ne(matchRequests.id, ignoreRequestId) : undefined,
      ),
    );
  const [{ games }] = await tx
    .select({ games: count() })
    .from(matches)
    .where(
      and(
        or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
        ne(matches.status, "cancelled"),
        between(matches.startsAt, from, to),
      ),
    );
  return requests + games > 0;
}

export async function createRequest(userId: string, input: RequestInput) {
  if (input.startsAt.getTime() < Date.now() + MIN_LEAD_HOURS * 3_600_000) {
    throw new DomainError(`Das Spiel muss mindestens ${MIN_LEAD_HOURS} Stunden in der Zukunft liegen.`);
  }
  return db.transaction(async (tx) => {
    if (!(await isAdmin(tx, userId, input.teamId))) throw new DomainError("Nur Team-Admins können Spielsuchen erstellen.");

    const [{ open }] = await tx
      .select({ open: count() })
      .from(matchRequests)
      .where(and(eq(matchRequests.teamId, input.teamId), eq(matchRequests.status, "open")));
    if (open >= MAX_OPEN_REQUESTS_PER_TEAM) {
      throw new DomainError(`Dein Team hat schon ${MAX_OPEN_REQUESTS_PER_TEAM} offene Spielsuchen.`);
    }
    if (await hasConflict(tx, input.teamId, input.startsAt)) {
      throw new DomainError("Dein Team hat um diese Zeit schon eine Spielsuche oder ein Spiel.");
    }

    if (input.targetTeamId) {
      if (input.targetTeamId === input.teamId) throw new DomainError("Du kannst dein eigenes Team nicht herausfordern.");
      const [target] = await tx.select({ id: teams.id, archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, input.targetTeamId));
      if (!target || target.archivedAt) throw new DomainError("Dieses Team gibt es nicht mehr.");
    }

    const [request] = await tx
      .insert(matchRequests)
      .values({
        teamId: input.teamId,
        city: input.city,
        startsAt: input.startsAt,
        durationMin: input.durationMin,
        strength: input.strength,
        visibility: input.targetTeamId ? "private" : input.visibility, // Herausforderungen stehen nie in der öffentlichen Liste
        note: input.note || null,
        targetTeamId: input.targetTeamId ?? null,
      })
      .returning();
    await audit(userId, "request.create", "match_request", request.id, { after: request }, tx);
    if (input.targetTeamId) {
      await notifyUsers(
        await teamAdminIds(tx, input.targetTeamId),
        { type: "request.challenge", title: "Ihr wurdet herausgefordert", body: `${await teamName(tx, input.teamId)} fordert euch heraus.`, url: `/suche/${request.id}` },
        tx,
        userId,
      );
    }
    return request;
  });
}

export type RequestFilter = {
  city?: string;
  durationMin?: number;
  minStrength?: number;
  maxStrength?: number;
  date?: string;
};

export async function listOpenRequests(filter: RequestFilter = {}) {
  await connection(); // Uhrzeit und Daten gehören zur Anfrage, nie in die vorberechnete Seite
  const day = filter.date ? berlinDayRange(filter.date) : null;
  return db
    .select({
      id: matchRequests.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      teamStrength: teams.strength,
      city: matchRequests.city,
      startsAt: matchRequests.startsAt,
      durationMin: matchRequests.durationMin,
      strength: matchRequests.strength,
      note: matchRequests.note,
    })
    .from(matchRequests)
    .innerJoin(teams, eq(teams.id, matchRequests.teamId))
    .where(
      and(
        eq(matchRequests.status, "open"),
        eq(matchRequests.visibility, "public"),
        isNull(matchRequests.targetTeamId),
        gt(matchRequests.startsAt, new Date()),
        filter.city ? eq(matchRequests.city, filter.city) : undefined,
        filter.durationMin ? eq(matchRequests.durationMin, filter.durationMin) : undefined,
        filter.minStrength ? gte(matchRequests.strength, filter.minStrength) : undefined,
        filter.maxStrength ? lte(matchRequests.strength, filter.maxStrength) : undefined,
        day ? and(gte(matchRequests.startsAt, day.from), sql`${matchRequests.startsAt} < ${day.to}`) : undefined,
      ),
    )
    .orderBy(asc(matchRequests.startsAt))
    .limit(50);
}

export async function getRequest(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({
      id: matchRequests.id,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      teamStrength: teams.strength,
      city: matchRequests.city,
      startsAt: matchRequests.startsAt,
      durationMin: matchRequests.durationMin,
      strength: matchRequests.strength,
      visibility: matchRequests.visibility,
      status: matchRequests.status,
      note: matchRequests.note,
      targetTeamId: matchRequests.targetTeamId,
    })
    .from(matchRequests)
    .innerJoin(teams, eq(teams.id, matchRequests.teamId))
    .where(eq(matchRequests.id, id));
  if (!row) return null;
  return { ...row, isOpen: row.status === "open" && row.startsAt.getTime() > Date.now() };
}

export async function myAdminTeams(userId: string) {
  return db
    .select({ id: teams.id, name: teams.name, city: teams.city, strength: teams.strength })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")))
    .orderBy(teams.name);
}

export async function cancelRequest(userId: string, requestId: string) {
  await db.transaction(async (tx) => {
    const [request] = await tx.select().from(matchRequests).where(eq(matchRequests.id, requestId)).for("update");
    if (!request) throw new DomainError("Spielsuche nicht gefunden.");
    if (!(await isAdmin(tx, userId, request.teamId))) throw new DomainError("Nur Team-Admins können die Suche zurückziehen.");
    if (request.status !== "open") throw new DomainError("Diese Spielsuche ist nicht mehr offen.");
    await tx.update(matchRequests).set({ status: "cancelled" }).where(eq(matchRequests.id, requestId));
    await audit(userId, "request.cancel", "match_request", requestId, { before: { status: "open" }, after: { status: "cancelled" } }, tx);
  });
}

/** Nimmt eine Spielsuche an. Zeilensperre verhindert, dass zwei Teams gleichzeitig annehmen. */
export async function acceptRequest(userId: string, requestId: string, teamId: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(matchRequests).where(eq(matchRequests.id, requestId)).for("update");
    if (!request) throw new DomainError("Spielsuche nicht gefunden.");
    if (request.status !== "open") throw new DomainError("Diese Spielsuche ist nicht mehr offen. Jemand war schneller.");
    if (request.startsAt.getTime() < Date.now() + MIN_LEAD_HOURS * 3_600_000) {
      throw new DomainError("Diese Spielsuche liegt zu nah am Anstoß und kann nicht mehr angenommen werden.");
    }
    if (request.teamId === teamId) throw new DomainError("Du kannst deine eigene Spielsuche nicht annehmen.");
    if (request.targetTeamId && request.targetTeamId !== teamId) throw new DomainError("Diese Herausforderung gilt einem anderen Team.");
    if (!(await isAdmin(tx, userId, teamId))) throw new DomainError("Nur Team-Admins können Spielsuchen annehmen.");
    if (await hasConflict(tx, teamId, request.startsAt)) {
      throw new DomainError("Dein Team hat um diese Zeit schon eine Spielsuche oder ein Spiel.");
    }

    const price = await priceFor(tx, null, request.durationMin);
    const [match] = await tx
      .insert(matches)
      .values({
        priceCents: price?.priceCents ?? null,
        costCents: price?.costCents ?? null,
        requestId: request.id,
        homeTeamId: request.teamId,
        awayTeamId: teamId,
        startsAt: request.startsAt,
        durationMin: request.durationMin,
        visibility: request.visibility,
      })
      .returning();

    // Beide Team-Admins sind von Anfang an Teilnehmer der Lobby.
    const admins = await tx
      .select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(or(eq(teamMembers.teamId, request.teamId), eq(teamMembers.teamId, teamId)), eq(teamMembers.role, "admin")));
    if (admins.length) {
      await tx
        .insert(matchParticipants)
        .values(admins.map((a) => ({ matchId: match.id, userId: a.userId, teamId: a.teamId })))
        .onConflictDoNothing();
    }

    await tx.update(matchRequests).set({ status: "matched" }).where(eq(matchRequests.id, request.id));
    await audit(userId, "request.accept", "match_request", request.id, { after: { matchId: match.id, awayTeamId: teamId } }, tx);
    const [homeName, awayName] = [await teamName(tx, request.teamId), await teamName(tx, teamId)];
    await notifyUsers(
      await teamAdminIds(tx, request.teamId),
      { type: "request.accepted", title: "Dein Gegner steht fest", body: `${awayName} hat deine Spielsuche angenommen: ${homeName} gegen ${awayName}.`, url: `/lobby/${match.id}` },
      tx,
      userId,
    );
    return match;
  });
}
