import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentDisputes, paymentProfiles, paymentRefunds } from "@/db/schema";
import { getRefundAlerts, manualRefund, matchMoneyOf } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { adminCancelMatch, listFailedRefundsOfMatch, retryFailedRefund, writeOffFailedRefund } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Backlog 192: fehlgeschlagene Ausnahme-Erstattung: Neuversuch (dieselbe Zeile, derselbe Schluessel) oder Abschreiben (nur Buchungsmarkierung) durch Admin 1; nie doppelt erstatten.
let provider: FakeProvider;
let owner: Awaited<ReturnType<typeof makeUser>>;
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  owner = await makeUser("rr_owner", "owner");
});
afterEach(async () => {
  setPaymentProviderForTests(null);
  await cleanup();
});
afterAll(cleanup);

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type Game = Awaited<ReturnType<typeof makeMatch>>;

async function paidCharge(m: Game, seat: { id: string }) {
  await db.insert(paymentProfiles).values({ userId: seat.id, stripeCustomerId: nid("cus_rr"), paymentMethodId: nid("pm_rr") }).onConflictDoNothing();
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, seat.id));
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, seat.id)));
  const piId = nid("pi_rr");
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: seat.id, payerUserId: null, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${seat.id}`, paymentIntentId: piId }).returning();
  const e = provider.signEvent({ id: nid("evt_rr"), type: "payment_intent.succeeded", object: { id: piId, amount: 800, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: m.match.id, userId: seat.id } } });
  expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
  return row;
}
const refundRow = async (chargeId: string) => (await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, chargeId)))[0];
const refundCalls = () => provider.calls.filter((c) => c.method === "createRefund");
const auditOf = (matchId: string, action: string) => db.select().from(auditLog).where(and(eq(auditLog.entityId, matchId), eq(auditLog.action, action)));
const revenue = async (m: Game) => (await matchMoneyOf([m.match.id])).get(m.match.id)!.revenueCents;

/** Spiel mit einer fehlgeschlagenen Ausnahme-Erstattung (Stripe lehnt ab); danach nimmt Stripe wieder an. */
async function failedSetup(tag: string) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
  const u = await addPlayer(m.match.id, m.home.id, tag);
  const charge = await paidCharge(m, u);
  provider.setRefundOutcome(u.id, "failed");
  await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "wird abgelehnt")).rejects.toThrow(/abgelehnt/);
  const row = await refundRow(charge.id);
  expect(row).toMatchObject({ status: "failed", failureCode: "refund_failed" });
  return { m, u, charge, row };
}

describe("Neuversuch einer fehlgeschlagenen Ausnahme-Erstattung (Admin 1)", () => {
  it("erfolgreich: dieselbe Zeile wird succeeded, derselbe Idempotenzschluessel, Rueckbuchung im Hauptbuch genau einmal, Protokoll mit Admin 1, Alarm weg", async () => {
    const { m, u, charge, row } = await failedSetup("r1");
    expect(await revenue(m)).toBe(800);
    provider.setRefundOutcome(u.id, "succeeded");
    await retryFailedRefund(owner.id, row.id);
    const after = await refundRow(charge.id);
    expect(after).toMatchObject({ id: row.id, status: "succeeded" });
    expect(after.failureCode).toBeNull();
    const calls = refundCalls();
    expect(calls).toHaveLength(2);
    expect((calls[1].args as { idempotencyKey: string }).idempotencyKey).toBe((calls[0].args as { idempotencyKey: string }).idempotencyKey);
    expect(await revenue(m)).toBe(0);
    expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
    const logs = await auditOf(m.match.id, "refund.retry");
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(owner.id);
    expect(JSON.stringify(await getRefundAlerts())).not.toContain(row.id);
  });

  it("scheitert wieder: klare Meldung, Zeile bleibt failed (Alarm bleibt), kein Geld bewegt, ein weiterer Neuversuch ist moeglich", async () => {
    const { m, u, charge, row } = await failedSetup("r2");
    await expect(retryFailedRefund(owner.id, row.id)).rejects.toThrow(/wieder abgelehnt/);
    expect(await refundRow(charge.id)).toMatchObject({ status: "failed", failureCode: "refund_failed" });
    expect(await revenue(m)).toBe(800);
    expect(JSON.stringify(await getRefundAlerts())).toContain(row.id);
    provider.setRefundOutcome(u.id, "succeeded");
    await retryFailedRefund(owner.id, row.id);
    expect((await refundRow(charge.id)).status).toBe("succeeded");
  });

  it("nur Admin 1: Spieler, Betreiber-Admin ohne Admin-1-Recht und unbekannte Nutzer werden abgewiesen, nichts geaendert, nichts gesendet", async () => {
    const { row, charge, u } = await failedSetup("r3");
    const admin2 = await makeUser("rr_adm2", "admin");
    provider.setRefundOutcome(u.id, "succeeded");
    const before = refundCalls().length;
    for (const actor of [u.id, admin2.id, "00000000-0000-0000-0000-000000000000"]) await expect(retryFailedRefund(actor, row.id)).rejects.toThrow(/Nur Admin 1/);
    await expect(writeOffFailedRefund(u.id, row.id, "Grund da")).rejects.toThrow(/Nur Admin 1/);
    expect(refundCalls()).toHaveLength(before);
    expect(await refundRow(charge.id)).toMatchObject({ status: "failed", failureCode: "refund_failed" });
  });

  it("zwei parallele Neuversuche: genau einer wirkt, genau ein weiterer Stripe-Aufruf, eine Zeile, eine Rueckbuchung", async () => {
    const { m, u, charge, row } = await failedSetup("r4");
    provider.setRefundOutcome(u.id, "succeeded");
    const before = refundCalls().length;
    const results = await Promise.allSettled([retryFailedRefund(owner.id, row.id), retryFailedRefund(owner.id, row.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason?.message ?? rejected.reason)).toMatch(/nicht \(mehr\) fehlgeschlagen|gerade von jemand anderem/);
    expect(refundCalls()).toHaveLength(before + 1);
    expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
    expect(await revenue(m)).toBe(0);
  });

  it("Neuversuch parallel zum Webhook refund.updated (succeeded): nie doppelt gebucht, Endzustand succeeded, Hauptbuch genau eine Rueckbuchung", async () => {
    const { m, u, charge, row } = await failedSetup("r5");
    provider.setRefundOutcome(u.id, "pending"); // Stripe nimmt den Neuversuch an, Ergebnis kommt per Webhook
    const ev = provider.signEvent({ id: nid("evt_rr"), type: "refund.updated", object: { id: "re_rr_1", amount: 800, currency: "eur", status: "succeeded", payment_intent: charge.paymentIntentId, metadata: { matchId: m.match.id, userId: u.id, chargeId: charge.id } } });
    const results = await Promise.allSettled([retryFailedRefund(owner.id, row.id), handleStripeWebhook(ev.rawBody, ev.signature), handleStripeWebhook(ev.rawBody, ev.signature)]);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason?.message ?? r.reason)).not.toMatch(/deadlock|40P01|could not serialize/i);
    // falls der Webhook vor dem Neuversuch lief, ist die Zeile schon succeeded (dann weist der Neuversuch ab); sonst wirkt er. In beiden Faellen genau eine Rueckbuchung.
    const final = await refundRow(charge.id);
    expect(final.status === "succeeded" || final.status === "pending").toBe(true);
    if (final.status === "pending") {
      expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
    }
    expect((await refundRow(charge.id)).status).toBe("succeeded");
    expect(await revenue(m)).toBe(0);
    expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
  });

  it("spaetes oder doppeltes failed der ALTEN Erstattung nach einem Neuversuch setzt die neue Zeile nicht wieder auf failed (Review R-T376)", async () => {
    const { m, u, charge, row } = await failedSetup("r8");
    provider.setRefundOutcome(u.id, "pending");
    await retryFailedRefund(owner.id, row.id);
    expect((await refundRow(charge.id)).status).toBe("pending");
    const late = provider.signEvent({ id: nid("evt_rr"), type: "refund.updated", object: { id: row.refundId as string, amount: 800, currency: "eur", status: "failed", failure_reason: "unknown", payment_intent: charge.paymentIntentId, metadata: { matchId: m.match.id, userId: u.id, chargeId: charge.id } } });
    expect((await handleStripeWebhook(late.rawBody, late.signature)).status).toBe(200);
    expect((await refundRow(charge.id)).status).toBe("pending");
  });

  it("nur fehlgeschlagene Zeilen: succeeded, pending und unbekannte IDs werden abgewiesen", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "r6");
    const charge = await paidCharge(m, u);
    await manualRefund(m.adminA.id, m.match.id, u.id, 800, "gelingt");
    const row = await refundRow(charge.id);
    expect(row.status).toBe("succeeded");
    const before = refundCalls().length;
    await expect(retryFailedRefund(owner.id, row.id)).rejects.toThrow(/nicht \(mehr\) fehlgeschlagen/);
    await expect(writeOffFailedRefund(owner.id, row.id, "kein Grund noetig")).rejects.toThrow(/nicht \(mehr\) fehlgeschlagen/);
    await expect(retryFailedRefund(owner.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/nicht gefunden/);
    expect(refundCalls()).toHaveLength(before);
    expect((await refundRow(charge.id)).status).toBe("succeeded");
  });

  it("Zahlungsstreit (charge_disputed): kein Neuversuch, kein Stripe-Aufruf; Abschreiben bleibt moeglich", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "r7");
    const charge = await paidCharge(m, u);
    provider.setRefundOutcome(u.id, "disputed");
    await expect(manualRefund(m.adminA.id, m.match.id, u.id, 800, "Streit")).rejects.toThrow(/abgelehnt/);
    const row = await refundRow(charge.id);
    expect(row).toMatchObject({ status: "failed", failureCode: "charge_disputed" });
    await db.insert(paymentDisputes).values({ disputeId: nid("dp_rr"), chargeId: charge.id, paymentIntentId: charge.paymentIntentId, matchId: m.match.id, payerUserId: u.id, amountCents: 800, currency: "eur", status: "needs_response" });
    const before = refundCalls().length;
    await expect(retryFailedRefund(owner.id, row.id)).rejects.toThrow(/Zahlungsstreit/);
    expect(refundCalls()).toHaveLength(before);
    expect((await refundRow(charge.id)).status).toBe("failed");
    await writeOffFailedRefund(owner.id, row.id, "Streit wird separat geklaert");
    expect((await refundRow(charge.id)).failureCode).toBe("written_off");
  });
});

describe("Abschreiben einer fehlgeschlagenen Erstattung (nur Buchungsmarkierung)", () => {
  it("markiert die Zeile, bewegt kein Geld, sendet nichts an Stripe, bucht nichts, Alarm weg, Protokoll mit Grund und Admin 1", async () => {
    const { m, charge, row } = await failedSetup("w1");
    const calls = refundCalls().length;
    const ledgerBefore = await revenue(m);
    await writeOffFailedRefund(owner.id, row.id, "Erstattung ausserhalb von Stripe erledigt");
    const after = await refundRow(charge.id);
    expect(after).toMatchObject({ id: row.id, status: "failed", failureCode: "written_off" });
    expect(refundCalls()).toHaveLength(calls);
    expect(await revenue(m)).toBe(ledgerBefore);
    expect(JSON.stringify(await getRefundAlerts())).not.toContain(row.id);
    expect(await listFailedRefundsOfMatch(m.match.id)).toHaveLength(0);
    const logs = await auditOf(m.match.id, "refund.written_off");
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(owner.id);
    expect(JSON.stringify(logs[0])).toContain("Erstattung ausserhalb von Stripe erledigt");
  });

  it("Pflicht-Grund: zu kurz oder zu lang abgelehnt, nichts geaendert; zweites Abschreiben und Neuversuch einer abgeschriebenen Zeile abgewiesen", async () => {
    const { charge, row } = await failedSetup("w2");
    await expect(writeOffFailedRefund(owner.id, row.id, "  ab ")).rejects.toThrow(/Grund/);
    await expect(writeOffFailedRefund(owner.id, row.id, "x".repeat(201))).rejects.toThrow(/höchstens 200/);
    expect((await refundRow(charge.id)).failureCode).toBe("refund_failed");
    await writeOffFailedRefund(owner.id, row.id, "gueltiger Grund");
    await expect(writeOffFailedRefund(owner.id, row.id, "gueltiger Grund")).rejects.toThrow(/bereits abgeschrieben/);
    const before = refundCalls().length;
    await expect(retryFailedRefund(owner.id, row.id)).rejects.toThrow(/bereits abgeschrieben/);
    expect(refundCalls()).toHaveLength(before);
  });

  it("ein verspaetetes failed-Ereignis hebt das Abschreiben nicht auf; ein spaeter Erfolg (succeeded) gewinnt weiterhin", async () => {
    const { m, u, charge, row } = await failedSetup("w3");
    await writeOffFailedRefund(owner.id, row.id, "bewusst abgeschrieben");
    const failedEv = provider.signEvent({ id: nid("evt_rr"), type: "refund.updated", object: { id: row.refundId as string, amount: 800, currency: "eur", status: "failed", failure_reason: "expired_or_canceled_card", payment_intent: charge.paymentIntentId, metadata: { matchId: m.match.id, userId: u.id, chargeId: charge.id } } });
    expect((await handleStripeWebhook(failedEv.rawBody, failedEv.signature)).status).toBe(200);
    expect((await refundRow(charge.id)).failureCode).toBe("written_off");
    const okEv = provider.signEvent({ id: nid("evt_rr"), type: "refund.updated", object: { id: row.refundId as string, amount: 800, currency: "eur", status: "succeeded", payment_intent: charge.paymentIntentId, metadata: { matchId: m.match.id, userId: u.id, chargeId: charge.id } } });
    expect((await handleStripeWebhook(okEv.rawBody, okEv.signature)).status).toBe(200);
    expect((await refundRow(charge.id)).status).toBe("succeeded");
  });
});

describe("Absage haengt an der fehlgeschlagenen Erstattung (finalizeCancel)", () => {
  it("ohne Aufloesung bleibt die Absage offen; nach Abschreiben schliesst sie ab; nie 'abgesagt' bei einer offenen fehlgeschlagenen Zeile", async () => {
    const { m, row } = await failedSetup("c1");
    const admin = await makeUser("rr_cancel", "admin");
    expect((await adminCancelMatch(admin.id, m.match.id, "Absage wegen Halle")).state).toBe("pending");
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].status).not.toBe("cancelled");
    await writeOffFailedRefund(owner.id, row.id, "manuell erstattet");
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].status).toBe("cancelled");
  });

  it("nach erfolgreichem Neuversuch schliesst die wartende Absage ab", async () => {
    const { m, u, row } = await failedSetup("c2");
    const admin = await makeUser("rr_cancel2", "admin");
    expect((await adminCancelMatch(admin.id, m.match.id, "Absage wegen Halle")).state).toBe("pending");
    provider.setRefundOutcome(u.id, "succeeded");
    await retryFailedRefund(owner.id, row.id);
    expect((await db.select().from(matches).where(eq(matches.id, m.match.id)))[0].status).toBe("cancelled");
  });
});
