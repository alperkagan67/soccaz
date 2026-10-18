"use client";

import { useState, useTransition } from "react";
import { mergeTeamsAction, setTeamVerifiedAction } from "@/server/admin-actions";

type Result = { error?: string } | undefined;

export function TeamActions({ teamId, name, verified, others }: { teamId: string; name: string; verified: boolean; others: { id: string; name: string }[] }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState("");
  const run = (fn: () => Promise<Result>) => {
    setError(undefined);
    start(async () => setError((await fn())?.error));
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost !min-h-9" disabled={pending} onClick={() => run(() => setTeamVerifiedAction(teamId, !verified))}>
          {verified ? "Verifizierung entziehen" : "Verifizieren"}
        </button>
        <label className="sr-only" htmlFor={`merge-${teamId}`}>Zusammenführen mit</label>
        <select id={`merge-${teamId}`} className="field !min-h-9 !w-auto" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">In anderes Team überführen…</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        {target && (
          <button
            className="btn btn-danger !min-h-9"
            disabled={pending}
            onClick={() => {
              const t = others.find((o) => o.id === target);
              if (confirm(`„${name}“ in „${t?.name}“ überführen? Das Team „${name}“ verschwindet danach.`)) run(() => mergeTeamsAction(teamId, target));
            }}
          >
            Zusammenführen
          </button>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
