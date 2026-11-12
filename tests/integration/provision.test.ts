import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
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
    await db.update(matches).set({ ledgerModel: "legacy" }).where(eq(matches.id, g.match.id));
    await runCharges(g.match.id);
    const e = await entries(g.match.id);
    expect(e.filter((x) => x.kind === "match_share").every((x) => x.creditAccount === "revenue")).toBe(true);
    expect(e.some((x) => x.kind === "commission")).toBe(false);
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
