// 011 M2: Antwortfrist einer Hallenanfrage (Plan 011 M2, 3.2; Entscheid t2q P9): min(12 Stunden, Vorlauf minus 1 Stunde), nie nach dem Anstoß.
// Reine Funktion. Die Anbindung in startHallCheck (und das Verhalten bei Vorlauf unter 1 Stunde, P11) folgt mit M2a-2 nach der Nachlieferung 009 M3.

export const HALL_REPLY_MAX_MS = 12 * 3_600_000;
export const HALL_REPLY_BEFORE_START_MS = 3_600_000;

/**
 * Frist = früher von (jetzt + 12 h) und (Anstoß − 1 h). `null` = es gibt kein Antwortfenster: der Anstoß liegt weniger als 1 Stunde voraus
 * (Hallen mit Zugang bekommen dann keine Anfrage, P11). Die Frist liegt nie nach dem Anstoß.
 */
export function hallReplyDeadline(startsAt: Date, now: Date): Date | null {
  const latest = startsAt.getTime() - HALL_REPLY_BEFORE_START_MS;
  if (latest <= now.getTime()) return null;
  return new Date(Math.min(now.getTime() + HALL_REPLY_MAX_MS, latest));
}
