import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatDateTime, formatTime, toBerlinInputValue } from "@/lib/time";
import { formatEuro } from "@/lib/money";
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
import { getCoverView } from "@/server/payments/cover-view";
import { MIN_CHARGE_CENTS } from "@/server/payments/charge-run";
import { DEFAULT_LOCALE, translate } from "@/lib/i18n";
import { cardModeActive } from "@/server/wallet";
import { cardView } from "@/lib/card-view";
import { getCardDisplays, getStoredCardDisplay, getTeamCardsReady } from "@/server/payments/card-status";
import { audienceFor, canSeeAnyStatus } from "@/lib/card-visibility";
import { chargeFailureText } from "@/lib/charge-failure-text";
import { graceText } from "@/lib/grace";
import { lobbySicht, personRef } from "@/lib/lobby-namen";
import { lobbyStand } from "@/lib/lobby-stand";
import { lobbyFehlerFall } from "@/lib/lobby-fehler";
import { isVenueManager } from "@/server/venue-access-rules";
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
import { CoverButton, CoverCoveringCard, ReleaseCover } from "./CoverShare";
import { LobbyRoster, ParticipantName } from "./LobbyRoster";
import { LobbyCaptainBarFor } from "./LobbyCaptainBar";

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
  // Kartenmodell (Vertrag 012): Schalter card_payments_enabled, Standard AUS = Spiele ohne Kartenpflicht
  const cardOn = await cardModeActive(db, match); // pro Spiel: Schalter EIN, Frist-Regel-Spiel und keine bezahlten Plätze aus dem Altmodell
  // Sichtbarkeit je Betrachter wird HIER auf dem Server entschieden (Vertrag 012, AC-12/AC-20): Gäste sehen keinen Status je Person, Mitspieler nur die neutrale
  // rote Ampel ohne Grund, nur der Betroffene und der Captain/Veranstalter den echten Status. Der Rohstatus erreicht die Seite nie.
  // "Gast" für Namen = nicht angemeldet; "Gast" für den Zahlstatus je Person = keine Teilnahme (siehe audienceFor in card-visibility.ts)
  const cardViewer = { userId: user?.id ?? null, platformAdmin: v.platformAdmin, adminOf: v.adminOf, isParticipant: Boolean(v.participant) };
  const canSeeLights = canSeeAnyStatus(cardViewer);
  const cardDisplays = cardOn ? await getCardDisplays(match.id, (p) => audienceFor(cardViewer, p)) : {};
  // "Alle haben eine Karte" je Team wird aus dem ROHSTATUS auf dem Server abgeleitet und nur als Ja/Nein weitergegeben (Gäste sehen sonst fälschlich "nicht vollständig")
  const teamCardsReady = cardOn ? await getTeamCardsReady(match.id) : {};
  const storedCard = cardOn && user ? await getStoredCardDisplay(user.id) : null;
  // Eigener Fehlerzustand (nur der Betroffene bekommt ihn, siehe cardDisplayFor): Grund im Klartext; der Rohcode geht nicht an den Browser
  const myDisplay = user ? cardDisplays[user.id] : undefined;
  const nowForWindow = new Date();
  const windowOf = (d: { graceEnd?: string } | undefined) => {
    const end = d?.graceEnd ? new Date(d.graceEnd) : null;
    return { open: end !== null && end.getTime() > nowForWindow.getTime(), until: end !== null && end.getTime() > nowForWindow.getTime() ? graceText(end, nowForWindow) : null };
  };
  const myFailure = myDisplay?.status === "failed" ? { text: chargeFailureText(myDisplay.reason), until: windowOf(myDisplay).until, expired: !windowOf(myDisplay).open, authorize: myDisplay.authorize === true && windowOf(myDisplay).open } : null;
  // Captain/Veranstalter/Admin: wen es betrifft und warum (nur Einträge mit Grund; der Betroffene selbst sieht oben seinen eigenen Block)
  const failedForManager = Object.entries(cardDisplays).filter(([id, d]) => d.status === "failed" && id !== user?.id).map(([id, d]) => ({ userId: id, name: participants.find((p) => p.userId === id)?.name ?? "Spieler", text: chargeFailureText(d.reason), until: windowOf(d).until, authorizing: d.authorize === true }));
  const hasCard = (userId: string) => cardView(cardDisplays[userId]?.status ?? "none").hasCard;
  const assignedCount = participants.filter((p) => p.teamId).length; // (nur noch fuer die Anzeige der Zahl der Eingeteilten)
  // Betrag unter "Ich bin bereit": fest erst mit dem zweiten Bereit (finalShareCents), vorher aktuell
  const estimateFixed = match.finalShareCents !== null && match.finalShareCents !== undefined;
  const estimateCents = cardOn ? (payments.chargeCents ?? null) : null; // EINE Quelle fuer ALLE Betraege der Seite (Knopf, Kosten-Zeile, Anteil uebernehmen): lobby.ts chargeAmount(price, finalShareCents ?? shareToCharge(...))
  const myFinalTeamId = [match.homeId, match.awayId].find((id) => v.adminOf.includes(id)) ?? null; // Team, für das der Betrachter bestätigen darf
  const finalDone = Boolean(match.homeFinalAt && match.awayFinalAt);
  // "Anteil übernehmen" (012 M3c-3b): was wer sieht, entscheidet der SERVER je Betrachter (cover-view.ts, Plan Abschnitt 3 bis 5); die Namen kommen aus der Lobby-Liste
  const cover = cardOn
    ? await getCoverView(match.id, { userId: user?.id ?? null, platformAdmin: v.platformAdmin, adminOf: v.adminOf })
    : { canCover: [] as string[], covering: null as string | null, releasable: false, covered: false, pairs: [] as { targetUserId: string; payerUserId: string }[] };
  const coverPost = estimateCents; // derselbe Betrag wie am Knopf und in der Kosten-Zeile
  const coverAmounts = coverPost !== null ? { own: formatEuro(coverPost), target: formatEuro(coverPost), total: formatEuro(coverPost * 2), estimated: !finalDone } : null;
  const coverMandate = translate(DEFAULT_LOCALE, "cover.mandate.v1.entwurf"); // Entwurf, Rechtstext durch Anwalt
  const seatName = (id: string) => participants.find((p) => p.userId === id)?.name ?? "Mitspieler";
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

  // AC-17 (Backlog 216): reiner Hallenbetreiber (venue_access, weder Teilnehmer noch Team-Admin noch Plattform-Admin) sieht namenfrei; die Abfrage läuft nur, wenn sie etwas ändern kann
  const mayBeHall = Boolean(user) && !v.participant && v.adminOf.length === 0 && !v.platformAdmin;
  const hallOperator = mayBeHall && user ? await isVenueManager(user.id) : false;
  const sicht = lobbySicht({ userId: user?.id ?? null, hallOperator, participant: Boolean(v.participant), teamAdmin: v.adminOf.length > 0, platformAdmin: v.platformAdmin });
  const finalTeams = [
    { id: match.homeId, name: match.homeName, final: match.homeFinalAt },
    { id: match.awayId, name: match.awayName, final: match.awayFinalAt },
  ].map((t) => {
    const list = participants.filter((p) => p.teamId === t.id);
    const paid = list.filter((p) => p.paid).length;
    const ready = list.filter((p) => p.ready).length;
    return { id: t.id, name: t.name, confirmed: Boolean(t.final), ready, paid, total: list.length, complete: t.id === myFinalTeamId && list.length >= MIN_READY_PER_TEAM && // nur für das eigene Team true: das andere Team liegt nie im Payload (auch nicht für Gäste)
       ready === list.length && (cardOn ? teamCardsReady[t.id] === true : !payments.enabled || paid === list.length) };
  });
  const myFinal = finalTeams.find((t) => t.id === myFinalTeamId);
  const stand = lobbyStand({
    signedIn: Boolean(user),
    status: match.status,
    active,
    planning: open,
    challengePending,
    challengeRole: v.adminOf.includes(match.awayId) ? "target" : v.adminOf.includes(match.homeId) ? "challenger" : "viewer",
    participant: Boolean(v.participant),
    hasTeam: Boolean(v.participant?.teamId),
    ready: v.participant?.ready ?? false,
    canJoin: v.canJoin,
    canJoinAsSubstitute: v.canJoinAsSubstitute,
    teamFull: v.teamFull,
    cardOn,
    cardReady: hasCard(user?.id ?? ""),
    chargeFailure: myFailure ? lobbyFehlerFall(myFailure) : null,
    minReady: MIN_READY_PER_TEAM,
    finalTeam: myFinal ? { confirmed: myFinal.confirmed, complete: myFinal.complete } : null,
  });

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
        {!isPrivate && <p className="text-sm text-muted" data-testid="win-chance">
          Spielstärke: {match.homeName} Elo {strength[match.homeId].elo}, {match.awayName} Elo {strength[match.awayId].elo} · Siegchance {winChanceHome} % zu {100 - winChanceHome} %
        </p>}
      </header>

      <section className="card space-y-2" aria-label="Dein Stand" data-testid="lobby-stand" data-aktion={stand.aktion ?? "keine"}>
        <h2 className="font-semibold">Dein Stand</h2>
        <p className="text-sm" data-testid="lobby-stand-text">{stand.zeile}</p>
        {stand.aktion === "anmelden" && <Link href={`/anmelden?next=${encodeURIComponent(`/lobby/${match.id}`)}`} className="btn btn-primary w-full sm:w-auto" data-testid="lobby-stand-anmelden">Anmelden</Link>}
        {stand.aktion === "spielseite" && <Link href={`/spiele/${match.id}`} className="btn btn-primary w-full sm:w-auto">Zur Spielseite</Link>}
      </section>

      {isPrivate && inviteUrl && (
        <ShareLink url={inviteUrl} title="Einladungslink zum Spiel" shareText={`Privatspiel #${match.number} auf Socaz: komm dazu!`} testId="game-invite" quiet hint={`${participants.length} von ${match.maxPlayers ?? 10} Plätzen belegt. Wer den Link öffnet, meldet sich an oder registriert sich und landet direkt in diesem Spiel.`} />
      )}
      {inviteManager && match.status !== "cancelled" && (
        <section className="flex flex-wrap items-center gap-2" data-testid="invite-admin">
          {inviteUrl && <ActionButton action={revokeGameInviteAction.bind(null, match.id)} label="Link zurückziehen" confirm="Der bisherige Link wird sofort ungültig. Wer schon im Spiel ist, bleibt drin." className="btn btn-ghost text-sm" />}
          <ActionButton action={regenerateGameInviteAction.bind(null, match.id)} label={inviteUrl ? "Neuen Link erzeugen" : "Einladungslink erzeugen"} confirm={inviteUrl ? "Der bisherige Link wird ungültig, ein neuer Link wird erzeugt." : undefined} className="btn btn-ghost text-sm" />
          {!inviteUrl && <p className="text-sm text-muted">Es gibt gerade keinen gültigen Einladungslink.</p>}
        </section>
      )}
      {isPrivate && v.canManage && active && <PrivateTools matchId={match.id} waiting={pendingStrangers.length} assigned={participants.filter((p) => p.teamId).length} />}

      {challengePending && (
        <ChallengePanel
          matchId={match.id}
          homeName={match.homeName}
          awayName={match.awayName}
          main={stand.aktion === "annehmen"}
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
                <span>{h.name} <span className="text-sm text-muted">{h.city}</span></span>
                <span className={`text-sm font-semibold ${h.status === "confirmed" ? "text-accent-fg" : h.status === "declined" ? "text-ink" : "text-ink"}`}>
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
          Das Spiel ist angesetzt und die Halle wird gebucht, sobald in beiden Teams mindestens {MIN_READY_PER_TEAM} bereit sind.
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
            {v.participant && estimateCents !== null ? <>{estimateFixed ? "Dein Anteil" : "Dein Anteil aktuell"}: <strong className="text-ink">{formatEuro(estimateCents)}</strong> (Miete geteilt durch die eingeteilten Spieler, mindestens {formatEuro(MIN_CHARGE_CENTS)} je Abbuchung). </> : null}
            Ändert sich die Spielerzahl, ändert sich der Anteil.{v.participant ? " Dein Anteil wird zur Frist von deiner Karte abgebucht; bis dahin wird nichts abgebucht." : null}
          </p>
        </section>
      )}
      {!cardOn && payments.priceCents === 0 && (
        <section className="card space-y-1 text-sm" aria-label="Kosten" data-testid="free-game">
          <h2 className="font-semibold">Kosten</h2>
          <p>Dieses Spiel ist <strong>kostenlos</strong>. Es wird nichts bezahlt und nichts reserviert.</p>
        </section>
      )}

      {active && open && mode === "participant" && (
        <section className="card space-y-2" data-testid="ready-later">
          <button className="btn btn-ghost w-full" disabled>Bereit machen</button>
          <p className="text-sm text-muted">{scheduling ? "Du bist in der Lobby. Bereit machen kannst du, sobald die Captains Uhrzeit und Halle gewählt haben." : "Du bist in der Lobby. Bereit machen kannst du, sobald die Halle feststeht."}</p>
        </section>
      )}

      {active && !open && (
        <MyActions
          matchId={match.id}
          mode={mode}
          ready={v.participant?.ready ?? false}
          hasTeam={Boolean(v.participant?.teamId)}
          main={stand.aktion}
          card={cardOn && mode === "participant" ? { ready: hasCard(user?.id ?? ""), mandateText: MANDATE_TEXT, fake: fakeCardAllowed(), priceCents: payments.priceCents ?? null, estimateCents, estimateFixed, stored: storedCard, failure: myFailure } : null}
        />
      )}

      <LobbyCaptainBarFor
        role={{ active, canManage: v.canManage, adminTeams: v.adminOf.length, platformAdmin: v.platformAdmin }}
          teams={teamsView.filter((t) => canAdminTeam(t.id)).map((t) => ({ id: t.id, name: t.name, count: t.count, ready: t.ready, cardsReady: cardOn ? teamCardsReady[t.id] === true : null }))}
          failures={failedForManager.map((f) => ({
            ...f,
            step: cover.canCover.includes(f.userId) ? <CoverButton matchId={match.id} targetUserId={f.userId} targetName={f.name} amounts={coverAmounts} mandateText={coverMandate} /> : null,
          }))}
        >
          {!isPrivate && teamsView.filter((t) => v.adminOf.includes(t.id)).map((t) => <InviteBox key={t.id} teamId={t.id} teamName={t.name} quiet />)}
      </LobbyCaptainBarFor>

      {(cover.covering || cover.covered || cover.pairs.length > 0) && (
        <section className="card space-y-2" data-testid="cover-status">
          {cover.covering && (
            <CoverCoveringCard>
              <p className="font-semibold">Du übernimmst den Anteil von {seatName(cover.covering)}.</p>
              <p className="text-sm text-muted">
                Zur Frist wird er zusätzlich von deiner Karte abgebucht.{cover.releasable ? " Bis dahin kannst du zurücknehmen." : " Zurücknehmen ist nicht mehr möglich."}
              </p>
              {cover.releasable && <ReleaseCover matchId={match.id} />}
            </CoverCoveringCard>
          )}
          {cover.covered && (
            <p className="font-semibold" data-testid="cover-covered">
              Dein Anteil wird übernommen. Du musst nichts tun.
            </p>
          )}
          {cover.pairs.length > 0 && (
            <ul className="space-y-1 text-sm" data-testid="cover-pairs">
              {cover.pairs.map((c) => (
                <li key={c.targetUserId}>
                  <strong>{seatName(c.payerUserId)}</strong> übernimmt den Anteil von <strong>{seatName(c.targetUserId)}</strong>.
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canSeeLights && (cardOn ? <CardLightLegend /> : <LightLegend paymentsOn={payments.enabled} />)}
      <div className="grid gap-3 sm:grid-cols-2">
        {teamsView.map((t) => (
          <section key={t.id} className="card space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">
                {isPrivate ? t.name : <Link href={`/teams/${t.slug}`} className="hover:text-accent-fg">{t.name}</Link>}
              </h2>
              <span className="text-sm text-muted">{isPrivate ? "" : `Elo ${strength[t.id].elo}${strength[t.id].matches === 0 ? " (geschätzt)" : ""} · `}{t.count} von {capacity} · bereit {t.ready}/{MIN_READY_PER_TEAM}</span>
            </div>
            <ul className="space-y-2 text-sm">
              {participants.filter((p) => p.teamId === t.id).map((p, i) => (
                <li key={personRef(sicht, p.userId, p.name, i).key} className="flex items-center justify-between gap-2">
                  <span>
                    <ParticipantName name={p.name} sicht={sicht} index={i} />
                    {p.isVerifiedPro && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-sm text-accent-fg">Profi</span>}
                    {p.isSubstitute && <span className="ml-2 text-sm text-muted">Ersatz</span>}
                    {p.userId === user?.id && <span className="ml-2 text-sm text-muted">(du)</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {cardOn ? (cardDisplays[p.userId] ? <CardLight status={cardDisplays[p.userId].covered && !canAdminTeam(t.id) ? "covered" : cardDisplays[p.userId].status} /> : null) : canSeeLights ? <PlayerLight light={lightFor(p, confirmed)} paymentsOn={payments.enabled} showLabel /> : null}
                    {cover.canCover.includes(p.userId) && <CoverButton matchId={match.id} targetUserId={p.userId} targetName={p.name} amounts={coverAmounts} mandateText={coverMandate} />}
                    {active && p.userId !== user?.id && canAdminTeam(t.id) && (
                      <ParticipantActions matchId={match.id} userId={p.userId} canRemove assignTo={[]} canUnassign={isPrivate && !p.ready && !p.paid} />
                    )}
                  </span>
                </li>
              ))}
              {Array.from({ length: Math.max(capacity - t.count, 0) }, (_, i) => (
                <li key={`free-${i}`} className="flex items-center justify-between gap-2 text-muted" data-testid="free-slot">
                  <span>Wartet auf Spieler {t.count + i + 1}</span>
                  <span className="text-sm">frei</span>
                </li>
              ))}
            </ul>
            {!isPrivate && <LobbyRoster teamSlug={t.slug} members={roster[t.id].filter((m) => !participants.some((p) => p.userId === m.userId))} sicht={sicht} />}
          </section>
        ))}
      </div>

      {pendingStrangers.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{isPrivate ? "Spieler warten auf ihr Team" : "Ersatzspieler warten auf Zuweisung"}</h2>
          <ul className="space-y-2 text-sm">
            {pendingStrangers.map((p, i) => (
              <li key={personRef(sicht, p.userId, p.name, i).key} className="flex items-center justify-between gap-2">
                <span><ParticipantName name={p.name} sicht={sicht} index={i} />{p.userId === user?.id && <span className="ml-2 text-sm text-muted">(du)</span>}</span>
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
          payable={cardOn && payments.priceCents !== null && payments.priceCents > 0}
          amountText={estimateCents !== null ? formatEuro(estimateCents) : null}
          myTeamId={myFinalTeamId}
          primary={stand.aktion === "final"}
          teams={finalTeams}
        />
      )}

      {active && v.canManage && <CancelForm matchId={match.id} />}
    </div>
  );
}
