import { describe, expect, it } from "vitest";
import { DECLINE_CODES, DECLINE_MESSAGES, tidyDeclineText, validateDecline } from "@/lib/hall-decline";
import { formatRemaining, replyWindow } from "@/lib/hall-reply-view";

// 011 M2b: Eingabeprüfung der Ablehnung (erste Stufe) und Anzeige der Antwortfrist (reine Funktionen, ohne Datenbank).
describe("validateDecline (Grund Pflicht, Anmerkung optional 3 bis 200, bei „sonstiges“ Pflicht)", () => {
  it("ohne Grund: Fehler am Feld reasonCode", () => {
    for (const code of [undefined, null, "", "unbekannt", "BELEGT"]) {
      const r = validateDecline({ code, text: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.reasonCode).toBe(DECLINE_MESSAGES.codeMissing);
    }
  });

  it("gültiger Grund ohne Anmerkung: ok (außer sonstiges)", () => {
    for (const code of DECLINE_CODES.filter((c) => c !== "sonstiges")) {
      expect(validateDecline({ code, text: "" })).toEqual({ ok: true, code, text: "" });
      expect(validateDecline({ code, text: "   " })).toEqual({ ok: true, code, text: "" });
    }
  });

  it("sonstiges braucht eine Anmerkung von 3 bis 200 Zeichen", () => {
    for (const text of ["", "  ", "ab", "x".repeat(201)]) {
      const r = validateDecline({ code: "sonstiges", text });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors.reason).toBe(DECLINE_MESSAGES.textRequired);
    }
    expect(validateDecline({ code: "sonstiges", text: "abc" }).ok).toBe(true);
    expect(validateDecline({ code: "sonstiges", text: "x".repeat(200) }).ok).toBe(true);
  });

  it("bei anderen Gründen: vorhandene Anmerkung muss 3 bis 200 Zeichen haben", () => {
    const r = validateDecline({ code: "belegt", text: "ab" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.reason).toBe(DECLINE_MESSAGES.textLength);
    expect(validateDecline({ code: "belegt", text: "x".repeat(201) }).ok).toBe(false);
    expect(validateDecline({ code: "wartung", text: "Platz gesperrt" })).toEqual({ ok: true, code: "wartung", text: "Platz gesperrt" });
  });

  it("zählt Zeichen, nicht UTF-16-Einheiten, und fasst Leerraum zusammen", () => {
    expect(validateDecline({ code: "sonstiges", text: "😀😀😀" }).ok).toBe(true); // 3 Zeichen
    expect(tidyDeclineText("  a   b\t\tc \n\n\n\n d ")).toBe("a b c \n\n d");
  });

  it("beide Fehler gleichzeitig: Grund fehlt und die Anmerkung ist zu kurz", () => {
    const r = validateDecline({ code: "", text: "ab" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.fieldErrors).sort()).toEqual(["reason", "reasonCode"]);
  });
});

describe("replyWindow (gespeicherte Frist, Restzeit nur beim Laden)", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms);
  it("keine Frist: none", () => {
    expect(replyWindow(null, now)).toEqual({ state: "none", remainingText: null });
  });
  it("Frist erreicht oder überschritten: expired, keine Restzeit", () => {
    expect(replyWindow(at(0), now).state).toBe("expired");
    expect(replyWindow(at(-1), now)).toEqual({ state: "expired", remainingText: null });
  });
  it("weniger als 1 Stunde: soon; sonst open", () => {
    expect(replyWindow(at(59 * 60_000), now)).toEqual({ state: "soon", remainingText: "59 Min." });
    expect(replyWindow(at(3_600_000), now).state).toBe("open");
    expect(replyWindow(at(3 * 3_600_000 + 20 * 60_000), now)).toEqual({ state: "open", remainingText: "3 Std. 20 Min." });
  });
  it("formatRemaining", () => {
    expect(formatRemaining(30_000)).toBe("weniger als 1 Min.");
    expect(formatRemaining(60_000)).toBe("1 Min.");
    expect(formatRemaining(2 * 3_600_000)).toBe("2 Std.");
  });
});
