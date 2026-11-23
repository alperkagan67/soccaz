import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants } from "@/db/schema";
import { setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, giveCard, makeMatch, useCardMode } from "./helpers";

// AC-4 (Vertrag 004), seit 012 M6b im Kartenmodell: Mit eingeschalteten Zahlungen gibt es "Bereit" erst mit hinterlegter Karte (statt nach dem Bezahlen vom Guthaben).
// Schalter pro Test (Regel 23): useCardMode im beforeEach, Rückbau im afterEach.
let mode: Awaited<ReturnType<typeof useCardMode>>;
beforeEach(async () => {
  mode = await useCardMode();
  await setSetting(null, "min_paid_players", 8);
});
afterEach(async () => {
  await mode.restore();
  await cleanup();
});

const readyAt = async (matchId: string, userId: string) =>
  (await db.select({ readyAt: matchParticipants.readyAt }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0]?.readyAt ?? null;
/** Karte ist am Platz angekommen (wie nach dem Hinterlegen): Profil + card_ready. */
async function cardReady(matchId: string, userId: string) {
  await giveCard(userId);
  await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
}

describe("setReady und Karte", () => {
  it("Zahlungen an, keine Karte: Fehler, nichts gesetzt; mit Karte klappt Bereit, ohne dass etwas bezahlt wird", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);

    await expect(setReady(p.id, m.match.id, true)).rejects.toThrow(/Karte/);
    expect(await readyAt(m.match.id, p.id)).toBeNull();

    await cardReady(m.match.id, p.id);
    await setReady(p.id, m.match.id, true);
    expect(await readyAt(m.match.id, p.id)).toBeInstanceOf(Date);
    const [seat] = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, p.id)));
    expect(seat.paidCents).toBe(0); // Bereit heißt "Karte hinterlegt", bezahlt wird erst bei der Abbuchung
  });

  it("Bereit zurücknehmen braucht keine Karte", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await expect(setReady(p.id, m.match.id, false)).resolves.not.toThrow();
  });

  it("Zahlungen aus: Bereit geht ohne Karte (Gratis)", async () => {
    await setSetting(null, "payments_enabled", false);
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await setReady(p.id, m.match.id, true);
    expect(await readyAt(m.match.id, p.id)).toBeInstanceOf(Date);
  });
});
