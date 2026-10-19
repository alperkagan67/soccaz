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

export const metadata: Metadata = { title: "Matchmaking" };

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
        <h1 className="text-3xl font-bold">Matchmaking</h1>
        <p className="text-muted">
          Sag uns, wann ihr könnt. Wir suchen ein Team mit ähnlicher Spielstärke (Elo) und gemeinsamer Zeit. Danach bannen beide Teams abwechselnd Hallen (wie die Map-Veto-Phase bei Counter-Strike) und wählen gemeinsam den Termin.
        </p>
      </header>

      <ol className="card space-y-1 text-sm text-muted">
        <li><strong className="text-ink">1.</strong> Zeitfenster eintragen und in die Warteschlange.</li>
        <li><strong className="text-ink">2.</strong> Wir paaren Teams mit ähnlichem Elo. Je länger ihr wartet, desto größer wird der erlaubte Abstand.</li>
        <li><strong className="text-ink">3.</strong> Beide Teams sehen Kader und Spielstärke des Gegners. Dann beginnt das <strong className="text-ink">Hallen-Veto</strong>: Abwechselnd bannt jedes Team Hallen, die es nicht spielen will. Die letzte Halle wird gespielt.</li>
        <li><strong className="text-ink">4.</strong> Zum Schluss wählt ihr gemeinsam die Uhrzeit aus Vorschlägen. Stimmen beide für denselben, steht das Spiel.</li>
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
            {m.status === "waiting" ? <span className="text-sm text-yellow">Sucht einen Gegner …</span> : <span className="text-sm text-green">Gegner gefunden</span>}
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
        <Link href="/anmelden?next=/matchmaking" className="btn btn-primary w-full">Anmelden und Gegner suchen</Link>
      ) : adminTeams.length === 0 ? (
        <p className="card text-sm text-muted">Nur Team-Admins können nach Gegnern suchen. <Link href="/app/teams/neu" className="text-green underline">Team gründen</Link></p>
      ) : free.length > 0 ? (
        <QueueForm teams={free.map((t) => ({ id: t.id, name: t.name, city: t.city }))} minDay={minDay} />
      ) : null}
    </div>
  );
}
