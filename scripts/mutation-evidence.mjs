// Mutationstest der Nachlieferung 009 M3 (Migration 0054): jede Mutation aendert EINE Funktion der Worker-Datenbank (Text aus der Migrationsdatei, gezielt veraendert), laeuft die zugehoerigen
// Integrationstests und verlangt, dass sie ROT werden. Danach wird die Originalfunktion wiederhergestellt (auch bei Abbruch). NUR gegen eine Worker-/Testdatenbank (nie soccav2); nie parallel zu anderen
// Integrationslaeufen (gemeinsame DB). Aufruf: node scripts/mutation-evidence.mjs [Nummer ...]   (DATABASE_URL aus .env.local, wird nicht ausgegeben)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import pg from "pg";

process.loadEnvFile(".env.local");
const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || dbName === "soccav2" || !/^soccaz_w\d$/.test(dbName)) throw new Error("nur Worker-Datenbank soccaz_w1..w4");

const PFX = "soc" + "az."; // Präfix der Sitzungswerte nicht als Literal (maintenance-guard-Test)
const TEXT_DELETE = "    await tx.execute(sql`delete from booking_evidence_reason_text where evidence_id in (select evidence_id from evidence_actor where user_id = ${userId})`);\n";
const ACTOR_UPDATE = "    await tx.update(evidenceActor).set({ userId: null, name: null, email: null }).where(eq(evidenceActor.userId, userId));\n";
const cut = (s, part) => s.split(part).join("");
const CHAIN_OK = "= report.chain.ok" + String.fromCharCode(10) + "    ? await sweepReasonText";
const CHAIN_TRUE = "= true" + String.fromCharCode(10) + "    ? await sweepReasonText";
const AUF = "tests/integration/beweisprotokoll-aufbewahrung.test.ts";
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
  { name: "Version 1 ohne Wartungsausnahme erlaubt", fn: "booking_evidence_before_insert", from: `IF NEW.hash_version = 1 AND coalesce(current_setting('${PFX}ledger_maintenance', true), '') <> 'on' THEN`, to: "IF false THEN", tests: [NL] },
  { name: "evidence_hash2 ohne enforced im Hash", fn: "evidence_hash2", from: "    CASE WHEN p_enforced IS NULL THEN '' WHEN p_enforced THEN '1' ELSE '0' END\n", to: "    ''\n", tests: [NL] },
  { name: "evidence_hash2 ohne statement_at im Hash", fn: "evidence_hash2", from: "    evidence_ts(p_statement_at),\n", to: "    '',\n", tests: [NL] },
  { name: "evidence_hash_of: unbekannte Version faellt auf Version 1 zurueck", fn: "evidence_hash_of", from: "  RAISE EXCEPTION 'unbekannte hash_version % (Eintrag %).', e.hash_version, e.id;", to: "  RETURN evidence_hash(e.seq, e.match_id, e.venue_id, e.round, e.job_id, e.kind, e.reason, e.at, e.actor_commitment, e.prev_hash);", tests: [NL] },
  { name: "UPDATE-Ereignis oeffnet eine neue Runde", fn: "evidence_hall_event", from: "CASE WHEN TG_OP = 'INSERT' AND k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END,", to: "CASE WHEN k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END,", tests: [HAKEN] },
  { name: "evidence_clean_reason entfernt keine Zero-Width-Zeichen", fn: "evidence_clean_reason", from: "\\u200B-\\u200F", to: "", tests: [NL, BASE] },
  { name: "Settings-Guard lehnt direkte Aenderung nicht ab", fn: "evidence_settings_guard", from: `AND coalesce(current_setting('${PFX}evidence_setting_write', true), '') <> 'on' THEN`, to: "AND false THEN", tests: [NL] },
  { name: "Einstellungsschutz prueft nur OLD.key (Umbenennen eines freien Schluessels in einen geschuetzten moeglich)", fn: "evidence_settings_guard", from: "     AND (TG_OP <> 'UPDATE' OR NEW.key NOT IN ('evidence_enforcement', 'evidence_clock_source', 'evidence_reason_retention_days', 'evidence_cutover_at', 'evidence_tournament_cutover_at')) THEN", to: "     THEN", tests: [NL] },
  { name: "Frist wird im Sofort-Trigger nicht gelesen (Frist NULL)", fn: "evidence_hall_before", from: "SELECT veto_turn_deadline INTO NEW.reply_deadline FROM matches WHERE id = NEW.match_id;", to: "NEW.reply_deadline := NULL;", tests: [NL] },
  {
    name: "Turnier-Trigger ohne WHEN (feuert bei jedem UPDATE)",
    apply: ["DROP TRIGGER IF EXISTS tournaments_evidence_upd ON tournaments", "CREATE CONSTRAINT TRIGGER tournaments_evidence_upd AFTER UPDATE ON tournaments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_tournament_event()"],
    restore: ["DROP TRIGGER IF EXISTS tournaments_evidence_upd ON tournaments", "CREATE CONSTRAINT TRIGGER tournaments_evidence_upd AFTER UPDATE ON tournaments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.venue_confirmed_at IS NULL AND NEW.venue_confirmed_at IS NOT NULL) EXECUTE FUNCTION evidence_tournament_event()"],
    tests: [NL],
  },
  { name: "evidence_hash2 ohne subject im Hash", fn: "evidence_hash2", from: "    coalesce(p_subject, ''),\n", to: "", tests: [NL] },
  { name: "evidence_hash2 ohne tournament_id im Hash", fn: "evidence_hash2", from: "    coalesce(p_tournament_id::text, ''),\n", to: "", tests: [NL] },
  { name: "evidence_hash2 ohne reason_commitment im Hash", fn: "evidence_hash2", from: "    coalesce(p_reason_commitment, ''),\n", to: "", tests: [NL] },
  { name: "Commitment ohne Salz", fn: "evidence_write", from: "sha256(convert_to(v_rsalt || ':' || v_reason, 'UTF8'))", to: "sha256(convert_to(':' || v_reason, 'UTF8'))", tests: [NL] },
  { name: "Sitzungswert-Schluessel ohne Betreff-Praefix", fn: "evidence_session_key", from: "md5('m:' || p_match::text", to: "md5(p_match::text", tests: [NL] },
  { name: "zu lange Begruendung wird nicht abgelehnt", fn: "evidence_check_reason", from: "IF v_text <> '' AND char_length(v_text) NOT BETWEEN 3 AND 200 THEN", to: "IF false THEN", tests: [NL] },
  { name: "hash_version ignoriert (immer Version 1)", fn: "evidence_hash_of", from: "  IF e.hash_version = 1 THEN", to: "  IF true THEN", tests: [NL] },
  {
    name: "XOR-CHECK (Spiel/Turnier) entfernt",
    apply: ["ALTER TABLE booking_evidence DROP CONSTRAINT booking_evidence_subject_xor"],
    restore: ["ALTER TABLE booking_evidence ADD CONSTRAINT booking_evidence_subject_xor CHECK ((subject = 'match' and match_id is not null and tournament_id is null) or (subject = 'tournament' and tournament_id is not null and match_id is null))"],
    tests: [NL],
  },
  {
    name: "CHECK enforced nur bei Antwort-Arten entfernt",
    apply: ["ALTER TABLE booking_evidence DROP CONSTRAINT booking_evidence_enforced_check"],
    restore: ["ALTER TABLE booking_evidence ADD CONSTRAINT booking_evidence_enforced_check CHECK (enforced is null or (subject = 'match' and kind in ('accepted', 'declined', 'expired', 'late_attempt')))"],
    tests: [NL],
  },
  {
    name: "deleteAccount loescht den Klartext nicht",
    file: "src/server/account.ts",
    transform: (s) => cut(s, TEXT_DELETE),
    tests: [NL],
  },
  {
    name: "deleteAccount leert evidence_actor VOR dem Klartext-Delete (Reihenfolge vertauscht)",
    file: "src/server/account.ts",
    transform: (s) => (s.includes(TEXT_DELETE) && s.includes(ACTOR_UPDATE) ? cut(s, TEXT_DELETE).replace(ACTOR_UPDATE, ACTOR_UPDATE + TEXT_DELETE) : s),
    tests: [NL],
  },
  { name: "Pruefer ohne Commitment-Pruefung", file: "src/server/evidence.ts", transform: (s) => s.replace("when rt.evidence_id is not null and", "when false and"), tests: [NL] },
  { name: "Aufbewahrung: Stichtag umgedreht (loescht junge Eintraege)", file: "src/server/evidence-head.ts", transform: (s) => s.replace("e.at < ${cutoff.toISOString()}", "e.at > ${cutoff.toISOString()}"), tests: [AUF] },
  { name: "Aufbewahrung loescht auch evidence_actor", file: "src/server/evidence-head.ts", transform: (s) => s.replace("  const deleted = (r as", "  await db.execute(sql`delete from evidence_actor where true`);\n  const deleted = (r as"), tests: [AUF] },
  { name: "Aufbewahrung: D = 0 loescht trotzdem", file: "src/server/evidence-head.ts", transform: (s) => s.replace("    const raw = String(", "    await db.execute(sql`delete from booking_evidence_reason_text`);" + String.fromCharCode(10) + "    const raw = String("), tests: [AUF] },
  { name: "Aufbewahrung: Obergrenze 36500 fehlt (36501 gilt als aktiv)", file: "src/server/evidence-head.ts", transform: (s) => s.replace("n >= 1 && n <= RETENTION_MAX_DAYS", "n >= 1"), tests: [AUF] },
  { name: "Aufbewahrung loescht auch bei ungueltiger Kette (Pruefung nicht vorgeschaltet)", file: "src/server/evidence-head.ts", transform: (s) => s.replace(CHAIN_OK, CHAIN_TRUE), tests: [AUF] },
  { name: "Aufbewahrung: Stichtag inklusiv (<= statt <)", file: "src/server/evidence-head.ts", transform: (s) => s.replace("e.at < " + String.fromCharCode(36) + "{cutoff", "e.at <= " + String.fromCharCode(36) + "{cutoff"), tests: [AUF] },
  { name: "Aufbewahrung: Batch-Limit entfernt", file: "src/server/evidence-head.ts", transform: (s) => s.replace(" order by e.seq limit " + String.fromCharCode(36) + "{batch}", ""), tests: [AUF] },
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

// Hinweis: bei hartem Abbruch (Prozess beendet, Strg+C) kann eine Mutation stehen bleiben: (1) Worker-Datenbank neu anlegen (node scripts/worktree.mjs) oder die Funktion aus der Migration per CREATE OR REPLACE nachziehen, (2) QUELLDATEIEN (Mutationen mit 'file': src/server/account.ts, src/server/evidence.ts) mit 'git status' und 'git diff src' pruefen und per 'git checkout -- <datei>' zuruecksetzen.
const report = [];
try {
  for (const [i, m] of MUTATIONS.entries()) {
    if (only.length && !only.includes(i + 1)) continue;
    if (m.file) {
      const orig = readFileSync(m.file, "utf8");
      const mutated = m.transform(orig);
      if (mutated === orig) throw new Error(`Mutation ${i + 1}: transform aendert nichts`);
      try {
        writeFileSync(m.file, mutated);
        const r = runTests(m.tests);
        const red = r.status !== 0;
        report.push({ nr: i + 1, name: m.name, rot: red, failed: 0 });
        console.log(`${red ? "ROT (gut)" : "GRUEN (Luecke!)"}  #${i + 1} ${m.name}`);
      } finally {
        writeFileSync(m.file, orig); // Quelldatei wiederherstellen
      }
      continue;
    }
    const custom = Array.isArray(m.apply);
    const orig = custom ? "" : stmtOf(m.fn);
    if (!custom && orig.split(m.from).length !== 2) throw new Error(`Mutation ${i + 1}: Muster nicht genau einmal in ${m.fn}`);
    const mutated = custom ? "" : orig.replace(m.from, () => m.to);
    try {
      if (custom) for (const s of m.apply) await client.query(s);
      else await client.query(mutated);
      const r = runTests(m.tests);
      const red = r.status !== 0;
      const failed = ((r.stdout ?? "") + (r.stderr ?? "")).match(/Tests\s+(\d+) failed/);
      report.push({ nr: i + 1, name: m.name, rot: red, failed: failed ? Number(failed[1]) : 0 });
      console.log(`${red ? "ROT (gut)" : "GRUEN (Luecke!)"}  #${i + 1} ${m.name}${failed ? ` (${failed[1]} Tests rot)` : ""}`);
    } finally {
      if (custom) for (const s of m.restore) await client.query(s);
      else await client.query(orig); // Original wiederherstellen
    }
  }
} finally {
  await client.end();
}
const lucken = report.filter((r) => !r.rot);
console.log(`\n${report.length - lucken.length}/${report.length} Mutationen entdeckt`);
console.log(JSON.stringify(report));
process.exit(lucken.length ? 1 : 0);
