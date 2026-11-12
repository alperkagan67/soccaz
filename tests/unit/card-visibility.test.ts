import { describe, expect, it } from "vitest";
import type { CardStatus } from "@/db/schema";
import { audienceFor, canSeeAnyStatus, cardDisplayFor, type Audience, type CardViewer } from "@/lib/card-visibility";
import { cardView } from "@/lib/card-view";

const ALL: CardStatus[] = ["none", "card_ready", "charge_pending", "charged", "failed"];

describe("cardDisplayFor: wer sieht welchen Kartenstatus (Vertrag 012, AC-12/AC-20)", () => {
  it("Gäste sehen gar nichts je Person, egal welcher Status", () => {
    for (const s of ALL) expect(cardDisplayFor("guest", s, "card_declined")).toBeNull();
  });
  it("der Betroffene und der Captain/Veranstalter sehen den echten Status und bei failed den Grund", () => {
    for (const a of ["self", "manager"] as Audience[]) {
      expect(cardDisplayFor(a, "failed", "card_declined")).toEqual({ status: "failed", reason: "card_declined" });
      expect(cardDisplayFor(a, "failed", null)).toEqual({ status: "failed", reason: "unknown" });
      expect(cardDisplayFor(a, "none", "card_declined")).toEqual({ status: "none", reason: null });
      expect(cardDisplayFor(a, "card_ready", null)).toEqual({ status: "card_ready", reason: null });
    }
  });
  it("Mitspieler sehen bei failed UND bei none nur dieselbe neutrale rote Ampel ohne Grund", () => {
    const failed = cardDisplayFor("member", "failed", "card_declined");
    const none = cardDisplayFor("member", "none", null);
    expect(failed).toEqual({ status: "open", reason: null });
    expect(none).toEqual(failed); // nicht unterscheidbar
    expect(cardView("open").label).toBe("Zahlung ausstehend");
    expect(cardView("failed").label).toBe("Abbuchung fehlgeschlagen"); // nur Betroffener und Captain/Veranstalter
    expect(cardView("open").tone).toBe("red");
  });
  it("Mitspieler sehen sonst den normalen Status, nie einen Grund", () => {
    for (const s of ["card_ready", "charge_pending", "charged"] as CardStatus[]) {
      expect(cardDisplayFor("member", s, "card_declined")).toEqual({ status: s, reason: null });
    }
  });
  it("die Ausgabe für Dritte enthält nie failed, den Fehlercode oder ein Fehlerwort", () => {
    for (const a of ["member", "guest"] as Audience[]) {
      for (const s of ALL) {
        const text = JSON.stringify(cardDisplayFor(a, s, "card_declined"));
        expect(text).not.toMatch(/failed|card_declined|fehlgeschlagen|abgelehnt/i);
      }
    }
  });
});

describe("audienceFor: Rolle des Betrachters zu einem Platz (eine Funktion für Seite und Tests)", () => {
  const person = { userId: "victim", teamId: "teamA" };
  const base: CardViewer = { userId: "v", platformAdmin: false, adminOf: [], isParticipant: true };
  it("nicht angemeldet = guest", () => {
    expect(audienceFor({ ...base, userId: null, isParticipant: false }, person)).toBe("guest");
    // auch bei widersprüchlichen Angaben (nie angemeldet, aber Rechte gesetzt) bleibt es guest
    expect(audienceFor({ userId: null, platformAdmin: true, adminOf: ["teamA"], isParticipant: true }, person)).toBe("guest");
  });
  it("der Betroffene selbst = self, auch als Admin des eigenen Teams", () => {
    expect(audienceFor({ ...base, userId: "victim", adminOf: ["teamA"] }, person)).toBe("self");
  });
  it("Captain/Veranstalter oder zweiter Admin desselben Teams = manager (auch ohne eigene Teilnahme)", () => {
    expect(audienceFor({ ...base, adminOf: ["teamA"] }, person)).toBe("manager");
    expect(audienceFor({ ...base, adminOf: ["teamA", "teamX"], isParticipant: false }, person)).toBe("manager");
  });
  it("Plattform-Admin (Admin 1 und Admin 2) = manager für jeden Platz", () => {
    expect(audienceFor({ ...base, platformAdmin: true, isParticipant: false }, person)).toBe("manager");
    expect(audienceFor({ ...base, platformAdmin: true }, { userId: "x", teamId: null })).toBe("manager");
  });
  it("Captain des GEGNERTEAMS ist nur member (neutral), nicht manager", () => {
    expect(audienceFor({ ...base, adminOf: ["teamB"] }, person)).toBe("member");
  });
  it("Teilnehmer = member; angemeldet ohne Teilnahme und ohne Verwaltungsrecht = guest", () => {
    expect(audienceFor(base, person)).toBe("member");
    expect(audienceFor({ ...base, isParticipant: false }, person)).toBe("guest");
  });
  it("Admin eines fremden Teams ohne Teilnahme sieht Plätze des anderen Teams als guest", () => {
    expect(audienceFor({ ...base, adminOf: ["teamZ"], isParticipant: false }, person)).toBe("guest");
  });
  it("ein Platz ohne Team (freier Ersatzspieler) wird nie über adminOf zum manager", () => {
    expect(audienceFor({ ...base, adminOf: ["teamA"] }, { userId: "sub", teamId: null })).toBe("member");
  });
  it("canSeeAnyStatus: nur Angemeldete mit Teilnahme, Verwaltungsrecht oder Plattform-Admin", () => {
    expect(canSeeAnyStatus(base)).toBe(true);
    expect(canSeeAnyStatus({ ...base, isParticipant: false })).toBe(false);
    expect(canSeeAnyStatus({ ...base, isParticipant: false, adminOf: ["t"] })).toBe(true);
    expect(canSeeAnyStatus({ ...base, isParticipant: false, platformAdmin: true })).toBe(true);
    expect(canSeeAnyStatus({ ...base, userId: null })).toBe(false);
  });
});

describe("cardDisplayFor: Fensterende (graceEnd) nur für Betroffenen und Captain/Veranstalter", () => {
  const end = new Date("2026-11-20T12:00:00Z");
  it("self und manager bekommen das Ende bei failed", () => {
    for (const a of ["self", "manager"] as Audience[]) {
      expect(cardDisplayFor(a, "failed", "card_declined", end)).toEqual({ status: "failed", reason: "card_declined", graceEnd: "2026-11-20T12:00:00.000Z" });
    }
  });
  it("Mitspieler und Gäste nie (auch nicht als Teil der neutralen Anzeige)", () => {
    expect(JSON.stringify(cardDisplayFor("member", "failed", "card_declined", end))).not.toMatch(/graceEnd|2026-11-20/);
    expect(cardDisplayFor("guest", "failed", "card_declined", end)).toBeNull();
  });
  it("kein Ende bei anderen Status und ohne Fenster (Altzeile)", () => {
    expect(cardDisplayFor("self", "card_ready", null, end)).toEqual({ status: "card_ready", reason: null });
    expect(cardDisplayFor("self", "failed", "card_declined", null)).toEqual({ status: "failed", reason: "card_declined" });
  });
});
