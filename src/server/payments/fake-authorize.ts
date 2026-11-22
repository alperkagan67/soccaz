// Fake-Freigabe (nur Tests/CI, PAYMENTS_FAKE): eigene Datei ohne Sitzung/Next-Importe, damit der Kern in Integrationstests aufrufbar ist. Die Sperren (assertNoFakeInProduction,
// fakeCardAllowed, Anbieter = fake) liegen in der Server-Aktion fakeAuthorizeAction; der Kern prueft zusaetzlich, dass der aktive Anbieter der Fake ist.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles } from "@/db/schema";
import type { FakeProvider } from "./fake";
import { getPaymentProvider } from "./provider";
import { handleStripeWebhook } from "./webhook";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kern der Fake-Freigabe (ohne Sitzung, testbar): nur fuer die eigene Zeile des Nutzers im Zustand requires_action; die Zahlung geht ueber handleStripeWebhook. */
export async function fakeAuthorizeCore(userId: string, matchId: string, outcome: "ok" | "fail"): Promise<{ error?: string }> {
  const provider = await getPaymentProvider();
  if (provider.name !== "fake") return { error: "Nicht verfügbar." };
  const NONE = "Für diese Zahlung ist gerade keine Freigabe möglich.";
  if (typeof matchId !== "string" || !UUID.test(matchId)) return { error: NONE };
  const [row] = await db
    .select({ payer: paymentCharges.payerUserId, owner: paymentCharges.userId, pi: paymentCharges.paymentIntentId, amount: paymentCharges.amountCents, status: paymentCharges.status, code: paymentCharges.failureCode })
    .from(paymentCharges)
    .where(and(eq(paymentCharges.matchId, matchId), sql`coalesce(${paymentCharges.payerUserId}, ${paymentCharges.userId}) = ${userId}`, eq(paymentCharges.status, "requires_action")));
  const [profile] = await db.select({ customer: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  if (!row || row.status !== "requires_action" || row.code !== "authentication_required" || !row.pi || !profile) return { error: NONE };
  const object = { id: row.pi, amount: row.amount, currency: "eur", customer: profile.customer, metadata: { matchId, userId: row.owner }, ...(outcome === "fail" ? { last_payment_error: { code: "payment_intent_authentication_failure" } } : {}) };
  const e = (provider as unknown as FakeProvider).signEvent({ id: `evt_fakeauth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, type: outcome === "ok" ? "payment_intent.succeeded" : "payment_intent.payment_failed", object });
  await handleStripeWebhook(e.rawBody, e.signature); // der echte Weg: Signaturpruefung, applyChargeInTx
  return {};
}
