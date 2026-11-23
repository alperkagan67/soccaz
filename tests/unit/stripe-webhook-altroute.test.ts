import { beforeEach, describe, expect, it, vi } from "vitest";
import { signStripePayload } from "@/lib/stripe-signature";

// 012 M6b: Der alte Aufladungs-Webhook verbucht nichts mehr, schreibt aber bei einem BEZAHLTEN Checkout-Ereignis einen Protokolleintrag ohne Personendaten.
const auditMock = vi.fn(async () => undefined);
vi.mock("@/server/audit", () => ({ audit: (...args: unknown[]) => (auditMock as unknown as (...a: unknown[]) => Promise<void>)(...args) }));

const secret = "whsec_test_altroute";
const now = () => Math.floor(Date.now() / 1000);
const post = async (body: string, header: string | null) => {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  return POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: header ? { "stripe-signature": header } : {} }));
};
const signed = (body: string) => signStripePayload(body, secret, now());

describe("alter Stripe-Webhook (Aufladung entfernt)", () => {
  beforeEach(() => {
    auditMock.mockClear();
    process.env.STRIPE_WEBHOOK_SECRET = secret;
  });

  it("ohne Geheimnis: 503", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await post("{}", null)).status).toBe(503);
  });
  it("ungültige Signatur: 400, kein Eintrag", async () => {
    const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { payment_status: "paid" } } });
    expect((await post(body, "t=1,v1=abc")).status).toBe(400);
    expect(auditMock).not.toHaveBeenCalled();
  });
  it("gültig, anderes Ereignis: 200, kein Eintrag", async () => {
    const body = JSON.stringify({ id: "evt_2", type: "customer.created", data: { object: {} } });
    const r = await post(body, signed(body));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ received: true });
    expect(auditMock).not.toHaveBeenCalled();
  });
  it("bezahltes Checkout-Ereignis: 200 und Protokolleintrag mit Ereignis-ID, Betrag, ohne Personendaten", async () => {
    const body = JSON.stringify({ id: "evt_3", type: "checkout.session.completed", data: { object: { id: "cs_1", amount_total: 2500, currency: "eur", payment_status: "paid", customer_email: "x@y.de", client_reference_id: "u1" } } });
    expect((await post(body, signed(body))).status).toBe(200);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const call = JSON.stringify(auditMock.mock.calls[0]);
    expect(call).toContain("evt_3");
    expect(call).toContain("2500");
    expect(call).not.toMatch(/x@y\.de|u1/);
  });
  it("Checkout noch nicht bezahlt (SEPA offen): kein Eintrag; verzögert bezahlt: Eintrag", async () => {
    const open = JSON.stringify({ id: "evt_4", type: "checkout.session.completed", data: { object: { payment_status: "unpaid" } } });
    await post(open, signed(open));
    expect(auditMock).not.toHaveBeenCalled();
    const later = JSON.stringify({ id: "evt_5", type: "checkout.session.async_payment_succeeded", data: { object: { amount_total: 1000, currency: "eur" } } });
    await post(later, signed(later));
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
  it("kaputtes JSON mit gültiger Signatur: 400, kein Eintrag", async () => {
    const body = "{kein json";
    expect((await post(body, signed(body))).status).toBe(400);
    expect(auditMock).not.toHaveBeenCalled();
  });
  it("Protokollschreiben schlägt fehl: 500 (Stripe wiederholt die Zustellung), nicht still 200", async () => {
    auditMock.mockRejectedValueOnce(new Error("db weg"));
    const body = JSON.stringify({ id: "evt_6", type: "checkout.session.completed", data: { object: { amount_total: 500, currency: "eur", payment_status: "paid" } } });
    await expect(post(body, signed(body))).rejects.toThrow("db weg");
  });
});
