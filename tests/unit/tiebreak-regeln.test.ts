import { describe, expect, it } from "vitest";
import * as T from "@/lib/tiebreak-regeln";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { NEUNMETER_MAX_TREFFER } from "@/lib/turnier-grenzen";

// PR 1b: Anzeige und Eingabe des Tie-Breaks (Golden Goal / Neunmeter) im K.-o.: Texte, Wahl, Folge, Trefferzahlen, Marke.
describe("Texte", () => {
  it("kein Zahlungswort in keinem Text (Wortscan Zahlungen AUS)", () => {
    const texte = Object.entries(T).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, v as string] as const);
    expect(texte.length).toBeGreaterThan(8);
    for (const [name, text] of texte) expect(zahlungsWorte(text), name).toEqual([]);
    for (const o of T.tieOptionen("Heim", "Gast")) expect(zahlungsWorte(o.label), o.key).toEqual([]);
    for (const o of T.tieOptionen("Heim", "Gast")) expect(zahlungsWorte(T.tieDialogText(o)), o.key).toEqual([]);
  });
  it("Regeltext nennt Golden Goal (2 Minuten) vor Neunmeter", () => {
    expect(T.TIEBREAK_REGEL).toMatch(/Golden Goal \(2 Minuten\), danach Neunmeter/);
  });
});

describe("tieOptionen und tieFolge", () => {
  it("genau vier Wahlmöglichkeiten: Golden Goal für A/B, Neunmeter-Sieger A/B", () => {
    const o = T.tieOptionen("Heim", "Gast");
    expect(o.map((x) => x.label)).toEqual(["Golden Goal für Heim", "Golden Goal für Gast", "Neunmeter, Sieger Heim", "Neunmeter, Sieger Gast"]);
    expect(o.map((x) => [x.kind, x.side])).toEqual([["gg", "a"], ["gg", "b"], ["9m", "a"], ["9m", "b"]]);
    expect(new Set(o.map((x) => x.key)).size).toBe(4);
  });
  it("große Bestätigung 'A 2 : 2 B → Golden Goal für A'", () => {
    const o = T.tieOptionen("Heim", "Gast")[0];
    expect(T.tieFolge("Heim", "Gast", 2, o)).toBe("Heim 2 : 2 Gast → Golden Goal für Heim");
  });
  it("Dialogtext sagt, dass das Golden Goal im Plan zählt (+1) und die Entscheidung endgültig ist", () => {
    const [gg, , nm] = T.tieOptionen("A", "B");
    expect(T.tieDialogText(gg)).toMatch(/Stand steigt um 1/);
    expect(T.tieDialogText(gg)).toMatch(/endgültig/);
    expect(T.tieDialogText(nm)).toMatch(/Stand bleibt/);
  });
});

describe("parseTreffer (beide oder keine, ganze Zahlen 0 bis 50)", () => {
  it("beide leer ist erlaubt (keine Zähler)", () => expect(T.parseTreffer("", "  ")).toEqual({ ok: true }));
  it("beide gültig", () => expect(T.parseTreffer("4", " 3 ")).toEqual({ ok: true, counts: { a: 4, b: 3 } }));
  it("Grenzen 0 und 50 gelten, 51 nicht", () => {
    expect(T.parseTreffer("0", String(NEUNMETER_MAX_TREFFER))).toEqual({ ok: true, counts: { a: 0, b: NEUNMETER_MAX_TREFFER } });
    expect(T.parseTreffer("51", "1").ok).toBe(false);
  });
  it("nur eine Zahl, Dezimalzahl, Minus, Text: Fehler", () => {
    for (const [a, b] of [["3", ""], ["", "3"], ["3,5", "2"], ["-1", "2"], ["a", "2"], ["1e1", "2"]] as const) {
      const r = T.parseTreffer(a, b);
      expect(r.ok, `${a}/${b}`).toBe(false);
      if (!r.ok) expect(r.error).toBe(T.TIEBREAK_ZAEHLER_FEHLER);
    }
  });
});

describe("tieMarke und tieOffen", () => {
  it("'n. GG' / 'n. 9m' / 'n. 9m (4:3)' / null", () => {
    expect(T.tieMarke({ decidedBy: "gg" })).toBe("n. GG");
    expect(T.tieMarke({ decidedBy: "9m" })).toBe("n. 9m");
    expect(T.tieMarke({ decidedBy: "9m", shootoutA: 4, shootoutB: 3 })).toBe("n. 9m (4:3)");
    expect(T.tieMarke({ decidedBy: "9m", shootoutA: 0, shootoutB: 0 })).toBe("n. 9m (0:0)");
    expect(T.tieMarke({ decidedBy: null })).toBeNull();
    expect(T.tieMarke({})).toBeNull();
  });
  it("offen nur bei gleichem Stand ohne Neunmeter-Sieger und ohne Entscheidungsart", () => {
    expect(T.tieOffen({ scoreA: 2, scoreB: 2 })).toBe(true);
    expect(T.tieOffen({ scoreA: 0, scoreB: 0 })).toBe(true);
    expect(T.tieOffen({ scoreA: null, scoreB: null })).toBe(false);
    expect(T.tieOffen({ scoreA: 3, scoreB: 2 })).toBe(false);
    expect(T.tieOffen({ scoreA: 2, scoreB: 2, shootoutWinner: "t1" })).toBe(false);
    expect(T.tieOffen({ scoreA: 3, scoreB: 2, decidedBy: "gg" })).toBe(false);
    expect(T.tieOffen({ scoreA: 2, scoreB: 2, decidedBy: "9m" })).toBe(false);
  });
});
