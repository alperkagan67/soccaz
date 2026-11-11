import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { createCardSetup } from "@/server/payments/card-setup";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3b AC-5: "Karte ändern" auch ausserhalb der Lobby (Konto). Ohne matchId; die alte Karte wird gelöst; Plätze mit fehlgeschlagener
// Abbuchung in offenen Spielen sind danach wieder bereit (card_ready). Abgebucht wird dabei nichts (das Wiederabbuchen im Fenster ist M3c).

let provider: FakeProvider;
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_ac_%"));
  await cleanup();
});

let seq = 0;
const evtId = () => `evt_ac_${Date.now().toString(36)}_${++seq}`;
const profileOf = async (userId: string) => (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, userId)))[0];
const seat = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const setSeat = (matchId: string, userId: string, cardStatus: "none" | "card_ready" | "charge_pending" | "charged" | "failed") =>
  db.update(matchParticipants).set({ cardStatus }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));

/** Speichert eine Karte im Konto (ohne Spiel) über den echten Weg: SetupIntent anlegen, Ereignis von Stripe zustellen. */
async function saveCard(userId: string, pm: string) {
  provider.registerCard({ id: pm, brand: "visa", last4: pm.slice(-4).padStart(4, "0") });
  const setup = await createCardSetup(userId, { mandateAccepted: true });
  const profile = await profileOf(userId);
  const e = provider.signEvent({ id: evtId(), type: "setup_intent.succeeded", object: { id: setup.setupIntentId, customer: profile.stripeCustomerId, payment_method: pm } });
  const res = await handleStripeWebhook(e.rawBody, e.signature);
  expect(res.status).toBe(200);
}

async function game() {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const me = await addPlayer(m.match.id, m.home.id, "ac");
  const other = await addPlayer(m.match.id, m.away.id, "ac");
  return { ...m, me, other };
}

describe("AC-5: Karte im Konto ändern", () => {
  it("ersetzt die Karte, löst die alte bei Stripe und setzt fehlgeschlagene Plätze in offenen Spielen auf card_ready; bucht nichts", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old1");
    expect((await profileOf(g.me.id)).paymentMethodId).toBe("pm_ac_old1");
    await setSeat(g.match.id, g.me.id, "failed");
    const before = (await db.select().from(ledgerEntries)).length;
    const chargesBefore = (await db.select().from(paymentCharges)).length;

    await saveCard(g.me.id, "pm_ac_new1");

    const p = await profileOf(g.me.id);
    expect(p.paymentMethodId).toBe("pm_ac_new1");
    expect(p.cardLast4).toBe("d_new1".slice(-4).padStart(4, "0")); // Anzeigedaten der neuen Karte
    expect(provider.calls.some((c) => c.method === "detachPaymentMethod" && JSON.stringify(c).includes("pm_ac_old1"))).toBe(true);
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("card_ready");
    expect((await db.select().from(ledgerEntries)).length).toBe(before); // nichts gebucht
    expect((await db.select().from(paymentCharges)).length).toBe(chargesBefore); // nichts abgebucht
  });

  it("andere Plätze bleiben unberührt: none, charge_pending und charged ändern sich nicht, ein fremder fehlgeschlagener Platz auch nicht", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old2");
    await setSeat(g.match.id, g.me.id, "charge_pending");
    await setSeat(g.match.id, g.other.id, "failed");

    await saveCard(g.me.id, "pm_ac_new2");

    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("charge_pending");
    expect((await seat(g.match.id, g.other.id)).cardStatus).toBe("failed"); // fremder Nutzer, fremde Karte
  });

  it("ein fehlgeschlagener Platz in einem abgesagten oder beendeten Spiel bleibt failed", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old3");
    await setSeat(g.match.id, g.me.id, "failed");
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, g.match.id));

    await saveCard(g.me.id, "pm_ac_new3");

    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("failed");
  });

  it("ein Platz ohne Karte (none) wird durch eine Karte im Konto NICHT bereit: das Mandat gilt je Platz und wird in der Lobby gegeben", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old4");
    await saveCard(g.me.id, "pm_ac_new4");
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("none");
  });
});
