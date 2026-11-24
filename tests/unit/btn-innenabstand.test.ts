import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Impeccable-Lauf M3 (Lauf 1 und 2, P1 "cramped-padding 3,5 px"): der Baustein .btn hat senkrechten Innenabstand, damit ein umbrechender Text nicht am Rand sitzt; die Mindesthöhe 44 px (AC-3) bleibt.
const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
const regel = /\n\.btn \{([^}]*)\}/.exec(css)?.[1] ?? "";

describe(".btn: Innenabstand und Touch-Ziel", () => {
  it("die Regel ist da und hält 44 px Mindesthöhe", () => {
    expect(regel).not.toBe("");
    expect(regel).toMatch(/min-height:\s*44px/);
  });
  it("senkrechter Innenabstand mindestens 0,25rem (4 px), nicht 0", () => {
    const m = /padding:\s*([\d.]+)(rem|px)\s+[\d.]+(?:rem|px)/.exec(regel);
    expect(m, "padding mit zwei Werten erwartet").not.toBeNull();
    const px = Number(m![1]) * (m![2] === "rem" ? 16 : 1);
    expect(px).toBeGreaterThanOrEqual(4);
  });
  it("ein Einzeiler bleibt bei 44 px: Zeile (1,5 x 16 px = 24 px) plus Innenabstand plus Rand liegt unter der Mindesthöhe", () => {
    const m = /padding:\s*([\d.]+)(rem|px)/.exec(regel)!;
    const pad = Number(m[1]) * (m[2] === "rem" ? 16 : 1);
    expect(24 + 2 * pad + 2).toBeLessThanOrEqual(44);
  });
});
