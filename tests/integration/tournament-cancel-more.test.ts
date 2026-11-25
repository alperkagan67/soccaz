import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles, paymentRefunds, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { reverseTournamentCommission } from "@/server/payments/tournament-cancel";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { runTournamentRefunds } from "@/server/payments/tournament-refund";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { takeOverTournamentShare } from "@/server/tournament-card";
import { cancelTournamentsAfterWindow, createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// Kartenmodell UND Zahlungen EIN (Produktivzustand); "Zahlungen AUS" = Gratis ist in payments-off-free.test.ts abgedeckt.
beforeAll(() => setSetting(null, "payments_enabled", true));
afterAll(() => setSetting(null, "payments_enabled", false));

// 012 M5-5: weitere Faelle der Absage (Provisions-Storno, Uebernahme, strittige Zahlung, offene Zeile, Parallelitaet).

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcy_%"));
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCY ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcy_%"));
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Absage2-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
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
  await registerTeam(captain.id, tid, team.id, await tokenOf(tid));
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
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcy"), paymentMethodId: nid("pm_tcy") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcy") } });
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const refundsOf = (tid: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const expire = (rowId: string) => db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, rowId));

/** Turnier mit 4 Teams, alle Karten, alle bereit; `cards` = Anzahl Karten je Team (ohne den Rest). */
async function prepared(withCards = 4) {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players.slice(0, withCards)) await giveCard(p.id);
  return { o, t, squads };
}
async function readyAll(tid: string, squads: Squad[]) {
  for (const s of squads) await setPaidReady(s.captain.id, tid);
}

describe("M5-5: weitere Faelle der Absage", () => {
  it("Provisions-Storno bei Satz > 0: nach 'gebucht' ist die Provision gebucht; das Storno bucht die Gegenbuchung genau einmal, Hauptbuch ausgeglichen", async () => {
    const { t, squads } = await prepared();
    await readyAll(t.id, squads);
    await db.update(tournaments).set({ commissionPercentSnapshot: "12.50" }).where(eq(tournaments.id, t.id));
    await runTournamentCharges(t.id, DUE);
    const com = await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `commission:t:${t.id}`));
    expect(com).toHaveLength(1);
    expect(await db.transaction((tx) => reverseTournamentCommission(tx, t.id))).toBe(true);
    expect(await db.transaction((tx) => reverseTournamentCommission(tx, t.id))).toBe(false); // zweites Storno bucht nichts
    const rev = await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `commission-reversal:t:${t.id}`));
    expect(rev).toHaveLength(1);
    expect(rev[0].amountCents).toBe(com[0].amountCents);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Uebernahme: die Erstattung geht an den ZAHLER (Uebernehmer), nicht an den Platz", async () => {
    const { t, squads } = await prepared();
    const a = squads[0].players[3];
    const b = squads[0].players[1];
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, a.id)); // A hat keine Karte, B uebernimmt
    await takeOverTournamentShare(b.id, t.id, a.id, true);
    await readyAll(t.id, squads);
    const victim = squads[2].players[1];
    provider.setChargeOutcome(victim.id, "declined");
    await runTournamentCharges(t.id, DUE);
    const rows = await rowsOf(t.id);
    const covered = rows.find((x) => x.userId === a.id)!;
    expect(covered.payerUserId).toBe(b.id);
    await expire(rows.find((x) => x.userId === victim.id)!.id);
    await cancelTournamentsAfterWindow();
    expect((await refundsOf(t.id)).find((r) => r.chargeId === covered.id)!.userId).toBe(b.id);
  });

  it("Parallelitaet Absage x Webhook: entweder gebucht (keine Absage) oder abgesagt mit Erstattung der spaeten Zahlung; nie zwei Erstattungen je Abbuchung", async () => {
    const { t, squads } = await prepared();
    await readyAll(t.id, squads);
    const victim = squads[1].players[2];
    provider.setChargeOutcome(victim.id, "declined");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, victim.id)))[0];
    await expire(row.id);
    const e = provider.signEvent({ id: nid("evt_tcy"), type: "payment_intent.succeeded", object: { id: row.paymentIntentId, amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, userId: victim.id } } });
    await Promise.all([cancelTournamentsAfterWindow(), handleStripeWebhook(e.rawBody, e.signature)]);
    const st = await tOf(t.id);
    const refunds = await refundsOf(t.id);
    if (st.status === "cancelled") expect(refunds.length).toBe(16); // 15 + die spaete Zahlung
    else {
      expect(st.status).toBe("running");
      expect(refunds.length).toBe(0);
    }
    expect(new Set(refunds.map((r) => r.chargeId)).size).toBe(refunds.length);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("offene Zeile mit PaymentIntent (processing): der Job bricht ihn bei Stripe ab (Zeile tournament_cancelled); kommt die Zahlung trotzdem, wird sie sofort voll erstattet und steht im Alarm 'spaete Zahlung'", async () => {
    const { getRefundAlerts, cardAlertsFrom } = await import("@/server/finance");
    const { t, squads } = await prepared();
    await readyAll(t.id, squads);
    const fail = squads[1].players[1];
    const slow = squads[2].players[2];
    provider.setChargeOutcome(fail.id, "declined");
    provider.setChargeOutcome(slow.id, "processing");
    await runTournamentCharges(t.id, DUE);
    const failRow = (await rowsOf(t.id)).find((x) => x.userId === fail.id)!;
    const slowRow = (await rowsOf(t.id)).find((x) => x.userId === slow.id)!;
    expect(slowRow.status).toBe("pending");
    await expire(failRow.id);
    await cancelTournamentsAfterWindow();
    expect(await refundsOf(t.id)).toHaveLength(14); // die offene Zeile hat nichts bezahlt
    await runTournamentRefunds(DUE);
    expect(provider.calls.filter((c) => c.method === "cancelPaymentIntent" && (c.args as { paymentIntentId: string }).paymentIntentId === slowRow.paymentIntentId)).toHaveLength(1);
    expect((await rowsOf(t.id)).find((x) => x.id === slowRow.id)!).toMatchObject({ status: "failed", failureCode: "tournament_cancelled" });
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, slow.id)))[0];
    const e = provider.signEvent({ id: nid("evt_tcy"), type: "payment_intent.succeeded", object: { id: slowRow.paymentIntentId, amount: slowRow.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, userId: slow.id } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    expect((await refundsOf(t.id)).find((r) => r.chargeId === slowRow.id)).toBeDefined();
    expect(cardAlertsFrom(await getRefundAlerts()).map((a) => a.code)).toContain("card:tournament-late-payment");
  });

  it("alle Teams bereit, aber Karten fehlen: der Frist-Job fragt die Karten ab (ein Turnier mit allen Karten wird NICHT abgesagt)", async () => {
    const { t, squads } = await prepared();
    await readyAll(t.id, squads);
    const { closeTournamentsAtDeadline } = await import("@/server/tournaments");
    await closeTournamentsAtDeadline(new Date(T0 + 4 * DAY));
    expect((await tOf(t.id)).status).toBe("payment"); // vollstaendige Karten: wird abgebucht, nicht abgesagt
    const teams = await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
    expect(teams.every((x) => x.paidReadyAt !== null)).toBe(true);
  });
});
