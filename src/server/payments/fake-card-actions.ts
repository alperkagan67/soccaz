"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles } from "@/db/schema";
import { requireUser } from "../session";
import { DomainError } from "../teams";
import { assertNoFakeInProduction, getPaymentProvider } from "./provider";
import { cardModeActive } from "../wallet";
import { fakeCardAllowed } from "./mode";
import { fakeAuthorizeCore, fakeAuthorizeTournamentCore } from "./fake-authorize";

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
  const r = await fakeAuthorizeCore(user.id, matchId, outcome);
  if (!r.error) revalidatePath(`/lobby/${matchId}`);
  return r;
}

/**
 * NUR TESTS und CI: Freigabe (3-D-Secure) einer TURNIER-Zeile ohne Stripe (012-Rest PR B, Backlog 143). Gleiche Sperren wie fakeAuthorizeAction; der Nutzer kommt aus der Sitzung; die Zahlung laeuft
 * als signiertes Fake-Ereignis durch handleStripeWebhook, nie direkt.
 */
export async function fakeAuthorizeTournamentAction(tournamentId: string, outcome: "ok" | "fail"): Promise<{ error?: string }> {
  assertNoFakeInProduction();
  if (!fakeCardAllowed()) return { error: "Nicht verfügbar." };
  const provider = await getPaymentProvider();
  if (provider.name !== "fake") return { error: "Nicht verfügbar." };
  const user = await requireUser("/app");
  const r = await fakeAuthorizeTournamentCore(user.id, typeof tournamentId === "string" ? tournamentId : "", outcome);
  if (!r.error) revalidatePath(`/turniere/${tournamentId}`);
  return r;
}

/**
 * NUR TESTS und CI (Turnier, 012 M5-3): hinterlegt dem eigenen Konto eine Testkarte (Profil mit Zahlungsmittel), ohne Stripe. Der Kartenstatus im Turnier ist der Stand des Profils.
 * Gleiche Sperren wie fakeCardReadyAction (PAYMENTS_FAKE=1, nie Produktion, Anbieter muss der FakeProvider sein).
 */
export async function fakeTournamentCardAction(): Promise<{ error?: string }> {
  assertNoFakeInProduction();
  if (!fakeCardAllowed()) return { error: "Nicht verfügbar." };
  const provider = await getPaymentProvider();
  if (provider.name !== "fake") return { error: "Nicht verfügbar." };
  const user = await requireUser("/app");
  await db
    .insert(paymentProfiles)
    .values({ userId: user.id, stripeCustomerId: `cus_fake_${user.id}`, paymentMethodId: `pm_fake_${user.id}`, cardBrand: "visa", cardLast4: "4242", mandateText: "fake", mandateAcceptedAt: new Date() })
    .onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: `pm_fake_${user.id}`, cardBrand: "visa", cardLast4: "4242", updatedAt: new Date() } });
  return {};
}
