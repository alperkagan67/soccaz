// Waechter: Integrationstests laufen nur gegen eine lokale Datenbank.
// Ausnahme: In GitHub Actions (Container-Job) heisst der Postgres-Dienst "postgres".
export function dbHostAllowed(host: string, env: Record<string, string | undefined> = process.env): boolean {
  if (host === "127.0.0.1" || host === "localhost") return true;
  return host === "postgres" && env.GITHUB_ACTIONS === "true";
}
