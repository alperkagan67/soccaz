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

async function commissionStructure(pool, withOldMatch) {
  const col = await pool.query("select column_default from information_schema.columns where table_name = 'matches' and column_name = 'ledger_model'");
  if (col.rowCount === 0) return; // Migration von 009 M2 nicht vorhanden
  check(/commission/.test(col.rows[0].column_default), "matches.ledger_model: Standard für neue Spiele ist 'commission'");
  check((await pool.query("select 1 from information_schema.columns where table_name = 'venues' and column_name in ('commission_percent', 'commission_bonus_enabled')")).rowCount === 2, "venues: Provisionsspalten");
  check((await pool.query("select 1 from pg_constraint where conname = 'venues_commission_percent_range'")).rowCount === 1, "CHECK Satz 0 bis 100");
  check((await pool.query("select 1 from pg_trigger where tgname = 'match_commissions_append_only'")).rowCount === 1, "match_commissions ist nur anhängend (Trigger)");
  check((await pool.query("select 1 from pg_trigger where tgname = 'matches_ledger_model_immutable'")).rowCount === 1, "matches.ledger_model ist unveränderlich (Trigger)");
  const enums = (await pool.query("select enumlabel from pg_enum e join pg_type ty on ty.oid = e.enumtypid where ty.typname in ('ledger_account', 'ledger_kind')")).rows.map((r) => r.enumlabel);
  check(["venue_payable", "commission", "commission_bonus"].every((x) => enums.includes(x)), "Hauptbuch kennt venue_payable, commission, commission_bonus");
  let code = "";
  try {
    await pool.query("insert into venues (name, city, commission_percent) values ('X', 'Y', 100.01)");
  } catch (error) {
    code = error.code;
  }
  check(code === "23514", "Satz über 100 wird von der Datenbank abgelehnt");
  const v = await pool.query("insert into venues (name, city) values ('Standard', 'Essen') returning commission_percent");
  check(Number(v.rows[0].commission_percent) === 0, "Halle ohne Angabe (Altbestand, OSM-Import): Satz 0 (die Vorgabe 10 setzt createVenue)");
  if (withOldMatch) {
    const m = await pool.query("select ledger_model from matches where home_team_id in (select id from teams where slug = 'mig-a')");
    check(m.rows[0]?.ledger_model === "legacy", "bestehendes Spiel bleibt im alten Buchungsmodell (legacy)");
  }
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
  await commissionStructure(fresh, false);
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
  // ein Altspiel VOR der letzten Migration (Vertrag 009 M2: bekommt das Buchungsmodell 'legacy')
  const mu = (await existing.query("select id from users where email = 'alt@migcheck.test'")).rows[0].id;
  const mt = [];
  for (const n of ["a", "b"]) mt.push((await existing.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`Mig ${n}`, `mig-${n}`, mu])).rows[0].id);
  await existing.query("insert into matches (home_team_id, away_team_id, starts_at, duration_min) values ($1, $2, now() + interval '3 days', 60)", mt);
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
  await commissionStructure(existing, true);
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
