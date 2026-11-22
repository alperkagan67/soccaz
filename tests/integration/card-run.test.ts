import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries, receipts } from "@/db/schema-finance";
import { trialBalance } from "@/server/ledger";
import { ATTEMPT_MAX_AGE_MS, chargeAmount, CLAIM_LEASE_MS, MIN_CHARGE_CENTS, runCharges } from "@/server/payments/charge-run";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, SHARE_ACCOUNT } from "./helpers";

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cr_%"));
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cr_%"));
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type Setup = { price?: number; share?: number; n?: number; hoursAhead?: number };
/** Kartenspiel, fertig zum Abbuchen: n Spieler mit Karte (card_ready) und Zahlungsprofil, beide Captains bereit, Anteil fixiert (wie nach dem zweiten Bereit). */
async function game(o: Setup = {}) {
  const n = o.n ?? 10;
  const price = o.price ?? 8000;
  const share = o.share ?? Math.ceil(price / n);
  const m = await makeMatch({ hoursAhead: o.hoursAhead ?? 72, priceCents: price, costCents: price });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) {
    await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_cr"), paymentMethodId: nid("pm_cr") });
  }
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: share, status: "confirmed" }).where(eq(matches.id, m.match.id));
  return { ...m, all, price, share };
}
type G = Awaited<ReturnType<typeof game>>;

const rowsOf = (g: G) => db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
const ledgerOf = (g: G) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id));
const matchOf = async (g: G) => (await db.select().from(matches).where(eq(matches.id, g.match.id)))[0];
const seats = (g: G) => db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id));
const piCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");
const shares = (g: G) => ledgerOf(g).then((es) => es.filter((e) => e.kind === "match_share"));
const auditCount = async (action: string, entityId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)))).length;

describe("AC-4/AC-5: Abbuchung eines Kartenspiels", () => {
  it("jeder eingeteilte Spieler wird genau einmal mit dem fixierten Anteil belastet (Schlüssel je Spieler und Spiel), Hauptbuch ausgeglichen, Spiel gebucht, Beleg je Spieler", async () => {
    const g = await game();
    const r = await runCharges(g.match.id);
    expect(r).toMatchObject({ reason: "ready", created: 10, attempted: 10, settled: true });

    expect(piCalls()).toHaveLength(10);
    for (const p of g.all) {
      const call = piCalls().find((c) => (c.args as { metadata: { userId: string } }).metadata.userId === p.id)!;
      expect(call.args).toMatchObject({ amountCents: 800, idempotencyKey: `charge:${g.match.id}:${p.id}` });
    }
    const rows = await rowsOf(g);
    expect(rows).toHaveLength(10);
    expect(rows.every((x) => x.status === "succeeded" && x.amountCents === 800 && x.paymentIntentId !== null)).toBe(true);
    expect(await shares(g)).toHaveLength(10);
    expect((await shares(g)).every((e) => e.debitAccount === "clearing" && e.creditAccount === SHARE_ACCOUNT && e.amountCents === 800)).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);

    const m = await matchOf(g);
    expect(m.settledAt).not.toBeNull();
    expect(m.finalShareCents).toBe(800); // bleibt
    expect((await seats(g)).every((s) => s.cardStatus === "charged" && s.paidCents === 0)).toBe(true);
    const rc = await db.select().from(receipts).where(eq(receipts.matchId, g.match.id));
    expect(rc).toHaveLength(10);
    expect(rc.every((x) => x.amountCents === 800)).toBe(true);
    expect(await auditCount("charge.settled", g.match.id)).toBe(1);
  });

  it("dreimal parallel und danach nochmal: je Spieler genau ein Stripe-Aufruf, eine Buchung, ein Beleg", async () => {
    const g = await game();
    await Promise.all([runCharges(g.match.id), runCharges(g.match.id), runCharges(g.match.id)]);
    await runCharges(g.match.id);
    expect(piCalls()).toHaveLength(10);
    expect(new Set(piCalls().map((c) => (c.args as { idempotencyKey: string }).idempotencyKey)).size).toBe(10);
    expect(await rowsOf(g)).toHaveLength(10);
    expect(await shares(g)).toHaveLength(10);
    expect(await db.select().from(receipts).where(eq(receipts.matchId, g.match.id))).toHaveLength(10);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("die Summe der Abbuchungen deckt die Miete (Rundung): 80,00 EUR / 7 Spieler = 11,43 EUR je Spieler, Überschuss bleibt in revenue", async () => {
    const g = await game({ n: 7, price: 8000 });
    await runCharges(g.match.id);
    const total = (await shares(g)).reduce((s, e) => s + e.amountCents, 0);
    expect(g.share).toBe(1143);
    expect(total).toBe(7 * 1143);
    expect(total).toBeGreaterThanOrEqual(8000);
    expect(total - 8000).toBeLessThan(7); // Rundungsüberschuss unter einem Cent je Spieler
  });
});

describe("Mindestbetrag 0,50 EUR (Entscheid des Orchestrators)", () => {
  it("chargeAmount: bei Miete > 0 mindestens 50 Cent, kostenlos oder Anteil 0 gar nicht", () => {
    expect(MIN_CHARGE_CENTS).toBe(50);
    expect(chargeAmount(8000, 800)).toBe(800);
    expect(chargeAmount(300, 30)).toBe(50);
    expect(chargeAmount(8000, 49)).toBe(50);
    expect(chargeAmount(8000, 50)).toBe(50);
    expect(chargeAmount(8000, 51)).toBe(51);
    expect(chargeAmount(0, 0)).toBeNull();
    expect(chargeAmount(null, 100)).toBeNull();
    expect(chargeAmount(8000, 0)).toBeNull();
    expect(chargeAmount(8000, null)).toBeNull();
  });

  it("Anteil unter 50 Cent wird auf 50 Cent angehoben; die Summe bleibt >= Miete, der Überschuss steht in revenue", async () => {
    const g = await game({ n: 10, price: 300, share: 30 });
    await runCharges(g.match.id);
    expect(piCalls().every((c) => (c.args as { amountCents: number }).amountCents === 50)).toBe(true);
    const total = (await shares(g)).reduce((s, e) => s + e.amountCents, 0);
    expect(total).toBe(500);
    expect(total).toBeGreaterThanOrEqual(300);
    expect((await matchOf(g)).finalShareCents).toBe(30); // fixierter Anteil unverändert
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("kostenloses Spiel (Miete 0): keine Abbuchung, keine Zeilen, nichts angehoben", async () => {
    const g = await game({ price: 0, share: 0, n: 4 });
    const r = await runCharges(g.match.id);
    expect(r).toMatchObject({ reason: "free", created: 0, attempted: 0 });
    expect(piCalls()).toHaveLength(0);
    expect(await rowsOf(g)).toHaveLength(0);
  });
});

describe("Voraussetzungen: ohne sie wird nichts angelegt und nichts gesendet", () => {
  async function expectNothing(g: G, reason: string) {
    const r = await runCharges(g.match.id);
    expect(r.reason).toBe(reason);
    expect(piCalls()).toHaveLength(0);
    expect(await rowsOf(g)).toHaveLength(0);
    expect(await shares(g)).toHaveLength(0);
  }

  it("ein Captain noch nicht bereit", async () => {
    const g = await game();
    await db.update(matches).set({ awayFinalAt: null }).where(eq(matches.id, g.match.id));
    await expectNothing(g, "not_confirmed");
  });

  it("Anteil nicht fixiert", async () => {
    const g = await game();
    await db.update(matches).set({ finalShareCents: null }).where(eq(matches.id, g.match.id));
    await expectNothing(g, "not_fixed");
  });

  it("ein eingeteilter Spieler ohne Karte", async () => {
    const g = await game();
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.all[3].id)));
    await expectNothing(g, "cards_missing");
  });

  it("Schalter AUS, Altspiel, Spiel mit Guthaben-Platz", async () => {
    const off = await game();
    await setSetting(null, "card_payments_enabled", false);
    await expectNothing(off, "not_card_mode");
    await setSetting(null, "card_payments_enabled", true);

    const legacy = await game();
    await db.update(matches).set({ legacyShareModel: true }).where(eq(matches.id, legacy.match.id));
    await expectNothing(legacy, "not_card_mode");

    const wallet = await game();
    await db.update(matchParticipants).set({ paidCents: 800 }).where(and(eq(matchParticipants.matchId, wallet.match.id), eq(matchParticipants.userId, wallet.all[0].id)));
    await expectNothing(wallet, "not_card_mode");
  });

  it("zu wenig eingeteilte Spieler für die Miete (Summe deckt den Preis nicht)", async () => {
    const g = await game({ n: 10, price: 8000, share: 100 }); // 10 x 100 = 1000 < 8000
    await expectNothing(g, "uncovered");
  });

  it("schon abgerechnet, abgesagt oder gestartet", async () => {
    const settled = await game();
    await db.update(matches).set({ settledAt: new Date() }).where(eq(matches.id, settled.match.id));
    await expectNothing(settled, "not_open");
    const cancelled = await game();
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, cancelled.match.id));
    await expectNothing(cancelled, "not_open");
    const started = await game();
    expect((await runCharges(started.match.id, new Date(Date.now() + 100 * 3_600_000))).reason).toBe("not_open");
    expect(piCalls()).toHaveLength(0);
  });
});

describe("Teil-Erfolg und Fehlschläge: nur Status, keine Absage, kein Neuversuch", () => {
  it("eine abgelehnte Karte: Rest ist belastet, Spiel bleibt unabgerechnet und aktiv, Wiederholung sendet nichts erneut", async () => {
    const g = await game();
    provider.setChargeOutcome(g.all[2].id, "declined");
    const r = await runCharges(g.match.id);
    expect(r).toMatchObject({ attempted: 10, settled: false });
    const rows = await rowsOf(g);
    expect(rows.filter((x) => x.status === "succeeded")).toHaveLength(9);
    expect(rows.find((x) => x.userId === g.all[2].id)).toMatchObject({ status: "failed", failureCode: "card_declined" });
    expect((await shares(g)).length).toBe(9);
    const m = await matchOf(g);
    expect(m.settledAt).toBeNull();
    expect(m.status).toBe("confirmed"); // nicht abgesagt
    expect((await seats(g)).find((s) => s.userId === g.all[2].id)!.cardStatus).toBe("failed");
    expect((await trialBalance()).balanced).toBe(true);

    await runCharges(g.match.id);
    await runCharges(g.match.id);
    expect(piCalls()).toHaveLength(10); // kein Neuversuch für die fehlgeschlagene Zeile
    expect(await shares(g)).toHaveLength(9);
  });

  it("Authentifizierung nötig: Zeile requires_action, Spiel unabgerechnet", async () => {
    const g = await game({ n: 4, price: 8000 });
    provider.setChargeOutcome(g.all[1].id, "requires_action");
    await runCharges(g.match.id);
    expect((await rowsOf(g)).find((x) => x.userId === g.all[1].id)).toMatchObject({ status: "requires_action", failureCode: "authentication_required" });
    expect((await matchOf(g)).settledAt).toBeNull();
  });

  it("fehlende Karte (kein Zahlungsmittel mehr im Profil): failed no_payment_method, kein Stripe-Aufruf für diesen Spieler", async () => {
    const g = await game({ n: 4 });
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, g.all[0].id));
    await runCharges(g.match.id);
    expect((await rowsOf(g)).find((x) => x.userId === g.all[0].id)).toMatchObject({ status: "failed", failureCode: "no_payment_method" });
    expect(piCalls()).toHaveLength(3);
    expect((await matchOf(g)).settledAt).toBeNull();
  });
});

describe("Wiederholung, Lease und 20-Stunden-Grenze", () => {
  it("Netzfehler: Zeile bleibt pending ohne PaymentIntent; innerhalb der Lease kein erneuter Versand, danach mit demselben Schlüssel, am Ende gebucht", async () => {
    const g = await game({ n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error");
    await runCharges(g.match.id);
    const row = (await rowsOf(g)).find((x) => x.userId === g.all[0].id)!;
    expect(row).toMatchObject({ status: "pending", paymentIntentId: null });
    expect(row.attemptStartedAt).not.toBeNull();
    expect(piCalls()).toHaveLength(4);

    await runCharges(g.match.id); // sofort wieder: Lease läuft noch
    expect(piCalls()).toHaveLength(4);

    provider.setChargeOutcome(g.all[0].id, "succeeded");
    const later = new Date(Date.now() + CLAIM_LEASE_MS + 5_000);
    const r = await runCharges(g.match.id, later);
    expect(r.attempted).toBe(1);
    const keys = piCalls().filter((c) => (c.args as { metadata: { userId: string } }).metadata.userId === g.all[0].id).map((c) => (c.args as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([`charge:${g.match.id}:${g.all[0].id}`, `charge:${g.match.id}:${g.all[0].id}`]); // gleicher Schlüssel
    expect((await matchOf(g)).settledAt).not.toBeNull();
    expect(await shares(g)).toHaveLength(4);
  });

  it("nach 20 Stunden ohne Ergebnis wird nicht mehr gesendet und NICHT failed: unknown_outcome (pending), Audit; M3 löst per Stripe-Suche", async () => {
    const g = await game({ n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error");
    await runCharges(g.match.id);
    const row = (await rowsOf(g)).find((x) => x.userId === g.all[0].id)!;
    const calls = piCalls().length;
    provider.setChargeOutcome(g.all[0].id, "succeeded");
    await runCharges(g.match.id, new Date(row.attemptStartedAt!.getTime() + ATTEMPT_MAX_AGE_MS + 60_000));
    expect(piCalls()).toHaveLength(calls); // nichts gesendet
    expect((await rowsOf(g)).find((x) => x.userId === g.all[0].id)).toMatchObject({ status: "pending", failureCode: "unknown_outcome", paymentIntentId: null });
    expect(await auditCount("charge.unknown_outcome", g.match.id)).toBe(1);
    await runCharges(g.match.id, new Date(row.attemptStartedAt!.getTime() + ATTEMPT_MAX_AGE_MS + 120_000)); // weiterer Lauf: nichts gesendet, nichts neu auditiert
    expect(piCalls()).toHaveLength(calls);
    expect(await auditCount("charge.unknown_outcome", g.match.id)).toBe(1);
    expect((await matchOf(g)).settledAt).toBeNull();
  });

  it("processing: der PaymentIntent wird an die Zeile gebunden und nie ein zweiter angelegt; der Webhook schließt ab und bucht das Spiel (auch wenn alle gleichzeitig eintreffen)", async () => {
    const g = await game({ n: 6 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "processing");
    await runCharges(g.match.id);
    await runCharges(g.match.id, new Date(Date.now() + CLAIM_LEASE_MS + 5_000));
    expect(piCalls()).toHaveLength(6); // gebundene Zeilen bekommen keinen zweiten Versuch
    const rows = await rowsOf(g);
    expect(rows.every((x) => x.status === "pending" && x.paymentIntentId !== null)).toBe(true);
    expect((await matchOf(g)).settledAt).toBeNull();

    const profiles = await db.select().from(paymentProfiles);
    const cust = (uid: string) => profiles.find((p) => p.userId === uid)!.stripeCustomerId;
    await Promise.all(
      rows.map((x) => {
        const e = provider.signEvent({ id: nid("evt_cr"), type: "payment_intent.succeeded", object: { id: x.paymentIntentId, amount: x.amountCents, currency: "eur", customer: cust(x.userId), metadata: { matchId: x.matchId, userId: x.userId } } });
        return handleStripeWebhook(e.rawBody, e.signature);
      }),
    );
    expect((await rowsOf(g)).every((x) => x.status === "succeeded")).toBe(true);
    expect((await matchOf(g)).settledAt).not.toBeNull(); // die letzten gleichzeitigen Zahlungen verpassen sich nicht
    expect(await shares(g)).toHaveLength(6);
    expect(await db.select().from(receipts).where(eq(receipts.matchId, g.match.id))).toHaveLength(6);
    expect(await auditCount("charge.settled", g.match.id)).toBe(1);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Spiel gebucht nur, wenn jeder Eingeteilte belastet wurde", () => {
  it("ein nach Anlage der Abbuchungen eingeteilter Spieler ohne Zeile verhindert das Buchen, obwohl alle Zeilen succeeded sind", async () => {
    const g = await game({ n: 4 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "processing");
    await runCharges(g.match.id);
    const late = await addPlayer(g.match.id, g.home.id, "spaet"); // eingeteilt, aber nie belastet
    const rows = await rowsOf(g);
    const profiles = await db.select().from(paymentProfiles);
    for (const x of rows) {
      const cust = profiles.find((q) => q.userId === x.userId)!.stripeCustomerId;
      const e = provider.signEvent({ id: nid("evt_cr"), type: "payment_intent.succeeded", object: { id: x.paymentIntentId, amount: x.amountCents, currency: "eur", customer: cust, metadata: { matchId: x.matchId, userId: x.userId } } });
      await handleStripeWebhook(e.rawBody, e.signature);
    }
    expect((await rowsOf(g)).every((x) => x.status === "succeeded")).toBe(true);
    expect((await matchOf(g)).settledAt).toBeNull();
    expect(late.id).toBeTruthy();
  });
});

describe("Reihenfolge und Struktur", () => {
  it("die Zeilen sind bei Stripe-Aufrufen schon committet; ein früh eintreffendes succeeded wird gebucht (nicht als unbekannt ignoriert)", async () => {
    const g = await game({ n: 4 });
    const seenRows: number[] = [];
    let early = 0;
    const origCreate = provider.createPaymentIntent.bind(provider);
    provider.createPaymentIntent = async (input) => {
      seenRows.push((await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).length); // andere Verbindung: sieht nur Committetes
      const res = await origCreate(input);
      if (early++ === 0) {
        const prof = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, input.metadata.userId)))[0];
        const e = provider.signEvent({ id: nid("evt_cr"), type: "payment_intent.succeeded", object: { id: res.id, amount: input.amountCents, currency: "eur", customer: prof.stripeCustomerId, metadata: input.metadata } });
        expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200); // Webhook vor der Antwort des Auftrags
      }
      return res;
    };
    await runCharges(g.match.id);
    expect(seenRows.every((n) => n === 4)).toBe(true);
    expect(await shares(g)).toHaveLength(4); // genau eine Buchung je Spieler, auch beim früh eingetroffenen
    expect(await auditCount("charge.ignored", g.match.id)).toBe(0);
    expect((await matchOf(g)).settledAt).not.toBeNull();
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Struktur: kein Netzaufruf (Zahlung, Gebühr) innerhalb von db.transaction", async () => {
    let depth = 0;
    const original = db.transaction.bind(db);
    (db as unknown as { transaction: unknown }).transaction = ((fn: never, cfg: never) => {
      depth += 1;
      return (original as (f: never, c: never) => Promise<unknown>)(fn, cfg).finally(() => {
        depth -= 1;
      });
    }) as never;
    provider.inTransaction = () => depth > 0;
    provider.setFee("*", 20);
    try {
      const g = await game({ n: 4 });
      await runCharges(g.match.id);
      expect(piCalls()).toHaveLength(4);
      expect(provider.calls.filter((c) => c.method === "retrieveChargeFee").length).toBeGreaterThanOrEqual(4);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });

  it("die Gebühr wird nach der Abbuchung als Folgeschritt gebucht (echt), sonst bleibt das Spiel trotzdem gebucht", async () => {
    const g = await game({ n: 4 });
    await runCharges(g.match.id); // Gebühr nicht verfügbar
    expect((await matchOf(g)).settledAt).not.toBeNull();
    expect((await ledgerOf(g)).filter((e) => e.kind === "fee")).toHaveLength(0);
    const h = await game({ n: 4 });
    provider.setFee("*", 25);
    await runCharges(h.match.id);
    expect((await ledgerOf(h)).filter((e) => e.kind === "fee")).toHaveLength(4);
  });
});

describe("Wiederholung prüft den Spielzustand erneut (nichts senden, wenn das Spiel zu ist)", () => {
  /** Alle Sendeversuche scheitern per Netzfehler: Zeilen stehen, pending, ohne PaymentIntent. */
  async function stuck(n = 4) {
    const g = await game({ n });
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    expect(piCalls()).toHaveLength(n);
    for (const p of g.all) provider.setChargeOutcome(p.id, "succeeded");
    return g;
  }
  const later = () => new Date(Date.now() + CLAIM_LEASE_MS + 5_000);
  async function expectClosed(g: G, calls: number) {
    expect(piCalls()).toHaveLength(calls); // nichts gesendet
    const rows = await rowsOf(g);
    // Die Zeilen wurden schon einmal gesendet: Ein PaymentIntent kann bei Stripe existieren, also NICHT failed, sondern unknown_outcome (pending), auditiert, nie erneut gesendet
    expect(rows.every((x) => x.status === "pending" && x.failureCode === "unknown_outcome" && x.paymentIntentId === null)).toBe(true);
    expect(await shares(g)).toHaveLength(0);
    expect(await auditCount("charge.unknown_outcome", g.match.id)).toBe(rows.length);
  }

  it("Spiel nach Phase A abgesagt: der Wiederholungslauf sendet nichts, gesendete Zeilen unknown_outcome", async () => {
    const g = await stuck();
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id, later());
    await expectClosed(g, 4);
  });

  it("Spiel inzwischen abgerechnet", async () => {
    const g = await stuck();
    await db.update(matches).set({ settledAt: new Date() }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id, later());
    await expectClosed(g, 4);
  });

  it("Spiel inzwischen gestartet (Anstoß erreicht)", async () => {
    const g = await stuck();
    const m = await matchOf(g);
    await runCharges(g.match.id, new Date(m.startsAt.getTime() + 60_000));
    await expectClosed(g, 4);
  });

  it("Schalter inzwischen AUS", async () => {
    const g = await stuck();
    await setSetting(null, "card_payments_enabled", false);
    await runCharges(g.match.id, later());
    await expectClosed(g, 4);
  });

  it("Modus weg: ein Platz hat inzwischen Guthaben bezahlt", async () => {
    const g = await stuck();
    await db.update(matchParticipants).set({ paidCents: 800 }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.all[0].id)));
    await runCharges(g.match.id, later());
    await expectClosed(g, 4);
  });

  it("Gegenprobe: Spiel unverändert offen => der Wiederholungslauf sendet (gleicher Schlüssel) und bucht", async () => {
    const g = await stuck();
    await runCharges(g.match.id, later());
    expect(piCalls()).toHaveLength(8);
    expect((await matchOf(g)).settledAt).not.toBeNull();
    expect((await rowsOf(g)).every((x) => x.status === "succeeded")).toBe(true);
  });

  it("bereits gebundene (processing) und erfolgreiche Zeilen bleiben von der Zustandsprüfung unberührt", async () => {
    const g = await game({ n: 4 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "processing");
    await runCharges(g.match.id);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id, later());
    expect((await rowsOf(g)).every((x) => x.status === "pending" && x.paymentIntentId !== null)).toBe(true); // der Webhook entscheidet
  });
});
