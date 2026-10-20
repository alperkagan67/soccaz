import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matchEvents, matchParticipants, matchResults, matches, notifications } from "@/db/schema";
import { confirmResult, submitScore } from "@/server/results";
import { addClip, cleanClipUrl, deleteClip, listClips, MAX_CLIPS_PER_USER } from "@/server/clips";
import { finalConfirm, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

beforeAll(async () => {
  await setSetting(null, "payments_enabled", false); // hier geht es nur um die Bestätigung, nicht um Geld
});
afterAll(cleanup);

/** Ein Spiel mit je 4 Spielern pro Team (Captain plus 3), noch niemand bereit. */
async function fullMatch() {
  const m = await makeMatch();
  const players = [m.adminA, m.adminB];
  for (const teamId of [m.home.id, m.away.id]) for (let i = 0; i < 3; i++) players.push(await addPlayer(m.match.id, teamId, "fp"));
  return { ...m, players };
}

describe("Letzte Bestätigung der Captains", () => {
  it("erst wenn alle im Team bereit sind; beide Captains bestätigen; wer wieder unbereit wird, nimmt die Bestätigung zurück", async () => {
    const m = await fullMatch();
    const id = m.match.id;
    await expect(finalConfirm(m.adminA.id, id)).rejects.toThrow(/bereit/); // noch niemand bereit
    for (const p of m.players.filter((x) => x.id !== m.players[4].id)) await setReady(p.id, id, true);
    await expect(finalConfirm(m.adminA.id, id)).rejects.toThrow(/bereit/); // ein Spieler im Heimteam fehlt noch
    await setReady(m.players[4].id, id, true);

    const stranger = await makeUser("fremd");
    await expect(finalConfirm(stranger.id, id)).rejects.toThrow(/Captain/);
    await expect(finalConfirm(m.players[2].id, id)).rejects.toThrow(/Captain/); // ein normaler Spieler darf nicht

    await finalConfirm(m.adminA.id, id);
    let cur = await reloadMatch(id);
    expect(cur.homeFinalAt).not.toBeNull();
    expect(cur.awayFinalAt).toBeNull();
    await finalConfirm(m.adminB.id, id);
    cur = await reloadMatch(id);
    expect(cur.awayFinalAt).not.toBeNull();
    expect((await db.select().from(notifications).where(eq(notifications.userId, m.adminA.id))).some((n) => n.url === `/lobby/${id}/uebersicht`)).toBe(true);

    // ein Spieler im Heimteam wird wieder unbereit: nur die Bestätigung seines Captains verfällt
    await setReady(m.players[2].id, id, false);
    cur = await reloadMatch(id);
    expect(cur.homeFinalAt).toBeNull();
    expect(cur.awayFinalAt).not.toBeNull();
  });

  it("mit eingeschalteten Zahlungen müssen alle bezahlt haben", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const m = await fullMatch();
      await db.update(matchParticipants).set({ readyAt: new Date() }).where(eq(matchParticipants.matchId, m.match.id)); // bereit, aber nicht bezahlt
      await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow(/bereit und bezahlt/);
      await db.update(matchParticipants).set({ paidCents: 1000, paidAt: new Date() }).where(eq(matchParticipants.matchId, m.match.id));
      await finalConfirm(m.adminA.id, m.match.id);
      expect((await reloadMatch(m.match.id)).homeFinalAt).not.toBeNull();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("zu wenige Spieler reichen nicht", async () => {
    const m = await makeMatch();
    await setReady(m.adminA.id, m.match.id, true);
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow(/mindestens 4/);
  });
});

describe("Clips", () => {
  it("nur Spieler, nur ab dem Anstoß, nur https, begrenzte Zahl, löschen nur eigene", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    await expect(addClip(m.adminA.id, m.match.id, { url: "https://youtu.be/abc", title: "Tor" })).rejects.toThrow(/ab dem Anstoß/);
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.match.id));

    const stranger = await makeUser("fremd");
    await expect(addClip(stranger.id, m.match.id, { url: "https://youtu.be/abc", title: "Tor" })).rejects.toThrow(/Spieler dieses Spiels/);
    await expect(addClip(m.adminA.id, m.match.id, { url: "http://youtu.be/abc", title: "Tor" })).rejects.toThrow(/https/);
    await expect(addClip(m.adminA.id, m.match.id, { url: "kein link", title: "Tor" })).rejects.toThrow(/gültiger Link/);
    await expect(addClip(m.adminA.id, m.match.id, { url: "https://youtu.be/abc", title: "  " })).rejects.toThrow(/Titel/);

    await addClip(m.adminA.id, m.match.id, { url: "https://youtu.be/abc", title: "Tor des Spiels" });
    const [clip] = await listClips(m.match.id);
    expect(clip).toMatchObject({ title: "Tor des Spiels", url: "https://youtu.be/abc", userId: m.adminA.id });
    await expect(deleteClip(m.adminB.id, clip.id, false)).rejects.toThrow(/eigene/);
    for (let i = 1; i < MAX_CLIPS_PER_USER; i++) await addClip(m.adminA.id, m.match.id, { url: `https://youtu.be/x${i}`, title: `Clip ${i}` });
    await expect(addClip(m.adminA.id, m.match.id, { url: "https://youtu.be/zuviel", title: "Zu viel" })).rejects.toThrow(/höchstens/);
    await deleteClip(m.adminA.id, clip.id, false);
    expect(await listClips(m.match.id)).toHaveLength(MAX_CLIPS_PER_USER - 1);
    expect(cleanClipUrl(" https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
  });
});

describe("Ergebnis per Pop-up", () => {
  it("Tore mit Torschütze eintragen meldet das Ergebnis, nur der andere Captain bestätigt", async () => {
    const m = await makeMatch();
    const scorer = await addPlayer(m.match.id, m.home.id, "tor");
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(matches.id, m.match.id)); // das Spiel ist Tage her: Eintragen geht trotzdem
    await expect(submitScore(m.adminA.id, m.match.id, [{ teamId: m.home.id, scorerId: m.adminB.id }])).rejects.toThrow(/nicht zum Team/); // Torschütze aus dem anderen Team
    await submitScore(m.adminA.id, m.match.id, [{ teamId: m.home.id, scorerId: scorer.id }, { teamId: m.home.id }, { teamId: m.away.id }]);
    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.match.id));
    expect(events.filter((e) => e.type === "goal")).toHaveLength(3);
    expect(events.some((e) => e.userId === scorer.id)).toBe(true);
    const [r] = await db.select().from(matchResults).where(eq(matchResults.matchId, m.match.id));
    expect(r).toMatchObject({ homeScore: 2, awayScore: 1, confirmedHome: true, confirmedAway: false });
    await expect(confirmResult(m.adminA.id, m.match.id)).rejects.toThrow(/andere Team/); // der Melder kann nicht selbst bestätigen
    await confirmResult(m.adminB.id, m.match.id);
    expect((await reloadMatch(m.match.id)).status).toBe("played");
  });
});
