import { expect, test } from "@playwright/test";
import { setupLobby } from "./flows";
import { closeContexts, closeTestDb } from "./helpers";
import { setPlatformSetting } from "./helpers-db";

// Datenschutz/Text: Ein Gast (nicht angemeldet) sieht in der Lobby im Kartenmodus nur den Hallenpreis, keinen persönlichen Betrag und keinen Kartentext.
// Bewusst OHNE Fake-Pfad (kein PAYMENTS_FAKE, kein test.skip), damit der Test auch in der CI läuft. Die Gegenprobe (Spieler sieht seinen Anteil) steht in karte-lobby.spec.ts.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await setPlatformSetting("card_payments_enabled", true);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await setPlatformSetting("card_payments_enabled", false);
  await closeTestDb();
});

test("Gast sieht Hallenpreis, aber keinen persönlichen Betrag und keinen Kartentext", async ({ browser }) => {
  const { matchId } = await setupLobby(browser, "lgk");
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`/lobby/${matchId}`);
  const costs = guest.getByTestId("card-costs");
  await expect(costs).toBeVisible(); // Kartenmodus ist an
  await expect(costs).toContainText("geteilt durch alle Spieler"); // Hallenpreis ist öffentlich
  await expect(costs).toContainText("Ändert sich die Spielerzahl, ändert sich der Anteil.");
  await expect(costs).not.toContainText("Dein Anteil");
  await expect(costs).not.toContainText("deiner Karte");
  await expect(guest.locator("main")).not.toContainText("von deiner Karte abgebucht");

  // auch nicht im Seitenquelltext und im RSC-Payload (Props an Client-Komponenten): kein Betrag, kein Mandatstext, kein Karten-/Fehlerzustand
  const html = await (await guest.request.get(`/lobby/${matchId}`)).text();
  const rsc = await (await guest.request.get(`/lobby/${matchId}`, { headers: { RSC: "1" } })).text();
  for (const body of [html, rsc]) {
    expect(body).not.toContain("shareCents");
    expect(body).not.toContain("mandateText");
    expect(body).not.toContain("Ich erlaube Soccaz");
    expect(body).not.toContain("Dein Anteil");
  }
});
