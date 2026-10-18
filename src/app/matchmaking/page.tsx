import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { formatDateTime } from "@/lib/time";
import { leaveQueueAction } from "@/server/matchmaking-actions";
import { queueOverview } from "@/server/matchmaking";
import { myAdminTeams } from "@/server/requests";
import { getCurrentUser } from "@/server/session";
import { QueueForm } from "./QueueForm";

export const metadata: Metadata = { title: "Matchmaking" };

export default async function MatchmakingPage() {
  const user = await getCurrentUser();
  const [{ waiting, mine, minDay }, adminTeams] = await Promise.all([queueOverview(user?.id ?? null), user?.onboardedAt ? myAdminTeams(user.id) : Promise.resolve([])]);
  const waitingIds = new Set(mine.filter((m) => m.status === "waiting").map((m) => m.teamId));
  const free = adminTeams.filter((t) => !waitingIds.has(t.id));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Matchmaking</h1>
        <p className="text-muted">
          Sag uns, wann ihr könnt. Wir suchen ein Team mit ähnlicher Spielstärke (Elo) und gemeinsamer Zeit. Danach wählen beide Teams gemeinsam Termin und Ort aus Vorschlägen.
        </p>
      </header>

      <ol className="card space-y-1 text-sm text-muted">
        <li><strong className="text-ink">1.</strong> Zeitfenster eintragen und in die Warteschlange.</li>
        <li><strong className="text-ink">2.</strong> Wir paaren Teams mit ähnlichem Elo. Je länger ihr wartet, desto größer wird der erlaubte Abstand.</li>
        <li><strong className="text-ink">3.</strong> Beide Teams sehen Kader und Spielstärke des Gegners und wählen Termin und Ort. Stimmen beide für denselben Vorschlag, steht das Spiel.</li>
      </ol>

      {waiting.length > 0 && (
        <p className="text-sm text-muted" data-testid="waiting">
          Gerade warten: {waiting.map((w) => `${w.city} ${w.n} ${w.n === 1 ? "Team" : "Teams"}`).join(", ")}.
        </p>
      )}

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
