import { verifyStripeSignature } from "@/lib/stripe-signature";

type StripeEvent = { id: string; type: string };

/** Webhook von Stripe. Die Signatur wird geprüft; verbucht wird nichts. */
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

  // 012 M6b: Aufladungen (Checkout) gibt es nicht mehr, hier wird nichts mehr verbucht. Die Signatur bleibt geprüft, der Endpunkt quittiert nur,
  // damit ein noch eingetragenes Stripe-Ziel nicht ins Leere läuft. Karten- und Streitereignisse gehören zu /api/stripe/webhook.
  void event;
  return Response.json({ received: true });
}
