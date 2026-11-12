import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches, paymentCharges, paymentRefunds, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { getRefundAlerts } from "@/server/finance";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { adminCancelMatch, runRefunds } from "@/server/payments/refund";
import { runSubstitutes } from "@/server/payments/substitute";
import { setSetting } from "@/server/settings";
import { cleanup, makeUser } from "./helpers";
import { childrenOf, lateSuccess, nid, slotGame } from "./slot-helpers";

// Vertrag 012, M3c-2b (Entscheid t9): Erfolg eines alten PaymentIntents NACH dem Ersatz des Platzes (oder ein zweiter erfolgreicher PaymentIntent zur selben Zeile) =>
// buchen (clearing -> revenue) UND sofort voll erstatten (revenue -> clearing) + Admin-Alarm. Hauptbuch ausgeglichen, nie ein stilles Behalten.

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sh_%"));
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sh_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const ledgerOf = (matchId: string) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, matchId));
const refundsOf = (matchId: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, matchId));
const rowOf = async (id: string) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, id)))[0];
const duplicateAudits = async (matchId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.duplicate_success"), eq(auditLog.entityId, matchId)))).length;

describe("spaeter Erfolg eines alten PaymentIntents nach dem Ersatz", () => {
  it("wird gebucht UND voll erstattet (PaymentIntent des ersetzten Platzes), Hauptbuch ausgeglichen, Alarm; der Nachruecker bleibt unberuehrt", async () => {
    const g = await slotGame(provider, { waitlist: 1, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    const [kid] = await childrenOf(g);
    expect(kid.status).toBe("succeeded");
    const before = (await ledgerOf(g.match.id)).filter((e) => e.kind === "match_share").length;

    const res = await lateSuccess(provider, g, g.rootPi);
    expect(res.status).toBe(200);

    const root = await rowOf(g.rootRow.id);
    expect(root).toMatchObject({ status: "succeeded", resolution: "replaced", paymentIntentId: g.rootPi });
    const shares = (await ledgerOf(g.match.id)).filter((e) => e.kind === "match_share");
    expect(shares).toHaveLength(before + 1);
    expect(shares.some((e) => e.idempotencyKey === `charge:${g.rootPi}`)).toBe(true);

    const refunds = (await refundsOf(g.match.id)).filter((r) => r.chargeId === g.rootRow.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ amountCents: 800, status: "pending" });

    await runRefunds();
    const sent = provider.calls.filter((c) => c.method === "createRefund").filter((c) => (c.args as { metadata: { chargeId: string } }).metadata.chargeId === g.rootRow.id);
    expect(sent).toHaveLength(1);
    expect((sent[0].args as { paymentIntentId: string }).paymentIntentId).toBe(g.rootPi);
    expect((await refundsOf(g.match.id)).find((r) => r.chargeId === g.rootRow.id)!.status).toBe("succeeded");
    const refundEntries = (await ledgerOf(g.match.id)).filter((e) => e.kind === "refund");
    expect(refundEntries).toHaveLength(1);
    expect(refundEntries[0]).toMatchObject({ debitAccount: "revenue", creditAccount: "clearing", amountCents: 800 });
    expect((await trialBalance()).balanced).toBe(true);

    // der Nachruecker und das Spiel bleiben unberuehrt
    expect((await childrenOf(g))[0].status).toBe("succeeded");
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].status).not.toBe("cancelled");
    // Alarm
    expect(await duplicateAudits(g.match.id)).toBe(1);
    expect((await getRefundAlerts()).duplicateSuccesses.map((a) => a.matchId)).toContain(g.match.id);
  });

  it("dasselbe Ereignis doppelt: genau eine Buchung, genau eine Erstattung, ein Alarm", async () => {
    const g = await slotGame(provider, { waitlist: 1, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    await lateSuccess(provider, g, g.rootPi);
    await lateSuccess(provider, g, g.rootPi);
    await runRefunds();
    await runRefunds();
    expect((await ledgerOf(g.match.id)).filter((e) => e.idempotencyKey === `charge:${g.rootPi}`)).toHaveLength(1);
    expect((await refundsOf(g.match.id)).filter((r) => r.chargeId === g.rootRow.id)).toHaveLength(1);
    expect(provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { chargeId: string } }).metadata.chargeId === g.rootRow.id)).toHaveLength(1);
    expect(await duplicateAudits(g.match.id)).toBe(1);
  });

  it("ein fehlgeschlagenes Ereignis zu einem ersetzten Platz aendert nichts", async () => {
    const g = await slotGame(provider, { waitlist: 1, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    const e = provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.payment_failed", object: { id: g.rootPi, amount: 800, currency: "eur", customer: g.rootCustomer, metadata: { matchId: g.match.id, userId: g.root.id }, last_payment_error: { code: "card_declined" } } });
    const { handleStripeWebhook } = await import("@/server/payments/webhook");
    await handleStripeWebhook(e.rawBody, e.signature);
    expect(await rowOf(g.rootRow.id)).toMatchObject({ status: "failed", resolution: "replaced" });
    expect((await refundsOf(g.match.id)).filter((r) => r.chargeId === g.rootRow.id)).toHaveLength(0);
  });

  it("falscher Betrag, falscher Kunde oder fremder Nutzer: nichts wird gebucht oder erstattet", async () => {
    const g = await slotGame(provider, { waitlist: 1, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    const stranger = await makeUser("sl");
    const bad = [
      provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: nid("pi_x"), amount: 999, currency: "eur", customer: g.rootCustomer, metadata: { matchId: g.match.id, userId: g.root.id } } }),
      provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: nid("pi_y"), amount: 800, currency: "eur", customer: "cus_fremd", metadata: { matchId: g.match.id, userId: g.root.id } } }),
      provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: nid("pi_z"), amount: 800, currency: "eur", customer: g.rootCustomer, metadata: { matchId: g.match.id, userId: stranger.id } } }),
    ];
    const { handleStripeWebhook } = await import("@/server/payments/webhook");
    const before = (await ledgerOf(g.match.id)).length;
    for (const e of bad) await handleStripeWebhook(e.rawBody, e.signature);
    expect((await ledgerOf(g.match.id)).length).toBe(before);
    expect((await refundsOf(g.match.id)).filter((r) => r.chargeId === g.rootRow.id)).toHaveLength(0);
  });
});

describe("zweiter erfolgreicher PaymentIntent zur selben Zeile (Doppelabbuchung)", () => {
  it("wird gebucht und mit EIGENER Erstattung (PaymentIntent des zweiten) voll erstattet; die erste Abbuchung bleibt", async () => {
    const g = await slotGame(provider, { waitlist: 0, windowMs: 60 * 60_000, realPaid: true });
    const mateRow = g.payerRows[0];
    const second = nid("pi_dup");
    await lateSuccess(provider, g, second, mateRow.userId, (await import("@/db/schema").then(async (m) => (await db.select().from(m.paymentProfiles).where(eq(m.paymentProfiles.userId, mateRow.userId)))[0].stripeCustomerId)));
    const refunds = (await refundsOf(g.match.id)).filter((r) => r.chargeId === mateRow.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0].paymentIntentId).toBe(second);
    expect(refunds[0].idempotencyKey).toBe(`refund:${mateRow.id}:${second}`);
    await runRefunds();
    const call = provider.calls.find((c) => c.method === "createRefund" && (c.args as { metadata: { chargeId: string } }).metadata.chargeId === mateRow.id);
    expect((call!.args as { paymentIntentId: string }).paymentIntentId).toBe(second);
    expect((await rowOf(mateRow.id)).status).toBe("succeeded");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Absage nach einer Doppelabbuchung: BEIDE Erstattungen (Standard und weitere) muessen durch sein, bevor das Spiel 'abgesagt' ist", async () => {
    const g = await slotGame(provider, { waitlist: 0, windowMs: 60 * 60_000, realPaid: true });
    const mateRow = g.payerRows[0];
    const { paymentProfiles } = await import("@/db/schema");
    const customer = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, mateRow.userId)))[0].stripeCustomerId;
    const second = nid("pi_dup2");
    await lateSuccess(provider, g, second, mateRow.userId, customer);
    const admin = await makeUser("sl", "admin");
    await adminCancelMatch(admin.id, g.match.id, "Absage Test");
    await runRefunds();
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].status).toBe("cancelled");
    const mine = (await refundsOf(g.match.id)).filter((r) => r.chargeId === mateRow.id);
    expect(mine).toHaveLength(2); // Standard + weiterer PaymentIntent
    expect(mine.every((r) => r.status === "succeeded")).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("scheitert die WEITERE Erstattung (Doppelabbuchung), wird das Spiel NICHT als abgesagt abgeschlossen, obwohl die Standard-Erstattung durch ist", async () => {
    const g = await slotGame(provider, { waitlist: 0, windowMs: 60 * 60_000, realPaid: true });
    const mateRow = g.payerRows[0];
    const { paymentProfiles } = await import("@/db/schema");
    const customer = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, mateRow.userId)))[0].stripeCustomerId;
    const second = nid("pi_dup3");
    await lateSuccess(provider, g, second, mateRow.userId, customer);
    await db.update(paymentRefunds).set({ status: "failed", failureCode: "refund_failed" }).where(and(eq(paymentRefunds.chargeId, mateRow.id), eq(paymentRefunds.paymentIntentId, second)));
    const admin = await makeUser("sl", "admin");
    await adminCancelMatch(admin.id, g.match.id, "Absage Test");
    await runRefunds();
    const m = (await db.select().from(matches).where(eq(matches.id, g.match.id)))[0];
    expect(m.status).not.toBe("cancelled"); // bleibt offen (Admin-Alarm), nie ohne vollstaendige Erstattung
    expect(m.cancelRequestedAt).not.toBeNull();
  });
});

describe("spaeter Erfolg eines ERSETZTEN Nachrueckers (security-reviewer, Fund 1)", () => {
  it("der Platz zaehlt NICHT als besetzt: der naechste Kandidat rueckt nach, abgerechnet wird erst mit ihm; der spaete Erfolg wird gebucht und erstattet", async () => {
    const g = await slotGame(provider, { waitlist: 2, realPaid: true });
    provider.setChargeOutcome(g.waiters[0].id, "processing"); // Ausgang kommt per Webhook
    await runSubstitutes({ matchId: g.match.id });
    const [kid0] = await childrenOf(g);
    expect(kid0.status).toBe("pending");
    const { paymentProfiles } = await import("@/db/schema");
    const customer = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, g.waiters[0].id)))[0].stripeCustomerId;
    const piOf = (await rowOf(kid0.id)).paymentIntentId ?? "pi_fake_x";
    const { handleStripeWebhook } = await import("@/server/payments/webhook");
    const failed = provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.payment_failed", object: { id: piOf, amount: 800, currency: "eur", customer, metadata: { matchId: g.match.id, userId: g.waiters[0].id }, last_payment_error: { code: "card_declined" } } });
    await handleStripeWebhook(failed.rawBody, failed.signature);
    expect(await rowOf(kid0.id)).toMatchObject({ status: "failed", resolution: "replaced" });

    // der gescheiterte Nachruecker wird doch erfolgreich gemeldet (PaymentIntent war noch offen)
    await lateSuccess(provider, g, piOf, g.waiters[0].id, customer);
    expect(await rowOf(kid0.id)).toMatchObject({ status: "succeeded", resolution: "replaced" });
    expect((await refundsOf(g.match.id)).filter((r) => r.chargeId === kid0.id)).toHaveLength(1); // voll erstattet

    // der Platz ist NICHT besetzt: der naechste Kandidat rueckt nach
    await runSubstitutes({ matchId: g.match.id });
    const kids = await childrenOf(g);
    expect(kids.map((k) => k.userId)).toEqual([g.waiters[0].id, g.waiters[1].id]);
    expect(kids[1].status).toBe("succeeded");
  });

  it("settleIfComplete: nur der ersetzte Nachruecker war erfolgreich => NICHT abgerechnet", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    await db.update(paymentCharges).set({ resolution: "replaced", slotTeamId: g.home.id }).where(eq(paymentCharges.id, g.rootRow.id));
    await db.delete((await import("@/db/schema")).matchParticipants).where(and(eq((await import("@/db/schema")).matchParticipants.matchId, g.match.id), eq((await import("@/db/schema")).matchParticipants.userId, g.root.id)));
    const u = await makeUser("slr");
    await db.insert(paymentCharges).values({ matchId: g.match.id, userId: u.id, amountCents: 800, status: "succeeded", resolution: "replaced", slotOf: g.rootRow.id, idempotencyKey: `charge:${g.match.id}:${u.id}`, paymentIntentId: nid("pi_k") });
    const { settleIfComplete } = await import("@/server/payments/charge");
    expect(await db.transaction((tx) => settleIfComplete(tx, g.match.id))).toBe(false);
  });
});
