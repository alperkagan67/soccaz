import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6b 1c-iii (a): Die Detailseite rechnet Einnahmen/Hallenkosten über die EINE Rechenstelle matchMoneyOf (Hauptbuch-Konten), nie aus der Summe der Spielerbeträge
// (das war die Lücke aus #202: im Kartenmodell zeigte die Seite 0).
const page = readFileSync(path.join(process.cwd(), "src/app/admin/finanzen/spiel/[id]/page.tsx"), "utf8");
const finance = readFileSync(path.join(process.cwd(), "src/server/finance.ts"), "utf8");

describe("Admin-Finanzen Detailseite: eine Rechenstelle", () => {
  it("die Seite liest matchMoneyOf und summiert keine Spielerbeträge zu Einnahmen", () => {
    expect(page).toContain("matchMoneyOf");
    expect(page).not.toMatch(/players\.reduce\([^)]*netCents/);
  });
  it("die Spieleliste liest ihre Beträge ebenfalls aus matchMoneyOf (keine zweite SQL-Rechnung)", () => {
    const list = finance.slice(finance.indexOf("export async function listMatchFinance"), finance.indexOf("export type VenueCommissionRow"));
    expect(list).toContain("matchMoneyOf(");
    expect(list).not.toMatch(/credit_account in \('revenue', 'commission'\)/);
  });
  it("manualRefund hält die Sperrreihenfolge Spiel -> Zahlungszeile -> Nutzer (Backlog 144; Deadlock-Zyklus mit der Absage vermeiden)", () => {
    const start = finance.indexOf("export async function manualRefund");
    const fn = finance.slice(start, finance.indexOf("\nexport ", start + 10));
    const game = fn.indexOf(".from(matches)");
    const charges = fn.indexOf(".from(paymentCharges)");
    const user = fn.indexOf(".from(users)");
    expect(game).toBeGreaterThan(-1);
    expect(game).toBeLessThan(charges);
    expect(charges).toBeLessThan(user);
    expect(fn).toMatch(/from\(matches\)[^;]*\.for\("update"\)/); // das Spiel wird wirklich FOR UPDATE gesperrt (nicht nur gelesen)
    expect(fn).toMatch(/\.from\(users\)[^;]*\.for\("no key update"\)/); // der Nutzer nur FOR NO KEY UPDATE und zuletzt
  });
});
