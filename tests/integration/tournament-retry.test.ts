import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { paymentChargeAttempts, paymentCharges, paymentProfiles, paymentRefunds, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournaments } from "@/db/schema-league";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { retryTournamentChargesInWindow, runTournamentCharges } from "@/server/payments/tournament-charge";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-5: Wiederholen im Nachzahlfenster bei neuer Karte (Turnier), alter Versuch zahlt trotzdem, Alles-oder-nichts bleibt.

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcz_%"));
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCZ ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tcz_%"));
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Retry-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
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
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tcz"), paymentMethodId: nid("pm_tcz") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tcz") } });
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const piCalls = (tid: string) => provider.calls.filter((c) => c.method === "createPaymentIntent" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === tid);

/** Turnier mit EINER abgelehnten Abbuchung (victim), 15 bezahlt; Fenster laeuft noch. */
async function oneDeclined() {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  const victim = squads[2].players[1];
  provider.setChargeOutcome(victim.id, "declined");
  await runTournamentCharges(t.id, DUE);
  const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
  return { o, t, squads, victim, row };
}
/** Der Spieler speichert eine NEUE Karte (Profil nach dem Fehlschlag aktualisiert). */
const newCard = (userId: string) => db.update(paymentProfiles).set({ paymentMethodId: nid("pm_neu"), updatedAt: new Date(Date.now() + 5_000) }).where(eq(paymentProfiles.userId, userId));

describe("M5-5: Wiederholen im Nachzahlfenster (Turnier)", () => {
  it("neue Karte im Fenster: ein neuer Versuch (Schluessel :2, Historie), Erfolg -> alle bezahlt -> gebucht, Bracket; ohne neue Karte kein Versuch", async () => {
    const { t, victim, row } = await oneDeclined();
    expect(row.status).toBe("failed");
    expect(await retryTournamentChargesInWindow({ now: DUE })).toBe(0); // keine neue Karte: kein Dauerbeschuss
    expect(piCalls(t.id)).toHaveLength(16);
    provider.setChargeOutcome(victim.id, "succeeded");
    await newCard(victim.id);
    expect(await retryTournamentChargesInWindow({ userId: victim.id, now: DUE })).toBe(1);
    const after = (await rowsOf(t.id)).find((x) => x.id === row.id)!;
    expect(after).toMatchObject({ status: "succeeded", currentAttempt: 2 });
    expect(after.idempotencyKey).toBe(`charge:t:${t.id}:${victim.id}:${(await tOf(t.id)).priceRound}:2`);
    const hist = await db.select().from(paymentChargeAttempts).where(eq(paymentChargeAttempts.chargeId, row.id));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ attemptNo: 1, status: "failed" });
    const st = await tOf(t.id);
    expect(st.settledAt).not.toBeNull();
    expect(st.status).toBe("running");
    expect(piCalls(t.id)).toHaveLength(17); // genau ein weiterer Aufruf
    expect((await trialBalance()).balanced).toBe(true);
    expect(await retryTournamentChargesInWindow({ now: DUE })).toBe(0); // zweiter Lauf: nichts
  });

  it("nach Ablauf des Fensters kein Versuch mehr (auch mit neuer Karte)", async () => {
    const { victim, row } = await oneDeclined();
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, row.id));
    await newCard(victim.id);
    expect(await retryTournamentChargesInWindow({ userId: victim.id, now: DUE })).toBe(0);
  });

  it("ein ALTER Versuch zahlt nach der Drehung trotzdem: wird gebucht (Historie), der neue Versuch ist dann ein Duplikat und wird voll erstattet; Fehlschlag des alten Versuchs aendert nichts", async () => {
    const { t, victim, row } = await oneDeclined();
    const oldPi = row.paymentIntentId!;
    const profileOld = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, victim.id)))[0];
    provider.setChargeOutcome(victim.id, "processing"); // der neue Versuch bleibt offen
    await newCard(victim.id);
    expect(await retryTournamentChargesInWindow({ userId: victim.id, now: DUE })).toBe(1);
    const mid = (await rowsOf(t.id)).find((x) => x.id === row.id)!;
    expect(mid).toMatchObject({ status: "pending", currentAttempt: 2 });
    const newPi = mid.paymentIntentId!;
    const send = (type: string, pi: string, cust = profileOld.stripeCustomerId) => {
      const e = provider.signEvent({ id: nid("evt_tcz"), type, object: { id: pi, amount: row.amountCents, currency: "eur", customer: cust, metadata: { tournamentId: t.id, userId: victim.id } } });
      return handleStripeWebhook(e.rawBody, e.signature);
    };
    // Fehlschlag des alten Versuchs: nichts
    await send("payment_intent.payment_failed", oldPi);
    expect((await rowsOf(t.id)).find((x) => x.id === row.id)!.status).toBe("pending");
    // Erfolg des alten Versuchs: Geld ist da -> gebucht
    await send("payment_intent.succeeded", oldPi);
    const done = (await rowsOf(t.id)).find((x) => x.id === row.id)!;
    expect(done).toMatchObject({ status: "succeeded", paymentIntentId: oldPi });
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `charge:${oldPi}`))).length).toBe(1);
    // der neue Versuch zahlt ebenfalls: Duplikat -> gebucht UND voll erstattet
    await send("payment_intent.succeeded", newPi, (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, victim.id)))[0].stripeCustomerId);
    expect((await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, row.id))).length).toBe(1);
    expect((await tOf(t.id)).settledAt).not.toBeNull();
    expect((await trialBalance()).balanced).toBe(true);
  });
});
