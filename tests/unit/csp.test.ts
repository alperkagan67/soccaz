import { describe, expect, it } from "vitest";
import { buildCsp } from "../../src/lib/csp";

function parse(csp: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...src] = part.trim().split(/\s+/);
    if (name) m.set(name, src);
  }
  return m;
}

describe("buildCsp", () => {
  it("ist in der Entwicklung aus", () => {
    expect(buildCsp(false)).toBeNull();
  });

  const d = parse(buildCsp(true) as string);

  it("erlaubt die Stripe-Quellen für Elements", () => {
    expect(d.get("script-src")).toContain("https://js.stripe.com");
    expect(d.get("frame-src")).toEqual(expect.arrayContaining(["https://js.stripe.com", "https://hooks.stripe.com"]));
    expect(d.get("connect-src")).toContain("https://api.stripe.com");
  });

  it("behält Streams und die Grundregeln", () => {
    expect(d.get("frame-src")).toEqual(expect.arrayContaining(["https://player.twitch.tv", "https://www.youtube-nocookie.com", "https://player.kick.com"]));
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("script-src")).toContain("'self'");
  });

  it("lockert sonst nichts: kein Platzhalter, kein eval, keine weiteren Stripe-/Google-Hosts", () => {
    for (const dir of ["default-src", "script-src", "connect-src", "frame-src", "style-src", "font-src", "media-src"]) {
      for (const s of d.get(dir) ?? []) {
        expect(s, `${dir}: ${s}`).not.toBe("*");
        expect(s, `${dir}: ${s}`).not.toBe("https:");
        expect(s, `${dir}: ${s}`).not.toContain("*");
      }
    }
    expect(buildCsp(true)).not.toContain("unsafe-eval");
    expect(d.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "https://js.stripe.com"]);
    expect(d.get("connect-src")).toEqual(["'self'", "https://api.stripe.com"]);
    expect(d.get("frame-src")).toHaveLength(5);
  });
});
