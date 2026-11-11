import { describe, expect, it } from "vitest";
import { graceUntil, GRACE_MS, GRACE_MIN_REMAINING_MS } from "@/lib/grace";

const H = 3_600_000;
const t = (iso: string) => new Date(iso);

describe("graceUntil: Nachzahlfenster = min(2 h ab Fehler, Anstoß minus 1 h) (Vertrag 012 AC-6)", () => {
  const now = t("2026-11-20T10:00:00Z");
  it("viel Zeit bis zum Anstoß: genau 2 Stunden ab dem Fehler", () => {
    expect(graceUntil(now, new Date(now.getTime() + 24 * H))?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });
  it("Anstoß in 2,5 h: Ende ist Anstoß minus 1 h (nach 1,5 h), nicht 2 h", () => {
    const start = new Date(now.getTime() + 2.5 * H);
    expect(graceUntil(now, start)?.toISOString()).toBe(new Date(start.getTime() - H).toISOString());
  });
  it("Anstoß in genau 3 h: beide Grenzen gleich (2 h)", () => {
    expect(graceUntil(now, new Date(now.getTime() + 3 * H))?.toISOString()).toBe("2026-11-20T12:00:00.000Z");
  });
  it("weniger als 1 h Restzeit: kein Fenster (null)", () => {
    expect(graceUntil(now, new Date(now.getTime() + 59 * 60_000))).toBeNull();
    expect(graceUntil(now, new Date(now.getTime() + 30 * 60_000))).toBeNull();
  });
  it("genau 1 h Restzeit: kein Fenster mit Länge 0, also null", () => {
    expect(graceUntil(now, new Date(now.getTime() + H))).toBeNull();
  });
  it("kurz über 1 h: ein kurzes Fenster (Anstoß minus 1 h)", () => {
    const start = new Date(now.getTime() + H + 60_000);
    expect(graceUntil(now, start)?.toISOString()).toBe(new Date(now.getTime() + 60_000).toISOString());
  });
  it("Anstoß schon vorbei: null", () => {
    expect(graceUntil(now, new Date(now.getTime() - H))).toBeNull();
  });
  it("Konstanten", () => {
    expect(GRACE_MS).toBe(2 * H);
    expect(GRACE_MIN_REMAINING_MS).toBe(H);
  });
});
