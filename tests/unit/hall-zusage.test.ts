import { describe, expect, it } from "vitest";
import { hallZusageOk } from "@/server/tournament-venue";

// 012 M5-1: Wahrheitstabelle der Zusage-Schnittstelle (Attrappe jetzt; die Echtlogik aus 011 M1 muss dieselbe Tabelle erfuellen, siehe Plan 3.6).
describe("hallZusageOk", () => {
  const at = new Date();
  it.each([
    ["kein Zugang noetig, keine Zusage", false, null, true],
    ["kein Zugang noetig, Zusage da", false, at, true],
    ["Zugang noetig, Zusage fehlt", true, null, false],
    ["Zugang noetig, Zusage da", true, at, true],
    ["noch nicht eingefroren (null), keine Zusage", null, null, true],
  ] as const)("%s", (_name, required, confirmed, ok) => {
    expect(hallZusageOk({ venueAccessRequiredSnapshot: required, venueConfirmedAt: confirmed })).toBe(ok);
  });
});
