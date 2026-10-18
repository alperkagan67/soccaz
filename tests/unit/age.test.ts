import { describe, expect, it } from "vitest";
import { ageOn, isOldEnough } from "@/lib/age";

const today = new Date("2026-10-18T12:00:00Z");

describe("Mindestalter 16", () => {
  it("rechnet volle Jahre", () => {
    expect(ageOn(new Date("2010-10-18"), today)).toBe(16);
    expect(ageOn(new Date("2010-10-19"), today)).toBe(15);
  });
  it("am 16. Geburtstag erlaubt, einen Tag davor nicht", () => {
    expect(isOldEnough(new Date("2010-10-18"), today)).toBe(true);
    expect(isOldEnough(new Date("2010-10-19"), today)).toBe(false);
  });
  it("Schaltjahr-Geburtstag", () => {
    expect(isOldEnough(new Date("2008-02-29"), new Date("2024-02-29T10:00:00Z"))).toBe(true);
  });
});
