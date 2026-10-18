import type { Metadata } from "next";
import { ActionForm } from "@/components/ActionForm";
import { CITIES } from "@/lib/validation";
import { formatEuro } from "@/lib/money";
import { addPriceRuleAction, createVenueAction, toggleVenueAction } from "@/server/admin-finance-actions";
import { can } from "@/lib/roles";
import { requirePermission } from "@/server/session";
import { listPriceRules, listVenues } from "@/server/venues";

export const metadata: Metadata = { title: "Admin: Hallen und Preise" };

function PriceForm({ venueId, canEdit }: { venueId: string | null; canEdit: boolean }) {
  if (!canEdit) return null;
  const idSuffix = venueId ?? "default";
  return (
    <ActionForm action={addPriceRuleAction.bind(null, venueId)} submit="Preisregel hinzufügen" className="grid grid-cols-2 gap-2">
      <div>
        <label className="label" htmlFor={`dur-${idSuffix}`}>Dauer</label>
        <select id={`dur-${idSuffix}`} name="duration" className="field">
          <option value="60">60 Minuten</option>
          <option value="90">90 Minuten</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`from-${idSuffix}`}>Gültig ab</label>
        <input id={`from-${idSuffix}`} name="validFrom" type="date" className="field" />
      </div>
      <div>
        <label className="label" htmlFor={`price-${idSuffix}`}>Spieler zahlen (Euro)</label>
        <input id={`price-${idSuffix}`} name="price" className="field" required placeholder="80,00" />
      </div>
      <div>
        <label className="label" htmlFor={`cost-${idSuffix}`}>Halle kostet uns (Euro)</label>
        <input id={`cost-${idSuffix}`} name="cost" className="field" required placeholder="80,00" />
      </div>
    </ActionForm>
  );
}

async function Rules({ venueId }: { venueId: string | null }) {
  const rules = await listPriceRules(venueId);
  if (rules.length === 0) return <p className="text-sm text-muted">Keine eigenen Preisregeln{venueId ? " (es gelten die Standardpreise)" : ""}.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {rules.map((r) => (
        <li key={r.id} className="flex justify-between gap-2">
          <span>{r.durationMin} Min ab {r.validFrom}</span>
          <span>Spieler {formatEuro(r.priceCents)} · Kosten {formatEuro(r.costCents)} · Marge {formatEuro(r.priceCents - r.costCents)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function VenuesPage() {
  const user = await requirePermission("booking", "/admin/hallen");
  const canPrices = can(user.role, "finance");
  const venues = await listVenues();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hallen und Preise</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Standardpreise</h2>
        <p className="text-sm text-muted">Gelten, wenn für eine Halle keine eigene Regel hinterlegt ist. Die jüngste gültige Regel zählt.</p>
        <div className="card space-y-3">
          <Rules venueId={null} />
          <PriceForm venueId={null} canEdit={canPrices} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Neue Halle</h2>
        <ActionForm action={createVenueAction} submit="Halle anlegen">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="field" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="city">Stadt</label>
              <select id="city" name="city" className="field" defaultValue="Gelsenkirchen">
                {CITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="surface">Boden</label>
              <input id="surface" name="surface" className="field" placeholder="Kunstrasen, Parkett, …" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="address">Adresse</label>
            <input id="address" name="address" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="contact">Kontakt (Telefon, Mail, Webseite)</label>
            <input id="contact" name="contact" className="field" />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="hasShowers" className="size-5 accent-green" /> Duschen</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="hasParking" className="size-5 accent-green" /> Parkplätze</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="isPartner" className="size-5 accent-green" /> Partnerhalle</label>
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Alle Hallen</h2>
        {venues.length === 0 ? (
          <p className="card text-muted">Noch keine Hallen.</p>
        ) : (
          <ul className="space-y-3">
            {venues.map((v) => (
              <li key={v.id} className="card space-y-2" data-testid={`venue-${v.name}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{v.name} <span className="text-sm font-normal text-muted">{v.city}</span></span>
                  <span className={`text-xs ${v.active ? "text-green" : "text-muted"}`}>{v.active ? (v.isPartner ? "Partnerhalle" : "aktiv") : "inaktiv"}</span>
                </div>
                <p className="text-xs text-muted">{[v.address, v.surface, v.contact, v.hasShowers && "Duschen", v.hasParking && "Parkplätze"].filter(Boolean).join(" · ")}</p>
                <Rules venueId={v.id} />
                <PriceForm venueId={v.id} canEdit={canPrices} />
                <ActionForm action={toggleVenueAction.bind(null, v.id, !v.active)} submit={v.active ? "Deaktivieren" : "Aktivieren"} className="space-y-2" keepOnSuccess danger={v.active} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
