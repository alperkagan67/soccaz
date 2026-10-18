import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { matchEntries, matchHeader, playerFinance } from "@/server/finance";
import { manualRefundAction, recordExpenseAction } from "@/server/admin-finance-actions";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Spiel-Finanzen" };

const KIND: Record<string, string> = { topup: "Aufladung", fee: "Gebühr", promo_credit: "Bonus", match_share: "Startgebühr", refund: "Erstattung", venue_cost: "Hallenkosten", adjustment: "Korrektur", chargeback: "Rückbuchung" };

export default async function MatchFinancePage({ params }: PageProps<"/admin/finanzen/spiel/[id]">) {
  const { id } = await params;
  await requirePermission("finance", `/admin/finanzen/spiel/${id}`);
  const header = await matchHeader(id);
  if (!header) notFound();
  const [players, entries] = await Promise.all([playerFinance(id), matchEntries(id)]);
  const revenue = players.reduce((s, p) => s + p.netCents, 0);
  const cost = entries.filter((e) => e.kind === "venue_cost").reduce((s, e) => s + e.amountCents, 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted"><Link href="/admin/finanzen" className="underline">Finanzen</Link> / Spiel</p>
        <h1 className="text-2xl font-bold">{header.home} gegen {header.away}</h1>
        <p className="text-muted">
          {formatDateTime(header.startsAt)} Uhr · Status {header.status}
          {header.priceCents !== null && ` · Hallenpreis ${formatEuro(header.priceCents)}`}
          {header.costCents !== null && ` · Kosten laut Regel ${formatEuro(header.costCents)}`}
          {header.finalShareCents ? ` · Anteil ${formatEuro(header.finalShareCents)}` : " · nicht abgerechnet"}
        </p>
      </header>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="card"><dt className="text-xs text-muted">Einnahmen</dt><dd className="font-bold">{formatEuro(revenue)}</dd></div>
        <div className="card"><dt className="text-xs text-muted">Hallenkosten</dt><dd className="font-bold">{formatEuro(cost)}</dd></div>
        <div className="card"><dt className="text-xs text-muted">Marge</dt><dd className={`font-bold ${revenue - cost < 0 ? "text-coral" : "text-green"}`}>{formatEuro(revenue - cost)}</dd></div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Spieler</h2>
        {players.length === 0 ? (
          <p className="card text-muted">Niemand hat bezahlt.</p>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li key={p.userId} className="card space-y-2" data-testid={`player-${p.email}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.name} <span className="text-xs text-muted">{p.email}</span></span>
                  <span className="text-sm">
                    bezahlt {formatEuro(p.paidCents)} · zurück {formatEuro(p.refundedCents)} · <strong>netto {formatEuro(p.netCents)}</strong>
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {p.inLobby ? (p.hasPaidNow ? "In der Lobby, Anteil bezahlt" : "In der Lobby, offen") : "Nicht mehr in der Lobby"}
                  {p.pendingRefundCents > 0 && ` · Erstattung ${formatEuro(p.pendingRefundCents)} offen (wartet auf Ersatz)`}
                </p>
                {p.netCents > 0 && (
                  <ActionForm action={manualRefundAction.bind(null, id, p.userId)} submit="Ausnahme-Erstattung buchen" className="grid grid-cols-[1fr_2fr_auto] items-end gap-2" successText="Erstattet." keepOnSuccess>
                    <div>
                      <label className="label" htmlFor={`amt-${p.userId}`}>Betrag</label>
                      <input id={`amt-${p.userId}`} name="amount" className="field" defaultValue={(p.netCents / 100).toFixed(2).replace(".", ",")} />
                    </div>
                    <div>
                      <label className="label" htmlFor={`why-${p.userId}`}>Grund</label>
                      <input id={`why-${p.userId}`} name="reason" className="field" required minLength={3} />
                    </div>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ausgabe zu diesem Spiel</h2>
        <ActionForm action={recordExpenseAction} submit="Ausgabe buchen">
          <input type="hidden" name="matchId" value={id} />
          <input type="hidden" name="kind" value="venue" />
          <div>
            <label className="label" htmlFor="amount">Betrag in Euro</label>
            <input id="amount" name="amount" className="field" required placeholder="80,00" />
          </div>
          <div>
            <label className="label" htmlFor="note">Notiz</label>
            <input id="note" name="note" className="field" placeholder="Hallenmiete Soccerhalle Buer" />
          </div>
          <div>
            <label className="label" htmlFor="receiptUrl">Beleg (Link, optional)</label>
            <input id="receiptUrl" name="receiptUrl" className="field" placeholder="https://" />
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Buchungen</h2>
        <ul className="space-y-1 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="card flex items-center justify-between gap-3 !p-2">
              <span className="min-w-0 truncate">{KIND[e.kind] ?? e.kind}{e.userName ? ` · ${e.userName}` : ""} <span className="text-xs text-muted">({e.debit} an {e.credit}{e.reason ? `, ${e.reason}` : ""})</span></span>
              <span className="shrink-0 tabular-nums">{formatEuro(e.amountCents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
