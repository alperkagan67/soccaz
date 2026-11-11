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

describe("seed-frontend Schutz: Umgehungen über URL-Bestandteile", () => {
  const base = "postgres://u:geheim@localhost:5433/soccav2";
  it("lehnt jede nicht leere Query ab (host, hostaddr, port, database, sslmode)", () => {
    for (const q of [
      "?host=prod.example.com&port=5432",
      "?host=/var/run/postgresql",
      "?hostaddr=10.0.0.5",
      "?port=5432",
      "?database=produktion",
      "?dbname=produktion",
      "?sslmode=require",
      "?",
    ]) {
      expect(() => assertSeedAllowed({ databaseUrl: base + q }), q).toThrow(/Abbruch/);
    }
  });
  it("lehnt andere Schemas ab (socket:, http:, file:)", () => {
    for (const url of ["socket:/var/run/postgresql?db=soccav2", "http://localhost:5433/soccav2", "file:///soccav2", "postgres+unix://localhost:5433/soccav2"]) {
      expect(() => assertSeedAllowed({ databaseUrl: url }), url).toThrow(/Abbruch/);
    }
  });
  it("erlaubt postgres: und postgresql:, auch mit Benutzer und Passwort", () => {
    expect(assertSeedAllowed({ databaseUrl: "postgresql://u:p@localhost:5433/soccav2" }).database).toBe("soccav2");
    expect(assertSeedAllowed({ databaseUrl: "postgres://u@127.0.0.1:5433/soccaz_w1" }).database).toBe("soccaz_w1");
  });
  it("lehnt einen Host mit @ nach dem Parsen ab", () => {
    expect(() => assertSeedAllowed({ databaseUrl: "postgres://localhost%40prod.example.com:5433/soccav2" })).toThrow(/Abbruch/);
  });
  it("lehnt ein Fragment ab", () => {
    expect(() => assertSeedAllowed({ databaseUrl: base + "#x" })).toThrow(/Abbruch/);
  });
});

describe("seed-frontend Schutz: Fälle je Prüfung (Backlog 54)", () => {
  const rejected = (databaseUrl: string, nodeEnv?: string) => expect(() => assertSeedAllowed({ nodeEnv, databaseUrl }), databaseUrl).toThrow(/Abbruch/);

  it("lehnt einen falschen Port bei erlaubtem Host ab (localhost:5432, 127.0.0.1:5432, ohne Port)", () => {
    rejected("postgres://u:p@localhost:5432/soccav2");
    rejected("postgres://u:p@127.0.0.1:5432/soccaz_w1");
    rejected("postgres://u:p@localhost:5434/soccav2");
    rejected("postgres://u:p@localhost/soccav2");
  });

  it("lehnt einen falschen Datenbanknamen auf localhost:5433 ab (postgres, soccaz_w5, production)", () => {
    for (const db of ["postgres", "soccaz_w5", "soccaz_w0", "production", "SOCCAV2", "soccav2x", ""]) {
      rejected(`postgres://u:p@localhost:5433/${db}`);
    }
  });

  it("lehnt Fragment (#) und Query (?host=) auch bei sonst erlaubter URL ab", () => {
    rejected("postgres://u:p@localhost:5433/soccav2#frag");
    rejected("postgres://u:p@localhost:5433/soccav2?host=prod.example.com");
    rejected("postgres://u:p@127.0.0.1:5433/soccaz_w2?host=prod.example.com&port=5432");
  });

  it("erlaubt (Gegenprobe) soccav2 und soccaz_w1 bis w4 auf localhost und 127.0.0.1 mit Port 5433", () => {
    for (const host of ["localhost", "127.0.0.1"]) {
      for (const db of ["soccav2", "soccaz_w1", "soccaz_w2", "soccaz_w3", "soccaz_w4"]) {
        expect(assertSeedAllowed({ nodeEnv: "development", databaseUrl: `postgres://u:p@${host}:5433/${db}` })).toEqual({ host, port: "5433", database: db });
      }
    }
  });

  it("lehnt NODE_ENV=production ab, auch bei sonst erlaubter URL", () => {
    rejected("postgres://u:p@localhost:5433/soccav2", "production");
    rejected("postgres://u:p@127.0.0.1:5433/soccaz_w1", "production");
  });
});
