import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Backlog 192: deterministische Quelltext-Pins (Berechtigung Admin 1, Abschreiben bewegt kein Geld, keine Migration).
const read = (rel: string) => fs.readFileSync(path.resolve(import.meta.dirname, "../..", rel), "utf8");
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  expect(a).toBeGreaterThanOrEqual(0);
  return src.slice(a, b === -1 ? undefined : b);
};

describe("Neuversuch und Abschreiben: Quelltext", () => {
  it("beide Server-Aktionen verlangen serverseitig die Berechtigung finance (Admin 1)", () => {
    const src = read("src/server/admin-finance-actions.ts");
    const retry = between(src, "export async function retryRefundAction", "export async function writeOffRefundAction");
    const writeOff = between(src, "export async function writeOffRefundAction", "// --- Buchungen und Hallen");
    for (const body of [retry, writeOff]) expect(body).toContain('guarded("finance"');
    expect(retry).toContain("retryFailedRefund(actor,");
    expect(writeOff).toContain("writeOffFailedRefund(actor,");
  });

  it("die Funktionen pruefen Admin 1 selbst (canUser finance = Admin 1), vor jeder Aenderung", () => {
    const src = read("src/server/payments/refund.ts");
    expect(src).toContain('if (!canUser(actor, "finance")) throw');
    expect(between(src, "export async function retryFailedRefund", "export async function writeOffFailedRefund")).toMatch(/await requireOwner\(actorId\);\s*const matchId = await db\.transaction/);
    expect(between(src, "export async function writeOffFailedRefund", "export async function listFailedRefundsOfMatch")).toMatch(/await requireOwner\(actorId\);\s*const matchId = await db\.transaction/);
  });

  it("Abschreiben bewegt kein Geld: kein Stripe-Aufruf, keine Hauptbuchbuchung, kein neuer Status", () => {
    const body = between(read("src/server/payments/refund.ts"), "export async function writeOffFailedRefund", "export async function listFailedRefundsOfMatch");
    expect(body).not.toMatch(/createRefund|sendPendingRefunds|post\(|creditWallet/);
    expect(body).toContain("REFUND_WRITTEN_OFF");
  });

  it("der Neuversuch nutzt dieselbe Zeile und denselben Schluessel (kein Insert, kein neuer idempotency_key)", () => {
    const body = between(read("src/server/payments/refund.ts"), "export async function retryFailedRefund", "export async function writeOffFailedRefund");
    expect(body).not.toMatch(/\.insert\(|idempotencyKey/);
    expect(body).toContain('eq(paymentRefunds.status, "failed")');
  });

  it("keine Migration und kein Schema-Eingriff in diesem Stand: der Statuscheck kennt weiter genau vier Werte", () => {
    expect(read("src/db/schema.ts")).toContain("`${t.status} in ('pending', 'succeeded', 'failed', 'cancelled_dispute')`");
  });
});
