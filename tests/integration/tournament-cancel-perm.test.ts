import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, paymentProfiles, paymentRefunds, teamMembers, users } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { deleteAccount } from "@/server/account";
import { closeTournamentsAtDeadline, cancelTournament, cancelTournamentsAfterWindow, createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges, runTournamentChargesDue } from "@/server/payments/tournament-charge";
import { runTournamentRefunds } from "@/server/payments/tournament-refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { trialBalance } from "@/server/ledger";
import { setSetting } from "@/server/settings";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-5 (Review w4/w2): Absage-Berechtigung (Vorschlagsweg), Schalter AUS zur Frist, Absage eines GEBUCHTEN Turniers (Erstattung je Zeile, Summe 0 je tournament_id, Provisions-Storno), Parallelitaet, Loeschsperre.

let provider: FakeProvider;
let hall = "";
let owner: { id: string };
beforeAll(async () => {
  owner = await makeUser("adm1", "owner"); // Admin 1: es gibt hoechstens einen je Datenbank
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCP ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Berechtigungs-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const DUE = new Date(T0 + 3.5 * DAY);
let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
type Squad = { captain: { id: string }; team: { id: string }; players: { id: string }[] };

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
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcp"), paymentMethodId: nid("pm_tcp") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcp") } });
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const refundsOf = (tid: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

/** Turnier im Kartenmodell, alle bereit; Admin 1 (owner) und Admin 2 (admin) vorhanden. */
async function prepared(commissionPercent = "10") {
  const o = await makeUser("org");
  const admin2 = await makeUser("adm2", "admin");
  await setOrganizer(admin2.id, o.id, true);
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  await db.update(tournaments).set({ commissionPercentSnapshot: commissionPercent }).where(eq(tournaments.id, t.id));
  return { o, admin2, t, squads };
}
/** gebuchtes Turnier: alle 16 abgebucht, Bracket erzeugt, Provision gebucht */
async function booked() {
  const x = await prepared();
  await runTournamentCharges(x.t.id, DUE);
  expect((await tOf(x.t.id)).settledAt).not.toBeNull();
  return x;
}
async function netOf(tid: string, account: "venue_payable" | "commission") {
  const es = await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, tid));
  return es.reduce((s, e) => s + (e.debitAccount === account ? e.amountCents : 0) - (e.creditAccount === account ? e.amountCents : 0), 0);
}

describe("M5-5: Absage-Berechtigung nach der ersten Abbuchung", () => {
  it("Veranstalter und Admin 2 werden abgelehnt (kein Erstattungslauf), Admin 2 hinterlaesst einen Vorschlag; Admin 1 sagt ab: Erstattungszeile je Abbuchung an den Zahler", async () => {
    const { o, admin2, t } = await booked();
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/nur Admin 1/);
    await expect(cancelTournament(admin2.id, t.id)).rejects.toThrow(/nur Admin 1/);
    expect((await tOf(t.id)).status).not.toBe("cancelled");
    expect(await refundsOf(t.id)).toHaveLength(0);
    const proposals = await db.select().from(auditLog).where(and(eq(auditLog.action, "tournament.cancel_proposal"), eq(auditLog.entityId, t.id)));
    expect(proposals.map((p) => p.actorId).sort()).toEqual([admin2.id, o.id].sort()); // Vorschlag gespeichert (Admin 1 entscheidet)
    // Admin 1 darf
    await cancelTournament(owner.id, t.id);
    expect((await tOf(t.id)).status).toBe("cancelled");
    const refunds = await refundsOf(t.id);
    expect(refunds).toHaveLength(16);
    expect(new Set(refunds.map((r) => r.chargeId)).size).toBe(16);
    expect(refunds.every((r) => r.status === "pending" && r.matchId === null && r.amountCents === 1000)).toBe(true);
    const payers = new Map((await rowsOf(t.id)).map((c) => [c.id, c.payerUserId ?? c.userId]));
    expect(refunds.every((r) => r.userId === payers.get(r.chargeId))).toBe(true);
    const n = (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.title, "Turnier abgesagt"))))[0];
    expect(n.body).toContain("Bereits abgebuchte Anteile werden auf die Karte erstattet");
  });

  it("Summe 0 je tournament_id: nach Absage, Versand und Verbuchung ist venue_payable und commission netto 0 (Provisions-Storno ueber cancelTournamentTx), zweiter Absage-Versuch erstattet nicht doppelt", async () => {
    const { t } = await booked();
    expect(await netOf(t.id, "commission")).toBeLessThan(0); // Provision gebucht (Ertrag), Netto Haben
    await cancelTournament(owner.id, t.id);
    await expect(cancelTournament(owner.id, t.id)).rejects.toThrow(/schon beendet oder abgesagt/);
    await runTournamentRefunds(new Date());
    await runTournamentRefunds(new Date()); // zweiter Lauf: nichts doppelt
    const refunds = await refundsOf(t.id);
    expect(refunds.every((r) => r.status === "succeeded")).toBe(true);
    expect(provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === t.id)).toHaveLength(16);
    expect(await netOf(t.id, "venue_payable")).toBe(0);
    expect(await netOf(t.id, "commission")).toBe(0);
  });

  it("Parallelitaet Absage-Job x Fenster-Job x Versandlauf: genau eine Erstattung je Abbuchung", async () => {
    const { t, squads } = await prepared();
    const victim = squads[1].players[2];
    provider.setChargeOutcome(victim.id, "declined");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, row.id));
    await Promise.all([cancelTournamentsAfterWindow(), cancelTournamentsAfterWindow(), closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY))]);
    await Promise.all([runTournamentRefunds(new Date()), runTournamentRefunds(new Date())]);
    const refunds = await refundsOf(t.id);
    expect(refunds).toHaveLength(15);
    expect(new Set(refunds.map((r) => r.chargeId)).size).toBe(15);
    expect(provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === t.id)).toHaveLength(15);
  });
});

describe("M5-5: Schalter AUS zur Frist (Plan 17.2)", () => {
  it("bei Schalter AUS: Frist-Job und Fenster-Job sagen NICHT ab (Turnier bleibt payment); Schalter wieder EIN bucht nach", async () => {
    const { t, squads } = await prepared();
    const victim = squads[2].players[1];
    provider.setChargeOutcome(victim.id, "declined");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, row.id));
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await cancelTournamentsAfterWindow()).toBe(0);
      expect(await closeTournamentsAtDeadline(new Date(T0 + 4.9 * DAY))).toBe(0);
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
    expect((await tOf(t.id)).status).toBe("payment");
    expect(await refundsOf(t.id)).toHaveLength(0);
    // wieder EIN: die Pruefung laeuft weiter (Fenster ist abgelaufen -> Absage wie gehabt)
    expect(await cancelTournamentsAfterWindow()).toBeGreaterThanOrEqual(1);
  });

  it("Turnier ohne Zeilen, alle bereit, Schalter AUS zur Frist: bleibt payment; nach dem Wiedereinschalten bucht der Lauf ab", async () => {
    const { t } = await prepared();
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await closeTournamentsAtDeadline(new Date(T0 + 3.2 * DAY))).toBe(0);
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
    expect((await tOf(t.id)).status).toBe("payment");
    await runTournamentChargesDue(DUE);
    expect((await rowsOf(t.id)).length).toBe(16);
    expect((await tOf(t.id)).settledAt).not.toBeNull();
  });
});

describe("M5-5: Konto loeschen bei abgesagtem Turnier mit offener Erstattung", () => {
  it("eine noch nicht gesendete Erstattung blockiert die Loeschung nicht; die Erstattungszeile bleibt (Zahler-ID anonymisiert, Kunde geloescht)", async () => {
    const { t, squads } = await booked();
    await cancelTournament(owner.id, t.id);
    const member = squads[3].players[2];
    const [before] = await db.select().from(paymentRefunds).where(and(eq(paymentRefunds.tournamentId, t.id), eq(paymentRefunds.userId, member.id)));
    expect(before.attemptStartedAt).toBeNull();
    await deleteAccount(member.id);
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, member.id));
    expect(u.email).toContain("@geloescht.invalid");
    const [after] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, before.id));
    expect(after.status).toBe("pending");
    expect((await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, member.id)))).length).toBe(1);
  });
});

describe("M5-5: Zahlungsstreit VOR der Erstattung (Turnierzweig)", () => {
  it("ist die Abbuchung im Streit, wird ihre Erstattung nie gesendet (Zeile cancelled_dispute); die uebrigen 15 gehen raus; Hauptbuch ausgeglichen", async () => {
    const { t, squads } = await booked();
    const victim = squads[2].players[1];
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    const dp = nid("dp_tcp");
    const obj = { id: dp, amount: row.amountCents, currency: "eur", payment_intent: row.paymentIntentId, charge: "ch_test_1", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 }, balance_transactions: [{ id: nid("txn_tcp"), amount: -row.amountCents, fee: 1500, currency: "eur", reporting_category: "dispute", type: "adjustment" }] };
    const e = provider.signEvent({ id: nid("evt_tcp"), type: "charge.dispute.created", object: obj, created: 1_800_000_000 });
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    await cancelTournament(owner.id, t.id); // Absage NACH dem Streit
    await runTournamentRefunds(new Date());
    const sent = provider.calls.filter((c) => c.method === "createRefund" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === t.id);
    expect(sent).toHaveLength(15);
    expect(sent.some((c) => (c.args as { metadata: { userId?: string } }).metadata.userId === victim.id)).toBe(false);
    const mine = (await refundsOf(t.id)).find((r) => r.chargeId === row.id);
    // bei offenem Streit legt ensureRefundRow die Zeile schon als cancelled_dispute an: nie gesendet, nie doppelt erstattet
    expect(mine).toMatchObject({ status: "cancelled_dispute", refundId: null });
    expect((await trialBalance()).balanced).toBe(true);
  });
});
