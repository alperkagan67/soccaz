import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentProfiles } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { AUTHORIZE_LIMIT_PER_HOUR, getAuthorizationSecret, listOpenAuthorizations } from "@/server/payments/authorize";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 012, M3c-1c (AC-7): Das clientSecret fuer die 3-D-Secure-Freigabe geht NUR an den Betroffenen, nur bei requires_action im offenen Fenster, nur fuer den laufenden Versuch.
// Die Aktion bucht nichts und legt nie einen PaymentIntent an.

let provider: FakeProvider;
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Spiel mit einem Betroffenen `u`, dessen Versuch die Freigabe der Bank braucht (requires_action, Fenster 90 Minuten), samt offenem PaymentIntent bei "Stripe". */
async function game(over: { status?: "requires_action" | "failed" | "pending" | "succeeded"; code?: string | null; graceMs?: number | null; hoursAhead?: number } = {}) {
  const m = await makeMatch({ hoursAhead: over.hoursAhead ?? 72, priceCents: 8000, costCents: 8000 });
  const u = await addPlayer(m.match.id, m.home.id, "az");
  const customerId = nid("cus_az");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_az") });
  const piId = nid("pi_az");
  const [row] = await db
    .insert(paymentCharges)
    .values({
      matchId: m.match.id,
      userId: u.id,
      amountCents: 800,
      status: over.status ?? "requires_action",
      failureCode: over.code === undefined ? "authentication_required" : over.code,
      graceUntil: over.graceMs === null ? null : new Date(Date.now() + (over.graceMs ?? 90 * 60_000)),
      idempotencyKey: `charge:${m.match.id}:${u.id}`,
      paymentIntentId: piId,
    })
    .returning();
  await db.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  provider.setIntentStatus(piId, "requires_action", { customerId, amountCents: 800, currency: "eur" });
  return { ...m, u, customerId, piId, row };
}
type G = Awaited<ReturnType<typeof game>>;
const NEUTRAL = /keine Freigabe möglich/;
const createCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");

describe("Herausgabe des clientSecret", () => {
  it("der Betroffene bekommt das Secret seines laufenden Versuchs; es wird nichts gebucht und nie ein PaymentIntent angelegt; das Audit enthaelt kein Secret", async () => {
    const g = await game();
    const before = (await db.select().from(ledgerEntries)).length;
    const res = await getAuthorizationSecret(g.u.id, g.match.id);
    expect(res.clientSecret).toBe(`${g.piId}_secret_fake`);
    expect((await db.select().from(ledgerEntries)).length).toBe(before);
    expect(createCalls()).toHaveLength(0);
    expect((await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id)))[0].status).toBe("requires_action"); // nur der Webhook aendert den Stand
    const audits = await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.authorization_requested"), eq(auditLog.entityId, g.match.id)));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toMatch(/secret|pi_az/);
  });

  it("Captain, Mitspieler, Admin und Fremde bekommen nie ein Secret (eigene Zeile fehlt) und alle dieselbe neutrale Meldung", async () => {
    const g = await game();
    const mate = await addPlayer(g.match.id, g.home.id, "az");
    const admin = await makeUser("az", "admin");
    const stranger = await makeUser("az");
    for (const id of [g.adminA.id, g.adminB.id, mate.id, admin.id, stranger.id]) {
      await expect(getAuthorizationSecret(id, g.match.id)).rejects.toThrow(NEUTRAL);
    }
    expect(provider.calls.filter((c) => c.method === "retrievePaymentIntentSecret")).toHaveLength(0); // nicht einmal bei Stripe nachgefragt
  });

  it("falsche Zeile: nur requires_action mit authentication_required; failed, pending, succeeded und andere Codes ergeben kein Secret", async () => {
    for (const over of [{ status: "failed" as const }, { status: "pending" as const }, { status: "succeeded" as const }, { code: "card_declined" }, { code: null }]) {
      const g = await game(over);
      await expect(getAuthorizationSecret(g.u.id, g.match.id), JSON.stringify(over)).rejects.toThrow(NEUTRAL);
    }
  });

  it("Fenster abgelaufen, Altzeile (NULL) oder Termin vorverlegt (effektives Ende): kein Secret", async () => {
    const expired = await game({ graceMs: -1000 });
    const legacy = await game({ graceMs: null });
    const moved = await game();
    await db.update(matches).set({ startsAt: new Date(Date.now() + 50 * 60_000) }).where(eq(matches.id, moved.match.id));
    for (const g of [expired, legacy, moved]) await expect(getAuthorizationSecret(g.u.id, g.match.id)).rejects.toThrow(NEUTRAL);
  });

  it("nur der LAUFENDE Versuch: ein alter PaymentIntent (Historie) wird nie herausgegeben", async () => {
    const g = await game();
    const old = g.piId;
    const fresh = nid("pi_az2");
    await db.update(paymentCharges).set({ paymentIntentId: fresh, currentAttempt: 2 }).where(eq(paymentCharges.id, g.row.id));
    provider.setIntentStatus(fresh, "requires_action", { customerId: g.customerId, amountCents: 800, currency: "eur" });
    const res = await getAuthorizationSecret(g.u.id, g.match.id);
    expect(res.clientSecret).toBe(`${fresh}_secret_fake`);
    expect(res.clientSecret).not.toContain(old);
  });

  it("Spiel abgesagt/Absage angefordert/abgerechnet/gestartet oder Kartenmodell AUS: kein Secret", async () => {
    const cancelled = await game();
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, cancelled.match.id));
    const requested = await game();
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test" }).where(eq(matches.id, requested.match.id));
    const settled = await game();
    await db.update(matches).set({ settledAt: new Date() }).where(eq(matches.id, settled.match.id));
    const started = await game();
    await db.update(matches).set({ startsAt: new Date(Date.now() - 1000) }).where(eq(matches.id, started.match.id));
    for (const g of [cancelled, requested, settled, started]) await expect(getAuthorizationSecret(g.u.id, g.match.id)).rejects.toThrow(NEUTRAL);
    const off = await game();
    await setSetting(null, "card_payments_enabled", false);
    await expect(getAuthorizationSecret(off.u.id, off.match.id)).rejects.toThrow(NEUTRAL);
  });

  it("Stand bei Stripe: nicht mehr requires_action (succeeded, failed, processing), unbekannt, falscher Betrag/Waehrung/Kunde => KEIN Secret", async () => {
    for (const status of ["succeeded", "failed", "processing", "other"] as const) {
      const g = await game();
      provider.setIntentStatus(g.piId, status, { customerId: g.customerId, amountCents: 800, currency: "eur" });
      await expect(getAuthorizationSecret(g.u.id, g.match.id), status).rejects.toThrow(NEUTRAL);
    }
    const unknown = await game();
    const other = new FakeProvider(); // kennt den PaymentIntent nicht
    setPaymentProviderForTests(other);
    await expect(getAuthorizationSecret(unknown.u.id, unknown.match.id)).rejects.toThrow(NEUTRAL);
    setPaymentProviderForTests(provider);
    for (const bad of [{ amountCents: 999 }, { currency: "usd" }, { customerId: "cus_fremd" }]) {
      const g = await game();
      provider.setIntentStatus(g.piId, "requires_action", { customerId: g.customerId, amountCents: 800, currency: "eur", ...bad });
      await expect(getAuthorizationSecret(g.u.id, g.match.id), JSON.stringify(bad)).rejects.toThrow(NEUTRAL);
    }
    expect(createCalls()).toHaveLength(0);
  });

  it("Rate-Limit: hoechstens 10 Herausgaben je Nutzer und Stunde", async () => {
    const g = await game({ graceMs: 3 * 3_600_000 });
    for (let i = 0; i < AUTHORIZE_LIMIT_PER_HOUR; i++) await getAuthorizationSecret(g.u.id, g.match.id);
    await expect(getAuthorizationSecret(g.u.id, g.match.id)).rejects.toThrow(/Zu viele Versuche/);
    // nach einer Stunde (das Fenster laeuft noch) ist es wieder moeglich
    await expect(getAuthorizationSecret(g.u.id, g.match.id, new Date(Date.now() + 3_700_000))).resolves.toBeDefined();
  });

  it("aendert sich die Zeile WAEHREND des Netzaufrufs (neuer Versuch, Fenster vorbei, bezahlt), wird das Secret nicht herausgegeben", async () => {
    for (const change of [{ currentAttempt: 2 }, { graceUntil: new Date(Date.now() - 1000) }, { status: "succeeded" as const }, { paymentIntentId: nid("pi_neu") }]) {
      const g = await game();
      const original = provider.retrievePaymentIntentSecret.bind(provider);
      provider.retrievePaymentIntentSecret = async (id: string) => {
        const res = await original(id);
        await db.update(paymentCharges).set(change).where(eq(paymentCharges.id, g.row.id));
        return res;
      };
      await expect(getAuthorizationSecret(g.u.id, g.match.id), JSON.stringify(change)).rejects.toThrow(NEUTRAL);
    }
  });

  it("Fehlermeldungen enthalten weder Secret noch PaymentIntent-ID noch Kunden-ID", async () => {
    const g = await game({ status: "failed" });
    const err = await getAuthorizationSecret(g.u.id, g.match.id).catch((e: Error) => e);
    expect(String((err as Error).message)).not.toMatch(/secret|pi_|cus_/);
  });

  it("ungueltige Spiel-ID: neutrale Meldung, keine Abfrage", async () => {
    const g = await game();
    await expect(getAuthorizationSecret(g.u.id, "kein-uuid")).rejects.toThrow(NEUTRAL);
    await expect(getAuthorizationSecret(g.u.id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(NEUTRAL);
  });
});

describe("Struktur und Liste", () => {
  it("kein Netzaufruf (retrievePaymentIntentSecret) innerhalb von db.transaction", async () => {
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
      const g = await game();
      await getAuthorizationSecret(g.u.id, g.match.id);
      expect(provider.calls.some((c) => c.method === "retrievePaymentIntentSecret")).toBe(true);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });

  it("listOpenAuthorizations: nur eigene, nur offene (Fenster laeuft), ohne Secret", async () => {
    const g = await game();
    const other = await game();
    const expired = await game({ graceMs: -1000 });
    const mine = await listOpenAuthorizations(g.u.id);
    expect(mine.map((x) => x.matchId)).toEqual([g.match.id]);
    expect(JSON.stringify(mine)).not.toMatch(/secret|pi_/);
    expect((await listOpenAuthorizations(other.u.id)).map((x) => x.matchId)).toEqual([other.match.id]);
    expect(await listOpenAuthorizations(expired.u.id)).toHaveLength(0);
    expect(await listOpenAuthorizations(g.adminA.id)).toHaveLength(0); // der Captain sieht nichts fremdes
  });
});

void (null as unknown as G);

describe("Fake-Freigabe (Tests/CI): geht ueber den Webhook, nie direkt", () => {
  it("ok: payment_intent.succeeded ueber handleStripeWebhook => Zeile succeeded, Platz charged, genau eine Buchung", async () => {
    const { fakeAuthorizeCore } = await import("@/server/payments/fake-authorize");
    const g = await game();
    const before = (await db.select().from(ledgerEntries)).length;
    expect(await fakeAuthorizeCore(g.u.id, g.match.id, "ok")).toEqual({});
    expect((await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id)))[0].status).toBe("succeeded");
    expect((await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.u.id))))[0].cardStatus).toBe("charged");
    expect((await db.select().from(ledgerEntries)).length).toBe(before + 1);
  });

  it("fail: payment_failed ueber den Webhook => Zeile failed im Fenster (Karte aendern moeglich), nichts gebucht", async () => {
    const { fakeAuthorizeCore } = await import("@/server/payments/fake-authorize");
    const g = await game();
    const before = (await db.select().from(ledgerEntries)).length;
    expect(await fakeAuthorizeCore(g.u.id, g.match.id, "fail")).toEqual({});
    const row = (await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.row.id)))[0];
    expect(row.status).toBe("failed");
    expect(row.graceUntil).not.toBeNull(); // das Fenster bleibt
    expect((await db.select().from(ledgerEntries)).length).toBe(before);
  });

  it("nur die eigene Zeile im Zustand requires_action: fremder Nutzer, falscher Status und ungueltige ID werden neutral abgelehnt, es wird nichts gebucht", async () => {
    const { fakeAuthorizeCore } = await import("@/server/payments/fake-authorize");
    const g = await game();
    const failedRow = await game({ status: "failed" });
    const before = (await db.select().from(ledgerEntries)).length;
    for (const [uid, mid] of [[g.adminA.id, g.match.id], [failedRow.u.id, failedRow.match.id], [g.u.id, "kein-uuid"]] as const) {
      expect((await fakeAuthorizeCore(uid, mid, "ok")).error).toMatch(NEUTRAL);
    }
    expect((await db.select().from(ledgerEntries)).length).toBe(before);
  });
});

describe("Review-Hinweise zu M3c-1c (security-reviewer, niedrig)", () => {
  it("(a) auch ABGELEHNTE Anfragen zaehlen gegen das Rate-Limit: 10 Versuche mit unpassendem Stripe-Stand loesen hoechstens 10 Abfragen bei Stripe aus", async () => {
    const g = await game({ graceMs: 3 * 3_600_000 });
    provider.setIntentStatus(g.piId, "succeeded", { customerId: g.customerId, amountCents: 800, currency: "eur" }); // Stand passt nicht => abgelehnt
    for (let i = 0; i < AUTHORIZE_LIMIT_PER_HOUR; i++) await expect(getAuthorizationSecret(g.u.id, g.match.id)).rejects.toThrow(NEUTRAL);
    await expect(getAuthorizationSecret(g.u.id, g.match.id)).rejects.toThrow(/Zu viele Versuche/);
    expect(provider.calls.filter((c) => c.method === "retrievePaymentIntentSecret")).toHaveLength(AUTHORIZE_LIMIT_PER_HOUR);
    const attempts = await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.authorization_attempt"), eq(auditLog.actorId, g.u.id)));
    expect(JSON.stringify(attempts)).not.toMatch(/secret|pi_az/); // der Zaehl-Eintrag enthaelt kein Secret und keine PaymentIntent-ID
  });

  it("(b) Anzeige und Konto-Liste stimmen mit dem Server ueberein: abgesagt/abgerechnet/ohne PaymentIntent => kein Knopf, kein Listeneintrag", async () => {
    const { getCardDisplays } = await import("@/server/payments/card-status");
    const { audienceFor } = await import("@/lib/card-visibility");
    const asSelf = (g: G) => getCardDisplays(g.match.id, (p) => audienceFor({ userId: g.u.id, platformAdmin: false, adminOf: [], isParticipant: true }, p));
    const ok = await game();
    expect((await asSelf(ok))[ok.u.id]).toHaveProperty("authorize", true);
    expect(await listOpenAuthorizations(ok.u.id)).toHaveLength(1);

    const requested = await game();
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test" }).where(eq(matches.id, requested.match.id));
    const settled = await game();
    await db.update(matches).set({ settledAt: new Date() }).where(eq(matches.id, settled.match.id));
    const noPi = await game();
    await db.update(paymentCharges).set({ paymentIntentId: null }).where(eq(paymentCharges.id, noPi.row.id));
    const cancelled = await game();
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, cancelled.match.id));
    for (const g of [requested, settled, noPi, cancelled]) {
      expect((await asSelf(g))[g.u.id]).not.toHaveProperty("authorize");
      expect(await listOpenAuthorizations(g.u.id)).toHaveLength(0);
    }
  });
});

describe("Review-Nit R-T163: erste Schicht (Zeile gehoert dem Aufrufer) isoliert", () => {
  it("Mitspieler MIT eigenem Zahlungsprofil, aber ohne eigene Zeile, fragt Stripe nie ab (der Kunden-Vergleich ist nur die zweite Schicht)", async () => {
    const g = await game();
    const mate = await addPlayer(g.match.id, g.home.id, "az");
    await db.insert(paymentProfiles).values({ userId: mate.id, stripeCustomerId: nid("cus_mate"), paymentMethodId: nid("pm_mate") });
    await expect(getAuthorizationSecret(mate.id, g.match.id)).rejects.toThrow(NEUTRAL);
    expect(provider.calls.filter((c) => c.method === "retrievePaymentIntentSecret")).toHaveLength(0); // ohne userId-Filter in openRow wuerde hier bereits abgefragt
    expect(await db.select().from(auditLog).where(and(eq(auditLog.actorId, mate.id), eq(auditLog.action, "charge.authorization_attempt")))).toHaveLength(0);
  });
});
