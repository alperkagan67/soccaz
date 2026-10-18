"use client";

import { ActionForm } from "@/components/ActionForm";
import type { ActionState } from "@/lib/validation";

export function ApplyForm({ action, teams }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState>; teams: { id: string; name: string }[] }) {
  return (
    <ActionForm action={action} submit="Mit diesem Team bewerben" successText="Bewerbung abgeschickt. Viel Glück!">
      <h2 className="font-semibold">Bewerben</h2>
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
    </ActionForm>
  );
}
