import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appleLoginAktiv, operatorFelder, PLATZHALTER } from "@/lib/legal";

// Rechtstexte (Go-live): fehlende Betreiberangaben erscheinen als klar markierte Platzhalter, nie als erfundener Wert; vorhandene Angaben aus der Umgebung ersetzen sie.
const KEYS = ["OPERATOR_NAME", "OPERATOR_ADDRESS", "OPERATOR_EMAIL", "APPLE_LOGIN_ENABLED"] as const;
const alt = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (alt[k] === undefined) delete process.env[k];
    else process.env[k] = alt[k];
  }
});

describe("operatorFelder", () => {
  it("ohne Umgebungswerte: jedes Feld ist ein Platzhalter in eckigen Klammern, nicht vollständig", () => {
    for (const k of KEYS) delete process.env[k];
    const f = operatorFelder();
    expect(f.complete).toBe(false);
    for (const feld of [f.name, f.address, f.email]) {
      expect(feld.platzhalter).toBe(true);
      expect(feld.text).toMatch(/^\[PLATZHALTER: .+\]$/);
    }
  });

  it("mit Werten: der Wert steht da, kein Platzhalter; ein fehlendes Feld bleibt Platzhalter", () => {
    process.env.OPERATOR_NAME = "Test Betreiber";
    process.env.OPERATOR_ADDRESS = "Teststraße 1\n45127 Essen";
    delete process.env.OPERATOR_EMAIL;
    const f = operatorFelder();
    expect(f.name).toEqual({ text: "Test Betreiber", platzhalter: false });
    expect(f.address.platzhalter).toBe(false);
    expect(f.email).toEqual({ text: PLATZHALTER.email, platzhalter: true });
    expect(f.complete).toBe(false);
    process.env.OPERATOR_EMAIL = "betreiber@example.test";
    expect(operatorFelder().complete).toBe(true);
  });

  it("Leerzeichen allein zählen als fehlend", () => {
    process.env.OPERATOR_NAME = "   ";
    expect(operatorFelder().name.platzhalter).toBe(true);
  });
});

describe("appleLoginAktiv", () => {
  it("nur bei APPLE_LOGIN_ENABLED=1", () => {
    delete process.env.APPLE_LOGIN_ENABLED;
    expect(appleLoginAktiv()).toBe(false);
    process.env.APPLE_LOGIN_ENABLED = "1";
    expect(appleLoginAktiv()).toBe(true);
    process.env.APPLE_LOGIN_ENABLED = "true";
    expect(appleLoginAktiv()).toBe(false);
  });
});

describe("Rechtsseiten: keine erfundenen Rechtsangaben im Quelltext", () => {
  const impressum = readFileSync("src/app/impressum/page.tsx", "utf8");
  it("Impressum: Steuer-ID und Streitbeilegung sind Platzhalter, keine behaupteten Werte", () => {
    expect(impressum).toContain("PLATZHALTER.steuerId");
    expect(impressum).toContain("PLATZHALTER.streit");
    expect(impressum).not.toMatch(/weder bereit noch verpflichtet/);
    expect(impressum).not.toMatch(/DE\d{9}/);
  });
  it("Datenschutz: Aufsichtsbehörde ist Platzhalter; Zahlungstexte hängen am Schalter Zahlungen AUS", () => {
    const ds = readFileSync("src/app/datenschutz/page.tsx", "utf8");
    expect(ds).toContain("PLATZHALTER.aufsicht");
    expect(ds).toContain("zahlungenAus");
    expect(ds).toMatch(/aus \? [\s\S]*Teilnahmegebühr/);
  });
});
