import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { PlayerLight } from "@/components/PlayerLight";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { InviteBox } from "@/app/teams/[slug]/InviteBox";
import {
  cancelTournamentAction,
  closeWithJoinedAction,
  decideShootoutAction,
  joinAsPlayerAction,
  leavePlayerAction,
  payEntryAction,
  payForTeamAction,
  setTeamReadyAction,
  withdrawTeamAction,
} from "@/server/tournament-actions";
import { getCurrentUser } from "@/server/session";
import { getTournament } from "@/server/tournaments";
import { CopyLink } from "./CopyLink";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "Turnier", robots: { index: false } };

const STATUS = { registration: "Anmeldung offen", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" } as const;

const stageLabel = (stage: string) => {
  if (stage === "round") return "Spielplan";
  if (stage.startsWith("group:")) return `Gruppe ${stage.slice(6)}`;
  const n = Number(stage.slice(3));
  return n === 2 ? "Finale" : n === 4 ? "Halbfinale" : n === 8 ? "Viertelfinale" : `Runde der letzten ${n}`;
};

export default async function TournamentPage({ params, searchParams }: PageProps<"/turniere/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : null;
  const user = await getCurrentUser();
  const data = await getTournament(id, user ? { id: user.id, role: user.role } : null, token);
  if (!data) {
    // Gäste mit Einladungslink können sich anmelden; Fremde ohne Link sehen nichts
    if (!user && token) return <Guest id={id} token={token} />;
    notFound();
  }
  const { tournament: t, teams, viewer: v } = data;
  const manage = Boolean(v?.isOrganizer);
  const pricing = data.pricing;
  const fee = pricing.reservationCents; // Vorauszahlung pro Spieler (0 = kostenlos)
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const linkUrl = t.inviteToken ? `${process.env.APP_URL ?? `${proto}://${host}`}/turniere/${t.id}?t=${t.inviteToken}` : null;

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
          Veranstalter: {data.organizerName} · {STATUS[t.status]} · {teams.length}/{t.maxTeams} Teams · {pricing.totalCents !== null ? (pricing.totalCents > 0 ? `Hallenkosten ${formatEuro(pricing.totalCents)}, geteilt durch alle Spieler` : "kostenlos") : fee > 0 ? `Eintritt ${formatEuro(fee)} pro Spieler` : "kostenlos"}
          {t.registrationDeadline ? ` · Anmeldeschluss ${formatDateTime(t.registrationDeadline)} Uhr` : ""}
          {t.isPrivate ? " · privat" : ""}
        </p>
        {data.winner && (
          <p className="text-green" data-testid="winner">
            Turniersieger: <span className="font-semibold">{data.winner}</span>
          </p>
        )}
      </header>

      {!user && (
        <Link href={`/anmelden?next=${encodeURIComponent(`/turniere/${t.id}${token ? `?t=${token}` : ""}`)}`} className="btn btn-primary w-full">Anmelden und mitmachen</Link>
      )}
      {linkUrl && <CopyLink url={linkUrl} title={t.name} />}
      {pricing.totalCents !== null && pricing.totalCents > 0 && (
        <section className="card space-y-1 text-sm" aria-label="So wird bezahlt" data-testid="pricing-box">
          <h2 className="font-semibold">So wird bezahlt</h2>
          <p>
            Hallenkosten: <strong>{formatEuro(pricing.totalCents)}</strong>
            {pricing.hourlyCents !== null && pricing.durationMin !== null ? ` (${formatEuro(pricing.hourlyCents)} pro Stunde mal ${(pricing.durationMin / 60).toLocaleString("de-DE")} Stunden)` : ""}. Sie werden durch <strong>alle Spieler</strong> geteilt.
          </p>
          {pricing.finalShareCents !== null ? (
            <p data-testid="final-share">Endgültiger Anteil: <strong>{formatEuro(pricing.finalShareCents)}</strong> pro Spieler. Zu viel Gezahltes wurde erstattet.</p>
          ) : (
            <>
              <p data-testid="reservation-info">Du zahlst vorab <strong>{formatEuro(pricing.reservationCents)}</strong> (der höchste mögliche Anteil, falls jedes Team nur mit 4 Spielern antritt). {pricing.range && `Je nach Kadergröße landet dein Anteil zwischen ${formatEuro(pricing.range.lowest)} und ${formatEuro(pricing.range.highest)}.`}</p>
              <p className="text-muted">Sind alle Teams da, bezahlt und bereit, steht die Spielerzahl fest. Dann wird genau abgerechnet und der Rest sofort aufs Guthaben zurückgebucht.</p>
            </>
          )}
        </section>
      )}
      {v && v.registerableTeams.length > 0 && <RegisterForm tournamentId={t.id} teams={v.registerableTeams} />}

      {manage && (t.status === "registration" || t.status === "running") && (
        <section className="card space-y-2" data-testid="organizer-box">
          <h2 className="font-semibold">Veranstalter</h2>
          <div className="flex flex-wrap gap-2">
            {t.status === "registration" && data.deadlinePassed && teams.length < t.maxTeams && teams.length >= 4 && (
              <ActionButton action={closeWithJoinedAction.bind(null, t.id)} label={`Mit den ${teams.length} angemeldeten Teams starten`} confirm="Die Teamzahl wird auf die angemeldeten Teams gesenkt. Danach erscheint das Bracket, sobald alle Captains bereit sind." className="btn btn-primary !min-h-9 !px-3 text-sm" />
            )}
            <ActionButton action={cancelTournamentAction.bind(null, t.id)} label="Turnier absagen" confirm="Turnier absagen? Alle bezahlten Eintritte gehen vollständig aufs Guthaben der Spieler zurück." className="btn btn-danger !min-h-9 !px-3 text-sm" />
          </div>
          <p className="text-xs text-muted">Bis zum Anmeldeschluss kannst du Teams entfernen und durch neue ersetzen. Danach kannst du nur mit weniger Teams starten (mindestens 4) oder absagen.</p>
        </section>
      )}

      <section className="space-y-3" data-testid="tournament-lobby">
        <h2 className="text-lg font-semibold">Turnier-Lobby ({teams.length} von {t.maxTeams} Teams)</h2>
        {t.status === "registration" && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted" data-testid="tournament-legend">
            <span className="flex items-center gap-1.5"><PlayerLight light="red" /> im Kader, noch nicht bezahlt</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="orange" /> bezahlt</span>
            <span className="flex items-center gap-1.5"><PlayerLight light="green" /> Team bereit</span>
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
                <section key={team.teamId} className="card space-y-2" data-testid="tournament-team" data-ready={team.ready}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold"><Link href={`/teams/${team.slug}`} className="hover:text-green">{team.name}</Link></h3>
                    <span className={`text-xs font-semibold ${team.ready ? "text-green" : "text-muted"}`}>{team.ready ? "✓ Bereit" : "Nicht bereit"}</span>
                  </div>
                  <p className="text-xs text-muted" data-testid="team-captain">Captain: {team.captainName} · {team.players.length} Spieler{fee > 0 ? ` · ${paid} bezahlt` : ""}</p>
                  {mine && fee > 0 && t.status === "registration" && !t.bracketGeneratedAt && team.dueCents > 0 && (
                    <div className="space-y-1 rounded-lg border border-line p-2" data-testid="captain-pay-box">
                      <ActionButton action={payForTeamAction.bind(null, t.id, undefined)} label={`Als Captain für alle offenen Spieler bezahlen (${formatEuro(team.dueCents)})`} className="btn btn-primary w-full" />
                      <p className="text-xs text-muted">Oder jeder Spieler zahlt für sich, oder du zahlst unten für einzelne Spieler.</p>
                    </div>
                  )}
                  <ul className="space-y-1.5 text-sm">
                    {team.players.map((p) => (
                      <li key={p.userId} className="flex items-center justify-between gap-2" data-testid="tournament-player" data-paid={p.paid}>
                        <span>
                          <Link href={`/spieler/${p.userId}`} className="hover:text-green">{p.name}</Link>
                          {p.isCaptain && <span className="ml-2 text-xs text-muted">Captain</span>}
                          {p.paidByOther && <span className="ml-2 text-xs text-muted">vom Captain bezahlt</span>}
                          {p.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <PlayerLight light={team.ready && p.paid ? "green" : p.paid ? "orange" : "red"} />
                          {t.status === "registration" && mine && fee > 0 && !p.paid && <ActionButton action={payForTeamAction.bind(null, t.id, p.userId)} label="Ich zahle für ihn" className="btn btn-ghost !min-h-8 !px-2 text-xs" />}
                          {t.status === "registration" && !p.isCaptain && (mine || manage) && <ActionButton action={leavePlayerAction.bind(null, t.id, p.userId)} label="Entfernen" confirm="Spieler aus dem Kader nehmen? Bezahltes wird erstattet." />}
                        </span>
                      </li>
                    ))}
                    {Array.from({ length: Math.max(4 - team.players.length, 0) }, (_, i) => (
                      <li key={`free-${i}`} className="flex justify-between text-muted"><span>Wartet auf Spieler {team.players.length + i + 1}</span><span className="text-xs">frei</span></li>
                    ))}
                  </ul>
                  {v?.joinableTeamIds.includes(team.teamId) && (
                    <ActionButton action={joinAsPlayerAction.bind(null, t.id, team.teamId)} label="Dem Turnier-Kader beitreten" className="btn btn-primary w-full" />
                  )}
                  {mine && data.registrationOpen && <InviteBox teamId={team.teamId} teamName={team.name} />}
                  {mine && t.status === "registration" && !t.bracketGeneratedAt && (
                    <div className="space-y-1">
                      {team.ready ? (
                        <ActionButton action={setTeamReadyAction.bind(null, t.id, false)} label="Bereit zurücknehmen" className="btn btn-ghost w-full" />
                      ) : (
                        <ActionButton action={setTeamReadyAction.bind(null, t.id, true)} label="Team ist bereit" className="btn btn-primary w-full" />
                      )}
                      {!team.ready && <p className="text-xs text-muted">Bereit geht erst, wenn mindestens 4 Spieler im Kader sind{fee > 0 ? " und alle ihren Eintritt bezahlt haben" : ""}.</p>}
                    </div>
                  )}
                  {t.status === "registration" && (mine || manage) && (
                    <ActionButton action={withdrawTeamAction.bind(null, t.id, team.teamId)} label={manage && !mine ? "Team entfernen" : "Team abmelden"} confirm="Team aus dem Turnier nehmen? Alle bezahlten Eintritte des Teams werden erstattet." />
                  )}
                </section>
              );
            })}
          </div>
        )}
        {v && v.myTeamId && !v.iPaid && fee > 0 && t.status === "registration" && (
          <section className="card space-y-2" data-testid="pay-entry">
            <p className="text-sm">Dein Anteil jetzt: <strong>{formatEuro(v.myDueCents)}</strong>. Du kannst selbst zahlen, oder dein Captain zahlt für dich. Er wird von deinem Guthaben abgebucht, nach der endgültigen Spielerzahl abgerechnet (Rest zurück) und bei Absage oder Austritt vollständig erstattet.</p>
            <ActionButton action={payEntryAction.bind(null, t.id)} label={`${formatEuro(v.myDueCents)} Anteil bezahlen`} className="btn btn-primary w-full" />
          </section>
        )}
        {v && v.myTeamId && v.iPaid && fee > 0 && t.status === "registration" && <p className="text-sm text-green" data-testid="paid-note">Dein Anteil ist bezahlt.</p>}
      </section>

      {!data.bracketVisible && t.status === "registration" && (
        <p className="card text-sm text-muted" data-testid="bracket-hidden">Das Bracket erscheint, sobald alle Teams beigetreten sind und alle Captains auf „Bereit“ gedrückt haben.</p>
      )}

      {data.tables.map((table) => (
        <section key={table.name} className="space-y-2">
          <h2 className="text-lg font-semibold">{table.name}</h2>
          <div className="card overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="p-2">#</th><th>Team</th><th>Sp</th><th>S-U-N</th><th>Tore</th><th className="pr-3 text-right">Pkt</th></tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={r.teamId} className="border-t border-line"><td className="p-2">{i + 1}</td><td>{r.name}</td><td>{r.played}</td><td>{r.wins}-{r.draws}-{r.losses}</td><td>{r.gf}:{r.ga}</td><td className="pr-3 text-right font-bold">{r.points}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {data.bracketVisible && data.stages.map((stage) => (
        <section key={stage.stage} className="space-y-2" data-testid="bracket-stage">
          <h2 className="text-lg font-semibold">{stageLabel(stage.stage)}</h2>
          <ul className="space-y-2">
            {stage.matches.map((m) => {
              const done = m.scoreA !== null && m.scoreB !== null;
              return (
                <li key={m.id} className="card space-y-2" data-testid="tournament-match">
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                    <span className="text-right font-semibold">{m.nameA ?? "offen"}</span>
                    <span className="font-heading text-lg tabular-nums">{done ? `${m.scoreA} : ${m.scoreB}` : "–"}</span>
                    <span className="font-semibold">{m.nameB ?? "offen"}</span>
                  </div>
                  {m.shootoutWinner && <p className="text-center text-xs text-muted">Sieger im Siebenmeterschießen: {m.shootoutWinner === m.teamA ? m.nameA : m.nameB}</p>}
                  {m.matchId && !done && (
                    <p className="text-center text-xs"><Link href={`/spiele/${m.matchId}`} className="text-green underline">Zum Spiel: Ergebnis melden und bestätigen</Link></p>
                  )}
                  {m.pendingShootout && manage && m.teamA && m.teamB && (
                    <div className="flex flex-wrap items-center justify-center gap-2 text-sm" data-testid="shootout">
                      <span className="text-muted">Unentschieden. Sieger im Siebenmeterschießen:</span>
                      <ActionButton action={decideShootoutAction.bind(null, t.id, m.id, m.teamA)} label={m.nameA ?? ""} className="btn btn-primary !min-h-9 !px-3 text-sm" />
                      <ActionButton action={decideShootoutAction.bind(null, t.id, m.id, m.teamB)} label={m.nameB ?? ""} className="btn btn-primary !min-h-9 !px-3 text-sm" />
                    </div>
                  )}
                  {m.pendingShootout && !manage && <p className="text-center text-xs text-muted">Unentschieden: Der Veranstalter trägt das Siebenmeterschießen ein.</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
