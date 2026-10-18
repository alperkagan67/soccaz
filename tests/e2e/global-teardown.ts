import { existsSync } from "node:fs";
import { Pool } from "pg";

/** Entfernt nach den E2E-Tests alle Testdaten (Nutzer mit @test.local). Läuft nur gegen eine lokale Datenbank. */
export default async function globalTeardown() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost"].includes(host)) {
    console.warn(`E2E-Aufräumen übersprungen: Datenbank-Host ${host} ist nicht lokal.`);
    return;
  }

  const pool = new Pool({ connectionString: url });
  try {
    const testUsers = "select id from users where email like '%@test.local'";
    const testTeams = `select id from teams where created_by in (${testUsers})`;
    await pool.query(`delete from matches where home_team_id in (${testTeams}) or away_team_id in (${testTeams})`);
    await pool.query(`delete from audit_log where actor_id in (${testUsers})`);
    await pool.query(`delete from teams where created_by in (${testUsers})`);
    await pool.query("delete from users where email like '%@test.local'");
  } finally {
    await pool.end();
  }
}
