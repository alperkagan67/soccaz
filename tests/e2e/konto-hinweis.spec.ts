import { expect, test } from "@playwright/test";
import { closeContexts, run, seedUser } from "./helpers";
import { query } from "./helpers-db";
import { zahlungsWorte } from "@/lib/zahlungen-aus";
import { APPLE_KONTO_URL, GOOGLE_KONTO_URL } from "@/lib/konto-links";

// Hinweis "Zum Mitmachen brauchst du ein Google-Konto (kostenlos)" für Besucher ohne Konto (Go-live): /anmelden und Turnierseite (Gast). Die CI läuft ohne Apple-Anmeldung (Flag aus):
// Text "Google-Konto", ein Link. Der Zustand mit Flag an (Google- oder Apple-Konto, zwei Links) ist im Unit-Test konto-hinweis.test.ts und im Smoke (--apple) abgedeckt.
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

async function pruefeHinweis(page: import("@playwright/test").Page, was: string) {
  const box = page.getByTestId("konto-hinweis");
  await expect(box, was).toBeVisible({ timeout: 60_000 });
  const text = (await box.textContent()) ?? "";
  expect(text).toContain("Zum Mitmachen brauchst du ein");
  expect(text).toContain("Konto (kostenlos).");
  expect(text).toContain("Jeder Spieler braucht ein eigenes Konto.");
  expect(zahlungsWorte(text), `Wortscan ${was}`).toEqual([]);
  const links = box.locator("a");
  const n = await links.count();
  expect(n, `${was}: mindestens der Google-Link`).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < n; i++) {
    const a = links.nth(i);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
    expect((await a.boundingBox())!.height, `${was}: Tippfläche`).toBeGreaterThanOrEqual(44);
  }
  await expect(links.first()).toHaveAttribute("href", GOOGLE_KONTO_URL);
  if (n === 2) await expect(links.nth(1)).toHaveAttribute("href", APPLE_KONTO_URL);
  return n;
}

test("Gast: /anmelden und Turnierseite zeigen den Konto-Hinweis (Google-Konto, Link, 44 px, ohne Zahlungswort)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto("/anmelden");
  const n = await pruefeHinweis(page, "/anmelden");
  const text = (await page.getByTestId("konto-hinweis").textContent()) ?? "";
  // Text und Zahl der Links folgen demselben Schalter (Apple: zwei Links und "Google- oder Apple-Konto")
  expect(text.includes("Apple-Konto")).toBe(n === 2);

  const org = await seedUser("kh-org", "Veranstalter KH");
  await query("update users set is_organizer = true where id = $1", [org]);
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, status, registration_deadline, starts_at, is_private)
     values ($1, $2, 'Essen', (now() + interval '20 days')::date, 'knockout', 4, 0, 0, 120, 'registration', now() + interval '18 days', now() + interval '20 days', false) returning id`,
    [org, `Konto-Cup ${run}`],
  );
  await page.goto(`/turniere/${t.id}`);
  await expect(page.getByRole("link", { name: "Anmelden und mitmachen" })).toBeVisible({ timeout: 60_000 });
  await pruefeHinweis(page, "Turnierseite (Gast)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "kein horizontales Scrollen").toBeLessThanOrEqual(0);
});
