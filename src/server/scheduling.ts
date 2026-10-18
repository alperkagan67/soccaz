import { and, asc, count, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { matchOptions, matchOptionVotes } from "@/db/schema-matchmaking";
import { agreedOption, optionStillValid } from "@/lib/matchmaking";
import { audit } from "./audit";
import { cancelMatchTx } from "./lobby";
import { teamName } from "./names";
import { matchParticipantIds, notifyUsers, teamAdminIds } from "./notifications";
import { priceFor } from "./pricing";
import { toBerlinInputValue } from "@/lib/time";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

export const MAX_OPTIONS_PER_TEAM = 4;

type MatchRow = typeof matches.$inferSelect;

async function lockOpenMatch(tx: Tx, matchId: string): Promise<MatchRow> {
  const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
  if (!match) throw new DomainError("Spiel nicht gefunden.");
  if (match.status !== "lobby" || !match.schedulingOpen) throw new DomainError("Termin und Ort stehen schon fest oder das Spiel läuft nicht mehr.");
  return match;
}

/** Auf welcher Seite steht die Person als Team-Admin? Plattform-Admins dürfen nicht für ein Team stimmen. */
async function adminTeam(tx: Pick<typeof db, "select">, userId: string, match: MatchRow): Promise<string> {
  const rows = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), inArray(teamMembers.teamId, [match.homeTeamId, match.awayTeamId])));
  if (rows.length === 0) throw new DomainError("Nur Team-Admins der beiden Teams können Termin und Ort wählen.");
  return rows[0].teamId;
}

/** Fügt Vorschläge hinzu (vom System oder von einem Team). */
export async function insertOptions(tx: Tx, matchId: string, items: { startsAt: Date; venueId?: string | null; venueText?: string | null; teamId?: string | null }[]) {
  if (items.length === 0) return [];
  return tx
    .insert(matchOptions)
    .values(items.map((i) => ({ matchId, startsAt: i.startsAt, venueId: i.venueId ?? null, venueText: i.venueText ?? null, proposedByTeam: i.teamId ?? null })))
    .returning();
}

export async function proposeOption(userId: string, matchId: string, input: { startsAt: Date; venueId?: string | null; venueText?: string }) {
  await db.transaction(async (tx) => {
    const match = await lockOpenMatch(tx, matchId);
    const teamId = await adminTeam(tx, userId, match);
    if (!optionStillValid(input.startsAt, new Date())) throw new DomainError("Der Termin muss mindestens 24 Stunden in der Zukunft liegen.");
    const text = input.venueText?.trim().slice(0, 120) || null;
    let venueName: string | null = text;
    let venueId: string | null = null;
    if (input.venueId) {
      const [v] = await tx.select({ id: venues.id, name: venues.name, active: venues.active }).from(venues).where(eq(venues.id, input.venueId));
      if (!v || !v.active) throw new DomainError("Diese Halle gibt es nicht.");
      venueId = v.id;
      venueName = v.name;
    }
    if (!venueName) throw new DomainError("Bitte wähle eine Halle oder gib einen Ort an.");
    const [{ n }] = await tx.select({ n: count() }).from(matchOptions).where(and(eq(matchOptions.matchId, matchId), eq(matchOptions.proposedByTeam, teamId)));
    if (n >= MAX_OPTIONS_PER_TEAM) throw new DomainError(`Ihr könnt höchstens ${MAX_OPTIONS_PER_TEAM} Vorschläge machen.`);
    const dup = await tx
      .select({ id: matchOptions.id })
      .from(matchOptions)
      .where(and(eq(matchOptions.matchId, matchId), eq(matchOptions.startsAt, input.startsAt), venueId ? eq(matchOptions.venueId, venueId) : eq(matchOptions.venueText, venueName)));
    if (dup.length > 0) throw new DomainError("Diesen Vorschlag gibt es schon.");

    const [option] = await insertOptions(tx, matchId, [{ startsAt: input.startsAt, venueId, venueText: venueName, teamId }]);
    // Wer noch nicht gewählt hat, stimmt mit dem eigenen Vorschlag
    await tx.insert(matchOptionVotes).values({ matchId, teamId, optionId: option.id, votedBy: userId }).onConflictDoNothing();
    await audit(userId, "scheduling.propose", "match", matchId, { after: { optionId: option.id, startsAt: input.startsAt, venue: venueName } }, tx);
    await notifyUsers(
      await teamAdminIds(tx, teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId),
      { type: "match.found", title: "Neuer Terminvorschlag", body: `${await teamName(tx, teamId)} schlägt einen Termin und Ort vor. Bitte wählt gemeinsam.`, url: `/lobby/${matchId}` },
      tx,
    );
    await lockIfAgreed(tx, match);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

export async function withdrawOption(userId: string, matchId: string, optionId: string) {
  await db.transaction(async (tx) => {
    const match = await lockOpenMatch(tx, matchId);
    const teamId = await adminTeam(tx, userId, match);
    const [o] = await tx.select().from(matchOptions).where(and(eq(matchOptions.id, optionId), eq(matchOptions.matchId, matchId)));
    if (!o) throw new DomainError("Vorschlag nicht gefunden.");
    if (o.proposedByTeam !== teamId) throw new DomainError("Nur das vorschlagende Team kann den Vorschlag zurückziehen.");
    await tx.delete(matchOptions).where(eq(matchOptions.id, optionId)); // Stimmen darauf verfallen mit
    await audit(userId, "scheduling.withdraw", "match", matchId, { before: { optionId } }, tx);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Das eigene Team wählt eine Option (ersetzt die bisherige Stimme). Stimmen beide gleich, steht der Termin. */
export async function voteOption(userId: string, matchId: string, optionId: string) {
  await db.transaction(async (tx) => {
    const match = await lockOpenMatch(tx, matchId);
    const teamId = await adminTeam(tx, userId, match);
    const [o] = await tx.select().from(matchOptions).where(and(eq(matchOptions.id, optionId), eq(matchOptions.matchId, matchId)));
    if (!o) throw new DomainError("Vorschlag nicht gefunden.");
    if (!optionStillValid(o.startsAt, new Date())) throw new DomainError("Dieser Termin liegt zu nah. Bitte wähle einen anderen oder schlage einen neuen vor.");
    await tx
      .insert(matchOptionVotes)
      .values({ matchId, teamId, optionId, votedBy: userId })
      .onConflictDoUpdate({ target: [matchOptionVotes.matchId, matchOptionVotes.teamId], set: { optionId, votedBy: userId, votedAt: new Date() } });
    await audit(userId, "scheduling.vote", "match", matchId, { after: { teamId, optionId } }, tx);
    if (!(await lockIfAgreed(tx, match))) {
      await notifyUsers(
        await teamAdminIds(tx, teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId),
        { type: "match.found", title: "Gegner hat gewählt", body: `${await teamName(tx, teamId)} hat einen Termin gewählt. Wählt ihr denselben, steht das Spiel.`, url: `/lobby/${matchId}` },
        tx,
      );
    }
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Haben beide Teams dieselbe Option gewählt, wird sie zum Termin des Spiels. */
async function lockIfAgreed(tx: Tx, match: MatchRow): Promise<boolean> {
  const votes = await tx.select({ teamId: matchOptionVotes.teamId, optionId: matchOptionVotes.optionId }).from(matchOptionVotes).where(eq(matchOptionVotes.matchId, match.id));
  const id = agreedOption(votes, match.homeTeamId, match.awayTeamId);
  if (!id) return false;
  const [o] = await tx.select().from(matchOptions).where(eq(matchOptions.id, id));
  if (!o || !optionStillValid(o.startsAt, new Date())) return false;

  const price = await priceFor(tx, o.venueId, match.durationMin);
  await tx
    .update(matches)
    .set({ startsAt: o.startsAt, venueId: o.venueId, venueText: o.venueText, priceCents: price?.priceCents ?? null, costCents: price?.costCents ?? null, schedulingOpen: false, schedulingDeadline: null })
    .where(eq(matches.id, match.id));
  await audit(null, "scheduling.locked", "match", match.id, { after: { optionId: id, startsAt: o.startsAt, venue: o.venueText } }, tx);
  const when = o.startsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  await notifyUsers(
    [...(await teamAdminIds(tx, match.homeTeamId)), ...(await teamAdminIds(tx, match.awayTeamId)), ...(await matchParticipantIds(tx, match.id))],
    { type: "match.scheduled", title: "Termin und Ort stehen fest", body: `${when} Uhr${o.venueText ? `, ${o.venueText}` : ""}. Macht euch in der Lobby bereit.`, url: `/lobby/${match.id}` },
    tx,
  );
  return true;
}

export type SchedulingView = {
  open: boolean;
  deadline: Date | null;
  minStart: string;
  options: { id: string; startsAt: Date; venueId: string | null; venueText: string | null; proposedByTeam: string | null; votedTeamIds: string[] }[];
  venues: { id: string; name: string; city: string }[];
};

export async function getScheduling(match: { id: string; schedulingOpen: boolean; schedulingDeadline: Date | null }, city?: string): Promise<SchedulingView | null> {
  if (!match.schedulingOpen) return null;
  const options = await db.select().from(matchOptions).where(eq(matchOptions.matchId, match.id)).orderBy(asc(matchOptions.startsAt), asc(matchOptions.createdAt));
  const votes = await db.select({ teamId: matchOptionVotes.teamId, optionId: matchOptionVotes.optionId }).from(matchOptionVotes).where(eq(matchOptionVotes.matchId, match.id));
  const list = await db.select({ id: venues.id, name: venues.name, city: venues.city }).from(venues).where(eq(venues.active, true)).orderBy(asc(venues.city), asc(venues.name));
  return {
    open: true,
    deadline: match.schedulingDeadline,
    minStart: toBerlinInputValue(new Date(Math.ceil((Date.now() + 25 * 3_600_000) / 900_000) * 900_000)), // auf die Viertelstunde, passend zum Raster des Feldes
    options: options.map((o) => ({ id: o.id, startsAt: o.startsAt, venueId: o.venueId, venueText: o.venueText, proposedByTeam: o.proposedByTeam, votedTeamIds: votes.filter((v) => v.optionId === o.id).map((v) => v.teamId) })),
    venues: city ? [...list.filter((v) => v.city === city), ...list.filter((v) => v.city !== city)] : list,
  };
}

/** Job: Wenn Termin und Ort nach der Frist nicht feststehen, wird das Spiel abgesagt. */
export async function expireScheduling(now: Date = new Date()): Promise<number> {
  const due = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.schedulingOpen, true), eq(matches.status, "lobby"), lt(matches.schedulingDeadline, now)));
  let n = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
      if (!m || !m.schedulingOpen || m.status !== "lobby") return;
      await tx.update(matches).set({ schedulingOpen: false }).where(eq(matches.id, id));
      await cancelMatchTx(tx, m, null, "Die Teams haben sich nicht rechtzeitig auf Termin und Ort geeinigt.");
      n += 1;
    });
  }
  return n;
}

