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

/** Turnier-Ablehnen (Backlog 161, Entscheid t2q 2026-11-24): die Entscheidung der Halle je Anfrage ist endgueltig. ENTWURF, keine Rechtsaussage. */
export const HALL_DECLINE_FINAL_NOTE = "Die Ablehnung ist endgültig.";
export const HALL_DECLINE_NEXT = "Bitte den Veranstalter, die Halle erneut zu wählen.";
export const HALL_DECLINE_FINAL = `${HALL_DECLINE_FINAL_NOTE} ${HALL_DECLINE_NEXT}`;

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

/**
 * Feature-Weiche (R-T238): Wäre die Anbindung an den Server nicht da (Begründung speichern, Runde, Fristgrenze: Plan 011 M2, M2a-2), dürfte die Oberfläche **nicht ablehnen**: eine Ablehnung mit Pflichtfeld, die still ohne Speichern läuft, wäre eine Ablehnung ohne Beweis-Grund. Mit der Anbindung (M2a-2, Nachlieferung 009 M3 auf main) steht die Weiche auf true.
 */
export const HALL_DECLINE_WIRED = true;
export const DECLINE_NOT_WIRED_MESSAGE = "Ablehnen mit Grund folgt. Bitte versuche es später noch einmal.";

export type DeclinePlan =
  | { kind: "invalid"; fieldErrors: Record<string, string> }
  | { kind: "not-wired"; error: string }
  | { kind: "go"; code: DeclineCode; text: string };

/** Entscheidet, was die Aktion tut: Eingabe prüfen, dann (nur mit Anbindung) ablehnen. Reine Funktion, damit „ohne Anbindung ändert nichts“ testbar ist. */
export function planDecline(input: { code?: string | null; text?: string | null }, wired: boolean = HALL_DECLINE_WIRED): DeclinePlan {
  const check = validateDecline(input);
  if (!check.ok) return { kind: "invalid", fieldErrors: check.fieldErrors };
  if (!wired) return { kind: "not-wired", error: DECLINE_NOT_WIRED_MESSAGE };
  return { kind: "go", code: check.code, text: check.text };
}
