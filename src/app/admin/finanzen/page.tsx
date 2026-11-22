import type { Metadata } from "next";
import { safeInternalPath } from "@/lib/safe-path";
import Link from "next/link";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { currentMonth, getAlerts, listMatchFinance, monthPeriod, overview, venueCommissionOverview } from "@/server/finance";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Finanzen" };

export default async function FinancePage({ searchParams }: PageProps<"/admin/finanzen">) {
  await requirePermission("finance", "/admin/finanzen");
  const sp = await searchParams;
  const raw = Array.isArray(sp.monat) ? sp.monat[0] : sp.monat;
  const month = raw && monthPeriod(raw) ? raw : currentMonth();
  const period = monthPeriod(month)!;

  const [o, alerts, matchRows, venueRows] = await Promise.all([overview(period), getAlerts(), listMatchFinance(period), venueCommissionOverview(period)]);
  const cards: [string, number, string?][] = [
    ["Einnahmen (netto nach Erstattungen)", o.revenueCents],
    ["Hallenkosten", o.venueCostCents],
    ["Zahlungsgebühren", o.feesCents],
    ["Rabatt-Boni", o.promoCents],
    ["Marge", o.marginCents, o.marginCents < 0 ? "text-ink" : "text-accent-fg"],
    ["Aufladungen", o.topupsCents],
    ["Erstattungen", o.refundsCents],
    ["Offene Guthaben (Schuld an Spieler)", o.liabilityCents],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Finanzen</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/finanzen/ausgaben" className="btn btn-ghost !min-h-9">Ausgaben</Link>
          <a href={`/admin/finanzen/export?monat=${month}`} className="btn btn-ghost !min-h-9">CSV für {month}</a>
        </div>
      </div>

      <form className="card flex items-end gap-2" method="get">
        <div className="flex-1">
          <label className="label" htmlFor="monat">Monat</label>
          <input id="monat" name="monat" type="month" defaultValue={month} className="field" />
        </div>
        <button className="btn btn-primary">Anzeigen</button>
      </form>

      <section className="space-y-2" aria-label="Alarme">
        <h2 className="text-lg font-semibold">Alarme {alerts.length > 0 && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-ink">{alerts.length}</span>}</h2>
        {alerts.length === 0 ? (
          <p className="card text-muted">Keine Auffälligkeiten.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.code} className={`card ${a.severity === "high" ? "border-ink" : "border-ink"}`}>
                <p className="font-semibold">{a.title}</p>
                <p className="text-sm text-muted">{a.detail}</p>
                {safeInternalPath(a.href, null) && <Link href={safeInternalPath(a.href, null)!} className="text-sm underline">Ansehen</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Kennzahlen">
        <dl className="grid grid-cols-2 gap-3">
          {cards.map(([label, value, tone]) => (
            <div key={label} className="card">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className={`font-heading text-xl font-bold tabular-nums ${tone ?? ""}`}>{formatEuro(value)}</dd>
            </div>
          ))}
          <div className="card">
            <dt className="text-xs text-muted">Gespielte Spiele</dt>
            <dd className="font-heading text-xl font-bold tabular-nums">{o.playedMatches}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-2" aria-label="Provision je Halle">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Provision je Halle</h2>
          <Link href="/admin/finanzen/rechnungen" className="text-sm underline underline-offset-4">Rechnungen</Link>
        </div>
        {venueRows.length === 0 ? (
          <p className="card text-muted" data-testid="no-venue-commission">Noch keine Spiele im Provisionsmodell.</p>
        ) : (
          <ul className="space-y-2">
            {venueRows.map((h) => (
              <li key={h.venueId} className="card flex flex-wrap items-center justify-between gap-2" data-testid="venue-commission">
                <span className="font-semibold">{h.name}</span>
                <span className="text-sm tabular-nums">
                  Provision {formatEuro(h.commissionCents)} · Zahlungsgebühren {formatEuro(h.feesCents)} · Rest {formatEuro(h.restCents)}
                  {h.minus && <strong className="ml-2 text-danger" data-testid="venue-minus">Halle im Minus: Die Provision deckt die Gebühren nicht.</strong>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-label="Spiele">
        <h2 className="text-lg font-semibold">Spiele im Monat</h2>
        {matchRows.length === 0 ? (
          <p className="card text-muted">Keine Spiele mit Buchungen in diesem Monat.</p>
        ) : (
          <ul className="space-y-2">
            {matchRows.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/finanzen/spiel/${m.id}`} className="card flex items-center justify-between gap-3 hover:border-accent">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{m.homeName} gegen {m.awayName}</span>
                    <span className="block text-xs text-muted">{formatDateTime(m.startsAt)} Uhr · {m.payers} Zahler{m.finalShareCents ? ` · Anteil ${formatEuro(m.finalShareCents)}` : " · nicht abgerechnet"}</span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="block">{formatEuro(m.revenueCents)} − {formatEuro(m.costCents)}</span>
                    <span className={`block font-semibold ${m.marginCents < 0 ? "text-ink" : "text-accent-fg"}`}>{formatEuro(m.marginCents)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
