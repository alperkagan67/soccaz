import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, notifications, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3b AC-1 (P0): Schlägt eine Abbuchung fehl, bekommen der Betroffene UND der Captain/Veranstalter seines Teams eine Benachrichtigung
// (Push/Mail über die Outbox) mit Grund und Weg "Karte ändern". NIEMAND sonst (AC-12/AC-20: keine Benachrichtigung an Dritte).

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_fn_%"));
});
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_fn_%"));
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Zwei Teams mit je Captain und einem weiteren Spieler; der Spieler des Heimteams (`victim`) hat eine offene Abbuchung. */
async function game(opts: { victimIsCaptain?: boolean } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const homeMate = await addPlayer(m.match.id, m.home.id, "fn");
  const awayMate = await addPlayer(m.match.id, m.away.id, "fn");
  const victim = opts.victimIsCaptain ? m.adminA : homeMate;
  const customerId = nid("cus_fn");
  await db.insert(paymentProfiles).values({ userId: victim.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_fn") });
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, victim.id)));
  const piId = nid("pi_fn");
  await db.insert(paymentCharges).values({ matchId: m.match.id, userId: victim.id, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${victim.id}`, paymentIntentId: piId });
  return { ...m, homeMate, awayMate, victim, customerId, piId };
}
type G = Awaited<ReturnType<typeof game>>;

const send = (g: G, type: string, code: string | null) => {
  const object = { id: g.piId, amount: 800, currency: "eur", customer: g.customerId, metadata: { matchId: g.match.id, userId: g.victim.id }, last_payment_error: code ? { code } : undefined };
  const e = provider.signEvent({ id: nid("evt_fn"), type, object });
  return handleStripeWebhook(e.rawBody, e.signature);
};
const everyone = (g: G) => [g.adminA.id, g.adminB.id, g.homeMate.id, g.awayMate.id];
const notesOf = (ids: string[]) => db.select().from(notifications).where(inArray(notifications.userId, ids));

describe("AC-1: Benachrichtigung bei fehlgeschlagener Abbuchung", () => {
  it("Betroffener und Captain bekommen genau eine Nachricht mit Grund und Link; Gegner, Gegner-Captain und andere Spieler nichts", async () => {
    const g = await game();
    await send(g, "payment_intent.payment_failed", "insufficient_funds");
    const notes = await notesOf(everyone(g));
    const byUser = (id: string) => notes.filter((n) => n.userId === id);

    expect(byUser(g.victim.id)).toHaveLength(1);
    expect(byUser(g.adminA.id)).toHaveLength(1); // Captain des Heimteams
    expect(byUser(g.adminB.id)).toHaveLength(0); // Gegner-Captain
    expect(byUser(g.awayMate.id)).toHaveLength(0);
    expect(notes).toHaveLength(2);

    const mine = byUser(g.victim.id)[0];
    expect(mine.type).toBe("payment");
    expect(mine.title).toMatch(/Abbuchung fehlgeschlagen/);
    expect(mine.body).toMatch(/nicht genug Guthaben/); // Klartext des Grundes
    expect(mine.body).toMatch(/Karte ändern/);
    expect(mine.url).toBe(`/lobby/${g.match.id}`);

    const captain = byUser(g.adminA.id)[0];
    expect(captain.title).toMatch(/Abbuchung fehlgeschlagen/);
    expect(captain.body).toMatch(/nicht genug Guthaben/);
    expect(captain.body).toContain(g.victim.name); // der Captain erfährt, wen es betrifft
    expect(captain.url).toBe(`/lobby/${g.match.id}`);
  });

  it("kein Rohcode, keine Stripe-ID in den Texten", async () => {
    const g = await game();
    await send(g, "payment_intent.payment_failed", "insufficient_funds");
    const text = JSON.stringify(await notesOf(everyone(g)));
    expect(text).not.toMatch(/insufficient_funds|pi_fn|cus_fn|pm_fn/);
  });

  it("dasselbe Ereignis nochmal (oder ein zweites gleiches) erzeugt keine weitere Nachricht", async () => {
    const g = await game();
    await send(g, "payment_intent.payment_failed", "card_declined");
    await send(g, "payment_intent.payment_failed", "card_declined");
    expect(await notesOf(everyone(g))).toHaveLength(2);
  });

  it("ist der Betroffene selbst der Captain, bekommt er nur EINE Nachricht", async () => {
    const g = await game({ victimIsCaptain: true });
    await send(g, "payment_intent.payment_failed", "card_declined");
    const notes = await notesOf(everyone(g));
    expect(notes).toHaveLength(1);
    expect(notes[0].userId).toBe(g.adminA.id);
  });

  it("requires_action (Bank-Bestätigung nötig): Betroffener und Captain werden ebenfalls informiert, mit dem passenden Text", async () => {
    const g = await game();
    await send(g, "payment_intent.requires_action", null);
    const notes = await notesOf(everyone(g));
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => /Bestätigung/.test(n.body))).toBe(true);
  });

  it("unbekannter Fehlercode: allgemeiner Text, kein Rohcode", async () => {
    const g = await game();
    await send(g, "payment_intent.payment_failed", "weird_new_code");
    const text = JSON.stringify(await notesOf(everyone(g)));
    expect(text).toMatch(/hat nicht geklappt/);
    expect(text).not.toMatch(/weird_new_code/);
  });

  it("der Captain wird anhand des Teams in DIESEM Spiel gefunden (der Betroffene sitzt in einem weiteren Spiel für ein anderes Team)", async () => {
    const g = await game();
    const other = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await db.insert(matchParticipants).values({ matchId: other.match.id, userId: g.victim.id, teamId: other.away.id });
    await send(g, "payment_intent.payment_failed", "card_declined");
    const notes = await notesOf([g.adminA.id, other.adminB.id, other.adminA.id]);
    expect(notes.map((n) => n.userId)).toEqual([g.adminA.id]); // nur der Captain des Teams aus diesem Spiel
  });

  it("ein Erfolg erzeugt keine Fehlernachricht", async () => {
    const g = await game();
    await send(g, "payment_intent.succeeded", null);
    const notes = await notesOf([g.victim.id, g.adminA.id]);
    expect(notes.filter((n) => /fehlgeschlagen/.test(n.title))).toHaveLength(0);
  });
});
