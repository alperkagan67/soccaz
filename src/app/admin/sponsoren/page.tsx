import type { Metadata } from "next";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { assignJerseyAction, createSponsorAction, toggleSponsorAction } from "@/server/league-actions";
import { requirePermission } from "@/server/session";
import { listSponsors } from "@/server/sponsors";

export const metadata: Metadata = { title: "Admin: Sponsoren" };

export default async function AdminSponsorsPage() {
  await requirePermission("admin", "/admin/sponsoren");
  const list = await listSponsors();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sponsoren und Trikot-Partner</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Neu</h2>
        <ActionForm action={createSponsorAction} submit="Anlegen">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="name">Name</label>
              <input id="name" name="name" className="field" required maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="kind">Art</label>
              <select id="kind" name="kind" className="field">
                <option value="sponsor">Sponsor (Startseite)</option>
                <option value="jersey">Trikot-Partner (Teamseite)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="url">Adresse (https)</label>
              <input id="url" name="url" className="field" required placeholder="https://beispiel.de" />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="tagline">Kurztext (optional)</label>
              <input id="tagline" name="tagline" className="field" maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="startsOn">Laufzeit ab</label>
              <input id="startsOn" name="startsOn" type="date" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="endsOn">bis</label>
              <input id="endsOn" name="endsOn" type="date" className="field" />
            </div>
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        {list.length === 0 && <p className="card text-muted">Noch keine Sponsoren.</p>}
        {list.map((s) => (
          <div key={s.id} className="card space-y-2" data-testid="admin-sponsor">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="font-semibold">{s.name}</span>
                <span className="block text-xs text-muted">
                  {s.kind === "jersey" ? "Trikot-Partner" : "Sponsor"} · {s.clicks} Klicks · {s.active ? "aktiv" : "pausiert"}
                </span>
              </span>
              <ActionButton action={toggleSponsorAction.bind(null, s.id, !s.active)} label={s.active ? "Pausieren" : "Aktivieren"} />
            </div>
            {s.kind === "jersey" && (
              <ActionForm action={assignJerseyAction.bind(null, s.id)} submit="Team zuordnen" className="space-y-2">
                <label className="label" htmlFor={`slug-${s.id}`}>Team (Name aus der Adresse)</label>
                <input id={`slug-${s.id}`} name="slug" className="field" required />
              </ActionForm>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
