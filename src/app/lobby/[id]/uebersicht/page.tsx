import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime } from "@/lib/time";
import { lightFor, PlayerLight } from "@/components/PlayerLight";
import { canViewLobby, getLobby } from "@/server/lobby";
import { listClips } from "@/server/clips";
import { getSetting } from "@/server/settings";
import { requireUser } from "@/server/session";
import { CancelForm } from "../LobbyClient";
import { VenueBox } from "../VenueBox";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { MatchClock } from "@/components/MatchClock";
import { ClipForm, DeleteClip } from "./ClipForm";
import { ScoreDialog } from "./ScoreDialog";
import { ConfirmPanel } from "@/app/spiele/[id]/MatchClient";
import { getMatchPage } from "@/server/results";

export const metadata: Metadata = { title: "Spielübersicht", robots: { index: false } };

/** Die Übersicht, sobald beide Captains bestätigt haben: Team gegen Team, Spieler, Ort, Uhrzeit, Navigation, Notfallnummer und Clips. */
export default async function MatchOverviewPage({ params }: PageProps<"/lobby/[id]/uebersicht">) {
  const { id } = await params;
  const user = await requireUser(`/lobby/${id}/uebersicht`);
  const view = await getLobby(id, { id: user.id, role: user.role });
  if (!view) notFound();
  const { match, participants, viewer } = view;
  const v = viewer!;
  const allowed = Boolean(v.participant || v.membershipTeamId || v.platformAdmin);
  if (!allowed || !canViewLobby(view) || !(match.homeFinalAt && match.awayFinalAt)) redirect(`/lobby/${id}`);

  const [phone, clips, page] = await Promise.all([getSetting<string>("emergency_phone", ""), listClips(id), getMatchPage(id, { id: user.id, role: user.role })]);
  const result = page?.result ?? null;
  const pv = page?.viewer ?? null;
  const played = match.status === "played";
  const cancelled = match.status === "cancelled";
  const started = !view.active && !cancelled; // Anstoß erreicht oder gespielt
  const teams = [
    { id: match.homeId, name: match.homeName, slug: match.homeSlug },
    { id: match.awayId, name: match.awayName, slug: match.awaySlug },
  ];
  const venueName = match.venueName ?? match.venueText;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <p className="text-sm text-muted" data-testid="game-number">Spiel #{match.number}</p>
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold sm:text-3xl" aria-label={`${match.homeName} gegen ${match.awayName}`}>
          <span>{match.homeName}</span>
          <span className="rounded-md bg-green px-2 py-0.5 font-heading text-lg font-extrabold text-black" aria-hidden>VS.</span>
          <span>{match.awayName}</span>
        </h1>
        <p className="text-lg" data-testid="overview-time">{formatDateTime(match.startsAt)} Uhr · {match.durationMin} Minuten</p>
        <p className={`text-sm font-semibold ${cancelled ? "text-coral" : "text-green"}`}>{cancelled ? "Abgesagt" : started ? "Das Spiel läuft oder ist vorbei" : "Bestätigt von beiden Captains"}</p>
      </header>

      {!cancelled && started && !played && !result && <MatchClock startsAtIso={match.startsAt.toISOString()} durationMin={match.durationMin} />}
      {!cancelled && !started && <KickoffCountdown startsAtIso={match.startsAt.toISOString()} />}

      {venueName && <VenueBox name={venueName} address={match.venueAddress} city={match.venueCity} when={formatDateTime(match.startsAt)} lat={match.venueLat} lng={match.venueLng} />}

      {!cancelled && (played || started) && (
        <section className="card space-y-3" aria-label="Ergebnis" data-testid="result-box">
          <h2 className="font-semibold">Ergebnis</h2>
          {played && result ? (
            <>
              <p className="text-center font-heading text-4xl font-extrabold tabular-nums" data-testid="final-score">{result.homeScore} : {result.awayScore}</p>
              <p className="text-center text-sm text-green">{result.autoConfirmed ? "Ergebnis nach Ablauf der Frist automatisch bestätigt." : "Beide Captains haben das Ergebnis bestätigt."}</p>
            </>
          ) : result && result.disputed ? (
            <p className="text-sm text-coral">Das Ergebnis ist strittig. Ein Plattform-Admin entscheidet.</p>
          ) : result ? (
            <>
              <p className="text-center font-heading text-3xl font-extrabold tabular-nums" data-testid="reported-score">{result.homeScore} : {result.awayScore}</p>
              {pv?.canConfirm ? (
                <ConfirmPanel matchId={match.id} summary={`${match.homeName} ${result.homeScore} : ${result.awayScore} ${match.awayName}`} deadlineText={`Ohne Antwort gilt das Ergebnis ab ${result.confirmDeadline ? formatDateTime(result.confirmDeadline) : "–"} Uhr automatisch.`} />
              ) : (
                <p className="text-center text-sm text-muted" data-testid="waiting-confirm">Gemeldet. Der Captain des anderen Teams muss noch bestätigen.</p>
              )}
            </>
          ) : pv?.canSubmit ? (
            <ScoreDialog
              matchId={match.id}
              home={{ id: match.homeId, name: match.homeName }}
              away={{ id: match.awayId, name: match.awayName }}
              players={page!.participants}
              existing={page!.events.filter((e) => e.type === "goal").map((e) => ({ teamId: e.teamId, scorer: e.scorer }))}
            />
          ) : (
            <p className="text-sm text-muted">Die Captains tragen nach dem Spiel das Ergebnis ein und bestätigen es beide.</p>
          )}
        </section>
      )}

      <section className="card space-y-2" aria-label="Notfall" data-testid="emergency">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Notfall</h2>
        <p className="text-sm text-muted">Falls am Spieltag etwas schiefgeht (Halle zu, Verspätung, Streit), erreicht ihr den Socaz-Betreiber hier:</p>
        {phone ? (
          <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} className="btn btn-primary w-full text-lg" data-testid="emergency-phone">{phone}</a>
        ) : (
          <p className="text-sm text-muted">Die Notfallnummer wird noch nachgetragen. Bis dahin: <Link href="/kontakt" className="text-green underline">Kontaktseite</Link>.</p>
        )}
        {match.venueContact && (
          <p className="text-sm" data-testid="venue-contact">
            <span className="text-muted">Probleme mit der Halle? Kontakt der Halle{match.venueName ? ` (${match.venueName})` : ""}: </span>
            {/^[+0-9\s()/-]{6,}$/.test(match.venueContact) ? <a href={`tel:${match.venueContact.replace(/[^+0-9]/g, "")}`} className="text-green underline">{match.venueContact}</a> : <span>{match.venueContact}</span>}
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <section key={t.id} className="card space-y-2" data-testid="overview-team">
            <h2 className="font-semibold"><Link href={`/teams/${t.slug}`} className="hover:text-green">{t.name}</Link></h2>
            <ul className="space-y-1 text-sm">
              {participants.filter((p) => p.teamId === t.id).map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2" data-testid="overview-player">
                  <Link href={`/spieler/${p.userId}`} className="hover:text-green">{p.name}</Link>
                  <PlayerLight light={lightFor(p, true)} showLabel={false} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={`/spiele/${match.id}`} className="btn btn-ghost">Zur Spielseite (Ergebnis und Tore)</Link>
      </div>

      <section className="card space-y-3" aria-label="Clips" data-testid="clips">
        <h2 className="font-semibold">Clips zum Spiel</h2>
        {clips.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Clips.{started ? "" : " Ab dem Anstoß kann jeder Spieler hier Clips veröffentlichen."}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {clips.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2" data-testid="clip">
                <span>
                  <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-green underline">{c.title}</a>
                  <span className="block text-xs text-muted">von {c.author ?? c.name} · {new URL(c.url).hostname}</span>
                </span>
                {(c.userId === user.id || user.role === "admin") && <DeleteClip matchId={match.id} clipId={c.id} />}
              </li>
            ))}
          </ul>
        )}
        {started && !cancelled && v.participant && <ClipForm matchId={match.id} />}
      </section>

      {!started && !cancelled && v.canManage && <CancelForm matchId={match.id} />}
    </div>
  );
}
