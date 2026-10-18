// Elo-Wertung für Teams und Spieler. Alle Werte sind ganze Zahlen.

export const ELO_START = 1000;
export const ELO_K = 32;
export const ELO_MIN_GAMES_FOR_RANKING = 3; // darunter taucht niemand in der Rangliste auf

/** Startwert eines Teams aus der Selbsteinschätzung 1 bis 5: 800, 900, 1000, 1100, 1200. */
export function initialTeamElo(strength: number): number {
  const s = Math.min(5, Math.max(1, Math.round(strength)));
  return 700 + s * 100;
}

/** Erwarteter Punktwert (0 bis 1) von A gegen B. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** 1 Sieg, 0,5 Remis, 0 Niederlage. */
export function actualScore(goalsFor: number, goalsAgainst: number): number {
  return goalsFor > goalsAgainst ? 1 : goalsFor === goalsAgainst ? 0.5 : 0;
}

/** Höhere Siege zählen etwas mehr, aber gedeckelt (Tordifferenz 1 gleich 1,0; 3 gleich 2,1; ab 5 gleich 2,5). */
export function marginMultiplier(goalDiff: number): number {
  const gd = Math.abs(goalDiff);
  if (gd <= 1) return 1;
  return Math.min(1 + Math.log(gd), 2.5);
}

/** Änderung für A. Für B gilt das Gegenteil, die Summe ist null. */
export function eloDelta(ratingA: number, ratingB: number, goalsA: number, goalsB: number, k = ELO_K): number {
  const change = k * marginMultiplier(goalsA - goalsB) * (actualScore(goalsA, goalsB) - expectedScore(ratingA, ratingB));
  return Math.round(change);
}

/** Spieler-Elo: gegen den Durchschnitt der Gegner, ohne Nullsummen-Zwang (Neulinge treffen auf Etablierte). */
export function playerDelta(playerRating: number, opponentAverage: number, goalsFor: number, goalsAgainst: number, k = ELO_K): number {
  return eloDelta(playerRating, opponentAverage, goalsFor, goalsAgainst, k);
}

export function average(values: number[], fallback = ELO_START): number {
  return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : fallback;
}
