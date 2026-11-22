import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { remainingBudget, WEBHOOK_RETRY_BUDGET_MS } from "@/server/payments/webhook";

// 012-Rest PR A (Backlog 145): Spiele und Turniere teilen EIN Zeitbudget im Webhook (Stripe-Zeitlimit), statt je 12 Sekunden.
describe("remainingBudget", () => {
  it("fällt monoton und wird nie negativ", () => {
    const deadline = 1_000_000 + WEBHOOK_RETRY_BUDGET_MS;
    const values = [0, 3_000, 12_000, 12_001, 50_000].map((spent) => remainingBudget(deadline, 1_000_000 + spent));
    expect(values).toEqual([12_000, 9_000, 0, 0, 0]);
  });
});

describe("Webhook: gemeinsames Budget", () => {
  const src = readFileSync("src/server/payments/webhook.ts", "utf8");
  it("beide Wiederholungen bekommen das Restbudget, nie je das volle Budget", () => {
    expect(src).not.toMatch(/budgetMs: WEBHOOK_RETRY_BUDGET_MS/);
    expect(src.match(/budgetMs: remainingBudget\(deadline, Date\.now\(\)\)/g)).toHaveLength(1);
    expect(src).toMatch(/budgetMs: rest/);
    expect(src).toMatch(/if \(rest > 0\) await retryTournamentChargesInWindow/);
  });
});
