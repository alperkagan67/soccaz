import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles, paymentRefunds } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { bookCommission } from "@/server/commission";
import { listMatchFinance, matchMoneyOf, overview, playerFinance } from "@/server/finance";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { applyRefundInTx } from "@/server/payments/refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// 012 M6b 1c-iii (a): Admin-Finanzen im Kartenmodell. Die Detailseite, die Spieleliste und die Übersicht lesen dieselben Hauptbuch-Konten (matchMoneyOf); die Spielerbeträge kommen aus
// payment_charges (Zahler = Übernehmer) abzüglich payment_refunds. Kontenzuordnung und Einnahmen-Ausweis sind vorläufig (Steuerberater-Liste FEHLT-NOCH).
let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(cleanup);

const wide = { from: new Date("2020-01-01"), to: new Date("2100-01-01") };
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type Game = Awaited<ReturnType<typeof makeMatch>>;
/** Eine Abbuchungszeile (800) für den Spieler, optional von einem anderen Zahler (Übernahme); `event` schickt das Ergebnis über den echten Webhook. */
async function charge(m: Game, user: { id: string }, event: "payment_intent.succeeded" | "payment_intent.payment_failed" | null, payerUserId: string | null = null) {
  const payer = payerUserId ?? user.id;
  await db.insert(paymentProfiles).values({ userId: payer, stripeCustomerId: nid("cus_fc"), paymentMethodId: nid("pm_fc") }).onConflictDoNothing();
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, payer));
  await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, user.id)));
  const piId = nid("pi_fc");
  const [row] = await db
    .insert(paymentCharges)
    .values({ matchId: m.match.id, userId: user.id, payerUserId, amountCents: 800, idempotencyKey: `charge:${m.match.id}:${user.id}`, paymentIntentId: piId })
    .returning();
  if (event) {
    const object: Record<string, unknown> = { id: piId, amount: 800, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: m.match.id, userId: user.id } };
    if (event === "payment_intent.payment_failed") object.last_payment_error = { code: "card_declined" };
    const e = provider.signEvent({ id: nid("evt_fc"), type: event, object });
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
  }
  return row;
}

/** Gemeinsame Prüfung: Detailseite (matchMoneyOf) = Spieleliste = Übersicht für dieses Spiel; liefert die Summen. */
async function consistent(matchId: string, before: Awaited<ReturnType<typeof overview>>) {
  const detail = (await matchMoneyOf([matchId])).get(matchId)!;
  const row = (await listMatchFinance(wide)).find((x) => x.id === matchId);
  const after = await overview(wide);
  if (row) {
    expect(row.revenueCents).toBe(detail.revenueCents);
    expect(row.costCents).toBe(detail.costCents);
    expect(row.marginCents).toBe(detail.marginCents);
  } else {
    expect(detail.revenueCents).toBe(0); // ohne Buchungen steht ein Spiel nicht in der Liste
  }
  expect(after.revenueCents - before.revenueCents).toBe(detail.revenueCents); // die Übersicht summiert dieselben Konten
  return detail;
}
const netSum = async (matchId: string) => (await playerFinance(matchId)).reduce((sum, p) => sum + p.cardNetCents, 0);

describe("Admin-Finanzen im Kartenmodell: Detailseite = Spieleliste = Übersicht", () => {
  it("Karte, Fake-Abbuchung: Einnahmen 800 überall gleich, Spieler-Netto 800 (Pin der Lücke aus #202: Detailseite zeigte 0)", async () => {
    const before = await overview(wide);
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true }); // legacy: Anteilskonto revenue (kein Provisionsmodell)
    const u = await addPlayer(m.match.id, m.home.id, "fc");
    await charge(m, u, "payment_intent.succeeded");
    expect((await consistent(m.match.id, before)).revenueCents).toBe(800);
    expect(await netSum(m.match.id)).toBe(800);
    const me = (await playerFinance(m.match.id)).find((p) => p.userId === u.id)!;
    expect(me).toMatchObject({ paidCents: 800, refundedCents: 0, netCents: 800, hasPaidNow: true });
  });

  it("Teil-Erfolg: eine Abbuchung gelingt, eine scheitert: nur die gelungene zählt (Einnahmen und Spieler-Netto)", async () => {
    const before = await overview(wide);
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const ok = await addPlayer(m.match.id, m.home.id, "fo");
    const bad = await addPlayer(m.match.id, m.home.id, "fb");
    await charge(m, ok, "payment_intent.succeeded");
    await charge(m, bad, "payment_intent.payment_failed");
    expect((await consistent(m.match.id, before)).revenueCents).toBe(800);
    const players = await playerFinance(m.match.id);
    expect(players.find((p) => p.userId === ok.id)!.netCents).toBe(800);
    expect(players.find((p) => p.userId === bad.id)!.netCents).toBe(0);
    expect(await netSum(m.match.id)).toBe(800);
  });

  it("Erstattung: nach erfolgreicher Rückbuchung sind Einnahmen und Spieler-Netto 0, überall gleich; die offene Erstattung wird vorher als offen gezeigt", async () => {
    const before = await overview(wide);
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const u = await addPlayer(m.match.id, m.home.id, "fr");
    const row = await charge(m, u, "payment_intent.succeeded");
    await db.insert(paymentRefunds).values({ chargeId: row.id, matchId: m.match.id, userId: u.id, amountCents: 800, idempotencyKey: `refund:${row.id}`, reason: "Test" });
    expect((await playerFinance(m.match.id)).find((p) => p.userId === u.id)!.pendingRefundCents).toBe(800);
    const applied = await db.transaction((tx) =>
      applyRefundInTx(tx, { outcome: "succeeded", refundId: nid("re_fc"), amountCents: 800, currency: "eur", paymentIntentId: null, metadata: { matchId: m.match.id, userId: u.id, chargeId: row.id }, failureCode: null }),
    );
    expect(applied.status).toBe("applied");
    expect((await consistent(m.match.id, before)).revenueCents).toBe(0);
    const me = (await playerFinance(m.match.id)).find((p) => p.userId === u.id)!;
    expect(me).toMatchObject({ paidCents: 800, refundedCents: 800, netCents: 0, pendingRefundCents: 0 });
  });

  it("Provisionsmodell: die Abbuchung liegt auf venue_payable (durchlaufend, kein Ertrag), erst die Provision ist Einnahme; Detailseite = Liste = Übersicht", async () => {
    const before = await overview(wide);
    const [v] = await db.insert(venues).values({ name: `FC Halle ${nid("v")}`, city: "Essen", source: "manual", commissionPercent: "10" }).returning();
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, ledgerModel: "commission" });
    await db.update(matches).set({ venueId: v.id }).where(eq(matches.id, m.match.id));
    const u = await addPlayer(m.match.id, m.home.id, "fp");
    await charge(m, u, "payment_intent.succeeded");
    const pre = await consistent(m.match.id, before);
    expect(pre.revenueCents).toBe(0); // noch keine Provision
    expect(pre.passThroughCents).toBe(800); // durchlaufend
    const [fresh] = await db.select().from(matches).where(eq(matches.id, m.match.id));
    const booked = await db.transaction((tx) => bookCommission(tx, fresh));
    expect(booked.booked).toBe(true);
    const post = await consistent(m.match.id, before);
    expect(post.revenueCents).toBe(800); // Provision 10 % der Hallenmiete 8000
    expect(await netSum(m.match.id)).toBe(800); // der Spieler hat 800 gezahlt, unabhängig vom Ertrag
  });

  it("Übernahme: zahlt ein anderer Spieler den Anteil, steht der Betrag beim Zahler, nicht beim Sitzplatz", async () => {
    const before = await overview(wide);
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, legacy: true });
    const seat = await addPlayer(m.match.id, m.home.id, "fs");
    const payer = await addPlayer(m.match.id, m.home.id, "fy");
    await charge(m, seat, "payment_intent.succeeded", payer.id);
    expect((await consistent(m.match.id, before)).revenueCents).toBe(800);
    const players = await playerFinance(m.match.id);
    expect(players.find((p) => p.userId === payer.id)!.netCents).toBe(800);
    expect(players.find((p) => p.userId === seat.id)!.netCents).toBe(0);
    expect(await netSum(m.match.id)).toBe(800);
  });

  it("Altmodell (Guthaben) im Provisionsmodell: wallet -> venue_payable ist durchlaufend, die Provision die Einnahme; Detailseite = Liste = Übersicht (Verhaltensänderung: Einnahmen nur revenue + commission)", async () => {
    const before = await overview(wide);
    const [v] = await db.insert(venues).values({ name: `FC Halle ${nid("v")}`, city: "Essen", source: "manual", commissionPercent: "10" }).returning();
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000, ledgerModel: "commission" });
    await db.update(matches).set({ venueId: v.id }).where(eq(matches.id, m.match.id));
    const u = await addPlayer(m.match.id, m.home.id, "fw");
    await db.insert(ledgerEntries).values({ debitAccount: "wallet", debitUserId: u.id, creditAccount: "venue_payable", amountCents: 800, kind: "match_share", matchId: m.match.id, idempotencyKey: nid("fw"), reason: "Test: Anteil vom Guthaben" });
    const pre = await consistent(m.match.id, before);
    expect(pre.revenueCents).toBe(0); // früher zeigte die Detailseite hier die Summe der Spieler-Netto-Beträge (800), jetzt nur revenue + commission
    expect(pre.passThroughCents).toBe(800);
    const [fresh] = await db.select().from(matches).where(eq(matches.id, m.match.id));
    await db.transaction((tx) => bookCommission(tx, fresh));
    expect((await consistent(m.match.id, before)).revenueCents).toBe(800);
    expect((await playerFinance(m.match.id)).find((p) => p.userId === u.id)!.walletNetCents).toBe(800);
  });
});
