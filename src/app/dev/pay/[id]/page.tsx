import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatEuro } from "@/lib/money";
import { activeProvider, getPaymentFor } from "@/server/payments";
import { requireUser } from "@/server/session";
import { devPayAction } from "@/server/wallet-actions";

export const metadata: Metadata = { title: "Test-Zahlung", robots: { index: false } };

/** Simulierter Zahlungsbildschirm. Es gibt ihn nur, solange der Entwicklungs-Anbieter aktiv ist (lokal und in Tests). */
export default async function DevPayPage({ params }: PageProps<"/dev/pay/[id]">) {
  const { id } = await params;
  if (activeProvider() !== "dev") notFound();
  const user = await requireUser(`/dev/pay/${id}`);
  const payment = await getPaymentFor(user.id, id);
  if (!payment || payment.provider !== "dev") notFound();

  return (
    <section className="mx-auto mt-8 max-w-sm space-y-4">
      <p className="rounded bg-yellow/20 px-3 py-2 text-sm text-yellow">Test-Zahlung: Hier fließt kein Geld. Das ist der Platz für Stripe.</p>
      <h1 className="text-2xl font-bold">{formatEuro(payment.amountCents)} bezahlen</h1>
      {payment.status !== "pending" ? (
        <p className="card text-muted">Diese Zahlung ist bereits abgeschlossen ({payment.status}).</p>
      ) : (
        <div className="space-y-2">
          <form action={devPayAction.bind(null, id, "success")}>
            <button className="btn btn-primary w-full">Zahlung erfolgreich</button>
          </form>
          <form action={devPayAction.bind(null, id, "cancel")}>
            <button className="btn btn-ghost w-full">Abbrechen</button>
          </form>
        </div>
      )}
    </section>
  );
}
