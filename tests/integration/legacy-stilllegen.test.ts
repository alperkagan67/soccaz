import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { creditWallet, debitWallet, walletBalance } from "@/server/ledger";
import { finalConfirm, leaveLobby, payShare, setReady } from "@/server/lobby";
import { settleDueMatches } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { fixShare, settleMatch } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, reloadMatch, seedShare } from "./helpers";

// 012 M6b 1c-ii a-1: Altspiele (legacy_share_model) sind stillgelegt: bei eingeschalteten Zahlungen kein Bezahlen vom Guthaben, kein Bestaetigen/Fixieren, kein Abrechnen.
// Erstattungen und Absagen (Geld geht nur zurueck) bleiben. Bei Zahlungen AUS bewegt sich nichts (unveraendert).

const key = () => `ls-${Math.random().toString(36).slice(2)}`;
const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: key() });
const seatOf = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const MSG = /alten Zahlungsmodell/;

beforeEach(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", false);
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

/** Bereits vor der Stilllegung bezahlter Platz: Hauptbuch (wallet -> revenue) und paid_cents direkt gesetzt (die alten Wege existieren nicht mehr). */
async function seedPaid(matchId: string, userId: string, cents: number) {
  await db.transaction((tx) => debitWallet(tx, userId, { to: "revenue", amountCents: cents, kind: "match_share", matchId, idempotencyKey: key(), reason: "Startgebühr (Reservierung)", actorId: userId }));
  await seedShare(userId, matchId, cents);
}

describe("Altspiel + Zahlungen AN: stillgelegt", () => {
  it("payShare wird abgewiesen: nichts gebucht, paid_cents 0, Guthaben unveraendert", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 3000);
    await expect(payShare(m.adminA.id, m.match.id)).rejects.toThrow(MSG);
    expect((await seatOf(m.match.id, m.adminA.id)).paidCents).toBe(0);
    expect(await walletBalance(db, m.adminA.id)).toBe(3000);
  });

  it("finalConfirm (Bestaetigen/Fixieren) wird abgewiesen, nichts fixiert", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow(MSG);
    expect((await reloadMatch(m.match.id)).homeFinalAt).toBeNull();
  });

  it("fixShare eines Altspiels (Privatspiel des alten Modells) wirft", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await db.update(matches).set({ kind: "private" }).where(eq(matches.id, m.match.id));
    await expect(db.transaction(async (tx) => fixShare(tx, await reloadMatch(m.match.id)))).rejects.toThrow(MSG);
    expect((await reloadMatch(m.match.id)).finalShareCents).toBeNull();
  });

  it("settleMatch rechnet ein Altspiel nie ab (false, settled_at leer), auch mit bezahlten Plaetzen; settleDueMatches ueberspringt es", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 3000);
    await seedPaid(m.match.id, m.adminA.id, 1000);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id));
    const before = await walletBalance(db, m.adminA.id);
    expect(await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)))).toBe(false);
    await db.update(matches).set({ startsAt: new Date(Date.now() + 60_000), createdAt: new Date(Date.now() - 72 * 3_600_000) }).where(eq(matches.id, m.match.id));
    await settleDueMatches();
    expect((await reloadMatch(m.match.id)).settledAt).toBeNull();
    expect(await walletBalance(db, m.adminA.id)).toBe(before);
  });

  it("Erstattung bleibt moeglich: Austritt mehr als 24 h vorher erstattet den bezahlten Anteil (Geld geht nur zurueck)", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await fund(p.id, 2000);
    await seedPaid(m.match.id, p.id, 1000);
    expect(await walletBalance(db, p.id)).toBe(1000);
    await leaveLobby(p.id, m.match.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
  });
});

describe("Altspiel + Zahlungen AUS: unveraendert (kostenlos, nichts bewegt sich)", () => {
  it("payShare ist wirkungslos (kein Fehler, nichts gebucht), Bereit geht", async () => {
    await setSetting(null, "payments_enabled", false);
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    expect((await seatOf(m.match.id, m.adminA.id)).paidCents).toBe(0);
    expect(await walletBalance(db, m.adminA.id)).toBe(0);
    expect((await seatOf(m.match.id, m.adminA.id)).readyAt).not.toBeNull();
  });

  it("Zahlungen AUS: beide Captains koennen ein Altspiel kostenlos bestaetigen (Stilllegung wirkt nur bei Zahlungen AN)", async () => {
    await setSetting(null, "payments_enabled", false);
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const all = [m.adminA, m.adminB];
    while (all.length < 10) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
    for (const p of all) await setReady(p.id, m.match.id, true);
    await finalConfirm(m.adminA.id, m.match.id);
    await finalConfirm(m.adminB.id, m.match.id);
    expect((await reloadMatch(m.match.id)).homeFinalAt).not.toBeNull();
  });
});

describe("Gegenprobe: neues Modell ist nicht stillgelegt", () => {
  it("ein Spiel ohne legacy_share_model darf bei Zahlungen AN vom Guthaben bezahlen (bis b)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 3000);
    await payShare(m.adminA.id, m.match.id);
    expect((await seatOf(m.match.id, m.adminA.id)).paidCents).toBeGreaterThan(0);
  });
});
