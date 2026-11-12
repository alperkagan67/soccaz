import { describe, expect, it } from "vitest";
import { disputeRank, isDisputeOpen, parseDispute } from "@/server/payments/dispute-parse";

describe("Streit-Status", () => {
  it("Rang: Endstatus hoechster Rang, Unbekanntes 0", () => {
    expect(disputeRank("needs_response")).toBe(1);
    expect(disputeRank("warning_under_review")).toBe(2);
    expect(["won", "lost", "warning_closed", "prevented"].map(disputeRank)).toEqual([3, 3, 3, 3]);
    expect(disputeRank("irgendwas_neues")).toBe(0);
  });
  it("offen = needs_response, under_review, warning_*; Unbekanntes gilt als offen (Erstattung bleibt gesperrt), Endstatus nicht", () => {
    for (const s of ["needs_response", "under_review", "warning_needs_response", "warning_under_review", "irgendwas_neues"]) expect(isDisputeOpen(s), s).toBe(true);
    for (const s of ["won", "lost", "warning_closed", "prevented"]) expect(isDisputeOpen(s), s).toBe(false);
  });
});

describe("parseDispute: ungepruefte Eingabe", () => {
  it("liest Streit, Balance-Transactions und Kategorien; nur Codes, keine Freitexte", () => {
    const d = parseDispute({ id: "dp_abc123", amount: 800, currency: "EUR", payment_intent: "pi_x1", charge: "ch_x1", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_800_000_000 }, balance_transactions: [{ id: "txn_1", amount: -800, fee: 1500, currency: "EUR", reporting_category: "dispute" }] });
    expect(d).toMatchObject({ disputeId: "dp_abc123", paymentIntentId: "pi_x1", chargeId: "ch_x1", amountCents: 800, currency: "eur", reason: "fraudulent", status: "needs_response" });
    expect(d!.evidenceDueBy!.getTime()).toBe(1_800_000_000_000);
    expect(d!.balanceTransactions).toEqual([{ id: "txn_1", amountCents: -800, feeCents: 1500, currency: "eur", category: "dispute" }]);
  });
  it("ohne brauchbare Streit-ID null; fehlende Liste = null (Abruf noetig), leere Liste = []", () => {
    expect(parseDispute({ id: "pi_falsch" })).toBeNull();
    expect(parseDispute({})).toBeNull();
    expect(parseDispute({ id: "dp_ok1" })!.balanceTransactions).toBeNull();
    expect(parseDispute({ id: "dp_ok1", balance_transactions: [] })!.balanceTransactions).toEqual([]);
  });
  it("kaputte Eintraege werden uebersprungen, Betraege nur als ganze Zahlen, expandierte Objekte werden gelesen", () => {
    const d = parseDispute({ id: "dp_ok2", payment_intent: { id: "pi_obj" }, balance_transactions: [null, { id: "bad" }, { id: "txn_2", amount: 12.5 }, { id: "txn_3", amount: -5, fee: -3, currency: "eur", type: "adjustment" }] })!;
    expect(d.paymentIntentId).toBe("pi_obj");
    expect(d.balanceTransactions).toEqual([{ id: "txn_3", amountCents: -5, feeCents: -3, currency: "eur", category: "adjustment" }]);
  });
  it("Status und Grund nur als sichere Codes", () => {
    const d = parseDispute({ id: "dp_ok3", status: "<script>", reason: "a b" })!;
    expect(d.status).toBe("unknown");
    expect(d.reason).toBe("unknown");
  });
});
