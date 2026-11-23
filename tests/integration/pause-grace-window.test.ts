import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, stripeEvents } from "@/db/schema";
import { FakeProvider } from "@/server/payments/fake";
import { retryChargesInWindow } from "@/server/payments/charge-retry";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runSubstitutes } from "@/server/payments/substitute";
import { setSetting } from "@/server/settings";
import { cleanup } from "./helpers";
import { resumeCycle } from "./pause-helpers";
import { slotGame } from "./slot-helpers";

// Nachzahlfenster (AC-9) nach der Pause: ein Fenster, das in der Pause ablief, gibt den Platz nicht sofort nach dem Wiedereinschalten frei: Untergrenze Wiedereinschalten + 2 Stunden, aber nur vor Anstoss minus 1 Stunde.
// Reicht die Karenz nicht bis dahin, gilt die bestehende Regel (Platz frei bzw. Absage mit Erstattung).
let provider: FakeProvider;
const H = 3_600_000;
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
const seatsOf = (id: string) => db.select().from(matchParticipants).where(eq(matchParticipants.matchId, id));
/** Pause von vor 2 Stunden bis vor 30 Sekunden: das Fensterende (vor 1 Minute) liegt in der Pause. Alte Schalter-Audits werden vorher geloescht (Test-Isolation). */
async function pauseAndResume() {
  await db.execute(sql`delete from audit_log where action like 'card_switch.%' and entity_id = 'card_payments_enabled'`);
  await resumeCycle(new Date(Date.now() - 30_000), new Date(Date.now() - 2 * H));
}

describe("Nachzahlfenster: Karenz nach dem Wiedereinschalten", () => {
  it("Kontrolle (nie pausiert): Fenster abgelaufen, keine Warteliste: Absage angefordert", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    expect((await stateOf(g.match.id)).cancelRequestedAt).not.toBeNull();
    // OHNE Karenz (hier: nie pausiert) verliert nie ein BEZAHLTER Platz: freigegeben wird hoechstens der Platz mit gescheiterter Abbuchung, die Absage erstattet voll
    const seats = (await seatsOf(g.match.id)).map((x) => x.userId);
    for (const paid of [g.mate, g.adminA, g.adminB]) expect(seats).toContain(paid.id);
  });

  it("Kontrolle (nie pausiert): Fenster abgelaufen: auch mit neuer Karte kein Wiederabbuchen", async () => {
    const without = await slotGame(provider, { waitlist: 0, realPaid: true });
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, without.match.id), eq(matchParticipants.userId, without.root.id)));
    const before = provider.calls.filter((c) => c.method === "createPaymentIntent").length;
    await retryChargesInWindow({ matchId: without.match.id });
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent").length).toBe(before); // Fenster abgelaufen, keine Karenz: kein Versuch

  });

  it("Fenster in der Pause abgelaufen: nach dem Wiedereinschalten bleibt der Platz 2 Stunden, danach regulaer (Platz frei / Absage)", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await pauseAndResume(); // Fenster (vor 1 Minute abgelaufen) ist jetzt bis Wiedereinschalten + 2 h verlaengert
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res).toMatchObject({ released: 0, exhausted: [] });
    expect((await stateOf(g.match.id)).cancelRequestedAt).toBeNull();
    expect((await seatsOf(g.match.id)).some((s) => s.userId === g.root.id)).toBe(true);
    const later = await runSubstitutes({ matchId: g.match.id, now: new Date(Date.now() + 2 * H + 5 * 60_000) }); // Karenz (Einschalten + 2 h) vorbei
    expect(later.exhausted).toContain(g.rootRow.id);
    expect((await stateOf(g.match.id)).cancelRequestedAt).not.toBeNull();
  });

  it("Obergrenze: reicht die Karenz bis Anstoss minus 1 Stunde oder darueber, gilt die bestehende Regel (kein Aufschub)", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await db.update(matches).set({ startsAt: new Date(Date.now() + 2.5 * H) }).where(eq(matches.id, g.match.id)); // Anstoss minus 1 h = in 1,5 h, die Karenz endet in 2 h
    await pauseAndResume();
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.exhausted).toContain(g.rootRow.id);
    expect((await stateOf(g.match.id)).cancelRequestedAt).not.toBeNull();
  });

  it("Wiederabbuchen im verlaengerten Fenster: neue Karte (card_ready) -> ein neuer Versuch", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.root.id)));
    await pauseAndResume();
    const calls = provider.calls.filter((c) => c.method === "createPaymentIntent").length;
    await retryChargesInWindow({ matchId: g.match.id });
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent").length).toBeGreaterThan(calls); // verlaengertes Fenster: neuer Versuch
    const row = (await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.rootRow.id)))[0];
    expect(row.currentAttempt).toBeGreaterThan(1);
  });
});
