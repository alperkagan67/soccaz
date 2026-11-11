/**
 * Der Schalter für das Kartenmodell liegt in src/server/settings.ts (cardPaymentsEnabled), die Entscheidung pro Spiel in src/server/wallet.ts (cardModeActive).
 * Hier nur der Testpfad: Ist "Testkarte hinterlegen" in dieser Umgebung sichtbar? Nur mit PAYMENTS_FAKE=1 außerhalb von Produktion
 * (die Server-Aktion prüft zusätzlich selbst).
 */
export function fakeCardAllowed(): boolean {
  return process.env.PAYMENTS_FAKE === "1" && process.env.NODE_ENV !== "production";
}
