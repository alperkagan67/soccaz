"use client";

import { useState, useTransition } from "react";
import {
  castMvpVoteAction,
  confirmResultAction,
  decideResultAction,
  disputeResultAction,
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
    start(async () => setError((await fn())?.error));
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
        <div className="space-y-2 rounded-lg border border-green p-3" role="dialog" aria-label="Spieler wählen">
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

export function SubmitResultForm({ matchId, home, away, homeScore, awayScore }: { matchId: string; home: string; away: string; homeScore: number; awayScore: number }) {
  const { error, pending, run } = useRun();
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
      <p className="text-xs text-muted">Das andere Team bestätigt das Ergebnis. Antwortet es 48 Stunden nicht, gilt es automatisch.</p>
      <button className="btn btn-primary w-full disabled:opacity-60" disabled={pending}>{pending ? "Bitte warten…" : "Ergebnis melden"}</button>
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

export function DecidePanel({ matchId, home, away, homeScore, awayScore, disputeReason }: { matchId: string; home: string; away: string; homeScore: number; awayScore: number; disputeReason?: string | null }) {
  const { error, pending, run } = useRun();
  const [h, setH] = useState(String(homeScore));
  const [a, setA] = useState(String(awayScore));
  const [reason, setReason] = useState("");

  return (
    <form
      className="card space-y-3 border-coral"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => decideResultAction(matchId, Number(h), Number(a), reason));
      }}
    >
      <h2 className="font-semibold text-coral">Plattform-Entscheidung</h2>
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
      <button className="btn btn-danger w-full disabled:opacity-60" disabled={pending}>Endgültig entscheiden</button>
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
      <summary className="cursor-pointer font-semibold">Nicht erschienen markieren</summary>
      <p className="mt-2 text-xs text-muted">Nur sichtbar für Team-Admins. Das fließt in die private Zuverlässigkeit ein und lässt sich innerhalb von 7 Tagen zurücknehmen.</p>
      <ul className="space-y-2">
        {players.filter((p) => p.userId !== selfId).map((p) => (
          <li key={p.userId} className="flex items-center justify-between gap-2 text-sm">
            <span className={p.noShow ? "text-coral line-through" : ""}>{p.name}</span>
            <button className="btn btn-ghost !min-h-9 !px-3 text-xs" disabled={pending} onClick={() => run(() => markNoShowAction(matchId, p.userId, !p.noShow))}>
              {p.noShow ? "Doch da" : "Nicht erschienen"}
            </button>
          </li>
        ))}
      </ul>
      <ErrorText message={error} />
    </details>
  );
}
