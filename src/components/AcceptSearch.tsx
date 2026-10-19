"use client";

import { useState, useTransition } from "react";
import { acceptSearchAction } from "@/server/matchmaking-actions";

type Team = { id: string; name: string; elo: number; strength: number };

/** Eine offene Suche mit dem eigenen Team annehmen. Zeigt vorher den Elo-Unterschied und ob die Spielstärke passt. */
export function AcceptSearch({ entryId, teams, opponent, label }: { entryId: string; teams: Team[]; opponent: { name: string; elo: number; wantMin: number | null; wantMax: number | null }; label?: string }) {
  const [teamId, setTeamId] = useState(teams[0].id);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const team = teams.find((t) => t.id === teamId)!;
  const diff = team.elo - opponent.elo;
  const fits = (opponent.wantMin === null || team.strength >= opponent.wantMin) && (opponent.wantMax === null || team.strength <= opponent.wantMax);

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <div className="flex flex-wrap items-end gap-2">
        {teams.length > 1 && (
          <div>
            <label className="label" htmlFor={`acc-${entryId}`}>Mit welchem Team?</label>
            <select id={`acc-${entryId}`} value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field !w-auto">
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          className="btn btn-primary disabled:opacity-60"
          disabled={pending || !fits}
          onClick={() => {
            if (!window.confirm(`Gegen ${opponent.name} antreten? Ihr legt euch auf die Zeitfenster dieser Suche fest. Danach folgt das Hallen-Veto.`)) return;
            setError(undefined);
            start(async () => {
              const result = await acceptSearchAction(entryId, teamId); // bei Erfolg Weiterleitung in die Lobby
              if (result?.error) setError(result.error);
            });
          }}
        >
          {pending ? "Bitte warten…" : (label ?? `Gegen ${opponent.name} antreten`)}
        </button>
      </div>
      <p className="text-xs text-muted">
        {team.name}: Elo {team.elo}, {diff === 0 ? "gleich stark" : diff > 0 ? `${diff} Punkte stärker` : `${-diff} Punkte schwächer`}.
        {!fits && <span className="text-coral"> Dieses Team sucht eine andere Spielstärke als die von {team.name}.</span>}
      </p>
      {error && (
        <p className="error text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
