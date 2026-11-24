import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { dbUrlAllowed } from "../../scripts/db-roles.mjs";

// Migration 0062 (decided_by, shootout_a/b, gap_minutes) und Rückfall: (a) Standardwerte und Prüfungen der Spalten (frische Wegwerf-Datenbank mit allen Migrationen);
// (b) MIT Daten bricht der Rückfall ab und ändert nichts; (c) OHNE Daten baut er alles zurück, zweimal hintereinander ausführbar. Die Wegwerf-Datenbank wird danach gelöscht.
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_down0062_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
let admin: pg.Client;
let scratch: pg.Client;

const downStatements = readFileSync("drizzle/down/0062_down.sql", "utf8").split("--> statement-breakpoint");
const runDown = async (c: pg.Client) => {
  for (const s of downStatements) await c.query(s);
};
const spalten = async (c: pg.Client) =>
  (await c.query("select count(*)::int as n from information_schema.columns where table_schema = 'public' and ((table_name = 'tournament_matches' and column_name in ('decided_by','shootout_a','shootout_b')) or (table_name = 'tournaments' and column_name = 'gap_minutes'))")).rows[0].n as number;
const checks = async (c: pg.Client) =>
  (await c.query("select count(*)::int as n from pg_constraint where conname in ('tournament_matches_decided_by_check','tournament_matches_decided_by_shape','tournament_matches_shootout_count','tournaments_gap_range')")).rows[0].n as number;

let turnier = "";
let teamA = "";
let teamB = "";
let zeile = "";

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
  const u = (await scratch.query("insert into users (email, name) values ('o@t.local', 'O') returning id")).rows[0].id as string;
  teamA = (await scratch.query("insert into teams (name, slug, city, created_by) values ('A', 'a-0062', 'X', $1) returning id", [u])).rows[0].id;
  teamB = (await scratch.query("insert into teams (name, slug, city, created_by) values ('B', 'b-0062', 'X', $1) returning id", [u])).rows[0].id;
  turnier = (await scratch.query("insert into tournaments (organizer_id, name, city, starts_on, format, max_teams) values ($1, 'T', 'X', '2027-01-01', 'knockout', 4) returning id", [u])).rows[0].id;
}, 280_000);
afterAll(async () => {
  if (scratch) await scratch.end().catch(() => null);
  if (admin) {
    await admin.query(`drop database if exists "${name}" with (force)`).catch(() => null);
    await admin.end().catch(() => null);
  }
});

describe("Migration 0062: Spalten und Prüfungen", () => {
  it("Vorzustand: vier Spalten und vier Prüfungen sind da; ein neues Turnier hat Puffer 5, ein Spiel keine Entscheidungsart", async () => {
    expect(await spalten(scratch)).toBe(4);
    expect(await checks(scratch)).toBe(4);
    expect((await scratch.query("select gap_minutes from tournaments where id = $1", [turnier])).rows[0].gap_minutes).toBe(5);
    zeile = (await scratch.query("insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b, score_a, score_b) values ($1, 'ko:4', 1, 0, $2, $3, 2, 2) returning id", [turnier, teamA, teamB])).rows[0].id;
    const r = (await scratch.query("select decided_by, shootout_a, shootout_b from tournament_matches where id = $1", [zeile])).rows[0];
    expect(r).toEqual({ decided_by: null, shootout_a: null, shootout_b: null });
  });
  it("Puffer nur von 0 bis 30", async () => {
    await scratch.query("update tournaments set gap_minutes = 0 where id = $1", [turnier]);
    await scratch.query("update tournaments set gap_minutes = 30 where id = $1", [turnier]);
    await expect(scratch.query("update tournaments set gap_minutes = 31 where id = $1", [turnier])).rejects.toThrow(/tournaments_gap_range/);
    await expect(scratch.query("update tournaments set gap_minutes = -1 where id = $1", [turnier])).rejects.toThrow(/tournaments_gap_range/);
    await scratch.query("update tournaments set gap_minutes = 5 where id = $1", [turnier]);
  });
  it("Entscheidungsart: nur gg oder 9m; gg ohne Neunmeter-Sieger, 9m mit Sieger; Zähler nur bei 9m und in 0 bis 50", async () => {
    await expect(scratch.query("update tournament_matches set decided_by = 'xx' where id = $1", [zeile])).rejects.toThrow(/decided_by_check/);
    await scratch.query("update tournament_matches set decided_by = 'gg' where id = $1", [zeile]);
    await expect(scratch.query("update tournament_matches set shootout_winner = $2 where id = $1", [zeile, teamA])).rejects.toThrow(/decided_by_shape/);
    await expect(scratch.query("update tournament_matches set shootout_a = 3, shootout_b = 2 where id = $1", [zeile])).rejects.toThrow(/shootout_count/);
    await scratch.query("update tournament_matches set decided_by = null where id = $1", [zeile]);
    await expect(scratch.query("update tournament_matches set decided_by = '9m' where id = $1", [zeile])).rejects.toThrow(/decided_by_shape/); // 9m braucht einen Sieger
    await scratch.query("update tournament_matches set decided_by = '9m', shootout_winner = $2, shootout_a = 4, shootout_b = 3 where id = $1", [zeile, teamA]);
    await expect(scratch.query("update tournament_matches set shootout_a = 51 where id = $1", [zeile])).rejects.toThrow(/shootout_count/);
    await expect(scratch.query("update tournament_matches set shootout_b = null where id = $1", [zeile])).rejects.toThrow(/shootout_count/); // beide oder keiner
  });
});

describe("Rückfall 0062", () => {
  it("mit einem Spiel mit Entscheidungsart oder einem Turnier mit anderem Puffer: bricht ab, nichts wird geändert", async () => {
    await expect(runDown(scratch)).rejects.toThrow(/abgebrochen: 1 Turnierspiele mit Golden Goal\/Neunmeter und 0 Turniere/);
    expect(await spalten(scratch)).toBe(4);
    expect(await checks(scratch)).toBe(4);
    await scratch.query("update tournament_matches set decided_by = null, shootout_winner = null, shootout_a = null, shootout_b = null where id = $1", [zeile]);
    await scratch.query("update tournaments set gap_minutes = 10 where id = $1", [turnier]);
    await expect(runDown(scratch)).rejects.toThrow(/abgebrochen: 0 Turnierspiele mit Golden Goal\/Neunmeter und 1 Turniere/);
    expect(await spalten(scratch)).toBe(4);
  });
  it("ohne solche Daten: alles zurückgebaut, zweimal hintereinander ausführbar", async () => {
    await scratch.query("update tournaments set gap_minutes = 5 where id = $1", [turnier]);
    await runDown(scratch);
    expect(await spalten(scratch)).toBe(0);
    expect(await checks(scratch)).toBe(0);
    await runDown(scratch);
    expect(await spalten(scratch)).toBe(0);
    expect((await scratch.query("select count(*)::int as n from tournament_matches")).rows[0].n).toBe(1); // die Zeile selbst bleibt
  });
});
