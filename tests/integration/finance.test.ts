import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { setSetting } from "@/server/settings";
import { recordExpense } from "@/server/booking";
import { exportLedgerCsv, getAlerts, listMatchFinance, matchEntries, monthPeriod, overview, playerFinance } from "@/server/finance";
import { cardGame, chargeGame, cleanup, useCardMode } from "./helpers";

// 012 M6b (Kartenfixture): Das Finanz-Reporting wird mit Kartenspielen geprüft (Karte, Fake-Abbuchung), nicht mehr mit Guthaben (fund/payShare/settleMatch).
// Gegenstücke zu den gestrichenen Guthaben-Aussagen: "Ausnahme-Erstattung höchstens bis zum netto bezahlten Betrag" -> finance-manual-refund.test.ts ("Teilbeträge sind nicht möglich",
// "erstattet die ganze Abbuchung"; Grund-Pflicht dort mit Grund-Text); Aufladungen/Restguthaben (topups, liability) gibt es im Kartenpfad nicht: unten als 0 festgehalten.
let base: Awaited<ReturnType<typeof overview>>;
let mode: Awaited<ReturnType<typeof useCardMode>>;
const wide = { from: new Date("2020-01-01"), to: new Date("2100-01-01") };

/** Kartenspiel mit 10 Spielern, Abbuchung durch (Anteil = Preis ÷ 10), abgerechnet bei der Abbuchung. */
async function settledMatch(priceCents: number) {
  const m = await cardGame({ n: 10, price: priceCents });
  await chargeGame(m);
  return { ...m, players: m.all };
}

beforeAll(async () => {
  await cleanup(); // sauberer Stand: keine Testdaten aus früheren Läufen
  await setSetting(null, "min_paid_players", 8);
  base = await overview(wide); // echte Entwicklungsdaten (z. B. eine Test-Aufladung) bleiben unberührt und zählen nicht mit
});
// Schalter pro Test (Regel 23)
beforeEach(async () => {
  mode = await useCardMode();
});
afterEach(async () => {
  await mode.restore();
});
afterAll(cleanup);

describe("Finanz-Reporting", () => {
  let a: Awaited<ReturnType<typeof settledMatch>>;

  it("Kartenspiel mit 10 Zahlern: Einnahmen gleich Hallenpreis, mit Hallenkosten Marge 0", async () => {
    a = await settledMatch(8000);
    await recordExpense(a.adminA.id, { matchId: a.match.id, kind: "venue", amountCents: 8000, note: "Hallenmiete" });

    const o = await overview(wide);
    expect(o.revenueCents - base.revenueCents).toBe(8000);
    expect(o.venueCostCents - base.venueCostCents).toBe(8000);
    expect(o.marginCents - base.marginCents).toBe(0);
    expect(o.topupsCents - base.topupsCents).toBe(0); // Kartenpfad: keine Aufladung
    expect(o.refundsCents - base.refundsCents).toBe(0); // keine Abrechnungsdifferenz, der Anteil wird genau abgebucht
    expect(o.liabilityCents - base.liabilityCents).toBe(0); // kein Restguthaben
    expect(o.feesCents).toBe(0);
    expect(o.promoCents).toBe(0);
  });

  it("Spieleliste zeigt Zahler, Einnahmen, Kosten und Marge", async () => {
    const rows = (await listMatchFinance(wide)).filter((x) => x.id === a.match.id); // echte Entwicklungsdaten zählen nicht mit
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: a.match.id, payers: 10, revenueCents: 8000, costCents: 8000, marginCents: 0, finalShareCents: 800, priceCents: 8000 });
  });

  it("je Spieler: abgebucht, zurück, netto", async () => {
    const players = await playerFinance(a.match.id);
    expect(players).toHaveLength(10);
    for (const p of players) {
      expect(p.paidCents).toBe(800);
      expect(p.refundedCents).toBe(0);
      expect(p.netCents).toBe(800);
      expect(p.pendingRefundCents).toBe(0);
      expect(p.hasPaidNow).toBe(true);
    }
    const entries = await matchEntries(a.match.id);
    expect(entries.filter((e) => e.kind === "match_share")).toHaveLength(10);
    expect(entries.filter((e) => e.kind === "refund")).toHaveLength(0);
    expect(entries.filter((e) => e.kind === "venue_cost")).toHaveLength(1);
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

  it("CSV-Export mit Kopfzeile, Dezimalkomma und Excel-tauglichem BOM", async () => {
    const csv = await exportLedgerCsv(wide);
    expect(csv.startsWith("﻿Datum;Buchungs-ID;Art;Soll;Haben;Betrag EUR;Spiel;Zahlungs-ID;Nutzer;Grund")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines.length).toBeGreaterThan(20);
    expect(csv).toMatch(/;8,00;/);
    expect(csv).toContain("venue_cost");
  });

  it("Monatsparser", () => {
    expect(monthPeriod("2026-11")).toEqual({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") });
    expect(monthPeriod("2026-12")?.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthPeriod("2026-13")).toBeNull();
    expect(monthPeriod("abc")).toBeNull();
  });
});
