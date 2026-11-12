// Migrationsprüfung auf Wegwerf-Datenbanken (Vertrag 009 M1, docs/design/009-m1-plan.md Abschnitte 5 und 8, Test M1-B).
// Aufruf: node --env-file=.env.local scripts/migrate-check.mjs
//  1. FRISCH: leere Datenbank, ALLE Migrationen in EINEM Lauf (wie CI und Worker-Datenbanken; der Drizzle-Migrator nutzt eine Transaktion).
//  2. BESTEHEND: Datenbank auf dem Stand ohne die letzte Migration, mit Konten ALLER Rollen (auch moderator, finance, booking), danach nur die letzte Migration.
//     Ist die letzte Migration die Auflösung der Teilrollen ("teilrollen" im Namen), wird geprüft: die drei Teilrollen sind player, je Konto steht ein Protokolleintrag (user.role, actor_id leer, Grund in after), andere Rollen sind unverändert.
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
  check((await fresh.query("select count(*)::int as n from audit_log")).rows[0].n === 0, "frische Datenbank: kein Protokolleintrag durch Migrationen");
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
  for (const [mail, role] of [['alt@migcheck.test', 'admin'], ['mod@migcheck.test', 'moderator'], ['fin@migcheck.test', 'finance'], ['buch@migcheck.test', 'booking'], ['spieler@migcheck.test', 'player']]) {
    await existing.query("insert into users (email, name, role) values ($1, $1, $2)", [mail, role]);
  }
  await migrate(drizzle(existing), { migrationsFolder: "./drizzle" });
  await structure(existing);
  const old = await existing.query("select role, is_owner from users where email = 'alt@migcheck.test'");
  check(old.rows[0]?.role === "admin" && old.rows[0]?.is_owner === false, "bestehende Zeile bleibt unverändert, is_owner = false");
  if (/teilrollen/.test(journal.entries.length ? JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")).entries.at(-1).tag : "")) {
    const roles = Object.fromEntries((await existing.query("select email, role from users where email like '%@migcheck.test'")).rows.map((r) => [r.email, r.role]));
    check(roles['mod@migcheck.test'] === 'player' && roles['fin@migcheck.test'] === 'player' && roles['buch@migcheck.test'] === 'player', "moderator, finance, booking sind jetzt player");
    check(roles['alt@migcheck.test'] === 'admin' && roles['spieler@migcheck.test'] === 'player', "admin und player bleiben unverändert");
    const log = (await existing.query("select a.actor_id, a.before, a.after, u.email from audit_log a join users u on u.id::text = a.entity_id where a.action = 'user.role' and u.email like '%@migcheck.test' order by u.email")).rows;
    check(log.length === 3 && log.every((l) => l.actor_id === null && /Rolle aufgelöst: war (moderator|finance|booking)/.test(l.after.reason)), "je Teilrollen-Konto genau ein Protokolleintrag (actor_id leer, Grund in after)");
    check(log.some((l) => l.email === 'mod@migcheck.test' && l.before.role === 'moderator'), "Protokoll nennt die frühere Rolle (before.role)");
  }
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
