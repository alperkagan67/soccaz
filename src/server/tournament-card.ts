// Turnier auf Karte (Vertrag 012, M5): Kartenmodus. Hier steht (ab M5-1) nur die Frage "Gilt fuer dieses Turnier das Kartenmodell?"; Kartenstatus, "Bereit" und "Anteil uebernehmen" kommen mit M5-3.
import { and, eq, gt } from "drizzle-orm";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { cardPaymentsEnabled } from "./settings";
import type { Tx } from "./tx";

/**
 * Gilt fuer dieses Turnier das Kartenmodell? Nur bei eingeschaltetem Schalter; liegt schon Geld im Turnier (ein Spieler mit paid_cents > 0 aus dem Guthabenmodell),
 * bleibt das Turnier im Guthabenmodell, bis es abgesagt oder beendet ist (kein Mischzustand; Altturniere werden zurueckgesetzt, Plan T-18). Unter der Turniersperre des Aufrufers lesen.
 */
export async function tournamentCardMode(tx: Pick<Tx, "select">, tournamentId: string): Promise<boolean> {
  if (!(await cardPaymentsEnabled(tx as Tx))) return false;
  // Kostenlose Turniere (Hallenkosten 0 bzw. Anteil 0) haben nichts abzubuchen: sie laufen wie bisher (Bereit ohne Karte, Bracket sofort), sonst haengen sie im Kartenmodell fest (Security-Review M5-3).
  const [t] = await tx.select({ totalCents: tournaments.totalCents, finalShareCents: tournaments.finalShareCents, entryFeeCents: tournaments.entryFeeCents }).from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t || t.totalCents === 0 || t.finalShareCents === 0 || (t.totalCents === null && t.entryFeeCents === 0)) return false;
  const [paid] = await tx.select({ userId: tournamentPlayers.userId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), gt(tournamentPlayers.paidCents, 0))).limit(1);
  return !paid;
}
