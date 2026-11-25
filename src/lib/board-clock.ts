// Tafeluhr (Turnierseite): wann ein Spielblock früher als geplant zu Ende war. Reine Funktion (testbar); die Anzeige steht in src/app/turniere/[id]/BoardClock.tsx.

export type BlockSpiel = { fun: boolean; matchId: string | null; playedIso?: string | null };

/**
 * Zeitpunkt (ISO), zu dem ALLE echten Spiele des Blocks beendet waren (das letzte Ende), sonst null: solange ein Spiel noch offen ist, noch kein Spiel feststeht oder der Block keine echten Spiele hat.
 * Das Spaßspiel der Halbfinal-Verlierer (fun) zählt nicht mit (es hat kein Ergebnis).
 */
export function blockBeendetUm(games: BlockSpiel[]): string | null {
  const echt = games.filter((g) => !g.fun);
  if (echt.length === 0) return null;
  let spaetestes = 0;
  for (const g of echt) {
    if (!g.matchId || !g.playedIso) return null;
    const t = new Date(g.playedIso).getTime();
    if (!Number.isFinite(t)) return null;
    spaetestes = Math.max(spaetestes, t);
  }
  return new Date(spaetestes).toISOString();
}
