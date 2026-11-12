import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, notifications, paymentChargeAttempts, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { GRACE_MS, inGraceWindow } from "@/lib/grace";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { runCharges } from "@/server/payments/charge-run";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-1: Nachzahlfenster (AC-6) und Wiederabbuchen im Fenster (AC-7).

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_gr_%"));
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_gr_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
const H = 3_600_000;

/** Spiel in `hoursAhead` Stunden mit einem Spieler, der eine offene Abbuchung (Versuch 1, pending) und eine Karte hat. */
async function game(hoursAhead = 72) {
  const m = await makeMatch({ hoursAhead, priceCents: 8000, costCents: 8000 });
  const u = await addPlayer(m.match.id, m.home.id, "gr");
  const customerId = nid("cus_gr");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_gr") });
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  const piId = nid("pi_gr");
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${u.id}`, paymentIntentId: piId }).returning();
  return { ...m, u, customerId, piId, row };
}
type G = Awaited<ReturnType<typeof game>>;

const send = (g: G, type: string, code: string | null, over: Record<string, unknown> = {}) => {
  const object = { id: g.piId, amount: 800, currency: "eur", customer: g.customerId, metadata: { matchId: g.match.id, userId: g.u.id }, last_payment_error: code ? { code } : undefined, ...over };
  const e = provider.signEvent({ id: nid("evt_gr"), type, object });
  return handleStripeWebhook(e.rawBody, e.signature);
};
const rowOf = async (g: G) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id)))[0];
const attemptsOf = async (g: G) => db.select().from(paymentChargeAttempts).where(eq(paymentChargeAttempts.chargeId, g.row.id)).orderBy(asc(paymentChargeAttempts.attemptNo));

describe("AC-6: Nachzahlfenster beginnt mit dem ersten Fehler", () => {
  it("viel Zeit bis zum Anstoss: grace_until = Fehlerzeitpunkt + 2 Stunden", async () => {
    const g = await game(72);
    const before = Date.now();
    await send(g, "payment_intent.payment_failed", "card_declined");
    const r = await rowOf(g);
    expect(r.status).toBe("failed");
    expect(r.graceUntil).not.toBeNull();
    const delta = r.graceUntil!.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(GRACE_MS - 1000);
    expect(delta).toBeLessThanOrEqual(GRACE_MS + 60_000);
  });

  it("Anstoss in 2,5 Stunden: das Fenster endet 1 Stunde vor dem Anstoss", async () => {
    const g = await game(2.5);
    await send(g, "payment_intent.payment_failed", "card_declined");
    const r = await rowOf(g);
    expect(Math.abs(r.graceUntil!.getTime() - (g.match.startsAt.getTime() - H))).toBeLessThan(1000);
  });

  it("weniger als 1 Stunde bis zum Anstoss: kein Fenster (grace_until = Fehlzeitpunkt, sofort abgelaufen), der Platz ist trotzdem failed", async () => {
    const g = await game(0.9);
    await send(g, "payment_intent.payment_failed", "card_declined");
    const r = await rowOf(g);
    expect(r.status).toBe("failed");
    expect(r.graceUntil).not.toBeNull(); // immer gesetzt: NULL bleibt den Altzeilen vorbehalten
    expect(Math.abs(r.graceUntil!.getTime() - Date.now())).toBeLessThan(5000);
    expect(inGraceWindow(r.graceUntil, g.match.startsAt, new Date())).toBe(false);
  });

  it("das Fenster wird nur beim ERSTEN Fehler gesetzt: requires_action -> failed oder ein Codewechsel verschieben es nicht", async () => {
    const g = await game(72);
    await send(g, "payment_intent.requires_action", null);
    const first = (await rowOf(g)).graceUntil!;
    expect(first).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    await send(g, "payment_intent.payment_failed", "card_declined");
    expect((await rowOf(g)).graceUntil!.getTime()).toBe(first.getTime());
    await send(g, "payment_intent.payment_failed", "insufficient_funds");
    expect((await rowOf(g)).graceUntil!.getTime()).toBe(first.getTime());
  });

  it("ein Erfolg setzt kein Fenster", async () => {
    const g = await game(72);
    await send(g, "payment_intent.succeeded", null);
    expect((await rowOf(g)).graceUntil).toBeNull();
  });

  it("die Benachrichtigung nennt das Ende des Fensters (Betroffener und Captain), Dritte bekommen nichts", async () => {
    const g = await game(72);
    await send(g, "payment_intent.payment_failed", "card_declined");
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.u.id, g.adminA.id, g.adminB.id]));
    expect(notes.filter((n) => n.userId === g.adminB.id)).toHaveLength(0);
    for (const n of notes) expect(n.body).toMatch(/bis \d{1,2}[:.]\d{2} Uhr/);
  });

  it("ohne Fenster nennt die Nachricht keine Frist", async () => {
    const g = await game(0.9);
    await send(g, "payment_intent.payment_failed", "card_declined");
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.u.id, g.adminA.id]));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.body).not.toMatch(/bis \d{1,2}[:.]\d{2} Uhr/);
  });
});

describe("Technische Zustaende (kein Kartenfehler): kein Fenster, keine Spielernachricht", () => {
  it("Schluesselkonflikt bei Stripe (idempotency_mismatch): Zeile failed, grace_until bleibt NULL, niemand wird benachrichtigt (Admin-Alarm)", async () => {
    const g = await game(72);
    await db.update(paymentCharges).set({ paymentIntentId: null }).where(eq(paymentCharges.id, g.row.id));
    provider.setChargeOutcome(g.u.id, "idempotency_mismatch");
    await runCharges(g.match.id);
    const r = await rowOf(g);
    expect(r).toMatchObject({ status: "failed", failureCode: "idempotency_mismatch", graceUntil: null });
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.u.id, g.adminA.id, g.adminB.id]));
    expect(notes).toHaveLength(0);
  });
});

describe("AC-6: auch ein Problem vor dem Senden (keine Karte) beginnt das Fenster und benachrichtigt", () => {
  it("Zahlungsprofil ohne Zahlungsmittel: Zeile failed (no_payment_method), grace_until gesetzt, Betroffener und Captain benachrichtigt", async () => {
    const g = await game(72);
    await db.update(paymentCharges).set({ paymentIntentId: null }).where(eq(paymentCharges.id, g.row.id));
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, g.u.id));
    await runCharges(g.match.id);
    const r = await rowOf(g);
    expect(r).toMatchObject({ status: "failed", failureCode: "no_payment_method" });
    expect(r.graceUntil).not.toBeNull();
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.u.id, g.adminA.id, g.adminB.id]));
    expect(notes.map((n) => n.userId).sort()).toEqual([g.u.id, g.adminA.id].sort());
  });
});

// Platzhalter fuer die folgenden Gruppen (Wiederabbuchen, alte Ereignisse, Parallelitaet): siehe weitere describe-Bloecke
void [paymentChargeAttempts, ledgerEntries, attemptsOf];
