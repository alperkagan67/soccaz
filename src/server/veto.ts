import { randomInt } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { matchHallRequests, matchOptions, matchVetoHalls } from "@/db/schema-matchmaking";
import { buildPool, VETO_TURN_MS, type PoolVenue } from "@/lib/veto";
import { audit } from "./audit";
import { teamName } from "./names";
import { notifyUsers, teamAdminIds } from "./notifications";
import { priceFor } from "./pricing";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;

export const HALL_REPLY_MS = 12 * 3_600_000; // so lange hat ein Hallenbetreiber Zeit zu antworten

/**
 * Der Termin steht. Jetzt werden die Hallen angefragt: Hallen mit Betreiber-Konto müssen bestätigen, dass sie frei sind,
 * Hallen ohne Konto bleiben im Rennen (ungeprüft). Das Veto beginnt erst, wenn alle Antworten da sind.
 */
export async function startHallCheck(tx: Tx, match: MatchRow, city: string, now: Date = new Date()): Promise<void> {
  const rows = await tx
    .select({ id: venues.id, name: venues.name, city: venues.city, lat: venues.lat, lng: venues.lng, partner: venues.isPartner, verified: venues.verified, manager: venues.managerUserId })
    .from(venues)
    .where(eq(venues.active, true));
  const pool = buildPool(rows as PoolVenue[], city);
  await tx.delete(matchHallRequests).where(eq(matchHallRequests.matchId, match.id));
  if (pool.length) {
    await tx.insert(matchHallRequests).values(pool.map((v, position) => ({ matchId: match.id, venueId: v.id, position, status: rows.find((r) => r.id === v.id)?.manager ? ("pending" as const) : ("unmanaged" as const) })));
  }
  await tx.update(matches).set({ vetoStatus: "halls", vetoTurnTeamId: null, vetoTurnDeadline: new Date(now.getTime() + HALL_REPLY_MS) }).where(eq(matches.id, match.id));
  const when = match.startsAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const managers = new Set(rows.filter((r) => pool.some((p) => p.id === r.id) && r.manager).map((r) => r.manager!));
  await notifyUsers([...managers], { type: "hall.request", title: "Neue Spielanfrage für eure Halle", body: `${when} Uhr, ${match.durationMin} Minuten. Bitte bestätigt, ob die Halle frei ist.`, url: "/halle" }, tx);
  await settleHallCheck(tx, (await tx.select().from(matches).where(eq(matches.id, match.id)))[0], now);
}

/** Sind alle Hallen-Antworten da (oder ist die Frist um), geht es weiter: Veto, direkte Wahl oder neuer Termin. */
export async function settleHallCheck(tx: Tx, match: MatchRow, now: Date): Promise<void> {
  if (match.vetoStatus !== "halls") return;
  let reqs = await tx.select().from(matchHallRequests).where(eq(matchHallRequests.matchId, match.id)).orderBy(asc(matchHallRequests.position));
  const expired = Boolean(match.vetoTurnDeadline && match.vetoTurnDeadline <= now);
  if (reqs.some((r) => r.status === "pending") && !expired) return;
  if (expired) {
    await tx.update(matchHallRequests).set({ status: "declined" }).where(and(eq(matchHallRequests.matchId, match.id), eq(matchHallRequests.status, "pending")));
    reqs = reqs.map((r) => (r.status === "pending" ? { ...r, status: "declined" as const } : r));
  }
  const free = reqs.filter((r) => r.status === "confirmed" || r.status === "unmanaged");
  if (free.length === 0) {
    // Zu diesem Termin ist keine Halle frei: Die Teams wählen einen neuen Termin
    await tx.delete(matchOptions).where(eq(matchOptions.matchId, match.id)); // Stimmen verfallen mit
    await tx.delete(matchHallRequests).where(eq(matchHallRequests.matchId, match.id));
    await tx.update(matches).set({ vetoStatus: "none", vetoTurnDeadline: null, schedulingOpen: true, schedulingDeadline: new Date(now.getTime() + 48 * 3_600_000) }).where(eq(matches.id, match.id));
    await notifyUsers(
      [...(await teamAdminIds(tx, match.homeTeamId)), ...(await teamAdminIds(tx, match.awayTeamId))],
      { type: "match.found", title: "Keine Halle frei", body: "Zu diesem Termin ist keine Halle frei. Wählt bitte einen neuen Termin.", url: `/lobby/${match.id}` },
      tx,
    );
    return;
  }
  await tx.insert(matchVetoHalls).values(free.map((r, position) => ({ matchId: match.id, venueId: r.venueId, position }))).onConflictDoNothing();
  if (free.length === 1) {
    await tx.update(matches).set({ vetoStatus: "running", vetoTurnDeadline: null }).where(eq(matches.id, match.id));
    await finishVeto(tx, { ...match, vetoStatus: "running" });
    return;
  }
  const first = randomInt(2) === 0 ? match.homeTeamId : match.awayTeamId; // Münzwurf
  await tx.update(matches).set({ vetoStatus: "running", vetoTurnTeamId: first, vetoTurnDeadline: new Date(now.getTime() + VETO_TURN_MS) }).where(eq(matches.id, match.id));
  await notifyTurn(tx, match.id, first, "Die Hallen haben bestätigt. Münzwurf: Ihr beginnt. Bannt Hallen, die ihr nicht spielen wollt.");
}

/** Hallenbetreiber bestätigt oder lehnt ab (die Halle ist zu dem Termin belegt). */
export async function answerHallRequest(userId: string, matchId: string, venueId: string, accept: boolean) {
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m || m.vetoStatus !== "halls" || m.status !== "lobby") throw new DomainError("Diese Anfrage ist nicht mehr offen.");
    const [v] = await tx.select({ manager: venues.managerUserId, name: venues.name }).from(venues).where(eq(venues.id, venueId));
    if (!v || v.manager !== userId) throw new DomainError("Diese Halle gehört nicht zu deinem Konto.");
    const [r] = await tx.select().from(matchHallRequests).where(and(eq(matchHallRequests.matchId, matchId), eq(matchHallRequests.venueId, venueId)));
    if (!r || r.status !== "pending") throw new DomainError("Diese Anfrage ist schon beantwortet.");
    await tx.update(matchHallRequests).set({ status: accept ? "confirmed" : "declined", answeredBy: userId, answeredAt: new Date() }).where(and(eq(matchHallRequests.matchId, matchId), eq(matchHallRequests.venueId, venueId)));
    await audit(userId, accept ? "hall.confirm" : "hall.decline", "match", matchId, { after: { venueId } }, tx);
    await settleHallCheck(tx, m, new Date());
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

export type HallInquiry = { matchId: string; number: number | null; venueId: string; venueName: string; startsAt: Date; durationMin: number; home: string; away: string; deadline: Date | null };

/** Offene Anfragen für die Hallen eines Betreibers. */
export async function pendingHallInquiries(userId: string): Promise<HallInquiry[]> {
  const rows = await db
    .select({ matchId: matches.id, number: matches.number, venueId: venues.id, venueName: venues.name, startsAt: matches.startsAt, durationMin: matches.durationMin, homeId: matches.homeTeamId, awayId: matches.awayTeamId, deadline: matches.vetoTurnDeadline })
    .from(matchHallRequests)
    .innerJoin(venues, and(eq(venues.id, matchHallRequests.venueId), eq(venues.managerUserId, userId)))
    .innerJoin(matches, and(eq(matches.id, matchHallRequests.matchId), eq(matches.vetoStatus, "halls"), eq(matches.status, "lobby")))
    .where(eq(matchHallRequests.status, "pending"))
    .orderBy(asc(matches.startsAt));
  const out: HallInquiry[] = [];
  for (const r of rows) out.push({ matchId: r.matchId, number: r.number, venueId: r.venueId, venueName: r.venueName, startsAt: r.startsAt, durationMin: r.durationMin, deadline: r.deadline, home: await teamName(db, r.homeId), away: await teamName(db, r.awayId) });
  return out;
}

/** Stand der Hallen-Anfragen für die Lobby-Seite. */
export async function getHallCheck(matchId: string, status: string) {
  if (status !== "halls") return null;
  return db
    .select({ venueId: matchHallRequests.venueId, name: venues.name, city: venues.city, status: matchHallRequests.status })
    .from(matchHallRequests)
    .innerJoin(venues, eq(venues.id, matchHallRequests.venueId))
    .where(eq(matchHallRequests.matchId, matchId))
    .orderBy(asc(matchHallRequests.position));
}

async function notifyTurn(tx: Tx, matchId: string, teamId: string, text: string) {
  await notifyUsers(await teamAdminIds(tx, teamId), { type: "veto.turn", title: "Du bist beim Hallen-Veto dran", body: text, url: `/lobby/${matchId}` }, tx);
}

async function lockRunning(tx: Tx, matchId: string): Promise<MatchRow> {
  const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
  if (!m) throw new DomainError("Spiel nicht gefunden.");
  if (m.vetoStatus !== "running" || m.status !== "lobby") throw new DomainError("Das Hallen-Veto läuft nicht.");
  return m;
}

/** Ein Bann. Bleibt danach nur eine Halle übrig, ist sie gewählt, sonst ist das andere Team dran. */
async function applyBan(tx: Tx, match: MatchRow, teamId: string, venueId: string, auto: boolean, now: Date) {
  const halls = await tx.select().from(matchVetoHalls).where(eq(matchVetoHalls.matchId, match.id));
  const hall = halls.find((h) => h.venueId === venueId);
  if (!hall) throw new DomainError("Diese Halle steht nicht zur Wahl.");
  if (hall.bannedByTeam) throw new DomainError("Diese Halle ist schon gebannt.");
  const banned = halls.filter((h) => h.bannedByTeam).length;
  await tx.update(matchVetoHalls).set({ bannedByTeam: teamId, bannedAuto: auto, banOrder: banned + 1 }).where(and(eq(matchVetoHalls.matchId, match.id), eq(matchVetoHalls.venueId, venueId)));

  const left = halls.length - (banned + 1);
  if (left <= 1) {
    await finishVeto(tx, match);
    return;
  }
  const next = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  await tx.update(matches).set({ vetoTurnTeamId: next, vetoTurnDeadline: new Date(now.getTime() + VETO_TURN_MS) }).where(eq(matches.id, match.id));
  await notifyTurn(tx, match.id, next, `${await teamName(tx, teamId)} hat eine Halle gebannt${auto ? " (automatisch, Zeit abgelaufen)" : ""}. Jetzt seid ihr dran.`);
}

async function finishVeto(tx: Tx, match: MatchRow) {
  const [pick] = await tx
    .select({ venueId: matchVetoHalls.venueId })
    .from(matchVetoHalls)
    .where(and(eq(matchVetoHalls.matchId, match.id), isNull(matchVetoHalls.bannedByTeam)));
  const [venue] = await tx.select({ id: venues.id, name: venues.name }).from(venues).where(eq(venues.id, pick.venueId));
  await tx.update(matchVetoHalls).set({ picked: true }).where(and(eq(matchVetoHalls.matchId, match.id), eq(matchVetoHalls.venueId, pick.venueId)));
  const price = await priceFor(tx, venue.id, match.durationMin);
  await tx
    .update(matches)
    .set({
      vetoStatus: "done",
      vetoTurnTeamId: null,
      vetoTurnDeadline: null,
      venueId: venue.id,
      venueText: venue.name,
      priceCents: price?.priceCents ?? null,
      costCents: price?.costCents ?? null,
    })
    .where(eq(matches.id, match.id));

  await audit(null, "veto.done", "match", match.id, { after: { venueId: venue.id, venue: venue.name } }, tx);
  await notifyUsers(
    [...(await teamAdminIds(tx, match.homeTeamId)), ...(await teamAdminIds(tx, match.awayTeamId))],
    { type: "match.found", title: `Halle steht fest: ${venue.name}`, body: "Termin und Halle stehen fest. Macht euch in der Lobby bereit.", url: `/lobby/${match.id}` },
    tx,
  );
}

export async function banHall(userId: string, matchId: string, venueId: string) {
  await db.transaction(async (tx) => {
    const match = await lockRunning(tx, matchId);
    const [admin] = await tx
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.role, "admin"), eq(teamMembers.teamId, match.vetoTurnTeamId ?? match.homeTeamId)));
    if (!admin || admin.teamId !== match.vetoTurnTeamId) throw new DomainError("Dein Team ist gerade nicht dran.");
    await applyBan(tx, match, admin.teamId, venueId, false, new Date());
    await audit(userId, "veto.ban", "match", matchId, { after: { venueId } }, tx);
    await tx.execute(sql`select pg_notify('lobby', ${matchId})`);
  });
}

/** Job: Läuft die Zeit eines Teams ab, bannt das System für dieses Team eine zufällige Halle. */
export async function advanceVetos(now: Date = new Date()): Promise<number> {
  const waiting = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.vetoStatus, "halls"), eq(matches.status, "lobby"), lt(matches.vetoTurnDeadline, now)));
  for (const { id } of waiting) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
      if (m) await settleHallCheck(tx, m, now);
      await tx.execute(sql`select pg_notify('lobby', ${id})`);
    });
  }
  const due = await db.select({ id: matches.id }).from(matches).where(and(eq(matches.vetoStatus, "running"), eq(matches.status, "lobby"), isNotNull(matches.vetoTurnTeamId), lt(matches.vetoTurnDeadline, now)));
  let n = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
      if (!m || m.vetoStatus !== "running" || !m.vetoTurnTeamId || !m.vetoTurnDeadline || m.vetoTurnDeadline >= now) return;
      const open = await tx.select({ venueId: matchVetoHalls.venueId }).from(matchVetoHalls).where(and(eq(matchVetoHalls.matchId, id), isNull(matchVetoHalls.bannedByTeam)));
      if (open.length < 2) return;
      await applyBan(tx, m, m.vetoTurnTeamId, open[randomInt(open.length)].venueId, true, now);
      await tx.execute(sql`select pg_notify('lobby', ${id})`);
      n += 1;
    });
  }
  return n;
}

export type VetoView = {
  status: "running" | "done";
  turnTeamId: string | null;
  deadline: Date | null;
  halls: { venueId: string; name: string; city: string; website: string | null; verified: boolean; partner: boolean; bannedByTeam: string | null; bannedAuto: boolean; banOrder: number | null; picked: boolean }[];
};

export async function getVeto(matchId: string, status: "none" | "halls" | "running" | "done", turnTeamId: string | null, deadline: Date | null): Promise<VetoView | null> {
  if (status === "none" || status === "halls") return null;
  const rows = await db
    .select({ venueId: matchVetoHalls.venueId, name: venues.name, city: venues.city, website: venues.website, verified: venues.verified, partner: venues.isPartner, bannedByTeam: matchVetoHalls.bannedByTeam, bannedAuto: matchVetoHalls.bannedAuto, banOrder: matchVetoHalls.banOrder, picked: matchVetoHalls.picked })
    .from(matchVetoHalls)
    .innerJoin(venues, eq(venues.id, matchVetoHalls.venueId))
    .where(eq(matchVetoHalls.matchId, matchId))
    .orderBy(asc(matchVetoHalls.position));
  return { status, turnTeamId, deadline, halls: rows };
}

