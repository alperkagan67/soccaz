"use client";

import { useEffect, useState, useTransition } from "react";
import { useHydrated } from "@/components/useHydrated";
import {
  assignSubstituteAction,
  unassignParticipantAction,
  cancelMatchAction,
  joinAsSubstituteAction,
  joinLobbyAction,
  leaveLobbyAction,
  removeParticipantAction,
  setReadyAction,
  setVenueAction,
} from "@/server/actions";
import { countdownText } from "@/lib/lobby-rules";
import { formatEuro } from "@/lib/money";
import { ZP, betragszeile } from "@/lib/zahlungspflicht-texte";
import { AuthorizeButton } from "./AuthorizeButton";
import { CardForm } from "./CardForm";
import type { LobbyAktion } from "@/lib/lobby-stand";
import { lobbyFehlerFall } from "@/lib/lobby-fehler";

type Result = { error?: string; needsTopupCents?: number } | undefined;

/** Führt eine Server-Aktion aus und zeigt einen Fehler an. Die Seite wird danach vom Server neu geladen. */
function useRun() {
  const [state, setState] = useState<{ error?: string; needsTopupCents?: number }>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) => {
    setState({});
    start(async () => {
      const result = await fn();
      setState({ error: result?.error, needsTopupCents: result?.needsTopupCents });
    });
  };
  return { error: state.error, needsTopupCents: state.needsTopupCents, pending, run };
}

function ErrorText({ message }: { message?: string }) {
  return message ? <p className="error" role="alert">{message}</p> : null;
}

export function Countdown({ startsAtIso }: { startsAtIso: string }) {
  const [text, setText] = useState<string>();
  useEffect(() => {
    const update = () => setText(countdownText(new Date(startsAtIso).getTime() - Date.now()));
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, [startsAtIso]);
  return <span suppressHydrationWarning>{text ?? ""}</span>;
}

type MyActionsProps = {
  matchId: string;
  mode: "participant" | "join" | "substitute" | "full" | "guest" | "none";
  ready: boolean;
  hasTeam: boolean;
  /** Die EINE Hauptaktion der Lobby (lobbyStand): nur ihr Knopf ist btn-primary, alle anderen sind ruhig (AC-30). */
  main?: LobbyAktion;
  /** Nur gesetzt, wenn Zahlungen eingeschaltet sind. */
  /** Wie viele Spieler des eigenen Teams haben schon bezahlt? Bereit geht erst, wenn alle bezahlt haben. */
  /** Nur im Kartenmodell (Schalter card_payments_enabled EIN): Karte hinterlegen, Vertrag 012. */
  card?: { ready: boolean; mandateText: string; fake: boolean; priceCents: number | null; estimateCents: number | null; estimateFixed: boolean; stored: { brand: string | null; last4: string } | null; failure?: { text: string; until: string | null; expired: boolean; authorize?: boolean } | null } | null;
};

export function MyActions({ matchId, mode, ready, hasTeam, main = null, card }: MyActionsProps) {
  const { error, pending, run } = useRun();
  const busy = pending ? "opacity-60" : "";
  const fall = card?.failure ? lobbyFehlerFall(card.failure) : null;
  const payable = Boolean(card) && card?.priceCents != null && card.priceCents > 0; // Zahlungspflicht nur im Kartenmodell UND bei einem Preis > 0: kostenlos (0) und noch kein Preis (null) bekommen den schlichten Text, nie die Formel

  return (
    <div className="card space-y-3">
      {mode === "participant" && (
        <>
          {hasTeam ? (
            <>
              {card?.failure && (
                <div className="space-y-3" role="alert" data-testid="charge-failed">
                  <p className="font-semibold">Abbuchung fehlgeschlagen</p>
                  <p className="text-sm" data-testid="charge-failed-reason">{card.failure.text}</p>
                  {/* EIN nächster Schritt je Fall (lobby-fehler.ts): abgelaufen = keiner, Freigabe = Freigabe-Knopf (andere Karte nur eingeklappt), sonst Karte ändern */}
                  {fall === "abgelaufen" && <p className="text-sm text-muted" data-testid="charge-failed-expired">Das Zeitfenster ist abgelaufen. Dein Platz wird neu vergeben.</p>}
                  {fall === "freigabe" && (
                    <div className="space-y-3" data-testid="authorize-section">
                      <p className="text-sm">Deine Bank braucht eine Freigabe der Zahlung. Gib sie hier frei{card.failure.until ? ` (${card.failure.until})` : ""}.</p>
                      <AuthorizeButton matchId={matchId} fake={card.fake} quiet={main !== "freigeben"} />
                      <details data-testid="charge-failed-other-card">
                        <summary className="btn btn-ghost w-full cursor-pointer">Stattdessen eine andere Karte hinterlegen</summary>
                        <div className="pt-3">
                          <CardForm matchId={matchId} mandateText={card.mandateText} fake={card.fake} stored={null} change quiet />
                        </div>
                      </details>
                    </div>
                  )}
                  {fall === "karte" && (
                    <>
                      <p className="text-sm text-muted">Ändere deine Karte, damit die Zahlung klappt.{card.failure.until ? ` Du hast ${card.failure.until} Zeit.` : ""}</p>
                      <CardForm matchId={matchId} mandateText={card.mandateText} fake={card.fake} stored={null} change quiet={main !== "karte"} />
                    </>
                  )}
                </div>
              )}
              {card && !card.ready && !card.failure && (
                <>
                  <p className="text-sm text-muted" data-testid="card-hint">
                    {payable ? <>Schritt 1: Karte hinterlegen. {betragszeile(card.estimateCents != null ? formatEuro(card.estimateCents) : null, card.estimateFixed)} Bis dahin wird nichts abgebucht.</> : card.priceCents === 0 ? ZP.gameFree : ZP.priceUnknown}
                  </p>
                  <CardForm matchId={matchId} mandateText={card.mandateText} fake={card.fake} stored={card.stored} quiet={main !== "karte"} />
                </>
              )}
              {card?.ready && <p className="text-sm text-accent-fg" data-testid="card-ready-text">Deine Karte ist hinterlegt.{payable ? " Dein Anteil wird zur Frist abgebucht." : ""}</p>}
              {!card?.failure && (
                <>
                <button
                  className={`btn w-full ${!ready && main === "bereit" ? "btn-primary" : "btn-ghost"} ${busy}`}
                  disabled={pending || (!ready && Boolean(card && !card.ready))}
                  onClick={() => run(() => setReadyAction(matchId, !ready))}
                >
                  {ready ? ZP.gameNotReady : payable ? ZP.gameReady : ZP.gameReadyFree}
                </button>
                {!ready && payable && <p className="text-sm text-muted" data-testid="ready-amount">{betragszeile(card?.estimateCents != null ? formatEuro(card.estimateCents) : null, Boolean(card?.estimateFixed))}</p>}
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Du wartest auf die Zuweisung durch einen Team-Admin.</p>
          )}
          <button className={`btn btn-ghost w-full ${busy}`} disabled={pending} onClick={() => confirm("Wirklich abmelden?") && run(() => leaveLobbyAction(matchId))}>
            Abmelden
          </button>
        </>
      )}
      {mode === "join" && (
        <button className={`btn ${main === "beitreten" ? "btn-primary" : "btn-ghost"} w-full ${busy}`} disabled={pending} onClick={() => run(() => joinLobbyAction(matchId))}>
          Dem Spiel beitreten
        </button>
      )}
      {mode === "join" && (
        <p className="text-sm text-muted" data-testid="join-hint">{ZP.hintLater}</p>
      )}
      {mode === "substitute" && (
        <>
          <p className="text-sm text-muted">Dir fehlt ein Team? Biete dich als Ersatzspieler an, ein Team-Admin weist dich zu.</p>
          <button className={`btn ${main === "ersatz" ? "btn-primary" : "btn-ghost"} w-full ${busy}`} disabled={pending} onClick={() => run(() => joinAsSubstituteAction(matchId))}>
            Als Ersatzspieler anbieten
          </button>
        </>
      )}
      {mode === "full" && <p className="text-sm text-muted">Dein Team ist voll (5 Spieler plus 1 Ersatz).</p>}
      {mode === "guest" && <p className="text-sm text-muted">Melde dich an, um mitzuspielen.</p>}
      {mode === "none" && <p className="text-sm text-muted">Dieses Spiel nimmt keine weiteren Spieler auf.</p>}
      <ErrorText message={error} />
    </div>
  );
}

export function VenueForm({ matchId, venue }: { matchId: string; venue: string }) {
  const { error, pending, run } = useRun();
  const hydrated = useHydrated(); // Klick vor der Hydration wäre ein GET mit dem Feld in der Adresse
  const [value, setValue] = useState(venue);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  // Änderungen des anderen Team-Admins live übernehmen, solange hier nicht getippt wird
  const [seenVenue, setSeenVenue] = useState(venue);
  if (venue !== seenVenue) {
    setSeenVenue(venue);
    if (!dirty) setValue(venue);
  }

  return (
    <form
      method="post"
      aria-busy={!hydrated || undefined}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        run(async () => {
          const result = await setVenueAction(matchId, value);
          if (!result?.error) {
            setSaved(true);
            setDirty(false);
          }
          return result;
        });
      }}
    >
      <label className="label" htmlFor="venue">Ort / Halle</label>
      <div className="flex gap-2">
        <input id="venue" value={value} onChange={(e) => { setValue(e.target.value); setDirty(true); }} maxLength={120} className="field" placeholder="z. B. Soccerhalle Buer, Hauptstr. 1" />
        <button className="btn btn-ghost" disabled={pending || !hydrated} data-testid="venue-save">{pending ? "…" : "Speichern"}</button>
      </div>
      {saved && !error && <p className="text-sm text-accent-fg">Gespeichert.</p>}
      <ErrorText message={error} />
    </form>
  );
}

export function ParticipantActions({
  matchId,
  userId,
  canRemove,
  assignTo,
  canUnassign = false,
}: {
  matchId: string;
  userId: string;
  canRemove: boolean;
  assignTo: { teamId: string; name: string }[];
  canUnassign?: boolean;
}) {
  const { error, pending, run } = useRun();
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {assignTo.map((t) => (
        <button key={t.teamId} className="btn btn-ghost text-sm" disabled={pending} onClick={() => run(() => assignSubstituteAction(matchId, userId, t.teamId))}>
          Zu {t.name}
        </button>
      ))}
      {canUnassign && (
        <button className="btn btn-ghost text-sm" disabled={pending} onClick={() => run(() => unassignParticipantAction(matchId, userId))}>
          In den Pool
        </button>
      )}
      {canRemove && (
        <button className="btn btn-danger text-sm" disabled={pending} aria-label="Spieler entfernen" onClick={() => confirm("Spieler entfernen?") && run(() => removeParticipantAction(matchId, userId))}>
          Entfernen
        </button>
      )}
      <ErrorText message={error} />
    </span>
  );
}

export function CancelForm({ matchId }: { matchId: string }) {
  const { error, pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return <button className="btn btn-danger w-full" onClick={() => setOpen(true)}>Spiel absagen</button>;
  }
  return (
    <form
      method="post"
      className="card space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => cancelMatchAction(matchId, reason));
      }}
    >
      <label className="label" htmlFor="reason">Grund der Absage (alle Teilnehmer sehen ihn)</label>
      <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={200} required minLength={3} className="field" />
      <div className="flex gap-2">
        <button className="btn btn-danger flex-1" disabled={pending}>{pending ? "Bitte warten…" : "Endgültig absagen"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Zurück</button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}
