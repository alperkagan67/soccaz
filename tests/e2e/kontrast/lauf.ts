import { expect, test } from "@playwright/test";
import { AUDIT_MODE, auditPasses, groupEvaluations, renderProtocol, summarize, type Evaluated } from "../../../src/lib/contrast-audit";
import { closeTestDb, devLogin } from "../helpers";
import { measurePage } from "./messen";
import { seedWorld, type Role, type World } from "./seiten";

// AC-27 (Vertrag 013 v3): Kontrastmessung des gerenderten Zustands, hell und dunkel, eine Breite je Spec (390 oder 1280). Phase 1 (AUDIT_MODE "report"): das Protokoll steht im Job-Log
// (Block ::group::), Verstöße erscheinen als Warnung; der Test bleibt grün. Verbindlich (Test schlägt fehl) erst nach M2c: AUDIT_MODE in src/lib/contrast-audit.ts umstellen.
const SCHEMES = ["dark", "light"] as const;
const ROLES: Role[] = ["gast", "spieler", "admin1"];

export function registerKontrast(viewport: 390 | 1280) {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);
  const all: Evaluated[] = [];
  const errors: string[] = [];
  let world: World;

  test.beforeAll(async () => {
    world = await seedWorld(String(viewport));
  });
  test.afterAll(async () => {
    await closeTestDb();
  });

  for (const scheme of SCHEMES) {
    for (const role of ROLES) {
      test(`Messung ${role}, ${scheme}, ${viewport} px`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: viewport, height: viewport === 390 ? 844 : 900 }, colorScheme: scheme });
        const page = await ctx.newPage();
        try {
          if (role !== "gast") {
            const who = world.players[role];
            await devLogin(page, who.email, who.name);
            await page.waitForURL((url) => !url.pathname.startsWith("/anmelden"), { timeout: 60_000 });
          }
          for (const entry of world.pages.filter((p) => p.role === role)) {
            try {
              await page.goto(entry.path, { waitUntil: "load", timeout: 90_000 });
              const res = await measurePage(page, { page: entry.id, role, scheme, viewport });
              all.push(...res.evaluated);
              errors.push(...res.errors.map((e) => `${entry.id} ${scheme} ${viewport}: ${e}`));
              console.log(`Kontrast ${entry.id} ${role} ${scheme} ${viewport}: Text ${res.counts.text}, Zeichen ${res.counts.nonText}, Fokus ${res.counts.focus}, Pixelmessungen ${res.counts.pixel}`);
            } catch (e) {
              errors.push(`${entry.id} ${scheme} ${viewport}: Seite nicht messbar: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } finally {
          await ctx.close();
        }
        expect(true).toBe(true); // Messfehler stehen im Protokoll, sie lassen den Lauf nicht scheitern
      });
    }
  }

  test(`Protokoll ${viewport} px`, async ({}, testInfo) => {
    const md = renderProtocol(all, { commit: (process.env.GITHUB_SHA ?? "lokal").slice(0, 7), date: new Date().toISOString().slice(0, 10), mode: AUDIT_MODE });
    const errBlock = errors.length > 0 ? `\n## Messfehler (${errors.length})\n\n${errors.map((e) => `- ${e}`).join("\n")}\n` : "";
    const full = md + errBlock;
    console.log(`::group::Kontrast-Messprotokoll ${viewport} px (AC-27)\n${full}\n::endgroup::`);
    await testInfo.attach(`kontrast-protokoll-${viewport}.md`, { body: full, contentType: "text/markdown" });
    const s = summarize(all);
    testInfo.annotations.push({ type: "kontrast", description: `${s.total} Messpunkte, ${s.fail} durchgefallen, ${s.unlesbar} unlesbar, ${errors.length} Messfehler` });
    for (const g of groupEvaluations(all).filter((x) => x.example.status === "fail").slice(0, 25)) {
      const r = g.example.raw;
      console.log(`::warning title=Kontrast ${viewport} px::${r.page} ${r.role} ${r.scheme}: ${r.selector} (${r.sample.slice(0, 30)}) ${g.example.ratio.toFixed(2)}:1 < ${g.example.limit}:1 (${g.count}x)`);
    }
    expect(all.length, "es wurde nichts gemessen").toBeGreaterThan(0);
    expect(auditPasses(all, AUDIT_MODE)).toBe(true); // Modus report: immer; Modus enforce: nur ohne Verstoß
  });
}
