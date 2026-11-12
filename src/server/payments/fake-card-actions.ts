"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles } from "@/db/schema";
import { requireUser } from "../session";
import { DomainError } from "../teams";
import { assertNoFakeInProduction, getPaymentProvider } from "./provider";
import { cardModeActive } from "../wallet";
import { fakeCardAllowed } from "./mode";
import type { FakeProvider } from "./fake";
import { handleStripeWebhook } from "./webhook";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * NUR TESTS und CI: setzt den eigenen Platz direkt auf card_ready, ohne Stripe. Mehrfach abgesichert: PAYMENTS_FAKE=1 (in Produktion ein harter Fehler),
 * nicht Produktion und der aktive Anbieter muss der FakeProvider sein (ist ein Stripe-Schlüssel gesetzt, ist er Stripe und dieser Pfad ist gesperrt).
 */
export async function fakeCardReadyAction(matchId: string): Promise<{ error?: string }> {
  assertNoFakeInProduction();
  if (!fakeCardAllowed()) return { error: "Nicht verfügbar." };
  const provider = await getPaymentProvider();
  if (provider.name !== "fake") return { error: "Nicht verfügbar." };
  const user = await requireUser("/app");
  try {
    if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
    // Nur in einem Spiel, für das das Kartenmodell gilt (Schalter EIN, Frist-Regel-Spiel, keine bezahlten Plätze), sonst Guthaben-Modell
    const [m] = await db.select({ id: matches.id, kind: matches.kind, legacyShareModel: matches.legacyShareModel }).from(matches).where(eq(matches.id, matchId));
    if (!m || !(await cardModeActive(db, m))) throw new DomainError("Nicht verfügbar.");
    const open = db.select({ id: matches.id }).from(matches).where(and(eq(matches.id, matchId), inArray(matches.status, ["lobby", "confirmed"])));
    const updated = await db
      .update(matchParticipants)
      .set({ cardStatus: "card_ready" })
      .where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, user.id), inArray(matchParticipants.matchId, open)))
      .returning({ userId: matchParticipants.userId });
    if (updated.length === 0) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
    revalidatePath(`/lobby/${matchId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

/**
 * NUR TESTS und CI: simuliert die Freigabe bei der Bank (3-D-Secure), OHNE Stripe. Die Zahlung wird dabei NICHT direkt gesetzt: es wird ein signiertes Fake-Ereignis
 * (payment_intent.succeeded bzw. payment_failed) erzeugt und durch handleStripeWebhook geschickt, also derselbe Weg wie in Produktion. Gleiche Sperren wie fakeCardReadyAction.
 */
export async function fakeAuthorizeAction(matchId: string, outcome: "ok" | "fail"): Promise<{ error?: string }> {
  assertNoFakeInProduction();
  if (!fakeCardAllowed()) return { error: "Nicht verfügbar." };
  const provider = await getPaymentProvider();
  if (provider.name !== "fake") return { error: "Nicht verfügbar." };
  const user = await requireUser("/app");
  try {
    if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError("Für diese Zahlung ist gerade keine Freigabe möglich.");
    const [row] = await db
      .select({ pi: paymentCharges.paymentIntentId, amount: paymentCharges.amountCents, status: paymentCharges.status, code: paymentCharges.failureCode })
      .from(paymentCharges)
      .where(and(eq(paymentCharges.matchId, matchId), eq(paymentCharges.userId, user.id)));
    const [profile] = await db.select({ customer: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, user.id));
    if (!row || row.status !== "requires_action" || row.code !== "authentication_required" || !row.pi || !profile) throw new DomainError("Für diese Zahlung ist gerade keine Freigabe möglich.");
    const object = { id: row.pi, amount: row.amount, currency: "eur", customer: profile.customer, metadata: { matchId, userId: user.id }, ...(outcome === "fail" ? { last_payment_error: { code: "payment_intent_authentication_failure" } } : {}) };
    const e = (provider as unknown as FakeProvider).signEvent({ id: `evt_fakeauth_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, type: outcome === "ok" ? "payment_intent.succeeded" : "payment_intent.payment_failed", object });
    await handleStripeWebhook(e.rawBody, e.signature); // der echte Weg: Signaturpruefung, applyChargeInTx
    revalidatePath(`/lobby/${matchId}`);
    return {};
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}
