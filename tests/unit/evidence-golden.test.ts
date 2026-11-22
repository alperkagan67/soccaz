import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evidenceHash, evidenceHash2, evidenceHashOf } from "../../scripts/lib/evidence-chain.mjs";

// Golden-Vektoren (feste Literale): Version 1 unter dem Stand 0053 erzeugt, Version 2 mit evidence_hash2 und unabhaengig bestaetigt. Der JS-Pruefer muss sie byte-gleich nachrechnen.
const v1 = JSON.parse(readFileSync("tests/fixtures/evidence-golden-v1.json", "utf8")).rows as Record<string, unknown>[];
const v2 = JSON.parse(readFileSync("tests/fixtures/evidence-golden-v2.json", "utf8")).rows as (Record<string, unknown> & { source: string; hash: string })[];

describe("Golden-Vektoren", () => {
  it("Version 1: JS = Fixture", () => {
    for (const r of v1) expect(evidenceHash(r)).toBe(r.hash);
  });
  it("Version 2: JS = Fixture je Quelle (a bis e)", () => {
    expect(v2.length).toBeGreaterThanOrEqual(7);
    for (const r of v2) expect(evidenceHash2(r), r.source).toBe(r.hash);
  });
  it("jedes Feld geht in den Hash ein (Mutation je Feld ändert den Hash); unbekannte Version = null", () => {
    const r = v2[0];
    for (const f of ["subject", "seq", "matchId", "tournamentId", "venueId", "round", "jobId", "kind", "reasonCode", "reasonCommitment", "at", "actorCommitment", "prevHash", "deadlineAt", "decidedAt", "statementAt", "enforced"]) {
      const changed = { ...r, [f]: typeof r[f] === "number" ? (r[f] as number) + 1 : typeof r[f] === "boolean" ? !r[f] : r[f] === null ? "x" : `${r[f]}x` };
      expect(evidenceHash2(changed), f).not.toBe(r.hash);
    }
    expect(evidenceHashOf({ ...r, hashVersion: 3 })).toBeNull();
  });
});
