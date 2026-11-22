import { describe, expect, it } from "vitest";
import { evidenceHash, verifyNdjson } from "../../scripts/lib/evidence-chain.mjs";

// Externe Prüfung der Beweiskette (Vertrag 009 M3c): die JS-Neuberechnung muss die SQL-Funktion evidence_hash exakt nachbilden. Hier gegen selbst gebaute Ketten (ohne Datenbank);
// der Integrationstest beweisprotokoll-export.test.ts vergleicht sie mit den echten Hashes der Datenbank.
type Entry = { seq: number; at: string; kind: string; matchId: string; venueId: string | null; jobId: string | null; round: number; reason: string; actorCommitment: string; prevHash: string; hash: string };
const M = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
function chain(n: number, reasons: string[] = []): Entry[] {
  const out: Entry[] = [];
  let prev = "";
  for (let i = 1; i <= n; i++) {
    const e: Entry = { seq: i, at: `2026-11-22T10:00:0${i}.123456Z`, kind: i % 2 ? "request_sent" : "accepted", matchId: M, venueId: V, jobId: null, round: 1, reason: reasons[i - 1] ?? "", actorCommitment: "", prevHash: prev, hash: "" };
    e.hash = evidenceHash(e);
    prev = e.hash;
    out.push(e);
  }
  return out;
}
const ndjson = (rows: Entry[]) => rows.map((r) => JSON.stringify(r)).join("\n");

describe("verifyNdjson (externe Prüfung)", () => {
  it("eine unveränderte Kette ist gültig; Kopf-Hash und Anzahl aus der externen Kopie passen", () => {
    const rows = chain(5, ["", "a|b;1:c", "Zeile1\nZeile2", "Ünïcödé 😀", ""]);
    expect(verifyNdjson(ndjson(rows))).toMatchObject({ ok: true, count: 5, headHash: rows[4].hash });
    expect(verifyNdjson(ndjson(rows), { headHash: rows[4].hash, count: 5 }).ok).toBe(true);
  });
  it("jede Änderung wird an der ersten abweichenden seq erkannt (Inhalt, prev_hash, Lücke, Anzahl, Kopf-Hash)", () => {
    const rows = chain(4);
    const tamper = (i: number, patch: Partial<Entry>) => ndjson(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    expect(verifyNdjson(tamper(1, { reason: "nachträglich" }))).toMatchObject({ ok: false, firstBadSeq: 2, reason: "hash" });
    expect(verifyNdjson(tamper(2, { prevHash: "x" }))).toMatchObject({ ok: false, firstBadSeq: 3, reason: "prev_hash" });
    expect(verifyNdjson(ndjson([rows[0], rows[2], rows[3]]))).toMatchObject({ ok: false, firstBadSeq: 3, reason: "seq-luecke" });
    expect(verifyNdjson(ndjson(rows.slice(0, 3)), { count: 4 })).toMatchObject({ ok: false, reason: "anzahl-abweichend" });
    expect(verifyNdjson(ndjson(rows), { headHash: "abc" })).toMatchObject({ ok: false, reason: "kopf-hash-abweichend" });
    expect(verifyNdjson("{kein json")).toMatchObject({ ok: false, reason: "zeile-kein-json" });
  });
  it("die Kodierung ist längenpräfixiert: verschobene Feldgrenzen ergeben einen anderen Hash", () => {
    const base = { seq: 1, at: "2026-11-22T10:00:00.000000Z", matchId: M, venueId: V, round: 1, jobId: null, actorCommitment: "", prevHash: "" };
    expect(evidenceHash({ ...base, kind: "x|y", reason: "z" })).not.toBe(evidenceHash({ ...base, kind: "x", reason: "y|z" }));
    expect(evidenceHash({ ...base, kind: "accepted", reason: null })).toBe(evidenceHash({ ...base, kind: "accepted", reason: "" }));
  });
});
