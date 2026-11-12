import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches, notifications, paymentRefunds, stripeEvents } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runRefunds } from "@/server/payments/refund";
import { runSubstitutes } from "@/server/payments/substitute";
import { setSetting } from "@/server/settings";
import { cleanup } from "./helpers";
import { slotGame } from "./slot-helpers";

// Vertrag 012, M3c-2b (AC-9): Fenster abgelaufen und kein Nachruecker (keine Warteliste oder 3 Fehlschlaege) => Spiel automatisch abgesagt (System-Absage ohne Akteur und ohne
// Rollenpruefung), alle bereits Abgebuchten per Stripe-Refund voll auf die Karte erstattet, kein Plattform-Ueberschuss, Hauptbuch ausgeglichen.

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
const refundsOf = (matchId: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.matchId, matchId));
const refundCalls = () => provider.calls.filter((c) => c.method === "createRefund");

describe("AC-9: automatische Absage", () => {
  it("keine Warteliste: System-Absage ohne Akteur, alle Abgebuchten voll erstattet (je Spieler der gezahlte Betrag), Spiel abgesagt, Hauptbuch ausgeglichen", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    const before = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id))).filter((e) => e.kind === "match_share");
    expect(before).toHaveLength(3); // Mitspieler + beide Captains wirklich abgebucht

    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.exhausted).toContain(g.rootRow.id);
    const requested = await stateOf(g.match.id);
    expect(requested.cancelRequestedAt).not.toBeNull();
    expect(requested.cancelReason).toMatch(/Nachrücker/);

    await runRefunds();
    const after = await stateOf(g.match.id);
    expect(after.status).toBe("cancelled");
    const refunds = await refundsOf(g.match.id);
    expect(refunds).toHaveLength(3); // nur die Erfolgreichen, nicht der Zahlungsunfaehige
    expect(refunds.every((r) => r.status === "succeeded" && r.amountCents === 800)).toBe(true);
    expect(refundCalls()).toHaveLength(3);
    const booked = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id))).filter((e) => e.kind === "refund");
    expect(booked).toHaveLength(3);
    expect((await trialBalance()).balanced).toBe(true);
    // System ohne Akteur
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, g.match.id));
    const req = audits.find((a) => a.action === "match.cancel_requested");
    expect(req).toBeDefined();
    expect(req!.actorId ?? null).toBeNull();
  });

  it("drei gescheiterte Nachruecker: Auto-Absage mit Erstattung", async () => {
    const g = await slotGame(provider, { waitlist: 4, realPaid: true });
    for (const w of g.waiters) provider.setChargeOutcome(w.id, "declined");
    await runSubstitutes({ matchId: g.match.id });
    await runRefunds();
    expect((await stateOf(g.match.id)).status).toBe("cancelled");
    expect((await refundsOf(g.match.id)).filter((r) => r.status === "succeeded")).toHaveLength(3);
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent")).toHaveLength(3); // kein vierter Versuch
  });

  it("Nachruecker erfolgreich: KEINE Absage", async () => {
    const g = await slotGame(provider, { waitlist: 2, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    expect((await stateOf(g.match.id)).cancelRequestedAt).toBeNull();
    expect(refundCalls()).toHaveLength(0);
  });

  it("solange ein Nachruecker unterwegs ist (pending) oder das Fenster laeuft: KEINE Absage", async () => {
    const pending = await slotGame(provider, { waitlist: 1, realPaid: true });
    provider.setChargeOutcome(pending.waiters[0].id, "error");
    await runSubstitutes({ matchId: pending.match.id });
    expect((await stateOf(pending.match.id)).cancelRequestedAt).toBeNull();
    const running = await slotGame(provider, { waitlist: 0, windowMs: 60 * 60_000, realPaid: true });
    await runSubstitutes({ matchId: running.match.id });
    expect((await stateOf(running.match.id)).cancelRequestedAt).toBeNull();
  });

  it("idempotent: ein zweiter Lauf aendert nichts (eine Anforderung, keine doppelten Erstattungen)", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    await runRefunds();
    await runSubstitutes({ matchId: g.match.id });
    await runRefunds();
    expect(await refundsOf(g.match.id)).toHaveLength(3);
    expect(refundCalls()).toHaveLength(3);
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, g.match.id));
    expect(audits.filter((a) => a.action === "match.cancel_requested")).toHaveLength(1);
  });

  it("Datenschutz (AC-20): die Absage-Nachricht an alle Beteiligten nennt weder Namen noch einen Fehlschlag einer Abbuchung", async () => {
    const g = await slotGame(provider, { waitlist: 0, realPaid: true });
    await runSubstitutes({ matchId: g.match.id });
    await runRefunds();
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.mate.id, g.adminA.id, g.adminB.id]));
    const cancelled = notes.filter((n) => n.type === "match.cancelled");
    expect(cancelled.length).toBeGreaterThan(0);
    const text = cancelled.map((n) => n.title + " " + n.body).join(" ");
    expect(text).not.toMatch(/card_declined|abgelehnt|fehlgeschlagen/i);
    expect(text).not.toContain(g.root.name);
  });
});
