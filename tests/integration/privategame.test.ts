import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { shuffle } from "@/lib/tournament";
import { db } from "@/db";
import { matchParticipants, matches, teams } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { gameInvites } from "@/db/schema-matchmaking";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { assignSubstitute, finalConfirm, getLobby, payShare, randomSplit, setReady, unassignParticipant } from "@/server/lobby";
import { createPrivateGame, getGameInvitePreview, getGameInviteToken, joinPrivateGame, parseRentInput } from "@/server/privategame";
import { listBoard } from "@/server/board";
import { getTeamProfile } from "@/server/profiles";
import { getTeamBySlug, listMyTeams } from "@/server/teams";
import { myAdminTeams } from "@/server/requests";
import { submitResult } from "@/server/results";
import { setSetting } from "@/server/settings";
import { settleMatch } from "@/server/wallet";
import { cleanup, makeUser, reloadMatch } from "./helpers";

beforeAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "min_paid_players", 8);
});
afterAll(cleanup);

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const base = { city: "Essen", venueText: "Soccerhalle Test", startsAt: days(4), durationMin: 60, rentCents: 12_000 };
let key = 0;
const fund = (userId: string, cents: number) => db.transaction((tx) => creditWallet(tx, userId, { from: "bank", amountCents: cents, kind: "adjustment", idempotencyKey: `pg-${userId}-${++key}` }));

/** Ein Privatspiel mit `n` weiteren Spielern, die über den Link beigetreten sind. */
async function game(n = 9, over: Partial<Parameters<typeof createPrivateGame>[1]> = {}) {
  const organizer = await makeUser("pvorg");
  const { match, token } = await createPrivateGame(organizer.id, { ...base, ...over });
  const players = [organizer];
  for (let i = 0; i < n; i++) {
    const p = await makeUser("pvp");
    await joinPrivateGame(p.id, token);
    players.push(p);
  }
  return { organizer, match, token, players };
}

describe("Privatspiel anlegen", () => {
  it("Eingaben werden geprüft; zwei unsichtbare Spiel-Teams; nicht öffentlich; Veranstalter ist drin", async () => {
    const o = await makeUser("pvo");
    await expect(createPrivateGame(o.id, { ...base, durationMin: 75 })).rejects.toThrow(/60 oder 90/);
    await expect(createPrivateGame(o.id, { ...base, maxPlayers: 9 })).rejects.toThrow(/gerade/);
    await expect(createPrivateGame(o.id, { ...base, maxPlayers: 30 })).rejects.toThrow(/gerade/);
    await expect(createPrivateGame(o.id, { ...base, startsAt: new Date(Date.now() + 60_000) })).rejects.toThrow(/Stunde/);
    await expect(createPrivateGame(o.id, { ...base, venueText: "  " })).rejects.toThrow(/Halle/);
    await expect(createPrivateGame(o.id, { ...base, rentCents: -5 })).rejects.toThrow(/Hallenmiete/);

    const { match, token } = await createPrivateGame(o.id, base);
    expect(match).toMatchObject({ kind: "private", visibility: "private", maxPlayers: 10, status: "lobby", schedulingOpen: false });
    expect(token).toBeTruthy();
    const ts = await db.select().from(teams).where(eq(teams.createdBy, o.id));
    expect(ts).toHaveLength(2);
    expect(ts.every((t) => t.kind === "private")).toBe(true);
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(parts).toMatchObject([{ userId: o.id, teamId: null }]);
    expect(await getGameInviteToken(o.id, match.id)).toBe(token);
    expect(await getGameInviteToken((await makeUser("fremd")).id, match.id)).toBeNull(); // nur der Veranstalter sieht den Link
  });

  it("erscheint nirgends öffentlich: nicht in der Lobby-Liste, nicht in Team-Listen, keine Teamseite", async () => {
    const { organizer, match } = await game(2);
    const board = await listBoard({});
    expect(board.some((e) => e.kind === "match" && e.id === match.id)).toBe(false);
    expect((await listMyTeams(organizer.id)).length).toBe(0);
    expect((await myAdminTeams(organizer.id)).length).toBe(0);
    const [t] = await db.select().from(teams).where(eq(teams.id, match.homeTeamId));
    expect(await getTeamBySlug(t.slug)).toBeNull();
    expect(await getTeamProfile(t.slug)).toBeNull(); // auch die Teamseite gibt es nicht
    // Fremde sehen die Lobby nicht (Gäste erst nach Beitritt über den Link)
    const stranger = await makeUser("fremd");
    const view = await getLobby(match.id, { id: stranger.id, role: "player" });
    expect(view!.viewer!.participant).toBeNull();
    expect(view!.viewer!.membershipTeamId).toBeNull();
  });
});

describe("Einladungslink", () => {
  it("beitreten, nicht doppelt, Platzgrenze, abgelaufen, abgesagt", async () => {
    const { organizer, match, token } = await game(8); // 9 von 10 Plätzen
    expect((await getGameInvitePreview(token)).status).toBe("valid");
    const p = await makeUser("pvx");
    expect(await joinPrivateGame(p.id, token)).toEqual({ matchId: match.id, already: false });
    expect(await joinPrivateGame(p.id, token)).toEqual({ matchId: match.id, already: true }); // mehrfach ist harmlos
    const late = await makeUser("pvlate");
    await expect(joinPrivateGame(late.id, token)).rejects.toThrow(/voll/);
    await expect(joinPrivateGame(late.id, "kein-token")).rejects.toThrow(/ungültig/);
    expect((await getGameInvitePreview("kein-token")).status).toBe("invalid");

    await db.update(gameInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(gameInvites.token, token));
    await expect(joinPrivateGame(late.id, token)).rejects.toThrow(/abgelaufen/);
    expect((await getGameInvitePreview(token)).status).toBe("expired");
    await db.update(gameInvites).set({ expiresAt: days(5) }).where(eq(gameInvites.token, token));
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, match.id));
    await expect(joinPrivateGame(late.id, token)).rejects.toThrow(/abgesagt/);
    void organizer;
  });
});

describe("Teams einteilen", () => {
  it("Veranstalter teilt zu, Teamgröße ist die Hälfte, zufällige Einteilung ist ausgeglichen", async () => {
    const { organizer, match, players } = await game(9);
    const [stranger, other] = [await makeUser("fremd"), players[3]];
    await expect(randomSplit(stranger.id, match.id)).rejects.toThrow(/Veranstalter|Berechtigung/);
    await expect(randomSplit(other.id, match.id)).rejects.toThrow(/Veranstalter/);

    // von Hand: fünf Plätze je Team
    for (const p of players.slice(0, 5)) await assignSubstitute(organizer.id, match.id, p.id, match.homeTeamId);
    await expect(assignSubstitute(organizer.id, match.id, players[5].id, match.homeTeamId)).rejects.toThrow(/voll/);
    await unassignParticipant(organizer.id, match.id, players[4].id);
    // der Rest zufällig: 6 Wartende, links ein Platz frei, rechts fünf
    await randomSplit(organizer.id, match.id);
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(parts.filter((p) => p.teamId === match.homeTeamId)).toHaveLength(5);
    expect(parts.filter((p) => p.teamId === match.awayTeamId)).toHaveLength(5);
    expect(parts.filter((p) => p.teamId === null)).toHaveLength(0);
    await expect(randomSplit(organizer.id, match.id)).rejects.toThrow(/niemand/);

    // neu mischen: nur Spieler ohne Zahlung und ohne Bereit
    await setReady(players[1].id, match.id, true);
    await randomSplit(organizer.id, match.id, true);
    const again = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(again.filter((p) => p.teamId === match.homeTeamId)).toHaveLength(5);
    expect(again.filter((p) => p.teamId === match.awayTeamId)).toHaveLength(5);
    expect(again.find((p) => p.userId === players[1].id)!.teamId).toBe(parts.find((p) => p.userId === players[1].id)!.teamId); // der Bereite bleibt, wo er ist
    await expect(unassignParticipant(organizer.id, match.id, players[1].id)).rejects.toThrow(/schon bereit/);
  });

  it("Zufällige Einteilung nutzt die gemischte Reihenfolge (injizierte Zufallsquelle), jeder Spieler genau einmal, abwechselnd auf das kleinere Team", async () => {
    const seq = (...v: number[]) => () => {
      let i = 0;
      return () => v[i++ % v.length];
    };
    // jede Quelle wird zweimal frisch erzeugt: einmal für die erwartete Reihenfolge, einmal für die Einteilung
    for (const make of [() => () => 0, () => () => 0.999999, seq(0.1, 0.8, 0.4, 0.6, 0.3, 0.9, 0.2)]) {
      const rng = make();
      const { organizer, match } = await game(7); // 8 Spieler, alle noch ohne Team
      const pool = (await db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), isNull(matchParticipants.teamId)))).map((p) => p.userId);
      expect(pool).toHaveLength(8);
      const expected = shuffle(pool, make());
      await randomSplit(organizer.id, match.id, false, rng);
      const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      expect(parts.filter((p) => p.teamId === null)).toHaveLength(0);
      expect(new Set(parts.map((p) => p.userId)).size).toBe(8); // jeder genau einmal
      // abwechselnd: Position 0, 2, 4, 6 der gemischten Reihenfolge nach Heim, 1, 3, 5, 7 nach Gast
      expected.forEach((userId, i) => expect(parts.find((p) => p.userId === userId)!.teamId, `Position ${i}`).toBe(i % 2 === 0 ? match.homeTeamId : match.awayTeamId));
    }
  });

  it("12 Spieler: je Team sechs; Teamspiele bleiben bei 5 plus 1 Ersatz", async () => {
    const { organizer, match } = await game(11, { maxPlayers: 12 });
    await randomSplit(organizer.id, match.id);
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(parts.filter((p) => p.teamId === match.homeTeamId)).toHaveLength(6);
    expect(parts.filter((p) => p.teamId === match.awayTeamId)).toHaveLength(6);
  });
});

describe("Miete ist Pflicht (AC-1)", () => {
  const { rentCents: _rent, ...withoutRent } = base;
  void _rent;
  const without = () => withoutRent;

  it("fehlende, leere oder ungültige Miete wird serverseitig abgewiesen; kein stiller Plattformpreis", async () => {
    const o = await makeUser("pvrent");
    await expect(createPrivateGame(o.id, without())).rejects.toThrow(/Hallenmiete/);
    await expect(createPrivateGame(o.id, { ...base, rentCents: null })).rejects.toThrow(/Hallenmiete/);
    await expect(createPrivateGame(o.id, { ...base, rentCents: undefined })).rejects.toThrow(/Hallenmiete/);
    for (const bad of [-1, 100_001, 1.5, Number.NaN]) await expect(createPrivateGame(o.id, { ...base, rentCents: bad })).rejects.toThrow(/Hallenmiete/);
    // nach den Fehlversuchen existiert nichts: keine Teams, kein Spiel
    expect(await db.select().from(teams).where(eq(teams.createdBy, o.id))).toHaveLength(0);
  });

  it("gültig sind 0 (kostenlos) bis 1.000 Euro; die Miete wird in Cent gespeichert; Standard 10 Spieler", async () => {
    const o = await makeUser("pvrent");
    for (const rent of [0, 1, 12_000, 100_000]) {
      const { match } = await createPrivateGame(o.id, { ...base, rentCents: rent });
      expect(match).toMatchObject({ priceCents: rent, costCents: rent, maxPlayers: 10 });
    }
  });

  it("Formulareingabe: ausdrücklich Betrag oder kostenlos, sonst Fehler", () => {
    expect(parseRentInput("free", "")).toBe(0);
    expect(parseRentInput("free", "99")).toBe(0); // kostenlos gewinnt, ein altes Betragsfeld zählt nicht
    expect(parseRentInput("amount", "120")).toBe(12_000);
    expect(parseRentInput("amount", "95,50")).toBe(9_550);
    expect(parseRentInput("amount", "0")).toBe(0);
    expect(parseRentInput("amount", "1000")).toBe(100_000);
    for (const [mode, text] of [["", "100"], ["amount", ""], ["amount", "  "], ["amount", "abc"], ["amount", "-5"], ["amount", "1000,01"], ["amount", "1001"], ["other", "100"]] as const) {
      expect(() => parseRentInput(mode, text), `${mode}/${text}`).toThrow(/Hallenmiete|kostenlos/);
    }
  });

  // Kostenlos-Zahlung (keine Buchung, Bereit ohne Bezahlt-Pflicht) gehört zu T52 (wallet.ts/lobby.ts), dort getestet.
});

describe("Hallenmiete geteilt, Bestätigung und Ergebnis, nicht in der Rangliste", () => {
  it("10 Spieler zahlen die Miete zu gleichen Teilen; der Veranstalter bestätigt für beide Teams und trägt das Ergebnis ein", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 12_000 });
      await randomSplit(organizer.id, match.id);
      for (const p of players) await fund(p.id, 3000);
      for (const p of players) {
        await payShare(p.id, match.id);
        await setReady(p.id, match.id, true);
      }
      // Reservierung: Miete geteilt durch die Mindestzahl (8) = 15 Euro
      expect(await walletBalance(db, players[2].id)).toBe(3000 - 1500);

      // der Veranstalter ist Captain beider Teams: ein Klick bestätigt beide
      await finalConfirm(organizer.id, match.id);
      const confirmed = await reloadMatch(match.id);
      expect(confirmed.homeFinalAt).not.toBeNull();
      expect(confirmed.awayFinalAt).not.toBeNull();

      // Abrechnung: 12.000 / 10 = 1.200 je Spieler, der Rest geht zurück
      await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, match.id));
      await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(match.id))); // beim Anstoß wird abgerechnet
      await submitResult(organizer.id, match.id, 3, 2); // Veranstalter trägt direkt das Endergebnis ein
      expect((await reloadMatch(match.id)).status).toBe("played");
      for (const p of players) expect(await walletBalance(db, p.id)).toBe(3000 - 1200);
      expect((await trialBalance()).balanced).toBe(true);

      // Privatspiele zählen nicht für Elo und Rangliste
      for (const id of [match.homeTeamId, match.awayTeamId]) expect(await db.select().from(teamStats).where(eq(teamStats.teamId, id))).toHaveLength(0);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("ohne beide Teams komplett keine Bestätigung", async () => {
    const { organizer, match, players } = await game(9);
    await randomSplit(organizer.id, match.id);
    for (const p of players.slice(0, 8)) await setReady(p.id, match.id, true);
    await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/mindestens 4|bereit/); // zwei Spieler fehlen
  });
});
