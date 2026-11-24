import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anmeldeschlussVorschlag } from "@/lib/anmeldeschluss";
import { ZP } from "@/lib/zahlungspflicht-texte";
import { freeStatusText } from "@/server/tournaments";

// Gratis-Turnier PR B (Entscheide t2q 2026-11-24): Anmeldeschluss-Vorschlag 4 Tage vorher, Texte ohne Zahlungs-/Bereit-Wörter, Frist-Job nur für bezahlte Turniere (Quelltext-Pins; Verhalten: tournament-gratis-b.test.ts).
const src = (f: string) => readFileSync(join(__dirname, "..", "..", f), "utf8");

describe("Anmeldeschluss-Vorschlag", () => {
  it("4 Tage vor dem Beginn, gleiche Uhrzeit, Monats- und Jahreswechsel", () => {
    expect(anmeldeschlussVorschlag("2026-12-12T10:00", "2026-11-24T10:00")).toBe("2026-12-08T10:00");
    expect(anmeldeschlussVorschlag("2026-12-03T18:30", "2026-11-01T00:00")).toBe("2026-11-29T18:30");
    expect(anmeldeschlussVorschlag("2027-01-02T09:15", "2026-12-01T00:00")).toBe("2026-12-29T09:15");
  });
  it("Sommer-/Winterzeit: reine Kalenderrechnung (Uhrzeit bleibt)", () => {
    expect(anmeldeschlussVorschlag("2026-03-30T12:00", "2026-01-01T00:00")).toBe("2026-03-26T12:00");
    expect(anmeldeschlussVorschlag("2026-10-27T12:00", "2026-01-01T00:00")).toBe("2026-10-23T12:00");
  });
  it("kein Vorschlag, wenn er vor dem frühesten wählbaren Zeitpunkt läge oder der Beginn ungültig ist", () => {
    expect(anmeldeschlussVorschlag("2026-11-26T10:00", "2026-11-24T10:00")).toBeNull();
    for (const bad of ["", "abc", "2026-13-01T10:00", "2026-11-31T10:00", "2026-11-05T25:00", "2026-11-05"]) expect(anmeldeschlussVorschlag(bad, "2020-01-01T00:00"), bad).toBeNull();
  });
});

describe("Texte", () => {
  it("Ablauf eines kostenlosen Turniers: kein 'Bereit' mehr, Spielplan sofort oder Veranstalter startet mit den bereiten Teams", () => {
    const steps = ZP.tournamentFreeSteps.join(" ");
    expect(steps).not.toMatch(/Bereit/);
    expect(steps).toMatch(/erscheint der Spielplan sofort/);
    expect(steps).toMatch(/mit den bereiten Teams/);
  });
  it("Erinnerung: Zahlen und zwei Wege, ohne Namen und ohne Zahlungswörter", () => {
    const ab4 = freeStatusText("Cup", 14, 12, "Die Anmeldung ist geschlossen.");
    expect(ab4).toBe("Cup: Die Anmeldung ist geschlossen. 14 Teams angemeldet, 12 bereit. Du kannst mit den bereiten Teams starten oder das Turnier absagen.");
    const unter4 = freeStatusText("Cup", 5, 3, "In etwa 24 Stunden geht es los.");
    expect(unter4).toContain("5 Teams angemeldet, 3 bereit");
    expect(unter4).toMatch(/Ab 4 bereiten Teams kannst du starten, sonst kannst du das Turnier absagen/);
    for (const t of [ab4, unter4]) expect(t).not.toMatch(/Karte|bezahl|abgebucht|Preis/i);
  });
});

describe("Quelltext-Pins (Verhalten in den Integrationstests)", () => {
  it("Frist-Job: nur Turniere mit Preis > 0 sind Kandidaten; Scheduler ruft die neue Erinnerung", () => {
    expect(src("src/server/tournaments.ts")).toContain("not ${sql.raw(GRATIS_SQL)}");
    expect(src("src/server/scheduled.ts")).toContain("notifyFreeTournamentReminders(now)");
  });
  it("Formular: Anmeldeschluss nur bei Gratis vorbelegt, nur solange das Feld leer ist; Hinweis", () => {
    const f = src("src/app/app/turniere/neu/TournamentForm.tsx");
    expect(f).toContain("if (!free || !deadlineRef.current || deadlineRef.current.value) return;");
    expect(f).toContain('data-testid="deadline-hint"');
  });
  it("Turnierseite: Knopf 'Anmeldung schließen und mit den N bereiten Teams starten' nur bei Gratis, der bezahlte Knopf bleibt", () => {
    const p = src("src/app/turniere/[id]/page.tsx");
    expect(p).toMatch(/inRegistration && free && teams\.filter\(\(x\) => x\.ready\)\.length >= 4/);
    expect(p).toContain("inRegistration && !free && data.deadlinePassed");
  });
});

describe("EINE Regel 'Gratis' (R-T430)", () => {
  it("istGratis: Hallenkosten 0 oder Anteil 0; Preis null (Altturnier) ist nicht gratis", async () => {
    const { istGratis, GRATIS_SQL } = await import("@/lib/gratis");
    expect(istGratis({ totalCents: 0, finalShareCents: null })).toBe(true);
    expect(istGratis({ totalCents: 16000, finalShareCents: 0 })).toBe(true);
    expect(istGratis({ totalCents: 16000, finalShareCents: null })).toBe(false);
    expect(istGratis({ totalCents: 16000, finalShareCents: 800 })).toBe(false);
    expect(istGratis({ totalCents: null, finalShareCents: null })).toBe(false);
    expect(GRATIS_SQL).toContain("coalesce(total_cents, -1) = 0"); // NULL darf die Bedingung nicht zu NULL machen (sonst wuerde der Frist-Job bezahlte Turniere ohne festen Anteil auslassen)
  });
  it("Seite und Server nutzen dieselbe Quelle", () => {
    expect(src("src/app/turniere/[id]/page.tsx")).toContain("istGratis({ totalCents: pricing.totalCents, finalShareCents: pricing.shareCents })");
    const s = src("src/server/tournaments.ts");
    expect(s).toContain("istGratis(t)");
    expect(s).not.toMatch(/\(t\.totalCents \?\? 0\) === 0/);
    expect(s).toContain("not ${sql.raw(GRATIS_SQL)}");
  });
});
