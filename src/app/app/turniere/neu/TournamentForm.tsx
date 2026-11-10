"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { createTournamentAction } from "@/server/tournament-actions";

export function TournamentForm({ min, defaultCity, standardHourly, commission }: { min: string; defaultCity: string | null; standardHourly: string | null; commission: number }) {
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
          <label className="label" htmlFor="durationHours">Hallenzeit für das Turnier (Stunden)</label>
          <input id="durationHours" name="durationHours" inputMode="decimal" defaultValue="3" className="field" required />
          <FieldError message={fe.durationHours} />
        </div>
        <div>
          <label className="label" htmlFor="matchMinutes">Spielzeit pro Spiel (Minuten)</label>
          <input id="matchMinutes" name="matchMinutes" type="number" min={5} max={90} defaultValue={15} className="field" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="hourlyRent">Hallenpreis pro Stunde (Euro, optional)</label>
        <input id="hourlyRent" name="hourlyRent" inputMode="decimal" className="field" placeholder={standardHourly ? `leer = Standardpreis ${standardHourly}` : "z. B. 80"} required={!standardHourly} />
        <FieldError message={fe.hourlyRent} />
      </div>
      <div className="space-y-1 rounded-lg border border-line p-3 text-xs text-muted" data-testid="fee-explainer">
        <p><strong className="text-ink">Der Eintritt wird automatisch berechnet.</strong> Hallenkosten = Stundenpreis mal Hallenzeit. Sie werden durch <em>alle Spieler</em> des Turniers geteilt.</p>
        <p>Jeder Spieler zahlt beim Beitritt vorab den höchsten möglichen Anteil. Sobald alle Teams da, bezahlt und bereit sind, steht die Spielerzahl fest: Dann wird genau abgerechnet und zu viel Gezahltes sofort erstattet. Bei Absage bekommt jeder alles zurück.</p>
        <p>Die Gelder liegen bis zum Turnierende auf einem Treuhandkonto. Danach zahlen wir dir den Betrag abzüglich {commission} % Provision auf dein Guthaben aus.</p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="public" className="mt-1 size-5 accent-accent" />
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
