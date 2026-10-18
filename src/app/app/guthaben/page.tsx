import type { Metadata } from "next";
import Link from "next/link";
import { RefreshWhile } from "@/components/RefreshWhile";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { walletBalance, walletStatement } from "@/server/ledger";
import { activeProvider, getPaymentFor } from "@/server/payments";
import { listReceipts } from "@/server/receipts";
import { requireUser } from "@/server/session";
import { db } from "@/db";
import { TopUpForm } from "./TopUpForm";

export const metadata: Metadata = { title: "Guthaben" };

const KIND_LABEL: Record<string, string> = {
  topup: "Aufladung",
  promo_credit: "Bonus (Rabattcode)",
  match_share: "Startgebühr",
  refund: "Erstattung",
  adjustment: "Korrektur",
  chargeback: "Rückbuchung",
  fee: "Gebühr",
  venue_cost: "Hallenkosten",
};

function safeBack(value: string | undefined): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default async function WalletPage({ searchParams }: PageProps<"/app/guthaben">) {
  const user = await requireUser("/app/guthaben");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const paymentId = one(sp.zahlung);
  const status = one(sp.status);
  const back = safeBack(one(sp.zurueck));
  const amountParam = Number(one(sp.betrag));
  const initialAmount = Number.isFinite(amountParam) && amountParam >= 500 ? String(Math.round(amountParam / 100)) : "20";

  const [balance, statement, receipts] = await Promise.all([walletBalance(db, user.id), walletStatement(user.id, 50), listReceipts(user.id)]);
  const payment = paymentId ? await getPaymentFor(user.id, paymentId) : null;
  const waiting = Boolean(payment && payment.status === "pending" && status === "ok");
  const provider = activeProvider();

  return (
    <div className="space-y-6">
      <RefreshWhile active={waiting} />
      <div>
        <h1 className="text-2xl font-bold">Guthaben</h1>
        <p className="font-heading text-4xl font-extrabold tabular-nums" aria-label="Aktuelles Guthaben" data-testid="balance">{formatEuro(balance)}</p>
      </div>

      {payment && (
        <p className={`card text-sm ${payment.status === "succeeded" ? "border-green text-green" : payment.status === "pending" ? "text-muted" : "text-coral"}`} role="status" data-testid="payment-status">
          {payment.status === "succeeded" && `Zahlung eingegangen: ${formatEuro(payment.amountCents)} wurden gutgeschrieben.`}
          {payment.status === "pending" && (status === "ok" ? "Die Zahlung wird noch vom Anbieter bestätigt. Das dauert meist nur Sekunden." : "Die Zahlung ist noch nicht abgeschlossen.")}
          {(payment.status === "canceled" || payment.status === "failed") && "Die Zahlung wurde nicht abgeschlossen. Es wurde nichts abgebucht."}
        </p>
      )}
      {payment?.status === "succeeded" && (payment.returnTo ?? back) && (
        <Link href={(payment.returnTo ?? back)!} className="btn btn-primary w-full">Zurück zum Spiel</Link>
      )}

      {provider ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Aufladen</h2>
          <TopUpForm initialAmount={initialAmount} back={back} />
        </section>
      ) : (
        <p className="card text-muted">Aufladen ist gerade nicht möglich.</p>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Verlauf</h2>
        {statement.length === 0 ? (
          <p className="card text-muted">Noch keine Buchungen.</p>
        ) : (
          <ul className="space-y-2" data-testid="statement">
            {statement.map((s) => (
              <li key={s.id} className="card flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{KIND_LABEL[s.kind] ?? s.kind}</span>
                  <span className="block truncate text-xs text-muted">
                    {formatDateTime(s.at)} Uhr{s.reason ? ` · ${s.reason}` : ""}
                    {s.matchId && (
                      <>
                        {" · "}
                        <Link href={`/spiele/${s.matchId}`} className="underline">Spiel</Link>
                      </>
                    )}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${s.signedCents >= 0 ? "text-green" : ""}`}>
                  {s.signedCents >= 0 ? "+" : "−"}{formatEuro(Math.abs(s.signedCents))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Belege</h2>
        {receipts.length === 0 ? (
          <p className="card text-muted">Noch keine Belege.</p>
        ) : (
          <ul className="space-y-2">
            {receipts.map((r) => (
              <li key={r.id} className="card flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-semibold">{r.number}</span>
                  <span className="block text-xs text-muted">{r.kind === "topup" ? "Aufladung" : "Startgebühr"} · {formatDateTime(r.issuedAt)} Uhr · {formatEuro(r.amountCents)}</span>
                </span>
                <a href={`/api/belege/${r.id}`} className="btn btn-ghost !min-h-9" download>PDF</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
