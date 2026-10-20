// Füllt eine Lobby zum Ausprobieren (nur lokal): pro Team bis zu 5 Spieler, alle bereit und mit bezahltem Anteil.
// Aufruf: npx tsx --env-file=.env.local scripts/seed-lobby.mts [matchId]    (ohne Angabe: die neueste offene Lobby)
import pg from "pg";
import { setReady } from "../src/server/lobby";

const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Nur gegen eine lokale Datenbank.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const NAMES = ["Kevin Brandt", "Murat Yilmaz", "Jonas Keller", "Emre Demir", "Lukas Vogt", "Can Aydin", "Tim Hartmann", "Deniz Kaya"];
const NICKS = ["Brandy", "Mur", "Kelle", "Emo", "Luki", "Cano", "Timmi", "Dez"];
const POSITIONS = ["Abwehr", "Mittelfeld", "Angriff", "Torwart", "Flexibel"];

const matchId = process.argv[2] ?? (await pool.query("select id from matches where status = 'lobby' order by created_at desc limit 1")).rows[0]?.id;
if (!matchId) throw new Error("Keine offene Lobby gefunden.");
const { rows: [m] } = await pool.query("select id, home_team_id, away_team_id, price_cents, duration_min from matches where id = $1", [matchId]);
const share = Math.round((m.price_cents ?? 8000) / 8); // Reservierung wie bei mindestens 8 zahlenden Spielern

async function pay(userId: string) {
  await pool.query("update match_participants set paid_cents = $3, paid_at = now(), ready_at = coalesce(ready_at, now()) where match_id = $1 and user_id = $2 and paid_cents = 0", [matchId, userId, share]);
  // Guthaben passend aufladen und den Anteil buchen, damit die Buchungen stimmen
  await pool.query("insert into ledger_entries (debit_account, credit_account, credit_user_id, amount_cents, kind, idempotency_key, reason) values ('clearing', 'wallet', $1, $2, 'topup', $3, 'Demo-Aufladung') on conflict do nothing", [userId, share, `lobbyfill-topup:${matchId}:${userId}`]);
  await pool.query("insert into ledger_entries (debit_account, debit_user_id, credit_account, amount_cents, kind, match_id, idempotency_key, reason) values ('wallet', $1, 'revenue', $2, 'match_share', $3, $4, 'Demo-Reservierung') on conflict do nothing", [userId, share, matchId, `lobbyfill-share:${matchId}:${userId}`]);
}

let n = 0;
for (const teamId of [m.home_team_id, m.away_team_id]) {
  const { rows: [t] } = await pool.query("select slug from teams where id = $1", [teamId]);
  const { rows: members } = await pool.query("select user_id, role from team_members where team_id = $1", [teamId]);
  const have = new Set(members.map((x) => x.user_id));
  // Admins und vorhandene Mitglieder in die Lobby, dann auffüllen bis 5
  for (const id of have) await pool.query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3) on conflict do nothing", [matchId, id, teamId]);
  let count = have.size;
  for (let i = 0; count < 5; i++, count++) {
    const idx = (n++ % NAMES.length);
    const r = await pool.query(
      `insert into users (email, name, nickname, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
       values ($1, $2, $3, 'Gelsenkirchen', $4, now(), now(), now()) on conflict (email) do update set name = excluded.name returning id`,
      [`lobbyfill-${t.slug}-${i}@soccav2.local`, NAMES[idx], NICKS[idx], POSITIONS[idx % POSITIONS.length]],
    );
    await pool.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [teamId, r.rows[0].id]);
    await pool.query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3) on conflict do nothing", [matchId, r.rows[0].id, teamId]);
    have.add(r.rows[0].id);
  }
  for (const id of have) await pay(id);
}

// Bestätigung über die echte Logik auslösen: ein Admin macht sich erneut bereit
for (const teamId of [m.home_team_id, m.away_team_id]) {
  const { rows: [admin] } = await pool.query("select user_id from team_members where team_id = $1 and role = 'admin' limit 1", [teamId]);
  await setReady(admin.user_id, matchId, false);
  await setReady(admin.user_id, matchId, true);
}
const { rows: [after] } = await pool.query("select status from matches where id = $1", [matchId]);
console.log(`Lobby ${matchId} gefüllt, Status: ${after.status}`);
await pool.end();
process.exit(0);
