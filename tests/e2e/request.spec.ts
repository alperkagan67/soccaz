import { expect, test, type Page } from "@playwright/test";
import { createTeam, futureLocal, newUser, run, closeContexts, testDb } from "./helpers";
import { acceptChallenge, waitHydrated } from "./flows";

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
  await expect(b.getByText(teamA).first()).toBeVisible();
  await b.goto("/suche?durationMin=60");
  await expect(b.getByText(teamA)).toHaveCount(0);
  await b.goto("/suche?durationMin=90");
  await expect(b.getByText(teamA).first()).toBeVisible();
  await b.goto(`/suche?date=${futureLocal(10).slice(0, 10)}`);
  await expect(b.getByText(teamA).first()).toBeVisible();

  // Team B und C öffnen die Seite; B nimmt an
  await b.goto(requestUrl);
  await c.goto(requestUrl);
  await expect(c.getByRole("button", { name: "Spiel annehmen" })).toBeVisible();
  await acceptChallenge(b);
  await expect(b.getByRole("heading", { name: new RegExp(`${teamA}.*gegen.*${teamB}`) })).toBeVisible();
  await expect(b.getByText("Spieler ra").first()).toBeVisible();
  await expect(b.getByText("Spieler rb").first()).toBeVisible();

  // C war zu langsam
  // keine Lobby-Erwartung (die Annahme scheitert): erst nach der Hydration klicken, kein Wiederholen
  await waitHydrated(c.getByRole("button", { name: "Spiel annehmen" }));
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
  // beide Knöpfe erst nach der Hydration, dann gleichzeitig klicken (kein Wiederholen: der Wettlauf ist der Test)
  await Promise.all([waitHydrated(b.getByRole("button", { name: "Spiel annehmen" })), waitHydrated(c.getByRole("button", { name: "Spiel annehmen" }))]);
  await Promise.all([
    b.getByRole("button", { name: "Spiel annehmen" }).click(),
    c.getByRole("button", { name: "Spiel annehmen" }).click(),
  ]);
  await expect.poll(async () => [b.url(), c.url()].filter((u) => /\/lobby\//.test(u)).length, { timeout: 15_000 }).toBe(1);
  const loser = /\/lobby\//.test(b.url()) ? c : b;
  await expect(loser.getByText(/nicht mehr offen/)).toBeVisible();
});

// Formulare vor der Hydration (Backlog 223/224): Ein Klick auf "Spiel annehmen", bevor die Seite hydriert ist, darf weder verloren gehen noch das Formular als GET mit Query senden. Das Formular hat dafür `action`
// (Server-Aktion, Progressive Enhancement). Geprüft wird, was der Browser VOR der Hydration tut: er sendet die Felder des vom Server gelieferten Formulars nativ als POST (ohne JavaScript, ohne Hydration). Die Seite
// selbst erscheint ohne JavaScript nur als "Lädt…" (Suspense), deshalb wird das Server-HTML per Anfrage gelesen und das Absenden nachgestellt.
test("Spiel annehmen vor der Hydration: das Formular sendet nativ POST an die Server-Aktion, genau eine Annahme", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "fpa");
  await newUser(b, "fpb");
  await createTeam(a, `FP-Heim ${run}`);
  await createTeam(b, `FP-Gast ${run}`);
  await createRequest(a, `FP-Heim ${run}`, futureLocal(14));
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();

  const html = await (await b.context().request.get(url)).text();
  const at = html.indexOf(">Spiel annehmen</button>"); // der Knopf selbst (nicht irgendein Text "Spiel annehmen")
  expect(at).toBeGreaterThan(0);
  const form = html.slice(html.lastIndexOf("<form", at), html.indexOf("</form>", at)); // das Formular, das diesen Knopf enthält
  expect(form).toMatch(/^<form[^>]*\bmethod="POST"/); // nicht GET (Standard ohne action)
  expect(form).not.toContain("javascript:throw"); // Platzhalter einer Client-Funktion ohne Server-Aktion
  const fields: Record<string, string> = {};
  for (const m of form.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)) fields[m[1]] = (m[2] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  expect(Object.keys(fields).some((k) => k.startsWith("$ACTION_"))).toBe(true); // Kennung der Server-Aktion
  expect(fields.teamId).toMatch(/^[0-9a-f-]{36}$/);

  // Absenden wie der Browser vor der Hydration: multipart POST an dieselbe Adresse, Weiterleitung zur Lobby
  const post = await b.context().request.post(url, { multipart: fields });
  expect(post.url()).toMatch(/\/lobby\/[0-9a-f-]{36}$/);
  // zweites Absenden (zum Beispiel doppelter Klick): keine zweite Annahme
  const again = await b.context().request.post(url, { multipart: fields });
  expect(again.url()).not.toMatch(/\/lobby\//);
  expect(await again.text()).toMatch(/nicht mehr offen/);
});

// Nach der Hydration bleibt es beim bisherigen Weg (onSubmit, kein zweiter Aufruf durch das neue action-Attribut): genau EINE Annahme je Suche.
test("Spiel annehmen nach der Hydration: genau eine Annahme (ein Spiel zur Suche)", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "fpe");
  await newUser(b, "fpf");
  await createTeam(a, `FE-Heim ${run}`);
  await createTeam(b, `FE-Gast ${run}`);
  await createRequest(a, `FE-Heim ${run}`, futureLocal(15));
  await expect(a).toHaveURL(/\/suche\/([0-9a-f-]{36})$/);
  const requestId = a.url().split("/").pop();
  await b.goto(a.url());
  await acceptChallenge(b);
  const { rows } = await testDb().query("select count(*)::int as n from matches where request_id = $1", [requestId]);
  expect(rows[0].n).toBe(1);
});

// Bei einem Fehler bleiben die Eingaben erhalten (der Grund für onSubmit statt reinem action-Attribut): die gewählte Mannschaft steht nach "nicht mehr offen" weiter im Feld.
test("Spiel annehmen mit Teamwahl: nach einem Fehler bleibt die gewählte Mannschaft", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const c = await (await browser.newContext()).newPage();
  await newUser(a, "fpg");
  await newUser(b, "fph");
  await newUser(c, "fpi");
  await createTeam(a, `FG-Heim ${run}`);
  await createTeam(b, `FG-Gast1 ${run}`);
  await createTeam(b, `FG-Gast2 ${run}`);
  await createTeam(c, `FG-Dritte ${run}`);
  await createRequest(a, `FG-Heim ${run}`, futureLocal(16));
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();
  await b.goto(url);
  const team = b.getByLabel("Mit welchem Team?");
  await expect(team).toBeVisible();
  await c.goto(url);
  await acceptChallenge(c); // c nimmt zuerst an: die Suche ist danach nicht mehr offen
  await team.selectOption({ label: `FG-Gast2 ${run}` });
  const chosen = await team.inputValue();
  const button = b.getByRole("button", { name: "Spiel annehmen" });
  await waitHydrated(button); // hydriert: sonst ginge der Klick nativ
  await button.click();
  await expect(b.getByText(/nicht mehr offen/)).toBeVisible();
  await expect(team).toHaveValue(chosen);
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

test("Gast sieht keine Namen in der Spielsuche (Payload-Ebene)", async ({ browser, request }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await newUser(a, "ga");
  await newUser(b, "gb");
  const team = `Gast ${run}`;
  await createTeam(a, team);
  await createRequest(a, team, futureLocal(11));
  await expect(a).toHaveURL(/\/suche\/[0-9a-f-]{36}$/);
  const url = a.url();

  // Angemeldet unverändert: Name und Link zum Spieler; daraus die Spieler-ID für die Gast-Prüfung
  await b.goto(url);
  const nameLink = b.getByTestId("request-roster").getByRole("link", { name: "Spieler ga" });
  await expect(nameLink).toBeVisible();
  const userId = /\/spieler\/([0-9a-f-]{36})$/.exec((await nameLink.getAttribute("href")) ?? "")?.[1];
  expect(userId).toBeTruthy();

  // Gast (ohne Cookies): HTML und RSC-Payload enthalten weder Namen noch die rohe Spieler-ID
  for (const headers of [{} as Record<string, string>, { RSC: "1" }]) {
    const res = await request.get(url, { headers });
    expect(res.ok()).toBe(true);
    const body = await res.text();
    expect(body).toContain(team);
    expect(body).not.toContain("Spieler ga");
    expect(body).not.toContain(userId!);
  }

  // Im Kader-Bereich des Gasts: Anzahl und Initialen, keine Links, keine Admin-/Positions-/Elo-Angaben
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(url);
  const roster = guest.getByTestId("request-roster");
  await expect(roster.getByTestId("request-roster-guest")).toContainText("1 Spieler im Kader");
  await expect(roster.getByRole("listitem")).toHaveText(["SG"]);
  await expect(roster.getByRole("link")).toHaveCount(0);
  const rosterHtml = await roster.innerHTML();
  expect(rosterHtml).not.toContain("/spieler/");
  expect(rosterHtml).not.toContain(userId!);
  const guestHtml = await roster.getByTestId("request-roster-guest").innerHTML(); // Team-Elo steht in der Kopfzeile des Bereichs, nicht im Gast-Kader
  expect(guestHtml).not.toMatch(/Admin|Elo|Mittelfeld|Torwart|Sturm|Abwehr/);
});
