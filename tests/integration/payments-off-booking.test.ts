import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, notifications } from "@/db/schema";
import { bookingJobs } from "@/db/schema-finance";
import { getAlerts } from "@/server/finance";
import { cancelMatchTx, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

// 1c-ii (Entscheid t2q 3): Die Reservierung der Halle (Buchungsauftrag "Halle buchen", Rueckzug bei Absage) ist unabhaengig von Guthaben UND von "Zahlungen aus".
// Nur der Geld-Teil (Auszahlung, Provision) entfaellt bei Gratis. Hier: Reservierungsteil.

afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
});

async function confirmedGame(payments: boolean, hoursAhead = 72, withCards = true) {
  await setSetting(null, "payments_enabled", payments);
  const g = await makeMatch({ hoursAhead, priceCents: 8000, costCents: 8000 });
  const all = [g.adminA, g.adminB];
  while (all.length < 10) all.push(await addPlayer(g.match.id, all.length % 2 === 0 ? g.home.id : g.away.id));
  // Karte hinterlegt (nur im Kartenmodell noetig; bei AUS egal)
  if (withCards) await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, g.match.id));
  for (const p of all) await setReady(p.id, g.match.id, true);
  return g;
}
const jobsOf = (matchId: string) => db.select().from(bookingJobs).where(eq(bookingJobs.matchId, matchId));

describe("Halle-Buchung (Reservierung) unabhaengig von Zahlungen", () => {
  for (const payments of [true, false]) {
    it(`payments=${payments ? "AN" : "AUS"}: bestaetigtes Spiel erzeugt genau einen Buchungsauftrag; Mitteilung ohne "bezahlt"; Absage zieht ihn zurueck`, async () => {
      const admin = await makeUser("bk", "admin");
      const g = await confirmedGame(payments);
      expect((await reloadMatch(g.match.id)).status).toBe("confirmed");
      const jobs = await jobsOf(g.match.id);
      expect(jobs).toHaveLength(1);
      const notes = await db.select().from(notifications).where(and(eq(notifications.userId, admin.id), eq(notifications.title, "Halle buchen")));
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((n) => !/bezahlt/i.test(n.body))).toBe(true);
      await db.transaction(async (tx) => cancelMatchTx(tx, await reloadMatch(g.match.id), null, "Test"));
      expect((await jobsOf(g.match.id))[0].status).toBe("withdrawn");
    });
  }
});

describe("Halle-Buchung: Gratis ohne Karte, Idempotenz, Alarm", () => {
  it("payments AUS, ohne hinterlegte Karte: Bestaetigung erzeugt trotzdem den Auftrag (Zusage ist Buchungsbedingung); Bereit aus/an und erneutes Bestaetigen: weiter genau 1 Auftrag", async () => {
    const g = await confirmedGame(false, 72, false);
    expect(await jobsOf(g.match.id)).toHaveLength(1);
    const ids = (await db.select({ id: matchParticipants.userId }).from(matchParticipants).where(eq(matchParticipants.matchId, g.match.id))).map((r) => r.id);
    for (const id of ids) await setReady(id, g.match.id, false); // faellt zurueck in die Lobby
    expect((await reloadMatch(g.match.id)).status).toBe("lobby");
    for (const id of ids) await setReady(id, g.match.id, true); // wieder bestaetigt
    expect((await reloadMatch(g.match.id)).status).toBe("confirmed");
    expect(await jobsOf(g.match.id)).toHaveLength(1);
  });

  it("Alarm \"Halle noch nicht gebucht\" (unter 48 h, kein gebuchter Auftrag) kommt unabhaengig von Zahlungen: payments AUS ja; nach Buchung weg", async () => {
    const g = await confirmedGame(false, 30, false);
    const code = `unbooked-hall:${g.match.id}`;
    expect((await getAlerts()).some((a) => a.code === code)).toBe(true);
    await db.update(bookingJobs).set({ status: "booked" }).where(eq(bookingJobs.matchId, g.match.id));
    expect((await getAlerts()).some((a) => a.code === code)).toBe(false);
  });
});
