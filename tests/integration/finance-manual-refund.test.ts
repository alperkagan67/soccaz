import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications, paymentCharges, paymentDisputes, paymentProfiles, paymentRefunds } from "@/db/schema";
import { getRefundAlerts, manualRefund, matchMoneyOf, playerFinance } from "@/server/finance";
import { ensureRefundRow } from "@/server/payments/charge";
import { adminCancelMatch } from "@/server/payments/refund";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// 012 M6b 1c-iii (b): Ausnahme-Erstattung per Stripe (payment_refunds) für die GANZE Abbuchung; keine Guthaben-Gutschrift mehr für Kartenzahlungen.
let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(cleanup);

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type Game = Awaited<ReturnType<typeof makeMatch>>;
/** Erfolgreich abgebuchte Zeile (800) für den Sitzplatz; optional zahlt ein anderer (Übernahme). */
async function paidCharge(m: Game, seat: { id: string }, payerUserId: string | null = null) {
  const payer = payerUserId ?? seat.id;
  await db.insert(paymentProfiles).values({ userId: payer, stripeCustomerId: nid("cus_mr"), paymentMethodId: nid("pm_mr") }).onConflictDoNothing();
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, payer));
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, seat.id)));
  const piId = nid("pi_mr");
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: seat.id, payerUserId, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${seat.id}`, paymentIntentId: piId }).returning();
  const e = provider.signEvent({ id: nid("evt_mr"), type: "payment_intent.succeeded", object: { id: piId, amount: 800, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: m.match.id, userId: seat.id } } });
  expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
  return row;
}
const refundsOf = (chargeId: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, chargeId));
const refundCalls = () => provider.calls.filter((c) => c.method === "createRefund");

describe("Ausnahme-Erstattung per Stripe (ganze Abbuchung)", () => {
  it("erstattet die ganze Abbuchung auf die Karte: Zeile succeeded, Rückbuchung im Hauptbuch, Einnahmen und Spieler-Netto 0, Protokoll und Mitteilung", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mr");
    const charge = await paidCharge(m, u);
    expect((await matchMoneyOf([m.match.id])).get(m.match.id)!.revenueCents).toBe(800);
    await manualRefund(m.adminA.id, m.match.id, u.id, 800, "Verletzung vor dem Spiel");
    const rows = await refundsOf(charge.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "succeeded", amountCents: 800, userId: u.id });
    expect(rows[0].reason).toContain("Ausnahme-Erstattung: Verletzung vor dem Spiel");
    expect(refundCalls()).toHaveLength(1);
    expect((await matchMoneyOf([m.match.id])).get(m.match.id)!.revenueCents).toBe(0);
    expect((await playerFinance(m.match.id)).find((p) => p.userId === u.id)).toMatchObject({ paidCents: 800, refundedCents: 800, netCents: 0, cardRefundableCents: 0 });
    expect((await db.select().from(auditLog).where(and(eq(auditLog.entityId, m.match.id), eq(auditLog.action, "payment.manual_refund")))).length).toBe(1);
    expect((await db.select().from(notifications).where(eq(notifications.userId, u.id))).some((n) => n.title === "Erstattung")).toBe(true);
  });

  it("Teilbeträge sind nicht möglich: nur die ganze Abbuchung, klare Meldung, nichts angelegt, nichts gesendet", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mt");
    const charge = await paidCharge(m, u);
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 500, "zu wenig")).rejects.toThrow(/ganze Abbuchung.*8,00/);
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 900, "zu viel")).rejects.toThrow(/ganze Abbuchung/);
    expect(await refundsOf(charge.id)).toHaveLength(0);
    expect(refundCalls()).toHaveLength(0);
  });

  it("zweiter Versuch derselben Abbuchung: klare Meldung, keine zweite Erstattung, kein zweiter Stripe-Aufruf", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "m2");
    const charge = await paidCharge(m, u);
    await manualRefund(m.adminA.id, m.match.id, u.id, 800, "erster Grund");
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "nochmal")).rejects.toThrow(/schon eine Erstattung/);
    expect(await refundsOf(charge.id)).toHaveLength(1);
    expect(refundCalls()).toHaveLength(1);
  });

  it("Stripe lehnt ab: Zeile failed, nichts im Hauptbuch zurückgebucht, Alarm für Admin 1, kein Guthaben-Fallback, ein neuer Versuch wird nicht angelegt", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mf");
    const charge = await paidCharge(m, u);
    provider.setRefundOutcome(u.id, "failed");
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "wird abgelehnt")).rejects.toThrow(/Stripe hat die Erstattung abgelehnt.*refund_failed/);
    const rows = await refundsOf(charge.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "failed", failureCode: "refund_failed" });
    expect((await matchMoneyOf([m.match.id])).get(m.match.id)!.revenueCents).toBe(800); // nichts zurückgebucht
    const alerts = await getRefundAlerts();
    expect(JSON.stringify(alerts)).toContain(rows[0].id);
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "nochmal")).rejects.toThrow(/schon eine Erstattung/);
    expect(await refundsOf(charge.id)).toHaveLength(1);
  });

  it("Übernahme: die Erstattung geht an den Zahler (nicht an den Sitzplatz); der Sitzplatz selbst hat nichts zu erstatten", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const seat = await addPlayer(m.match.id, m.home.id, "ms");
    const payer = await addPlayer(m.match.id, m.home.id, "my");
    const charge = await paidCharge(m, seat, payer.id);
    await expect(manualRefund(m.adminA.id, m.match.id, seat.id, 800, "falscher Empfänger")).rejects.toThrow(/nichts bezahlt.*Übernahme/);
    await manualRefund(m.adminA.id, m.match.id, payer.id, 800, "Zahler");
    const rows = await refundsOf(charge.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(payer.id);
  });

  it("eine spätere Absage legt keine zweite Erstattung an (ensureRefundRow ist idempotent je Abbuchung)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mc");
    const charge = await paidCharge(m, u);
    await manualRefund(m.adminA.id, m.match.id, u.id, 800, "Ausnahme");
    await db.transaction((tx) => ensureRefundRow(tx, charge, "Absage"));
    expect(await refundsOf(charge.id)).toHaveLength(1);
    expect(refundCalls()).toHaveLength(1);
  });

  it("Zahlungsstreit: kein Erfolg vortäuschen: klare Ablehnung, keine Erstattungszeile, kein Audit, keine Mitteilung, kein Stripe-Aufruf", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "md");
    const charge = await paidCharge(m, u);
    await db.insert(paymentDisputes).values({ disputeId: nid("dp_mr"), chargeId: charge.id, paymentIntentId: charge.paymentIntentId, matchId: m.match.id, payerUserId: u.id, amountCents: 800, currency: "eur", status: "needs_response" });
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "trotz Streit")).rejects.toThrow(/Zahlungsstreit/);
    expect(await refundsOf(charge.id)).toHaveLength(0); // die Transaktion rollt zurück
    expect(refundCalls()).toHaveLength(0);
    expect((await db.select().from(auditLog).where(and(eq(auditLog.entityId, m.match.id), eq(auditLog.action, "payment.manual_refund")))).length).toBe(0);
    expect((await db.select().from(notifications).where(eq(notifications.userId, u.id))).some((n) => n.title === "Erstattung")).toBe(false);
  });

  it("Stripe antwortet noch nicht endgültig (pending): kein Fehler, Zeile pending mit Refund-ID, noch keine Rückbuchung im Hauptbuch", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mp");
    const charge = await paidCharge(m, u);
    provider.setRefundOutcome(u.id, "pending");
    await manualRefund(m.adminA.id, m.match.id, u.id, 800, "wartet");
    const rows = await refundsOf(charge.id);
    expect(rows[0]).toMatchObject({ status: "pending" });
    expect(rows[0].refundId).not.toBeNull();
    expect((await matchMoneyOf([m.match.id])).get(m.match.id)!.revenueCents).toBe(800);
  });

  it("zwei parallele Ausnahme-Erstattungen derselben Abbuchung: genau eine Zeile, genau ein Stripe-Aufruf, die zweite wird mit Meldung abgelehnt (kein 500/Deadlock)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mq");
    const charge = await paidCharge(m, u);
    const results = await Promise.allSettled([manualRefund(m.adminA.id, m.match.id, u.id, 800, "parallel eins"), manualRefund(m.adminA.id, m.match.id, u.id, 800, "parallel zwei")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason?.message ?? rejected.reason)).toMatch(/schon eine Erstattung/);
    expect(await refundsOf(charge.id)).toHaveLength(1);
    expect(refundCalls()).toHaveLength(1);
  });

  it("Absage und Ausnahme-Erstattung gleichzeitig: kein Deadlock, genau eine Erstattungszeile je Abbuchung", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "mx");
    const charge = await paidCharge(m, u);
    const admin = await makeUser("mradm", "admin");
    const results = await Promise.allSettled([adminCancelMatch(admin.id, m.match.id, "Absage parallel"), manualRefund(m.adminA.id, m.match.id, u.id, 800, "parallel zur Absage")]);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason?.message ?? r.reason)).not.toMatch(/deadlock|40P01|could not serialize/i);
    expect(await refundsOf(charge.id)).toHaveLength(1);
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].id).toBe(m.match.id);
  });
});
