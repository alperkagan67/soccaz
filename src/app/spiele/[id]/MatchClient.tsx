"use client";

import { useState, useTransition } from "react";
import { useHydrated } from "@/components/useHydrated";
import { TIEBREAK_ABPFIFF_HINWEIS, TIEBREAK_KEINE_TORE } from "@/lib/tiebreak-regeln";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  castMvpVoteAction,
  confirmResultAction,
  decideResultAction,
  disputeResultAction,
  endMatchAction,
  markNoShowAction,
  recordEventAction,
  submitResultAction,
  undoLastEventAction,
} from "@/server/actions";

type Result = { error?: string } | undefined;
type Player = { userId: string; name: string; teamId: string | null };
type Team = { id: string; name: string };
type EventType = "goal" | "yellow_card" | "red_card";

function useRun() {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) => {
    setError(undefined);
    start(async () => {
      try {
        setError((await fn())?.error);
      } catch {
        setError("Das hat nicht geklappt. Lade die Seite neu und prüfe den Stand, bevor du es noch einmal versuchst."); // nie still verschlucken (Live-Demo-Fund 2026-11-26); "nichts gespeichert" nur dort, wo es atomar belegt ist (Ergebnis eintragen mit Toren)
      }
    });
  };
  return { error, pending, run };
}

function ErrorText({ message }: { message?: string }) {
  return message ? <p className="error" role="alert">{message}</p> : null;
}

const TYPE_LABEL: Record<EventType, string> = { goal: "Tor", yellow_card: "Gelbe Karte", red_card: "Rote Karte" };

/** Große Knöpfe für den Spielfeldrand: Tor oder Karte, dann Spieler wählen. */
export function Recorder({ matchId, home, away, players, hasEvents }: { matchId: string; home: Team; away: Team; players: Player[]; hasEvents: boolean }) {
  const { error, pending, run } = useRun();
  const [picker, setPicker] = useState<{ type: EventType; team: Team } | null>(null);

  function record(scorerId: string | null) {
    if (!picker) return;
    const { type, team } = picker;
    setPicker(null);
    run(() => recordEventAction(matchId, { type, teamId: team.id, scorerId }));
  }

  const teamPlayers = picker ? players.filter((p) => p.teamId === picker.team.id) : [];

  return (
    <section className="card space-y-3" aria-label="Spiel erfassen">
      <h2 className="font-semibold">Spiel erfassen</h2>
      <div className="grid grid-cols-2 gap-2">
        {[home, away].map((t) => (
          <button key={t.id} className="btn btn-primary !min-h-14 text-base" disabled={pending} onClick={() => setPicker({ type: "goal", team: t })}>
            Tor {t.name}
          </button>
        ))}
        {[home, away].map((t) => (
          <div key={`c-${t.id}`} className="grid grid-cols-2 gap-1">
            <button className="btn btn-ghost !px-1 text-xs" disabled={pending} onClick={() => setPicker({ type: "yellow_card", team: t })}>Gelb</button>
            <button className="btn btn-ghost !px-1 text-xs" disabled={pending} onClick={() => setPicker({ type: "red_card", team: t })}>Rot</button>
          </div>
        ))}
      </div>

      {picker && (
        <div className="space-y-2 rounded-lg border border-accent p-3" role="dialog" aria-label="Spieler wählen">
          <p className="text-sm">
            {TYPE_LABEL[picker.type]} für <strong>{picker.team.name}</strong>: Wer?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {teamPlayers.map((p) => (
              <button key={p.userId} className="btn btn-ghost !min-h-12" onClick={() => record(p.userId)}>{p.name}</button>
            ))}
            <button className="btn btn-ghost !min-h-12 text-muted" onClick={() => record(null)}>Unbekannt</button>
          </div>
          <button className="text-sm text-muted underline" onClick={() => setPicker(null)}>Abbrechen</button>
        </div>
      )}

      {hasEvents && (
        <button className="btn btn-ghost w-full" disabled={pending} onClick={() => run(() => undoLastEventAction(matchId))}>
          Letzte Aktion rückgängig
        </button>
      )}
      <ErrorText message={error} />
    </section>
  );
}

export function SubmitResultForm({ matchId, home, away, homeScore, awayScore, final = false, quiet = false }: { matchId: string; home: string; away: string; homeScore: number; awayScore: number; final?: boolean; quiet?: boolean }) {
  const { error, pending, run } = useRun();
  const hydrated = useHydrated(); // Klick vor der Hydration wäre ein GET mit den Torständen in der Adresse
  const [h, setH] = useState(String(homeScore));
  const [a, setA] = useState(String(awayScore));
  const [seen, setSeen] = useState(`${homeScore}:${awayScore}`);
  const [dirty, setDirty] = useState(false);

  const key = `${homeScore}:${awayScore}`;
  if (key !== seen) {
    setSeen(key);
    if (!dirty) {
      setH(String(homeScore));
      setA(String(awayScore));
    }
  }

  return (
    <form
      method="post"
      aria-busy={!hydrated || undefined}
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => submitResultAction(matchId, Number(h), Number(a)));
      }}
    >
      <h2 className="font-semibold">Endergebnis melden</h2>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <label className="label" htmlFor="score-home">{home}</label>
          <input id="score-home" type="number" inputMode="numeric" min={0} max={99} required value={h} onChange={(e) => { setH(e.target.value); setDirty(true); }} className="field text-center text-xl" />
        </div>
        <span className="pb-2 text-xl text-muted">:</span>
        <div>
          <label className="label" htmlFor="score-away">{away}</label>
          <input id="score-away" type="number" inputMode="numeric" min={0} max={99} required value={a} onChange={(e) => { setA(e.target.value); setDirty(true); }} className="field text-center text-xl" />
        </div>
      </div>
      {final ? (
        <>
          <p className="text-xs text-muted">Als Veranstalter oder Admin trägst du das Endergebnis direkt ein: Es gilt sofort und lässt sich nicht ändern.</p>
          <ConfirmDialog
            trigger={{ label: "Endergebnis eintragen", variant: quiet ? "secondary" : "primary" }}
            title="Endergebnis eintragen?"
            body="Das Ergebnis ist endgültig und lässt sich nicht ändern. Das Turnier geht sofort weiter."
            consequence={`${home} ${Number(h)} : ${Number(a)} ${away}`}
            consequenceLarge
            confirmLabel="Endgültig eintragen"
            danger
            onConfirmAction={() => submitResultAction(matchId, Number(h), Number(a))}
          />
        </>
      ) : (
        <>
          <p className="text-xs text-muted">Das andere Team bestätigt das Ergebnis. Antwortet es 48 Stunden nicht, gilt es automatisch.</p>
          <button className={`btn ${quiet ? "btn-ghost" : "btn-primary"} w-full ${pending ? "disabled:opacity-60" : ""}`} disabled={pending || !hydrated} data-testid="result-submit">{pending ? "Bitte warten…" : "Ergebnis melden"}</button>
        </>
      )}
      <ErrorText message={error} />
    </form>
  );
}

export function ConfirmPanel({ matchId, summary, deadlineText }: { matchId: string; summary: string; deadlineText: string }) {
  const { error, pending, run } = useRun();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Ergebnis bestätigen</h2>
      <p>Das andere Team meldet: <strong>{summary}</strong></p>
      <p className="text-xs text-muted">{deadlineText}</p>
      {!disputing ? (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary disabled:opacity-60" disabled={pending} onClick={() => run(() => confirmResultAction(matchId))}>Bestätigen</button>
          <button className="btn btn-danger" disabled={pending} onClick={() => setDisputing(true)}>Widersprechen</button>
        </div>
      ) : (
        <form
          method="post"
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => disputeResultAction(matchId, reason));
          }}
        >
          <label className="label" htmlFor="dispute">Warum stimmt das Ergebnis nicht?</label>
          <textarea id="dispute" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required minLength={3} maxLength={300} className="field" />
          <div className="flex gap-2">
            <button className="btn btn-danger flex-1" disabled={pending}>Widerspruch senden</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDisputing(false)}>Zurück</button>
          </div>
        </form>
      )}
      <ErrorText message={error} />
    </section>
  );
}

export function DecidePanel({ matchId, home, away, homeScore, awayScore, disputeReason, organizer = false }: { matchId: string; home: string; away: string; homeScore: number; awayScore: number; disputeReason?: string | null; organizer?: boolean }) {
  const { error, pending, run } = useRun();
  const hydrated = useHydrated(); // Klick vor der Hydration wäre ein GET mit Torständen und Begründung in der Adresse
  const [h, setH] = useState(String(homeScore));
  const [a, setA] = useState(String(awayScore));
  const [reason, setReason] = useState("");

  return (
    <form
      method="post"
      aria-busy={!hydrated || undefined}
      className="card space-y-3 border-ink"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => decideResultAction(matchId, Number(h), Number(a), reason));
      }}
    >
      <h2 className="font-semibold text-ink">{organizer ? "Veranstalter-Entscheidung" : "Plattform-Entscheidung"}</h2>
      {disputeReason && <p className="text-sm text-muted">Widerspruch: „{disputeReason}“</p>}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div>
          <label className="label" htmlFor="decide-home">{home}</label>
          <input id="decide-home" type="number" min={0} max={99} required value={h} onChange={(e) => setH(e.target.value)} className="field text-center text-xl" />
        </div>
        <span className="pb-2 text-xl text-muted">:</span>
        <div>
          <label className="label" htmlFor="decide-away">{away}</label>
          <input id="decide-away" type="number" min={0} max={99} required value={a} onChange={(e) => setA(e.target.value)} className="field text-center text-xl" />
        </div>
      </div>
      <label className="label" htmlFor="decide-reason">Begründung (Pflicht, wird protokolliert)</label>
      <input id="decide-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} className="field" />
      <button className={`btn btn-danger w-full ${pending ? "disabled:opacity-60" : ""}`} disabled={pending || !hydrated} data-testid="decide-submit">Endgültig entscheiden</button>
      <ErrorText message={error} />
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Nach dem Spiel
// ---------------------------------------------------------------------------------------------

type Candidate = { userId: string; name: string };

/** Spieler des Spiels: eine Stimme pro Mitspieler, änderbar bis zum Ende der Abstimmung. */
export function MvpPanel({ matchId, candidates, myVote, closesText }: { matchId: string; candidates: Candidate[]; myVote: string | null; closesText: string }) {
  const { error, pending, run } = useRun();
  const [choice, setChoice] = useState<string | null>(myVote);
  return (
    <section className="card space-y-3" aria-label="Spieler des Spiels">
      <div>
        <h2 className="font-semibold">Wer war Spieler des Spiels?</h2>
        <p className="text-xs text-muted">{closesText} Du kannst nicht für dich selbst stimmen.</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {candidates.map((c) => (
          <li key={c.userId}>
            <button
              className={`btn w-full justify-between ${choice === c.userId ? "btn-primary" : "btn-ghost"}`}
              disabled={pending}
              aria-pressed={choice === c.userId}
              onClick={() => {
                setChoice(c.userId);
                run(() => castMvpVoteAction(matchId, c.userId));
              }}
            >
              <span>{c.name}</span>
              {choice === c.userId && <span aria-hidden>✓</span>}
            </button>
          </li>
        ))}
      </ul>
      <ErrorText message={error} />
    </section>
  );
}

/** Team-Admin markiert, wer nicht erschienen ist (wirkt nur auf die Zuverlässigkeit, nicht auf Ergebnis oder Geld). */
export function NoShowList({ matchId, players, selfId }: { matchId: string; players: { userId: string; name: string; noShow: boolean }[]; selfId: string }) {
  const { error, pending, run } = useRun();
  return (
    <details className="card space-y-2">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Nicht erschienen markieren</summary>
      <p className="mt-2 text-xs text-muted">Nur sichtbar für Team-Admins. Das fließt in die private Zuverlässigkeit ein und lässt sich innerhalb von 7 Tagen zurücknehmen.</p>
      <ul className="space-y-2">
        {players.filter((p) => p.userId !== selfId).map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className={p.noShow ? "text-ink line-through" : ""}>{p.name}</span>
            <button className="btn btn-ghost !min-h-11 !px-3 text-xs" disabled={pending} onClick={() => run(() => markNoShowAction(matchId, p.userId, !p.noShow))}>
              {p.noShow ? "Doch da" : "Nicht erschienen"}
            </button>
          </li>
        ))}
      </ul>
      <ErrorText message={error} />
    </details>
  );
}

/**
 * Abpfiff (Turnierspiel): beendet das Spiel mit dem Spielstand aus den erfassten Toren. Veranstalter/Admin: das Ergebnis ist sofort endgueltig; ein Team-Admin meldet es (das andere Team bestaetigt).
 * Immer mit Bestaetigung und grosser Anzeige des Spielstands.
 */
export function EndMatchPanel({ matchId, home, away, homeScore, awayScore, final }: { matchId: string; home: string; away: string; homeScore: number; awayScore: number; final: boolean }) {
  return (
    <section className="card space-y-2" aria-label="Abpfiff" data-testid="end-match">
      <h2 className="font-semibold">Abpfiff</h2>
      <p className="text-sm text-muted">{final ? "Beendet das Spiel mit dem aktuellen Spielstand. Das Ergebnis gilt sofort." : "Meldet das Spiel mit dem aktuellen Spielstand als beendet. Das andere Team bestätigt."}</p>
      {homeScore === awayScore && (
        <p className="text-sm font-semibold" data-testid="end-match-draw">{final ? TIEBREAK_ABPFIFF_HINWEIS : "Unentschieden: In einem K.-o.-Spiel trägt der Veranstalter danach Golden Goal oder Neunmeter ein; bis dahin rückt niemand weiter."}</p>
      )}
      {homeScore === 0 && awayScore === 0 && (
        <p className="text-sm text-muted" data-testid="end-match-keine-tore">{TIEBREAK_KEINE_TORE}</p>
      )}
      <ConfirmDialog
        trigger={{ label: "Abpfiff", variant: "primary" }}
        title="Spiel beenden?"
        body={final ? "Das Spiel wird mit diesem Spielstand beendet. Das Ergebnis ist endgültig und lässt sich nicht ändern." : "Das Spiel wird mit diesem Spielstand gemeldet. Das andere Team bestätigt das Ergebnis."}
        consequence={`${home} ${homeScore} : ${awayScore} ${away}`}
        consequenceLarge
        confirmLabel={final ? "Endgültig beenden" : "Ergebnis melden"}
        danger={final}
        onConfirmAction={() => endMatchAction(matchId)}
      />
    </section>
  );
}
