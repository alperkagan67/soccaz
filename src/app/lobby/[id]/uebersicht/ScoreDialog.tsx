"use client";

import { useRef, useState, useTransition } from "react";
import { submitScoreAction } from "@/server/actions";

type Team = { id: string; name: string };
type Player = { userId: string; name: string; teamId: string | null };
type Goal = { teamId: string; scorerId: string };

/** Pop-up: Tore je Team eintragen, optional den Torschützen markieren. Der Captain meldet das Ergebnis, der andere Captain bestätigt. */
export function ScoreDialog({ matchId, home, away, players, existing }: { matchId: string; home: Team; away: Team; players: Player[]; existing: { teamId: string; scorer: string | null }[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const count = (teamId: string) => existing.filter((e) => e.teamId === teamId).length + goals.filter((g) => g.teamId === teamId).length;
  const add = (teamId: string) => setGoals((g) => [...g, { teamId, scorerId: "" }]);
  const setScorer = (i: number, scorerId: string) => setGoals((g) => g.map((x, idx) => (idx === i ? { ...x, scorerId } : x)));
  const remove = (i: number) => setGoals((g) => g.filter((_, idx) => idx !== i));

  function submit() {
    setError(undefined);
    start(async () => {
      const result = await submitScoreAction(matchId, goals.map((g) => ({ teamId: g.teamId, scorerId: g.scorerId || null })));
      if (result?.error) return setError(result.error);
      setGoals([]);
      ref.current?.close();
    });
  }

  return (
    <>
      <button type="button" className="btn btn-primary w-full" onClick={() => ref.current?.showModal()} data-testid="open-score">Ergebnis eintragen</button>
      <dialog ref={ref} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-ink backdrop:bg-black/70" aria-label="Ergebnis eintragen" data-testid="score-dialog">
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold">Ergebnis eintragen</h2>
            <button type="button" className="text-muted" onClick={() => ref.current?.close()} aria-label="Schließen">✕</button>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center" aria-live="polite">
            <span className="font-semibold">{home.name}</span>
            <span className="font-heading text-4xl font-extrabold tabular-nums" data-testid="score-preview">{count(home.id)} : {count(away.id)}</span>
            <span className="font-semibold">{away.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[home, away].map((t) => (
              <button key={t.id} type="button" className="btn btn-primary !min-h-12" onClick={() => add(t.id)}>+ Tor {t.name}</button>
            ))}
          </div>
          {(existing.length > 0 || goals.length > 0) && (
            <ul className="space-y-2 text-sm">
              {existing.map((e, i) => (
                <li key={`e-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-muted">
                  <span>Tor {e.teamId === home.id ? home.name : away.name}</span>
                  <span>{e.scorer ?? "Unbekannt"} (schon erfasst)</span>
                </li>
              ))}
              {goals.map((g, i) => (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-green/50 px-3 py-2" data-testid="score-goal">
                  <span>Tor {g.teamId === home.id ? home.name : away.name}</span>
                  <span className="flex items-center gap-2">
                    <select aria-label="Torschütze" value={g.scorerId} onChange={(e) => setScorer(i, e.target.value)} className="field !min-h-9 !py-1 text-sm">
                      <option value="">Torschütze: unbekannt</option>
                      {players.filter((p) => p.teamId === g.teamId).map((p) => (
                        <option key={p.userId} value={p.userId}>{p.name}</option>
                      ))}
                    </select>
                    <button type="button" className="text-muted" onClick={() => remove(i)} aria-label="Tor entfernen">✕</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Der Captain des anderen Teams bestätigt das Ergebnis. Erst wenn beide Captains einverstanden sind, zählt es. Antwortet er 48 Stunden nicht, gilt es automatisch.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary w-full disabled:opacity-60" disabled={pending} onClick={submit}>{pending ? "Bitte warten…" : "Ergebnis melden"}</button>
        </div>
      </dialog>
    </>
  );
}
