import { expect, test } from "@playwright/test";
import { knockout } from "../../src/lib/tournament";
import { closeContexts, run, seedUser, testDb } from "./helpers";
import { login } from "./helpers-wertung";

// Freilose (Teamzahl keine Zweierpotenz): die Turnierseite öffnet für Gast und Veranstalter ohne Absturz, der Spielplan ist sichtbar, jedes Spiel steht im Bracket (Bug: 'Da ist etwas schiefgelaufen' bei 6 Teams).
// Das Bracket wird per DB angelegt (knockout() wie der Server, mit Freilosen); Ergebnisse bis zum Finale deckt der Integrationstest tournament-freilose ab.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function seedBracket(n: number) {
  const db = testDb();
  const org = await seedUser(`flo${n}`, `Veranstalter ${n} ${run}`);
  await db.query("update users set is_organizer = true where id = $1", [org]);
  const { rows } = await db.query(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, status, starts_at, duration_min, match_minutes, is_private, final_share_cents, bracket_generated_at)
     values ($1, $2, 'Essen', (now() + interval '6 days')::date, 'knockout', $3, 'running', now() + interval '6 days', 120, 20, false, 0, now()) returning id`,
    [org, `Freilos-Cup ${n} ${run}`, n],
  );
  const tid = rows[0].id as string;
  const teamIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const cap = await seedUser(`flc${n}-${i}`, `Kapitaen ${n}-${i}`);
    const team = await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [`FL ${n}-${i} ${run}`, `fl-${n}-${i}-${run}`, cap]);
    await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [team.rows[0].id, cap]);
    await db.query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at, paid_ready_at) values ($1, $2, $3, now(), now())", [tid, team.rows[0].id, cap]);
    teamIds.push(team.rows[0].id);
  }
  const fixtures = knockout(teamIds);
  const idOf = new Map<string, string>();
  const key = (s: { stage: string; round: number; slot: number }) => `${s.stage}|${s.round}|${s.slot}`;
  for (const f of fixtures) {
    const r = await db.query("insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b) values ($1, $2, $3, $4, $5, $6) returning id", [tid, f.stage, f.round, f.slot, f.a, f.b]);
    idOf.set(key(f), r.rows[0].id);
  }
  for (const f of fixtures) if (f.feeds) await db.query("update tournament_matches set feeds_match_id = $1, feeds_side = $2 where id = $3", [idOf.get(key(f.feeds)), f.feeds.side, idOf.get(key(f))]);
  return { tid, org, games: fixtures.length };
}

for (const n of [3, 5, 6]) {
  test(`Turnierseite öffnet bei ${n} Teams (Freilose) ohne Absturz, Spielplan und alle ${n - 1} Spiele sichtbar, für Gast und Veranstalter`, async ({ browser }) => {
    const { tid, org, games } = await seedBracket(n);
    const guest = await (await browser.newContext()).newPage();
    const organizer = await (await browser.newContext()).newPage();
    const email = (await testDb().query("select email from users where id = $1", [org])).rows[0].email as string;
    await login(organizer, email, `Veranstalter ${n} ${run}`);
    for (const page of [guest, organizer]) {
      await page.goto(`/turniere/${tid}`);
      await expect(page.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("Da ist etwas schiefgelaufen")).toHaveCount(0);
      await expect(page.getByTestId("schedule")).toBeVisible();
      await expect(page.getByTestId("tournament-match")).toHaveCount(games);
      // jede Paarung im Spielplan hat Platz und Zeit ("Platz 1 · 12:00")
      expect(await page.getByTestId("schedule").getByText(/Platz [12]/).count()).toBeGreaterThanOrEqual(games);
    }
  });
}
