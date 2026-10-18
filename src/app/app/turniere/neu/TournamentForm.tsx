"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { createTournamentAction } from "@/server/tournament-actions";

export function TournamentForm({ min, defaultCity }: { min: string; defaultCity: string | null }) {
  const { state, pending, onSubmit } = useFormAction(createTournamentAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" className="field" required minLength={3} maxLength={80} placeholder="Hallen-Cup Essen" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={defaultCity ?? CITIES[0]} className="field">
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="startsOn">Tag</label>
          <input id="startsOn" name="startsOn" type="date" min={min} className="field" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="venueText">Halle (optional)</label>
        <input id="venueText" name="venueText" className="field" maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="format">Format</label>
          <select id="format" name="format" className="field" defaultValue="knockout">
            <option value="knockout">K.-o.-System</option>
            <option value="round_robin">Jeder gegen jeden</option>
            <option value="groups_ko">Gruppen und K.-o.-Runde (ab 6 Teams)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="maxTeams">Höchstens Teams</label>
          <input id="maxTeams" name="maxTeams" type="number" min={2} max={32} defaultValue={8} className="field" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="entryFee">Startgeld je Team (Euro, 0 = kostenlos)</label>
        <input id="entryFee" name="entryFee" inputMode="decimal" className="field" placeholder="0" />
        <p className="mt-1 text-xs text-muted">Die Gelder liegen bis zum Turnierende auf einem Treuhandkonto. Danach zahlen wir dir den Betrag abzüglich Provision auf dein Guthaben aus. Bei Absage gehen sie zurück.</p>
        <FieldError message={fe.entryFee} />
      </div>
      <SubmitButton pending={pending}>Turnier anlegen</SubmitButton>
      {state?.error && !Object.keys(fe).length && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
