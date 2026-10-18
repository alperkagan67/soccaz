import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { formatEuro } from "@/lib/money";
import { recordExpenseAction } from "@/server/admin-finance-actions";
import { currentMonth, listExpenses, monthPeriod } from "@/server/finance";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Ausgaben" };

export default async function ExpensesPage({ searchParams }: PageProps<"/admin/finanzen/ausgaben">) {
  await requirePermission("finance", "/admin/finanzen/ausgaben");
  const sp = await searchParams;
  const raw = Array.isArray(sp.monat) ? sp.monat[0] : sp.monat;
  const month = raw && monthPeriod(raw) ? raw : currentMonth();
  const rows = await listExpenses(monthPeriod(month)!);
  const total = rows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted"><Link href="/admin/finanzen" className="underline">Finanzen</Link> / Ausgaben</p>
        <h1 className="text-2xl font-bold">Ausgaben</h1>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ausgabe erfassen</h2>
        <ActionForm action={recordExpenseAction} submit="Ausgabe buchen">
          <div>
            <label className="label" htmlFor="kind">Art</label>
            <select id="kind" name="kind" className="field">
              <option value="venue">Hallenmiete</option>
              <option value="other">Sonstiges (Werbung, Gebühren, …)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="amount">Betrag in Euro</label>
            <input id="amount" name="amount" className="field" required placeholder="80,00" />
          </div>
          <div>
            <label className="label" htmlFor="paidOn">Bezahlt am</label>
            <input id="paidOn" name="paidOn" type="date" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="note">Notiz</label>
            <input id="note" name="note" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="receiptUrl">Beleg (Link, optional)</label>
            <input id="receiptUrl" name="receiptUrl" className="field" placeholder="https://" />
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <form className="flex items-end gap-2" method="get">
          <div className="flex-1">
            <label className="label" htmlFor="monat">Monat</label>
            <input id="monat" name="monat" type="month" defaultValue={month} className="field" />
          </div>
          <button className="btn btn-ghost">Anzeigen</button>
        </form>
        <p className="text-sm text-muted">{rows.length} Ausgaben, zusammen <strong className="text-ink">{formatEuro(total)}</strong></p>
        {rows.length === 0 ? (
          <p className="card text-muted">Keine Ausgaben in diesem Monat.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="card flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{r.kind === "venue" ? "Hallenmiete" : "Sonstiges"}{r.note ? `: ${r.note}` : ""}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.paidOn}
                    {r.homeName && r.matchId && (
                      <>
                        {" · "}
                        <Link href={`/admin/finanzen/spiel/${r.matchId}`} className="underline">{r.homeName} gegen {r.awayName}</Link>
                      </>
                    )}
                    {r.receiptUrl && (
                      <>
                        {" · "}
                        <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="underline">Beleg</a>
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatEuro(r.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
