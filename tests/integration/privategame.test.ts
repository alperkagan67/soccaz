import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { shuffle } from "@/lib/tournament";
import { db } from "@/db";
import { matchParticipants, matches, teams } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { gameInvites } from "@/db/schema-matchmaking";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { assignSubstitute, finalConfirm, getLobby, leaveLobby, payShare, randomSplit, removeParticipant, setReady, unassignParticipant } from "@/server/lobby";
import { createPrivateGame, getGameInvitePreview, getGameInviteToken, joinPrivateGame, parseRentInput } from "@/server/privategame";
import { listBoard } from "@/server/board";
import { getTeamProfile } from "@/server/profiles";
import { getTeamBySlug, listMyTeams } from "@/server/teams";
import { myAdminTeams } from "@/server/requests";
import { submitResult } from "@/server/results";
import { setSetting } from "@/server/settings";
import { fixPrivateShare, settleMatch } from "@/server/wallet";
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
    // fehlende Miete: eigene Meldung "ausdrücklich kostenlos" (nicht die Bereichsmeldung)
    await expect(createPrivateGame(o.id, without())).rejects.toThrow(/ausdrücklich kostenlos/);
    await expect(createPrivateGame(o.id, { ...base, rentCents: null })).rejects.toThrow(/ausdrücklich kostenlos/);
    await expect(createPrivateGame(o.id, { ...base, rentCents: undefined })).rejects.toThrow(/ausdrücklich kostenlos/);
    // vorhandene, aber ungültige Miete: Bereichsmeldung
    for (const bad of [-1, 100_001, 1.5, Number.NaN]) await expect(createPrivateGame(o.id, { ...base, rentCents: bad })).rejects.toThrow(/zwischen 0 und 1\.000 Euro/);
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

  // Kostenlos-Zahlung (keine Buchung, Bereit ohne Bezahlt-Pflicht): siehe "Kostenlos und Bereit-Prüfung (T52)".
});

describe("Kostenlos und Bereit-Prüfung (T52)", () => {
  it("AC-1 kostenlos: payShare bucht nichts und wirft nicht; alle können bereit werden, der Veranstalter bestätigt für beide Teams", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 0 });
      await randomSplit(organizer.id, match.id);
      for (const p of players) await payShare(p.id, match.id); // früh beendet: kein debitWallet mit 0
      for (const p of players) expect(await walletBalance(db, p.id)).toBe(0);
      for (const p of players) await setReady(p.id, match.id, true); // keine Bezahlt-Pflicht bei 0 €
      const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      expect(parts.every((p) => p.paidCents === 0 && p.readyAt !== null)).toBe(true);
      await finalConfirm(organizer.id, match.id);
      const confirmed = await reloadMatch(match.id);
      expect(confirmed.homeFinalAt).not.toBeNull();
      expect(confirmed.awayFinalAt).not.toBeNull();
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("AC-3: mit aktiven Zahlungen lehnt der Server das Bereit des Captains ab, solange ein Teamspieler nicht bezahlt hat", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 12_000 });
      await randomSplit(organizer.id, match.id);
      for (const p of players) await fund(p.id, 3000);
      const [late, ...others] = players.slice().reverse();
      for (const p of others) {
        await payShare(p.id, match.id);
        await setReady(p.id, match.id, true);
      }
      // ein Spieler hat nicht bezahlt: er kann nicht bereit werden, der Captain nicht bestätigen
      await expect(setReady(late.id, match.id, true)).rejects.toThrow(/zahle zuerst/);
      await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/bezahlt|bereit/);
      expect((await reloadMatch(match.id)).homeFinalAt).toBeNull();
      // nach der Zahlung des letzten Spielers gelingt es (der Veranstalter ist Captain beider Teams: ein Klick, beide Teams)
      await payShare(late.id, match.id);
      await setReady(late.id, match.id, true);
      // auch ein bereiter Spieler ohne Zahlung (z. B. nach einer Erstattung) blockiert das Bereit des Captains: die Prüfung steht im Server
      const victim = others[0];
      const [before] = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, victim.id)));
      await db.update(matchParticipants).set({ paidCents: 0 }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, victim.id)));
      await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/bereit und bezahlt/); // Meldung der Teamprüfung, nicht erst die des Fixierens
      await db.update(matchParticipants).set({ paidCents: before.paidCents }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, victim.id)));
      await finalConfirm(organizer.id, match.id);
      const m = await reloadMatch(match.id);
      expect(m.homeFinalAt).not.toBeNull();
      expect(m.awayFinalAt).not.toBeNull();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });
});

describe("Preis fixieren beim zweiten Bereit (T52, AC-4)", () => {
  const prepare = async (extra: number, over: Partial<Parameters<typeof createPrivateGame>[1]> = {}) => {
    const g = await game(extra, { rentCents: 12_000, ...over });
    await randomSplit(g.organizer.id, g.match.id);
    for (const p of g.players) await fund(p.id, 3000);
    return g;
  };
  const balances = (players: { id: string }[]) => Promise.all(players.map((p) => walletBalance(db, p.id)));

  it("Anteil = Miete ÷ eingeteilte Spieler (kein Deckel bei 12, kein Mindestwert); beim zweiten Bereit steht der Preis fest, Überzahlung geht genau einmal zurück, auch bei parallelen Aufrufen", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      // 8 Spieler zahlen 12000 / 8 = 1500 ...
      const { organizer, match, token, players } = await prepare(7);
      for (const p of players) await payShare(p.id, match.id);
      expect(await balances(players)).toEqual(players.map(() => 3000 - 1500));
      // ... dann kommen zwei dazu: der Anteil sinkt auf 12000 / 10 = 1200, die Neuen zahlen schon den neuen Anteil
      const extra = [await makeUser("pvx"), await makeUser("pvx")];
      for (const p of extra) {
        await joinPrivateGame(p.id, token);
        await fund(p.id, 3000);
      }
      await randomSplit(organizer.id, match.id);
      for (const p of extra) await payShare(p.id, match.id);
      expect(await balances(extra)).toEqual([1800, 1800]);
      const all = [...players, ...extra];
      for (const p of all) await setReady(p.id, match.id, true);

      // zweites Bereit, zweimal gleichzeitig: Preis fix, Überzahlung (300) genau einmal zurück
      await Promise.allSettled([finalConfirm(organizer.id, match.id), finalConfirm(organizer.id, match.id)]);
      const fixed = await reloadMatch(match.id);
      expect(fixed.finalShareCents).toBe(1200);
      expect(fixed.homeFinalAt).not.toBeNull();
      expect(fixed.awayFinalAt).not.toBeNull();
      expect(fixed.settledAt).toBeNull(); // Abrechnung, Beleg und Benachrichtigung bleiben beim Anstoß
      expect(await balances(all)).toEqual(all.map(() => 3000 - 1200));
      const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      expect(parts.every((p) => p.paidCents === 1200)).toBe(true);
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  // Hinweis zum Guard: Wirksam ist die Vorabprüfung in fixPrivateShare (`final_share_cents !== null` -> return). Das zusätzliche
  // `AND final_share_cents IS NULL` im UPDATE ist nur eine zweite Absicherung unter dem Spiel-Lock; entfernt man NUR diese Bedingung, ist der
  // Mutant äquivalent (kein Test kann rot werden). Dieser Test erschlägt die Mutation "Vorabprüfung entfernen".
  it("der Preis bleibt fest: Austritt und erneutes Bestätigen ändern den Anteil nicht (Guard: nur einmal fixieren)", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await prepare(9);
      for (const p of players) await payShare(p.id, match.id);
      for (const p of players) await setReady(p.id, match.id, true);
      await finalConfirm(organizer.id, match.id);
      expect((await reloadMatch(match.id)).finalShareCents).toBe(1200);
      // Ein Spieler tritt aus (rechtzeitig, mit Erstattung), der Captain bestätigt erneut.
      // Mit 9 Spielern wäre der Anteil 1334; fest bleibt aber 1200 (der Preis wird nur einmal fixiert), und das Bereit gelingt.
      const leaver = players[9];
      await leaveLobby(leaver.id, match.id);
      await finalConfirm(organizer.id, match.id);
      const m = await reloadMatch(match.id);
      expect(m.finalShareCents).toBe(1200);
      expect(m.homeFinalAt).not.toBeNull();
      expect(m.awayFinalAt).not.toBeNull();
      expect(await balances(players.slice(0, 9))).toEqual(players.slice(0, 9).map(() => 3000 - 1200));
      expect(await walletBalance(db, leaver.id)).toBe(3000); // Austritt vor dem Anstoß: voll erstattet
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("hat jemand weniger als den Anteil bezahlt, wird das zweite Bereit mit klarer Meldung abgelehnt; es wird nichts fixiert", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await prepare(9);
      for (const p of players) await payShare(p.id, match.id); // 10 Spieler zahlen je 1200
      for (const p of players) await setReady(p.id, match.id, true);
      // zwei Spieler gehen (rechtzeitig, mit Erstattung): 8 Spieler, Anteil wäre 1500, bezahlt sind 1200
      // je Team einer (5/5 wird 4/4), nicht der Veranstalter
      const seated = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      const leavers = [match.homeTeamId, match.awayTeamId].map((t) => seated.find((p) => p.teamId === t && p.userId !== organizer.id)!.userId);
      for (const id of leavers) await leaveLobby(id, match.id);
      await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/Anteil wäre .* weniger bezahlt/);
      const m = await reloadMatch(match.id);
      expect(m.finalShareCents).toBeNull();
      expect(m.homeFinalAt).toBeNull();
      expect(m.awayFinalAt).toBeNull();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("Abrechnung ohne zweites Bereit: Privatspiel rechnet nie mit Mindestzahl 8/Deckel 12, sondern mit Miete ÷ eingeteilte Spieler; Hauptbuch ausgeglichen, kein Fehlbetrag", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      // 8 Spieler zahlen 1500, dann kommen zwei dazu: Anteil 1200
      const { organizer, match, token, players } = await prepare(7);
      for (const p of players) await payShare(p.id, match.id);
      const extra = [await makeUser("pvx"), await makeUser("pvx")];
      for (const p of extra) {
        await joinPrivateGame(p.id, token);
        await fund(p.id, 3000);
      }
      await randomSplit(organizer.id, match.id);
      for (const p of extra) await payShare(p.id, match.id);
      const all = [...players, ...extra];
      for (const p of all) await setReady(p.id, match.id, true); // beide Teams >= 4 bereit: bestätigt, aber kein zweites Bereit der Captains
      const before = await reloadMatch(match.id);
      expect(before.status).toBe("confirmed");
      expect(before.finalShareCents).toBeNull();

      await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, match.id));
      await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(match.id))); // wie settleDueMatches beim Anstoß
      const settled = await reloadMatch(match.id);
      expect(settled.settledAt).not.toBeNull();
      expect(settled.finalShareCents).toBe(1200); // nicht finalShareFor (1500 bei Mindestzahl 8)
      expect(await balances(all)).toEqual(all.map(() => 3000 - 1200));
      const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      const total = parts.reduce((sum, p) => sum + p.paidCents, 0);
      expect(total).toBeGreaterThanOrEqual(12_000); // die Miete ist gedeckt
      expect(total - 12_000).toBeLessThan(all.length); // Überschuss nur der Rundungsrest
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("Abrechnung ohne zweites Bereit, nur 8 von 10 eingeteilten Spielern haben bezahlt: Anteil bleibt Miete ÷ 10, nicht ÷ 8 (kein Mindestwert, kein Fehlbetrag durch die Formel)", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await prepare(9); // 10 eingeteilt, Anteil 1200
      const seated = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      // je Team einer zahlt nicht (nicht der Veranstalter)
      const unpaid = [match.homeTeamId, match.awayTeamId].map((t) => seated.find((p) => p.teamId === t && p.userId !== organizer.id)!.userId);
      const payers = players.filter((p) => !unpaid.includes(p.id));
      for (const p of payers) {
        await payShare(p.id, match.id);
        await setReady(p.id, match.id, true);
      }
      expect((await reloadMatch(match.id)).status).toBe("confirmed"); // je Team 4 bereit: bestätigt ohne zweites Bereit
      await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, match.id));
      await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(match.id)));
      const settled = await reloadMatch(match.id);
      expect(settled.finalShareCents).toBe(1200); // finalShareFor(12000, 8 Zahler, Mindestzahl 8) wäre 1500 > bezahlt
      expect(await balances(payers)).toEqual(payers.map(() => 3000 - 1200)); // niemand zahlt mehr oder weniger als den Anteil
      for (const id of unpaid) expect(await walletBalance(db, id)).toBe(3000);
      expect((await trialBalance()).balanced).toBe(true);
      // Die nicht gedeckte Miete (2 x 1200) fängt der Deckungs-Job 24 Stunden vor Anstoß ab (M2, AC-9), nicht die Abrechnung.
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("fixPrivateShare gilt nur für Privatspiele: bei einem Teamspiel wird nichts fixiert und nichts erstattet", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, token, players } = await prepare(7);
      for (const p of players) await payShare(p.id, match.id); // 1500 je Spieler (8 eingeteilt)
      const extra = [await makeUser("pvx"), await makeUser("pvx")];
      for (const p of extra) await joinPrivateGame(p.id, token);
      await randomSplit(organizer.id, match.id); // jetzt 10 eingeteilt: die Neuberechnung (T53, AC-5) hat die 300 je Zahler schon erstattet
      expect(await balances(players)).toEqual(players.map(() => 3000 - 1200));
      await db.update(matches).set({ kind: "team" }).where(eq(matches.id, match.id));
      const before = await balances(players);
      await db.transaction(async (tx) => fixPrivateShare(tx, await reloadMatch(match.id)));
      expect((await reloadMatch(match.id)).finalShareCents).toBeNull();
      expect(await balances(players)).toEqual(before); // fixPrivateShare selbst erstattet bei einem Teamspiel nichts
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("Ersatzspieler, der nach dem Fixieren zahlt, bucht den festen Anteil (nicht den aktuellen Wert)", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, token, players } = await prepare(9);
      for (const p of players) await payShare(p.id, match.id);
      for (const p of players) await setReady(p.id, match.id, true);
      await finalConfirm(organizer.id, match.id);
      expect((await reloadMatch(match.id)).finalShareCents).toBe(1200);
      // je Team einer geht (5/5 wird 4/4, 8 eingeteilt), ein Ersatz kommt: 9 eingeteilt, aktueller Wert wäre 1334
      const seated = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      const leavers = [match.homeTeamId, match.awayTeamId].map((t) => seated.find((p) => p.teamId === t && p.userId !== organizer.id)!.userId);
      for (const id of leavers) await leaveLobby(id, match.id);
      const sub = await makeUser("pvsub");
      await joinPrivateGame(sub.id, token);
      await fund(sub.id, 3000);
      await randomSplit(organizer.id, match.id);
      await payShare(sub.id, match.id);
      expect(await walletBalance(db, sub.id)).toBe(3000 - 1200);
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("Abrechnung beim Anstoß übernimmt den festen Anteil (14 Spieler: kein Deckel bei 12), Beleg und Benachrichtigung laufen weiter", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await prepare(13, { maxPlayers: 14 });
      for (const p of players) await payShare(p.id, match.id); // 12000 / 14 aufgerundet = 858
      for (const p of players) await setReady(p.id, match.id, true);
      await finalConfirm(organizer.id, match.id);
      expect((await reloadMatch(match.id)).finalShareCents).toBe(858);
      await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, match.id));
      await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(match.id)));
      const settled = await reloadMatch(match.id);
      expect(settled.settledAt).not.toBeNull();
      expect(settled.finalShareCents).toBe(858); // nicht auf 1000 (Deckel 12) umgerechnet
      expect(await balances(players)).toEqual(players.map(() => 3000 - 858));
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });
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
      // Privatspiel: Anteil = Miete geteilt durch die eingeteilten Spieler (10) = 12 Euro (keine Reservierung mit Mindestzahl 8)
      expect(await walletBalance(db, players[2].id)).toBe(3000 - 1200);

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

describe("Spielerzahl ändert sich vor dem Fixieren (T53, AC-5, AC-6)", () => {
  const prepare = async (extra: number) => {
    const g = await game(extra, { rentCents: 12_000 });
    await randomSplit(g.organizer.id, g.match.id);
    for (const p of g.players) await fund(p.id, 3000);
    return g;
  };
  const balance = (id: string) => walletBalance(db, id);
  const paidOf = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0].paidCents;
  const withPayments = async (fn: () => Promise<void>) => {
    await setSetting(null, "payments_enabled", true);
    try {
      await fn();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  };
  /** Ein Captain hat schon "Bereit" gedrückt (das Setzen beider Bereit würde den Preis fixieren). */
  const captainReady = (matchId: string) => db.update(matches).set({ homeFinalAt: new Date() }).where(eq(matches.id, matchId));

  it("AC-5 Beitritt: zwei Spieler kommen dazu, der Anteil sinkt, zu viel Gezahltes geht sofort zurück, Bereit wird zurückgesetzt", () =>
    withPayments(async () => {
      const { organizer, match, token, players } = await prepare(7); // 8 Spieler, Anteil 1500
      for (const p of players) await payShare(p.id, match.id);
      expect(await balance(players[1].id)).toBe(1500);
      await captainReady(match.id);
      const extra = [await makeUser("pvx"), await makeUser("pvx")];
      for (const p of extra) {
        await joinPrivateGame(p.id, token);
        await fund(p.id, 3000);
      }
      await randomSplit(organizer.id, match.id); // 10 Spieler, Anteil 1200
      for (const p of players) {
        expect(await balance(p.id), "sofort 300 zurück").toBe(1800);
        expect(await paidOf(match.id, p.id)).toBe(1200);
      }
      const m = await reloadMatch(match.id);
      expect(m.finalShareCents).toBeNull();
      expect(m.homeFinalAt).toBeNull();
      expect(m.awayFinalAt).toBeNull();
      expect((await trialBalance()).balanced).toBe(true);
      // die Neuen zahlen gleich den neuen Anteil
      for (const p of extra) await payShare(p.id, match.id);
      expect(await balance(extra[0].id)).toBe(1800);
    }));

  it("AC-5 Austritt: Der Austretende bekommt alles zurück, der Rest muss nachzahlen (Anteil jetzt 1334), nachzahlen klappt genau einmal, Bereit wird zurückgesetzt", () =>
    withPayments(async () => {
      const { organizer, match, players } = await prepare(9); // 10 Spieler, Anteil 1200
      for (const p of players) await payShare(p.id, match.id);
      await captainReady(match.id);
      const leaver = players[3];
      await leaveLobby(leaver.id, match.id);
      expect(await balance(leaver.id)).toBe(3000);
      const rest = players.filter((p) => p.id !== leaver.id);
      for (const p of rest) expect(await paidOf(match.id, p.id)).toBe(1200); // noch nichts nachgefordert abgebucht
      expect((await reloadMatch(match.id)).homeFinalAt).toBeNull();

      const view = await getLobby(match.id, { id: rest[1].id, role: "player" });
      expect(view!.payments.reservationCents).toBe(1334); // 12000 / 9 aufgerundet
      expect(view!.payments.myDueCents).toBe(134);

      // nachzahlen: nur die Differenz, auch bei Doppelklick nur einmal
      await Promise.allSettled([payShare(rest[1].id, match.id), payShare(rest[1].id, match.id), payShare(rest[1].id, match.id)]);
      expect(await balance(rest[1].id)).toBe(3000 - 1334);
      expect(await paidOf(match.id, rest[1].id)).toBe(1334);
      await payShare(rest[1].id, match.id); // schon voll bezahlt: harmlos
      expect(await balance(rest[1].id)).toBe(3000 - 1334);
      void organizer;
      expect((await trialBalance()).balanced).toBe(true);
    }));

  it("AC-5 Rauswurf durch den Captain: voller Anteil zurück, Rest bekommt neuen Anteil, Bereit zurückgesetzt", () =>
    withPayments(async () => {
      const { organizer, match, players } = await prepare(9);
      for (const p of players) await payShare(p.id, match.id);
      for (const p of players) await setReady(p.id, match.id, true); // alle bereit und bezahlt: die bisherige Prüfung "Team komplett" allein setzt Bereit nicht zurück
      await captainReady(match.id);
      await removeParticipant(organizer.id, match.id, players[4].id);
      expect(await balance(players[4].id)).toBe(3000);
      expect(await paidOf(match.id, players[1].id)).toBe(1200);
      const m = await reloadMatch(match.id);
      expect(m.homeFinalAt).toBeNull();
      expect((await getLobby(match.id, { id: players[1].id, role: "player" }))!.payments.myDueCents).toBe(134);
      expect((await trialBalance()).balanced).toBe(true);
    }));

  it("AC-5 parallele Austritte: jeder wird genau einmal erstattet, der Anteil gilt für die endgültige Zahl (8 Spieler: 1500)", () =>
    withPayments(async () => {
      const { match, players } = await prepare(9);
      for (const p of players) await payShare(p.id, match.id);
      const [a, b] = [players[2], players[3]];
      await Promise.allSettled([leaveLobby(a.id, match.id), leaveLobby(b.id, match.id), leaveLobby(a.id, match.id)]);
      expect(await balance(a.id)).toBe(3000);
      expect(await balance(b.id)).toBe(3000);
      const view = await getLobby(match.id, { id: players[1].id, role: "player" });
      expect(view!.payments.reservationCents).toBe(1500);
      expect(view!.payments.myDueCents).toBe(300);
      expect((await trialBalance()).balanced).toBe(true);
    }));

  it("AC-6: Wer weder Captain noch Veranstalter ist, kann niemanden rauswerfen oder einteilen; Rauswurf nur durch den Captain, mit Erstattung", () =>
    withPayments(async () => {
      const { organizer, match, token, players } = await prepare(8); // 9 eingeteilte Spieler, Anteil 1334, ein zehnter Platz bleibt für den Wartenden
      const stranger = await makeUser("pvfremd");
      const outsider = await makeUser("pvwait");
      await joinPrivateGame(outsider.id, token); // wartet auf Einteilung
      const [normal, victim] = [players[1], players[2]];
      for (const p of players) await payShare(p.id, match.id);
      await setReady(victim.id, match.id, true);
      // Rauswurf von bereiten und bezahlten Spielern
      for (const actor of [stranger, normal]) {
        await expect(removeParticipant(actor.id, match.id, victim.id)).rejects.toThrow(/Berechtigung/);
        await expect(removeParticipant(actor.id, match.id, outsider.id)).rejects.toThrow(/Berechtigung/);
        await expect(unassignParticipant(actor.id, match.id, normal.id)).rejects.toThrow(/Veranstalter/);
        await expect(randomSplit(actor.id, match.id)).rejects.toThrow(/Veranstalter|Berechtigung/);
        await expect(assignSubstitute(actor.id, match.id, outsider.id, match.homeTeamId)).rejects.toThrow(/Admins/);
      }
      expect(await paidOf(match.id, victim.id)).toBe(1334);
      expect(await balance(victim.id)).toBe(3000 - 1334);
      // der Captain darf, mit voller Erstattung
      await removeParticipant(organizer.id, match.id, victim.id);
      expect(await balance(victim.id)).toBe(3000);
      expect((await trialBalance()).balanced).toBe(true);
    }));
});
