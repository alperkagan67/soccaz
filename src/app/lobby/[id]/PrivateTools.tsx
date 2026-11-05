"use client";

import { ActionButton } from "@/components/ActionButton";
import { randomSplitAction } from "@/server/actions";

/** Veranstalter eines Privatspiels: Spieler zufällig auf Rot und Blau verteilen. */
export function PrivateTools({ matchId, waiting, assigned }: { matchId: string; waiting: number; assigned: number }) {
  return (
    <section className="card space-y-2" aria-label="Teams einteilen" data-testid="private-tools">
      <h2 className="font-semibold">Teams einteilen</h2>
      <p className="text-sm text-muted">{waiting > 0 ? `${waiting} Spieler warten auf ihr Team.` : "Alle sind eingeteilt."} Teile sie unten per Knopf zu oder lass zufällig verteilen.</p>
      <div className="flex flex-wrap gap-2">
        {waiting > 0 && <ActionButton action={randomSplitAction.bind(null, matchId, false)} label="Zufällig einteilen" className="btn btn-primary !min-h-9 !px-3 text-sm" />}
        {assigned > 0 && <ActionButton action={randomSplitAction.bind(null, matchId, true)} label="Neu mischen" confirm="Alle, die noch nicht bezahlt haben und nicht bereit sind, werden neu verteilt." className="btn btn-ghost !min-h-9 !px-3 text-sm" />}
      </div>
    </section>
  );
}
