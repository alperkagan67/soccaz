import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches } from "@/db/schema";
import { ratingHistory } from "@/db/schema-community";
import { getRatingReveal } from "@/server/rating-reveal";
import { addPlayer, cleanup, makeMatch, makeUser } from "./helpers";

// Vertrag 013 v3, AC-20 (Datenteil) und AC-17: Wertungsänderung nach bestätigtem Ergebnis, NUR für den Betrachter selbst.
afterAll(cleanup);

/** Gespieltes Spiel mit zwei Teilnehmern (je eine Verlaufszeile); `elo` je Person (vorher, nachher). */
async function playedGame(mine: [number, number], theirs: [number, number]) {
  const m = await makeMatch({ hoursAhead: -3 });
  const me = m.adminA;
  const opp = await addPlayer(m.match.id, m.away.id, "gegner");
  await db.update(matches).set({ status: "played" }).where(eq(matches.id, m.match.id));
  await db.insert(ratingHistory).values([
    { kind: "user", subjectId: me.id, matchId: m.match.id, eloBefore: mine[0], eloAfter: mine[1] },
    { kind: "user", subjectId: opp.id, matchId: m.match.id, eloBefore: theirs[0], eloAfter: theirs[1] },
  ]);
  return { ...m, me, opp };
}

describe("getRatingReveal: nur die eigene Änderung", () => {
  it("der Spieler sieht Wertung und Stufe vorher/nachher (1000 -> 1090: 50 -> 61, Aufstieg Kreide -> Rasen) und seine gefilterte Karte", async () => {
    const g = await playedGame([1000, 1090], [1000, 910]);
    const r = await getRatingReveal(g.match.id, g.me.id);
    expect(r).not.toBeNull();
    expect(r!.before).toEqual({ rating: 50, tier: "kreide" });
    expect(r!.after).toEqual({ rating: 61, tier: "rasen" });
    expect(r!.card).toMatchObject({ kind: "full", rating: 61, tier: "rasen" });
  });

  it("kein Leck: das Objekt enthält weder die Elo-Rohwerte noch Name oder Wertung des Gegners", async () => {
    const g = await playedGame([1000, 1090], [1234, 1160]);
    const text = JSON.stringify(await getRatingReveal(g.match.id, g.me.id));
    for (const verboten of ["1090", "1234", "1160", "910", g.opp.id, g.opp.name ?? "gegner", "eloBefore", "eloAfter"]) expect(text, verboten).not.toContain(verboten);
    // der Gegner bekommt seine eigene Änderung, nicht die des Spielers
    const theirs = await getRatingReveal(g.match.id, g.opp.id);
    expect(theirs!.after.rating).toBe(ratingOf(1160));
    expect(theirs!.after.rating).not.toBe(ratingOf(1090));
  });

  it("null: nicht angemeldet, leere/kaputte Kennung, Nicht-Teilnehmer", async () => {
    const g = await playedGame([1000, 1090], [1000, 910]);
    const stranger = await makeUser("fremd");
    for (const viewer of [null, undefined, "", stranger.id]) expect(await getRatingReveal(g.match.id, viewer as never), String(viewer)).toBeNull();
    expect(await getRatingReveal(g.match.id, 7 as never)).toBeNull();
  });

  it("null: Spiel nicht gespielt (Lobby, bestätigt, abgesagt), Spieler nicht erschienen, Spieler ohne Verlaufszeile, Privatspiel ohne Elo", async () => {
    const g = await playedGame([1000, 1090], [1000, 910]);
    for (const status of ["lobby", "confirmed", "cancelled"] as const) {
      await db.update(matches).set({ status }).where(eq(matches.id, g.match.id));
      expect(await getRatingReveal(g.match.id, g.me.id), status).toBeNull();
    }
    await db.update(matches).set({ status: "played" }).where(eq(matches.id, g.match.id));
    expect(await getRatingReveal(g.match.id, g.me.id)).not.toBeNull();
    await db.update(matchParticipants).set({ noShow: true }).where(eq(matchParticipants.userId, g.me.id));
    expect(await getRatingReveal(g.match.id, g.me.id)).toBeNull();
    await db.update(matchParticipants).set({ noShow: false }).where(eq(matchParticipants.userId, g.me.id));
    await db.delete(ratingHistory).where(eq(ratingHistory.subjectId, g.me.id));
    expect(await getRatingReveal(g.match.id, g.me.id)).toBeNull(); // Privatspiele und alte Spiele ohne Verlauf: nichts erfinden
  });

  it("Teilnehmer ohne Team (freier Ersatzspieler, team_id null): null, auch mit Verlaufszeile", async () => {
    const g = await playedGame([1000, 1090], [1000, 910]);
    await db.update(matchParticipants).set({ teamId: null }).where(eq(matchParticipants.userId, g.me.id));
    expect(await getRatingReveal(g.match.id, g.me.id)).toBeNull();
  });

  it("zwei Verlaufszeilen zum selben Spiel und Spieler (Dublette): die jüngste gilt, das Ergebnis ist stabil", async () => {
    const g = await playedGame([1000, 1090], [1000, 910]);
    await db.insert(ratingHistory).values({ kind: "user", subjectId: g.me.id, matchId: g.match.id, eloBefore: 1000, eloAfter: 1200, at: new Date(Date.now() + 60_000) });
    for (let i = 0; i < 3; i++) expect((await getRatingReveal(g.match.id, g.me.id))!.after.rating).toBe(ratingOf(1200));
  });

  it("unbekannte Spiel-ID: null, kein Fehler", async () => {
    const u = await makeUser("x");
    expect(await getRatingReveal("00000000-0000-0000-0000-000000000000", u.id)).toBeNull();
  });
});

const ratingOf = (elo: number) => Math.min(99, Math.max(0, Math.round(50 + (elo - 1000) / 8)));
