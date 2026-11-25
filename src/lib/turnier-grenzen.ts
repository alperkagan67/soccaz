// Eine Quelle für Grenzen der Turnierplanung (Migration 0062 und Formular/Server): Puffer zwischen zwei Spielen in Minuten.
export const GAP_MIN_MINUTEN = 0;
export const GAP_MAX_MINUTEN = 30;
export const GAP_STANDARD_MINUTEN = 5;

// Neunmeter: Trefferzahl je Team (nur Anzeige, spiegelt den CHECK tournament_matches_shootout_count in Migration 0062).
export const NEUNMETER_MAX_TREFFER = 50;

// Mitteilung an den Veranstalter, wenn ein K.-o.-Spiel unentschieden endet (EINE Quelle, Wortscan in tests/unit/tiebreak-texte.test.ts).
export const TIEBREAK_TITEL = "Golden Goal oder Neunmeter eintragen";
export const tiebreakText = (turnierName: string) => `${turnierName}: Ein Spiel endete unentschieden. Bitte trage ein, wer das Golden Goal oder die Neunmeter gewonnen hat.`;
