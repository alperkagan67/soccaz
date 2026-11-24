"use client";

import { ActionButton } from "@/components/ActionButton";
import { finalConfirmAction } from "@/server/actions";
import { ZP, finalConfirmHinweis } from "@/lib/zahlungspflicht-texte";

export type FinalTeam = { id: string; name: string; confirmed: boolean; ready: number; paid: number; total: number; complete: boolean };

/** Ganz unten: Jeder Captain bestätigt zum Schluss, dass sein Team komplett bereit und bezahlt ist. Bestätigen beide, öffnet sich die Spielübersicht. */
export function FinalConfirm({ matchId, teams, myTeamId, paymentsOn, minPlayers, payable, amountText }: { matchId: string; teams: FinalTeam[]; myTeamId: string | null; paymentsOn: boolean; minPlayers: number; payable: boolean; amountText: string | null }) {
  const mine = teams.find((t) => t.id === myTeamId);
  return (
    <section className="card space-y-3 border-accent/60" aria-label={payable ? ZP.finalHeading : ZP.finalHeadingFree} data-testid="final-confirm">
      <div>
        <h2 className="font-semibold">{payable ? ZP.finalHeading : ZP.finalHeadingFree}</h2>
        <p className="text-sm text-muted">
          Wenn alle in deinem Team {paymentsOn ? "bezahlt haben und " : ""}bereit sind (mindestens {minPlayers} Spieler), bestätigt der Captain zum Schluss. Haben beide Captains bestätigt, öffnet sich die Spielübersicht mit allen Infos.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((t) => (
          <div key={t.id} className={`rounded-lg border p-3 text-sm ${t.confirmed ? "border-accent/60" : "border-line"}`} data-testid="final-team" data-confirmed={t.confirmed}>
            <p className="font-semibold">{t.name}</p>
            <p className={t.confirmed ? "text-accent-fg" : "text-muted"}>{t.confirmed ? "✓ Captain hat bestätigt" : "Captain hat noch nicht bestätigt"}</p>
            <p className="text-xs text-muted">
              {t.ready} von {t.total} bereit{paymentsOn ? `, ${t.paid} bezahlt` : ""}
            </p>
          </div>
        ))}
      </div>
      {/* ENTWURF, Rechtsprüfung (Rechtsliste, Button-Lösung § 312j BGB): Formel und Hinweiszeile NUR bei einer Zahlungspflicht (Kartenmodell, Preis > 0); sonst der bisherige Text ohne Zusage. Texte: src/lib/zahlungspflicht-texte.ts */}
      {mine && !mine.confirmed && (
        <div className="space-y-1">
          <ActionButton action={finalConfirmAction.bind(null, matchId)} label={payable ? ZP.finalConfirm : ZP.finalConfirmFree} className="btn btn-primary w-full disabled:opacity-60" />
          {payable && <p className="text-sm text-muted" data-testid="final-confirm-pay-note">{finalConfirmHinweis(amountText)}</p>}
          {!mine.complete && <p className="text-xs text-muted">Noch nicht möglich: Es sind nicht alle in deinem Team bereit{paymentsOn ? " und bezahlt" : ""}.</p>}
        </div>
      )}
      {mine?.confirmed && <p className="text-sm text-accent-fg">Du hast bestätigt. Wir warten auf den Captain des anderen Teams.</p>}
    </section>
  );
}
