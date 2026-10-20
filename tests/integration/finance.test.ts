import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { creditWallet, walletBalance } from "@/server/ledger";
import { payShare, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { recordExpense } from "@/server/booking";
import { exportLedgerCsv, getAlerts, listMatchFinance, manualRefund, matchEntries, monthPeriod, overview, playerFinance } from "@/server/finance";
import { settleMatch } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, reloadMatch } from "./helpers";

let base: Awaited<ReturnType<typeof overview>>;
const wide = { from: new Date("2020-01-01"), to: new Date("2100-01-01") };
const key = () => `f-${Math.random().toString(36).slice(2)}`;
const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: key() });

async function settledMatch(priceCents: number) {
  const m = await makeMatch({ priceCents, costCents: priceCents });
  const players = [m.adminA, m.adminB];
  for (let i = 0; i < 4; i++) players.push(await addPlayer(m.match.id, m.home.id), await addPlayer(m.match.id, m.away.id));
  for (const p of players) {
    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
  }
  await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)));
  return { ...m, players };
}

beforeAll(async () => {
  await cleanup(); // sauberer Stand: keine Testdaten aus früheren Läufen
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "min_paid_players", 8);
  base = await overview(wide); // echte Entwicklungsdaten (z. B. eine Test-Aufladung) bleiben unberührt und zählen nicht mit
});
afterAll(cleanup);

describe("Finanz-Reporting", () => {
  let a: Awaited<ReturnType<typeof settledMatch>>;

  it("Spiel mit 10 Zahlern: Einnahmen gleich Hallenpreis, mit Hallenkosten Marge 0", async () => {
    a = await settledMatch(8000);
    await recordExpense(a.adminA.id, { matchId: a.match.id, kind: "venue", amountCents: 8000, note: "Hallenmiete" });

    const o = await overview(wide);
    expect(o.revenueCents - base.revenueCents).toBe(8000);
    expect(o.venueCostCents - base.venueCostCents).toBe(8000);
    expect(o.marginCents - base.marginCents).toBe(0);
    expect(o.topupsCents - base.topupsCents).toBe(20_000);
    expect(o.refundsCents - base.refundsCents).toBe(2000); // 10 x 2,00 EUR Abrechnungsdifferenz
    expect(o.liabilityCents - base.liabilityCents).toBe(12_000); // 10 x 12,00 EUR Restguthaben
    expect(o.feesCents).toBe(0);
    expect(o.promoCents).toBe(0);
  });

  it("Spieleliste zeigt Zahler, Einnahmen, Kosten und Marge", async () => {
    const rows = (await listMatchFinance(wide)).filter((x) => x.id === a.match.id); // echte Entwicklungsdaten zählen nicht mit
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: a.match.id, payers: 10, revenueCents: 8000, costCents: 8000, marginCents: 0, finalShareCents: 800, priceCents: 8000 });
  });

  it("je Spieler: bezahlt, zurück, netto", async () => {
    const players = await playerFinance(a.match.id);
    expect(players).toHaveLength(10);
    for (const p of players) {
      expect(p.paidCents).toBe(1000);
      expect(p.refundedCents).toBe(200);
      expect(p.netCents).toBe(800);
      expect(p.pendingRefundCents).toBe(0);
      expect(p.hasPaidNow).toBe(true);
    }
    const entries = await matchEntries(a.match.id);
    expect(entries.filter((e) => e.kind === "match_share")).toHaveLength(10);
    expect(entries.filter((e) => e.kind === "refund")).toHaveLength(10);
    expect(entries.filter((e) => e.kind === "venue_cost")).toHaveLength(1);
  });

  it("Ausnahme-Erstattung höchstens bis zum netto bezahlten Betrag", async () => {
    const p = a.players[2];
    const before = await walletBalance(db, p.id);
    await expect(manualRefund(a.adminA.id, a.match.id, p.id, 801, "zu viel")).rejects.toThrow(/höchstens 8,00/);
    await expect(manualRefund(a.adminA.id, a.match.id, p.id, 100, "x")).rejects.toThrow(/Grund/);
    await manualRefund(a.adminA.id, a.match.id, p.id, 800, "Verletzung vor dem Spiel");
    expect(await walletBalance(db, p.id)).toBe(before + 800);
    await expect(manualRefund(a.adminA.id, a.match.id, p.id, 1, "nochmal")).rejects.toThrow(/höchstens 0,00/);
    const pf = (await playerFinance(a.match.id)).find((x) => x.userId === p.id)!;
    expect(pf.netCents).toBe(0);
  });

  it("Verlustspiel löst einen Alarm aus (Hallenkosten höher als Einnahmen)", async () => {
    const b = await settledMatch(8000);
    await recordExpense(b.adminA.id, { matchId: b.match.id, kind: "venue", amountCents: 10_000, note: "Teurere Halle" });
    await db.update(matches).set({ status: "played", startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, b.match.id));
    const alerts = await getAlerts();
    const loss = alerts.find((x) => x.code === `loss:${b.match.id}`);
    expect(loss?.title).toMatch(/Verlustspiel/);
    expect(loss?.detail).toContain("-20,00");
    expect(alerts.some((x) => x.code === "unbalanced")).toBe(false);
  });

  it("Alarm: negatives Guthaben und nicht abgerechnetes Spiel", async () => {
    // Spiel hat begonnen, ist bestätigt, hat Zahler, aber keine Abrechnung
    const c = await makeMatch();
    const p = c.adminA;
    await fund(p.id, 2000);
    await payShare(p.id, c.match.id);
    await setReady(p.id, c.match.id, true);
    await db.update(matches).set({ status: "confirmed", startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, c.match.id));
    const alerts = await getAlerts();
    expect(alerts.some((x) => x.code === `unsettled:${c.match.id}`)).toBe(true);
  });

  it("CSV-Export mit Kopfzeile, Dezimalkomma und Excel-tauglichem BOM", async () => {
    const csv = await exportLedgerCsv(wide);
    expect(csv.startsWith("﻿Datum;Buchungs-ID;Art;Soll;Haben;Betrag EUR;Spiel;Zahlungs-ID;Nutzer;Grund")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBeGreaterThan(20);
    expect(csv).toMatch(/;10,00;/);
    expect(csv).toContain("venue_cost");
  });

  it("Monatsparser", () => {
    expect(monthPeriod("2026-11")).toEqual({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") });
    expect(monthPeriod("2026-12")?.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthPeriod("2026-13")).toBeNull();
    expect(monthPeriod("abc")).toBeNull();
  });
});
