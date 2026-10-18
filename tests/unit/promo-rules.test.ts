import { describe, expect, it } from "vitest";
import { checkPromo, computeBonus, normalizeCode, type PromoCodeRule, type PromoContext } from "@/lib/promo-rules";

const now = new Date("2026-11-01T12:00:00Z");
const base: PromoCodeRule = {
  kind: "percent",
  value: 10,
  minTopupCents: 0,
  maxBonusCents: null,
  budgetCents: null,
  usedCents: 0,
  validFrom: null,
  validUntil: null,
  newUsersOnly: false,
  maxPerUser: 1,
  active: true,
};
const ctx: PromoContext = { topupCents: 5000, now, hasPriorTopup: false, userRedemptions: 0 };

describe("Bonus", () => {
  it("Prozent, abgerundet", () => {
    expect(computeBonus({ kind: "percent", value: 10, maxBonusCents: null }, 5000)).toBe(500);
    expect(computeBonus({ kind: "percent", value: 15, maxBonusCents: null }, 999)).toBe(149);
  });
  it("Festbetrag und Deckel", () => {
    expect(computeBonus({ kind: "fixed", value: 300, maxBonusCents: null }, 5000)).toBe(300);
    expect(computeBonus({ kind: "percent", value: 50, maxBonusCents: 1000 }, 10_000)).toBe(1000);
  });
});

describe("Regeln eines Codes", () => {
  it("gültiger Code", () => expect(checkPromo(base, ctx)).toEqual({ ok: true, bonusCents: 500 }));
  it("inaktiv", () => expect(checkPromo({ ...base, active: false }, ctx)).toMatchObject({ ok: false }));
  it("noch nicht gültig / abgelaufen", () => {
    expect(checkPromo({ ...base, validFrom: new Date("2026-12-01") }, ctx)).toMatchObject({ ok: false, reason: expect.stringContaining("noch nicht") });
    expect(checkPromo({ ...base, validUntil: new Date("2026-10-01") }, ctx)).toMatchObject({ ok: false, reason: expect.stringContaining("abgelaufen") });
  });
  it("Mindestbetrag", () => expect(checkPromo({ ...base, minTopupCents: 10_000 }, ctx)).toMatchObject({ ok: false, reason: expect.stringContaining("100,00") }));
  it("nur Neukunden", () => {
    expect(checkPromo({ ...base, newUsersOnly: true }, ctx).ok).toBe(true);
    expect(checkPromo({ ...base, newUsersOnly: true }, { ...ctx, hasPriorTopup: true }).ok).toBe(false);
  });
  it("einmal pro Nutzer", () => {
    expect(checkPromo(base, { ...ctx, userRedemptions: 1 })).toMatchObject({ ok: false, reason: expect.stringContaining("schon eingelöst") });
    expect(checkPromo({ ...base, maxPerUser: 3 }, { ...ctx, userRedemptions: 2 }).ok).toBe(true);
  });
  it("Budget wird nie überschritten", () => {
    expect(checkPromo({ ...base, budgetCents: 600, usedCents: 200 }, ctx).ok).toBe(false); // 200 + 500 > 600
    expect(checkPromo({ ...base, budgetCents: 700, usedCents: 200 }, ctx).ok).toBe(true); // genau 700
  });
  it("kein Bonus bei Mini-Betrag", () => {
    expect(checkPromo({ ...base, value: 1 }, { ...ctx, topupCents: 50 })).toMatchObject({ ok: false });
  });
});

describe("Code-Schreibweise", () => {
  it("normalisiert", () => expect(normalizeCode("  sommer 10 ")).toBe("SOMMER10"));
});
