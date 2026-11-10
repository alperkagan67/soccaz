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

// ---------------------------------------------------------------------------------------------
// Frist-Regel für Privat- und Teamspiele (Verträge 006/008 v3): eine Frist 48 Stunden vor Anstoß, bei kurzem Vorlauf nur der 1-h-Abbruch
// ---------------------------------------------------------------------------------------------

export const FIX_DEADLINE_HOURS = 48; // einzige Frist: Lobby schließt, dann wird gebucht oder abgesagt
export const ABORT_BEFORE_START_HOURS = 1; // einziger Abbruchzeitpunkt bei Anlage unter 48 Stunden Vorlauf

/** Hatte das Spiel bei der Anlage mindestens 48 Stunden Vorlauf? Dann gilt die 48-h-Frist, sonst Sofortbuchung und 1-h-Abbruch. */
export function hasLongLead(startsAt: Date, createdAt: Date): boolean {
  return startsAt.getTime() - createdAt.getTime() >= FIX_DEADLINE_HOURS * 3_600_000;
}

/** Zeitpunkt der 48-h-Frist: Anstoß minus 48 Stunden. */
export function fixDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - FIX_DEADLINE_HOURS * 3_600_000);
}

/** Zeitpunkt des 1-h-Abbruchs: Anstoß minus 1 Stunde. */
export function abortDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - ABORT_BEFORE_START_HOURS * 3_600_000);
}

/** Ist der Beitritt geschlossen? Mit langem Vorlauf ab der 48-h-Frist; mit kurzem Vorlauf nie (offen bis zur Buchung oder zum Abbruch). */
export function joinClosedByTime(startsAt: Date, createdAt: Date, now: Date): boolean {
  return hasLongLead(startsAt, createdAt) && now.getTime() >= fixDeadline(startsAt).getTime();
}

/** Sind Austritt und Rauswurf gesperrt? Ab 48 Stunden vor Anstoß; bei Anlage unter 48 Stunden gilt das von Anfang an. */
export function leaveClosedByTime(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() < FIX_DEADLINE_HOURS * 3_600_000;
}
