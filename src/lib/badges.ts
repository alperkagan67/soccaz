// Abzeichen. Die Regeln sind reine Funktionen auf Zahlen, damit sie sich leicht testen lassen.

export type BadgeCode =
  | "debut"
  | "first_goal"
  | "matches_10"
  | "matches_25"
  | "matches_50"
  | "goals_10"
  | "goals_25"
  | "hattrick"
  | "fairplay_10"
  | "wins_5"
  | "win_streak_3"
  | "mvp_1"
  | "mvp_5";

export const BADGES: Record<BadgeCode, { name: string; description: string }> = {
  debut: { name: "Debüt", description: "Das erste Spiel auf Socaz bestritten." },
  first_goal: { name: "Erstes Tor", description: "Das erste Tor erzielt." },
  matches_10: { name: "10 Spiele", description: "Zehn Spiele bestritten." },
  matches_25: { name: "25 Spiele", description: "25 Spiele bestritten." },
  matches_50: { name: "50 Spiele", description: "50 Spiele bestritten." },
  goals_10: { name: "10 Tore", description: "Zehn Tore insgesamt." },
  goals_25: { name: "25 Tore", description: "25 Tore insgesamt." },
  hattrick: { name: "Hattrick", description: "Drei Tore in einem Spiel." },
  fairplay_10: { name: "Fairplay", description: "Zehn Spiele hintereinander ohne Karte." },
  wins_5: { name: "5 Siege", description: "Fünf Spiele gewonnen." },
  win_streak_3: { name: "Siegesserie", description: "Drei Siege in Folge." },
  mvp_1: { name: "Spieler des Spiels", description: "Zum ersten Mal zum Spieler des Spiels gewählt." },
  mvp_5: { name: "MVP-Held", description: "Fünfmal Spieler des Spiels." },
};

export type PlayerSnapshot = {
  matches: number;
  wins: number;
  goals: number;
  cleanStreak: number;
  winStreak: number;
  mvps: number;
  goalsInThisMatch: number;
};

/** Welche Abzeichen verdient dieser Spielstand? (Vergeben wird nur, was noch nicht vergeben ist.) */
export function earnedBadges(s: PlayerSnapshot): BadgeCode[] {
  const out: BadgeCode[] = [];
  if (s.matches >= 1) out.push("debut");
  if (s.goals >= 1) out.push("first_goal");
  if (s.matches >= 10) out.push("matches_10");
  if (s.matches >= 25) out.push("matches_25");
  if (s.matches >= 50) out.push("matches_50");
  if (s.goals >= 10) out.push("goals_10");
  if (s.goals >= 25) out.push("goals_25");
  if (s.goalsInThisMatch >= 3) out.push("hattrick");
  if (s.cleanStreak >= 10) out.push("fairplay_10");
  if (s.wins >= 5) out.push("wins_5");
  if (s.winStreak >= 3) out.push("win_streak_3");
  if (s.mvps >= 1) out.push("mvp_1");
  if (s.mvps >= 5) out.push("mvp_5");
  return out;
}

/** Zuverlässigkeit in Prozent, erst ab 3 Spielen aussagekräftig (sonst null). */
export function reliabilityPercent(r: { attended: number; noShows: number; lateCancels: number }): number | null {
  const total = r.attended + r.noShows + r.lateCancels;
  if (total < 3) return null;
  return Math.round((r.attended / total) * 100);
}
