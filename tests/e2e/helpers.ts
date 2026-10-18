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
