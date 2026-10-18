export const CONFIRM_WINDOW_HOURS = 48;
export const REMINDER_AFTER_HOURS = 24;
export const MAX_SCORE = 99;

export type MatchPhase = "upcoming" | "live" | "pending" | "finished" | "disputed" | "cancelled";

/** Spielstand aus den Torereignissen. */
export function scoreFromGoals(goals: { teamId: string }[], homeTeamId: string, awayTeamId: string) {
  return {
    home: goals.filter((g) => g.teamId === homeTeamId).length,
    away: goals.filter((g) => g.teamId === awayTeamId).length,
  };
}

/** Spielminute aus Anstoß und aktueller Zeit, nie negativ und nach oben begrenzt. */
export function minuteAt(startsAt: Date, now: Date, durationMin: number): number {
  const m = Math.floor((now.getTime() - startsAt.getTime()) / 60_000) + 1;
  return Math.max(1, Math.min(m, durationMin + 30));
}

export function isValidScore(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_SCORE;
}

export function confirmDeadline(from: Date): Date {
  return new Date(from.getTime() + CONFIRM_WINDOW_HOURS * 3_600_000);
}

/** Phase eines Spiels für die Anzeige. */
export function phaseOf(input: {
  status: "lobby" | "confirmed" | "played" | "disputed" | "cancelled";
  startsAt: Date;
  hasPendingResult: boolean;
  now?: Date;
}): MatchPhase {
  const now = input.now ?? new Date();
  if (input.status === "cancelled") return "cancelled";
  if (input.status === "played") return "finished";
  if (input.status === "disputed") return "disputed";
  if (input.startsAt.getTime() > now.getTime()) return "upcoming";
  return input.hasPendingResult ? "pending" : "live";
}

export const PHASE_LABEL: Record<MatchPhase, string> = {
  upcoming: "Geplant",
  live: "Läuft",
  pending: "Ergebnis wartet auf Bestätigung",
  finished: "Beendet",
  disputed: "Ergebnis strittig",
  cancelled: "Abgesagt",
};
