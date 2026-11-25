import { describe, expect, it } from "vitest";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { TIEBREAK_TITEL, tiebreakText } from "@/lib/turnier-grenzen";

// Mitteilung bei Gleichstand: Golden Goal oder Neunmeter, kein Zahlungswort, kein altes Siebenmeterschießen.
describe("Tie-Break-Mitteilung", () => {
  it("Wortlaut zentral, ohne Zahlungswort, nennt Golden Goal und Neunmeter", () => {
    const text = `${TIEBREAK_TITEL} ${tiebreakText("Mai-Cup")}`;
    expect(zahlungsWorte(text)).toEqual([]);
    expect(text).toContain("Golden Goal");
    expect(text).toContain("Neunmeter");
    expect(text).not.toContain("Siebenmeter");
    expect(tiebreakText("Mai-Cup")).toContain("Mai-Cup");
  });
});
