import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime, formatTime, toBerlinInputValue } from "@/lib/time";
import { formatEuro, shareCents } from "@/lib/money";
import { hasFreeSlot, MIN_READY_PER_TEAM } from "@/lib/lobby-rules";
import { ShareLink } from "@/components/ShareLink";
import { ActionButton } from "@/components/ActionButton";
import { regenerateGameInviteAction, revokeGameInviteAction } from "@/server/privategame-actions";
import { PrivateTools } from "./PrivateTools";
import { getGameInviteToken } from "@/server/privategame";
import { headers } from "next/headers";
import { db } from "@/db";
import { getCurrentUser } from "@/server/session";
import { CardLight, CardLightLegend, lightFor, LightLegend, PlayerLight } from "@/components/PlayerLight";
import { fakeCardAllowed } from "@/server/payments/mode";
import { cardModeActive } from "@/server/wallet";
import { getCardStatuses, getStoredCardDisplay } from "@/server/payments/card-status";
import { MANDATE_TEXT } from "@/server/payments/card-setup";
import { expectedScore } from "@/lib/elo";
import { canViewLobby, getLobby } from "@/server/lobby";
import { getScheduling } from "@/server/scheduling";
import { getHallCheck, getVeto } from "@/server/veto";
import { ChallengePanel } from "./ChallengePanel";
import { VenueBox } from "./VenueBox";
import { FinalConfirm } from "./FinalConfirm";
import { InviteBox } from "@/app/teams/[slug]/InviteBox";
import { VetoPanel } from "./VetoPanel";
import { Steps, type StepDecision } from "./Steps";
import { windowSlots } from "@/lib/matchmaking";
import { SchedulingPanel } from "./SchedulingPanel";
import { LiveIndicator } from "@/components/LiveIndicator";
import { CancelForm, Countdown, MyActions, ParticipantActions, VenueForm } from "./LobbyClient";

export const metadata: Metadata = { title: "Lobby", robots: { index: false } };

const STATUS: Record<string, { label: string; tone: string }> = {
  lobby: { label: "Wartet auf Spieler", tone: "text-ink" },
  confirmed: { label: "Bestätigt", tone: "text-accent-fg" },
  cancelled: { label: "Abgesagt", tone: "text-ink" },
  played: { label: "Gespielt", tone: "text-muted" },
  disputed: { label: "Ergebnis strittig", tone: "text-ink" },
};

export default async function LobbyPage({ params }: PageProps<"/lobby/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser(); // Öffentliche Lobbys kann jeder ansehen
  const view = await getLobby(id, user ? { id: user.id, role: user.role } : null);
  if (!view) notFound();
  if (!canViewLobby(view)) redirect(user ? "/app" : `/anmelden?next=${encodeURIComponent(`/lobby/${id}`)}`);

  const { match, payments, participants, counts, pendingStrangers, active, roster, strength, capacity } = view;
  const isPrivate = match.kind === "private";
  const v = view.viewer ?? { id: "", platformAdmin: false, membershipTeamId: null, adminOf: [] as string[], participant: null, canManage: false, canJoin: false, teamFull: false, canJoinAsSubstitute: false };
  if (match.kind === "tournament") redirect(`/spiele/${match.id}`); // Turnierspiele haben keine eigene Lobby: Ergebnis auf der Spielseite, Überblick im Turnier
  const confirmed = match.status === "confirmed";
  // Kartenmodell (Vertrag 012): Schalter card_payments_enabled, Standard AUS = bisheriges Guthaben-Verhalten
  const cardOn = await cardModeActive(db, match); // pro Spiel: Schalter EIN, Frist-Regel-Spiel und keine bezahlten Plätze aus dem Guthabenmodell
  const cardStatuses = cardOn ? await getCardStatuses(match.id) : {};
  const storedCard = cardOn && user ? await getStoredCardDisplay(user.id) : null;
  const cardReady = (userId: string) => cardStatuses[userId] === "card_ready";
  const assignedCount = participants.filter((p) => p.teamId).length;
  const cardShareCents = cardOn && payments.priceCents && payments.priceCents > 0 && assignedCount > 0 ? shareCents(payments.priceCents, assignedCount) : null;
  const finalDone = Boolean(match.homeFinalAt && match.awayFinalAt);
  // Haben beide Captains bestätigt, ist die Spielübersicht die Hauptseite für alle Beteiligten
  if (finalDone && match.status !== "cancelled" && user && (v.participant || v.membershipTeamId || v.platformAdmin)) redirect(`/lobby/${match.id}/uebersicht`);
  const winChanceHome = Math.round(expectedScore(strength[match.homeId].elo, strength[match.awayId].elo) * 100);
  const status = STATUS[match.status] ?? STATUS.lobby;
  const scheduling = await getScheduling(match);
  const veto = await getVeto(match.id, match.vetoStatus, match.vetoTurnTeamId, match.vetoTurnDeadline);
  const hallCheck = await getHallCheck(match.id, match.vetoStatus);
  const planning = match.status === "lobby" && (match.vetoStatus === "halls" || match.vetoStatus === "running");
  const open = Boolean(scheduling) || planning;
  const challengePending = match.challengeStatus === "pending" && match.status === "lobby";
  const teamIds = [match.homeId, match.awayId];
  const teamLabel = (id: string) => (id === match.homeId ? match.homeName : match.awayName);
  const step: 1 | 2 | 3 | 4 | null = challengePending || match.status === "cancelled" ? null : scheduling ? 1 : planning ? 2 : confirmed ? 4 : active ? 3 : null;
  const decisions: StepDecision[] =
    step === 1 && scheduling
      ? teamIds.map((id) => {
          const o = scheduling.options.find((x) => x.votedTeamIds.includes(id));
          return { teamId: id, teamName: teamLabel(id), done: Boolean(o), text: o ? `Captain wählt ${formatDateTime(o.startsAt)} Uhr` : "Captain hat noch nicht gewählt" };
        })
      : step === 2 && veto
        ? teamIds.map((id) => {
            const bans = veto.halls.filter((h) => h.bannedByTeam === id).sort((a, b) => (a.banOrder ?? 0) - (b.banOrder ?? 0));
            const turn = veto.status === "running" && veto.turnTeamId === id;
            return { teamId: id, teamName: teamLabel(id), done: !turn && veto.status === "done", active: turn, text: turn ? `Captain ist dran${bans.length ? `, gebannt: ${bans.map((b) => b.name).join(", ")}` : ""}` : bans.length ? `Gebannt: ${bans.map((b) => b.name).join(", ")}` : "Noch keine Halle gebannt" };
          })
        : step === 2
          ? teamIds.map((id) => ({ teamId: id, teamName: teamLabel(id), done: true, text: "Uhrzeit bestätigt, wartet auf die Hallen" }))
          : step === 3 || step === 4
            ? [{ id: match.homeId, name: match.homeName, ready: counts.readyHome }, { id: match.awayId, name: match.awayName, ready: counts.readyAway }].map((t) => ({ teamId: t.id, teamName: t.name, done: t.ready >= MIN_READY_PER_TEAM, text: `${t.ready} von ${MIN_READY_PER_TEAM} Spielern bereit` }))
            : [];
  const decisionTitle = step === 1 ? "Die Captains stimmen ab. Hier siehst du live, wer schon gewählt hat." : step === 2 ? "Die Captains bannen abwechselnd Hallen." : (cardOn ? "Jedes Team macht seine Spieler bereit (Karte hinterlegt)." : "Jedes Team macht seine Spieler bereit und bezahlt.");
  const slots = scheduling ? windowSlots(scheduling.windows, match.durationMin, new Date()).map((d) => ({ value: toBerlinInputValue(d), label: `${formatTime(d)} Uhr` })) : [];
  const dayText = scheduling && scheduling.windows.length ? scheduling.windows.map((w) => new Date(w.from).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "2-digit" })).filter((d, i, a) => a.indexOf(d) === i).join(" oder ") : null;
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
    .filter((t) => canAdminTeam(t.id) && hasFreeSlot(t.count, capacity))
    .map((t) => ({ teamId: t.id, name: t.name }));

  // Privatspiel: Wer schon etwas gezahlt hat, aber weniger als den (neu gerechneten) Anteil, muss die Differenz nachzahlen
  const owes = Boolean(!cardOn && isPrivate && payments.enabled && payments.priceCents && payments.priceCents > 0 && payments.finalShareCents === null && v.participant?.teamId && v.participant.paid && (payments.myDueCents ?? 0) > 0);

  let inviteUrl: string | null = null;
  // Dieselbe Regel wie auf dem Server (canManageInvite): Team-Admin des Heim-Teams oder Plattform-Admin, nicht jeder Admin des Gast-Teams
  const inviteManager = Boolean(isPrivate && user && (v.platformAdmin || v.adminOf.includes(match.homeId)));
  if (inviteManager && user) {
    const token = await getGameInviteToken(user.id, match.id);
    if (token) {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      inviteUrl = `${process.env.APP_URL ?? `${proto}://${host}`}/spiel/${token}`;
    }
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted" data-testid="game-number">{isPrivate ? "Privatspiel" : "Spiel"} #{match.number} · {isPrivate ? "nicht öffentlich, nur per Einladungslink" : "Lobby"}</p>
          <LiveIndicator eventsUrl={`/api/lobby/${match.id}/events`} />
        </div>
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-bold sm:text-3xl" aria-label={`${match.homeName} gegen ${match.awayName}`}>
          <span>{match.homeName}</span>
          <span className="rounded-md bg-accent px-2 py-0.5 font-heading text-lg font-extrabold text-accent-ink" aria-hidden>VS.</span>
          <span>{match.awayName}</span>
        </h1>
        <p className="text-muted">
          {scheduling ? `${match.durationMin} Minuten · ${challengePending ? "Wartet auf Annahme" : "Termin wird noch gewählt"}` : `${formatDateTime(match.startsAt)} Uhr · ${match.durationMin} Minuten${match.vetoStatus === "halls" ? " · Hallen werden angefragt" : match.vetoStatus === "running" ? " · Hallen-Veto läuft" : ""}`}
          {active && !open && <> · <span className="text-ink"><Countdown startsAtIso={match.startsAt.toISOString()} /></span></>}
        </p>
        <p className={`text-sm font-semibold ${status.tone}`} data-testid="match-status">{status.label}</p>
        {!isPrivate && <p className="text-xs text-muted" data-testid="win-chance">
          Spielstärke: {match.homeName} Elo {strength[match.homeId].elo}, {match.awayName} Elo {strength[match.awayId].elo} · Siegchance {winChanceHome} % zu {100 - winChanceHome} %
        </p>}
        {!user && (
          <p className="text-sm">
            <Link href={`/anmelden?next=${encodeURIComponent(`/lobby/${match.id}`)}`} className="text-accent-fg underline">Anmelden</Link>, um beizutreten oder dein Team herauszufordern.
          </p>
        )}
        {!active && match.status !== "cancelled" && (
          <Link href={`/spiele/${match.id}`} className="btn btn-primary mt-2">Zur Spielseite</Link>
        )}
      </header>

      {isPrivate && inviteUrl && (
        <ShareLink url={inviteUrl} title="Einladungslink zum Spiel" shareText={`Privatspiel #${match.number} auf Socaz: komm dazu!`} testId="game-invite" hint={`${participants.length} von ${match.maxPlayers ?? 10} Plätzen belegt. Wer den Link öffnet, meldet sich an oder registriert sich und landet direkt in diesem Spiel.`} />
      )}
      {inviteManager && match.status !== "cancelled" && (
        <section className="flex flex-wrap items-center gap-2" data-testid="invite-admin">
          {inviteUrl && <ActionButton action={revokeGameInviteAction.bind(null, match.id)} label="Link zurückziehen" confirm="Der bisherige Link wird sofort ungültig. Wer schon im Spiel ist, bleibt drin." />}
          <ActionButton action={regenerateGameInviteAction.bind(null, match.id)} label={inviteUrl ? "Neuen Link erzeugen" : "Einladungslink erzeugen"} confirm={inviteUrl ? "Der bisherige Link wird ungültig, ein neuer Link wird erzeugt." : undefined} />
          {!inviteUrl && <p className="text-xs text-muted">Es gibt gerade keinen gültigen Einladungslink.</p>}
        </section>
      )}
      {isPrivate && v.canManage && active && <PrivateTools matchId={match.id} waiting={pendingStrangers.length} assigned={participants.filter((p) => p.teamId).length} />}

      {challengePending && (
        <ChallengePanel
          matchId={match.id}
          homeName={match.homeName}
          awayName={match.awayName}
          role={v.adminOf.includes(match.awayId) ? "target" : v.adminOf.includes(match.homeId) ? "challenger" : "viewer"}
          deadlineText={match.schedulingDeadline ? `${formatDateTime(match.schedulingDeadline)} Uhr` : "–"}
        />
      )}

      {step && <Steps current={step} decisions={decisions} title={decisionTitle} />}

      {hallCheck && (
        <section className="card space-y-2" aria-label="Hallen-Anfrage" data-testid="hall-check">
          <h2 className="font-semibold">Hallen werden angefragt</h2>
          <p className="text-sm text-muted">Der Termin steht. Die Hallen bestätigen, ob sie zu diesem Termin frei sind. Ist eine Halle belegt, scheidet sie aus. Danach folgt das Veto{match.vetoTurnDeadline ? ` (Antwort bis ${formatDateTime(match.vetoTurnDeadline)} Uhr)` : ""}.</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {hallCheck.map((h) => (
              <li key={h.venueId} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2" data-testid="hall-request" data-state={h.status}>
                <span>{h.name} <span className="text-xs text-muted">{h.city}</span></span>
                <span className={`text-xs font-semibold ${h.status === "confirmed" ? "text-accent-fg" : h.status === "declined" ? "text-ink" : "text-ink"}`}>
                  {h.status === "confirmed" ? "Frei" : h.status === "declined" ? "Belegt" : h.status === "pending" ? "Wartet auf Antwort" : "Ohne Bestätigung"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {veto && (
        <VetoPanel
          matchId={match.id}
          halls={veto.halls}
          teams={[{ id: match.homeId, name: match.homeName }, { id: match.awayId, name: match.awayName }]}
          turnTeamId={veto.turnTeamId}
          myTeamId={myAdminTeam}
          deadlineText={veto.deadline ? `${formatDateTime(veto.deadline)} Uhr` : "–"}
          done={veto.status === "done"}
        />
      )}

      {scheduling && !challengePending && (
        <SchedulingPanel
          matchId={match.id}
          teams={[{ id: match.homeId, name: match.homeName }, { id: match.awayId, name: match.awayName }]}
          myTeamId={myAdminTeam}
          deadlineText={match.schedulingDeadline ? `${formatDateTime(match.schedulingDeadline)} Uhr` : "–"}
          minStart={scheduling.minStart}
          slots={slots}
          dayText={dayText}
          options={scheduling.options.map((o) => ({ id: o.id, label: `${formatDateTime(o.startsAt)} Uhr`, proposedBy: o.proposedByTeam ? nameOfTeam(o.proposedByTeam) : "system", proposedByTeamId: o.proposedByTeam, votedTeamIds: o.votedTeamIds }))}
        />
      )}

      {match.status === "lobby" && active && !open && (
        <p className="card text-sm text-muted">
          Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens {MIN_READY_PER_TEAM} Spieler bereit sind.
        </p>
      )}
      {match.status === "cancelled" && <p className="card text-sm text-ink">Dieses Spiel wurde abgesagt.</p>}

      {!open && match.venueName && <VenueBox name={match.venueName} address={match.venueAddress} city={match.venueCity} when={formatDateTime(match.startsAt)} lat={match.venueLat} lng={match.venueLng} />}
      {!open && !match.venueName && active && v.canManage && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Spielort</h2>
          <VenueForm matchId={match.id} venue={match.venueText ?? ""} />
        </section>
      )}
      {!open && !match.venueName && !(active && v.canManage) && (match.venueText ? <VenueBox name={match.venueText} address={null} city={null} when={formatDateTime(match.startsAt)} lat={null} lng={null} /> : <p className="card text-muted">Spielort noch nicht festgelegt. Die Team-Admins legen den Ort fest.</p>)}

      {payments.priceCents === 0 && cardOn && (
        <section className="card space-y-1 text-sm" aria-label="Kosten" data-testid="free-game">
          <h2 className="font-semibold">Kosten</h2>
          <p>Dieses Spiel ist <strong>kostenlos</strong>. Es wird nichts bezahlt.</p>
        </section>
      )}
      {cardOn && payments.priceCents !== null && payments.priceCents > 0 && (
        <section className="card space-y-1 text-sm" aria-label="Kosten" data-testid="card-costs">
          <h2 className="font-semibold">Kosten</h2>
          <p>
            Halle {match.durationMin} Minuten: <strong>{formatEuro(payments.priceCents)}</strong>, geteilt durch alle Spieler.
          </p>
          <p className="text-muted">
            {cardShareCents !== null ? <>Dein Anteil: <strong className="text-ink">{formatEuro(cardShareCents)}</strong> (Miete geteilt durch die eingeteilten Spieler). </> : null}
            Ändert sich die Spielerzahl, ändert sich der Anteil. Dein Anteil wird zur Frist von deiner Karte abgebucht; bis dahin wird nichts abgebucht.
          </p>
        </section>
      )}
      {!cardOn && payments.priceCents === 0 && (
        <section className="card space-y-1 text-sm" aria-label="Kosten" data-testid="free-game">
          <h2 className="font-semibold">Kosten</h2>
          <p>Dieses Spiel ist <strong>kostenlos</strong>. Es wird nichts bezahlt und nichts reserviert.</p>
        </section>
      )}
      {!cardOn && payments.enabled && payments.priceCents !== null && payments.priceCents > 0 && (
        <section className="card space-y-1 text-sm" aria-label="Kosten">
          <h2 className="font-semibold">Kosten</h2>
          <p>
            Halle {match.durationMin} Minuten: <strong>{formatEuro(payments.priceCents)}</strong>, geteilt durch alle zahlenden Spieler.
          </p>
          {match.kind === "private" ? (
            <p className="text-muted">
              Dein Anteil: <strong className="text-ink">{formatEuro(payments.reservationCents ?? 0)}</strong> (Miete geteilt durch die eingeteilten Spieler).
              {payments.finalShareCents === null
                ? " Ändert sich die Spielerzahl, ändert sich der Anteil. Mit dem Bestätigen beider Captains steht er fest."
                : " Der Anteil steht fest."}
            </p>
          ) : payments.settled && payments.finalShareCents ? (
            <p className="text-muted">Abgerechnet: <strong className="text-ink">{formatEuro(payments.finalShareCents)}</strong> pro Spieler.</p>
          ) : (
            <p className="text-muted">
              Dein Anteil liegt zwischen {formatEuro(payments.lowestShareCents ?? 0)} (12 Spieler) und {formatEuro(payments.reservationCents ?? 0)} (nur {payments.minPaid} Spieler).
              Beim Bereitmachen wird der höchste Betrag reserviert, die Differenz kommt bei der Abrechnung zurück.
            </p>
          )}
        </section>
      )}

      {owes && (
        <section className="card space-y-1 text-sm" aria-label="Anteil geändert" data-testid="due-hint">
          <p>
            Anteil jetzt <strong>{formatEuro(payments.reservationCents ?? 0)}</strong>, noch <strong>{formatEuro(payments.myDueCents ?? 0)}</strong> zu zahlen.
          </p>
          <p className="text-muted">Die Spielerzahl hat sich geändert. Du hast schon {formatEuro((payments.reservationCents ?? 0) - (payments.myDueCents ?? 0))} bezahlt; zahle jetzt die Differenz nach.</p>
        </section>
      )}

      {active && open && mode === "participant" && (
        <section className="card space-y-2" data-testid="ready-later">
          <button className="btn btn-primary w-full" disabled>Bereit machen</button>
          <p className="text-sm text-muted">{scheduling ? "Du bist in der Lobby. Bereit machen kannst du, sobald die Captains Uhrzeit und Halle gewählt haben." : "Du bist in der Lobby. Bereit machen kannst du, sobald die Halle feststeht."}</p>
        </section>
      )}

      {active && !open && (
        <MyActions
          matchId={match.id}
          mode={mode}
          ready={v.participant?.ready ?? false}
          hasTeam={Boolean(v.participant?.teamId)}
          card={cardOn ? { ready: cardReady(user?.id ?? ""), mandateText: MANDATE_TEXT, fake: fakeCardAllowed(), shareCents: cardShareCents, stored: storedCard } : null}
          pay={!cardOn && payments.enabled && payments.reservationCents !== null ? { reserveCents: owes ? (payments.myDueCents ?? 0) : payments.reservationCents, balanceCents: payments.balanceCents ?? 0, paid: Boolean(v.participant?.paid) && !owes, backTo: `/lobby/${match.id}` } : null}
          teamPaid={{ paid: participants.filter((p) => p.teamId === v.participant?.teamId && p.paid).length, total: participants.filter((p) => p.teamId === v.participant?.teamId).length }}
        />
      )}

      {cardOn ? <CardLightLegend /> : <LightLegend paymentsOn={payments.enabled} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {teamsView.map((t) => (
          <section key={t.id} className="card space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {isPrivate ? t.name : <Link href={`/teams/${t.slug}`} className="hover:text-accent-fg">{t.name}</Link>}
              </h2>
              <span className="text-xs text-muted">{isPrivate ? "" : `Elo ${strength[t.id].elo}${strength[t.id].matches === 0 ? " (geschätzt)" : ""} · `}{t.count} von {capacity} · bereit {t.ready}/{MIN_READY_PER_TEAM}</span>
            </div>
            <ul className="space-y-2 text-sm">
              {participants.filter((p) => p.teamId === t.id).map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2">
                  <span>
                    {p.name}
                    {p.isVerifiedPro && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent-fg">Profi</span>}
                    {p.isSubstitute && <span className="ml-2 text-xs text-muted">Ersatz</span>}
                    {p.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {cardOn ? <CardLight ready={cardReady(p.userId)} /> : <PlayerLight light={lightFor(p, confirmed)} paymentsOn={payments.enabled} showLabel />}
                    {active && p.userId !== user?.id && canAdminTeam(t.id) && (
                      <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={[]} canUnassign={isPrivate && !p.ready && !p.paid} />
                    )}
                  </span>
                </li>
              ))}
              {Array.from({ length: Math.max(capacity - t.count, 0) }, (_, i) => (
                <li key={`free-${i}`} className="flex items-center justify-between gap-2 text-muted" data-testid="free-slot">
                  <span>Wartet auf Spieler {t.count + i + 1}</span>
                  <span className="text-xs">frei</span>
                </li>
              ))}
            </ul>
            {!isPrivate && roster[t.id].filter((m) => !participants.some((p) => p.userId === m.userId)).length > 0 && (
              <div className="border-t border-line pt-2" data-testid={`roster-${t.slug}`}>
                <p className="mb-1 text-xs text-muted">Weitere Teammitglieder (noch nicht in der Lobby)</p>
                <ul className="space-y-1 text-sm text-muted">
                  {roster[t.id].filter((m) => !participants.some((p) => p.userId === m.userId)).map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-2">
                      <Link href={`/spieler/${m.userId}`} className="hover:text-accent-fg">{m.name}</Link>
                      <span className="text-xs">{[m.position, m.elo ? `Elo ${m.elo}` : null, m.isAdmin ? "Admin" : null].filter(Boolean).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!isPrivate && active && v.adminOf.includes(t.id) && <InviteBox teamId={t.id} teamName={t.name} />}
          </section>
        ))}
      </div>

      {pendingStrangers.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{isPrivate ? "Spieler warten auf ihr Team" : "Ersatzspieler warten auf Zuweisung"}</h2>
          <ul className="space-y-2 text-sm">
            {pendingStrangers.map((p) => (
              <li key={p.userId} className="flex items-center justify-between gap-2">
                <span>{p.name}{p.userId === user?.id && <span className="ml-2 text-xs text-muted">(du)</span>}</span>
                {active && v.canManage && p.userId !== user?.id && (
                  <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={assignTargets} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {active && !open && (
        <FinalConfirm
          matchId={match.id}
          paymentsOn={payments.enabled && !cardOn}
          minPlayers={MIN_READY_PER_TEAM}
          myTeamId={[match.homeId, match.awayId].find((id) => v.adminOf.includes(id)) ?? null}
          teams={[
            { id: match.homeId, name: match.homeName, final: match.homeFinalAt },
            { id: match.awayId, name: match.awayName, final: match.awayFinalAt },
          ].map((t) => {
            const list = participants.filter((p) => p.teamId === t.id);
            const paid = list.filter((p) => p.paid).length;
            const ready = list.filter((p) => p.ready).length;
            return { id: t.id, name: t.name, confirmed: Boolean(t.final), ready, paid, total: list.length, complete: list.length >= MIN_READY_PER_TEAM && ready === list.length && (cardOn ? list.every((p) => cardReady(p.userId)) : !payments.enabled || paid === list.length) };
          })}
        />
      )}

      {active && v.canManage && <CancelForm matchId={match.id} />}
    </div>
  );
}
