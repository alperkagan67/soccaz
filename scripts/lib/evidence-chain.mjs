// Externe Pruefung der Beweiskette (Vertrag 009 M3c, Plan 12 e): rechnet die Hash-Kette aus dem Gesamtketten-Export (NDJSON) ohne Datenbank nach. Keine Abhaengigkeiten.
// Die Kodierung entspricht der SQL-Funktion evidence_hash (Migration): je Feld "<Anzahl Bytes UTF-8>:<Text>;" in fester Reihenfolge, SHA-256, hex.
import { createHash } from "node:crypto";

const enc = (parts) => parts.map((p) => `${Buffer.byteLength(p, "utf8")}:${p};`).join("");
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** Version 1 (eingefroren, SQL evidence_hash): 10 Teile. */
export function evidenceHash(e) {
  const parts = [String(e.seq), e.matchId, e.venueId ?? "", String(e.round), e.jobId ?? "", e.kind, e.reason ?? "", e.at, e.actorCommitment ?? "", e.prevHash ?? ""];
  return sha(enc(parts));
}

/**
 * Version 2 (SQL evidence_hash2, Plan 16g.2/16h.1): v2, subject, seq, match_id, tournament_id, venue_id, round, job_id, kind, reason_code, reason_commitment, at, actor_commitment, prev_hash,
 * deadline_at, decided_at, statement_at, enforced. NULL/fehlend = leerer Teil; Zeiten als UTC-Text mit Mikrosekunden (wie im Export); enforced true/false/null = '1'/'0'/''.
 */
export function evidenceHash2(e) {
  const parts = [
    "v2", e.subject ?? "", String(e.seq), e.matchId ?? "", e.tournamentId ?? "", e.venueId ?? "", String(e.round), e.jobId ?? "", e.kind,
    e.reasonCode ?? "", e.reasonCommitment ?? "", e.at, e.actorCommitment ?? "", e.prevHash ?? "", e.deadlineAt ?? "", e.decidedAt ?? "", e.statementAt ?? "",
    e.enforced === true ? "1" : e.enforced === false ? "0" : "",
  ];
  return sha(enc(parts));
}

/** Hash nach hashVersion (fehlend = 1, Altexporte); unbekannte Version = null (der Pruefer meldet 'hash', kein stilles Zurueckfallen). */
export function evidenceHashOf(e) {
  const v = e.hashVersion ?? 1;
  if (v === 1) return e.matchId ? evidenceHash(e) : null;
  if (v === 2) return evidenceHash2(e);
  return null;
}

/**
 * Prueft den Export: lueckenlose seq ab 1, prevHash = Hash der Vorgaengerzeile, hash = Neuberechnung. Optional: erwarteter Kopf-Hash (und Anzahl) aus der externen Ablage.
 * Gibt { ok, count, headHash, firstBadSeq, reason } zurueck (erste abweichende seq).
 */
export function verifyNdjson(text, expected = {}) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  let prev = "";
  let head = "";
  for (let i = 0; i < lines.length; i++) {
    let e;
    try {
      e = JSON.parse(lines[i]);
    } catch {
      return { ok: false, count: lines.length, headHash: head, firstBadSeq: i + 1, reason: "zeile-kein-json" };
    }
    if (e.seq !== i + 1) return { ok: false, count: lines.length, headHash: head, firstBadSeq: e.seq ?? i + 1, reason: "seq-luecke" };
    if ((e.prevHash ?? "") !== prev) return { ok: false, count: lines.length, headHash: head, firstBadSeq: e.seq, reason: "prev_hash" };
    if (evidenceHashOf(e) !== e.hash) return { ok: false, count: lines.length, headHash: head, firstBadSeq: e.seq, reason: "hash" };
    prev = e.hash;
    head = e.hash;
  }
  if (expected.count !== undefined && expected.count !== lines.length) return { ok: false, count: lines.length, headHash: head, firstBadSeq: Math.min(expected.count, lines.length) + 1, reason: "anzahl-abweichend" };
  if (expected.headHash !== undefined && expected.headHash !== head) return { ok: false, count: lines.length, headHash: head, firstBadSeq: lines.length, reason: "kopf-hash-abweichend" };
  return { ok: true, count: lines.length, headHash: head, firstBadSeq: null, reason: null };
}
