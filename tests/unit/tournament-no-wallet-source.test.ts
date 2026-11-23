import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6b b2-ii: Der Turnierpfad kennt kein Guthaben mehr. Weder Server noch Aktionen noch Seite dürfen payEntry/payForTeam, creditWallet/debitWallet oder das Hauptbuch-Posten (post)
// für Eintritte aufrufen; Altgeld (paid_cents > 0) wird nur protokolliert (tournament.refund_skipped / tournament.settle_skipped).
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const server = read("src/server/tournaments.ts");
const actions = read("src/server/tournament-actions.ts");
const page = read("src/app/turniere/[id]/page.tsx");

describe("Turnier ohne Guthabenweg (Quelltext)", () => {
  it("tournaments.ts: keine Guthaben-/Hauptbuch-Aufrufe und kein Import aus ledger", () => {
    expect(server).not.toMatch(/\b(creditWallet|debitWallet|payEntry|payForTeam)\b/);
    expect(server).not.toMatch(/from "\.\/ledger"/);
    expect(server).not.toMatch(/\bpost\(tx/);
    expect(server).not.toContain("tournament_payout");
    expect(server).not.toContain("tournament_refund");
  });
  it("Aktionen und Seite: keine Zahl-Aktionen und keine Zahl-Knöpfe", () => {
    expect(actions).not.toMatch(/payEntry|payForTeam|InsufficientFunds/);
    expect(page).not.toMatch(/payEntryAction|payForTeamAction|captain-pay-box|data-testid="pay-entry"|data-testid="paid-note"/);
  });
  it("paid_cents kann im Turnier nirgends mehr über 0 entstehen: der einzige Schreiber setzt 0 (src/server, Aktionen, Karten-Modul)", () => {
    const files = ["src/server/tournaments.ts", "src/server/tournament-card.ts", "src/server/tournament-actions.ts", "src/server/account.ts", "src/server/tournament-venue.ts"];
    for (const p of files) {
      let src = "";
      try { src = read(p); } catch { continue; }
      const sets = [...src.matchAll(/set\(\{[^}]*paidCents:\s*([^,}]+)/g)].map((m) => m[1].trim());
      for (const v of sets) expect(v, p).toBe("0");
    }
    expect(server.match(/set\(\{[^}]*paidCents/g)?.length ?? 0).toBe(1);
  });
  it("Altgeld wird protokolliert statt erstattet/ausgezahlt", () => {
    expect(server).toContain('"tournament.refund_skipped"');
    expect(server).toContain('"tournament.settle_skipped"');
  });
});
