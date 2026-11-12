import { describe, expect, it } from "vitest";
import { ceilDiv, finalShareFor, formatEuro, isValidTopup, MAX_SHARE_PLAYERS, MAX_SHARE_RENT_CENTS, parseEuro, reservationFor, roundingRemainderCents, shareCents, shareFor } from "@/lib/money";

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

describe("Privatspiel: Anteil pro Spieler (shareCents, roundingRemainderCents)", () => {
  it("Miete 12000 Cent für jedes n von 4 bis 22: aufgerundet, nie Fehlbetrag, Überschuss kleiner als n", () => {
    for (let n = 4; n <= 22; n++) {
      const share = shareCents(12_000, n);
      expect(share, `n=${n}`).toBe(Math.ceil(12_000 / n));
      expect(n * share, `n=${n}`).toBeGreaterThanOrEqual(12_000);
      const rest = roundingRemainderCents(12_000, n);
      expect(rest, `n=${n}`).toBe(n * share - 12_000);
      expect(rest, `n=${n}`).toBeGreaterThanOrEqual(0);
      expect(rest, `n=${n}`).toBeLessThan(n);
    }
  });

  it("kein Deckel bei 12 und kein Mindestwert 8: 22 Spieler teilen wirklich durch 22, 4 durch 4", () => {
    expect(shareCents(12_000, 22)).toBe(546); // ceil(545,45)
    expect(shareCents(12_000, 4)).toBe(3000);
    expect(shareFor(12_000, 22)).toBe(1000); // zum Vergleich: die bestehende Teamspiel-Rechnung deckelt bei 12 (bleibt unverändert)
  });

  it("bekannte Werte", () => {
    expect(shareCents(12_000, 10)).toBe(1200);
    expect(roundingRemainderCents(12_000, 10)).toBe(0);
    expect(shareCents(10_000, 6)).toBe(1667);
    expect(roundingRemainderCents(10_000, 6)).toBe(2);
  });

  it("Grenzfälle: Miete 0, 1 Cent, 1000 Euro, n = 1", () => {
    for (let n = 4; n <= 22; n++) {
      expect(shareCents(0, n)).toBe(0);
      expect(roundingRemainderCents(0, n)).toBe(0);
      expect(shareCents(1, n)).toBe(1);
      expect(roundingRemainderCents(1, n)).toBe(n - 1);
      expect(shareCents(100_000, n)).toBe(Math.ceil(100_000 / n));
      expect(roundingRemainderCents(100_000, n)).toBeLessThan(n);
    }
    expect(shareCents(777, 1)).toBe(777);
    expect(roundingRemainderCents(777, 1)).toBe(0);
  });

  it("ungültiges n (0, negativ, nicht ganzzahlig, NaN) wirft; ungültige Miete wirft", () => {
    for (const bad of [0, -1, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => shareCents(12_000, bad), String(bad)).toThrow();
      expect(() => roundingRemainderCents(12_000, bad), String(bad)).toThrow();
    }
    for (const bad of [-1, 10.5, Number.NaN]) {
      expect(() => shareCents(bad, 10), String(bad)).toThrow();
      expect(() => roundingRemainderCents(bad, 10), String(bad)).toThrow();
    }
  });

  it("Property: für viele Mieten und n nie ein Fehlbetrag, Überschuss immer in [0, n)", () => {
    let seed = 12345; // einfacher, fester Zufallsgenerator (LCG), damit der Test wiederholbar ist
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31);
    for (let i = 0; i < 5000; i++) {
      const rent = next() % 200_001;
      const n = 1 + (next() % 22);
      const share = shareCents(rent, n);
      const rest = roundingRemainderCents(rent, n);
      expect(n * share, `rent=${rent} n=${n}`).toBeGreaterThanOrEqual(rent);
      expect(rest, `rent=${rent} n=${n}`).toBe(n * share - rent);
      expect(rest).toBeGreaterThanOrEqual(0);
      expect(rest).toBeLessThan(n);
      expect((share - 1) * n, `rent=${rent} n=${n} minimal`).toBeLessThan(rent || 1); // kleinster Anteil, der reicht
    }
  });
});

describe("shareCents: Obergrenzen und sichere Ganzzahlen (Backlog 3)", () => {
  it("die Grenzen selbst sind noch gültig und rechnen exakt", () => {
    expect(shareCents(MAX_SHARE_RENT_CENTS, 1)).toBe(MAX_SHARE_RENT_CENTS);
    expect(shareCents(MAX_SHARE_RENT_CENTS, MAX_SHARE_PLAYERS)).toBe(MAX_SHARE_RENT_CENTS / MAX_SHARE_PLAYERS);
    expect(shareCents(1, MAX_SHARE_PLAYERS)).toBe(1);
  });
  it("eine Miete über der Obergrenze wird abgelehnt", () => {
    expect(() => shareCents(MAX_SHARE_RENT_CENTS + 1, 4)).toThrow(/Obergrenze/);
    expect(() => roundingRemainderCents(MAX_SHARE_RENT_CENTS + 1, 4)).toThrow(/Obergrenze/);
  });
  it("keine sicheren Ganzzahlen: NaN, Infinity, Kommazahlen, 2^53 und größer werden abgelehnt (Miete und Spielerzahl)", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 100.5, 2 ** 53, 2 ** 53 + 2, Number.MAX_VALUE]) {
      expect(() => shareCents(bad, 4), String(bad)).toThrow();
      expect(() => shareCents(1000, bad), String(bad)).toThrow();
    }
  });
  it("negative Miete und Spielerzahl unter 1 bleiben abgelehnt", () => {
    expect(() => shareCents(-1, 4)).toThrow();
    expect(() => shareCents(100, 0)).toThrow();
    expect(() => shareCents(100, -3)).toThrow();
  });
  it("mehr Spieler als die Obergrenze werden abgelehnt", () => {
    expect(() => shareCents(1000, MAX_SHARE_PLAYERS + 1)).toThrow(/Obergrenze/);
  });
  it("das Ergebnis ist bis zur Obergrenze immer eine sichere Ganzzahl und deckt die Miete", () => {
    for (const rent of [0, 1, 99, 12_345, 100_000, MAX_SHARE_RENT_CENTS - 1, MAX_SHARE_RENT_CENTS]) {
      for (const n of [1, 2, 3, 7, 22, 999, MAX_SHARE_PLAYERS]) {
        const share = shareCents(rent, n);
        expect(Number.isSafeInteger(share)).toBe(true);
        expect(share * n).toBeGreaterThanOrEqual(rent);
        expect(share * n - rent).toBeLessThan(n);
      }
    }
  });
});
