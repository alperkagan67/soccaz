import { readFileSync } from "node:fs";
import path from "node:path";
import { RuleTester, type Rule } from "eslint";
import { describe, expect, it } from "vitest";
import plugin from "../../eslint-rules/min-font-size.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } } });
const rule = plugin.rules["min-font-size"] as unknown as Rule.RuleModule;

tester.run("min-font-size", rule, {
  valid: [
    { code: 'const a = "text-xs text-sm text-[12px] text-[0.75rem]";' },
    { code: 'const a = "text-[14px] sm:text-[1rem]";' },
    { code: "const s = { fontSize: 12 }; const t = { fontSize: '0.875rem' };" },
    { code: 'const a = "context-[10px]";' },
    { code: "const s = { fontWeight: 600, lineHeight: 10 };" },
  ],
  invalid: [
    { code: 'const a = "rounded text-[11px] p-2";', errors: [{ messageId: "cls" }] },
    { code: 'const a = "md:text-[0.7rem]";', errors: [{ messageId: "cls" }] },
    { code: "const a = `flex text-[10px] ${x}`;", errors: [{ messageId: "cls" }] },
    { code: "const s = { fontSize: 11 };", errors: [{ messageId: "style" }] },
    { code: "const s = { fontSize: '10px' };", errors: [{ messageId: "style" }] },
    { code: "const s = { fontSize: '0.7rem' };", errors: [{ messageId: "style" }] },
    { code: 'const e = <span className="text-[9px]" />;', errors: [{ messageId: "cls" }] },
  ],
});

describe("globals.css", () => {
  it("enthält keine Schriftgröße unter 12 px", () => {
    const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");
    for (const m of css.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem|em)/g)) {
      const px = m[2] === "px" ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
      expect(px, m[0]).toBeGreaterThanOrEqual(12);
    }
  });
});
