import { describe, expect, it } from "vitest";
import { currentReminderStage, hallReminderText, holderText } from "@/server/tournament-confirm";
import { venueTermsChanged } from "@/server/tournament-venue";

// 012 M5-7b (Entscheid t2q F4, F7): Erinnerungsstufen vor der Frist und die Bedingungen, unter denen die Zusage der Halle gilt. Rein rechnerisch, ohne Datenbank.
const H = 3_600_000;
const due = new Date("2026-12-10T12:00:00Z");
const before = (hours: number) => new Date(due.getTime() - hours * H);

describe("currentReminderStage (24 h und 6 h vor der Frist)", () => {
  it.each([
    [30, undefined],
    [24.01, undefined],
    [24, 24],
    [12, 24],
    [6.01, 24],
    [6, 6],
    [1, 6],
    [0.01, 6],
    [0, undefined], // Frist erreicht
    [-1, undefined], // Frist vorbei
  ])("%s Stunden vor der Frist -> Stufe %s", (hours, stage) => {
    expect(currentReminderStage(before(hours), due)).toBe(stage);
  });
});

describe("hallReminderText", () => {
  it("nennt das Turnier und die Stunden, aber keine Person", () => {
    const text = hallReminderText("Hallen-Cup", 24);
    expect(text).toContain("Hallen-Cup");
    expect(text).toContain("Die Halle hat noch nicht zugesagt");
    expect(text).toContain("24 Stunden");
    expect(text).not.toMatch(/Captain|Veranstalter:|@/);
  });
});

describe("venueTermsChanged (F7: die Zusage gilt nur fuer Halle, Termin, Dauer und Hallenmiete von damals)", () => {
  const base = { venueId: "v1", startsAt: new Date("2026-12-12T10:00:00Z"), durationMin: 120, totalCents: 16000 };
  it("unveraendert -> keine Aenderung (auch ein neues Date-Objekt mit gleicher Zeit)", () => {
    expect(venueTermsChanged(base, { ...base, startsAt: new Date(base.startsAt.getTime()) })).toBe(false);
  });
  it.each([
    ["Halle", { venueId: "v2" }],
    ["Termin", { startsAt: new Date("2026-12-12T11:00:00Z") }],
    ["Dauer", { durationMin: 180 }],
    ["Hallenmiete", { totalCents: 20000 }],
    ["Termin entfernt", { startsAt: null }],
    ["Dauer entfernt", { durationMin: null }],
  ])("%s geaendert -> Aenderung", (_name, over) => {
    expect(venueTermsChanged(base, { ...base, ...over })).toBe(true);
  });
});

describe("holderText (Entscheid t2q A: Zugangsinhaber der Halle)", () => {
  const starts = new Date("2026-12-12T10:00:00Z");
  it("beim Fixieren: Turnier, Termin, Frist, Verbindlichkeit; keine Person", () => {
    const t = holderText("Hallen-Cup", starts, due, null);
    expect(t).toContain("Hallen-Cup");
    expect(t).toContain("wartet auf die Zusage der Halle");
    expect(t).toContain("Zusage bis");
    expect(t).toContain("Die Zusage ist verbindlich.");
    expect(t).not.toMatch(/@/);
  });
  it("in der Erinnerung: nennt die Stunden bis zur Frist", () => {
    expect(holderText("Hallen-Cup", starts, due, 6)).toContain("in etwa 6 Stunden");
  });
});
