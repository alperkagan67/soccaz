"use client";

import { useActionState } from "react";
import { createTeamAction } from "@/server/actions";
import { CITIES } from "@/lib/validation";
import { FieldError, SubmitButton } from "@/components/FormBits";

const STRENGTH = [
  [1, "1 – Locker, Spaß steht im Vordergrund"],
  [2, "2 – Freizeit mit etwas Ehrgeiz"],
  [3, "3 – Gut eingespielt"],
  [4, "4 – Sehr stark"],
  [5, "5 – Ex-Vereinsspieler, hoher Anspruch"],
] as const;

export function TeamForm({ defaultCity }: { defaultCity: string }) {
  const [state, action] = useActionState(createTeamAction, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="name">Teamname</label>
        <input id="name" name="name" required minLength={3} maxLength={40} className="field" />
        <FieldError message={fe.name} />
      </div>
      <div>
        <label className="label" htmlFor="city">Stadt</label>
        <select id="city" name="city" required defaultValue={defaultCity} className="field">
          {CITIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <FieldError message={fe.city} />
      </div>
      <div>
        <label className="label" htmlFor="strength">Spielstärke</label>
        <select id="strength" name="strength" defaultValue="3" className="field">
          {STRENGTH.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted">Das ist deine Einschätzung. Später ergibt sich die Stärke aus euren Ergebnissen.</p>
      </div>
      <SubmitButton>Team gründen</SubmitButton>
    </form>
  );
}
