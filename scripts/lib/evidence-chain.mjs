// Externe Pruefung der Beweiskette (Vertrag 009 M3c, Plan 12 e): rechnet die Hash-Kette aus dem Gesamtketten-Export (NDJSON) ohne Datenbank nach. Keine Abhaengigkeiten.
// Die Kodierung entspricht der SQL-Funktion evidence_hash (Migration): je Feld "<Anzahl Bytes UTF-8>:<Text>;" in fester Reihenfolge, SHA-256, hex.
import { createHash } from "node:crypto";

export function evidenceHash(e) {
  const parts = [String(e.seq), e.matchId, e.venueId ?? "", String(e.round), e.jobId ?? "", e.kind, e.reason ?? "", e.at, e.actorCommitment ?? "", e.prevHash ?? ""];
  const buf = parts.map((p) => `${Buffer.byteLength(p, "utf8")}:${p};`).join("");
  return createHash("sha256").update(buf, "utf8").digest("hex");
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
    if (evidenceHash(e) !== e.hash) return { ok: false, count: lines.length, headHash: head, firstBadSeq: e.seq, reason: "hash" };
    prev = e.hash;
    head = e.hash;
  }
  if (expected.count !== undefined && expected.count !== lines.length) return { ok: false, count: lines.length, headHash: head, firstBadSeq: Math.min(expected.count, lines.length) + 1, reason: "anzahl-abweichend" };
  if (expected.headHash !== undefined && expected.headHash !== head) return { ok: false, count: lines.length, headHash: head, firstBadSeq: lines.length, reason: "kopf-hash-abweichend" };
  return { ok: true, count: lines.length, headHash: head, firstBadSeq: null, reason: null };
}
