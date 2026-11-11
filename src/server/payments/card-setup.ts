import { randomUUID } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, paymentSetupIntents, users } from "@/db/schema";
import { DomainError } from "../teams";
import { getPaymentProvider } from "./provider";

/** Der Text, dem der Spieler beim Hinterlegen der Karte zustimmt (Mandat). Wird mit dem Zeitpunkt je SetupIntent gespeichert. */
export const MANDATE_TEXT =
  "Ich erlaube Soccaz, meine hinterlegte Karte für meinen Anteil an den Spielen, für die ich mich anmelde, zu belasten. Abgebucht wird erst, wenn der Anteil feststeht (48 Stunden vor Anstoß, bei kürzerem Vorlauf sofort). Bis dahin wird nichts abgebucht.";

/** Höchstens so viele Karten-Einrichtungen je Nutzer und Stunde (Schutz vor Missbrauch der Stripe-Schnittstelle). */
export const SETUP_LIMIT_PER_HOUR = 10;

/**
 * Startet das Hinterlegen einer Karte für den Nutzer SELBST (die Nutzer-ID kommt aus der Sitzung, nie aus der Eingabe).
 * Optional für den eigenen Platz in einem Spiel (matchId): dann wird nach Erfolg dieser Platz auf card_ready gesetzt.
 * Es wird nichts abgebucht und nichts im Hauptbuch gebucht. Liefert das clientSecret für Stripe Elements (nur an den Nutzer).
 */
export async function createCardSetup(userId: string, input: { matchId?: string; mandateAccepted: boolean }): Promise<{ setupIntentId: string; clientSecret: string }> {
  if (input.mandateAccepted !== true) throw new DomainError("Bitte stimme der Kartenzahlung zu.");

  const [user] = await db.select({ id: users.id, email: users.email, bannedAt: users.bannedAt }).from(users).where(eq(users.id, userId));
  if (!user || user.bannedAt) throw new DomainError("Nutzer nicht gefunden.");

  if (input.matchId !== undefined) {
    const [seat] = await db
      .select({ status: matches.status })
      .from(matchParticipants)
      .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
      .where(and(eq(matchParticipants.matchId, input.matchId), eq(matchParticipants.userId, userId)));
    if (!seat) throw new DomainError("Du bist in diesem Spiel nicht angemeldet.");
    if (!["lobby", "confirmed"].includes(seat.status)) throw new DomainError("Dieses Spiel ist nicht mehr offen.");
  }

  const [recent] = await db
    .select({ n: count() })
    .from(paymentSetupIntents)
    .where(and(eq(paymentSetupIntents.userId, userId), gt(paymentSetupIntents.createdAt, new Date(Date.now() - 3_600_000))));
  if (recent.n >= SETUP_LIMIT_PER_HOUR) throw new DomainError("Zu viele Versuche. Bitte warte etwas und versuche es später noch einmal.");

  const provider = await getPaymentProvider();
  let [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  if (!profile) {
    const customer = await provider.createCustomer({ userId, email: user.email, idempotencyKey: `customer:${userId}` });
    await db.insert(paymentProfiles).values({ userId, stripeCustomerId: customer.id }).onConflictDoNothing();
    [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId));
  }

  const intent = await provider.createSetupIntent({ customerId: profile.stripeCustomerId, userId, idempotencyKey: `setup:${userId}:${randomUUID()}` });
  await db.insert(paymentSetupIntents).values({ id: intent.id, userId, matchId: input.matchId ?? null, mandateText: MANDATE_TEXT, mandateAcceptedAt: new Date() });
  return { setupIntentId: intent.id, clientSecret: intent.clientSecret };
}

