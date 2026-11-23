import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentProfiles } from "@/db/schema";
import { listMatchFinance, overview, playerFinance } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// 012 M6b 1c-i (Befund E2E #202): Was zeigt der Admin-Finanzbereich nach einer ECHTEN Kartenabbuchung (payment_intent.succeeded -> clearing -> Anteilskonto, ohne Nutzer-Bezug)?
let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(cleanup);

const wide = { from: new Date("2020-01-01"), to: new Date("2100-01-01") };
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

async function chargedMatch() {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true }); // legacy: Anteilskonto revenue (kein Provisionsmodell)
  const u = await addPlayer(m.match.id, m.home.id, "fc");
  const customerId = nid("cus_fc");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_fc") });
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  const piId = nid("pi_fc");
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${u.id}`, paymentIntentId: piId }).returning();
  const e = provider.signEvent({ id: nid("evt_fc"), type: "payment_intent.succeeded", object: { id: piId, amount: row.amountCents, currency: "eur", customer: customerId, metadata: { matchId: m.match.id, userId: u.id } } });
  expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
  return { m, u };
}

describe("Admin-Finanzen nach echter Kartenabbuchung", () => {
  it("Übersicht und Spieleliste zeigen den Erlös (revenue) der Abbuchung", async () => {
    const before = await overview(wide);
    const { m } = await chargedMatch();
    expect((await overview(wide)).revenueCents - before.revenueCents).toBe(800);
    const row = (await listMatchFinance(wide)).find((x) => x.id === m.match.id);
    expect(row?.revenueCents).toBe(800);
  });

  // BEKANNTE PRODUKTLÜCKE (Backlog 188): Die Detailseite /admin/finanzen/spiel/[id] rechnet "Einnahmen" als Summe von playerFinance().netCents; playerFinance liest nur wallet-Konten,
  // die Kartenabbuchung (clearing -> revenue, ohne Nutzer) ist dort unsichtbar. it.fails: wird grün, sobald die Lücke geschlossen ist (dann it.fails -> it).
  it.fails("Spiel-Detailseite: Summe der Spieler-Netto-Beträge entspricht dem Erlös der Kartenabbuchung", async () => {
    const { m } = await chargedMatch();
    const players = await playerFinance(m.match.id);
    expect(players.reduce((sum, p) => sum + p.netCents, 0)).toBe(800);
  });
});
