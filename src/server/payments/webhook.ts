import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentProfiles, paymentSetupIntents, stripeEvents } from "@/db/schema";
import { getPaymentProvider, PaymentsUnavailableError, WebhookSignatureError, type CardDisplay, type ProviderEvent } from "./provider";

/** Größter angenommener Body (Stripe-Ereignisse sind klein). */
export const MAX_WEBHOOK_BYTES = 256 * 1024;

export type WebhookResult = { status: 200 | 400 | 413 | 503 | 500; body: string };

const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 256 ? v : null);

/**
 * Nimmt ein Stripe-Ereignis an: Signatur des rohen Bodys prüfen (Pflicht), jedes Ereignis genau einmal verarbeiten (event_id eindeutig).
 * Unbekannte Ereignisse werden angenommen und ignoriert. Es wird nie etwas aus dem Ereignis geloggt; Antworten verraten nichts.
 */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<WebhookResult> {
  if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BYTES) return { status: 413, body: "Zu groß" };
  let event: ProviderEvent;
  try {
    const provider = await getPaymentProvider();
    event = provider.constructWebhookEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof PaymentsUnavailableError) return { status: 503, body: "Nicht konfiguriert" };
    if (error instanceof WebhookSignatureError) return { status: 400, body: "Ungültige Signatur" };
    return { status: 500, body: "Fehler" };
  }
  try {
    await processEvent(event);
  } catch {
    return { status: 500, body: "Fehler" }; // Stripe wiederholt; nichts wurde festgeschrieben (eine Transaktion)
  }
  return { status: 200, body: JSON.stringify({ received: true }) };
}

async function processEvent(event: ProviderEvent) {
  // Kartendaten von Stripe holen, bevor die Transaktion beginnt (kein Netzaufruf unter Sperre). Nur für bekannte SetupIntents.
  let card: CardDisplay | null = null;
  let oldMethod: string | null = null;
  if (event.type === "setup_intent.succeeded") {
    const pmId = str(event.object.payment_method);
    const intentId = str(event.object.id);
    if (pmId && intentId) {
      const [known] = await db.select({ id: paymentSetupIntents.id }).from(paymentSetupIntents).where(eq(paymentSetupIntents.id, intentId));
      if (known) card = await (await getPaymentProvider()).retrievePaymentMethod(pmId);
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(stripeEvents).values({ eventId: event.id, type: event.type }).onConflictDoNothing();
    const [row] = await tx.select().from(stripeEvents).where(eq(stripeEvents.eventId, event.id)).for("update");
    if (row.processedAt) return; // doppelt zugestellt: schon verarbeitet

    if (event.type === "setup_intent.succeeded") {
      const intentId = str(event.object.id);
      const customer = str(event.object.customer);
      if (intentId && customer && card) {
        const [intent] = await tx.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, intentId)).for("update");
        const [profile] = intent ? await tx.select().from(paymentProfiles).where(eq(paymentProfiles.userId, intent.userId)).for("update") : [];
        // Nur wenn der SetupIntent uns gehört und zum Kunden dieses Nutzers passt
        if (intent && profile && profile.stripeCustomerId === customer && intent.status === "created") {
          if (profile.paymentMethodId && profile.paymentMethodId !== card.id) oldMethod = profile.paymentMethodId;
          await tx
            .update(paymentProfiles)
            .set({ paymentMethodId: card.id, cardBrand: card.brand, cardLast4: card.last4, mandateText: intent.mandateText, mandateAcceptedAt: intent.mandateAcceptedAt, updatedAt: new Date() })
            .where(eq(paymentProfiles.userId, intent.userId));
          await tx.update(paymentSetupIntents).set({ status: "succeeded" }).where(eq(paymentSetupIntents.id, intentId));
          if (intent.matchId) {
            await tx.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, intent.matchId), eq(matchParticipants.userId, intent.userId)));
          }
        }
      }
    } else if (event.type === "setup_intent.setup_failed") {
      const intentId = str(event.object.id);
      if (intentId) await tx.update(paymentSetupIntents).set({ status: "failed" }).where(and(eq(paymentSetupIntents.id, intentId), eq(paymentSetupIntents.status, "created")));
    }
    // alle anderen Ereignisse: angenommen und ignoriert (M2/M3 ergänzen payment_intent.* und charge.dispute.*)
    await tx.update(stripeEvents).set({ processedAt: new Date() }).where(eq(stripeEvents.eventId, event.id));
  });

  if (oldMethod) {
    try {
      await (await getPaymentProvider()).detachPaymentMethod(oldMethod); // altes Zahlungsmittel bei Stripe lösen; Fehler bleiben folgenlos
    } catch {
      /* nichts loggen */
    }
  }
}
