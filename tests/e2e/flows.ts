import { expect, type Browser, type Locator, type Page } from "@playwright/test";
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
  await acceptChallenge(b);
  const matchId = matchIdFromUrl(b.url());
  await a.goto(`/lobby/${matchId}`);
  return { a, b, matchId, nameA, nameB };
}

/**
 * "Spiel annehmen" bis zur Lobby, mit Wiederholung: Das Formular hat nur einen onSubmit-Handler (kein action). Ein Klick VOR der Hydration schickt es nativ als GET (Adresse bekommt ?teamId=...) und die Seite
 * bleibt auf der Suche; erst der zweite Klick ruft die Server-Aktion. Ein pending-Button ist deaktiviert (kein Doppelklick auf eine laufende Annahme).
 */
export async function acceptChallenge(page: Page) {
  await expect(async () => {
    if (!/\/lobby\/[0-9a-f-]{36}$/.test(page.url())) await page.getByRole("button", { name: "Spiel annehmen" }).click({ timeout: 3_000 });
    await expect(page).toHaveURL(/\/lobby\/[0-9a-f-]{36}$/, { timeout: 4_000 });
  }).toPass({ timeout: 25_000 });
}

/**
 * Wartet, bis React das Element übernommen hat (Hydration). Vor der Hydration löst ein Klick auf einen Absenden-Knopf das native Absenden aus (GET, Seite lädt neu) und die Server-Aktion läuft nie.
 * Keine Wiederholung des Klicks: für Stellen, an denen ein zweiter Klick das Ergebnis verfälschen würde (gleichzeitiger Doppelklick, Erwartung "nicht mehr offen").
 */
export async function waitHydrated(target: Locator) {
  // 20 s: Kaltstart des Dev-Servers; geprüft wird der Knopf UND sein Formular (bei zeitgeteilter Hydration kann der Knopf vor dem Formular übernommen sein)
  await expect(target).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => target.evaluate((el) => {
      const hydrated = (x: Element | null) => x === null || Object.keys(x).some((k) => k.startsWith("__reactProps"));
      return hydrated(el) && hydrated(el.closest("form"));
    }), { timeout: 20_000 })
    .toBe(true);
}

/**
 * Klick auf einen Link bis zur Zieladresse, mit Wiederholung (Flake-Familie 223, Backlog 238): Ein einzelner Klick mit 5 s Wartegrenze scheitert, wenn der Dev-Server die Zielseite kalt baut oder der Klick in die Hydration fällt.
 * Ein erneuter Klick auf einen Link ist harmlos (keine Server-Aktion); geklickt wird nur, solange die Zieladresse noch nicht erreicht ist.
 */
export async function clickLinkUntilUrl(page: Page, link: Locator, url: RegExp) {
  await expect(async () => {
    if (!url.test(page.url())) await link.click({ timeout: 3_000 });
    await expect(page).toHaveURL(url, { timeout: 4_000 });
  }).toPass({ timeout: 25_000 });
}

/**
 * Klick auf einen Knopf, nachdem React ihn übernommen hat (Flake-Familie 223, Backlog 241). Knöpfe mit onClick (Lobby: beitreten, Ersatzspieler, bereit; Ergebnis: Tor) tun vor der Hydration NICHTS: der Klick geht verloren, ein Warten auf die Folge (5 s) scheitert.
 * waitHydrated prüft Sichtbarkeit (20 s, Kaltstart) und Hydration des Knopfs und seines Formulars; geklickt wird einmal (kein zweiter Klick auf Knöpfe, die etwas auslösen).
 */
export async function clickWhenReady(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });
  await waitHydrated(button);
  await button.click();
}
