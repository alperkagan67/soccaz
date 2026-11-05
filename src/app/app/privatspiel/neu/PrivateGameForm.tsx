"use client";

import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { createPrivateGameAction } from "@/server/privategame-actions";

export function PrivateGameForm({ min, defaultCity }: { min: string; defaultCity: string | null }) {
  const { state, pending, onSubmit } = useFormAction(createPrivateGameAction);
  const fe = state?.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="startsAt">Anstoß (Datum und Uhrzeit)</label>
          <input id="startsAt" name="startsAt" type="datetime-local" min={min} step={900} className="field" required />
        </div>
        <div>
          <label className="label" htmlFor="durationMin">Dauer</label>
          <select id="durationMin" name="durationMin" defaultValue="60" className="field">
            <option value="60">60 Minuten</option>
            <option value="90">90 Minuten</option>
          </select>
        </div>
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
          <label className="label" htmlFor="maxPlayers">Spieler insgesamt</label>
          <input id="maxPlayers" name="maxPlayers" type="number" min={4} max={22} step={2} defaultValue={10} className="field" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="venueText">Halle und Adresse</label>
        <input id="venueText" name="venueText" className="field" maxLength={120} required placeholder="Soccerhalle Buer, Hauptstr. 1" />
      </div>
      <div>
        <label className="label" htmlFor="rent">Hallenmiete in Euro (optional)</label>
        <input id="rent" name="rent" inputMode="decimal" className="field" placeholder="leer = Standardpreis" />
        <p className="mt-1 text-xs text-muted">Die Miete wird durch die Zahl der zahlenden Spieler geteilt. Jeder zahlt seinen Anteil selbst.</p>
        <FieldError message={fe.rent} />
      </div>
      <SubmitButton pending={pending}>Privatspiel anlegen</SubmitButton>
      {state?.error && !Object.keys(fe).length && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
