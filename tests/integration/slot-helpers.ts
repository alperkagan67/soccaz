import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, paymentCharges, paymentProfiles } from "@/db/schema";
import type { FakeProvider } from "@/server/payments/fake";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, makeMatch } from "./helpers";

// Gemeinsame Hilfen fuer die Tests zu Nachrueckern, Auto-Absage und spaetem Erfolg (Vertrag 012, M3c-2).

let seq = 0;
export const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
const MIN = 60_000;

export async function withCard(userId: string) {
  const customerId = nid("cus_sh");
  await db.insert(paymentProfiles).values({ userId, stripeCustomerId: customerId, paymentMethodId: nid("pm_sh") });
  return customerId;
}

/**
 * Spiel mit einem Zahlungsunfaehigen `root` (Heimteam, Abbuchung failed, Fenster abgelaufen), `mate` und den beiden Captains. Mit `realPaid` werden deren Abbuchungen
 * ECHT verbucht (Webhook payment_intent.succeeded: Hauptbuch clearing -> revenue), sonst nur als Zeilen angelegt. `waitlist` Spieler stehen auf der Warteliste.
 */
export async function slotGame(provider: FakeProvider, opts: { waitlist?: number; windowMs?: number | null; realPaid?: boolean } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const root = await addPlayer(m.match.id, m.home.id, "shr");
  const mate = await addPlayer(m.match.id, m.home.id, "shm");
  const rootCustomer = await withCard(root.id);
  const mateCustomer = await withCard(mate.id);
  const graceUntil = opts.windowMs === null ? null : new Date(Date.now() + (opts.windowMs ?? -MIN));
  const rootPi = nid("pi_shr");
  const [rootRow] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: root.id, amountCents: 800, status: "failed", failureCode: "card_declined", graceUntil, idempotencyKey: `charge:${m.match.id}:${root.id}`, paymentIntentId: rootPi }).returning();
  await db.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, root.id)));

  const payers = [
    { u: mate, customer: mateCustomer },
    { u: m.adminA, customer: await withCard(m.adminA.id) },
    { u: m.adminB, customer: await withCard(m.adminB.id) },
  ];
  const payerRows = [];
  for (const { u, customer } of payers) {
    const pi = nid("pi_shp");
    const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, status: opts.realPaid ? "pending" : "succeeded", idempotencyKey: `charge:${m.match.id}:${u.id}`, paymentIntentId: pi }).returning();
    await db.update(matchParticipants).set({ cardStatus: opts.realPaid ? "charge_pending" : "charged" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
    if (opts.realPaid) {
      const e = provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: pi, amount: 800, currency: "eur", customer, metadata: { matchId: m.match.id, userId: u.id } } });
      await handleStripeWebhook(e.rawBody, e.signature);
    }
    payerRows.push(row);
  }

  const waiters = [];
  const base = Date.now() - 3_600_000;
  for (let i = 0; i < (opts.waitlist ?? 0); i++) {
    const w = await addPlayer(m.match.id, m.home.id, `shw${i}`);
    await withCard(w.id);
    await db.update(matchParticipants).set({ teamId: null, cardStatus: "card_ready", joinedAt: new Date(base + i * 1000) }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, w.id)));
    waiters.push(w);
  }
  return { ...m, root, mate, rootRow, rootPi, rootCustomer, payerRows, waiters };
}
export type SlotGame = Awaited<ReturnType<typeof slotGame>>;

export const childrenOf = (g: SlotGame) => db.select().from(paymentCharges).where(eq(paymentCharges.slotOf, g.rootRow.id)).orderBy(asc(paymentCharges.createdAt));

/** Stripe meldet (spaet) einen erfolgreichen PaymentIntent zur Abbuchung des Spielers. */
export function lateSuccess(provider: FakeProvider, g: SlotGame, piId: string, userId = g.root.id, customer = g.rootCustomer) {
  const e = provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: piId, amount: 800, currency: "eur", customer, metadata: { matchId: g.match.id, userId } } });
  return handleStripeWebhook(e.rawBody, e.signature);
}
