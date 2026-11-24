import { expect, type Browser, type Page } from "@playwright/test";
import { run, seedUser, testDb } from "./helpers";
import { query } from "./helpers-db";
import { login } from "./helpers-wertung";
import { zahlungsWorte } from "@/lib/zahlungen-aus";

// Gemeinsame Helfer für die Turniertag-Specs (Gratis-Turnier PR D, Zahlungen AUS wie in Produktion). Nur Testdaten: Seeding per SQL, Bedienung nur dort, wo der Turniertag sie braucht.
export const PHONE = { width: 390, height: 844 };

export async function phonePage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ viewport: PHONE })).newPage();
}

export async function loginPhone(browser: Browser, email: string, name: string): Promise<Page> {
  const page = await phonePage(browser);
  await login(page, email, name);
  return page;
}

/** Veranstalter-Konto per SQL (Plattform-Recht is_organizer wie nach der Freischaltung in /admin/nutzer). */
export async function seedOrganizer(key: string) {
  const id = await seedUser(key, `Veranstalter ${key}`);
  await query("update users set is_organizer = true where id = $1", [id]);
  return { id, email: `${key}-${run}@test.local`, name: `Veranstalter ${key}` };
}

/** Gratis-Turnier (total_cents = 0) in der Anmeldung. */
export async function seedFreeTournament(orgId: string, key: string, maxTeams: number) {
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, match_minutes, status, registration_deadline, starts_at, is_private)
     values ($1, $2, 'Essen', (now() + interval '9 days')::date, 'knockout', $3, 0, 0, 240, 15, 'registration', now() + interval '5 days', now() + interval '9 days', false) returning id`,
    [orgId, `Tag-Cup ${key} ${run}`, maxTeams],
  );
  return { id: t.id, name: `Tag-Cup ${key} ${run}` };
}

/** Ein angemeldetes Team mit Captain und 4 Spielern; ready = Kader vollzählig gemeldet (bei Gratis ohne zweites "Bereit"). */
export async function seedTeam(tid: string, key: string, ready: boolean) {
  const db = testDb();
  const cap = await seedUser(`${key}c`, `Captain ${key}`);
  const name = `Tag ${key} ${run}`;
  const { rows } = await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, `tag-${key}-${run}`.toLowerCase(), cap]);
  const teamId = rows[0].id as string;
  await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [teamId, cap]);
  await db.query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at, paid_ready_at) values ($1, $2, $3, $4, $4)", [tid, teamId, cap, ready ? new Date() : null]);
  await db.query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [tid, teamId, cap]);
  for (let p = 1; p <= 3; p++) await addPlayer(tid, teamId, await seedUser(`${key}p${p}`, `Spieler ${key} ${p}`));
  return { teamId, name, captainId: cap, captainEmail: `${key}c-${run}@test.local` };
}

export async function addPlayer(tid: string, teamId: string, userId: string) {
  const db = testDb();
  await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [teamId, userId]);
  await db.query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing", [tid, teamId, userId]);
}

/** Wortscan wie die Zustand-Matrix: Text UND Attribute der Seite, nirgends ein Zahlungswort; kein horizontales Scrollen auf dem Handy. */
export async function expectCleanPhonePage(page: Page, what: string) {
  const text = (await page.locator("main").textContent()) ?? "";
  const attrs = await page.locator("main").evaluate((el) => [...el.querySelectorAll("[title],[aria-label],[alt]")].map((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("alt")].join(" ")).join(" "));
  expect(zahlungsWorte(`${text} ${attrs}`.replace(/\s+/g, " ")), `Zahlungswort auf ${what}`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `horizontales Scrollen auf ${what}`).toBeLessThanOrEqual(0);
}

export type OpenMatch = { id: string; match_id: string; team_a: string; team_b: string; na: string; nb: string };

/** Nächstes entscheidbares Turnierspiel (beide Teams stehen fest, noch kein Ergebnis). */
export async function nextOpen(tid: string): Promise<OpenMatch | undefined> {
  const rows = await query<OpenMatch>(
    `select tm.id, tm.match_id, tm.team_a, tm.team_b, ta.name as na, tb.name as nb
       from tournament_matches tm join teams ta on ta.id = tm.team_a join teams tb on tb.id = tm.team_b
      where tm.tournament_id = $1 and tm.match_id is not null and tm.score_a is null
      order by tm.round, tm.slot limit 1`,
    [tid],
  );
  return rows[0];
}

export async function waitDecided(tmId: string) {
  await expect.poll(async () => (await query<{ score_a: number | null }>("select score_a from tournament_matches where id = $1", [tmId]))[0].score_a, { timeout: 30_000 }).not.toBeNull();
}

const confirmDialog = (page: Page) => page.getByTestId("confirm-dialog").filter({ visible: true });

/** Ergebnis von Hand (Veranstalter/Admin): Details öffnen, Felder füllen, "Endergebnis eintragen", Rückfrage mit großem Spielstand bestätigen. */
export async function enterFinalByHand(page: Page, m: OpenMatch, a: number, b: number) {
  await page.goto(`/spiele/${m.match_id}`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("manual-result").locator("summary").click();
  await page.getByTestId("manual-result").getByRole("spinbutton", { name: m.na, exact: true }).fill(String(a));
  await page.getByTestId("manual-result").getByRole("spinbutton", { name: m.nb, exact: true }).fill(String(b));
  await page.getByTestId("manual-result").getByRole("button", { name: "Endergebnis eintragen" }).click();
  const dialog = confirmDialog(page);
  await expect(dialog.getByTestId("confirm-consequence")).toContainText(`${m.na} ${a} : ${b} ${m.nb}`);
  await dialog.getByRole("button", { name: "Endgültig eintragen" }).click();
  await waitDecided(m.id);
}

/** Tore per SQL (Heim = team_a), dann Abpfiff mit Rückfrage. */
export async function goalsThenAbpfiff(page: Page, m: OpenMatch, a: number, b: number, opts: { failFirst?: boolean } = {}) {
  for (let i = 0; i < a; i++) await query("insert into match_events (match_id, type, team_id) values ($1, 'goal', $2)", [m.match_id, m.team_a]);
  for (let i = 0; i < b; i++) await query("insert into match_events (match_id, type, team_id) values ($1, 'goal', $2)", [m.match_id, m.team_b]);
  await page.goto(`/spiele/${m.match_id}`);
  await page.waitForLoadState("networkidle");
  const panel = page.getByTestId("end-match");
  await expect(panel.getByRole("button", { name: "Abpfiff", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("manual-result")).not.toHaveAttribute("open", ""); // AC-30: die Handeingabe liegt eingeklappt darunter
  if (a === b) await expect(page.getByTestId("end-match-draw")).toContainText("Siebenmeterschießen");
  else await expect(page.getByTestId("end-match-draw")).toHaveCount(0);
  await panel.getByRole("button", { name: "Abpfiff", exact: true }).click();
  const dialog = confirmDialog(page);
  await expect(dialog.getByTestId("confirm-consequence")).toContainText(`${m.na} ${a} : ${b} ${m.nb}`);
  await expect(dialog).toContainText("endgültig");
  if (opts.failFirst) {
    // Fehlerpfad: die Server-Aktion scheitert (Netz weg): die Meldung bleibt im Dialog sichtbar, nichts wird still verschluckt, nichts ist entschieden
    const block = (route: import("@playwright/test").Route) => (route.request().method() === "POST" ? route.abort() : route.continue());
    await page.route(/\/spiele\//, block);
    await dialog.getByRole("button", { name: "Endgültig beenden" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Das hat nicht geklappt");
    expect((await query<{ score_a: number | null }>("select score_a from tournament_matches where id = $1", [m.id]))[0].score_a).toBeNull();
    await page.unroute(/\/spiele\//, block);
  }
  await dialog.getByRole("button", { name: "Endgültig beenden" }).click();
}

/** Unentschieden im K.-o.-Spiel: Sieger des Siebenmeterschießens auf der Turnierseite eintragen. */
export async function decideShootoutOnPage(page: Page, tid: string, m: OpenMatch, winnerName: string) {
  await page.goto(`/turniere/${tid}`);
  await page.waitForLoadState("networkidle");
  const box = page.getByTestId("shootout").filter({ hasText: "Siebenmeterschießen" }).first();
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.getByRole("button", { name: winnerName, exact: true }).click();
  await expect.poll(async () => (await query<{ w: string | null }>("select shootout_winner as w from tournament_matches where id = $1", [m.id]))[0].w, { timeout: 30_000 }).not.toBeNull();
}

/** Kampflos werten am Bracket (Veranstalter): native Rückfrage bestätigen. */
export async function forfeitOnPage(page: Page, tid: string, m: OpenMatch, winnerName: string) {
  await page.goto(`/turniere/${tid}`);
  await page.waitForLoadState("networkidle");
  const matchBox = page.getByTestId("tournament-match").filter({ hasText: m.na }).filter({ hasText: m.nb });
  await matchBox.getByTestId("forfeit").locator("summary").click();
  page.once("dialog", (d) => void d.accept());
  await matchBox.getByRole("button", { name: `${winnerName} gewinnt kampflos (3:0)` }).click();
  await waitDecided(m.id);
}

/** Bis zum Finale weiterspielen: reihum von Hand, damit jedes Spiel vorkommt. Gibt die Anzahl der gespielten Spiele zurück. */
export async function playToEnd(page: Page, tid: string, skipFirst = 0) {
  let played = skipFirst;
  for (let guard = 0; guard < 40; guard++) {
    const m = await nextOpen(tid);
    if (!m) break;
    await enterFinalByHand(page, m, 2, 1);
    played++;
  }
  return played;
}
