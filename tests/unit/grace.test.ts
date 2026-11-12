import { describe, expect, it } from "vitest";
import { effectiveGraceEnd, GRACE_MIN_REMAINING_MS, GRACE_MS, graceUntil, inGraceWindow, isCardProblemCode } from "@/lib/grace";

const H = 3_600_000;
const t = (iso: string) => new Date(iso);
const now = t("2026-11-20T10:00:00Z");
const at = (h: number) => new Date(now.getTime() + h * H);

describe("graceUntil: Nachzahlfenster = min(2 h ab Fehler, Anstoß minus 1 h) (Vertrag 012 AC-6), nie null", () => {
  it("viel Zeit bis zum Anstoß: genau 2 Stunden ab dem Fehler", () => {
    expect(graceUntil(now, at(24)).toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });
  it("Anstoß in 2,5 h: Ende ist Anstoß minus 1 h (nach 1,5 h), nicht 2 h", () => {
    expect(graceUntil(now, at(2.5)).toISOString()).toBe(new Date(at(2.5).getTime() - H).toISOString());
  });
  it("Anstoß in genau 3 h: beide Grenzen gleich (2 h)", () => {
    expect(graceUntil(now, at(3)).toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });
  it("höchstens 1 h Restzeit oder Anstoß vorbei: kein Fenster, das Ende ist der Fehlzeitpunkt (sofort abgelaufen)", () => {
    for (const h of [0.5, 59 / 60, 1, 0, -1]) {
      expect(graceUntil(now, at(h)).toISOString()).toBe(now.toISOString());
      expect(inGraceWindow(graceUntil(now, at(h)), at(h), now)).toBe(false);
    }
  });
  it("kurz über 1 h: ein kurzes Fenster (Anstoß minus 1 h)", () => {
    const start = new Date(now.getTime() + H + 60_000);
    expect(graceUntil(now, start).toISOString()).toBe(new Date(now.getTime() + 60_000).toISOString());
    expect(inGraceWindow(graceUntil(now, start), start, now)).toBe(true);
  });
  it("Konstanten", () => {
    expect(GRACE_MS).toBe(2 * H);
    expect(GRACE_MIN_REMAINING_MS).toBe(H);
  });
});

describe("effectiveGraceEnd / inGraceWindow: bei jeder Prüfung min(grace_until, Anstoß − 1 h) (Punkt 7)", () => {
  it("Altzeile ohne Fenster (null) hat kein Fenster", () => {
    expect(effectiveGraceEnd(null, at(10))).toBeNull();
    expect(inGraceWindow(null, at(10), now)).toBe(false);
  });
  it("der Termin wird nach dem Fehler vorverlegt: das Fenster endet spätestens 1 h vor dem neuen Anstoß", () => {
    const stored = graceUntil(now, at(24)); // Ende in 2 h
    const moved = at(2.5); // Anstoß jetzt in 2,5 h => spätestens in 1,5 h
    expect(effectiveGraceEnd(stored, moved)!.getTime()).toBe(moved.getTime() - H);
    expect(inGraceWindow(stored, moved, new Date(now.getTime() + 1.6 * H))).toBe(false);
    expect(inGraceWindow(stored, moved, new Date(now.getTime() + 1.4 * H))).toBe(true);
  });
  it("der Termin wird nach hinten verlegt: das gespeicherte Ende bleibt (nie länger)", () => {
    const stored = graceUntil(now, at(2.5));
    expect(effectiveGraceEnd(stored, at(48))!.getTime()).toBe(stored.getTime());
  });
});

describe("Sommer-/Winterzeit: Fenster sind absolute Zeitpunkte, nicht Wanduhr", () => {
  it("über die Umstellung am 25.10.2026 (03:00 -> 02:00 Berliner Zeit) bleibt es genau 2 Stunden", () => {
    const before = t("2026-10-25T00:30:00Z"); // 02:30 Sommerzeit
    const end = graceUntil(before, new Date(before.getTime() + 24 * H));
    expect(end.getTime() - before.getTime()).toBe(2 * H);
    expect(end.toISOString()).toBe("2026-10-25T02:30:00.000Z"); // 03:30 Winterzeit (Wanduhr springt, der Abstand nicht)
  });
  it("über die Umstellung am 29.03.2026 (02:00 -> 03:00) ebenfalls", () => {
    const before = t("2026-03-29T00:30:00Z"); // 01:30 Winterzeit
    expect(graceUntil(before, new Date(before.getTime() + 24 * H)).getTime() - before.getTime()).toBe(2 * H);
  });
});

describe("isCardProblemCode: nur Kartenfehler bekommen Fenster, Benachrichtigung und Wiederabbuchen", () => {
  it("technische Zustände sind keine Kartenfehler", () => {
    for (const c of ["unknown_outcome", "after_start", "idempotency_mismatch", "match_closed", "attempt_expired"]) expect(isCardProblemCode(c)).toBe(false);
  });
  it("Stripe-Kartencodes, authentication_required und no_payment_method sind Kartenfehler", () => {
    for (const c of ["card_declined", "insufficient_funds", "expired_card", "authentication_required", "no_payment_method", "some_new_stripe_code", null]) expect(isCardProblemCode(c)).toBe(true);
  });
});
