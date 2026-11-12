import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges } from "@/db/schema";
import { markAfterStart } from "@/server/payments/charge-trigger";
import { closeLobbiesAtDeadline } from "@/server/scheduled";
import { cancelMatchTx } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Vertrag 012, M3c-1 (Plan Punkt 8, AC-6 "Lobby bleibt offen"): Der Planer (Schliessen zur Frist, 1-h-Abbruch, Auto-Buchung) darf ein Kartenspiel mit einer
// fehlgeschlagenen Abbuchung weder absagen noch als gebucht abrechnen, solange Zeilen existieren; das Fensterende behandelt M3c-2.

beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const H = 3_600_000;

/** Kartenspiel in `hoursAhead` Stunden: zwei Spieler, einer hat bezahlt (succeeded), einer ist fehlgeschlagen (Fenster bis `graceMs` ab jetzt). */
async function game(hoursAhead: number, graceMs: number) {
  const m = await makeMatch({ hoursAhead, priceCents: 8000, costCents: 8000 });
  const ok = await addPlayer(m.match.id, m.home.id, "sg");
  const bad = await addPlayer(m.match.id, m.away.id, "sg");
  await db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date(), finalShareCents: 800 }).where(eq(matches.id, m.match.id));
  await db.insert(paymentCharges).values([
    { matchId: m.match.id, userId: ok.id, amountCents: 800, status: "succeeded", idempotencyKey: `sg:${m.match.id}:${ok.id}` },
    { matchId: m.match.id, userId: bad.id, amountCents: 800, status: "failed", failureCode: "card_declined", graceUntil: new Date(Date.now() + graceMs), idempotencyKey: `sg:${m.match.id}:${bad.id}` },
  ]);
  await db.update(matchParticipants).set({ cardStatus: "charged" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, ok.id)));
  await db.update(matchParticipants).set({ cardStatus: "failed" }).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, bad.id)));
  return { ...m, ok, bad };
}
const stateOf = async (id: string) => (await db.select().from(matches).where(eq(matches.id, id)))[0];

describe("Planer und Fenster", () => {
  it("48-h-Frist erreicht, Fenster laeuft: das Spiel bleibt offen (weder abgesagt noch abgerechnet)", async () => {
    const g = await game(72, 90 * 60_000);
    const cancelled = await closeLobbiesAtDeadline(new Date(g.match.startsAt.getTime() - 40 * H)); // nach der Frist (Anstoss minus 48 h)
    expect(cancelled).toBe(0);
    const m = await stateOf(g.match.id);
    expect(m.status).toBe("lobby");
    expect(m.settledAt).toBeNull();
    expect(m.cancelRequestedAt).toBeNull();
  });

  it("1-h-Abbruch (kurzer Vorlauf), Fenster abgelaufen: der Planer sagt NICHT ab und rechnet nicht ab (das Fensterende gehoert M3c-2)", async () => {
    const g = await game(0.9, -60_000);
    const cancelled = await closeLobbiesAtDeadline(new Date());
    expect(cancelled).toBe(0);
    const m = await stateOf(g.match.id);
    expect(m.status).toBe("lobby");
    expect(m.settledAt).toBeNull();
    expect(m.cancelRequestedAt).toBeNull();
  });

  it("nach dem Anstoss: die fehlgeschlagene Zeile bleibt unveraendert (kein after_start), das Spiel wird nicht abgerechnet", async () => {
    const g = await game(72, 90 * 60_000);
    await db.update(matches).set({ startsAt: new Date(Date.now() - 60_000) }).where(eq(matches.id, g.match.id));
    await markAfterStart(new Date());
    const rows = await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id));
    const bad = rows.find((r) => r.userId === g.bad.id)!;
    expect(bad).toMatchObject({ status: "failed", failureCode: "card_declined" });
    expect((await stateOf(g.match.id)).settledAt).toBeNull();
  });

  it("zweite Schicht: cancelMatchTx (auch System/Job, actorId null) wirft bei vorhandenen Abbuchungszeilen und aendert nichts", async () => {
    const g = await game(72, 90 * 60_000);
    const m = await stateOf(g.match.id);
    await expect(db.transaction((tx) => cancelMatchTx(tx, m, null, "Test"))).rejects.toThrow(/Abbuchung/);
    const after = await stateOf(g.match.id);
    expect(after.status).toBe("lobby");
    expect(after.cancelRequestedAt).toBeNull();
  });
});
