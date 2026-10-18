import { verifyStripeSignature } from "@/lib/stripe-signature";
import { notifyUsers, platformAdminIds } from "@/server/notifications";
import { completePayment, failPayment } from "@/server/payments";
import { db } from "@/db";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

/** Webhook von Stripe. Die Signatur wird geprüft, die Verbuchung ist idempotent (mehrfache Zustellung ist unschädlich). */
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
  const sessionId = typeof object.id === "string" ? object.id : undefined;
  const meta = (object.metadata ?? {}) as Record<string, string>;
  const paymentId = (typeof object.client_reference_id === "string" ? object.client_reference_id : undefined) ?? meta.paymentId;
  const ref = { paymentId, providerRef: paymentId ? undefined : sessionId };

  switch (event.type) {
    case "checkout.session.completed":
      // Bei verzögerten Zahlarten (SEPA) ist die Zahlung hier noch nicht eingegangen
      if (object.payment_status === "paid") await completePayment(ref);
      break;
    case "checkout.session.async_payment_succeeded":
      await completePayment(ref);
      break;
    case "checkout.session.async_payment_failed":
      await failPayment(ref, "failed", "Zahlung fehlgeschlagen");
      break;
    case "checkout.session.expired":
      await failPayment(ref, "canceled", "Sitzung abgelaufen");
      break;
    case "charge.dispute.created":
      await notifyUsers(
        await platformAdminIds(db),
        { type: "admin.task", title: "Rückbuchung eingegangen", body: "Bei Stripe wurde eine Zahlung angefochten. Bitte im Stripe-Dashboard prüfen und im Finanzbereich eine Korrektur buchen.", url: "/admin/finanzen" },
      );
      break;
    default:
      break; // andere Ereignisse sind uns egal
  }
  return Response.json({ received: true });
}
