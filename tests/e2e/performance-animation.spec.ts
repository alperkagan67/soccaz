import { expect, test } from "@playwright/test";
import { closeContexts } from "./helpers";
import { RECORD_ANIMATIONS, login, seedPlayedWithRatings } from "./helpers-wertung";
import { PERF_MODE, evaluatePerf, fpsOf, perfPasses, perfReport, perfWarnings } from "../../src/lib/perf-budget";

// Vertrag 013 v3, AC-21 (Leistung am Handy): 4-fach CPU-Drosselung, 390 px, während des Aufdeckens und des Aufstiegs keine Long Tasks über 50 ms, Layoutverschiebung 0,
// im Mittel mindestens 55 fps, Interaktion nach Tippen unter 200 ms; höchstens 6 gleichzeitig animierte Elemente. Läuft nur in der CI (Trace und Video als Artefakt).
// MODUS (Entscheid t2q): PERF_MODE = "report" (src/lib/perf-budget.ts). Leistungsmessungen auf geteilten CI-Runnern sind nie hart gating (Schwankung von CPU-Drosselung und Nachbarn):
// die Grenzen werden gemessen und als ::warning, Annotation und Anhang (leistung-bericht.md, layout-shifts.json) protokolliert, der Test bleibt grün. ROT sind nur harte Voraussetzungen
// (Seite geladen, Aufdecken und Aufstieg liefen, Messfenster gültig). AC-21 gilt damit als Bericht plus Handytest durch den Nutzer (AC-24); "enforce" macht jede Unterschreitung rot.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ trace: "on" }); // Trace als Artefakt (CI); der Runner startet und beendet ihn selbst, KEIN manuelles ctx.tracing.start (sonst: Tracing has been already started)
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const OBSERVE = `
  window.__perf = { longtasks: [], shifts: [], frames: [], events: [], maxAnimations: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: "longtask", buffered: true });
  const rect = (r) => (r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
  const describe = (n) => {
    if (!n) return null;
    const el = n.nodeType === 1 ? n : n.parentElement;
    const testid = el && el.getAttribute ? el.getAttribute("data-testid") : null;
    return n.nodeName + (testid ? "[" + testid + "]" : "") + " | " + ((n.textContent || "").trim().slice(0, 30));
  };
  const inCard = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest("[data-testid=reveal-motion]")); };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.shifts.push({ start: e.startTime, value: e.value, sources: (e.sources || []).map((s) => ({ node: describe(s.node), inCard: inCard(s.node), previous: rect(s.previousRect), current: rect(s.currentRect) })) }); }).observe({ type: "layout-shift", buffered: true });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.events.push({ name: e.name, duration: e.duration }); }).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch (err) { /* Event Timing nicht verfügbar */ }
  const tick = (t) => { window.__perf.frames.push(t); window.__perf.maxAnimations = Math.max(window.__perf.maxAnimations, document.getAnimations().length); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
`;

type Perf = { longtasks: { start: number; duration: number }[]; shifts: { start: number; value: number; sources: { node: string | null; inCard: boolean; previous: unknown; current: unknown }[] }[]; frames: number[]; events: { name: string; duration: number }[]; maxAnimations: number };

test("Aufdecken und Aufstieg am Handy (390 px, 4-fach CPU-Drosselung): Leistungsbericht (Long Tasks, CLS, fps, Tippen, Animationen) laut PERF_MODE", async ({ browser }, testInfo) => {
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
  // harte Voraussetzungen: die Animation lief und das Messfenster ist gültig (sonst sagt die Messung nichts)
  expect(starts.length, "es wurden Animationen gestartet").toBeGreaterThanOrEqual(2);
  expect(to, "Messfenster gültig (Ende nach Start)").toBeGreaterThan(from);
  const inWindow = (t: number) => t >= from && t <= to;
  const shiftsInWindow = data.perf.shifts.filter((s) => inWindow(s.start));
  const taps = data.perf.events.filter((e) => /pointer|click|touch/.test(e.name));
  const checks = evaluatePerf({
    longTasksMs: data.perf.longtasks.filter((l) => inWindow(l.start) || inWindow(l.start + l.duration)).map((l) => l.duration),
    cls: shiftsInWindow.reduce((a, s) => a + s.value, 0),
    fps: fpsOf(data.perf.frames.filter(inWindow)),
    interactionMs: taps.length ? Math.max(...taps.map((e) => e.duration)) : null,
    maxAnimations: data.perf.maxAnimations,
  });
  const report = perfReport(checks, PERF_MODE);
  console.log(report);
  for (const w of perfWarnings(checks)) console.log(w); // ::warning ... sichtbar im Job, Test bleibt im Modus report grün
  for (const c of checks) testInfo.annotations.push({ type: `AC-21 ${c.name}`, description: `${c.value} (Grenze ${c.limit})${c.ok ? "" : " ÜBER DER GRENZE"}` });
  await testInfo.attach("leistung-bericht.md", { body: report, contentType: "text/markdown" });
  await testInfo.attach("layout-shifts.json", { body: JSON.stringify({ window: { from, to }, all: data.perf.shifts, inWindow: shiftsInWindow }, null, 2), contentType: "application/json" });
  expect(perfPasses(checks, PERF_MODE), `Leistungsgrenzen (Modus ${PERF_MODE}):\n${report}`).toBe(true);

  const video = page.video();
  await ctx.close();
  if (video) await testInfo.attach("aufdecken.webm", { path: await video.path(), contentType: "video/webm" });
});
