import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { ROLES, clusterStatements, dbUrlAllowed, setupRoles } from "../../scripts/db-roles.mjs";
import { applyPlan, buildPlan, planSha, writePlan } from "../../scripts/db-owner.mjs";

// Etappe D (G25-009): Rollen-Skript und Eigentumswechsel. Arbeitet NUR in einer selbst angelegten Wegwerf-Datenbank (Prozess-ID im Namen) plus den (idempotenten, noch unbenutzten) Rollen des Clusters.
// Die Anwendung selbst aendert sich nicht: die Rollen sind angelegt, aber niemand verbindet sich damit.
const base = new URL(process.env.DATABASE_URL ?? "postgres://x@127.0.0.1/x");
const name = `soccaz_dbroles_test_${process.pid}`;
const adminUrl = new URL(base);
adminUrl.pathname = "/postgres";
const scratchUrl = new URL(base);
scratchUrl.pathname = "/" + name;
let admin: pg.Client;
let tmp: string;

beforeAll(async () => {
  if (!dbUrlAllowed(base.toString())) throw new Error("nur lokale Datenbank");
  admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  tmp = mkdtempSync(join(tmpdir(), "soccaz-owner-"));
});
afterAll(async () => {
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.end();
  rmSync(tmp, { recursive: true, force: true });
});

describe("db-roles.mjs", () => {
  it("Wächter: nur lokale Datenbank, keine Query/Fragment", () => {
    expect(dbUrlAllowed("postgres://u@127.0.0.1:5433/x")).toBe(true);
    expect(dbUrlAllowed("postgres://u@localhost/x")).toBe(true);
    expect(dbUrlAllowed("postgres://u@db.example.com/x")).toBe(false);
    expect(dbUrlAllowed("postgres://u@127.0.0.1/x?host=evil")).toBe(false);
    expect(dbUrlAllowed("postgres://u@postgres/x", {})).toBe(false);
    expect(dbUrlAllowed("postgres://u@postgres/x", { GITHUB_ACTIONS: "true" })).toBe(true);
  });

  it("Trockenlauf führt nichts aus und gibt keine Passwörter aus; Anwenden ist idempotent (zweimal) und setzt die Soll-Eigenschaften", async () => {
    const lines: string[] = [];
    const dry = await setupRoles({ url: scratchUrl.toString(), apply: false, env: { DB_PASSWORD_APP: "geheim-nicht-ausgeben" }, log: (s: string) => lines.push(s) });
    expect(dry.applied).toBe(false);
    expect(lines.join("\n")).not.toContain("geheim-nicht-ausgeben");
    for (let i = 0; i < 2; i++) expect((await setupRoles({ url: scratchUrl.toString(), apply: true, env: {} })).applied).toBe(true);
    const roles = (await admin.query("select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolcanlogin from pg_roles where rolname = any($1)", [ROLES])).rows;
    expect(roles.map((r) => r.rolname).sort()).toEqual([...ROLES].sort());
    for (const r of roles) expect([r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls], r.rolname).toEqual([false, false, false, false]);
    const login = Object.fromEntries(roles.map((r) => [r.rolname, r.rolcanlogin]));
    expect(login).toMatchObject({ soccaz_owner: false, soccaz_maintenance: false, soccaz_migrate: true, soccaz_app: true, soccaz_ops: true, soccaz_backup: true });
  });

  it("Mitgliedschaften (Soll-Liste): migrate erbt owner; owner NICHT Mitglied von maintenance; app/ops in keiner Rolle; backup liest alles", async () => {
    await setupRoles({ url: scratchUrl.toString(), apply: true, env: {} });
    const member = async (r: string, of: string) => (await admin.query("select pg_has_role($1, $2, 'member') as m", [r, of])).rows[0].m as boolean;
    expect(await member("soccaz_migrate", "soccaz_owner")).toBe(true);
    expect(await member("soccaz_migrate", "soccaz_maintenance")).toBe(false); // nur im Wartungsfenster
    expect(await member("soccaz_owner", "soccaz_maintenance")).toBe(false);
    for (const r of ["soccaz_app", "soccaz_ops"]) for (const of of ["soccaz_owner", "soccaz_maintenance", "soccaz_migrate"]) expect(await member(r, of), `${r} in ${of}`).toBe(false);
    expect(await member("soccaz_backup", "pg_read_all_data")).toBe(true);
    // bewusste Fehlkonfiguration wird beim naechsten Lauf korrigiert
    await admin.query("grant soccaz_maintenance to soccaz_owner");
    await admin.query("grant soccaz_owner to soccaz_app");
    await setupRoles({ url: scratchUrl.toString(), apply: true, env: {} });
    expect(await member("soccaz_owner", "soccaz_maintenance")).toBe(false);
    expect(await member("soccaz_app", "soccaz_owner")).toBe(false);
  });

  it("Datenbank-Rechte: CONNECT für alle Rollen, CREATE nur für soccaz_owner; Passwort nur aus der Umgebung gesetzt", async () => {
    await setupRoles({ url: scratchUrl.toString(), apply: true, env: { DB_PASSWORD_OPS: "pw-nur-im-test" } });
    const priv = async (r: string, p: string) => (await admin.query("select has_database_privilege($1, $2, $3) as ok", [r, name, p])).rows[0].ok as boolean;
    for (const r of ["soccaz_owner", "soccaz_migrate", "soccaz_app", "soccaz_ops", "soccaz_backup"]) expect(await priv(r, "CONNECT"), r).toBe(true);
    expect(await priv("soccaz_owner", "CREATE")).toBe(true);
    expect(await priv("soccaz_app", "CREATE")).toBe(false);
    const pw = (await admin.query("select rolpassword is not null as has from pg_authid where rolname = 'soccaz_ops'")).rows[0].has;
    expect(pw).toBe(true);
  });

  it("der Cluster-Teil enthält keine Passwörter und keine Anwendungs-Rechte (Etappe D ändert kein Verhalten)", () => {
    const all = clusterStatements().join("\n").toLowerCase();
    expect(all).not.toContain("password");
    expect(all).not.toMatch(/\bgrant\s+(select|insert|update|delete|execute)\b/);
    expect(readFileSync("scripts/db-roles.sql", "utf8")).not.toMatch(/REASSIGN OWNED/i);
  });
});

describe("db-owner.mjs", () => {
  async function scratch(sql: string) {
    const c = new pg.Client({ connectionString: scratchUrl.toString() });
    await c.connect();
    try {
      return await c.query(sql);
    } finally {
      await c.end();
    }
  }
  const ownerOf = async (sql: string) => ((await scratch(sql)).rows[0] as { o: string }).o;

  it("Plan, Summe, Anwenden und Rückfall: je Objekt, nie die Datenbank selbst; Überladungen, Aggregate, Typen, Erweiterungsobjekte", async () => {
    await setupRoles({ url: scratchUrl.toString(), apply: true, env: {} });
    await scratch(`
      create schema drizzle;
      create table public.t (id serial primary key, v text);
      create sequence public.s_alone;
      create view public.v as select id from public.t;
      create materialized view public.mv as select id from public.t;
      create function public.f(int) returns int language sql as 'select 1';
      create function public.f(text) returns int language sql as 'select 2';
      create procedure public.p() language sql as 'select 1';
      create aggregate public.agg(int) (sfunc = int4pl, stype = int);
      create type public.mood as enum ('a', 'b');
      create domain public.dom as int;
      create type public.pair as (a int, b int);
      create table drizzle.__journal (id int);
    `);
    const datdbaBefore = (await admin.query("select pg_get_userbyid(datdba) as o from pg_database where datname = $1", [name])).rows[0].o;
    const file = join(tmp, "plan.json");
    const w = await writePlan(scratchUrl.toString(), file);
    const plan = JSON.parse(readFileSync(file, "utf8"));
    const stmts: string[] = plan.items.map((i: { statement: string }) => i.statement);
    expect(plan.database).toBe(name);
    expect(stmts[0]).toMatch(/^ALTER SCHEMA/); // Schemas zuerst
    for (const must of ['TABLE "public"."t"', 'SEQUENCE "public"."s_alone"', 'VIEW "public"."v"', 'MATERIALIZED VIEW "public"."mv"', 'FUNCTION "public"."f"(integer)', 'FUNCTION "public"."f"(text)', 'PROCEDURE "public"."p"()', 'AGGREGATE "public"."agg"(integer)', 'TYPE "public"."mood"', 'DOMAIN "public"."dom"', 'TYPE "public"."pair"', 'TABLE "drizzle"."__journal"']) {
      expect(stmts.some((s) => s.includes(must)), must).toBe(true);
    }
    expect(stmts.some((s) => s.includes("t_id_seq"))).toBe(false); // an Spalte gebundene Sequenz folgt der Tabelle
    expect(stmts.some((s) => s.includes('"_t"') || s.includes('"_mood"'))).toBe(false); // keine Array-/Zeilentypen
    expect(stmts.every((s) => s.endsWith("OWNER TO soccaz_owner"))).toBe(true);
    expect(plan.items.every((i: { oldOwner: string; reverse: string }) => i.oldOwner && i.reverse.includes(i.oldOwner))).toBe(true);
    expect(w.sha256).toBe(planSha(readFileSync(file, "utf8")));
    // falsche Summe, falsches Ziel
    await expect(applyPlan(scratchUrl.toString(), file, "0".repeat(64))).rejects.toThrow(/Summe/);
    const other = join(tmp, "other.json");
    writeFileSync(other, JSON.stringify({ ...plan, database: "andere_db" }, null, 2) + "\n");
    await expect(applyPlan(scratchUrl.toString(), other, planSha(readFileSync(other, "utf8")))).rejects.toThrow(/Datenbank/);
    // neues Objekt seit dem Plan = Abbruch, nichts geaendert
    await scratch("create table public.nachtraeglich (id int)");
    await expect(applyPlan(scratchUrl.toString(), file, w.sha256)).rejects.toThrow(/seit dem Planlauf neu/);
    expect(await ownerOf("select pg_get_userbyid(relowner) as o from pg_class where oid = 'public.t'::regclass")).not.toBe("soccaz_owner");
    await scratch("drop table public.nachtraeglich");
    // anwenden
    expect((await applyPlan(scratchUrl.toString(), file, w.sha256)).applied).toBe(plan.items.length);
    expect(await ownerOf("select pg_get_userbyid(relowner) as o from pg_class where oid = 'public.t'::regclass")).toBe("soccaz_owner");
    expect(await ownerOf("select pg_get_userbyid(relowner) as o from pg_class where oid = 'public.t_id_seq'::regclass")).toBe("soccaz_owner"); // folgt der Tabelle
    expect(await ownerOf("select pg_get_userbyid(proowner) as o from pg_proc where proname = 'f' and pronargs = 1 and proargtypes[0] = 'text'::regtype")).toBe("soccaz_owner");
    expect(await ownerOf("select pg_get_userbyid(nspowner) as o from pg_namespace where nspname = 'drizzle'")).toBe("soccaz_owner");
    // die Datenbank selbst bleibt unangetastet
    expect((await admin.query("select pg_get_userbyid(datdba) as o from pg_database where datname = $1", [name])).rows[0].o).toBe(datdbaBefore);
    // ein zweiter Plan ist leer
    const c2 = new pg.Client({ connectionString: scratchUrl.toString() });
    await c2.connect();
    try {
      expect((await buildPlan(c2)).items.length).toBe(0);
    } finally {
      await c2.end();
    }
    // Rueckfall
    expect((await applyPlan(scratchUrl.toString(), file, w.sha256, { reverse: true })).reverse).toBe(true);
    expect(await ownerOf("select pg_get_userbyid(relowner) as o from pg_class where oid = 'public.t'::regclass")).not.toBe("soccaz_owner");
  });

  it("Erweiterungsobjekte werden ausgenommen (soweit die Erweiterung verfügbar ist)", async () => {
    const avail = (await admin.query("select 1 from pg_available_extensions where name = 'pg_trgm'")).rowCount;
    if (!avail) return;
    await scratch("create extension if not exists pg_trgm");
    const file = join(tmp, "ext.json");
    await writePlan(scratchUrl.toString(), file);
    const stmts: string[] = JSON.parse(readFileSync(file, "utf8")).items.map((i: { statement: string }) => i.statement);
    expect(stmts.some((s) => s.includes("similarity") || s.includes("gtrgm"))).toBe(false);
  });
});
