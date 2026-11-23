import { expect, test } from "@playwright/test";
import { closeContexts } from "./helpers";
import { RECORD_ANIMATIONS, login, seedPlayedWithRatings } from "./helpers-wertung";

// Vertrag 013 v3, AC-20 (Aufstieg nur einmal, Merker im Browser) und AC-23 (reduzierte Bewegung: nur Einblenden unter 150 ms, alle Informationen bleiben).
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

type Anim = { name: string; type: "start" | "end"; t: number };
const anims = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __anims: Anim[] }).__anims);
const names = async (page: import("@playwright/test").Page, type: "start" | "end" = "start") => (await anims(page)).filter((a) => a.type === type).map((a) => a.name);

test("Aufstieg: Aufdecken und Chip-Pop genau EINMAL (Merker im Browser); nach Neuladen nur noch Aufdecken; ohne Speicher wieder einmal", async ({ browser }) => {
  const g = await seedPlayedWithRatings("mo");
  const ctx = await browser.newContext();
  await ctx.addInitScript(RECORD_ANIMATIONS);
  const page = await ctx.newPage();
  await login(page, g.starEmail, g.starName);
  await page.goto(`/spiele/${g.matchId}`);
  const motion = page.getByTestId("reveal-motion");
  await expect(motion).toBeVisible();
  await expect.poll(() => names(page, "end")).toEqual(expect.arrayContaining(["reveal-in", "promote-pop"]));
  await expect(motion).toHaveAttribute("data-celebrate", "true");
  await expect(motion).not.toHaveClass(/is-animating/); // will-change fällt nach der letzten Animation weg
  await expect(page.getByTestId("rating-reveal-text")).toContainText("Aufstieg: Kreide → Rasen"); // die Information steht als Text da

  await page.reload();
  await expect.poll(() => names(page, "end")).toContain("reveal-in");
  expect(await names(page, "start")).not.toContain("promote-pop");
  await expect(page.getByTestId("reveal-motion")).not.toHaveAttribute("data-celebrate", "true");

  await page.evaluate(() => localStorage.removeItem("soccaz.maxTier")); // neues Gerät: einmal wieder (Folge laut Vertrag so gewollt)
  await page.reload();
  await expect.poll(() => names(page, "start")).toContain("promote-pop");

  // Gegner: Stufe bleibt, nie eine Feier
  const rp = await (await browser.newContext()).newPage();
  await login(rp, g.rivalEmail, g.rivalName);
  await rp.goto(`/spiele/${g.matchId}`);
  await expect(rp.getByTestId("rating-reveal-text")).toBeVisible();
  await expect(rp.getByTestId("reveal-motion")).not.toHaveAttribute("data-celebrate", "true");
});

test("Reduzierte Bewegung: nur Einblenden (reveal-fade, unter 150 ms), kein Aufdecken-Transform, kein Chip-Pop; alle Informationen bleiben", async ({ browser }) => {
  const g = await seedPlayedWithRatings("rm");
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  await ctx.addInitScript(RECORD_ANIMATIONS);
  const page = await ctx.newPage();
  await login(page, g.starEmail, g.starName);
  await page.goto(`/spiele/${g.matchId}`);
  await expect(page.getByTestId("reveal-motion")).toBeVisible();
  await expect.poll(() => names(page, "end")).toEqual(["reveal-fade"]);
  const all = await anims(page);
  expect(all.map((a) => a.name).filter((n) => n !== "reveal-fade")).toEqual([]); // weder reveal-in (Bewegung) noch promote-pop
  const start = all.find((a) => a.type === "start")!;
  const end = all.find((a) => a.type === "end")!;
  expect(end.t - start.t).toBeLessThan(150 + 80); // 120 ms Dauer plus Taktungenauigkeit; die Dauer selbst prüft der CSS-Unit-Test (< 150 ms)
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dur-reduced").trim());
  expect(parseInt(dur, 10)).toBeLessThan(150);
  // alle Informationen bleiben
  await expect(page.getByTestId("rating-reveal-text")).toContainText("Wertung 50 → 61 (+11), Stufe Rasen. Aufstieg: Kreide → Rasen");
  await expect(page.getByTestId("player-card-tier")).toContainText("Rasen");
  await expect(page.getByTestId("reveal-motion")).not.toHaveClass(/is-animating/);
});
