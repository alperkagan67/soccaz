import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6b PR 1a: Aufladung, Checkout, Rabattcodes und der UI-nahe Bezahl-POST sind aus src/ entfernt (Quelltext-Test).
const root = process.cwd();
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mts)$/.test(n) ? [p] : []; });
const SRC = files(path.join(root, "src"));
const FORBIDDEN = /\b(payShareAction|createTopUp|completePayment|failPayment|previewPromo|redeemPromo|createPromo|createStripeCheckout)\b/;

describe("012 M6b PR 1a: keine Aufladung mehr", () => {
  it("keine der entfernten Funktionen kommt in src/ vor", () => {
    expect(SRC.filter((f) => FORBIDDEN.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f))).toEqual([]);
  });
  it("promo.ts und promo-rules.ts sind weg", () => {
    expect(existsSync(path.join(root, "src/server/promo.ts"))).toBe(false);
    expect(existsSync(path.join(root, "src/lib/promo-rules.ts"))).toBe(false);
  });
});
