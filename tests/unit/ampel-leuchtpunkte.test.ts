import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Look-Entscheid (t2q, Impeccable-Lauf M3): Die Ampelpunkte leuchten dezent (nicht aus: Richtung F will Leucht-Effekte). Die Farbe ist nie alleiniger Träger: Wort (sichtbar oder sr-only) und data-light bleiben.
const code = readFileSync(join(__dirname, "..", "..", "src", "components", "PlayerLight.tsx"), "utf8");

describe("PlayerLight: dezenter Leuchtschatten", () => {
  it("Schatten höchstens 4 px und höchstens 40 % Deckkraft (vorher 6 px, 53 %)", () => {
    const m = /boxShadow: `0 0 (\d+)px \$\{COLOR\[light\]\}([0-9a-f]{2})`/.exec(code);
    expect(m, "Leuchtschatten nicht gefunden").not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(4);
    expect(parseInt(m![2], 16) / 255).toBeLessThanOrEqual(0.4);
  });
  it("das Wort bleibt Träger: Beschriftung (sichtbar oder sr-only) und data-light stehen im Punkt", () => {
    expect(code).toMatch(/sr-only/);
    expect(code).toMatch(/data-light=\{light\}/);
    expect(code).toMatch(/aria-hidden/);
  });
});
