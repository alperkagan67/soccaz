import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications, paymentCharges, stripeEvents, teamMembers } from "@/db/schema";
import { getRefundAlerts } from "@/server/finance";
import { joinLobby } from "@/server/lobby";
import { settleIfComplete } from "@/server/payments/charge";
import { runCharges } from "@/server/payments/charge-run";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runSubstitutes } from "@/server/payments/substitute";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeUser } from "./helpers";
import { childrenOf, nid, slotGame, withCard, type SlotGame } from "./slot-helpers";

// Review R-T158 / security-reviewer zu M3c-2a: Abrechnung nur mit besetzten Plaetzen, offene PaymentIntents vor dem Freigeben abbrechen, match_closed ist kein Fehlversuch,
// haengende Nachruecker im Alarm, Loeschen des Spiels trotz Selbstreferenz, Beitritt waehrend der Freigabe.

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

const settle = (g: SlotGame) => db.transaction((tx) => settleIfComplete(tx, g.match.id));
const settledAt = async (g: SlotGame) => (await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].settledAt;
const audits = async (g: SlotGame, action: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, g.match.id)))).length;
const rowOf = async (id: string) => (await db.select().from(paymentCharges).where(eq(paymentCharges.id, id)))[0];
const seatOf = async (g: SlotGame, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, userId))))[0];

/** Der Platz des Zahlungsunfaehigen ist vergeben (Zeile replaced, Teilnehmer entfernt), ohne dass ein Nachruecker nachgerueckt ist. */
async function release(g: SlotGame, root = g.root, rootRow = g.rootRow) {
  await db.update(paymentCharges).set({ resolution: "replaced", slotTeamId: g.home.id }).where(eq(paymentCharges.id, rootRow.id));
  await db.delete(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, root.id)));
}
/** Nachruecker-Zeile fuer den Platz `rootRow` mit dem gegebenen Ergebnis; `replaced` markiert einen gescheiterten Nachruecker. */
async function kid(g: SlotGame, status: "succeeded" | "failed" | "pending", rootId = g.rootRow.id, over: Partial<typeof paymentCharges.$inferInsert> = {}) {
  const u = await addPlayer(g.match.id, g.home.id, "skid");
  await withCard(u.id);
  const failed = status === "failed";
  await db.update(matchParticipants).set({ teamId: failed ? null : g.home.id, cardStatus: status === "succeeded" ? "charged" : failed ? "failed" : "charge_pending" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, u.id)));
  const [row] = await db.insert(paymentCharges).values({ matchId: g.match.id, userId: u.id, amountCents: 800, status, slotOf: rootId, resolution: failed ? "replaced" : null, failureCode: failed ? "card_declined" : null, idempotencyKey: `charge:${g.match.id}:${u.id}`, paymentIntentId: status === "pending" ? null : nid("pi_kid"), ...over }).returning();
  return { u, row };
}

describe("Abrechnung nur mit besetzten Plaetzen (security-reviewer 1)", () => {
  it("(a) Platz frei, kein Kandidat, die uebrigen Zeilen sind erfolgreich: NICHT abgerechnet (kein Datum, kein Audit, keine Abrechnungs-Nachricht)", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    await release(g);
    expect(await settle(g)).toBe(false);
    expect(await settledAt(g)).toBeNull();
    expect(await audits(g, "charge.settled")).toBe(0);
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [g.mate.id, g.adminA.id, g.adminB.id]));
    expect(notes.filter((n) => n.title === "Abrechnung")).toHaveLength(0);
  });

  it("(b) umgekehrte Reihenfolge: erst Platz frei, dann zahlen die anderen nach: ebenfalls NICHT abgerechnet", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    const ids = g.payerRows.map((r) => r.id);
    await db.update(paymentCharges).set({ status: "pending" }).where(inArray(paymentCharges.id, ids));
    await release(g);
    for (const id of ids) {
      await db.update(paymentCharges).set({ status: "succeeded" }).where(eq(paymentCharges.id, id));
      expect(await settle(g)).toBe(false);
    }
    expect(await settledAt(g)).toBeNull();
    expect(await audits(g, "charge.settled")).toBe(0);
  });

  it("(c) der Nachruecker zahlt: JETZT abgerechnet, Abrechnung fuer alle Zahler inkl. Nachruecker, keine fuer den Ersetzten, Summe = Anteil x Spielerzahl", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    await release(g);
    const k = await kid(g, "succeeded");
    expect(await settle(g)).toBe(true);
    expect(await settledAt(g)).not.toBeNull();
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, "charge.settled"), eq(auditLog.entityId, g.match.id)));
    expect(a.after).toMatchObject({ payers: 4, totalCents: 3200 });
    const notes = await db.select().from(notifications).where(inArray(notifications.userId, [k.u.id, g.root.id, g.mate.id]));
    expect(notes.filter((n) => n.title === "Abrechnung").map((n) => n.userId).sort()).toEqual([k.u.id, g.mate.id].sort());
  });

  it("(d) gescheiterter Nachruecker + naechster Kandidat zahlt: abgerechnet; Nachruecker gescheitert, niemand mehr: NICHT abgerechnet", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    await release(g);
    await kid(g, "failed");
    expect(await settle(g)).toBe(false);
    await kid(g, "succeeded");
    expect(await settle(g)).toBe(true);
  });

  it("(e) zwei offene Plaetze, nur einer besetzt: NICHT abgerechnet", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    // ein zweiter Zahlungsunfaehiger im Heimteam, ebenfalls ersetzt
    const second = await addPlayer(g.match.id, g.home.id, "sbs");
    await withCard(second.id);
    const [secondRow] = await db.insert(paymentCharges).values({ matchId: g.match.id, userId: second.id, amountCents: 800, status: "failed", failureCode: "card_declined", graceUntil: new Date(Date.now() - 1000), idempotencyKey: `charge:${g.match.id}:${second.id}` }).returning();
    await release(g);
    await release(g, second, secondRow);
    await kid(g, "succeeded", g.rootRow.id); // nur der erste Platz besetzt
    expect(await settle(g)).toBe(false);
    await kid(g, "succeeded", secondRow.id);
    expect(await settle(g)).toBe(true);
  });
});

describe("offener PaymentIntent vor dem Freigeben (security-reviewer 2)", () => {
  async function requiresActionGame(waitlist = 1) {
    const g = await slotGame(provider, { waitlist });
    await db.update(paymentCharges).set({ status: "requires_action", failureCode: "authentication_required" }).where(eq(paymentCharges.id, g.rootRow.id));
    provider.setIntentStatus(g.rootPi, "requires_action", { customerId: g.rootCustomer });
    return g;
  }
  const order = () => provider.calls.map((c) => c.method).filter((m) => m === "cancelPaymentIntent" || m === "createPaymentIntent");

  it("requires_action: der PaymentIntent wird ERST abgebrochen, dann wird der Platz frei und besetzt", async () => {
    const g = await requiresActionGame();
    await runSubstitutes({ matchId: g.match.id });
    expect(order()[0]).toBe("cancelPaymentIntent");
    expect(provider.calls.find((c) => c.method === "cancelPaymentIntent")?.args).toMatchObject({ paymentIntentId: g.rootPi });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ resolution: "replaced", status: "failed" });
    expect((await childrenOf(g))[0].status).toBe("succeeded");
  });

  it("der Abbruch meldet 'schon erfolgreich': gebucht, die Zeile ist bezahlt, der Platz wird NICHT vergeben", async () => {
    const g = await requiresActionGame();
    provider.setCancelOutcome(g.rootPi, "succeeded");
    await runSubstitutes({ matchId: g.match.id });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ status: "succeeded", resolution: null });
    expect(await seatOf(g, g.root.id)).toBeDefined();
    expect(await childrenOf(g)).toHaveLength(0);
    expect(provider.calls.filter((c) => c.method === "createPaymentIntent")).toHaveLength(0);
  });

  it("PaymentIntent noch 'processing': nicht vergeben, naechste Runde; danach (abgeschlossen) wird der Platz vergeben", async () => {
    const g = await requiresActionGame();
    provider.setIntentStatus(g.rootPi, "processing", { customerId: g.rootCustomer });
    await runSubstitutes({ matchId: g.match.id });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ resolution: null });
    expect(await seatOf(g, g.root.id)).toBeDefined();
    provider.setIntentStatus(g.rootPi, "failed", { customerId: g.rootCustomer });
    await runSubstitutes({ matchId: g.match.id });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ resolution: "replaced" });
  });

  it("Abbruch scheitert (Netzfehler): nicht vergeben; die naechste Runde klappt", async () => {
    const g = await requiresActionGame();
    provider.setCancelOutcome(g.rootPi, "error");
    await runSubstitutes({ matchId: g.match.id });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ resolution: null });
    expect(await seatOf(g, g.root.id)).toBeDefined();
    provider.setCancelOutcome(g.rootPi, "canceled");
    await runSubstitutes({ matchId: g.match.id });
    expect(await rowOf(g.rootRow.id)).toMatchObject({ resolution: "replaced" });
  });

  it("ein gescheiterter Nachruecker mit offenem PaymentIntent (requires_action) wird abgebrochen und die Zeile geschlossen", async () => {
    const g = await slotGame(provider, { waitlist: 2 });
    provider.setChargeOutcome(g.waiters[0].id, "requires_action");
    await runSubstitutes({ matchId: g.match.id });
    const kids = await childrenOf(g);
    expect(kids[0]).toMatchObject({ userId: g.waiters[0].id, resolution: "replaced" });
    await runSubstitutes({ matchId: g.match.id }); // zweite Runde: raeumt den offenen PaymentIntent des ersten auf
    expect(provider.calls.some((c) => c.method === "cancelPaymentIntent" && (c.args as { paymentIntentId: string }).paymentIntentId === kids[0].paymentIntentId)).toBe(true);
    expect((await rowOf(kids[0].id)).status).toBe("failed");
  });
});

describe("match_closed ist kein Fehlversuch des Nachrueckers (security-reviewer 4)", () => {
  it("Schalter AUS beim Senden: Zeile geschlossen, Nachruecker bleibt eingeteilt, keine Nachricht 'Nachruecken hat nicht geklappt', kein Versuch gezaehlt", async () => {
    const g = await slotGame(provider, { waitlist: 1 });
    await release(g);
    const k = await kid(g, "pending");
    await setSetting(null, "card_payments_enabled", false);
    await runCharges(g.match.id);
    await setSetting(null, "card_payments_enabled", true);
    expect(await rowOf(k.row.id)).toMatchObject({ status: "failed", failureCode: "match_closed", resolution: null });
    expect((await seatOf(g, k.u.id)).teamId).toBe(g.home.id);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, k.u.id));
    expect(notes.filter((n) => /Nachrücken/.test(n.title))).toHaveLength(0);
    // Review-Fund 4: ein eingeteilter Nachruecker mit geschlossener Zeile besetzt den Platz weiter: bei spaeter wieder AN kein zweiter Kandidat
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.filled).toBe(0);
    expect(res.exhausted).not.toContain(g.rootRow.id);
    expect((await seatOf(g, g.waiters[0].id)).teamId).toBeNull(); // der Wartelistenspieler bleibt auf der Warteliste
    expect((await seatOf(g, k.u.id)).teamId).toBe(g.home.id);
  });

  it("gezaehlt werden nur echte Fehlversuche: drei Zeilen mit match_closed erschoepfen den Platz nicht", async () => {
    const g = await slotGame(provider, { waitlist: 1 });
    await release(g);
    for (let i = 0; i < 3; i++) await kid(g, "failed", g.rootRow.id, { failureCode: "match_closed" });
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.exhausted).not.toContain(g.rootRow.id);
    expect(res.filled).toBe(1);
  });
});

describe("gesperrter Kandidat fuehrt nie zur Auto-Absage (security-reviewer, Fund 2)", () => {
  it("haelt eine andere Transaktion die Teilnehmerzeile des einzigen Kandidaten (z. B. Kartenaenderung), wird die Runde ausgelassen: keine Absage, danach rueckt er nach", async () => {
    const g = await slotGame(provider, { waitlist: 1 });
    let releaseLock!: () => void;
    const held = new Promise<void>((resolve) => (releaseLock = resolve));
    let locked!: () => void;
    const lockedP = new Promise<void>((resolve) => (locked = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.waiters[0].id))).for("update");
      locked();
      await held;
    });
    await lockedP;
    const res = await runSubstitutes({ matchId: g.match.id }); // darf nicht blockieren
    expect(res.filled).toBe(0);
    expect(res.exhausted).toHaveLength(0);
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].cancelRequestedAt).toBeNull();
    releaseLock();
    await holder;
    expect((await runSubstitutes({ matchId: g.match.id })).filled).toBe(1);
  });
});

describe("haengender Nachruecker und Loeschen (security-reviewer 3, Zusatz 3)", () => {
  it("Nachruecker pending mit unknown_outcome blockiert den Platz, steht aber im Admin-Alarm (unclearedCharges), und ein zweiter wird nicht gestartet", async () => {
    const g = await slotGame(provider, { waitlist: 2 });
    await release(g);
    const k = await kid(g, "pending", g.rootRow.id, { failureCode: "unknown_outcome", attemptStartedAt: new Date() });
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.filled).toBe(0);
    expect((await getRefundAlerts()).unclearedCharges.map((a) => a.id)).toContain(k.row.id);
  });

  it("das Spiel loeschen funktioniert trotz Selbstreferenz slot_of (Aufraeumen der Tests, DELETE FROM matches)", async () => {
    const g = await slotGame(provider, { waitlist: 0 });
    await release(g);
    await kid(g, "succeeded");
    await kid(g, "failed");
    expect(await childrenOf(g)).toHaveLength(2);
    await expect(db.delete(matches).where(eq(matches.id, g.match.id))).resolves.toBeDefined();
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).toHaveLength(0);
  });
});

describe("Beitritt waehrend der Freigabe (Zusatz 4)", () => {
  it("Beitritt und Freigabe laufen parallel: kein Verklemmen; der Beitritt wird wegen der Abbuchungszeilen abgelehnt, die Liste bleibt stimmig", async () => {
    const g = await slotGame(provider, { waitlist: 1 });
    const newcomer = await makeUser("snew");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: newcomer.id, role: "player" });
    const [subst, join] = await Promise.all([runSubstitutes({ matchId: g.match.id }), joinLobby(newcomer.id, g.match.id).then(() => "joined", (e: Error) => e.message)]);
    expect(subst.filled).toBe(1);
    expect(join).toMatch(/Abbuchung|gesperrt/);
    expect(await seatOf(g, newcomer.id)).toBeUndefined();
  });
});

describe("R-T183: Auswaertsteam und nicht eingerichtete Konten", () => {
  it("ersetzter Platz im AUSWAERTSteam: der Nachruecker rueckt ins Auswaertsteam, die neutrale Kader-Nachricht geht an den Captain dieses Teams, nicht an den des Heimteams", async () => {
    const g = await slotGame(provider, { waitlist: 1 });
    await db.update(matchParticipants).set({ teamId: g.match.awayTeamId }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.root.id)));
    await runSubstitutes({ matchId: g.match.id });
    const seat = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.waiters[0].id))))[0];
    expect(seat.teamId).toBe(g.match.awayTeamId);
    const rootRow = (await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.rootRow.id)))[0];
    expect(rootRow.slotTeamId).toBe(g.match.awayTeamId);
    const notes = async (id: string) => (await db.select().from(notifications).where(eq(notifications.userId, id))).filter((n) => n.title === "Kader geändert").length;
    expect(await notes(g.adminB.id)).toBe(1); // Captain des Auswaertsteams
    expect(await notes(g.adminA.id)).toBe(0); // nicht der des Heimteams
  });

  it("nicht eingerichtetes Konto (ohne onboarded_at oder ohne age_confirmed_at) ist kein Kandidat: Platz bleibt unbesetzt, kein Stripe-Aufruf", async () => {
    for (const col of ["onboarded_at", "age_confirmed_at"]) {
      const g = await slotGame(provider, { waitlist: 1 });
      await db.execute(sql.raw(`update users set ${col} = null where id = '${g.waiters[0].id}'`));
      const res = await runSubstitutes({ matchId: g.match.id });
      expect(res.filled, col).toBe(0);
      expect(res.exhausted, col).toContain(g.rootRow.id); // kein Kandidat und auch keiner, der nur gerade gehalten wird: der Platz ist erschoepft (zweite Abfrage filtert ebenso)
      const seat = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.waiters[0].id))))[0];
      expect(seat.teamId, col).toBeNull();
      expect(provider.calls.filter((c) => c.method === "createPaymentIntent" && (c.args as { metadata: { userId: string } }).metadata.userId === g.waiters[0].id), col).toHaveLength(0);
    }
  });
});
