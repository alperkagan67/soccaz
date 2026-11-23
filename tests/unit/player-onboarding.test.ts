import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIRTH_DATE_INVALID,
  BIRTH_DATE_MISSING,
  PLAYER_ONBOARDING_STEPS,
  birthDateError,
  parsePlayerOnboarding,
  playerWerteAusFormData,
  validatePlayerAll,
  validatePlayerStep,
} from "@/lib/player-onboarding";
import { isOldEnough } from "@/lib/age";

// 013 v3 AC-26, Spieler-Onboarding: die EINE Prüfung für Oberfläche und Server. Feste Uhr (TODAY) macht die Datumsgrenzen reproduzierbar.
const TODAY = new Date("2026-11-23T12:00:00Z");
const ok = { name: "Alex", city: "Essen", position: "Angriff", birthDate: "1995-05-05", terms: "on", next: "/app" };

describe("birthDateError (Fehleingabe soll kein Konto löschen)", () => {
  it.each([
    ["1995-05-05"],
    ["2000-02-29"], // Schaltjahr
    ["2026-11-23"], // heute
    ["2026-11-24"], // morgen: Toleranz für Zeitzonen
    ["1900-01-01"],
    ["2010-11-23"], // ein echtes Alter unter 16 ist KEIN Feldfehler (das entscheidet die Altersprüfung)
  ])("%s ist ein gültiges Datum", (v) => {
    expect(birthDateError(v, TODAY)).toBeUndefined();
  });

  it.each([
    ["2026-11-25", "übermorgen"],
    ["2099-01-01", "Zukunft"],
    ["1899-12-31", "vor 1900"],
    ["2001-02-29", "kein Schaltjahr"],
    ["2020-02-31", "31. Februar"],
    ["2020-13-01", "Monat 13"],
    ["05.05.1995", "deutsches Format"],
    ["1995-5-5", "ohne führende Nullen"],
    ["June 5 2000", "Text"],
    ["1995-05-05T00:00:00Z", "mit Uhrzeit"],
  ])("%s wird abgewiesen (%s)", (v) => {
    expect(birthDateError(v, TODAY)).toBe(BIRTH_DATE_INVALID);
  });

  it("leer oder nur Leerzeichen: 'bitte angeben'", () => {
    expect(birthDateError("", TODAY)).toBe(BIRTH_DATE_MISSING);
    expect(birthDateError("   ", TODAY)).toBe(BIRTH_DATE_MISSING);
  });

  it("die Altersprüfung bleibt getrennt: genau 16 Jahre ist alt genug, einen Tag davor nicht", () => {
    expect(isOldEnough(new Date("2010-11-23T00:00:00Z"), TODAY)).toBe(true);
    expect(isOldEnough(new Date("2010-11-24T00:00:00Z"), TODAY)).toBe(false);
  });
});

describe("Prüfung je Schritt und gesamt", () => {
  it("ein vollständiger Satz ist in jedem Schritt und gesamt in Ordnung", () => {
    expect(validatePlayerAll(ok, TODAY)).toEqual({});
    for (const s of PLAYER_ONBOARDING_STEPS) expect(validatePlayerStep(s.id, ok, TODAY), s.id).toEqual({});
  });

  it("Schritt 'spieler': Name 2 bis 40 (getrimmt), Stadt nur aus der Liste; Fehler nur für diesen Schritt", () => {
    const bad = { ...ok, name: " a ", city: "Atlantis", position: "", birthDate: "", terms: "" };
    expect(Object.keys(validatePlayerStep("spieler", bad, TODAY)).sort()).toEqual(["city", "name"]);
    expect(validatePlayerStep("spieler", { ...ok, name: "ab" }, TODAY)).toEqual({});
    expect(validatePlayerStep("spieler", { ...ok, name: "x".repeat(41) }, TODAY).name).toBeTruthy();
    expect(validatePlayerStep("spieler", { ...ok, name: "x".repeat(40) }, TODAY)).toEqual({});
  });

  it("Schritt 'position': nur die fünf Positionen", () => {
    for (const p of ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"]) expect(validatePlayerStep("position", { ...ok, position: p }, TODAY)).toEqual({});
    expect(Object.keys(validatePlayerStep("position", { ...ok, position: "Libero" }, TODAY))).toEqual(["position"]);
  });

  it("Schritt 'alter': nur das Geburtsdatum, mit den strengen Grenzen", () => {
    expect(Object.keys(validatePlayerStep("alter", { ...ok, birthDate: "2099-01-01" }, TODAY))).toEqual(["birthDate"]);
    expect(validatePlayerStep("alter", { ...ok, birthDate: "2099-01-01" }, TODAY).birthDate).toBe(BIRTH_DATE_INVALID);
  });

  it("Schritt 'abschluss': ohne Zustimmung Feldfehler (der bestehende Text), Zusammenfassung prüft nichts", () => {
    expect(validatePlayerStep("abschluss", { ...ok, terms: "" }, TODAY).terms).toBe("Bitte akzeptiere Datenschutz und Hausordnung.");
    expect(validatePlayerStep("abschluss", { ...ok, terms: "ja" }, TODAY).terms).toBeTruthy(); // nur "on" gilt
    expect(validatePlayerStep("zusammenfassung", { name: "", city: "", position: "", birthDate: "", terms: "" }, TODAY)).toEqual({});
  });

  it("alle Fehler zusammen: je Feld einer, auch bei komplett leerer Eingabe (ohne zu werfen)", () => {
    const e = validatePlayerAll({}, TODAY);
    expect(Object.keys(e).sort()).toEqual(["birthDate", "city", "name", "position", "terms"]);
  });
});

describe("parsePlayerOnboarding", () => {
  it("liefert das geprüfte Objekt: Name getrimmt, next nur intern", () => {
    const r = parsePlayerOnboarding({ ...ok, name: "  Alex  ", next: "/lobby/abc?x=1" }, TODAY);
    expect(r).toEqual({ ok: true, input: { name: "Alex", city: "Essen", position: "Angriff", birthDate: "1995-05-05", next: "/lobby/abc?x=1" } });
  });

  it("next: fremde und unsaubere Ziele fallen auf /app", () => {
    for (const bad of ["//evil.example", "https://evil.example", "/" + String.fromCharCode(92) + "evil", "/a" + String.fromCharCode(9) + "b", "", undefined]) {
      const r = parsePlayerOnboarding({ ...ok, ...(bad === undefined ? {} : { next: bad }) }, TODAY);
      expect(r.ok && r.input.next, String(bad)).toBe("/app");
    }
  });

  it("fehlerhafte Eingabe ergibt Feldfehler statt eines Objekts, auch Zukunftsdatum", () => {
    const r = parsePlayerOnboarding({ ...ok, birthDate: "2099-01-01" }, TODAY);
    expect(r).toEqual({ ok: false, errors: { birthDate: BIRTH_DATE_INVALID } });
  });
});

describe("Schritte und FormData", () => {
  it("Feldnamen: genau die des bisherigen Formulars, je Feld einmal; nichtSpeichern = Geburtsdatum, Zustimmung, next", () => {
    const names = PLAYER_ONBOARDING_STEPS.flatMap((s) => [...s.felder]);
    expect([...names].sort()).toEqual(["birthDate", "city", "name", "next", "position", "terms"]);
    expect(new Set(names).size).toBe(names.length);
    expect(PLAYER_ONBOARDING_STEPS.flatMap((s) => [...(s.nichtSpeichern ?? [])]).sort()).toEqual(["birthDate", "next", "terms"]);
    expect(PLAYER_ONBOARDING_STEPS.map((s) => s.id)).toEqual(["spieler", "position", "alter", "zusammenfassung", "abschluss"]);
  });

  it("playerWerteAusFormData nimmt nur bekannte Felder als Text; Dateien und fehlende Felder werden leer, fremde fallen weg", () => {
    const fd = new FormData();
    fd.set("name", "Alex");
    fd.set("city", "Essen");
    fd.set("isOwner", "true");
    fd.set("position", new Blob(["x"]), "x.txt");
    const w = playerWerteAusFormData(fd);
    expect(w).toEqual({ name: "Alex", city: "Essen", position: "", birthDate: "", terms: "", next: "" });
  });
});

describe("Server-Aktion (Quelltext): keine eigene Feldprüfung", () => {
  it("completeOnboardingAction ruft nur parsePlayerOnboarding; kein Schema, keine Object.fromEntries-Rohdaten", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "../../src/server/actions.ts"), "utf8");
    const body = /export async function completeOnboardingAction[\s\S]*?\n}\n/.exec(src)?.[0] ?? "";
    expect(body).toContain("parsePlayerOnboarding(playerWerteAusFormData(formData))");
    expect(body).not.toMatch(/onboardingSchema|Object\.fromEntries|zodToState/);
    expect(body.indexOf("requireLoggedIn")).toBeLessThan(body.indexOf("parsePlayerOnboarding"));
    expect(body).toContain("isOldEnough(birth)"); // die Altersprüfung bleibt
  });
});
