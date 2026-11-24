import { describe, expect, it } from "vitest";
import { APPLE_ABWEISUNG, APPLE_NAME_PLATZHALTER, appleCookies, appleLoginEnabled, appleNameAusProfil } from "@/lib/apple-login";

const AN = { APPLE_LOGIN_ENABLED: "1", AUTH_APPLE_ID: "de.socaz.web.anmeldung", AUTH_APPLE_SECRET: "a.b.c" };

describe("appleLoginEnabled: Schalter UND beide Werte nötig (fail closed)", () => {
  it("nur mit APPLE_LOGIN_ENABLED=1, Services ID und Secret", () => {
    expect(appleLoginEnabled(AN)).toBe(true);
    for (const k of Object.keys(AN) as (keyof typeof AN)[]) expect(appleLoginEnabled({ ...AN, [k]: undefined }), k).toBe(false);
    for (const v of ["0", "", "true", "yes", " 1"]) expect(appleLoginEnabled({ ...AN, APPLE_LOGIN_ENABLED: v }), v).toBe(false);
    expect(appleLoginEnabled({ ...AN, AUTH_APPLE_ID: "" })).toBe(false);
    expect(appleLoginEnabled({ ...AN, AUTH_APPLE_SECRET: "" })).toBe(false);
    expect(appleLoginEnabled({})).toBe(false);
  });
});

describe("appleCookies: SameSite=None; Secure nur bei aktivem Apple (Rückkehr per POST von appleid.apple.com)", () => {
  it("aus: keine Überschreibung der Standard-Cookies (Google bleibt unberührt)", () => {
    expect(appleCookies({ ...AN, APPLE_LOGIN_ENABLED: "0" }, true)).toBeUndefined();
    expect(appleCookies({}, true)).toBeUndefined();
  });
  it("an und https: state, pkce und nonce mit sameSite none und secure, __Secure-Präfix, httpOnly", () => {
    const c = appleCookies(AN, true)!;
    expect(Object.keys(c).sort()).toEqual(["nonce", "pkceCodeVerifier", "state"]);
    expect(c.state.name).toBe("__Secure-authjs.state");
    expect(c.pkceCodeVerifier.name).toBe("__Secure-authjs.pkce.code_verifier");
    expect(c.nonce.name).toBe("__Secure-authjs.nonce");
    for (const k of Object.keys(c) as (keyof typeof c)[]) expect(c[k].options).toMatchObject({ sameSite: "none", secure: true, httpOnly: true, path: "/" });
  });
  it("an ohne https (lokal): keine None-Cookies (Browser verwerfen sie ohne Secure), Standard bleibt", () => {
    expect(appleCookies(AN, false)).toBeUndefined();
  });
});

describe("appleNameAusProfil", () => {
  it("nur beim ersten Login liefert Apple den Namen; sonst und bei Relay-Adresse ein Platzhalter (das Onboarding fragt den Namen)", () => {
    expect(appleNameAusProfil({ user: { name: { firstName: "Ali", lastName: "Kaya" } } })).toBe("Ali Kaya");
    expect(appleNameAusProfil({ user: { name: { firstName: "Ali" } } })).toBe("Ali");
    expect(appleNameAusProfil({})).toBe(APPLE_NAME_PLATZHALTER);
    expect(appleNameAusProfil({ user: { name: {} } })).toBe(APPLE_NAME_PLATZHALTER);
    expect(appleNameAusProfil({ user: { name: { firstName: "  ", lastName: "" } } })).toBe(APPLE_NAME_PLATZHALTER);
    expect(appleNameAusProfil({ user: { name: { firstName: "A".repeat(300) } } }).length).toBeLessThanOrEqual(80);
  });
});

describe("Abweisungstext", () => {
  it("neutral: kein Anbieter, keine E-Mail-Adresse, keine Kontodaten", () => {
    expect(APPLE_ABWEISUNG).not.toMatch(/Google|Apple/i); // neutral: die Kollision kann ein Google-, Apple- oder Entwicklungs-Konto sein
    expect(APPLE_ABWEISUNG).not.toMatch(/@/);
  });
});
