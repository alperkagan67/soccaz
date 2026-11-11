import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentChargeAttempts, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { retryChargesInWindow } from "@/server/payments/charge-retry";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-1 (AC-7): Nachzahlen im Fenster. Ein neuer Versuch bekommt einen neuen Schluessel (charge:<m>:<u>:<n>) und einen neuen PaymentIntent, aber
// erst nach der Stripe-Suche nach dem alten; nie zwei offene Versuche, nie zwei Buchungen.

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_gt_%"));
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_gt_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Spiel mit einem Spieler, dessen erste Abbuchung per Webhook abgelehnt wurde (Fenster laeuft), Platz failed. */
async function failedGame(hoursAhead = 72) {
  const m = await makeMatch({ hoursAhead, priceCents: 8000, costCents: 8000 });
  const u = await addPlayer(m.match.id, m.home.id, "gt");
  const customerId = nid("cus_gt");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_old") });
  const piId = nid("pi_gt");
  const base = `charge:${m.match.id}:${u.id}`;
  const [row] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: base, paymentIntentId: piId }).returning();
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  const g = { ...m, u, customerId, piId, row, base };
  await send(g, g.piId, "payment_intent.payment_failed", "card_declined");
  return g;
}
type G = Awaited<ReturnType<typeof failedGame>>;

function send(g: Pick<G, "match" | "u" | "customerId">, piId: string, type: string, code: string | null) {
  const object = { id: piId, amount: 800, currency: "eur", customer: g.customerId, metadata: { matchId: g.match.id, userId: g.u.id }, last_payment_error: code ? { code } : undefined };
  const e = provider.signEvent({ id: nid("evt_gt"), type, object });
  return handleStripeWebhook(e.rawBody, e.signature);
}
/** "Karte aendern" im Konto/Lobby: neues Zahlungsmittel, Platz wieder bereit (das macht der Webhook setup_intent.succeeded). */
async function changeCard(g: G) {
  await db.update(paymentProfiles).set({ paymentMethodId: nid("pm_new") }).where(eq(paymentProfiles.userId, g.u.id));
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.u.id)));
}
const rowOf = async (g: G) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id)))[0];
const seatOf = async (g: G) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.u.id))))[0];
const attemptsOf = (g: G) => db.select().from(paymentChargeAttempts).where(eq(paymentChargeAttempts.chargeId, g.row.id)).orderBy(asc(paymentChargeAttempts.attemptNo));
const ledgerOf = (g: G) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id));
const createCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");
const auditCount = async (action: string, matchId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, matchId)))).length;

describe("AC-7: Wiederabbuchen im Fenster nach 'Karte aendern'", () => {
  it("neuer Versuch mit neuem Schluessel und neuem PaymentIntent; Erfolg: Zeile succeeded, Platz charged, genau eine Buchung, Historie enthaelt Versuch 1", async () => {
    const g = await failedGame();
    expect((await rowOf(g)).status).toBe("failed");
    await changeCard(g);

    const n = await retryChargesInWindow({ userId: g.u.id });
    expect(n).toBe(1);

    expect(createCalls()).toHaveLength(1);
    expect((createCalls()[0].args as { idempotencyKey: string }).idempotencyKey).toBe(`${g.base}:2`);
    const r = await rowOf(g);
    expect(r).toMatchObject({ status: "succeeded", currentAttempt: 2, idempotencyKey: `${g.base}:2` });
    expect(r.paymentIntentId).not.toBe(g.piId);
    expect((await seatOf(g)).cardStatus).toBe("charged");
    const hist = await attemptsOf(g);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ attemptNo: 1, idempotencyKey: g.base, paymentIntentId: g.piId, status: "failed", failureCode: "card_declined" });
    const entries = await ledgerOf(g);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ debitAccount: "clearing", creditAccount: "revenue", amountCents: 800, kind: "match_share" });
  });

  it("vorher sucht es bei Stripe nach dem alten Versuch; ist er dort inzwischen erfolgreich, wird verbucht und NICHT neu abgebucht", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setFound(g.match.id, g.u.id, [{ id: g.piId, status: "succeeded", amountCents: 800, currency: "eur", customerId: g.customerId, failureCode: null }]);

    await retryChargesInWindow({ userId: g.u.id });

    expect(provider.calls.filter((c) => c.method === "findPaymentIntents")).toHaveLength(1);
    expect(createCalls()).toHaveLength(0);
    expect(await rowOf(g)).toMatchObject({ status: "succeeded", currentAttempt: 1 });
    const entries = await ledgerOf(g);
    expect(entries).toHaveLength(1);
    expect(entries[0].idempotencyKey).toBe(`charge:${g.piId}`);
  });

  it("ein noch offener alter PaymentIntent wird erst abgebrochen; nie zwei offene Versuche", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setFound(g.match.id, g.u.id, [{ id: g.piId, status: "requires_action", amountCents: 800, currency: "eur", customerId: g.customerId, failureCode: null }]);

    await retryChargesInWindow({ userId: g.u.id });

    const order = provider.calls.map((c) => c.method).filter((m) => m === "cancelPaymentIntent" || m === "createPaymentIntent");
    expect(order).toEqual(["cancelPaymentIntent", "createPaymentIntent"]);
    expect(provider.calls.find((c) => c.method === "cancelPaymentIntent")?.args).toMatchObject({ paymentIntentId: g.piId });
    expect((await rowOf(g)).status).toBe("succeeded");
  });

  it("Abbrechen scheitert (Netzfehler): in dieser Runde wird NICHT neu abgebucht, die Zeile bleibt unveraendert; die naechste Runde klappt", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setFound(g.match.id, g.u.id, [{ id: g.piId, status: "requires_action", amountCents: 800, currency: "eur", customerId: g.customerId, failureCode: null }]);
    provider.setCancelOutcome(g.piId, "error");

    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
    expect(await rowOf(g)).toMatchObject({ status: "failed", currentAttempt: 1 });
    expect(await attemptsOf(g)).toHaveLength(0);

    provider.setCancelOutcome(g.piId, "canceled");
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(1);
    expect((await rowOf(g)).status).toBe("succeeded");
  });

  it("Abbrechen meldet 'schon erfolgreich': wird verbucht, nicht neu abgebucht", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setFound(g.match.id, g.u.id, [{ id: g.piId, status: "requires_action", amountCents: 800, currency: "eur", customerId: g.customerId, failureCode: null }]);
    provider.setCancelOutcome(g.piId, "succeeded");

    await retryChargesInWindow({ userId: g.u.id });

    expect(createCalls()).toHaveLength(0);
    expect(await rowOf(g)).toMatchObject({ status: "succeeded", currentAttempt: 1 });
    expect((await ledgerOf(g))[0].idempotencyKey).toBe(`charge:${g.piId}`);
  });

  it("ausserhalb des Fensters (grace_until vorbei) wird nichts gesendet", async () => {
    const g = await failedGame();
    await changeCard(g);
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 1000) }).where(eq(paymentCharges.id, g.row.id));
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("ohne Fenster (weniger als 1 h bis zum Anstoss) wird nichts gesendet", async () => {
    const g = await failedGame(0.9);
    await changeCard(g);
    expect((await rowOf(g)).graceUntil).toBeNull();
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("solange der Platz nicht card_ready ist (keine neue Karte), wird nichts gesendet", async () => {
    const g = await failedGame();
    expect((await seatOf(g)).cardStatus).toBe("failed");
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("Absage angefordert oder Spiel nicht mehr offen: nichts wird gesendet", async () => {
    const a = await failedGame();
    await changeCard(a);
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test" }).where(eq(matches.id, a.match.id));
    const b = await failedGame();
    await changeCard(b);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, b.match.id));
    expect(await retryChargesInWindow({ userId: a.u.id })).toBe(0);
    expect(await retryChargesInWindow({ userId: b.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("zwei parallele Laeufe erzeugen genau EINEN neuen Versuch (ein PaymentIntent, ein Historieneintrag, eine Buchung)", async () => {
    const g = await failedGame();
    await changeCard(g);
    await Promise.all([retryChargesInWindow({ userId: g.u.id }), retryChargesInWindow({ userId: g.u.id }), retryChargesInWindow({})]);
    expect(createCalls()).toHaveLength(1);
    expect(await attemptsOf(g)).toHaveLength(1);
    expect(await ledgerOf(g)).toHaveLength(1);
    expect((await rowOf(g)).currentAttempt).toBe(2);
  });

  it("scheitert auch der neue Versuch, bleibt das Fenster das alte; ein weiterer Versuch nach der naechsten Karte bekommt Schluessel :3", async () => {
    const g = await failedGame();
    await changeCard(g);
    const graceBefore = (await rowOf(g)).graceUntil!.getTime();
    provider.setChargeOutcome(g.u.id, "declined");
    await retryChargesInWindow({ userId: g.u.id });
    const afterSecond = await rowOf(g);
    expect(afterSecond).toMatchObject({ status: "failed", currentAttempt: 2 });
    expect(afterSecond.graceUntil!.getTime()).toBe(graceBefore); // das Fenster wird nicht verschoben
    expect((await seatOf(g)).cardStatus).toBe("failed");

    await changeCard(g);
    provider.setChargeOutcome(g.u.id, "succeeded");
    await retryChargesInWindow({ userId: g.u.id });
    expect((createCalls().at(-1)!.args as { idempotencyKey: string }).idempotencyKey).toBe(`${g.base}:3`);
    expect((await attemptsOf(g)).map((a) => a.attemptNo)).toEqual([1, 2]);
    expect((await rowOf(g)).status).toBe("succeeded");
  });
});

describe("Webhook-Zuordnung ueber die Versuche (Backlog 42)", () => {
  it("Ereignis eines ALTEN Versuchs: failed/requires_action aendern nichts (nur Audit), succeeded wird als Erfolg der Zeile verbucht", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setChargeOutcome(g.u.id, "error"); // der neue Versuch bleibt offen (Ausgang unbekannt)
    await retryChargesInWindow({ userId: g.u.id });
    expect(await rowOf(g)).toMatchObject({ status: "pending", currentAttempt: 2, paymentIntentId: null });

    await send(g, g.piId, "payment_intent.payment_failed", "insufficient_funds");
    await send(g, g.piId, "payment_intent.requires_action", null);
    expect(await rowOf(g)).toMatchObject({ status: "pending", currentAttempt: 2 });
    expect((await ledgerOf(g)).length).toBe(0);

    await send(g, g.piId, "payment_intent.succeeded", null);
    expect(await rowOf(g)).toMatchObject({ status: "succeeded" });
    const entries = await ledgerOf(g);
    expect(entries).toHaveLength(1);
    expect(entries[0].idempotencyKey).toBe(`charge:${g.piId}`);
  });

  it("ein zweiter erfolgreicher PaymentIntent zur selben Zeile wird nicht doppelt gebucht, aber auditiert (Erstattung: M3f)", async () => {
    const g = await failedGame();
    await send(g, g.piId, "payment_intent.succeeded", null); // alter Versuch gelingt doch noch (Zeile war failed)
    expect((await rowOf(g)).status).toBe("succeeded");
    const second = nid("pi_dup");
    await send(g, second, "payment_intent.succeeded", null);
    expect(await ledgerOf(g)).toHaveLength(1);
    expect(await auditCount("charge.duplicate_success", g.match.id)).toBe(1);
  });

  it("Altzeile ohne Historie: das Ereignis wird weiter ueber payment_charges.payment_intent_id zugeordnet (Fallback)", async () => {
    const g = await failedGame();
    expect(await attemptsOf(g)).toHaveLength(0);
    await send(g, g.piId, "payment_intent.succeeded", null);
    expect((await rowOf(g)).status).toBe("succeeded");
  });
});

describe("Struktur", () => {
  it("kein Netzaufruf (Suche, Abbrechen, Senden) innerhalb von db.transaction", async () => {
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
      const g = await failedGame();
      await changeCard(g);
      provider.setFound(g.match.id, g.u.id, [{ id: g.piId, status: "requires_action", amountCents: 800, currency: "eur", customerId: g.customerId, failureCode: null }]);
      await retryChargesInWindow({ userId: g.u.id });
      expect(provider.calls.some((c) => c.method === "cancelPaymentIntent")).toBe(true);
      expect(createCalls()).toHaveLength(1);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });
});
