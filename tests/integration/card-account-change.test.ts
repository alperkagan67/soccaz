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
async function preparedCard(userId: string, pm: string, customer?: string) {
  provider.registerCard({ id: pm, brand: "visa", last4: pm.slice(-4).padStart(4, "0") });
  const setup = await createCardSetup(userId, { mandateAccepted: true });
  const profile = await profileOf(userId);
  return provider.signEvent({ id: evtId(), type: "setup_intent.succeeded", object: { id: setup.setupIntentId, customer: customer ?? profile.stripeCustomerId, payment_method: pm } });
}
async function saveCard(userId: string, pm: string) {
  const e = await preparedCard(userId, pm);
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

  it("ein Platz in einem Spiel mit angeforderter Absage bleibt failed (cancel_requested_at), ein Spiel im Status confirmed wird bereit, ein abgebuchter Platz bleibt charged", async () => {
    const cancelling = await game();
    const confirmed = await game();
    await saveCard(cancelling.me.id, "pm_ac_old5");
    // derselbe Nutzer sitzt in drei Spielen: abgesagt (angefordert), bestätigt, abgebucht
    const mkSeat = async (matchId: string, teamId: string, status: "failed" | "charged") =>
      db.insert(matchParticipants).values({ matchId, userId: cancelling.me.id, teamId, cardStatus: status }).onConflictDoUpdate({ target: [matchParticipants.matchId, matchParticipants.userId], set: { cardStatus: status } });
    await mkSeat(confirmed.match.id, confirmed.home.id, "failed");
    const third = await game();
    await mkSeat(third.match.id, third.home.id, "charged");
    await setSeat(cancelling.match.id, cancelling.me.id, "failed");
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test" }).where(eq(matches.id, cancelling.match.id));
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, confirmed.match.id));

    await saveCard(cancelling.me.id, "pm_ac_new5");

    expect((await seat(cancelling.match.id, cancelling.me.id)).cardStatus).toBe("failed"); // Absage angefordert
    expect((await seat(confirmed.match.id, cancelling.me.id)).cardStatus).toBe("card_ready"); // confirmed ist offen
    expect((await seat(third.match.id, cancelling.me.id)).cardStatus).toBe("charged"); // nie zurückgesetzt
  });

  it("mehrere Spiele des Nutzers: alle fehlgeschlagenen Plätze werden bereit", async () => {
    const a = await game();
    const b = await game();
    await saveCard(a.me.id, "pm_ac_old6");
    await db.insert(matchParticipants).values({ matchId: b.match.id, userId: a.me.id, teamId: b.home.id, cardStatus: "failed" });
    await setSeat(a.match.id, a.me.id, "failed");
    await saveCard(a.me.id, "pm_ac_new6");
    expect((await seat(a.match.id, a.me.id)).cardStatus).toBe("card_ready");
    expect((await seat(b.match.id, a.me.id)).cardStatus).toBe("card_ready");
  });

  it("dasselbe Ereignis doppelt zugestellt: die zweite Zustellung ändert nichts (processedAt)", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old7");
    const e = await preparedCard(g.me.id, "pm_ac_new7");
    await setSeat(g.match.id, g.me.id, "failed");
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("card_ready");
    await setSeat(g.match.id, g.me.id, "failed"); // später wieder fehlgeschlagen
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200); // Stripe stellt dasselbe Ereignis erneut zu
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("failed");
  });

  it("SetupIntent mit nicht passendem Kunden: nichts ändert sich (weder Karte noch Platz)", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old8");
    await setSeat(g.match.id, g.me.id, "failed");
    const e = await preparedCard(g.me.id, "pm_ac_new8", "cus_ac_fremd");
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    expect((await profileOf(g.me.id)).paymentMethodId).toBe("pm_ac_old8");
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("failed");
  });

  it("parallele Absage: das Ereignis wartet auf die Spielsperre (Spiel zuerst), danach gilt die angeforderte Absage und der Platz bleibt failed", async () => {
    const g = await game();
    await saveCard(g.me.id, "pm_ac_old9");
    await setSeat(g.match.id, g.me.id, "failed");
    const e = await preparedCard(g.me.id, "pm_ac_new9");

    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const lockedP = new Promise<void>((resolve) => (locked = resolve));
    // Die Absage hält die Spielzeile gesperrt (noch nicht festgeschrieben), während das Ereignis eintrifft
    const cancelTx = db.transaction(async (tx) => {
      await tx.select().from(matches).where(eq(matches.id, g.match.id)).for("update");
      await tx.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "parallel" }).where(eq(matches.id, g.match.id));
      locked();
      await held;
    });
    await lockedP;
    let done = false;
    const hook = handleStripeWebhook(e.rawBody, e.signature).then((r) => {
      done = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(done).toBe(false); // wartet auf die Spielsperre statt am alten Stand vorbeizuschreiben
    release();
    await cancelTx;
    expect((await hook).status).toBe(200);
    expect((await seat(g.match.id, g.me.id)).cardStatus).toBe("failed"); // die Absage hat gewonnen
    expect((await profileOf(g.me.id)).paymentMethodId).toBe("pm_ac_new9"); // die Karte selbst wird trotzdem gespeichert
  });
});
