import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Vertrag 013 v3, AC-22 (nur transform/opacity, will-change nur während der Animation, keine Animationsbibliothek), AC-23 (Reduced Motion unter 150 ms ohne Bewegung)
// und die Dauer-Tokens aus DESIGN.md. Die Regeln werden aus src/app/globals.css gelesen, nicht nachgebaut.
const root = process.cwd();
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const design = readFileSync(path.join(root, "DESIGN.md"), "utf8");

/** Inhalt eines @keyframes-Blocks (balancierte Klammern). */
function block(source: string, header: string): string {
  const i = source.indexOf(header);
  if (i < 0) throw new Error(`nicht gefunden: ${header}`);
  const open = source.indexOf("{", i);
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}" && --depth === 0) return source.slice(open + 1, j);
  }
  throw new Error(`Klammern nicht balanciert: ${header}`);
}
const properties = (body: string) => [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
const KEYFRAMES = ["reveal-in", "reveal-fade", "promote-pop"];
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

describe("Bewegung: AC-22 (nur transform und opacity)", () => {
  it("alle Keyframes des Aufdeckens ändern nur transform und opacity", () => {
    for (const name of KEYFRAMES) {
      const props = new Set(properties(block(css, `@keyframes ${name}`)));
      for (const p of props) expect(["transform", "opacity"], `${name}: ${p}`).toContain(p);
      expect(props.size, name).toBeGreaterThan(0);
    }
  });

  it("will-change steht nur in Regeln mit .is-animating (nie dauerhaft) und nennt nur transform/opacity", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*will-change[^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      expect(selector, "will-change nur mit .is-animating").toContain(".is-animating");
      const value = /will-change:\s*([^;]+);/.exec(body)![1];
      for (const v of value.split(",")) expect(["transform", "opacity"]).toContain(v.trim());
    }
  });

  it("die Regeln des Aufdeckens nutzen nur die animation-Eigenschaft (keine transition auf Layout), und nur die drei Keyframes", () => {
    const rules = [...css.matchAll(/([^{}]*\.reveal-[^{}]*|[^{}]*player-card-tier[^{}]*)\{([^{}]*)\}/g)].filter(([, , body]) => /animation|transition/.test(body));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, , body] of rules) {
      expect(body).not.toMatch(/transition/);
      const names = [...body.matchAll(/animation:\s*([a-z-]+)/g)].map((m) => m[1]);
      for (const n of names) expect([...KEYFRAMES, "none"]).toContain(n);
    }
  });

  it("keine Animationsbibliothek in den Abhängigkeiten (ADR 0003 nicht nötig: reines CSS)", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const lib of ["framer-motion", "motion", "gsap", "react-spring", "@react-spring/web", "animejs", "lottie-web", "@formkit/auto-animate", "react-transition-group"]) expect(names, lib).not.toContain(lib);
  });
});

describe("Bewegung: AC-23 (reduzierte Bewegung)", () => {
  const reduced = block(css.slice(css.indexOf("@keyframes promote-pop")), "@media (prefers-reduced-motion: reduce)");

  it("die Ausnahme für das Aufdecken steht NACH der globalen Abschaltung und blendet nur ein (opacity, unter 150 ms, keine Bewegung)", () => {
    const globalAt = css.indexOf("@media (prefers-reduced-motion: reduce) {\n  * { transition: none !important; animation: none !important; }");
    const exceptionAt = css.indexOf("@keyframes reveal-in");
    expect(globalAt).toBeGreaterThanOrEqual(0);
    expect(exceptionAt).toBeGreaterThan(globalAt);
    expect(reduced).toContain("animation: reveal-fade var(--dur-reduced)");
    expect(reduced).toContain("!important"); // nötig, um die globale !important-Regel zu überstimmen
    expect(properties(block(css, "@keyframes reveal-fade"))).toEqual(["opacity", "opacity"]);
    expect(reduced).not.toMatch(/transform/);
    expect(parseInt(token("dur-reduced")!, 10)).toBeLessThan(150);
  });

  it("der Chip-Pop entfällt bei reduzierter Bewegung (animation: none)", () => {
    expect(reduced).toMatch(/player-card-tier"\]\s*\{\s*animation:\s*none\s*!important/);
  });
});

describe("Dauer-Tokens (DESIGN.md)", () => {
  it("--dur-reveal, --dur-reduced und --ease-out stimmen mit der Tabelle und dem Frontmatter in DESIGN.md überein", () => {
    const ms = (v: string | undefined) => parseInt(v ?? "", 10);
    expect(ms(token("dur-reveal"))).toBe(Number(/dur-reveal:\s*(\d+)/.exec(design)![1]));
    expect(ms(token("dur-reduced"))).toBe(Number(/dur-reduced:\s*(\d+)/.exec(design)![1]));
    expect(token("ease-out")).toBe(/ease-out:\s*"([^"]+)"/.exec(design)![1]);
    expect(design).toMatch(/\|\s*`dur-reveal`\s*\|\s*600 ms/);
    expect(design).toMatch(/\|\s*`dur-reduced`\s*\|\s*120 ms/);
  });
});
