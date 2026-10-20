"use client";

import { ActionButton } from "@/components/ActionButton";
import { finalConfirmAction } from "@/server/actions";

export type FinalTeam = { id: string; name: string; confirmed: boolean; ready: number; paid: number; total: number; complete: boolean };

/** Ganz unten: Jeder Captain bestätigt zum Schluss, dass sein Team komplett bereit und bezahlt ist. Bestätigen beide, öffnet sich die Spielübersicht. */
export function FinalConfirm({ matchId, teams, myTeamId, paymentsOn, minPlayers }: { matchId: string; teams: FinalTeam[]; myTeamId: string | null; paymentsOn: boolean; minPlayers: number }) {
  const mine = teams.find((t) => t.id === myTeamId);
  return (
    <section className="card space-y-3 border-green/60" aria-label="Letzte Bestätigung" data-testid="final-confirm">
      <div>
        <h2 className="font-semibold">Letzte Bestätigung der Captains</h2>
        <p className="text-sm text-muted">
          Wenn alle in deinem Team {paymentsOn ? "bezahlt haben und " : ""}bereit sind (mindestens {minPlayers} Spieler), bestätigt der Captain zum Schluss. Haben beide Captains bestätigt, öffnet sich die Spielübersicht mit allen Infos.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((t) => (
          <div key={t.id} className={`rounded-lg border p-3 text-sm ${t.confirmed ? "border-green/60" : "border-line"}`} data-testid="final-team" data-confirmed={t.confirmed}>
            <p className="font-semibold">{t.name}</p>
            <p className={t.confirmed ? "text-green" : "text-muted"}>{t.confirmed ? "✓ Captain hat bestätigt" : "Captain hat noch nicht bestätigt"}</p>
            <p className="text-xs text-muted">
              {t.ready} von {t.total} bereit{paymentsOn ? `, ${t.paid} bezahlt` : ""}
            </p>
          </div>
        ))}
      </div>
      {mine && !mine.confirmed && (
        <div className="space-y-1">
          <ActionButton action={finalConfirmAction.bind(null, matchId)} label="Ja, mein Team ist komplett: Spiel bestätigen" className="btn btn-primary w-full disabled:opacity-60" />
          {!mine.complete && <p className="text-xs text-muted">Noch nicht möglich: Es sind nicht alle in deinem Team bereit{paymentsOn ? " und bezahlt" : ""}.</p>}
        </div>
      )}
      {mine?.confirmed && <p className="text-sm text-green">Du hast bestätigt. Wir warten auf den Captain des anderen Teams.</p>}
    </section>
  );
}
