import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { formatDateTime } from "@/lib/time";
import { CITIES } from "@/lib/validation";
import { cancelProEventAction, createProEventAction, drawProEventAction } from "@/server/league-actions";
import { listProEvents } from "@/server/pro-events";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Profi-Tag" };

export default async function AdminProDayPage() {
  await requirePermission("admin", "/admin/profitag");
  const events = await listProEvents();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profi-Tag</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Neuer Profi-Tag</h2>
        <ActionForm action={createProEventAction} submit="Profi-Tag anlegen">
          <div>
            <label className="label" htmlFor="title">Titel</label>
            <input id="title" name="title" className="field" required maxLength={80} placeholder="Profi-Tag im Dezember" />
          </div>
          <div>
            <label className="label" htmlFor="proSlug">Profi-Team (Name aus der Adresse, muss verifiziert sein)</label>
            <input id="proSlug" name="proSlug" className="field" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="city">Stadt</label>
              <select id="city" name="city" className="field">
                {CITIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="slots">Plätze</label>
              <input id="slots" name="slots" type="number" min={1} max={12} defaultValue={4} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="startsAt">Beginn (deutsche Zeit)</label>
              <input id="startsAt" name="startsAt" type="datetime-local" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="applyUntil">Bewerbung bis</label>
              <input id="applyUntil" name="applyUntil" type="datetime-local" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="slotMinutes">Dauer je Spiel</label>
              <select id="slotMinutes" name="slotMinutes" className="field">
                <option value="60">60 Min</option>
                <option value="90">90 Min</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">Beschreibung (optional)</label>
            <textarea id="description" name="description" rows={2} maxLength={500} className="field" />
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        {events.length === 0 && <p className="card text-muted">Noch kein Profi-Tag.</p>}
        {events.map((e) => (
          <div key={e.id} className="card flex flex-wrap items-center justify-between gap-2" data-testid="admin-pro-event">
            <span>
              <Link href={`/profitag/${e.id}`} className="font-semibold hover:text-green">{e.title}</Link>
              <span className="block text-xs text-muted">{e.proTeam} · {formatDateTime(e.startsAt)} Uhr · {e.slots} Plätze · {e.status === "open" ? "offen" : e.status === "drawn" ? "ausgelost" : "abgesagt"}</span>
            </span>
            {e.status === "open" && (
              <span className="flex gap-2">
                <ActionButton action={drawProEventAction.bind(null, e.id)} label="Jetzt auslosen" confirm="Jetzt auslosen? Die Spiele werden sofort angelegt." className="btn btn-primary !min-h-9 !px-3 text-xs" />
                <ActionButton action={cancelProEventAction.bind(null, e.id)} label="Absagen" confirm="Profi-Tag absagen?" className="btn btn-danger !min-h-9 !px-3 text-xs" />
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
