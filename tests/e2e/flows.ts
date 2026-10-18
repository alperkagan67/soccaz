import { expect, type Browser, type Page } from "@playwright/test";
import { createTeam, futureLocal, matchIdFromUrl, newUser, run } from "./helpers";

/** Zwei Teams, A sucht, B nimmt an. Gibt beide Seiten (jeweils in der Lobby), die Match-ID und die Teamnamen zurück. */
export async function setupLobby(browser: Browser, key: string, visibility: "public" | "private" = "public") {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, `${key}a`);
  await newUser(b, `${key}b`);
  const nameA = `${key.toUpperCase()}-Heim ${run}`;
  const nameB = `${key.toUpperCase()}-Gast ${run}`;
  await createTeam(a, nameA);
  await createTeam(b, nameB);

  await a.goto("/app/suche/neu");
  await a.getByLabel("Team", { exact: true }).selectOption({ label: nameA });
  await a.getByLabel(/Anstoß/).fill(futureLocal(20));
  await a.getByLabel("Sichtbarkeit").selectOption(visibility);
  await a.getByRole("button", { name: "Spielsuche erstellen" }).click();
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);

  await b.goto(a.url());
  await b.getByRole("button", { name: "Spiel annehmen" }).click();
  await expect(b).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/);
  const matchId = matchIdFromUrl(b.url());
  await a.goto(`/lobby/${matchId}`);
  return { a, b, matchId, nameA, nameB };
}

export async function clickWhenReady(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });
  await expect(button).toBeVisible();
  await button.click();
}
