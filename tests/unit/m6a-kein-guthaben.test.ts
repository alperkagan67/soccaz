import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6a (Vertrag 013 AC-14): Kein Spieler sieht Guthaben, Aufladen oder Rabattcodes. Quelltext-Test über die Oberfläche (src/app, src/components, i18n);
// die Server-Logik des Altmodells bleibt bis 012 M6b. Ausnahmen stehen einzeln unten (mit Grund).
const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|json)$/.test(n) ? [p] : [];
  });
}
const UI = [...files(path.join(root, "src/app")), ...files(path.join(root, "src/components")), path.join(root, "src/lib/i18n.ts")];
// Belege früherer Aufladungen bleiben abrufbar (aufbewahrungspflichtig, PDF-Beschreibung): src/app/api/belege/[id]/route.ts.
// Admin-Finanzen zeigt Buchhaltungsdaten (Haftung, Aufladungen) nur für Admins; Spieler sehen sie nie.
const ALLOWED = new Set(["src/app/api/belege/[id]/route.ts", "src/app/admin/finanzen/page.tsx", "src/app/admin/finanzen/spiel/[id]/page.tsx"]);
const WORDS = /guthaben|aufladen|aufgeladen|rabattcode|wallet|promo/i;
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

describe("012 M6a: keine Guthaben-Oberfläche", () => {
  it("in src/app, src/components und i18n kommt kein Guthaben-Begriff vor (außer Admin-Finanzen)", () => {
    const hits = UI.filter((f) => !ALLOWED.has(rel(f)) && WORDS.test(readFileSync(f, "utf8").split('"@/server/wallet"').join("")) /* Modulname wallet.ts wird erst mit 012 M6b umbenannt */).map(rel);
    expect(hits).toEqual([]);
  });
  it("kein Link auf /app/guthaben außer der Weiterleitung selbst", () => {
    const hits = UI.filter((f) => readFileSync(f, "utf8").includes("/app/guthaben")).map(rel);
    expect(hits).toEqual([]);
  });
  it("/app/guthaben leitet nur noch weiter; Codes-Seite und Aufladen-Formular sind weg", () => {
    expect(readFileSync(path.join(root, "src/app/app/guthaben/page.tsx"), "utf8")).toContain('redirect("/app")');
    for (const gone of ["src/app/admin/codes", "src/app/app/guthaben/TopUpForm.tsx", "src/server/wallet-actions.ts"]) expect(existsSync(path.join(root, gone)), gone).toBe(false);
  });
  it("Admin-Navigation hat keinen Eintrag Codes mehr", () => {
    expect(readFileSync(path.join(root, "src/app/admin/layout.tsx"), "utf8")).not.toContain("/admin/codes");
  });
  it("Kopfleiste und Konto-Menü rufen walletBalance nicht mehr auf", () => {
    for (const f of ["src/components/Header.tsx", "src/components/UserMenu.tsx", "src/app/app/page.tsx"]) expect(readFileSync(path.join(root, f), "utf8"), f).not.toContain("walletBalance");
  });
});
