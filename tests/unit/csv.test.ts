import { describe, expect, it } from "vitest";
import { csvCell, csvRow, euroForCsv, toCsv } from "@/lib/csv";

describe("CSV", () => {
  it("Beträge mit Dezimalkomma", () => {
    expect(euroForCsv(1234)).toBe("12,34");
    expect(euroForCsv(5)).toBe("0,05");
    expect(euroForCsv(-250)).toBe("-2,50");
    expect(euroForCsv(0)).toBe("0,00");
  });
  it("Trenner, Anführungszeichen und Zeilenumbrüche werden maskiert", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('sagt "hi"')).toBe('"sagt ""hi"""');
    expect(csvCell("zwei\nZeilen")).toBe('"zwei\nZeilen"');
    expect(csvCell("normal")).toBe("normal");
    expect(csvCell(null)).toBe("");
  });
  it("Formel-Einschleusung wird entschärft", () => {
    expect(csvCell("=HYPERLINK(\"http://böse\")")).toBe("\"'=HYPERLINK(\"\"http://böse\"\")\"");
    expect(csvCell("+49 123")).toBe("'+49 123");
    expect(csvCell("-5 Grad")).toBe("'-5 Grad");
    expect(csvCell("@summe")).toBe("'@summe");
  });
  it("Zahlen bleiben unverändert (auch negative)", () => {
    expect(csvCell(-5)).toBe("-5");
  });
  it("Zeile und Datei", () => {
    expect(csvRow(["a", 1, null, "b;c"])).toBe('a;1;;"b;c"');
    const csv = toCsv([["Datum", "Betrag"], ["2026-11-01", "12,50"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe("﻿Datum;Betrag\r\n2026-11-01;12,50\r\n");
  });
});
