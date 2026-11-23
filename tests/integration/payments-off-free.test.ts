import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matches, matchParticipants, paymentCharges, paymentRefunds } from "@/db/schema";
import { tournaments } from "@/db/schema-league";
import { frozenTournaments } from "@/server/tournaments";
import { tournamentCardMode } from "@/server/tournament-card";
import { chargeEligibility } from "@/server/payments/charge-run";
import { finalConfirm, setReady, teamComplete } from "@/server/lobby";
import { closeLobbiesAtDeadline } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { cardModeActive } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

const nid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 12)}`;

// "Zahlungen AUS" (payments_enabled = aus) = Spiele kostenlos, keine Karte (t2q-Entscheid). Matrix payments x card x Spielzustand.
// Abrechnungsgebunden bleibt im Kartenmodell: Abbuchungszeilen, fixierter Preis, Platz charge_pending/charged, Erstattungszeilen.
// (paid_cents > 0 = Guthabenmodell, dort gilt cardModeActive schon immer false.)

afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
  await setSetting(null, "payments_enabled", true);
});

const switches = async (payments: boolean, card: boolean) => {
  await setSetting(null, "payments_enabled", payments);
  await setSetting(null, "card_payments_enabled", card);
};

type State = "open" | "card-only" | "fixed" | "charge-pending" | "charged" | "charge-rows" | "refund-rows" | "paid";
const STATES: State[] = ["open", "card-only", "fixed", "charge-pending", "charged", "charge-rows", "refund-rows", "paid"];

/** Spiel im gewuenschten Zustand; liefert Spiel und die zwei Captains. */
async function gameIn(state: State) {
  const g = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
  const id = g.match.id;
  const seatOf = (userId: string) => and(eq(matchParticipants.matchId, id), eq(matchParticipants.userId, userId));
  if (state === "card-only") await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(seatOf(g.adminA.id));
  if (state === "fixed") await db.update(matches).set({ finalShareCents: 800 }).where(eq(matches.id, id));
  if (state === "charge-pending") await db.update(matchParticipants).set({ cardStatus: "charge_pending" }).where(seatOf(g.adminA.id));
  if (state === "charged") await db.update(matchParticipants).set({ cardStatus: "charged" }).where(seatOf(g.adminA.id));
  if (state === "charge-rows" || state === "refund-rows") {
    const [c] = await db.insert(paymentCharges).values({ matchId: id, userId: g.adminA.id, amountCents: 800, status: state === "refund-rows" ? "succeeded" : "pending", idempotencyKey: `pof:${id}:${g.adminA.id}`, paymentIntentId: state === "refund-rows" ? nid("pi_pof") : null }).returning();
    if (state === "refund-rows") await db.insert(paymentRefunds).values({ chargeId: c.id, matchId: id, userId: g.adminA.id, amountCents: 800, idempotencyKey: `pofr:${c.id}`, status: "succeeded", reason: "Absage" });
  }
  if (state === "paid") await db.update(matchParticipants).set({ paidCents: 800 }).where(seatOf(g.adminA.id));
  return { ...g, match: await reloadMatch(id) };
}

/** Erwartung: Kartenmodell ja/nein je Zelle. */
function expectedCard(payments: boolean, card: boolean, state: State): boolean {
  if (!card) return false;
  if (state === "paid") return false; // Guthabenmodell, wie bisher
  if (payments) return true;
  return state !== "open" && state !== "card-only"; // AUS: nur abrechnungsgebundene Spiele bleiben im Kartenmodell
}

describe("Matrix: cardModeActive je payments_enabled x card_payments_enabled x Spielzustand", () => {
  for (const payments of [true, false]) {
    for (const card of [true, false]) {
      for (const state of STATES) {
        it(`payments=${payments ? "AN" : "AUS"} card=${card ? "AN" : "AUS"} Zustand=${state}: Kartenmodell ${expectedCard(payments, card, state) ? "JA" : "NEIN"}`, async () => {
          const g = await gameIn(state);
          await switches(payments, card);
          expect(await cardModeActive(db, g.match)).toBe(expectedCard(payments, card, state));
        });
      }
    }
  }
});

describe("Zahlungen AUS + Karte AN: neue Beitritte und Bereit sind kostenlos", () => {
  it("offenes Spiel: Bereit ohne Karte gelingt, Spiel ist komplett, Abbuchung nicht moeglich (not_card_mode)", async () => {
    const g = await gameIn("open");
    await switches(false, true);
    await setReady(g.adminA.id, g.match.id, true);
    const seat = (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.adminA.id))))[0];
    expect(seat.readyAt).not.toBeNull();
    expect(seat.paidCents).toBe(0);
    const [m] = await db.select().from(matches).where(eq(matches.id, g.match.id));
    expect((await chargeEligibility(db as never, m, new Date())).reason).toBe("not_card_mode");
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).toHaveLength(0);
  });

  it("neuer Mitspieler im offenen Spiel: Bereit ohne Karte gelingt; teamComplete zaehlt ihn ohne Karte", async () => {
    const g = await gameIn("open");
    await switches(false, true);
    const p = await addPlayer(g.match.id, g.home.id);
    await setReady(p.id, g.match.id, true);
    await db.transaction(async (tx) => {
      expect(await cardModeActive(tx, await reloadMatch(g.match.id))).toBe(false);
      void (await teamComplete(tx, g.match.id, g.home.id)); // Aufruf darf nicht an einer Kartenpflicht scheitern; Mindestzahl wird hier nicht erreicht
    });
  });

  it("Gegenprobe AN/AN: dasselbe Spiel verlangt weiter die Karte", async () => {
    const g = await gameIn("open");
    await expect(setReady(g.adminA.id, g.match.id, true)).rejects.toThrow(/Karte/);
  });

  it("fixiertes Spiel bleibt auch bei AUS im Kartenmodell: Bereit ohne Karte wird abgelehnt (kein stilles Gratis)", async () => {
    const g = await gameIn("fixed");
    await switches(false, true);
    await expect(setReady(g.adminA.id, g.match.id, true)).rejects.toThrow(/Karte/);
  });

  it("Umschalten wirkt nicht rueckwirkend: AN -> AUS -> AN aendert Zustand und Zeilen eines abgebuchten Spiels nicht (keine Doppelbelastung)", async () => {
    const g = await gameIn("charge-rows");
    const before = (await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).length;
    for (const [pay, card] of [[false, true], [true, true], [false, true]] as const) {
      await switches(pay, card);
      expect(await cardModeActive(db, await reloadMatch(g.match.id))).toBe(true);
    }
    expect((await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).length).toBe(before);
  });
});

describe("Zahlungen AUS + Karte AN: Bestaetigen der Captains (Anteil fixieren) bleibt kostenlos", () => {
  it("beide Captains bestaetigen ohne Karten: Anteil wird als kostenlos (0) fixiert, Spiel bleibt kostenlos, auch nach AN keine Abbuchung", async () => {
    const g = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    const all = [g.adminA, g.adminB];
    while (all.length < 10) all.push(await addPlayer(g.match.id, all.length % 2 === 0 ? g.home.id : g.away.id));
    await switches(false, true);
    for (const p of all) await setReady(p.id, g.match.id, true); // ohne Karte
    await finalConfirm(g.adminA.id, g.match.id);
    await finalConfirm(g.adminB.id, g.match.id);
    const fixed = await reloadMatch(g.match.id);
    expect(fixed.finalShareCents).toBe(0); // kostenlos fixiert, nicht 8000/10: sonst waere das Spiel "abrechnungsgebunden" und wuerde abgebucht
    expect(await cardModeActive(db, fixed)).toBe(false);
    await switches(true, true); // Wiedereinschalten: wirkt nicht rueckwirkend
    expect((await chargeEligibility(db as never, await reloadMatch(g.match.id), new Date())).amountCents).toBeNull();
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id))).toHaveLength(0);
  });
});

describe("Zahlungen AUS: Frist-Job schliesst nur abrechnungsgebundene Spiele", () => {
  it("kostenloses (offenes) Spiel kurz vor Anstoss wird bei AUS nicht vom Frist-Job abgesagt; bei AN schon (Gegenprobe)", async () => {
    const g = await makeMatch({ hoursAhead: 0.5, priceCents: 8000, costCents: 8000 });
    await switches(false, true);
    await closeLobbiesAtDeadline();
    expect((await reloadMatch(g.match.id)).status).not.toBe("cancelled");
    await switches(true, true);
    await closeLobbiesAtDeadline();
    expect((await reloadMatch(g.match.id)).status).toBe("cancelled");
  });

  it("abrechnungsgebundenes Spiel (Preis fixiert) folgt der Frist-Regel auch bei AUS: nicht abbuchungsbereit = Absage wie bei AN", async () => {
    const g = await makeMatch({ hoursAhead: 0.5, priceCents: 8000, costCents: 8000 });
    await db.update(matches).set({ finalShareCents: 800 }).where(eq(matches.id, g.match.id));
    await switches(false, true);
    await closeLobbiesAtDeadline();
    expect((await reloadMatch(g.match.id)).status).toBe("cancelled");
  });
});

// Turniere: "Zahlungen AUS" macht ein Turnier mit Preis NICHT kostenlos; es bleibt eingefroren (Alarm), die Bezahlphase laeuft nicht still weiter.
describe("Turniere: payments_enabled x card_payments_enabled", () => {
  const DAY = 86_400_000;
  async function tournament(totalCents: number) {
    const org = await makeUser("orgpof");
    const [t] = await db
      .insert(tournaments)
      .values({
        organizerId: org.id, name: nid("POF-Cup"), city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: 4,
        totalCents, hourlyCents: 8000, durationMin: 120, status: "payment", registrationDeadline: new Date(Date.now() + 4 * DAY), startsAt: new Date(Date.now() + 6 * DAY), isPrivate: false,
        venueAccessRequiredSnapshot: false, commissionPercentSnapshot: "10.00", finalShareCents: totalCents / 4,
      } as typeof tournaments.$inferInsert)
      .returning();
    return t;
  }
  const frozenIds = async () => (await frozenTournaments(db, new Date(Date.now() + 5 * DAY))).map((f) => f.id);
  const cases: [boolean, boolean, boolean][] = [
    // payments, card, Turnier mit Preis eingefroren?
    [true, true, false],
    [false, true, true],
    [true, false, true],
    [false, false, true],
  ];
  for (const [payments, card, frozen] of cases) {
    it(`payments=${payments ? "AN" : "AUS"} card=${card ? "AN" : "AUS"}: Turnier mit Preis ${frozen ? "eingefroren (Alarm), Kartenfluss aus" : "laeuft im Kartenfluss"}`, async () => {
      const t = await tournament(16000);
      await switches(payments, card);
      expect((await frozenIds()).includes(t.id)).toBe(frozen);
      expect(await db.transaction((tx) => tournamentCardMode(tx, t.id))).toBe(!frozen);
    });
  }
  it("Turnier ohne Preis (0 EUR) ist bei AUS nicht im Kartenfluss (wie bisher)", async () => {
    const t = await tournament(0);
    await switches(false, true);
    expect(await db.transaction((tx) => tournamentCardMode(tx, t.id))).toBe(false);
  });
});
