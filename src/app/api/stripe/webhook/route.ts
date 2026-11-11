import { handleStripeWebhook, MAX_WEBHOOK_BYTES } from "@/server/payments/webhook";

/** Webhook von Stripe für die Kartenzahlung (Vertrag 012). Signatur auf dem rohen Body ist Pflicht; Antworten sind knapp und verraten nichts. */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_WEBHOOK_BYTES) return new Response("Zu groß", { status: 413 });
  const raw = await request.text();
  const result = await handleStripeWebhook(raw, request.headers.get("stripe-signature"));
  return new Response(result.body, { status: result.status, headers: { "Content-Type": result.status === 200 ? "application/json" : "text/plain" } });
}
