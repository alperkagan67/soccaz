// Eine Quelle für Grenzen der Turnierplanung (Migration 0062 und Formular/Server): Puffer zwischen zwei Spielen in Minuten.
export const GAP_MIN_MINUTEN = 0;
export const GAP_MAX_MINUTEN = 30;
export const GAP_STANDARD_MINUTEN = 5;
/** Dauer des Golden Goals im K.-o.-Gleichstand; es läuft im Puffer, also gibt es es nur bei einem Puffer von mindestens so vielen Minuten. */
export const GOLDEN_GOAL_MINUTEN = 2;

/** Hinweistext zum Gleichstand im K.-o.-Spiel, abhängig vom Puffer (eine Quelle für Formular und Turnierseite). */
export function tieBreakHinweis(gapMinutes: number): string {
  return gapMinutes >= GOLDEN_GOAL_MINUTEN
    ? `Bei Gleichstand im K.-o. läuft im Puffer das Golden Goal (${GOLDEN_GOAL_MINUTEN} Minuten), danach Neunmeter.`
    : `Mit weniger als ${GOLDEN_GOAL_MINUTEN} Minuten Puffer gibt es kein Golden Goal: bei Gleichstand geht es gleich in die Neunmeter.`;
}
