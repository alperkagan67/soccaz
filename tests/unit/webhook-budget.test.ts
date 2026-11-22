import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { remainingBudget, runWebhookRetries, WEBHOOK_RETRY_BUDGET_MS } from "@/server/payments/webhook";

// 012-Rest PR A (Backlog 145): Spiele und Turniere teilen EIN Zeitbudget im Webhook (Stripe-Zeitlimit), statt je 12 Sekunden.
describe("remainingBudget", () => {
  it("fällt monoton und wird nie negativ", () => {
    const deadline = 1_000_000 + WEBHOOK_RETRY_BUDGET_MS;
    const values = [0, 3_000, 12_000, 12_001, 50_000].map((spent) => remainingBudget(deadline, 1_000_000 + spent));
    expect(values).toEqual([12_000, 9_000, 0, 0, 0]);
  });
});

describe("runWebhookRetries (Verhalten mit gefaelschter Uhr)", () => {
  const run = async (gamesCost: number) => {
    let now = 1_000_000;
    const calls: { games: number[]; tournaments: number[] } = { games: [], tournaments: [] };
    await runWebhookRetries(
      "u1",
      { games: async (o) => (calls.games.push(o.budgetMs), (now += gamesCost)), tournaments: async (o) => void calls.tournaments.push(o.budgetMs) },
      () => now,
    );
    return calls;
  };
  it("Spielteil verbraucht wenig: Turnierteil bekommt den Rest", async () => {
    const c = await run(4_000);
    expect(c.games).toEqual([WEBHOOK_RETRY_BUDGET_MS]);
    expect(c.tournaments).toEqual([WEBHOOK_RETRY_BUDGET_MS - 4_000]);
  });
  it("Spielteil verbraucht alles: Turnierteil wird NICHT gerufen", async () => {
    expect((await run(WEBHOOK_RETRY_BUDGET_MS)).tournaments).toEqual([]);
    expect((await run(WEBHOOK_RETRY_BUDGET_MS + 5_000)).tournaments).toEqual([]);
  });
});

describe("Webhook: nutzt das gemeinsame Budget", () => {
  const src = readFileSync("src/server/payments/webhook.ts", "utf8");
  it("der Webhook ruft runWebhookRetries; kein Aufruf bekommt das volle Budget", () => {
    expect(src).toMatch(/await runWebhookRetries\(cardUserId\)/);
    expect(src).not.toMatch(/budgetMs: WEBHOOK_RETRY_BUDGET_MS/);
  });
});
