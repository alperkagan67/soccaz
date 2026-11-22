import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, paymentChargeAttempts, paymentCharges, paymentDisputeEntries, paymentDisputes, paymentProfiles, paymentRefunds, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { trialBalance } from "@/server/ledger";
import { runCharges } from "@/server/payments/charge-run";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { requestMatchCancel, sendPendingRefunds } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 012, M4a (AC-11): Zahlungsstreit im Kartenwebhook. Gebucht wird je Balance-Transaction genau einmal; jede Reihenfolge und jede Doppelzustellung ergibt dasselbe.

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_dp_%"));
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_dp_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type User = Awaited<ReturnType<typeof addPlayer>>;
/**
 * Kartenspiel mit 4 Spielern (Anteil 800), echt abgebucht ueber runCharges. `failer` scheitert absichtlich: das Spiel bleibt offen (nicht abgerechnet), die drei anderen sind bezahlt.
 * `victim` ist ein bezahlter Spieler, dessen Zahlung angefochten wird.
 */
async function game(o: { failOne?: boolean } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 3200, costCents: 3200 });
  const all: User[] = [m.adminA, m.adminB, await addPlayer(m.match.id, m.home.id, "dp"), await addPlayer(m.match.id, m.away.id, "dp")];
  const customers = new Map<string, string>();
  for (const p of all) {
    const c = nid("cus_dp");
    customers.set(p.id, c);
    await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: c, paymentMethodId: nid("pm_dp") });
  }
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: 800, status: "confirmed" }).where(eq(matches.id, m.match.id));
  const victim = all[2];
  const failer = all[3];
  if (o.failOne !== false) provider.setChargeOutcome(failer.id, "declined");
  await runCharges(m.match.id);
  const admin = await makeUser("dpadm", "admin");
  const row = (await db.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, m.match.id), eq(paymentCharges.userId, victim.id))))[0];
  return { ...m, all, victim, failer, customers, admin, row, piId: row.paymentIntentId! };
}
type G = Awaited<ReturnType<typeof game>>;

const dpId = () => nid("dp_test");
const txn = () => nid("txn_test");
const bt = (id: string, amount: number, fee: number, category: "dispute" | "dispute_reversal", currency = "eur") => ({ id, amount, fee, currency, reporting_category: category, type: "adjustment" });
function dispute(g: Pick<G, "piId">, id: string, over: Record<string, unknown> = {}) {
  return { id, amount: 800, currency: "eur", payment_intent: g.piId, charge: "ch_test_1", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 }, ...over };
}
let created = 1_800_000_000;
function send(type: string, object: Record<string, unknown>, at: number = ++created, eventId: string = nid("evt_dp")) {
  const e = provider.signEvent({ id: eventId, type, object, created: at });
  return handleStripeWebhook(e.rawBody, e.signature);
}
const rowOf = async (disputeId: string) => (await db.select().from(paymentDisputes).where(eq(paymentDisputes.disputeId, disputeId)))[0];
const entriesOf = async (disputeId: string) => {
  const r = await rowOf(disputeId);
  return r ? db.select().from(paymentDisputeEntries).where(eq(paymentDisputeEntries.disputeRowId, r.id)) : [];
};
const ledger = async (disputeId: string) => (await db.select().from(ledgerEntries).where(like(ledgerEntries.idempotencyKey, `dispute:${disputeId}:%`))).sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey));
const keys = async (disputeId: string) => (await ledger(disputeId)).map((e) => e.idempotencyKey);
const alertsFor = async (g: G, title: string) => (await db.select().from(notifications).where(eq(notifications.userId, g.admin.id))).filter((n) => n.title === title).length;

describe("Abzug, Gebuehr, Abschluss", () => {
  it("created + funds_withdrawn + closed(lost): Abzug chargeback/clearing, Gebuehr aus der Balance-Transaction (nicht 20 EUR fest), Hauptbuch ausgeglichen, Zahler markiert", async () => {
    const g = await game();
    const id = dpId();
    const t1 = txn();
    const obj = dispute(g, id, { balance_transactions: [bt(t1, -800, 1500, "dispute")] });
    expect((await send("charge.dispute.created", obj)).status).toBe(200);
    await send("charge.dispute.funds_withdrawn", obj);
    await send("charge.dispute.closed", { ...obj, status: "lost" });
    const row = await rowOf(id);
    expect(row).toMatchObject({ status: "lost", payerUserId: g.victim.id, matchId: g.match.id, chargeId: g.row.id, amountCents: 800 });
    const l = await ledger(id);
    expect(l.map((e) => e.idempotencyKey)).toEqual([`dispute:${id}:bt:${t1}`, `dispute:${id}:bt:${t1}:fee`]);
    expect(l[0]).toMatchObject({ debitAccount: "chargeback", creditAccount: "clearing", amountCents: 800, kind: "chargeback", matchId: g.match.id });
    expect(l[1]).toMatchObject({ debitAccount: "fees", creditAccount: "clearing", amountCents: 1500, kind: "fee" }); // 15 EUR laut Balance-Transaction
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("gewonnen: Rueckbuchung gleicht den Abzug aus (chargeback netto 0), Hauptbuch ausgeglichen", async () => {
    const g = await game();
    const id = dpId();
    const [w, r] = [txn(), txn()];
    const obj = dispute(g, id, { balance_transactions: [bt(w, -800, 2000, "dispute"), bt(r, 800, 0, "dispute_reversal")] });
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(w, -800, 2000, "dispute")] }));
    await send("charge.dispute.funds_reinstated", obj);
    await send("charge.dispute.closed", { ...obj, status: "won" });
    expect(await keys(id)).toEqual([`dispute:${id}:bt:${r}`, `dispute:${id}:bt:${w}`, `dispute:${id}:bt:${w}:fee`].sort());
    const l = await ledger(id);
    const net = l.filter((e) => e.kind === "chargeback").reduce((s, e) => s + (e.debitAccount === "chargeback" ? e.amountCents : -e.amountCents), 0);
    expect(net).toBe(0);
    expect((await rowOf(id)).status).toBe("won");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("jede Reihenfolge der drei Ereignisse und Doppelzustellung ergibt dasselbe Ergebnis", async () => {
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    let reference: string | null = null;
    for (const perm of perms) {
      const g = await game();
      const id = dpId();
      const [w, r] = [txn(), txn()];
      const evs = [
        { type: "charge.dispute.created", obj: dispute(g, id, { balance_transactions: [bt(w, -800, 2000, "dispute")] }), at: 1000 },
        { type: "charge.dispute.funds_reinstated", obj: dispute(g, id, { balance_transactions: [bt(w, -800, 2000, "dispute"), bt(r, 800, 0, "dispute_reversal")] }), at: 2000 },
        { type: "charge.dispute.closed", obj: dispute(g, id, { status: "won", balance_transactions: [bt(w, -800, 2000, "dispute"), bt(r, 800, 0, "dispute_reversal")] }), at: 3000 },
      ];
      for (const i of perm) {
        const e = evs[i];
        const eid = nid("evt_dp");
        await send(e.type, e.obj, e.at, eid);
        await send(e.type, e.obj, e.at, eid); // dieselbe Ereignis-ID noch einmal
        await send(e.type, e.obj, e.at); // gleicher Inhalt, neue Ereignis-ID
      }
      const row = await rowOf(id);
      const ent = (await entriesOf(id)).map((e) => `${e.kind}:${e.status}:${e.amountCents}`).sort();
      const summary = JSON.stringify({ status: row.status, ent, n: (await ledger(id)).length });
      reference ??= summary;
      expect(summary, JSON.stringify(perm)).toBe(reference);
      expect(JSON.parse(summary).status).toBe("won");
      expect(JSON.parse(summary).n).toBe(3); // Abzug, Gebuehr, Rueckbuchung - je genau einmal
    }
  });

  it("Rueckbuchung vor dem Abzug wird geparkt und danach gebucht (nie ein negativer Stand auf chargeback)", async () => {
    const g = await game();
    const id = dpId();
    const [w, r] = [txn(), txn()];
    await send("charge.dispute.funds_reinstated", dispute(g, id, { balance_transactions: [bt(r, 800, 0, "dispute_reversal")] }));
    expect((await entriesOf(id)).map((e) => e.status)).toEqual(["parked"]);
    expect(await ledger(id)).toHaveLength(0);
    await send("charge.dispute.funds_withdrawn", dispute(g, id, { balance_transactions: [bt(w, -800, 0, "dispute"), bt(r, 800, 0, "dispute_reversal")] }));
    expect((await entriesOf(id)).map((e) => e.status).sort()).toEqual(["booked", "booked"]);
    expect(await ledger(id)).toHaveLength(2);
  });

  it("zwei Abzuege und eine Rueckbuchung (mehrstufiger Streit): in jeder Reihenfolge bleibt der Stand korrekt, die Rueckbuchung wird gebucht, sobald die Abzuege sie decken", async () => {
    for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
      const g = await game();
      const id = dpId();
      const [w1, w2, r] = [txn(), txn(), txn()];
      const all = [bt(w1, -300, 0, "dispute"), bt(w2, -500, 0, "dispute"), bt(r, 800, 0, "dispute_reversal")];
      for (const i of order) await send("charge.dispute.updated", dispute(g, id, { balance_transactions: [all[i]] }));
      const ent = await entriesOf(id);
      expect(ent.map((e) => `${e.kind}:${e.status}`).sort(), JSON.stringify(order)).toEqual(["reversal:booked", "withdrawal:booked", "withdrawal:booked"]);
      expect((await trialBalance()).balanced).toBe(true);
    }
  });
});

describe("Betragspruefung, abgelehnte Eintraege, Gebuehr unabhaengig vom Status", () => {
  it("Abzug groesser als die Abbuchung: abgelehnt, nichts gebucht, genau ein Alarm auch bei Wiederzustellung", async () => {
    const g = await game();
    const id = dpId();
    const w = txn();
    const obj = dispute(g, id, { amount: 900, balance_transactions: [bt(w, -900, 0, "dispute")] });
    for (let i = 0; i < 3; i++) await send("charge.dispute.created", obj);
    expect((await entriesOf(id))[0]).toMatchObject({ status: "rejected", rejectReason: "amount_exceeds_charge" });
    expect(await ledger(id)).toHaveLength(0);
    expect(await alertsFor(g, "Zahlungsstreit: Betrag nicht gebucht")).toBe(1);
  });

  it("falsche Waehrung und Betrag 0: nicht gebucht; Teilstreit wird mit dem Teilbetrag gebucht", async () => {
    const g = await game();
    const [a, b, c] = [dpId(), dpId(), dpId()];
    await send("charge.dispute.created", dispute(g, a, { currency: "usd", balance_transactions: [bt(txn(), -800, 0, "dispute", "usd")] }));
    expect((await entriesOf(a))[0]).toMatchObject({ status: "rejected", rejectReason: "currency" });
    await send("charge.dispute.created", dispute(g, b, { balance_transactions: [bt(txn(), 0, 0, "dispute")] }));
    expect(await entriesOf(b)).toHaveLength(0);
    await send("charge.dispute.created", dispute(g, c, { amount: 300, balance_transactions: [bt(txn(), -300, 0, "dispute")] }));
    expect((await ledger(c))[0]).toMatchObject({ amountCents: 300, debitAccount: "chargeback" });
  });

  it("Summe ueber mehrere Streite derselben Zahlung: der Abzug, der die Abbuchung ueberschreitet, wird abgelehnt", async () => {
    const g = await game();
    const [a, b] = [dpId(), dpId()];
    await send("charge.dispute.created", dispute(g, a, { amount: 500, balance_transactions: [bt(txn(), -500, 0, "dispute")] }));
    await send("charge.dispute.created", dispute(g, b, { amount: 400, balance_transactions: [bt(txn(), -400, 0, "dispute")] }));
    expect((await entriesOf(a))[0].status).toBe("booked");
    expect((await entriesOf(b))[0]).toMatchObject({ status: "rejected", rejectReason: "sum_exceeds_charge" });
  });

  it("Rueckbuchung zuerst geparkt, danach der Abzug abgelehnt: die Rueckbuchung wird abgelehnt, genau EIN Alarm (auch bei Wiederzustellung)", async () => {
    const g = await game();
    const id = dpId();
    const [w, r] = [txn(), txn()];
    await send("charge.dispute.funds_reinstated", dispute(g, id, { amount: 900, balance_transactions: [bt(r, 900, 0, "dispute_reversal")] }));
    expect((await entriesOf(id)).map((e) => e.status)).toEqual(["parked"]);
    const rejectedOrder = dispute(g, id, { amount: 900, balance_transactions: [bt(w, -900, 0, "dispute"), bt(r, 900, 0, "dispute_reversal")] });
    for (let i = 0; i < 3; i++) await send("charge.dispute.updated", rejectedOrder);
    expect((await entriesOf(id)).map((e) => `${e.kind}:${e.status}`).sort()).toEqual(["reversal:rejected", "withdrawal:rejected"]);
    expect(await ledger(id)).toHaveLength(0);
    expect(await alertsFor(g, "Zahlungsstreit: Betrag nicht gebucht")).toBe(1);
  });

  it("die Gebuehr haengt NICHT am Status: abgelehnter Abzug mit Gebuehr und geparkte Rueckbuchung mit Gebuehr werden trotzdem genau einmal gebucht", async () => {
    const g = await game();
    const [a, b] = [dpId(), dpId()];
    const [wa, rb] = [txn(), txn()];
    for (let i = 0; i < 2; i++) await send("charge.dispute.created", dispute(g, a, { amount: 900, balance_transactions: [bt(wa, -900, 1500, "dispute")] }));
    expect(await keys(a)).toEqual([`dispute:${a}:bt:${wa}:fee`]); // Abzug abgelehnt (nicht gebucht), Gebuehr gebucht
    for (let i = 0; i < 2; i++) await send("charge.dispute.funds_reinstated", dispute(g, b, { balance_transactions: [bt(rb, 800, 700, "dispute_reversal")] }));
    expect((await entriesOf(b))[0].status).toBe("parked");
    expect(await keys(b)).toEqual([`dispute:${b}:bt:${rb}:fee`]);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Gebuehrenrueckerstattung (Entscheid t9)", () => {
  it("gewonnener Streit: negative Gebuehr der Balance-Transaction wird als Gegenbuchung auf fees gebucht (nie geschaetzt), genau einmal", async () => {
    const g = await game();
    const id = dpId();
    const [w, r] = [txn(), txn()];
    const obj = dispute(g, id, { status: "won", balance_transactions: [bt(w, -800, 1500, "dispute"), bt(r, 800, -1500, "dispute_reversal")] });
    await send("charge.dispute.closed", obj);
    await send("charge.dispute.closed", obj);
    const fees = (await ledger(id)).filter((e) => e.kind === "fee");
    expect(fees.map((e) => `${e.debitAccount}>${e.creditAccount}:${e.amountCents}`).sort()).toEqual(["clearing>fees:1500", "fees>clearing:1500"]);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Zuordnung", () => {
  it("unbekannter PaymentIntent: Zeile ohne Zuordnung, Abzug trotzdem gebucht (das Geld ist weg), Alarm", async () => {
    const g = await game();
    const id = dpId();
    await send("charge.dispute.created", { ...dispute(g, id, { balance_transactions: [bt(txn(), -800, 0, "dispute")] }), payment_intent: nid("pi_unbekannt") });
    expect(await rowOf(id)).toMatchObject({ chargeId: null, matchId: null, payerUserId: null });
    expect(await ledger(id)).toHaveLength(1);
    expect(await alertsFor(g, "Zahlungsstreit ohne bekannte Zahlung")).toBe(1);
  });

  it("Anteil uebernehmen (Variante B): der Streit trifft den ZAHLER, nicht den Platz", async () => {
    const g = await game();
    const payer = g.all[0];
    await db.update(paymentCharges).set({ payerUserId: payer.id }).where(eq(paymentCharges.id, g.row.id));
    const id = dpId();
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(txn(), -800, 0, "dispute")] }));
    expect((await rowOf(id)).payerUserId).toBe(payer.id);
  });

  it("alter Versuch (Historie): der Streit wird der Abbuchung zugeordnet", async () => {
    const g = await game();
    const oldPi = nid("pi_alt");
    await db.insert(paymentChargeAttempts).values({ chargeId: g.row.id, attemptNo: 1, idempotencyKey: nid("k_alt"), paymentIntentId: oldPi, status: "succeeded" });
    const id = dpId();
    await send("charge.dispute.created", { ...dispute(g, id, { balance_transactions: [bt(txn(), -800, 0, "dispute")] }), payment_intent: oldPi });
    expect((await rowOf(id)).chargeId).toBe(g.row.id);
  });
});

describe("Abruf bei Stripe", () => {
  it("fehlt die Liste der Balance-Transactions im Ereignis, wird der Streit abgerufen und daraus gebucht", async () => {
    const g = await game();
    const id = dpId();
    const t = txn();
    provider.setDispute(dispute(g, id, { balance_transactions: [bt(t, -800, 0, "dispute")] }));
    await send("charge.dispute.funds_withdrawn", dispute(g, id)); // ohne balance_transactions
    expect(provider.calls.filter((c) => c.method === "retrieveDispute")).toHaveLength(1);
    expect(await keys(id)).toEqual([`dispute:${id}:bt:${t}`]);
  });

  it("closed lost ohne Abzug im Ereignis: nachgeladen und gebucht; gibt es auch dann keinen Abzug, bleibt es lost OHNE Buchung mit Alarm", async () => {
    const g = await game();
    const a = dpId();
    const t = txn();
    provider.setDispute(dispute(g, a, { status: "lost", balance_transactions: [bt(t, -800, 0, "dispute")] }));
    await send("charge.dispute.closed", dispute(g, a, { status: "lost", balance_transactions: [] }));
    expect(await keys(a)).toEqual([`dispute:${a}:bt:${t}`]);

    const b = dpId();
    provider.setDispute(dispute(g, b, { status: "lost", balance_transactions: [] }));
    await send("charge.dispute.closed", dispute(g, b, { status: "lost", balance_transactions: [] }));
    expect((await rowOf(b)).status).toBe("lost");
    expect(await ledger(b)).toHaveLength(0);
    expect(await alertsFor(g, "Zahlungsstreit verloren ohne Abzug")).toBe(1);
  });

  it("Abruf schlaegt fehl: das Ereignis wird trotzdem verarbeitet (kein 500)", async () => {
    const g = await game();
    const id = dpId();
    const res = await send("charge.dispute.created", dispute(g, id)); // Fake kennt den Streit nicht: retrieveDispute liefert null
    expect(res.status).toBe(200);
    expect((await rowOf(id)).status).toBe("needs_response");
  });
});

describe("Reihenfolge der Statusfelder, unbekannte Status, Entprellung", () => {
  it("ein aelteres Ereignis ueberschreibt weder den Endstatus noch einen hoeheren Rang", async () => {
    const g = await game();
    const id = dpId();
    await send("charge.dispute.closed", dispute(g, id, { status: "won", balance_transactions: [] }), 5000);
    await send("charge.dispute.updated", dispute(g, id, { status: "needs_response", balance_transactions: [] }), 1000);
    await send("charge.dispute.updated", dispute(g, id, { status: "under_review", balance_transactions: [] }), 9000);
    expect((await rowOf(id)).status).toBe("won");
  });

  it("Statusfelder einzeln: aelteres Ereignis mit HOEHEREM Rang, Endstatus gegen anderen Endstatus, niedrigerer Rang bei neuerem Ereignis aendern nichts", async () => {
    const g = await game();
    const [a, b, c] = [dpId(), dpId(), dpId()];
    // (a) aelteres Ereignis mit hoeherem Rang wird verworfen
    await send("charge.dispute.created", dispute(g, a, { status: "needs_response", balance_transactions: [] }), 5000);
    await send("charge.dispute.updated", dispute(g, a, { status: "under_review", balance_transactions: [] }), 1000);
    expect((await rowOf(a)).status).toBe("needs_response");
    // (b) Endstatus won wird von einem spaeteren lost nicht ueberschrieben (gleicher Rang, anderer Wert)
    await send("charge.dispute.closed", dispute(g, b, { status: "won", balance_transactions: [] }), 1000);
    await send("charge.dispute.closed", dispute(g, b, { status: "lost", balance_transactions: [] }), 9000);
    expect((await rowOf(b)).status).toBe("won");
    // (c) niedrigerer Rang bei NEUEREM Ereignis (Zustellung vertauscht) aendert nichts
    await send("charge.dispute.updated", dispute(g, c, { status: "under_review", balance_transactions: [] }), 1000);
    await send("charge.dispute.updated", dispute(g, c, { status: "needs_response", balance_transactions: [] }), 9000);
    expect((await rowOf(c)).status).toBe("under_review");
  });

  it("unbekannter Status (z. B. kuenftiger Stripe-Wert): tolerant gespeichert, kein Fehler, Alarm einmal, Erstattung bleibt gesperrt", async () => {
    const g = await game();
    const id = dpId();
    const res = await send("charge.dispute.created", dispute(g, id, { status: "neuer_stripe_status" }));
    expect(res.status).toBe(200);
    expect((await rowOf(id)).status).toBe("neuer_stripe_status");
    await send("charge.dispute.updated", dispute(g, id, { status: "neuer_stripe_status" }));
    expect(await alertsFor(g, "Zahlungsstreit mit unbekanntem Status")).toBe(1);
    // Erstattung bleibt vorsorglich gesperrt (unbekannt = offen)
    await requestMatchCancel(null, g.match.id, "Test");
    expect(provider.calls.filter((c) => c.method === "createRefund" && (c.args as { paymentIntentId: string }).paymentIntentId === g.piId)).toHaveLength(0);
    // R-T185 (D15): die NEUE Erstattungszeile (ensureRefundRow / refundVoidedByDispute) wird bei unbekanntem Status gleich als cancelled_dispute angelegt, nicht nur vom Versand zurueckgehalten
    const refund = (await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, g.row.id)))[0];
    expect(refund.status).toBe("cancelled_dispute");
  });

  it("ein spaeteres Ereignis ohne Grund ueberschreibt den bekannten Grund nicht (Nit R-T185)", async () => {
    const g = await game();
    const id = dpId();
    await send("charge.dispute.created", dispute(g, id, { reason: "fraudulent", balance_transactions: [] }), 1000);
    expect((await rowOf(id)).reason).toBe("fraudulent");
    const { reason: _omit, ...withoutReason } = dispute(g, id, { status: "under_review", balance_transactions: [] }) as Record<string, unknown>;
    void _omit;
    await send("charge.dispute.updated", withoutReason, 2000);
    const row = await rowOf(id);
    expect(row.status).toBe("under_review"); // das Ereignis wurde angewendet
    expect(row.reason).toBe("fraudulent"); // der Grund bleibt
    await send("charge.dispute.updated", dispute(g, id, { reason: "general", status: "under_review", balance_transactions: [] }), 3000);
    expect((await rowOf(id)).reason).toBe("general"); // ein geliefeter neuer Grund wird uebernommen
  });

  it("Entprellung: jedes Ereignis dreimal (neue Ereignis-IDs) ergibt je Grund genau eine Nachricht", async () => {
    const g = await game();
    const id = dpId();
    const t = txn();
    const obj = dispute(g, id, { balance_transactions: [bt(t, -800, 0, "dispute")] });
    for (let i = 0; i < 3; i++) await send("charge.dispute.created", obj);
    for (let i = 0; i < 3; i++) await send("charge.dispute.closed", { ...obj, status: "lost" });
    expect(await alertsFor(g, "Zahlungsstreit eingegangen")).toBe(1);
    expect(await alertsFor(g, "Zahlungsstreit abgeschlossen")).toBe(1);
  });
});

describe("Erstattungssperre und Rennen", () => {
  async function cancelledWithRefundRow(g: G) {
    await requestMatchCancel(null, g.match.id, "Test"); // Absage: erstattet die bezahlten Posten
  }
  const refundOf = async (g: G) => (await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, g.row.id)))[0];
  const refundCalls = (g: G) => provider.calls.filter((c) => c.method === "createRefund" && (c.args as { paymentIntentId: string }).paymentIntentId === g.piId);

  it("offener Streit VOR der Absage (Entscheid t9): die Absage wird NICHT blockiert; die strittige Zahlung wird nicht erstattet (cancelled_dispute), alle anderen schon; Alarm einmal", async () => {
    const g = await game();
    const id = dpId();
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(txn(), -800, 0, "dispute")] }));
    await cancelledWithRefundRow(g);
    expect(refundCalls(g)).toHaveLength(0);
    expect((await refundOf(g)).status).toBe("cancelled_dispute");
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].cancelRequestedAt).not.toBeNull();
    const others = (await db.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, g.match.id))).filter((r) => r.chargeId !== g.row.id);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((r) => r.status === "succeeded")).toBe(true); // alle anderen erstattet
    await sendPendingRefunds(g.match.id);
    expect(refundCalls(g)).toHaveLength(0);
    expect(await alertsFor(g, "Strittige Zahlung wird nicht erstattet")).toBe(0); // Streit kam vor der Erstattung: Zeile wurde gleich als cancelled_dispute angelegt (Alarm gab es beim Eingang)
    expect(await alertsFor(g, "Zahlungsstreit eingegangen")).toBe(1);
    // Gewinnt Soccaz den Streit nach der Absage, bleibt das Geld bei Soccaz: Hinweis an Admin 1
    await send("charge.dispute.closed", dispute(g, id, { status: "won", balance_transactions: [bt(txn(), -800, 0, "dispute"), bt(txn(), 800, 0, "dispute_reversal")] }));
    expect(await alertsFor(g, "Zahlungsstreit gewonnen, Zahlung nicht erstattet")).toBe(1);
    expect((await refundOf(g)).status).toBe("cancelled_dispute");
  });

  it("Streit trifft eine schon angelegte, noch ungesendete Erstattung: sie endet sofort als cancelled_dispute und die Absage schliesst ab", async () => {
    const g = await game();
    // Erstattungszeile ohne Versand (so entsteht sie, wenn die Absage gerade angelegt ist)
    await db.transaction(async (tx) => {
      const [c] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id));
      await tx.insert(paymentRefunds).values({ chargeId: c.id, matchId: c.matchId, userId: c.userId, amountCents: c.amountCents, idempotencyKey: `refund:${c.id}`, reason: "Test" });
    });
    const id = dpId();
    const w = txn();
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(w, -800, 0, "dispute")] }));
    expect((await refundOf(g)).status).toBe("cancelled_dispute");
    expect(await alertsFor(g, "Strittige Zahlung wird nicht erstattet")).toBe(1);
    await requestMatchCancel(null, g.match.id, "Test");
    expect(refundCalls(g)).toHaveLength(0);
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].status).toBe("cancelled"); // cancelled_dispute zaehlt als erledigt
  });

  it("Streit verloren: auch dann bleibt die Erstattung beendet (nie erstattet)", async () => {
    const g = await game();
    const id = dpId();
    const w = txn();
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(w, -800, 0, "dispute")] }));
    await send("charge.dispute.closed", dispute(g, id, { status: "lost", balance_transactions: [bt(w, -800, 0, "dispute")] }));
    await cancelledWithRefundRow(g);
    expect((await refundOf(g)).status).toBe("cancelled_dispute");
    expect(refundCalls(g)).toHaveLength(0);
  });

  it("Rennen: Erstattung war schon gesendet, dann geht der Streit verloren: Erstattung bleibt unveraendert, beide Bewegungen sind gebucht, refund_conflict mit Doppelverlust und ein Alarm", async () => {
    const g = await game();
    await cancelledWithRefundRow(g); // Erstattung geht sofort raus (kein Streit)
    const refunded = await refundOf(g);
    expect(refunded.status).toBe("succeeded");
    const id = dpId();
    const w = txn();
    await send("charge.dispute.created", dispute(g, id, { balance_transactions: [bt(w, -800, 0, "dispute")] }));
    await send("charge.dispute.closed", dispute(g, id, { status: "lost", balance_transactions: [bt(w, -800, 0, "dispute")] }));
    expect((await refundOf(g)).status).toBe("succeeded"); // unveraendert
    expect(await rowOf(id)).toMatchObject({ refundConflict: true, doubleLossCents: 800, status: "lost" });
    expect(await alertsFor(g, "Zahlungsstreit und Erstattung")).toBe(1);
    expect((await ledger(id)).length).toBe(1); // der Abzug ist gebucht
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("gleichzeitig: Streit-Ereignisse und Erstattungsversand verklemmen sich nicht, am Ende ist alles konsistent", async () => {
    const g = await game();
    const id = dpId();
    const w = txn();
    const obj = dispute(g, id, { balance_transactions: [bt(w, -800, 0, "dispute")] });
    await Promise.all([
      send("charge.dispute.created", obj),
      send("charge.dispute.created", obj),
      requestMatchCancel(null, g.match.id, "Test"),
      sendPendingRefunds(g.match.id),
      send("charge.dispute.funds_withdrawn", obj),
    ]);
    expect((await entriesOf(id)).map((e) => e.status)).toEqual(["booked"]);
    expect(await ledger(id)).toHaveLength(1);
    expect((await trialBalance()).balanced).toBe(true);
  });
});
