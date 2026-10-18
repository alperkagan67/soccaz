"use client";

import { useState } from "react";
import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { reportResultAction } from "@/server/tournament-actions";

type Side = { id: string; name: string };

export function ResultForm({ tournamentId, matchId, ko, a, b, current }: { tournamentId: string; matchId: string; ko: boolean; a: Side; b: Side; current: { a: number; b: number } | null }) {
  const { state, pending, onSubmit } = useFormAction(reportResultAction.bind(null, tournamentId, matchId));
  const [scoreA, setScoreA] = useState(current ? String(current.a) : "");
  const [scoreB, setScoreB] = useState(current ? String(current.b) : "");
  const draw = ko && scoreA !== "" && scoreA === scoreB;
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="label" htmlFor={`a-${matchId}`}>{a.name}</label>
        <input id={`a-${matchId}`} name="scoreA" type="number" min={0} max={99} value={scoreA} onChange={(e) => setScoreA(e.target.value)} className="field !w-20" required />
      </div>
      <div>
        <label className="label" htmlFor={`b-${matchId}`}>{b.name}</label>
        <input id={`b-${matchId}`} name="scoreB" type="number" min={0} max={99} value={scoreB} onChange={(e) => setScoreB(e.target.value)} className="field !w-20" required />
      </div>
      {draw && (
        <div>
          <label className="label" htmlFor={`s-${matchId}`}>Sieger im Siebenmeterschießen</label>
          <select id={`s-${matchId}`} name="shootoutWinner" className="field !w-auto" required>
            <option value="">Bitte wählen</option>
            <option value={a.id}>{a.name}</option>
            <option value={b.id}>{b.name}</option>
          </select>
        </div>
      )}
      <SubmitButton pending={pending} className="btn btn-primary !min-h-11">
        {current ? "Ändern" : "Eintragen"}
      </SubmitButton>
      {state?.error && <FieldError message={state.error} />}
    </form>
  );
}
