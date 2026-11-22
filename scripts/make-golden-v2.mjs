// Erzeugt tests/fixtures/evidence-golden-v2.json (Hash Version 2, je Quelle (a) Spiel-Antwort, (b) Anfrage/Auftrag, (c) Turnier-Zusage, (d) late_attempt): die Hashes rechnet die SQL-Funktion evidence_hash2 der
// Entwicklungs-DB, der JS-Pruefer (unabhaengige Neuberechnung) MUSS dasselbe liefern, sonst bricht das Skript ab. Danach sind die Werte feste Literale (nicht neu erzeugen, ausser die Feldliste aendert sich bewusst).
// Aufruf: node scripts/make-golden-v2.mjs   (DATABASE_URL aus .env.local; nur lesend, ohne Schreiben in der DB)
import { writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { evidenceHash2 } from "./lib/evidence-chain.mjs";

process.loadEnvFile(".env.local");
const V = "11111111-1111-4111-8111-111111111111";
const W = "22222222-2222-4222-8222-222222222222";
const at = "2027-03-04T05:06:07.123456Z";
const base = { subject: "match", seq: 1, matchId: V, tournamentId: null, venueId: W, round: 1, jobId: null, reasonCode: "", reasonCommitment: "", at, actorCommitment: "", prevHash: "", deadlineAt: null, decidedAt: null, statementAt: null, enforced: null };
const cases = [
  { source: "a-spiel-antwort-declined-on", ...base, seq: 2, kind: "declined", reasonCode: "belegt", reasonCommitment: "ab".repeat(32), actorCommitment: "cd".repeat(32), prevHash: "ef".repeat(32), deadlineAt: "2027-03-04T06:00:00.000000Z", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.250000Z", enforced: true },
  { source: "a-spiel-antwort-accepted-off", ...base, seq: 3, kind: "accepted", deadlineAt: "2027-03-04T06:00:00.000000Z", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.250000Z", enforced: false },
  { source: "a-spiel-ablauf-expired", ...base, seq: 4, kind: "expired", deadlineAt: "2027-03-04T05:00:00.000000Z", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.250000Z", enforced: true },
  { source: "b-anfrage-request-sent", ...base, seq: 5, kind: "request_sent" },
  { source: "b-auftrag-job-open", ...base, seq: 6, kind: "job_open", jobId: V },
  { source: "c-turnier-zusage", ...base, seq: 7, subject: "tournament", matchId: null, tournamentId: V, kind: "accepted", actorCommitment: "cd".repeat(32), decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.000001Z" },
  { source: "d-late-attempt", ...base, seq: 8, kind: "late_attempt", actorCommitment: "cd".repeat(32), deadlineAt: "2027-03-04T05:00:00.000000Z", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.250000Z", enforced: false },
  { source: "e-unicode-und-sonderfall", ...base, seq: 9, kind: "declined", reasonCode: "sonstiges", reasonCommitment: "\u00e4\u00f6\u00fc\u00df\ud83c\udfdf;1:x|", deadlineAt: "2027-03-04T06:00:00.000000Z", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.000001Z", enforced: true },
];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
for (const k of cases) {
  const r = await c.query(
    "select evidence_hash2($1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,$8,$9,$10,$11::timestamptz,$12,$13,$14::timestamptz,$15::timestamptz,$16::timestamptz,$17::boolean) as h",
    [k.subject, k.seq, k.matchId, k.tournamentId, k.venueId, k.round, k.jobId, k.kind, k.reasonCode, k.reasonCommitment, k.at, k.actorCommitment, k.prevHash, k.deadlineAt, k.decidedAt, k.statementAt, k.enforced],
  );
  k.hash = r.rows[0].h;
  if (evidenceHash2(k) !== k.hash) throw new Error("JS und SQL weichen ab: " + k.source);
}
await c.end();
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/evidence-golden-v2.json", JSON.stringify({ note: "Hash Version 2: erzeugt mit evidence_hash2 (SQL) und unabhaengig vom JS-Pruefer bestaetigt; feste Literale, nicht neu erzeugen.", rows: cases }, null, 2) + "\n");
writeFileSync(
  "tests/fixtures/evidence-golden-spec.json",
  JSON.stringify(
    {
      version: 2,
      encoding: "je Teil '<Anzahl Bytes UTF-8>:<Text>;', SHA-256 ueber die Verkettung, hex; NULL/fehlend = leerer Teil ('0:;')",
      fields: ["'v2'", "subject", "seq", "match_id", "tournament_id", "venue_id", "round", "job_id", "kind", "reason_code", "reason_commitment", "at", "actor_commitment", "prev_hash", "deadline_at", "decided_at", "statement_at", "enforced"],
      times: "UTC, 'YYYY-MM-DDTHH:MI:SS.UUUUUUZ' (Mikrosekunden, immer 6 Stellen)",
      enforced: "true='1', false='0', NULL=''",
      sources: { "a": "Spiel-Antwort/Ablauf: deadline/decided/statement/enforced aus den Spalten der Anfragezeile", "b": "Anfrage und Auftrag: deadline/decided/statement/enforced leer", "c": "Turnier-Zusage: statement_at = decided_at, deadline leer, enforced leer", "d": "late_attempt: deadline, decided (> deadline), statement = clock_timestamp, enforced = Schalterstand" },
    },
    null,
    2,
  ) + "\n",
);
console.log("Golden v2:", cases.length, "Faelle");
