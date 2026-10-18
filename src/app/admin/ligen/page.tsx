import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm } from "@/components/ActionForm";
import { CITIES } from "@/lib/validation";
import { addLeagueTeamAction, createLeagueAction, finishLeagueAction, removeLeagueTeamAction } from "@/server/league-actions";
import { getLeague, listLeagues } from "@/server/leagues";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Admin: Ligen" };

export default async function AdminLeaguesPage() {
  await requirePermission("admin", "/admin/ligen");
  const list = await listLeagues({ includeFinished: true });
  const details = await Promise.all(list.map((l) => getLeague(l.id)));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ligen</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Neue Liga</h2>
        <ActionForm action={createLeagueAction} submit="Liga anlegen">
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="field" required maxLength={80} placeholder="Saison Herbst 2026" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="city">Stadt</label>
              <select id="city" name="city" className="field">
                <option value="">Ganz NRW</option>
                {CITIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="startsOn">Start</label>
              <input id="startsOn" name="startsOn" type="date" defaultValue={today} className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="endsOn">Ende</label>
              <input id="endsOn" name="endsOn" type="date" className="field" required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="openJoin" defaultChecked /> Team-Admins dürfen selbst beitreten
          </label>
        </ActionForm>
      </section>

      <section className="space-y-3">
        {list.length === 0 && <p className="card text-muted">Noch keine Liga.</p>}
        {list.map((l, i) => {
          const d = details[i];
          return (
            <div key={l.id} className="card space-y-3" data-testid="admin-league">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <Link href={`/ligen/${l.id}`} className="font-semibold hover:text-green">{l.name}</Link>
                  <span className="block text-xs text-muted">{l.city ?? "Ganz NRW"} · {l.starts_on} bis {l.ends_on} · {l.status === "finished" ? "beendet" : "läuft"}</span>
                </span>
                {l.status !== "finished" && <ActionButton action={finishLeagueAction.bind(null, l.id)} label="Saison beenden" confirm="Saison beenden und Meister festlegen? Das lässt sich nicht zurücknehmen." className="btn btn-danger !min-h-9 !px-3 text-xs" />}
              </div>
              <ul className="space-y-1 text-sm">
                {d?.table.map((t) => (
                  <li key={t.team_id} className="flex items-center justify-between">
                    <span>{t.name}</span>
                    {l.status !== "finished" && <ActionButton action={removeLeagueTeamAction.bind(null, l.id, t.team_id)} label="Entfernen" />}
                  </li>
                ))}
              </ul>
              {l.status !== "finished" && (
                <ActionForm action={addLeagueTeamAction.bind(null, l.id)} submit="Team hinzufügen" className="space-y-2">
                  <label className="label" htmlFor={`slug-${l.id}`}>Team (Name aus der Adresse, z. B. rot-weiss-essen)</label>
                  <input id={`slug-${l.id}`} name="slug" className="field" required />
                </ActionForm>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
