import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers } from "@/db/schema";
import { ledgerEntries, receipts } from "@/db/schema-finance";
import { abortDeadline, fixDeadline } from "@/lib/deadlines";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { finalConfirm, joinLobby, leaveLobby, payShare, removeParticipant, setReady } from "@/server/lobby";
import { createPrivateGame, joinPrivateGame } from "@/server/privategame";
import { cancelUnderfilledLobbies, closeLobbiesAtDeadline, settleDueMatches } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const H = 3_600_000;
const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: `dl-${Math.random().toString(36).slice(2)}` });
const bal = (id: string) => walletBalance(db, id);
const statusOf = async (id: string) => (await reloadMatch(id)).status;
const entriesOf = (matchId: string) => db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, matchId));
const receiptsOf = (matchId: string) => db.select().from(receipts).where(eq(receipts.matchId, matchId));

/** Teamspiel (neues Modell), Preis 8000, `startsInH` Stunden bis Anstoß, bei der Anlage `createdAgoH` Stunden her: n Spieler, alle mit Guthaben. */
async function teamGame(startsInH: number, createdAgoH = 0, n = 10) {
  const m = await makeMatch({ hoursAhead: startsInH, priceCents: 8000, costCents: 8000 });
  if (createdAgoH > 0) await db.update(matches).set({ createdAt: new Date(Date.now() - createdAgoH * H) }).where(eq(matches.id, m.match.id));
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await fund(p.id, 3000);
  return { ...m, all };
}
const payAll = async (g: Awaited<ReturnType<typeof teamGame>>, who = g.all) => {
  for (const p of who) await payShare(p.id, g.match.id);
};
const readyAll = async (g: Awaited<ReturnType<typeof teamGame>>) => {
  for (const p of g.all) await setReady(p.id, g.match.id, true);
};
const bothCaptains = async (g: Awaited<ReturnType<typeof teamGame>>) => {
  await finalConfirm(g.adminA.id, g.match.id);
  await finalConfirm(g.adminB.id, g.match.id);
};
const startOf = async (id: string) => (await reloadMatch(id)).startsAt;

describe("Frist-Regel: 48-h-Schließung (Anlage mit mindestens 48 Stunden Vorlauf)", () => {
  it("alle bezahlt und beide Captains bereit: zur Frist wird genau einmal gebucht, nicht vorher, auch bei parallelen Läufen", async () => {
    const g = await teamGame(72);
    await payAll(g);
    await readyAll(g);
    await bothCaptains(g);
    const start = await startOf(g.match.id);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull(); // lange Vorlauf: das zweite Bereit fixiert nur den Preis
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() - 60_000)); // eine Minute vor der Frist
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
    const at = new Date(fixDeadline(start).getTime() + 60_000);
    await Promise.all([closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at)]);
    await closeLobbiesAtDeadline(at); // nachgeholt: nichts passiert
    const m = await reloadMatch(g.match.id);
    expect(m.settledAt).not.toBeNull();
    expect(m.finalShareCents).toBe(800);
    expect(m.status).not.toBe("cancelled");
    expect(await receiptsOf(g.match.id)).toHaveLength(10); // genau eine Abrechnung
    expect((await entriesOf(g.match.id)).filter((e) => e.kind === "refund")).toHaveLength(0);
    for (const p of g.all) expect(await bal(p.id)).toBe(3000 - 800);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("nicht alle bezahlt: zur Frist wird abgesagt, alle bekommen ihren Anteil zurück, genau einmal (auch parallel), Hauptbuch ausgeglichen", async () => {
    const g = await teamGame(72);
    await payAll(g, g.all.slice(0, 9)); // einer zahlt nicht
    const at = new Date(fixDeadline(await startOf(g.match.id)).getTime() + 60_000);
    await closeLobbiesAtDeadline(new Date(at.getTime() - 120_000));
    expect(await statusOf(g.match.id)).not.toBe("cancelled"); // vor der Frist offen
    await Promise.all([closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at)]);
    expect(await statusOf(g.match.id)).toBe("cancelled");
    for (const p of g.all) expect(await bal(p.id)).toBe(3000);
    expect((await entriesOf(g.match.id)).filter((e) => e.kind === "refund")).toHaveLength(9);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("alle bezahlt, aber nur ein Captain bereit: zur Frist abgesagt und erstattet", async () => {
    const g = await teamGame(72);
    await payAll(g);
    await readyAll(g);
    await finalConfirm(g.adminA.id, g.match.id); // das Gast-Team bestätigt nicht
    await closeLobbiesAtDeadline(new Date(fixDeadline(await startOf(g.match.id)).getTime() + 60_000));
    expect(await statusOf(g.match.id)).toBe("cancelled");
    for (const p of g.all) expect(await bal(p.id)).toBe(3000);
  });

  it("keine 24-h-Prüfung und keine 1-h-Absage mehr: ein gebuchtes Spiel wird weder neu abgerechnet noch abgesagt", async () => {
    const g = await teamGame(72);
    await payAll(g);
    await readyAll(g);
    await bothCaptains(g);
    const start = await startOf(g.match.id);
    await settleDueMatches(new Date(start.getTime() - 20 * H)); // die alte 24-h-Abrechnung fasst neue Spiele nicht an
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull();
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    const settledAt = (await reloadMatch(g.match.id)).settledAt;
    await cancelUnderfilledLobbies(new Date(start.getTime() - 23 * H));
    await closeLobbiesAtDeadline(new Date(abortDeadline(start).getTime() + 60_000));
    await settleDueMatches(new Date(start.getTime() - 20 * H));
    const m = await reloadMatch(g.match.id);
    expect(m.status).not.toBe("cancelled");
    expect(m.settledAt?.getTime()).toBe(settledAt?.getTime());
    expect(await receiptsOf(g.match.id)).toHaveLength(10);
  });

  it("die alte 24-h-Prüfung sagt neue Spiele nicht mehr ab: Lobby ohne genug Bereite bleibt bis zur 48-h-Frist offen", async () => {
    const g = await teamGame(72);
    await payAll(g);
    // 30 Stunden vor Anstoß wäre die alte Frist (24 h) schon erreicht, die neue Frist (48 h) ist aber erst im nächsten Lauf nachgeholt
    const start = await startOf(g.match.id);
    await cancelUnderfilledLobbies(new Date(start.getTime() - 60 * H)); // vor jeder Frist: nichts
    expect(await statusOf(g.match.id)).not.toBe("cancelled");
    await cancelUnderfilledLobbies(new Date(start.getTime() - 40 * H)); // nach der 48-h-Frist: die neue Regel sagt ab (nicht bereit)
    expect(await statusOf(g.match.id)).toBe("cancelled");
  });
});

describe("Frist-Regel: Sperre der Teilnehmerliste", () => {
  it("ab 48 Stunden vor Anstoß (Anlage mit langem Vorlauf): Austritt, Rauswurf und Beitritt abgelehnt, keine Erstattung", async () => {
    const g = await teamGame(47, 50); // 97 Stunden Vorlauf bei der Anlage, jetzt noch 47
    await payAll(g);
    const newcomer = await makeUser("nc");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: newcomer.id, role: "player" });
    const before = (await entriesOf(g.match.id)).length;
    await expect(leaveLobby(g.all[9].id, g.match.id)).rejects.toThrow(/gesperrt/);
    await expect(removeParticipant(g.adminB.id, g.match.id, g.all[9].id)).rejects.toThrow(/gesperrt/);
    await expect(joinLobby(newcomer.id, g.match.id)).rejects.toThrow(/gesperrt/);
    expect((await entriesOf(g.match.id)).length).toBe(before);
    expect(await bal(g.all[9].id)).toBe(3000 - 800);
  });

  it("vor der Frist bleibt die Liste offen: Austritt erstattet sofort, Beitritt geht", async () => {
    const g = await teamGame(60, 20); // 80 Stunden Vorlauf, jetzt noch 60
    await payAll(g);
    await leaveLobby(g.all[9].id, g.match.id);
    expect(await bal(g.all[9].id)).toBe(3000);
    const newcomer = await makeUser("nc");
    await db.insert(teamMembers).values({ teamId: g.away.id, userId: newcomer.id, role: "player" });
    await joinLobby(newcomer.id, g.match.id);
  });

  it("Anlage unter 48 Stunden Vorlauf: Austritt und Rauswurf von Anfang an gesperrt, Beitritt und Zahlung offen", async () => {
    const g = await teamGame(30, 0, 8);
    const newcomer = await makeUser("nc");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: newcomer.id, role: "player" });
    await fund(newcomer.id, 3000);
    await joinLobby(newcomer.id, g.match.id); // offen
    await payShare(newcomer.id, g.match.id); // Zahlung offen
    await expect(leaveLobby(newcomer.id, g.match.id)).rejects.toThrow(/gesperrt/);
    await expect(removeParticipant(g.adminA.id, g.match.id, newcomer.id)).rejects.toThrow(/gesperrt/);
    expect(await bal(newcomer.id)).toBeLessThan(3000); // kein Geld zurück
  });

  it("ohne eingeschaltete Zahlungen läuft die Lobby wie bisher: Austritt unter 48 Stunden bleibt möglich, die Jobs rühren nichts an", async () => {
    await setSetting(null, "payments_enabled", false);
    try {
      const g = await teamGame(10, 0, 4);
      await leaveLobby(g.all[3].id, g.match.id);
      expect(await closeLobbiesAtDeadline(new Date(Date.now() + 9.5 * H))).toBe(0);
      expect(await statusOf(g.match.id)).not.toBe("cancelled");
    } finally {
      await setSetting(null, "payments_enabled", true);
    }
  });
});

describe("Frist-Regel: Anlage unter 48 Stunden (Sofortbuchung und 1-h-Abbruch)", () => {
  it("gebucht wird sofort mit dem zweiten Bereit (vorher nicht), genau einmal auch bei parallelen Bestätigungen; die Liste ist danach ganz gesperrt", async () => {
    const g = await teamGame(30);
    await payAll(g);
    await readyAll(g);
    await finalConfirm(g.adminA.id, g.match.id);
    expect((await reloadMatch(g.match.id)).settledAt).toBeNull(); // erst ein Captain
    await Promise.allSettled([finalConfirm(g.adminB.id, g.match.id), finalConfirm(g.adminB.id, g.match.id)]);
    const m = await reloadMatch(g.match.id);
    expect(m.settledAt).not.toBeNull();
    expect(m.finalShareCents).toBe(800);
    expect(await receiptsOf(g.match.id)).toHaveLength(10);
    const newcomer = await makeUser("nc");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: newcomer.id, role: "player" });
    await expect(joinLobby(newcomer.id, g.match.id)).rejects.toThrow(/gesperrt/);
    // ein gebuchtes Spiel wird vom 1-h-Abbruch nie abgesagt
    await closeLobbiesAtDeadline(new Date(abortDeadline(m.startsAt).getTime() + 60_000));
    expect(await statusOf(g.match.id)).not.toBe("cancelled");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("keine Abrechnung ohne zweites Bereit, und keine 24-h-Absage: die Lobby bleibt bis 1 Stunde vor Anstoß offen", async () => {
    const g = await teamGame(30);
    await payAll(g);
    const start = await startOf(g.match.id);
    await cancelUnderfilledLobbies(new Date(start.getTime() - 10 * H)); // alte Frist (24 h vor Anstoß) längst erreicht
    expect(await statusOf(g.match.id)).not.toBe("cancelled");
    await closeLobbiesAtDeadline(new Date(abortDeadline(start).getTime() - 60_000)); // eine Minute vor dem Abbruch
    expect(await statusOf(g.match.id)).not.toBe("cancelled");
  });

  it("1 Stunde vor Anstoß: nicht alles bezahlt oder nicht beide bereit -> abgesagt und alle erstattet, genau einmal (parallel), Hauptbuch ausgeglichen", async () => {
    const g = await teamGame(30);
    await payAll(g, g.all.slice(0, 7));
    const at = new Date(abortDeadline(await startOf(g.match.id)).getTime() + 60_000);
    await Promise.all([closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at), closeLobbiesAtDeadline(at)]);
    expect(await statusOf(g.match.id)).toBe("cancelled");
    for (const p of g.all) expect(await bal(p.id)).toBe(3000);
    expect((await entriesOf(g.match.id)).filter((e) => e.kind === "refund")).toHaveLength(7);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("alle bezahlt, aber ein Captain nicht bereit: 1 Stunde vor Anstoß abgesagt", async () => {
    const g = await teamGame(30);
    await payAll(g);
    await readyAll(g);
    await finalConfirm(g.adminA.id, g.match.id);
    await closeLobbiesAtDeadline(new Date(abortDeadline(await startOf(g.match.id)).getTime() + 60_000));
    expect(await statusOf(g.match.id)).toBe("cancelled");
    for (const p of g.all) expect(await bal(p.id)).toBe(3000);
  });
});

describe("Frist-Regel: Privatspiel und Altspiele", () => {
  const priv = async (startsInH: number) => {
    const organizer = await makeUser("dlorg");
    const { match, token } = await createPrivateGame(organizer.id, { city: "Berlin", venueText: "Halle", startsAt: new Date(Date.now() + startsInH * H), durationMin: 60, maxPlayers: 10, rentCents: 12_000 });
    return { organizer, match, token };
  };

  it("AC-17: ein Privatspiel mit 30 Stunden Vorlauf wird angelegt, ein Anstoß in unter einer Stunde abgelehnt; Beitritt offen, Austritt gesperrt", async () => {
    await expect(createPrivateGame((await makeUser("dlx")).id, { city: "Berlin", venueText: "Halle", startsAt: new Date(Date.now() + 30 * 60_000), durationMin: 60, rentCents: 0 })).rejects.toThrow(/Stunde/);
    const g = await priv(30);
    const p = await makeUser("dlp");
    await joinPrivateGame(p.id, g.token);
    await expect(leaveLobby(p.id, g.match.id)).rejects.toThrow(/gesperrt/);
  });

  it("Privatspiel mit langem Vorlauf: Beitritt nach der 48-h-Frist abgelehnt, davor offen", async () => {
    const open = await priv(72);
    await joinPrivateGame((await makeUser("dlp")).id, open.token);
    const closed = await priv(72);
    await db.update(matches).set({ startsAt: new Date(Date.now() + 40 * H), createdAt: new Date(Date.now() - 40 * H) }).where(eq(matches.id, closed.match.id));
    await expect(joinPrivateGame((await makeUser("dlp")).id, closed.token)).rejects.toThrow(/gesperrt/);
  });

  it("neue Privatspiele fallen nicht unter die alte 24-h-Mietprüfung; Altspiele (legacy_share_model) schon", async () => {
    const { cancelUncoveredPrivateGames } = await import("@/server/privategame");
    const fresh = await priv(72);
    const old = await priv(72);
    await db.update(matches).set({ legacyShareModel: true }).where(eq(matches.id, old.match.id));
    const due = new Date(Date.now() + 49 * H);
    await cancelUncoveredPrivateGames(due);
    expect(await statusOf(fresh.match.id)).not.toBe("cancelled");
    // die Altspiele prüfen weiter bis zu ihrem Anstoß; nicht gedeckt (nichts bezahlt) heißt Absage, wenn Zahlungen laufen
    const afterDeadline = new Date(Date.now() + 49 * H);
    await cancelUncoveredPrivateGames(afterDeadline);
    expect(await statusOf(old.match.id)).toBe("cancelled");
  });

  it("neue Privatspiele werden zur Frist abgesagt, wenn nicht alles bezahlt ist; Altspiel-Teamspiele bleiben bei ihrem Pfad", async () => {
    const g = await priv(72);
    await closeLobbiesAtDeadline(new Date(fixDeadline(g.match.startsAt).getTime() + 60_000));
    expect(await statusOf(g.match.id)).toBe("cancelled");
    const legacy = await teamGame(72, 0, 4);
    await db.update(matches).set({ legacyShareModel: true }).where(eq(matches.id, legacy.match.id));
    await closeLobbiesAtDeadline(new Date(fixDeadline(await startOf(legacy.match.id)).getTime() + 60_000));
    expect(await statusOf(legacy.match.id)).not.toBe("cancelled");
    expect(await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, legacy.match.id)))).toHaveLength(4);
  });
});
