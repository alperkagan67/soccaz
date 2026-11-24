import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APPLE_ABWEISUNG, APPLE_KEINE_EMAIL } from "@/lib/apple-login";

// Wächter für die Verdrahtung der Apple-Anmeldung (Auth.js lässt sich unter Vitest nicht starten, darum Quelltext-Prüfung der Schutzstellen)
const src = (p: string) => readFileSync(p, "utf8");

describe("src/auth.ts: Apple nur hinter dem Schalter, Zuordnung nur über den sub", () => {
  const auth = src("src/auth.ts");
  it("Provider nur bei appleAn; Cookies nur über appleCookies; signIn lehnt Apple ohne Schalter ab", () => {
    expect(auth).toContain("const appleAn = appleLoginEnabled(process.env);");
    expect(auth).toMatch(/\.\.\.\(appleAn\s*\?\s*\[\s*Apple\(/);
    expect(auth).toContain("appleCookies(process.env,");
    expect(auth).toMatch(/provider === "apple"\) \{\s*if \(!appleAn\) return false;/);
  });
  it("Konto-Zuordnung nur über anmeldenMitApple (kein upsertUser per E-Mail für Apple); Abweisung führt auf /anmelden mit Hinweis", () => {
    const block = auth.slice(auth.indexOf('provider === "apple") {'), auth.indexOf('provider === "google"'));
    expect(block).toContain("anmeldenMitApple(");
    expect(block).not.toContain("upsertUser");
    expect(block).toContain("/anmelden?fehler=apple_email");
    expect(block).toContain("/anmelden?fehler=apple_keine_email");
  });
  it("jwt setzt bei Apple die kanonische Konto-E-Mail über apple_id", () => {
    expect(auth).toMatch(/account\?\.provider === "apple" && account\.providerAccountId[\s\S]*eq\(users\.appleId, account\.providerAccountId\)[\s\S]*token\.email = a\.email/);
  });
  it("keine automatische Zusammenführung: der Apple-Zweig setzt nie google_id und legt nichts über die E-Mail an", () => {
    expect(auth.slice(auth.indexOf('provider === "apple") {'), auth.indexOf('provider === "google"'))).not.toMatch(/googleId|\.update\(users\)/);
  });
});

describe("Anmeldeseite und Texte", () => {
  const seite = src("src/app/anmelden/page.tsx");
  it("Apple-Knopf nur bei appleLoginEnabled; ohne Schalter kein Wort Apple in der Seite", () => {
    expect(seite).toContain("const hasApple = appleLoginEnabled(process.env);");
    expect(seite).toMatch(/\{hasApple && \(\s*<form/);
    const ohneApple = seite.replace(/\{hasApple && \([\s\S]*?\n      \)\}\n/, "").replace(/\{fehler === "apple_[a-z_]+" && \([\s\S]*?\n      \)\}\n/g, "");
    expect(ohneApple.match(/apple/gi)?.length ?? 0, "verbleibende Treffer außerhalb der geschützten Blöcke: nur Bezeichner").toBeLessThanOrEqual(6);
  });
  it("i18n-Hinweistexte stimmen mit den Konstanten überein (Abweisung ohne E-Mail-Adresse)", () => {
    const i18n = src("src/lib/i18n.ts");
    expect(i18n).toContain(`"signin.appleEmail": "${APPLE_ABWEISUNG}"`);
    expect(i18n).toContain(`"signin.appleKeineEmail": "${APPLE_KEINE_EMAIL}"`);
  });
});

describe("Willkommen: Platzhalter-Name wird nicht vorbelegt", () => {
  it("defaultName leer, wenn der Name der Platzhalter ist", () => {
    expect(src("src/app/willkommen/page.tsx")).toContain('defaultName={user.name === APPLE_NAME_PLATZHALTER ? "" : user.name}');
  });
});
