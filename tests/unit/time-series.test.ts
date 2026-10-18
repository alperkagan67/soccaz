import { describe, expect, it } from "vitest";
import { addBerlinDays, berlinMonthRange, parseBerlinLocal, toBerlinInputValue } from "@/lib/time";

describe("Serien über die Zeitumstellung", () => {
  it("gleiche Berliner Uhrzeit, auch wenn die Uhren umgestellt werden", () => {
    const start = parseBerlinLocal("2026-10-24T20:00")!; // Sommerzeit
    const weeks = [0, 7, 14, 21].map((d) => toBerlinInputValue(addBerlinDays(start, d)));
    expect(weeks).toEqual(["2026-10-24T20:00", "2026-10-31T20:00", "2026-11-07T20:00", "2026-11-14T20:00"]);
    // in UTC liegt der Anstoß nach der Umstellung eine Stunde später
    expect(addBerlinDays(start, 14).getTime() - start.getTime()).toBe(14 * 86_400_000 + 3_600_000);
  });
  it("Frühjahr", () => {
    const start = parseBerlinLocal("2027-03-20T19:30")!;
    expect(toBerlinInputValue(addBerlinDays(start, 14))).toBe("2027-04-03T19:30");
  });
});

describe("Monatsgrenzen", () => {
  it("Berliner Monat in UTC", () => {
    const r = berlinMonthRange("2026-11");
    expect(r.month).toBe("2026-11");
    expect(r.from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(r.label).toBe("November 2026");
  });
  it("Dezember reicht ins nächste Jahr, ungültige Eingaben fallen auf den aktuellen Monat", () => {
    expect(berlinMonthRange("2026-12").to.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    const now = new Date("2026-05-15T10:00:00Z");
    expect(berlinMonthRange("2026-13", now).month).toBe("2026-05");
    expect(berlinMonthRange(undefined, now).month).toBe("2026-05");
  });
});
