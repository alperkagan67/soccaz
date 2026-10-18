import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { createPromoAction } from "@/server/admin-finance-actions";
import { listPromos } from "@/server/promo";
import { requirePermission } from "@/server/session";
import { PromoToggle } from "./PromoToggle";

export const metadata: Metadata = { title: "Admin: Rabattcodes" };

export default async function PromoPage() {
  await requirePermission("finance", "/admin/codes");
  const codes = await listPromos();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rabattcodes</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Neuer Code</h2>
        <ActionForm action={createPromoAction} submit="Code anlegen">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label" htmlFor="code">Code</label>
              <input id="code" name="code" className="field uppercase" required placeholder="WILLKOMMEN10" maxLength={24} />
            </div>
            <div>
              <label className="label" htmlFor="kind">Art</label>
              <select id="kind" name="kind" className="field">
                <option value="percent">Prozent der Aufladung</option>
                <option value="fixed">Fester Betrag</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="value">Wert (Prozent oder Euro)</label>
              <input id="value" name="value" className="field" required placeholder="10" />
            </div>
            <div>
              <label className="label" htmlFor="minTopup">Mindestaufladung (Euro)</label>
              <input id="minTopup" name="minTopup" className="field" placeholder="0,00" />
            </div>
            <div>
              <label className="label" htmlFor="maxBonus">Höchstbonus (Euro)</label>
              <input id="maxBonus" name="maxBonus" className="field" placeholder="ohne Grenze" />
            </div>
            <div>
              <label className="label" htmlFor="budget">Gesamtbudget (Euro)</label>
              <input id="budget" name="budget" className="field" placeholder="ohne Grenze" />
            </div>
            <div>
              <label className="label" htmlFor="maxPerUser">Einlösungen pro Nutzer</label>
              <input id="maxPerUser" name="maxPerUser" type="number" min={1} defaultValue={1} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="validFrom">Gültig ab</label>
              <input id="validFrom" name="validFrom" type="datetime-local" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="validUntil">Gültig bis</label>
              <input id="validUntil" name="validUntil" type="datetime-local" className="field" />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="newUsersOnly" className="size-5 accent-green" /> Nur für die erste Aufladung</label>
          <div>
            <label className="label" htmlFor="note">Notiz (intern)</label>
            <input id="note" name="note" className="field" />
          </div>
        </ActionForm>
        <p className="text-xs text-muted">Das Budget begrenzt die Summe aller ausgezahlten Boni. Ist es aufgebraucht, wird der Code abgelehnt.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Alle Codes</h2>
        {codes.length === 0 ? (
          <p className="card text-muted">Noch keine Codes.</p>
        ) : (
          <ul className="space-y-2">
            {codes.map((c) => (
              <li key={c.id} className="card space-y-1" data-testid={`promo-${c.code}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{c.code} <span className="text-sm font-normal text-muted">{c.kind === "percent" ? `${c.value} %` : formatEuro(c.value)}</span></span>
                  <span className={`text-xs ${c.active ? "text-green" : "text-muted"}`}>{c.active ? "aktiv" : "inaktiv"}</span>
                </div>
                <p className="text-xs text-muted">
                  Verbraucht {formatEuro(c.usedCents)}{c.budgetCents !== null ? ` von ${formatEuro(c.budgetCents)}` : ""}
                  {c.maxBonusCents !== null ? ` · max. Bonus ${formatEuro(c.maxBonusCents)}` : ""}
                  {c.minTopupCents ? ` · ab ${formatEuro(c.minTopupCents)}` : ""}
                  {c.newUsersOnly ? " · nur Neukunden" : ""} · {c.maxPerUser}x pro Nutzer
                  {c.validUntil ? ` · bis ${formatDateTime(c.validUntil)} Uhr` : ""}
                </p>
                <PromoToggle id={c.id} active={c.active} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
