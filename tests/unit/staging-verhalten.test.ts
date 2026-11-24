import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEMES, contrast } from "@/lib/color";
import { STAGING_BANNER_TEXT } from "@/lib/staging";

// Echtes Verhalten (nicht Quelltext-Pins): Banner und robots.txt je nach APP_ENV. next/server.connection wird nur gemockt (läuft außerhalb einer Anfrage nicht).
vi.mock("next/server", () => ({ connection: async () => undefined }));
afterEach(() => vi.unstubAllEnvs());

const markup = async () => {
  const { StagingBanner } = await import("@/components/StagingBanner");
  const el = await StagingBanner();
  return el === null ? null : renderToStaticMarkup(el);
};

describe("StagingBanner (Verhalten)", () => {
  it("APP_ENV=staging: Streifen mit Test-ID und vollem Text", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const html = await markup();
    expect(html).not.toBeNull();
    expect(html).toContain('data-testid="staging-banner"');
    expect(html).toContain(STAGING_BANNER_TEXT);
  });
  it("leer, production, andere Schreibweise, nicht gesetzt: nichts", async () => {
    for (const v of ["", "production", "Staging", "STAGING"]) {
      vi.stubEnv("APP_ENV", v);
      expect(await markup(), `APP_ENV=${v}`).toBeNull();
    }
    vi.unstubAllEnvs();
    delete process.env.APP_ENV;
    expect(await markup()).toBeNull();
  });
  it("Kontrast: --ink auf --panel-2 mindestens 4,5:1 hell und dunkel, aus den Token-Werten der globals.css gelesen", () => {
    const css = readFileSync(join(__dirname, "..", "..", "src/app/globals.css"), "utf8");
    const dark = css.match(/:root\s*\{[\s\S]*?--panel-2:\s*(#[0-9a-f]{6});[\s\S]*?--ink:\s*(#[0-9a-f]{6});/i);
    const light = css.match(/prefers-color-scheme: light\)\s*\{\s*:root\s*\{[\s\S]*?--panel-2:\s*(#[0-9a-f]{6});[\s\S]*?--ink:\s*(#[0-9a-f]{6});/i);
    expect(dark && light, "Token nicht gefunden").toBeTruthy();
    expect(contrast(dark![2], dark![1])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light![2], light![1])).toBeGreaterThanOrEqual(4.5);
    expect([dark![1], light![1]]).toEqual([THEMES.dark.fl2, THEMES.light.fl2]);
  });
});

describe("robots() (Verhalten)", () => {
  it("staging: nur Disallow '/'", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const { default: robots } = await import("@/app/robots");
    const r = await robots();
    expect(r.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
  });
  it("sonst: Produktionsliste mit Freigabe der Wurzel und den Sperrpfaden", async () => {
    vi.stubEnv("APP_ENV", "production");
    const { default: robots } = await import("@/app/robots");
    const rules = (await robots()).rules as { allow?: string; disallow: string[] }[];
    expect(rules[0].allow).toBe("/");
    expect(rules[0].disallow).toEqual(expect.arrayContaining(["/app", "/admin", "/api", "/spieler/"]));
    expect(rules[0].disallow).not.toContain("/");
  });
});
