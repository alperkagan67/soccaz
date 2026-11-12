import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, paymentCharges, paymentDisputes, paymentProfiles, paymentRefunds, stripeEvents, teamMembers } from "@/db/schema";
import { ledgerEntries, receipts, venues } from "@/db/schema-finance";
import { tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { trialBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges, runTournamentChargesDue, tournamentChargeAmount } from "@/server/payments/tournament-charge";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { takeOverTournamentShare } from "@/server/tournament-card";
import { closeTournamentsAtDeadline, createTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M5-4: Abbuchung eines Turniers zur Frist (Phasen A bis D), Verbuchung ueber den Turnier-Zweig, Alles-oder-nichts, Bracket erst nach "gebucht".

let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tc_%"));
  const [v] = await db.insert(venues).values({ name: `E2E Halle TCH ${Date.now()}`, city: "Essen", isPartner: true, active: true }).returning();
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
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_tc_%"));
  await cleanup();
});

const T0 = Date.now();
const DAY = 86_400_000;
const base = { name: "Abbuch-Cup", city: "Essen", startsAt: new Date(T0 + 5 * DAY), registrationDeadline: new Date(T0 + 3 * DAY), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const DUE = new Date(T0 + 3.5 * DAY); // nach der Frist (Start minus 48 h), vor dem Start

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

type Squad = { captain: { id: string }; team: { id: string }; players: { id: string }[] };

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

async function squad(tid: string, size = 4): Promise<Squad> {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  const players = [captain];
  for (let i = 1; i < size; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
    players.push(p);
  }
  await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}

async function giveCard(userId: string) {
  await db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_tc"), paymentMethodId: nid("pm_tc") }).onConflictDoUpdate({ target: paymentProfiles.userId, set: { paymentMethodId: nid("pm_tc") } });
}

/** Turnier im Kartenmodell, Status payment (Preis fix 10 EUR), alle Spieler mit Karte, alle Captains bereit: fertig zum Abbuchen. */
async function ready(opts: { teams?: number; cards?: boolean; bereit?: boolean } = {}) {
  const o = await organizer();
  const t = await createTournament(o.id, { ...base, venueId: hall, maxTeams: opts.teams ?? 4 });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id));
  if (opts.cards !== false) for (const s of squads) for (const p of s.players) await giveCard(p.id);
  if (opts.bereit !== false && opts.cards !== false) for (const s of squads) await setPaidReady(s.captain.id, t.id);
  return { o, t, squads };
}

const rowsOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const tOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const shares = (tid: string) => db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, tid), eq(ledgerEntries.kind, "tournament_share")));
const piCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");
const auditCount = async (action: string, id: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, id)))).length;

describe("M5-4: Abbuchung eines Turniers", () => {
  it("zur Frist: jeder Spieler genau einmal (Schluessel je Spieler/Turnier/Preisrunde), Anteil clearing -> venue_payable, Hauptbuch ausgeglichen, gebucht, Beleg je Zahler, danach das Bracket genau einmal", async () => {
    const { t, squads } = await ready();
    const fixed = await tOf(t.id);
    expect(fixed.status).toBe("payment");
    const share = fixed.finalShareCents!;
    expect(share).toBe(1000);
    const r = await runTournamentCharges(t.id, DUE, { requireDue: true });
    expect(r).toMatchObject({ reason: "ready", created: 16, attempted: 16, settled: true });

    expect(piCalls()).toHaveLength(16);
    for (const s of squads) {
      for (const p of s.players) {
        const call = piCalls().find((c) => (c.args as { metadata: { userId: string } }).metadata.userId === p.id)!;
        expect(call.args).toMatchObject({ amountCents: share, idempotencyKey: `charge:t:${t.id}:${p.id}:${fixed.priceRound}:1`, metadata: { tournamentId: t.id, userId: p.id } });
        expect((call.args as { metadata: Record<string, unknown> }).metadata.matchId).toBeUndefined();
      }
    }
    const rows = await rowsOf(t.id);
    expect(rows).toHaveLength(16);
    expect(rows.every((x) => x.matchId === null && x.status === "succeeded" && x.amountCents === share && x.paymentIntentId !== null)).toBe(true);
    const s = await shares(t.id);
    expect(s).toHaveLength(16);
    expect(s.every((e) => e.debitAccount === "clearing" && e.creditAccount === "venue_payable" && e.amountCents === share)).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);
    // keine Veranstalter-Auszahlung, kein Konto tournament, kein Guthaben
    expect((await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "tournament_payout")))).length).toBe(0);

    const after = await tOf(t.id);
    expect(after.settledAt).not.toBeNull();
    expect(after.status).toBe("running");
    expect(after.bracketGeneratedAt).not.toBeNull();
    expect((await db.select().from(receipts).where(eq(receipts.tournamentId, t.id))).length).toBe(16);
    expect(await auditCount("charge.settled", t.id)).toBe(1);
    expect(await auditCount("tournament.bracket", t.id)).toBe(1);

    // zweiter Lauf: nichts doppelt
    const again = await runTournamentCharges(t.id, DUE, { requireDue: true });
    expect(again.created).toBe(0);
    expect(piCalls()).toHaveLength(16);
  });

  it("vor der Frist wird nichts abgebucht (not_due), und der Job laeuft nur fuer faellige Turniere", async () => {
    const { t } = await ready();
    expect(await runTournamentCharges(t.id, new Date(T0 + 1 * DAY), { requireDue: true })).toMatchObject({ reason: "not_due", created: 0 });
    expect(piCalls()).toHaveLength(0);
    expect((await rowsOf(t.id)).length).toBe(0);
    const job = await runTournamentChargesDue(new Date(T0 + 1 * DAY));
    expect(job.created).toBe(0);
    expect(piCalls()).toHaveLength(0);
  });

  it("nicht abbuchbar: Team nicht bereit, Karte fehlt, kein Zugangs-Snapshot, Zugang noetig ohne Zusage, kostenlos", async () => {
    const a = await ready({ bereit: false });
    expect(await runTournamentCharges(a.t.id, DUE)).toMatchObject({ reason: "not_ready", created: 0 });

    const b = await ready();
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, b.squads[1].players[2].id)); // Karte nach "Bereit" weg
    expect(await runTournamentCharges(b.t.id, DUE)).toMatchObject({ reason: "cards_missing", created: 0 });

    const c = await ready();
    await db.update(tournaments).set({ venueAccessRequiredSnapshot: null }).where(eq(tournaments.id, c.t.id));
    expect(await runTournamentCharges(c.t.id, DUE)).toMatchObject({ reason: "not_fixed", created: 0 }); // fail-closed

    const d = await ready();
    await db.update(tournaments).set({ venueAccessRequiredSnapshot: true, venueConfirmedAt: null }).where(eq(tournaments.id, d.t.id));
    expect(await runTournamentCharges(d.t.id, DUE)).toMatchObject({ reason: "no_zusage", created: 0 });
    await db.update(tournaments).set({ venueConfirmedAt: new Date() }).where(eq(tournaments.id, d.t.id));
    expect(await runTournamentCharges(d.t.id, DUE)).toMatchObject({ reason: "ready", created: 16, settled: true });

    expect(tournamentChargeAmount(0)).toBeNull();
    expect(tournamentChargeAmount(30)).toBe(50); // Mindestbetrag 0,50 EUR (AC-19)
    expect(piCalls().length).toBe(16);
  });

  it("Anteil uebernehmen: der Zahler ist B (Kunde von B, Metadaten Platz A); hat A inzwischen eine eigene Karte, zahlt A selbst (validCoversOf, nicht die Rohspalte)", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const s1 = await squad(t.id);
    const others = [await squad(t.id), await squad(t.id), await squad(t.id)];
    for (const p of [...s1.players.slice(0, 3), ...others.flatMap((s) => s.players)]) await giveCard(p.id);
    const a = s1.players[3];
    const b = s1.players[1];
    await takeOverTournamentShare(b.id, t.id, a.id, true);
    for (const s of [s1, ...others]) await setPaidReady(s.captain.id, t.id);
    // nach der Uebernahme bekommt A doch eine eigene Karte, ein ANDERER Platz (C) bleibt uebernommen
    const c = s1.players[2];
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, c.id)); // C ohne Karte ...
    await db.update(tournamentPlayers).set({ coveredByUserId: s1.captain.id, coverMandateText: "cover.mandate.v1.entwurf", coverAcceptedAt: new Date() }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, c.id)));
    await giveCard(a.id); // ... A hat jetzt eine Karte, die Uebernahme ist ungueltig
    const r = await runTournamentCharges(t.id, DUE);
    expect(r).toMatchObject({ reason: "ready", created: 16 });
    const rows = await rowsOf(t.id);
    expect(rows.find((x) => x.userId === a.id)!.payerUserId).toBeNull(); // A zahlt selbst
    expect(rows.find((x) => x.userId === c.id)!.payerUserId).toBe(s1.captain.id); // C bleibt uebernommen: der Captain zahlt
    const callC = piCalls().find((x) => (x.args as { metadata: { userId: string } }).metadata.userId === c.id)!.args as { customerId: string };
    const capProfile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, s1.captain.id)))[0];
    expect(callC.customerId).toBe(capProfile.stripeCustomerId);
  });

  it("Alles-oder-nichts: scheitert eine Abbuchung, bleibt der Rest bestehen, das Turnier ist NICHT gebucht, kein Bracket, Nachzahlfenster gesetzt, Benachrichtigung an Betroffenen und Captain (nie den Veranstalter)", async () => {
    const { o, t, squads } = await ready();
    const victim = squads[2].players[2];
    provider.setChargeOutcome(victim.id, "declined");
    const r = await runTournamentCharges(t.id, DUE);
    expect(r).toMatchObject({ created: 16, attempted: 16, settled: false });
    const rows = await rowsOf(t.id);
    expect(rows.filter((x) => x.status === "succeeded")).toHaveLength(15);
    const failed = rows.find((x) => x.userId === victim.id)!;
    expect(failed).toMatchObject({ status: "failed", failureCode: "card_declined" });
    expect(failed.graceUntil).not.toBeNull();
    const st = await tOf(t.id);
    expect(st.settledAt).toBeNull();
    expect(st.bracketGeneratedAt).toBeNull();
    expect(st.status).toBe("payment");
    expect((await shares(t.id)).length).toBe(15);
    const to = async (uid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, uid), eq(notifications.title, "Abbuchung fehlgeschlagen")))).length;
    expect(await to(victim.id)).toBe(1);
    expect(await to(squads[2].captain.id)).toBe(1);
    expect(await to(o.id)).toBe(0);
    // ein zweiter Lauf sendet die gescheiterte Zeile NICHT erneut (Wiederholen im Fenster: M5-5)
    const before = piCalls().length;
    await runTournamentCharges(t.id, DUE);
    expect(piCalls().length).toBe(before);
  });

  it("Frist-Job: ein Turnier mit laufender oder faelliger Abbuchung faellt nicht wegen der Frist aus; ohne Zusage schon (Z4)", async () => {
    const a = await ready();
    await closeTournamentsAtDeadline(new Date(T0 + 4 * DAY)); // alles bereit: wird abgebucht, nicht abgesagt (andere Turniere der Datei duerfen ausfallen)
    expect((await tOf(a.t.id)).status).toBe("payment");
    await runTournamentCharges(a.t.id, DUE, { requireDue: true });
    expect((await tOf(a.t.id)).status).toBe("running");

    const b = await ready();
    await db.update(tournaments).set({ venueAccessRequiredSnapshot: true, venueConfirmedAt: null }).where(eq(tournaments.id, b.t.id));
    const cancelled = await closeTournamentsAtDeadline(new Date(T0 + 4 * DAY));
    expect(cancelled).toBeGreaterThanOrEqual(1);
    expect((await tOf(b.t.id)).status).toBe("cancelled"); // Z4: ohne Zusage zur Frist faellt das Turnier aus, nichts wurde abgebucht
    expect((await rowsOf(b.t.id)).length).toBe(0);
  });

  it("Webhook mit Turnier-Metadaten verbucht dieselbe Zeile (processing -> succeeded): einmal, doppelt eingespielt nichts; falsche Metadaten oder Betraege werden ignoriert", async () => {
    const { t, squads } = await ready();
    for (const s of squads) for (const p of s.players) provider.setChargeOutcome(p.id, "processing");
    await runTournamentCharges(t.id, DUE);
    const rows = await rowsOf(t.id);
    expect(rows.every((x) => x.status === "pending" && x.paymentIntentId !== null)).toBe(true);
    expect((await tOf(t.id)).settledAt).toBeNull();
    const profiles = await db.select().from(paymentProfiles);
    const cust = (uid: string) => profiles.find((p) => p.userId === uid)!.stripeCustomerId;
    const send = (x: (typeof rows)[number], over: Record<string, unknown> = {}) => {
      const e = provider.signEvent({ id: nid("evt_tc"), type: "payment_intent.succeeded", object: { id: x.paymentIntentId, amount: x.amountCents, currency: "eur", customer: cust(x.userId), metadata: { tournamentId: t.id, userId: x.userId }, ...over } });
      return handleStripeWebhook(e.rawBody, e.signature);
    };
    // falsche Metadaten / falscher Betrag: nichts gebucht
    await send(rows[0], { metadata: { tournamentId: t.id, userId: rows[1].userId } });
    await send(rows[0], { amount: rows[0].amountCents + 1 });
    expect((await shares(t.id)).length).toBe(0);
    for (const x of rows) expect((await send(x)).status).toBe(200);
    expect((await shares(t.id)).length).toBe(16);
    expect((await tOf(t.id)).status).toBe("running");
    for (const x of rows) await send(x); // erneut: nichts doppelt
    expect((await shares(t.id)).length).toBe(16);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("zweiter erfolgreicher PaymentIntent zur selben Zeile: gebucht UND eine volle Erstattungszeile fuer das Turnier (tournament_id, match_id leer); keine stille Behaltung", async () => {
    const { t, squads } = await ready();
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id)).find((x) => x.userId === squads[0].players[1].id)!;
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, row.userId)))[0];
    const e = provider.signEvent({ id: nid("evt_tc"), type: "payment_intent.succeeded", object: { id: "pi_zweiter_" + nid("x"), amount: row.amountCents, currency: "eur", customer: profile.stripeCustomerId, metadata: { tournamentId: t.id, userId: row.userId } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    const refunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, t.id));
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ matchId: null, chargeId: row.id, amountCents: row.amountCents, status: "pending" });
    expect(await auditCount("charge.duplicate_success", t.id)).toBe(1);
  });

  it("Provision aus dem beim Fixieren eingefrorenen Satz: venue_payable -> commission genau einmal (Basis: Hallenkosten, abgerundet); Satz 0 bucht nichts; Hauptbuch ausgeglichen", async () => {
    const { t } = await ready();
    await db.update(tournaments).set({ commissionPercentSnapshot: "12.50" }).where(eq(tournaments.id, t.id));
    await runTournamentCharges(t.id, DUE);
    const com = await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, t.id), eq(ledgerEntries.kind, "commission")));
    expect(com).toHaveLength(1);
    expect(com[0]).toMatchObject({ debitAccount: "venue_payable", creditAccount: "commission", amountCents: 2000, idempotencyKey: `commission:t:${t.id}` }); // 12,5 % von 160 EUR
    expect((await trialBalance()).balanced).toBe(true);
    const zero = await ready();
    await runTournamentCharges(zero.t.id, DUE); // Snapshot 0 (Attrappe bis 009 M2f)
    expect((await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, zero.t.id), eq(ledgerEntries.kind, "commission")))).length).toBe(0);
  });
});


describe("M5-4: Alarme fuer Turniere (Admin-Finanzseite)", () => {
  it("eine offene Turnier-Erstattung und ein haengendes Turnier (gescheiterte Abbuchung, Fenster abgelaufen) erscheinen in der Alarmliste", async () => {
    const { getRefundAlerts, cardAlertsFrom } = await import("@/server/finance");
    const { t, squads } = await ready();
    const victim = squads[0].players[1];
    provider.setChargeOutcome(victim.id, "declined");
    await runTournamentCharges(t.id, DUE);
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    await db.update(paymentCharges).set({ graceUntil: new Date(Date.now() - 3_600_000) }).where(eq(paymentCharges.id, row.id)); // Fenster abgelaufen
    // eine Erstattungszeile des Turniers (so entsteht sie bei einem zweiten erfolgreichen PaymentIntent)
    const ok = (await rowsOf(t.id)).find((x) => x.status === "succeeded")!;
    await db.insert(paymentRefunds).values({ chargeId: ok.id, tournamentId: t.id, userId: ok.userId, amountCents: ok.amountCents, idempotencyKey: `tc-alarm:${t.id}` });
    const alerts = await getRefundAlerts();
    expect(alerts.tournamentChargeStuck.map((x) => x.id)).toContain(t.id);
    expect(alerts.tournamentRefundsOpen.length).toBeGreaterThanOrEqual(1);
    const codes = cardAlertsFrom(alerts).map((a) => a.code);
    expect(codes).toContain("card:tournament-charge-stuck");
    expect(codes).toContain("card:tournament-refund-open");
  });
});

describe("M5-4: Zahlungsstreit zu einer Turnier-Abbuchung (Webhook-Zweig statt 500)", () => {
  it("der Streit wird dem Turnier zugeordnet (tournament_id, match_id leer), der Abzug gebucht (Konto chargeback, tournament_id), nichts bricht; eine ungesendete Erstattung der strittigen Zahlung endet als cancelled_dispute", async () => {
    const { t, squads } = await ready();
    await runTournamentCharges(t.id, DUE);
    const victim = squads[1].players[1];
    const row = (await rowsOf(t.id)).find((x) => x.userId === victim.id)!;
    await db.insert(paymentRefunds).values({ chargeId: row.id, tournamentId: t.id, userId: victim.id, amountCents: row.amountCents, idempotencyKey: `tc-dp:${t.id}` }); // Erstattung (z. B. spaeter Absage) noch ungesendet
    const dp = nid("dp_test");
    const txn = nid("txn_test");
    const obj = { id: dp, amount: row.amountCents, currency: "eur", payment_intent: row.paymentIntentId, charge: "ch_test_1", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86400 }, balance_transactions: [{ id: txn, amount: -row.amountCents, fee: 1500, currency: "eur", reporting_category: "dispute", type: "adjustment" }] };
    const e = provider.signEvent({ id: nid("evt_tc"), type: "charge.dispute.created", object: obj, created: 1_800_000_000 });
    expect((await handleStripeWebhook(e.rawBody, e.signature)).status).toBe(200);
    const d = (await db.select().from(paymentDisputes).where(eq(paymentDisputes.disputeId, dp)))[0];
    expect(d).toMatchObject({ tournamentId: t.id, matchId: null, chargeId: row.id, payerUserId: victim.id, amountCents: row.amountCents });
    const l = await db.select().from(ledgerEntries).where(like(ledgerEntries.idempotencyKey, `dispute:${dp}:%`));
    expect(l.length).toBeGreaterThanOrEqual(1);
    expect(l.every((x) => x.tournamentId === t.id)).toBe(true);
    expect(l.find((x) => x.kind === "chargeback")).toMatchObject({ debitAccount: "chargeback", creditAccount: "clearing", amountCents: row.amountCents });
    const refund = (await db.select().from(paymentRefunds).where(eq(paymentRefunds.chargeId, row.id)))[0];
    expect(refund.status).toBe("cancelled_dispute");
    expect((await trialBalance()).balanced).toBe(true);
  });
});

