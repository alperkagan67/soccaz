import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema-finance";
import { formatEuro, isValidTopup } from "@/lib/money";
import { audit } from "./audit";
import { creditWallet, post } from "./ledger";
import { notifyUsers } from "./notifications";
import { previewPromo, redeemPromo } from "./promo";
import { issueReceipt } from "./receipts";
import { DomainError } from "./teams";

export type Provider = "dev" | "stripe";
export type Checkout = { url: string; providerRef: string | null };

/** Rückweg nach der Zahlung: nur interne Pfade (kein offener Weiterleitungs-Link). */
export function safeReturnPath(value: string | null | undefined): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") && value.length < 200 ? value : null;
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3100").replace(/\/$/, "");
}

/** Welcher Anbieter ist aktiv? Stripe, sobald ein Schlüssel gesetzt ist. Lokal und in Tests der Entwicklungs-Anbieter. In Produktion ohne Schlüssel: keiner. */
export function activeProvider(): Provider | null {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.NODE_ENV !== "production" || process.env.PAYMENTS_DEV_PROVIDER === "1") return "dev";
  return null;
}

/** Geschätzte Anbietergebühr (Karte und PayPal). Die echten Werte stehen im Stripe-Dashboard und werden dort abgeglichen. */
export function estimateFee(amountCents: number): number {
  const pct = Number(process.env.PAYMENT_FEE_PERCENT ?? "2.9");
  const fixed = Number(process.env.PAYMENT_FEE_FIXED_CENTS ?? "30");
  return Math.max(0, Math.round((amountCents * pct) / 100) + fixed);
}

async function createStripeCheckout(p: { paymentId: string; email: string; amountCents: number }): Promise<Checkout> {
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${appUrl()}/app/guthaben?zahlung=${p.paymentId}&status=ok`,
    cancel_url: `${appUrl()}/app/guthaben?zahlung=${p.paymentId}&status=abbruch`,
    client_reference_id: p.paymentId,
    customer_email: p.email,
    "metadata[paymentId]": p.paymentId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(p.amountCents),
    "line_items[0][price_data][product_data][name]": "Socaz Guthaben",
  });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": p.paymentId },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) throw new DomainError(`Zahlung konnte nicht gestartet werden: ${data.error?.message ?? response.status}`);
  return { url: data.url, providerRef: data.id ?? null };
}

/** Legt eine Aufladung an und liefert die Adresse, zu der der Nutzer zum Bezahlen weitergeleitet wird. */
export async function createTopUp(user: { id: string; email: string }, amountCents: number, promoCode?: string, returnTo?: string | null): Promise<{ paymentId: string; url: string }> {
  if (!isValidTopup(amountCents)) throw new DomainError("Du kannst zwischen 5,00 und 200,00 Euro aufladen.");
  const provider = activeProvider();
  if (!provider) throw new DomainError("Zahlungen sind gerade nicht verfügbar.");

  let promoCodeId: string | null = null;
  if (promoCode?.trim()) {
    const preview = await previewPromo(user.id, promoCode, amountCents);
    if (!preview.ok) throw new DomainError(preview.reason);
    promoCodeId = preview.codeId ?? null;
  }

  const [payment] = await db
    .insert(payments)
    .values({ userId: user.id, provider, amountCents, promoCodeId, returnTo: safeReturnPath(returnTo), idempotencyKey: `topup:${randomUUID()}` })
    .returning();

  const checkout: Checkout = provider === "stripe" ? await createStripeCheckout({ paymentId: payment.id, email: user.email, amountCents }) : { url: `/dev/pay/${payment.id}`, providerRef: `dev_${payment.id}` };
  await db.update(payments).set({ providerRef: checkout.providerRef }).where(eq(payments.id, payment.id));
  await audit(user.id, "payment.create", "payment", payment.id, { after: { provider, amountCents, promoCodeId } });
  return { paymentId: payment.id, url: checkout.url };
}

/**
 * Verbucht eine erfolgreiche Zahlung: Guthaben, Gebühr, Rabatt-Bonus und Beleg. Idempotent:
 * Wiederholte Webhooks buchen nichts doppelt (Schlüssel je Zahlung und Zeile).
 */
export async function completePayment(ref: { paymentId?: string; providerRef?: string }): Promise<{ status: "completed" | "already" | "unknown" }> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(ref.paymentId ? eq(payments.id, ref.paymentId) : eq(payments.providerRef, ref.providerRef ?? ""))
      .for("update");
    if (!payment) return { status: "unknown" as const };
    if (payment.status === "succeeded") return { status: "already" as const };

    const fee = payment.provider === "dev" ? 0 : estimateFee(payment.amountCents);
    await creditWallet(tx, payment.userId, { from: "clearing", amountCents: payment.amountCents, kind: "topup", paymentId: payment.id, idempotencyKey: `topup:${payment.id}`, reason: "Aufladung" });
    if (fee > 0) {
      await post(tx, { debit: { account: "fees" }, credit: { account: "clearing" }, amountCents: fee, kind: "fee", paymentId: payment.id, idempotencyKey: `fee:${payment.id}`, reason: "Zahlungsgebühr (geschätzt)" });
    }

    let bonus = 0;
    let skipped: string | null = null;
    if (payment.promoCodeId) {
      const r = await redeemPromo(tx, { codeId: payment.promoCodeId, userId: payment.userId, paymentId: payment.id, topupCents: payment.amountCents });
      if ("bonusCents" in r) {
        bonus = r.bonusCents;
        await creditWallet(tx, payment.userId, { from: "promo", amountCents: bonus, kind: "promo_credit", paymentId: payment.id, idempotencyKey: `promo:${payment.id}`, reason: "Rabattcode" });
      } else skipped = r.skipped;
    }

    await tx.update(payments).set({ status: "succeeded", feeCents: fee, completedAt: new Date(), failureReason: null }).where(eq(payments.id, payment.id));
    const receipt = await issueReceipt(tx, { userId: payment.userId, kind: "topup", amountCents: payment.amountCents, paymentId: payment.id });
    await audit(null, "payment.succeeded", "payment", payment.id, { after: { amountCents: payment.amountCents, feeCents: fee, bonus, promoSkipped: skipped, receipt: receipt.number } }, tx);
    await notifyUsers(
      [payment.userId],
      { type: "payment", title: "Guthaben aufgeladen", body: `${formatEuro(payment.amountCents)} wurden gutgeschrieben${bonus ? `, dazu ${formatEuro(bonus)} Bonus` : ""}.`, url: "/app/guthaben" },
      tx,
    );
    return { status: "completed" as const };
  });
}

/** Markiert eine Zahlung als fehlgeschlagen oder abgebrochen. Eine bereits erfolgreiche Zahlung bleibt unberührt. */
export async function failPayment(ref: { paymentId?: string; providerRef?: string }, status: "failed" | "canceled", reason: string) {
  await db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(ref.paymentId ? eq(payments.id, ref.paymentId) : eq(payments.providerRef, ref.providerRef ?? ""))
      .for("update");
    if (!payment || payment.status === "succeeded") return;
    await tx.update(payments).set({ status, failureReason: reason, completedAt: new Date() }).where(eq(payments.id, payment.id));
    await audit(null, `payment.${status}`, "payment", payment.id, { after: { reason } }, tx);
  });
}

export async function listPayments(userId: string, limit = 20) {
  return db.select().from(payments).where(eq(payments.userId, userId)).orderBy(desc(payments.createdAt)).limit(limit);
}

export async function getPaymentFor(userId: string, paymentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const [row] = await db.select().from(payments).where(eq(payments.id, paymentId));
  return row && row.userId === userId ? row : null;
}
