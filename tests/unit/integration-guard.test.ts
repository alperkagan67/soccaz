import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dbHostAllowed, dbUrlAllowed } from "../integration/db-guard";

describe("Datenbank-Waechter der Integrationstests", () => {
  it("localhost und 127.0.0.1 sind immer erlaubt", () => {
    expect(dbHostAllowed("localhost", {})).toBe(true);
    expect(dbHostAllowed("127.0.0.1", {})).toBe(true);
    expect(dbHostAllowed("localhost", { GITHUB_ACTIONS: "true" })).toBe(true);
  });
  it("postgres ist nur in GitHub Actions erlaubt", () => {
    expect(dbHostAllowed("postgres", { GITHUB_ACTIONS: "true" })).toBe(true);
    expect(dbHostAllowed("postgres", {})).toBe(false);
    expect(dbHostAllowed("postgres", { GITHUB_ACTIONS: "false" })).toBe(false);
    expect(dbHostAllowed("postgres", { GITHUB_ACTIONS: "1" })).toBe(false);
  });
  it("fremde Hosts sind blockiert, auch in GitHub Actions", () => {
    for (const h of ["db.example.com", "postgres.example.com", "Postgres", "10.0.0.5", "::1", ""]) {
      expect(dbHostAllowed(h, { GITHUB_ACTIONS: "true" })).toBe(false);
      expect(dbHostAllowed(h, {})).toBe(false);
    }
  });
  it("dbUrlAllowed: lokale URLs ohne Query/Fragment sind erlaubt", () => {
    expect(dbUrlAllowed("postgres://u:p@localhost:5433/soccav2", {})).toBe(true);
    expect(dbUrlAllowed("postgresql://u:p@127.0.0.1:5433/x", {})).toBe(true);
    expect(dbUrlAllowed("postgres://u:p@postgres:5432/socaz", { GITHUB_ACTIONS: "true" })).toBe(true);
    expect(dbUrlAllowed("postgres://u:p@postgres:5432/socaz", {})).toBe(false);
  });
  it("dbUrlAllowed: Query und Fragment umgehen den Waechter nicht (pg nimmt ?host= vor dem Hostnamen)", () => {
    const env = { GITHUB_ACTIONS: "true" };
    for (const q of ["?host=prod.example.com", "?hostaddr=10.0.0.5", "?port=5432", "?sslmode=require", "?host=localhost", "#frag", "?"]) {
      expect(dbUrlAllowed("postgres://u:p@localhost:5433/x" + q, env), q).toBe(false);
      expect(dbUrlAllowed("postgres://u:p@postgres:5432/x" + q, env), q).toBe(false);
    }
  });
  it("dbUrlAllowed: fremde Hosts, falsches Protokoll, fehlende oder kaputte URL sind blockiert", () => {
    const env = { GITHUB_ACTIONS: "true" };
    expect(dbUrlAllowed("postgres://u:p@db.example.com:5432/x", env)).toBe(false);
    expect(dbUrlAllowed("http://localhost:5433/x", env)).toBe(false);
    expect(dbUrlAllowed("mysql://u:p@localhost/x", env)).toBe(false);
    expect(dbUrlAllowed(undefined, env)).toBe(false);
    expect(dbUrlAllowed("", env)).toBe(false);
    expect(dbUrlAllowed("kein url", env)).toBe(false);
  });
  it("Setup, E2E-Seeding und Teardown nutzen dbUrlAllowed; kein eigener Host-Vergleich ausserhalb von db-guard", () => {
    for (const f of ["tests/integration/setup.ts", "tests/e2e/helpers.ts", "tests/e2e/global-teardown.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("dbUrlAllowed(");
      expect(src, f).not.toMatch(/["']127.0.0.1["']/);
      expect(src, f).not.toMatch(/.hostname/);
      expect(src, f).not.toContain("dbHostAllowed");
    }
  });
});
