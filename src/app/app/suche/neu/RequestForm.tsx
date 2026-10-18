"use client";

import { useActionState } from "react";
import { createRequestAction } from "@/server/actions";
import { CITIES } from "@/lib/validation";
import { STRENGTH_LABELS } from "@/lib/labels";
import { FieldError, SubmitButton } from "@/components/FormBits";

type TeamOption = { id: string; name: string; city: string; strength: number };

export function RequestForm({ teams, min }: { teams: TeamOption[]; min: string }) {
  const [state, action] = useActionState(createRequestAction, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="teamId">Team</label>
        <select id="teamId" name="teamId" required className="field">
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <FieldError message={fe.teamId} />
      </div>

      <div>
        <label className="label" htmlFor="startsAt">Anstoß (deutsche Zeit)</label>
        <input id="startsAt" name="startsAt" type="datetime-local" required min={min} step={900} className="field" />
        <p className="mt-1 text-xs text-muted">Mindestens 24 Stunden im Voraus.</p>
        <FieldError message={fe.startsAt} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="durationMin">Dauer</label>
          <select id="durationMin" name="durationMin" defaultValue="60" className="field">
            <option value="60">60 Min</option>
            <option value="90">90 Min</option>
          </select>
          <FieldError message={fe.durationMin} />
        </div>
        <div>
          <label className="label" htmlFor="city">Stadt</label>
          <select id="city" name="city" defaultValue={teams[0]?.city} className="field">
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <FieldError message={fe.city} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="strength">Gesuchte Spielstärke des Gegners</label>
        <select id="strength" name="strength" defaultValue={String(teams[0]?.strength ?? 3)} className="field">
          {Object.entries(STRENGTH_LABELS).map(([v, l]) => <option key={v} value={v}>{v} – {l}</option>)}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="visibility">Sichtbarkeit</label>
        <select id="visibility" name="visibility" defaultValue="public" className="field">
          <option value="public">Öffentlich (in der Liste)</option>
          <option value="private">Privat (nur über Link)</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="note">Hinweis (optional)</label>
        <textarea id="note" name="note" rows={2} maxLength={200} className="field" placeholder="z. B. Halle, besondere Wünsche" />
        <FieldError message={fe.note} />
      </div>

      <SubmitButton>Spielsuche erstellen</SubmitButton>
      {state?.error && !Object.keys(fe).length && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
