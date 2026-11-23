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
  const m = await makeMatch({ priceCents, costCents: priceCents }); // neues Guthabenmodell (Altspiele sind stillgelegt, 1c-ii a-1)
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
  beforeAll(async () => {
    a = await settledMatch(8000);
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

  it("Monatsparser", () => {
    expect(monthPeriod("2026-11")).toEqual({ from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") });
    expect(monthPeriod("2026-12")?.to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthPeriod("2026-13")).toBeNull();
    expect(monthPeriod("abc")).toBeNull();
  });
});
