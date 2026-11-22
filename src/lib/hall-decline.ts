// 011 M2b: Ablehnung einer Hallenanfrage. Grund aus einer Auswahlliste (Pflicht), Anmerkung optional (3 bis 200 Zeichen), bei „sonstiges“ Pflicht (Entscheid t2q, P2/P12).
// Reine Funktionen ohne Datenbank: die Eingabeprüfung der Oberfläche (erste Stufe). Die maßgebliche Prüfung machen später der Server und die Datenbank (Plan 011 M2, 3.3).

export const DECLINE_CODES = ["belegt", "wartung", "veranstaltung", "sonstiges"] as const;
export type DeclineCode = (typeof DECLINE_CODES)[number];

/** Beschriftungen für Betreiber, in einfachen Wörtern. */
export const DECLINE_LABELS: Record<DeclineCode, string> = {
  belegt: "Belegt",
  wartung: "Geschlossen oder Wartung",
  veranstaltung: "Veranstaltung",
  sonstiges: "Sonstiges",
};

export const DECLINE_TEXT_MIN = 3;
export const DECLINE_TEXT_MAX = 200;

export const DECLINE_MESSAGES = {
  codeMissing: "Bitte wähle einen Grund.",
  textRequired: "Bitte beschreibe den Grund in 3 bis 200 Zeichen.",
  textLength: "Die Anmerkung braucht 3 bis 200 Zeichen oder bleibt leer.",
} as const;

export const isDeclineCode = (value: unknown): value is DeclineCode => typeof value === "string" && (DECLINE_CODES as readonly string[]).includes(value);

/** Leerraum zusammenfassen und trimmen (die Datenbank bereinigt zusätzlich und ist maßgeblich). */
export function tidyDeclineText(input: string | null | undefined): string {
  return (input ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export type DeclineCheck = { ok: true; code: DeclineCode; text: string } | { ok: false; fieldErrors: Record<string, string> };

/** Feldnamen: `reasonCode` (Grund) und `reason` (Anmerkung), wie im Formular. */
export function validateDecline(input: { code?: string | null; text?: string | null }): DeclineCheck {
  const fieldErrors: Record<string, string> = {};
  const code = input.code ?? "";
  const text = tidyDeclineText(input.text);
  const length = Array.from(text).length;
  if (!isDeclineCode(code)) fieldErrors.reasonCode = DECLINE_MESSAGES.codeMissing;
  if (code === "sonstiges") {
    if (length < DECLINE_TEXT_MIN || length > DECLINE_TEXT_MAX) fieldErrors.reason = DECLINE_MESSAGES.textRequired;
  } else if (length > 0 && (length < DECLINE_TEXT_MIN || length > DECLINE_TEXT_MAX)) {
    fieldErrors.reason = DECLINE_MESSAGES.textLength;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, code: code as DeclineCode, text };
}
