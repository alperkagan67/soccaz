// G25-009 B: Fehlerklassifizierung des Ops-Zugangs (rein rechnend, ohne Importbeschraenkung: auch ops-report.ts und die Tests nutzen sie).
// 42501 = insufficient_privilege: nach dem Rechtewechsel (A2) hat die App-Rolle kein EXECUTE mehr; fehlt DATABASE_URL_OPS (Rueckfall auf den Hauptpool), ist der Ops-Zugang damit ebenfalls nicht nutzbar (fail closed)
const UNREACHABLE = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "57P03", "28P01", "28000", "3D000", "53300", "42501"]);

/** Fehlercode (Netz- oder SQLSTATE-Code), auch wenn Drizzle den Fehler verpackt (cause, bis zu drei Ebenen). Nie die Datenbankmeldung auswerten. */
export function errorCodeOf(error: unknown): string | undefined {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Ist der Fehler ein Verbindungsproblem des Ops-Pools (nicht erreichbar, Anmeldung abgelehnt, Datenbank fehlt, Verbindungslimit)? Nie die Datenbankmeldung auswerten oder ausgeben. */
export function isOpsUnreachable(error: unknown): boolean {
  const code = errorCodeOf(error);
  return code !== undefined && (UNREACHABLE.has(code) || code.startsWith("08"));
}
