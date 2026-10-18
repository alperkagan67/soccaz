import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { activeProvider } from "@/server/payments";
import { requirePermission } from "@/server/session";
import { savePlatformSettingsAction } from "@/server/admin-finance-actions";
import { minPaidPlayers, paymentsEnabled } from "@/server/settings";

export const metadata: Metadata = { title: "Admin: Einstellungen" };

export default async function SettingsAdminPage() {
  await requirePermission("admin", "/admin/einstellungen");
  const [enabled, minPaid] = await Promise.all([paymentsEnabled(), minPaidPlayers()]);
  const provider = activeProvider();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Einstellungen</h1>
      <ActionForm action={savePlatformSettingsAction} submit="Speichern" keepOnSuccess>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="paymentsEnabled" defaultChecked={enabled} className="mt-1 size-5 accent-green" />
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
      </ActionForm>
      <p className="card text-sm text-muted">
        Zahlungsanbieter: <strong className="text-ink">{provider === "stripe" ? "Stripe (Karte, PayPal, SEPA)" : provider === "dev" ? "Test-Anbieter (kein echtes Geld)" : "nicht eingerichtet"}</strong>.
        {provider !== "stripe" && " Für echte Zahlungen müssen STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET gesetzt sein (siehe docs/BETRIEB.md)."}
      </p>
    </div>
  );
}
