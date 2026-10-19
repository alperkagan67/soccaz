import { expect, test, type Page } from "@playwright/test";
import { createTeam, futureLocal, newUser, run, closeContexts } from "./helpers";

async function createRequest(page: Page, team: string, startsAt: string, opts: { visibility?: string; duration?: string } = {}) {
  await page.goto("/app/suche/neu");
  await page.getByLabel("Team", { exact: true }).selectOption({ label: team });
  await page.getByLabel(/Anstoß/).fill(startsAt);
  if (opts.duration) await page.getByLabel("Dauer").selectOption(opts.duration);
  if (opts.visibility) await page.getByLabel("Sichtbarkeit").selectOption(opts.visibility);
  await page.getByRole("button", { name: "Spielsuche erstellen" }).click();
}

test.describe.configure({ mode: "serial" });

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Spielsuche erstellen, in der Liste finden, annehmen, Lobby", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();

  await newUser(a, "ra");
  await newUser(b, "rb");
  await newUser(c, "rc");
  const teamA = `Alpha ${run}`;
  const teamB = `Beta ${run}`;
  const teamC = `Gamma ${run}`;
  await createTeam(a, teamA);
  await createTeam(b, teamB);
  await createTeam(c, teamC);

  // Zeitprüfung 1: der Browser blockiert zu frühe Zeiten schon im Formular
  await createRequest(a, teamA, futureLocal(0, "23:59"));
  await expect(a).toHaveURL(/\/app\/suche\/neu/);
  const tooEarly = await a.getByLabel(/Anstoß/).evaluate((el) => (el as HTMLInputElement).validity.rangeUnderflow);
  expect(tooEarly).toBe(true);

  // Zeitprüfung 2: auch der Server lehnt weniger als 24 Stunden ab (Formularschutz umgangen)
  await a.getByLabel(/Anstoß/).evaluate((el) => {
    el.removeAttribute("min");
    el.removeAttribute("step");
  });
  await a.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(a.getByText(/mindestens 24 Stunden/).first()).toBeVisible();

  // Gültige Suche
  await createRequest(a, teamA, futureLocal(10), { duration: "90" });
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const requestUrl = a.url();
  await expect(a.getByRole("heading", { name: new RegExp(`${teamA} sucht einen Gegner`) })).toBeVisible();
  // Eigentümer sieht Zurückziehen, nicht Annehmen
  await expect(a.getByRole("button", { name: "Spielsuche zurückziehen" })).toBeVisible();

  // Doppelte Zeit für dasselbe Team wird abgelehnt
  await createRequest(a, teamA, futureLocal(10, "20:30"));
  await expect(a.getByText(/schon eine Spielsuche oder ein Spiel/).first()).toBeVisible();

  // Liste zeigt die Suche, Filter greifen
  await b.goto("/suche");
  await expect(b.getByText(teamA)).toBeVisible();
  await b.goto("/suche?durationMin=60");
  await expect(b.getByText(teamA)).toHaveCount(0);
  await b.goto("/suche?durationMin=90");
  await expect(b.getByText(teamA)).toBeVisible();
  await b.goto(`/suche?date=${futureLocal(10).slice(0, 10)}`);
  await expect(b.getByText(teamA)).toBeVisible();

  // Team B und C öffnen die Seite; B nimmt an
  await b.goto(requestUrl);
  await c.goto(requestUrl);
  await expect(c.getByRole("button", { name: "Spiel annehmen" })).toBeVisible();
  await b.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
  await expect(b.getByRole("heading", { name: new RegExp(`${teamA}.*gegen.*${teamB}`) })).toBeVisible();
  await expect(b.getByText("Spieler ra").first()).toBeVisible();
  await expect(b.getByText("Spieler rb").first()).toBeVisible();

  // C war zu langsam
  await c.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(c.getByText(/nicht mehr offen/)).toBeVisible();

  // Liste zeigt die Suche nicht mehr
  await c.goto("/suche");
  await expect(c.locator('[data-kind="search"]').filter({ hasText: teamA })).toHaveCount(0); // aus der Suche ist die Lobby geworden
});

test("zwei Teams nehmen gleichzeitig an: genau eines gewinnt", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();
  await newUser(a, "sa");
  await newUser(b, "sb");
  await newUser(c, "sc");
  await createTeam(a, `Sigma ${run}`);
  await createTeam(b, `Tau ${run}`);
  await createTeam(c, `Upsilon ${run}`);

  await createRequest(a, `Sigma ${run}`, futureLocal(12));
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();
  await b.goto(url);
  await c.goto(url);
  await Promise.all([
    b.getByRole("button", { name: "Spiel annehmen" }).click(),
    c.getByRole("button", { name: "Spiel annehmen" }).click(),
  ]);
  await expect.poll(async () => [b.url(), c.url()].filter((u) => /\/lobby\//.test(u)).length, { timeout: 15_000 }).toBe(1);
  const loser = /\/lobby\//.test(b.url()) ? c : b;
  await expect(loser.getByText(/nicht mehr offen/)).toBeVisible();
});

test("Spielsuche zurückziehen und private Suche", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "pa");
  await newUser(b, "pb");
  await createTeam(a, `Phi ${run}`);
  await createTeam(b, `Chi ${run}`);

  // privat: nicht in der Liste, aber über Link erreichbar
  await createRequest(a, `Phi ${run}`, futureLocal(14), { visibility: "private" });
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();
  await b.goto("/suche");
  await expect(b.getByText(`Phi ${run}`)).toHaveCount(0);
  await b.goto(url);
  await expect(b.getByText("Private Spielsuche")).toBeVisible();

  // zurückziehen
  a.once("dialog", (d) => d.accept());
  await expect(async () => {
    await a.getByRole("button", { name: "Spielsuche zurückziehen" }).click();
    await expect(a).toHaveURL(/\/app$/, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
  await b.goto(url);
  await expect(b.getByText(/zurückgezogen/)).toBeVisible();
  await expect(b.getByRole("button", { name: "Spiel annehmen" })).toHaveCount(0);
});

test("ohne Team-Admin-Rechte nicht annehmbar", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const x = await (await browser.newContext()).newPage();
  await newUser(a, "oa");
  await newUser(x, "ox");
  await createTeam(a, `Omega ${run}`);
  await createRequest(a, `Omega ${run}`, futureLocal(16));
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  await x.goto(a.url());
  await expect(x.getByText(/Du brauchst ein eigenes Team/)).toBeVisible();
  await expect(x.getByRole("button", { name: "Spiel annehmen" })).toHaveCount(0);
});
