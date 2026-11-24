import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { PlayerLight, type Light } from "@/components/PlayerLight";
import { formatEuro } from "@/lib/money";
import { chargeAmount } from "@/server/payments/charge-run";
import { formatDateTime } from "@/lib/time";
import { InviteBox } from "@/app/teams/[slug]/InviteBox";
import {
  cancelTournamentAction,
  closeWithJoinedAction,
  joinAsPlayerAction,
  leavePlayerAction,
  reopenRostersAction,
  setPaidReadyAction,
  setRosterCompleteAction,
  withdrawTeamAction,
} from "@/server/tournament-actions";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { fakeCardAllowed } from "@/server/payments/mode";
import { MANDATE_TEXT } from "@/server/payments/card-setup";
import { getCurrentUser } from "@/server/session";
import { getTournament } from "@/server/tournaments";
import { BoardInfo } from "./BoardInfo";
import { BracketView } from "./BracketView";
import { PersonName } from "@/components/PersonName";
import { autorLabel, personRef, veranstalterLabel } from "@/lib/lobby-namen";
import { getViewerSicht } from "@/server/viewer-sicht";
import { CopyLink } from "./CopyLink";
import { RegisterForm } from "./RegisterForm";
import { hasOpenTournamentAuthorization } from "@/server/payments/authorize";
import { TournamentVenuePick } from "./TournamentVenuePick";
import { listPartnerVenueOptions } from "@/server/tournament-venue";
import { DECLINE_LABELS, isDeclineCode } from "@/lib/hall-decline";
import { istGratis } from "@/lib/gratis";
import { TournamentCard } from "./TournamentCard";
import { ZP, tournamentReadyLabel } from "@/lib/zahlungspflicht-texte";
import { zahlungenAus } from "@/server/zahlungen-aus";

export const metadata: Metadata = { title: "Turnier", robots: { index: false } };

const STATUS_BASIS = { registration: "Kader füllen", payment: "Zahlung läuft", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

export default async function TournamentPage({ params, searchParams }: PageProps<"/turniere/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const user = await getCurrentUser();
  const aus = await zahlungenAus(); // Modus Zahlungen AUS (Go-live): keine Zahlungstexte, nur Anzeige
  // Neuer Nutzer über den Einladungslink: erst das Onboarding, danach zurück ins Turnier (der Token bleibt erhalten)
  if (user && !user.onboardedAt && token) redirect(`/willkommen?next=${encodeURIComponent(`/turniere/${id}?t=${token}`)}`);
  const data = await getTournament(id, user ? { id: user.id, role: user.role } : null, token);
  if (!data) {
    // Gäste mit Einladungslink können sich anmelden; Fremde ohne Link sehen nichts
    if (!user && token) return <Guest id={id} token={token} />;
    notFound();
  }
  const { tournament: t, teams, viewer: v, pricing } = data;
  // AC-17 (Entscheid t2q 2026-11-24): Personennamen (Veranstalter, Captain, Spieler) nur für Angemeldete, sonst Initialen ohne Link; Teilnehmer und Veranstalter sehen Namen wie immer
  const { sicht } = await getViewerSicht({ participant: Boolean(v?.myTeamId), teamAdmin: Boolean(v?.captainTeamId || v?.isOrganizer) });
  const manage = Boolean(v?.isOrganizer);
  const priceFixed = pricing.shareCents !== null;
  const free = istGratis({ totalCents: pricing.totalCents, finalShareCents: pricing.shareCents }); // EINE Regel mit dem Server (src/lib/gratis.ts)
  const inRegistration = t.status === "registration";
  const inPayment = t.status === "payment";
  // Keine Zahlungstexte bei einem Turnier OHNE Preis (Go-live: bei Zahlungen AUS wird jedes neue Turnier mit Preis 0 angelegt). Ein Turnier MIT Preis (Altbestand) bleibt bei Zahlungen AUS im bisherigen Fluss (pausierter Kartenfluss, nie still gratis) und behält seine Hinweise.
  const noMoney = free;
  const STATUS = noMoney ? { ...STATUS_BASIS, payment: "Bereit melden" } : STATUS_BASIS;
  const allLocked = teams.length === t.maxTeams && teams.every((x) => x.ready);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  // Turnier ohne Halle im Kartenmodell: der Veranstalter waehlt sie hier (sonst laesst sich der Preis nicht festlegen)
  // Ablehnung der Halle (Backlog 161): nur die Kategorie ist sichtbar (nie der Freitext); die Entscheidung ist endgueltig, der Veranstalter waehlt die Halle erneut (auch dieselbe) oder sagt ab
  const declinedCode = t.venueDeclinedAt && isDeclineCode(t.venueDeclineCode) ? t.venueDeclineCode : null;
  const declined = declinedCode !== null && (inPayment || inRegistration);
  const venueOptionsRaw = manage && inRegistration && ((!t.venueId && data.cardMode) || declined) ? await listPartnerVenueOptions({ force: declined }) : null;
  const venueOptions = venueOptionsRaw && declined ? venueOptionsRaw.map((o) => (o.id === t.venueId ? { ...o, label: `${o.label} (hat abgelehnt)` } : o)) : venueOptionsRaw;
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
          Veranstalter: {veranstalterLabel(data.organizerName, sicht)} · {STATUS[t.status]} · {teams.length}/{t.maxTeams} Teams · {free ? "kostenlos" : `Hallenkosten ${formatEuro(pricing.totalCents ?? 0)}, geteilt durch alle Spieler`}
          {t.registrationDeadline ? ` · Anmeldeschluss ${formatDateTime(t.registrationDeadline)} Uhr` : ""}
          {t.isPrivate ? " · privat" : ""}
        </p>
        {data.winner && (
          <p className="text-accent-fg" data-testid="winner">
            Turniersieger: <span className="font-semibold">{data.winner}</span>
          </p>
        )}
      </header>

      {t.status === "cancelled" && (
        <p className="card text-sm" data-testid="cancelled-note">Dieses Turnier wurde abgesagt.</p>
      )}
      {!user && (inRegistration || inPayment) && (
        <Link href={`/anmelden?next=${encodeURIComponent(`/turniere/${t.id}${token ? `?t=${token}` : ""}`)}`} className="btn btn-primary w-full">Anmelden und mitmachen</Link>
      )}
      {linkUrl && (inRegistration || inPayment) && <CopyLink url={linkUrl} title={t.name} />}
      {declined && inPayment && manage && (
        <section className="card space-y-3" data-testid="venue-declined">
          <h2 className="font-semibold">Die Halle kann das Turnier nicht ausrichten</h2>
          <p className="text-sm" data-testid="venue-declined-reason">
            Grund: {DECLINE_LABELS[declinedCode!]}. Die Halle hat diese Anfrage abgelehnt; das bleibt so. Wähle eine andere Halle, frage dieselbe Halle neu an oder sage das Turnier ab.
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <ActionButton action={reopenRostersAction.bind(null, t.id)} label="Andere Halle wählen" confirm={ZP.hallDeclinedReopenConfirm} thenGo={`/turniere/${t.id}`} className="btn btn-primary !min-h-11 !px-4 text-sm" />
            <ActionButton action={cancelTournamentAction.bind(null, t.id)} label="Turnier absagen" confirm={ZP.hallDeclinedCancelConfirm} className="btn btn-ghost !min-h-11 !px-4 text-sm" />
          </div>
          <p className="text-xs text-muted">{ZP.hallDeclinedCancelNote}</p>
        </section>
      )}
      {declined && inPayment && !manage && v && (v.myTeamId || v.captainTeamId) && (
        <p className="card text-sm" data-testid="venue-declined-team">Die Halle kann das Turnier nicht ausrichten. Der Veranstalter wählt eine andere Halle oder sagt das Turnier ab.</p>
      )}
      {venueOptions && <TournamentVenuePick tournamentId={t.id} options={venueOptions} declinedCode={declined && declinedCode ? DECLINE_LABELS[declinedCode] : null} />}
      {v && v.registerableTeams.length > 0 && <RegisterForm tournamentId={t.id} teams={v.registerableTeams} aus={aus && noMoney} noMoney={noMoney} />}
      {v && data.registrationOpen && !v.isOrganizer && !v.captainTeamId && !v.myTeamId && v.registerableTeams.length === 0 && v.joinableTeamIds.length === 0 && (
        <section className="card space-y-2" data-testid="no-team-hint">
          <p className="text-sm">Du hast kein Team, das sich anmelden kann. Gründe ein Team, danach kommst du direkt hierher zurück und meldest es an.</p>
          <Link href={`/app/teams/neu?next=${encodeURIComponent(`/turniere/${t.id}${token ? `?t=${token}` : ""}`)}`} className="btn btn-primary w-full">Team gründen</Link>
        </section>
      )}

      {(inRegistration || inPayment) && free && (
        <section className="card space-y-1 text-sm" aria-label="Ablauf des Turniers" data-testid="free-flow">
          <h2 className="font-semibold">Ablauf des Turniers</h2>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted">
            {ZP.tournamentFreeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="text-xs text-muted">{ZP.tournamentFreeNote}</p>
        </section>
      )}

      {(inRegistration || inPayment || t.status === "running") && !free && (
        <section className="card space-y-1 text-sm" aria-label="So wird bezahlt" data-testid="pricing-box">
          <h2 className="font-semibold">So läuft es ab</h2>
          <ol className="list-decimal space-y-0.5 pl-5 text-muted">
            <li className={inRegistration ? "text-ink" : ""}>Alle Teams füllen ihren Kader. Der Captain meldet: „Team ist vollzählig“.</li>
            <li className={inPayment ? "text-ink" : ""}>Sobald alle Teams vollzählig sind, wird der Preis pro Spieler automatisch berechnet: Hallenkosten geteilt durch alle Spieler.</li>
            <li className={inPayment ? "text-ink" : ""}>{data.cardMode ? "Jeder Spieler hinterlegt eine Karte (oder ein Mitspieler übernimmt seinen Anteil). Die Ampel wird grün. Bezahlt wird jetzt nichts." : "Jeder Spieler bezahlt genau diesen Betrag (oder der Captain für ihn). Die Ampel wird grün."}</li>
            <li className={t.status === "running" ? "text-ink" : ""}>{data.cardMode ? "Zur Frist wird der Anteil von der Karte abgebucht. Sind alle abgebucht, erscheint das Bracket." : "Haben alle bezahlt, erscheint das Bracket."}</li>
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
            {inRegistration && free && teams.filter((x) => x.ready).length >= 4 && (teams.length < t.maxTeams || teams.some((x) => !x.ready)) && (
              <ActionButton action={closeWithJoinedAction.bind(null, t.id)} label={`Anmeldung schließen und mit den ${teams.filter((x) => x.ready).length} bereiten Teams starten`} confirm="Die Anmeldung wird geschlossen. Teams, deren Kader nicht vollzählig ist, sind nicht dabei. Danach erscheint der Spielplan." className="btn btn-primary !min-h-11 !px-4 text-sm" />
            )}
            {inRegistration && !free && data.deadlinePassed && teams.length < t.maxTeams && teams.length >= 4 && (
              <ActionButton action={closeWithJoinedAction.bind(null, t.id)} label={`Mit den ${teams.length} angemeldeten Teams starten`} confirm="Die Teamzahl wird auf die angemeldeten Teams gesenkt. Danach wird der Preis berechnet, sobald alle Teams vollzählig sind." className="btn btn-primary !min-h-11 !px-4 text-sm" />
            )}
            {inPayment && !declined && (
              <ActionButton action={reopenRostersAction.bind(null, t.id)} label="Kader wieder öffnen" confirm="Alle bereits gezahlten Anteile werden erstattet, der Preis wird später neu berechnet." className="btn btn-ghost !min-h-11 !px-4 text-sm" />
            )}
            {!(declined && inPayment) && <ActionButton action={cancelTournamentAction.bind(null, t.id)} label="Turnier absagen" confirm="Turnier absagen? Alle bezahlten Anteile werden vollständig erstattet." className="btn btn-danger !min-h-11 !px-4 text-sm" />}
          </div>
          <p className="text-xs text-muted">{noMoney ? "Du kannst Teams entfernen und durch neue ersetzen, solange der Spielplan noch nicht steht. Mit weniger Teams startest du über den Knopf „Anmeldung schließen“ (mindestens 4), oder du sagst das Turnier ab." : "Bis zum Anmeldeschluss kannst du Teams entfernen und durch neue ersetzen. Danach kannst du mit weniger Teams starten (mindestens 4) oder absagen. Wenn in der Zahlungsphase jemand nicht zahlt, öffne die Kader wieder: Alles wird erstattet und der Preis neu berechnet."}</p>
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
                          Platz {g.court}: {g.fun ? "Spaßspiel, " : ""}
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
        {/* Kartenmodell: Gaeste und Spieler ohne Bezug zum Turnier sehen nur die Anzahl und den Status (Entscheid t9) */}
        {data.paymentsPaused && !noMoney && <p className="text-sm text-muted" data-testid="payments-paused">Zahlungen sind gerade pausiert. Abgebucht wird erst, wenn sie wieder eingeschaltet sind.</p>}
        {data.cardMode && !(v?.isOrganizer || v?.myTeamId) && <p className="text-sm text-muted" data-testid="teams-count">Teams angemeldet: {teams.length} · {STATUS[t.status]}</p>}
        {(inRegistration || inPayment) && !(data.cardMode && !(v?.isOrganizer || v?.myTeamId)) && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" data-testid="tournament-legend">
            <span className="flex items-center gap-1.5"><PlayerLight light="red" paymentsOn={!noMoney} /> im Kader</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="orange" paymentsOn={!noMoney} /> Team vollzählig{noMoney ? "" : data.cardMode ? ", noch keine Karte" : ", noch nicht bezahlt"}</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="green" paymentsOn={!noMoney} /> {noMoney ? "bereit" : data.cardMode ? "Karte hinterlegt" : "bezahlt"}</span>
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
                    <h3 className="font-semibold"><Link href={`/teams/${team.slug}`} className="inline-flex min-h-11 items-center hover:text-accent-fg">{team.name}</Link></h3>
                    <span className={`text-xs font-semibold ${team.ready ? "text-accent-fg" : "text-muted"}`}>{inPayment && team.paidReady ? "✓ Bereit" : team.ready ? "✓ Vollzählig" : "Kader offen"}</span>
                  </div>
                  <p className="text-xs text-muted" data-testid="team-captain">Captain: {team.captainName === "–" ? "–" : autorLabel(team.captainName, sicht)} · {team.players.length} Spieler{priceFixed && !noMoney && (!data.cardMode || team.showLights) ? ` · ${paid} ${data.cardMode ? "gedeckt" : "bezahlt"}` : ""}</p>
                  {mine && inPayment && team.dueCents === 0 && team.cardMissing === 0 && team.players.length > 0 && !team.paidReady && (
                    <div className="space-y-1" data-testid="paid-ready-box">
                      <ActionButton action={setPaidReadyAction.bind(null, t.id)} label={tournamentReadyLabel({ cardMode: data.cardMode, free: noMoney, paused: Boolean(data.paymentsPaused) })} className="btn btn-primary w-full" />
                      <p className="text-xs text-muted">{noMoney ? "Drücke Bereit; das Bracket entsteht, sobald alle Teams bereit sind." : data.cardMode ? (data.paymentsPaused ? ZP.tournamentReadyPause : "Alle in eurem Team haben eine Karte hinterlegt. Drücke Bereit; abgebucht wird erst zur Frist.") : "Euer Team hat komplett bezahlt. Drücke Bereit; das Bracket entsteht, sobald alle Teams bereit sind."}</p>
                    </div>
                  )}
                  {data.cardMode && !noMoney && team.cardsComplete !== null && <p className="text-xs text-muted" data-testid="team-cards-state">{team.cardsComplete ? "Karten komplett" : "Karten unvollständig"}</p>}
                  <ul className="space-y-1.5 text-sm">
                    {team.players.map((p, pi) => (
                      <li key={personRef(sicht, p.userId, p.name, pi).key} className="flex items-center justify-between gap-2" data-testid="tournament-player" data-paid={p.paid}>
                        <span>
                          <PersonName person={personRef(sicht, p.userId, p.name, pi)} />
                          {p.isCaptain && <span className="ml-2 text-xs text-muted">Captain</span>}
                          {p.paidByOther && !noMoney && <span className="ml-2 text-xs text-muted">vom Captain bezahlt</span>}
                          {p.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          {team.showLights && <PlayerLight light={lightOf(team.ready, p.paid || (free && inPayment))} paymentsOn={!noMoney} />}
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
                  {inRegistration && !noMoney && v?.joinableTeamIds.includes(team.teamId) && (
                    <p className="text-xs text-muted" data-testid="kader-hint">{ZP.hintLater}</p>
                  )}
                  {mine && inRegistration && data.registrationOpen && <InviteBox teamId={team.teamId} teamName={team.name} />}
                  {mine && inRegistration && (
                    <div className="space-y-1">
                      {team.ready ? (
                        <ActionButton action={setRosterCompleteAction.bind(null, t.id, false)} label="Kader wieder öffnen" className="btn btn-ghost w-full" />
                      ) : (
                        <ActionButton action={setRosterCompleteAction.bind(null, t.id, true)} label="Team ist vollzählig" className="btn btn-primary w-full" />
                      )}
                      {!team.ready && <p className="text-xs text-muted">Drücke das erst, wenn alle Spieler in eurem Kader sind (4 bis 6). Danach wartet ihr auf die anderen Teams{noMoney ? "." : ", dann wird der Preis berechnet."}</p>}
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
            {teams.filter((x) => x.ready).length} von {t.maxTeams} Teams haben „vollzählig“ gemeldet.{allLocked ? "" : noMoney ? " Sobald alle Plätze belegt und alle Teams vollzählig sind, geht es los." : " Sobald alle Plätze belegt und alle Teams vollzählig sind, steht der Preis fest."}
          </p>
        )}
        {data.cardMode && !noMoney && v && v.myTeamId && (inRegistration || inPayment) && (
          <TournamentCard
            tournamentId={t.id}
            hasOwnCard={v.hasOwnCard}
            mandateText={MANDATE_TEXT}
            coverMandateText={translate(DEFAULT_LOCALE, "cover.mandate.v1.entwurf")}
            fake={fakeCardAllowed()}
            teammates={(teams.find((x) => x.teamId === v.myTeamId)?.players ?? []).filter((p) => p.userId !== user?.id).map((p) => ({ userId: p.userId, name: p.name, hasCard: p.paid && !p.covered, covered: p.covered }))}
            coveringName={v.coveringUserId ? (teams.find((x) => x.teamId === v.myTeamId)?.players.find((p) => p.userId === v.coveringUserId)?.name ?? null) : null}
            canCover={v.hasOwnCard}
            coverAmounts={priceFixed && !free ? ((a) => (a !== null ? { own: formatEuro(a), target: formatEuro(a), total: formatEuro(a * 2), estimated: false } : null))(chargeAmount(pricing.totalCents ?? null, pricing.shareCents)) : null}
            needsAuthorization={Boolean(user) && inPayment && (await hasOpenTournamentAuthorization(user!.id, t.id))}
          />
        )}
      </section>

      {!data.bracketVisible && (inRegistration || inPayment) && (
        <p className="card text-sm text-muted" data-testid="bracket-hidden">{noMoney ? "Der Spielplan erscheint, sobald alle Plätze belegt und alle Teams vollzählig sind. Sonst schließt der Veranstalter die Anmeldung und startet mit den bereiten Teams." : data.cardMode ? "Das Bracket erscheint, sobald alle Teams vollzählig sind, alle Spieler eine Karte hinterlegt haben, jeder Captain „Bereit“ gedrückt hat und der Anteil zur Frist abgebucht ist." : "Das Bracket erscheint, sobald alle Teams vollzählig sind, alle Spieler bezahlt haben und jeder Captain „Bereit“ gedrückt hat."}</p>
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
