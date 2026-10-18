"use client";

import { useActionState } from "react";
import { acceptRequestAction } from "@/server/actions";
import { SubmitButton } from "@/components/FormBits";

export function AcceptForm({ requestId, teams }: { requestId: string; teams: { id: string; name: string }[] }) {
  const [state, action] = useActionState(acceptRequestAction.bind(null, requestId), undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Herausforderung annehmen</h2>
      {teams.length > 1 ? (
        <div>
          <label className="label" htmlFor="teamId">Mit welchem Team?</label>
          <select id="teamId" name="teamId" className="field" required>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ) : (
        <>
          <input type="hidden" name="teamId" value={teams[0].id} />
          <p className="text-sm text-muted">Dein Team: {teams[0].name}</p>
        </>
      )}
      <SubmitButton>Spiel annehmen</SubmitButton>
      {state?.error && <p className="error" role="alert">{state.error}</p>}
    </form>
  );
}
