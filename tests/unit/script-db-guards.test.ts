import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { dbUrlAllowed as testGuard } from "../integration/db-guard";
import { assertLocalDbUrl, assertWorkerDatabase, dbUrlAllowed } from "../../scripts/lib/db-url-guard.mjs";

// Backlog 175: die Beweis-Hilfsskripte legen Datenbanken an/loeschen sie oder ersetzen Funktionen. Sie pruefen DATABASE_URL alle mit demselben Waechter (scripts/lib/db-url-guard.mjs), der dieselben
// Regeln hat wie tests/integration/db-guard.ts (Paritaet unten) und VOR jeder Verbindung greift. Frueher pruefte mutation-evidence.mjs nur Hostname/Pfad: "...@localhost:5433/soccaz_w1?host=prod.example"
// bestand, pg verband aber zu prod.example.
const URLS = [
  "postgres://u:p@127.0.0.1:5433/soccaz_w2",
  "postgres://u@localhost:5433/soccaz_w1",
  "postgresql://u@localhost/soccav2",
  "postgres://u@localhost:5433/soccaz_w1?host=prod.example",
  "postgres://u@localhost:5433/soccaz_w1?hostaddr=10.0.0.1",
  "postgres://u@localhost:5433/soccaz_w1#frag",
  "postgres://u@localhost:5433/soccaz_w1 ",
  " postgres://u@localhost:5433/soccaz_w1",
  "postgres://u@localhost:5433/soccaz\tw1",
  "postgres://u@localhost:5433/soccaz_w1\n",
  "postgres://u@localhost:5433/soccaz_w1\\x",
  "postgres://u@127.0.0.1,evil.example.com/x",
  "postgres://u@127.0.0.1%2Cevil.example.com/x",
  "postgres://u@%2Fvar%2Frun%2Fpostgresql/x",
  "postgres://u@db.example.com:5432/x",
  "postgres://u@postgres:5432/socaz",
  "http://localhost/x",
  "",
  "kein-url",
];

describe("gemeinsamer Wächter der Skripte", () => {
  it("Parität mit tests/integration/db-guard.ts: gleiche Entscheidung für jede URL (auch mit CI-Dienst postgres)", () => {
    for (const env of [{}, { GITHUB_ACTIONS: "true" }] as Record<string, string>[]) {
      for (const u of URLS) expect(dbUrlAllowed(u, env), JSON.stringify([u, env])).toBe(testGuard(u, env));
    }
  });

  it("lehnt Query, Fragment, Leerraum/Steuerzeichen, Mehrfachhost und fremde Hosts ab; erlaubt die lokale Datenbank", () => {
    expect(dbUrlAllowed("postgres://u:p@127.0.0.1:5433/soccaz_w2", {})).toBe(true);
    for (const bad of URLS.slice(3, 15)) expect(dbUrlAllowed(bad, {}), bad).toBe(false);
  });

  it("assertWorkerDatabase: nur soccaz_w1 bis w4, nie soccav2 oder Wegwerf-Namen; die Fehlermeldung enthält nie die URL", () => {
    expect(() => assertWorkerDatabase("postgres://secretuser:secretpw@127.0.0.1:5433/soccaz_w3", "t", {})).not.toThrow();
    for (const db of ["soccav2", "soccaz_w5", "soccaz_w", "postgres", "soccaz_dbroles_test_1"]) expect(() => assertWorkerDatabase(`postgres://u@127.0.0.1:5433/${db}`, "t", {}), db).toThrow(/Worker-Datenbank/);
    try {
      assertLocalDbUrl("postgres://secretuser:secretpw@localhost:5433/soccaz_w1?host=prod.example", "t", {});
      throw new Error("haette werfen muessen");
    } catch (e) {
      expect(String((e as Error).message)).toMatch(/nicht erlaubt/);
      expect(String((e as Error).message)).not.toMatch(/secretpw|secretuser|prod\.example/);
    }
  });
});

// Jedes Skript wird mit einer unzulaessigen DATABASE_URL gestartet und muss VOR jeder Verbindung mit der Wächter-Meldung abbrechen (nicht erst mit einem Verbindungsfehler zu einem fremden Host).
const SCRIPTS: { file: string; args: string[] }[] = [
  { file: "scripts/mutation-evidence.mjs", args: ["1"] },
  { file: "scripts/measure-evidence.mjs", args: ["--skip-big"] },
  { file: "scripts/measure-evidence-verify.mjs", args: ["1000"] },
  { file: "scripts/verify-evidence-migration.mjs", args: [] },
  { file: "scripts/migrate-check.mjs", args: [] },
];
const BAD = ["postgres://u@localhost:5433/soccaz_w1?host=prod.example", "postgres://u@127.0.0.1:5433/soccaz_w1 ", "postgres://u@db.example.com:5432/soccaz_w1", "postgres://u@127.0.0.1:5433/soccaz_w1#x"];

describe("jedes Hilfsskript bricht bei unzulässiger DATABASE_URL vor jeder Verbindung ab", () => {
  for (const s of SCRIPTS) {
    it(s.file, () => {
      for (const url of BAD) {
        const r = spawnSync("node", [s.file, ...s.args], { env: { ...process.env, DATABASE_URL: url, GITHUB_ACTIONS: "" }, encoding: "utf8", timeout: 30_000 });
        const out = `${r.stdout}${r.stderr}`;
        expect(r.status, `${s.file} ${url}`).not.toBe(0);
        expect(out, `${s.file} ${url}`).toMatch(/DATABASE_URL nicht erlaubt/);
        expect(out).not.toMatch(/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|password authentication/); // nie bis zur Verbindung gekommen
        expect(out).not.toContain("prod.example"); // die URL steht nie in der Meldung
      }
    });
  }

  it("mutation-evidence verlangt zusätzlich eine Worker-Datenbank (nie soccav2)", () => {
    const r = spawnSync("node", ["scripts/mutation-evidence.mjs", "1"], { env: { ...process.env, DATABASE_URL: "postgres://u@127.0.0.1:5433/soccav2" }, encoding: "utf8", timeout: 30_000 });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/Worker-Datenbank/);
  });
});
