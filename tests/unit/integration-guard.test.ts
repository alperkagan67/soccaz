import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dbHostAllowed } from "../integration/db-guard";

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
  it("Query-Parameter aendern den geprueften Host nicht", () => {
    const host = (u: string) => new URL(u).hostname; // so liest setup.ts den Host
    expect(dbHostAllowed(host("postgres://u:p@db.example.com:5432/x?host=localhost"), { GITHUB_ACTIONS: "true" })).toBe(false);
    expect(dbHostAllowed(host("postgres://u:p@postgres:5432/x?host=evil.example.com"), { GITHUB_ACTIONS: "true" })).toBe(true);
    expect(dbHostAllowed(host("postgres://u:p@postgres:5432/x?host=localhost"), {})).toBe(false);
  });
  it("Setup und E2E-Seeding nutzen denselben Waechter, kein zweites Host-Array", () => {
    for (const f of ["tests/integration/setup.ts", "tests/e2e/helpers.ts", "tests/e2e/global-teardown.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("dbHostAllowed(");
      expect(src, f).not.toMatch(/["']127.0.0.1["']/);
    }
  });
});
