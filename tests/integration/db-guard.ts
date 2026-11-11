// Waechter: Integrationstests und E2E-Seeding laufen nur gegen eine lokale Datenbank.
// Ausnahme: In GitHub Actions (Container-Job) heisst der Postgres-Dienst "postgres".
//
// Restrisiko: GITHUB_ACTIONS=true lokal gesetzt UND "postgres" auf einem fremden Rechner
// als Alias auf eine fremde Datenbank aufgeloest. Das setzt zwei bewusste Eingriffe voraus.

export function dbHostAllowed(host: string, env: Record<string, string | undefined> = process.env): boolean {
  if (host === "127.0.0.1" || host === "localhost") return true;
  return host === "postgres" && env.GITHUB_ACTIONS === "true";
}

/**
 * Prueft eine komplette DATABASE_URL. Query und Fragment sind verboten: pg-connection-string
 * uebernimmt Query-Parameter, und `?host=` / `?hostaddr=` gewinnen gegen den Hostnamen der URL.
 * Das ist die EINZIGE Stelle, die den Host einer Datenbank-URL bewertet.
 */
export function dbUrlAllowed(url: string | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
  if (u.search !== "" || u.hash !== "" || url.includes("?") || url.includes("#")) return false; // auch leeres "?"
  return dbHostAllowed(u.hostname, env);
}
