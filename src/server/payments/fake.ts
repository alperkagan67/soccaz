import { createHash } from "node:crypto";
import { signStripePayload, verifyStripeSignature } from "@/lib/stripe-signature";
import { PaymentIdempotencyError, WebhookSignatureError, type CardDisplay, type ChargeResult, type FoundIntent, type RefundResult, type PaymentProvider, type ProviderEvent } from "./provider";

/** Steuerbarer Ausgang einer Abbuchung im FakeProvider. "error" wirft (Ergebnis unbekannt). */
export type FakeChargeOutcome = "succeeded" | "declined" | "requires_action" | "processing" | "error" | "idempotency_mismatch";

export const FAKE_WEBHOOK_SECRET = "whsec_fake_for_tests";
const short = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 16);

/** Anbieter für Tests und lokale Entwicklung: deterministisch, ohne Netz, ohne Schlüssel. Gleicher idempotencyKey ergibt dieselbe ID. */
export class FakeProvider implements PaymentProvider {
  readonly name = "fake" as const;
  readonly calls: { method: string; args: unknown }[] = [];
  private readonly cards = new Map<string, CardDisplay>();
  private readonly detached = new Set<string>();
  private readonly unusable = new Set<string>();
  private readonly outcomes = new Map<string, FakeChargeOutcome>();
  private readonly fees = new Map<string, number | null>();
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

  /** Test-Hilfe: macht dieses Zahlungsmittel unbrauchbar (abgelaufen, gelöst) oder wieder nutzbar. */
  setUsable(id: string, usable: boolean) {
    if (usable) this.unusable.delete(id);
    else this.unusable.add(id);
  }

  /** Test-Hilfe: Ausgang der nächsten Abbuchungen je Nutzer (Standard succeeded). */
  setChargeOutcome(userId: string, outcome: FakeChargeOutcome) {
    this.outcomes.set(userId, outcome);
  }

  /** Test-Hilfe: echte Gebühr je PaymentIntent (oder für alle, Standard null = noch nicht verfügbar). */
  setFee(paymentIntentId: string | "*", fee: number | null) {
    this.fees.set(paymentIntentId, fee);
  }

  /** Test-Hilfe: Wird gesetzt, protokolliert der Fake jeden Netzaufruf, der innerhalb einer Datenbanktransaktion passiert. */
  inTransaction: (() => boolean) | null = null;
  readonly violations: string[] = [];
  private probe(method: string) {
    if (this.inTransaction?.()) this.violations.push(method);
  }

  async createPaymentIntent(input: { customerId: string; paymentMethodId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string } }): Promise<ChargeResult> {
    this.probe("createPaymentIntent");
    this.calls.push({ method: "createPaymentIntent", args: { amountCents: input.amountCents, idempotencyKey: input.idempotencyKey, metadata: input.metadata } });
    const outcome = this.outcomes.get(input.metadata.userId) ?? "succeeded";
    if (outcome === "error") throw new Error("Netz weg");
    if (outcome === "idempotency_mismatch") throw new PaymentIdempotencyError();
    const id = `pi_fake_${short(input.idempotencyKey)}`; // gleicher Schlüssel, gleicher PaymentIntent (wie bei Stripe)
    if (outcome === "succeeded") return { id, status: "succeeded", failureCode: null };
    if (outcome === "processing") return { id, status: "processing", failureCode: null };
    if (outcome === "requires_action") return { id, status: "requires_action", failureCode: "authentication_required" };
    return { id, status: "failed", failureCode: "card_declined" };
  }

  /** Test-Hilfe: Ausgang der Erstattungen je Nutzer (Standard succeeded). "error" wirft (unbekannt). */
  private readonly refundOutcomes = new Map<string, "succeeded" | "pending" | "failed" | "disputed" | "error">();
  setRefundOutcome(userId: string, outcome: "succeeded" | "pending" | "failed" | "disputed" | "error") {
    this.refundOutcomes.set(userId, outcome);
  }

  async createRefund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string; metadata: { matchId: string; userId: string; chargeId: string } }): Promise<RefundResult> {
    this.probe("createRefund");
    this.calls.push({ method: "createRefund", args: { paymentIntentId: input.paymentIntentId, amountCents: input.amountCents, idempotencyKey: input.idempotencyKey, metadata: input.metadata } });
    const outcome = this.refundOutcomes.get(input.metadata.userId) ?? "succeeded";
    if (outcome === "error") throw new Error("Netz weg");
    const id = `re_fake_${short(input.idempotencyKey)}`;
    if (outcome === "disputed") return { id: "", status: "failed", failureCode: "charge_disputed" };
    if (outcome === "failed") return { id, status: "failed", failureCode: "refund_failed" };
    if (outcome === "pending") return { id, status: "pending", failureCode: null };
    return { id, status: "succeeded", failureCode: null };
  }

  /** Test-Hilfe: PaymentIntents, die die Suche zu Spiel und Nutzer liefert (z. B. ein Treffer, obwohl unsere Anfrage als Netzfehler endete). */
  private readonly found = new Map<string, FoundIntent[]>();
  setFound(matchId: string, userId: string, list: FoundIntent[]) {
    this.found.set(`${matchId}:${userId}`, list);
  }

  async findPaymentIntents(input: { matchId: string; userId: string }): Promise<FoundIntent[]> {
    this.probe("findPaymentIntents");
    this.calls.push({ method: "findPaymentIntents", args: input });
    return this.found.get(`${input.matchId}:${input.userId}`) ?? [];
  }

  async retrieveChargeFee(paymentIntentId: string): Promise<number | null> {
    this.probe("retrieveChargeFee");
    this.calls.push({ method: "retrieveChargeFee", args: { paymentIntentId } });
    return this.fees.has(paymentIntentId) ? (this.fees.get(paymentIntentId) ?? null) : (this.fees.get("*") ?? null);
  }

  async isPaymentMethodUsable(id: string, customerId: string) {
    this.calls.push({ method: "isPaymentMethodUsable", args: { id, customerId } });
    return !this.unusable.has(id) && !this.detached.has(id);
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
