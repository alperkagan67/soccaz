import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, paymentProfiles, paymentRefunds, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { getRefundAlerts } from "@/server/finance";
import { trialBalance } from "@/server/ledger";
import { cancelMatch, cancelMatchTx } from "@/server/lobby";
import { CLAIM_LEASE_MS, runCharges } from "@/server/payments/charge-run";
import { runChargesIfDue } from "@/server/payments/charge-trigger";
import { FakeProvider } from "@/server/payments/fake";
import { PaymentIdempotencyError, setPaymentProviderForTests } from "@/server/payments/provider";
import { adminCancelMatch, progressCancel, REFUND_LEASE_MS, requestMatchCancel, runRefunds, SEARCH_MIN_AGE_MS } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_rf_%"));
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_rf_%"));
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Kartenspiel, abbuchungsbereit (wie in card-run.test.ts): n Spieler mit Karte und Profil, Anteil fixiert, beide Captains bereit. */
async function game(o: { n?: number; price?: number } = {}) {
  const n = o.n ?? 6;
  const price = o.price ?? 6000;
  const m = await makeMatch({ hoursAhead: 72, priceCents: price, costCents: price });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_rf"), paymentMethodId: nid("pm_rf") });
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: Math.ceil(price / n), status: "confirmed" }).where(eq(matches.id, m.match.id));
  const admin = await makeUser("adm", "admin");
  return { ...m, all, n, price, admin };
}
type G = Awaited<ReturnType<typeof game>>;

const chargesOf = (g: G) => db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
const refundsOf = (g: G) => db.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, g.match.id));
const ledgerOf = (g: G) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id));
const refundEntries = async (g: G) => (await ledgerOf(g)).filter((e) => e.kind === "refund");
const refundCalls = (g: G) => provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { matchId: string } }).metadata.matchId === g.match.id);
const statusOf = async (g: G) => (await reloadMatch(g.match.id)).status;
const auditCount = async (action: string, entityId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)))).length;
const paid = async (g: G) => {
  await runCharges(g.match.id);
  expect((await chargesOf(g)).every((c) => c.status === "succeeded")).toBe(true);
};
const profileOf = async (userId: string) => (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId)))[0];

describe("Absage mit Erstattung auf die Karte", () => {
  it("nach erfolgter Abbuchung: jede Abbuchung wird genau einmal voll erstattet, Hauptbuch ausgeglichen (Gebühr bleibt), Spiel erst danach abgesagt", async () => {
    const g = await game();
    provider.setFee("*", 30);
    await paid(g);
    const before = await ledgerOf(g);
    expect((await reloadMatch(g.match.id)).settledAt).not.toBeNull();

    expect(await adminCancelMatch(g.admin.id, g.match.id, "Halle fällt aus")).toEqual({ state: "cancelled" });

    expect(await statusOf(g)).toBe("cancelled");
    const refunds = await refundsOf(g);
    expect(refunds).toHaveLength(g.n);
    expect(refunds.every((r) => r.status === "succeeded" && r.refundId !== null)).toBe(true);
    expect(refundCalls(g)).toHaveLength(g.n);
    const charges = await chargesOf(g);
    for (const c of charges) {
      const call = refundCalls(g).find((x) => (x.args as { metadata: { chargeId: string } }).metadata.chargeId === c.id)!;
      expect(call.args).toMatchObject({ paymentIntentId: c.paymentIntentId, amountCents: c.amountCents, idempotencyKey: `refund:${c.id}` });
    }
    const entries = await refundEntries(g);
    expect(entries).toHaveLength(g.n);
    expect(entries.every((e) => e.debitAccount === "revenue" && e.creditAccount === "clearing")).toBe(true);
    expect(entries.reduce((s, e) => s + e.amountCents, 0)).toBe(charges.reduce((s, c) => s + c.amountCents, 0));
    // die Stripe-Gebühr bleibt gebucht (Soccaz trägt sie), es wird nichts zurückgebucht
    expect((await ledgerOf(g)).filter((e) => e.kind === "fee")).toHaveLength(before.filter((e) => e.kind === "fee").length);
    expect((await trialBalance()).balanced).toBe(true);
    expect(await auditCount("match.cancel_completed", g.match.id)).toBe(1);

    // zweiter Aufruf: nichts doppelt
    expect(await requestMatchCancel(g.admin.id, g.match.id, "nochmal")).toEqual({ state: "closed" });
    await runRefunds();
    expect(refundCalls(g)).toHaveLength(g.n);
    expect(await refundEntries(g)).toHaveLength(g.n);
  });

  it("nur Admin 1 darf nach der Abbuchung absagen; Captain und Nicht-Admin werden abgelehnt, nichts ändert sich", async () => {
    const g = await game();
    await paid(g);
    await expect(cancelMatch(g.adminA.id, g.match.id, "Absage")).rejects.toThrow(/Abbuchung begonnen/);
    await expect(adminCancelMatch(g.adminA.id, g.match.id, "Absage")).rejects.toThrow(/Nur ein Admin/);
    await expect(adminCancelMatch(g.admin.id, g.match.id, "x")).rejects.toThrow(/Grund/);
    await expect(db.transaction(async (tx) => cancelMatchTx(tx, await reloadMatch(g.match.id), null, "System"))).rejects.toThrow(/Abbuchung begonnen/);
    expect(await statusOf(g)).toBe("confirmed");
    expect(refundCalls(g)).toHaveLength(0);
  });

  it("Teil-Erfolg: nur erfolgreiche Abbuchungen werden erstattet; abgelehnte und nie gesendete Zeilen werden beendet", async () => {
    const g = await game();
    provider.setChargeOutcome(g.all[0].id, "declined");
    provider.setChargeOutcome(g.all[1].id, "declined");
    await runCharges(g.match.id);
    // eine weitere Zeile, die nie gesendet wurde
    const extra = await addPlayer(g.match.id, g.home.id);
    await db.insert(paymentProfiles).values({ userId: extra.id, stripeCustomerId: nid("cus_rf"), paymentMethodId: nid("pm_rf") });
    const never = (await db.insert(paymentCharges).values({ matchId: g.match.id, userId: extra.id, amountCents: 1000, idempotencyKey: `charge:${g.match.id}:${extra.id}` }).returning())[0];

    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("cancelled");
    const charges = await chargesOf(g);
    expect(charges.filter((c) => c.status === "succeeded")).toHaveLength(g.n - 2);
    expect(await refundsOf(g)).toHaveLength(g.n - 2);
    expect(charges.find((c) => c.id === never.id)).toMatchObject({ status: "failed", failureCode: "match_cancelled" });
    expect(refundCalls(g)).toHaveLength(g.n - 2);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("nach der Anforderung wird nichts mehr abgebucht (Auslöser und Wiederholung), das Spiel wird nicht abgerechnet", async () => {
    const g = await game({ n: 4 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id); // Zeilen stehen, gesendet, Ausgang unbekannt
    await db.update(matches).set({ cancelRequestedAt: new Date() }).where(eq(matches.id, g.match.id));
    for (const p of g.all) provider.setChargeOutcome(p.id, "succeeded");
    const calls = provider.calls.filter((c) => c.method === "createPaymentIntent").length;
    await runCharges(g.match.id, new Date(Date.now() + CLAIM_LEASE_MS + 5_000));
    await runChargesIfDue(g.match.id, new Date(Date.now() + CLAIM_LEASE_MS + 5_000));
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent")).toHaveLength(calls);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
  });

  it("Eingang einer Abbuchung NACH der Absage: sofort erstattet (Auto-Refund), das Spiel wird nicht abgerechnet", async () => {
    const g = await game({ n: 4 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    expect(await requestMatchCancel(g.admin.id, g.match.id, "Absage")).toEqual({ state: "pending" }); // Ausgang unbekannt: noch nicht abgesagt
    expect(await statusOf(g)).toBe("confirmed");

    const row = (await chargesOf(g)).find((c) => c.userId === g.all[0].id)!;
    const profile = await profileOf(row.userId);
    const ev = provider.signEvent({ id: nid("evt_rf"), type: "payment_intent.succeeded", object: { id: "pi_late_1", amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: g.match.id, userId: row.userId } } });
    expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
    expect((await chargesOf(g)).find((c) => c.id === row.id)).toMatchObject({ status: "succeeded", paymentIntentId: "pi_late_1" });
    expect(await auditCount("refund.auto", g.match.id)).toBe(1);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
    await runRefunds();
    expect((await refundsOf(g)).find((r) => r.chargeId === row.id)).toMatchObject({ status: "succeeded" });
    expect(await refundEntries(g)).toHaveLength(1);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("unbekannter Ausgang bei der Absage: Stripe-Suche", () => {
  async function unknownGame() {
    const g = await game({ n: 4 });
    provider.setChargeOutcome(g.all[0].id, "error");
    await runCharges(g.match.id);
    const row = (await chargesOf(g)).find((c) => c.userId === g.all[0].id)!;
    return { g, row };
  }

  it("Suche findet eine erfolgreiche Zahlung => verbucht, erstattet, Spiel abgesagt; nur ein PaymentIntent, nie ein neuer", async () => {
    const { g, row } = await unknownGame();
    const profile = await profileOf(row.userId);
    provider.setFound(g.match.id, row.userId, [{ id: "pi_found_1", status: "succeeded", amountCents: row.amountCents, currency: "eur", customerId: profile.stripeCustomerId, failureCode: null }]);
    const calls = provider.calls.filter((c) => c.method === "createPaymentIntent").length;
    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("cancelled");
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent")).toHaveLength(calls);
    expect((await chargesOf(g)).find((c) => c.id === row.id)).toMatchObject({ status: "succeeded", paymentIntentId: "pi_found_1" });
    expect(refundCalls(g).filter((c) => (c.args as { paymentIntentId: string }).paymentIntentId === "pi_found_1")).toHaveLength(1);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Suche findet eine fehlgeschlagene Zahlung => Zeile failed, kein Refund nötig, Spiel abgesagt", async () => {
    const { g, row } = await unknownGame();
    const profile = await profileOf(row.userId);
    provider.setFound(g.match.id, row.userId, [{ id: "pi_found_2", status: "failed", amountCents: row.amountCents, currency: "eur", customerId: profile.stripeCustomerId, failureCode: "card_declined" }]);
    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("cancelled");
    expect((await chargesOf(g)).find((c) => c.id === row.id)?.status).toBe("failed");
  });

  it("kein Treffer: zu früh = abwarten; später = einmal Audit + Alarm, Spiel bleibt Absage-angefordert, nichts erstattet", async () => {
    const { g, row } = await unknownGame();
    await requestMatchCancel(g.admin.id, g.match.id, "Absage");
    expect(await auditCount("charge.search_empty", g.match.id)).toBe(0); // Versuch ist frisch: die verzögerte Suche beweist noch nichts
    const later = new Date(row.attemptStartedAt!.getTime() + SEARCH_MIN_AGE_MS + 1_000);
    await progressCancel(g.match.id, later);
    await progressCancel(g.match.id, new Date(later.getTime() + 60_000));
    expect(await auditCount("charge.search_empty", g.match.id)).toBe(1);
    expect(await statusOf(g)).toBe("confirmed");
    expect((await reloadMatch(g.match.id)).cancelRequestedAt).not.toBeNull();
    const alerts = await getRefundAlerts(new Date(Date.now() + 2 * 3_600_000));
    expect(alerts.stuckCancels.map((x) => x.matchId)).toContain(g.match.id);
    expect(alerts.unclearedCharges.map((x) => x.matchId)).toContain(g.match.id);
  });
});

describe("Erstattung: Fehler, Wiederholung, Webhook", () => {
  it("Netzfehler: Zeile bleibt pending, Wiederholung nach der Beanspruchung sendet mit demselben Schlüssel, eine Buchung", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    provider.setRefundOutcome(g.all[0].id, "error");
    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("pending");
    expect(await statusOf(g)).toBe("confirmed");
    provider.setRefundOutcome(g.all[0].id, "succeeded");
    await progressCancel(g.match.id, new Date(Date.now() + REFUND_LEASE_MS + 5_000));
    expect(await statusOf(g)).toBe("cancelled");
    const mine = refundCalls(g).filter((c) => (c.args as { metadata: { userId: string } }).metadata.userId === g.all[0].id);
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((c) => (c.args as { idempotencyKey: string }).idempotencyKey)).size).toBe(1);
    expect(await refundEntries(g)).toHaveLength(4);
  });

  it("Erstattung abgelehnt (failed) und charge_disputed: Zeile failed mit Code, Spiel bleibt Absage-angefordert, Alarm; nie automatisch erneut", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    provider.setRefundOutcome(g.all[0].id, "failed");
    provider.setRefundOutcome(g.all[1].id, "disputed");
    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("pending");
    const refunds = await refundsOf(g);
    expect(refunds.find((r) => r.userId === g.all[0].id)).toMatchObject({ status: "failed", failureCode: "refund_failed" });
    expect(refunds.find((r) => r.userId === g.all[1].id)).toMatchObject({ status: "failed", failureCode: "charge_disputed" });
    expect(await statusOf(g)).toBe("confirmed");
    const calls = refundCalls(g).length;
    await progressCancel(g.match.id, new Date(Date.now() + 10 * 60_000));
    expect(refundCalls(g)).toHaveLength(calls);
    expect((await getRefundAlerts()).failedRefunds.filter((x) => x.matchId === g.match.id)).toHaveLength(2);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Idempotenz-Konflikt bei der Erstattung: Zeile failed (idempotency_mismatch), nicht verschluckt", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    provider.createRefund = async () => {
      throw new PaymentIdempotencyError();
    };
    await adminCancelMatch(g.admin.id, g.match.id, "Absage");
    expect((await refundsOf(g)).every((r) => r.status === "failed" && r.failureCode === "idempotency_mismatch")).toBe(true);
    expect(await statusOf(g)).toBe("confirmed");
  });

  it("pending bei Stripe: die Zeile bekommt die refund_id; refund.updated (succeeded) bucht genau einmal und schließt die Absage ab; doppelt zugestellt ändert nichts", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    for (const p of g.all) provider.setRefundOutcome(p.id, "pending");
    expect((await adminCancelMatch(g.admin.id, g.match.id, "Absage")).state).toBe("pending");
    const refunds = await refundsOf(g);
    expect(refunds.every((r) => r.status === "pending" && r.refundId !== null)).toBe(true);
    expect(await refundEntries(g)).toHaveLength(0);
    for (const r of refunds) {
      const c = (await chargesOf(g)).find((x) => x.id === r.chargeId)!;
      const ev = provider.signEvent({ id: nid("evt_rf"), type: "refund.updated", object: { id: r.refundId, amount: r.amountCents, currency: "eur", status: "succeeded", payment_intent: c.paymentIntentId, metadata: { matchId: g.match.id, userId: r.userId, chargeId: r.chargeId } } });
      expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
      expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200); // doppelt
    }
    expect(await refundEntries(g)).toHaveLength(4);
    expect(await statusOf(g)).toBe("cancelled");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Webhook refund.*: fremde Erstattung, falscher Betrag, falsche Metadaten, falscher PaymentIntent, fehlendes ID: nichts gebucht, Audit refund.ignored", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    for (const p of g.all) provider.setRefundOutcome(p.id, "pending");
    await adminCancelMatch(g.admin.id, g.match.id, "Absage");
    const r = (await refundsOf(g))[0];
    const c = (await chargesOf(g)).find((x) => x.id === r.chargeId)!;
    const good = { id: r.refundId, amount: r.amountCents, currency: "eur", status: "succeeded", payment_intent: c.paymentIntentId, metadata: { matchId: g.match.id, userId: r.userId, chargeId: r.chargeId } };
    const other = await game({ n: 4 });
    const variants: Record<string, unknown>[] = [
      { ...good, id: "re_unknown" , metadata: { matchId: g.match.id, userId: r.userId, chargeId: "00000000-0000-0000-0000-000000000000" } }, // unbekannt
      { ...good, amount: r.amountCents + 1 },
      { ...good, currency: "usd" },
      { ...good, metadata: { ...good.metadata, matchId: other.match.id } },
      { ...good, metadata: { ...good.metadata, userId: g.all.find((u) => u.id !== r.userId)!.id } },
      { ...good, payment_intent: "pi_anderer" },
      { ...good, id: "re_fremd" }, // andere Erstattungs-ID als die gespeicherte
    ];
    const ignoredBefore = (await db.select().from(auditLog).where(eq(auditLog.action, "refund.ignored"))).length;
    for (const v of variants) {
      const ev = provider.signEvent({ id: nid("evt_rf"), type: "refund.updated", object: v });
      expect((await handleStripeWebhook(ev.rawBody, ev.signature)).status).toBe(200);
    }
    expect(await refundEntries(g)).toHaveLength(0);
    expect((await refundsOf(g)).find((x) => x.id === r.id)?.status).toBe("pending");
    const ignored = await db.select().from(auditLog).where(eq(auditLog.action, "refund.ignored"));
    expect(ignored.length - ignoredBefore).toBe(variants.length); // jede Variante genau ein Audit, auch die unbekannte Erstattung
  });

  it("dieselbe erfolgreiche Erstattung in zwei verschiedenen Ereignissen: genau eine Buchung", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    for (const p of g.all) provider.setRefundOutcome(p.id, "pending");
    await adminCancelMatch(g.admin.id, g.match.id, "Absage");
    const r = (await refundsOf(g))[0];
    const c = (await chargesOf(g)).find((x) => x.id === r.chargeId)!;
    for (const type of ["refund.updated", "charge.refund.updated", "refund.created"]) {
      const ev = provider.signEvent({ id: nid("evt_rf"), type, object: { id: r.refundId, amount: r.amountCents, currency: "eur", status: "succeeded", payment_intent: c.paymentIntentId, metadata: { matchId: g.match.id, userId: r.userId, chargeId: r.chargeId } } });
      await handleStripeWebhook(ev.rawBody, ev.signature);
    }
    expect((await refundEntries(g)).filter((e) => e.idempotencyKey === `refund:${r.refundId}`)).toHaveLength(1);
  });

  it("Absage angefordert und alle Zahlungen treffen danach ein: das Spiel wird NICHT abgerechnet, alle werden erstattet", async () => {
    const g = await game({ n: 4 });
    for (const p of g.all) provider.setChargeOutcome(p.id, "error");
    await runCharges(g.match.id);
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Absage" }).where(eq(matches.id, g.match.id));
    for (const c of await chargesOf(g)) {
      const profile = await profileOf(c.userId);
      const ev = provider.signEvent({ id: nid("evt_rf"), type: "payment_intent.succeeded", object: { id: nid("pi_late"), amount: c.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: g.match.id, userId: c.userId } } });
      await handleStripeWebhook(ev.rawBody, ev.signature);
    }
    expect((await chargesOf(g)).every((c) => c.status === "succeeded")).toBe(true);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
    await runRefunds();
    expect(await statusOf(g)).toBe("cancelled");
    expect(await refundEntries(g)).toHaveLength(4);
  });

  it("Absage angefordert, noch keine Zeilen: der Abbuchungs-Auslöser legt nichts an und sendet nichts", async () => {
    const g = await game({ n: 4 });
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Absage" }).where(eq(matches.id, g.match.id));
    const r = await runCharges(g.match.id);
    expect(r.reason).toBe("not_open");
    expect(await chargesOf(g)).toHaveLength(0);
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent")).toHaveLength(0);
  });

  it("Gesamt-Erstattung <= gezahlter Betrag: je Abbuchung genau eine Zeile (UNIQUE), ein zweiter Versuch legt nichts an; eine zweite Buchung desselben Refunds entsteht nicht", async () => {
    const g = await game({ n: 4 });
    await paid(g);
    const c = (await chargesOf(g))[0];
    await adminCancelMatch(g.admin.id, g.match.id, "Absage");
    await expect(db.insert(paymentRefunds).values({ chargeId: c.id, matchId: g.match.id, userId: c.userId, amountCents: 1, idempotencyKey: "refund:andere" })).rejects.toThrow(); // zweite Erstattung derselben Abbuchung
    await runRefunds();
    await progressCancel(g.match.id);
    expect(await refundEntries(g)).toHaveLength(4);
    expect((await refundEntries(g)).reduce((s, e) => s + e.amountCents, 0)).toBeLessThanOrEqual((await chargesOf(g)).reduce((s, x) => s + x.amountCents, 0));
  });

  it("parallele Absagen und Läufe: jede Erstattung genau einmal gesendet und gebucht", async () => {
    const g = await game({ n: 6 });
    await paid(g);
    await Promise.all([requestMatchCancel(g.admin.id, g.match.id, "A"), requestMatchCancel(g.admin.id, g.match.id, "B"), runRefunds(), progressCancel(g.match.id)]);
    await runRefunds();
    expect(await statusOf(g)).toBe("cancelled");
    expect(await refundEntries(g)).toHaveLength(6);
    expect(new Set(refundCalls(g).map((c) => (c.args as { metadata: { chargeId: string } }).metadata.chargeId)).size).toBe(6);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Struktur: kein Netzaufruf (Erstattung, Suche) innerhalb von db.transaction", async () => {
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
      const g = await game({ n: 4 });
      provider.setChargeOutcome(g.all[0].id, "error");
      await runCharges(g.match.id);
      await adminCancelMatch(g.admin.id, g.match.id, "Absage"); // Suche + Erstattungen
      expect(provider.calls.filter((c) => c.method === "findPaymentIntents").length).toBeGreaterThanOrEqual(1);
      expect(provider.calls.filter((c) => c.method === "createRefund").length).toBeGreaterThanOrEqual(3);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });

  it("Job card-refunds ist registriert", async () => {
    const { JOBS, SCHEDULE } = await import("@/server/jobs");
    expect(typeof JOBS["card-refunds"]).toBe("function");
    expect(SCHEDULE["card-refunds"]).toBe("*/5 * * * *");
    vi.useRealTimers();
  });
});
