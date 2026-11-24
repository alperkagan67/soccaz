import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentDisputes, paymentProfiles, paymentRefunds } from "@/db/schema";
import { cardAlertsFrom, getRefundAlerts, manualRefund, matchMoneyOf } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { adminCancelMatch, listFailedRefundsOfMatch, nextRetryKey, retryFailedRefund, writeOffFailedRefund } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Backlog 192: fehlgeschlagene Ausnahme-Erstattung: Neuversuch (dieselbe Zeile, derselbe Schluessel) oder Abschreiben (nur Buchungsmarkierung) durch Admin 1; nie doppelt erstatten.
let provider: FakeProvider;
let owner: Awaited<ReturnType<typeof makeUser>>;
beforeEach(async () => {
  provider = new FakeProvider();
  provider.setRefundReplay(true); // wie Stripe: gleicher Idempotenzschluessel = 24 h lang die ALTE Antwort ohne neue Erstattung (Review R-T376, P1)
  setPaymentProviderForTests(provider);
  owner = await makeUser("rr_owner", "owner");
});
afterEach(async () => {
  provider.beforeRefundResult = null; // der Haken darf bei einem Testfehler nicht gesetzt bleiben
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
/** Stripe-Erstattungs-id des Neuversuchs im Fake: re_fake_<sha256(neuer Schluessel)[0..16]> (deterministisch, wie fake.ts). */
const retryRefundId = (row: { idempotencyKey: string }) => "re_fake_" + createHash("sha256").update(nextRetryKey(row.idempotencyKey)).digest("hex").slice(0, 16);
/** Signiertes refund.updated; jede Zustellung bekommt eine NEUE Ereignis-id (eine Wiederholung mit derselben id waere ein Duplikat und wird uebersprungen). */
const refundEvent = (m: Game, u: { id: string }, charge: { id: string; paymentIntentId: string | null }, refundId: string, status: "succeeded" | "pending" | "failed") =>
  provider.signEvent({ id: nid("evt_rr"), type: "refund.updated", object: { id: refundId, amount: 800, currency: "eur", status, payment_intent: charge.paymentIntentId, metadata: { matchId: m.match.id, userId: u.id, chargeId: charge.id } } });
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
  it("erfolgreich: dieselbe Zeile wird succeeded, NEUER Idempotenzschluessel (<alt>:r1, sonst waere die alte Stripe-Antwort wiedergekommen), Rueckbuchung im Hauptbuch genau einmal, Protokoll mit Admin 1, Alarm weg", async () => {
    const { m, u, charge, row } = await failedSetup("r1");
    expect(await revenue(m)).toBe(800);
    provider.setRefundOutcome(u.id, "succeeded");
    await retryFailedRefund(owner.id, row.id);
    const after = await refundRow(charge.id);
    expect(after).toMatchObject({ id: row.id, status: "succeeded" });
    expect(after.failureCode).toBeNull();
    const calls = refundCalls();
    expect(calls).toHaveLength(2);
    const k0 = (calls[0].args as { idempotencyKey: string }).idempotencyKey;
    expect((calls[1].args as { idempotencyKey: string }).idempotencyKey).toBe(`${k0}:r1`);
    expect(after.idempotencyKey).toBe(`${k0}:r1`);
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
    const keys = refundCalls().map((c) => (c.args as { idempotencyKey: string }).idempotencyKey);
    expect(new Set(keys).size).toBe(3); // Erstversand, Neuversuch 1, Neuversuch 2: je ein eigener Schluessel (:r1, :r2)
    expect(keys[2]).toMatch(/:r2$/);
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

  it("Neuversuch parallel zum Webhook refund.updated (id des Neuversuchs): in JEDER Reihenfolge Endzustand succeeded, genau eine Rueckbuchung, nie Doppel", async () => {
    const { m, u, charge, row } = await failedSetup("r5");
    provider.setRefundOutcome(u.id, "pending"); // Stripe nimmt den Neuversuch an, das Ergebnis kommt per Webhook
    const newId = retryRefundId(row);
    const ev = refundEvent(m, u, charge, newId, "succeeded");
    const results = await Promise.allSettled([retryFailedRefund(owner.id, row.id), handleStripeWebhook(ev.rawBody, ev.signature), handleStripeWebhook(ev.rawBody, ev.signature)]);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason?.message ?? r.reason)).not.toMatch(/deadlock|40P01|could not serialize/i);
    // Je nach Reihenfolge war das Ereignis VOR dem Neuversuch (Zeile noch failed mit der id des alten Versuchs: es gehoert zu keiner bekannten Erstattung und wird ignoriert) oder danach (succeeded).
    // Im ersten Fall liefert Stripe das Ergebnis erneut (neue Ereignis-id, gleiche Erstattungs-id): dann ist die Zeile succeeded. Das Endergebnis ist in allen Reihenfolgen gleich.
    const final = await refundRow(charge.id);
    expect(final.status === "succeeded" || final.status === "pending").toBe(true);
    if (final.status === "pending") {
      const again = refundEvent(m, u, charge, newId, "succeeded");
      expect((await handleStripeWebhook(again.rawBody, again.signature)).status).toBe(200);
    }
    const end = await refundRow(charge.id);
    expect(end).toMatchObject({ status: "succeeded", refundId: newId });
    expect(await revenue(m)).toBe(0);
    expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
  });

  describe("Neuversuch und Webhook, feste Reihenfolge (kein Zeitverhalten)", () => {
    it("Ereignis VOR dem Neuversuch: ignoriert (Zeile bleibt failed), nach dem Neuversuch und erneuter Zustellung succeeded", async () => {
      const { m, u, charge, row } = await failedSetup("o1");
      provider.setRefundOutcome(u.id, "pending");
      const newId = retryRefundId(row);
      const early = refundEvent(m, u, charge, newId, "succeeded");
      expect((await handleStripeWebhook(early.rawBody, early.signature)).status).toBe(200);
      expect(await refundRow(charge.id)).toMatchObject({ status: "failed", refundId: row.refundId }); // id passt nicht zur Zeile: ignoriert
      await retryFailedRefund(owner.id, row.id);
      expect((await refundRow(charge.id)).status).toBe("pending");
      const again = refundEvent(m, u, charge, newId, "succeeded");
      expect((await handleStripeWebhook(again.rawBody, again.signature)).status).toBe(200);
      expect(await refundRow(charge.id)).toMatchObject({ status: "succeeded", refundId: newId });
      expect(await revenue(m)).toBe(0);
    });

    it("Ereignis MITTEN im Versand (Sendefenster): succeeded durch das Ereignis, das spaetere Ergebnis 'pending' setzt die Zeile NICHT zurueck", async () => {
      const { m, u, charge, row } = await failedSetup("o2");
      provider.setRefundOutcome(u.id, "pending");
      const newId = retryRefundId(row);
      let delivered = 0;
      provider.beforeRefundResult = async () => {
        const mid = refundEvent(m, u, charge, newId, "succeeded");
        expect((await handleStripeWebhook(mid.rawBody, mid.signature)).status).toBe(200);
        delivered++;
        expect(await refundRow(charge.id)).toMatchObject({ status: "succeeded", refundId: newId }); // schon vor dem eigenen Ergebnis
      };
      await retryFailedRefund(owner.id, row.id);
      provider.beforeRefundResult = null;
      expect(delivered).toBe(1);
      expect(await refundRow(charge.id)).toMatchObject({ status: "succeeded", refundId: newId }); // Monotonie: kein Rueckfall auf pending
      expect(await revenue(m)).toBe(0);
      expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
    });

    it("Ereignis NACH dem Neuversuch: succeeded; eine zweite Zustellung desselben Ergebnisses aendert nichts (genau eine Rueckbuchung)", async () => {
      const { m, u, charge, row } = await failedSetup("o3");
      provider.setRefundOutcome(u.id, "pending");
      const newId = retryRefundId(row);
      await retryFailedRefund(owner.id, row.id);
      for (let i = 0; i < 2; i++) {
        const ev = refundEvent(m, u, charge, newId, "succeeded");
        expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
      }
      expect(await refundRow(charge.id)).toMatchObject({ status: "succeeded", refundId: newId });
      expect(await revenue(m)).toBe(0);
      const bookings = await db.select().from(auditLog).where(and(eq(auditLog.entityId, m.match.id), eq(auditLog.action, "refund.succeeded")));
      expect(bookings).toHaveLength(1);
    });
  });

  it("spaetes oder doppeltes failed der ALTEN Erstattung nach einem Neuversuch setzt die neue Zeile nicht wieder auf failed (Review R-T376)", async () => {
    const { m, u, charge, row } = await failedSetup("r8");
    provider.setRefundOutcome(u.id, "error"); // Netz weg beim Neuversuch: Zeile pending ohne refund_id (das Fenster, in dem ein spaetes failed der alten Erstattung eintreffen kann)
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Zustandsautomat (w1-Fund zu #341, t2q): ALTER Versuch A (pending/failed/succeeded) x NEUER Versuch B (direktes Ergebnis pending/failed/succeeded) x Zeitpunkt des A-Ereignisses
// (W = im Sendefenster, die Zeile ist pending mit refund_id NULL; L = nach dem Ergebnis von B) x anschliessend das Webhook-Ereignis succeeded von B. Erwartung als eigene kleine Spezifikation:
// A pending/failed aendern nie Status oder refund_id; ein ERSTER Erfolg gewinnt und wird genau einmal gebucht; jeder spaetere Erfolg mit ANDERER Stripe-id ist nur ein Hinweis (kein zweites Mal buchen);
// succeeded(A) nach dem Neuversuch wird gebucht (Geld ist raus) und mit einem Hinweis protokolliert; succeeded verlaesst nie den Zustand.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
type St = "pending" | "failed" | "succeeded";
type Model = { status: St; refundId: "A" | "B" | null; late: number; dup: number; bookings: number };
function modelRun(order: "W" | "L", aStatus: St, bOut: St): Model {
  const mdl: Model = { status: "pending", refundId: null, late: 0, dup: 0, bookings: 0 };
  const success = (who: "A" | "B", isStale: boolean) => {
    if (mdl.status === "succeeded") {
      if (mdl.refundId !== who) mdl.dup++;
      return;
    }
    mdl.status = "succeeded";
    mdl.refundId = who;
    mdl.bookings++;
    if (isStale) mdl.late++;
  };
  const bDirect = () => {
    if (bOut === "pending") {
      if (mdl.status !== "succeeded" && mdl.refundId === null) mdl.refundId = "B";
    } else if (bOut === "failed") {
      if (mdl.status !== "succeeded") {
        mdl.status = "failed";
        mdl.refundId = mdl.refundId ?? "B";
      }
    } else success("B", false);
  };
  const aEvent = () => {
    if (aStatus === "succeeded") success("A", true);
    // pending und failed der alten Erstattung: ignoriert
  };
  if (order === "W") {
    aEvent();
    bDirect();
  } else {
    bDirect();
    aEvent();
  }
  success("B", false); // Webhook-Ereignis succeeded von B
  return mdl;
}

describe("Zustandsautomat: alter Versuch A x neuer Versuch B (jede Reihenfolge, genau eine Buchung, Monotonie)", () => {
  const STATES: St[] = ["pending", "failed", "succeeded"];
  for (const order of ["W", "L"] as const) {
    for (const aStatus of STATES) {
      for (const bOut of STATES) {
        it(`A ${aStatus} (${order === "W" ? "im Sendefenster" : "nach dem Ergebnis von B"}) x B direkt ${bOut}, dann B-Ereignis succeeded`, async () => {
          const { m, u, charge, row } = await failedSetup(`z${order}${aStatus[0]}${bOut[0]}`);
          const A = row.refundId as string;
          const B = retryRefundId(row);
          provider.setRefundOutcome(u.id, bOut);
          const deliver = async (refundId: string, status: St) => {
            const ev = refundEvent(m, u, charge, refundId, status);
            expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
          };
          const seen: string[] = [];
          const watch = async () => seen.push((await refundRow(charge.id)).status);
          if (order === "W") {
            provider.beforeRefundResult = async () => {
              await deliver(A, aStatus);
              await watch();
            };
          }
          await retryFailedRefund(owner.id, row.id).catch(() => undefined); // B direkt failed meldet "wieder abgelehnt"
          provider.beforeRefundResult = null;
          if (order === "L") {
            await deliver(A, aStatus);
            await watch();
          }
          await deliver(B, "succeeded");
          await watch();
          const want = modelRun(order, aStatus, bOut);
          const end = await refundRow(charge.id);
          expect(end.status, "Endzustand").toBe(want.status);
          expect(end.refundId, "refund_id").toBe(want.refundId === "A" ? A : B);
          // Monotonie: einmal succeeded, nie wieder etwas anderes
          const firstOk = seen.indexOf("succeeded");
          if (firstOk >= 0) expect(seen.slice(firstOk).every((x) => x === "succeeded"), `Verlauf ${seen.join(",")}`).toBe(true);
          // genau eine Buchung: Einnahmen zurueck auf 0, ein Audit refund.succeeded, nie doppelt
          expect(await revenue(m)).toBe(want.status === "succeeded" ? 0 : 800);
          expect((await auditOf(m.match.id, "refund.succeeded")).length).toBe(want.bookings);
          expect((await auditOf(m.match.id, "refund.late_success_old_attempt")).length, "Hinweis: A nachtraeglich erfolgreich").toBe(want.late);
          expect((await auditOf(m.match.id, "refund.duplicate_success")).length, "Hinweis: zweiter Erfolg").toBe(want.dup);
          expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, charge.id))).toHaveLength(1);
        });
      }
    }
  }

  it("Wiederholte Zustellung (neue Ereignis-ids) von pending(A) nach dem Neuversuch aendert nichts; B danach succeeded", async () => {
    const { m, u, charge, row } = await failedSetup("zred");
    const A = row.refundId as string;
    provider.setRefundOutcome(u.id, "pending");
    await retryFailedRefund(owner.id, row.id);
    const B = retryRefundId(row);
    for (let i = 0; i < 3; i++) {
      const ev = refundEvent(m, u, charge, A, "pending");
      expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
      expect(await refundRow(charge.id)).toMatchObject({ status: "pending", refundId: B });
    }
    const ok = refundEvent(m, u, charge, B, "succeeded");
    expect((await handleStripeWebhook(ok.rawBody, ok.signature)).status).toBe(200);
    expect(await refundRow(charge.id)).toMatchObject({ status: "succeeded", refundId: B });
    expect(await revenue(m)).toBe(0);
  });
});

describe("Alarme der Erstattung (Backlog 192, w1-Fund)", () => {
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

  it("pending ohne Ergebnis: nach 23 h kein Alarm, nach 25 h Alarm card:refund-stuck (ohne Personendaten), ein Eintrag je Zustand (entprellt), nach Erfolg weg", async () => {
    const { m, u, charge, row } = await failedSetup("al1");
    provider.setRefundOutcome(u.id, "pending");
    await retryFailedRefund(owner.id, row.id); // pending mit refund_id B, Versuch gerade gestartet
    const stuck = async (h: number) => (await getRefundAlerts(inHours(h))).refundsStuck.some((x) => x.id === row.id);
    expect(await stuck(23)).toBe(false);
    expect(await stuck(25)).toBe(true);
    const ra = await getRefundAlerts(inHours(25));
    const alerts = cardAlertsFrom(ra).filter((a) => a.code === "card:refund-stuck");
    expect(alerts).toHaveLength(1); // ein Eintrag mit Anzahl, kein Eintrag je Aufruf
    expect(JSON.stringify(alerts)).not.toContain(u.id);
    expect(JSON.stringify(alerts)).not.toContain("@");
    expect(cardAlertsFrom(await getRefundAlerts(inHours(25))).filter((a) => a.code === "card:refund-stuck")).toHaveLength(1); // zweiter Aufruf: unveraendert
    const ok = refundEvent(m, u, charge, retryRefundId(row), "succeeded");
    expect((await handleStripeWebhook(ok.rawBody, ok.signature)).status).toBe(200);
    expect(await stuck(25)).toBe(false);
  });

  it("kein Alarm bei failed (hat den Alarm failed-refunds), bei abgeschrieben und bei Erfolg", async () => {
    const { row } = await failedSetup("al2");
    expect((await getRefundAlerts(inHours(25))).refundsStuck.some((x) => x.id === row.id)).toBe(false); // failed
    await writeOffFailedRefund(owner.id, row.id, "Test abgeschrieben");
    expect((await getRefundAlerts(inHours(25))).refundsStuck.some((x) => x.id === row.id)).toBe(false); // abgeschrieben (failed)
  });

  it("nach einem Neuversuch zaehlt die Frist ab dem Neuversuch, nicht ab der alten Erstattung", async () => {
    const { u, charge, row } = await failedSetup("al3");
    await db.update(paymentRefunds).set({ createdAt: new Date(Date.now() - 72 * 3_600_000), attemptStartedAt: new Date(Date.now() - 70 * 3_600_000) }).where(eq(paymentRefunds.id, row.id)); // alter Versuch vor 70 h
    provider.setRefundOutcome(u.id, "pending");
    await retryFailedRefund(owner.id, row.id);
    expect((await getRefundAlerts(inHours(1))).refundsStuck.some((x) => x.id === row.id)).toBe(false); // sofort nach dem Neuversuch kein Alarm
    expect((await getRefundAlerts(inHours(25))).refundsStuck.some((x) => x.id === row.id)).toBe(true);
    void charge;
  });

  it("alter Versuch nachtraeglich erfolgreich: Alarm card:refund-late-success (nur Spiel-ID), eine Buchung", async () => {
    const { m, u, charge, row } = await failedSetup("al4");
    const A = row.refundId as string;
    provider.setRefundOutcome(u.id, "pending");
    await retryFailedRefund(owner.id, row.id);
    const late = refundEvent(m, u, charge, A, "succeeded");
    expect((await handleStripeWebhook(late.rawBody, late.signature)).status).toBe(200);
    const alerts = cardAlertsFrom(await getRefundAlerts()).filter((a) => a.code === "card:refund-late-success");
    expect(alerts).toHaveLength(1);
    expect(JSON.stringify(alerts)).not.toContain(u.id);
    expect(await revenue(m)).toBe(0);
  });
});
