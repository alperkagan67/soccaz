import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, paymentProfiles, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries, receipts, venues } from "@/db/schema-finance";
import { tournamentPlayers, tournaments } from "@/db/schema-league";
import { trialBalance } from "@/server/ledger";
import { bookChargeFee } from "@/server/payments/charge";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges, runTournamentChargesDue, triggerTournamentChargesInBackground } from "@/server/payments/tournament-charge";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Fuer den Test "Phase A schluckt keine Fehler": lockTournament schlaegt auf Wunsch mit einem unerwarteten Fehler fehl.
const forced = vi.hoisted(() => ({ fail: false }));
vi.mock("@/server/tournaments", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/tournaments")>();
  return { ...orig, lockTournament: (...args: Parameters<typeof orig.lockTournament>) => (forced.fail ? Promise.reject(new Error("unerwartet")) : orig.lockTournament(...args)) };
});

// 012 M5-4 (Review-Fixes): parallele Laeufe, Randfaelle, Sperrreihenfolge des Webhooks, tournament_closed, Gebuehr am Turnier.

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_te_%"));
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCE ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_te_%"));
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Rand-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
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
const giveCard = (userId: string) => db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_te"), paymentMethodId: nid("pm_te") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_te") } });
async function ready(hourlyCents = 8000) {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall, hourlyCents });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  for (const s of squads) for (const p of s.players) await giveCard(p.id);
  for (const s of squads) await setPaidReady(s.captain.id, t.id);
  return { o, t, squads };
}
const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const shares = (tid: string) => db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, tid), eq(ledgerEntries.kind, "tournament_share")));
const piCallsOf = (tid: string) => provider.calls.filter((c) => c.method === "createPaymentIntent" && (c.args as { metadata: { tournamentId?: string } }).metadata.tournamentId === tid);
const auditCount = async (action: string, id: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, id)))).length;

describe("M5-4: parallele Laeufe", () => {
  it("doppelter und paralleler Lauf (3 x runTournamentCharges + Job + Trigger): je Spieler genau eine Zeile, ein PaymentIntent-Aufruf, ein Ledger-Eintrag, ein Beleg, settled_at und Bracket genau einmal", async () => {
    const { t } = await ready();
    await Promise.all([
      runTournamentCharges(t.id, DUE, { requireDue: true }),
      runTournamentCharges(t.id, DUE, { requireDue: true }),
      runTournamentCharges(t.id, DUE, { requireDue: true }),
      runTournamentChargesDue(DUE),
      triggerTournamentChargesInBackground(t.id),
    ]);
    const rows = await rowsOf(t.id);
    expect(rows).toHaveLength(16);
    expect(new Set(rows.map((x) => x.userId)).size).toBe(16);
    expect(piCallsOf(t.id)).toHaveLength(16); // EIN Aufruf je Spieler
    expect(await shares(t.id)).toHaveLength(16);
    expect((await db.select().from(receipts).where(eq(receipts.tournamentId, t.id))).length).toBe(16);
    expect(await auditCount("charge.settled", t.id)).toBe(1);
    expect(await auditCount("tournament.bracket", t.id)).toBe(1);
    expect(await auditCount("charge.created", t.id)).toBe(1);
    expect((await tOf(t.id)).status).toBe("running");
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("M5-4: Randfaelle", () => {
  it("ohne Halle: no_venue; nach der Abbuchung: rows_exist; sehr kleiner Anteil (Hallenkosten 1,60 EUR, Anteil 0,10 EUR) wird als 0,50 EUR abgebucht und das Turnier normal gebucht", async () => {
    const a = await ready();
    await db.update(tournaments).set({ venueId: null }).where(eq(tournaments.id, a.t.id));
    expect(await runTournamentCharges(a.t.id, DUE)).toMatchObject({ reason: "no_venue", created: 0 });

    const b = await ready();
    await runTournamentCharges(b.t.id, DUE);
    expect(await runTournamentCharges(b.t.id, DUE)).toMatchObject({ reason: "rows_exist", created: 0, attempted: 0 });

    const c = await ready(80);
    expect((await tOf(c.t.id)).finalShareCents).toBe(10);
    expect(await runTournamentCharges(c.t.id, DUE)).toMatchObject({ reason: "ready", created: 16, settled: true });
    const rows = await rowsOf(c.t.id);
    expect(rows.every((x) => x.amountCents === 50 && x.status === "succeeded")).toBe(true);
    expect((await shares(c.t.id)).every((e) => e.amountCents === 50)).toBe(true);
    expect((await tOf(c.t.id)).status).toBe("running");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Schalter AUS (Notabschaltung): die Zeilen bleiben pending, nichts wird gesendet, keine Nachricht, kein Alarm; nach dem Wieder-Einschalten wird abgebucht und das Turnier gebucht", async () => {
    const { getRefundAlerts } = await import("@/server/finance");
    const { t, squads } = await ready();
    const fixed = await tOf(t.id);
    for (const s of squads) for (const p of s.players) await db.insert(paymentCharges).values({ tournamentId: t.id, userId: p.id, amountCents: fixed.finalShareCents!, idempotencyKey: `charge:t:${t.id}:${p.id}:${fixed.priceRound}:1` });
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect(await runTournamentCharges(t.id, DUE)).toMatchObject({ reason: "rows_exist", attempted: 0 });
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
    const rows = await rowsOf(t.id);
    expect(rows.every((x) => x.status === "pending" && x.failureCode === null && x.paymentIntentId === null)).toBe(true);
    expect(piCallsOf(t.id)).toHaveLength(0);
    expect((await db.select().from(notifications).where(eq(notifications.title, "Abbuchung fehlgeschlagen"))).filter((n) => rows.some((r) => r.userId === n.userId))).toHaveLength(0);
    const alerts = await getRefundAlerts();
    expect(alerts.tournamentChargeStuck.map((x) => x.id)).not.toContain(t.id);
    // Schalter wieder EIN: das Turnier haengt nicht, die offenen Zeilen werden abgebucht, dann gebucht (Bracket)
    expect(await runTournamentCharges(t.id, DUE)).toMatchObject({ attempted: 16, settled: true });
    expect((await tOf(t.id)).status).toBe("running");
    expect((await shares(t.id)).length).toBe(16);
  });

  it("das Turnier selbst ist nicht mehr offen (abgesagt): eine nie gesendete Zeile endet als tournament_closed OHNE Nachzahlfenster, OHNE Nachricht und ohne Alarm haengt oder Altzeile", async () => {
    const { getRefundAlerts } = await import("@/server/finance");
    const { t, squads } = await ready();
    const victim = squads[0].players[1];
    await db.insert(paymentCharges).values({ tournamentId: t.id, userId: victim.id, amountCents: 1000, idempotencyKey: `charge:t:${t.id}:${victim.id}:1:1` });
    await db.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, t.id));
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id))[0];
    expect(row).toMatchObject({ status: "failed", failureCode: "tournament_closed", graceUntil: null });
    const n = (uid: string) => db.select().from(notifications).where(and(eq(notifications.userId, uid), eq(notifications.title, "Abbuchung fehlgeschlagen")));
    expect(await n(victim.id)).toHaveLength(0);
    expect(await n(squads[0].captain.id)).toHaveLength(0);
    const alerts = await getRefundAlerts();
    expect(alerts.tournamentChargeStuck.map((x) => x.id)).not.toContain(t.id);
    expect(alerts.legacyFailed.map((x) => x.id)).not.toContain(row.id);
  });

  it("Alarm \"Turnier wartet auf Karten\": alle Teams bereit, Frist erreicht, aber keine Abbuchungszeilen (Karte nach Bereit entfernt); nur im Kartenmodell, nicht bei Guthabenturnieren", async () => {
    const { getRefundAlerts, cardAlertsFrom } = await import("@/server/finance");
    const { t, squads } = await ready();
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, squads[1].players[2].id));
    expect(await runTournamentCharges(t.id, DUE)).toMatchObject({ reason: "cards_missing", created: 0 });
    const alerts = await getRefundAlerts(DUE);
    expect(alerts.tournamentWaitsForCards.map((x) => x.id)).toContain(t.id);
    expect(cardAlertsFrom(alerts).map((a) => a.code)).toContain("card:tournament-waits-for-cards");
    expect((await getRefundAlerts(new Date(T0 + 1 * DAY))).tournamentWaitsForCards.map((x) => x.id)).not.toContain(t.id); // vor der Frist kein Alarm
    // Guthabenturnier (Geld im Turnier, paid_cents > 0): kein Alarm, es bleibt im alten Modell
    await db.update(tournamentPlayers).set({ paidCents: 1000 }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, squads[0].captain.id)));
    expect((await getRefundAlerts(DUE)).tournamentWaitsForCards.map((x) => x.id)).not.toContain(t.id);
    await db.update(tournamentPlayers).set({ paidCents: 0 }).where(eq(tournamentPlayers.tournamentId, t.id));
    await setSetting(null, "card_payments_enabled", false);
    try {
      expect((await getRefundAlerts(DUE)).tournamentWaitsForCards).toHaveLength(0); // Schalter AUS: kein Alarm
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
  });

  it("die Stripe-Gebuehr einer Turnier-Abbuchung wird dem Turnier zugeordnet (tournament_id am Ledger-Eintrag)", async () => {
    provider.setFee("*", 25);
    const { t } = await ready();
    await runTournamentCharges(t.id, DUE);
    const fees = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "fee")));
    expect(fees).toHaveLength(16);
    expect(fees.every((e) => e.matchId === null && e.amountCents === 25)).toBe(true);
    expect(await bookChargeFee((await rowsOf(t.id))[0].paymentIntentId!)).toBe("already");
  });

  it("Metadaten mit matchId UND tournamentId werden ignoriert (genau eines von beiden)", async () => {
    const { t, squads } = await ready();
    for (const s of squads) for (const p of s.players) provider.setChargeOutcome(p.id, "processing");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id))[0];
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, row.userId)))[0];
    const e = provider.signEvent({ id: nid("evt_te"), type: "payment_intent.succeeded", object: { id: row.paymentIntentId, amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, matchId: t.id, userId: row.userId } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    expect((await rowsOf(t.id)).find((x) => x.id === row.id)!.status).toBe("pending");
    expect((await shares(t.id)).length).toBe(0);
  });
});

describe("M5-4: Sperrreihenfolge", () => {
  it("Webhook: Turnier VOR Zeile. Haelt jemand die Turniersperre, wartet der Webhook, ohne die Abbuchungszeile zu sperren (NOWAIT auf die Zeile gelingt)", async () => {
    const { t, squads } = await ready();
    for (const s of squads) for (const p of s.players) provider.setChargeOutcome(p.id, "processing");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id))[0];
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, row.userId)))[0];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held!: () => void;
    const heldP = new Promise<void>((r) => (held = r));
    const holder = db.transaction(async (tx) => {
      await tx.select().from(tournaments).where(eq(tournaments.id, t.id)).for("update");
      held();
      await gate;
    });
    await heldP;
    const e = provider.signEvent({ id: nid("evt_te"), type: "payment_intent.succeeded", object: { id: row.paymentIntentId, amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, userId: row.userId } } });
    const hook = handleStripeWebhook(e.rawBody, e.signature); // wartet auf die Turniersperre
    await new Promise((r) => setTimeout(r, 600));
    await expect(db.transaction((tx) => tx.select().from(paymentCharges).where(eq(paymentCharges.id, row.id)).for("update", { noWait: true }))).resolves.toBeDefined();
    release();
    await holder;
    expect((await hook).status).toBe(200);
    expect((await rowsOf(t.id)).find((x) => x.id === row.id)!.status).toBe("succeeded");
  });
});

describe("M5-4: Beanspruchung und Fehlerbehandlung", () => {
  it("SKIP LOCKED: eine gerade von anderer Seite gesperrte Zeile blockiert den Lauf nicht (er ueberspringt sie, der naechste Lauf holt sie nach)", async () => {
    const { t: t2, squads: s2 } = await ready();
    for (const s of s2) for (const p of s.players) provider.setChargeOutcome(p.id, "processing");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held!: () => void;
    const heldP = new Promise<void>((r) => (held = r));
    // Phase A manuell: Zeilen ueber einen ersten Lauf anlegen, dessen Sendeergebnis "processing" ist (Zeilen bleiben pending, PaymentIntent gebunden)
    await runTournamentCharges(t2.id, DUE, { requireDue: true });
    const rows = await rowsOf(t2.id);
    // zwei Zeilen wieder "ungesendet" machen, eine davon sperren
    const [free, locked] = [rows[0], rows[1]];
    await db.update(paymentCharges).set({ paymentIntentId: null, attemptStartedAt: null, updatedAt: new Date() }).where(eq(paymentCharges.id, free.id));
    await db.update(paymentCharges).set({ paymentIntentId: null, attemptStartedAt: null, updatedAt: new Date() }).where(eq(paymentCharges.id, locked.id));
    provider.setChargeOutcome(free.userId, "succeeded");
    const holder = db.transaction(async (tx) => {
      await tx.select().from(paymentCharges).where(eq(paymentCharges.id, locked.id)).for("update");
      held();
      await gate;
    });
    await heldP;
    const t0 = Date.now();
    const run = await Promise.race([runTournamentCharges(t2.id, DUE, { requireDue: true }), new Promise<"blockiert">((r) => setTimeout(() => r("blockiert"), 4000))]);
    expect(run).not.toBe("blockiert"); // ohne SKIP LOCKED wartet der Lauf auf die gesperrte Zeile
    expect(Date.now() - t0).toBeLessThan(3500);
    release();
    await holder;
  });

  it("Phase A schluckt keine Fehler: eine unbekannte Turnier-ID ist not_open, ein unerwarteter Fehler beim Sperren bricht den Lauf ab", async () => {
    expect(await runTournamentCharges("00000000-0000-4000-8000-000000000000", DUE)).toMatchObject({ reason: "not_open", created: 0 });
    forced.fail = true;
    try {
      await expect(runTournamentCharges("00000000-0000-4000-8000-000000000000", DUE)).rejects.toThrow("unerwartet"); // kein DomainError: wird nie verschluckt
    } finally {
      forced.fail = false;
    }
  });

  it("der Job laeuft nur fuer Turniere im Kartenmodell: bei Schalter AUS legt er nichts an und sendet nichts", async () => {
    const { t } = await ready();
    await setSetting(null, "card_payments_enabled", false);
    try {
      const r = await runTournamentChargesDue(DUE);
      expect(r).toEqual({ turniere: 0, created: 0 });
    } finally {
      await setSetting(null, "card_payments_enabled", true);
    }
    expect((await rowsOf(t.id)).length).toBe(0);
    expect(piCallsOf(t.id)).toHaveLength(0);
  });
});

