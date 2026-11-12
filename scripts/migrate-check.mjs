// Migrationsprüfung auf Wegwerf-Datenbanken (Vertrag 009 M1, docs/design/009-m1-plan.md Abschnitte 5 und 8, Test M1-B).
// Aufruf: node --env-file=.env.local scripts/migrate-check.mjs
//  1. FRISCH: leere Datenbank, ALLE Migrationen in EINEM Lauf (wie CI und Worker-Datenbanken; der Drizzle-Migrator nutzt eine Transaktion).
//  2. BESTEHEND: Datenbank auf dem Stand ohne die letzte Migration, mit einer Zeile in users, danach nur die letzte Migration.
// Danach werden die Strukturen der letzten Migration geprüft (Spalte is_owner, Teilindex users_one_owner, CHECK users_owner_is_admin) und die Datenbanken gelöscht.
// Es werden nur lokale Server zugelassen (wie die Integrationstests); die Wegwerf-Datenbanken heißen soccaz_migcheck_*.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt.");
const base = new URL(url);
if (!["localhost", "127.0.0.1"].includes(base.hostname) || base.search || base.hash) throw new Error("Nur lokale Datenbank ohne Query/Fragment.");

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
const stamp = Date.now();
const names = [`soccaz_migcheck_a_${stamp}`, `soccaz_migcheck_b_${stamp}`];
const urlFor = (name) => {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
};

let failures = 0;
const check = (ok, text) => {
  console.log(`${ok ? "OK    " : "FEHLER"} ${text}`);
  if (!ok) failures += 1;
};

async function structure(pool) {
  const col = await pool.query("select 1 from information_schema.columns where table_name = 'users' and column_name = 'is_owner'");
  const idx = await pool.query("select indexdef from pg_indexes where indexname = 'users_one_owner'");
  const chk = await pool.query("select 1 from pg_constraint where conname = 'users_owner_is_admin'");
  check(col.rowCount === 1, "Spalte users.is_owner");
  check(idx.rowCount === 1 && /unique/i.test(idx.rows[0].indexdef) && /where/i.test(idx.rows[0].indexdef), "Teilindex users_one_owner (eindeutig, mit WHERE)");
  check(chk.rowCount === 1, "CHECK users_owner_is_admin");
}

async function secondOwnerRejected(pool) {
  await pool.query("insert into users (email, name, role, is_owner) values ('a@migcheck.test', 'A', 'admin', true)");
  let code = "";
  try {
    await pool.query("insert into users (email, name, role, is_owner) values ('b@migcheck.test', 'B', 'admin', true)");
  } catch (error) {
    code = error.code;
  }
  check(code === "23505", "zweiter Admin 1 wird von der Datenbank abgelehnt (23505)");
  code = "";
  try {
    await pool.query("insert into users (email, name, role, is_owner) values ('c@migcheck.test', 'C', 'player', true)");
  } catch (error) {
    code = error.code;
  }
  check(code === "23514" || code === "23505", "Admin 1 mit Rolle player wird abgelehnt");
}

try {
  for (const name of names) await admin.query(`create database "${name}"`);

  // 1. FRISCH: alle Migrationen in einem Lauf
  const fresh = new pg.Pool({ connectionString: urlFor(names[0]), max: 2 });
  console.log("== FRISCH (alle Migrationen in einem Lauf)");
  await migrate(drizzle(fresh), { migrationsFolder: "./drizzle" });
  await structure(fresh);
  await secondOwnerRejected(fresh);
  await fresh.end();

  // 2. BESTEHEND: ohne die letzte Migration anlegen, Daten einfügen, dann die letzte nachziehen
  console.log("== BESTEHEND (Stand ohne die letzte Migration, mit Daten, dann die letzte)");
  const tmp = mkdtempSync(path.join(tmpdir(), "migcheck-"));
  cpSync("./drizzle", tmp, { recursive: true });
  const journalPath = path.join(tmp, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const full = journal.entries.length;
  journal.entries = journal.entries.slice(0, full - 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  const existing = new pg.Pool({ connectionString: urlFor(names[1]), max: 2 });
  await migrate(drizzle(existing), { migrationsFolder: tmp });
  await existing.query("insert into users (email, name, role) values ('alt@migcheck.test', 'Alt', 'admin')");
  await migrate(drizzle(existing), { migrationsFolder: "./drizzle" });
  await structure(existing);
  const old = await existing.query("select role, is_owner from users where email = 'alt@migcheck.test'");
  check(old.rows[0]?.role === "admin" && old.rows[0]?.is_owner === false, "bestehende Zeile bleibt unverändert, is_owner = false");
  await secondOwnerRejected(existing);
  await existing.end();
} finally {
  for (const name of names) await admin.query(`drop database if exists "${name}" with (force)`).catch(() => {});
  await admin.end();
}
if (failures > 0) {
  console.error(`${failures} Prüfung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Migrationsprüfungen bestanden.");
