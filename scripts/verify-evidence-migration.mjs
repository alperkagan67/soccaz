// Verifikationstest "Kette vor/nach der Migration 0054" (Plan 009 M3 Nachlieferung 16b.5/16f.11): NUR gegen eine WEGWERF-Datenbank, die dieses Skript selbst anlegt und danach loescht (nie Haupt- oder Worker-DB).
// Ablauf: 1) Datenbank auf Stand 0053 migrieren (temporaerer Migrationsordner nur mit den Eintraegen bis 0053), 2) Altdaten anlegen (Version-1-Kette mit Klartext, Turniere mit ungueltiger Zusage),
// 3) alle Zeilen der Kette festhalten, 4) volle Migration (0054), 5) pruefen: Kette unveraendert (seq/prev_hash/hash/Kopf), Pruefer-SQL (evidence_hash_of) ohne Abweichung, unabhaengige JS-Neuberechnung,
// Turniere bereinigt (+ audit_log), Altklartext in evidence_legacy_plaintext, Einstellungen/Schalter, genau eine Funktion je Name.
// Mit --write-golden schreibt der Lauf (Stand 0053!) die Golden-Vektoren der Version 1 nach tests/fixtures/evidence-golden-v1.json (feste Literale, nicht zirkulaer).
// Aufruf: node scripts/verify-evidence-migration.mjs [--write-golden]    (DATABASE_URL aus .env.local, wird nur im Prozess umgeschrieben und nie ausgegeben; lokale DB Pflicht)
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { evidenceHash } from "./lib/evidence-chain.mjs";

process.loadEnvFile(".env.local");
const base = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.search || base.hash) throw new Error("nur lokale DB");
const WRITE_GOLDEN = process.argv.includes("--write-golden");
const name = `soccaz_verify_evidence_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const testUrl = new URL(base);
testUrl.pathname = "/" + name;
const results = [];
const check = (ok, what) => {
  results.push({ ok, what });
  console.log(`${ok ? "OK  " : "FEHLT"} ${what}`);
};

const admin = new pg.Client({ connectionString: adminUrl.toString(), statement_timeout: 120_000 });
await admin.connect();
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
const tmp = mkdtempSync(join(tmpdir(), "soccaz-mig-"));
let exitCode = 0;
try {
  // 1) Ordner mit den Migrationen bis 0053
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const upTo = journal.entries.filter((e) => e.idx <= 53);
  mkdirSync(join(tmp, "meta"), { recursive: true });
  for (const e of upTo) cpSync(join("drizzle", `${e.tag}.sql`), join(tmp, `${e.tag}.sql`));
  writeFileSync(join(tmp, "meta", "_journal.json"), JSON.stringify({ ...journal, entries: upTo }));
  const runMigrate = (folder) =>
    spawnSync("node", ["-e", `
      import("drizzle-orm/node-postgres").then(async ({ drizzle }) => {
        const { migrate } = await import("drizzle-orm/node-postgres/migrator");
        const pg = (await import("pg")).default;
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
        await migrate(drizzle(pool), { migrationsFolder: ${JSON.stringify(folder)} });
        await pool.end();
      }).catch((e) => { console.error(e); process.exit(1); });`], { env: { ...process.env, DATABASE_URL: testUrl.toString() }, encoding: "utf8" });
  const m1 = runMigrate(tmp);
  if (m1.status !== 0) throw new Error("Migration bis 0053 fehlgeschlagen: " + (m1.stderr || "").slice(0, 400));

  const db = new pg.Client({ connectionString: testUrl.toString(), statement_timeout: 120_000 });
  await db.connect();
  const q = async (s, p) => (await db.query(s, p)).rows;

  // 2) Altdaten (Stand 0053): Version-1-Kette mit Klartext (Umlaute, Emoji, Zeilenumbruch), Turniere mit ungueltiger Zusage
  const M = "11111111-1111-4111-8111-111111111111";
  const M2 = "22222222-2222-4222-8222-222222222222";
  const V = "33333333-3333-4333-8333-333333333333";
  const rowsIn = [
    [M, V, 1, null, "request_sent", null, ""],
    [M, V, 1, null, "declined", "Halle belegt: Veranstaltung Übung äöü 🏟\nzweite Zeile", "c0ffee"],
    [M2, null, 1, null, "unmanaged", null, ""],
    [M2, V, 2, "44444444-4444-4444-8444-444444444444", "job_open", "x", ""],
    [M, V, 2, null, "accepted", null, "abc123"],
  ];
  for (const [m, v, r, j, k, reason, ac] of rowsIn) {
    await q("insert into booking_evidence (match_id, venue_id, round, job_id, kind, reason, actor_commitment) values ($1,$2,$3,$4,$5,$6,$7)", [m, v, r, j, k, reason, ac]);
  }
  const u = (await q("insert into users (email, name) values ($1, $2) returning id", [`verify-${process.pid}@test.local`, "Verifikation"]))[0].id;
  const tIns = (n, confirmedAt) =>
    q(`insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, venue_confirmed_at) values ($1, $2, 'Test', current_date, 'knockout', 4, $3) returning id`, [u, n, confirmedAt]);
  await tIns("Alt ohne Halle, mit Zusage", new Date());
  await tIns("Alt ohne Zusage", null);
  const before = await q(`select seq, match_id as "matchId", venue_id as "venueId", round, job_id as "jobId", kind, reason, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
    actor_commitment as "actorCommitment", prev_hash as "prevHash", hash from booking_evidence order by seq`);
  const counterBefore = (await q("select last_seq, last_hash from booking_evidence_counter"))[0];
  check(before.length === rowsIn.length, `Altkette angelegt (${before.length} Zeilen, Stand 0053)`);
  // unabhaengige JS-Neuberechnung unter 0053
  check(before.every((e) => evidenceHash(e) === e.hash), "Stand 0053: JS-Neuberechnung = gespeicherter Hash");
  if (WRITE_GOLDEN) {
    mkdirSync("tests/fixtures", { recursive: true });
    writeFileSync("tests/fixtures/evidence-golden-v1.json", JSON.stringify({ note: "Erzeugt unter dem Stand 0053 (Funktion evidence_hash, Version 1), eingefroren. Nicht neu erzeugen.", rows: before }, null, 2) + "\n");
    console.log("Golden-Vektoren Version 1 geschrieben: tests/fixtures/evidence-golden-v1.json");
  }
  await db.end();

  // 4) volle Migration
  const m2r = spawnSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: testUrl.toString() }, encoding: "utf8" });
  check(m2r.status === 0, "Migration 0054 auf der Datenbank mit Altdaten laeuft durch" + (m2r.status === 0 ? "" : ": " + (m2r.stderr || m2r.stdout || "").slice(0, 600)));
  if (m2r.status !== 0) throw new Error("Migration 0054 fehlgeschlagen");

  // 5) pruefen
  const db2 = new pg.Client({ connectionString: testUrl.toString(), statement_timeout: 120_000 });
  await db2.connect();
  const q2 = async (s, p) => (await db2.query(s, p)).rows;
  const after = await q2(`select seq, match_id as "matchId", venue_id as "venueId", round, job_id as "jobId", kind, reason, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
    actor_commitment as "actorCommitment", prev_hash as "prevHash", hash, hash_version from booking_evidence order by seq`);
  check(after.length === before.length && after.every((a, i) => ["seq", "matchId", "venueId", "round", "jobId", "kind", "reason", "at", "actorCommitment", "prevHash", "hash"].every((f) => a[f] === before[i][f])), "Kette vor/nach identisch (alle Felder, Hashes, Kopf)");
  check(after.every((a) => a.hash_version === 1), "Altzeilen sind Version 1");
  const counterAfter = (await q2("select last_seq, last_hash from booking_evidence_counter"))[0];
  check(counterAfter.last_seq === counterBefore.last_seq && counterAfter.last_hash === counterBefore.last_hash, "Zaehler (Kopf-Hash) unveraendert");
  const bad = await q2("select seq from booking_evidence e where hash is distinct from evidence_hash_of(e) order by seq");
  check(bad.length === 0, "Pruefer-SQL (evidence_hash_of): keine Abweichung");
  check(after.every((e) => evidenceHash(e) === e.hash), "unabhaengige JS-Neuberechnung (Version 1) nach der Migration");
  const gold = (() => {
    try {
      return JSON.parse(readFileSync("tests/fixtures/evidence-golden-v1.json", "utf8")).rows;
    } catch {
      return null;
    }
  })();
  if (gold) check(gold.every((g) => evidenceHash(g) === g.hash) && gold.every((g) => after.some((a) => a.hash === g.hash)), "Golden-Fixture Version 1: byte-gleich zu JS und zur migrierten Datenbank");
  const t = await q2("select name, venue_confirmed_at, venue_confirmed_by from tournaments where organizer_id = $1 order by name", [u]);
  check(t.every((r) => r.venue_confirmed_at === null), "Turniere ohne Halle: Zusage zurueckgesetzt");
  const au = await q2("select after from audit_log where action = 'migration_0054_tournament_cleanup'");
  check(au.length === 1 && au[0].after.confirmed_without_venue_reset === 1, "audit_log-Eintrag der Bereinigung (Zaehler 1)");
  const lg = await q2("select count(*)::int n from evidence_legacy_plaintext");
  check(lg[0].n === 2, "Altklartext markiert (evidence_legacy_plaintext)");
  const st = await q2("select key, value #>> '{}' as v from settings where key like 'evidence%' order by key");
  check(st.find((s) => s.key === "evidence_enforcement")?.v === "off", "Schalter evidence_enforcement = off");
  const dup = await q2("select proname from pg_proc where proname like 'evidence%' group by proname having count(*) > 1");
  check(dup.length === 0, "genau eine Funktion je Name");
  const ev = await q2("select count(*)::int n from evidence_reconcile()");
  check(ev[0].n >= 0, "evidence_reconcile() laeuft");
  await db2.end();
} catch (e) {
  console.error("FEHLER:", e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.end();
  rmSync(tmp, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen ok`);
process.exit(exitCode || (failed.length ? 1 : 0));
