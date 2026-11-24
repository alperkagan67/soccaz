import { expect, test } from "@playwright/test";
import { closeContexts, run, seedUser } from "./helpers";
import { query } from "./helpers-db";
import { loginPhone, phonePage, seedFreeTournament, seedOrganizer, seedTeam } from "./turnier-tag-helpers";

// PR 3: privates Turnier mit fehlendem/falschem Token = dieselbe neutrale Seite wie ein unbekanntes Turnier (kein Existenz-Orakel, kein Turnierinhalt, kein Token in Links); mit Token und für Eingeweihte die normale Seite.
test.setTimeout(240_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const UNGUELTIG = "Dieser Einladungslink ist ungültig oder abgelaufen.";
const mainText = async (page: import("@playwright/test").Page) => ((await page.locator("main").textContent()) ?? "").replace(/\s+/g, " ").trim();

test("privates Turnier: ohne/falscher Token = neutrale Seite (gleich wie unbekannt), mit Token die Seite; Anmeldung nur mit Token", async ({ browser }) => {
  const org = await seedOrganizer("tk-org");
  const t = await seedFreeTournament(org.id, "tk", 8);
  await query("update tournaments set is_private = true, invite_token = $2 where id = $1", [t.id, `tok-${run}-richtig`]);
  const token = `tok-${run}-richtig`;
  const unbekannt = "00000000-0000-4000-8000-0000000000aa";

  const gast = await phonePage(browser);
  const antworten: string[] = [];
  for (const pfad of [`/turniere/${unbekannt}`, `/turniere/${unbekannt}?t=falsch`, `/turniere/${t.id}`, `/turniere/${t.id}?t=falsch`, `/turniere/${t.id}?t=${token}x`]) {
    await gast.goto(pfad);
    await expect(gast.getByTestId("einladung-ungueltig")).toBeVisible({ timeout: 60_000 });
    antworten.push(await mainText(gast));
    expect(antworten.at(-1), pfad).toContain(UNGUELTIG);
    expect(antworten.at(-1), pfad).not.toContain(t.name);
    expect(await gast.locator("main").innerHTML(), pfad).not.toContain("falsch"); // im sichtbaren Teil kein Token (die eigene Adresse steht nur im technischen Seitenzustand von Next) // der falsche Token wird nirgends zurückgegeben oder weitergereicht
    expect(await gast.locator('a[href*="?t="], a[href*="&t="]').count(), pfad).toBe(0);
    await expect(gast.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  expect(new Set(antworten).size, "unbekannt und falscher Token sehen identisch aus").toBe(1);

  // richtiger Token: normale Seite mit Anmelden-Knopf, der Token geht in den Anmelde-Link (gültig geprüft)
  await gast.goto(`/turniere/${t.id}?t=${token}`);
  await expect(gast.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });
  await expect(gast.getByTestId("einladung-ungueltig")).toHaveCount(0);
  await expect(gast.getByRole("link", { name: "Anmelden und mitmachen" })).toHaveAttribute("href", new RegExp(encodeURIComponent(`?t=${token}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  // eingeloggter Fremder: ohne Token neutral, mit Token normal
  const fremdId = await seedUser("tk-fremd", "Fremder Fan");
  void fremdId;
  const fremd = await loginPhone(browser, `tk-fremd-${run}@test.local`, "Fremder Fan");
  await fremd.goto(`/turniere/${t.id}`);
  await expect(fremd.getByTestId("einladung-ungueltig")).toBeVisible({ timeout: 60_000 });
  await fremd.goto(`/turniere/${t.id}?t=${token}`);
  await expect(fremd.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });

  // Veranstalter und angemeldetes Team brauchen keinen Token
  const orgPage = await loginPhone(browser, org.email, org.name);
  await orgPage.goto(`/turniere/${t.id}`);
  await expect(orgPage.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });
  const team = await seedTeam(t.id, "tkt1", false);
  const cap = await loginPhone(browser, team.captainEmail, "Captain tkt1");
  await cap.goto(`/turniere/${t.id}`);
  await expect(cap.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });

  // öffentliches Turnier bleibt für alle offen
  const pub = await seedFreeTournament(org.id, "tkp", 8);
  await gast.goto(`/turniere/${pub.id}`);
  await expect(gast.getByTestId("tournament-name")).toBeVisible({ timeout: 60_000 });
});
