import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STARTSPERRE_MELDUNG, startVerboten } from "@/lib/startsperre";

// Startsperre PAYMENTS_FAKE (Go-live): Produktion/Staging mit PAYMENTS_FAKE=1 darf nicht starten; Build, Dev und Test bleiben unberührt.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("startVerboten", () => {
  it("production + PAYMENTS_FAKE=1: verboten (Produktion und Staging)", () => {
    expect(startVerboten({ NODE_ENV: "production", PAYMENTS_FAKE: "1" })).toBe(true);
  });
  it("production ohne Variable oder mit anderem Wert: erlaubt", () => {
    expect(startVerboten({ NODE_ENV: "production" })).toBe(false);
    expect(startVerboten({ NODE_ENV: "production", PAYMENTS_FAKE: "" })).toBe(false);
    expect(startVerboten({ NODE_ENV: "production", PAYMENTS_FAKE: "0" })).toBe(false);
  });
  it("development und test mit PAYMENTS_FAKE=1: erlaubt (Worker-Dev-Server, E2E, Vitest)", () => {
    expect(startVerboten({ NODE_ENV: "development", PAYMENTS_FAKE: "1" })).toBe(false);
    expect(startVerboten({ NODE_ENV: "test", PAYMENTS_FAKE: "1" })).toBe(false);
    expect(startVerboten({ PAYMENTS_FAKE: "1" })).toBe(false);
  });
  it("next build (NEXT_PHASE=phase-production-build) mit gesetzter Variable: erlaubt", () => {
    expect(startVerboten({ NODE_ENV: "production", PAYMENTS_FAKE: "1", NEXT_PHASE: "phase-production-build" })).toBe(false);
  });
});

describe("register() in src/instrumentation.ts", () => {
  it("wirft in Produktion mit PAYMENTS_FAKE=1 (Meldung im Log), startet sonst ohne Fehler", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ENABLE_SCHEDULER", "0");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    const { register } = await import("@/instrumentation");
    await expect(register()).rejects.toThrow(STARTSPERRE_MELDUNG);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("PAYMENTS_FAKE=1 ist in Produktion verboten"));

    vi.stubEnv("PAYMENTS_FAKE", "");
    await expect(register()).resolves.toBeUndefined();

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PAYMENTS_FAKE", "1");
    await expect(register()).resolves.toBeUndefined();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await expect(register()).resolves.toBeUndefined();
  });
  it("Quelltext: die Sperre steht im nodejs-Zweig (nach dem Runtime-Check) und wirft ohne Ausnahmeweg", () => {
    const src = readFileSync(path.join(process.cwd(), "src/instrumentation.ts"), "utf8");
    expect(src.indexOf("NEXT_RUNTIME")).toBeLessThan(src.indexOf("startVerboten()"));
    expect(src).toMatch(/if \(startVerboten\(\)\) \{[\s\S]*throw new Error\(STARTSPERRE_MELDUNG\)/);
    expect(src).not.toMatch(/CI\b.*startVerboten|startVerboten.*process\.env\.CI/);
  });
});
