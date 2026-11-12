import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { activeProvider } from "@/server/payments";
import { requirePermission } from "@/server/session";
import { saveInvoiceSettingsAction, savePlatformSettingsAction } from "@/server/admin-finance-actions";
import { getSetting, minPaidPlayers, paymentsEnabled } from "@/server/settings";

export const metadata: Metadata = { title: "Admin: Einstellungen" };

export default async function SettingsAdminPage() {
  await requirePermission("owner", "/admin/einstellungen");
  const [enabled, minPaid, emergency, vatMode, vatNote] = await Promise.all([paymentsEnabled(), minPaidPlayers(), getSetting<string>("emergency_phone", ""), getSetting<string | number>("vat_mode", ""), getSetting<string>("vat_note", "")]);
  const provider = activeProvider();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <ActionForm action={savePlatformSettingsAction} submit="Speichern" keepOnSuccess>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="paymentsEnabled" defaultChecked={enabled} className="mt-1 size-5 accent-accent" />
          <span>
            <span className="block font-semibold">Zahlungen einschalten</span>
            <span className="block text-sm text-muted">
              Aus: Spiele sind kostenlos. An: Wer bereit sein will, zahlt seinen Anteil aus dem Guthaben.
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
