// 011 M2b: Anzeige der Antwortfrist einer Hallenanfrage (reine Funktionen). Die Frist ist die GESPEICHERTE Frist der Anfrage (matches.vetoTurnDeadline), hier wird nichts neu berechnet.
// Restzeit wird nur beim Laden der Seite gerechnet (Entscheid t2q, U5): kein sich selbst aktualisierender Text.

export type ReplyState = "open" | "soon" | "expired" | "none";
export type ReplyWindow = { state: ReplyState; remainingText: string | null };

const MINUTE = 60_000;
const HOUR = 3_600_000;

/** „3 Std. 20 Min.“, „45 Min.“, „weniger als 1 Min.“ (aufgerundet auf volle Minuten ab 1 Minute). */
export function formatRemaining(ms: number): string {
  if (ms < MINUTE) return "weniger als 1 Min.";
  const totalMinutes = Math.floor(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} Min.`;
  return minutes === 0 ? `${hours} Std.` : `${hours} Std. ${minutes} Min.`;
}

/**
 * none = keine Frist gespeichert; expired = Frist **strikt überschritten** (die Karte zeigt keine Knöpfe; genau am Fristende gilt eine Antwort noch als rechtzeitig, wie `decided_at <= deadline_at` im Plan 009 M3, 16f.3); soon = weniger als 1 Stunde übrig; open = sonst.
 * Diese Funktion steuert nur die Anzeige. Die harte Fristgrenze im Server (Fristprüfung in SQL) kommt erst mit M2a-2; bis dahin prüft der Server die Frist NICHT (Plan 011 M2, Lücke 1), die Seite darf das nicht behaupten.
 */
export function replyWindow(deadline: Date | null, now: Date): ReplyWindow {
  if (!deadline) return { state: "none", remainingText: null };
  const left = deadline.getTime() - now.getTime();
  if (left < 0) return { state: "expired", remainingText: null };
  return { state: left < HOUR ? "soon" : "open", remainingText: formatRemaining(left) };
}
