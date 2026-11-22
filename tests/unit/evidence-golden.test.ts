import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evidenceHash, evidenceHash2, evidenceHashOf } from "../../scripts/lib/evidence-chain.mjs";

// Golden-Vektoren (feste Literale): Version 1 unter dem Stand 0053 erzeugt, Version 2 mit evidence_hash2 und unabhaengig bestaetigt. Der JS-Pruefer muss sie byte-gleich nachrechnen.
const v1 = JSON.parse(readFileSync("tests/fixtures/evidence-golden-v1.json", "utf8")).rows as Record<string, unknown>[];
const v2 = JSON.parse(readFileSync("tests/fixtures/evidence-golden-v2.json", "utf8")).rows as (Record<string, unknown> & { source: string; hash: string })[];

// VON HAND berechnete Vektoren (unabhaengig von jeder Repo-Funktion): Rechenweg in der Shell, je Teil "<Anzahl Bytes>:<Text>;" aneinanderreihen, dann SHA-256:
//   hp() { buf=""; for p in "$@"; do n=$(printf '%s' "$p" | wc -c); buf="$buf$n:$p;"; done; printf '%s' "$buf" | sha256sum | cut -d' ' -f1; }
//   V=11111111-1111-4111-8111-111111111111; W=22222222-2222-4222-8222-222222222222; AT=2027-03-04T05:06:07.123456Z; D=2027-03-04T05:06:07.000001Z
//   A: hp v2 match 1 $V '' '' 1 '' request_sent '' '' $AT '' '' '' '' '' ''
//   B: hp v2 tournament 7 '' $V $W 1 '' accepted '' '' $AT cd '' '' $D $D ''
export const HAND_VECTORS = [
  { name: "A leere v2-Zeile (Anfrage)", row: { subject: "match", seq: 1, matchId: "11111111-1111-4111-8111-111111111111", round: 1, kind: "request_sent", at: "2027-03-04T05:06:07.123456Z" }, hash: "50ac0329705410f3d0be48753f5c9cba796543d6cd0320217957882a09907d1e" },
  { name: "B Turnier-Zusage", row: { subject: "tournament", seq: 7, tournamentId: "11111111-1111-4111-8111-111111111111", venueId: "22222222-2222-4222-8222-222222222222", round: 1, kind: "accepted", at: "2027-03-04T05:06:07.123456Z", actorCommitment: "cd", decidedAt: "2027-03-04T05:06:07.000001Z", statementAt: "2027-03-04T05:06:07.000001Z" }, hash: "8ef46ae7c1af66303493da120dca794525b2323f1f37c7e20936d096dd9c7fec" },
] as const;

describe("Golden-Vektoren", () => {
  it("von Hand (Shell, sha256sum) berechnete Vektoren = JS-Pruefer", () => {
    for (const v of HAND_VECTORS) expect(evidenceHash2(v.row), v.name).toBe(v.hash);
  });
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
