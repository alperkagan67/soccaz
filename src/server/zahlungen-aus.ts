// Modus "Zahlungen AUS": EIN Schalter, eine Antwort (Go-live-Paket, Entscheid t2q 2026-11-24). "Zahlungen AUS" heißt: der Schalter payments_enabled ist AUS (Standard); dann bucht kein Pfad ab
// (tournamentPaymentsActive und die Kartenpfade sind ohnehin an den Schalter gebunden), und die Oberfläche zeigt keine Zahlungsinformation, sondern ZAHLUNGEN_AUS_HINWEIS (src/lib/zahlungen-aus.ts).
// Nur Anzeige: KEINE Zahlungslogik hängt an dieser Funktion.
import { db } from "@/db";
import { paymentsEnabled } from "./settings";

/** true, wenn Zahlungen AUS sind (payments_enabled nicht gesetzt oder false): Seiten zeigen dann keine Zahlungstexte. */
export async function zahlungenAus(exec: Pick<typeof db, "select"> = db): Promise<boolean> {
  return !(await paymentsEnabled(exec));
}
