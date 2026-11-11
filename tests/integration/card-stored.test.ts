import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentProfiles, paymentSetupIntents, teamMembers } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { MANDATE_TEXT, SETUP_LIMIT_PER_HOUR } from "@/server/payments/card-setup";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { StoredCardInvalidError, storedMandateId, applyStoredCard } from "@/server/payments/stored-card";
import { setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

let provider: FakeProvider;
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
  await setSetting(null, "card_payments_enabled", true);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

let seq = 0;
/** Nutzer mit gespeichertem Zahlungsmittel (wie nach einem erfolgreichen SetupIntent). */
async function userWithCard(tag = "gk") {
  const u = await makeUser(tag);
  const pm = `pm_st_${Date.now().toString(36)}_${++seq}`;
  await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: `cus_st_${Date.now().toString(36)}_${seq}`, paymentMethodId: pm, cardBrand: "visa", cardLast4: "4242" });
  return { u, pm };
}
/** Spiel im Kartenmodell (72 h, 80 EUR) mit dem Nutzer als Spieler im Heimteam. */
async function lobbyFor(userId: string) {
  const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  await db.insert(teamMembers).values({ teamId: m.home.id, userId, role: "player" }).onConflictDoNothing();
  await db.insert(matchParticipants).values({ matchId: m.match.id, userId, teamId: m.home.id });
  return m;
}
const seatOf = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const rowsOf = (userId: string) => db.select().from(paymentSetupIntents).where(eq(paymentSetupIntents.userId, userId));
const ledgerFor = (matchId: string, userId: string) => db.select().from(ledgerEntries).where(or(eq(ledgerEntries.matchId, matchId), eq(ledgerEntries.debitUserId, userId), eq(ledgerEntries.creditUserId, userId)));

describe("gespeicherte Karte für den eigenen Platz", () => {
  it("gültige Karte: Platz card_ready, Mandat (Text und Zeitpunkt) je Platz gespeichert, kein neues SetupIntent, kein Ledger, danach ist Bereit möglich", async () => {
    const { u, pm } = await userWithCard();
    const m = await lobbyFor(u.id);
    const t0 = Date.now();
    const r = await applyStoredCard(u.id, m.match.id);
    expect(r.alreadyReady).toBe(false);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("card_ready");
    const [row] = await rowsOf(u.id);
    expect(row).toMatchObject({ id: storedMandateId(m.match.id, u.id), matchId: m.match.id, status: "succeeded", mandateText: MANDATE_TEXT });
    expect(row.mandateAcceptedAt.getTime()).toBeGreaterThanOrEqual(t0 - 1000);
    expect(row.mandateAcceptedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(provider.calls.map((c) => c.method)).toEqual(["isPaymentMethodUsable"]); // Zahlungsmittel geprüft, nichts angelegt
    expect(provider.calls[0].args).toMatchObject({ id: pm });
    expect(await ledgerFor(m.match.id, u.id)).toHaveLength(0);
    expect((await seatOf(m.match.id, u.id)).paidCents).toBe(0);
    await setReady(u.id, m.match.id, true); // Bereit = Karte hinterlegt
    expect((await seatOf(m.match.id, u.id)).readyAt).not.toBeNull();
  });

  it("zweiter Aufruf ist idempotent: keine zweite Zeile, Zeitpunkt bleibt, kein weiterer Stripe-Aufruf", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    await applyStoredCard(u.id, m.match.id);
    const first = (await rowsOf(u.id))[0];
    const again = await applyStoredCard(u.id, m.match.id);
    expect(again.alreadyReady).toBe(true);
    const rows = await rowsOf(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].mandateAcceptedAt.getTime()).toBe(first.mandateAcceptedAt.getTime());
    expect(provider.calls.filter((c) => c.method === "isPaymentMethodUsable")).toHaveLength(1);
    await Promise.allSettled([applyStoredCard(u.id, m.match.id), applyStoredCard(u.id, m.match.id), applyStoredCard(u.id, m.match.id)]);
    expect(await rowsOf(u.id)).toHaveLength(1);
  });

  it("Mandat je Platz: dieselbe Karte in einem zweiten Spiel ergibt eine eigene Mandatszeile", async () => {
    const { u } = await userWithCard();
    const a = await lobbyFor(u.id);
    const b = await lobbyFor(u.id);
    await applyStoredCard(u.id, a.match.id);
    await applyStoredCard(u.id, b.match.id);
    const rows = await rowsOf(u.id);
    expect(rows.map((r) => r.matchId).sort()).toEqual([a.match.id, b.match.id].sort());
  });
});

describe("Karte nicht nutzbar", () => {
  it("bei Stripe ungültig (abgelaufen oder gelöst): Fehler 'Karte neu hinterlegen', kein card_ready, keine Mandatszeile", async () => {
    const { u, pm } = await userWithCard();
    const m = await lobbyFor(u.id);
    provider.setUsable(pm, false);
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toBeInstanceOf(StoredCardInvalidError);
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/neu hinterlegen/);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("none");
    expect(await rowsOf(u.id)).toHaveLength(0);
  });

  it("Stripe nicht erreichbar (Fehler beim Prüfen) zählt als nicht nutzbar", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    provider.isPaymentMethodUsable = async () => {
      throw new Error("Netz weg");
    };
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toBeInstanceOf(StoredCardInvalidError);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("none");
  });

  it("ohne gespeicherte Karte: Fehler, kein Anbieteraufruf", async () => {
    const u = await makeUser("gkohne");
    const m = await lobbyFor(u.id);
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toBeInstanceOf(StoredCardInvalidError);
    expect(provider.calls).toHaveLength(0);
    await db.insert(paymentProfiles).values({ userId: u.id, stripeCustomerId: `cus_st_ohne_${seq++}` }); // Kunde, aber keine Karte
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toBeInstanceOf(StoredCardInvalidError);
    expect(provider.calls).toHaveLength(0);
  });

  it("die Karte ändert sich zwischen Prüfung und Speichern: abgelehnt, nichts gesetzt", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    provider.isPaymentMethodUsable = async () => {
      await db.update(paymentProfiles).set({ paymentMethodId: "pm_st_anders" }).where(eq(paymentProfiles.userId, u.id));
      return true;
    };
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/geändert/);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("none");
    expect(await rowsOf(u.id)).toHaveLength(0);
  });
});

describe("Rechte: nur der eigene Platz", () => {
  it("wer nicht in dem Spiel steht, kann dafür keine Karte setzen; der Platz eines anderen bleibt unberührt", async () => {
    const owner = await userWithCard("gkowner");
    const stranger = await userWithCard("gkfremd");
    const m = await lobbyFor(owner.u.id);
    await expect(applyStoredCard(stranger.u.id, m.match.id)).rejects.toThrow(/nicht angemeldet/);
    expect(await rowsOf(stranger.u.id)).toHaveLength(0);
    expect((await seatOf(m.match.id, owner.u.id)).cardStatus).toBe("none");
    expect(provider.calls).toHaveLength(0);
  });

  it("die Aktion setzt nur den eigenen Platz, auch wenn im Spiel andere ohne Karte stehen", async () => {
    const me = await userWithCard("gkich");
    const m = await lobbyFor(me.u.id);
    const other = await addPlayer(m.match.id, m.home.id, "gkandere");
    await applyStoredCard(me.u.id, m.match.id);
    expect((await seatOf(m.match.id, other.id)).cardStatus).toBe("none");
  });

  it("ungültige Spiel-IDs werden sauber abgelehnt (kein Datenbankfehler)", async () => {
    const { u } = await userWithCard();
    for (const bad of ["abc", "", "1; drop table matches", "00000000-0000-0000-0000-00000000000g"]) {
      await expect(applyStoredCard(u.id, bad), bad).rejects.toThrow(/nicht angemeldet/);
    }
    await expect(applyStoredCard(u.id, undefined as unknown as string)).rejects.toThrow(/nicht angemeldet/);
  });
});

describe("nur im Kartenmodell", () => {
  it("Schalter AUS: abgelehnt, nichts gesetzt", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    await setSetting(null, "card_payments_enabled", false);
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/nicht per Karte/);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("none");
    expect(await rowsOf(u.id)).toHaveLength(0);
  });

  it("Altspiel und Spiel mit bezahltem Platz: abgelehnt", async () => {
    const { u } = await userWithCard();
    const legacy = await makeMatch({ legacy: true });
    await db.insert(matchParticipants).values({ matchId: legacy.match.id, userId: u.id, teamId: legacy.home.id });
    await expect(applyStoredCard(u.id, legacy.match.id)).rejects.toThrow(/nicht per Karte/);

    const paid = await lobbyFor(u.id);
    await db.update(matchParticipants).set({ paidCents: 800 }).where(and(eq(matchParticipants.matchId, paid.match.id), eq(matchParticipants.userId, paid.adminA.id)));
    await expect(applyStoredCard(u.id, paid.match.id)).rejects.toThrow(/nicht per Karte/);
    expect((await seatOf(paid.match.id, u.id)).cardStatus).toBe("none");
    expect(await rowsOf(u.id)).toHaveLength(0);
  });

  it("abgesagtes oder vergangenes Spiel: abgelehnt", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, m.match.id));
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/nicht mehr offen/);
    const past = await lobbyFor(u.id);
    await db.update(matches).set({ startsAt: new Date(Date.now() - 60_000) }).where(eq(matches.id, past.match.id));
    await expect(applyStoredCard(u.id, past.match.id)).rejects.toThrow(/nicht mehr offen/);
  });
});

describe("Begrenzung und Sperre", () => {
  it("höchstens " + SETUP_LIMIT_PER_HOUR + " Einrichtungen je Stunde (gemeinsam mit createCardSetup)", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    await db.insert(paymentSetupIntents).values(Array.from({ length: SETUP_LIMIT_PER_HOUR }, (_, i) => ({ id: `seti_st_lim_${u.id}_${i}`, userId: u.id, mandateText: MANDATE_TEXT, mandateAcceptedAt: new Date() })));
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/Zu viele/);
    expect((await seatOf(m.match.id, u.id)).cardStatus).toBe("none");
  });

  it("belegte Sperre (anderer Aufruf desselben Nutzers läuft): sofort 'Bitte warten', kein Warten", async () => {
    const { u } = await userWithCard();
    const m = await lobbyFor(u.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held!: () => void;
    const heldP = new Promise<void>((r) => (held = r));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"card-setup:" + u.id}, 0))`);
      held();
      await gate;
    });
    await heldP;
    const t0 = Date.now();
    await expect(applyStoredCard(u.id, m.match.id)).rejects.toThrow(/einen Moment warten/);
    expect(Date.now() - t0).toBeLessThan(1500);
    release();
    await holder;
    expect((await applyStoredCard(u.id, m.match.id)).alreadyReady).toBe(false); // danach frei
  });
});

describe("Hauptbuch", () => {
  it("die Aktion schreibt nie ins Hauptbuch und nie auf paid_cents (Mehrfachaufrufe, mehrere Spiele)", async () => {
    const { u } = await userWithCard();
    const games = [await lobbyFor(u.id), await lobbyFor(u.id)];
    const before = (await db.select().from(ledgerEntries).where(inArray(ledgerEntries.matchId, games.map((g) => g.match.id)))).length;
    for (const g of games) {
      await applyStoredCard(u.id, g.match.id);
      await applyStoredCard(u.id, g.match.id);
    }
    expect((await db.select().from(ledgerEntries).where(inArray(ledgerEntries.matchId, games.map((g) => g.match.id)))).length).toBe(before);
    for (const g of games) expect((await seatOf(g.match.id, u.id)).paidCents).toBe(0);
  });
});

describe("StripeProvider.isPaymentMethodUsable (Stripe-Client ersetzt, kein Netz)", () => {
  async function withPm(pm: unknown) {
    const { StripeProvider } = await import("@/server/payments/stripe");
    const p = new StripeProvider({ secretKey: "sk_test_dummy_nicht_echt" });
    (p as unknown as { client: unknown }).client = { paymentMethods: { retrieve: async () => pm } };
    return p;
  }
  const year = new Date().getUTCFullYear();
  it("gehört zum Kunden und nicht abgelaufen: nutzbar; gelöst, fremder Kunde oder abgelaufen: nicht nutzbar", async () => {
    expect(await (await withPm({ customer: "cus_a", card: { exp_year: year + 1, exp_month: 1 } })).isPaymentMethodUsable("pm_x", "cus_a")).toBe(true);
    expect(await (await withPm({ customer: null, card: { exp_year: year + 1, exp_month: 1 } })).isPaymentMethodUsable("pm_x", "cus_a")).toBe(false); // gelöst
    expect(await (await withPm({ customer: "cus_b", card: { exp_year: year + 1, exp_month: 1 } })).isPaymentMethodUsable("pm_x", "cus_a")).toBe(false);
    expect(await (await withPm({ customer: "cus_a", card: { exp_year: year - 1, exp_month: 12 } })).isPaymentMethodUsable("pm_x", "cus_a")).toBe(false); // abgelaufen
    expect(await (await withPm({ customer: "cus_a", card: { exp_year: year, exp_month: 12 } })).isPaymentMethodUsable("pm_x", "cus_a")).toBe(true); // läuft Ende des Jahres ab: noch gültig
  });
});
