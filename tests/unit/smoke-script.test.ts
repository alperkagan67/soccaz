import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildChecks, runSmoke } from "../../scripts/smoke.mjs";

// Go-live-Runbook Schritt 5: Smoke-Skript ohne Secrets. Der Abruf wird mit einer Attrappe ersetzt, es gibt kein Netz im Test.

const pages: Record<string, { status: number; body: string }> = {
  "/api/health": { status: 200, body: '{"status":"ok"}' },
  "/anmelden": { status: 200, body: "Mit Google anmelden" },
  "/turniere": { status: 200, body: "Turniere" },
  "/impressum": { status: 200, body: "Impressum" },
  "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:" },
  "/spiele": { status: 200, body: "Spiele kommen bald" },
};
const fake = (over: Record<string, { status: number; body: string }> = {}, seen: { url: string; auth?: string }[] = []) =>
  (async (url: string, init?: { headers?: Record<string, string> }) => {
    const p = new URL(url).pathname;
    seen.push({ url, auth: init?.headers?.Authorization });
    const r = over[p] ?? pages[p] ?? { status: 404, body: "" };
    return { status: r.status, text: async () => r.body };
  }) as unknown as typeof fetch;

describe("scripts/smoke.mjs", () => {
  it("alles in Ordnung: alle Prüfungen bestanden; /spiele nur mit --turnier-only", async () => {
    expect(buildChecks().map((c: { path: string }) => c.path)).toEqual(["/api/health", "/anmelden", "/turniere", "/impressum", "/robots.txt"]);
    expect(buildChecks({ turnierOnly: true }).map((c: { path: string }) => c.path)).toContain("/spiele");
    const r = await runSmoke({ base: "https://socaz.de/", fetchImpl: fake(), turnierOnly: true });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(6);
  });
  it("Fehlerfälle: Datenbank down, falscher Status, fehlender Inhalt, Server nicht erreichbar", async () => {
    expect((await runSmoke({ base: "https://x.de", fetchImpl: fake({ "/api/health": { status: 503, body: '{"status":"error"}' } }) })).ok).toBe(false);
    const leer = await runSmoke({ base: "https://x.de", fetchImpl: fake({ "/anmelden": { status: 200, body: "nichts" } }) });
    expect(leer.results.find((x: { path: string }) => x.path === "/anmelden").detail).toContain("Inhalt");
    const ohneBald = await runSmoke({ base: "https://x.de", turnierOnly: true, fetchImpl: fake({ "/spiele": { status: 200, body: "Alle Spiele" } }) });
    expect(ohneBald.ok).toBe(false);
    const down = await runSmoke({ base: "https://x.de", fetchImpl: (async () => { throw Object.assign(new Error("x"), { name: "TypeError" }); }) as unknown as typeof fetch });
    expect(down.ok).toBe(false);
    expect(down.results[0]?.detail).toContain("nicht erreichbar");
  });
  it("Zugangsschutz (Staging): Basic-Auth nur aus dem Parameter, nie in der Ergebnisausgabe", async () => {
    const seen: { url: string; auth?: string }[] = [];
    const r = await runSmoke({ base: "https://s.de", fetchImpl: fake({}, seen), basicAuth: "u:geheim" });
    expect(seen.every((s) => s.auth === `Basic ${Buffer.from("u:geheim").toString("base64")}`)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("geheim");
  });
  it("Quelltext: keine Schlüssel, keine .env-Zugriffe, keine feste Adresse", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/smoke.mjs"), "utf8");
    expect(src).not.toMatch(/readFileSync|\.env["'`]|DATABASE_URL|sk_live|sk_test|AUTH_SECRET/);
  });
});
