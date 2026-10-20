import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { formatDateTime } from "@/lib/time";
import { leaveQueueAction } from "@/server/matchmaking-actions";
import { CITIES } from "@/lib/validation";
import { OpenSearches } from "@/components/OpenSearches";
import { listOpenSearches, queueOverview, teamElo } from "@/server/matchmaking";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { QueueForm } from "./QueueForm";

export const metadata: Metadata = { title: "Lobby aufmachen" };

export default async function MatchmakingPage({ searchParams }: PageProps<"/matchmaking">) {
  const sp = await searchParams;
  const city = typeof sp.city === "string" && (CITIES as readonly string[]).includes(sp.city) ? sp.city : undefined;
  const durationMin = sp.dauer === "60" ? 60 : sp.dauer === "90" ? 90 : undefined;
  const user = await getCurrentUser();
  const [{ waiting, mine, minDay }, adminTeams] = await Promise.all([queueOverview(user?.id ?? null), user?.onboardedAt ? myAdminTeams(user.id) : Promise.resolve([])]);
  const waitingIds = new Set(mine.filter((m) => m.status === "waiting").map((m) => m.teamId));
  const free = adminTeams.filter((t) => !waitingIds.has(t.id));
  const searches = await listOpenSearches({ city, durationMin });
  const mineForAccept = await Promise.all(adminTeams.map(async (t) => ({ id: t.id, name: t.name, elo: await teamElo(t.id), strength: t.strength })));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Lobby aufmachen</h1>
        <p className="text-muted">
          Du bist Captain und willst mit deinem Team spielen? Sag uns Tag und Zeitfenster, dann steht eure Lobby für alle sichtbar auf der Seite „Offene Lobbys“. Ein anderes Team tritt an, danach geht es Schritt für Schritt weiter.
        </p>
      </header>

      <ol className="card space-y-1 text-sm text-muted">
        <li><strong className="text-ink">1.</strong> Tag und Zeitfenster eintragen: Eure Lobby ist offen.</li>
        <li><strong className="text-ink">2.</strong> Ein anderes Team tritt an. Beide Teams sehen Kader und Spielstärke des Gegners.</li>
        <li><strong className="text-ink">3.</strong> Die beiden Captains einigen sich auf die <strong className="text-ink">Uhrzeit</strong> (der Tag steht schon).</li>
        <li><strong className="text-ink">4.</strong> Dann bestätigen die Hallen, ob sie frei sind, und das <strong className="text-ink">Hallen-Veto</strong> beginnt: Abwechselnd bannt jedes Team Hallen, die es nicht spielen will. Die letzte Halle wird gespielt.</li>
      </ol>

      {waiting.length > 0 && (
        <p className="text-sm text-muted" data-testid="waiting">
          Gerade warten: {waiting.map((w) => `${w.city} ${w.n} ${w.n === 1 ? "Team" : "Teams"}`).join(", ")}.
        </p>
      )}

      <section className="space-y-3" aria-labelledby="open-h" id="offen">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="open-h" className="text-xl font-bold">Offene Suchen ({searches.length})</h2>
          <form className="flex gap-2" role="search" aria-label="Offene Suchen filtern">
            <select name="city" defaultValue={city ?? ""} aria-label="Stadt" className="field !w-auto !min-h-9 !py-1 text-sm">
              <option value="">Alle Städte</option>
              {CITIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select name="dauer" defaultValue={durationMin ? String(durationMin) : ""} aria-label="Dauer" className="field !w-auto !min-h-9 !py-1 text-sm">
              <option value="">Alle Dauern</option>
              <option value="60">60 Min</option>
              <option value="90">90 Min</option>
            </select>
            <button className="btn btn-ghost !min-h-9 !px-3 text-sm">Filtern</button>
          </form>
        </div>
        <p className="text-sm text-muted">Diese Teams suchen gerade einen Gegner. Passt eine Suche zu euch, könnt ihr sie direkt annehmen, ohne auf die automatische Paarung zu warten.</p>
        <OpenSearches searches={searches} mine={mineForAccept} myWaitingTeamIds={[...waitingIds]} />
      </section>

      {mine.map((m) => (
        <section key={m.id} className="card space-y-2" data-testid="my-queue">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{m.teamName}</span>
            {m.status === "waiting" ? <span className="text-sm text-yellow">Eure Lobby ist offen: wartet auf einen Gegner</span> : <span className="text-sm text-green">Gegner gefunden</span>}
          </div>
          <p className="text-sm text-muted">
            {m.city} · {m.durationMin} Min · seit {formatDateTime(m.createdAt)} Uhr
          </p>
          <ul className="text-xs text-muted">
            {m.windows.map((w) => (
              <li key={w.from}>
                {formatDateTime(new Date(w.from))} bis {new Date(w.to).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr
              </li>
            ))}
          </ul>
          {m.status === "waiting" ? (
            <ActionButton action={leaveQueueAction.bind(null, m.teamId)} label="Suche abbrechen" />
          ) : (
            m.matchId && <Link href={`/lobby/${m.matchId}`} className="btn btn-primary">Zur Lobby</Link>
          )}
        </section>
      ))}

      {!user ? (
        <Link href="/anmelden?next=/matchmaking" className="btn btn-primary w-full">Anmelden und Lobby aufmachen</Link>
      ) : adminTeams.length === 0 ? (
        <p className="card text-sm text-muted">Nur Team-Admins können nach Gegnern suchen. <Link href="/app/teams/neu" className="text-green underline">Team gründen</Link></p>
      ) : free.length > 0 ? (
        <QueueForm teams={free.map((t) => ({ id: t.id, name: t.name, city: t.city }))} minDay={minDay} />
      ) : null}
    </div>
  );
}
