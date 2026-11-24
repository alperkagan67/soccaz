"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { registerTeamAction } from "@/server/tournament-actions";
import { ZP } from "@/lib/zahlungspflicht-texte";
import { ZAHLUNGEN_AUS_HINWEIS } from "@/lib/zahlungen-aus";

/** aus = Zahlungen AUS und Turnier ohne Kartenfluss (zeigt den Hinweissatz); noMoney = keine Zahlungstexte (auch bei einem kostenlosen Turnier mit eingeschalteten Zahlungen). */
export function RegisterForm({ tournamentId, teams, aus = false, noMoney = aus }: { tournamentId: string; teams: { id: string; name: string }[]; aus?: boolean; noMoney?: boolean }) {
  const { state, pending, onSubmit, formAction } = useFormAction(registerTeamAction.bind(null, tournamentId));
  return (
    <form action={formAction} onSubmit={onSubmit} className="card space-y-3" data-testid="register-team">
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
      <p className="text-xs text-muted" data-testid="paymode-info">Du wirst Captain dieses Teams im Turnier. Danach laden die Spieler sich über die Teamfunktion ein.{noMoney ? "" : " Bezahlen kann jeder Spieler für sich, oder du als Captain für das ganze Team oder für einzelne Spieler."}</p>
      <SubmitButton pending={pending}>Team anmelden</SubmitButton>
      <p className="text-xs text-muted" data-testid="register-hint">{aus ? ZAHLUNGEN_AUS_HINWEIS : noMoney ? "" : ZP.hintLater}</p>
      {state?.error && <FieldError message={state.error} />}
    </form>
  );
}
