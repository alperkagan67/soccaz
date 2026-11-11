import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "../../scripts/lib/seed-guard";

const ok = "postgres://user:pw@localhost:5433/soccaz_w3";

describe("seed-frontend Schutz", () => {
  it("erlaubt localhost:5433 mit Dev- und Worker-Datenbanken", () => {
    for (const db of ["soccav2", "soccaz_w1", "soccaz_w2", "soccaz_w3", "soccaz_w4"]) {
      expect(assertSeedAllowed({ nodeEnv: "development", databaseUrl: `postgres://u:p@127.0.0.1:5433/${db}` }).database).toBe(db);
    }
    expect(assertSeedAllowed({ databaseUrl: ok }).host).toBe("localhost");
  });

  it("bricht bei NODE_ENV=production ab", () => {
    expect(() => assertSeedAllowed({ nodeEnv: "production", databaseUrl: ok })).toThrow(/production/);
  });

  it("bricht bei fehlender oder ungültiger DATABASE_URL ab", () => {
    expect(() => assertSeedAllowed({})).toThrow(/DATABASE_URL fehlt/);
    expect(() => assertSeedAllowed({ databaseUrl: "kein url" })).toThrow(/keine gültige URL/);
  });

  it("bricht bei fremdem Host, Port oder fremder Datenbank ab, ohne Zugangsdaten zu nennen", () => {
    for (const url of [
      "postgres://u:geheim@db.example.com:5433/soccaz_w3",
      "postgres://u:geheim@localhost:5432/soccaz_w3",
      "postgres://u:geheim@localhost:5433/produktion",
      "postgres://u:geheim@localhost/soccaz_w3",
      "postgres://u:geheim@localhost:5433/soccaz_w5",
    ]) {
      let msg = "";
      try {
        assertSeedAllowed({ databaseUrl: url });
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/Abbruch/);
      expect(msg).not.toMatch(/geheim/);
    }
  });
});
