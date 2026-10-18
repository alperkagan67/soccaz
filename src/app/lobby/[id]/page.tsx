import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { formatEuro } from "@/lib/money";
import { hasFreeSlot, MAX_PER_TEAM, MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { requireUser } from "@/server/session";
import { canViewLobby, getLobby } from "@/server/lobby";
import { getScheduling } from "@/server/scheduling";
import { SchedulingPanel } from "./SchedulingPanel";
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

  const { match, payments, participants, counts, pendingStrangers, active, roster, strength } = view;
  const v = view.viewer!;
  const status = STATUS[match.status] ?? STATUS.lobby;
  const scheduling = await getScheduling(match);
  const open = Boolean(scheduling);
  const myAdminTeam = [match.homeId, match.awayId].find((id) => v.adminOf.includes(id)) ?? null;
  const nameOfTeam = (id: string | null) => (id === match.homeId ? match.homeName : id === match.awayId ? match.awayName : "");

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
          {open ? `${match.durationMin} Minuten · Termin und Ort werden noch gewählt` : `${formatDateTime(match.startsAt)} Uhr · ${match.durationMin} Minuten`}
          {active && !open && <> · <span className="text-ink"><Countdown startsAtIso={match.startsAt.toISOString()} /></span></>}
        </p>
        <p className={`text-sm font-semibold ${status.tone}`}>{status.label}</p>
        {!active && match.status !== "cancelled" && (
          <Link href={`/spiele/${match.id}`} className="btn btn-primary mt-2">Zur Spielseite</Link>
        )}
      </header>

      {scheduling && (
        <SchedulingPanel
          matchId={match.id}
          teams={[{ id: match.homeId, name: match.homeName }, { id: match.awayId, name: match.awayName }]}
          myTeamId={myAdminTeam}
          deadlineText={match.schedulingDeadline ? `${formatDateTime(match.schedulingDeadline)} Uhr` : "–"}
          minStart={scheduling.minStart}
          venues={scheduling.venues}
          options={scheduling.options.map((o) => ({ id: o.id, label: `${formatDateTime(o.startsAt)} Uhr`, venue: o.venueText, proposedBy: o.proposedByTeam ? nameOfTeam(o.proposedByTeam) : "system", proposedByTeamId: o.proposedByTeam, votedTeamIds: o.votedTeamIds }))}
        />
      )}

      {match.status === "lobby" && active && !open && (
        <p className="card text-sm text-muted">
          Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens {MIN_READY_PER_TEAM} Spieler bereit sind.
        </p>
      )}
      {match.status === "cancelled" && <p className="card text-sm text-coral">Dieses Spiel wurde abgesagt.</p>}

      {!open && <section className="card space-y-2">
        <h2 className="font-semibold">Ort</h2>
        {active && v.canManage ? (
          <VenueForm matchId={match.id} venue={match.venueText ?? ""} />
        ) : (
          <p className={match.venueText ? "" : "text-muted"}>{match.venueText ?? "Noch nicht festgelegt. Die Team-Admins legen den Ort fest."}</p>
        )}
      </section>}

      {payments.enabled && payments.priceCents !== null && (
        <section className="card space-y-1 text-sm" aria-label="Kosten">
          <h2 className="font-semibold">Kosten</h2>
          <p>
            Halle {match.durationMin} Minuten: <strong>{formatEuro(payments.priceCents)}</strong>, geteilt durch alle zahlenden Spieler.
          </p>
          {payments.settled && payments.finalShareCents ? (
            <p className="text-muted">Abgerechnet: <strong className="text-ink">{formatEuro(payments.finalShareCents)}</strong> pro Spieler.</p>
          ) : (
            <p className="text-muted">
              Dein Anteil liegt zwischen {formatEuro(payments.lowestShareCents ?? 0)} (12 Spieler) und {formatEuro(payments.reservationCents ?? 0)} (nur {payments.minPaid} Spieler).
              Beim Bereitmachen wird der höchste Betrag reserviert, die Differenz kommt bei der Abrechnung zurück.
            </p>
          )}
        </section>
      )}

      {active && !open && (
        <MyActions
          matchId={match.id}
          mode={mode}
          ready={v.participant?.ready ?? false}
          hasTeam={Boolean(v.participant?.teamId)}
          pay={payments.enabled && payments.reservationCents !== null ? { reserveCents: payments.reservationCents, balanceCents: payments.balanceCents ?? 0, paid: Boolean(v.participant?.paid), backTo: `/lobby/${match.id}` } : null}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {teamsView.map((t) => (
          <section key={t.id} className="card space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                <Link href={`/teams/${t.slug}`} className="hover:text-green">{t.name}</Link>
              </h2>
              <span className="text-xs text-muted">Elo {strength[t.id].elo}{strength[t.id].matches === 0 ? " (geschätzt)" : ""} · {t.count} von {MAX_PER_TEAM} · bereit {t.ready}/{MIN_READY_PER_TEAM}</span>
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
                    {payments.enabled && p.paid && <span className="text-xs text-muted" title="Anteil bezahlt">bezahlt</span>}
                    <span className={p.ready ? "text-green" : "text-muted"}>{p.ready ? "Bereit" : "Offen"}</span>
                    {active && p.userId !== user.id && canAdminTeam(t.id) && (
                      <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={[]} />
                    )}
                  </span>
                </li>
              ))}
              {t.count === 0 && <li className="text-muted">Noch niemand.</li>}
            </ul>
            {roster[t.id].filter((m) => !participants.some((p) => p.userId === m.userId)).length > 0 && (
              <div className="border-t border-line pt-2" data-testid={`roster-${t.slug}`}>
                <p className="mb-1 text-xs text-muted">Weitere Teammitglieder (noch nicht in der Lobby)</p>
                <ul className="space-y-1 text-sm text-muted">
                  {roster[t.id].filter((m) => !participants.some((p) => p.userId === m.userId)).map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-2">
                      <Link href={`/spieler/${m.userId}`} className="hover:text-green">{m.name}</Link>
                      <span className="text-xs">{[m.position, m.elo ? `Elo ${m.elo}` : null, m.isAdmin ? "Admin" : null].filter(Boolean).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
