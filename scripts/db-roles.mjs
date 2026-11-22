// Legt die Rollen des Datenbank-Rollenmodells an (G25-009, Plan docs/design/g25-009-db-rollenmodell.md). Node-Skript (kein psql noetig, auch im Playwright-Container); liest scripts/db-roles.sql (Cluster-Teil)
// und vergibt je Datenbank CONNECT/CREATE. Idempotent. Aendert KEIN Verhalten der Anwendung (neue Rollen, noch unbenutzt).
// Aufruf:   node scripts/db-roles.mjs [--apply] [--database <name>] [--no-cluster]
//   ohne --apply: Trockenlauf (gibt die SQL-Anweisungen aus, fuehrt nichts aus); DATABASE_URL = Admin-/Superuser-Verbindung (nur lokale Datenbank, wie tests/integration/db-guard.ts).
// Sperrliste: Anwenden nur gegen soccaz_w1..w4/Wegwerf-Namen (im CI "socaz"); jede andere Datenbank (auch soccav2) nur mit --allow-database <exakter Name>. --database muss die Datenbank der Verbindung sein.
// Passwoerter: NUR aus Umgebungsvariablen DB_PASSWORD_MIGRATE, DB_PASSWORD_APP, DB_PASSWORD_OPS, DB_PASSWORD_BACKUP (nie im Repository, nie in der Ausgabe). Sie werden als SCRAM-SHA-256-Verifier
// clientseitig gebildet (der Klartext erscheint nie in einer Anweisung, im Serverlog oder in pg_stat_statements). Fehlt eine Variable, bleibt die Rolle OHNE Passwort: dann darf pg_hba.conf fuer diese Rollen
// kein "trust" erlauben (BETRIEB). Hinweis: soccaz_backup (pg_read_all_data) liest clusterweit in jeder Datenbank, in der CONNECT offen ist.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { parse as parsePgUrl } from "pg-connection-string";

export const ROLES = ["soccaz_owner", "soccaz_maintenance", "soccaz_migrate", "soccaz_app", "soccaz_ops", "soccaz_backup"];
export const LOGIN_ROLES = { soccaz_migrate: "DB_PASSWORD_MIGRATE", soccaz_app: "DB_PASSWORD_APP", soccaz_ops: "DB_PASSWORD_OPS", soccaz_backup: "DB_PASSWORD_BACKUP" };
/** Soll-Liste der DIREKTEN Mitgliedschaften zwischen unseren Rollen und mit pg_read_all_data (Mitglied -> Rolle). soccaz_maintenance hat im Normalbetrieb KEINE Mitglieder. */
export const EXPECTED_MEMBERSHIPS = [
  ["soccaz_migrate", "soccaz_owner"],
  ["soccaz_backup", "pg_read_all_data"],
];

/**
 * Waechter wie tests/integration/db-guard.ts (gleiche Regeln inkl. Gegenprobe mit pg-connection-string): nur lokale Datenbank (oder der CI-Dienst "postgres"); keine Query/Fragment in der URL.
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
  const host = u.hostname;
  if (!(host === "127.0.0.1" || host === "localhost" || (host === "postgres" && env.GITHUB_ACTIONS === "true"))) return false;
  try {
    return parsePgUrl(url).host === host; // Gegenprobe mit dem Parser, den pg benutzt (Mehrfachhost, %2C, Socket, abweichende Userinfo-Auslegung)
  } catch {
    return false;
  }
}

/**
 * Sperrliste (Haertung): ANWENDEN (und Rueckfall) nur gegen ausdruecklich erlaubte Datenbanken. Standard-Erlaubnis: die Worker-/Test-Datenbanken (soccaz_w1 bis soccaz_w4, Wegwerf-Namen dieser Skripte) und
 * im CI die Datenbank "socaz". JEDE andere Datenbank (auch soccav2) nur mit ausdruecklichem "--allow-database <exakter Name>". Fuer den Trockenlauf gilt keine Sperre (nur lesend).
 * @param {string} dbName
 * @param {string | undefined} allow
 * @param {Record<string, string | undefined>} [env]
 */
export function assertDatabaseAllowed(dbName, allow, env = process.env) {
  if (allow !== undefined && allow === dbName) return;
  const standard = /^soccaz_w[1-4]$/.test(dbName) || /^soccaz_(dbroles_test|owner_test|measure|verify)\w*$/.test(dbName) || (dbName === "socaz" && env.GITHUB_ACTIONS === "true");
  if (!standard) throw new Error(`Datenbank ${dbName} ist nicht freigegeben: Anwenden nur mit --allow-database ${dbName} (ausdruecklich, exakter Name)`);
}

/** SCRAM-SHA-256-Verifier (RFC 5802/7677, wie PostgreSQL): der Server akzeptiert ihn als PASSWORD; der Klartext verlaesst den Prozess nicht. */
export function scramVerifier(password, salt = randomBytes(16), iterations = 4096) {
  // SASLprep wird nicht nachgebaut: nur druckbares ASCII ist erlaubt (BETRIEB), sonst koennte der Server ein anderes Ergebnis erwarten
  if (!/^[\x21-\x7e]+$/.test(password)) throw new Error("Passwort: nur druckbare ASCII-Zeichen ohne Leerzeichen erlaubt (SASLprep wird nicht nachgebaut)");
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
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

/** Alle direkten Mitgliedschaften (Mitglied, Rolle, Grantor, Optionen), an denen eine unserer Rollen beteiligt ist. Ab PostgreSQL 16 mit inherit_option/set_option; ADMIN OPTION gibt es immer. */
async function memberships(client) {
  return (
    await client.query(
      `select m.rolname as member, r.rolname as role, g.rolname as grantor, am.admin_option as admin${(await hasInheritColumn(client)) ? ", am.inherit_option as inherit, am.set_option as \"set\"" : ""}
         from pg_auth_members am
         join pg_roles m on m.oid = am.member
         join pg_roles r on r.oid = am.roleid
         left join pg_roles g on g.oid = am.grantor
        where m.rolname = any($1) or r.rolname = any($1)
        order by 1, 2, 3`,
      [ROLES],
    )
  ).rows;
}

async function hasInheritColumn(client) {
  return (await client.query("select 1 from information_schema.columns where table_schema = 'pg_catalog' and table_name = 'pg_auth_members' and column_name = 'inherit_option'")).rowCount > 0;
}

/** Gleicht die Mitgliedschaften gegen die Soll-Liste ab: Abweichungen zwischen UNSEREN Rollen (und von unseren Rollen in fremde) werden entzogen; fremde Mitglieder unserer Rollen brechen ab (nie still). */
async function enforceMemberships(client) {
  const expected = new Set(EXPECTED_MEMBERSHIPS.map(([m, r]) => `${m}>${r}`));
  const ours = new Set(ROLES);
  for (const row of await memberships(client)) {
    if (expected.has(`${row.member}>${row.role}`)) continue;
    if (!ours.has(row.member)) continue; // fremdes Mitglied unserer Rolle: unten gemeldet
    await client.query(`REVOKE ${client.escapeIdentifier(row.role)} FROM ${client.escapeIdentifier(row.member)}`);
  }
  // erlaubte Mitgliedschaften: ADMIN OPTION darf nicht gesetzt sein (sonst koennte das Mitglied die Rolle weiterreichen); INHERIT und SET (PG 16+) muessen gelten
  for (const row of await memberships(client)) {
    if (!expected.has(`${row.member}>${row.role}`)) continue;
    const m = client.escapeIdentifier(row.member);
    const r = client.escapeIdentifier(row.role);
    if (row.admin) await client.query(`REVOKE ADMIN OPTION FOR ${r} FROM ${m}`);
    if ("inherit" in row && (row.inherit === false || row.set === false)) await client.query(`GRANT ${r} TO ${m} WITH INHERIT TRUE, SET TRUE`);
  }
  const bad = (await memberships(client)).filter((row) => !expected.has(`${row.member}>${row.role}`) || row.admin || ("inherit" in row && (row.inherit === false || row.set === false)));
  if (bad.length) throw new Error(`Mitgliedschaften weichen von der Soll-Liste ab: ${bad.map((b) => `${b.member} in ${b.role} (Grantor ${b.grantor ?? "?"}${b.admin ? ", ADMIN OPTION" : ""})`).join(", ")}`);
}

/** Rollenbezogene Einstellungen (ALTER ROLE ... SET, auch je Datenbank) werden entfernt: eine Einstellung wie role oder session_replication_role fuer soccaz_app hebelte das Modell aus. */
async function resetRoleSettings(client) {
  for (const role of ROLES) await client.query(`ALTER ROLE ${client.escapeIdentifier(role)} RESET ALL`);
  const perDb = (
    await client.query(
      `select r.rolname as role, d.datname as db
         from pg_db_role_setting s join pg_roles r on r.oid = s.setrole left join pg_database d on d.oid = s.setdatabase
        where r.rolname = any($1) and s.setdatabase <> 0`,
      [ROLES],
    )
  ).rows;
  for (const row of perDb) await client.query(`ALTER ROLE ${client.escapeIdentifier(row.role)} IN DATABASE ${client.escapeIdentifier(row.db)} RESET ALL`);
}

/**
 * Fuehrt aus oder gibt aus (apply = false). Passwoerter werden nie ausgegeben (nur als Verifier gesetzt). Ein Advisory-Lock serialisiert parallele Laeufe (Rollen sind clusterweit).
 * @param {{ url?: string, apply?: boolean, database?: string, allowDatabase?: string, cluster?: boolean, env?: Record<string, string | undefined>, log?: (s: string) => void }} [opts]
 */
export async function setupRoles({ url = process.env.DATABASE_URL, apply = false, database, allowDatabase, cluster = true, env = process.env, log = console.log } = {}) {
  if (!dbUrlAllowed(url, env)) throw new Error("DATABASE_URL: nur lokale Datenbank (db-guard)");
  const client = new pg.Client({ connectionString: url, statement_timeout: 60_000 });
  await client.connect();
  try {
    const current = (await client.query("select current_database() as d")).rows[0].d;
    if (database !== undefined && database !== current) throw new Error(`--database ${database} ist nicht die Datenbank der Verbindung (${current})`);
    const dbName = current;
    for (const [role, v] of Object.entries(LOGIN_ROLES)) if (cluster && env[v] !== undefined && env[v] === "") throw new Error(`${v} ist leer (Rolle ${role}): Variable setzen oder entfernen`);
    const stmts = [...(cluster ? clusterStatements() : []), ...databaseStatements(client, dbName)];
    const passwords = cluster ? Object.entries(LOGIN_ROLES).filter(([, v]) => env[v]) : [];
    if (!apply) {
      for (const s of stmts) log(s + ";\n");
      log("-- danach: Mitgliedschaften gegen die Soll-Liste abgleichen, rollenbezogene Einstellungen entfernen\n");
      for (const [role] of passwords) log(`ALTER ROLE ${role} PASSWORD '<SCRAM-Verifier>';  -- aus Umgebungsvariable, nicht ausgegeben\n`);
      return { applied: false, statements: stmts.length, passwordsSet: 0 };
    }
    assertDatabaseAllowed(dbName, allowDatabase, env); // nur beim Anwenden
    const sup = (await client.query("select rolsuper from pg_roles where rolname = current_user")).rows[0]?.rolsuper;
    if (!sup) throw new Error("db-roles braucht einen Superuser (Rollen anlegen und Mitgliedschaften vergeben)");
    await client.query("select pg_advisory_lock(hashtext('soccaz_db_roles'))");
    try {
      for (const s of stmts) await client.query(s);
      if (cluster) {
        await resetRoleSettings(client);
        await enforceMemberships(client);
      }
      for (const [role, v] of passwords) await client.query(`ALTER ROLE ${client.escapeIdentifier(role)} PASSWORD ${client.escapeLiteral(scramVerifier(/** @type {string} */ (env[v])))}`);
    } finally {
      await client.query("select pg_advisory_unlock(hashtext('soccaz_db_roles'))");
    }
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
  const j = args.indexOf("--allow-database");
  const allowDatabase = j >= 0 ? args[j + 1] : undefined;
  try {
    const r = await setupRoles({ apply, database, allowDatabase, cluster: !args.includes("--no-cluster") });
    console.log(apply ? `Rollen angewendet (${r.statements} Anweisungen, ${r.passwordsSet} Passwoerter aus der Umgebung als Verifier gesetzt).` : `Trockenlauf: ${r.statements} Anweisungen (nichts ausgefuehrt, --apply zum Anwenden).`);
  } catch (e) {
    console.error("FEHLER:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
