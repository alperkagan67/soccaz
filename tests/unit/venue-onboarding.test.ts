import { describe, expect, it } from "vitest";
import { CITIES } from "@/lib/validation";
import { LIMITS, ONBOARDING_STEPS, TERMS_KEY, TERMS_VERSION, parseOnboarding, validateAll, validateStep, werteAusFormData } from "@/lib/venue-onboarding";

// Vertrag 013 Version 3 (M2d, AC-25): Schritte, Feldnamen und Prüfungen des Hallen-Onboardings. Dieselbe Prüfung läuft im Browser (Weiter) und am Server (Abschluss).
const ok = {
  name: "Soccerhalle Nord",
  city: CITIES[0],
  address: "Hauptstr. 1",
  contact: "betrieb@example.test",
  courts: "3",
  surface: "Kunstrasen",
  hasShowers: "on",
  hasParking: "",
  price60: "40,00",
  price90: "55",
  terms: "on",
};

describe("Schrittdefinition", () => {
  it("fünf Schritte in fester Reihenfolge, Feldnamen sind eindeutig", () => {
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(["halle", "plaetze", "preise", "zusammenfassung", "abschluss"]);
    const alle = ONBOARDING_STEPS.flatMap((s) => [...s.felder]);
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("Kontakt (personenbezogen) und Zustimmung stehen unter nichtSpeichern, sonst nichts (Auflage: sensible Felder nie im Entwurf)", () => {
    const nicht = ONBOARDING_STEPS.flatMap((s) => [...(s.nichtSpeichern ?? [])]).sort();
    expect(nicht).toEqual(["contact", "terms"]);
    for (const s of ONBOARDING_STEPS) for (const k of s.nichtSpeichern ?? []) expect(s.felder, `${s.id}.${k}`).toContain(k);
  });

  it("der Bedingungstext ist als ENTWURF gekennzeichnet (Schlüssel) und hat eine Version", () => {
    expect(TERMS_KEY).toContain(".entwurf");
    expect(TERMS_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe("Prüfung je Schritt", () => {
  it("ein vollständiger Satz ist in jedem Schritt in Ordnung", () => {
    for (const s of ONBOARDING_STEPS) expect(validateStep(s.id, ok), s.id).toEqual({});
    expect(validateAll(ok)).toEqual({});
  });

  it("Schritt 1: Name, Stadt (nur aus der Liste), Adresse, Kontakt (E-Mail oder Telefon)", () => {
    expect(Object.keys(validateStep("halle", { ...ok, name: "", city: "Atlantis", address: "x", contact: "abc" })).sort()).toEqual(["address", "city", "contact", "name"]);
    expect(validateStep("halle", { ...ok, name: "x".repeat(LIMITS.name.max + 1) }).name).toBeTruthy();
    expect(validateStep("halle", { ...ok, contact: "0201 123456" })).toEqual({});
    expect(validateStep("halle", { ...ok, contact: "kein Kontakt hier" }).contact).toMatch(/E-Mail|Telefon/);
  });

  it("Schritt 2: Anzahl Plätze ganze Zahl 1 bis 20, Boden höchstens 60 Zeichen", () => {
    for (const c of ["0", "21", "abc", "", "2.5", "-1", "1e1"]) expect(validateStep("plaetze", { ...ok, courts: c }).courts, c).toBeTruthy();
    for (const c of ["1", "20", " 7 "]) expect(validateStep("plaetze", { ...ok, courts: c }).courts, c).toBeUndefined();
    expect(validateStep("plaetze", { ...ok, surface: "x".repeat(61) }).surface).toBeTruthy();
  });

  it("Schritt 3: Hallenmiete je Termin zwischen 1,00 und 1.000,00 Euro, beide Dauern getrennt geprüft", () => {
    for (const p of ["", "0", "0,99", "1000,01", "-5", "abc", "12,345"]) expect(validateStep("preise", { ...ok, price60: p }).price60, p).toBeTruthy();
    for (const p of ["1", "1,00", "40", "40,5", "1000", "1000,00", "12.5"]) expect(validateStep("preise", { ...ok, price90: p }).price90, p).toBeUndefined();
    expect(Object.keys(validateStep("preise", { ...ok, price60: "", price90: "" })).sort()).toEqual(["price60", "price90"]);
    expect(validateStep("preise", { ...ok, price60: "" }).price90).toBeUndefined();
  });

  it("Schritt 5: ohne Zustimmung keine Anfrage; Zusammenfassung hat nichts zu prüfen", () => {
    expect(validateStep("abschluss", { ...ok, terms: "" }).terms).toBeTruthy();
    expect(validateStep("abschluss", { ...ok, terms: "off" }).terms).toBeTruthy();
    expect(validateStep("zusammenfassung", {})).toEqual({});
  });
});

describe("parseOnboarding (der Server benutzt nur diese Funktion)", () => {
  it("liefert das geprüfte Eingabeobjekt: getrimmt, Cent, Zahl, Häkchen als Wahrheitswert, Textschlüssel und Version", () => {
    const r = parseOnboarding({ ...ok, name: "  Soccerhalle Nord  ", price60: "40,50", price90: "55" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input).toEqual({ name: "Soccerhalle Nord", city: CITIES[0], address: "Hauptstr. 1", contact: "betrieb@example.test", courts: 3, surface: "Kunstrasen", hasShowers: true, hasParking: false, price60Cents: 4050, price90Cents: 5500, termsKey: TERMS_KEY, termsVersion: TERMS_VERSION });
    }
  });

  it("leerer Boden wird null; fehlende Zustimmung oder ein falscher Wert ergibt Feldfehler statt eines Objekts", () => {
    const r1 = parseOnboarding({ ...ok, surface: "   " });
    expect(r1.ok && r1.input.surface).toBeNull();
    const r2 = parseOnboarding({ ...ok, terms: "", price60: "0" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(Object.keys(r2.errors).sort()).toEqual(["price60", "terms"]);
  });

  it("manipulierte Eingaben (Zahl als Text mit Zusatz, Stadt außerhalb der Liste, lange Texte) kommen nie als Objekt durch", () => {
    for (const bad of [{ courts: "3; drop table" }, { city: "Berlin" }, { name: "n".repeat(500) }, { price90: "1e9" }, { contact: "x".repeat(500) }]) {
      expect(parseOnboarding({ ...ok, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("werteAusFormData", () => {
  it("liest nur die bekannten Felder als Text; Dateien und fehlende Felder werden leerer Text, fremde Felder fallen weg", () => {
    const fd = new FormData();
    fd.set("name", "A");
    fd.set("fremd", "x");
    fd.set("price60", new File(["x"], "a.txt"));
    const w = werteAusFormData(fd);
    expect(w.name).toBe("A");
    expect(w.price60).toBe("");
    expect(w.courts).toBe("");
    expect("fremd" in w).toBe(false);
  });
});
