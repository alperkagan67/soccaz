import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentProfiles } from "@/db/schema";
import { ledgerEntries, matchCommissions, venues } from "@/db/schema-finance";
import { bookCommission, reverseCommission, setVenueCommission } from "@/server/commission";
import { trialBalance } from "@/server/ledger";
import { runCharges } from "@/server/payments/charge-run";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { adminCancelMatch } from "@/server/payments/refund";
import { setSetting } from "@/server/settings";
import { recordExpense } from "@/server/booking";
import { getAlerts, manualRefund } from "@/server/finance";
import { creditWallet, walletBalance } from "@/server/ledger";
import { payShare } from "@/server/lobby";
import { createPrivateGame } from "@/server/privategame";
import { createVenue } from "@/server/venues";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 009 M2 (Entscheide t9: S1 Variante A, P1 kumulierbar, P2/P6 Hallenmiete, P3 Bonus bleibt, P4 ab Einführung, P7 Absage storniert ganz).
// Die Server-Aktion läuft mit der ECHTEN Sitzungsprüfung; nur die Anmeldung und die Weiterleitung sind ersetzt.
let currentUserId = "";
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: currentUserId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
import { setVenueCommissionAction } from "@/server/admin-finance-actions";

let provider: FakeProvider;
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
  await cleanup();
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${++seq}`;

async function venue(o: { percent?: string; bonus?: boolean } = {}) {
  const [v] = await db.insert(venues).values({ name: `Prov Halle ${nid("v")}`, city: "Essen", source: "manual", commissionPercent: o.percent ?? "10", commissionBonusEnabled: o.bonus ?? false }).returning();
  return v;
}
/** Ein Spiel im Provisionsmodell an einer Halle (Hallenmiete = costCents). */
async function commissionMatch(venueId: string, costCents = 8000, model: "legacy" | "commission" = "commission") {
  const m = await makeMatch({ hoursAhead: 72, priceCents: costCents, costCents, ledgerModel: model });
  await db.update(matches).set({ venueId }).where(eq(matches.id, m.match.id));
  return (await db.select().from(matches).where(eq(matches.id, m.match.id)))[0];
}
const book = (m: typeof matches.$inferSelect) => db.transaction((tx) => bookCommission(tx, m));
const entries = (matchId: string) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, matchId));
const bonusEntries = async (venueId: string) => (await db.select().from(ledgerEntries)).filter((e) => e.idempotencyKey.startsWith(`bonus:${venueId}:`));

describe("Provision je Spiel (AC-3)", () => {
  it("Hallenmiete 8000 bei 10 %: 800 venue_payable -> commission, Schnappschuss, Hauptbuch ausgeglichen, zweiter Aufruf bucht nichts", async () => {
    const v = await venue();
    const m = await commissionMatch(v.id, 8000);
    expect((await book(m)).booked).toBe(true);
    const e = await entries(m.id);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ debitAccount: "venue_payable", creditAccount: "commission", amountCents: 800, kind: "commission", idempotencyKey: `commission:${m.id}` });
    const [mc] = await db.select().from(matchCommissions).where(eq(matchCommissions.matchId, m.id));
    expect(mc).toMatchObject({ venueId: v.id, baseCents: 8000, commissionCents: 800 });
    expect(Number(mc.ratePercent)).toBe(10);
    expect((await book(m)).booked).toBe(false);
    expect(await entries(m.id)).toHaveLength(1);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("abgerundet: 1001 Cent bei 10,5 % = 105 (nie mehr als vereinbart); Satz 0 bucht nichts, die Zeile bleibt", async () => {
    const v = await venue({ percent: "10.50" });
    const m = await commissionMatch(v.id, 1001);
    await book(m);
    expect((await entries(m.id))[0].amountCents).toBe(105);
    const v0 = await venue({ percent: "0" });
    const m0 = await commissionMatch(v0.id, 5000);
    await book(m0);
    expect(await entries(m0.id)).toHaveLength(0);
    expect((await db.select().from(matchCommissions).where(eq(matchCommissions.matchId, m0.id)))[0].commissionCents).toBe(0);
  });

  it("Altspiel (legacy), Spiel ohne Halle und ohne Hallenmiete: keine Provision (Entscheid P4)", async () => {
    const v = await venue();
    expect((await book(await commissionMatch(v.id, 8000, "legacy"))).booked).toBe(false);
    const noVenue = await commissionMatch(v.id, 8000);
    await db.update(matches).set({ venueId: null }).where(eq(matches.id, noVenue.id));
    expect((await book((await db.select().from(matches).where(eq(matches.id, noVenue.id)))[0])).booked).toBe(false);
    const noCost = await commissionMatch(v.id, 8000);
    await db.update(matches).set({ costCents: null }).where(eq(matches.id, noCost.id));
    expect((await book((await db.select().from(matches).where(eq(matches.id, noCost.id)))[0])).booked).toBe(false);
  });

  it("Satzänderung wirkt nur auf künftige Spiele: der Schnappschuss des gebuchten Spiels bleibt", async () => {
    const v = await venue();
    const a = await commissionMatch(v.id, 8000);
    await book(a);
    await db.update(venues).set({ commissionPercent: "20" }).where(eq(venues.id, v.id));
    const b = await commissionMatch(v.id, 8000);
    await book(b);
    expect((await entries(a.id))[0].amountCents).toBe(800);
    expect((await entries(b.id))[0].amountCents).toBe(1600);
    expect(Number((await db.select().from(matchCommissions).where(eq(matchCommissions.matchId, a.id)))[0].ratePercent)).toBe(10);
  });

  it("match_commissions ist nur anhängend: UPDATE und DELETE werden abgelehnt", async () => {
    const v = await venue();
    const m = await commissionMatch(v.id, 8000);
    await book(m);
    await expect(db.update(matchCommissions).set({ commissionCents: 1 }).where(eq(matchCommissions.matchId, m.id))).rejects.toThrow();
    await expect(db.delete(matchCommissions).where(eq(matchCommissions.matchId, m.id))).rejects.toThrow();
  });
});

describe("10er-Bonus (AC-4): kumulierbar mit dem Prozentsatz, Hallenmiete des 10. Spiels", () => {
  it("das 10. gebuchte Spiel löst die Hallenmiete DIESES Spiels aus (zusätzlich zur Provision), das 11. nicht, das 20. den zweiten", async () => {
    const v = await venue({ bonus: true });
    const games = [];
    for (let i = 1; i <= 20; i++) {
      const m = await commissionMatch(v.id, i === 10 ? 9000 : i === 20 ? 7000 : 8000);
      await book(m);
      games.push(m);
      if (i === 9) expect(await bonusEntries(v.id)).toHaveLength(0);
      if (i === 10) {
        const b = await bonusEntries(v.id);
        expect(b).toHaveLength(1);
        expect(b[0]).toMatchObject({ amountCents: 9000, kind: "commission_bonus", idempotencyKey: `bonus:${v.id}:1`, debitAccount: "venue_payable", creditAccount: "commission" });
        expect((await entries(m.id)).map((e) => e.kind).sort()).toEqual(["commission", "commission_bonus"]); // Prozent UND Bonus (P1)
      }
      if (i === 11) expect(await bonusEntries(v.id)).toHaveLength(1);
    }
    const b = await bonusEntries(v.id);
    expect(b).toHaveLength(2);
    expect(b.find((e) => e.idempotencyKey.endsWith(":2"))?.amountCents).toBe(7000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("ohne gesetzten Bonus-Schalter gibt es keinen Bonus", async () => {
    const v = await venue({ bonus: false });
    for (let i = 0; i < 10; i++) await book(await commissionMatch(v.id, 8000));
    expect(await bonusEntries(v.id)).toHaveLength(0);
  });

  it("abgesagte Spiele zählen nicht", async () => {
    const v = await venue({ bonus: true });
    const first = await commissionMatch(v.id, 8000);
    await book(first);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, first.id));
    for (let i = 0; i < 9; i++) await book(await commissionMatch(v.id, 8000)); // 9 gezählte + 1 abgesagtes
    expect(await bonusEntries(v.id)).toHaveLength(0);
    await book(await commissionMatch(v.id, 8000)); // das 10. gezählte
    expect(await bonusEntries(v.id)).toHaveLength(1);
  });

  it("Rennen: ein offenes Spiel (9.) blockiert das 10.: die Hallenzeile wird vor dem Zählen gesperrt, genau ein Bonus", async () => {
    const v = await venue({ bonus: true });
    for (let i = 0; i < 8; i++) await book(await commissionMatch(v.id, 8000));
    const a = await commissionMatch(v.id, 8000);
    const b = await commissionMatch(v.id, 8000);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    // Transaktion A bucht das 9. Spiel und bleibt OFFEN; B (das 10.) startet währenddessen. Mit der Hallensperre wartet B auf A und zählt dann 10;
    // ohne sie zählen beide 9 (A hat noch nicht committet) und der Bonus geht verloren.
    const txA = db.transaction(async (tx) => {
      await bookCommission(tx, a);
      await gate;
    });
    await sleep(400);
    const txB = db.transaction((tx) => bookCommission(tx, b));
    await sleep(600);
    release();
    await Promise.all([txA, txB]);
    expect(await bonusEntries(v.id)).toHaveLength(1);
  });

  it("ein ausgelöster Bonus bleibt bei späterer Absage (P3); die Provision wird GANZ storniert, genau einmal (P7)", async () => {
    const v = await venue({ bonus: true });
    let tenth!: typeof matches.$inferSelect;
    for (let i = 0; i < 10; i++) {
      tenth = await commissionMatch(v.id, 8000);
      await book(tenth);
    }
    expect(await bonusEntries(v.id)).toHaveLength(1);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, tenth.id));
    expect(await db.transaction((tx) => reverseCommission(tx, tenth.id))).toBe(true);
    expect(await db.transaction((tx) => reverseCommission(tx, tenth.id))).toBe(false); // zweites Storno bucht nichts
    const e = await entries(tenth.id);
    expect(e.filter((x) => x.idempotencyKey === `commission-reversal:${tenth.id}`)).toHaveLength(1);
    expect(e.find((x) => x.idempotencyKey === `commission-reversal:${tenth.id}`)).toMatchObject({ debitAccount: "commission", creditAccount: "venue_payable", amountCents: 800 });
    expect(await bonusEntries(v.id)).toHaveLength(1); // Bonus bleibt
    expect((await trialBalance()).balanced).toBe(true);
  });
});

/** Kartenspiel im Provisionsmodell, abbuchungsbereit (wie card-refund.test.ts). */
async function game(venueId: string, price = 6000, n = 6) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: price, costCents: price, ledgerModel: "commission" });
  await db.update(matches).set({ venueId }).where(eq(matches.id, m.match.id));
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await db.insert(paymentProfiles).values({ userId: p.id, stripeCustomerId: nid("cus_pv"), paymentMethodId: nid("pm_pv") });
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, m.match.id));
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: Math.ceil(price / n), status: "confirmed" }).where(eq(matches.id, m.match.id));
  const admin = await makeUser("adm", "admin");
  return { ...m, admin, price, n };
}

describe("Gesamtablauf im Provisionsmodell: keine Doppelzählung (S1 Variante A, AC-10)", () => {
  it("Abbuchung auf venue_payable (nie revenue), Provision beim Abschluss, Absage erstattet aus venue_payable und storniert die Provision: alles netto 0", async () => {
    const v = await venue({ percent: "10" });
    const g = await game(v.id);
    await runCharges(g.match.id);
    const afterCharge = await entries(g.match.id);
    expect(afterCharge.filter((e) => e.kind === "match_share").every((e) => e.creditAccount === "venue_payable")).toBe(true);
    expect(afterCharge.some((e) => e.creditAccount === "revenue" || e.debitAccount === "revenue")).toBe(false);
    const shares = afterCharge.filter((e) => e.kind === "match_share").reduce((s, e) => s + e.amountCents, 0);
    const commission = afterCharge.filter((e) => e.kind === "commission");
    expect(commission).toHaveLength(1);
    expect(commission[0].amountCents).toBe(600); // 10 % der Hallenmiete 6000
    // Verbindlichkeit gegenüber der Halle = Abbuchungen minus Provision (kein Euro doppelt als Ertrag)
    const payable = afterCharge.reduce((s, e) => s + (e.creditAccount === "venue_payable" ? e.amountCents : 0) - (e.debitAccount === "venue_payable" ? e.amountCents : 0), 0);
    expect(payable).toBe(shares - 600);
    expect((await trialBalance()).balanced).toBe(true);

    expect(await adminCancelMatch(g.admin.id, g.match.id, "Halle fällt aus")).toEqual({ state: "cancelled" });
    const all = await entries(g.match.id);
    const net = (acct: string) => all.reduce((s, e) => s + (e.creditAccount === acct ? e.amountCents : 0) - (e.debitAccount === acct ? e.amountCents : 0), 0);
    expect(net("venue_payable")).toBe(0);
    expect(net("commission")).toBe(0);
    expect(all.some((e) => e.creditAccount === "revenue" || e.debitAccount === "revenue")).toBe(false);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Altspiel (legacy): Abbuchung weiter auf revenue, keine Provision", async () => {
    const v = await venue();
    const g = await game(v.id);
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`); // Wartungsausnahme: sonst ist ledger_model unveränderlich
      await tx.update(matches).set({ ledgerModel: "legacy" }).where(eq(matches.id, g.match.id));
    });
    await runCharges(g.match.id);
    const e = await entries(g.match.id);
    expect(e.filter((x) => x.kind === "match_share").every((x) => x.creditAccount === "revenue")).toBe(true);
    expect(e.some((x) => x.kind === "commission")).toBe(false);
  });

  it("OHNE Hilfsfunktion-Standard: ein über den echten Weg (createPrivateGame) angelegtes Spiel hat das Modell 'commission' und bekommt die Provision", async () => {
    const organizer = await makeUser("pvprov");
    const { match } = await createPrivateGame(organizer.id, { city: "Essen", venueText: "Halle X", startsAt: new Date(Date.now() + 4 * 86_400_000), durationMin: 60, rentCents: 8000 });
    expect(match.ledgerModel).toBe("commission");
    const v = await venue();
    await db.update(matches).set({ venueId: v.id }).where(eq(matches.id, match.id));
    const [m] = await db.select().from(matches).where(eq(matches.id, match.id));
    expect(m.ledgerModel).toBe("commission");
    await book(m);
    const e = await entries(match.id);
    expect(e.filter((x) => x.kind === "commission")).toMatchObject([{ amountCents: 800, debitAccount: "venue_payable", creditAccount: "commission" }]);
  });
});

describe("Provisionssatz einstellen (AC-5): nur Admin 1, Pflicht-Begründung, Wertebereich", () => {
  const form = (percent: string, reason: string, bonus = false) => {
    const fd = new FormData();
    fd.set("percent", percent);
    fd.set("reason", reason);
    if (bonus) fd.set("bonus", "on");
    return fd;
  };
  const rate = async (id: string) => (await db.select().from(venues).where(eq(venues.id, id)))[0];

  it("Admin 1 stellt Satz und Bonus ein; Protokoll wer/vorher/nachher mit Grund; Komma als Dezimaltrenner", async () => {
    const owner = await makeUser("pr1", "owner");
    const v = await venue();
    currentUserId = owner.id;
    expect(await setVenueCommissionAction(v.id, undefined, form("12,5", "Neuer Vertrag mit der Halle", true))).toEqual({ ok: true });
    const r = await rate(v.id);
    expect(Number(r.commissionPercent)).toBe(12.5);
    expect(r.commissionBonusEnabled).toBe(true);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, "venue.commission"), eq(auditLog.entityId, v.id)));
    expect(a.actorId).toBe(owner.id);
    expect(a.before).toMatchObject({ percent: 10, bonus: false });
    expect(a.after).toMatchObject({ percent: 12.5, bonus: true, reason: "Neuer Vertrag mit der Halle" });
  });

  it("Admin 2 und Spieler werden abgelehnt (Weiterleitung), nichts geändert", async () => {
    const admin2 = await makeUser("pr2", "admin");
    const player = await makeUser("pr3", "player");
    const v = await venue();
    for (const u of [admin2, player]) {
      currentUserId = u.id;
      await expect(setVenueCommissionAction(v.id, undefined, form("50", "Versuch"))).rejects.toThrow(/REDIRECT:\/app/);
    }
    expect(Number((await rate(v.id)).commissionPercent)).toBe(10);
  });

  it("ohne Begründung, mit zu kurzer oder zu langer Begründung, negativ, über 100 und mit mehr als zwei Nachkommastellen: abgelehnt", async () => {
    const owner = await makeUser("pr4", "owner");
    const v = await venue();
    currentUserId = owner.id;
    for (const [p, reason] of [["10", ""], ["10", "ab"], ["10", "x".repeat(201)], ["-1", "Grund"], ["100.01", "Grund"], ["101", "Grund"], ["10.123", "Grund"], ["abc", "Grund"]] as const) {
      const r = await setVenueCommissionAction(v.id, undefined, form(p, reason));
      expect(r, `${p}/${reason.length}`).toHaveProperty("error");
    }
    expect(Number((await rate(v.id)).commissionPercent)).toBe(10);
    expect(await setVenueCommissionAction(v.id, undefined, form("0", "Aktion"))).toEqual({ ok: true });
    expect(await setVenueCommissionAction(v.id, undefined, form("100", "Aktion"))).toEqual({ ok: true });
  });

  it("direkt über den Server: setVenueCommission lehnt einen Satz außerhalb 0..100 ab", async () => {
    const owner = await makeUser("pr5", "owner");
    const v = await venue();
    await expect(setVenueCommission(owner.id, v.id, { percent: 101, bonusEnabled: false, reason: "Grund" })).rejects.toThrow(/0 bis 100/);
  });

  it("neue Halle übernimmt die Vorgabe (Einstellung tournament_commission_percent, Standard 10)", async () => {
    const owner = await makeUser("pr6", "owner");
    const a = await createVenue(owner.id, { name: `Vorgabe A ${nid("x")}`, city: "Essen" });
    expect(Number(a.commissionPercent)).toBe(10);
    await setSetting(owner.id, "tournament_commission_percent", 15);
    const b = await createVenue(owner.id, { name: `Vorgabe B ${nid("x")}`, city: "Essen" });
    expect(Number(b.commissionPercent)).toBe(15);
    await setSetting(owner.id, "tournament_commission_percent", 10);
  });
});

describe("Review-Fixes 009 M2 (t1d): Konten je Pfad, Unveränderlichkeit, Vorgabe, Alarm", () => {
  it("Punkt 1: Kartenspiel OHNE Halle: die Abbuchung fließt auf revenue (nie als Verbindlichkeit ohne Halle), keine Provision, Hauptbuch ausgeglichen", async () => {
    const v = await venue();
    const g = await game(v.id);
    await db.update(matches).set({ venueId: null }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id);
    const e = await entries(g.match.id);
    const shares = e.filter((x) => x.kind === "match_share");
    expect(shares.length).toBe(g.n);
    expect(shares.every((x) => x.creditAccount === "revenue")).toBe(true);
    expect(e.some((x) => x.creditAccount === "venue_payable" || x.debitAccount === "venue_payable" || x.kind === "commission")).toBe(false);
    expect((await trialBalance()).balanced).toBe(true);
    // Erstattung geht dorthin zurück, wo die Abbuchung liegt (revenue)
    await adminCancelMatch(g.admin.id, g.match.id, "Test");
    const all = await entries(g.match.id);
    expect(all.filter((x) => x.kind === "refund").every((x) => x.debitAccount === "revenue")).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Punkt 1b: Kartenspiel ohne Hallenmiete (cost_cents leer): ebenfalls revenue, keine Provision", async () => {
    const v = await venue();
    const g = await game(v.id);
    await db.update(matches).set({ costCents: null }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id);
    const e = await entries(g.match.id);
    expect(e.filter((x) => x.kind === "match_share").every((x) => x.creditAccount === "revenue")).toBe(true);
    expect(e.some((x) => x.kind === "commission" || x.creditAccount === "venue_payable")).toBe(false);
  });

  it("Punkt 7: Teilerfolg (ein Spieler scheitert): Abbuchungen bleiben auf venue_payable, das Spiel ist nicht gebucht, KEINE Provision", async () => {
    const v = await venue({ bonus: true });
    const g = await game(v.id);
    provider.setChargeOutcome(g.adminB.id, "declined");
    await runCharges(g.match.id);
    const [m] = await db.select().from(matches).where(eq(matches.id, g.match.id));
    expect(m.settledAt).toBeNull();
    const e = await entries(g.match.id);
    expect(e.filter((x) => x.kind === "match_share").length).toBe(g.n - 1);
    expect(e.filter((x) => x.kind === "match_share").every((x) => x.creditAccount === "venue_payable")).toBe(true);
    expect(e.some((x) => x.kind === "commission" || x.kind === "commission_bonus")).toBe(false);
    expect(await db.select().from(matchCommissions).where(eq(matchCommissions.matchId, g.match.id))).toHaveLength(0);
  });

  it("Punkt 7 (C3): Hallenmiete als Ausgabe wird bei einem Kartenspiel im Provisionsmodell abgelehnt (nichts gebucht), bei Altspiel und bei Spiel ohne Abbuchung nicht", async () => {
    const v = await venue();
    const g = await game(v.id);
    await runCharges(g.match.id);
    const before = (await entries(g.match.id)).length;
    await expect(recordExpense(g.admin.id, { matchId: g.match.id, kind: "venue", amountCents: 6000 })).rejects.toThrow(/Provisionsmodell/);
    expect((await entries(g.match.id)).length).toBe(before); // die Transaktion wurde zurückgerollt
    const noCharge = await commissionMatch(v.id);
    await expect(recordExpense(g.admin.id, { matchId: noCharge.id, kind: "venue", amountCents: 5000 })).resolves.toBeTruthy();
    const old = await commissionMatch(v.id, 8000, "legacy");
    await expect(recordExpense(g.admin.id, { matchId: old.id, kind: "venue", amountCents: 5000 })).resolves.toBeTruthy();
    await expect(recordExpense(g.admin.id, { matchId: g.match.id, kind: "other", amountCents: 100 })).resolves.toBeTruthy(); // andere Ausgaben bleiben möglich
  });

  it("Punkt 2: Guthaben-Pfade bleiben auf revenue (Hin UND Zurück), Ausnahme-Erstattung berührt venue_payable nie; Kartenzahler ist nicht ausnahme-erstattbar", async () => {
    const v = await venue();
    // Guthaben-Spiel im Provisionsmodell: Zahlung wallet -> revenue, Ausnahme-Erstattung revenue -> wallet
    const w = await makeMatch({ legacy: true, priceCents: 4000, costCents: 4000, ledgerModel: "commission" });
    await db.update(matches).set({ venueId: v.id }).where(eq(matches.id, w.match.id));
    const payer = w.adminA;
    await db.transaction((tx) => creditWallet(tx, payer.id, { from: "bank", amountCents: 5000, kind: "adjustment", idempotencyKey: nid("fund") }));
    await setSetting(null, "payments_enabled", true);
    try {
      await payShare(payer.id, w.match.id);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
    const paid = (await entries(w.match.id)).filter((x) => x.kind === "match_share");
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.every((x) => x.debitAccount === "wallet" && x.creditAccount === "revenue")).toBe(true);
    const before = await walletBalance(db, payer.id);
    await manualRefund(w.adminB.id, w.match.id, payer.id, 100, "Test-Erstattung");
    expect(await walletBalance(db, payer.id)).toBe(before + 100);
    const ref = (await entries(w.match.id)).filter((x) => x.kind === "refund");
    expect(ref).toMatchObject([{ debitAccount: "revenue", creditAccount: "wallet", amountCents: 100 }]);
    expect((await entries(w.match.id)).some((x) => x.creditAccount === "venue_payable" || x.debitAccount === "venue_payable")).toBe(false);
    expect((await trialBalance()).balanced).toBe(true);

    // Kartenzahler: kein Guthaben-Eintrag, also netto 0: die Ausnahme-Erstattung ist abgelehnt und kann nie aus revenue/venue_payable ins Guthaben buchen
    const g = await game(v.id);
    await runCharges(g.match.id);
    await expect(manualRefund(g.admin.id, g.match.id, g.adminA.id, 100, "Test")).rejects.toThrow(/höchstens 0,00/);
  });

  it("Punkt 3 (C4): matches.ledger_model ist unveränderlich; nur die Wartungsausnahme darf es ändern", async () => {
    const v = await venue();
    const m = await commissionMatch(v.id);
    await expect(db.update(matches).set({ ledgerModel: "legacy" }).where(eq(matches.id, m.id))).rejects.toThrow();
    expect((await db.select().from(matches).where(eq(matches.id, m.id)))[0].ledgerModel).toBe("commission");
    await expect(db.update(matches).set({ ledgerModel: "commission" }).where(eq(matches.id, m.id))).resolves.toBeDefined(); // gleicher Wert ist keine Änderung
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('socaz.ledger_maintenance', 'on', true)`);
      await tx.update(matches).set({ ledgerModel: "legacy" }).where(eq(matches.id, m.id));
    });
    expect((await db.select().from(matches).where(eq(matches.id, m.id)))[0].ledgerModel).toBe("legacy");
  });

  it("Entscheid t9: bestehende Hallen starten mit Satz 0 (Spaltenvorgabe), neue Hallen mit der Vorgabe aus der Einstellung", async () => {
    const [raw] = await db.insert(venues).values({ name: `Altbestand ${nid("v")}`, city: "Essen", source: "osm" }).returning();
    expect(Number(raw.commissionPercent)).toBe(0);
    const owner = await makeUser("pr7", "owner");
    const fresh = await createVenue(owner.id, { name: `Neu ${nid("v")}`, city: "Essen" });
    expect(Number(fresh.commissionPercent)).toBe(10);
  });

  it("Entscheid t9: Alarm 'Provision nicht gesetzt' für Partnerhallen mit Satz 0 ohne Protokolleintrag; weg nach bewusstem Setzen (auch 0), nicht für Nicht-Partner und nicht bei Satz > 0", async () => {
    const owner = await makeUser("pr8", "owner");
    const mk = async (o: { partner: boolean; percent: string }) => (await db.insert(venues).values({ name: `Alarm ${nid("v")}`, city: "Essen", source: "manual", isPartner: o.partner, commissionPercent: o.percent }).returning())[0];
    const unset = await mk({ partner: true, percent: "0" });
    const noPartner = await mk({ partner: false, percent: "0" });
    const withRate = await mk({ partner: true, percent: "12" });
    const codes = async () => (await getAlerts()).map((a) => a.code);
    let c = await codes();
    expect(c).toContain(`commission-unset:${unset.id}`);
    expect(c).not.toContain(`commission-unset:${noPartner.id}`);
    expect(c).not.toContain(`commission-unset:${withRate.id}`);
    await setVenueCommission(owner.id, unset.id, { percent: 0, bonusEnabled: false, reason: "bewusst 0" });
    c = await codes();
    expect(c).not.toContain(`commission-unset:${unset.id}`);
  });
});
