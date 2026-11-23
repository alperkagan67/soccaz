import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Backlog 56: Die Seed-Skripte seed-demo.mjs, seed-lobby.mts und seed-tournament.mts prüften nur den Hostnamen (mit ?host= umgehbar).
// Jetzt gilt für alle dieselbe Regel wie für seed-frontend: scripts/lib/seed-guard.ts (localhost:5433, soccav2 oder soccaz_w1 bis soccaz_w4, keine Query).
const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const SCRIPTS = ["scripts/seed-demo.mjs", "scripts/seed-lobby.mts", "scripts/seed-tournament.mts"];

describe("Seed-Skripte nutzen den gemeinsamen Schutz (Struktur)", () => {
  for (const file of SCRIPTS) {
    it(`${file}: ruft assertSeedAllowed vor jedem Datenbankzugriff auf und hat keine eigene Hostprüfung mehr`, () => {
      const src = read(file);
      expect(src).toContain("assertSeedAllowed(");
      expect(src).toMatch(/seed-guard/);
      expect(src).not.toMatch(/\["127\.0\.0\.1", "localhost"\]\.includes/); // die alte, umgehbare Hostprüfung
      // Schutz steht vor der ersten Verbindung bzw. Abfrage
      const guard = src.indexOf("assertSeedAllowed({");
      const firstUse = Math.min(...["new pg.Pool(", "await pool.query(", "await db.", "const mode ="].map((s) => (src.indexOf(s) === -1 ? Infinity : src.indexOf(s))));
      expect(guard, "Schutz vor der ersten Nutzung").toBeGreaterThan(-1);
      expect(guard).toBeLessThan(firstUse);
      // bei Abbruch wird beendet, nie weitergemacht
      expect(src).toMatch(/process\.exit\(1\)/);
    });
  }
});

describe("seed-demo.mjs bricht bei unerlaubter DATABASE_URL ab, ohne eine Verbindung aufzubauen (Verhalten)", () => {
  const run = (databaseUrl: string, extraEnv: Record<string, string> = {}) =>
    spawnSync(process.execPath, ["scripts/seed-demo.mjs"], { cwd: root, env: { ...process.env, ...extraEnv, DATABASE_URL: databaseUrl }, encoding: "utf8", timeout: 60_000 });

  for (const [name, url] of [
    ["?host= (Query umgeht den Hostnamen)", "postgres://u:p@localhost:5433/soccav2?host=evil.example"],
    ["Fragment", "postgres://u:p@localhost:5433/soccav2#x"],
    ["fremder Host", "postgres://u:p@evil.example:5433/soccav2"],
    ["falscher Port", "postgres://u:p@localhost:5432/soccav2"],
    ["falsche Datenbank", "postgres://u:p@localhost:5433/produktion"],
  ] as const) {
    it(`${name}: Abbruch mit Meldung, Exit 1`, () => {
      const r = run(url);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("Abbruch");
      expect(r.stderr).toContain("Es wurde nichts verändert");
      expect(r.stdout).not.toContain("Demo");
    }, 70_000);
  }

  it("NODE_ENV=production: Abbruch, auch mit erlaubter URL", () => {
    const r = run("postgres://u:p@localhost:5433/soccav2", { NODE_ENV: "production" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("production");
  }, 70_000);
});
