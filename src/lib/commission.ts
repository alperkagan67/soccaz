// Provision je Halle (Vertrag 009 M2, Entscheide t9): reine Funktionen, Cent-genau, ohne Datenbank.

/** Der Satz in Prozent: Zahl von 0 bis 100 mit höchstens zwei Nachkommastellen; sonst null. Akzeptiert Zahl oder Text (Komma oder Punkt). */
export function parseCommissionPercent(input: unknown): number | null {
  const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim().replace(",", ".") : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return value >= 0 && value <= 100 ? value : null;
}

/** Satz in Hundertstel Prozent (ganzzahlig, damit keine Gleitkommafehler entstehen). */
const hundredths = (percent: number) => Math.round(percent * 100);

/**
 * Provision auf die Bemessungsgrundlage (Hallenmiete des Spiels, Cent): p % abgerundet, also nie mehr als vereinbart.
 * Ganzzahlig gerechnet: floor(Basis × Satz in Hundertstel / 10000).
 */
export function commissionCents(baseCents: number, percent: number): number {
  if (!Number.isInteger(baseCents) || baseCents < 0) throw new Error(`Ungültige Bemessungsgrundlage: ${baseCents}`);
  return Math.floor((baseCents * hundredths(percent)) / 10_000);
}

/** Der Satz aus der Datenbank (numeric als Text, z. B. "10.00") als Zahl. */
export function percentFromDb(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/** Anzahl der Spiele je Bonus (Vertrag 009: nach je 10 gebuchten, nicht abgesagten Spielen). */
export const BONUS_EVERY = 10;

/** Nummer des Bonus, den das gerade gezählte Spiel auslöst (1, 2, …), oder 0, wenn es keinen auslöst. `counted` = Anzahl gezählter Spiele einschließlich dieses. */
export function bonusNumber(counted: number): number {
  return counted > 0 && counted % BONUS_EVERY === 0 ? counted / BONUS_EVERY : 0;
}

/** Fortschritt zum nächsten Bonus für die Anzeige („10er-Bonus fällig“). */
export function bonusProgress(counted: number): { counted: number; completedBonuses: number; untilNext: number } {
  return { counted, completedBonuses: Math.floor(counted / BONUS_EVERY), untilNext: BONUS_EVERY - (counted % BONUS_EVERY) };
}
