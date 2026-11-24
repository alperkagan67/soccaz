import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { KickoffCountdown } from "@/components/KickoffCountdown";
import { LiveIndicator } from "@/components/LiveIndicator";
import { MatchClock } from "@/components/MatchClock";
import { parseStreamUrl } from "@/lib/stream";
import { formatDateTime } from "@/lib/time";
import { PHASE_LABEL } from "@/lib/result-rules";
import { listMatchPhotos } from "@/server/media";
import { matchPhotosEnabled } from "@/lib/media-flags";
import { RatingReveal } from "@/components/RatingReveal";
import { getRatingReveal } from "@/server/rating-reveal";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { canViewMatch, getMatchPage } from "@/server/results";
import { KommtBald } from "@/components/KommtBald";
import { spielGesperrt } from "@/server/turnier-only";
import { PersonName } from "@/components/PersonName";
import { autorLabel, personRef } from "@/lib/lobby-namen";
import { getCurrentUser } from "@/server/session";
import { getViewerSicht } from "@/server/viewer-sicht";
import { ScoreDialog } from "@/app/lobby/[id]/uebersicht/ScoreDialog";
import { MatchPhotos } from "./MatchPhotos";
import { StreamEmbed } from "./StreamEmbed";
import { StreamForm } from "./StreamForm";
import { ConfirmPanel, DecidePanel, EndMatchPanel, MvpPanel, NoShowList, Recorder, SubmitResultForm } from "./MatchClient";

export async function generateMetadata({ params }: PageProps<"/spiele/[id]">): Promise<Metadata> {
  const { id } = await params;
  // Spiele, die nicht öffentlich sind (alle Turnierspiele, auch die privater Turniere), werden von Suchmaschinen nicht aufgenommen; der Link bleibt teilbar. Kein Spiel bekannt: Standard.
  const [m] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select({ visibility: matches.visibility }).from(matches).where(eq(matches.id, id)) : [];
  return m && m.visibility !== "public" ? { title: "Spiel", robots: { index: false, follow: false } } : { title: "Spiel" };
}

const EVENT_LABEL = { goal: "Tor", yellow_card: "Gelbe Karte", red_card: "Rote Karte" } as const;
const EVENT_TONE = { goal: "bg-accent", yellow_card: "bg-card-yellow", red_card: "bg-card-red" } as const;

export default async function MatchPage({ params }: PageProps<"/spiele/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const page = await getMatchPage(id, user ? { id: user.id, role: user.role } : null);
  if (!page) notFound();
  // Nicht öffentlich sichtbare Spiele (Privatspiel, private Herausforderung): Existenz nicht verraten, gleiche Antwort wie bei einem nicht vorhandenen Spiel
  if (!canViewMatch(page)) notFound();

  // TURNIER_ONLY: nur Spiele eines Turniers (serverseitige Zuordnung, Ergebnis melden) bleiben offen; alle anderen Spiele zeigen "Kommt bald" (Plattform-Admin ausgenommen)
  if (await spielGesperrt(id)) return <KommtBald />;

  const { match, events, live, result, phase, participants } = page;
  const v = page.viewer;
  // AC-17 (Entscheid t2q 2026-11-24): Spieler des Spiels und Torschützen im Spielverlauf nur für Angemeldete mit Name und Link, sonst Initialen ohne Link; Beteiligte (Teilnehmer, Team-Admin, Veranstalter, Plattform-Admin) sehen Namen wie immer
  const { sicht } = await getViewerSicht({ participant: participants.some((p) => p.userId === user?.id) || Boolean(v?.mySide), teamAdmin: Boolean(v?.canManage) });
  const home = { id: match.homeId, name: match.homeName };
  const away = { id: match.awayId, name: match.awayName };
  const shown = result && (match.status === "played" || result.confirmedHome || result.confirmedAway) ? { home: result.homeScore, away: result.awayScore } : live;
  const teamName = (teamId: string) => (teamId === match.homeId ? match.homeName : match.awayName);
  const goalsFromEvents = live;
  const host = ((await headers()).get("host") ?? "localhost").split(":")[0];
  const stream = match.streamUrl ? parseStreamUrl(match.streamUrl, host) : null;
  const reveal = user ? await getRatingReveal(match.id, user.id) : null; // nur die eigene Wertungsänderung, nur nach einem bestätigten Ergebnis (AC-20, AC-17)
  const photos = (await listMatchPhotos(match.id)).map((p) => ({ id: p.id, mine: p.ownerId === user?.id }));

  // Abpfiff im Turnierspiel NUR fuer Veranstalter/Admin (Schiedsrichter, Endergebnis sofort endgueltig). Captains behalten ihr Formular (Felder sichtbar, Ergebnis melden, der Gegner bestaetigt): sonst lagen ihre Felder
  // eingeklappt und die E2E-Strecken der Captains fanden sie nicht (CI #387). So bleibt es bei einer Hauptaktion je Rolle.
  const abpfiff = Boolean(v?.canRecord) && match.kind === "tournament" && !v?.mySide && Boolean(v?.canManage);
  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">{formatDateTime(match.startsAt)} Uhr · {match.durationMin} Min{match.venueText ? ` · ${match.venueText}` : ""}</p>
          {/* feste Breite, linksbündig: der Wechsel "○ Verbinde…" -> "● Live" verschiebt nichts (CLS, AC-21) */}
          <span className="inline-block w-24 text-left">
            <LiveIndicator eventsUrl={`/api/spiele/${match.id}/events`} />
          </span>
        </div>
        <div className="card grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
          <Link href={`/teams/${match.homeSlug}`} className="font-semibold hover:text-accent-fg">{match.homeName}</Link>
          <p className="font-heading text-4xl font-extrabold tabular-nums" aria-label={`Spielstand ${shown.home} zu ${shown.away}`}>
            {shown.home} : {shown.away}
          </p>
          <Link href={`/teams/${match.awaySlug}`} className="font-semibold hover:text-accent-fg">{match.awayName}</Link>
        </div>
        <p className={`text-center text-sm font-semibold ${phase === "live" ? "text-accent-fg" : phase === "disputed" || phase === "cancelled" ? "text-ink" : "text-muted"}`}>
          {PHASE_LABEL[phase]}
        </p>
        {phase === "live" && <MatchClock startsAtIso={match.startsAt.toISOString()} durationMin={match.durationMin} />}
        {phase === "upcoming" && <KickoffCountdown startsAtIso={match.startsAt.toISOString()} />}
        {match.status === "played" && match.visibility === "public" && (
          <p className="text-center text-sm">
            <a href={`/api/karte/${match.id}`} className="text-accent-fg underline" download>Spielbericht als Bild</a>
          </p>
        )}
        {v?.mySide && match.status === "played" && match.kind !== "tournament" && (
          <p className="text-center text-sm">
            <Link href={`/app/suche/neu?gegner=${v.mySide === "home" ? match.awaySlug : match.homeSlug}`} className="text-accent-fg underline">Revanche anfragen</Link>
          </p>
        )}
        {user && match.kind !== "tournament" && (
          <p className="text-center text-xs">
            <Link href={`/lobby/${match.id}`} className="text-muted underline">Zur Lobby</Link>
          </p>
        )}
      </header>

      {reveal && <RatingReveal data={reveal} />}

      {stream && <StreamEmbed provider={stream.provider} embedUrl={stream.embedUrl} />}
      {v?.canManage && match.status !== "cancelled" && <StreamForm matchId={match.id} current={match.streamUrl} />}

      {result && match.status !== "played" && !result.disputed && (
        <p className="card text-sm text-muted">
          Gemeldetes Ergebnis: <strong className="text-ink">{result.homeScore} : {result.awayScore}</strong>. Gilt automatisch, wenn das andere Team bis{" "}
          {result.confirmDeadline ? formatDateTime(result.confirmDeadline) : "–"} Uhr nicht widerspricht.
        </p>
      )}
      {match.status === "played" && result?.autoConfirmed && <p className="card text-sm text-muted">Das Ergebnis wurde nach Ablauf der Frist automatisch bestätigt.</p>}
      {result?.disputed && <p className="card text-sm text-ink">Das Ergebnis ist strittig. Ein Plattform-Admin entscheidet.</p>}

      {v?.canRecord && <Recorder matchId={match.id} home={home} away={away} players={participants} hasEvents={events.length > 0} />}

      {/* Abpfiff im Turnierspiel: Veranstalter/Admin */}
      {abpfiff && v && <EndMatchPanel matchId={match.id} home={match.homeName} away={match.awayName} homeScore={goalsFromEvents.home} awayScore={goalsFromEvents.away} final={!v.mySide && v.canManage} />}

      {/* AC-30: eine Hauptaktion je Ansicht. Im Turnierspiel mit Abpfiff ist "Abpfiff" die Hauptaktion; die Eingabe von Hand liegt ruhig und eingeklappt darunter */}
      {abpfiff ? (
        <details className="card" data-testid="manual-result">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Ergebnis von Hand eintragen</summary>
          <div className="space-y-3 pt-3">
      {v?.canSubmit && !result?.disputed && !result && (
        <section className="card space-y-2">
          <p className="text-sm text-muted">Das Ergebnis kannst du jederzeit eintragen, auch nach dem Spiel, mit Torschützen:</p>
          <ScoreDialog quiet={abpfiff} matchId={match.id} home={home} away={away} players={participants} existing={events.filter((e) => e.type === "goal").map((e) => ({ teamId: e.teamId, scorer: e.scorer }))} />
        </section>
      )}

      {v?.canSubmit && !result?.disputed && (
        <SubmitResultForm quiet={abpfiff} matchId={match.id} home={match.homeName} away={match.awayName} homeScore={result?.homeScore ?? goalsFromEvents.home} awayScore={result?.awayScore ?? goalsFromEvents.away} final={!v.mySide && v.canManage} />
      )}

          </div>
        </details>
      ) : (
        <>
      {v?.canSubmit && !result?.disputed && !result && (
        <section className="card space-y-2">
          <p className="text-sm text-muted">Das Ergebnis kannst du jederzeit eintragen, auch nach dem Spiel, mit Torschützen:</p>
          <ScoreDialog quiet={abpfiff} matchId={match.id} home={home} away={away} players={participants} existing={events.filter((e) => e.type === "goal").map((e) => ({ teamId: e.teamId, scorer: e.scorer }))} />
        </section>
      )}

      {v?.canSubmit && !result?.disputed && (
        <SubmitResultForm quiet={abpfiff} matchId={match.id} home={match.homeName} away={match.awayName} homeScore={result?.homeScore ?? goalsFromEvents.home} awayScore={result?.awayScore ?? goalsFromEvents.away} final={!v.mySide && v.canManage} />
      )}

        </>
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

      {page.mvp && (
        <p className="card text-sm" data-testid="mvp-winner">
          Spieler des Spiels: <PersonName person={personRef(sicht, page.mvp.id, page.mvp.name, 0)} className="font-semibold text-accent-fg" linkClass="" />
        </p>
      )}
      {page.voting.canVote && (
        <MvpPanel
          matchId={match.id}
          candidates={participants.filter((p) => p.teamId && !p.noShow && p.userId !== v?.id).map((p) => ({ userId: p.userId, name: p.name }))}
          myVote={page.voting.myVote}
          closesText={`Abstimmung bis ${page.voting.closesAt ? formatDateTime(page.voting.closesAt) : "–"} Uhr.`}
        />
      )}
      {page.noShowAdminTeams.length > 0 && v && (
        <NoShowList
          matchId={match.id}
          selfId={v.id}
          players={participants.filter((p) => p.teamId && page.noShowAdminTeams.includes(p.teamId)).map((p) => ({ userId: p.userId, name: p.name, noShow: p.noShow }))}
        />
      )}

      {matchPhotosEnabled() && <MatchPhotos matchId={match.id} photos={photos} canUpload={v?.canUploadPhoto ?? false} canModerate={v?.platformAdmin ?? false} />}

      <section className="card space-y-2">
        <h2 className="font-semibold">Spielverlauf</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted">{phase === "upcoming" ? "Das Spiel hat noch nicht begonnen." : "Noch keine Ereignisse."}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {events.map((e, i) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-9 text-right tabular-nums text-muted">{e.minute !== null && e.minute !== undefined ? `${e.minute}'` : ""}</span>
                <span className={`size-2.5 rounded-full ${EVENT_TONE[e.type]}`} aria-hidden />
                <span>
                  <strong>{EVENT_LABEL[e.type]}</strong> {e.userId && e.scorer ? <PersonName person={personRef(sicht, e.userId, e.scorer, i)} /> : (e.scorer ? autorLabel(e.scorer, sicht) : "Unbekannt")} <span className="text-muted">({teamName(e.teamId)})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
