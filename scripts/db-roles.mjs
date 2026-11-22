// Legt die Rollen des Datenbank-Rollenmodells an (G25-009, Plan docs/design/g25-009-db-rollenmodell.md). Node-Skript (kein psql noetig, auch im Playwright-Container); liest scripts/db-roles.sql (Cluster-Teil)
// und vergibt je Datenbank CONNECT/CREATE. Idempotent. Aendert KEIN Verhalten der Anwendung (neue Rollen, noch unbenutzt).
// Aufruf:   node scripts/db-roles.mjs [--apply] [--database <name>] [--no-cluster]
//   ohne --apply: Trockenlauf (gibt die SQL-Anweisungen aus, fuehrt nichts aus); DATABASE_URL = Admin-/Superuser-Verbindung (nur lokale Datenbank, wie tests/integration/db-guard.ts).
// Passwoerter: NUR aus Umgebungsvariablen DB_PASSWORD_MIGRATE, DB_PASSWORD_APP, DB_PASSWORD_OPS, DB_PASSWORD_BACKUP (nie im Repository, nie in der Ausgabe). Fehlt eine, bleibt die Rolle ohne Passwort.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

export const ROLES = ["soccaz_owner", "soccaz_maintenance", "soccaz_migrate", "soccaz_app", "soccaz_ops", "soccaz_backup"];
export const LOGIN_ROLES = { soccaz_migrate: "DB_PASSWORD_MIGRATE", soccaz_app: "DB_PASSWORD_APP", soccaz_ops: "DB_PASSWORD_OPS", soccaz_backup: "DB_PASSWORD_BACKUP" };

/**
 * Waechter wie tests/integration/db-guard.ts: nur lokale Datenbank (oder der CI-Dienst "postgres"); keine Query/Fragment in der URL.
 * @param {string | undefined} url
 * @param {Record<string, string | undefined>} [env]
 */
export function dbUrlAllowed(url, env = process.env) {
  if (!url || url !== url.trim() || /[\s\\]/.test(url) || url.includes("?") || url.includes("#")) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || (u.hostname === "postgres" && env.GITHUB_ACTIONS === "true");
}

/** Anweisungen des Cluster-Teils (Datei scripts/db-roles.sql, getrennt durch Zeilen "--> statement"). */
export function clusterStatements() {
  const sql = readFileSync(fileURLToPath(new URL("./db-roles.sql", import.meta.url)), "utf8");
  return sql
    .split(/^--> statement\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.split("\n").every((l) => l.trim().startsWith("--")));
}

/** Anweisungen des Datenbank-Teils: CONNECT fuer alle Rollen, CREATE nur fuer den Eigentuemer (fuer CREATE SCHEMA drizzle). */
export function databaseStatements(client, database) {
  const db = client.escapeIdentifier(database);
  return [
    `GRANT CONNECT ON DATABASE ${db} TO soccaz_owner, soccaz_migrate, soccaz_app, soccaz_ops, soccaz_backup`,
    `GRANT CREATE ON DATABASE ${db} TO soccaz_owner`,
  ];
}

/**
 * Fuehrt aus oder gibt aus (apply = false). Passwoerter werden nie ausgegeben.
 * @param {{ url?: string, apply?: boolean, database?: string, cluster?: boolean, env?: Record<string, string | undefined>, log?: (s: string) => void }} [opts]
 */
export async function setupRoles({ url = process.env.DATABASE_URL, apply = false, database, cluster = true, env = process.env, log = console.log } = {}) {
  if (!dbUrlAllowed(url, env)) throw new Error("DATABASE_URL: nur lokale Datenbank (db-guard)");
  const client = new pg.Client({ connectionString: url, statement_timeout: 60_000 });
  await client.connect();
  try {
    const dbName = database ?? new URL(url).pathname.slice(1);
    const stmts = [...(cluster ? clusterStatements() : []), ...databaseStatements(client, dbName)];
    const passwords = cluster ? Object.entries(LOGIN_ROLES).filter(([, v]) => env[v]) : [];
    if (!apply) {
      for (const s of stmts) log(s + ";\n");
      for (const [role] of passwords) log(`ALTER ROLE ${role} PASSWORD '***';  -- aus Umgebungsvariable, nicht ausgegeben\n`);
      return { applied: false, statements: stmts.length, passwordsSet: 0 };
    }
    const sup = (await client.query("select rolsuper from pg_roles where rolname = current_user")).rows[0]?.rolsuper;
    if (!sup) throw new Error("db-roles braucht einen Superuser (Rollen anlegen und Mitgliedschaften vergeben)");
    for (const s of stmts) await client.query(s);
    for (const [role, v] of passwords) await client.query(`ALTER ROLE ${client.escapeIdentifier(role)} PASSWORD ${client.escapeLiteral(env[v])}`);
    return { applied: true, statements: stmts.length, passwordsSet: passwords.length };
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const i = args.indexOf("--database");
  const database = i >= 0 ? args[i + 1] : undefined;
  try {
    const r = await setupRoles({ apply, database, cluster: !args.includes("--no-cluster") });
    console.log(apply ? `Rollen angewendet (${r.statements} Anweisungen, ${r.passwordsSet} Passwoerter aus der Umgebung gesetzt).` : `Trockenlauf: ${r.statements} Anweisungen (nichts ausgefuehrt, --apply zum Anwenden).`);
  } catch (e) {
    console.error("FEHLER:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
