// Restore-Probe (Go-live-Prüfpunkt E8): spielt eine Sicherung in eine WEGWERF-Datenbank auf einem LOKALEN Server ein und prüft, ob daraus ein konsistenter Stand entsteht.
// Aufruf:  RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs <sicherung> [--manifest <datei>] [--head-hash <hash> --count <n>] [--keep] [--strict] [--show-errors]
//   <sicherung>   pg_dump-Datei: Klartext-SQL (.sql, .sql.gz, wie scripts/backup-loop.sh sie erzeugt) oder custom-Format (.dump)
//   --manifest    Zeilenzahlen/Summen der Quelle (backup-loop.sh schreibt socaz-<zeit>.manifest.json neben die Sicherung; Standard: die Datei neben der Sicherung)
//   --head-hash / --count   Kopf-Hash und Anzahl der Beweiskette aus der EXTERNEN Kopie (Benachrichtigung an Admin 1): ohne beide ist die Kettenprüfung nur ein Teilbeweis
//   --keep        Wegwerf-Datenbank nicht löschen (zum Nachsehen)      --strict   auch WARN zählt als Fehler      --show-errors   psql/pg_restore-Fehlertext ausgeben (kann Zeilendaten enthalten)
// Exit 0 = bestanden, 1 = Befund, 2 = falsche Benutzung/Schutz. Ausgaben: nur Tabellennamen und Zahlen. Zugangsdaten stehen nur in RESTORE_ADMIN_URL (nie in Argumenten, nie in der Ausgabe); .env* wird nicht gelesen.
// Schutz: Server nur lokal (gleiche Prüfung wie der db-guard), die Wegwerf-Datenbank heißt immer restore_check_*; die Quelle/Produktion wird nie berührt. Braucht psql (und für custom-Dumps pg_restore); Pfad per PG_BIN.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, openSync, readSync, closeSync, readFileSync, statSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { dbUrlAllowed } from "./db-roles.mjs";
import { verifyNdjson } from "./lib/evidence-chain.mjs";
import { MANIFEST_SQL, SCRATCH_PREFIX, scratchNameOk, connEnv, withDatabase, detectFormat, compareManifest, compareMigrations, chainResult, triggerResult, formatReport, exitCode } from "./lib/restore-checks.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const die = (msg, code = 2) => {
  console.error(msg);
  process.exit(code);
};

export function parseArgs(argv) {
  const o = { file: null, manifest: null, headHash: undefined, count: undefined, keep: false, strict: false, showErrors: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep") o.keep = true;
    else if (a === "--strict") o.strict = true;
    else if (a === "--show-errors") o.showErrors = true;
    else if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--manifest" || a === "--head-hash" || a === "--count") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} braucht einen Wert`);
      if (a === "--manifest") o.manifest = v;
      else if (a === "--head-hash") o.headHash = v;
      else {
        if (!/^\d+$/.test(v)) throw new Error("--count braucht eine ganze Zahl");
        o.count = Number(v);
      }
    } else if (a.startsWith("--")) throw new Error(`unbekannte Option ${a}`);
    else if (o.file === null) o.file = a;
    else throw new Error("nur eine Sicherung angeben");
  }
  if ((o.headHash === undefined) !== (o.count === undefined)) throw new Error("--head-hash und --count nur zusammen (beide aus der externen Kopie)");
  return o;
}

const bin = (name) => {
  const base = process.env.PG_BIN ? join(process.env.PG_BIN, name) : name;
  const r = spawnSync(base, ["--version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  return { path: base, version: r.stdout.trim() };
};

/** Führt psql/pg_restore aus; stdout wird verworfen, stderr nur gesammelt (kann Zeilendaten enthalten, deshalb nicht ungefragt ausgeben). */
function run(cmd, args, env, input) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: [input ? "pipe" : "ignore", "ignore", "pipe"], shell: false });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", (e) => resolve({ code: 127, err: String(e.message) }));
    p.on("close", (code) => resolve({ code: code ?? 1, err }));
    if (input) {
      input.on("error", () => p.stdin.destroy());
      p.stdin.on("error", () => {});
      input.pipe(p.stdin);
    }
  });
}

async function triggerProbe(client, sqlText) {
  await client.query("begin");
  try {
    const n = (await client.query(`select count(*)::int as n from ${sqlText.table}`)).rows[0].n;
    if (n === 0) return null;
    try {
      await client.query(sqlText.update);
      return false; // die Änderung ging durch: Schutz fehlt
    } catch {
      return true;
    }
  } finally {
    await client.query("rollback").catch(() => null);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    die(`${e.message}\nAufruf: node scripts/restore-test.mjs <sicherung> [--manifest <datei>] [--head-hash <hash> --count <n>] [--keep] [--strict] [--show-errors]`);
  }
  if (args.help || !args.file) die("Aufruf: RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs <sicherung> [--manifest <datei>] [--head-hash <hash> --count <n>] [--keep] [--strict] [--show-errors]", args.help ? 0 : 2);

  const adminUrl = process.env.RESTORE_ADMIN_URL;
  if (!adminUrl) die("RESTORE_ADMIN_URL fehlt (lokaler Server, Konto mit CREATEDB, z. B. postgres://<konto>@127.0.0.1:5432/postgres).");
  if (!dbUrlAllowed(adminUrl)) die("RESTORE_ADMIN_URL: nur ein lokaler Server (127.0.0.1/localhost, ohne Query/Fragment). Die Restore-Probe läuft nie gegen eine entfernte Datenbank.");
  if (!existsSync(args.file) || !statSync(args.file).isFile() || statSync(args.file).size === 0) die("Sicherung nicht gefunden oder leer.");

  const head = Buffer.alloc(8);
  const fd = openSync(args.file, "r");
  readSync(fd, head, 0, 8, 0);
  closeSync(fd);
  const format = detectFormat(head);

  const psql = bin("psql");
  if (!psql) die("psql nicht gefunden (PATH oder PG_BIN=<Ordner mit psql>).");
  const restoreBin = format === "custom" ? bin("pg_restore") : null;
  if (format === "custom" && !restoreBin) die("pg_restore nicht gefunden (PATH oder PG_BIN), nötig für das custom-Format.");
  console.log(`Werkzeuge: ${psql.version}${restoreBin ? `, ${restoreBin.version}` : ""}; Format der Sicherung: ${format}`);

  let manifest = null;
  const manifestPath = args.manifest ?? args.file.replace(/\.(sql\.gz|sql|dump)$/, "") + ".manifest.json";
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      die("Manifest ist kein gültiges JSON.");
    }
  } else if (args.manifest) die("Manifest nicht gefunden.");

  const name = `${SCRATCH_PREFIX}${Date.now().toString(36)}_${process.pid}`;
  if (!scratchNameOk(name)) die("interner Fehler: Name der Wegwerf-Datenbank unzulässig.");
  const scratchUrl = withDatabase(adminUrl, name);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const results = [];
  let pool = null;
  try {
    await admin.query(`create database "${name}"`);
    console.log(`Wegwerf-Datenbank ${name} angelegt (Server ${new URL(adminUrl).host}).`);

    const env = connEnv(scratchUrl);
    let r;
    if (format === "custom") r = await run(restoreBin.path, ["--no-owner", "--exit-on-error", "-d", name, args.file], env);
    else {
      const src = createReadStream(args.file);
      r = await run(psql.path, ["-X", "-q", "-v", "ON_ERROR_STOP=1"], env, format === "gzip-sql" ? src.pipe(createGunzip()) : src);
    }
    if (r.code !== 0) {
      results.push({ id: "restore", status: "FAIL", text: `${format === "custom" ? "pg_restore" : "psql"} endete mit Code ${r.code}${args.showErrors ? `:\n${r.err.slice(0, 2000)}` : " (Fehlertext mit --show-errors)"}` });
    } else {
      results.push({ id: "restore", status: "PASS", text: "Sicherung eingespielt." });
      pool = new pg.Pool({ connectionString: scratchUrl, max: 2 });
      pool.on("error", () => {}); // Leerlauf-Verbindungen werden beim Löschen der Wegwerf-Datenbank getrennt: kein Absturz
      await checks(pool, scratchUrl, manifest, args, results);
    }
  } finally {
    if (pool) await pool.end().catch(() => null);
    await globalThis.pool?.end().catch(() => null); // Pool der Anwendung (src/db), den der Beweisketten-Export geöffnet hat
    if (args.keep) console.log(`Wegwerf-Datenbank ${name} bleibt (--keep); später löschen.`);
    else if (scratchNameOk(name)) await admin.query(`drop database if exists "${name}" with (force)`).catch(() => console.error(`Wegwerf-Datenbank ${name} konnte nicht gelöscht werden: von Hand löschen.`));
    await admin.end().catch(() => null);
  }
  console.log(formatReport(results, args.strict));
  process.exit(exitCode(results, args.strict));
}

async function checks(pool, scratchUrl, manifest, args, results) {
  // Tabellen/Zeilenzahlen/Summen (dieselbe Abfrage wie beim Sichern) und Eintrag Nr. <Manifest-Anzahl> der Kette
  const tablesOk = await pool.query("select count(*)::int as n from information_schema.tables where table_schema = 'public'");
  if (tablesOk.rows[0].n === 0) {
    results.push({ id: "tabellen", status: "FAIL", text: "Keine Tabellen im Schema public nach dem Restore." });
    return;
  }
  let actual = null;
  try {
    actual = (await pool.query(MANIFEST_SQL)).rows[0].json_build_object;
    if (manifest && Number(manifest.evidenceCount) > 0) {
      const h = await pool.query("select hash from booking_evidence where seq = $1", [Number(manifest.evidenceCount)]);
      actual.evidenceHeadAtManifest = h.rows[0]?.hash ?? null;
    }
  } catch {
    results.push({ id: "tabellen", status: "FAIL", text: "Zeilenzahlen nicht lesbar (Tabellen ledger_entries, booking_evidence oder drizzle.__drizzle_migrations fehlen)." });
    return;
  }
  results.push({ id: "tabellen-anzahl", status: "PASS", text: `${Object.keys(actual.tables).length} Tabellen im Schema public.` });
  results.push(...compareManifest(manifest, actual));

  // Migrationen gegen das Journal im Repo
  const rows = await pool.query("select hash from drizzle.__drizzle_migrations order by id").then((x) => x.rows.map((y) => y.hash), () => null);
  const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
  const journalHashes = journal.entries.map((e) => createHash("sha256").update(readFileSync(join(root, "drizzle", `${e.tag}.sql`), "utf8")).digest("hex"));
  results.push(...compareMigrations(rows, journalHashes));

  // Beweiskette: dieselbe Export-Funktion wie die Route /api/beweis/kette, gegen die Wegwerf-Datenbank
  process.env.DATABASE_URL = scratchUrl;
  const { tsImport } = await import("tsx/esm/api");
  const { exportEvidenceChain } = await tsImport(pathToFileURL(join(root, "src/server/evidence-export.ts")).href, import.meta.url);
  const ndjson = await exportEvidenceChain();
  const anchored = args.headHash !== undefined;
  results.push(chainResult(verifyNdjson(ndjson, anchored ? { headHash: args.headHash, count: args.count } : {}), anchored));

  // Salden-Guard (nur lesend): ein Befund ist vor dem Go-live zu klären, aber kein Restore-Fehler
  const { readLegacyBalances, evaluateGuard } = await tsImport(pathToFileURL(join(root, "scripts/lib/legacy-balance-guard.ts")).href, import.meta.url);
  const g = evaluateGuard(await readLegacyBalances(pool));
  results.push({ id: "salden-guard", status: g.ok ? "PASS" : "WARN", text: g.ok ? "Alle Altsalden 0, keine offenen Erstattungen." : `Befund (zu klären, kein Restore-Fehler): ${g.lines.join(" | ")}` });

  // Schutz-Trigger: eine Änderung an Buchungen und Beweiskette muss abgewiesen werden (in einer Transaktion, danach Rollback)
  const client = await pool.connect();
  try {
    results.push(triggerResult("ledger_entries", await triggerProbe(client, { table: "ledger_entries", update: "update ledger_entries set amount_cents = amount_cents + 1 where ctid = (select ctid from ledger_entries limit 1)" })));
    results.push(triggerResult("booking_evidence", await triggerProbe(client, { table: "booking_evidence", update: "update booking_evidence set round = round + 1 where seq = (select min(seq) from booking_evidence)" })));
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`Restore-Probe abgebrochen: ${e instanceof Error ? e.message.split("\n")[0] : "Fehler"}`);
    process.exit(2);
  });
}
