// Monatsrechnung an die Halle (Vertrag 009 M2): reine Funktionen. Die steuerliche Behandlung (Satz, Hinweistext, Rundung) legt der Steuerberater fest (Entscheid E4);
// hier stehen nur die technischen Parameter. Der Umsatzsteuer-Schalter hat KEINEN Standardwert (ohne gesetzten Schalter schlägt die Erzeugung fehl).

export type VatMode = "19" | "kleinunternehmer";

/** Der Schalter kommt als Text aus dem Formular oder aus der Einstellung (JSON: "19" kann als Zahl 19 zurückkommen). */
export function parseVatMode(value: unknown): VatMode | null {
  if (value === 19 || value === "19") return "19";
  return value === "kleinunternehmer" ? value : null;
}

/** Umsatzsteuersatz in Prozent je Schalter. */
export function vatPercentOf(mode: VatMode): number {
  return mode === "19" ? 19 : 0;
}

/**
 * Umsatzsteuer EINMAL auf die Nettosumme der Rechnung (nicht je Zeile), auf ganze Cent gerundet. Rundung als Parameter: "half-up" (kaufmännisch, Standard) oder "down".
 * Ganzzahlig gerechnet. Die Regel selbst ist Sache des Steuerberaters (Frage S2) und nur hier änderbar.
 */
export function vatCentsOf(netCents: number, mode: VatMode, rounding: "half-up" | "down" = "half-up"): number {
  if (!Number.isInteger(netCents) || netCents < 0) throw new Error(`Ungültiger Nettobetrag: ${netCents}`);
  const percent = vatPercentOf(mode);
  return rounding === "down" ? Math.floor((netCents * percent) / 100) : Math.floor((netCents * percent + 50) / 100);
}

/** Rechnungsnummer: RE-JJJJ-000001 (getrennt von den Beleg-Nummern SOC-JJJJ). Format mit dem Steuerberater abzustimmen (S2). */
export function invoiceNumber(year: number, n: number): string {
  return `RE-${year}-${String(n).padStart(6, "0")}`;
}

/** "2026-11" gültig? */
export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Der Vormonat zu einem Zeitpunkt als "JJJJ-MM" (UTC). */
export function previousPeriod(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
