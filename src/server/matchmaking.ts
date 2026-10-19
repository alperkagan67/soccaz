import { and, asc, count, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers, teams } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { venues } from "@/db/schema-finance";
import { matchmakingQueue, type QueueWindow } from "@/db/schema-matchmaking";
import { initialTeamElo } from "@/lib/elo";
import { combineOptions, findPairs, overlap, suggestSlots, strengthOk, type Pair, MAX_WINDOW_DAYS_AHEAD, MAX_WINDOWS, MIN_LEAD_MS, QUEUE_LIFETIME_MS, usableWindows, type QueueEntry } from "@/lib/matchmaking";
import { toBerlinInputValue } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { audit } from "./audit";
import { teamName } from "./names";
import { notifyUsers, teamAdminIds } from "./notifications";
import { insertOptions } from "./scheduling";
import { startVeto } from "./veto";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

const DAY = 86_400_000;

export async function teamElo(teamId: string): Promise<number> {
  const [s] = await db.select({ elo: teamStats.elo }).from(teamStats).where(eq(teamStats.teamId, teamId));
  if (s) return s.elo;
  const [t] = await db.select({ strength: teams.strength }).from(teams).where(eq(teams.id, teamId));
  return initialTeamElo(t?.strength ?? 3);
}

export type QueueInput = { teamId: string; city: string; durationMin: number; windows: { from: Date; to: Date }[]; note?: string; wantStrengthMin?: number | null; wantStrengthMax?: number | null };

export async function joinQueue(userId: string, input: QueueInput) {
  const now = new Date();
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (input.durationMin !== 60 && input.durationMin !== 90) throw new DomainError("Dauer: 60 oder 90 Minuten.");
  if (input.windows.length === 0) throw new DomainError("Bitte gib mindestens ein Zeitfenster an.");
  if (input.windows.length > MAX_WINDOWS) throw new DomainError(`Höchstens ${MAX_WINDOWS} Zeitfenster.`);
  for (const w of input.windows) {
    if (!(w.from < w.to)) throw new DomainError("Ein Zeitfenster endet vor seinem Beginn.");
    if (w.to.getTime() > now.getTime() + MAX_WINDOW_DAYS_AHEAD * DAY) throw new DomainError(`Zeitfenster dürfen höchstens ${MAX_WINDOW_DAYS_AHEAD} Tage in der Zukunft liegen.`);
  }
  const wantMin = input.wantStrengthMin ?? null;
  const wantMax = input.wantStrengthMax ?? null;
  for (const v of [wantMin, wantMax]) if (v !== null && (!Number.isInteger(v) || v < 1 || v > 5)) throw new Error("bad strength");
  if (wantMin !== null && wantMax !== null && wantMin > wantMax) throw new DomainError("Die gesuchte Spielstärke ist umgekehrt: „von“ muss kleiner oder gleich „bis“ sein.");
  const note = (input.note ?? "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 200) || null;
  const usable = usableWindows(input.windows, input.durationMin, now);
  if (usable.length === 0) throw new DomainError(`Kein Zeitfenster passt: Es muss mindestens ${input.durationMin} Minuten lang sein und mindestens 24 Stunden in der Zukunft enden.`);

  const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, userId)));
  if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können das Team in die Warteschlange stellen.");
  const [team] = await db.select({ archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, input.teamId));
  if (!team || team.archivedAt) throw new DomainError("Team nicht gefunden.");

  const windows: QueueWindow[] = input.windows.map((w) => ({ from: w.from.toISOString(), to: w.to.toISOString() }));
  try {
    await db.insert(matchmakingQueue).values({ teamId: input.teamId, createdBy: userId, city: input.city, durationMin: input.durationMin, windows, note, wantStrengthMin: wantMin, wantStrengthMax: wantMax, expiresAt: new Date(now.getTime() + QUEUE_LIFETIME_MS) });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") throw new DomainError("Dein Team wartet schon auf einen Gegner.");
    throw error;
  }
  await audit(userId, "matchmaking.join", "team", input.teamId, { after: { city: input.city, durationMin: input.durationMin } });
  return runMatchmaker(now);
}

export async function leaveQueue(userId: string, teamId: string) {
  const [m] = await db.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können die Suche abbrechen.");
  const rows = await db.update(matchmakingQueue).set({ status: "cancelled" }).where(and(eq(matchmakingQueue.teamId, teamId), eq(matchmakingQueue.status, "waiting"))).returning({ id: matchmakingQueue.id });
  if (rows.length === 0) throw new DomainError("Dein Team wartet nicht auf einen Gegner.");
  await audit(userId, "matchmaking.leave", "team", teamId, {});
}

/**
 * Läuft bei jedem Beitritt und jede Minute (Job): beendet abgelaufene Einträge, paart passende Teams und legt für jedes Paar
 * ein Spiel an, dessen Termin und Ort die Teams anschließend gemeinsam wählen. Gibt die Zahl neuer Spiele zurück.
 */
export async function runMatchmaker(now: Date = new Date()): Promise<number> {
  await db.update(matchmakingQueue).set({ status: "expired" }).where(and(eq(matchmakingQueue.status, "waiting"), lt(matchmakingQueue.expiresAt, now)));
  let created = 0;
  // Es kann mehrere Paarungen geben; jede läuft in einer eigenen Transaktion mit Zeilensperre.
  for (let round = 0; round < 20; round++) {
    const made = await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(matchmakingQueue)
        .where(and(eq(matchmakingQueue.status, "waiting"), sql`${matchmakingQueue.expiresAt} >= ${now}`))
        .orderBy(asc(matchmakingQueue.createdAt))
        .for("update", { skipLocked: true });
      if (rows.length < 2) return false;

      const elos = new Map<string, number>();
      const strengths = new Map<string, number>();
      for (const r of rows) {
        elos.set(r.teamId, await teamElo(r.teamId));
        const [t] = await tx.select({ strength: teams.strength }).from(teams).where(eq(teams.id, r.teamId));
        strengths.set(r.teamId, t?.strength ?? 3);
      }
      const entries: QueueEntry[] = rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        city: r.city,
        durationMin: r.durationMin,
        elo: elos.get(r.teamId)!,
        createdAt: r.createdAt,
        windows: r.windows.map((w) => ({ from: new Date(w.from), to: new Date(w.to) })),
        strength: strengths.get(r.teamId),
        wantMin: r.wantStrengthMin,
        wantMax: r.wantStrengthMax,
      }));
      const pair = findPairs(entries, now)[0];
      if (!pair) return false;

      await createPairedMatch(tx, pair, now);
      return true;
    });
    if (!made) break;
    created += 1;
  }
  return created;
}


/** Legt für ein Paar das Spiel an: Hallen-Veto (oder Zeitvorschläge), Admins in die Lobby, Einträge auf "gepaart", Benachrichtigungen. */
async function createPairedMatch(tx: Tx, pair: Pair, now: Date) {
  const [match] = await tx
    .insert(matches)
    .values({
      homeTeamId: pair.a.teamId,
      awayTeamId: pair.b.teamId,
      startsAt: pair.slots[0],
      durationMin: pair.a.durationMin,
      visibility: "public",
      schedulingOpen: true,
      schedulingDeadline: new Date(now.getTime() + 36 * 3_600_000), // Hallen-Veto (bis zu 12 Stunden) plus Terminwahl
    })
    .returning();

  // Erst das Hallen-Veto; gibt es zu wenige Hallen, schlagen wir Zeiten mit den vorhandenen Hallen vor
  const vetoStarted = await startVeto(tx, match, pair.a.city, now);
  const partnerVenues = vetoStarted ? [] : await tx
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(and(eq(venues.active, true), eq(venues.city, pair.a.city)))
    .orderBy(desc(venues.isPartner), asc(venues.name))
    .limit(2);
  if (!vetoStarted) await insertOptions(
    tx,
    match.id,
    combineOptions(pair.slots, partnerVenues).map((o) => ({ startsAt: o.startsAt, venueId: o.venue?.id ?? null, venueText: o.venue?.name ?? null })),
  );

  const admins = await tx
    .select({ userId: teamMembers.userId, teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(inArray(teamMembers.teamId, [pair.a.teamId, pair.b.teamId]), eq(teamMembers.role, "admin")));
  if (admins.length) await tx.insert(matchParticipants).values(admins.map((a) => ({ matchId: match.id, userId: a.userId, teamId: a.teamId }))).onConflictDoNothing();

  await tx.update(matchmakingQueue).set({ status: "matched", matchId: match.id }).where(inArray(matchmakingQueue.id, [pair.a.id, pair.b.id]));
  await audit(null, "matchmaking.matched", "match", match.id, { after: { home: pair.a.teamId, away: pair.b.teamId, eloDiff: pair.eloDiff } }, tx);

  const [nameA, nameB] = [await teamName(tx, pair.a.teamId), await teamName(tx, pair.b.teamId)];
  await notifyUsers(await teamAdminIds(tx, pair.a.teamId), { type: "match.found", title: "Gegner gefunden", body: `${nameB} (Elo ${pair.b.elo}) wartet auf euch. Als Nächstes folgt das Hallen-Veto.`, url: `/lobby/${match.id}` }, tx);
  await notifyUsers(await teamAdminIds(tx, pair.b.teamId), { type: "match.found", title: "Gegner gefunden", body: `${nameA} (Elo ${pair.a.elo}) wartet auf euch. Als Nächstes folgt das Hallen-Veto.`, url: `/lobby/${match.id}` }, tx);
}

export const MIN_LEAD_HOURS_QUEUE = MIN_LEAD_MS / 3_600_000;

/** Stand der Warteschlange für die Seite: eigene Einträge der Admin-Teams und Zahl wartender Teams pro Stadt. */
export async function queueOverview(userId: string | null) {
  await connection();
  const waiting = await db
    .select({ city: matchmakingQueue.city, n: count() })
    .from(matchmakingQueue)
    .where(and(eq(matchmakingQueue.status, "waiting"), sql`${matchmakingQueue.expiresAt} >= now()`))
    .groupBy(matchmakingQueue.city)
    .orderBy(asc(matchmakingQueue.city));
  const mine = userId
    ? await db
        .select({ id: matchmakingQueue.id, teamId: matchmakingQueue.teamId, teamName: teams.name, city: matchmakingQueue.city, durationMin: matchmakingQueue.durationMin, windows: matchmakingQueue.windows, createdAt: matchmakingQueue.createdAt, status: matchmakingQueue.status, matchId: matchmakingQueue.matchId })
        .from(matchmakingQueue)
        .innerJoin(teams, eq(teams.id, matchmakingQueue.teamId))
        .innerJoin(teamMembers, and(eq(teamMembers.teamId, matchmakingQueue.teamId), eq(teamMembers.userId, userId), eq(teamMembers.role, "admin")))
        .where(and(inArray(matchmakingQueue.status, ["waiting", "matched"]), sql`${matchmakingQueue.createdAt} > now() - interval '3 days'`))
        .orderBy(desc(matchmakingQueue.createdAt))
        .limit(10)
    : [];
  return { waiting, mine, minDay: toBerlinInputValue(new Date(Date.now() + 24 * 3_600_000)).slice(0, 10) };
}

export type OpenSearch = {
  id: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  city: string;
  durationMin: number;
  windows: QueueWindow[];
  note: string | null;
  wantStrengthMin: number | null;
  wantStrengthMax: number | null;
  createdAt: Date;
  expiresAt: Date;
  strength: number;
  elo: number;
  playedMatches: number;
  members: number;
  verified: boolean;
};

/** Alle offenen Suchen im Matchmaking mit allem, was ein anderes Team zur Entscheidung braucht. Öffentlich einsehbar. */
export async function listOpenSearches(filter: { city?: string; durationMin?: number } = {}): Promise<OpenSearch[]> {
  await connection();
  const rows = await db
    .select({
      id: matchmakingQueue.id,
      teamId: teams.id,
      teamName: teams.name,
      teamSlug: teams.slug,
      city: matchmakingQueue.city,
      durationMin: matchmakingQueue.durationMin,
      windows: matchmakingQueue.windows,
      note: matchmakingQueue.note,
      wantStrengthMin: matchmakingQueue.wantStrengthMin,
      wantStrengthMax: matchmakingQueue.wantStrengthMax,
      createdAt: matchmakingQueue.createdAt,
      expiresAt: matchmakingQueue.expiresAt,
      strength: teams.strength,
      verified: teams.isVerified,
      elo: teamStats.elo,
      playedMatches: teamStats.matches,
      members: sql<number>`(select count(*)::int from team_members m where m.team_id = ${teams.id})`,
    })
    .from(matchmakingQueue)
    .innerJoin(teams, eq(teams.id, matchmakingQueue.teamId))
    .leftJoin(teamStats, eq(teamStats.teamId, teams.id))
    .where(and(eq(matchmakingQueue.status, "waiting"), sql`${matchmakingQueue.expiresAt} >= now()`, filter.city ? eq(matchmakingQueue.city, filter.city) : undefined, filter.durationMin ? eq(matchmakingQueue.durationMin, filter.durationMin) : undefined))
    .orderBy(asc(matchmakingQueue.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r, elo: r.elo ?? initialTeamElo(r.strength), playedMatches: r.playedMatches ?? 0 }));
}

/**
 * Ein Team nimmt eine offene Suche direkt an (ohne auf die automatische Paarung zu warten). Es verpflichtet sich auf die Zeitfenster der Suche.
 * Der Wunsch zur Spielstärke gilt auch hier. Eine eigene Suche des annehmenden Teams endet damit.
 */
export async function acceptSearch(userId: string, entryId: string, teamId: string) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(matchmakingQueue).where(eq(matchmakingQueue.id, entryId)).for("update");
    if (!entry || entry.status !== "waiting" || entry.expiresAt < now) throw new DomainError("Diese Suche ist nicht mehr offen. Jemand war schneller.");
    if (entry.teamId === teamId) throw new DomainError("Du kannst deine eigene Suche nicht annehmen.");
    const [m] = await tx.select({ role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    if (m?.role !== "admin") throw new DomainError("Nur Team-Admins können Suchen annehmen.");
    const [mine] = await tx.select({ strength: teams.strength, archivedAt: teams.archivedAt }).from(teams).where(eq(teams.id, teamId));
    if (!mine || mine.archivedAt) throw new DomainError("Team nicht gefunden.");
    if (!strengthOk({ wantMin: entry.wantStrengthMin, wantMax: entry.wantStrengthMax }, mine.strength)) throw new DomainError("Dieses Team sucht eine andere Spielstärke als die eures Teams.");

    const windows = entry.windows.map((w) => ({ from: new Date(w.from), to: new Date(w.to) }));
    const slots = suggestSlots(overlap(usableWindows(windows, entry.durationMin, now), usableWindows(windows, entry.durationMin, now), entry.durationMin), entry.durationMin);
    if (slots.length === 0) throw new DomainError("Die Zeitfenster dieser Suche liegen zu nah oder sind vorbei.");

    // eigene Suche beenden; eigener (gepaarter) Eintrag speichert die Zeitfenster der Suche, damit das Veto Termine daraus bilden kann
    await tx.update(matchmakingQueue).set({ status: "cancelled" }).where(and(eq(matchmakingQueue.teamId, teamId), eq(matchmakingQueue.status, "waiting")));
    const [own] = await tx
      .insert(matchmakingQueue)
      .values({ teamId, createdBy: userId, city: entry.city, durationMin: entry.durationMin, windows: entry.windows, status: "waiting", expiresAt: entry.expiresAt })
      .returning();
    const [eloA, eloB] = [await teamElo(entry.teamId), await teamElo(teamId)];
    const a: QueueEntry = { id: entry.id, teamId: entry.teamId, city: entry.city, durationMin: entry.durationMin, elo: eloA, createdAt: entry.createdAt, windows };
    const b: QueueEntry = { id: own.id, teamId, city: entry.city, durationMin: entry.durationMin, elo: eloB, createdAt: now, windows };
    await createPairedMatch(tx, { a, b, eloDiff: Math.abs(eloA - eloB), slots }, now);
    await audit(userId, "matchmaking.accept", "team", teamId, { after: { entryId, opponent: entry.teamId } }, tx);
    const [match] = await tx.select({ matchId: matchmakingQueue.matchId }).from(matchmakingQueue).where(eq(matchmakingQueue.id, entry.id));
    return match.matchId!;
  });
}
