/**
 * Klartext zum Grund einer fehlgeschlagenen Abbuchung (Vertrag 012, AC-6). Nur für den Betroffenen und den Captain/Veranstalter bestimmt
 * (siehe card-visibility.ts); Dritte bekommen nie einen Grund. Unbekannte Codes ergeben den allgemeinen Text, nie den Rohcode.
 */
const TEXTS: Record<string, string> = {
  card_declined: "Die Bank hat die Karte abgelehnt.",
  generic_decline: "Die Bank hat die Karte abgelehnt.",
  insufficient_funds: "Auf der Karte ist nicht genug Guthaben.",
  expired_card: "Die Karte ist abgelaufen.",
  incorrect_cvc: "Die Prüfnummer der Karte war falsch.",
  lost_card: "Die Karte wurde gesperrt.",
  stolen_card: "Die Karte wurde gesperrt.",
  authentication_required: "Die Bank braucht eine Bestätigung der Zahlung.",
  processing_error: "Bei der Zahlung ist ein Fehler aufgetreten.",
};

const GENERIC = "Die Abbuchung von der Karte hat nicht geklappt.";

export function chargeFailureText(code: string | null | undefined): string {
  return (code && TEXTS[code]) || GENERIC;
}

/** Braucht die Zahlung nur eine Bestätigung der Bank (3-D-Secure) statt einer anderen Karte? */
export function needsBankConfirmation(code: string | null | undefined): boolean {
  return code === "authentication_required";
}
