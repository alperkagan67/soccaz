import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { ledgerEntries, pendingRefunds } from "@/db/schema-finance";
import { creditWallet, debitWallet, trialBalance, walletBalance } from "@/server/ledger";
import { cancelMatch, finalConfirm, leaveLobby, payShare, removeParticipant, setReady } from "@/server/lobby";
import { getAlerts } from "@/server/finance";
import { cancelUncoveredPrivateGames, rentCheckAt } from "@/server/privategame";
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

const revenueOf = async (matchId: string) => {
  const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, matchId));
  return rows.reduce((sum, r) => sum + (r.creditAccount === "revenue" ? r.amountCents : 0) - (r.debitAccount === "revenue" ? r.amountCents : 0), 0);
};
const pendingOf = (matchId: string) => db.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, matchId));

describe("Altspiel: Erstattungen und Absagen BLEIBEN (Fixture ueber seedPaid, Geld geht nur zurueck)", () => {
  it("Austritt weniger als 24 h vor Anstoss: keine sofortige Erstattung, der Anspruch steht in pending_refunds; ein Ersatz kann nicht mehr bezahlen (payShare gesperrt), der Anspruch bleibt bestehen", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 10, priceCents: 8000, costCents: 8000 });
    const leaver = await addPlayer(m.match.id, m.home.id);
    await fund(leaver.id, 2000);
    await seedPaid(m.match.id, leaver.id, 1000);
    await leaveLobby(leaver.id, m.match.id);
    expect(await walletBalance(db, leaver.id)).toBe(1000); // Geld bleibt vorerst weg
    expect(await pendingOf(m.match.id)).toHaveLength(1);
    const sub = await addPlayer(m.match.id, m.home.id);
    await fund(sub.id, 2000);
    await expect(payShare(sub.id, m.match.id)).rejects.toThrow(MSG);
    expect(await walletBalance(db, leaver.id)).toBe(1000);
    expect(await pendingOf(m.match.id)).toHaveLength(1); // loest sich nur durch Absage oder manuelle Erstattung
  });

  it("Entfernen durch einen Admin: sofort volle Erstattung, auch kurz vor dem Spiel", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 5, priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await fund(p.id, 2000);
    await seedPaid(m.match.id, p.id, 1000);
    await removeParticipant(m.adminA.id, m.match.id, p.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await revenueOf(m.match.id)).toBe(0);
  });

  it("Absage: alle bekommen alles zurueck, auch wer kurz vorher ausgestiegen war (offener Anspruch), genau einmal, Hauptbuch ausgeglichen", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 10, priceCents: 8000, costCents: 8000 });
    const a = await addPlayer(m.match.id, m.home.id);
    const b = await addPlayer(m.match.id, m.away.id);
    const leaver = await addPlayer(m.match.id, m.home.id);
    for (const p of [a, b, leaver]) {
      await fund(p.id, 2000);
      await seedPaid(m.match.id, p.id, 1000);
    }
    await leaveLobby(leaver.id, m.match.id); // zu spaet: Anspruch offen
    expect(await pendingOf(m.match.id)).toHaveLength(1);
    await cancelMatch(m.adminA.id, m.match.id, "Halle gesperrt");
    for (const p of [a, b, leaver]) expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await revenueOf(m.match.id)).toBe(0);
    expect(await pendingOf(m.match.id)).toHaveLength(0);
    expect((await reloadMatch(m.match.id)).status).toBe("cancelled");
    await expect(cancelMatch(m.adminA.id, m.match.id, "nochmal")).rejects.toThrow(/nicht mehr/); // zweite Absage aendert nichts (Spiel ist nicht mehr aktiv)
    for (const p of [a, b, leaver]) expect(await walletBalance(db, p.id)).toBe(2000);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Altspiel: Job-Pfade (Erstattung bleibt) und Alarm", () => {
  it("cancelUncoveredPrivateGames sagt ein ungedecktes Altspiel (Privatspiel) ab und erstattet alle genau einmal, auch einen Aussteiger mit offenem Anspruch; zweiter Lauf tut nichts; Hauptbuch ausgeglichen", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 10, priceCents: 12_000, costCents: 12_000 }); // Anstoss in 10 h: der Austritt ist "zu spaet" (unter 24 h), es entsteht ein offener Anspruch
    await db.update(matches).set({ kind: "private", status: "confirmed", createdAt: new Date(Date.now() - 20 * 3_600_000) }).where(eq(matches.id, m.match.id));
    const players = [m.adminA];
    for (let i = 0; i < 9; i++) players.push(await addPlayer(m.match.id, m.home.id));
    for (const p of players) {
      await fund(p.id, 3000);
      await seedPaid(m.match.id, p.id, 1200); // 10 x 1200 = Miete gedeckt
    }
    const leaver = players[9];
    // Austritt eines Zahlers kurz vor dem Spiel (Privatspiel: die Liste ist ab 48 h gesperrt, der Weg ueber leaveLobby geht dort nicht): Zustand direkt gesetzt = Platz weg, Geld vorerst weg, offener Anspruch
    await db.delete(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, leaver.id)));
    await db.insert(pendingRefunds).values({ matchId: m.match.id, userId: leaver.id, amountCents: 1200 });
    // gezahlt sind jetzt nur noch 9 x 1200 = 10800 < 12000
    expect(await walletBalance(db, leaver.id)).toBe(3000 - 1200);
    expect(await pendingOf(m.match.id)).toHaveLength(1);
    const fresh = await reloadMatch(m.match.id);
    const due = new Date(rentCheckAt(fresh.startsAt, fresh.createdAt).getTime() + 60_000);
    await cancelUncoveredPrivateGames(due);
    expect((await reloadMatch(m.match.id)).status).toBe("cancelled");
    for (const p of players) expect(await walletBalance(db, p.id)).toBe(3000); // alle, auch der Aussteiger
    expect(await pendingOf(m.match.id)).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
    await cancelUncoveredPrivateGames(due); // zweiter Lauf: nichts doppelt
    for (const p of players) expect(await walletBalance(db, p.id)).toBe(3000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Alarm 'Nicht abgerechnet' bleibt sichtbar: bestaetigtes Altspiel, Anstoss vorbei, bezahlte Plaetze: settleDueMatches rechnet nicht ab, getAlerts meldet unsettled", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 3000);
    await seedPaid(m.match.id, m.adminA.id, 1000);
    await db.update(matches).set({ status: "confirmed", startsAt: new Date(Date.now() - 3_600_000), createdAt: new Date(Date.now() - 100 * 3_600_000) }).where(eq(matches.id, m.match.id));
    await settleDueMatches(); // kein globaler Zaehler (Reste fremder Tests): geprueft wird nur dieses Spiel
    expect((await reloadMatch(m.match.id)).settledAt).toBeNull();
    expect((await getAlerts()).some((a) => a.code === `unsettled:${m.match.id}`)).toBe(true);
  });

  it("neue Spiele sind standardmaessig keine Altspiele (legacy_share_model = false)", async () => {
    const m = await makeMatch({});
    expect(m.match.legacyShareModel).toBe(false);
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

describe("Gegenprobe: neues Modell ist nicht stillgelegt, aber in der Pause gibt es keinen Guthaben-Weg", () => {
  it("ein Spiel ohne legacy_share_model: bei Zahlungen AN + Karte AUS (Pause) wird payShare abgewiesen (\"pausiert\"), nichts gebucht, paid_cents 0, Guthaben unveraendert", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 3000);
    const before = await walletBalance(db, m.adminA.id);
    await expect(payShare(m.adminA.id, m.match.id)).rejects.toThrow(/pausiert/);
    expect((await seatOf(m.match.id, m.adminA.id)).paidCents).toBe(0);
    expect(await walletBalance(db, m.adminA.id)).toBe(before);
  });

  it("Guthaben im Platz (paid_cents > 0, Altmodell): payShare geht in der Pause weiter (alter Pfad, wie der Frist-Job), sonst koennte der Zweite weder zahlen noch wuerde die Absage verhindert", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await seedShare(m.adminB.id, m.match.id, 800); // ein Platz mit Guthaben
    await fund(m.adminA.id, 3000);
    await payShare(m.adminA.id, m.match.id);
    expect((await seatOf(m.match.id, m.adminA.id)).paidCents).toBeGreaterThan(0);
  });
});
