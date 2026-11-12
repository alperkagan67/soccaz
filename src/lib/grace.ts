/**
 * Nachzahlfenster nach einer fehlgeschlagenen Abbuchung (Vertrag 012, AC-6): min(2 Stunden ab dem Fehler, Anstoß minus 1 Stunde).
 * Bleibt bis zum Anstoß höchstens 1 Stunde, gibt es kein Fenster: dann ist das Ende der Fehlzeitpunkt selbst (sofort abgelaufen), und es geht direkt zum
 * Nachrücker oder zur Absage. `grace_until` ist deshalb nach jedem Kartenproblem GESETZT; NULL heißt "nie ein Kartenproblem" bzw. Altzeile (vor Migration 0039).
 * Alle Werte sind absolute Zeitpunkte (UTC-Instants); nur die Anzeige rechnet in Berliner Zeit.
 */
export const GRACE_MS = 2 * 3_600_000;
export const GRACE_MIN_REMAINING_MS = 3_600_000;

export function graceUntil(now: Date, startsAt: Date): Date {
  const remaining = startsAt.getTime() - now.getTime();
  if (remaining <= GRACE_MIN_REMAINING_MS) return new Date(now.getTime()); // kein Fenster: Ende = Fehlzeitpunkt
  return new Date(Math.min(now.getTime() + GRACE_MS, startsAt.getTime() - GRACE_MIN_REMAINING_MS));
}

/**
 * Das tatsächlich geltende Ende: nie später als Anstoß minus 1 Stunde, auch wenn der Termin nach dem Fehler vorverlegt wurde (Termin-/Hallenwechsel).
 * Bei JEDER Prüfung (Wiederabbuchen, Karte ändern, Job, Anzeige) verwenden, nie `grace_until` allein. null = Altzeile ohne Fenster.
 */
export function effectiveGraceEnd(graceUntilAt: Date | null, startsAt: Date): Date | null {
  if (graceUntilAt === null) return null;
  return new Date(Math.min(graceUntilAt.getTime(), startsAt.getTime() - GRACE_MIN_REMAINING_MS));
}

/** Läuft das Fenster noch? Altzeilen ohne Fenster (null) nie. */
export function inGraceWindow(graceUntilAt: Date | null, startsAt: Date, now: Date): boolean {
  const end = effectiveGraceEnd(graceUntilAt, startsAt);
  return end !== null && end.getTime() > now.getTime();
}

/** Kartenfehler, die ein Fenster, eine Benachrichtigung und das Wiederabbuchen bekommen. Alles andere sind technische Zustände (Admin/Klärung). */
export const NON_CARD_CODES: readonly string[] = ["unknown_outcome", "after_start", "idempotency_mismatch", "match_closed", "attempt_expired"];
export const isCardProblemCode = (code: string | null | undefined): boolean => !NON_CARD_CODES.includes(code ?? "");

/** "bis 21:30 Uhr" (Berliner Zeit), bei einem anderen Kalendertag mit Datum. */
export function graceText(until: Date, now: Date = new Date()): string {
  const tz = "Europe/Berlin";
  const time = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(until);
  const day = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: tz }).format(d);
  return day(until) === day(now) ? `bis ${time} Uhr` : `bis ${time} Uhr am ${day(until)}.`;
}
