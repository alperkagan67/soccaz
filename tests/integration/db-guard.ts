// Waechter: Integrationstests und E2E-Seeding laufen nur gegen eine lokale Datenbank.
// Ausnahme: In GitHub Actions (Container-Job) heisst der Postgres-Dienst "postgres".
//
// Restrisiko: GITHUB_ACTIONS=true lokal gesetzt UND "postgres" auf einem fremden Rechner
// als Alias auf eine fremde Datenbank aufgeloest. Das setzt zwei bewusste Eingriffe voraus.

import { parse as parsePgUrl } from "pg-connection-string";

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
  // Weder Leerraum (auch fuehrend/nachfolgend, Tab, Zeilenumbruch) noch Backslash: new URL() raeumt das
  // stillschweigend auf, pg-connection-string parst es anders.
  if (url !== url.trim() || /[\s\\]/.test(url)) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
  if (u.search !== "" || u.hash !== "" || url.includes("?") || url.includes("#")) return false; // auch leeres "?"
  if (!dbHostAllowed(u.hostname, env)) return false;
  // Gegenprobe mit dem Parser, den pg wirklich benutzt: derselbe Host, sonst false
  // (faengt Mehrfachhost, %2C, %2F-Socket, leere Hosts, abweichende Userinfo-Auslegung).
  try {
    return parsePgUrl(url).host === u.hostname;
  } catch {
    return false;
  }
}
