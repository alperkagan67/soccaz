import type { Metadata } from "next";
import Link from "next/link";
import { Pager } from "@/components/Pager";
import { DISPUTE_STATUS_LABEL } from "@/lib/dispute-labels";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { listDisputes } from "@/server/payments/dispute-admin";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Zahlungsstreit" };

export default async function DisputesPage({ searchParams }: PageProps<"/admin/zahlungsstreit">) {
  await requirePermission("admin", "/admin/zahlungsstreit");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const all = one(sp.alle) === "1";
  const page = Number(one(sp.page)) || 1;
  const { rows, hasMore } = await listDisputes({ onlyOpen: !all, page });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Zahlungsstreit</h1>
        <p className="text-sm text-muted">
          Angefochtene Kartenzahlungen. Es gibt keine automatische Sperre; Beweise reichst du im Stripe-Dashboard ein (Frist beachten). Eine Sperre setzt nur Admin 1 von Hand unter{" "}
          <Link href="/admin/nutzer" className="underline">Nutzer</Link>.
        </p>
      </header>

      <nav aria-label="Filter" className="flex gap-2 text-sm">
        <Link href="/admin/zahlungsstreit" className={`btn ${all ? "btn-ghost" : "btn-primary"} !min-h-9`} aria-current={all ? undefined : "page"}>Offene</Link>
        <Link href="/admin/zahlungsstreit?alle=1" className={`btn ${all ? "btn-primary" : "btn-ghost"} !min-h-9`} aria-current={all ? "page" : undefined}>Alle</Link>
      </nav>

      {rows.length === 0 ? (
        <p className="card text-muted" data-testid="disputes-empty">{all ? "Noch kein Zahlungsstreit." : "Keine offenen Zahlungsstreite."}</p>
      ) : (
        <ul className="space-y-2" data-testid="disputes-list">
          {rows.map((d) => (
            <li key={d.id}>
              <Link href={`/admin/zahlungsstreit/${d.id}`} className={`card block hover:border-accent ${d.open ? "border-ink" : ""}`} data-testid={`dispute-${d.disputeId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {formatEuro(d.amountCents)} · {d.payerName ?? "Zahler unbekannt"}
                  </p>
                  <span className={`rounded px-2 py-0.5 text-xs ${d.open ? "bg-ink text-bg" : "bg-panel text-muted"}`}>{DISPUTE_STATUS_LABEL[d.status] ?? d.status}</span>
                </div>
                <p className="text-sm text-muted">
                  {d.matchLabel ?? "Zahlung nicht zugeordnet"} · Eingang {formatDateTime(d.createdAt)}
                  {d.open && d.evidenceDueBy && ` · Beweise bis ${formatDateTime(d.evidenceDueBy)}`}
                </p>
                {(d.refundConflict || d.rejectedEntries > 0 || !d.matchId) && (
                  <p className="mt-1 text-sm">
                    {d.refundConflict && <span className="mr-2">Doppelverlust {formatEuro(d.doubleLossCents)} (Erstattung war schon gesendet)</span>}
                    {d.rejectedEntries > 0 && <span className="mr-2">{d.rejectedEntries} Betrag nicht gebucht</span>}
                    {!d.matchId && <span>Keine passende Zahlung gefunden</span>}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager path="/admin/zahlungsstreit" params={{ alle: all ? "1" : undefined }} page={page} hasMore={hasMore} />
    </div>
  );
}
