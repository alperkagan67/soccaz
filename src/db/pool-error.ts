import type { Pool } from "pg";

// G25-009 (Backlog 228-3): Ein Leerlauf-Client, den der Server trennt (Neustart, Failover, pg_terminate_backend, Idle-Timeout des Hosters), meldet das als "error" am Pool.
// Ohne Handler wirft Node das als "Unhandled error event" und beendet den Prozess (CI #301 beim Restore-Test). Mit Handler verwirft pg-pool den toten Client und baut beim nächsten Zugriff einen neuen auf.
// Protokolliert wird NUR der Fehlercode (SQLSTATE bzw. Systemcode) und der Poolname: die Meldung kann Host, Port oder Benutzer enthalten.

/** Zeile fürs Protokoll; nie die Fehlermeldung, nie Verbindungsdaten. */
export function poolErrorLine(label: string, error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return `[db] Leerlauf-Verbindung verloren (Pool ${label}), wird neu aufgebaut: ${typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code) ? code : "ohne Code"}`;
}

/** Hängt den Fehler-Handler genau einmal an (ein wiederverwendeter Pool aus globalThis bekommt ihn nicht doppelt). */
export function attachPoolErrorHandler(pool: Pool, label: string): Pool {
  if (pool.listenerCount("error") === 0) pool.on("error", (error) => console.error(poolErrorLine(label, error)));
  return pool;
}
