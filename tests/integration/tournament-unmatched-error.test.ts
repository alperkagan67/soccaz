import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, stripeEvents } from "@/db/schema";
import { cardAlertsFrom, getRefundAlerts } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { cleanup } from "./helpers";

// 012 M5-7a (Security-Review): ein SQL-Fehler in der Mitteilung darf den Webhook nicht kippen (Savepoint). notifyUsers wirft hier einen echten SQL-Fehler in DERSELBEN Transaktion.
vi.mock("@/server/notifications", async (orig) => {
  const real = await orig<typeof import("@/server/notifications")>();
  return { ...real, notifyUsers: async (_ids: string[], _payload: unknown, exec: { execute: (q: unknown) => Promise<unknown> }) => { await exec.execute(sql`select 1 / 0`); } };
});

let provider: FakeProvider;
beforeAll(() => db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_m57e_%")));
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_m57e_%"));
  await cleanup();
});

describe("M5-7a: Mitteilung bei Zahlung ohne Zuordnung scheitert (SQL-Fehler)", () => {
  it("Webhook antwortet 200, der Marker bleibt, der Alarm in der Liste steht", async () => {
    const pi = `pi_m57e_${Date.now().toString(36)}`;
    const e = provider.signEvent({ id: `evt_m57e_${Date.now().toString(36)}`, type: "payment_intent.succeeded", object: { id: pi, amount: 1500, currency: "eur", customer: "cus_x", metadata: {} } });
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    const marker = await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.unmatched_success"), eq(auditLog.entityId, pi)));
    expect(marker).toHaveLength(1);
    expect(cardAlertsFrom(await getRefundAlerts(new Date())).some((a) => a.code === "card:unmatched-success")).toBe(true);
  });
});
