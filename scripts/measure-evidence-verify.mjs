// Messung der Kettenpruefung (Backlog 165, Plan 009-m3-aufbewahrung-aggregat): heutige Fassung (alle Zeilen zum Client, mit und ohne Commitment-Join) gegen EINE Aggregat-Anweisung.
// NUR gegen eine WEGWERF-Datenbank, die dieses Skript selbst anlegt und loescht (Name mit Prozess-ID; nie Haupt- oder Worker-DB). Ein Prozess, Zeitlimit 15 Minuten, statement_timeout 120 s.
// Aufruf: node scripts/measure-evidence-verify.mjs [Zeilen=100000]   (1 000 000 nur, wenn die Messung bei 100 000 unklar ist; DATABASE_URL aus .env.local, wird nie ausgegeben)
import { spawnSync } from "node:child_process";
import pg from "pg";
import { assertLocalDbUrl, loadLocalEnv } from "./lib/db-url-guard.mjs";

loadLocalEnv();
assertLocalDbUrl(process.env.DATABASE_URL, "measure-evidence-verify"); // VOR jeder Verbindung (Query/Fragment/Leerraum/Parser-Gegenprobe)
const base = new URL(/** @type {string} */ (process.env.DATABASE_URL));
const N = Number(process.argv[2] ?? 100_000);
if (!Number.isInteger(N) || N < 1000 || N > 1_000_000) throw new Error("Zeilen zwischen 1000 und 1000000");
const name = `soccaz_measure_verify_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const testUrl = new URL(base);
testUrl.pathname = "/" + name;
const deadline = Date.now() + 15 * 60_000;
const ms = (t0) => Math.round(performance.now() - t0);
const log = (s) => console.log(s);
const check = () => {
  if (Date.now() > deadline) throw new Error("Zeitlimit (15 Minuten) erreicht");
};

// MESSKOPIE der Pruefanweisung aus src/server/evidence.ts (verifyEvidenceChain), NICHT gepflegt und nicht im Kopie-Test (nur fuer die Messung, Stand Nachlieferung 0054); withRt steuert den Commitment-Join
const inner = (withRt) => `
  select e.seq, e.hash, c.last_seq::int as counter_seq, c.last_hash as counter_hash,
    case
      when e.seq is null then null
      when e.seq <> row_number() over (order by e.seq) then 'seq-luecke'
      when e.prev_hash is distinct from coalesce(lag(e.hash) over (order by e.seq), '') then 'prev_hash'
      when e.hash_version not in (1, 2) or (e.hash_version = 1 and e.match_id is null) then 'hash'
      when e.hash is distinct from evidence_hash_of(e) then 'hash'
      ${withRt ? "when rt.evidence_id is not null and e.reason_commitment is distinct from encode(sha256(convert_to(rt.salt || ':' || rt.reason, 'UTF8')), 'hex') then 'commitment'" : ""}
      else null
    end as bad
  from booking_evidence_counter c left join booking_evidence e on true ${withRt ? "left join booking_evidence_reason_text rt on rt.evidence_id = e.id" : ""} where c.id = 1 order by e.seq`;
const aggregate = (withRt) => `
  with checked as (${inner(withRt)})
  select count(*) filter (where seq is not null)::int as n,
         max(seq) as last_seq,
         (array_agg(hash order by seq desc) filter (where seq is not null))[1] as head_hash,
         min(seq) filter (where bad is not null) as first_bad,
         (array_agg(bad order by seq) filter (where bad is not null))[1] as bad_reason,
         max(counter_seq) as counter_seq, max(counter_hash) as counter_hash
  from checked`;

const admin = new pg.Client({ connectionString: adminUrl.toString(), statement_timeout: 120_000 });
await admin.connect();
await admin.query(`drop database if exists "${name}" with (force)`);
await admin.query(`create database "${name}"`);
try {
  if (spawnSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: testUrl.toString() }, stdio: "ignore" }).status !== 0) throw new Error("Migration fehlgeschlagen");
  const db = new pg.Client({ connectionString: testUrl.toString(), statement_timeout: 120_000 });
  db.on("error", () => {});
  await db.connect();
  log(`PostgreSQL ${(await db.query("show server_version")).rows[0].server_version}, Wegwerf-Datenbank ${name}, ${N} Zeilen (10 % mit Klartext, 5 % Turnier)`);

  // Aufbau: temporaere Tabelle mit festen IDs, dann in Reihenfolge einfuegen (der Trigger verkettet); 10 % bekommen Klartext + passendes Commitment
  const tb = performance.now();
  await db.query(`create temp table gen as select g, gen_random_uuid() as id, md5(g::text) as salt, 'Messbegruendung ' || g as reason from generate_series(1, ${N}) g`);
  let done = 0;
  while (done < N) {
    check();
    const step = Math.min(50_000, N - done);
    await db.query(
      `insert into booking_evidence (id, subject, match_id, tournament_id, venue_id, round, kind, reason_code, reason_commitment, decided_at, statement_at)
       select id,
              case when g % 20 = 0 then 'tournament' else 'match' end,
              case when g % 20 = 0 then null else gen_random_uuid() end,
              case when g % 20 = 0 then gen_random_uuid() else null end,
              null, 1,
              case when g % 20 = 0 then 'accepted' else (array['job_open','job_booked','job_confirmed','job_done'])[1 + (g % 4)] end,
              case when g % 10 = 0 and g % 20 <> 0 then 'belegt' else '' end,
              case when g % 10 = 0 and g % 20 <> 0 then encode(sha256(convert_to(salt || ':' || reason, 'UTF8')), 'hex') else '' end,
              case when g % 20 = 0 then now() else null end,
              case when g % 20 = 0 then now() else null end
       from gen where g > ${done} and g <= ${done + step} order by g`,
    );
    done += step;
  }
  await db.query("insert into booking_evidence_reason_text (evidence_id, reason, salt) select id, reason, salt from gen where g % 10 = 0 and g % 20 <> 0");
  log(`Aufbau: ${Math.round(ms(tb) / 1000)} s; Klartext-Zeilen: ${(await db.query("select count(*)::int n from booking_evidence_reason_text")).rows[0].n}`);

  log("\n| Variante | Zeit (ms) | Zeilen zum Client | Ergebnis |");
  log("|---|---|---|---|");
  const run = async (label, sqlText, mode) => {
    check();
    await db.query("select 1"); // Verbindung warm
    const t0 = performance.now();
    const r = await db.query(sqlText);
    const t = ms(t0);
    let res;
    if (mode === "rows") {
      const first = r.rows.find((x) => x.bad !== null);
      res = first ? `Abweichung ab ${first.seq} (${first.bad})` : "ok";
    } else {
      const x = r.rows[0];
      res = x.first_bad ? `Abweichung ab ${x.first_bad} (${x.bad_reason})` : `ok, ${x.n} Zeilen`;
    }
    log(`| ${label} | ${t} | ${r.rows.length} | ${res} |`);
  };
  for (let i = 0; i < 2; i++) {
    log(`| (Durchlauf ${i + 1}) | | | |`);
    await run("heute: alle Zeilen holen, MIT Commitment-Join", inner(true), "rows");
    await run("alle Zeilen holen, OHNE Commitment-Join", inner(false), "rows");
    await run("Aggregat (eine Zeile), MIT Commitment-Join", aggregate(true), "agg");
    await run("Aggregat (eine Zeile), OHNE Commitment-Join", aggregate(false), "agg");
  }
  const size = Math.round(Number((await db.query("select pg_total_relation_size('booking_evidence') as s")).rows[0].s) / 1048576);
  log(`\nTabelle booking_evidence: ${size} MB`);
  await db.end();
} catch (e) {
  console.error("FEHLER:", e.message);
  process.exitCode = 1;
} finally {
  await admin.query(`drop database if exists "${name}" with (force)`).catch((e) => console.error("DB-Loeschen:", e.message));
  await admin.end();
}
