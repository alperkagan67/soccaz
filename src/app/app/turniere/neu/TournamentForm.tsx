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
        <label className="label" htmlFor="name">Name des Turniers</label>
        <input id="name" name="name" className="field" required minLength={3} maxLength={80} placeholder="Ramadan-Cup" />
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
          <label className="label" htmlFor="maxTeams">Anzahl Teams (4 bis 32)</label>
          <input id="maxTeams" name="maxTeams" type="number" min={4} max={32} defaultValue={8} className="field" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="venueText">Spielort</label>
        <input id="venueText" name="venueText" className="field" maxLength={120} placeholder="Halle und Adresse" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="startsAt">Termin (Beginn)</label>
          <input id="startsAt" name="startsAt" type="datetime-local" min={min} step={900} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="registrationDeadline">Anmeldeschluss</label>
          <input id="registrationDeadline" name="registrationDeadline" type="datetime-local" min={min} step={900} className="field" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="entryFee">Eintritt pro Spieler (Euro, 0 = kostenlos)</label>
          <input id="entryFee" name="entryFee" inputMode="decimal" className="field" placeholder="0" />
          <FieldError message={fe.entryFee} />
        </div>
        <div>
          <label className="label" htmlFor="matchMinutes">Spielzeit pro Spiel (Minuten)</label>
          <input id="matchMinutes" name="matchMinutes" type="number" min={5} max={90} defaultValue={15} className="field" />
        </div>
      </div>
      <p className="text-xs text-muted">Jeder Spieler zahlt seinen Eintritt selbst über die Plattform. Die Gelder liegen bis zum Turnierende auf einem Treuhandkonto. Danach zahlen wir dir den Betrag abzüglich Provision auf dein Guthaben aus. Bei Absage bekommt jeder Spieler alles zurück.</p>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="public" className="mt-1 size-5 accent-green" />
        <span>
          <span className="block font-semibold">Öffentlich in der Turnierliste zeigen</span>
          <span className="block text-muted">Standard ist privat: Das Turnier ist nur über den Einladungslink erreichbar.</span>
        </span>
      </label>
      <SubmitButton pending={pending}>Turnier anlegen</SubmitButton>
      {state?.error && !Object.keys(fe).length && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
