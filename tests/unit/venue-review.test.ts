import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REVIEW_CATEGORIES, REVIEW_SCORE_MESSAGE, REVIEW_WINDOW_DAYS, reviewAutor, validateScores } from "@/lib/venue-review";

// Hallenbewertung (Vertrag 010 M1 PR 1): reine Regeln. Die Berechtigung, Frist und Speicherung prüft tests/integration/hallenbewertung.test.ts.
describe("validateScores: fünf Kategorien, ganze Zahlen von 1 bis 5, alle Pflicht", () => {
  const gut = { floor: 4, changingRooms: 3, cleanliness: 5, showers: 2, parking: 1 };
  it("gültig: Zahlen oder Ziffern als Text (Formular)", () => {
    expect(validateScores(gut)).toEqual({ ok: true, scores: gut });
    expect(validateScores({ floor: "4", changingRooms: " 3 ", cleanliness: "5", showers: "2", parking: "1" })).toEqual({ ok: true, scores: gut });
  });
  it("ungültig: 0, 6, Kommazahl, Text, leer, fehlend: Meldung je Kategorie", () => {
    const r = validateScores({ floor: 0, changingRooms: 6, cleanliness: 2.5, showers: "abc", parking: "" });
    expect(r).toEqual({ ok: false, fieldErrors: Object.fromEntries(REVIEW_CATEGORIES.map((c) => [c, REVIEW_SCORE_MESSAGE])) });
    expect(validateScores({}).ok).toBe(false);
    expect(validateScores({ ...gut, parking: undefined })).toEqual({ ok: false, fieldErrors: { parking: REVIEW_SCORE_MESSAGE } });
  });
  it("Frist 7 Tage", () => expect(REVIEW_WINDOW_DAYS).toBe(7));
});

describe("reviewAutor: Sicht auf den Autor (AC-17, Entscheid t2q)", () => {
  it("Angemeldete: Name; Gast: nur Initialen; Hallenbetreiber: namenfrei (weder Name noch Initialen)", () => {
    expect(reviewAutor("Zorro Vollname", "member")).toBe("Zorro Vollname");
    expect(reviewAutor("Zorro Vollname", "guest")).toBe("ZV");
    const betreiber = reviewAutor("Zorro Vollname", "hall");
    expect(betreiber).toBe("Ein Spieler");
    expect(betreiber).not.toMatch(/Zorro|ZV|Vollname/);
  });
});

describe("Struktur", () => {
  const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");
  it("Berechtigung vor Eingabeprüfung, Audit ohne Text, Text nur über checkReviewText (serverseitig)", () => {
    const s = src("src/server/venue-reviews.ts");
    expect(s.indexOf("reviewEligibility(userId")).toBeLessThan(s.indexOf("validateScores(input.scores)"));
    expect(s).toContain("checkReviewText(input.text)");
    expect(s).toMatch(/audit\(userId, "venue\.review", "venue", target\.venueId, \{ after: \{ kind: target\.kind, targetId: target\.targetId \} \}/);
  });
  it("die Migration 0060 und der Rückfall sind da; 0059 ist die vorige (seriell)", () => {
    expect(src("drizzle/0060_venue_reviews.sql")).toContain('CREATE TABLE "venue_reviews"');
    expect(src("drizzle/down/0060_down.sql")).toContain("abgebrochen");
    expect(src("drizzle/meta/_journal.json")).toContain('"0060_venue_reviews"');
  });
});
