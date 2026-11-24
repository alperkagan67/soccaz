import { initialsOf } from "./guest-roster";

// AC-17 (Entscheid t2q 2026-11-24, R-T382): Die Spielbericht-Karte (Bild unter /api/karte/<id> und og:image der Spielseite) ist ein öffentliches Artefakt ohne Betrachter: Torschützen stehen IMMER als Initialen darauf, nie mit Namen.
export type CardGoal = { name: string | null; minute: number | null };

/** Zeile der Torschützen auf der Karte: höchstens sechs, nach Minute, "ZV 5'" (Initialen und Minute). */
export function scorerLine(goals: readonly CardGoal[]): string {
  return goals
    .filter((g): g is { name: string; minute: number | null } => Boolean(g.name))
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0))
    .slice(0, 6)
    .map((g) => `${initialsOf(g.name)} ${g.minute}'`)
    .join("  ·  ");
}
