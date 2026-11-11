"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { requireUser } from "../session";
import { DomainError } from "../teams";
import { assertNoFakeInProduction, getPaymentProvider } from "./provider";
import { fakeCardAllowed, isCardPaymentsEnabled } from "./mode";

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
    if (!(await isCardPaymentsEnabled())) throw new DomainError("Nicht verfügbar.");
    if (typeof matchId !== "string" || !UUID.test(matchId)) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
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
