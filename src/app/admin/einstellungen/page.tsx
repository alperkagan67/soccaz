import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { activeProvider } from "@/server/payments";
import { requirePermission } from "@/server/session";
import { saveInvoiceSettingsAction, savePlatformSettingsAction, setCardSwitchAction } from "@/server/admin-finance-actions";
import { formatDateTime } from "@/lib/time";
import { getCardSwitch } from "@/server/payment-switch";
import { getSetting, minPaidPlayers, paymentsEnabled } from "@/server/settings";

export const metadata: Metadata = { title: "Admin: Einstellungen" };

export default async function SettingsAdminPage() {
  await requirePermission("owner", "/admin/einstellungen");
  const [enabled, minPaid, emergency, vatMode, vatNote] = await Promise.all([paymentsEnabled(), minPaidPlayers(), getSetting<string>("emergency_phone", ""), getSetting<string | number>("vat_mode", ""), getSetting<string>("vat_note", "")]);
  const provider = activeProvider();
  const cardSwitch = await getCardSwitch();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <ActionForm action={savePlatformSettingsAction} submit="Speichern" keepOnSuccess>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="paymentsEnabled" defaultChecked={enabled} className="mt-1 size-5 accent-accent" />
          <span>
            <span className="block font-semibold">Zahlungen einschalten</span>
            <span className="block text-sm text-muted">
              Aus: Spiele sind kostenlos. An: Der Anteil wird zur Frist abgerechnet.
              Das Umschalten wirkt nur für neue Reservierungen. Schon bezahlte Spiele bleiben unverändert.
            </span>
          </span>
        </label>
        <div>
          <label className="label" htmlFor="minPaid">Mindestzahl zahlender Spieler</label>
          <input id="minPaid" name="minPaid" type="number" min={2} max={12} defaultValue={minPaid} className="field" />
          <p className="mt-1 text-xs text-muted">Der Hallenpreis wird höchstens durch diese Zahl geteilt. Beim Bereitmachen wird dieser höchste Anteil reserviert.</p>
        </div>
        <div>
          <label className="label" htmlFor="emergencyPhone">Notfallnummer des Betreibers</label>
          <input id="emergencyPhone" name="emergencyPhone" type="tel" maxLength={40} defaultValue={emergency} className="field" placeholder="+49 …" />
          <p className="mt-1 text-xs text-muted">Steht in der Spielübersicht beider Teams, falls am Spieltag etwas schiefgeht.</p>
        </div>
      </ActionForm>
      <section className="card space-y-3" aria-labelledby="card-switch-title" data-testid="card-switch">
        <h2 id="card-switch-title" className="font-semibold">Notabschaltung Kartenzahlung</h2>
        <p className="text-sm" data-testid="card-switch-state">
          Die Kartenzahlung ist <strong>{cardSwitch.enabled ? "EIN" : "AUS"}</strong>
          {cardSwitch.neverSwitched ? " (Standard, noch nie geschaltet)" : cardSwitch.since ? ` seit ${formatDateTime(cardSwitch.since)} Uhr` : ""}.
        </p>
        {cardSwitch.enabled ? (
          <ActionForm action={setCardSwitchAction.bind(null, false)} submit="Kartenzahlung ausschalten (Notabschaltung)" danger successText="Kartenzahlung ausgeschaltet." keepOnSuccess>
            <p className="text-sm text-muted" data-testid="card-switch-consequence-off">
              Folgen (bei eingeschalteten Zahlungen): Neue Bezahlungen werden pausiert. Neue Spieler können beitreten, aber nicht „Bereit“ melden (Hinweis: beim Support melden), nichts wird kostenlos. Turniere zeigen „Zahlungen sind gerade pausiert“, frieren ein, Alarm nach 6 Stunden. Bestehende bezahlte Plätze bleiben unverändert, fällige Abbuchungen warten.
            </p>
            <div>
              <label className="label" htmlFor="card-off-reason">Grund (3 bis 200 Zeichen, wird protokolliert)</label>
              <textarea id="card-off-reason" name="reason" className="field" rows={2} minLength={3} maxLength={200} required />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" required className="mt-1 size-5 accent-accent" />
              <span>Ich habe die Folgen gelesen und schalte die Kartenzahlung aus.</span>
            </label>
          </ActionForm>
        ) : (
          <ActionForm action={setCardSwitchAction.bind(null, true)} submit="Kartenzahlung wieder einschalten" successText="Kartenzahlung eingeschaltet." keepOnSuccess>
            <p className="text-sm text-muted" data-testid="card-switch-consequence-on">
              Folgen: Fällige Abbuchungen laufen nach, eingefrorene Turniere werden fortgesetzt. Vorher prüfen: Webhook, Schlüssel und offene Fälle (GO-LIVE G8-012/G9-012).
            </p>
            <div>
              <label className="label" htmlFor="card-on-reason">Grund (3 bis 200 Zeichen, wird protokolliert)</label>
              <textarea id="card-on-reason" name="reason" className="field" rows={2} minLength={3} maxLength={200} required />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirm" required className="mt-1 size-5 accent-accent" />
              <span>Ich habe die Folgen gelesen und schalte die Kartenzahlung ein.</span>
            </label>
          </ActionForm>
        )}
      </section>
      <ActionForm action={saveInvoiceSettingsAction} submit="Rechnungseinstellungen übernehmen" keepOnSuccess>
        <h2 className="font-semibold">Rechnungen an die Hallen</h2>
        <div>
          <label className="label" htmlFor="vatMode">Umsatzsteuer</label>
          <select id="vatMode" name="vatMode" className="field" defaultValue={vatMode === undefined || vatMode === null ? "" : String(vatMode)} data-testid="vat-mode">
            <option value="" disabled>Bitte wählen (kein Standardwert)</option>
            <option value="19">19 % Umsatzsteuer</option>
            <option value="kleinunternehmer">Kleinunternehmer, ohne Umsatzsteuer</option>
          </select>
          <p className="mt-1 text-xs text-muted">Ohne gesetzten Schalter werden keine Rechnungen erzeugt. Die Wahl und den Wortlaut klärt der Steuerberater.</p>
        </div>
        <div>
          <label className="label" htmlFor="vatNote">Hinweistext auf der Rechnung</label>
          <textarea id="vatNote" name="vatNote" className="field" rows={3} maxLength={600} defaultValue={vatNote ?? ""} />
          <p className="mt-1 text-xs text-muted">Pflicht bei Kleinunternehmer. Der Wortlaut kommt vom Steuerberater.</p>
        </div>
      </ActionForm>
      <p className="card text-sm text-muted">
        Zahlungsanbieter: <strong className="text-ink">{provider === "stripe" ? "Stripe (Karte, PayPal, SEPA)" : provider === "dev" ? "Test-Anbieter (kein echtes Geld)" : "nicht eingerichtet"}</strong>.
        {provider !== "stripe" && " Für echte Zahlungen müssen STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET gesetzt sein (siehe docs/BETRIEB.md)."}
      </p>
    </div>
  );
}
