import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentChargeAttempts, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { inGraceWindow } from "@/lib/grace";
import { retryChargesInWindow, rotateAttempt } from "@/server/payments/charge-retry";
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
    provider.setIntentStatus(g.piId, "succeeded", { customerId: g.customerId });

    await retryChargesInWindow({ userId: g.u.id });

    expect(provider.calls.filter((c) => c.method === "retrievePaymentIntent" && (c.args as { paymentIntentId: string }).paymentIntentId === g.piId)).toHaveLength(1);
    expect(provider.calls.filter((c) => c.method === "findPaymentIntents")).toHaveLength(0); // keine Suche (verzoegert konsistent), nur retrieve
    expect(createCalls()).toHaveLength(0);
    expect(await rowOf(g)).toMatchObject({ status: "succeeded", currentAttempt: 1 });
    const entries = await ledgerOf(g);
    expect(entries).toHaveLength(1);
    expect(entries[0].idempotencyKey).toBe(`charge:${g.piId}`);
  });

  it("ein noch offener alter PaymentIntent wird erst abgebrochen; nie zwei offene Versuche", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setIntentStatus(g.piId, "requires_action", { customerId: g.customerId });

    await retryChargesInWindow({ userId: g.u.id });

    const order = provider.calls.map((c) => c.method).filter((m) => m === "cancelPaymentIntent" || m === "createPaymentIntent");
    expect(order).toEqual(["cancelPaymentIntent", "createPaymentIntent"]);
    expect(provider.calls.find((c) => c.method === "cancelPaymentIntent")?.args).toMatchObject({ paymentIntentId: g.piId });
    expect((await rowOf(g)).status).toBe("succeeded");
  });

  it("Abbrechen scheitert (Netzfehler): in dieser Runde wird NICHT neu abgebucht, die Zeile bleibt unveraendert; die naechste Runde klappt", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setIntentStatus(g.piId, "requires_action", { customerId: g.customerId });
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
    provider.setIntentStatus(g.piId, "requires_action", { customerId: g.customerId });
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
    expect(inGraceWindow((await rowOf(g)).graceUntil, g.match.startsAt, new Date())).toBe(false);
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("alter Versuch noch 'processing': Runde ausgelassen, kein zweiter Versuch, keine Abbuchung", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setIntentStatus(g.piId, "processing", { customerId: g.customerId });
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
    expect(provider.calls.some((c) => c.method === "cancelPaymentIntent")).toBe(false);
    expect(await rowOf(g)).toMatchObject({ status: "failed", currentAttempt: 1 });
  });

  it("technische Zustaende (idempotency_mismatch, after_start) bekommen kein Wiederabbuchen, auch nicht mit neuer Karte", async () => {
    for (const code of ["idempotency_mismatch", "after_start"]) {
      const g = await failedGame();
      await db.update(paymentCharges).set({ failureCode: code }).where(eq(paymentCharges.id, g.row.id));
      await changeCard(g);
      expect(await retryChargesInWindow({ userId: g.u.id }), code).toBe(0);
    }
    expect(createCalls()).toHaveLength(0);
  });

  it("der Termin wird nach dem Fehler vorverlegt: das Fenster endet spaetestens 1 h vor dem neuen Anstoss (Punkt 7)", async () => {
    const g = await failedGame();
    await changeCard(g);
    expect(inGraceWindow((await rowOf(g)).graceUntil, g.match.startsAt, new Date())).toBe(true);
    await db.update(matches).set({ startsAt: new Date(Date.now() + 50 * 60_000) }).where(eq(matches.id, g.match.id)); // Anstoss in 50 Minuten
    expect(await retryChargesInWindow({ userId: g.u.id })).toBe(0);
    expect(createCalls()).toHaveLength(0);
  });

  it("auch die Versuche der Historie werden per retrieve geprueft (alle bekannten PaymentIntents)", async () => {
    const g = await failedGame();
    await changeCard(g);
    provider.setChargeOutcome(g.u.id, "declined");
    await retryChargesInWindow({ userId: g.u.id }); // Versuch 2 scheitert
    await changeCard(g);
    provider.setChargeOutcome(g.u.id, "succeeded");
    provider.calls.length = 0;
    await retryChargesInWindow({ userId: g.u.id });
    const retrieved = provider.calls.filter((c) => c.method === "retrievePaymentIntent").map((c) => (c.args as { paymentIntentId: string }).paymentIntentId);
    const hist = await attemptsOf(g);
    expect(retrieved).toContain(g.piId); // Versuch 1 (Historie)
    expect(retrieved.length).toBeGreaterThanOrEqual(2); // und der laufende Versuch 2
    expect(hist.length).toBe(2);
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
    await Promise.all([retryChargesInWindow({ userId: g.u.id }), retryChargesInWindow({ userId: g.u.id }), retryChargesInWindow({ matchId: g.match.id })]);
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

describe("rotateAttempt: Bedingungen werden IN der Transaktion erneut geprueft", () => {
  const cand = (g: G, attempt = 1) => ({ id: g.row.id, matchId: g.match.id, userId: g.u.id, attempt, amountCents: 800 });
  it("veralteter Kandidat (current_attempt hat sich geaendert): kein weiterer Versuch (Compare-and-set)", async () => {
    const g = await failedGame();
    await changeCard(g);
    expect(await rotateAttempt(cand(g, 1), new Date())).toBe(true); // Versuch 2 angelegt
    // der Versuch 2 scheitert sofort wieder, der Platz ist erneut bereit; ein VERALTETER Kandidat (Versuch 1) darf nicht noch einmal drehen
    await db.update(paymentCharges).set({ status: "failed", failureCode: "card_declined" }).where(eq(paymentCharges.id, g.row.id));
    await changeCard(g);
    expect(await rotateAttempt(cand(g, 1), new Date())).toBe(false);
    expect((await rowOf(g)).currentAttempt).toBe(2);
    expect(await attemptsOf(g)).toHaveLength(1);
  });
  it("Fenster abgelaufen oder Termin vorverlegt: false, auch wenn der Kandidat schon ausgewaehlt war", async () => {
    const g = await failedGame();
    await changeCard(g);
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 1000) }).where(eq(paymentCharges.id, g.row.id));
    expect(await rotateAttempt(cand(g), new Date())).toBe(false);
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() + 3_600_000) }).where(eq(paymentCharges.id, g.row.id));
    await db.update(matches).set({ startsAt: new Date(Date.now() + 50 * 60_000) }).where(eq(matches.id, g.match.id));
    expect(await rotateAttempt(cand(g), new Date())).toBe(false);
  });
  it("technischer Zustand (idempotency_mismatch): false", async () => {
    const g = await failedGame();
    await changeCard(g);
    await db.update(paymentCharges).set({ failureCode: "idempotency_mismatch" }).where(eq(paymentCharges.id, g.row.id));
    expect(await rotateAttempt(cand(g), new Date())).toBe(false);
  });
});

describe("Sperrreihenfolge (Spiel zuerst)", () => {
  it("eine parallele Absage haelt die Spielsperre: das Wiederabbuchen wartet und legt danach KEINEN neuen Versuch an", async () => {
    const g = await failedGame();
    await changeCard(g);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockedP = new Promise<void>((resolve) => (locked = resolve));
    const cancelTx = db.transaction(async (tx) => {
      await tx.select().from(matches).where(eq(matches.id, g.match.id)).for("update");
      await tx.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "parallel" }).where(eq(matches.id, g.match.id));
      locked();
      await held;
    });
    await lockedP;
    let done = false;
    const retry = retryChargesInWindow({ userId: g.u.id }).then((n) => {
      done = true;
      return n;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(done).toBe(false); // wartet auf die Spielsperre
    release();
    await cancelTx;
    expect(await retry).toBe(0);
    expect(createCalls()).toHaveLength(0);
    expect(await rowOf(g)).toMatchObject({ status: "failed", currentAttempt: 1 });
    expect(await attemptsOf(g)).toHaveLength(0);
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
      provider.setIntentStatus(g.piId, "requires_action", { customerId: g.customerId });
      await retryChargesInWindow({ userId: g.u.id });
      expect(provider.calls.some((c) => c.method === "cancelPaymentIntent")).toBe(true);
      expect(createCalls()).toHaveLength(1);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });
});
