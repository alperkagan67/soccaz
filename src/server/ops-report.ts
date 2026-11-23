import { errorCodeOf } from "@/lib/ops-errors";
import { audit } from "./audit";

/**
 * Der Ops-Zugang (zweiter Pool, G25-009 B) ist nicht nutzbar (nicht erreichbar, Anmeldung abgelehnt, Verbindungslimit, kein EXECUTE nach dem Rechtewechsel): nie still verschlucken. Log OHNE Datenbankmeldung und ohne
 * Personendaten (nur Stelle und Fehlercode) und ein Audit-Eintrag (evidence.ops_unavailable, ohne Akteur) ueber den Hauptpool, damit der Betreiber es sieht. Best effort: ein Fehler hier aendert nichts.
 */
export async function reportOpsFailure(where: string, error: unknown): Promise<void> {
  const code = errorCodeOf(error) ?? "Fehler";
  console.error(`${where}: Ops-Zugang nicht nutzbar (${code})`);
  try {
    await audit(null, "evidence.ops_unavailable", "setting", "evidence_ops", { after: { where, code } });
  } catch {
    // das Protokoll ist best effort
  }
}
