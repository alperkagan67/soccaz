import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { trialBalance, walletBalance } from "@/server/ledger";
import { bookChargeFee, bookOpenFees } from "@/server/payments/charge";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { StripeProvider } from "@/server/payments/stripe";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch } from "./helpers";

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_ch_%"));
});
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_ch_%"));
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Spiel mit einem Spieler, Zahlungsprofil (Kunde) und einer angelegten Abbuchungszeile (pending), wie sie M2b anlegen wird. */
async function charge(amountCents = 800, opts: { piId?: string | null } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const u = await addPlayer(m.match.id, m.home.id, "ch");
  const customerId = nid("cus_ch");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_ch") });
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  const piId = opts.piId === undefined ? nid("pi_ch") : opts.piId;
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents, idempotencyKey: `charge:${m.match.id}:${u.id}`, paymentIntentId: piId }).returning();
  return { m, u, customerId, piId, row };
}
type C = Awaited<ReturnType<typeof charge>>;

const piObject = (c: C, over: Record<string, unknown> = {}) => ({
  id: c.piId,
  amount: c.row.amountCents,
  currency: "eur",
  customer: c.customerId,
  metadata: { matchId: c.m.match.id, userId: c.u.id },
  ...over,
});
const send = (type: string, object: Record<string, unknown>, id = nid("evt_ch")) => {
  const e = provider.signEvent({ id, type, object });
  return handleStripeWebhook(e.rawBody, e.signature);
};
const rowOf = async (c: C) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, c.row.id)))[0];
const seatOf = async (c: C) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, c.m.match.id), eq(matchParticipants.userId, c.u.id))))[0];
const ledgerOf = (c: C) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, c.m.match.id));
const auditsFor = async (action: string, entityId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)))).length;

describe("payment_intent.succeeded: Verbuchung", () => {
  it("bucht den Anteil clearing -> revenue (Schlüssel charge:<PI>), Zeile succeeded, Platz charged; Hauptbuch ausgeglichen, paid_cents und Guthaben unberührt", async () => {
    const c = await charge();
    expect((await send("payment_intent.succeeded", piObject(c))).status).toBe(200);
    const entries = await ledgerOf(c);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ debitAccount: "clearing", creditAccount: "revenue", amountCents: 800, kind: "match_share", idempotencyKey: `charge:${c.piId}`, debitUserId: null, creditUserId: null });
    expect(await rowOf(c)).toMatchObject({ status: "succeeded", failureCode: null });
    const seat = await seatOf(c);
    expect(seat.cardStatus).toBe("charged");
    expect(seat.paidCents).toBe(0); // paid_cents bleibt "nur Guthaben" (sonst kippt das Spiel ins Guthabenmodell)
    expect(await walletBalance(db, c.u.id)).toBe(0);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-10: dasselbe Ereignis dreimal parallel, danach nochmal mit neuer Ereignis-ID: genau eine Buchung", async () => {
    const c = await charge();
    const e = provider.signEvent({ id: nid("evt_ch"), type: "payment_intent.succeeded", object: piObject(c) });
    const rs = await Promise.all([1, 2, 3].map(() => handleStripeWebhook(e.rawBody, e.signature)));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await send("payment_intent.succeeded", piObject(c))).status).toBe(200); // Stripe-Wiederholung mit anderer Ereignis-ID
    expect(await ledgerOf(c)).toHaveLength(1);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("verspätet: succeeded nach failed gewinnt; failed nach succeeded ändert nichts", async () => {
    const a = await charge();
    await send("payment_intent.payment_failed", piObject(a, { last_payment_error: { code: "card_declined" } }));
    expect((await rowOf(a)).status).toBe("failed");
    expect((await seatOf(a)).cardStatus).toBe("failed");
    await send("payment_intent.succeeded", piObject(a));
    expect((await rowOf(a)).status).toBe("succeeded");
    expect((await rowOf(a)).failureCode).toBeNull();
    expect((await seatOf(a)).cardStatus).toBe("charged");
    expect(await ledgerOf(a)).toHaveLength(1);

    const b = await charge();
    await send("payment_intent.succeeded", piObject(b));
    await send("payment_intent.payment_failed", piObject(b, { last_payment_error: { code: "card_declined" } }));
    await send("payment_intent.requires_action", piObject(b));
    expect((await rowOf(b)).status).toBe("succeeded");
    expect((await seatOf(b)).cardStatus).toBe("charged");
    expect(await ledgerOf(b)).toHaveLength(1);
  });

  it("Ereignis vor der Antwort des Auftrags (Zeile noch ohne PaymentIntent-ID): wird über Spiel und Nutzer aus den Metadaten gefunden und gebunden", async () => {
    const c = await charge(800, { piId: null });
    const pi = nid("pi_ch");
    c.piId = pi;
    await send("payment_intent.succeeded", piObject(c));
    expect(await rowOf(c)).toMatchObject({ status: "succeeded", paymentIntentId: pi });
    expect(await ledgerOf(c)).toHaveLength(1);
  });
});

describe("nur echte Abbuchungen aus payment_charges, alles andere wird ignoriert und im Audit vermerkt", () => {
  it("unbekannte PaymentIntents, fehlende oder kaputte Metadaten: nichts gebucht, Audit charge.ignored", async () => {
    const c = await charge();
    const unknown = nid("pi_unbekannt");
    await send("payment_intent.succeeded", { id: unknown, amount: 800, currency: "eur", customer: c.customerId, metadata: {} });
    await send("payment_intent.succeeded", { id: nid("pi_x"), amount: 800, currency: "eur", customer: c.customerId, metadata: { matchId: "kein-uuid", userId: c.u.id } });
    const piY = nid("pi_y");
    await send("payment_intent.succeeded", { id: piY, amount: 800, currency: "eur", customer: c.customerId, metadata: { matchId: c.m.match.id, userId: "00000000-0000-0000-0000-000000000000" } });
    expect(await ledgerOf(c)).toHaveLength(0);
    expect((await rowOf(c)).status).toBe("pending");
    expect(await auditsFor("charge.ignored", unknown)).toBe(1);
    expect(await auditsFor("charge.ignored", piY)).toBe(1); // Metadaten zeigen auf keine Abbuchung
  });

  it("Betrag, Währung, Kunde oder Metadaten weichen ab: nichts gebucht, Zeile bleibt pending", async () => {
    const c = await charge();
    const other = await charge();
    for (const over of [{ amount: 801 }, { amount: 1 }, { amount: null }, { currency: "usd" }, { currency: null }, { customer: other.customerId }, { customer: null }, { metadata: { matchId: other.m.match.id, userId: c.u.id } }, { metadata: { matchId: c.m.match.id, userId: other.u.id } }]) {
      await send("payment_intent.succeeded", piObject(c, over));
    }
    expect(await ledgerOf(c)).toHaveLength(0);
    expect((await rowOf(c)).status).toBe("pending");
    expect((await seatOf(c)).cardStatus).toBe("charge_pending");
    expect(await auditsFor("charge.ignored", c.piId!)).toBe(9);
  });

  it("die Zeile gehört zu einem anderen PaymentIntent: ein zweiter PaymentIntent mit denselben Metadaten wird ignoriert", async () => {
    const c = await charge();
    await send("payment_intent.succeeded", piObject(c, { id: nid("pi_zweiter") }));
    expect(await ledgerOf(c)).toHaveLength(0);
    expect((await rowOf(c)).status).toBe("pending");
  });

  it("andere payment_intent-Ereignisse (created, processing, canceled) buchen nichts", async () => {
    const c = await charge();
    for (const t of ["payment_intent.created", "payment_intent.processing", "payment_intent.canceled", "payment_intent.amount_capturable_updated"]) await send(t, piObject(c));
    expect(await ledgerOf(c)).toHaveLength(0);
    expect((await rowOf(c)).status).toBe("pending");
  });

  it("ohne gültige Signatur wird nichts verbucht", async () => {
    const c = await charge();
    const e = provider.signEvent({ id: nid("evt_ch"), type: "payment_intent.succeeded", object: piObject(c) });
    expect((await handleStripeWebhook(e.rawBody, "t=1,v1=00")).status).toBe(400);
    expect((await handleStripeWebhook(e.rawBody, null)).status).toBe(400);
    expect(await ledgerOf(c)).toHaveLength(0);
  });
});

describe("Fehlschläge: nur Status (Nachzahlfenster und Nachrücker sind M3)", () => {
  it("payment_failed: Zeile failed mit Code, Platz failed, kein Hauptbucheintrag; gleiche Meldung nochmal ändert nichts", async () => {
    const c = await charge();
    await send("payment_intent.payment_failed", piObject(c, { last_payment_error: { code: "insufficient_funds" } }));
    expect(await rowOf(c)).toMatchObject({ status: "failed", failureCode: "insufficient_funds" });
    expect((await seatOf(c)).cardStatus).toBe("failed");
    expect(await ledgerOf(c)).toHaveLength(0);
    const audits = await auditsFor("charge.failed", c.m.match.id);
    await send("payment_intent.payment_failed", piObject(c, { last_payment_error: { code: "insufficient_funds" } }));
    expect(await auditsFor("charge.failed", c.m.match.id)).toBe(audits);
  });

  it("requires_action (Authentifizierung nötig): Zeile requires_action, Platz failed, nichts gebucht; Code wird bereinigt", async () => {
    const c = await charge();
    await send("payment_intent.requires_action", piObject(c));
    expect(await rowOf(c)).toMatchObject({ status: "requires_action", failureCode: "authentication_required" });
    expect((await seatOf(c)).cardStatus).toBe("failed");
    const d = await charge();
    await send("payment_intent.payment_failed", piObject(d, { last_payment_error: { code: "<script>alert(1)</script>" } }));
    expect((await rowOf(d)).failureCode).toBe("unknown");
  });
});

describe("Stripe-Gebühr: echt, als eigener Folgeschritt, nie geschätzt", () => {
  it("Gebühr noch nicht verfügbar: Anteil ist gebucht, Gebühr nicht (fee_cents null, kein fee-Eintrag); später verfügbar: genau einmal gebucht", async () => {
    const c = await charge();
    await send("payment_intent.succeeded", piObject(c)); // Fake: Gebühr null
    expect((await ledgerOf(c)).map((e) => e.kind)).toEqual(["match_share"]);
    expect((await rowOf(c)).feeCents).toBeNull();
    expect(await bookChargeFee(c.piId!)).toBe("unavailable");

    provider.setFee(c.piId!, 37);
    await send("charge.updated", { id: nid("ch"), payment_intent: c.piId });
    await send("charge.updated", { id: nid("ch"), payment_intent: c.piId }); // doppelt
    expect(await bookChargeFee(c.piId!)).toBe("already");
    const entries = await ledgerOf(c);
    const fee = entries.find((e) => e.kind === "fee")!;
    expect(entries).toHaveLength(2);
    expect(fee).toMatchObject({ debitAccount: "fees", creditAccount: "clearing", amountCents: 37, idempotencyKey: `fee:${c.piId}` });
    expect((await rowOf(c)).feeCents).toBe(37);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gebühr direkt beim succeeded verfügbar: wird nach der Verbuchung in einem Folgeschritt gebucht", async () => {
    const c = await charge();
    provider.setFee("*", 29);
    await send("payment_intent.succeeded", piObject(c));
    expect((await ledgerOf(c)).map((e) => e.kind).sort()).toEqual(["fee", "match_share"]);
    expect((await rowOf(c)).feeCents).toBe(29);
  });

  it("Gebühr 0: fee_cents 0, keine Buchung; Nachholer bucht offene Gebühren, Fehler beim Abruf bucht nichts", async () => {
    const a = await charge();
    provider.setFee("*", 0);
    await send("payment_intent.succeeded", piObject(a));
    expect((await rowOf(a)).feeCents).toBe(0);
    expect((await ledgerOf(a)).map((e) => e.kind)).toEqual(["match_share"]);

    const b = await charge();
    provider.setFee("*", null);
    await send("payment_intent.succeeded", piObject(b));
    expect((await rowOf(b)).feeCents).toBeNull();
    provider.retrieveChargeFee = async () => {
      throw new Error("Netz weg");
    };
    expect(await bookChargeFee(b.piId!)).toBe("unavailable");
    provider.retrieveChargeFee = FakeProvider.prototype.retrieveChargeFee.bind(provider);
    provider.setFee(b.piId!, 12);
    expect(await bookOpenFees(500)).toBeGreaterThanOrEqual(1);
    expect((await rowOf(b)).feeCents).toBe(12);
  });

  it("Gebühr für nicht erfolgreiche oder unbekannte Abbuchungen wird nicht gebucht", async () => {
    const c = await charge();
    provider.setFee("*", 20);
    expect(await bookChargeFee(c.piId!)).toBe("unknown"); // noch pending
    expect(await bookChargeFee("pi_gibt_es_nicht")).toBe("unknown");
    expect((await ledgerOf(c)).filter((e) => e.kind === "fee")).toHaveLength(0);
  });
});

describe("Netzaufrufe nie innerhalb einer Datenbanktransaktion", () => {
  it("Gebührenabruf nach succeeded und per charge.updated passiert außerhalb von db.transaction", async () => {
    let depth = 0;
    const original = db.transaction.bind(db);
    (db as unknown as { transaction: unknown }).transaction = ((fn: never, cfg: never) => {
      depth += 1;
      return (original as (f: never, c: never) => Promise<unknown>)(fn, cfg).finally(() => {
        depth -= 1;
      });
    }) as never;
    provider.inTransaction = () => depth > 0;
    try {
      const c = await charge();
      provider.setFee("*", 15);
      await send("payment_intent.succeeded", piObject(c));
      provider.setFee("*", null); // beim zweiten ist die Gebühr noch nicht da, per charge.updated kommt sie
      const d = await charge();
      await send("payment_intent.succeeded", piObject(d));
      provider.setFee(d.piId!, 21);
      await send("charge.updated", { id: nid("ch"), payment_intent: d.piId });
      expect(provider.calls.filter((x) => x.method === "retrieveChargeFee").length).toBeGreaterThanOrEqual(3);
      expect((await rowOf(d)).feeCents).toBe(21);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });
});

describe("Anbieter: FakeProvider steuerbar, StripeProvider-Abbildung (ohne Netz)", () => {
  const input = { customerId: "cus_x", paymentMethodId: "pm_x", amountCents: 800, idempotencyKey: "charge:a:b", metadata: { matchId: "a", userId: "b" } };

  it("Fake: gleicher Schlüssel ergibt denselben PaymentIntent; Ausgänge steuerbar", async () => {
    const a = await provider.createPaymentIntent(input);
    expect(a).toMatchObject({ status: "succeeded", failureCode: null });
    expect((await provider.createPaymentIntent(input)).id).toBe(a.id);
    provider.setChargeOutcome("b", "declined");
    expect(await provider.createPaymentIntent(input)).toMatchObject({ status: "failed", failureCode: "card_declined" });
    provider.setChargeOutcome("b", "requires_action");
    expect(await provider.createPaymentIntent(input)).toMatchObject({ status: "requires_action", failureCode: "authentication_required" });
    provider.setChargeOutcome("b", "error");
    await expect(provider.createPaymentIntent(input)).rejects.toThrow();
  });

  async function stripeWith(client: unknown) {
    const p = new StripeProvider({ secretKey: "sk_test_dummy_nicht_echt" });
    (p as unknown as { client: unknown }).client = client;
    return p;
  }

  it("Stripe: erfolgreich, processing, abgelehnt und Authentifizierung nötig werden abgebildet; Netzfehler wird nicht verschluckt", async () => {
    const seen: unknown[] = [];
    const mk = (impl: () => Promise<unknown>) => stripeWith({ paymentIntents: { create: async (...a: unknown[]) => (seen.push(a), impl()) } });
    expect(await (await mk(async () => ({ id: "pi_1", status: "succeeded" }))).createPaymentIntent(input)).toEqual({ id: "pi_1", status: "succeeded", failureCode: null });
    expect(await (await mk(async () => ({ id: "pi_2", status: "processing" }))).createPaymentIntent(input)).toMatchObject({ status: "processing" });
    expect(await (await mk(async () => ({ id: "pi_3", status: "requires_payment_method", last_payment_error: { code: "card_declined" } }))).createPaymentIntent(input)).toEqual({ id: "pi_3", status: "failed", failureCode: "card_declined" });
    const declined = Object.assign(new Error("declined"), { type: "StripeCardError", code: "insufficient_funds", payment_intent: { id: "pi_4", status: "requires_payment_method" } });
    expect(await (await mk(async () => Promise.reject(declined))).createPaymentIntent(input)).toEqual({ id: "pi_4", status: "failed", failureCode: "insufficient_funds" });
    const auth = Object.assign(new Error("auth"), { type: "StripeCardError", code: "authentication_required", payment_intent: { id: "pi_5", status: "requires_action" } });
    expect(await (await mk(async () => Promise.reject(auth))).createPaymentIntent(input)).toEqual({ id: "pi_5", status: "requires_action", failureCode: "authentication_required" });
    await expect((await mk(async () => Promise.reject(Object.assign(new Error("Netz"), { type: "StripeConnectionError" })))).createPaymentIntent(input)).rejects.toThrow();
    // Aufruf: Betrag, EUR, off_session, confirm, Schlüssel
    const [params, opts] = seen[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(params).toMatchObject({ amount: 800, currency: "eur", customer: "cus_x", payment_method: "pm_x", off_session: true, confirm: true, metadata: { matchId: "a", userId: "b" } });
    expect(opts).toMatchObject({ idempotencyKey: "charge:a:b" });
  });

  it("Stripe: Gebühr nur aus der balance_transaction in EUR, sonst null (nie geschätzt)", async () => {
    const retrieve = (pi: unknown) => stripeWith({ paymentIntents: { retrieve: async () => pi } });
    expect(await (await retrieve({ latest_charge: { balance_transaction: { fee: 41, currency: "eur" } } })).retrieveChargeFee("pi")).toBe(41);
    expect(await (await retrieve({ latest_charge: { balance_transaction: { fee: 0, currency: "eur" } } })).retrieveChargeFee("pi")).toBe(0);
    expect(await (await retrieve({ latest_charge: "ch_nicht_expandiert" })).retrieveChargeFee("pi")).toBeNull();
    expect(await (await retrieve({ latest_charge: { balance_transaction: null } })).retrieveChargeFee("pi")).toBeNull();
    expect(await (await retrieve({ latest_charge: { balance_transaction: { fee: 41, currency: "usd" } } })).retrieveChargeFee("pi")).toBeNull();
    expect(await (await retrieve({ latest_charge: { balance_transaction: { fee: -1, currency: "eur" } } })).retrieveChargeFee("pi")).toBeNull();
    expect(await (await retrieve({ latest_charge: null })).retrieveChargeFee("pi")).toBeNull();
  });
});

describe("Hauptbuch und Guthaben bleiben getrennt", () => {
  it("Abbuchungen schreiben nur in clearing/revenue/fees, nie auf ein Guthaben-Konto", async () => {
    const c = await charge();
    provider.setFee("*", 10);
    await send("payment_intent.succeeded", piObject(c));
    const rows = await db.select().from(ledgerEntries).where(or(eq(ledgerEntries.matchId, c.m.match.id), eq(ledgerEntries.debitUserId, c.u.id), eq(ledgerEntries.creditUserId, c.u.id)));
    for (const r of rows) {
      expect(r.debitAccount).not.toBe("wallet");
      expect(r.creditAccount).not.toBe("wallet");
    }
  });
});
