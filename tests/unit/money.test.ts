import { describe, expect, it } from "vitest";
import { ceilDiv, finalShareFor, formatEuro, isValidTopup, parseEuro, reservationFor, shareFor } from "@/lib/money";

describe("Beträge", () => {
  it("parst Eingaben in Cent", () => {
    expect(parseEuro("12,50")).toBe(1250);
    expect(parseEuro("12.5")).toBe(1250);
    expect(parseEuro("12")).toBe(1200);
    expect(parseEuro(" 20 € ")).toBe(2000);
    expect(parseEuro("0,05")).toBe(5);
  });
  it("lehnt ungültige Eingaben ab", () => {
    for (const bad of ["", "abc", "-5", "1,234", "1.2.3", "12,", "1e3"]) expect(parseEuro(bad)).toBeNull();
  });
  it("formatiert Euro", () => {
    expect(formatEuro(1250).replace(/\s/g, " ")).toBe("12,50 €");
    expect(formatEuro(8000).replace(/\s/g, " ")).toBe("80,00 €");
  });
  it("rundet bei der Division auf", () => {
    expect(ceilDiv(10, 3)).toBe(4);
    expect(ceilDiv(9, 3)).toBe(3);
    expect(() => ceilDiv(1, 0)).toThrow();
  });
  it("Aufladung nur im erlaubten Rahmen", () => {
    expect(isValidTopup(499)).toBe(false);
    expect(isValidTopup(500)).toBe(true);
    expect(isValidTopup(20_000)).toBe(true);
    expect(isValidTopup(20_001)).toBe(false);
    expect(isValidTopup(500.5)).toBe(false);
  });
});

describe("Anteil pro Spieler (80 EUR und 110 EUR)", () => {
  it("60 Minuten: reserviert 10,00 EUR (bei Mindestzahl 8)", () => {
    expect(reservationFor(8000, 8)).toBe(1000);
  });
  it("90 Minuten: reserviert 13,75 EUR", () => {
    expect(reservationFor(11000, 8)).toBe(1375);
  });
  it("endgültiger Anteil sinkt mit mehr Spielern", () => {
    expect(finalShareFor(8000, 8, 8)).toBe(1000);
    expect(finalShareFor(8000, 10, 8)).toBe(800);
    expect(finalShareFor(8000, 12, 8)).toBe(667); // aufgerundet
    expect(finalShareFor(11000, 10, 8)).toBe(1100);
  });
  it("weniger als die Mindestzahl rechnet mit der Mindestzahl, mehr als 12 mit 12", () => {
    expect(finalShareFor(8000, 5, 8)).toBe(1000);
    expect(shareFor(8000, 20)).toBe(667);
  });
  it("die Summe der Anteile deckt immer den Hallenpreis", () => {
    for (const price of [8000, 11000, 9999]) {
      for (let players = 8; players <= 12; players++) {
        expect(shareFor(price, players) * players).toBeGreaterThanOrEqual(price);
      }
    }
  });
  it("die Reservierung ist nie kleiner als der endgültige Anteil", () => {
    for (let players = 8; players <= 12; players++) {
      expect(reservationFor(8000, 8)).toBeGreaterThanOrEqual(finalShareFor(8000, players, 8));
    }
  });
});
