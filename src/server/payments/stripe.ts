import Stripe from "stripe";
import { PaymentsUnavailableError, WebhookSignatureError, type CardDisplay, type PaymentProvider, type ProviderEvent } from "./provider";

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
    const c = await this.stripe().customers.create({ email: input.email, metadata: { userId: input.userId } }, { idempotencyKey: input.idempotencyKey });
    return { id: c.id };
  }

  async createSetupIntent(input: { customerId: string; userId: string; idempotencyKey: string }) {
    const si = await this.stripe().setupIntents.create(
      { customer: input.customerId, usage: "off_session", automatic_payment_methods: { enabled: true, allow_redirects: "never" }, metadata: { userId: input.userId } },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!si.client_secret) throw new PaymentsUnavailableError();
    return { id: si.id, clientSecret: si.client_secret };
  }

  async retrievePaymentMethod(id: string): Promise<CardDisplay> {
    const pm = await this.stripe().paymentMethods.retrieve(id);
    return { id: pm.id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
  }

  async detachPaymentMethod(id: string) {
    await this.stripe().paymentMethods.detach(id);
  }

  constructWebhookEvent(rawBody: string, signature: string | null): ProviderEvent {
    const secret = this.config.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
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
