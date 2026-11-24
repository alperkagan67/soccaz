import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { attachPoolErrorHandler, poolErrorLine } from "../../src/db/pool-error";

describe("Pool-Fehler-Handler (Backlog 228-3)", () => {
  it("die Zeile enthält nur Poolname und Code, nie die Meldung (Host, Benutzer, Passwort)", () => {
    const line = poolErrorLine("main", Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432 user=geheim password=geheim"), { code: "57P01" }));
    expect(line).toContain("Pool main");
    expect(line).toContain("57P01");
    expect(line).not.toMatch(/10\.1\.2\.3|geheim|ECONNREFUSED/);
    expect(poolErrorLine("ops", new Error("x"))).toContain("ohne Code");
    expect(poolErrorLine("ops", Object.assign(new Error("x"), { code: "böse\nZeile" }))).toContain("ohne Code");
    expect(poolErrorLine("ops", null)).toContain("ohne Code");
  });
  it("der Handler wird genau einmal angehängt und fängt das error-Ereignis", () => {
    const pool = new Pool({ connectionString: "postgres://x@127.0.0.1:1/x" });
    attachPoolErrorHandler(pool, "t");
    attachPoolErrorHandler(pool, "t");
    expect(pool.listenerCount("error")).toBe(1);
    expect(() => pool.emit("error", new Error("tot"), undefined)).not.toThrow();
  });
  it("beide Pools der Anwendung gehen durch den Handler (Quelltext)", () => {
    expect(readFileSync("src/db/index.ts", "utf8")).toMatch(/attachPoolErrorHandler\(\s*globalForDb\.pool/);
    expect(readFileSync("src/db/ops.ts", "utf8")).toMatch(/attachPoolErrorHandler\(new Pool\(/);
  });
});
