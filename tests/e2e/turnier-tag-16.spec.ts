import { expect, test } from "@playwright/test";
import { closeContexts } from "./helpers";
import { query } from "./helpers-db";
import {
  expectCleanPhonePage, forfeitOnPage, goalsThenAbpfiff, loginPhone, nextOpen, playToEnd, seedFreeTournament, seedOrganizer, seedTeam, waitDecided,
} from "./turnier-tag-helpers";

// Gratis-Turnier PR D, Obergrenze: 16 Teams auf dem Handy (390 px), davon 14 vollzählig, zwei NICHT. Der Veranstalter schließt die Anmeldung mit den 14 bereiten Teams, spielt bis zum Finale (Abpfiff, Kampflos, Rest von Hand).
// Eigene Datei (Laufzeit): alle Teams per SQL, Bedienung nur am Turniertag. Zahlungen AUS wie in Produktion.
test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Turniertag mit 16 Teams (14 bereit): Anmeldung schließen, Bracket, Abpfiff, Kampflos, Finale, Turnier beendet mit Sieger", async ({ browser }) => {
  const org = await seedOrganizer("tg16o");
  const t = await seedFreeTournament(org.id, "tg16", 16);
  const teams = [];
  for (let i = 1; i <= 16; i++) teams.push(await seedTeam(t.id, `tg16t${i}`, i <= 14));
  const page = await loginPhone(browser, org.email, org.name);

  // 14 von 16 bereit: genau eine Hauptaktion im Veranstalterkasten, kein Bracket bis zum Schließen
  await page.goto(`/turniere/${t.id}`);
  const box = page.getByTestId("organizer-box");
  await expect(box).toBeVisible({ timeout: 60_000 });
  const close = box.getByRole("button", { name: "Anmeldung schließen und mit den 14 bereiten Teams starten" });
  await expect(close).toHaveCount(1);
  expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(box.locator(".btn-primary")).toHaveCount(1);
  expect((await query("select 1 from tournament_matches where tournament_id = $1", [t.id])).length).toBe(0);
  await expectCleanPhonePage(page, "Turnierseite 16 Teams (Anmeldung)");
  page.once("dialog", (d) => void d.accept());
  await close.click();
  await expect.poll(async () => (await query("select 1 from tournament_matches where tournament_id = $1", [t.id])).length, { timeout: 60_000 }).toBe(13);
  // die zwei unvollzähligen Teams sind raus und bekommen eine Mitteilung ohne Namen Dritter
  const notice = await query<{ body: string }>("select n.body from notifications n where n.user_id = any($1) and n.title = 'Euer Team ist nicht dabei'", [[teams[14].captainId, teams[15].captainId]]);
  expect(notice).toHaveLength(2);
  for (const n of notice) for (const tm of teams) expect(n.body).not.toContain(tm.name);
  expect((await query("select 1 from tournament_teams where tournament_id = $1", [t.id])).length).toBe(14);

  // Spiel 1: Tore + Abpfiff; Spiel 2: kampflos; Rest von Hand bis zum Finale
  const m1 = (await nextOpen(t.id))!;
  await goalsThenAbpfiff(page, m1, 3, 2);
  await waitDecided(m1.id);
  const m2 = (await nextOpen(t.id))!;
  await forfeitOnPage(page, t.id, m2, m2.nb);
  const played = await playToEnd(page, t.id, 2);
  expect(played).toBe(13);
  await expect.poll(async () => (await query<{ status: string }>("select status from tournaments where id = $1", [t.id]))[0].status, { timeout: 30_000 }).toBe("finished");
  await page.goto(`/turniere/${t.id}`);
  await expect(page.getByTestId("winner")).toContainText("Turniersieger", { timeout: 30_000 });
  await expectCleanPhonePage(page, "Turnierseite 16 Teams (beendet)");
});
