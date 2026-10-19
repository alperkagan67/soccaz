"use client";

import { useState, useTransition } from "react";
import { challengeTeamAction } from "@/server/matchmaking-actions";

/**
 * Ein Klick: Das eigene Team fordert dieses Team heraus. Es öffnet sich kein Formular, sondern sofort die Lobby
 * (Team gegen Team mit Ampel). Hat die Person mehrere Teams, wählt sie vorher das eigene.
 */
export function ChallengeNow({ target, teams, variant = "button" }: { target: { id: string; name: string }; teams: { id: string; name: string }[]; variant?: "button" | "link" }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  if (teams.length === 0) return null;
  const go = () => {
    setError(undefined);
    start(async () => {
      const result = await challengeTeamAction(teamId, target.id); // bei Erfolg Weiterleitung in die Lobby
      if (result?.error) setError(result.error);
    });
  };
  return (
    <span className="inline-flex flex-col gap-1" data-testid="challenge-now">
      <span className="inline-flex flex-wrap items-center gap-2">
        {teams.length > 1 && (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Mit welchem Team herausfordern?" className="field !min-h-9 !w-auto !py-1 text-sm">
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button onClick={go} disabled={pending} className={variant === "button" ? "btn btn-primary !min-h-9 !px-3 text-sm disabled:opacity-60" : "text-xs text-green underline disabled:opacity-60"}>
          {pending ? "Bitte warten…" : `${target.name} herausfordern`}
        </button>
      </span>
      {error && (
        <span className="error text-xs" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
