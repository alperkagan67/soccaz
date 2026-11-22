import { describe, expect, it } from "vitest";
import { cardAlertsFrom } from "@/server/finance";

// Review PR #107 (Betrieb, mittel): die Alarmliste der Kartenzahlungen muss auf der Finanzseite ankommen.
const empty = { failedRefunds: [], unknownRefunds: [], stuckCancels: [], unclearedCharges: [], idempotencyMismatches: [], legacyFailed: [], duplicateSuccesses: [] };

describe("cardAlertsFrom", () => {
  it("ohne Auffaelligkeiten kein Alarm", () => {
    expect(cardAlertsFrom(empty)).toEqual([]);
  });
  it("jede Art wird zu genau einem Alarm mit eigenem Code und Anzahl; nur Zaehler, keine IDs oder Personendaten", () => {
    const row = { id: "x", matchId: "m", code: "c", amountCents: 100, since: new Date(), at: new Date() };
    const ra = { failedRefunds: [row], unknownRefunds: [row, row], stuckCancels: [row], unclearedCharges: [row], idempotencyMismatches: [row], legacyFailed: [row], duplicateSuccesses: [row, row, row] };
    const out = cardAlertsFrom(ra as never);
    expect(out.map((a) => a.code).sort()).toEqual(["card:duplicate-success", "card:failed-refunds", "card:idempotency-mismatch", "card:legacy-failed", "card:stuck-cancels", "card:uncleared-charges", "card:unknown-refunds"]);
    expect(out.find((a) => a.code === "card:duplicate-success")!.title).toContain("(3)");
    expect(out.every((a) => a.severity === "high")).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/"x"|"m"/);
  });
  it("nur die vorhandene Art erscheint", () => {
    const out = cardAlertsFrom({ ...empty, duplicateSuccesses: [{ matchId: "m", at: new Date() }] } as never);
    expect(out.map((a) => a.code)).toEqual(["card:duplicate-success"]);
  });
});
