import type { Metadata } from "next";
import { formatEuro } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { listInvoices } from "@/server/invoices";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Rechnungen" };

/** Monatsrechnungen über die Provision an die Hallen (Vertrag 009 M2). Nur Admin 1. */
export default async function InvoicesPage() {
  await requirePermission("finance", "/admin/finanzen/rechnungen");
  const rows = await listInvoices();
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Rechnungen</h1>
      <p className="text-sm text-muted">Am 1. jedes Monats entsteht je Halle eine Sammelrechnung über die Provision des Vormonats. Sie enthält je Spiel eine Zeile und den 10er-Bonus als eigene Zeile.</p>
      {rows.length === 0 ? (
        <p className="card text-muted" data-testid="no-invoices">Noch keine Rechnungen.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-2" data-testid="invoice">
              <span>
                <span className="font-semibold">{r.number}</span> · {r.venueName} · {r.period}
                <span className="block text-sm text-muted">
                  Netto {formatEuro(r.netCents)}, USt {formatEuro(r.vatCents)}, brutto {formatEuro(r.grossCents)} · ausgestellt {formatDate(r.issuedAt)}
                </span>
              </span>
              <a className="btn btn-ghost !min-h-9 !px-3 text-sm" href={`/api/rechnungen/${r.id}`}>PDF</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
