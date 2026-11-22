import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVIDENCE_CLOCK } from "@/lib/evidence-clock";

// 011 M2a / Plan 16g.5: Hallen-Fristen werden mit der Datenbankzeit entschieden. Quelltext-Test über veto.ts (Marker + keine JS-Uhr in der Ablaufprüfung).
const src = readFileSync("src/server/veto.ts", "utf8");
const NL = String.fromCharCode(10);
const body = (name: string) => {
  const i = src.indexOf(name);
  expect(i).toBeGreaterThan(-1);
  const j = src.indexOf(NL + "}" + NL, i);
  return src.slice(i, j);
};

describe("Uhrenquelle der Hallen-Fristen", () => {
  it("Marker steht auf db und veto.ts nutzt ihn", () => {
    expect(EVIDENCE_CLOCK).toBe("db");
    expect(src).toContain("HALL_CLOCK_SOURCE = EVIDENCE_CLOCK");
  });
  it("settleHallCheck entscheidet Ablauf per SQL-Zeit, ohne JS-Vergleich mit der Frist", () => {
    const b = body("export async function settleHallCheck");
    expect(b).toContain("hallExpiredInDb");
    expect(b).not.toMatch(/vetoTurnDeadline\s*(<=|<|>=|>)\s*now/);
  });
  it("hallExpiredInDb: transaction_timestamp(), strikt größer", () => {
    expect(body("async function hallExpiredInDb")).toContain("transaction_timestamp() > veto_turn_deadline");
  });
  it("advanceVetos: Hallen-Fristen mit now() der Datenbank, strikt", () => {
    const b = body("export async function advanceVetos");
    expect(b).toContain("} < now()");
    expect(b).not.toMatch(/eq\(matches\.vetoStatus, "halls"\)[^\n]*lt\(matches\.vetoTurnDeadline, now\)/);
  });
  it("answerHallRequest: Frist per transaction_timestamp(), nicht new Date()", () => {
    expect(body("export async function answerHallRequest")).toContain("transaction_timestamp() > veto_turn_deadline");
  });
});
