import { createHash } from "node:crypto";
import { signStripePayload, verifyStripeSignature } from "@/lib/stripe-signature";
import { WebhookSignatureError, type CardDisplay, type PaymentProvider, type ProviderEvent } from "./provider";

export const FAKE_WEBHOOK_SECRET = "whsec_fake_for_tests";
const short = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 16);

/** Anbieter für Tests und lokale Entwicklung: deterministisch, ohne Netz, ohne Schlüssel. Gleicher idempotencyKey ergibt dieselbe ID. */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly calls: { method: string; args: unknown }[] = [];
  private readonly cards = new Map<string, CardDisplay>();
  private readonly detached = new Set<string>();
  constructor(private readonly webhookSecret = FAKE_WEBHOOK_SECRET) {}

  async createCustomer(input: { userId: string; email: string; idempotencyKey: string }) {
    this.calls.push({ method: "createCustomer", args: { userId: input.userId } });
    return { id: `cus_fake_${short(input.idempotencyKey)}` };
  }

  async createSetupIntent(input: { customerId: string; userId: string; idempotencyKey: string }) {
    this.calls.push({ method: "createSetupIntent", args: { customerId: input.customerId, userId: input.userId } });
    const id = `seti_fake_${short(input.idempotencyKey)}`;
    return { id, clientSecret: `${id}_secret_fake` };
  }

  /** Test-Hilfe: legt fest, was retrievePaymentMethod für diese ID liefert. */
  registerCard(card: CardDisplay) {
    this.cards.set(card.id, card);
  }

  async retrievePaymentMethod(id: string): Promise<CardDisplay> {
    this.calls.push({ method: "retrievePaymentMethod", args: { id } });
    return this.cards.get(id) ?? { id, brand: "visa", last4: "4242" };
  }

  async detachPaymentMethod(id: string) {
    this.calls.push({ method: "detachPaymentMethod", args: { id } });
    this.detached.add(id);
  }

  wasDetached(id: string) {
    return this.detached.has(id);
  }

  constructWebhookEvent(rawBody: string, signature: string | null): ProviderEvent {
    if (!verifyStripeSignature(rawBody, signature, this.webhookSecret)) throw new WebhookSignatureError();
    let e: { id?: unknown; type?: unknown; data?: { object?: unknown } };
    try {
      e = JSON.parse(rawBody);
    } catch {
      throw new WebhookSignatureError();
    }
    if (typeof e.id !== "string" || typeof e.type !== "string") throw new WebhookSignatureError();
    return { id: e.id, type: e.type, object: (e.data?.object ?? {}) as Record<string, unknown> };
  }

  /** Test-Hilfe: ein signiertes Ereignis (roher Body und Header) wie von Stripe. */
  signEvent(event: { id: string; type: string; object: Record<string, unknown> }, timestamp?: number) {
    const rawBody = JSON.stringify({ id: event.id, type: event.type, data: { object: event.object } });
    return { rawBody, signature: signStripePayload(rawBody, this.webhookSecret, timestamp) };
  }
}
