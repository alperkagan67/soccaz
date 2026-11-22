import { describe, expect, it } from "vitest";
import { cleanReason, pdfSafe } from "@/lib/evidence";
import { evidencePdfModel } from "@/server/evidence-pdf";
import type { MatchEvidence } from "@/server/evidence-export";

// PDF-Inhalt ohne Renderer und ohne Datenbank (Review R-T225a, Hinweise 1 und 5): bereinigter Fremdtext, Begründung wörtlich, keine Team-/Spielernamen, Prüfstand.
const T0 = new Date("2026-11-22T10:00:00.123Z");
function data(over: Partial<MatchEvidence["entries"][number]> = {}, report: Partial<MatchEvidence["report"]> = {}): MatchEvidence {
  return {
    matchId: "11111111-1111-4111-8111-111111111111",
    number: 7,
    entries: [{ seq: 1, at: T0, kind: "declined", round: 1, reason: "Halle belegt, Training", venueName: "Sporthalle Süd", actorName: "Max Müller", hash: "a".repeat(64), ...over }],
    report: { ok: true, chain: { ok: true, count: 1, headHash: "a".repeat(64), firstBadSeq: null, reason: null }, orphans: { matchIds: [], venueIds: [] }, missing: [], checkedAt: T0, ...report },
  };
}

describe("pdfSafe", () => {
  it("entfernt Steuer-, Bidi- und Zero-Width-Zeichen und ersetzt alles außerhalb von Latin-1/WinAnsi durch ?", () => {
    expect(pdfSafe("Hal​le‮ belegt\u0007")).toBe("Halle belegt");
    expect(pdfSafe("Ünïcödé € „x“ – y … ß")).toBe("Ünïcödé € „x“ – y … ß");
    expect(pdfSafe("Emoji 😀 und 日本語 und Ωmega")).toBe("Emoji ? und ??? und ?mega"); // je Codepunkt ein ?
    expect(pdfSafe(null)).toBe("");
    expect(pdfSafe("<b>fett</b> **x** [l](http://x.invalid)")).toBe("<b>fett</b> **x** [l](http://x.invalid)"); // reiner Text, kein Markup im PDF
  });
  it("baut auf cleanReason auf (Kürzung auf 300 Zeichen)", () => {
    expect(Array.from(pdfSafe("x".repeat(400))).length).toBe(300);
    expect(pdfSafe("a‏b")).toBe(cleanReason("a‏b"));
  });
});

describe("evidencePdfModel", () => {
  it("Begründung wörtlich (nach Bereinigung), Hallenname und Betreiber bereinigt, keine Team-/Spielernamen, Eintragszeit in UTC und Berlin", () => {
    const m = evidencePdfModel(data({ reason: "Halle belegt | Training; Zeile2 😀", venueName: "Sporthalle‮ Süd", actorName: "Max​ Müller" }));
    const text = JSON.stringify(m);
    expect(m.entries[0].reason).toBe("Begründung: Halle belegt | Training; Zeile2 ?");
    expect(m.entries[0].head).toContain("Sporthalle Süd");
    expect(m.entries[0].actor).toBe("Antwort durch: Max Müller");
    expect(m.entries[0].times).toContain("2026-11-22 10:00:00.123 UTC");
    expect(m.entries[0].times).toContain("(Berlin)");
    expect(text).not.toMatch(/Heim|Gast|Team/); // keine Team-/Spielernamen im Modell
    expect(m.intro.join(" ")).toContain("Zeitpunkt des Abschlusses");
  });
  it("Kopf-Hash, Anzahl, Ergebnis und Prüfstand stehen im Modell; Abweichungen und Hinweis auf die externe Prüfung", () => {
    const ok = evidencePdfModel(data());
    expect(ok.summary).toMatchObject({ count: "Einträge insgesamt: 1", headHash: "a".repeat(64), result: "Ergebnis: Kette gültig" });
    expect(ok.summary.checkedAt).toContain("Prüfstand vom 2026-11-22 10:00:00.123 UTC");
    expect(ok.notice).toContain("extern abgelegten Kopf-Hash");
    const bad = evidencePdfModel(
      data({}, { ok: false, chain: { ok: false, count: 3, headHash: "b".repeat(64), firstBadSeq: 2, reason: "hash" }, orphans: { matchIds: ["x"], venueIds: [] }, missing: [{ source: "hall", matchId: "m", venueId: "v", jobId: null, status: "pending" }] }),
    );
    expect(bad.summary.result).toBe("Ergebnis: Kette UNGÜLTIG ab Nr. 2 (hash)");
    expect(bad.warnings).toHaveLength(2);
  });
  it("ohne Betreiber und ohne Begründung entfallen die Zeilen; unbekannte Art erscheint bereinigt", () => {
    const m = evidencePdfModel(data({ actorName: null, reason: null, kind: "neu​_art" }));
    expect(m.entries[0].actor).toBeNull();
    expect(m.entries[0].reason).toBeNull();
    expect(m.entries[0].head).toContain("neu_art");
  });
});
