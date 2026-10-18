import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LiveIndicator } from "@/components/LiveIndicator";
import { formatDateTime } from "@/lib/time";
import { PHASE_LABEL } from "@/lib/result-rules";
import { canViewMatch, getMatchPage } from "@/server/results";
import { getCurrentUser } from "@/server/session";
import { ConfirmPanel, DecidePanel, Recorder, SubmitResultForm } from "./MatchClient";

export const metadata: Metadata = { title: "Spiel" };

const EVENT_LABEL = { goal: "Tor", yellow_card: "Gelbe Karte", red_card: "Rote Karte" } as const;
const EVENT_TONE = { goal: "bg-green", yellow_card: "bg-yellow", red_card: "bg-red" } as const;

export default async function MatchPage({ params }: PageProps<"/spiele/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const page = await getMatchPage(id, user ? { id: user.id, role: user.role } : null);
  if (!page) notFound();
  if (!canViewMatch(page)) redirect(user ? "/app" : `/anmelden?next=${encodeURIComponent(`/spiele/${id}`)}`);

  const { match, events, live, result, phase, participants } = page;
  const v = page.viewer;
  const home = { id: match.homeId, name: match.homeName };
  const away = { id: match.awayId, name: match.awayName };
  const shown = result && (match.status === "played" || result.confirmedHome || result.confirmedAway) ? { home: result.homeScore, away: result.awayScore } : live;
  const teamName = (teamId: string) => (teamId === match.homeId ? match.homeName : match.awayName);
  const goalsFromEvents = live;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{formatDateTime(match.startsAt)} Uhr · {match.durationMin} Min{match.venueText ? ` · ${match.venueText}` : ""}</p>
          <LiveIndicator eventsUrl={`/api/spiele/${match.id}/events`} />
        </div>
        <div className="card grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <Link href={`/teams/${match.homeSlug}`} className="font-semibold hover:text-green">{match.homeName}</Link>
          <p className="font-heading text-4xl font-extrabold tabular-nums" aria-label={`Spielstand ${shown.home} zu ${shown.away}`}>
            {shown.home} : {shown.away}
          </p>
          <Link href={`/teams/${match.awaySlug}`} className="font-semibold hover:text-green">{match.awayName}</Link>
        </div>
        <p className={`text-center text-sm font-semibold ${phase === "live" ? "text-green" : phase === "disputed" || phase === "cancelled" ? "text-coral" : "text-muted"}`}>
          {PHASE_LABEL[phase]}
        </p>
        {user && (
          <p className="text-center text-xs">
            <Link href={`/lobby/${match.id}`} className="text-muted underline">Zur Lobby</Link>
          </p>
        )}
      </header>

      {result && match.status !== "played" && !result.disputed && (
        <p className="card text-sm text-muted">
          Gemeldetes Ergebnis: <strong className="text-ink">{result.homeScore} : {result.awayScore}</strong>. Gilt automatisch, wenn das andere Team bis{" "}
          {result.confirmDeadline ? formatDateTime(result.confirmDeadline) : "–"} Uhr nicht widerspricht.
        </p>
      )}
      {match.status === "played" && result?.autoConfirmed && <p className="card text-sm text-muted">Das Ergebnis wurde nach Ablauf der Frist automatisch bestätigt.</p>}
      {result?.disputed && <p className="card text-sm text-coral">Das Ergebnis ist strittig. Ein Plattform-Admin entscheidet.</p>}

      {v?.canRecord && <Recorder matchId={match.id} home={home} away={away} players={participants} hasEvents={events.length > 0} />}

      {v?.canSubmit && !result?.disputed && (
        <SubmitResultForm matchId={match.id} home={match.homeName} away={match.awayName} homeScore={result?.homeScore ?? goalsFromEvents.home} awayScore={result?.awayScore ?? goalsFromEvents.away} />
      )}

      {v?.canConfirm && result && (
        <ConfirmPanel
          matchId={match.id}
          summary={`${match.homeName} ${result.homeScore} : ${result.awayScore} ${match.awayName}`}
          deadlineText={`Ohne Antwort gilt das Ergebnis ab ${result.confirmDeadline ? formatDateTime(result.confirmDeadline) : "–"} Uhr automatisch.`}
        />
      )}

      {v?.canDecide && (
        <DecidePanel matchId={match.id} home={match.homeName} away={match.awayName} homeScore={result?.homeScore ?? goalsFromEvents.home} awayScore={result?.awayScore ?? goalsFromEvents.away} disputeReason={result?.disputeReason} />
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">Spielverlauf</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">{phase === "upcoming" ? "Das Spiel hat noch nicht begonnen." : "Noch keine Ereignisse."}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-9 text-right tabular-nums text-muted">{e.minute}&apos;</span>
                <span className={`size-2.5 rounded-full ${EVENT_TONE[e.type]}`} aria-hidden />
                <span>
                  <strong>{EVENT_LABEL[e.type]}</strong> {e.scorer ?? "Unbekannt"} <span className="text-muted">({teamName(e.teamId)})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
