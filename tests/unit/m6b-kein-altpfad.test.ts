import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 012 M6b (PR 1a): Der Guthaben-Altpfad der Lobby ist entfernt. Quelltext-Test über src/: keine Reservierung, Guthaben-Zahlung, Guthaben-Erstattung, Guthaben-Abrechnung,
// Aufladung oder Rabattcodes mehr. (Turnier und Ausnahme-Erstattung folgen mit PR 1b, dann kommen creditWallet/debitWallet/walletBalance dazu.)
const root = process.cwd();
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mts)$/.test(n) ? [p] : [];
  });
}
const SRC = files(path.join(root, "src"));
const FORBIDDEN = /\b(reserveShare|payShareAction|payShare|refundOnCancel|settlePendingRefunds|settleMatch|settleDueMatches|createTopUp|completePayment|previewPromo|redeemPromo|createPromo)\b/;
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");

describe("012 M6b: kein Guthaben-Altpfad in src/", () => {
  it("keine der entfernten Funktionen kommt in src/ vor", () => {
    const hits = SRC.filter((f) => FORBIDDEN.test(readFileSync(f, "utf8"))).map(rel);
    expect(hits).toEqual([]);
  });
  it("die entfernten Dateien sind weg (promo, promo-rules)", () => {
    expect(existsSync(path.join(root, "src/server/promo.ts"))).toBe(false);
    expect(existsSync(path.join(root, "src/lib/promo-rules.ts"))).toBe(false);
  });
  it("der Job settle-matches ist abgemeldet", () => {
    expect(readFileSync(path.join(root, "src/server/jobs.ts"), "utf8")).not.toMatch(/settle-matches|settleDueMatches/);
  });
});
