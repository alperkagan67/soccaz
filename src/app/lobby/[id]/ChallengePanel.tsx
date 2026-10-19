"use client";

import { ActionButton } from "@/components/ActionButton";
import { acceptChallengeAction, declineChallengeAction } from "@/server/matchmaking-actions";

/** Direkt-Herausforderung: Das herausgeforderte Team nimmt an oder lehnt ab, das herausfordernde kann zurückziehen. */
export function ChallengePanel({ matchId, homeName, awayName, role, deadlineText }: { matchId: string; homeName: string; awayName: string; role: "target" | "challenger" | "viewer"; deadlineText: string }) {
  return (
    <section className="card space-y-3 border-yellow/60" aria-label="Herausforderung" data-testid="challenge-panel">
      <div>
        <h2 className="font-semibold text-yellow">Herausforderung wartet auf Annahme</h2>
        <p className="text-sm text-muted">
          {homeName} hat {awayName} herausgefordert. Nimmt {awayName} an, beginnt das Hallen-Veto, danach wählt ihr gemeinsam den Termin. Antwort bis {deadlineText}.
        </p>
      </div>
      {role === "target" && (
        <div className="flex flex-wrap gap-2">
          <ActionButton action={acceptChallengeAction.bind(null, matchId)} label="Herausforderung annehmen" className="btn btn-primary !min-h-10 !px-4 text-sm" />
          <ActionButton action={declineChallengeAction.bind(null, matchId)} label="Ablehnen" confirm="Herausforderung wirklich ablehnen?" className="btn btn-danger !min-h-10 !px-4 text-sm" />
        </div>
      )}
      {role === "challenger" && <ActionButton action={declineChallengeAction.bind(null, matchId)} label="Herausforderung zurückziehen" confirm="Herausforderung wirklich zurückziehen?" />}
      {role === "viewer" && <p className="text-xs text-muted">Nur die Admins von {awayName} können annehmen.</p>}
    </section>
  );
}
