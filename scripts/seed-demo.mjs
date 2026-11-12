// Legt zwei Demo-Teams mit je 5 Spielern an, damit man Matchmaking und Veto von Hand ausprobieren kann (nur lokal).
// Anmeldung im Browser über den Dev-Login mit  demo-a@soccav2.local  bzw.  demo-b@soccav2.local  (beliebiger Name).
// Aufruf: node --env-file=.env.local scripts/seed-demo.mjs        Aufräumen: node --env-file=.env.local scripts/seed-demo.mjs --clean
import pg from "pg";
import { tsImport } from "tsx/esm/api";

// Schutz wie bei den anderen Seed-Skripten (scripts/lib/seed-guard.ts, Backlog 56): nur localhost:5433 mit soccav2 oder soccaz_w1 bis soccaz_w4, keine
// Query-Parameter (?host= würde den Hostnamen umgehen). tsx lädt die TypeScript-Datei, damit es nur EINE Regel gibt (Aufruf bleibt: node scripts/seed-demo.mjs).
const { assertSeedAllowed } = await tsImport("./lib/seed-guard.ts", import.meta.url);
try {
  assertSeedAllowed({ nodeEnv: process.env.NODE_ENV, databaseUrl: process.env.DATABASE_URL });
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

if (process.argv.includes("--clean")) {
  await pool.query("delete from matches where home_team_id in (select id from teams where slug like 'demo-%') or away_team_id in (select id from teams where slug like 'demo-%')");
  await pool.query("delete from teams where slug like 'demo-%'");
  await pool.query("delete from users where email like 'demo-%@soccav2.local'");
  console.log("Demo-Daten entfernt.");
  await pool.end();
  process.exit(0);
}

async function user(email, name, position) {
  const r = await pool.query(
    `insert into users (email, name, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
     values ($1, $2, 'Gelsenkirchen', $3, now(), now(), now())
     on conflict (email) do update set name = excluded.name returning id`,
    [email, name, position],
  );
  return r.rows[0].id;
}

async function team(slug, name, strength, adminId, memberIds) {
  const r = await pool.query(
    `insert into teams (name, slug, city, strength, created_by) values ($1, $2, 'Gelsenkirchen', $3, $4)
     on conflict (slug) do update set name = excluded.name returning id`,
    [name, slug, strength, adminId],
  );
  const id = r.rows[0].id;
  await pool.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [id, adminId]);
  for (const m of memberIds) await pool.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [id, m]);
}

const positions = ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"];
const a = await user("demo-a@soccav2.local", "Demo Admin A", "Mittelfeld");
const b = await user("demo-b@soccav2.local", "Demo Admin B", "Angriff");
const aPlayers = [];
const bPlayers = [];
for (let i = 1; i <= 4; i++) {
  aPlayers.push(await user(`demo-a${i}@soccav2.local`, `Alpha Spieler ${i}`, positions[i]));
  bPlayers.push(await user(`demo-b${i}@soccav2.local`, `Bravo Spieler ${i}`, positions[i]));
}
await team("demo-alpha", "Demo Alpha", 3, a, aPlayers);
await team("demo-bravo", "Demo Bravo", 3, b, bPlayers);
console.log("Fertig: Teams 'Demo Alpha' (Admin demo-a@soccav2.local) und 'Demo Bravo' (Admin demo-b@soccav2.local), je 5 Spieler.");
await pool.end();
