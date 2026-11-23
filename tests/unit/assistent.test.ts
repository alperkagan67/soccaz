import { describe, expect, it } from "vitest";
import {
  ENTWURF_VERSION,
  MAX_ENTWURF_ZEICHEN,
  MAX_WERT_LAENGE,
  entwurfSchluessel,
  fortschritt,
  istLetzterSchritt,
  leseEntwurf,
  schrittStatus,
  serialisiereEntwurf,
  setzeWert,
  springeZuFehler,
  startZustand,
  weiter,
  zurueck,
  type SchrittInfo,
} from "@/lib/assistent";

// Vertrag 013 Version 3, AC-25/26: die Logik des Bausteins Assistent ohne DOM (Verhalten im Browser: tests/e2e/halle-onboarding.spec.ts mit M2d).
const schritte: SchrittInfo[] = [
  { id: "name", felder: ["name", "adresse"] },
  { id: "plaetze", felder: ["plaetze"] },
  { id: "preise", felder: ["preis60", "preis90"] },
  { id: "abschluss", felder: ["bedingungen"], nichtSpeichern: ["bedingungen"] },
];

describe("Assistent: Schrittfolge", () => {
  it("startet im ersten Schritt ohne Fehler und mit den Anfangswerten", () => {
    const z = startZustand({ name: "Halle A" });
    expect(z).toEqual({ schritt: 0, werte: { name: "Halle A" }, fehler: {} });
    expect(fortschritt(z, 4)).toEqual({ n: 1, m: 4 });
    expect(istLetzterSchritt(z, 4)).toBe(false);
  });

  it("weiter ohne Fehler geht einen Schritt vor, nie über den letzten hinaus", () => {
    let z = startZustand();
    for (let i = 0; i < 10; i++) z = weiter(z, 4, {});
    expect(z.schritt).toBe(3);
    expect(istLetzterSchritt(z, 4)).toBe(true);
    expect(fortschritt(z, 4)).toEqual({ n: 4, m: 4 });
  });

  it("weiter mit Fehlern bleibt im Schritt, behält die Eingaben und zeigt die Fehler", () => {
    const z0 = setzeWert(startZustand(), "name", "");
    const z1 = weiter(z0, 4, { name: "Bitte einen Namen angeben." });
    expect(z1.schritt).toBe(0);
    expect(z1.fehler).toEqual({ name: "Bitte einen Namen angeben." });
    expect(z1.werte).toEqual({ name: "" });
  });

  it("zurück braucht keine Prüfung, hält bei 0 an und behält alle Eingaben", () => {
    let z = setzeWert(startZustand(), "name", "Halle A");
    z = weiter(z, 4, {});
    z = setzeWert(z, "plaetze", "3");
    z = zurueck(z);
    expect(z.schritt).toBe(0);
    expect(z.werte).toEqual({ name: "Halle A", plaetze: "3" });
    expect(zurueck(z).schritt).toBe(0);
  });

  it("eine Änderung entfernt nur den Fehler dieses Feldes", () => {
    let z = weiter(startZustand(), 4, { name: "falsch", adresse: "falsch" });
    z = setzeWert(z, "name", "Halle A");
    expect(z.fehler).toEqual({ adresse: "falsch" });
  });

  it("Status je Eintrag der Fortschrittsliste: erledigt, aktuell, offen", () => {
    const z = { ...startZustand(), schritt: 2 };
    expect([0, 1, 2, 3].map((i) => schrittStatus(z, i))).toEqual(["erledigt", "erledigt", "aktuell", "offen"]);
  });
});

describe("Assistent: Serverfehler am Ende", () => {
  it("springt zum ersten Schritt mit einem betroffenen Feld und zeigt dort die Fehler", () => {
    const z = { ...startZustand({ preis60: "999" }), schritt: 3 };
    const z1 = springeZuFehler(z, schritte, { preis90: "zu hoch", preis60: "zu hoch" });
    expect(z1.schritt).toBe(2);
    expect(z1.fehler).toEqual({ preis90: "zu hoch", preis60: "zu hoch" });
    expect(z1.werte).toEqual(z.werte);
  });

  it("nimmt bei mehreren Schritten den frühesten; ohne passendes Feld bleibt der Schritt", () => {
    const z = { ...startZustand(), schritt: 3 };
    expect(springeZuFehler(z, schritte, { adresse: "x", preis60: "y" }).schritt).toBe(0);
    expect(springeZuFehler(z, schritte, { unbekannt: "x" }).schritt).toBe(3);
  });
});

describe("Assistent: Entwurf (sessionStorage)", () => {
  it("der Schlüssel gehört zum Ablauf", () => {
    expect(entwurfSchluessel("halle-onboarding")).toBe("assistent:halle-onboarding");
  });

  it("Rundlauf: Schritt und Werte der bekannten Felder bleiben erhalten", () => {
    const z = { schritt: 2, werte: { name: "Halle A", adresse: "Hauptstr. 1", plaetze: "3", preis60: "40" }, fehler: { preis90: "x" } };
    const roh = serialisiereEntwurf(z, schritte);
    expect(JSON.parse(roh).v).toBe(ENTWURF_VERSION);
    expect(roh).not.toContain("preis90"); // Fehler stehen nie im Entwurf
    expect(leseEntwurf(roh, schritte)).toEqual({ schritt: 2, werte: { name: "Halle A", adresse: "Hauptstr. 1", plaetze: "3", preis60: "40" } });
  });

  it("nichtSpeichern-Felder und unbekannte Felder landen nie im Entwurf", () => {
    const z = { schritt: 3, werte: { name: "Halle A", bedingungen: "ja", fremd: "x" }, fehler: {} };
    const roh = serialisiereEntwurf(z, schritte);
    expect(roh).not.toContain("bedingungen");
    expect(roh).not.toContain("fremd");
    expect(leseEntwurf(roh, schritte)?.werte).toEqual({ name: "Halle A" });
  });

  it("ein manipulierter Entwurf wird gefiltert: unbekannte Felder, Nicht-Texte, zu lange Werte, nichtSpeichern", () => {
    const roh = JSON.stringify({ v: ENTWURF_VERSION, schritt: 1, werte: { name: "ok", bedingungen: "ja", fremd: "x", plaetze: 3, adresse: "a".repeat(MAX_WERT_LAENGE + 1) } });
    expect(leseEntwurf(roh, schritte)).toEqual({ schritt: 1, werte: { name: "ok" } });
  });

  it("der Schritt wird auf den gültigen Bereich begrenzt; Unsinn wird 0", () => {
    const mit = (s: unknown) => leseEntwurf(JSON.stringify({ v: ENTWURF_VERSION, schritt: s, werte: {} }), schritte)?.schritt;
    expect(mit(99)).toBe(3);
    expect(mit(-4)).toBe(0);
    expect(mit(1.5)).toBe(0);
    expect(mit("2")).toBe(0);
  });

  it("kaputte, fremde, falsch versionierte oder zu große Entwürfe ergeben null", () => {
    for (const roh of [null, undefined, "", "{", "[]", "null", "42", JSON.stringify({ v: 99, schritt: 0, werte: {} }), JSON.stringify({ v: ENTWURF_VERSION, schritt: 0 }), JSON.stringify({ v: ENTWURF_VERSION, schritt: 0, werte: [] })]) {
      expect(leseEntwurf(roh as string | null | undefined, schritte), String(roh)).toBeNull();
    }
    expect(leseEntwurf("x".repeat(MAX_ENTWURF_ZEICHEN + 1), schritte)).toBeNull();
  });
});
