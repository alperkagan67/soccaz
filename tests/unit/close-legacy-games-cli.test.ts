import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6 (F2): Das Skript prüft den gemeinsamen Datenbank-Schutz VOR jeder Verbindung und kennt nur --apply; ohne --apply ist es ein Trockenlauf.
const root = path.resolve(import.meta.dirname, "../..");
const run = (args: string[], databaseUrl: string, extra: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["scripts/close-legacy-games.mjs", ...args], { cwd: root, env: { ...process.env, ...extra, DATABASE_URL: databaseUrl }, encoding: "utf8", timeout: 60_000 });

describe("scripts/close-legacy-games.mjs: Schutz und Aufruf (ohne Datenbankverbindung)", () => {
  for (const [name, url] of [
    ["?host= (Query umgeht den Hostnamen)", "postgres://u:p@localhost:5433/soccaz_w3?host=evil.example"],
    ["fremder Host", "postgres://u:p@evil.example:5433/soccaz_w3"],
    ["falscher Port", "postgres://u:p@localhost:5432/soccaz_w3"],
    ["falsche Datenbank", "postgres://u:p@localhost:5433/produktion"],
  ] as const) {
    it(`${name}: Abbruch, Exit 1, auch mit --apply`, () => {
      for (const args of [[], ["--apply"]]) {
        const r = run(args, url);
        expect(r.status).toBe(1);
        expect(r.stderr).toContain("Abbruch");
        expect(r.stdout).not.toContain("Geschlossen");
      }
    }, 70_000);
  }
  it("NODE_ENV=production: Abbruch auch mit erlaubter URL", () => {
    const r = run(["--apply"], "postgres://u:p@localhost:5433/soccaz_w3", { NODE_ENV: "production" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("production");
  }, 70_000);
  it("unbekannte Option: Aufrufhinweis, Exit 2 (nur --apply ist erlaubt)", () => {
    const r = run(["--yes"], "postgres://u:p@localhost:5433/soccaz_w3");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--apply");
  }, 70_000);
});
