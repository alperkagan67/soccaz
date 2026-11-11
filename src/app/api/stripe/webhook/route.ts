import { handleStripeWebhook, MAX_WEBHOOK_BYTES, readBodyLimited } from "@/server/payments/webhook";

/** Webhook von Stripe für die Kartenzahlung (Vertrag 012). Signatur auf dem rohen Body ist Pflicht; Antworten sind knapp und verraten nichts. */
export async function POST(request: Request) {
  const raw = await readBodyLimited(request, MAX_WEBHOOK_BYTES);
  if (raw === null) return new Response("Zu groß", { status: 413 });
  const result = await handleStripeWebhook(raw, request.headers.get("stripe-signature"));
  return new Response(result.body, { status: result.status, headers: { "Content-Type": result.status === 200 ? "application/json" : "text/plain" } });
}
