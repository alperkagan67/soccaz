"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { decideTieAction } from "@/server/tournament-actions";
import {
  TIEBREAK_BESTAETIGEN,
  TIEBREAK_FEHLER_ALLGEMEIN,
  TIEBREAK_FORM_TITEL,
  TIEBREAK_PFLICHT,
  TIEBREAK_ZAEHLER_HINWEIS,
  parseTreffer,
  pruefeSiegerTreffer,
  tieDialogText,
  tieFolge,
  tieOptionen,
} from "@/lib/tiebreak-regeln";

/**
 * Entscheidung bei offenem Gleichstand im K.-o.-Spiel (Veranstalter/Admin): PFLICHTAUSWAHL (Golden Goal für A/B oder Neunmeter, Sieger A/B), bei Neunmetern optional die Trefferzahlen,
 * dann EINE Hauptaktion mit großer Bestätigung "A 2 : 2 B → Golden Goal für A". Der Server (decideTieAction) prüft Rechte, Gleichstand und Zahlen erneut; seine Fehlertexte stehen 1:1 im Dialog.
 */
export function TieBreakForm({ tournamentId, tournamentMatchId, teamA, teamB, nameA, nameB, score, compact = false }: { tournamentId: string; tournamentMatchId: string; teamA: string; teamB: string; nameA: string; nameB: string; score: number; compact?: boolean }) {
  const gruppe = useId();
  const [key, setKey] = useState<string>("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const option = tieOptionen(nameA, nameB).find((o) => o.key === key);
  const parsed: ReturnType<typeof parseTreffer> = option?.kind === "9m" ? parseTreffer(a, b) : { ok: true };
  const siegerFehler = option?.kind === "9m" && parsed.ok ? pruefeSiegerTreffer(parsed.counts, option.side) : null;
  const treffer: ReturnType<typeof parseTreffer> = siegerFehler ? { ok: false, error: siegerFehler } : parsed;

  return (
    <div className="space-y-2 text-left" data-testid="tiebreak-form">
      <fieldset className="space-y-1">
        <legend className={`font-semibold ${compact ? "text-xs" : "text-sm"}`}>{TIEBREAK_FORM_TITEL}</legend>
        {tieOptionen(nameA, nameB).map((o) => (
          <label key={o.key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm" htmlFor={`${gruppe}-${o.key}`}>
            <input id={`${gruppe}-${o.key}`} type="radio" name={gruppe} value={o.key} checked={key === o.key} onChange={() => setKey(o.key)} className="size-5 accent-accent" />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {option?.kind === "9m" && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-muted">{TIEBREAK_ZAEHLER_HINWEIS}</legend>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`${gruppe}-ta`}>Treffer {nameA}</label>
            <input id={`${gruppe}-ta`} inputMode="numeric" className="field !w-16 text-center" value={a} onChange={(e) => setA(e.target.value)} placeholder="–" />
            <span aria-hidden>:</span>
            <label className="sr-only" htmlFor={`${gruppe}-tb`}>Treffer {nameB}</label>
            <input id={`${gruppe}-tb`} inputMode="numeric" className="field !w-16 text-center" value={b} onChange={(e) => setB(e.target.value)} placeholder="–" />
          </div>
          {!treffer.ok && (
            <p className="text-xs" role="alert" data-testid="tiebreak-zaehler-fehler">
              {treffer.error}
            </p>
          )}
        </fieldset>
      )}
      {option && treffer.ok ? (
        <ConfirmDialog
          trigger={{ label: "Entscheidung eintragen", variant: "primary" }}
          title="Entscheidung eintragen?"
          body={tieDialogText(option)}
          consequence={tieFolge(nameA, nameB, score, option)}
          consequenceLarge
          confirmLabel={TIEBREAK_BESTAETIGEN}
          danger
          onConfirmAction={async () => {
            try {
              return await decideTieAction(tournamentId, tournamentMatchId, option.kind, option.side === "a" ? teamA : teamB, option.kind === "9m" ? treffer.counts : undefined);
            } catch {
              return { error: TIEBREAK_FEHLER_ALLGEMEIN };
            }
          }}
        />
      ) : (
        <>
          <button type="button" className="btn btn-primary w-full !min-h-11" disabled>
            Entscheidung eintragen
          </button>
          {!option && (
            <p className="text-xs text-muted" data-testid="tiebreak-pflicht">
              {TIEBREAK_PFLICHT}
            </p>
          )}
        </>
      )}
    </div>
  );
}
