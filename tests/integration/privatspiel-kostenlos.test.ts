import { describe, expect, it } from "vitest";
import { parseRentFuerSchalter } from "@/server/privategame";

// Zahlungen AUS: Privatspiele nur kostenlos (Miete wird im Server auf 0 erzwungen); AN: wie bisher (parseRentInput).
describe("parseRentFuerSchalter", () => {
  it("AUS: immer 0, egal was das Formular sendet (auch ein manipulierter Betrag oder gar keine Wahl)", () => {
    expect(parseRentFuerSchalter(true, "amount", "120")).toBe(0);
    expect(parseRentFuerSchalter(true, "amount", "999999")).toBe(0);
    expect(parseRentFuerSchalter(true, "free", "")).toBe(0);
    expect(parseRentFuerSchalter(true, "", "")).toBe(0);
    expect(parseRentFuerSchalter(true, "unsinn", "abc")).toBe(0);
  });
  it("AN: unverändert (Betrag in Cent, kostenlos = 0, ohne Wahl oder über 1.000 Euro Fehler)", () => {
    expect(parseRentFuerSchalter(false, "amount", "120")).toBe(12000);
    expect(parseRentFuerSchalter(false, "free", "")).toBe(0);
    expect(() => parseRentFuerSchalter(false, "", "")).toThrow(/Hallenmiete/);
    expect(() => parseRentFuerSchalter(false, "amount", "1001")).toThrow(/Hallenmiete/);
  });
});
