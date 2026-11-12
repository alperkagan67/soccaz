import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { assertSeedAllowed } from "../../scripts/lib/seed-guard";
import { SEED_QUEUE_IDS, SEED_REQUEST_IDS } from "../../scripts/lib/seed-frontend-data";
import { runGuardedSeed } from "../../scripts/lib/seed-run";
import { cleanupTestData } from "../cleanup";

// Schutz zuerst: Ist die Umgebung nicht erlaubt, läuft weder der Seed noch das Aufräumen (cleanupTestData löscht alle @test.local-Nutzer).
const env = { nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL };
let allowed = true;
try {
  assertSeedAllowed(env);
} catch {
  allowed = false;
}

describe.skipIf(!allowed)("seed-frontend (nur auf erlaubter Dev-Datenbank)", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  afterAll(async () => {
    await cleanupTestData(pool);
    await pool.end();
  });

  it("ist idempotent: zweiter Lauf liefert dieselben Zahlen und dieselben Nutzer-IDs", async () => {
    const ids = async () => (await pool.query("select id from users where email like 'seed-%@test.local' order by email")).rows.map((r) => r.id);
    const mk = () => new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const first = (await runGuardedSeed(env, mk)).counts;
    const idsFirst = await ids();
    const second = (await runGuardedSeed(env, mk)).counts;
    expect(second).toEqual(first);
    expect(await ids()).toEqual(idsFirst);
    expect(first["Nutzer"]).toBeGreaterThan(20);
    expect(first["Turniere"]).toBe(4);
  });

  it("Nachtrag: Spielsuchen, Warteschlange und Benachrichtigungen je Zustand vorhanden und stabil (feste IDs)", async () => {
    const mk = () => new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    const counts = (await runGuardedSeed(env, mk)).counts;
    expect(counts["Spielsuchen"]).toBe(5);
    expect(counts["Warteschlangen-Einträge"]).toBe(4);
    expect(counts["Warteschlangen-Beitritte"]).toBe(3);
    expect(counts["Benachrichtigungen"]).toBe(11);
    expect(counts["Benachrichtigungen ungelesen"]).toBeGreaterThan(0);
    expect(counts["Benachrichtigungen ungelesen"]).toBeLessThan(counts["Benachrichtigungen"]);
    const req = (await pool.query("select status from match_requests where id = any($1::uuid[]) order by id", [Object.values(SEED_REQUEST_IDS)])).rows.map((r) => r.status);
    expect(req).toEqual(["open", "expired", "matched", "cancelled", "open"]);
    const que = (await pool.query("select status from matchmaking_queue where id = any($1::uuid[]) order by id", [Object.values(SEED_QUEUE_IDS)])).rows.map((r) => r.status);
    expect(que).toEqual(["waiting", "expired", "matched", "cancelled"]);
    const types = (await pool.query("select distinct type from notifications where user_id in (select id from users where email like 'seed-%@test.local') order by type")).rows.map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(["payment", "match.cancelled", "request.challenge", "match.reminder"]));
    // Zweiter Lauf: gleiche feste IDs, gleiche Zahlen
    const again = (await runGuardedSeed(env, mk)).counts;
    expect(again).toEqual(counts);
  });

  it("Nachtrag löscht nichts Fremdes: fremde Benachrichtigung und fremde Spielsuche bleiben", async () => {
    const { rows: [u] } = await pool.query("insert into users (email, name) values ('fremd-seedtest2@test.local', 'Fremd2') on conflict (email) do update set name = 'Fremd2' returning id");
    const { rows: [t] } = await pool.query("insert into teams (name, slug, city, created_by) values ('Fremdes Team 2', 'fremd-seed-team-2', 'Essen', $1) on conflict (slug) do update set name = 'Fremdes Team 2' returning id", [u.id]);
    await pool.query("delete from match_requests where team_id = $1", [t.id]);
    await pool.query("delete from notifications where user_id = $1", [u.id]);
    await pool.query("insert into match_requests (team_id, city, starts_at) values ($1, 'Essen', now() + interval '2 day')", [t.id]);
    await pool.query("insert into notifications (user_id, type, title, body) values ($1, 'system', 'Fremd', 'Bleibt')", [u.id]);
    await runGuardedSeed(env, () => new Pool({ connectionString: process.env.DATABASE_URL, max: 2 }));
    expect((await pool.query("select 1 from match_requests where team_id = $1", [t.id])).rowCount).toBe(1);
    expect((await pool.query("select 1 from notifications where user_id = $1", [u.id])).rowCount).toBe(1);
  });

  it("löscht nichts Fremdes: Team mit Slug seed-* und Einladung eines anderen Nutzers bleiben", async () => {
    const { rows: [u] } = await pool.query("insert into users (email, name) values ('fremd-seedtest@test.local', 'Fremd') on conflict (email) do update set name = 'Fremd' returning id");
    const { rows: [t] } = await pool.query("insert into teams (name, slug, city, created_by) values ('Fremdes Team', 'seed-fremd-test', 'Essen', $1) on conflict (slug) do update set name = 'Fremdes Team' returning id", [u.id]);
    await pool.query("insert into invites (token, team_id, created_by, expires_at) values ('seed-fremd-token', $1, $2, now() + interval '1 day') on conflict (token) do nothing", [t.id, u.id]);
    await runGuardedSeed(env, () => new Pool({ connectionString: process.env.DATABASE_URL, max: 2 }));
    expect((await pool.query("select 1 from teams where slug = 'seed-fremd-test'")).rowCount).toBe(1);
    expect((await pool.query("select 1 from invites where token = 'seed-fremd-token'")).rowCount).toBe(1);
  });
});

describe("seed-frontend Schutz im Ablauf", () => {
  it("bei nicht erlaubter URL wird weder eine Verbindung aufgebaut noch gesät", async () => {
    let made = 0;
    const mk = () => {
      made += 1;
      return new Pool({ connectionString: "postgres://u:p@localhost:5433/soccav2", max: 1 });
    };
    for (const databaseUrl of ["postgres://u:p@prod.example.com:5432/soccav2", "postgres://u:p@localhost:5433/soccav2?host=prod.example.com&port=5432"]) {
      await expect(runGuardedSeed({ nodeEnv: "development", databaseUrl }, mk)).rejects.toThrow(/Abbruch/);
    }
    await expect(runGuardedSeed({ nodeEnv: "production", databaseUrl: "postgres://u:p@localhost:5433/soccav2" }, mk)).rejects.toThrow(/production/);
    expect(made).toBe(0);
  });
});
