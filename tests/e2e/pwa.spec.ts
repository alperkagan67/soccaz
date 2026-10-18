import { expect, test } from "@playwright/test";
import { closeContexts, closeTestDb, newUser, run } from "./helpers";
import { callJob, query } from "./helpers-db";

test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

test("PWA: Manifest, Icons und Service Worker werden ausgeliefert", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.name).toContain("Socaz");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/app");
  expect(manifest.theme_color).toBe("#030806");
  const purposes = manifest.icons.map((i: { purpose: string }) => i.purpose);
  expect(purposes).toEqual(expect.arrayContaining(["any", "maskable"]));
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const r = await request.get(icon.src);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);
  const code = await sw.text();
  expect(code).toContain('addEventListener("push"');
  expect(code).toContain('addEventListener("notificationclick"');
  expect((await request.get("/offline")).status()).toBe(200);
});

test("PWA: Offline-Seite erscheint, wenn die Verbindung fehlt", async ({ page, context }) => {
  await page.goto("/offline");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  // warten, bis der Service Worker die Seite kontrolliert
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.goto("/suche").catch(() => {});
  await expect(page.getByRole("heading", { name: "Keine Verbindung" })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  });
});

test.describe("Handy", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("untere Navigationsleiste mit aktiver Seite", async ({ page }) => {
    await page.goto("/suche");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav).toBeVisible();
    for (const label of ["Start", "Suchen", "Live", "Meine"]) await expect(nav.getByRole("link", { name: label })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Suchen" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Start" })).not.toHaveAttribute("aria-current", "page");
    // abgemeldet führt "Meine" zur Anmeldung
    await expect(nav.getByRole("link", { name: "Meine" })).toHaveAttribute("href", "/anmelden");
    await nav.getByRole("link", { name: "Live" }).click();
    await expect(page).toHaveURL(/\/spiele$/);
    await expect(page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Live" })).toHaveAttribute("aria-current", "page");
  });

  test("angemeldet führt Meine zum Bereich, nichts verdeckt Inhalte", async ({ page }) => {
    await newUser(page, "pw1");
    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Meine" })).toHaveAttribute("href", "/app");
    await expect(nav.getByRole("link", { name: "Meine" })).toHaveAttribute("aria-current", "page");
    // Am Seitenende liegt der letzte Inhalt oberhalb der Leiste und wird nicht verdeckt
    await expect(page.getByRole("heading", { name: "Meine Teams" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const navBox = await nav.boundingBox();
    const lastSection = await page.getByRole("heading", { name: "Meine Teams" }).locator("xpath=ancestor::section").boundingBox();
    expect(navBox).not.toBeNull();
    expect(lastSection).not.toBeNull();
    expect(lastSection!.y + lastSection!.height).toBeLessThanOrEqual(navBox!.y);
  });

  test("iPhone: Hinweis zum Home-Bildschirm, nach Schließen weg", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByText("Zum Home-Bildschirm")).toBeVisible();
    await page.getByRole("button", { name: "Hinweis schließen" }).click();
    await expect(page.getByText("Zum Home-Bildschirm")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("Zum Home-Bildschirm")).toHaveCount(0);
  });
});

test("Desktop: keine untere Leiste", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/suche");
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeHidden();
});

test("Push: Einstellungen erklären, wenn der Server nicht eingerichtet ist; Zustellung mit Geräte-Abo bricht nicht", async ({ page, baseURL }) => {
  await newUser(page, "pw2");
  await page.goto("/app/einstellungen");
  await expect(page.getByText("Push ist auf diesem Server noch nicht eingerichtet.")).toBeVisible();

  // Ein Geräte-Abo ist hinterlegt, aber Web-Push ist nicht konfiguriert: protokollieren statt abstürzen
  const email = `pw2-${run}@test.local`;
  await query("insert into push_subscriptions (user_id, endpoint, p256dh, auth) select id, $2, 'p', 'a' from users where email = $1", [email, `https://push.example.test/${run}`]);
  await query("insert into notifications (user_id, type, title, body) select id, 'system', 'Test', 'Hallo' from users where email = $1", [email]);
  await callJob(baseURL!, "deliver-notifications");
  const log = await query<{ channel: string; status: string; detail: string }>(
    "select l.channel, l.status, l.detail from delivery_log l join notifications n on n.id = l.notification_id join users u on u.id = n.user_id where u.email = $1 and l.channel = 'push'",
    [email],
  );
  expect(log).toHaveLength(1);
  expect(log[0].status).toBe("skipped");
  expect(log[0].detail).toMatch(/nicht konfiguriert/);
});
