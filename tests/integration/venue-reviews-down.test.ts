import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { dbUrlAllowed } from "../../scripts/db-roles.mjs";

// Rückfall 0060 (Hallenbewertung): Bewertungen sind Nutzerdaten. (a) OHNE Zeile in venue_reviews baut der Rückfall beide Tabellen zurück, zweimal hintereinander ausführbar (frische Wegwerf-Datenbank mit allen
// Migrationen, Prozess-ID im Namen); (b) MIT einer Zeile bricht er ab und ändert nichts. Die Wegwerf-Datenbank wird danach gelöscht.
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_down0060_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
let admin: pg.Client;
let scratch: pg.Client;

const downStatements = readFileSync("drizzle/down/0060_down.sql", "utf8").split("--> statement-breakpoint");
const runDown = async (c: pg.Client) => {
  for (const s of downStatements) await c.query(s);
};
const tables = async (c: pg.Client) =>
  (await c.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('venue_reviews', 'venue_review_reports')")).rows[0].n as number;

beforeAll(async () => {
  if (!dbUrlAllowed(base.toString())) throw new Error("nur lokale Datenbank");
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  const r = spawnSync("node", ["node_modules/drizzle-kit/bin.cjs", "migrate"], { env: { ...process.env, DATABASE_URL: scratchUrl.toString() }, encoding: "utf8", timeout: 200_000 });
  if (r.status !== 0) throw new Error("Migration der Wegwerf-Datenbank fehlgeschlagen: " + (r.stdout + r.stderr).slice(-300));
  scratch = new pg.Client({ connectionString: scratchUrl.toString() });
  await scratch.connect();
}, 280_000);
afterAll(async () => {
  if (scratch) await scratch.end().catch(() => null);
  if (admin) {
    await admin.query(`drop database if exists "${name}" with (force)`).catch(() => null);
    await admin.end().catch(() => null);
  }
});

describe("Rückfall 0060", () => {
  it("Vorzustand: beide Tabellen sind da", async () => {
    expect(await tables(scratch)).toBe(2);
  });
  it("mit einer Bewertung: bricht ab, nichts wird geändert (die Zeile und beide Tabellen bleiben)", async () => {
    await scratch.query("set session_replication_role = replica"); // nur in der Wegwerf-Datenbank: Zeile ohne die Fremdschlüssel anlegen
    await scratch.query(
      "insert into venue_reviews (venue_id, match_id, floor, changing_rooms, cleanliness, showers, parking) values (gen_random_uuid(), gen_random_uuid(), 3, 3, 3, 3, 3)",
    );
    await scratch.query("set session_replication_role = origin");
    await expect(runDown(scratch)).rejects.toThrow(/abgebrochen: venue_reviews enthaelt 1 Bewertungen/);
    expect(await tables(scratch)).toBe(2);
    expect((await scratch.query("select count(*)::int as n from venue_reviews")).rows[0].n).toBe(1);
  });
  it("ohne Bewertung: alles zurückgebaut, zweimal hintereinander ausführbar", async () => {
    await scratch.query("delete from venue_reviews");
    await runDown(scratch);
    expect(await tables(scratch)).toBe(0);
    await runDown(scratch); // idempotent
    expect(await tables(scratch)).toBe(0);
  });
});
