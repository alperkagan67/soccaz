"use client";

import { useActionState } from "react";
import { completeOnboardingAction } from "@/server/actions";
import { CITIES, POSITIONS } from "@/lib/validation";
import { FieldError, SubmitButton } from "@/components/FormBits";

export function OnboardingForm({ defaultName, next }: { defaultName: string; next: string }) {
  const [state, action] = useActionState(completeOnboardingAction, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="label" htmlFor="name">Anzeigename</label>
        <input id="name" name="name" defaultValue={defaultName} required maxLength={40} className="field" autoComplete="nickname" />
        <FieldError message={fe.name} />
      </div>

      <div>
        <label className="label" htmlFor="city">Stadt</label>
        <select id="city" name="city" required defaultValue="" className="field">
          <option value="" disabled>Bitte wählen</option>
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <FieldError message={fe.city} />
      </div>

      <div>
        <label className="label" htmlFor="position">Position</label>
        <select id="position" name="position" required defaultValue="" className="field">
          <option value="" disabled>Bitte wählen</option>
          {POSITIONS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <FieldError message={fe.position} />
      </div>

      <div>
        <label className="label" htmlFor="birthDate">Geburtsdatum</label>
        <input id="birthDate" name="birthDate" type="date" required className="field" max={new Date().toISOString().slice(0, 10)} />
        <p className="mt-1 text-xs text-muted">Socaz ist ab 16. Das Datum wird nur zur Prüfung verwendet und nicht gespeichert.</p>
        <FieldError message={fe.birthDate} />
      </div>

      <div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="terms" className="mt-1 size-5 accent-green" required />
          <span>Ich akzeptiere die Datenschutzerklärung und die Hausordnung.</span>
        </label>
        <FieldError message={fe.terms} />
      </div>

      <SubmitButton>Los geht&apos;s</SubmitButton>
    </form>
  );
}
