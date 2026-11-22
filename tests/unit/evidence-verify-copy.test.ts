import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Die Pruefanweisung steht zweimal: src/server/evidence.ts (verifyEvidenceChain) und als Kopie VERIFY_SQL in scripts/measure-evidence.mjs. Beide muessen (ohne Whitespace-Unterschiede) gleich bleiben.
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const select = (src: string) => {
  const m = src.match(/select e\.seq, e\.hash[\s\S]*?order by e\.seq/);
  if (!m) throw new Error("Pruefanweisung nicht gefunden");
  return norm(m[0]).replace(/ from booking_evidence_counter c left join booking_evidence e on true left join booking_evidence_reason_text rt on rt\.evidence_id = e\.id where c\.id = 1 order by/, " from booking_evidence_counter c left join booking_evidence e on true left join booking_evidence_reason_text rt on rt.evidence_id = e.id where c.id = 1 order by");
};

describe("Prüfanweisung der Kette", () => {
  const ts = readFileSync("src/server/evidence.ts", "utf8");
  const mjs = readFileSync("scripts/measure-evidence.mjs", "utf8");
  it("Kopie in measure-evidence.mjs = Quelle in evidence.ts", () => {
    expect(select(mjs)).toBe(select(ts));
  });
  it("vergleicht Hashes mit IS DISTINCT FROM (NULL = Abweichung), nie mit <>", () => {
    expect(ts).toContain("e.hash is distinct from evidence_hash_of(e)");
    expect(ts).toContain("e.prev_hash is distinct from");
    expect(ts).not.toMatch(/e\.hash\s*<>/);
    expect(ts).not.toMatch(/e\.prev_hash\s*<>/);
    expect(mjs).not.toMatch(/e\.hash\s*<>/);
  });
  it("prueft das Commitment gegen die Nebentabelle", () => {
    expect(ts).toContain("then 'commitment'");
    expect(mjs).toContain("then 'commitment'");
  });
});
