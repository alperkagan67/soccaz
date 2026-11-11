import { expect, test } from "@playwright/test";
import { addTeamMember, closeContexts, closeTestDb, createTeam, devLogin, newUser, run, seedUser, teamIdByName, testDb } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(closeTestDb);

test("Teamfarbe: Admin wählt aus genau 12 Farben, Nicht-Admin sieht die Auswahl nicht", async ({ browser }) => {
  const name = `FC Farbe ${run}`;
  const a = await (await browser.newContext()).newPage();
  await newUser(a, "farbe-admin");
  await createTeam(a, name);

  // Standardfarbe aus dem Slug, Auswahl im Bereich "Team verwalten"
  await expect(a.getByTestId("team-color-dot").first()).toHaveAttribute("data-color", /.+/);
  await a.getByTestId("team-settings").locator("summary").click();
  const picker = a.getByTestId("team-color-picker");
  await expect(picker.getByRole("radio")).toHaveCount(12);
  await expect(picker.getByRole("radio", { name: "Orange" })).toHaveCount(0);
  await expect(picker.locator("input[type=text], input[type=color]")).toHaveCount(0); // keine freie Eingabe

  // wiederholen, bis die Seite hydriert ist
  await expect(async () => {
    await picker.getByRole("radio", { name: "Himmelblau" }).click();
    await expect(picker.getByRole("radio", { name: "Himmelblau" })).toHaveAttribute("aria-checked", "true", { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await a.reload();
  await expect(a.getByTestId("team-color-dot").first()).toHaveAttribute("data-color", "skyblue");
  const { rows } = await testDb().query("select color from teams where name = $1", [name]);
  expect(rows[0].color).toBe("skyblue");

  // Mitglied ohne Admin-Rolle und Fremde sehen die Auswahl nicht, die Farbe aber schon
  const memberId = await seedUser("farbe-member");
  await addTeamMember(await teamIdByName(name), memberId);
  const slug = new URL(a.url()).pathname;
  const m = await (await browser.newContext()).newPage();
  await devLogin(m, `farbe-member-${run}@test.local`, "Spieler farbe-member");
  await m.goto(slug);
  await expect(m.getByTestId("team-color-dot").first()).toHaveAttribute("data-color", "skyblue");
  await expect(m.getByTestId("team-color-picker")).toHaveCount(0);
  await expect(m.getByTestId("team-settings")).toHaveCount(0);

  // Gast: nur die Farbmarke
  const g = await (await browser.newContext()).newPage();
  await g.goto(slug);
  await expect(g.getByTestId("team-color-dot").first()).toHaveAttribute("data-color", "skyblue");
  await expect(g.getByTestId("team-color-picker")).toHaveCount(0);
});
