// scripts/worktree.mjs - Worktree + .env.local + Port + DB pro Worker (Spec SOCCAZ-LOOP-SPEC, Abschnitt 6)
//
// Aufruf (aus SoccaV2 oder einem seiner Worktrees):
//   node scripts/worktree.mjs create <branch> <worker 1..4> [--base <ref>] [--no-seed]
//   node scripts/worktree.mjs remove <branch> [--worker <1..4>] [--delete-branch]
//
// create: (1) git worktree add "../worktrees/<branch mit / -> ->" -b <branch> [<base>]
//         (2) .env.local aus SoccaV2 kopieren; NUR DATABASE_URL (Datenbankname soccaz_w<n>) und PORT (310<n>) aendern
//         (3) npm ci  (4) DB soccaz_w<n> anlegen (falls fehlt), npm run db:migrate, Seed (scripts/seed-demo.mjs)
//         (5) Zusammenfassung (Pfad, Port, DB-Name, Startbefehl)
// remove: git worktree remove (ohne --force; bei uncommitteten Aenderungen Abbruch), git worktree prune,
//         DB soccaz_w<n> loeschen, lokalen Branch nur mit --delete-branch (git branch -d, nie -D)
//
// Sicherheit:
//  - Angefasst werden ausschliesslich Datenbanken soccaz_w1..soccaz_w4 (Pruefung /^soccaz_w[1-4]$/ vor
//    jedem DB-Zugriff). Die Haupt-DB wird nie migriert/geaendert; Kindprozesse bekommen DATABASE_URL
//    explizit gesetzt (--env-file ueberschreibt keine vorhandene Umgebungsvariable).
//  - Es werden weder .env.local-Inhalte noch Passwoerter oder Verbindungs-URLs ausgegeben. Jede Ausgabe
//    und jeder Fehlertext laeuft durch redact().
//  - Kein Shell-Aufruf mit Benutzereingaben; git/node laufen mit Argumentliste.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_NAME_RE = /^soccaz_w[1-4]$/;
const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

// ------------------------------------------------------------ Hilfsfunktionen

const secrets = [];

export function addSecret(value) {
  if (value && String(value).length >= 3 && !secrets.includes(String(value))) secrets.push(String(value));
}

/** Schwaerzt registrierte Geheimnisse und jede Verbindungs-URL mit Zugangsdaten. */
export function redact(text) {
  let out = String(text);
  for (const s of secrets) out = out.split(s).join("<geschwaerzt>");
  return out.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi, "<url-geschwaerzt>");
}

export function assertDbName(name) {
  if (!DB_NAME_RE.test(String(name))) throw new Error(`Datenbankname "${name}" ist nicht erlaubt (nur soccaz_w1..soccaz_w4).`);
  return name;
}

export function dbNameFor(worker) {
  return assertDbName(`soccaz_w${worker}`);
}

export function parseWorker(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error("worker muss 1, 2, 3 oder 4 sein.");
  return n;
}

export function assertBranch(branch) {
  if (!branch || !BRANCH_RE.test(branch) || branch.includes("..") || branch.endsWith("/") || branch.endsWith(".lock")) {
    throw new Error(`Ungueltiger Branch-Name: "${branch ?? ""}".`);
  }
  return branch;
}

/** Ordnername im Verzeichnis worktrees: "/" wird zu "-". */
export function dirNameFor(branch) {
  return assertBranch(branch).replace(/\//g, "-");
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base" || a === "--worker") flags[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) flags[a.slice(2)] = true;
    else positional.push(a);
  }
  return { positional, flags };
}

/** Setzt KEY=value (ersetzt eine vorhandene Zeile oder haengt an); alle anderen Zeilen bleiben unveraendert. */
export function setEnvValue(content, key, value) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const re = new RegExp(`^\\s*${key}\\s*=`);
  let found = false;
  const out = lines.map((l) => {
    if (re.test(l)) {
      found = true;
      return `${key}=${value}`;
    }
    return l;
  });
  if (!found) {
    if (out.length && out[out.length - 1] === "") out.splice(out.length - 1, 0, `${key}=${value}`);
    else out.push(`${key}=${value}`);
  }
  return out.join(eol);
}

export function getEnvValue(content, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`);
  for (const l of content.split(/\r?\n/)) {
    const m = re.exec(l);
    if (m) return m[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

/** Gleiche URL (Host, Port, Benutzer, Passwort) mit anderem Datenbanknamen. */
export function withDbName(urlString, dbName) {
  const u = new URL(urlString);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export function dbNameOfUrl(urlString) {
  try {
    return decodeURIComponent(new URL(urlString).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function registerUrlSecrets(urlString) {
  addSecret(urlString);
  try {
    const u = new URL(urlString);
    addSecret(u.password);
    addSecret(decodeURIComponent(u.password));
  } catch {
    /* ignorieren */
  }
}

// ---------------------------------------------------------------- Prozesse

function run(cmd, args, { cwd, env, quiet = true } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: env ?? process.env,
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`${cmd} konnte nicht gestartet werden: ${r.error.message}`);
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0) {
    const tail = redact(output).trim().split("\n").slice(-15).join("\n");
    throw new Error(`${cmd} ${args.join(" ")} fehlgeschlagen (Exit ${r.status}).\n${tail}`);
  }
  if (!quiet && output.trim()) console.log(redact(output).trim());
  return r.stdout ?? "";
}

const git = (args, cwd) => run("git", args, { cwd }).trim();

/** npm ist unter Windows npm.cmd; ohne Shell nicht startbar -> feste Argumente ueber die Shell (keine Benutzereingaben). */
function npm(args, cwd, env) {
  const r = spawnSync("npm", args, { cwd, env, encoding: "utf8", shell: process.platform === "win32", maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`npm konnte nicht gestartet werden: ${r.error.message}`);
  if (r.status !== 0) {
    const tail = redact(`${r.stdout ?? ""}${r.stderr ?? ""}`).trim().split("\n").slice(-15).join("\n");
    throw new Error(`npm ${args.join(" ")} fehlgeschlagen (Exit ${r.status}).\n${tail}`);
  }
}

function repoPaths() {
  const top = path.resolve(git(["rev-parse", "--show-toplevel"], process.cwd()));
  const first = git(["worktree", "list", "--porcelain"], top)
    .split(/\r?\n/)
    .find((l) => l.startsWith("worktree "));
  const mainRoot = path.resolve(first.slice("worktree ".length));
  return { top, mainRoot, worktreesDir: path.resolve(mainRoot, "..", "worktrees") };
}

function samePath(a, b) {
  const n = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
  return n(a) === n(b);
}

function listedWorktrees(cwd) {
  return git(["worktree", "list", "--porcelain"], cwd)
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
}

// ---------------------------------------------------------------- Datenbank

function loadPg(candidateRoots) {
  for (const root of candidateRoots) {
    try {
      return createRequire(path.join(root, "package.json"))("pg");
    } catch {
      /* naechster Kandidat */
    }
  }
  throw new Error("Node-Paket pg nicht gefunden (npm ci im Worktree oder in SoccaV2 noetig).");
}

async function withAdminClient(pg, baseUrl, fn) {
  const client = new pg.Client({ connectionString: withDbName(baseUrl, "postgres") });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureDatabase(pg, baseUrl, dbName) {
  assertDbName(dbName);
  return withAdminClient(pg, baseUrl, async (c) => {
    const r = await c.query("select 1 from pg_database where datname = $1", [dbName]);
    if (r.rowCount > 0) return false;
    await c.query(`create database ${dbName}`);
    return true;
  });
}

async function dropDatabase(pg, baseUrl, dbName) {
  assertDbName(dbName);
  return withAdminClient(pg, baseUrl, async (c) => {
    const r = await c.query("select 1 from pg_database where datname = $1", [dbName]);
    if (r.rowCount === 0) return false;
    await c.query(`drop database ${dbName} with (force)`);
    return true;
  });
}

function readMainEnv(mainRoot) {
  const file = path.join(mainRoot, ".env.local");
  if (!existsSync(file)) throw new Error(".env.local in SoccaV2 nicht gefunden.");
  const content = readFileSync(file, "utf8");
  const url = getEnvValue(content, "DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL fehlt in der .env.local von SoccaV2.");
  registerUrlSecrets(url);
  return { file, content, url };
}

// ------------------------------------------------------------------ Kommandos

async function create(branch, workerArg, flags) {
  assertBranch(branch);
  const worker = parseWorker(workerArg);
  const dbName = dbNameFor(worker);
  const port = 3100 + worker;
  const { top, mainRoot, worktreesDir } = repoPaths();
  const wtPath = path.join(worktreesDir, dirNameFor(branch));
  if (existsSync(wtPath)) throw new Error("Zielordner des Worktrees existiert bereits - Abbruch.");

  const env = readMainEnv(mainRoot);
  const wtUrl = withDbName(env.url, dbName);
  registerUrlSecrets(wtUrl);

  console.log(`[1/5] git worktree add (Branch ${branch})`);
  git(["worktree", "add", wtPath, "-b", branch, ...(flags.base ? [String(flags.base)] : [])], top);

  console.log("[2/5] .env.local kopieren, PORT und DATABASE_URL anpassen");
  let content = setEnvValue(env.content, "DATABASE_URL", wtUrl);
  content = setEnvValue(content, "PORT", String(port));
  writeFileSync(path.join(wtPath, ".env.local"), content);

  console.log("[3/5] npm ci");
  npm(["ci", "--no-audit", "--no-fund"], wtPath, process.env);

  console.log(`[4/5] Datenbank ${dbName} anlegen und migrieren`);
  const pg = loadPg([wtPath, mainRoot]);
  const created = await ensureDatabase(pg, env.url, dbName);
  console.log(created ? `      DB ${dbName} angelegt.` : `      DB ${dbName} existierte bereits.`);
  // DATABASE_URL explizit setzen: --env-file ueberschreibt keine vorhandene Variable (Schutz der Haupt-DB).
  const childEnv = { ...process.env, DATABASE_URL: wtUrl, PORT: String(port) };
  if (dbNameOfUrl(getEnvValue(readFileSync(path.join(wtPath, ".env.local"), "utf8"), "DATABASE_URL")) !== dbName) {
    throw new Error("Interner Check fehlgeschlagen: .env.local im Worktree zeigt nicht auf die Worker-DB.");
  }
  npm(["run", "db:migrate"], wtPath, childEnv);
  console.log("      Migrationen angewendet.");
  if (!flags["no-seed"] && existsSync(path.join(wtPath, "scripts", "seed-demo.mjs"))) {
    run(process.execPath, ["scripts/seed-demo.mjs"], { cwd: wtPath, env: childEnv });
    console.log("      Seed (scripts/seed-demo.mjs) ausgefuehrt.");
  }

  console.log("[5/5] Fertig");
  console.log(`  Worktree : ${wtPath}`);
  console.log(`  Branch   : ${branch}`);
  console.log(`  Port     : ${port}`);
  console.log(`  Datenbank: ${dbName}`);
  console.log(`  Start    : cd "${wtPath}" && npm run dev -- -p ${port}`);
}

async function remove(branch, flags) {
  assertBranch(branch);
  const { top, mainRoot, worktreesDir } = repoPaths();
  const wtPath = path.join(worktreesDir, dirNameFor(branch));
  if (!listedWorktrees(top).some((p) => samePath(p, wtPath))) throw new Error("Kein registrierter Worktree fuer diesen Branch gefunden.");
  if (samePath(wtPath, top)) throw new Error("Der aktuelle Worktree kann nicht entfernt werden (aus SoccaV2 aufrufen).");

  // Worker/DB ableiten: --worker oder DB-Name aus der .env.local des Worktrees (nur Namensmuster zaehlt)
  let dbName;
  if (flags.worker) dbName = dbNameFor(parseWorker(flags.worker));
  else {
    const f = path.join(wtPath, ".env.local");
    const url = existsSync(f) ? getEnvValue(readFileSync(f, "utf8"), "DATABASE_URL") : undefined;
    if (url) registerUrlSecrets(url);
    const name = url ? dbNameOfUrl(url) : "";
    if (!DB_NAME_RE.test(name)) throw new Error("DB-Name nicht ableitbar oder nicht erlaubt - bitte --worker <1..4> angeben. Nichts wurde entfernt.");
    dbName = name;
  }
  assertDbName(dbName);

  const dirty = git(["status", "--porcelain"], wtPath);
  if (dirty) throw new Error("Worktree hat uncommittete Aenderungen oder neue Dateien - Abbruch. Erst committen oder bewusst bereinigen.");

  const env = readMainEnv(mainRoot);
  const pg = loadPg([wtPath, mainRoot]); // vor dem Entfernen laden

  console.log("[1/3] git worktree remove (ohne --force)");
  git(["worktree", "remove", wtPath], top);
  git(["worktree", "prune"], top);

  console.log(`[2/3] Datenbank ${dbName} loeschen`);
  const dropped = await dropDatabase(pg, env.url, dbName);
  console.log(dropped ? `      DB ${dbName} geloescht.` : `      DB ${dbName} existierte nicht.`);

  if (flags["delete-branch"]) {
    console.log(`[3/3] Branch ${branch} loeschen (git branch -d)`);
    git(["branch", "-d", branch], top);
  } else console.log("[3/3] Branch bleibt erhalten (--delete-branch nicht angegeben)");
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, branch, worker] = positional;
  try {
    if (cmd === "create" && branch && worker) await create(branch, worker, flags);
    else if (cmd === "remove" && branch) await remove(branch, flags);
    else {
      console.error("Aufruf:\n  node scripts/worktree.mjs create <branch> <worker 1..4> [--base <ref>] [--no-seed]\n  node scripts/worktree.mjs remove <branch> [--worker <1..4>] [--delete-branch]");
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(`Fehler: ${redact(e?.message ?? e)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
