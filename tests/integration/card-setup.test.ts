import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { matchParticipants, paymentProfiles, paymentSetupIntents, stripeEvents, users } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { signStripePayload } from "@/lib/stripe-signature";
import { createCardSetup, MANDATE_TEXT, SETUP_LIMIT_PER_HOUR } from "@/server/payments/card-setup";
import { FakeProvider } from "@/server/payments/fake";
import { getPaymentProvider, PaymentsUnavailableError, setPaymentProviderForTests, WebhookSignatureError } from "@/server/payments/provider";
import { StripeProvider } from "@/server/payments/stripe";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_cs_%"));
  await cleanup();
});

let seq = 0;
const evtId = () => `evt_cs_${Date.now().toString(36)}_${++seq}`;

/** Spiel mit einem Spieler (Heim) und einem Mitspieler; liefert beide samt Spiel. */
async function lobby() {
  const { match, home } = await makeMatch();
  const me = await addPlayer(match.id, home.id, "kartep");
  const other = await addPlayer(match.id, home.id, "kartepo");
  return { match, me, other };
}

const seatStatus = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0].cardStatus;
const profileOf = async (userId: string) => (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId)))[0];
const ledgerFor = async (matchId: string, userIds: string[]) =>
  (await db.select().from(ledgerEntries).where(or(eq(ledgerEntries.matchId, matchId), inArray(ledgerEntries.debitUserId, userIds), inArray(ledgerEntries.creditUserId, userIds)))).length;

function succeededEvent(p: { intentId: string; customer: string; pm: string; id?: string }) {
  return provider.signEvent({ id: p.id ?? evtId(), type: "setup_intent.succeeded", object: { id: p.intentId, customer: p.customer, payment_method: p.pm } });
}
const deliver = (e: { rawBody: string; signature: string }) => handleStripeWebhook(e.rawBody, e.signature);

describe("AC-1: Karte hinterlegen (SetupIntent)", () => {
  it("SetupIntent erfolgreich: Platz card_ready, Zahlungsmittel nur als Anzeige gespeichert, Mandat mit Zeitpunkt, nichts abgebucht, kein Ledger-Eintrag", async () => {
    const { match, me, other } = await lobby();
    const before = await ledgerFor(match.id, [me.id, other.id]);
    const t0 = Date.now();
    const setup = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    expect(setup.clientSecret).toContain(setup.setupIntentId);
    expect(await seatStatus(match.id, me.id)).toBe("none"); // erst das Ereignis von Stripe macht die Karte bereit
    const profile = await profileOf(me.id);
    provider.registerCard({ id: "pm_cs_visa", brand: "visa", last4: "4242" });

    const res = await deliver(succeededEvent({ intentId: setup.setupIntentId, customer: profile.stripeCustomerId, pm: "pm_cs_visa" }));
    expect(res.status).toBe(200);

    expect(await seatStatus(match.id, me.id)).toBe("card_ready");
    expect(await seatStatus(match.id, other.id)).toBe("none"); // nur der eigene Platz
    const after = await profileOf(me.id);
    expect(after).toMatchObject({ paymentMethodId: "pm_cs_visa", cardBrand: "visa", cardLast4: "4242", mandateText: MANDATE_TEXT });
    expect(after.mandateAcceptedAt!.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(after.mandateAcceptedAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const [row] = await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, setup.setupIntentId));
    expect(row).toMatchObject({ userId: me.id, matchId: match.id, status: "succeeded", mandateText: MANDATE_TEXT });
    const seat = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, me.id))))[0];
    expect(seat.paidCents).toBe(0);
    expect(seat.paidAt).toBeNull();
    expect(await ledgerFor(match.id, [me.id, other.id])).toBe(before); // keine Buchung
    expect(provider.calls.map((c) => c.method).filter((m) => m.toLowerCase().includes("payment_intent") || m.includes("charge"))).toEqual([]);
  });

  it("ohne Zustimmung zum Mandat wird abgelehnt: nichts angelegt, kein Anbieteraufruf", async () => {
    const { match, me } = await lobby();
    await expect(createCardSetup(me.id, { matchId: match.id, mandateAccepted: false })).rejects.toThrow(/zu/);
    await expect(createCardSetup(me.id, { matchId: match.id, mandateAccepted: "ja" as unknown as boolean })).rejects.toThrow();
    expect(provider.calls).toHaveLength(0);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, me.id))).toHaveLength(0);
  });

  it("ohne Spielbezug (nur Karte hinterlegen) gelingt; der Kunde wird je Nutzer nur einmal angelegt", async () => {
    const u = await makeUser("kartesolo");
    const a = await createCardSetup(u.id, { mandateAccepted: true });
    const b = await createCardSetup(u.id, { mandateAccepted: true });
    expect(a.setupIntentId).not.toBe(b.setupIntentId);
    expect(provider.calls.filter((c) => c.method === "createCustomer")).toHaveLength(1);
    expect((await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, u.id)))).toHaveLength(1);
  });

  it("eine zweite Karte ersetzt die erste; die alte wird bei Stripe gelöst", async () => {
    const u = await makeUser("kartetwo");
    const first = await createCardSetup(u.id, { mandateAccepted: true });
    const cust = (await profileOf(u.id)).stripeCustomerId;
    await deliver(succeededEvent({ intentId: first.setupIntentId, customer: cust, pm: "pm_cs_one" }));
    const second = await createCardSetup(u.id, { mandateAccepted: true });
    provider.registerCard({ id: "pm_cs_two", brand: "mastercard", last4: "4444" });
    await deliver(succeededEvent({ intentId: second.setupIntentId, customer: cust, pm: "pm_cs_two" }));
    expect(await profileOf(u.id)).toMatchObject({ paymentMethodId: "pm_cs_two", cardBrand: "mastercard", cardLast4: "4444" });
    expect(provider.wasDetached("pm_cs_one")).toBe(true);
    expect(provider.wasDetached("pm_cs_two")).toBe(false);
  });

  it("setup_failed markiert den SetupIntent als fehlgeschlagen, der Platz bleibt none", async () => {
    const { match, me } = await lobby();
    const setup = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    const res = await deliver(provider.signEvent({ id: evtId(), type: "setup_intent.setup_failed", object: { id: setup.setupIntentId } }));
    expect(res.status).toBe(200);
    expect((await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, setup.setupIntentId)))[0].status).toBe("failed");
    expect(await seatStatus(match.id, me.id)).toBe("none");
  });
});

describe("Wiederholung nach Fehlschlag", () => {
  it("setup_failed, danach bestätigt der Nutzer erneut: succeeded wird verarbeitet (Karte gespeichert, card_ready); ein weiteres succeeded ändert nichts mehr", async () => {
    const { match, me } = await lobby();
    const setup = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    const cust = (await profileOf(me.id)).stripeCustomerId;
    await deliver(provider.signEvent({ id: evtId(), type: "setup_intent.setup_failed", object: { id: setup.setupIntentId } }));
    expect((await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, setup.setupIntentId)))[0].status).toBe("failed");

    provider.registerCard({ id: "pm_cs_retry", brand: "visa", last4: "1111" });
    expect((await deliver(succeededEvent({ intentId: setup.setupIntentId, customer: cust, pm: "pm_cs_retry" }))).status).toBe(200);
    expect(await seatStatus(match.id, me.id)).toBe("card_ready");
    expect(await profileOf(me.id)).toMatchObject({ paymentMethodId: "pm_cs_retry", cardLast4: "1111" });
    expect((await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, setup.setupIntentId)))[0].status).toBe("succeeded");

    // ein anderes, späteres succeeded mit anderer Karte überschreibt nicht (Status ist succeeded)
    await deliver(succeededEvent({ intentId: setup.setupIntentId, customer: cust, pm: "pm_cs_other" }));
    expect((await profileOf(me.id)).paymentMethodId).toBe("pm_cs_retry");
  });
});

describe("Webhook: Signatur", () => {
  it("falsche Signatur, fehlender Header, verändertes Body und zu alter Zeitstempel werden abgelehnt (400), nichts verarbeitet oder gespeichert", async () => {
    const { match, me } = await lobby();
    const setup = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    const cust = (await profileOf(me.id)).stripeCustomerId;
    const id = evtId();
    const good = succeededEvent({ intentId: setup.setupIntentId, customer: cust, pm: "pm_cs_x", id });

    const wrong = { rawBody: good.rawBody, signature: signStripePayload(good.rawBody, "whsec_falsch") };
    expect((await deliver(wrong)).status).toBe(400);
    expect((await handleStripeWebhook(good.rawBody, null)).status).toBe(400);
    expect((await handleStripeWebhook(good.rawBody, "t=1,v1=abc")).status).toBe(400);
    expect((await handleStripeWebhook(good.rawBody + " ", good.signature)).status).toBe(400);
    const old = provider.signEvent({ id, type: "setup_intent.succeeded", object: { id: setup.setupIntentId, customer: cust, payment_method: "pm_cs_x" } }, Math.floor(Date.now() / 1000) - 3600);
    expect((await deliver(old)).status).toBe(400);

    expect(await seatStatus(match.id, me.id)).toBe("none");
    expect((await profileOf(me.id)).paymentMethodId).toBeNull();
    expect(await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id))).toHaveLength(0);

    expect((await deliver(good)).status).toBe(200); // mit gültiger Signatur dagegen gelingt es
    expect(await seatStatus(match.id, me.id)).toBe("card_ready");
  });

  it("Antworten verraten nichts: Fehlertexte sind knapp und enthalten weder Nutzer, Kunde noch Zahlungsmittel", async () => {
    const res = await handleStripeWebhook(JSON.stringify({ id: "evt_x", type: "setup_intent.succeeded", data: { object: { id: "seti_x", customer: "cus_geheim" } } }), "t=1,v1=00");
    expect(res.status).toBe(400);
    expect(res.body).not.toMatch(/cus_|seti_|pm_|evt_/);
  });

  it("zu großer Body wird abgelehnt (413)", async () => {
    expect((await handleStripeWebhook("x".repeat(300 * 1024), "t=1,v1=00")).status).toBe(413);
  });

  it("der echte Stripe-Anbieter prüft die Signatur lokal (ohne Netz); ohne Geheimnis kontrolliert nicht verfügbar (503)", async () => {
    const stripe = new StripeProvider({ secretKey: "sk_test_dummy_nicht_echt", webhookSecret: "whsec_dummy" });
    const payload = JSON.stringify({ id: "evt_real", object: "event", type: "setup_intent.succeeded", data: { object: { id: "seti_real" } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_dummy" });
    expect(stripe.constructWebhookEvent(payload, header)).toMatchObject({ id: "evt_real", type: "setup_intent.succeeded", object: { id: "seti_real" } });
    expect(() => stripe.constructWebhookEvent(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_anders" }))).toThrow(WebhookSignatureError);
    expect(() => stripe.constructWebhookEvent(payload + " ", header)).toThrow(WebhookSignatureError);
    expect(() => stripe.constructWebhookEvent(payload, null)).toThrow(WebhookSignatureError);

    setPaymentProviderForTests(new StripeProvider({}));
    const saved = [process.env.STRIPE_SECRET_KEY, process.env.STRIPE_CARD_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET];
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_CARD_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_alte_route"; // das Geheimnis der alten Route gilt für diese Route nicht
    try {
      expect((await handleStripeWebhook(payload, header)).status).toBe(503);
      process.env.STRIPE_SECRET_KEY = "sk_test_dummy_nicht_echt";
      const oldHeader = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_alte_route" });
      setPaymentProviderForTests(new StripeProvider({}));
      expect((await handleStripeWebhook(payload, oldHeader)).status).toBe(503); // ohne STRIPE_CARD_WEBHOOK_SECRET nie mit dem alten Geheimnis prüfen
      process.env.STRIPE_CARD_WEBHOOK_SECRET = "whsec_neue_route";
      expect((await handleStripeWebhook(payload, oldHeader)).status).toBe(400);
      expect((await handleStripeWebhook(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_neue_route" }))).status).toBe(200);
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_CARD_WEBHOOK_SECRET;
      setPaymentProviderForTests(new StripeProvider({}));
      await expect(createCardSetup((await makeUser("kartenokey")).id, { mandateAccepted: true })).rejects.toThrow(/nicht verfügbar/);
    } finally {
      for (const [i, k] of ["STRIPE_SECRET_KEY", "STRIPE_CARD_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"].entries()) {
        if (saved[i] !== undefined) process.env[k] = saved[i];
        else delete process.env[k];
      }
    }
  });
});

describe("Webhook: Idempotenz (AC-10-Grundlage)", () => {
  it("dasselbe Ereignis zweimal und parallel: nur einmal verarbeitet", async () => {
    const { match, me } = await lobby();
    const setup = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    const cust = (await profileOf(me.id)).stripeCustomerId;
    const e = succeededEvent({ intentId: setup.setupIntentId, customer: cust, pm: "pm_cs_idem" });
    const id = JSON.parse(e.rawBody).id as string;

    const rs = await Promise.all([deliver(e), deliver(e), deliver(e)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id))).toHaveLength(1);
    expect((await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id)))[0].processedAt).not.toBeNull();
    expect(provider.calls.filter((c) => c.method === "retrievePaymentMethod").length).toBeGreaterThanOrEqual(1);

    // Beweis, dass ein späteres Doppel nichts mehr tut: Zustand zurücksetzen, Ereignis erneut zustellen
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, me.id)));
    await db.update(paymentSetupIntents).set({ status: "created" }).where(eq(paymentSetupIntents.id, setup.setupIntentId)); // sonst finge der Status des SetupIntents das Doppel ab; hier soll nur die Event-ID schützen
    expect((await deliver(e)).status).toBe(200);
    expect(await seatStatus(match.id, me.id)).toBe("none");
  });

  it("andere Kartenereignisse (payment_method.*) werden angenommen, einmal vermerkt und sonst ignoriert", async () => {
    const id = evtId();
    const e = provider.signEvent({ id, type: "payment_method.attached", object: { id: "pm_irgendwer", email: "geheim@example.com" } });
    expect((await deliver(e)).status).toBe(200);
    const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id));
    expect(row).toMatchObject({ type: "payment_method.attached" });
    expect(row.processedAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain("geheim");
  });

  it("fremde Ereignistypen (z. B. von der alten Route) werden mit 200 angenommen, aber weder gespeichert noch verarbeitet", async () => {
    for (const type of ["checkout.session.completed", "charge.dispute.created", "customer.created", "invoice.paid"]) {
      const id = evtId();
      expect((await deliver(provider.signEvent({ id, type, object: { id: "x" } }))).status).toBe(200);
      expect(await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id)), type).toHaveLength(0);
    }
  });
});

describe("Rechte: nur für sich selbst, nie für Dritte", () => {
  it("wer nicht im Spiel steht, kann dafür keinen SetupIntent erzeugen; auch kein Platz eines anderen wird gesetzt", async () => {
    const { match, me } = await lobby();
    const stranger = await makeUser("kartefremd");
    await expect(createCardSetup(stranger.id, { matchId: match.id, mandateAccepted: true })).rejects.toThrow(/nicht angemeldet/);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, stranger.id))).toHaveLength(0);
    expect(await seatStatus(match.id, me.id)).toBe("none");
  });

  it("die Nutzer-ID kommt aus der Sitzung: der Kunde und der SetupIntent gehören dem Aufrufer", async () => {
    const a = await makeUser("kartea");
    const b = await makeUser("karteb");
    const sa = await createCardSetup(a.id, { mandateAccepted: true });
    expect((await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, sa.setupIntentId)))[0].userId).toBe(a.id);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, b.id))).toHaveLength(0);
    expect(provider.calls.find((c) => c.method === "createSetupIntent")?.args).toMatchObject({ userId: a.id });
  });

  it("ein Ereignis mit fremdem Kunden oder unbekanntem SetupIntent ändert nichts (A's Intent mit B's Kunde)", async () => {
    const { match, me } = await lobby();
    const b = await makeUser("kartebb");
    const setupA = await createCardSetup(me.id, { matchId: match.id, mandateAccepted: true });
    await createCardSetup(b.id, { mandateAccepted: true });
    const custB = (await profileOf(b.id)).stripeCustomerId;

    await deliver(succeededEvent({ intentId: setupA.setupIntentId, customer: custB, pm: "pm_cs_fremd" }));
    await deliver(succeededEvent({ intentId: "seti_gibt_es_nicht", customer: custB, pm: "pm_cs_fremd2" }));
    expect(await seatStatus(match.id, me.id)).toBe("none");
    expect((await profileOf(me.id)).paymentMethodId).toBeNull();
    expect((await profileOf(b.id)).paymentMethodId).toBeNull();
    expect((await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.id, setupA.setupIntentId)))[0].status).toBe("created");
  });

  it("eine Spiel-ID, die keine UUID ist, ergibt einen normalen Fehler statt eines Datenbankfehlers", async () => {
    const u = await makeUser("kartebad");
    for (const bad of ["abc", "", "1; drop table users", "00000000-0000-0000-0000-00000000000g"]) {
      await expect(createCardSetup(u.id, { matchId: bad, mandateAccepted: true }), bad).rejects.toThrow(/nicht angemeldet/);
    }
    expect(provider.calls).toHaveLength(0);
  });

  it("gesperrte Nutzer und beendete Spiele bekommen keinen SetupIntent", async () => {
    const { match, me } = await lobby();
    await db.execute(sql`update matches set status = 'cancelled' where id = ${match.id}`);
    await expect(createCardSetup(me.id, { matchId: match.id, mandateAccepted: true })).rejects.toThrow(/nicht mehr offen/);
  });

  it("Begrenzung: höchstens " + SETUP_LIMIT_PER_HOUR + " Einrichtungen je Nutzer und Stunde", async () => {
    const u = await makeUser("karterate");
    for (let i = 0; i < SETUP_LIMIT_PER_HOUR; i++) await createCardSetup(u.id, { mandateAccepted: true });
    await expect(createCardSetup(u.id, { mandateAccepted: true })).rejects.toThrow(/Zu viele/);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, u.id))).toHaveLength(SETUP_LIMIT_PER_HOUR);
  });
});

describe("Parallele Aufrufe: nie warten, nie Verbindungen binden", () => {
  it("15 gleichzeitige Einrichtungen: höchstens " + SETUP_LIMIT_PER_HOUR + " gelingen, der Rest kehrt sofort mit 'Bitte warten' oder dem Limit zurück; nach Wiederholung genau " + SETUP_LIMIT_PER_HOUR + ", ein Stripe-Kunde, ein Profil", async () => {
    const u = await makeUser("karteparallel");
    const results = await Promise.allSettled(Array.from({ length: 15 }, () => createCardSetup(u.id, { mandateAccepted: true })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(ok).toBeLessThanOrEqual(SETUP_LIMIT_PER_HOUR);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason.message)).toMatch(/einen Moment warten|Zu viele/);

    // wer 'Bitte warten' bekam, wiederholt nacheinander, bis das Limit erreicht ist
    for (let i = 0; i < 15; i++) await createCardSetup(u.id, { mandateAccepted: true }).catch(() => {});
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, u.id))).toHaveLength(SETUP_LIMIT_PER_HOUR);
    await expect(createCardSetup(u.id, { mandateAccepted: true })).rejects.toThrow(/Zu viele/);
    expect(provider.calls.filter((c) => c.method === "createCustomer")).toHaveLength(1);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, u.id))).toHaveLength(1);
  });

  it("langsamer Anbieter: ein zweiter Aufruf desselben Nutzers kehrt sofort zurück, ohne zu warten und ohne Verbindung zu binden; danach ist alles frei", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    class SlowProvider extends FakeProvider {
      override async createCustomer(input: { userId: string; email: string; idempotencyKey: string }) {
        const r = await super.createCustomer(input);
        await gate; // der Anbieter hängt
        return r;
      }
    }
    const slow = new SlowProvider();
    setPaymentProviderForTests(slow);
    const u = await makeUser("kartelangsam");

    const first = createCardSetup(u.id, { mandateAccepted: true });
    for (let i = 0; i < 100 && !slow.calls.some((c) => c.method === "createCustomer"); i++) await new Promise((r) => setTimeout(r, 20));
    expect(slow.calls.some((c) => c.method === "createCustomer")).toBe(true); // der erste Aufruf hält die Sperre und hängt im Anbieter

    const t0 = Date.now();
    const burst = await Promise.allSettled(Array.from({ length: 12 }, () => createCardSetup(u.id, { mandateAccepted: true })));
    expect(Date.now() - t0).toBeLessThan(1500); // sofort, nicht erst nach dem Anbieter oder dem lock_timeout
    for (const r of burst) {
      expect(r.status).toBe("rejected");
      if (r.status === "rejected") expect(String(r.reason.message)).toMatch(/einen Moment warten/);
    }
    // die Datenbank ist trotz hängendem Anbieter frei (alle Verbindungen des Pools sind benutzbar)
    const t1 = Date.now();
    await Promise.all(Array.from({ length: 10 }, () => db.select({ id: users.id }).from(users).limit(1)));
    expect(Date.now() - t1).toBeLessThan(1500);

    release();
    expect((await first).clientSecret).toBeTruthy();
    expect((await createCardSetup(u.id, { mandateAccepted: true })).clientSecret).toBeTruthy(); // Sperre ist wieder frei
    expect(slow.calls.filter((c) => c.method === "createCustomer")).toHaveLength(1);
  });
});

describe("Anbieterwahl: Fake nur ausdrücklich, nie in Produktion", () => {
  const keys = ["STRIPE_SECRET_KEY", "PAYMENTS_FAKE", "NODE_ENV"] as const;
  async function withEnv(env: Partial<Record<(typeof keys)[number], string | undefined>>, fn: () => Promise<void>) {
    const saved = keys.map((k) => process.env[k]);
    setPaymentProviderForTests(null);
    try {
      for (const k of keys) {
        if (k in env && env[k] !== undefined) (process.env as Record<string, string>)[k] = env[k]!;
        else if (k in env) delete process.env[k];
      }
      await fn();
    } finally {
      keys.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else (process.env as Record<string, string>)[k] = saved[i]!;
      });
    }
  }

  it("ohne PAYMENTS_FAKE und ohne Schlüssel ist der Anbieter nicht verfügbar, auch außerhalb der Produktion (Staging-Dev-Server)", async () => {
    await withEnv({ STRIPE_SECRET_KEY: undefined, PAYMENTS_FAKE: undefined, NODE_ENV: "development" }, async () => {
      await expect(getPaymentProvider()).rejects.toBeInstanceOf(PaymentsUnavailableError);
      expect((await handleStripeWebhook("{}", "t=1,v1=00")).status).toBe(503);
    });
  });

  it("mit PAYMENTS_FAKE=1 (Tests, CI) gibt es den Fake", async () => {
    await withEnv({ STRIPE_SECRET_KEY: undefined, PAYMENTS_FAKE: "1", NODE_ENV: "test" }, async () => {
      expect((await getPaymentProvider()).name).toBe("fake");
    });
  });

  it("NODE_ENV=production zusammen mit PAYMENTS_FAKE=1: harter Fehler mit klarer Meldung, kein stilles Weiterlaufen", async () => {
    await withEnv({ STRIPE_SECRET_KEY: undefined, PAYMENTS_FAKE: "1", NODE_ENV: "production" }, async () => {
      await expect(getPaymentProvider()).rejects.toThrow(/PAYMENTS_FAKE=1 ist in Produktion verboten/);
      await expect(getPaymentProvider()).rejects.not.toBeInstanceOf(PaymentsUnavailableError); // kein sanfter Fachfehler
      expect((await handleStripeWebhook("{}", "t=1,v1=00")).status).toBe(500);
      await expect(createCardSetup((await makeUser("kartenprod")).id, { mandateAccepted: true })).rejects.toThrow(/verboten/);
    });
    // auch mit gesetztem Schlüssel und festem Anbieter für Tests
    setPaymentProviderForTests(provider);
    await withEnv({ STRIPE_SECRET_KEY: "sk_test_x", PAYMENTS_FAKE: "1", NODE_ENV: "production" }, async () => {
      setPaymentProviderForTests(provider);
      await expect(getPaymentProvider()).rejects.toThrow(/verboten/);
    });
  });
});

describe("Datenschutz", () => {
  it("gespeichert werden nur Stripe-IDs und Anzeigedaten: keine Spalte für Kartennummer oder CVC", async () => {
    const cols = (await db.execute(sql`select column_name from information_schema.columns where table_name in ('payment_profiles','payment_setup_intents','stripe_events')`)).rows as { column_name: string }[];
    const names = cols.map((c) => c.column_name).join(",");
    expect(names).not.toMatch(/pan|number|cvc|cvv|expiry|exp_/);
    expect(names).toMatch(/card_last4/);
  });

  it("das Konto löschen entfernt Kunde, SetupIntents und Zahlungsmittel-Zeile (Fremdschlüssel cascade)", async () => {
    const u = await makeUser("kartedel");
    const s = await createCardSetup(u.id, { mandateAccepted: true });
    await deliver(succeededEvent({ intentId: s.setupIntentId, customer: (await profileOf(u.id)).stripeCustomerId, pm: "pm_cs_del" }));
    await db.execute(sql`delete from users where id = ${u.id}`);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, u.id))).toHaveLength(0);
  });
});

describe("Webhook-Route /api/stripe/webhook", () => {
  it("POST: gültige Signatur 200, falsche 400, zu großer Body 413; nur der rohe Body zählt", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    const e = provider.signEvent({ id: evtId(), type: "customer.created", object: { id: "cus_route" } });
    const req = (body: string, sig: string | null, extra: Record<string, string> = {}) =>
      new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { ...(sig ? { "stripe-signature": sig } : {}), ...extra } });
    expect((await POST(req(e.rawBody, e.signature))).status).toBe(200);
    expect((await POST(req(e.rawBody, null))).status).toBe(400);
    expect((await POST(req(e.rawBody, "t=1,v1=00"))).status).toBe(400);
    expect((await POST(req("{}", e.signature))).status).toBe(400);
    expect((await POST(req("x", e.signature, { "content-length": String(300 * 1024) }))).status).toBe(413);
  });

  it("gestreamter Body ohne Content-Length (chunked) wird nach 256 KB abgebrochen (413) und nicht ganz gelesen", async () => {
    const { POST } = await import("@/app/api/stripe/webhook/route");
    let sent = 0;
    const chunk = new Uint8Array(64 * 1024).fill(120);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 64) return controller.close(); // 4 MB wären es insgesamt
        sent += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: stream, duplex: "half", headers: { "stripe-signature": "t=1,v1=00" } } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    expect((await POST(req)).status).toBe(413);
    expect(sent).toBeLessThan(16); // abgebrochen, lange bevor alles gelesen war
  });
});
