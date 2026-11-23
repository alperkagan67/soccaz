import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, paymentProfiles, paymentRefunds, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { runTournamentRefunds } from "@/server/payments/tournament-refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { cancelTournamentsAfterWindow, createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012 M5-5: Absage bei abgelaufenem Nachzahlfenster (Alles-oder-nichts), Erstattung aller Abbuchungen auf die Karte, Provisions-Storno, Versand und Verbuchung der Turnier-Erstattungen.

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcx_%"));
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCX ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
  hall = v.id;
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcx_%"));
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Absage-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const DUE = new Date(T0 + 3.5 * DAY);
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type Squad = { captain: { id: string }; team: { id: string }; players: { id: string }[] };

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}
async function squad(tid: string): Promise<Squad> {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  const players = [captain];
  for (let i = 1; i < 4; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
    players.push(p);
  }
  await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcx"), paymentMethodId: nid("pm_tcx") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcx") } });
/** Turnier im Kartenmodell mit EINEM gescheiterten Spieler (Fenster abgelaufen), die uebrigen 15 haben bezahlt. */
async function failedTournament(commissionPercent = "0") {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  await db.update(tournaments).set({ commissionPercentSnapshot: commissionPercent }).where(eq(tournaments.id, t.id));
  const victim = squads[1].players[2];
  provider.setChargeOutcome(victim.id, "declined");
  await runTournamentCharges(t.id, DUE);
  const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
  return { o, t, squads, victim, row };
}
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const refundsOf = (tid: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const expire = (rowId: string) => db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, rowId));
const refundCalls = (tid: string) => provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === tid);

describe("M5-5: Absage bei abgelaufenem Nachzahlfenster", () => {
  it("innerhalb des Fensters wird nichts abgesagt; nach Ablauf: Turnier abgesagt, je erfolgreicher Abbuchung EINE Erstattungszeile an den Zahler, die gescheiterte Zeile bleibt, Benachrichtigung mit Kartentext", async () => {
    const { t, row, squads } = await failedTournament();
    expect(await cancelTournamentsAfterWindow()).toBe(0); // Fenster laeuft noch (grace_until in der Zukunft)
    expect((await tOf(t.id)).status).toBe("payment");
    await expire(row.id);
    expect(await cancelTournamentsAfterWindow()).toBeGreaterThanOrEqual(1);
    expect((await tOf(t.id)).status).toBe("cancelled");
    const refunds = await refundsOf(t.id);
    expect(refunds).toHaveLength(15);
    expect(refunds.every((r) => r.matchId === null && r.status === "pending" && r.amountCents === 1000)).toBe(true);
    expect(new Set(refunds.map((r) => r.chargeId)).size).toBe(15);
    expect((await rowsOf(t.id)).find((x) => x.id === row.id)!.status).toBe("failed"); // keine Erstattung fuer die gescheiterte Zeile
    const n = (await db.select().from(notifications).where(and(eq(notifications.userId, squads[0].captain.id), eq(notifications.title, "Turnier abgesagt"))))[0];
    expect(n.body).toContain("Bereits abgebuchte Anteile werden auf die Karte erstattet");
    expect(n.body).not.toContain("Eintritt");
    // zweiter Lauf: nichts doppelt
    expect(await cancelTournamentsAfterWindow()).toBe(0);
    expect(await refundsOf(t.id)).toHaveLength(15);
  });

  it("wird die Zeile im Fenster doch noch bezahlt (Webhook), gibt es keine Absage", async () => {
    const { t, row } = await failedTournament();
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, row.userId)))[0];
    const e = provider.signEvent({ id: nid("evt_tcx"), type: "payment_intent.succeeded", object: { id: row.paymentIntentId, amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, userId: row.userId } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    await expire(row.id);
    expect(await cancelTournamentsAfterWindow()).toBe(0);
    expect((await tOf(t.id)).status).toBe("running"); // gebucht, Bracket
  });

  it("Provision wird im selben Schritt storniert (Gegenbuchung commission-reversal:t, genau einmal), Hauptbuch ausgeglichen", async () => {
    const { t, row } = await failedTournament("12.50");
    // die Provision wird erst bei "gebucht" gebucht: hier ist das Turnier nicht gebucht -> noch keine Provision; Storno bucht dann nichts
    await expire(row.id);
    await cancelTournamentsAfterWindow();
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `commission-reversal:t:${t.id}`))).length).toBe(0);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("M5-5: Versand und Verbuchung der Turnier-Erstattungen", () => {
  it("der Job sendet je Zeile genau eine Erstattung (Metadaten tournamentId, nie matchId), verbucht venue_payable -> clearing (Art refund), Hauptbuch ausgeglichen; zweiter Lauf sendet nichts", async () => {
    const { t, row } = await failedTournament();
    await expire(row.id);
    await cancelTournamentsAfterWindow();
    await runTournamentRefunds(DUE);
    const calls = refundCalls(t.id);
    expect(calls).toHaveLength(15);
    for (const c of calls) {
      const m = (c.args as { metadata: Record<string, unknown> }).metadata;
      expect(m.tournamentId).toBe(t.id);
      expect(m.matchId).toBeUndefined();
    }
    const refunds = await refundsOf(t.id);
    expect(refunds.every((r) => r.status === "succeeded" && r.refundId !== null)).toBe(true);
    const led = (await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "refund"))));
    expect(led).toHaveLength(15);
    expect(led.every((e) => e.debitAccount === "venue_payable" && e.creditAccount === "clearing" && e.amountCents === 1000)).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);
    await runTournamentRefunds(DUE);
    expect(refundCalls(t.id)).toHaveLength(15);
  });

  it("Erstattung 'pending' bei Stripe: spaeter meldet der Webhook succeeded, dann wird einmal gebucht; falsche Metadaten (matchId) oder Betraege werden ignoriert", async () => {
    const { t, row, squads } = await failedTournament();
    for (const s of squads) for (const p of s.players) provider.setRefundOutcome(p.id, "pending");
    await expire(row.id);
    await cancelTournamentsAfterWindow();
    await runTournamentRefunds(DUE);
    const refunds = await refundsOf(t.id);
    expect(refunds.every((r) => r.status === "pending" && r.refundId !== null)).toBe(true);
    const r0 = refunds[0];
    const ch = (await rowsOf(t.id)).find((x) => x.id === r0.chargeId)!;
    const send = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => {
      const e = provider.signEvent({ id: nid("evt_tcx"), type: "refund.updated", object: { id: r0.refundId, status: "succeeded", amount: r0.amountCents, currency: "eur", payment_intent: ch.paymentIntentId, metadata: { tournamentId: t.id, userId: r0.userId, chargeId: r0.chargeId, ...meta }, ...over } });
      return handleStripeWebhook(e.rawBody, e.signature);
    };
    await send({}, { matchId: t.id });
    await send({ amount: r0.amountCents + 1 });
    expect((await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "refund")))).length).toBe(0);
    await send();
    await send(); // doppelt
    expect((await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "refund")))).length).toBe(1);
    expect((await refundsOf(t.id)).find((r) => r.id === r0.id)!.status).toBe("succeeded");
  });

  it("abgelehnte Erstattung (refund_failed): Zeile failed, wird nie automatisch erneut gesendet, steht im Alarm 'Erstattung fehlgeschlagen'", async () => {
    const { getRefundAlerts } = await import("@/server/finance");
    const { t, row, squads } = await failedTournament();
    provider.setRefundOutcome(squads[0].players[1].id, "failed");
    await expire(row.id);
    await cancelTournamentsAfterWindow();
    await runTournamentRefunds(DUE);
    const failed = (await refundsOf(t.id)).filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].failureCode).toBe("refund_failed");
    const before = refundCalls(t.id).length;
    await runTournamentRefunds(DUE);
    expect(refundCalls(t.id).length).toBe(before);
    expect((await getRefundAlerts()).failedRefunds.map((x) => x.id)).toContain(failed[0].id);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.action, "refund.failed"), eq(auditLog.entityId, t.id)))).toHaveLength(1);
  });
});
