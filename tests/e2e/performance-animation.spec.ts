import { expect, test } from "@playwright/test";
import { closeContexts } from "./helpers";
import { RECORD_ANIMATIONS, login, seedPlayedWithRatings } from "./helpers-wertung";

// Vertrag 013 v3, AC-21 (Leistung am Handy): 4-fach CPU-Drosselung, 390 px, während des Aufdeckens und des Aufstiegs keine Long Tasks über 50 ms, Layoutverschiebung 0,
// im Mittel mindestens 55 fps, Interaktion nach Tippen unter 200 ms; höchstens 6 gleichzeitig animierte Elemente. Läuft nur in der CI (Trace und Video als Artefakt).
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ trace: "on" }); // Trace als Artefakt (CI); der Runner startet und beendet ihn selbst, KEIN manuelles ctx.tracing.start (sonst: Tracing has been already started)
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const OBSERVE = `
  window.__perf = { longtasks: [], shifts: [], frames: [], events: [], maxAnimations: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shifts.push({ start: e.startTime, value: e.value }); }).observe({ type: "layout-shift", buffered: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.events.push({ name: e.name, duration: e.duration }); }).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch (err) { /* Event Timing nicht verfügbar */ }
  const tick = (t) => { window.__perf.frames.push(t); window.__perf.maxAnimations = Math.max(window.__perf.maxAnimations, document.getAnimations().length); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
`;

type Perf = { longtasks: { start: number; duration: number }[]; shifts: { start: number; value: number }[]; frames: number[]; events: { name: string; duration: number }[]; maxAnimations: number };

test("Aufdecken und Aufstieg am Handy (390 px, 4-fach CPU-Drosselung): keine Long Tasks > 50 ms, CLS 0, >= 55 fps im Mittel, Tippen < 200 ms, höchstens 6 Animationen gleichzeitig", async ({ browser }, testInfo) => {
  const g = await seedPlayedWithRatings("pf");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, recordVideo: { dir: testInfo.outputPath("video"), size: { width: 390, height: 844 } } });
  await ctx.addInitScript(RECORD_ANIMATIONS);
  await ctx.addInitScript(OBSERVE);
  const page = await ctx.newPage();
  await login(page, g.starEmail, g.starName);
  await page.goto("/app");
  const client = await ctx.newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => localStorage.removeItem("soccaz.maxTier")); // der Aufstieg soll laufen
  await page.goto(`/spiele/${g.matchId}`);
  await expect(page.getByTestId("reveal-motion")).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __anims: { type: string }[] }).__anims)).filter((a) => a.type === "end").length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  // Tippen mitten auf die Karte (Interaktion nach Tippen)
  const box = (await page.getByTestId("player-card").boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const w = window as unknown as { __anims: { name: string; type: string; t: number }[]; __perf: Perf };
    return { anims: w.__anims, perf: w.__perf };
  });
  const starts = data.anims.filter((a) => a.type === "start").map((a) => a.t);
  const ends = data.anims.filter((a) => a.type === "end").map((a) => a.t);
  const from = Math.min(...starts);
  const to = Math.max(...ends);
  expect(to).toBeGreaterThan(from);
  const inWindow = (t: number) => t >= from && t <= to;
  const longInWindow = data.perf.longtasks.filter((l) => l.duration > 50 && (inWindow(l.start) || inWindow(l.start + l.duration)));
  expect(longInWindow, `Long Tasks im Fenster: ${JSON.stringify(longInWindow)}`).toEqual([]);
  expect(data.perf.shifts.filter((s) => inWindow(s.start)).reduce((a, s) => a + s.value, 0)).toBe(0);
  const frames = data.perf.frames.filter(inWindow);
  const fps = (frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000);
  testInfo.annotations.push({ type: "fps", description: fps.toFixed(1) });
  expect(fps, `Bildrate im Mittel: ${fps.toFixed(1)}`).toBeGreaterThanOrEqual(55);
  const slowTaps = data.perf.events.filter((e) => /pointer|click|touch/.test(e.name) && e.duration >= 200);
  expect(slowTaps, "Interaktion nach Tippen unter 200 ms").toEqual([]);
  expect(data.perf.maxAnimations).toBeLessThanOrEqual(6);

  const video = page.video();
  await ctx.close();
  if (video) await testInfo.attach("aufdecken.webm", { path: await video.path(), contentType: "video/webm" });
});
