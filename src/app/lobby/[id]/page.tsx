import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { hasFreeSlot, MAX_PER_TEAM, MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { requireUser } from "@/server/session";
import { canViewLobby, getLobby } from "@/server/lobby";
import { LiveIndicator } from "@/components/LiveIndicator";
import { CancelForm, Countdown, MyActions, ParticipantActions, VenueForm } from "./LobbyClient";

export const metadata: Metadata = { title: "Lobby", robots: { index: false } };

const STATUS: Record<string, { label: string; tone: string }> = {
  lobby: { label: "Wartet auf Spieler", tone: "text-yellow" },
  confirmed: { label: "Bestätigt", tone: "text-green" },
  cancelled: { label: "Abgesagt", tone: "text-coral" },
  played: { label: "Gespielt", tone: "text-muted" },
  disputed: { label: "Ergebnis strittig", tone: "text-coral" },
};

export default async function LobbyPage({ params }: PageProps<"/lobby/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/lobby/${id}`);
  const view = await getLobby(id, { id: user.id, role: user.role });
  if (!view) notFound();
  if (!canViewLobby(view)) redirect("/app");

  const { match, participants, counts, pendingStrangers, active } = view;
  const v = view.viewer!;
  const status = STATUS[match.status] ?? STATUS.lobby;

  const mode = !active
    ? "none"
    : v.participant
      ? "participant"
      : v.canJoin
        ? "join"
        : v.teamFull
          ? "full"
          : v.canJoinAsSubstitute
            ? "substitute"
            : "none";

  const teamsView = [
    { id: match.homeId, name: match.homeName, slug: match.homeSlug, count: counts.home, ready: counts.readyHome },
    { id: match.awayId, name: match.awayName, slug: match.awaySlug, count: counts.away, ready: counts.readyAway },
  ];
  const canAdminTeam = (teamId: string) => v.platformAdmin || v.adminOf.includes(teamId);
  const assignTargets = teamsView
    .filter((t) => canAdminTeam(t.id) && hasFreeSlot(t.count))
    .map((t) => ({ teamId: t.id, name: t.name }));

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Lobby</p>
          <LiveIndicator eventsUrl={`/api/lobby/${match.id}/events`} />
        </div>
        <h1 className="text-2xl font-bold">
          {match.homeName} <span className="text-muted">gegen</span> {match.awayName}
        </h1>
        <p className="text-muted">
          {formatDateTime(match.startsAt)} Uhr · {match.durationMin} Minuten
          {active && <> · <span className="text-ink"><Countdown startsAtIso={match.startsAt.toISOString()} /></span></>}
        </p>
        <p className={`text-sm font-semibold ${status.tone}`}>{status.label}</p>
        {!active && match.status !== "cancelled" && (
          <Link href={`/spiele/${match.id}`} className="btn btn-primary mt-2">Zur Spielseite</Link>
        )}
      </header>

      {match.status === "lobby" && active && (
        <p className="card text-sm text-muted">
          Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens {MIN_READY_PER_TEAM} Spieler bereit sind.
        </p>
      )}
      {match.status === "cancelled" && <p className="card text-sm text-coral">Dieses Spiel wurde abgesagt.</p>}

      <section className="card space-y-2">
        <h2 className="font-semibold">Ort</h2>
        {active && v.canManage ? (
          <VenueForm matchId={match.id} venue={match.venueText ?? ""} />
        ) : (
          <p className={match.venueText ? "" : "text-muted"}>{match.venueText ?? "Noch nicht festgelegt. Die Team-Admins legen den Ort fest."}</p>
        )}
      </section>

      {active && <MyActions matchId={match.id} mode={mode} ready={v.participant?.ready ?? false} hasTeam={Boolean(v.participant?.teamId)} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {teamsView.map((t) => (
          <section key={t.id} className="card space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                <Link href={`/teams/${t.slug}`} className="hover:text-green">{t.name}</Link>
              </h2>
              <span className="text-xs text-muted">{t.count} von {MAX_PER_TEAM} · bereit {t.ready}/{MIN_READY_PER_TEAM}</span>
            </div>
            <ul className="space-y-2 text-sm">
              {participants.filter((p) => p.teamId === t.id).map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2">
                  <span>
                    {p.name}
                    {p.isVerifiedPro && <span className="ml-2 rounded bg-green-soft px-1.5 py-0.5 text-xs text-green">Profi</span>}
                    {p.isSubstitute && <span className="ml-2 text-xs text-muted">Ersatz</span>}
                    {p.userId === user.id && <span className="ml-2 text-xs text-muted">(du)</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={p.ready ? "text-green" : "text-muted"}>{p.ready ? "Bereit" : "Offen"}</span>
                    {active && p.userId !== user.id && canAdminTeam(t.id) && (
                      <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={[]} />
                    )}
                  </span>
                </li>
              ))}
              {t.count === 0 && <li className="text-muted">Noch niemand.</li>}
            </ul>
          </section>
        ))}
      </div>

      {pendingStrangers.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Ersatzspieler warten auf Zuweisung</h2>
          <ul className="space-y-2 text-sm">
            {pendingStrangers.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span>{p.name}{p.userId === user.id && <span className="ml-2 text-xs text-muted">(du)</span>}</span>
                {active && v.canManage && p.userId !== user.id && (
                  <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={assignTargets} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {active && v.canManage && <CancelForm matchId={match.id} />}
    </div>
  );
}
