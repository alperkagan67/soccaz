"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  assignSubstituteAction,
  cancelMatchAction,
  joinAsSubstituteAction,
  joinLobbyAction,
  leaveLobbyAction,
  removeParticipantAction,
  payShareAction,
  setReadyAction,
  setVenueAction,
} from "@/server/actions";
import { countdownText } from "@/lib/lobby-rules";
import { formatEuro } from "@/lib/money";

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
  /** Nur gesetzt, wenn Zahlungen eingeschaltet sind. */
  pay?: { reserveCents: number; balanceCents: number; paid: boolean; backTo: string } | null;
  /** Wie viele Spieler des eigenen Teams haben schon bezahlt? Bereit geht erst, wenn alle bezahlt haben. */
  teamPaid?: { paid: number; total: number };
};

export function MyActions({ matchId, mode, ready, hasTeam, pay, teamPaid }: MyActionsProps) {
  const { error, needsTopupCents, pending, run } = useRun();
  const busy = pending ? "opacity-60" : "";

  return (
    <div className="card space-y-3">
      {mode === "participant" && (
        <>
          {hasTeam ? (
            <>
              {pay && !pay.paid && (
                <>
                  <p className="text-sm text-muted" data-testid="pay-hint">
                    Schritt 1: Bezahlen. Es werden {formatEuro(pay.reserveCents)} von deinem Guthaben ({formatEuro(pay.balanceCents)}) reserviert. Was nach der Abrechnung übrig ist, bekommst du zurück.
                  </p>
                  <button className={`btn btn-primary w-full ${busy}`} disabled={pending} onClick={() => run(() => payShareAction(matchId))}>
                    {formatEuro(pay.reserveCents)} bezahlen
                  </button>
                </>
              )}
              {pay?.paid && <p className="text-sm text-green">Dein Anteil ist bezahlt.</p>}
              {(!pay || pay.paid) && (
                <>
                  {pay && teamPaid && teamPaid.paid < teamPaid.total && !ready && (
                    <p className="text-sm text-muted" data-testid="team-pay-hint">Bereit machen geht, sobald alle in deinem Team bezahlt haben ({teamPaid.paid} von {teamPaid.total}).</p>
                  )}
                  <button
                    className={`btn w-full ${ready ? "btn-ghost" : "btn-primary"} ${busy}`}
                    disabled={pending || (!ready && Boolean(pay && teamPaid && teamPaid.paid < teamPaid.total))}
                    onClick={() => run(() => setReadyAction(matchId, !ready))}
                  >
                    {ready ? "Nicht mehr bereit" : pay ? "Bereit machen" : "Ich bin bereit"}
                  </button>
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
        <button className={`btn btn-primary w-full ${busy}`} disabled={pending} onClick={() => run(() => joinLobbyAction(matchId))}>
          Dem Spiel beitreten
        </button>
      )}
      {mode === "substitute" && (
        <>
          <p className="text-sm text-muted">Dir fehlt ein Team? Biete dich als Ersatzspieler an, ein Team-Admin weist dich zu.</p>
          <button className={`btn btn-primary w-full ${busy}`} disabled={pending} onClick={() => run(() => joinAsSubstituteAction(matchId))}>
            Als Ersatzspieler anbieten
          </button>
        </>
      )}
      {mode === "full" && <p className="text-sm text-muted">Dein Team ist voll (5 Spieler plus 1 Ersatz).</p>}
      {needsTopupCents ? (
        <Link href={`/app/guthaben?betrag=${Math.ceil(needsTopupCents / 500) * 500}&zurueck=${encodeURIComponent(pay?.backTo ?? "/app")}`} className="btn btn-primary w-full">
          Guthaben aufladen
        </Link>
      ) : null}
      {mode === "guest" && <p className="text-sm text-muted">Melde dich an, um mitzuspielen.</p>}
      {mode === "none" && <p className="text-sm text-muted">Dieses Spiel nimmt keine weiteren Spieler auf.</p>}
      <ErrorText message={error} />
    </div>
  );
}

export function VenueForm({ matchId, venue }: { matchId: string; venue: string }) {
  const { error, pending, run } = useRun();
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
        <button className="btn btn-ghost" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      </div>
      {saved && !error && <p className="text-xs text-green">Gespeichert.</p>}
      <ErrorText message={error} />
    </form>
  );
}

export function ParticipantActions({
  matchId,
  userId,
  canRemove,
  assignTo,
}: {
  matchId: string;
  userId: string;
  canRemove: boolean;
  assignTo: { teamId: string; name: string }[];
}) {
  const { error, pending, run } = useRun();
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {assignTo.map((t) => (
        <button key={t.teamId} className="btn btn-ghost !min-h-8 !px-2 text-xs" disabled={pending} onClick={() => run(() => assignSubstituteAction(matchId, userId, t.teamId))}>
          Zu {t.name}
        </button>
      ))}
      {canRemove && (
        <button className="btn btn-danger !min-h-8 !px-2 text-xs" disabled={pending} aria-label="Spieler entfernen" onClick={() => confirm("Spieler entfernen?") && run(() => removeParticipantAction(matchId, userId))}>
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
