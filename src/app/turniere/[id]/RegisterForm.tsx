"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { registerTeamAction } from "@/server/tournament-actions";

export function RegisterForm({ tournamentId, teams }: { tournamentId: string; teams: { id: string; name: string }[] }) {
  const { state, pending, onSubmit } = useFormAction(registerTeamAction.bind(null, tournamentId));
  return (
    <form onSubmit={onSubmit} className="card space-y-3" data-testid="register-team">
      <h2 className="font-semibold">Als Captain mit deinem Team beitreten</h2>
      {teams.length > 1 ? (
        <div>
          <label className="label" htmlFor="teamId">Team</label>
          <select id="teamId" name="teamId" className="field">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <input type="hidden" name="teamId" value={teams[0].id} />
          <p className="text-sm text-muted">Dein Team: {teams[0].name}</p>
        </>
      )}
      <p className="text-xs text-muted">Du wirst Captain dieses Teams im Turnier. Danach laden die Spieler sich über die Teamfunktion ein und zahlen ihren Eintritt selbst.</p>
      <SubmitButton pending={pending}>Team anmelden</SubmitButton>
      {state?.error && <FieldError message={state.error} />}
    </form>
  );
}
