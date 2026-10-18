export const LOBBY_MIN_LEAD_HOURS = 24; // spätestens 24 Stunden vor Anstoß müssen genug Spieler bereit sein
export const LOBBY_MIN_GRACE_HOURS = 12; // mindestens so lange bekommt eine neue Lobby Zeit

/** Frist, bis die Lobby bestätigt sein muss: der spätere Zeitpunkt aus "Annahme plus 12 Stunden" und "Anstoß minus 24 Stunden". */
export function lobbyDeadline(startsAt: Date, createdAt: Date): Date {
  const byStart = startsAt.getTime() - LOBBY_MIN_LEAD_HOURS * 3_600_000;
  const byGrace = createdAt.getTime() + LOBBY_MIN_GRACE_HOURS * 3_600_000;
  return new Date(Math.max(byStart, byGrace));
}

export type ReminderKind = "24h" | "2h" | "30m";

const REMINDER_MS: Record<ReminderKind, number> = { "24h": 24 * 3_600_000, "2h": 2 * 3_600_000, "30m": 30 * 60_000 };

/** Welche Erinnerungen sind jetzt fällig? Von der dringendsten zur ältesten sortiert. */
export function dueReminders(startsAt: Date, now: Date): ReminderKind[] {
  const left = startsAt.getTime() - now.getTime();
  if (left <= 0) return [];
  return (["30m", "2h", "24h"] as ReminderKind[]).filter((k) => left <= REMINDER_MS[k]);
}

export const REMINDER_TEXT: Record<ReminderKind, string> = {
  "24h": "Anstoß morgen",
  "2h": "Anstoß in zwei Stunden",
  "30m": "Gleich geht es los",
};
