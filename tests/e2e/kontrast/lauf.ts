import { expect, test, type BrowserContext } from "@playwright/test";
import { AUDIT_MODE, auditPasses, groupEvaluations, renderProtocol, summarize, type Evaluated } from "../../../src/lib/contrast-audit";
import { closeTestDb, devLogin } from "../helpers";
import { measurePage } from "./messen";
import { ROLLEN, seedWorld, type World } from "./seiten";

// AC-27 (Vertrag 013 v3): Kontrastmessung des gerenderten Zustands, hell und dunkel, eine Breite je Spec (390 oder 1280). Umfang und Rollen: Konstanten UMFANG und ROLLEN in seiten.ts. Das Protokoll steht im Job-Log
// (Block ::group::), Verstöße erscheinen als Warnung. Seit dem main-Lauf zu 23b67ab gilt AUDIT_MODE "enforce" (src/lib/contrast-audit.ts): jeder Verstoß und jeder unlesbare Punkt lässt den Protokoll-Test fehlschlagen.
const SCHEMES = ["dark", "light"] as const;

export function registerKontrast(viewport: 390 | 1280) {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(300_000);
  const all: Evaluated[] = [];
  const errors: string[] = [];
  let world: World | undefined;

  test.beforeAll(async () => {
    try {
      world = await seedWorld(String(viewport));
    } catch (e) {
      errors.push(`Seeds fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); // das Protokoll nennt es; 'es wurde nichts gemessen' macht den Lauf rot
    }
  });
  test.afterAll(async () => {
    await closeTestDb();
  });

  for (const scheme of SCHEMES) {
    for (const role of ROLLEN) {
      test(`Messung ${role}, ${scheme}, ${viewport} px`, async ({ browser }) => {
        // Nichts in diesem Test darf den Lauf rot machen (serial: sonst würden alle folgenden Tests, auch das Protokoll, übersprungen): jeder Fehler wird ein Messfehler
        let ctx: BrowserContext | undefined;
        try {
          ctx = await browser.newContext({ viewport: { width: viewport, height: viewport === 390 ? 844 : 900 }, colorScheme: scheme });
          const page = await ctx.newPage();
          if (role !== "gast") {
            try {
              const who = world?.players[role];
              if (!who) throw new Error(`keine Anmeldedaten für ${role}`);
              await devLogin(page, who.email, who.name);
              await page.waitForURL((url) => !url.pathname.startsWith("/anmelden"), { timeout: 60_000 });
            } catch (e) {
              errors.push(`${role} ${scheme} ${viewport}: Anmeldung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
              return; // nächste Rolle
            }
          }
          for (const entry of (world?.pages ?? []).filter((p) => p.role === role)) {
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
        } catch (e) {
          errors.push(`${role} ${scheme} ${viewport}: Messung abgebrochen: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          await ctx?.close().catch(() => {});
        }
      });
    }
  }

  test(`Protokoll ${viewport} px`, async ({}, testInfo) => {
    const md = renderProtocol(all, { commit: (process.env.GITHUB_SHA ?? "lokal").slice(0, 7), date: new Date().toISOString().slice(0, 10), mode: AUDIT_MODE });
    const errBlock = errors.length > 0 ? `\n## Messfehler (${errors.length})\n\n${errors.map((e) => `- ${e}`).join("\n")}\n` : "";
    const full = md + errBlock;
    console.log(`::group::Kontrast-Messprotokoll ${viewport} px (AC-27)\n${full}\n::endgroup::`);
    // Messfehler sichtbar machen (auch als Warnung), damit sie im Lauf auffallen
    for (const m of errors.slice(0, 25)) console.log(`::warning title=Kontrast Messfehler ${viewport} px::${m.split(/\s+/).join(" ").slice(0, 300)}`);
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
