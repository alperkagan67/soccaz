import { randomInt } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, teamMembers } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { matchmakingQueue, matchVetoHalls } from "@/db/schema-matchmaking";
import { overlap, suggestSlots, usableWindows } from "@/lib/matchmaking";
import { buildPool, MIN_POOL, VETO_TURN_MS, type PoolVenue } from "@/lib/veto";
import { audit } from "./audit";
import { teamName } from "./names";
import { notifyUsers, teamAdminIds } from "./notifications";
import { priceFor } from "./pricing";
import { insertOptions } from "./scheduling";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;

/** Legt die Hallen für das Veto fest und startet es. Gibt false zurück, wenn es zu wenige Hallen gibt (dann gibt es kein Veto). */
export async function startVeto(tx: Tx, match: MatchRow, city: string, now: Date = new Date()): Promise<boolean> {
  const rows = await tx
    .select({ id: venues.id, name: venues.name, city: venues.city, lat: venues.lat, lng: venues.lng, partner: venues.isPartner, verified: venues.verified })
    .from(venues)
    .where(eq(venues.active, true));
  const pool = buildPool(rows as PoolVenue[], city);
  if (pool.length < MIN_POOL) return false;

  await tx.insert(matchVetoHalls).values(pool.map((v, position) => ({ matchId: match.id, venueId: v.id, position })));
  const first = randomInt(2) === 0 ? match.homeTeamId : match.awayTeamId; // Münzwurf
  await tx.update(matches).set({ vetoStatus: "running", vetoTurnTeamId: first, vetoTurnDeadline: new Date(now.getTime() + VETO_TURN_MS) }).where(eq(matches.id, match.id));
  await notifyTurn(tx, match.id, first, `Münzwurf: Ihr beginnt. Bannt Hallen, die ihr nicht spielen wollt.`);
  return true;
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
    await finishVeto(tx, match, now);
    return;
  }
  const next = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
  await tx.update(matches).set({ vetoTurnTeamId: next, vetoTurnDeadline: new Date(now.getTime() + VETO_TURN_MS) }).where(eq(matches.id, match.id));
  await notifyTurn(tx, match.id, next, `${await teamName(tx, teamId)} hat eine Halle gebannt${auto ? " (automatisch, Zeit abgelaufen)" : ""}. Jetzt seid ihr dran.`);
}

async function finishVeto(tx: Tx, match: MatchRow, now: Date) {
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
      schedulingDeadline: new Date(now.getTime() + 24 * 3_600_000),
    })
    .where(eq(matches.id, match.id));

  // Termine aus den Zeitfenstern beider Teams, jetzt für die gewählte Halle
  const entries = await tx.select({ windows: matchmakingQueue.windows }).from(matchmakingQueue).where(eq(matchmakingQueue.matchId, match.id));
  let slots: Date[] = [];
  if (entries.length === 2) {
    const toWindows = (w: { from: string; to: string }[]) => usableWindows(w.map((x) => ({ from: new Date(x.from), to: new Date(x.to) })), match.durationMin, now);
    slots = suggestSlots(overlap(toWindows(entries[0].windows), toWindows(entries[1].windows), match.durationMin), match.durationMin);
  }
  await insertOptions(tx, match.id, slots.map((startsAt) => ({ startsAt, venueId: venue.id, venueText: venue.name })));
  await audit(null, "veto.done", "match", match.id, { after: { venueId: venue.id, venue: venue.name } }, tx);
  await notifyUsers(
    [...(await teamAdminIds(tx, match.homeTeamId)), ...(await teamAdminIds(tx, match.awayTeamId))],
    { type: "match.found", title: `Halle steht fest: ${venue.name}`, body: slots.length ? "Wählt jetzt gemeinsam den Termin." : "Es gibt keine gemeinsame Zeit mehr. Schlagt einen Termin vor.", url: `/lobby/${match.id}` },
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

export async function getVeto(matchId: string, status: "none" | "running" | "done", turnTeamId: string | null, deadline: Date | null): Promise<VetoView | null> {
  if (status === "none") return null;
  const rows = await db
    .select({ venueId: matchVetoHalls.venueId, name: venues.name, city: venues.city, website: venues.website, verified: venues.verified, partner: venues.isPartner, bannedByTeam: matchVetoHalls.bannedByTeam, bannedAuto: matchVetoHalls.bannedAuto, banOrder: matchVetoHalls.banOrder, picked: matchVetoHalls.picked })
    .from(matchVetoHalls)
    .innerJoin(venues, eq(venues.id, matchVetoHalls.venueId))
    .where(eq(matchVetoHalls.matchId, matchId))
    .orderBy(asc(matchVetoHalls.position));
  return { status, turnTeamId, deadline, halls: rows };
}

