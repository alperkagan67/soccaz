"use client";

import { useRef } from "react";
import { FieldError, SubmitButton } from "@/components/FormBits";
import { anmeldeschlussVorschlag } from "@/lib/anmeldeschluss";
import { useFormAction } from "@/components/useFormAction";
import { CITIES } from "@/lib/validation";
import { createTournamentAction } from "@/server/tournament-actions";
import { ZP } from "@/lib/zahlungspflicht-texte";

export function TournamentForm({ min, defaultCity, standardHourly, commission, partnerVenues, free = false }: { min: string; defaultCity: string | null; standardHourly: string | null; commission: number; partnerVenues: { id: string; label: string }[] | null; free?: boolean }) {
  const { state, pending, onSubmit, formAction } = useFormAction(createTournamentAction);
  const fe = state?.fieldErrors ?? {};
  const deadlineRef = useRef<HTMLInputElement>(null);
  return (
    <form action={formAction} onSubmit={onSubmit} className="card space-y-4">
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
          <label className="label" htmlFor="maxTeams">Anzahl Teams (4 bis 16)</label>
          <input id="maxTeams" name="maxTeams" type="number" min={4} max={16} defaultValue={8} className="field" required />
          <p className="text-xs text-muted">Für dieses Turnier bis 16 Teams.</p>
        </div>
      </div>
      {partnerVenues && (
        <div>
          <label className="label" htmlFor="venueId">Partnerhalle</label>
          {/* nicht required: kostenlose Turniere brauchen keine Halle; der Server verlangt sie, sobald das Turnier etwas kostet */}
          <select id="venueId" name="venueId" className="field" defaultValue="">
            <option value="">Halle wählen</option>
            {partnerVenues.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted">Pflicht, sobald das Turnier etwas kostet. Der Anteil geht an die Halle. Der Turniername ist für die Halle sichtbar.</p>
          <FieldError message={fe.venueId} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="venueText">Spielort</label>
        <input id="venueText" name="venueText" className="field" maxLength={120} placeholder="Halle und Adresse" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="startsAt">Termin (Beginn)</label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            min={min}
            step={900}
            className="field"
            required
            onChange={(e) => {
              // Gratis-Turnier: Anmeldeschluss vorschlagen (4 Tage vorher), nur solange das Feld leer ist
              if (!free || !deadlineRef.current || deadlineRef.current.value) return;
              const v = anmeldeschlussVorschlag(e.target.value, min);
              if (v) deadlineRef.current.value = v;
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="registrationDeadline">Anmeldeschluss</label>
          <input id="registrationDeadline" name="registrationDeadline" type="datetime-local" min={min} step={900} className="field" required ref={deadlineRef} />
          {free && <p className="text-xs text-muted" data-testid="deadline-hint">Vorschlag: 4 Tage vor Beginn. Mit dem Anmeldeschluss schließt die Anmeldung; danach startest du mit den bereiten Teams oder sagst ab.</p>}
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
      {free ? (
        <>
          <input type="hidden" name="hourlyRent" value="0" />
          <p className="rounded-lg border border-line p-3 text-sm" data-testid="free-explainer">{ZP.tournamentFreeNote}</p>
        </>
      ) : (
        <>
        <div>
          <label className="label" htmlFor="hourlyRent">Hallenpreis pro Stunde (Euro, optional)</label>
          <input id="hourlyRent" name="hourlyRent" inputMode="decimal" className="field" placeholder={standardHourly ? `leer = Standardpreis ${standardHourly}` : "z. B. 80"} required={!standardHourly} />
          <FieldError message={fe.hourlyRent} />
        </div>
        <div className="space-y-1 rounded-lg border border-line p-3 text-xs text-muted" data-testid="fee-explainer">
          <p><strong className="text-ink">Der Eintritt wird automatisch berechnet.</strong> Hallenkosten = Stundenpreis mal Hallenzeit. Sie werden durch <em>alle Spieler</em> des Turniers geteilt.</p>
          <p>Jeder Spieler zahlt beim Beitritt vorab den höchsten möglichen Anteil. Sobald alle Teams da, bezahlt und bereit sind, steht die Spielerzahl fest: Dann wird genau abgerechnet und zu viel Gezahltes sofort erstattet. Bei Absage bekommt jeder alles zurück.</p>
          <p>Die Gelder liegen bis zum Turnierende auf einem Treuhandkonto. Wie die Auszahlung an dich läuft, klären wir vor dem Turnier mit dir (Provision {commission} %).</p>
        </div>
        </>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="public" className="mt-1 size-5 accent-accent" />
        <span>
          <span className="block font-semibold">Öffentlich in der Turnierliste zeigen</span>
          <span className="block text-muted">Standard ist privat: Das Turnier ist nur über den Einladungslink erreichbar.</span>
        </span>
      </label>
      <SubmitButton pending={pending}>Turnier anlegen</SubmitButton>
      {!free && <p className="text-xs text-muted" data-testid="organizer-hint">{ZP.hintOrganizer}</p>}
      {state?.error && !Object.keys(fe).length && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
