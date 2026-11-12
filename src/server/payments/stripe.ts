import Stripe from "stripe";
import { PaymentIdempotencyError, PaymentsUnavailableError, WebhookSignatureError, type CardDisplay, type ChargeResult, type FoundIntent, type RefundResult, type PaymentProvider, type ProviderEvent } from "./provider";

/** Kürzere Grenzen für das Einrichten der Karte (läuft unter einer Datenbanktransaktion): höchstens etwa 16 Sekunden je Aufruf statt 45. */
const SETUP_REQUEST = { timeout: 8_000, maxNetworkRetries: 1 } as const;

type Config = { secretKey?: string; webhookSecret?: string };

/** Echter Stripe-Client. Schlüssel werden erst beim ersten Aufruf gelesen (kein Absturz beim Build); fehlen sie, kommt PaymentsUnavailableError. */
export class StripeProvider implements PaymentProvider {
  readonly name = "stripe" as const;
  private client: Stripe | null = null;
  constructor(private readonly config: Config = {}) {}

  private stripe(): Stripe {
    const key = this.config.secretKey ?? process.env.STRIPE_SECRET_KEY;
    if (!key) throw new PaymentsUnavailableError();
    this.client ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
    return this.client;
  }

  async createCustomer(input: { userId: string; email: string; idempotencyKey: string }) {
    const c = await this.stripe().customers.create({ email: input.email, metadata: { userId: input.userId } }, { idempotencyKey: input.idempotencyKey, ...SETUP_REQUEST });
    return { id: c.id };
  }

  async createSetupIntent(input: { customerId: string; userId: string; idempotencyKey: string }) {
    const si = await this.stripe().setupIntents.create(
      { customer: input.customerId, usage: "off_session", automatic_payment_methods: { enabled: true, allow_redirects: "never" }, metadata: { userId: input.userId } },
      { idempotencyKey: input.idempotencyKey, ...SETUP_REQUEST },
    );
    if (!si.client_secret) throw new PaymentsUnavailableError();
    return { id: si.id, clientSecret: si.client_secret };
  }

  async retrievePaymentMethod(id: string): Promise<CardDisplay> {
    const pm = await this.stripe().paymentMethods.retrieve(id);
    return { id: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
  }

  async createPaymentIntent(input: { customerId: string; paymentMethodId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string } }): Promise<ChargeResult> {
    try {
      const pi = await this.stripe().paymentIntents.create(
        { amount: input.amountCents, currency: "eur", customer: input.customerId, payment_method: input.paymentMethodId, off_session: true, confirm: true, metadata: input.metadata },
        { idempotencyKey: input.idempotencyKey, ...SETUP_REQUEST },
      );
      const status = pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action" : pi.status === "processing" ? "processing" : "failed";
      return { id: pi.id, status, failureCode: status === "failed" ? (pi.last_payment_error?.code ?? "requires_payment_method") : null };
    } catch (error) {
      // Abgelehnte Karte oder Authentifizierung nötig: Stripe wirft, legt aber einen PaymentIntent an. Das ist ein Ergebnis, kein unbekannter Ausgang.
      const e = error as { type?: string; code?: string; payment_intent?: { id?: string; status?: string } };
      if (e?.type === "StripeCardError" && typeof e.payment_intent?.id === "string") {
        const authNeeded = e.code === "authentication_required" || e.payment_intent.status === "requires_action";
        return { id: e.payment_intent.id, status: authNeeded ? "requires_action" : "failed", failureCode: typeof e.code === "string" ? e.code.slice(0, 64) : "card_declined" };
      }
      // Nur eine echte Parameteränderung ist ein Konflikt. "Schlüssel gerade in Benutzung" (paralleler Lauf, HTTP 409) ist KEIN Konflikt: normaler Fehler, die Zeile bleibt pending und wird wiederholt.
      const ie = error as { type?: string; code?: string; statusCode?: number };
      if (ie?.type === "StripeIdempotencyError" && ie.code !== "idempotency_key_in_use" && ie.statusCode !== 409) throw new PaymentIdempotencyError();
      throw error;
    }
  }

  async createRefund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string; chargeId: string } }): Promise<RefundResult> {
    try {
      const r = await this.stripe().refunds.create(
        { payment_intent: input.paymentIntentId, amount: input.amountCents, metadata: input.metadata },
        { idempotencyKey: input.idempotencyKey, ...SETUP_REQUEST },
      );
      const status = r.status === "succeeded" ? "succeeded" : r.status === "failed" || r.status === "canceled" ? "failed" : "pending";
      return { id: r.id, status, failureCode: status === "failed" ? (r.failure_reason ?? "refund_failed").slice(0, 64) : null };
    } catch (error) {
      const e = error as { type?: string; code?: string; statusCode?: number };
      if (e?.type === "StripeIdempotencyError" && e.code !== "idempotency_key_in_use" && e.statusCode !== 409) throw new PaymentIdempotencyError();
      // Von Stripe abgelehnt (kein Netzfehler): als Ergebnis melden, damit die Zeile failed wird und der Admin-Alarm greift
      if (e?.type === "StripeInvalidRequestError" && (e.code === "charge_disputed" || e.code === "charge_already_refunded" || e.code === "charge_expired_for_refund" || e.code === "insufficient_funds")) {
        return { id: "", status: "failed", failureCode: e.code };
      }
      throw error;
    }
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<FoundIntent | null> {
    if (!/^pi_[A-Za-z0-9_]{1,64}$/.test(paymentIntentId)) return null;
    try {
      const pi = await this.stripe().paymentIntents.retrieve(paymentIntentId, {}, SETUP_REQUEST);
      return {
        id: pi.id,
        status: pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action" : pi.status === "processing" ? "processing" : pi.status === "requires_payment_method" || pi.status === "canceled" ? "failed" : "other",
        amountCents: Number.isInteger(pi.amount) ? pi.amount : null,
        currency: pi.currency ?? null,
        customerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? null),
        failureCode: pi.last_payment_error?.code ?? null,
      };
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "resource_missing") return null;
      throw error;
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<{ status: "canceled" | "succeeded" | "other" }> {
    if (!/^pi_[A-Za-z0-9_]{1,64}$/.test(paymentIntentId)) return { status: "other" };
    try {
      await this.stripe().paymentIntents.cancel(paymentIntentId, {}, SETUP_REQUEST);
      return { status: "canceled" };
    } catch (error) {
      // Schon in einem Endzustand (abgebrochen/erfolgreich): den echten Zustand lesen statt zu raten
      if ((error as { code?: string } | null)?.code === "payment_intent_unexpected_state") {
        const pi = await this.stripe().paymentIntents.retrieve(paymentIntentId, {}, SETUP_REQUEST);
        return { status: pi.status === "succeeded" ? "succeeded" : pi.status === "canceled" ? "canceled" : "other" };
      }
      throw error;
    }
  }

  async findPaymentIntents(input: { matchId: string; userId: string }): Promise<FoundIntent[]> {
    // Die Werte stammen aus unseren UUIDs (vom Aufrufer geprüft); trotzdem nur Zeichen einer UUID zulassen, bevor sie in die Suchanfrage kommen
    const uuid = /^[0-9a-f-]{36}$/i;
    if (!uuid.test(input.matchId) || !uuid.test(input.userId)) return [];
    const res = await this.stripe().paymentIntents.search({ query: `metadata['matchId']:'${input.matchId}' AND metadata['userId']:'${input.userId}'`, limit: 10 }, SETUP_REQUEST);
    return res.data.map((pi) => ({
      id: pi.id,
      status: pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action" : pi.status === "processing" ? "processing" : pi.status === "requires_payment_method" || pi.status === "canceled" ? "failed" : "other",
      amountCents: Number.isInteger(pi.amount) ? pi.amount : null,
      currency: pi.currency ?? null,
      customerId: typeof pi.customer === "string" ? pi.customer : (pi.customer?.id ?? null),
      failureCode: pi.last_payment_error?.code ?? null,
    }));
  }

  async retrieveChargeFee(paymentIntentId: string): Promise<number | null> {
    const pi = await this.stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" && charge.balance_transaction ? charge.balance_transaction : null;
    if (!bt || bt.currency !== "eur" || !Number.isInteger(bt.fee) || bt.fee < 0) return null;
    return bt.fee;
  }

  async isPaymentMethodUsable(id: string, customerId: string): Promise<boolean> {
    const pm = await this.stripe().paymentMethods.retrieve(id);
    if (pm.customer !== customerId) return false; // gelöst (customer null) oder fremd
    if (pm.card) {
      const now = new Date();
      if (pm.card.exp_year < now.getUTCFullYear() || (pm.card.exp_year === now.getUTCFullYear() && pm.card.exp_month < now.getUTCMonth() + 1)) return false;
    }
    return true;
  }

  async detachPaymentMethod(id: string) {
    await this.stripe().paymentMethods.detach(id);
  }

  constructWebhookEvent(rawBody: string, signature: string | null): ProviderEvent {
    const secret = this.config.webhookSecret ?? process.env.STRIPE_CARD_WEBHOOK_SECRET; // eigenes Secret dieses Endpunkts; STRIPE_WEBHOOK_SECRET gehört der alten Route /api/webhooks/stripe
    if (!secret) throw new PaymentsUnavailableError();
    if (!signature) throw new WebhookSignatureError();
    try {
      const e = this.stripe().webhooks.constructEvent(rawBody, signature, secret);
      return { id: e.id, type: e.type, object: e.data.object as unknown as Record<string, unknown> };
    } catch {
      throw new WebhookSignatureError();
    }
  }
}
