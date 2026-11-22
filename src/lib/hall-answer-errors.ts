// 011 M2: Fehler einer Hallen-Antwort in neutrale Texte übersetzen (Plan 011 M2, 12.4). Reine Funktionen.
// Datenbankfehlercodes der Beweisprotokoll-Trigger (Nachlieferung 009 M3, Migration 0054): EV001 Antwortfrist abgelaufen, EV002 Begründung ungültig,
// EV003 Antwortfrist des Spiels fehlt, EV004 kein Hallenzugang für den Antwortversuch.

export const HALL_TEXTS = {
  late: "Die Antwortfrist ist abgelaufen. Die Anfrage gilt als nicht beantwortet.",
  stale: "Diese Anfrage hat sich geändert, zum Beispiel durch einen neuen Termin. Bitte lade die Seite neu.",
  alreadyAnswered: "Diese Anfrage ist schon beantwortet.",
  noAccess: "Für diese Halle ist dein Zugang nicht mehr gültig.",
  technical: "Das hat nicht geklappt. Bitte versuche es noch einmal.",
} as const;

export type HallFailureKind = "late" | "form" | "no-access" | "technical";
export type HallFailure = { kind: HallFailureKind; text: string };

/** pg-Fehlercode, auch wenn der Treiber (drizzle) den Fehler als `cause` einpackt. */
export function pgCodeOf(error: unknown): string | null {
  let e: unknown = error;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Datenbankfehler → Text. EV001 = zu spät; EV002 = Eingabe (die App prüft vorher, darum nur als Sicherheitsnetz, dann technisch formuliert, nie mit Freitext);
 * EV004 = kein Zugang; alles andere (EV003, unbekannt) = technisch. Nie die Meldung der Datenbank durchreichen (kann Freitext enthalten).
 */
export function describeHallDbFailure(error: unknown): HallFailure {
  switch (pgCodeOf(error)) {
    case "EV001":
      return { kind: "late", text: HALL_TEXTS.late };
    case "EV004":
      return { kind: "no-access", text: HALL_TEXTS.noAccess };
    case "EV002":
      return { kind: "form", text: HALL_TEXTS.technical };
    default:
      return { kind: "technical", text: HALL_TEXTS.technical };
  }
}
