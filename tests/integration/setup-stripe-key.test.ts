import { describe, expect, it } from "vitest";
import { getPaymentProvider } from "@/server/payments/provider";

// Backlog 65: Ein STRIPE_SECRET_KEY aus .env.local oder der Shell darf die Integrationstests nie auf den Stripe-Anbieter umstellen
// (sonst Gebühren-Buchung ohne Nutzer und Aufräumen scheitert am Fremdschlüssel ledger_entries.payment_id). setup.ts entfernt ihn.
describe("Integrationstests: kein Stripe-Schlüssel", () => {
  it("STRIPE_SECRET_KEY ist nicht gesetzt, der Anbieter ist der FakeProvider", async () => {
    expect(process.env.STRIPE_SECRET_KEY).toBeUndefined();
    expect((await getPaymentProvider()).constructor.name).toBe("FakeProvider");
  });
});
