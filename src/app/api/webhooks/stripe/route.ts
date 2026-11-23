import { verifyStripeSignature } from "@/lib/stripe-signature";
import { audit } from "@/server/audit";

type StripeEvent = { id?: string; type?: string; created?: number; data?: { object?: { id?: string; amount_total?: number; currency?: string; payment_status?: string } } };

/** Checkout-Ereignisse, bei denen Geld für eine alte Aufladung angekommen sein kann (SEPA verzögert, Sitzung bis 24 Stunden). */
const PAID_TYPES = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/**
 * Alter Webhook (Aufladung per Checkout). 012 M6b: Aufladungen gibt es nicht mehr, es wird nichts mehr gutgeschrieben. Die Signatur bleibt geprüft.
 * Kommt trotzdem ein BEZAHLTES Checkout-Ereignis (eine vor dem Rollout gestartete Aufladung), schreibt der Endpunkt einen Protokolleintrag OHNE Personendaten
 * (Ereignis-ID, Betrag, Währung, Zeit), damit Admin 1 manuell auf die Karte erstattet. Quittiert wird immer mit 200, damit Stripe nicht wiederholt.
 * Betrieb: vor dem Rollout offene Aufladungen abwarten (24 Stunden) und das Stripe-Ziel erst danach abmelden (docs/BETRIEB.md).
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook nicht konfiguriert", { status: 503 });

  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) return new Response("Ungültige Signatur", { status: 400 });

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return new Response("Ungültiger Inhalt", { status: 400 });
  }

  const object = event.data?.object ?? {};
  const paid = event.type === "checkout.session.completed" ? object.payment_status === "paid" : event.type === "checkout.session.async_payment_succeeded";
  if (event.type && PAID_TYPES.has(event.type) && paid) {
    await audit(null, "payment.legacy_topup_paid", "stripe_event", String(event.id ?? "unbekannt"), {
      after: { amountCents: typeof object.amount_total === "number" ? object.amount_total : null, currency: object.currency ?? null, at: new Date().toISOString(), note: "Aufladung nicht gutgeschrieben (012 M6b): manuell erstatten" },
    });
  }
  return Response.json({ received: true });
}
