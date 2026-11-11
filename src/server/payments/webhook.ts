import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, paymentSetupIntents, stripeEvents } from "@/db/schema";
import { applyChargeInTx, bookChargeFee, type ChargeReport } from "./charge";
import { applyRefundInTx, finalizeCancel, type RefundReport } from "./refund";
import { getPaymentProvider, PaymentsUnavailableError, WebhookSignatureError, type CardDisplay, type ProviderEvent } from "./provider";

/** Größter angenommener Body (Stripe-Ereignisse sind klein). */
export const MAX_WEBHOOK_BYTES = 256 * 1024;

/** Nur diese Ereignistypen gehören zu diesem Endpunkt; alles andere wird angenommen, aber weder gespeichert noch verarbeitet (keine fremden Event-IDs in stripe_events). */
export const isCardEvent = (type: string) => type.startsWith("setup_intent.") || type.startsWith("payment_method.") || type.startsWith("payment_intent.") || type === "charge.updated" || type.startsWith("refund.") || type === "charge.refund.updated" || type === "charge.refunded";

/** Macht aus einem payment_intent.*-Ereignis eine ungeprüfte Meldung für applyChargeInTx; null, wenn der Typ keine Verbuchung auslöst. */
function toChargeReport(event: ProviderEvent): ChargeReport | null {
  const outcome = event.type === "payment_intent.succeeded" ? "succeeded" : event.type === "payment_intent.payment_failed" ? "failed" : event.type === "payment_intent.requires_action" ? "requires_action" : null;
  const id = str(event.object.id);
  if (!outcome || !id) return null;
  const meta = (event.object.metadata && typeof event.object.metadata === "object" ? event.object.metadata : {}) as Record<string, unknown>;
  const err = (event.object.last_payment_error && typeof event.object.last_payment_error === "object" ? event.object.last_payment_error : {}) as Record<string, unknown>;
  return {
    outcome,
    paymentIntentId: id,
    amountCents: typeof event.object.amount === "number" && Number.isInteger(event.object.amount) ? event.object.amount : null,
    currency: str(event.object.currency),
    customerId: str(event.object.customer),
    metadata: { matchId: str(meta.matchId), userId: str(meta.userId) },
    failureCode: str(err.code),
  };
}

/** Macht aus einem refund.*-Ereignis (Objekt = Refund) eine ungeprüfte Meldung für applyRefundInTx; null für alles andere (z. B. charge.refunded: nur vermerkt). */
function toRefundReport(event: ProviderEvent): RefundReport | null {
  if (!(event.type.startsWith("refund.") || event.type === "charge.refund.updated")) return null;
  const id = str(event.object.id);
  if (!id) return null;
  const status = str(event.object.status);
  const outcome = status === "succeeded" ? "succeeded" : status === "failed" || status === "canceled" ? "failed" : "pending";
  const meta = (event.object.metadata && typeof event.object.metadata === "object" ? event.object.metadata : {}) as Record<string, unknown>;
  return {
    outcome,
    refundId: id,
    amountCents: typeof event.object.amount === "number" && Number.isInteger(event.object.amount) ? event.object.amount : null,
    currency: str(event.object.currency),
    paymentIntentId: str(event.object.payment_intent),
    metadata: { matchId: str(meta.matchId), userId: str(meta.userId), chargeId: str(meta.chargeId) },
    failureCode: str(event.object.failure_reason),
  };
}

/** Liest den Body gestreamt mit Byte-Zähler und bricht bei mehr als max Bytes ab (null), auch bei chunked ohne Content-Length. */
export async function readBodyLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

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
  if (!isCardEvent(event.type)) return;
  // Kartendaten von Stripe holen, bevor die Transaktion beginnt (kein Netzaufruf unter Sperre). Nur für bekannte SetupIntents.
  let card: CardDisplay | null = null;
  let oldMethod: string | null = null;
  let cancelCheck: string | null = null; // Erstattung verbucht: danach prüfen, ob die angeforderte Absage jetzt abgeschlossen werden kann
  let feeFor: string | null = null; // erfolgreiche Abbuchung: die Gebühr wird NACH der Transaktion gebucht (Netzaufruf)
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
        if (intent && profile && profile.stripeCustomerId === customer && (intent.status === "created" || intent.status === "failed")) {
          if (profile.paymentMethodId && profile.paymentMethodId !== card.id) oldMethod = profile.paymentMethodId;
          await tx
            .update(paymentProfiles)
            .set({ paymentMethodId: card.id, cardBrand: card.brand, cardLast4: card.last4, mandateText: intent.mandateText, mandateAcceptedAt: intent.mandateAcceptedAt, updatedAt: new Date() })
            .where(eq(paymentProfiles.userId, intent.userId));
          await tx.update(paymentSetupIntents).set({ status: "succeeded" }).where(eq(paymentSetupIntents.id, intentId));
          // Eine neue Karte (auch aus dem Konto, ohne Spiel) macht ALLE Plätze dieses Nutzers wieder bereit, deren Abbuchung fehlgeschlagen ist, in offenen Spielen ohne
          // angeforderte Absage. Plätze ohne Karte (none) brauchen weiter das Mandat je Platz in der Lobby. Abgebucht wird hier nichts (Wiederabbuchen im Fenster: M3c).
          const openGames = tx.select({ id: matches.id }).from(matches).where(and(inArray(matches.status, ["lobby", "confirmed"]), isNull(matches.cancelRequestedAt)));
          await tx
            .update(matchParticipants)
            .set({ cardStatus: "card_ready" })
            .where(and(eq(matchParticipants.userId, intent.userId), eq(matchParticipants.cardStatus, "failed"), inArray(matchParticipants.matchId, openGames)));
          if (intent.matchId) {
            await tx.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, intent.matchId), eq(matchParticipants.userId, intent.userId), inArray(matchParticipants.cardStatus, ["none", "failed"]))); // nie aus charge_pending/charged zurücksetzen
          }
        }
      }
    } else if (event.type.startsWith("payment_intent.")) {
      const report = toChargeReport(event);
      if (report) {
        const res = await applyChargeInTx(tx, report);
        if (res.status === "applied" && report.outcome === "succeeded") feeFor = report.paymentIntentId;
      }
    } else if (event.type.startsWith("refund.") || event.type === "charge.refund.updated") {
      const report = toRefundReport(event);
      if (report) {
        const res = await applyRefundInTx(tx, report);
        if (res.status === "applied" && res.matchId) cancelCheck = res.matchId;
      }
    } else if (event.type === "charge.updated") {
      feeFor = str(event.object.payment_intent); // die balance_transaction ist jetzt womöglich da; unbekannte PaymentIntents ignoriert bookChargeFee
    } else if (event.type === "setup_intent.setup_failed") {
      const intentId = str(event.object.id);
      if (intentId) await tx.update(paymentSetupIntents).set({ status: "failed" }).where(and(eq(paymentSetupIntents.id, intentId), eq(paymentSetupIntents.status, "created")));
    }
    // übrige Kartenereignisse (payment_method.*, ...): vermerkt und ignoriert; payment_intent.* und charge.dispute.* ergänzen M2/M3
    await tx.update(stripeEvents).set({ processedAt: new Date() }).where(eq(stripeEvents.eventId, event.id));
  });

  if (cancelCheck) {
    try {
      await finalizeCancel(cancelCheck); // reine Datenbankprüfung, kein Netz; der Job holt es sonst nach
    } catch {
      /* nichts loggen */
    }
  }
  if (feeFor) {
    try {
      await bookChargeFee(feeFor); // eigener Folgeschritt, idempotent; "nicht verfügbar" holt der Nachholer später nach
    } catch {
      /* nichts loggen */
    }
  }
  if (oldMethod) {
    try {
      await (await getPaymentProvider()).detachPaymentMethod(oldMethod); // altes Zahlungsmittel bei Stripe lösen; Fehler bleiben folgenlos
    } catch {
      /* nichts loggen */
    }
  }
}
