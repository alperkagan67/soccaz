import { expect, type Page } from "@playwright/test";

export const run = Date.now().toString(36);

export async function devLogin(page: Page, email: string, name: string, next?: string) {
  await page.goto(next ? `/anmelden?next=${encodeURIComponent(next)}` : "/anmelden");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Als Dev-Nutzer anmelden" }).click();
}

export async function onboard(page: Page, birthDate: string) {
  await expect(page).toHaveURL(/\/willkommen/);
  await page.getByLabel("Stadt").selectOption("Gelsenkirchen");
  await page.getByLabel("Position").selectOption("Angriff");
  await page.getByLabel("Geburtsdatum").fill(birthDate);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Los geht's" }).click();
}

/** Neuer Nutzer, eingeloggt und eingerichtet. */
export async function newUser(page: Page, key: string) {
  await devLogin(page, `${key}-${run}@test.local`, `Spieler ${key}`);
  await onboard(page, "1995-05-05");
  await expect(page).toHaveURL(/\/app$/);
}

export async function createTeam(page: Page, name: string) {
  await page.goto("/app/teams/neu");
  await page.getByLabel("Teamname").fill(name);
  await page.getByRole("button", { name: "Team gründen" }).click();
  // Achtung: /app/teams/neu enthält ebenfalls "/teams/". Erst die Teamseite /teams/<slug> abwarten.
  await page.waitForURL((url) => /^\/teams\/[a-z0-9-]+$/.test(url.pathname));
}

/** "2026-11-05T20:00" in n Tagen ab heute (Berliner Ortszeit grob), immer in der Zukunft. */
export function futureLocal(days: number, time = "20:00"): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${time}`;
}

/** Nach jedem Test alle selbst erzeugten Browser-Kontexte schließen (sonst bleiben sie offen und belasten den Dev-Server). */
export async function closeContexts(browser: import("@playwright/test").Browser) {
  await Promise.all(browser.contexts().map((c) => c.close()));
}

// ---------------------------------------------------------------------------------------------
// Direkter Datenbankzugriff für Testdaten (nur lokal). Spart Zeit bei Szenarien mit vielen Spielern.
// ---------------------------------------------------------------------------------------------
import { existsSync } from "node:fs";
import { Pool } from "pg";

let pool: Pool | undefined;
export function testDb(): Pool {
  if (!pool) {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    const url = process.env.DATABASE_URL!;
    if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Test-Seeding nur gegen lokale Datenbank");
    pool = new Pool({ connectionString: url, max: 2 });
  }
  return pool;
}

export async function closeTestDb() {
  await pool?.end();
  pool = undefined;
}

/** Legt einen fertig eingerichteten Nutzer an (ohne Login). */
export async function seedUser(key: string, name = `Spieler ${key}`): Promise<string> {
  const { rows } = await testDb().query(
    `insert into users (email, name, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
     values ($1, $2, 'Gelsenkirchen', 'Mittelfeld', now(), now(), now()) returning id`,
    [`${key}-${run}@test.local`, name],
  );
  return rows[0].id;
}

export async function teamIdByName(name: string): Promise<string> {
  const { rows } = await testDb().query("select id from teams where name = $1", [name]);
  return rows[0].id;
}

export async function addTeamMember(teamId: string, userId: string) {
  await testDb().query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [teamId, userId]);
}

export async function addParticipant(matchId: string, userId: string, teamId: string | null, ready = false) {
  await testDb().query(
    "insert into match_participants (match_id, user_id, team_id, ready_at) values ($1, $2, $3, $4) on conflict do nothing",
    [matchId, userId, teamId, ready ? new Date() : null],
  );
}

export function matchIdFromUrl(url: string): string {
  const m = /\/lobby\/([0-9a-f-]{36})/.exec(url);
  if (!m) throw new Error(`Keine Lobby-URL: ${url}`);
  return m[1];
}
