import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles, remindersSent, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { fixDeadline } from "@/lib/deadlines";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runRefunds } from "@/server/payments/refund";
import { runSubstitutes } from "@/server/payments/substitute";
import { takeOverShare } from "@/server/payments/cover";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { closeLobbiesAtDeadline, sendMatchReminders } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { addPlayer, cardGame, cleanup, makeMatch } from "./helpers";
import { nid } from "./slot-helpers";
import { slotGame } from "./slot-helpers";

// Entscheid D (t2q), Pflicht aus w2-Review (Notschalter): Zahlungen AN + Karte AUS = PAUSIERT. Die Absage-Regeln duerfen in der Pause NICHTS absagen oder Plaetze vergeben, weil niemand
// abbuchen konnte (die Pause ist nicht die Schuld der Spieler). Erstattungen/Absagen mit bereits abgebuchtem Geld laufen weiter (refund.ts kennt den Schalter nicht).
let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sh_%"));
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sh_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const stateOf = async (id: string) => (await db.select().from(matches).where(eq(matches.id, id)))[0];
const pause = () => setSetting(null, "card_payments_enabled", false);

describe("pausiert: der Frist-Job sagt nicht ab", () => {
  it("Kontrolle (Karte AN): ein Spiel ohne beide bereiten Captains wird zur Frist abgesagt", async () => {
    const g = await cardGame({ hoursAhead: 72, n: 6, confirmed: false });
    const start = (await stateOf(g.match.id)).startsAt;
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    expect((await stateOf(g.match.id)).status).toBe("cancelled");
  });

  it("pausiert (Zahlungen AN, Karte AUS): dasselbe Spiel zur Frist wird NICHT abgesagt, nichts abgerechnet, nichts erstattet, kein Anbieteraufruf", async () => {
    const g = await cardGame({ hoursAhead: 72, n: 6, confirmed: false });
    await pause();
    const start = (await stateOf(g.match.id)).startsAt;
    const cancelled = await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    expect(cancelled).toBe(0);
    const m = await stateOf(g.match.id);
    expect(m.status).not.toBe("cancelled");
    expect(m.settledAt).toBeNull();
    expect(provider.calls).toHaveLength(0);
    // nach dem Wiedereinschalten gilt die Frist-Regel wieder (nichts ging verloren)
    await setSetting(null, "card_payments_enabled", true);
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    expect((await stateOf(g.match.id)).status).toBe("cancelled");
  });
});

describe("pausiert: das Nachzahlfenster gibt keine Plaetze frei und sagt nicht ab", () => {
  it("Kontrolle (Karte AN): Fenster abgelaufen, keine Warteliste: Absage angefordert", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    expect((await stateOf(g.match.id)).cancelRequestedAt).not.toBeNull();
  });

  it("pausiert: derselbe Fall: kein Platz freigegeben, keine Absage, kein Anbieteraufruf fuer Abbuchungen", async () => {
    const g = await slotGame(provider, { waitlist: 2, realPaid: true });
    await pause();
    const calls = provider.calls.length;
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res).toMatchObject({ released: 0, filled: 0, exhausted: [] });
    expect((await stateOf(g.match.id)).cancelRequestedAt).toBeNull();
    const seat = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id));
    expect(seat.some((s) => s.userId === g.root.id)).toBe(true); // der Platz des Spielers mit dem abgelaufenen Fenster bleibt
    // nur lesende Abgleiche (retrieve) sind erlaubt: kein Abbuchen, kein Abbrechen, kein Erstatten
    expect(provider.calls.slice(calls).map((c) => c.method).filter((m) => m !== "retrievePaymentIntent")).toEqual([]);
  });
});

describe("pausiert: Erstattungen mit bereits abgebuchtem Geld laufen weiter", () => {
  it("Absage war angefordert (noch nichts erstattet), dann Pause: runRefunds erstattet trotzdem alle Abgebuchten und schliesst die Absage ab", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test: Absage angefordert" }).where(eq(matches.id, g.match.id));
    expect(provider.calls.filter((c) => c.method === "createRefund")).toHaveLength(0);
    await pause();
    await runRefunds();
    expect((await stateOf(g.match.id)).status).toBe("cancelled");
    expect(provider.calls.filter((c) => c.method === "createRefund")).toHaveLength(3);
  });
});

describe("pausiert: schalterunabhaengige Jobs laufen weiter (Tabelle in BETRIEB, Zeilen 11 und 12)", () => {
  it("Webhook: ein erfolgreicher PaymentIntent wird in der Pause trotzdem verbucht (Geld ist bei Stripe schon gebucht)", async () => {
    const g = await cardGame({ hoursAhead: 72, n: 4, confirmed: true });
    const pi = nid("pi_pause");
    const [row] = await db.insert(paymentCharges).values({ matchId: g.match.id, userId: g.adminA.id, amountCents: 1500, status: "pending", idempotencyKey: `charge:${g.match.id}:${g.adminA.id}:pause`, paymentIntentId: pi }).returning();
    await pause();
    const e = provider.signEvent({ id: nid("evt_sh"), type: "payment_intent.succeeded", object: { id: pi, amount: 1500, currency: "eur", customer: (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, g.adminA.id)))[0].stripeCustomerId, metadata: { matchId: g.match.id, userId: g.adminA.id } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    expect((await db.select().from(paymentCharges).where(eq(paymentCharges.id, row.id)))[0].status).toBe("succeeded");
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id))).length).toBeGreaterThan(0);
  });

  it("Spiel-Erinnerungen (24 h/2 h/30 min) kommen in der Pause wie sonst", async () => {
    const m = await makeMatch({ hoursAhead: 20, priceCents: 6000, costCents: 6000 });
    await pause();
    await sendMatchReminders();
    expect((await db.select().from(remindersSent).where(eq(remindersSent.matchId, m.match.id))).length).toBeGreaterThan(0);
  });
});

describe("pausiert: Anteil uebernehmen (Cover) ist nicht moeglich", () => {
  // Fixture wie card-cover.test: a ohne Karte (rot), b mit Karte im selben Team; 10 Spieler, Anteil fixiert
  async function coverGame() {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const all = [m.adminA, m.adminB];
    while (all.length < 10) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
    const [a, b] = [all[2], all[4]];
    for (const p of all) if (p.id !== a.id) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_cp"), paymentMethodId: nid("pm_cp") });
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, a.id)));
    await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: 800, status: "confirmed" }).where(eq(matches.id, m.match.id));
    return { m, a, b };
  }

  it("Kontrolle: bei Karte AN klappt die Uebernahme; pausiert (Zahlungen AN, Karte AUS): \"gerade nicht uebernehmen\", nichts geschrieben", async () => {
    const ok = await coverGame();
    await takeOverShare(ok.b.id, ok.m.match.id, ok.a.id, true);
    expect((await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, ok.m.match.id), eq(matchParticipants.userId, ok.a.id))))[0].coveredByUserId).toBe(ok.b.id);
    const g = await coverGame();
    await pause();
    await expect(takeOverShare(g.b.id, g.m.match.id, g.a.id, true)).rejects.toThrow(/nicht übernehmen/);
    expect((await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.m.match.id), eq(matchParticipants.userId, g.a.id))))[0].coveredByUserId).toBeNull();
  });
});
