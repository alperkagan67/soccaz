import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { dbUrlAllowed } from "../../scripts/db-roles.mjs";

// Rückfall 0061 (users.apple_id): (a) OHNE Konto mit Apple-Kennung baut der Rückfall Spalte und Teilindex zurück, zweimal hintereinander ausführbar (frische Wegwerf-Datenbank mit allen Migrationen);
// (b) MIT einer Kennung bricht er ab und ändert nichts. Zusätzlich: der Teilindex erlaubt viele Konten ohne Kennung, aber keine doppelte Kennung. Die Wegwerf-Datenbank wird danach gelöscht.
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_down0061_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
let admin: pg.Client;
let scratch: pg.Client;

const downStatements = readFileSync("drizzle/down/0061_down.sql", "utf8").split("--> statement-breakpoint");
const runDown = async (c: pg.Client) => {
  for (const s of downStatements) await c.query(s);
};
const spalte = async (c: pg.Client) => (await c.query("select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'apple_id'")).rows[0].n as number;
const index = async (c: pg.Client) => (await c.query("select count(*)::int as n from pg_indexes where schemaname = 'public' and indexname = 'users_apple_id_unique'")).rows[0].n as number;
const neuesKonto = (c: pg.Client, mail: string, apple: string | null) => c.query("insert into users (email, name, apple_id) values ($1, 'T', $2)", [mail, apple]);

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

describe("Migration 0061 und Rückfall", () => {
  it("Vorzustand: Spalte und Teilindex sind da; viele Konten ohne Kennung, aber keine doppelte Kennung", async () => {
    expect(await spalte(scratch)).toBe(1);
    expect(await index(scratch)).toBe(1);
    await neuesKonto(scratch, "a@t.local", null);
    await neuesKonto(scratch, "b@t.local", null);
    await neuesKonto(scratch, "c@t.local", "sub-1");
    await expect(neuesKonto(scratch, "d@t.local", "sub-1")).rejects.toThrow(/users_apple_id_unique|duplicate|eindeutig/i);
  });
  it("mit einer Kennung: bricht ab, nichts wird geändert", async () => {
    await expect(runDown(scratch)).rejects.toThrow(/abgebrochen: 1 Konten haben eine Apple-Kennung/);
    expect(await spalte(scratch)).toBe(1);
    expect(await index(scratch)).toBe(1);
  });
  it("ohne Kennung: alles zurückgebaut, zweimal hintereinander ausführbar", async () => {
    await scratch.query("update users set apple_id = null");
    await runDown(scratch);
    expect(await spalte(scratch)).toBe(0);
    expect(await index(scratch)).toBe(0);
    await runDown(scratch);
    expect(await spalte(scratch)).toBe(0);
  });
});
