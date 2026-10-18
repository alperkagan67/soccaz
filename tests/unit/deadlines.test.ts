import { describe, expect, it } from "vitest";
import { dueReminders, lobbyDeadline } from "@/lib/deadlines";

const h = (n: number) => n * 3_600_000;

describe("Lobby-Frist", () => {
  it("normalerweise 24 Stunden vor Anstoß", () => {
    const starts = new Date("2026-11-10T20:00:00Z");
    const created = new Date("2026-11-01T10:00:00Z");
    expect(lobbyDeadline(starts, created).toISOString()).toBe("2026-11-09T20:00:00.000Z");
  });
  it("kurz vor Anstoß angenommen: mindestens 12 Stunden Zeit", () => {
    const starts = new Date("2026-11-10T20:00:00Z");
    const created = new Date(starts.getTime() - h(25)); // Annahme 25 Stunden vorher
    expect(lobbyDeadline(starts, created).getTime()).toBe(created.getTime() + h(12));
  });
});

describe("Erinnerungen", () => {
  const starts = new Date("2026-11-10T20:00:00Z");
  const at = (hoursBefore: number) => new Date(starts.getTime() - h(hoursBefore));
  it("noch nichts fällig", () => expect(dueReminders(starts, at(48))).toEqual([]));
  it("24 Stunden vorher", () => expect(dueReminders(starts, at(23))).toEqual(["24h"]));
  it("2 Stunden vorher: dringendste zuerst", () => expect(dueReminders(starts, at(1.5))).toEqual(["2h", "24h"]));
  it("30 Minuten vorher", () => expect(dueReminders(starts, at(0.4))).toEqual(["30m", "2h", "24h"]));
  it("nach Anstoß keine", () => expect(dueReminders(starts, new Date(starts.getTime() + 1))).toEqual([]));
});
