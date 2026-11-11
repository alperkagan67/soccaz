import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runSeed } from "../../scripts/lib/seed-frontend-data";
import { assertSeedAllowed } from "../../scripts/lib/seed-guard";
import { cleanupTestData } from "../cleanup";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
afterAll(async () => {
  await cleanupTestData(pool);
  await pool.end();
});

describe("seed-frontend", () => {
  it("läuft nur gegen eine erlaubte Dev-Datenbank", () => {
    expect(() => assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL })).not.toThrow();
  });

  it("ist idempotent: zweiter Lauf liefert dieselben Zahlen und dieselben Nutzer-IDs", async () => {
    const ids = async () => (await pool.query("select id from users where email like 'seed-%@test.local' order by email")).rows.map((r) => r.id);
    const first = await runSeed(pool);
    const idsFirst = await ids();
    const second = await runSeed(pool);
    expect(second).toEqual(first);
    expect(await ids()).toEqual(idsFirst);
    expect(first["Nutzer"]).toBeGreaterThan(20);
    expect(first["Turniere"]).toBe(4);
  });
});
