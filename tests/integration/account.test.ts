import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, paymentCharges, paymentDisputes, paymentErasureTasks, paymentProfiles, paymentRefunds, paymentSetupIntents, users } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { deleteAccount, exportCardData, exportMyData } from "@/server/account";
import { getDispute } from "@/server/payments/dispute-admin";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 012, M4b (AC-16): Export mit Stripe-Kunden-ID und Kartendaten; Loeschung entfernt Profil und Mandat in DERSELBEN Transaktion, legt den Loeschauftrag fuer den Stripe-Kunden an; Buchungsdaten bleiben.

let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

/** Spieler mit Kunde, Karte, Mandat, einer Abbuchung (als Platz) und einer Erstattung, in einem ABGESCHLOSSENEN Spiel (Loeschung moeglich). */
async function payer(tag = "ac") {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 3200, costCents: 3200 });
  const u = await addPlayer(m.match.id, m.home.id, tag);
  const customerId = nid("cus_ac");
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: customerId, paymentMethodId: nid("pm_ac_geheim"), cardBrand: "visa", cardLast4: "4242", mandateText: "Mandat-Wortlaut", mandateAcceptedAt: new Date("2026-11-01T10:00:00Z") });
  await db.insert(paymentSetupIntents).values({ id: nid("seti_ac"), userId: u.id, matchId: m.match.id, status: "succeeded", mandateText: "Mandat-Wortlaut", mandateAcceptedAt: new Date("2026-11-01T10:00:00Z") });
  const [charge] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: u.id, amountCents: 800, status: "succeeded", idempotencyKey: `charge:${m.match.id}:${u.id}`, paymentIntentId: nid("pi_ac") }).returning();
  await db.insert(paymentRefunds).values({ chargeId: charge.id, matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `refund:${charge.id}`, status: "succeeded", reason: "Absage" });
  // Spiel abgeschlossen, damit die Loeschung nicht an 'offenes Spiel' scheitert
  await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, m.match.id));
  await db.delete(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, u.id)));
  return { ...m, u, customerId, charge };
}
type P = Awaited<ReturnType<typeof payer>>;
const taskOf = async (userId: string) => (await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.userId, userId)))[0];

describe("Export (AC-16)", () => {
  it("enthaelt Kunden-ID, Marke und letzte vier Ziffern, Mandat, Abbuchungen, Erstattungen; NICHT die Zahlungsmittel-ID", async () => {
    const p = await payer();
    const card = await exportCardData(p.u.id);
    expect(card.stripeCustomerId).toBe(p.customerId);
    expect(card.card).toEqual({ brand: "visa", last4: "4242" });
    expect(card.mandate).toMatchObject({ text: "Mandat-Wortlaut" });
    expect(card.mandates).toHaveLength(1);
    expect(card.charges).toEqual([expect.objectContaining({ amountCents: 800, status: "succeeded", role: "own" })]);
    expect(card.refunds).toEqual([expect.objectContaining({ amountCents: 800, status: "succeeded" })]);
    const all = JSON.stringify(await exportMyData(p.u.id));
    expect(all).toContain(p.customerId);
    expect(all).not.toContain("pm_ac_geheim");
    expect(all).not.toMatch(/paymentMethodId|payment_method_id/);
  });

  it("Abbuchungen als ZAHLER fuer einen anderen Platz und als Platz, dessen Anteil ein anderer uebernahm: ohne Namen Dritter; eigene Einwilligung zum Uebernehmen und eigene Streite", async () => {
    const p = await payer("acp");
    const seat = await makeUser("acseat");
    const [other] = await db.insert(paymentCharges).values({ matchId: p.match.id, userId: seat.id, payerUserId: p.u.id, amountCents: 800, status: "succeeded", idempotencyKey: `charge:${p.match.id}:${seat.id}`, paymentIntentId: nid("pi_acs") }).returning();
    await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_ac"), chargeId: other.id, paymentIntentId: other.paymentIntentId, matchId: p.match.id, payerUserId: p.u.id, amountCents: 800, currency: "eur", status: "won" });
    await db.insert(matchParticipants).values({ matchId: p.match.id, userId: seat.id, teamId: p.home.id, coveredByUserId: p.u.id, coverMandateText: "cover.mandate.v1.entwurf", coverAcceptedAt: new Date("2026-11-02T10:00:00Z") });
    const asPayer = await exportCardData(p.u.id);
    expect(asPayer.charges.map((c) => c.role).sort()).toEqual(["own", "payer_for_other"]);
    expect(asPayer.coversGiven).toEqual([expect.objectContaining({ mandate: "cover.mandate.v1.entwurf" })]);
    expect(asPayer.disputes).toHaveLength(1);
    expect(JSON.stringify(asPayer)).not.toContain(seat.name);
    expect(JSON.stringify(asPayer)).not.toContain(seat.email);
    const asSeat = await exportCardData(seat.id);
    expect(asSeat.charges).toEqual([expect.objectContaining({ role: "seat_covered_by_other" })]);
    expect(asSeat.coversGiven).toHaveLength(0);
    expect(JSON.stringify(asSeat)).not.toContain(p.u.name);
    expect(JSON.stringify(asSeat)).not.toContain(p.u.email);
    expect(JSON.stringify(asSeat)).not.toContain(p.u.id);
  });

  it("ohne Kartendaten: leere Felder, kein Fehler", async () => {
    const u = await makeUser("acnone");
    expect(await exportCardData(u.id)).toMatchObject({ stripeCustomerId: null, card: null, mandate: null, charges: [], refunds: [], coversGiven: [], disputes: [] });
  });
});

describe("Loeschung (AC-16)", () => {
  it("legt den Auftrag mit der Kunden-ID an und loescht Profil und Mandat; Ledger, Abbuchungen, Erstattungen bleiben; kein Netzaufruf in der Transaktion", async () => {
    const p = await payer();
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
      await deleteAccount(p.u.id);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
    expect(provider.violations).toEqual([]);
    expect(provider.calls).toHaveLength(0); // die Loeschung ruft Stripe NIE selbst auf (das macht der Job)
    const t = await taskOf(p.u.id);
    expect(t).toMatchObject({ stripeCustomerId: p.customerId, status: "pending", attempts: 0 });
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, p.u.id))).toHaveLength(0);
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, p.u.id))).toHaveLength(0);
    // Buchungsdaten bleiben (ohne Personenbezug ueber die anonymisierte Nutzerzeile)
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.id, p.charge.id))).toHaveLength(1);
    expect(await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, p.charge.id))).toHaveLength(1);
    expect((await db.select().from(users).where(eq(users.id, p.u.id)))[0]).toMatchObject({ name: "Gelöschter Nutzer" });
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, p.match.id))).toBeDefined();
  });

  it("ein offener Zahlungsstreit haelt die Loeschung auf: Profil und Mandat bleiben, KEIN Auftrag; ein gewonnener haelt nicht auf, ein unbekannter Status schon", async () => {
    for (const [status, blocks] of [["needs_response", true], ["under_review", true], ["neuer_stripe_status", true], ["won", false], ["lost", false]] as const) {
      const p = await payer("acd");
      await db.insert(paymentDisputes).values({ disputeId: nid("dp_test_acd"), chargeId: p.charge.id, paymentIntentId: p.charge.paymentIntentId, matchId: p.match.id, payerUserId: p.u.id, amountCents: 800, currency: "eur", status });
      if (blocks) {
        await expect(deleteAccount(p.u.id), status).rejects.toThrow(/Zahlungsstreit/);
        expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, p.u.id)), status).toHaveLength(1);
        expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, p.u.id)), status).toHaveLength(1);
        expect(await taskOf(p.u.id), status).toBeUndefined();
        expect((await db.select().from(users).where(eq(users.id, p.u.id)))[0].name, status).not.toBe("Gelöschter Nutzer");
      } else {
        await deleteAccount(p.u.id);
        expect((await taskOf(p.u.id))?.status, status).toBe("pending");
      }
    }
  });

  it("andere Sperren (Guthaben) lassen Profil und Mandat unberuehrt, kein Auftrag", async () => {
    const p = await payer("acg");
    await db.update(matches).set({ status: "lobby" }).where(eq(matches.id, p.match.id));
    await db.insert(matchParticipants).values({ matchId: p.match.id, userId: p.u.id, teamId: p.home.id });
    await expect(deleteAccount(p.u.id)).rejects.toThrow(/offenes Spiel/);
    expect(await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, p.u.id))).toHaveLength(1);
    expect(await taskOf(p.u.id)).toBeUndefined();
  });

  it("zweiter Aufruf legt keinen zweiten Auftrag an; Konto ohne Kartenprofil: kein Auftrag", async () => {
    const p = await payer("ac2");
    await deleteAccount(p.u.id);
    await expect(deleteAccount(p.u.id)).rejects.toThrow(/nicht mehr/);
    expect(await db.select().from(paymentErasureTasks).where(eq(paymentErasureTasks.userId, p.u.id))).toHaveLength(1);
    const plain = await makeUser("acplain");
    await deleteAccount(plain.id);
    expect(await taskOf(plain.id)).toBeUndefined();
  });
});

describe("Bekannte Luecke (Plan v4, FRAGE-RECHT): Streit NACH der Kontoloeschung", () => {
  it("der Streit wird zugeordnet und gebucht (Zahler ist die anonymisierte Nutzerzeile), Mandat und Profil fehlen als Beweis, Admin 1 wird alarmiert", async () => {
    const p = await payer("acx");
    const admin = await makeUser("acxadm", "admin");
    await deleteAccount(p.u.id);
    const id = nid("dp_test_acx");
    const t = nid("txn_test_acx");
    const object = { id, amount: 800, currency: "eur", payment_intent: p.charge.paymentIntentId, charge: "ch_test_acx", reason: "fraudulent", status: "needs_response", balance_transactions: [{ id: t, amount: -800, fee: 1500, currency: "eur", reporting_category: "dispute" }] };
    const e = provider.signEvent({ id: nid("evt_acx"), type: "charge.dispute.created", object, created: 1_800_000_000 });
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    const [row] = await db.select().from(paymentDisputes).where(eq(paymentDisputes.disputeId, id));
    expect(row).toMatchObject({ chargeId: p.charge.id, payerUserId: p.u.id, status: "needs_response" });
    expect(await db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, p.u.id))).toHaveLength(0); // kein Mandat mehr als Beweis
    const d = (await getDispute(row.id))!;
    expect(d.payer).toMatchObject({ deleted: true });
    expect(d.evidence.mandateAcceptedAt).toBeNull();
    expect((await db.select().from(notifications).where(eq(notifications.userId, admin.id))).filter((n) => n.title === "Zahlungsstreit eingegangen")).toHaveLength(1);
  });
});
