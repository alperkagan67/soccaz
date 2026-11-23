// Wertung (0 bis 99) und Stufe einer Spielerkarte aus der Elo (Vertrag 013 v3, AC-18).
// Reine Anzeigefunktionen: deterministisch, ganzzahlig, monoton, ohne Datenbank. EINZIGE QUELLE der Schwellen:
// alle Zahlen stehen hier; DESIGN.md zieht beim Umbau auf Richtung F nach. Die Zahlen sind VORLÄUFIG und werden
// nach dem Pilot an echten Elo-Daten geprüft (Konstanten ändern, Testtabelle anpassen).
//
// Begründung der Steilheit (Simulation, keine Echtdaten; Annahmen: 400 Spieler, 5 gegen 5, wahre Stärke mit
// Streuung 100 bzw. 150 Elo, 60 Spiele je Spieler): Die Spieler-Elo ändert sich je Spiel um
// round(ELO_K * Marge * (Ergebnis - erwartet)) (src/lib/elo.ts). Ein Neuling (1000) gegen Gleichstarke hat nach
// 3 Siegen mit 1 Tor Differenz etwa 1045. In der Simulation lag der Median bei ~1005, das 75. Perzentil bei
// ~1060, das 90. bei ~1105 bis 1130, das 98. bei ~1185 und das Maximum bei ~1270.
// Bei 8 Elo je Punkt ergeben sich (wegen der Rundung beginnt Wertung 55 schon bei Elo 1036: 50 + 36/8 = 54,5):
// Rasen ab Elo 1036 (nach ca. 3 Siegen), Flutlicht ab 1156 (obere Gruppe), Pokal ab 1236 (Spitzengruppe),
// Legende ab 1316 (nur nach langer Dominanz). Maßgeblich sind die Wertungsgrenzen 0/55/70/80/90. 10 oder 20 Elo je Punkt wären
// in der Simulation für Pokal und Legende unerreichbar.

import { ELO_START } from "./elo";

/** Elo je Wertungspunkt. */
export const ELO_PER_POINT = 8;
/** Wertung eines Neulings (Elo = ELO_START). */
export const START_RATING = 50;
export const MIN_RATING = 0;
export const MAX_RATING = 99;

export type Tier = "kreide" | "rasen" | "flutlicht" | "pokal" | "legende";

/** Stufen aufsteigend; `from` ist die kleinste Wertung der Stufe. Die erste Stufe beginnt bei MIN_RATING. */
export const RATING_TIERS: readonly { tier: Tier; label: string; from: number }[] = [
  { tier: "kreide", label: "Kreide", from: 0 },
  { tier: "rasen", label: "Rasen", from: 55 },
  { tier: "flutlicht", label: "Flutlicht", from: 70 },
  { tier: "pokal", label: "Pokal", from: 80 },
  { tier: "legende", label: "Legende", from: 90 },
];

export const TIER_LABELS: Record<Tier, string> = Object.fromEntries(RATING_TIERS.map((t) => [t.tier, t.label])) as Record<Tier, string>;

/** Elo -> Wertung 0 bis 99 (ganzzahlig, monoton). NaN ergibt 0, +/-Infinity die Grenzen. */
export function ratingFromElo(elo: number): number {
  if (Number.isNaN(elo)) return MIN_RATING;
  const r = Math.round(START_RATING + (elo - ELO_START) / ELO_PER_POINT);
  return Math.min(MAX_RATING, Math.max(MIN_RATING, r));
}

/** Wertung -> Stufe. */
export function tierFromRating(rating: number): Tier {
  let tier: Tier = RATING_TIERS[0].tier;
  for (const t of RATING_TIERS) if (rating >= t.from) tier = t.tier;
  return tier;
}

export function tierFromElo(elo: number): Tier {
  return tierFromRating(ratingFromElo(elo));
}

/** Rang der Stufe (0 = Kreide). */
export function tierRank(tier: Tier): number {
  return RATING_TIERS.findIndex((t) => t.tier === tier);
}

/**
 * Aufstiegs-Feier nur bei einem NEUEN Höchststand: `prevMaxTier` ist die höchste bisher gezeigte Stufe
 * (Merker im Browser; fehlt er, gilt Kreide als Start, ohne Feier). Folge, laut Vertrag so gewollt: Auf einem neuen
 * Gerät oder nach gelöschtem Speicher gibt es EINMAL eine Feier für die bereits erreichte Stufe (ab Rasen). Abstieg oder gleiche Stufe feiert nie,
 * ein Hin und Her an der Grenze löst also nicht mehrfach aus.
 */
export function shouldCelebrate(prevMaxTier: Tier | null | undefined, newTier: Tier): boolean {
  return tierRank(newTier) > tierRank(prevMaxTier ?? RATING_TIERS[0].tier);
}

/** Neuer Merker: die höchste Stufe aus bisher und aktuell. */
export function nextMaxTier(prevMaxTier: Tier | null | undefined, newTier: Tier): Tier {
  return shouldCelebrate(prevMaxTier, newTier) ? newTier : (prevMaxTier ?? RATING_TIERS[0].tier);
}
