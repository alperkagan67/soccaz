import { describe, expect, it } from "vitest";
import { invoiceNumber, isPeriod, parseVatMode, previousPeriod, vatCentsOf, vatPercentOf } from "@/lib/invoice";

// Vertrag 009 M2: Rechnung, reine Funktionen. Die steuerliche Regel (Satz, Rundung, Nummernformat) legt der Steuerberater fest; getestet wird die technische Umsetzung.
describe("Umsatzsteuer-Schalter", () => {
  it("nur 19 und kleinunternehmer; kein Standardwert", () => {
    expect(parseVatMode("19")).toBe("19");
    expect(parseVatMode(19)).toBe("19");
    expect(parseVatMode("kleinunternehmer")).toBe("kleinunternehmer");
    for (const bad of ["", null, undefined, "7", 7, "Kleinunternehmer", {}]) expect(parseVatMode(bad as never), String(bad)).toBeNull();
  });
  it("Satz je Schalter", () => {
    expect(vatPercentOf("19")).toBe(19);
    expect(vatPercentOf("kleinunternehmer")).toBe(0);
  });
});

describe("USt einmal auf die Nettosumme, Rundung als Parameter", () => {
  it("kaufmännisch gerundet (Standard)", () => {
    expect(vatCentsOf(999, "19")).toBe(190); // 189,81
    expect(vatCentsOf(1000, "19")).toBe(190);
    expect(vatCentsOf(50, "19")).toBe(10); // 9,5 -> 10
    expect(vatCentsOf(1, "19")).toBe(0);
  });
  it("abrunden als Parameter", () => {
    expect(vatCentsOf(999, "19", "down")).toBe(189);
    expect(vatCentsOf(50, "19", "down")).toBe(9);
  });
  it("Kleinunternehmer: 0", () => {
    expect(vatCentsOf(123_456, "kleinunternehmer")).toBe(0);
  });
  it("einmal auf die Summe weicht von der Summe der Zeilen-USt ab (deshalb nie je Zeile rechnen)", () => {
    const lines = [100, 100, 100];
    const perLine = lines.reduce((s, l) => s + vatCentsOf(l, "19"), 0);
    expect(vatCentsOf(300, "19")).toBe(57);
    expect(perLine).toBe(57); // 19+19+19
    const odd = [33, 33, 33];
    expect(odd.reduce((s, l) => s + vatCentsOf(l, "19"), 0)).not.toBe(vatCentsOf(99, "19"));
  });
  it("lehnt ungültige Beträge ab", () => {
    expect(() => vatCentsOf(-1, "19")).toThrow();
    expect(() => vatCentsOf(1.5, "19")).toThrow();
  });
});

describe("Nummer und Zeitraum", () => {
  it("Format RE-JJJJ-000001, getrennt von SOC-JJJJ", () => {
    expect(invoiceNumber(2026, 1)).toBe("RE-2026-000001");
    expect(invoiceNumber(2026, 123456)).toBe("RE-2026-123456");
  });
  it("Zeitraum JJJJ-MM", () => {
    expect(isPeriod("2026-11")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "26-11", "2026-1", "2026-11-01", ""]) expect(isPeriod(bad), bad).toBe(false);
  });
  it("Vormonat, auch über den Jahreswechsel", () => {
    expect(previousPeriod(new Date("2026-12-01T03:00:00Z"))).toBe("2026-11");
    expect(previousPeriod(new Date("2027-01-01T03:00:00Z"))).toBe("2026-12");
  });
});
