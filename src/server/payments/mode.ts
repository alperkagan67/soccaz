import { getSetting } from "../settings";

/**
 * Schalter für das Kartenmodell (Vertrag 012, M1). Einstellung `card_payments_enabled`, Standard AUS.
 * AUS = bisheriges Guthaben-Verhalten, EIN = Karte hinterlegen statt Guthaben. Oberfläche und Server lesen denselben Schlüssel.
 */
export const CARD_PAYMENTS_KEY = "card_payments_enabled";

export async function isCardPaymentsEnabled(): Promise<boolean> {
  return (await getSetting<boolean>(CARD_PAYMENTS_KEY, false)) === true;
}

/** Ist der Testpfad "Testkarte hinterlegen" in dieser Umgebung sichtbar? Nur mit PAYMENTS_FAKE=1 außerhalb von Produktion (die Server-Aktion prüft zusätzlich selbst). */
export function fakeCardAllowed(): boolean {
  return process.env.PAYMENTS_FAKE === "1" && process.env.NODE_ENV !== "production";
}
