import { describe, expect, it } from "vitest";
import { frozenStage } from "@/server/tournaments";

// 012-Rest PR A (Backlog 141, Entscheid t2q): Alarm an Admin 1 ab 6 Stunden Einfrierung, danach alle 12 Stunden. Rein rechnerisch.
const H = 3_600_000;
const since = new Date("2026-12-10T12:00:00Z");
const at = (hours: number) => new Date(since.getTime() + hours * H);

describe("frozenStage", () => {
  it.each([
    [-1, undefined],
    [0, undefined],
    [5.99, undefined],
    [6, 0],
    [17.99, 0],
    [18, 1], // 6 h + 12 h
    [29.99, 1],
    [30, 2],
    [54, 4],
  ])("%s Stunden nach dem Zeitpunkt -> Stufe %s", (hours, stage) => {
    expect(frozenStage(at(hours), since)).toBe(stage);
  });
});
