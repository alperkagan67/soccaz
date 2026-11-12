import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, paymentCharges, paymentProfiles, stripeEvents, users } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { joinLobby } from "@/server/lobby";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runSubstitutes } from "@/server/payments/substitute";
import { handleStripeWebhook } from "@/server/payments/webhook";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-2a (AC-8): Nachruecker von der Warteliste. Fensterende => der Platz des Zahlungsunfaehigen wird frei (resolution=replaced, Teilnehmer entfernt),
// der Erste der Warteliste (nicht eingeteilt, Karte hinterlegt, nach Beitrittszeit) rueckt nach und wird sofort abgebucht; scheitert er, kommt der Naechste,
// hoechstens 3 gescheiterte Nachruecker je Platz.

let provider: FakeProvider;
beforeAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sb_%"));
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await db.delete(stripeEvents).where(like(stripeEvents.eventId, "evt_sb_%"));
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;
const MIN = 60_000;

async function withCard(userId: string) {
  await db.insert(paymentProfiles).values({ userId, stripeCustomerId: nid("cus_sb"), paymentMethodId: nid("pm_sb") });
}

/**
 * Spiel mit einem Zahlungsunfaehigen `root` (Heimteam, Abbuchung failed, Fenster abgelaufen), einem Mitspieler `mate` (bezahlt) und `waitlist` Wartelistenspielern
 * (nicht eingeteilt, Karte hinterlegt), deren Beitrittszeit in der Reihenfolge der Liste steigt (der Erste war am laengsten dabei).
 */
async function slotGame(opts: { waitlist?: number; windowMs?: number | null } = {}) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const root = await addPlayer(m.match.id, m.home.id, "sbr");
  const mate = await addPlayer(m.match.id, m.home.id, "sbm");
  await withCard(root.id);
  await withCard(mate.id);
  const graceUntil = opts.windowMs === null ? null : new Date(Date.now() + (opts.windowMs ?? -MIN));
  const [rootRow] = await db.insert(paymentCharges).values({ matchId: m.match.id, userId: root.id, amountCents: 800, status: "failed", failureCode: "card_declined", graceUntil, idempotencyKey: `charge:${m.match.id}:${root.id}`, paymentIntentId: nid("pi_sbr") }).returning();
  await db.insert(paymentCharges).values({ matchId: m.match.id, userId: mate.id, amountCents: 800, status: "succeeded", idempotencyKey: `charge:${m.match.id}:${mate.id}`, paymentIntentId: nid("pi_sbm") });
  await db.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, root.id)));
  await db.update(matchParticipants).set({ cardStatus: "charged" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, mate.id)));
  // die beiden Captains sind eingeteilt und haben bezahlt (sonst waere das Spiel nie vollstaendig bezahlt)
  for (const cap of [m.adminA, m.adminB]) {
    await db.insert(paymentCharges).values({ matchId: m.match.id, userId: cap.id, amountCents: 800, status: "succeeded", idempotencyKey: `charge:${m.match.id}:${cap.id}`, paymentIntentId: nid("pi_sbc") });
    await db.update(matchParticipants).set({ cardStatus: "charged" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, cap.id)));
  }
  const waiters = [];
  const base = Date.now() - 3_600_000;
  for (let i = 0; i < (opts.waitlist ?? 0); i++) {
    const w = await addPlayer(m.match.id, m.home.id, `sbw${i}`);
    await withCard(w.id);
    await db.update(matchParticipants).set({ teamId: null, cardStatus: "card_ready", joinedAt: new Date(base + i * 1000) }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, w.id)));
    waiters.push(w);
  }
  return { ...m, root, mate, rootRow, waiters };
}
type G = Awaited<ReturnType<typeof slotGame>>;

const seatOf = async (g: G, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, userId))))[0];
const rowOfUser = async (g: G, userId: string) => (await db.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, g.match.id), eq(paymentCharges.userId, userId))))[0];
const children = (g: G) => db.select().from(paymentCharges).where(eq(paymentCharges.slotOf, g.rootRow.id)).orderBy(asc(paymentCharges.createdAt));
const createCalls = () => provider.calls.filter((c) => c.method === "createPaymentIntent");
const notesFor = (ids: string[]) => db.select().from(notifications).where(inArray(notifications.userId, ids));

describe("Platz frei und Nachruecker (AC-8)", () => {
  it("Fenster abgelaufen: der Platz wird frei, der Erste der Warteliste (nach Beitrittszeit) rueckt nach und wird sofort abgebucht", async () => {
    const g = await slotGame({ waitlist: 3 });
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res).toMatchObject({ released: 1, filled: 1 });

    const root = await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.rootRow.id));
    expect(root[0]).toMatchObject({ resolution: "replaced", slotTeamId: g.home.id });
    expect(await seatOf(g, g.root.id)).toBeUndefined(); // Teilnehmer entfernt

    const first = g.waiters[0];
    const seat = await seatOf(g, first.id);
    expect(seat).toMatchObject({ teamId: g.home.id, cardStatus: "charged" });
    const kids = await children(g);
    expect(kids).toHaveLength(1);
    expect(kids[0]).toMatchObject({ userId: first.id, amountCents: 800, status: "succeeded", slotOf: g.rootRow.id });
    expect((await seatOf(g, g.waiters[1].id)).teamId).toBeNull(); // die uebrige Warteliste bleibt
    expect(createCalls()).toHaveLength(1);
  });

  it("die Reihenfolge ist die Beitrittszeit, nicht die Anlage- oder ID-Reihenfolge", async () => {
    const g = await slotGame({ waitlist: 3 });
    // der Letzte angelegte war am laengsten dabei
    await db.update(matchParticipants).set({ joinedAt: new Date(Date.now() - 10 * 3_600_000) }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.waiters[2].id)));
    await runSubstitutes({ matchId: g.match.id });
    expect((await children(g))[0].userId).toBe(g.waiters[2].id);
  });

  it("Wartelistenspieler ohne Karte, gesperrte und solche mit bestehender Abbuchungszeile werden uebersprungen", async () => {
    const g = await slotGame({ waitlist: 3 });
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.waiters[0].id)));
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, g.waiters[1].id));
    await runSubstitutes({ matchId: g.match.id });
    expect((await children(g))[0].userId).toBe(g.waiters[2].id);
  });

  it("solange das Fenster laeuft oder bei einer Altzeile (grace_until NULL) passiert nichts", async () => {
    const running = await slotGame({ waitlist: 1, windowMs: 60 * MIN });
    const legacy = await slotGame({ waitlist: 1, windowMs: null });
    for (const g of [running, legacy]) {
      expect(await runSubstitutes({ matchId: g.match.id })).toMatchObject({ released: 0, filled: 0 });
      expect((await db.select().from(paymentCharges).where(eq(paymentCharges.id, g.rootRow.id)))[0].resolution).toBeNull();
      expect(await seatOf(g, g.root.id)).toBeDefined();
    }
    expect(createCalls()).toHaveLength(0);
  });

  it("technische Zustaende (kein Kartenfehler) und Spiele mit angeforderter Absage werden nicht angefasst", async () => {
    const tech = await slotGame({ waitlist: 1 });
    await db.update(paymentCharges).set({ failureCode: "idempotency_mismatch" }).where(eq(paymentCharges.id, tech.rootRow.id));
    const cancelling = await slotGame({ waitlist: 1 });
    await db.update(matches).set({ cancelRequestedAt: new Date(), cancelReason: "Test" }).where(eq(matches.id, cancelling.match.id));
    for (const g of [tech, cancelling]) expect(await runSubstitutes({ matchId: g.match.id })).toMatchObject({ released: 0, filled: 0 });
    expect(createCalls()).toHaveLength(0);
  });

  it("keine Warteliste: der Platz wird frei und bleibt als offener Platz gemeldet (Auto-Absage: M3c-2b)", async () => {
    const g = await slotGame({ waitlist: 0 });
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res).toMatchObject({ released: 1, filled: 0 });
    expect(res.exhausted).toContain(g.rootRow.id);
  });
});

describe("Scheitern des Nachrueckers (je Platz hoechstens 3, sofort gezaehlt)", () => {
  it("scheitert der Nachruecker, kommt der Naechste; nach 3 gescheiterten ist der Platz erschoepft und es wird KEIN vierter versucht", async () => {
    const g = await slotGame({ waitlist: 5 });
    for (const w of g.waiters) provider.setChargeOutcome(w.id, "declined");
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await runSubstitutes({ matchId: g.match.id }));
    // nach der Erschoepfung wird das Spiel automatisch abgesagt (M3c-2b): spaetere Laeufe tun nichts mehr
    const kids = await children(g);
    expect(kids).toHaveLength(3);
    expect(kids.every((k) => k.status === "failed" && k.resolution === "replaced")).toBe(true);
    expect(kids.map((k) => k.userId)).toEqual([g.waiters[0].id, g.waiters[1].id, g.waiters[2].id]);
    expect(results.flatMap((x) => x.exhausted)).toContain(g.rootRow.id);
    // die Gescheiterten sind wieder nicht eingeteilt, die Uebrigen unberuehrt
    for (const w of g.waiters.slice(0, 3)) expect((await seatOf(g, w.id)).teamId).toBeNull();
    expect((await seatOf(g, g.waiters[3].id)).teamId).toBeNull();
    expect(createCalls()).toHaveLength(3);
  });

  it("requires_action des Nachrueckers zaehlt sofort als gescheitert (kein 3-D-Secure fuer Nachruecker)", async () => {
    const g = await slotGame({ waitlist: 2 });
    provider.setChargeOutcome(g.waiters[0].id, "requires_action");
    await runSubstitutes({ matchId: g.match.id });
    await runSubstitutes({ matchId: g.match.id });
    const kids = await children(g);
    expect(kids.map((k) => k.userId)).toEqual([g.waiters[0].id, g.waiters[1].id]);
    expect(kids[0]).toMatchObject({ resolution: "replaced" });
    expect(kids[1].status).toBe("succeeded");
  });

  it("dreimal requires_action zaehlt wie dreimal failed: Platz erschoepft, kein vierter Versuch", async () => {
    const g = await slotGame({ waitlist: 5 });
    for (const w of g.waiters) provider.setChargeOutcome(w.id, "requires_action");
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.exhausted).toContain(g.rootRow.id);
    expect(await children(g)).toHaveLength(3);
    expect(createCalls()).toHaveLength(3);
  });

  it("ein frueher gescheiterter Nachruecker, der seine Karte wieder bereit macht, wird fuer DENSELBEN Platz nicht noch einmal gewaehlt (er hat schon eine Abbuchungszeile)", async () => {
    const g = await slotGame({ waitlist: 1 });
    // Zustand nach einem Fehlschlag: Platz frei (replaced), Nachruecker-Zeile gescheitert, der Spieler hat seine Karte wieder bereit gemacht
    await db.update(paymentCharges).set({ resolution: "replaced", slotTeamId: g.home.id }).where(eq(paymentCharges.id, g.rootRow.id));
    await db.delete(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.root.id)));
    await db.insert(paymentCharges).values({ matchId: g.match.id, userId: g.waiters[0].id, amountCents: 800, status: "failed", failureCode: "card_declined", resolution: "replaced", slotOf: g.rootRow.id, idempotencyKey: `charge:${g.match.id}:${g.waiters[0].id}` });
    const res = await runSubstitutes({ matchId: g.match.id });
    expect(res.exhausted).toContain(g.rootRow.id); // niemand mehr uebrig
    expect(await children(g)).toHaveLength(1);
    expect(createCalls()).toHaveLength(0);
  });

  it("Nachruecker ohne Zahlungsmittel scheitert beim Senden (no_payment_method): sofort draussen, der Naechste rueckt nach", async () => {
    const g = await slotGame({ waitlist: 2 });
    await db.update(paymentProfiles).set({ paymentMethodId: null }).where(eq(paymentProfiles.userId, g.waiters[0].id));
    await runSubstitutes({ matchId: g.match.id });
    const kids = await children(g);
    expect(kids[0]).toMatchObject({ userId: g.waiters[0].id, status: "failed", failureCode: "no_payment_method", resolution: "replaced" });
    expect((await seatOf(g, g.waiters[0].id)).teamId).toBeNull();
    expect(kids[1]).toMatchObject({ userId: g.waiters[1].id, status: "succeeded" });
  });

  it("ein Nachruecker im Zustand pending (Ausgang offen) verbraucht keinen Versuch und startet keinen zweiten", async () => {
    const g = await slotGame({ waitlist: 3 });
    provider.setChargeOutcome(g.waiters[0].id, "error"); // Netz weg: Zeile bleibt pending
    await runSubstitutes({ matchId: g.match.id });
    await runSubstitutes({ matchId: g.match.id });
    await runSubstitutes({ matchId: g.match.id });
    const kids = await children(g);
    expect(kids).toHaveLength(1);
    expect(kids[0].status).toBe("pending");
    expect(kids.filter((k) => k.status === "failed")).toHaveLength(0);
  });

  it("parallele Jobs: hoechstens EINE aktive Nachruecker-Zeile je Platz, genau ein Wartelistenspieler rueckt nach", async () => {
    const g = await slotGame({ waitlist: 4 });
    await Promise.all([runSubstitutes({ matchId: g.match.id }), runSubstitutes({ matchId: g.match.id }), runSubstitutes({}), runSubstitutes({ matchId: g.match.id })]);
    const kids = await children(g);
    expect(kids).toHaveLength(1);
    const seated = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.teamId, g.home.id)))).map((p) => p.userId);
    expect(seated.filter((id) => g.waiters.some((w) => w.id === id))).toHaveLength(1);
    expect(createCalls()).toHaveLength(1);
  });

  it("ein Nachruecker scheitert ueber den Webhook (payment_failed): wie oben gezaehlt, nur er wird benachrichtigt, kein Captain", async () => {
    const g = await slotGame({ waitlist: 2 });
    provider.setChargeOutcome(g.waiters[0].id, "processing"); // Ausgang kommt per Webhook
    await runSubstitutes({ matchId: g.match.id });
    const [kid] = await children(g);
    expect(kid.status).toBe("pending");
    const profile = (await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, g.waiters[0].id)))[0];
    const e = provider.signEvent({ id: nid("evt_sb"), type: "payment_intent.payment_failed", object: { id: kid.paymentIntentId ?? "pi_fake_x", amount: 800, currency: "eur", customer: profile.stripeCustomerId, metadata: { matchId: g.match.id, userId: g.waiters[0].id }, last_payment_error: { code: "card_declined" } } });
    await handleStripeWebhook(e.rawBody, e.signature);
    expect((await children(g))[0]).toMatchObject({ status: "failed", resolution: "replaced" });
    expect((await seatOf(g, g.waiters[0].id)).teamId).toBeNull();
    const notes = await notesFor([g.waiters[0].id, g.adminA.id, g.adminB.id]);
    expect(notes.filter((n) => n.userId === g.adminA.id || n.userId === g.adminB.id).some((n) => /fehlgeschlagen|Abbuchung/i.test(n.title + n.body))).toBe(false);
  });
});

describe("Datenschutz und Benachrichtigungen (AC-20)", () => {
  it("der Ersetzte bekommt eine neutrale Nachricht NUR er; Captains nur 'Kader geaendert' ohne Namen und Grund; Dritte nichts", async () => {
    const g = await slotGame({ waitlist: 1 });
    const other = await addPlayer(g.match.id, g.away.id, "sbo");
    await runSubstitutes({ matchId: g.match.id });
    const notes = await notesFor([g.root.id, g.waiters[0].id, g.adminA.id, g.adminB.id, other.id, g.mate.id]);
    const of = (id: string) => notes.filter((n) => n.userId === id);

    expect(of(g.root.id)).toHaveLength(1);
    expect(of(g.root.id)[0].body).toMatch(/Platz wurde vergeben/);
    expect(of(g.root.id)[0].body).toMatch(/nichts abgebucht|nichts mehr abgebucht/);
    expect(of(g.waiters[0].id).some((n) => /nachgerückt/i.test(n.title + n.body))).toBe(true);
    expect(of(g.adminA.id).length).toBeGreaterThan(0); // Captain des betroffenen Teams: Kader geaendert
    expect(of(other.id)).toHaveLength(0);
    expect(of(g.adminB.id)).toHaveLength(0); // Captain des Gegnerteams
    expect(of(g.mate.id)).toHaveLength(0);

    const forThirds = [...of(g.adminA.id), ...of(g.waiters[0].id)].map((n) => n.title + " " + n.body).join(" ");
    expect(forThirds).not.toMatch(/card_declined|abgelehnt|fehlgeschlagen|Abbuchung/i);
    expect(forThirds).not.toContain(g.root.name);
  });
});

describe("Folgen fuer Liste, Beitritt und Abrechnung", () => {
  it("der Ersetzte kann demselben Spiel nicht wieder beitreten (neutrale Meldung)", async () => {
    const g = await slotGame({ waitlist: 1 });
    await runSubstitutes({ matchId: g.match.id });
    await expect(joinLobby(g.root.id, g.match.id)).rejects.toThrow(/Platz wurde vergeben/);
  });

  it("die Abrechnung ignoriert die ersetzte Zeile: sind alle Eingeteilten bezahlt, ist das Spiel abgerechnet", async () => {
    const g = await slotGame({ waitlist: 1 });
    await runSubstitutes({ matchId: g.match.id });
    expect((await db.select().from(matches).where(eq(matches.id, g.match.id)))[0].settledAt).not.toBeNull();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id));
    expect(entries.filter((e) => e.kind === "match_share")).toHaveLength(1); // nur der Nachruecker wurde ueber Stripe abgebucht (die anderen Zeilen legt der Test direkt an)
  });

  it("Struktur: kein Netzaufruf (Senden) innerhalb von db.transaction", async () => {
    let depth = 0;
    const original = db.transaction.bind(db);
    (db as unknown as { transaction: unknown }).transaction = ((fn: never, cfg: never) => {
      depth += 1;
      return (original as (f: never, c: never) => Promise<unknown>)(fn, cfg).finally(() => {
        depth -= 1;
      });
    }) as never;
    provider.inTransaction = () => depth > 0;
    try {
      const g = await slotGame({ waitlist: 2 });
      await runSubstitutes({ matchId: g.match.id });
      expect(createCalls()).toHaveLength(1);
      expect(provider.violations).toEqual([]);
    } finally {
      (db as unknown as { transaction: unknown }).transaction = original;
    }
  });
});
