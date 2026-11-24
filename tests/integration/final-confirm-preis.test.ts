import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches } from "@/db/schema";
import { finalConfirm, setReady } from "@/server/lobby";
import { priceFor } from "@/server/pricing";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch } from "./helpers";

// Backlog 233 (R-T365d), Entscheid t2q: im Kartenmodell wird die letzte Bestaetigung der Captains (= zahlungspflichtig zusagen) serverseitig ABGEWIESEN, solange der Preis unbekannt ist;
// Preis 0 (kostenlos) und Preis > 0 gehen wie bisher; ausserhalb des Kartenmodells (Gratis, Pause) entscheidet der Preis nicht ueber diesen Knopf.
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
  expect(await priceFor(db, null, 37), "Voraussetzung der Tests: fuer 37 Minuten gibt es keine Preisregel").toBeNull(); // sonst waeren die Faelle mit unbekanntem Preis still falsch
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const giveCard = (matchId: string, userId: string) => db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));

/** Komplette Teams (je 5 bereit, mit Karte) bei Preis `priceCents`. */
async function completeGame(priceCents: number) {
  const m = await makeMatch({ hoursAhead: 72, priceCents, costCents: priceCents });
  const all = [m.adminA, m.adminB];
  while (all.length < 10) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) {
    await giveCard(m.match.id, p.id);
    await setReady(p.id, m.match.id, true);
  }
  return m;
}
/** Preis unbekannt: am Spiel kein Preis und eine Dauer ohne Preisregel (die Seite zeigt dann "Der Preis steht noch nicht fest"). */
const priceUnknown = (matchId: string) => db.update(matches).set({ priceCents: null, costCents: null, durationMin: 37 }).where(eq(matches.id, matchId));
const finalAudits = async (matchId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entityId, matchId), eq(auditLog.action, "lobby.final")))).length;
const homeFinal = async (matchId: string) => (await db.select().from(matches).where(eq(matches.id, matchId)))[0].homeFinalAt;

describe("finalConfirm: Preis-Matrix im Kartenmodell", () => {
  it("Preis unbekannt (null, keine Preisregel): abgewiesen, nichts gesetzt, kein Protokoll; die Meldung nennt den fehlenden Preis (vor allen anderen Pruefungen)", async () => {
    const g = await completeGame(8000);
    await priceUnknown(g.match.id);
    await expect(finalConfirm(g.adminA.id, g.match.id)).rejects.toThrow(/Preis steht noch nicht fest/);
    expect(await homeFinal(g.match.id)).toBeNull();
    expect(await finalAudits(g.match.id)).toBe(0);
  });

  it("Preis unbekannt und Team noch nicht komplett: ebenfalls die Preis-Meldung (die Preisprüfung steht vor der Teamprüfung)", async () => {
    const m = await makeMatch({ hoursAhead: 72, priceCents: 8000, costCents: 8000 });
    await priceUnknown(m.match.id);
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow(/Preis steht noch nicht fest/);
  });

  it("Preis 0 (kostenlos): die Bestaetigung geht (keine Zahlungszusage)", async () => {
    const g = await completeGame(0);
    await finalConfirm(g.adminA.id, g.match.id);
    expect(await homeFinal(g.match.id)).not.toBeNull();
    expect(await finalAudits(g.match.id)).toBe(1);
  });

  it("Preis > 0: die Bestaetigung geht wie bisher", async () => {
    const g = await completeGame(8000);
    await finalConfirm(g.adminA.id, g.match.id);
    expect(await homeFinal(g.match.id)).not.toBeNull();
  });

  it("Preis unbekannt, aber ein Preis aus der Standardregel (Anzeige-Preis): die Bestaetigung geht (die Seite zeigt diesen Preis)", async () => {
    const g = await completeGame(8000);
    await db.update(matches).set({ priceCents: null, costCents: null }).where(eq(matches.id, g.match.id)); // Dauer 60 hat eine Standardregel
    await finalConfirm(g.adminA.id, g.match.id);
    expect(await homeFinal(g.match.id)).not.toBeNull();
  });

  it("Karte AUS (Pause) und Preis unbekannt: keine Preis-Meldung dieses Knopfes (ausserhalb des Kartenmodells entscheidet der Preis hier nicht)", async () => {
    const g = await completeGame(8000);
    await setSetting(null, "card_payments_enabled", false);
    await priceUnknown(g.match.id);
    const r = await finalConfirm(g.adminA.id, g.match.id).then(() => "ok", (e: Error) => e.message);
    expect(String(r)).not.toMatch(/Preis steht noch nicht fest/);
  });

  it("Gratis (Zahlungen AUS) und Preis unbekannt: keine Preis-Meldung dieses Knopfes", async () => {
    const g = await completeGame(8000);
    await setSetting(null, "payments_enabled", false);
    await priceUnknown(g.match.id);
    const r = await finalConfirm(g.adminA.id, g.match.id).then(() => "ok", (e: Error) => e.message);
    expect(String(r)).not.toMatch(/Preis steht noch nicht fest/);
    await setSetting(null, "payments_enabled", true);
  });
});
