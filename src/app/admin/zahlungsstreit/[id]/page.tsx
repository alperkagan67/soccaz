import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISPUTE_STATUS_LABEL } from "@/lib/dispute-labels";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { getDispute } from "@/server/payments/dispute-admin";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Zahlungsstreit" };

const KIND = { withdrawal: "Abzug durch Stripe", reversal: "Rückbuchung durch Stripe" } as const;
const ENTRY_STATUS = { booked: "gebucht", parked: "wartet auf den Abzug", rejected: "nicht gebucht" } as const;
const REJECT = { currency: "falsche Währung", amount: "Betrag ungültig", amount_exceeds_charge: "Betrag über der Abbuchung", sum_exceeds_charge: "Summe über der Abbuchung", uncovered_reversal: "Rückbuchung nicht gedeckt" } as Record<string, string>;

export default async function DisputeDetailPage({ params }: PageProps<"/admin/zahlungsstreit/[id]">) {
  const { id } = await params;
  await requirePermission("admin", `/admin/zahlungsstreit/${id}`);
  const data = await getDispute(id);
  if (!data) notFound();
  const { dispute: d, payer, seatUser, match, charge, entries, evidence } = data;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted"><Link href="/admin/zahlungsstreit" className="underline">Zahlungsstreit</Link> / Detail</p>
        <h1 className="text-2xl font-bold">{formatEuro(d.amountCents)} angefochten</h1>
        <p className="text-muted">
          <span className={`mr-2 rounded px-2 py-0.5 text-xs ${d.open ? "bg-ink text-bg" : "bg-panel text-muted"}`} data-testid="dispute-status">{DISPUTE_STATUS_LABEL[d.status] ?? d.status}</span>
          Grund {d.reason} · Eingang {formatDateTime(d.createdAt)}
          {d.open && d.evidenceDueBy && ` · Beweise bis ${formatDateTime(d.evidenceDueBy)}`}
        </p>
        {d.open && <p className="text-sm">Reiche die Beweise unten im Stripe-Dashboard ein. Streit-Nummer: <code>{d.disputeId}</code></p>}
        {!d.open && <p className="text-sm text-muted">Streit-Nummer bei Stripe: <code>{d.disputeId}</code></p>}
      </header>

      {d.refundConflict && (
        <p className="card border-ink" role="note" data-testid="dispute-double-loss">
          Doppelverlust: Die Erstattung war schon gesendet, als der Streit verloren ging ({formatEuro(d.doubleLossCents)}). Das wird auf dem Konto Rückbuchung abgeschrieben; eine Rückforderung beim Spieler ist nicht vorgesehen.
        </p>
      )}

      <section className="card space-y-1" aria-label="Zuordnung">
        <h2 className="font-semibold">Zuordnung</h2>
        <p>
          Zahler: {payer ? <>{payer.name}{payer.deleted && " (Konto gelöscht)"}</> : "unbekannt (keine passende Zahlung gefunden)"}
          {seatUser && payer && ` · Anteil von ${seatUser.name} übernommen`}
        </p>
        <p>
          Spiel: {match ? <Link href={`/admin/finanzen/spiel/${match.id}`} className="underline">{match.label}</Link> : "–"}
          {match && ` · ${formatDateTime(match.startsAt)} Uhr`}
        </p>
        <p>Abbuchung: {charge ? `${formatEuro(charge.amountCents)}, ${formatDateTime(charge.createdAt)}` : "–"}</p>
        <p className="text-sm text-muted">Eine Sperre des Spielers gibt es nicht automatisch. Sie setzt nur Admin 1 von Hand unter Nutzer (protokolliert).</p>
      </section>

      <section className="card space-y-2" aria-label="Beweise">
        <h2 className="font-semibold">Beweise für das Stripe-Dashboard</h2>
        {evidence.mandateAcceptedAt ? (
          <p>
            Mandat angenommen am {formatDateTime(evidence.mandateAcceptedAt)} Uhr.
            {evidence.mandateText && <span className="block text-sm text-muted">Text: {evidence.mandateText}</span>}
          </p>
        ) : (
          <p className="text-muted">{payer?.deleted ? "Mandat nach der Kontolöschung entfernt." : "Kein gespeichertes Mandat gefunden."}</p>
        )}
        {evidence.coverAcceptedAt && <p>Zusatz „Anteil übernehmen“ ({evidence.coverMandate}) angenommen am {formatDateTime(evidence.coverAcceptedAt)} Uhr.</p>}
        <p>Teilnahme: {evidence.joinedAt ? `beigetreten ${formatDateTime(evidence.joinedAt)} Uhr` : "–"}{evidence.readyAt ? `, bereit ${formatDateTime(evidence.readyAt)} Uhr` : ""}</p>
        <p>Beleg: {evidence.receiptNumber ? `${evidence.receiptNumber}, ${evidence.receiptIssuedAt ? formatDateTime(evidence.receiptIssuedAt) + " Uhr" : ""}` : "–"}</p>
      </section>

      <section className="space-y-2" aria-label="Buchungen">
        <h2 className="font-semibold">Buchungen zu diesem Streit</h2>
        {entries.length === 0 ? (
          <p className="card text-muted">Noch keine Abzüge oder Rückbuchungen von Stripe.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li key={e.id} className="card flex flex-wrap items-center justify-between gap-2" data-testid="dispute-entry">
                <span>
                  {KIND[e.kind]}: {formatEuro(e.amountCents)}
                  {e.feeCents > 0 && <span className="text-sm text-muted"> · Gebühr {formatEuro(e.feeCents)}</span>}
                </span>
                <span className="text-sm">
                  {ENTRY_STATUS[e.status]}
                  {e.status === "rejected" && e.rejectReason && ` (${REJECT[e.rejectReason] ?? e.rejectReason})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
