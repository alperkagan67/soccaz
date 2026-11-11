import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { PlayerLight, type Light } from "@/components/PlayerLight";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { InviteBox } from "@/app/teams/[slug]/InviteBox";
import {
  cancelTournamentAction,
  closeWithJoinedAction,
  joinAsPlayerAction,
  leavePlayerAction,
  payEntryAction,
  payForTeamAction,
  reopenRostersAction,
  setPaidReadyAction,
  setRosterCompleteAction,
  withdrawTeamAction,
} from "@/server/tournament-actions";
import { getCurrentUser } from "@/server/session";
import { getTournament } from "@/server/tournaments";
import { BoardInfo } from "./BoardInfo";
import { BracketView } from "./BracketView";
import { CopyLink } from "./CopyLink";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Turnier", robots: { index: false } };

const STATUS = { registration: "Kader füllen", payment: "Zahlung läuft", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

export default async function TournamentPage({ params, searchParams }: PageProps<"/turniere/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const user = await getCurrentUser();
  // Neuer Nutzer über den Einladungslink: erst das Onboarding, danach zurück ins Turnier (der Token bleibt erhalten)
  if (user && !user.onboardedAt && token) redirect(`/willkommen?next=${encodeURIComponent(`/turniere/${id}?t=${token}`)}`);
  const data = await getTournament(id, user ? { id: user.id, role: user.role } : null, token);
  if (!data) {
    // Gäste mit Einladungslink können sich anmelden; Fremde ohne Link sehen nichts
    if (!user && token) return <Guest id={id} token={token} />;
    notFound();
  }
  const { tournament: t, teams, viewer: v, pricing } = data;
  const manage = Boolean(v?.isOrganizer);
  const priceFixed = pricing.shareCents !== null;
  const free = pricing.totalCents === 0 || (priceFixed && pricing.shareCents === 0);
  const inRegistration = t.status === "registration";
  const inPayment = t.status === "payment";
  const allLocked = teams.length === t.maxTeams && teams.every((x) => x.ready);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const linkUrl = t.inviteToken ? `${process.env.APP_URL ?? `${proto}://${host}`}/turniere/${t.id}?t=${t.inviteToken}` : null;
  const played = data.stages.flatMap((s) => s.matches).filter((m) => m.scoreA !== null).length;
  const totalGames = data.stages.flatMap((s) => s.matches).length;

  const lightOf = (teamReady: boolean, paid: boolean): Light => (paid ? "green" : teamReady ? "orange" : "red");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold" data-testid="tournament-name">{t.name}</h1>
        <p className="text-muted">
          {t.city}
          {t.venueText ? ` · ${t.venueText}` : ""}
          {t.startsAt ? ` · ${formatDateTime(t.startsAt)} Uhr` : ` · ${t.startsOn}`} · K.-o.-System
        </p>
        <p className="text-sm text-muted" data-testid="tournament-meta">
          Veranstalter: {data.organizerName} · {STATUS[t.status]} · {teams.length}/{t.maxTeams} Teams · {free ? "kostenlos" : `Hallenkosten ${formatEuro(pricing.totalCents ?? 0)}, geteilt durch alle Spieler`}
          {t.registrationDeadline ? ` · Anmeldeschluss ${formatDateTime(t.registrationDeadline)} Uhr` : ""}
          {t.isPrivate ? " · privat" : ""}
        </p>
        {data.winner && (
          <p className="text-accent-fg" data-testid="winner">
            Turniersieger: <span className="font-semibold">{data.winner}</span>
          </p>
        )}
      </header>

      {!user && (
        <Link href={`/anmelden?next=${encodeURIComponent(`/turniere/${t.id}${token ? `?t=${token}` : ""}`)}`} className="btn btn-primary w-full">Anmelden und mitmachen</Link>
      )}
      {linkUrl && (inRegistration || inPayment) && <CopyLink url={linkUrl} title={t.name} />}
      {v && v.registerableTeams.length > 0 && <RegisterForm tournamentId={t.id} teams={v.registerableTeams} />}
      {v && data.registrationOpen && !v.isOrganizer && !v.captainTeamId && !v.myTeamId && v.registerableTeams.length === 0 && v.joinableTeamIds.length === 0 && (
        <section className="card space-y-2" data-testid="no-team-hint">
          <p className="text-sm">Du hast kein Team, das sich anmelden kann. Gründe ein Team, danach kommst du direkt hierher zurück und meldest es an.</p>
          <Link href={`/app/teams/neu?next=${encodeURIComponent(`/turniere/${t.id}${token ? `?t=${token}` : ""}`)}`} className="btn btn-primary w-full">Team gründen</Link>
        </section>
      )}

      {(inRegistration || inPayment || t.status === "running") && !free && (
        <section className="card space-y-1 text-sm" aria-label="So wird bezahlt" data-testid="pricing-box">
          <h2 className="font-semibold">So läuft es ab</h2>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted">
            <li className={inRegistration ? "text-ink" : ""}>Alle Teams füllen ihren Kader. Der Captain meldet: „Team ist vollzählig“.</li>
            <li className={inPayment ? "text-ink" : ""}>Sobald alle Teams vollzählig sind, wird der Preis pro Spieler automatisch berechnet: Hallenkosten geteilt durch alle Spieler.</li>
            <li className={inPayment ? "text-ink" : ""}>Jeder Spieler bezahlt genau diesen Betrag (oder der Captain für ihn). Die Ampel wird grün.</li>
            <li className={t.status === "running" ? "text-ink" : ""}>Haben alle bezahlt, erscheint das Bracket.</li>
          </ol>
          <p>
            Hallenkosten: <strong>{formatEuro(pricing.totalCents ?? 0)}</strong>
            {pricing.hourlyCents !== null && pricing.durationMin !== null ? ` (${formatEuro(pricing.hourlyCents)} pro Stunde mal ${(pricing.durationMin / 60).toLocaleString("de-DE")} Stunden)` : ""}.
          </p>
          {priceFixed ? (
            <p data-testid="final-share">Preis pro Spieler: <strong>{formatEuro(pricing.shareCents ?? 0)}</strong> ({pricing.players} Spieler).</p>
          ) : (
            <p data-testid="reservation-info" className="text-muted">
              Der Preis steht noch nicht fest. {pricing.range && `Je nach Kadergröße landet er zwischen ${formatEuro(pricing.range.lowest)} und ${formatEuro(pricing.range.highest)} pro Spieler.`}
            </p>
          )}
        </section>
      )}

      {manage && (inRegistration || inPayment || t.status === "running") && (
        <section className="card space-y-2" data-testid="organizer-box">
          <h2 className="font-semibold">Veranstalter</h2>
          <div className="flex flex-wrap gap-2">
            {inRegistration && data.deadlinePassed && teams.length < t.maxTeams && teams.length >= 4 && (
              <ActionButton action={closeWithJoinedAction.bind(null, t.id)} label={`Mit den ${teams.length} angemeldeten Teams starten`} confirm="Die Teamzahl wird auf die angemeldeten Teams gesenkt. Danach wird der Preis berechnet, sobald alle Teams vollzählig sind." className="btn btn-primary !min-h-9 !px-3 text-sm" />
            )}
            {inPayment && (
              <ActionButton action={reopenRostersAction.bind(null, t.id)} label="Kader wieder öffnen" confirm="Alle bereits gezahlten Anteile werden erstattet, der Preis wird später neu berechnet." className="btn btn-ghost !min-h-9 !px-3 text-sm" />
            )}
            <ActionButton action={cancelTournamentAction.bind(null, t.id)} label="Turnier absagen" confirm="Turnier absagen? Alle bezahlten Anteile gehen vollständig aufs Guthaben der Zahler zurück." className="btn btn-danger !min-h-9 !px-3 text-sm" />
          </div>
          <p className="text-xs text-muted">Bis zum Anmeldeschluss kannst du Teams entfernen und durch neue ersetzen. Danach kannst du mit weniger Teams starten (mindestens 4) oder absagen. Wenn in der Zahlungsphase jemand nicht zahlt, öffne die Kader wieder: Alles wird erstattet und der Preis neu berechnet.</p>
        </section>
      )}

      {(data.bracketVisible || t.status === "finished") && (
        <section className="space-y-3" data-testid="dashboard">
          <h2 className="text-lg font-semibold">Turnier-Dashboard</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Teams", value: teams.length },
              { label: "Spieler", value: pricing.players },
              { label: "Spiele gespielt", value: `${played} von ${totalGames}` },
              { label: "Status", value: STATUS[t.status] },
            ].map((c) => (
              <div key={c.label} className="card text-center">
                <p className="text-xs text-muted">{c.label}</p>
                <p className="font-heading text-lg font-bold">{c.value}</p>
              </div>
            ))}
          </div>
          <BracketView
            tournamentId={t.id}
            stages={data.stages}
            manage={manage}
            info={<BoardInfo blocks={data.schedule?.blocks ?? null} slotMinutes={data.schedule?.slotMinutes ?? 0} gapMinutes={data.schedule?.gapMinutes ?? 0} winner={data.winner} />}
          />
          {data.schedule && (
            <div className="card space-y-2 text-sm" data-testid="schedule">
              <h3 className="font-semibold">Spielplan</h3>
              <p className="text-xs text-muted">
                Zwei Plätze, gebucht von {formatDateTime(new Date(data.schedule.blocks[0].startIso))} bis {new Date(data.schedule.blocks[data.schedule.blocks.length - 1].endIso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr.
                {" "}Jedes Spiel dauert {data.schedule.slotMinutes} Minuten, dazwischen {data.schedule.gapMinutes} Minuten Pause zum Einwechseln. Im Finale bleibt ein Platz frei: Dort spielen die Verlierer der Halbfinals nur zum Spaß.
              </p>
              <ol className="space-y-1.5">
                {data.schedule.blocks.map((b, i) => (
                  <li key={i} className="rounded-lg border border-line p-2">
                    <p className="text-xs font-semibold">
                      {new Date(b.startIso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr · {b.label}
                    </p>
                    <ul className="text-xs text-muted">
                      {b.games.map((g) => (
                        <li key={g.court}>
                          Platz {g.court}: {g.fun ? "Just for fun, " : ""}
                          {g.nameA && g.nameB ? `${g.nameA} – ${g.nameB}` : g.fun ? "Verlierer der Halbfinals" : "noch offen"}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="space-y-3" data-testid="tournament-lobby">
        <h2 className="text-lg font-semibold">Turnier-Lobby ({teams.length} von {t.maxTeams} Teams)</h2>
        {(inRegistration || inPayment) && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" data-testid="tournament-legend">
            <span className="flex items-center gap-1.5"><PlayerLight light="red" /> im Kader</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="orange" /> Team vollzählig{free ? "" : ", noch nicht bezahlt"}</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="green" /> bezahlt</span>
          </p>
        )}
        {teams.length === 0 ? (
          <p className="card text-sm text-muted">Noch kein Team angemeldet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((team) => {
              const paid = team.players.filter((p) => p.paid).length;
              const mine = v?.captainTeamId === team.teamId;
              return (
                <section key={team.teamId} className="card space-y-2" data-testid="tournament-team" data-ready={team.ready} data-paid-ready={team.paidReady}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold"><Link href={`/teams/${team.slug}`} className="hover:text-accent-fg">{team.name}</Link></h3>
                    <span className={`text-xs font-semibold ${team.ready ? "text-accent-fg" : "text-muted"}`}>{inPayment && team.paidReady ? "✓ Bereit" : team.ready ? "✓ Vollzählig" : "Kader offen"}</span>
                  </div>
                  <p className="text-xs text-muted" data-testid="team-captain">Captain: {team.captainName} · {team.players.length} Spieler{priceFixed && !free ? ` · ${paid} bezahlt` : ""}</p>
                  {mine && inPayment && !free && team.dueCents > 0 && (
                    <div className="space-y-1 rounded-lg border border-line p-2" data-testid="captain-pay-box">
                      <ActionButton action={payForTeamAction.bind(null, t.id, undefined)} label={`Als Captain für alle offenen Spieler bezahlen (${formatEuro(team.dueCents)})`} className="btn btn-primary w-full" />
                      <p className="text-xs text-muted">Oder jeder Spieler zahlt für sich, oder du zahlst unten für einzelne Spieler.</p>
                    </div>
                  )}
                  {mine && inPayment && team.dueCents === 0 && team.players.length > 0 && !team.paidReady && (
                    <div className="space-y-1" data-testid="paid-ready-box">
                      <ActionButton action={setPaidReadyAction.bind(null, t.id)} label="Bereit" className="btn btn-primary w-full" />
                      <p className="text-xs text-muted">Euer Team hat komplett bezahlt. Drücke Bereit; das Bracket entsteht, sobald alle Teams bereit sind.</p>
                    </div>
                  )}
                  <ul className="space-y-1.5 text-sm">
                    {team.players.map((p) => (
                      <li key={p.userId} className="flex items-center justify-between gap-2" data-testid="tournament-player" data-paid={p.paid}>
                        <span>
                          <Link href={`/spieler/${p.userId}`} className="hover:text-accent-fg">{p.name}</Link>
                          {p.isCaptain && <span className="ml-2 text-xs text-muted">Captain</span>}
                          {p.paidByOther && <span className="ml-2 text-xs text-muted">vom Captain bezahlt</span>}
                          {p.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <PlayerLight light={lightOf(team.ready, p.paid || (free && inPayment))} />
                          {inPayment && (mine || (v?.myTeamId === team.teamId && p.userId !== user?.id)) && !free && !p.paid && <ActionButton action={payForTeamAction.bind(null, t.id, p.userId)} label="Ich zahle für ihn" className="btn btn-ghost !min-h-8 !px-2 text-xs" />}
                          {inRegistration && !p.isCaptain && (mine || manage) && <ActionButton action={leavePlayerAction.bind(null, t.id, p.userId)} label="Entfernen" confirm="Spieler aus dem Kader nehmen?" />}
                        </span>
                      </li>
                    ))}
                    {inRegistration && Array.from({ length: Math.max(4 - team.players.length, 0) }, (_, i) => (
                      <li key={`free-${i}`} className="flex justify-between text-muted"><span>Wartet auf Spieler {team.players.length + i + 1}</span><span className="text-xs">frei</span></li>
                    ))}
                  </ul>
                  {inRegistration && v?.joinableTeamIds.includes(team.teamId) && (
                    <ActionButton action={joinAsPlayerAction.bind(null, t.id, team.teamId)} label="Dem Turnier-Kader beitreten" className="btn btn-primary w-full" />
                  )}
                  {mine && inRegistration && data.registrationOpen && <InviteBox teamId={team.teamId} teamName={team.name} />}
                  {mine && inRegistration && (
                    <div className="space-y-1">
                      {team.ready ? (
                        <ActionButton action={setRosterCompleteAction.bind(null, t.id, false)} label="Kader wieder öffnen" className="btn btn-ghost w-full" />
                      ) : (
                        <ActionButton action={setRosterCompleteAction.bind(null, t.id, true)} label="Team ist vollzählig" className="btn btn-primary w-full" />
                      )}
                      {!team.ready && <p className="text-xs text-muted">Drücke das erst, wenn alle Spieler in eurem Kader sind (4 bis 6). Danach wartet ihr auf die anderen Teams, dann wird der Preis berechnet.</p>}
                    </div>
                  )}
                  {inRegistration && (mine || manage) && (
                    <ActionButton action={withdrawTeamAction.bind(null, t.id, team.teamId)} label={manage && !mine ? "Team entfernen" : "Team abmelden"} confirm="Team aus dem Turnier nehmen?" />
                  )}
                </section>
              );
            })}
          </div>
        )}
        {inRegistration && teams.length > 0 && (
          <p className="text-sm text-muted" data-testid="roster-progress">
            {teams.filter((x) => x.ready).length} von {t.maxTeams} Teams haben „vollzählig“ gemeldet.{allLocked ? "" : " Sobald alle Plätze belegt und alle Teams vollzählig sind, steht der Preis fest."}
          </p>
        )}
        {v && v.myTeamId && inPayment && !free && !v.iPaid && (
          <section className="card space-y-2" data-testid="pay-entry">
            <p className="text-sm">Dein Anteil: <strong>{formatEuro(v.myDueCents)}</strong> (Hallenkosten {formatEuro(pricing.totalCents ?? 0)} durch {pricing.players} Spieler). Du kannst selbst zahlen, oder dein Captain zahlt für dich. Bei Absage bekommst du alles zurück.</p>
            <ActionButton action={payEntryAction.bind(null, t.id)} label={`${formatEuro(v.myDueCents)} Anteil bezahlen`} className="btn btn-primary w-full" />
          </section>
        )}
        {v && v.myTeamId && inPayment && !free && v.iPaid && <p className="text-sm text-accent-fg" data-testid="paid-note">Dein Anteil ist bezahlt.</p>}
      </section>

      {!data.bracketVisible && (inRegistration || inPayment) && (
        <p className="card text-sm text-muted" data-testid="bracket-hidden">Das Bracket erscheint, sobald alle Teams vollzählig sind, alle Spieler bezahlt haben und jeder Captain „Bereit“ gedrückt hat.</p>
      )}
    </div>
  );
}

function Guest({ id, token }: { id: string; token: string }) {
  return (
    <section className="mx-auto mt-8 max-w-sm space-y-4 text-center">
      <p className="text-sm text-muted">Du wurdest zu einem Turnier eingeladen</p>
      <h1 className="text-2xl font-bold">Turnier auf Socaz</h1>
      <Link href={`/anmelden?next=${encodeURIComponent(`/turniere/${id}?t=${token}`)}`} className="btn btn-primary w-full">Anmelden und Turnier ansehen</Link>
    </section>
  );
}
