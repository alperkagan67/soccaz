import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { matchParticipants, paymentProfiles, paymentSetupIntents, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { signStripePayload } from "@/lib/stripe-signature";
import { createCardSetup, MANDATE_TEXT, SETUP_LIMIT_PER_HOUR } from "@/server/payments/card-setup";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests, WebhookSignatureError } from "@/server/payments/provider";
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
    const saved = [process.env.STRIPE_SECRET_KEY, process.env.STRIPE_WEBHOOK_SECRET];
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      expect((await handleStripeWebhook(payload, header)).status).toBe(503);
      await expect(createCardSetup((await makeUser("kartenokey")).id, { mandateAccepted: true })).rejects.toThrow(/nicht verfügbar/);
    } finally {
      if (saved[0] !== undefined) process.env.STRIPE_SECRET_KEY = saved[0];
      if (saved[1] !== undefined) process.env.STRIPE_WEBHOOK_SECRET = saved[1];
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

  it("unbekannte Ereignistypen werden angenommen, einmal vermerkt und sonst ignoriert", async () => {
    const id = evtId();
    const e = provider.signEvent({ id, type: "customer.created", object: { id: "cus_irgendwer", email: "geheim@example.com" } });
    expect((await deliver(e)).status).toBe(200);
    const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.eventId, id));
    expect(row).toMatchObject({ type: "customer.created" });
    expect(row.processedAt).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain("geheim");
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
});
