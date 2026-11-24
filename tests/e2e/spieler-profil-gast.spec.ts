import { expect, test } from "@playwright/test";
import { closeContexts, closeTestDb, newUser, run, seedUser } from "./helpers";

// AC-17 (Entscheid t2q 2026-11-24), PR D: Spielerprofil /spieler/[id]: Gäste werden zur Anmeldung geleitet (mit Rücksprung), im Head, im HTML und in der RSC-Nutzlast steht kein Name; nie indexierbar; nicht in der Sitemap.
test.describe.configure({ mode: "serial" });
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

const NAME = `Zorro Vollname${run}`;

test("Profil für Gäste: Weiterleitung zur Anmeldung ohne Namen im Text; Angemeldete sehen Name im Titel; noindex, robots und Sitemap", async ({ browser }) => {
  const id = await seedUser("kpg", NAME);
  const url = `/spieler/${id}`;
  const gast = await (await browser.newContext()).newPage();

  // ohne Weiterleitung zu folgen: Next leitet (nach dem Streamstart) im Browser weiter, der Text nennt das Ziel; kein Name und keine Profildaten im ausgelieferten Text
  // (Eine RSC-Anfrage ohne den Router-Zustand des Browsers leitet Next selbst um; die Gast-Weiterleitung vor dem Laden des Profils belegt der Unit-Test spieler-profil-gast.)
  const res = await gast.request.get(url, { maxRedirects: 0 });
  const text = await res.text();
  expect(`${res.headers()["location"] ?? ""} ${text}`, "Ziel Anmeldung").toMatch(/anmelden/);
  expect(text, "Name im Gast-Text").not.toContain(NAME);
  expect(text, "Nachname im Gast-Text").not.toContain("Vollname");
  expect(text, "Profil-Inhalt im Gast-Text").not.toContain("Siegquote");

  // im Browser: Anmeldeseite, Titel ohne Namen, nach der Anmeldung Rücksprung auf das Profil
  await gast.goto(url);
  await expect(gast).toHaveURL(new RegExp("/anmelden"));
  expect(await gast.title()).not.toContain("Zorro");
  expect(await gast.content()).not.toContain(NAME);

  // Angemeldet: der Name steht im Titel, die Seite ist noindex
  const spieler = await (await browser.newContext()).newPage();
  await newUser(spieler, "kpgsp");
  await spieler.goto(url);
  await expect(spieler.getByRole("heading", { name: NAME })).toBeVisible();
  expect(await spieler.title()).toContain(NAME);
  await expect(spieler.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  // robots.txt sperrt /spieler/ (die Liste /spieler bleibt erlaubt), die Sitemap nennt keine Profile
  const robots = await (await spieler.request.get("/robots.txt")).text();
  expect(robots).toMatch(/Disallow: \/spieler\//);
  const sitemap = await (await spieler.request.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/spieler/");
  expect(sitemap).not.toContain(id);
});
