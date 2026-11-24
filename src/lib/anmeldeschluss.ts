// Gratis-Turnier (Entscheid t2q 2026-11-24): Vorschlag fuer den Anmeldeschluss = 4 Tage vor dem Beginn (Berliner Ortszeit, Wert fuer <input type=datetime-local>). Reine Funktion (testbar).
export const ANMELDESCHLUSS_VORLAUF_TAGE = 4;

/** "YYYY-MM-DDTHH:mm" des Beginns minus 4 Tage; null bei ungueltigem Beginn oder wenn der Vorschlag vor `min` (fruehester waehlbarer Zeitpunkt, gleiche Form) laege. */
export function anmeldeschlussVorschlag(start: string, min: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(start);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d - ANMELDESCHLUSS_VORLAUF_TAGE)); // reine Kalenderrechnung (kein Zeitzonen- oder Sommerzeitsprung)
  const real = new Date(Date.UTC(y, mo - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== mo - 1 || real.getUTCDate() !== d || y < 1900 || h > 23 || mi > 59) return null; // kein Kalendertag (z. B. 31.11.)
  const p = (n: number) => String(n).padStart(2, "0");
  const value = `${day.getUTCFullYear()}-${p(day.getUTCMonth() + 1)}-${p(day.getUTCDate())}T${p(h)}:${p(mi)}`;
  return value >= min ? value : null;
}
