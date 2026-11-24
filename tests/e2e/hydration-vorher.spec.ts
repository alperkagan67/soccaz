import { expect, test, type Page, type Route } from "@playwright/test";
import { closeContexts, devLogin, run } from "./helpers";
import { clickWhenReady, setupLobby } from "./flows";
import { seedAdmin, startMatchNow } from "./helpers-db";

// Backlog 224 (Formulare vor der Hydration): Probe für die Browser-Handler-Formulare (LobbyClient, MatchClient, Assistent; CardForm/Stripe steht auf der Ausnahmeliste des Wächters).
// Geprüft wird (t2q): ein Klick vor der Hydration geht nie verloren und sendet nie GET mit Feldern in der Adresse. "Vor der Hydration" wird hergestellt, indem die Skripte der Seite
// (/_next/static/**/*.js) zurückgehalten werden: die Seite steht als HTML da, React ist noch nicht aktiv. Das ist die Bedingung des Messpunkts "Knopf vor der Hydration" (Plan 6a, Vorprobe F4).
// Abdeckung der 7 Browser-Handler-Formulare (Wächter forms-action.test.ts): im Server-HTML erreichbar und hier geprüft sind VenueForm (Lobby), SubmitResultForm und DecidePanel (Spiel) und der Assistent;
// erst nach einem Klick im Browser entstehen CancelForm (Lobby) und das Widerspruchsformular (ConfirmPanel): vor der Hydration gibt es sie nicht, ein Klick darauf ist nicht möglich; CardForm/Stripe steht auf der
// Ausnahmeliste (Knopf gesperrt, bis Stripe geladen ist; im Fake-Pfad der Tests gibt es kein Formular).
test.setTimeout(240_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const SKRIPTE = /\/_next\/static\/.*\.js(\?.*)?$/;

/** Hält alle Skripte der Seite zurück (Seite = nur HTML); release() lässt sie los und hebt die Sperre auf. */
async function haltSkripte(page: Page) {
  const gehalten: Route[] = [];
  await page.route(SKRIPTE, (route) => {
    gehalten.push(route);
  });
  return async () => {
    await page.unroute(SKRIPTE);
    for (const r of gehalten.splice(0)) await r.continue().catch(() => undefined);
  };
}

type FormInfo = { name: string; method: string; hasAction: boolean; gesperrt: boolean; busy: boolean; fieldsetGesperrt: boolean };

/** Alle Formulare der Seite (nur Server-HTML): Server-Aktion (Progressive Enhancement) erkennt man am versteckten $ACTION-Feld. */
const formulare = (page: Page): Promise<FormInfo[]> =>
  page.evaluate(() =>
    [...document.forms].map((f) => {
      const knoepfe = [...f.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button:not([type=button]), input[type=submit]")];
      return {
        name: f.getAttribute("data-testid") || f.getAttribute("aria-label") || f.className.slice(0, 40) || "form",
        method: (f.getAttribute("method") || "").toLowerCase(),
        hasAction: Boolean(f.querySelector('input[name^="$ACTION"]')) || (f.hasAttribute("action") && !/^javascript:/i.test(f.getAttribute("action") || "")),
        gesperrt: knoepfe.length > 0 && knoepfe.every((b) => b.matches(":disabled")),
        busy: f.getAttribute("aria-busy") === "true",
        fieldsetGesperrt: Boolean(f.querySelector("fieldset:disabled")),
      };
    }),
  );

/**
 * Vor der Hydration: jedes Formular OHNE Server-Aktion ist method=post und hat alle Absende-Knöpfe gesperrt (oder ein gesperrtes fieldset), sonst ginge ein Klick als GET mit Feldern in die Adresse
 * oder verloren. Danach (Skripte los): die Seite wird aktiv (aria-busy weg, fieldset frei) und es bleibt bei EINER Adresse ohne Query.
 */
async function pruefeSeite(page: Page, url: string, name: string, mindestens: number) {
  const anfragen: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "document" && r.method() === "GET") anfragen.push(r.url());
  });
  const freigabe = await haltSkripte(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const vorher = await formulare(page);
  const ohneAktion = vorher.filter((f) => !f.hasAction && f.method !== "get"); // ausdrückliche Filter-Formulare (method=get) sind gewollt
  expect(ohneAktion.length, `${name}: Formulare ohne Server-Aktion gefunden (Vakuum-Schutz)`).toBeGreaterThanOrEqual(mindestens);
  for (const f of ohneAktion) {
    // Weg 1 (LobbyClient, MatchClient): method=post und alle Absende-Knöpfe gesperrt; Weg 2 (Assistent): alle Felder und Knöpfe in einem gesperrten fieldset
    const sicher = (f.method === "post" && f.gesperrt) || f.fieldsetGesperrt;
    expect(sicher, `${name}: "${f.name}" ohne Server-Aktion muss vor der Hydration gesperrt sein (method=post + gesperrte Knöpfe oder gesperrtes fieldset), gefunden: ${JSON.stringify(f)}`).toBe(true);
  }
  // ein erzwungenes Absenden vor der Hydration (Enter, Skript) darf nie als GET mit Feldern in der Adresse enden
  if (ohneAktion.length > 0) {
    await page.evaluate(() => {
      const f = [...document.forms].find((x) => !x.querySelector('input[name^="$ACTION"]') && (x.getAttribute("method") || "").toLowerCase() !== "get");
      if (f) f.requestSubmit();
    });
    await page.waitForTimeout(1_000);
  }
  for (const a of anfragen) expect(new URL(a).search, `${name}: keine GET-Anfrage mit Query nach dem Absenden (${a})`).toBe("");
  test.info().annotations.push({ type: `Formulare ${name}`, description: ohneAktion.map((f) => `${f.name} (${f.method || "-"}, ${f.gesperrt ? "Knöpfe gesperrt" : "fieldset gesperrt"})`).join("; ") });
  await freigabe();
  // nach der Hydration: die Seite wird aktiv (aria-busy weg, kein gesperrtes fieldset): ein Klick danach geht durch (Aktionen selbst prüfen die Fach-Specs)
  await expect.poll(async () => (await formulare(page)).filter((f) => f.busy || f.fieldsetGesperrt).length, { message: `${name}: Hydration wird nicht aktiv`, timeout: 30_000 }).toBe(0);
}

test("Lobby und Spiel: Formulare vor der Hydration gesperrt und method=post, kein GET mit Feldern", async ({ browser }) => {
  const { a, matchId } = await setupLobby(browser, "hy1");
  await pruefeSeite(await (await browser.newContext({ storageState: await a.context().storageState() })).newPage(), `/lobby/${matchId}`, "Lobby", 1);
  await startMatchNow(matchId);
  await pruefeSeite(await (await browser.newContext({ storageState: await a.context().storageState() })).newPage(), `/spiele/${matchId}`, "Spiel", 1);
});

test("Spieler-Assistent (/willkommen): Felder und Knöpfe vor der Hydration gesperrt, kein GET mit Feldern", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await devLogin(page, `hy2-${run}@test.local`, "Spieler hy2");
  await page.waitForURL(/\/willkommen/, { timeout: 90_000 });
  await pruefeSeite(await (await browser.newContext({ storageState: await page.context().storageState() })).newPage(), "/willkommen", "Assistent", 1);
});

test("Ergebnis-Phasen (Melden, Bestätigen/Widersprechen, Plattform-Entscheidung): Formulare vor der Hydration gesperrt, kein GET mit Feldern", async ({ browser }) => {
  const { a, b, matchId, nameA, nameB } = await setupLobby(browser, "hy3");
  await startMatchNow(matchId);
  const frisch = async (seite: Page) => (await browser.newContext({ storageState: await seite.context().storageState() })).newPage();
  await a.goto(`/spiele/${matchId}`);
  await pruefeSeite(await frisch(a), `/spiele/${matchId}`, "Ergebnis melden (SubmitResultForm)", 1);
  // Ergebnis melden, Gegner widerspricht: danach entscheidet die Plattform (DecidePanel)
  await expect(async () => {
    await a.getByLabel(nameA, { exact: true }).fill("3");
    await a.getByLabel(nameB, { exact: true }).fill("2");
    await a.getByRole("button", { name: "Ergebnis melden" }).click();
    await expect(a.getByText(/Gemeldetes Ergebnis/)).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 25_000 });
  await b.goto(`/spiele/${matchId}`);
  await expect(b.getByRole("button", { name: "Widersprechen" })).toBeVisible({ timeout: 15_000 });
  await pruefeSeite(await frisch(b), `/spiele/${matchId}`, "Bestätigen/Widersprechen (ConfirmPanel)", 0);
  await clickWhenReady(b, "Widersprechen");
  await b.getByLabel(/Warum stimmt das Ergebnis nicht/).fill("Wir haben 2:1 gewonnen");
  await clickWhenReady(b, "Widerspruch senden");
  await expect(b.getByText("Das Ergebnis ist strittig").first()).toBeVisible();
  await seedAdmin("hy3adm");
  const adm = await (await browser.newContext()).newPage();
  await devLogin(adm, `hy3adm-${run}@test.local`, "Admin hy3adm", `/spiele/${matchId}`);
  await expect(adm.getByText("Plattform-Entscheidung")).toBeVisible();
  await pruefeSeite(await frisch(adm), `/spiele/${matchId}`, "Plattform-Entscheidung (DecidePanel)", 1);
});
