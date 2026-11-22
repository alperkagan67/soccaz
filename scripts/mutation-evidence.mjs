// Mutationstest der Nachlieferung 009 M3 (Migration 0054): jede Mutation aendert EINE Funktion der Worker-Datenbank (Text aus der Migrationsdatei, gezielt veraendert), laeuft die zugehoerigen
// Integrationstests und verlangt, dass sie ROT werden. Danach wird die Originalfunktion wiederhergestellt (auch bei Abbruch). NUR gegen eine Worker-/Testdatenbank (nie soccav2); nie parallel zu anderen
// Integrationslaeufen (gemeinsame DB). Aufruf: node scripts/mutation-evidence.mjs [Nummer ...]   (DATABASE_URL aus .env.local, wird nicht ausgegeben)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || dbName === "soccav2" || !/^soccaz_w\d$/.test(dbName)) throw new Error("nur Worker-Datenbank soccaz_w1..w4");

const NL = "tests/integration/beweisprotokoll-nachlieferung.test.ts";
const HAKEN = "tests/integration/beweisprotokoll-haken.test.ts";
const BASE = "tests/integration/beweisprotokoll.test.ts";
// { name, fn, from, to, tests }: from muss genau einmal im Funktionstext vorkommen
const MUTATIONS = [
  { name: "RAISE der Frist auch beim Ablauf (nicht nur Antwortpfad)", fn: "evidence_hall_before", from: "IF v_enf AND NEW.answered_at IS NOT NULL THEN", to: "IF v_enf THEN", tests: [NL] },
  { name: "Spalten bei spaeterem UPDATE nicht unveraenderlich (keine OLD-Uebernahme)", fn: "evidence_hall_before", from: "    NEW.reply_deadline := OLD.reply_deadline;\n", to: "", tests: [NL] },
  { name: "App-Wert der Frist wird nicht verworfen (Frist nur gesetzt wenn NULL)", fn: "evidence_hall_before", from: "SELECT veto_turn_deadline INTO NEW.reply_deadline FROM matches WHERE id = NEW.match_id;", to: "NEW.reply_deadline := coalesce(NEW.reply_deadline, (SELECT veto_turn_deadline FROM matches WHERE id = NEW.match_id));", tests: [NL] },
  { name: "Pflichtcode bei Ablehnung nicht erzwungen", fn: "evidence_hall_before", from: "PERFORM evidence_check_reason(v_code, v_text, true);", to: "PERFORM evidence_check_reason(v_code, v_text, false);", tests: [NL] },
  { name: "late_attempt nur fuer pending (nicht fuer vom Ablauf entschiedene Zeile)", fn: "evidence_late_attempt", from: "IF NOT (h.status = 'pending' OR (h.status = 'declined' AND h.answered_at IS NULL)) THEN", to: "IF NOT (h.status = 'pending') THEN", tests: [NL] },
  { name: "late_attempt ohne Zugangspruefung", fn: "evidence_late_attempt", from: "IF p_actor IS NULL OR NOT evidence_has_venue_access(p_venue, p_actor) THEN", to: "IF p_actor IS NULL THEN", tests: [NL] },
  { name: "late_attempt ohne Fristpruefung", fn: "evidence_late_attempt", from: "IF v_deadline IS NULL OR transaction_timestamp() <= v_deadline THEN", to: "IF v_deadline IS NULL THEN", tests: [NL] },
  { name: "Schalter fail-open (fehlende Zeile = off)", fn: "evidence_enforced", from: "coalesce(nullif(evidence_setting('evidence_enforcement'), ''), 'on')", to: "coalesce(nullif(evidence_setting('evidence_enforcement'), ''), 'off')", tests: [NL] },
  { name: "evidence_set_setting ohne Uhrenquellen-Pruefung", fn: "evidence_set_setting", from: "AND coalesce(evidence_setting('evidence_clock_source'), 'js') <> 'db' THEN", to: "AND false THEN", tests: [NL] },
  { name: "evidence_set_setting ohne Akteurspflicht", fn: "evidence_set_setting", from: "IF p_actor IS NULL THEN", to: "IF false THEN", tests: [NL] },
  { name: "Turnier-Zusage uebernimmt Actor ungeprueft", fn: "evidence_tournament_event", from: "IF NEW.venue_confirmed_by IS NOT NULL AND evidence_has_venue_access(NEW.venue_id, NEW.venue_confirmed_by) THEN", to: "IF NEW.venue_confirmed_by IS NOT NULL THEN", tests: [NL] },
  { name: "Hallenwechsel setzt die Zusage nicht zurueck", fn: "tournaments_reset_confirmation", from: "IF TG_OP = 'UPDATE' AND OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN", to: "IF false THEN", tests: [NL] },
  { name: "Loeschschutz fuer Turniere fehlt", fn: "forbid_delete_with_evidence", from: "IF TG_TABLE_NAME = 'tournaments' AND EXISTS", to: "IF false AND EXISTS", tests: [NL] },
  { name: "Version 1 ohne Wartungsausnahme erlaubt", fn: "booking_evidence_before_insert", from: "IF NEW.hash_version = 1 AND coalesce(current_setting('socaz.ledger_maintenance', true), '') <> 'on' THEN", to: "IF false THEN", tests: [NL] },
  { name: "evidence_hash2 ohne enforced im Hash", fn: "evidence_hash2", from: "    CASE WHEN p_enforced IS NULL THEN '' WHEN p_enforced THEN '1' ELSE '0' END\n", to: "    ''\n", tests: [NL] },
  { name: "evidence_hash2 ohne statement_at im Hash", fn: "evidence_hash2", from: "    evidence_ts(p_statement_at),\n", to: "    '',\n", tests: [NL] },
  { name: "evidence_hash_of: unbekannte Version faellt auf Version 1 zurueck", fn: "evidence_hash_of", from: "  RAISE EXCEPTION 'unbekannte hash_version % (Eintrag %).', e.hash_version, e.id;", to: "  RETURN evidence_hash(e.seq, e.match_id, e.venue_id, e.round, e.job_id, e.kind, e.reason, e.at, e.actor_commitment, e.prev_hash);", tests: [NL] },
  { name: "UPDATE-Ereignis oeffnet eine neue Runde", fn: "evidence_hall_event", from: "CASE WHEN TG_OP = 'INSERT' AND k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END,", to: "CASE WHEN k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END,", tests: [HAKEN] },
  { name: "evidence_clean_reason entfernt keine Zero-Width-Zeichen", fn: "evidence_clean_reason", from: "\\u200B-\\u200F", to: "", tests: [NL, BASE] },
  { name: "Settings-Guard lehnt direkte Aenderung nicht ab", fn: "evidence_settings_guard", from: "AND coalesce(current_setting('socaz.evidence_setting_write', true), '') <> 'on' THEN", to: "AND false THEN", tests: [NL] },
];

const only = process.argv.slice(2).map(Number).filter(Boolean);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const migration = readFileSync("drizzle/0054_nachlieferung.sql", "utf8").split("--> statement-breakpoint");
const stmtOf = (fn) => {
  const s = migration.filter((x) => x.includes(`CREATE OR REPLACE FUNCTION ${fn}(`));
  if (s.length !== 1) throw new Error(`Funktion ${fn}: ${s.length} Statements`);
  return s[0];
};
const runTests = (files) => spawnSync("npx", ["vitest", "run", "--config", "vitest.integration.config.mts", ...files, "--testTimeout=60000"], { encoding: "utf8", shell: true, timeout: 280_000 });

const report = [];
try {
  for (const [i, m] of MUTATIONS.entries()) {
    if (only.length && !only.includes(i + 1)) continue;
    const orig = stmtOf(m.fn);
    if (orig.split(m.from).length !== 2) throw new Error(`Mutation ${i + 1}: Muster nicht genau einmal in ${m.fn}`);
    const mutated = orig.replace(m.from, () => m.to);
    try {
      await client.query(mutated);
      const r = runTests(m.tests);
      const red = r.status !== 0;
      const failed = ((r.stdout ?? "") + (r.stderr ?? "")).match(/Tests\s+(\d+) failed/);
      report.push({ nr: i + 1, name: m.name, rot: red, failed: failed ? Number(failed[1]) : 0 });
      console.log(`${red ? "ROT (gut)" : "GRUEN (Luecke!)"}  #${i + 1} ${m.name}${failed ? ` (${failed[1]} Tests rot)` : ""}`);
    } finally {
      await client.query(orig); // Original wiederherstellen
    }
  }
} finally {
  await client.end();
}
const lucken = report.filter((r) => !r.rot);
console.log(`\n${report.length - lucken.length}/${report.length} Mutationen entdeckt`);
console.log(JSON.stringify(report));
process.exit(lucken.length ? 1 : 0);
