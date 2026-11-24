// EINE Quelle fuer "Gratis-Turnier" (Entscheide t2q 2026-11-24, R-T430): Hallenkosten 0 ODER festgeschriebener Anteil 0. Die Turnierseite (Textschalter) und der Server (Frist-Job, Bereit, Schliessen, Erinnerungen) nutzen dieselbe Regel.
// Ein Turnier ohne Preisangabe (null) gilt NICHT als gratis (Altturniere).

export type GratisFacts = { totalCents: number | null; finalShareCents: number | null };

export const istGratis = (t: GratisFacts): boolean => t.totalCents === 0 || t.finalShareCents === 0;

/** Dieselbe Regel als SQL-Bedingung (Spaltennamen der Tabelle tournaments), fuer Kandidatenabfragen. */
export const GRATIS_SQL = "(coalesce(total_cents, -1) = 0 or coalesce(final_share_cents, -1) = 0)";
