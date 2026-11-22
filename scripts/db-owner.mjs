// Eigentumswechsel je Objekt auf soccaz_owner (G25-009, Plan docs/design/g25-009-db-rollenmodell.md und Code-Plan Abschnitte 7.1/8.3/9.4). KEIN REASSIGN OWNED (aendert auch gemeinsame Objekte wie die Datenbank selbst):
// der Besitzer der Datenbank (datdba) wird NIE angefasst. Dieses Skript wird in Etappe D nur gebaut und im Trockenlauf geprueft; angewendet wird es erst mit A2.
// Ablauf:
//   1. Trockenlauf (Standard): node scripts/db-owner.mjs --plan plan.json         -> schreibt die Anweisungsliste (mit Zieldatenbank und bisherigem Eigentuemer je Objekt) und gibt die SHA-256 aus
//   2. Anwenden:               node scripts/db-owner.mjs --apply --plan plan.json --plan-sha256 <hex>   (die Summe wird GETRENNT uebergeben; Ziel-DB der Datei = Verbindung; neue Objekte seit dem Plan = Abbruch)
//   3. Rueckfall:              node scripts/db-owner.mjs --reverse --plan plan.json --plan-sha256 <hex> (setzt den bisherigen Eigentuemer je Objekt wieder ein)
// Objekte: Schemas public/drizzle; Tabellen/Views/Sichten/fremde Tabellen; EIGENSTAENDIGE Sequenzen (an Spalten gebundene folgen der Tabelle); Funktionen/Prozeduren/Aggregate (mit Signatur);
// eigenstaendige Typen (Enum, Domain, zusammengesetzt). Nicht: Array-/Zeilentypen, Erweiterungsobjekte (pg_depend 'e'), Objekte, die schon soccaz_owner gehoeren.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { dbUrlAllowed } from "./db-roles.mjs";

export const TARGET_OWNER = "soccaz_owner";
export const SCHEMAS = ["public", "drizzle"];
const ORDER = ["schema", "relation", "sequence", "function", "type"];

/** Liest den Katalog und baut die Anweisungsliste (reine Lesezugriffe). */
export async function buildPlan(client) {
  const q = async (text, params) => (await client.query(text, params)).rows;
  const q_ = (id) => client.escapeIdentifier(id);
  const database = (await q("select current_database() as d"))[0].d;
  const items = [];
  const owned = (o) => o !== TARGET_OWNER;
  for (const r of await q(
    `select n.nspname as name, pg_get_userbyid(n.nspowner) as owner from pg_namespace n where n.nspname = any($1) order by 1`,
    [SCHEMAS],
  )) {
    if (owned(r.owner)) items.push({ kind: "schema", schema: r.name, name: r.name, oldOwner: r.owner, statement: `ALTER SCHEMA ${q_(r.name)} OWNER TO ${TARGET_OWNER}`, reverse: `ALTER SCHEMA ${q_(r.name)} OWNER TO ${q_(r.owner)}` });
  }
  // Relationen (Tabellen, Views, materialisierte Views, fremde Tabellen, zusammengesetzte Typen als Relation) ohne Erweiterungsobjekte; Sequenzen nur eigenstaendige
  for (const r of await q(
    `select n.nspname as schema, c.relname as name, c.relkind as kind, pg_get_userbyid(c.relowner) as owner
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = any($1) and c.relkind in ('r','p','v','m','f','S','c')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
        and not (c.relkind = 'S' and exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype in ('a','i')))
      order by 1, 2`,
    [SCHEMAS],
  )) {
    if (!owned(r.owner)) continue;
    const word = { r: "TABLE", p: "TABLE", v: "VIEW", m: "MATERIALIZED VIEW", f: "FOREIGN TABLE", S: "SEQUENCE", c: "TYPE" }[r.kind];
    const full = `${q_(r.schema)}.${q_(r.name)}`;
    items.push({ kind: r.kind === "S" ? "sequence" : r.kind === "c" ? "type" : "relation", schema: r.schema, name: r.name, relkind: r.kind, oldOwner: r.owner, statement: `ALTER ${word} ${full} OWNER TO ${TARGET_OWNER}`, reverse: `ALTER ${word} ${full} OWNER TO ${q_(r.owner)}` });
  }
  // Funktionen, Prozeduren, Aggregate mit Signatur (Ueberladungen einzeln)
  for (const r of await q(
    `select n.nspname as schema, p.proname as name, p.prokind as kind, pg_get_function_identity_arguments(p.oid) as args, pg_get_userbyid(p.proowner) as owner
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = any($1)
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
      order by 1, 2, 4`,
    [SCHEMAS],
  )) {
    if (!owned(r.owner)) continue;
    const word = r.kind === "p" ? "PROCEDURE" : r.kind === "a" ? "AGGREGATE" : "FUNCTION";
    const full = `${q_(r.schema)}.${q_(r.name)}(${r.args})`;
    items.push({ kind: "function", schema: r.schema, name: r.name, args: r.args, prokind: r.kind, oldOwner: r.owner, statement: `ALTER ${word} ${full} OWNER TO ${TARGET_OWNER}`, reverse: `ALTER ${word} ${full} OWNER TO ${q_(r.owner)}` });
  }
  // eigenstaendige Typen (Enum, Domain); keine Array- und keine Zeilentypen von Relationen
  for (const r of await q(
    `select n.nspname as schema, t.typname as name, t.typtype as kind, pg_get_userbyid(t.typowner) as owner
       from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = any($1) and t.typtype in ('e','d') and t.typelem = 0
        and not exists (select 1 from pg_depend d where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e')
      order by 1, 2`,
    [SCHEMAS],
  )) {
    if (!owned(r.owner)) continue;
    const word = r.kind === "d" ? "DOMAIN" : "TYPE";
    const full = `${q_(r.schema)}.${q_(r.name)}`;
    items.push({ kind: "type", schema: r.schema, name: r.name, typtype: r.kind, oldOwner: r.owner, statement: `ALTER ${word} ${full} OWNER TO ${TARGET_OWNER}`, reverse: `ALTER ${word} ${full} OWNER TO ${q_(r.owner)}` });
  }
  items.sort((a, b) => ORDER.indexOf(a.kind === "relation" ? "relation" : a.kind) - ORDER.indexOf(b.kind === "relation" ? "relation" : b.kind) || a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name) || (a.args ?? "").localeCompare(b.args ?? ""));
  return { version: 1, database, targetOwner: TARGET_OWNER, items };
}

export const planText = (plan) => JSON.stringify(plan, null, 2) + "\n";
export const planSha = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const keyOf = (i) => `${i.kind}|${i.schema}|${i.name}|${i.args ?? ""}`;

async function withClient(url, fn) {
  if (!dbUrlAllowed(url)) throw new Error("DATABASE_URL: nur lokale Datenbank (db-guard)");
  const client = new pg.Client({ connectionString: url, statement_timeout: 120_000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Trockenlauf: schreibt die Plan-Datei, gibt die Summe zurueck. */
export async function writePlan(url, file) {
  return withClient(url, async (client) => {
    const plan = await buildPlan(client);
    const text = planText(plan);
    writeFileSync(file, text);
    return { sha256: planSha(text), items: plan.items.length, database: plan.database };
  });
}

/** Anwenden oder Rueckfall; prueft Summe, Ziel-DB, Rolle und neue Objekte; alles in EINER Transaktion. */
export async function applyPlan(url, file, sha256, { reverse = false } = {}) {
  const text = readFileSync(file, "utf8");
  if (!sha256 || planSha(text) !== sha256) throw new Error("Plan-Summe (--plan-sha256) passt nicht zur Plan-Datei");
  const plan = JSON.parse(text);
  return withClient(url, async (client) => {
    const database = (await client.query("select current_database() as d")).rows[0].d;
    if (plan.database !== database) throw new Error(`Plan gilt fuer die Datenbank ${plan.database}, Verbindung zeigt auf ${database}`);
    if (!(await client.query("select 1 from pg_roles where rolname = $1", [TARGET_OWNER])).rowCount) throw new Error(`Rolle ${TARGET_OWNER} fehlt (zuerst db-roles.mjs)`);
    if (!reverse) {
      const now = await buildPlan(client);
      const planned = new Set(plan.items.map(keyOf));
      const extra = now.items.filter((i) => !planned.has(keyOf(i)));
      if (extra.length) throw new Error(`Abbruch: ${extra.length} Objekt(e) seit dem Planlauf neu (z. B. ${keyOf(extra[0])}); neuen Plan erzeugen`);
    }
    await client.query("begin");
    try {
      for (const i of plan.items) await client.query(reverse ? i.reverse : i.statement);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
    return { applied: plan.items.length, reverse };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const file = arg("--plan");
    if (!file) throw new Error("--plan <datei> fehlt");
    const url = process.env.DATABASE_URL;
    if (args.includes("--apply") || args.includes("--reverse")) {
      const r = await applyPlan(url, file, arg("--plan-sha256"), { reverse: args.includes("--reverse") });
      console.log(`${r.reverse ? "Rueckfall" : "Eigentumswechsel"} angewendet: ${r.applied} Objekte.`);
    } else {
      const r = await writePlan(url, file);
      console.log(`Plan fuer ${r.database}: ${r.items} Objekte nach ${file}\nSHA-256: ${r.sha256}\n(Trockenlauf; Anwenden mit --apply --plan ${file} --plan-sha256 <Summe>)`);
    }
  } catch (e) {
    console.error("FEHLER:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
