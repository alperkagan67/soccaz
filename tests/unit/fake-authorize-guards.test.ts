import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 012-Rest PR B (Security): die Fake-Freigabe darf nie in Produktion und nie ohne die Sperren laufen. Strukturtest ueber die Server-Aktionen (Spiel UND Turnier): erst assertNoFakeInProduction,
// dann fakeCardAllowed, dann der Anbieter, erst danach die Sitzung und der Kern.
const src = readFileSync("src/server/payments/fake-card-actions.ts", "utf8");
const body = (name: string) => {
  const a = src.indexOf(`export async function ${name}`);
  if (a < 0) throw new Error(name);
  return src.slice(a, src.indexOf("\n}\n", a));
};

describe.each(["fakeAuthorizeAction", "fakeAuthorizeTournamentAction"])("%s", (name) => {
  it("Sperren in der richtigen Reihenfolge vor Sitzung und Kern", () => {
    const b = body(name);
    const order = ["assertNoFakeInProduction()", "fakeCardAllowed()", 'provider.name !== "fake"', "requireUser(", "await fakeAuthorize"].map((m) => b.indexOf(m));
    expect(order.every((i) => i >= 0), b).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
  });
});

describe("Turnier-Kern", () => {
  const core = readFileSync("src/server/payments/fake-authorize.ts", "utf8");
  it("Metadaten tragen tournamentId, nie matchId; der Kern prueft den Fake-Anbieter und geht ueber den Webhook", () => {
    const t = core.slice(core.indexOf("export async function fakeAuthorizeTournamentCore"));
    expect(t).toMatch(/metadata: \{ tournamentId, userId: row\.owner \}/);
    expect(t).not.toMatch(/metadata: \{[^}]*matchId/);
    expect(t).toContain('provider.name !== "fake"');
    expect(t).toContain("handleStripeWebhook(");
  });
});
