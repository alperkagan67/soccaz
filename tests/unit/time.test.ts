import { describe, expect, it } from "vitest";
import { berlinDayRange, parseBerlinLocal, toBerlinInputValue } from "@/lib/time";

describe("Berliner Ortszeit", () => {
  it("Winterzeit ist UTC+1", () => {
    expect(parseBerlinLocal("2026-12-05T20:00")?.toISOString()).toBe("2026-12-05T19:00:00.000Z");
  });
  it("Sommerzeit ist UTC+2", () => {
    expect(parseBerlinLocal("2026-07-05T20:00")?.toISOString()).toBe("2026-07-05T18:00:00.000Z");
  });
  it("Umstellung auf Sommerzeit am 29.03.2026", () => {
    expect(parseBerlinLocal("2026-03-29T01:30")?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(parseBerlinLocal("2026-03-29T03:30")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });
  it("lehnt ungültige Eingaben ab", () => {
    expect(parseBerlinLocal("morgen")).toBeNull();
    expect(parseBerlinLocal("2026-13-40T99:99")).toBeNull();
  });
  it("Rundreise Eingabe -> UTC -> Eingabe", () => {
    const d = parseBerlinLocal("2026-11-05T20:00")!;
    expect(toBerlinInputValue(d)).toBe("2026-11-05T20:00");
  });
  it("Tagesgrenzen eines Berliner Tages", () => {
    const r = berlinDayRange("2026-12-05")!;
    expect(r.from.toISOString()).toBe("2026-12-04T23:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-12-05T23:00:00.000Z");
  });
});
