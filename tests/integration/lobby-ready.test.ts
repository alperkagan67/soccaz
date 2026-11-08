import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants } from "@/db/schema";
import { creditWallet } from "@/server/ledger";
import { payShare, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// AC-4 (Vertrag 004): Mit eingeschalteten Zahlungen gibt es "Bereit" erst nach der Zahlung des Anteils.
const key = () => `lr-${Math.random().toString(36).slice(2)}`;
const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: key() });
const readyAt = async (matchId: string, userId: string) =>
  (await db.select({ readyAt: matchParticipants.readyAt }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0]?.readyAt ?? null;

beforeAll(async () => {
  await cleanup(); // sauberer Stand: keine Testdaten aus früheren Läufen
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "min_paid_players", 8);
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

describe("setReady und Zahlung", () => {
  it("Zahlungen an, Anteil nicht bezahlt: Fehler; nach der Zahlung klappt Bereit", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);

    await expect(setReady(p.id, m.match.id, true)).rejects.toThrow("Bitte zahle zuerst deinen Anteil");
    expect(await readyAt(m.match.id, p.id)).toBeNull();

    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
    expect(await readyAt(m.match.id, p.id)).toBeInstanceOf(Date);
  });

  it("Bereit zurücknehmen braucht keine Zahlung", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const p = await addPlayer(m.match.id, m.home.id);
    await expect(setReady(p.id, m.match.id, false)).resolves.not.toThrow();
  });

  it("Zahlungen aus: Bereit geht ohne Zahlung", async () => {
    await setSetting(null, "payments_enabled", false);
    try {
      const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
      const p = await addPlayer(m.match.id, m.home.id);
      await setReady(p.id, m.match.id, true);
      expect(await readyAt(m.match.id, p.id)).toBeInstanceOf(Date);
    } finally {
      await setSetting(null, "payments_enabled", true);
    }
  });
});
