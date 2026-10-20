import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { PlayerLight } from "@/components/PlayerLight";
import { MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { formatDateTime } from "@/lib/time";
import { InviteBox } from "@/app/teams/[slug]/InviteBox";
import { leaveQueueAction, openLobbyJoinAction } from "@/server/matchmaking-actions";
import { getOpenLobby } from "@/server/matchmaking";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Eure Lobby", robots: { index: false } };

/** Übersicht der eigenen offenen Lobby: Das Team mit allen Plätzen, wer schon beigetreten ist, Einladungslink und Warten auf einen Gegner. */
export default async function OpenLobbyPage({ params }: PageProps<"/lobby/offen/[entryId]">) {
  const { entryId } = await params;
  const user = await getCurrentUser();
  const lobby = await getOpenLobby(entryId, user?.id ?? null);
  if (!lobby) notFound();
  if (lobby.status === "matched" && lobby.matchId) redirect(`/lobby/${lobby.matchId}`);
  const open = lobby.status === "waiting";
  const joined = lobby.members.filter((m) => m.joined);
  const empty = Math.max(lobby.slots - joined.length, 0);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-muted" data-testid="game-number">Spiel #{lobby.number} · Lobby</p>
        <h1 className="text-2xl font-bold sm:text-3xl">{lobby.team.name}</h1>
        <p className={`text-sm font-semibold ${open ? "text-yellow" : "text-muted"}`} data-testid="open-lobby-status">
          {open ? "Eure Lobby ist offen und wartet auf einen Gegner" : "Diese Lobby ist nicht mehr offen"}
        </p>
        <p className="text-muted">
          {lobby.windows.map((w) => `${formatDateTime(new Date(w.from))} bis ${new Date(w.to).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`).join(" · ")} · {lobby.durationMin} Min · {lobby.city}
        </p>
      </header>

      <section className="card space-y-3" aria-label="Mein Team" data-testid="open-lobby-team">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">Mein Team: <Link href={`/teams/${lobby.team.slug}`} className="hover:text-green">{lobby.team.name}</Link></h2>
          <span className="text-xs text-muted">{joined.length} von {lobby.slots} Plätzen</span>
        </div>
        <ul className="space-y-2 text-sm">
          {joined.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-2" data-testid="open-lobby-player">
              <span>
                <Link href={`/spieler/${m.userId}`} className="hover:text-green">{m.name}</Link>
                {m.isAdmin && <span className="ml-2 text-xs text-muted">Captain</span>}
                {m.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                Lobby beigetreten
                <PlayerLight light="red" showLabel={false} />
              </span>
            </li>
          ))}
          {Array.from({ length: empty }, (_, i) => (
            <li key={`free-${i}`} className="flex items-center justify-between gap-2 text-muted" data-testid="open-lobby-free">
              <span>Wartet auf Spieler {joined.length + i + 1}</span>
              <span className="text-xs">frei</span>
            </li>
          ))}
        </ul>
        {lobby.members.filter((m) => !m.joined).length > 0 && (
          <div className="border-t border-line pt-2">
            <p className="mb-1 text-xs text-muted">Im Team, aber noch nicht in der Lobby</p>
            <ul className="space-y-1 text-sm text-muted">
              {lobby.members.filter((m) => !m.joined).map((m) => (
                <li key={m.userId}>{m.name}</li>
              ))}
            </ul>
          </div>
        )}
        {open && lobby.viewer.isMember && (
          <div className="flex flex-wrap gap-2">
            {lobby.viewer.joined ? (
              <ActionButton action={openLobbyJoinAction.bind(null, lobby.id, false)} label="Lobby verlassen" />
            ) : (
              <ActionButton action={openLobbyJoinAction.bind(null, lobby.id, true)} label="Der Lobby beitreten" className="btn btn-primary !min-h-9 !px-4 text-sm" />
            )}
          </div>
        )}
        <p className="text-xs text-muted">Bezahlen und Bereitmachen geht, sobald ein Gegner da ist und Uhrzeit und Halle feststehen. Nur wenn alle bezahlt haben, können alle auf Bereit drücken. Mindestens {MIN_READY_PER_TEAM} Spieler brauchst du für ein Spiel.</p>
      </section>

      {open && lobby.viewer.isAdmin && <InviteBox teamId={lobby.team.id} teamName={lobby.team.name} />}

      <section className="card space-y-2" aria-label="Gegner">
        <h2 className="font-semibold">Gegner</h2>
        <p className="text-sm text-muted">Noch kein Gegner. Sobald ein anderes Team auf „Gegen {lobby.team.name} antreten“ klickt, erscheint es hier und ihr wählt gemeinsam die Uhrzeit.</p>
        {lobby.note && <p className="text-xs">{lobby.note}</p>}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/suche" className="btn btn-ghost">Alle offenen Lobbys</Link>
        {open && lobby.viewer.isAdmin && (
          <ActionButton action={leaveQueueAction.bind(null, lobby.team.id)} label="Lobby schließen" confirm="Lobby wirklich schließen?" thenGo="/matchmaking" />
        )}
      </div>
    </div>
  );
}
