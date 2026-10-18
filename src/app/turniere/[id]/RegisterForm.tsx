"use client";

import Link from "next/link";
import { FieldError, SubmitButton } from "@/components/FormBits";
import { useFormAction } from "@/components/useFormAction";
import { formatEuro } from "@/lib/money";
import { registerTeamAction } from "@/server/tournament-actions";

export function RegisterForm({ tournamentId, teams, fee }: { tournamentId: string; teams: { id: string; name: string }[]; fee: number }) {
  const { state, pending, onSubmit } = useFormAction(registerTeamAction.bind(null, tournamentId));
  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="font-semibold">Team anmelden</h2>
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
      {fee > 0 && <p className="text-sm text-muted">Das Startgeld von {formatEuro(fee)} wird sofort von deinem Guthaben abgebucht. Meldest du das Team vor dem Start ab, bekommst du es zurück.</p>}
      <SubmitButton pending={pending}>{fee > 0 ? `Anmelden für ${formatEuro(fee)}` : "Anmelden"}</SubmitButton>
      {state?.error && <FieldError message={state.error} />}
      {state?.needsTopupCents ? (
        <Link href="/app/guthaben" className="btn btn-ghost w-full">Guthaben aufladen</Link>
      ) : null}
    </form>
  );
}
