import { expect, test, type Browser } from "@playwright/test";
import { closeContexts, run } from "./helpers";
import { query } from "./helpers-db";
import { expectCleanPhonePage, loginPhone, phonePage, seedFreeTournament, seedOrganizer, seedTeam } from "./turnier-tag-helpers";
import { knockout } from "@/lib/tournament";

// Papier-Fallback (t2q Option B): /turniere/<id>/druck = Tabelle ALLER Spiele mit leerem Ergebnisfeld + Bracket-Übersicht, hell, Querformat, ohne Kopf/Menü/Knöpfe, druckt OHNE JavaScript, noindex.
// Zugang wie die Turnierseite: öffentlich = jeder; PRIVAT nur mit gültigem Token oder als Veranstalter; sonst die neutrale Seite (kein Teamname, kein Turnierinhalt).
test.setTimeout(180_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function seedPlan(key: string, isPrivate: boolean) {
  const org = await seedOrganizer(key);
  const t = await seedFreeTournament(org.id, key, 4);
  const teams = [];
  for (let i = 0; i < 4; i++) teams.push(await seedTeam(t.id, `${key}${i}`, true));
  await query("update tournaments set status = 'running', bracket_generated_at = now(), starts_at = now() + interval '2 hours', registration_deadline = now() - interval '5 days', is_private = $2, invite_token = $3 where id = $1", [t.id, isPrivate, isPrivate ? `tok-${key}-${run}` : null]);
  const fixtures = knockout(teams.map((x) => x.teamId));
  const idOf = new Map<string, string>();
  const k = (s: { stage: string; round: number; slot: number }) => `${s.stage}|${s.round}|${s.slot}`;
  for (const f of fixtures) idOf.set(k(f), (await query<{ id: string }>("insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b) values ($1, $2, $3, $4, $5, $6) returning id", [t.id, f.stage, f.round, f.slot, f.a, f.b]))[0].id);
  for (const f of fixtures) if (f.feeds) await query("update tournament_matches set feeds_match_id = $1, feeds_side = $2 where id = $3", [idOf.get(k(f.feeds)), f.feeds.side, idOf.get(k(f))]);
  return { org, t, teams, token: isPrivate ? `tok-${key}-${run}` : null };
}

async function ohneJs(browser: Browser) {
  return (await browser.newContext({ javaScriptEnabled: false })).newPage();
}

test("öffentliches Turnier: Gast sieht Tabelle aller Spiele und Bracket, auch OHNE JavaScript; hell, noindex, ohne Kopf im Druck", async ({ browser }) => {
  const { t, teams } = await seedPlan("dr1", false);
  const page = await ohneJs(browser);
  await page.goto(`/turniere/${t.id}/druck`);
  await expect(page.getByTestId("druck-titel")).toContainText(`${t.name}: Spielplan`);
  // 4 Teams: 2 Halbfinals + Finale + Spaßspiel = 4 Zeilen in der Tabelle
  const zeilen = page.getByTestId("druck-spiel");
  await expect(zeilen).toHaveCount(4);
  const text = (await page.getByTestId("druck-tabelle").textContent()) ?? "";
  expect(text).toContain(teams[0].name);
  expect(text).toContain(teams[3].name);
  expect(text).toContain("____ : ____"); // leeres Ergebnisfeld zum Ausfüllen
  expect(text).toContain("GG ["); // Platz für Golden Goal / Neunmeter
  await expect(page.getByTestId("druck-bracket-spiel")).toHaveCount(3); // 2 Halbfinals + Finale
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  // Druck-Ansicht: Kopf, Menü und Fußzeile weg, schwarz auf weiß (auch bei dunklem Gerät)
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await expect(page.locator("body > header")).toBeHidden();
  await expect(page.locator("body > footer")).toBeHidden();
  const farben = await page.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color }));
  expect(farben).toEqual({ bg: "rgb(255, 255, 255)", fg: "rgb(0, 0, 0)" });
  const css = await page.evaluate(() => [...document.querySelectorAll("style")].map((s) => s.textContent).join(" "));
  expect(css).toContain("size: A4 landscape");
});

test("Veranstalter: Knopf 'Spielplan drucken' auf der Turnierseite (Handy, 44 px), Gast sieht ihn nicht", async ({ browser }) => {
  const { org, t } = await seedPlan("dr2", false);
  const page = await loginPhone(browser, org.email, org.name);
  await page.goto(`/turniere/${t.id}`);
  const knopf = page.getByTestId("druck-link");
  await expect(knopf).toBeVisible({ timeout: 30_000 });
  expect((await knopf.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(knopf).toHaveAttribute("href", `/turniere/${t.id}/druck`);
  await page.goto(`/turniere/${t.id}/druck`);
  await expectCleanPhonePage(page, "Druckseite (Veranstalter)");
  const gast = await phonePage(browser);
  await gast.goto(`/turniere/${t.id}`);
  await expect(gast.getByTestId("druck-link")).toHaveCount(0);
});

test("PRIVATES Turnier: ohne Token neutrale Seite ohne Teamnamen; mit gültigem Token und als Veranstalter die Tabelle", async ({ browser }) => {
  const { org, t, teams, token } = await seedPlan("dr3", true);
  const gast = await phonePage(browser);
  await gast.goto(`/turniere/${t.id}/druck`);
  await expect(gast.getByTestId("einladung-ungueltig")).toBeVisible();
  expect(await gast.content()).not.toContain(teams[0].name); // kein Existenz-Orakel, kein Inhalt
  await gast.goto(`/turniere/${t.id}/druck?t=falsch-${run}`);
  await expect(gast.getByTestId("einladung-ungueltig")).toBeVisible();
  await gast.goto(`/turniere/${t.id}/druck?t=${token}`);
  await expect(gast.getByTestId("druck-tabelle")).toContainText(teams[0].name);
  const veranst = await loginPhone(browser, org.email, org.name);
  await veranst.goto(`/turniere/${t.id}/druck`); // Veranstalter braucht keinen Token
  await expect(veranst.getByTestId("druck-tabelle")).toContainText(teams[1].name);
  await veranst.goto(`/turniere/${t.id}`);
  await expect(veranst.getByTestId("druck-link")).toHaveAttribute("href", `/turniere/${t.id}/druck`); // privat, Veranstalter: Link ohne Token nötig
});

test("Turnier ohne Spielplan (Anmeldung läuft): Hinweis statt Tabelle", async ({ browser }) => {
  const org = await seedOrganizer("dr4");
  const t = await seedFreeTournament(org.id, "dr4", 4);
  const gast = await phonePage(browser);
  await gast.goto(`/turniere/${t.id}/druck`);
  await expect(gast.getByTestId("druck-noch-kein-plan")).toBeVisible();
  await expect(gast.getByTestId("druck-tabelle")).toHaveCount(0);
});
