/**
 * Nachzahlfenster nach einer fehlgeschlagenen Abbuchung (Vertrag 012, AC-6): min(2 Stunden ab dem Fehler, Anstoß minus 1 Stunde).
 * Bleibt bis zum Anstoß höchstens 1 Stunde, gibt es kein Fenster (null): dann geht es direkt zum Nachrücker oder zur Absage.
 */
export const GRACE_MS = 2 * 3_600_000;
export const GRACE_MIN_REMAINING_MS = 3_600_000;

export function graceUntil(now: Date, startsAt: Date): Date | null {
  const remaining = startsAt.getTime() - now.getTime();
  if (remaining <= GRACE_MIN_REMAINING_MS) return null;
  return new Date(Math.min(now.getTime() + GRACE_MS, startsAt.getTime() - GRACE_MIN_REMAINING_MS));
}
