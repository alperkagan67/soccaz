// Messung Beweisprotokoll (Plan 009 M3, 13.6 und 14.8): nur gegen eine WEGWERF-Datenbank, die dieses Skript selbst anlegt und danach loescht (nie Haupt- oder Worker-DB).
// 1) Zaehlersperre je COMMIT: N Anfragezeilen (startHallCheck-Muster) in EINER Transaktion, gemessen wird der COMMIT, in dem die DEFERRABLE-Trigger laufen (N = 100/500/1000);
//    dazu die Wartezeit eines zweiten, gleichzeitigen COMMITs auf den Zaehler.
// 2) Kettenwachstum und verifyEvidenceChain (dieselbe Anweisung wie src/server/evidence.ts) bei 100 000 und 1 000 000 Zeilen; Abgleich (evidence_reconcile) und Verwaisten-Pruefung.
// NIE PARALLEL zu anderen Laeufen mit demselben Skript (der Datenbankname enthaelt die Prozess-ID; es wird nur die EIGENE Wegwerf-DB geloescht) und nie waehrend eines Integrationslaufs (Last verfaelscht die Zahlen).
// Aufruf: node scripts/measure-evidence.mjs [maxZeilen=1000000] [--skip-big]    (DATABASE_URL aus .env.local, wird nur im Prozess umgeschrieben und nie ausgegeben; lokale DB Pflicht)
// Zeitlimit: Gesamtlauf bricht nach 15 Minuten ab.
import { spawnSync } from "node:child_process";
import pg from "pg";

process.loadEnvFile(".env.local");
const base = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.search || base.hash) throw new Error("nur lokale DB");
const MAX = Number(process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : 1_000_000);
const SKIP_BIG = process.argv.includes("--skip-big");
const name = `soccaz_measure_evidence_${process.pid}`; // mit Prozess-ID: nie dieselbe Datenbank wie ein anderer Lauf
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const testUrl = new URL(base);
testUrl.pathname = "/" + name;
const deadline = Date.now() + 15 * 60_000;
const STATEMENT_TIMEOUT_MS = 120_000; // je Verbindung: keine Anweisung laeuft laenger als 2 Minuten (das Gesamtzeitlimit wirkt nur zwischen den Schritten)
const out = [];
const log = (s) => {
  out.push(s);
  console.log(s);
};
const ms = (t0) => Math.round(performance.now() - t0);
const checkTime = () => {
  if (Date.now() > deadline) throw new Error("Zeitlimit (15 Minuten) erreicht");
};

// ACHTUNG: KOPIE der Pruefanweisung aus src/server/evidence.ts (verifyEvidenceChain) mit der 10-Argument-Fassung von evidence_hash. Mit der Nachlieferung (Plan 16, 13 Parameter) mitaendern;
// ein Test (migrate-check/Vergleich) soll beide Fassungen gleich halten (Backlog).
const VERIFY_SQL = `
  select e.seq, e.hash, c.last_seq::int as counter_seq, c.last_hash as counter_hash,
    case
      when e.seq is null then null
      when e.seq <> row_number() over (order by e.seq) then 'seq-luecke'
      when e.prev_hash is distinct from coalesce(lag(e.hash) over (order by e.seq), '') then 'prev_hash'
      when e.hash_version not in (1, 2) or (e.hash_version = 1 and e.match_id is null) then 'hash'
      when e.hash is distinct from evidence_hash_of(e) then 'hash'
      else null
    end as bad
  from booking_evidence_counter c left join booking_evidence e on true where c.id = 1 order by e.seq`;

const admin = new pg.Client({ connectionString: adminUrl.toString(), statement_timeout: STATEMENT_TIMEOUT_MS });
await admin.connect();
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
try {
  const env = { ...process.env, DATABASE_URL: testUrl.toString() };
  if (spawnSync("node", ["scripts/migrate.mjs"], { env, stdio: "ignore" }).status !== 0) throw new Error("Migration fehlgeschlagen");
  const db = new pg.Client({ connectionString: testUrl.toString(), statement_timeout: STATEMENT_TIMEOUT_MS });
  db.on("error", () => {}); // beim Loeschen der Wegwerf-DB getrennte Verbindungen nicht als Absturz melden
  await db.connect();
  const pgVersion = (await db.query("show server_version")).rows[0].server_version;
  log(`PostgreSQL ${pgVersion}, Wegwerf-Datenbank ${name}`);

  // ---- 1) Zaehlersperre je COMMIT -------------------------------------------------------------------------------------------------------------------------
  log("\n## 1) COMMIT mit N Anfragezeilen (DEFERRABLE-Trigger laufen beim COMMIT, Zaehler gehalten)");
  log("| N Hallen | INSERT der Zeilen (ms) | COMMIT mit Triggern (ms) | je Eintrag (ms) | Einträge | Wartezeit zweiter COMMIT auf den Zaehler (ms) |");
  log("|---|---|---|---|---|---|");
  const userId = (await db.query("insert into users (email, name, role) values ('mess@measure.test', 'Mess', 'player') returning id")).rows[0].id;
  for (const n of [100, 500, 1000]) {
    checkTime();
    // Spiel und N Hallen
    const teams = [];
    for (const t of ["a", "b"]) teams.push((await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Mess ${t} ${n}`, `mess-${t}-${n}`, userId])).rows[0].id);
    const m = (await db.query("insert into matches (home_team_id, away_team_id, starts_at, duration_min) values ($1, $2, now() + interval '3 days', 60) returning id", teams)).rows[0].id;
    await db.query("insert into venues (name, city, source) select 'Mess Halle ' || $1 || '-' || g, 'Essen', 'manual' from generate_series(1, $1::int) g", [n]);
    const before = Number((await db.query("select count(*) from booking_evidence")).rows[0].count);
    // erste Verbindung: Zeilen einfuegen (Ereignisse eingereiht), dann COMMIT messen; zweite Verbindung committet gleichzeitig eine eigene Anfragezeile und wartet auf den Zaehler
    const c2 = new pg.Client({ connectionString: testUrl.toString(), statement_timeout: STATEMENT_TIMEOUT_MS });
    c2.on("error", () => {});
    await c2.connect();
    const m2 = (await db.query("insert into matches (home_team_id, away_team_id, starts_at, duration_min) values ($1, $2, now() + interval '4 days', 60) returning id", teams)).rows[0].id;
    const v2 = (await db.query("select id from venues order by name limit 1")).rows[0].id;
    await db.query("begin");
    let t0 = performance.now();
    await db.query(
      "insert into match_hall_requests (match_id, venue_id, position, status) select $1, v.id, 0, case when random() < 0.9 then 'unmanaged' else 'pending' end from (select id from venues where name like $2) v",
      [m, `Mess Halle ${n}-%`],
    );
    const insertMs = ms(t0);
    await c2.query("begin");
    await c2.query("insert into match_hall_requests (match_id, venue_id, position, status) values ($1, $2, 0, 'pending')", [m2, v2]);
    t0 = performance.now();
    const commit1 = db.query("commit");
    await new Promise((r) => setTimeout(r, 1)); // die erste COMMIT-Anweisung hat den Zaehler (fast sicher) schon
    const t1 = performance.now();
    const commit2 = c2.query("commit").then(() => ms(t1));
    await commit1;
    const commitMs = ms(t0);
    const waitMs = await commit2;
    await c2.end();
    const after = Number((await db.query("select count(*) from booking_evidence")).rows[0].count);
    const entries = after - before - 1; // minus der Eintrag der zweiten Verbindung
    log(`| ${n} | ${insertMs} | ${commitMs} | ${(commitMs / Math.max(entries, 1)).toFixed(3)} | ${entries} | ${waitMs} |`);
  }

  if (!SKIP_BIG) {
    // ---- 2) Kettenwachstum und verifyEvidenceChain ----------------------------------------------------------------------------------------------------
    log("\n## 2) verifyEvidenceChain und Nebenabfragen bei langer Kette (Eintraege direkt per INSERT, der Trigger verkettet)");
    log("| Zeilen | Aufbau (s) | verifyEvidenceChain (ms) | Verwaiste (ms) | evidence_reconcile (ms) | Tabelle (MB) |");
    log("|---|---|---|---|---|---|");
    let have = Number((await db.query("select count(*) from booking_evidence")).rows[0].count);
    for (const target of [100_000, MAX].filter((x, i, a) => x <= MAX && a.indexOf(x) === i)) {
      const tBuild = performance.now();
      while (have < target) {
        checkTime();
        const step = Math.min(50_000, target - have);
        await db.query(
          "insert into booking_evidence (match_id, venue_id, round, kind, reason) select gen_random_uuid(), null, 1, (array['job_open','job_booked','job_confirmed','job_done'])[1 + (g % 4)], case when g % 5 = 0 then 'Freitext der Halle, belegt' else null end from generate_series(1, $1::int) g",
          [step],
        );
        have += step;
      }
      const buildS = Math.round(ms(tBuild) / 1000);
      checkTime();
      let t0 = performance.now();
      // nur zaehlen statt alle Zeilen zu uebertragen (die Anwendung liest sie ebenfalls vollstaendig, die Rechenzeit der Anweisung ist die gleiche)
      const bad = Number((await db.query(`select count(*) filter (where bad is not null) as n from (${VERIFY_SQL}) v`)).rows[0].n);
      const verifyMs = ms(t0);
      t0 = performance.now();
      await db.query("select distinct e.match_id from booking_evidence e left join matches x on x.id = e.match_id where x.id is null limit 1000");
      const orphanMs = ms(t0);
      t0 = performance.now();
      await db.query("select * from evidence_reconcile()");
      const reconcileMs = ms(t0);
      const size = Math.round(Number((await db.query("select pg_total_relation_size('booking_evidence') as s")).rows[0].s) / 1048576);
      log(`| ${have} | ${buildS} | ${verifyMs}${bad ? ` (UNERWARTET ${bad} Abweichungen)` : ""} | ${orphanMs} | ${reconcileMs} | ${size} |`);
    }
  }
  await db.end();
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await admin.query(`drop database if exists "${name}" with (force)`).catch((e) => console.error("DB-Loeschen:", e.message));
  await admin.end();
}
log("\nWegwerf-Datenbank geloescht.");
