import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, asc, eq, isNull, like, sql } from "drizzle-orm";
import { shuffle } from "@/lib/tournament";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, paymentCharges, teamMembers, teams } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { gameInvites } from "@/db/schema-matchmaking";
import { trialBalance } from "@/server/ledger";
import { assignSubstitute, finalConfirm, getLobby, leaveLobby, randomSplit, removeParticipant, setReady, unassignParticipant } from "@/server/lobby";
import { cancelUncoveredPrivateGames, createPrivateGame, getGameInvitePreview, getGameInviteToken, joinPrivateGame, parseRentInput, regenerateGameInvite, rentCheckAt, revokeGameInvite, safeErrorLog } from "@/server/privategame";
import { listBoard } from "@/server/board";
import { getPlayerProfile, getTeamProfile, leaderboards } from "@/server/profiles";
import { getTeamBySlug, listMyTeams } from "@/server/teams";
import { myAdminTeams } from "@/server/requests";
import { canViewMatch, getMatchPage, submitResult } from "@/server/results";
import { GET as liveGET } from "@/app/api/spiele/[id]/live/route";
import OverlayPage from "@/app/overlay/[id]/page";
import { ALL_MATCHES, mayAnnounceToAll, subscribeToLobby } from "@/server/realtime";
import { GET as eventsGET } from "@/app/api/spiele/[id]/events/route";
import { teamCard } from "@/server/cards";
import { setSetting } from "@/server/settings";
import { drainBackgroundCharges, runChargesIfDue } from "@/server/payments/charge-trigger";
import { ledgerEntries } from "@/db/schema-finance";
import { fixShare, privateListLocked, shareToCharge } from "@/server/wallet";
import { cleanup, makeMatch, makeUser, reloadMatch, seedShare } from "./helpers";

// Die Events-Route fragt die Sitzung ab (Cookies gibt es im Test nicht): getCurrentUser liefert hier die Person, die der Test gerade spielt.
const session = vi.hoisted(() => ({ user: null as { id: string; role: "player" | "admin" } | null }));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => session.user }));

beforeAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "min_paid_players", 8);
});
afterAll(cleanup);

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const base = { city: "Essen", venueText: "Soccerhalle Test", startsAt: days(4), durationMin: 60, rentCents: 12_000 };

/** Ein Privatspiel mit `n` weiteren Spielern, die über den Link beigetreten sind. */
async function game(n = 9, over: Partial<Parameters<typeof createPrivateGame>[1]> = {}, legacy = false) {
  const organizer = await makeUser("pvorg");
  const created = await createPrivateGame(organizer.id, { ...base, ...over });
  const { token } = created;
  let match = created.match;
  // legacy: Altspiel (vor der Umstellung angelegt) mit dem alten Pfad: 24-h-Mietprüfung, Ersatz gegen Erstattung
  if (legacy) [match] = await db.update(matches).set({ legacyShareModel: true }).where(eq(matches.id, match.id)).returning();
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
      const pool = (await db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), isNull(matchParticipants.teamId))).orderBy(asc(matchParticipants.userId))).map((p) => p.userId);
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

  it("stabile Reihenfolge: dieselbe Zufallsquelle gibt dieselbe Einteilung, auch wenn die Datenbank die Zeilen nach Updates in anderer Reihenfolge liefert (ORDER BY userId)", async () => {
    const seq = (...v: number[]) => () => {
      let i = 0;
      return () => v[i++ % v.length];
    };
    const { organizer, match } = await game(7); // 8 Spieler ohne Team
    const teamsOf = async () => Object.fromEntries((await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id))).map((p) => [p.userId, p.teamId]));
    await randomSplit(organizer.id, match.id, false, seq(0.1, 0.8, 0.4, 0.6, 0.3, 0.9, 0.2)());
    const first = await teamsOf();
    // Vor jedem weiteren Mischen die Zeilen EINZELN in absteigender userId-Reihenfolge anfassen: jedes UPDATE legt eine neue Zeilenversion an, die Zeilen liegen danach in
    // umgekehrter Reihenfolge im Speicher. Ohne ORDER BY (und mit einem Seq-Scan) bekäme randomSplit den Pool in dieser Reihenfolge und teilte anders ein.
    const touchDescending = async () => {
      for (const userId of Object.keys(first).sort().reverse()) await db.execute(sql`update match_participants set joined_at = joined_at where match_id = ${match.id} and user_id = ${userId}`);
    };
    await touchDescending();
    await randomSplit(organizer.id, match.id, true, seq(0.1, 0.8, 0.4, 0.6, 0.3, 0.9, 0.2)());
    expect(await teamsOf()).toEqual(first);
    await touchDescending();
    await randomSplit(organizer.id, match.id, true, seq(0.1, 0.8, 0.4, 0.6, 0.3, 0.9, 0.2)());
    expect(await teamsOf()).toEqual(first);
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
  it("AC-1 kostenlos: alle können bereit werden (keine Pflicht bei 0 €), der Veranstalter bestätigt für beide Teams; es entsteht kein Geld", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 0 });
      await randomSplit(organizer.id, match.id);
      for (const p of players) await setReady(p.id, match.id, true); // keine Karte und keine Zahlung bei 0 €
      const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
      expect(parts.every((p) => p.paidCents === 0 && p.readyAt !== null)).toBe(true);
      await finalConfirm(organizer.id, match.id);
      const confirmed = await reloadMatch(match.id);
      expect(confirmed.homeFinalAt).not.toBeNull();
      expect(confirmed.awayFinalAt).not.toBeNull();
      expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, match.id))).toHaveLength(0);
      expect((await trialBalance()).balanced).toBe(true);
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

});

describe("Preis fixieren beim zweiten Bereit (T52, AC-4)", () => {

  it("fixShare gilt nur für Privatspiele: bei einem Altspiel-Teamspiel wird nichts fixiert", async () => {
    const { organizer, match } = await game(9, { rentCents: 12_000 });
    await randomSplit(organizer.id, match.id);
    await db.update(matches).set({ kind: "team", legacyShareModel: true }).where(eq(matches.id, match.id)); // Altspiel: wird nicht fixiert
    await db.transaction(async (tx) => fixShare(tx, await reloadMatch(match.id)));
    expect((await reloadMatch(match.id)).finalShareCents).toBeNull();
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, match.id))).toHaveLength(0); // fixShare bewegt kein Geld
  });

});

describe("Hallenmiete geteilt, Bestätigung und Ergebnis, nicht in der Rangliste", () => {
  it("Hallenmiete im Kartenmodell: 10 Spieler mit Karte, der Veranstalter bestätigt für beide Teams (Anteil 1200) und trägt das Ergebnis ein; Privatspiele zählen nicht für Rangliste", async () => {
    await setSetting(null, "payments_enabled", true);
    await setSetting(null, "card_payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 12_000 });
      await randomSplit(organizer.id, match.id);
      await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, match.id));
      for (const p of players) await setReady(p.id, match.id, true);
      // der Veranstalter ist Captain beider Teams: ein Klick bestätigt beide; der Anteil steht fest (Miete geteilt durch die eingeteilten Spieler), bezahlt wird erst bei der Abbuchung
      await finalConfirm(organizer.id, match.id);
      const confirmed = await reloadMatch(match.id);
      expect(confirmed.homeFinalAt).not.toBeNull();
      expect(confirmed.awayFinalAt).not.toBeNull();
      expect(confirmed.finalShareCents).toBe(1200);
      await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, match.id));
      await submitResult(organizer.id, match.id, 3, 2); // Veranstalter trägt direkt das Endergebnis ein
      expect((await reloadMatch(match.id)).status).toBe("played");
      expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, match.id))).toHaveLength(0);
      // Privatspiele zählen nicht für Elo und Rangliste
      for (const id of [match.homeTeamId, match.awayTeamId]) expect(await db.select().from(teamStats).where(eq(teamStats.teamId, id))).toHaveLength(0);
    } finally {
      await setSetting(null, "payments_enabled", false);
      await setSetting(null, "card_payments_enabled", false);
    }
  });

  it("ohne beide Teams komplett keine Bestätigung", async () => {
    const { organizer, match, players } = await game(9);
    await randomSplit(organizer.id, match.id);
    for (const p of players.slice(0, 8)) await setReady(p.id, match.id, true);
    await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/mindestens 4|bereit/); // zwei Spieler fehlen
  });
});

describe("Austritt nach dem Fixieren und Sperre in den letzten 48 Stunden (T54, AC-7, AC-8)", () => {
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000);


  it("Teamspiel und Turnier bleiben unverändert: die 48-Stunden-Sperre gilt nur für Privatspiele", () => {
    expect(privateListLocked({ kind: "private", startsAt: hours(24) })).toBe(true);
    expect(privateListLocked({ kind: "private", startsAt: hours(72) })).toBe(false);
    expect(privateListLocked({ kind: "team", startsAt: hours(24) })).toBe(false);
    expect(privateListLocked({ kind: "tournament", startsAt: hours(1) })).toBe(false);
  });
});

describe("Mietprüfung vor Anstoß (T55, AC-9)", () => {
  const withPayments = async (fn: () => Promise<void>) => {
    await setSetting(null, "payments_enabled", true);
    try {
      await fn();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  };
  const statusOf = async (matchId: string) => (await reloadMatch(matchId)).status;

  it("Prüfzeitpunkt: 24 Stunden vor Anstoß bei mindestens 24 Stunden Vorlauf, sonst 1 Stunde vor Anstoß", () => {
    const created = new Date("2026-01-01T10:00:00Z");
    expect(rentCheckAt(new Date("2026-01-04T10:00:00Z"), created).toISOString()).toBe("2026-01-03T10:00:00.000Z"); // 72 h Vorlauf
    expect(rentCheckAt(new Date("2026-01-02T10:00:00Z"), created).toISOString()).toBe("2026-01-01T10:30:00.000Z"); // genau 24 h Vorlauf: Frist wäre die Anlage selbst, also frühestens 30 min danach
    expect(rentCheckAt(new Date("2026-01-02T09:59:00Z"), created).toISOString()).toBe("2026-01-02T08:59:00.000Z"); // 23 h 59 min Vorlauf: 1 h vor Anstoß
    expect(rentCheckAt(new Date("2026-01-01T20:00:00Z"), created).toISOString()).toBe("2026-01-01T19:00:00.000Z"); // 10 h Vorlauf
    // Mindest-Zahlfrist: knapp über der Frist liegt der Prüfzeitpunkt frühestens 30 Minuten nach der Anlage
    expect(rentCheckAt(new Date("2026-01-01T11:05:00Z"), created).toISOString()).toBe("2026-01-01T10:30:00.000Z"); // 1 h 5 min Vorlauf: nicht 10:05
    expect(rentCheckAt(new Date("2026-01-02T10:05:00Z"), created).toISOString()).toBe("2026-01-01T10:30:00.000Z"); // 24 h 5 min Vorlauf: nicht 10:05
    expect(rentCheckAt(new Date("2026-01-01T11:00:00Z"), created).toISOString()).toBe("2026-01-01T10:30:00.000Z"); // Mindestvorlauf 1 h
    expect(rentCheckAt(new Date("2026-01-01T10:20:00Z"), created).toISOString()).toBe("2026-01-01T10:20:00.000Z"); // nie nach dem Anstoß
  });

  it("Log bei Fehlern enthält weder Meldung noch Parameter: nur Name und SQLSTATE", () => {
    const userId = "11111111-2222-3333-4444-555555555555";
    const dbError = new Error(`Failed query: update "match_participants" set ... params: ${userId},12000,Team Rot`, { cause: { code: "40P01" } });
    dbError.name = "DrizzleQueryError";
    const text = safeErrorLog(dbError);
    expect(text).toBe("DrizzleQueryError (SQLSTATE 40P01)");
    expect(text).not.toContain(userId);
    expect(text).not.toContain("Team Rot");
    expect(text).not.toContain("Failed query");
    expect(safeErrorLog(new Error(`geheim ${userId}`))).toBe("Error"); // ohne SQLSTATE nur der Name
    expect(safeErrorLog("kein Error-Objekt")).toBe("Fehler");
  });

  it("kostenlos (Miete 0) und ohne aktive Zahlungen wird nie abgesagt", async () => {
    await withPayments(async () => {
      const free = await game(5, { rentCents: 0 });
      const m = await reloadMatch(free.match.id);
      await cancelUncoveredPrivateGames(new Date(m.startsAt.getTime() - 30 * 60_000));
      expect(await statusOf(free.match.id)).not.toBe("cancelled");
    });
    // Zahlungen aus: auch ein Spiel mit Miete bleibt
    const paidGame = await game(5, { rentCents: 12_000 });
    const m2 = await reloadMatch(paidGame.match.id);
    expect(await cancelUncoveredPrivateGames(new Date(m2.startsAt.getTime() - 30 * 60_000))).toBe(0); // Zahlungen aus: der Lauf tut gar nichts
    expect(await statusOf(paidGame.match.id)).not.toBe("cancelled");
  });
});

describe("Kein Zugriff auf Privatspiele für Unbeteiligte (T57, AC-12)", () => {
  const live = (id: string) => liveGET(new Request(`http://localhost/api/spiele/${id}/live`), { params: Promise.resolve({ id }) } as never);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Ein fertig gespieltes Privatspiel (Ergebnis eingetragen) mit Veranstalter, eingeteilten Mitspielern und einem Fremden. */
  async function playedGame() {
    const g = await game(9);
    await randomSplit(g.organizer.id, g.match.id);
    for (const p of g.players) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.organizer.id, g.match.id);
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, g.match.id));
    await submitResult(g.organizer.id, g.match.id, 3, 2);
    expect((await reloadMatch(g.match.id)).status).toBe("played");
    return g;
  }

  it("Live-API: 404 für jeden, Antwort identisch zu einem nicht vorhandenen Spiel, keine Namen oder Orte", async () => {
    const { match } = await game(3);
    const [home] = await db.select().from(teams).where(eq(teams.id, match.homeTeamId));
    const res = await live(match.id);
    const missing = await live(crypto.randomUUID());
    expect(res.status).toBe(404);
    expect(missing.status).toBe(404);
    const body = await res.text();
    expect(body).toBe(await missing.text()); // Existenz nicht verraten
    expect(body).not.toContain(home.name);
    expect(body).not.toContain(base.venueText);
  });

  it("Overlay: notFound für jeden, identisch zu einem nicht vorhandenen Spiel", async () => {
    const { match } = await game(3);
    const call = (id: string) => OverlayPage({ params: Promise.resolve({ id }) } as never);
    const a = await call(match.id).then(() => null, (e: { digest?: string; message?: string }) => e);
    const b = await call(crypto.randomUUID()).then(() => null, (e: { digest?: string; message?: string }) => e);
    expect(a?.digest).toContain("404");
    expect(a?.digest).toBe(b?.digest);
    expect(a?.message).toBe(b?.message);
  });

  it("Spielseite und Ereignis-Stream: nur Veranstalter und Plattform-Admin dürfen ansehen (Anonyme, Fremde und eingeteilte Mitspieler nicht, wie bisher)", async () => {
    const { organizer, match, players } = await game(5);
    await randomSplit(organizer.id, match.id);
    const stranger = await makeUser("pvstranger");
    const admin = await makeUser("pvadmin", "admin");
    const may = async (viewer: { id: string; role: "player" | "admin" } | null) => {
      const page = await getMatchPage(match.id, viewer);
      return Boolean(page && canViewMatch(page));
    };
    expect(await may(null)).toBe(false);
    expect(await may({ id: stranger.id, role: "player" })).toBe(false);
    expect(await may({ id: players[3].id, role: "player" })).toBe(false); // Mitspieler: ihr Hub ist /lobby/{id} (bewusst unverändert)
    expect(await may({ id: organizer.id, role: "player" })).toBe(true);
    expect(await may({ id: admin.id, role: "admin" })).toBe(true);
  });

  it("Globaler Stream: Änderungen an Privatspielen werden nicht gemeldet, öffentliche weiter; der Kanal des Spiels selbst bleibt", async () => {
    const { match: privateMatch } = await game(3);
    const pub = await makeMatch();
    let global = 0;
    let own = 0;
    const offGlobal = await subscribeToLobby(ALL_MATCHES, () => (global += 1));
    const offOwn = await subscribeToLobby(privateMatch.id, () => (own += 1));
    const notify = (id: string) => db.execute(sql`select pg_notify('lobby', ${id})`);
    try {
      await notify(privateMatch.id);
      await sleep(800);
      expect(own).toBe(1); // je-Spiel-Kanal unverändert (events/route.ts prüft die Berechtigung)
      expect(global).toBe(0); // der öffentliche Kanal erfährt nichts über das Privatspiel
      await notify(pub.match.id);
      for (let i = 0; i < 40 && global === 0; i++) await sleep(100);
      expect(global).toBe(1); // öffentliche Spiele melden weiter
    } finally {
      offGlobal();
      offOwn();
    }
  });

  it("Globaler Stream: schlägt das Nachschlagen fehl, wird nichts gemeldet (fail closed) und nichts geworfen", async () => {
    const { match } = await game(1);
    expect(await mayAnnounceToAll(match.id)).toBe(false); // Privatspiel
    expect(await mayAnnounceToAll((await makeMatch()).match.id)).toBe(true); // öffentlich
    const spy = vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("Datenbank nicht erreichbar");
    });
    try {
      await expect(mayAnnounceToAll(crypto.randomUUID())).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

it("Events-Route wirklich aufgerufen: anonym und fremd 404 (wie bei nicht vorhandenem Spiel), Veranstalter bekommt den Stream", async () => {
    const { organizer, match } = await game(3);
    const stranger = await makeUser("pvstr2");
    const call = async (user: typeof session.user, id: string) => {
      session.user = user;
      const controller = new AbortController();
      const res = await eventsGET(new Request(`http://localhost/api/spiele/${id}/events`, { signal: controller.signal }), { params: Promise.resolve({ id }) } as never);
      const out = { status: res.status, type: res.headers.get("content-type"), body: res.status === 200 ? "" : await res.text() };
      controller.abort();
      await res.body?.cancel().catch(() => {});
      return out;
    };
    try {
      const missing = await call(null, crypto.randomUUID());
      expect(missing.status).toBe(404);
      for (const user of [null, { id: stranger.id, role: "player" as const }]) {
        const res = await call(user, match.id);
        expect(res.status).toBe(404);
        expect(res.body).toBe(missing.body); // Existenz nicht verraten
      }
      const own = await call({ id: organizer.id, role: "player" }, match.id);
      expect(own.status).toBe(200);
      expect(own.type).toContain("text/event-stream");
    } finally {
      session.user = null;
    }
  });

  it("nicht öffentliche Teamspiele (z. B. private Herausforderung): Fremde und Anonyme dürfen nicht ansehen, Team-Admins und Plattform-Admin schon", async () => {
    const m = await makeMatch();
    await db.update(matches).set({ visibility: "private" }).where(eq(matches.id, m.match.id));
    const stranger = await makeUser("pvstr3");
    const admin = await makeUser("pvadm3", "admin");
    const may = async (viewer: { id: string; role: "player" | "admin" } | null) => {
      const page = await getMatchPage(m.match.id, viewer);
      return Boolean(page && canViewMatch(page));
    };
    expect(await may(null)).toBe(false);
    expect(await may({ id: stranger.id, role: "player" })).toBe(false);
    expect(await may({ id: m.adminA.id, role: "player" })).toBe(true);
    expect(await may({ id: m.adminB.id, role: "player" })).toBe(true);
    expect(await may({ id: admin.id, role: "admin" })).toBe(true);
  });

  it("Team-Vorschaubild: Spiel-Teams von Privatspielen und archivierte Teams verraten weder Namen noch Stadt (gleiche neutrale Karte wie bei nicht vorhandenem Team)", async () => {
    const { match } = await game(1);
    const [priv] = await db.select().from(teams).where(eq(teams.id, match.homeTeamId));
    const bytes = async (slug: string) => Buffer.from(await (await teamCard(slug)).arrayBuffer());
    const none = await bytes(`gibt-es-nicht-${crypto.randomUUID()}`);
    expect((await bytes(priv.slug)).equals(none)).toBe(true);
    // ein normales Team bekommt dagegen seine eigene Karte
    const pub = await makeMatch();
    const [ordinary] = await db.select().from(teams).where(eq(teams.id, pub.home.id));
    expect((await bytes(ordinary.slug)).equals(none)).toBe(false);
    await db.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, ordinary.id));
    expect((await bytes(ordinary.slug)).equals(none)).toBe(true); // archiviert: wie nicht vorhanden
  });

  it("Listen, Rangliste, Statistik: ein gespieltes Privatspiel taucht nirgends öffentlich auf", async () => {
    const { organizer, match } = await playedGame();
    const teamIds = [match.homeTeamId, match.awayTeamId];
    const board = await listBoard({});
    expect(board.some((e) => e.kind === "match" && e.id === match.id)).toBe(false);
    const profile = await getPlayerProfile(organizer.id, null);
    if (profile && !profile.hidden) expect(profile.results.some((r) => r.matchId === match.id)).toBe(false);
    const boards = await leaderboards({ monthStart: new Date(Date.now() - 7 * 86_400_000), monthEnd: new Date(Date.now() + 86_400_000) });
    expect(boards.monthly.some((t) => teamIds.includes(t.id))).toBe(false); // Monatsrangliste
    expect(boards.teamElo.some((t) => teamIds.includes(t.id))).toBe(false);
    expect((await db.select().from(teamStats)).some((s) => teamIds.includes(s.teamId))).toBe(false); // Statistik
  });
});

describe("Einladungslink zurückziehen und neu erzeugen (T56, AC-10)", () => {
  const validInvites = (matchId: string) => db.select().from(gameInvites).where(eq(gameInvites.matchId, matchId));

  it("neu erzeugen: der alte Link ist ungültig (Vorschau und Beitritt), der neue funktioniert, Beigetretene bleiben, nie zwei gültige Links", async () => {
    const { organizer, match, token, players } = await game(2);
    const fresh = await regenerateGameInvite(organizer.id, match.id);
    expect(fresh).not.toBe(token);
    expect(fresh.length).toBeGreaterThanOrEqual(20); // zufällig wie bisher (16 Byte base64url)
    expect((await getGameInvitePreview(token)).status).toBe("invalid");
    const late = await makeUser("pvlate");
    await expect(joinPrivateGame(late.id, token)).rejects.toThrow(/ungültig/);
    expect((await getGameInvitePreview(fresh)).status).toBe("valid");
    expect(await joinPrivateGame(late.id, fresh)).toEqual({ matchId: match.id, already: false });
    expect(await getGameInviteToken(organizer.id, match.id)).toBe(fresh); // der Veranstalter sieht den neuen Link
    expect(await validInvites(match.id)).toHaveLength(1);
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(parts.map((p) => p.userId)).toEqual(expect.arrayContaining([...players.map((p) => p.id), late.id])); // Bereits Beigetretene bleiben
    expect(parts).toHaveLength(4);
  });

  it("zurückziehen: kein gültiger Link mehr, alter Link ungültig, danach lässt sich ein neuer erzeugen", async () => {
    const { organizer, match, token } = await game(1);
    await revokeGameInvite(organizer.id, match.id);
    expect(await getGameInviteToken(organizer.id, match.id)).toBeNull();
    expect((await getGameInvitePreview(token)).status).toBe("invalid");
    const p = await makeUser("pvrev");
    await expect(joinPrivateGame(p.id, token)).rejects.toThrow(/ungültig/);
    await revokeGameInvite(organizer.id, match.id); // zweites Zurückziehen ist harmlos
    const fresh = await regenerateGameInvite(organizer.id, match.id);
    expect(await joinPrivateGame(p.id, fresh)).toEqual({ matchId: match.id, already: false });
  });

  it("Rechte serverseitig: Fremde, normale Spieler und der Captain nur des anderen Teams werden abgewiesen; der Link bleibt unverändert", async () => {
    const { organizer, match, token, players } = await game(2);
    const stranger = await makeUser("pvfremd");
    const captainAway = players[1];
    await db.insert(teamMembers).values({ teamId: match.awayTeamId, userId: captainAway.id, role: "admin" });
    for (const actor of [stranger, players[2], captainAway]) {
      await expect(revokeGameInvite(actor.id, match.id)).rejects.toThrow(/Veranstalter/);
      await expect(regenerateGameInvite(actor.id, match.id)).rejects.toThrow(/Veranstalter/);
    }
    expect(await getGameInviteToken(organizer.id, match.id)).toBe(token);
    expect((await getGameInvitePreview(token)).status).toBe("valid");
    // Plattform-Admins dürfen (Fallback)
    const admin = await makeUser("pvadm", "admin");
    expect(await regenerateGameInvite(admin.id, match.id)).not.toBe(token);
    // abgesagtes Spiel: kein neuer Link
    await db.update(matches).set({ status: "cancelled" }).where(eq(matches.id, match.id));
    await expect(regenerateGameInvite(organizer.id, match.id)).rejects.toThrow(/abgesagt|vorbei/);
  });

  it("Neuer Link bei beendetem Spiel wird abgelehnt (Status played)", async () => {
    const { organizer, match, token } = await game(1);
    await db.update(matches).set({ status: "played" }).where(eq(matches.id, match.id));
    await expect(regenerateGameInvite(organizer.id, match.id)).rejects.toThrow(/schon vorbei/);
    expect((await getGameInvitePreview(token)).status).toBe("valid"); // nichts verändert
  });

  it("Nicht Berechtigte bekommen immer dieselbe Meldung: unbekannte ID, keine UUID, kein Privatspiel und fremdes Privatspiel sind nicht unterscheidbar", async () => {
    const { match } = await game(1);
    const other = await game(0);
    const stranger = await makeUser("pvfremd");
    await db.update(matches).set({ kind: "team" }).where(eq(matches.id, other.match.id)); // kein Privatspiel mehr
    const messages = new Set<string>();
    for (const id of [match.id, other.match.id, "00000000-0000-4000-8000-000000000000", "keine-uuid", "", "1; drop table matches"]) {
      for (const fn of [revokeGameInvite, regenerateGameInvite]) {
        const err = await fn(stranger.id, id).then(() => null, (e: unknown) => e as Error);
        expect(err, `id=${id}`).toBeInstanceOf(Error);
        expect(err!.constructor.name, `id=${id}`).toBe("DomainError"); // keine Datenbank-Fehlermeldung
        messages.add(err!.message);
      }
    }
    expect([...messages]).toEqual(["Nur der Veranstalter kann den Einladungslink verwalten."]);
    // auch der Veranstalter bekommt bei einer ungültigen ID eine saubere Meldung (kein Datenbankfehler)
    await expect(revokeGameInvite(other.organizer.id, "keine-uuid")).rejects.toThrow(/Veranstalter/);
  });

  it("Widerruf während jemand die Beitrittsseite offen hat: der Beitritt schlägt kontrolliert fehl (nach Sperre des Spiels erneut geprüft)", async () => {
    const { organizer, match, token } = await game(1);
    const p = await makeUser("pvrace");
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    // Der Widerruf hält die Sperre auf dem Spiel; der Beitritt hat den Link schon gelesen und wartet auf die Sperre
    const revoking = db.transaction(async (tx) => {
      await tx.select().from(matches).where(eq(matches.id, match.id)).for("update");
      await hold;
      await tx.delete(gameInvites).where(eq(gameInvites.matchId, match.id));
    });
    await new Promise((r) => setTimeout(r, 150));
    const joining = joinPrivateGame(p.id, token);
    const outcome = joining.then(() => "ok", (e: unknown) => e);
    await new Promise((r) => setTimeout(r, 300));
    release();
    await revoking;
    const result = await outcome;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/ungültig/);
    const parts = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, p.id)));
    expect(parts).toHaveLength(0);
    void organizer;
  });

  it("paralleler Beitritt und Widerruf: nur kontrollierte Fehler, nach dem Widerruf kommt niemand mehr mit dem alten Link hinein", async () => {
    const { organizer, match, token } = await game(1);
    const joiners = await Promise.all([makeUser("pvj"), makeUser("pvj"), makeUser("pvj")]);
    const results = await Promise.allSettled([...joiners.map((u) => joinPrivateGame(u.id, token)), revokeGameInvite(organizer.id, match.id)]);
    for (const r of results) if (r.status === "rejected") expect(String(r.reason?.message)).toMatch(/ungültig|abgelaufen/);
    const late = await makeUser("pvj");
    await expect(joinPrivateGame(late.id, token)).rejects.toThrow(/ungültig/);
  });

  it("Audit: Zurückziehen und Neuerzeugen werden protokolliert, ohne den Token zu speichern", async () => {
    const { organizer, match, token } = await game(0);
    await revokeGameInvite(organizer.id, match.id);
    const fresh = await regenerateGameInvite(organizer.id, match.id);
    const list = await db.select().from(auditLog).where(and(eq(auditLog.entityId, match.id), like(auditLog.action, "private.invite%")));
    expect(list.map((r) => r.action)).toEqual(expect.arrayContaining(["private.invite.revoke", "private.invite.regenerate"]));
    expect(list.every((r) => r.actorId === organizer.id)).toBe(true);
    expect(JSON.stringify(list)).not.toContain(token);
    expect(JSON.stringify(list)).not.toContain(fresh);
  });
});

describe("Zufällige Einteilung und Sperren (T58, AC-13)", () => {
  const sideCounts = async (matchId: string, homeTeamId: string, awayTeamId: string) => {
    const parts = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
    return { home: parts.filter((p) => p.teamId === homeTeamId).length, away: parts.filter((p) => p.teamId === awayTeamId).length, none: parts.filter((p) => p.teamId === null).length };
  };

  it("Teams sind bei geraden und ungeraden Zahlen ausgeglichen (Differenz höchstens 1), auch nach einer Einteilung von Hand", async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { organizer, match } = await game(n, { maxPlayers: 10 }); // n + 1 Teilnehmer
      await randomSplit(organizer.id, match.id);
      const c = await sideCounts(match.id, match.homeTeamId, match.awayTeamId);
      expect(c.none, `n=${n}`).toBe(0);
      expect(c.home + c.away, `n=${n}`).toBe(n + 1);
      expect(Math.abs(c.home - c.away), `n=${n}`).toBeLessThanOrEqual(1);
    }
    // 3 von Hand zu Rot, der Rest zufällig: trotzdem ausgeglichen
    const { organizer, match, players } = await game(6);
    for (const p of players.slice(0, 3)) await assignSubstitute(organizer.id, match.id, p.id, match.homeTeamId);
    await randomSplit(organizer.id, match.id);
    const c = await sideCounts(match.id, match.homeTeamId, match.awayTeamId);
    expect(c).toEqual({ home: 4, away: 3, none: 0 });
  });

  it("nur der Veranstalter: Fremde und normale Spieler werden bei Einteilung, Neu-Mischen und Rückgängig abgelehnt; der Zustand bleibt", async () => {
    const { organizer, match, players } = await game(5);
    await randomSplit(organizer.id, match.id);
    const before = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    const stranger = await makeUser("pvfremd");
    for (const actor of [stranger, players[2]]) {
      await expect(randomSplit(actor.id, match.id)).rejects.toThrow(/Veranstalter|Berechtigung/);
      await expect(randomSplit(actor.id, match.id, true)).rejects.toThrow(/Veranstalter|Berechtigung/);
      await expect(unassignParticipant(actor.id, match.id, players[3].id)).rejects.toThrow(/Veranstalter/);
    }
    const after = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id));
    expect(after.map((p) => [p.userId, p.teamId]).sort()).toEqual(before.map((p) => [p.userId, p.teamId]).sort());
  });

  it("Rückgängig-Sperre: Bereite und Bezahlte bleiben beim Neu-Mischen, lassen sich nicht zurücksetzen und nicht umteilen", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      const { organizer, match, players } = await game(9, { rentCents: 12_000 });
      await randomSplit(organizer.id, match.id);
      const seatOf = async (id: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, id))))[0].teamId;
      const [paidOnly, paidReady, free] = [players[1], players[2], players[3]];
      await seedShare(paidOnly.id, match.id, 1200); // bezahlter Platz (paid_cents > 0, Altgeld-Zustand lebt bis PR 2), ohne Geldweg
      await seedShare(paidReady.id, match.id, 1200);
      await setReady(paidReady.id, match.id, true);
      const seats = [await seatOf(paidOnly.id), await seatOf(paidReady.id)];

      await expect(unassignParticipant(organizer.id, match.id, paidOnly.id)).rejects.toThrow(/schon bereit oder hat bezahlt/);
      await expect(unassignParticipant(organizer.id, match.id, paidReady.id)).rejects.toThrow(/schon bereit oder hat bezahlt/);
      // Umteilen eines bereits eingeteilten Spielers geht nicht
      const otherTeam = seats[0] === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      await expect(assignSubstitute(organizer.id, match.id, paidOnly.id, otherTeam)).rejects.toThrow(/wartet nicht/);
      // Neu-Mischen: nur Spieler ohne Zahlung und ohne Bereit kommen in die Verlosung
      await randomSplit(organizer.id, match.id, true);
      expect([await seatOf(paidOnly.id), await seatOf(paidReady.id)]).toEqual(seats);
      const c = await sideCounts(match.id, match.homeTeamId, match.awayTeamId);
      expect(c.none).toBe(0);
      expect(Math.abs(c.home - c.away)).toBeLessThanOrEqual(1);
      // ein nicht bezahlter Spieler darf zurückgesetzt werden
      await unassignParticipant(organizer.id, match.id, free.id);
      expect(await seatOf(free.id)).toBeNull();
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });
});

describe("Neu-Mischen schützt Bezahlte und Bereite einzeln (T58 Review, AC-13)", () => {
  /**
   * Vier Spieler (zwei je Team) werden geschützt (bezahlt bzw. bereit); dreimal neu mischen: ihre Plätze dürfen sich nie ändern.
   * Würde die Schutzbedingung fehlen, kämen sie in die Verlosung und landen mit hoher Wahrscheinlichkeit (15/16 je Runde) woanders.
   */
  async function expectProtectedStayPut(protect: (matchId: string, userId: string) => Promise<void>, over: Partial<Parameters<typeof createPrivateGame>[1]> = {}) {
    const { organizer, match, players } = await game(9, over);
    await randomSplit(organizer.id, match.id);
    const seat = async () => new Map((await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, match.id))).map((p) => [p.userId, p.teamId]));
    const seats = await seat();
    const others = players.filter((p) => p.id !== organizer.id);
    const home = others.filter((p) => seats.get(p.id) === match.homeTeamId).slice(0, 2);
    const away = others.filter((p) => seats.get(p.id) === match.awayTeamId).slice(0, 2);
    expect(home).toHaveLength(2);
    expect(away).toHaveLength(2);
    const protectedPlayers = [...home, ...away];
    for (const p of protectedPlayers) await protect(match.id, p.id);
    for (let round = 0; round < 3; round++) {
      await randomSplit(organizer.id, match.id, true);
      const now = await seat();
      for (const p of protectedPlayers) expect(now.get(p.id), `Runde ${round + 1}`).toBe(seats.get(p.id));
      const counts = [...now.values()].reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map<string | null, number>());
      expect(Math.abs((counts.get(match.homeTeamId) ?? 0) - (counts.get(match.awayTeamId) ?? 0))).toBeLessThanOrEqual(1);
      expect(counts.get(null) ?? 0).toBe(0);
    }
  }

  it("mit Zahlungen: Bezahlte (paid_cents > 0, nicht bereit) behalten ihren Platz; nur die Zahlung schützt sie", async () => {
    await setSetting(null, "payments_enabled", true);
    try {
      await expectProtectedStayPut((matchId, userId) => seedShare(userId, matchId, 1200), { rentCents: 12_000 }); // bezahlt = paid_cents > 0 (Altgeld-Zustand, ohne Geldweg)
    } finally {
      await setSetting(null, "payments_enabled", false);
    }
  });

  it("ohne Zahlungen: Bereite (nicht bezahlt) behalten ihren Platz; nur Bereit schützt sie", async () => {
    await expectProtectedStayPut((matchId, userId) => setReady(userId, matchId, true));
  });
});

// 012 M6b PR 1c-i: Kartenmodell-Gegenstücke zu den Guthaben-Tests AC-4, AC-6 und AC-8 (Privatspiel). Schalter AN, Plätze mit hinterlegter Karte (card_ready) und paid_cents = 0:
// cardModeActive ist wahr, die Lobby bewegt kein Geld. Sie bleiben nach dem Löschen der Altfassungen (1c-ii) als Schutz dieser Regeln bestehen.
describe("Privatspiel im Kartenmodell (Gegenstücke zu AC-4, AC-6, AC-8)", () => {
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
  // Anstoß in h Stunden, angelegt vor 100 Stunden: langer Vorlauf, die 48-h-Frist (Liste zu) greift (im Frist-Modell zählt der Vorlauf ab der Anlage)
  const setStart = (matchId: string, h: number) => db.update(matches).set({ startsAt: hours(h), createdAt: hours(-100) }).where(eq(matches.id, matchId));
  const seatedIds = async (matchId: string) => (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, matchId))).filter((x) => x.teamId).map((x) => x.userId);
  const seat = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
  const giveCards = (matchId: string) => db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(eq(matchParticipants.matchId, matchId));
  beforeAll(async () => {
    await setSetting(null, "payments_enabled", true);
    await setSetting(null, "card_payments_enabled", true);
  });
  afterAll(async () => {
    await setSetting(null, "payments_enabled", false);
    await setSetting(null, "card_payments_enabled", false);
  });

  /** Zehn Spieler (oder `extra + 1`), eingeteilt, alle mit Karte und bereit, der Veranstalter hat bestätigt: Anteil 12000 / 10 = 1200 steht fest. */
  const fixedCard = async (extra = 9, maxPlayers = 10) => {
    const g = await game(extra, { rentCents: 12_000, maxPlayers });
    await randomSplit(g.organizer.id, g.match.id);
    await giveCards(g.match.id);
    for (const p of g.players) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.organizer.id, g.match.id);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1200);
    return g;
  };

  it("AC-6: Wer weder Captain noch Veranstalter ist, kann niemanden rauswerfen oder einteilen; nur der Captain darf (nichts wird bezahlt)", async () => {
    const g = await game(8, { rentCents: 12_000 }); // 9 eingeteilte Spieler, ein zehnter Platz bleibt für den Wartenden
    await randomSplit(g.organizer.id, g.match.id);
    await giveCards(g.match.id);
    const stranger = await makeUser("pvfremd");
    const outsider = await makeUser("pvwait");
    await joinPrivateGame(outsider.id, g.token); // wartet auf Einteilung
    const [normal, victim] = [g.players[1], g.players[2]];
    await setReady(victim.id, g.match.id, true);
    for (const actor of [stranger, normal]) {
      await expect(removeParticipant(actor.id, g.match.id, victim.id)).rejects.toThrow(/Berechtigung/);
      await expect(removeParticipant(actor.id, g.match.id, outsider.id)).rejects.toThrow(/Berechtigung/);
      await expect(unassignParticipant(actor.id, g.match.id, normal.id)).rejects.toThrow(/Veranstalter/);
      await expect(randomSplit(actor.id, g.match.id)).rejects.toThrow(/Veranstalter|Berechtigung/);
      await expect(assignSubstitute(actor.id, g.match.id, outsider.id, g.match.homeTeamId)).rejects.toThrow(/Admins/);
    }
    expect((await seat(g.match.id, victim.id)).cardStatus).toBe("card_ready");
    expect((await seat(g.match.id, victim.id)).paidCents).toBe(0);
    await removeParticipant(g.organizer.id, g.match.id, victim.id); // der Captain darf
    expect(await seat(g.match.id, victim.id)).toBeUndefined();
  });

  it("AC-8: weniger als 48 Stunden vor Anstoß werden Austritt und Rauswurf abgelehnt (nach dem Fixieren); Bereit bleibt möglich, Fremde kommen nicht hinein", async () => {
    const g = await fixedCard(9, 12); // zwölf Plätze, zehn belegt: nur die Sperre kann einen Beitritt verhindern
    await drainBackgroundCharges(); // Hintergrundlauf von finalConfirm abwarten (Testhaken, Backlog 190): kein Wettlauf mehr mit dem Test
    // Wettlauf beseitigen (gleiche Familie wie CI #202 Lauf 4): finalConfirm startet im Hintergrund die Abbuchung (void triggerChargesInBackground). Mit Anstoß in 24 h wäre sie sofort fällig und könnte
    // payment_charges anlegen, dann würfe der Austritt "Abbuchung begonnen" statt "48 Stunden". Deshalb VOR dem Zeitsprung ein Platz ohne Karte: das Spiel ist nie abbuchungsbereit (cards_missing),
    // egal wann der Hintergrundlauf auswertet; der Test prüft hart, dass keine Abbuchungszeile existiert.
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, g.players[1].id)));
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id)), "vor dem Zeitsprung: keine Abbuchungszeile").toHaveLength(0);
    await setStart(g.match.id, 24);
    // schlimmster Fall des Hintergrundlaufs ausdrücklich ausführen: nicht abbuchungsbereit, keine Zeile
    expect((await runChargesIfDue(g.match.id)).reason).toBe("cards_missing");
    const [a, b] = [g.players[8], g.players[9]];
    await expect(leaveLobby(a.id, g.match.id)).rejects.toThrow(/48 Stunden/);
    await expect(removeParticipant(g.organizer.id, g.match.id, b.id)).rejects.toThrow(/48 Stunden/);
    expect(await seatedIds(g.match.id)).toHaveLength(10);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1200); // der fixierte Anteil bleibt
    await setReady(a.id, g.match.id, false);
    await setReady(a.id, g.match.id, true);
    const late = await makeUser("pvlate");
    await expect(joinPrivateGame(late.id, g.token)).rejects.toThrow(/gesperrt/);
    expect(await db.select().from(paymentCharges).where(eq(paymentCharges.matchId, g.match.id)), "nach dem Test: weiter keine Abbuchungszeile").toHaveLength(0);
  });

  it("AC-8: auch vor dem Fixieren sind Austritt und Rauswurf unter 48 Stunden gesperrt; der Beitritt per Link bleibt dort möglich", async () => {
    const g = await game(5, { rentCents: 12_000, startsAt: hours(24) }); // kurzfristig angelegt: alle sind per Link beigetreten
    expect(g.players).toHaveLength(6);
    await randomSplit(g.organizer.id, g.match.id);
    await giveCards(g.match.id);
    const [a, b] = [g.players[4], g.players[5]];
    await expect(leaveLobby(a.id, g.match.id)).rejects.toThrow(/48 Stunden/);
    await expect(removeParticipant(g.organizer.id, g.match.id, b.id)).rejects.toThrow(/48 Stunden/);
    expect(await seatedIds(g.match.id)).toHaveLength(6);
    const newcomer = await makeUser("pvnew");
    await expect(joinPrivateGame(newcomer.id, g.token)).resolves.toMatchObject({ already: false });
  });

  it("AC-4: Anteil = Miete ÷ eingeteilte Spieler, das zweite Bereit fixiert genau einmal (auch parallel); ein Austritt (mehr als 48 Stunden vorher) hebt die Festschreibung auf und setzt Bereit zurück", async () => {
    const g = await fixedCard(); // 12000 / 10 = 1200
    const m = await reloadMatch(g.match.id);
    expect(m.homeFinalAt).not.toBeNull();
    expect(m.awayFinalAt).not.toBeNull();
    expect(m.settledAt).toBeNull();
    await Promise.allSettled([finalConfirm(g.organizer.id, g.match.id), finalConfirm(g.organizer.id, g.match.id)]);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1200); // weiter genau ein fester Anteil
    for (const p of g.players) expect((await seat(g.match.id, p.id)).paidCents).toBe(0); // die Lobby hat nichts bezahlt
    await leaveLobby(g.players[9].id, g.match.id); // Startzeit liegt Tage voraus
    const after = await reloadMatch(g.match.id);
    expect(after.finalShareCents).toBeNull(); // mit 9 Spielern gilt ein neuer Anteil (1334), er wird erst beim nächsten zweiten Bereit fixiert
    expect(after.homeFinalAt).toBeNull();
    expect(after.awayFinalAt).toBeNull();
  });

  // Paket 4 (Kartenfixture): Gegenstück zu "AC-3: mit aktiven Zahlungen lehnt der Server das Bereit des Captains ab, solange ein Teamspieler nicht bezahlt hat" (Privatspiel, Karte statt Zahlung)
  it("AC-3: das Bereit des Captains wird abgelehnt, solange ein Teamspieler keine Karte hat; auch ein bereiter Spieler, dessen Karte weg ist, blockiert; danach gelingt es", async () => {
    const { organizer, match, players } = await game(9, { rentCents: 12_000 });
    await randomSplit(organizer.id, match.id);
    const [late, ...others] = players.slice().reverse();
    for (const p of others) {
      await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, p.id)));
      await setReady(p.id, match.id, true);
    }
    await expect(setReady(late.id, match.id, true)).rejects.toThrow(/Karte/);
    await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/Karte|bereit/);
    expect((await reloadMatch(match.id)).homeFinalAt).toBeNull();
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, late.id)));
    await setReady(late.id, match.id, true);
    // ein bereiter Spieler verliert danach die Karte: die Prüfung steht im Server, nicht nur in der Oberfläche
    const victim = others[0];
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, victim.id)));
    await expect(finalConfirm(organizer.id, match.id)).rejects.toThrow(/Karte|bereit/);
    await db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, match.id), eq(matchParticipants.userId, victim.id)));
    await finalConfirm(organizer.id, match.id);
    const m = await reloadMatch(match.id);
    expect(m.homeFinalAt).not.toBeNull();
    expect(m.awayFinalAt).not.toBeNull();
  });

  // Paket 4: Gegenstück zu "AC-5 parallele Austritte: jeder wird genau einmal erstattet, der Anteil gilt für die endgültige Zahl (8 Spieler: 1500)"
  it("AC-5: parallele Austritte: beide gehen genau einmal, es gibt nichts zu erstatten, der Anteil gilt für die endgültige Zahl (8 Spieler: 1500)", async () => {
    const g = await fixedCard(); // 10 Spieler, 12000 / 10 = 1200 fixiert
    // je einer aus jedem Team (beide Teams behalten mindestens 4 Spieler), der Veranstalter bleibt
    const seats = await Promise.all(g.players.slice(1).map(async (p) => ({ p, teamId: (await seat(g.match.id, p.id)).teamId })));
    const a = seats.find((x) => x.teamId === g.match.homeTeamId)!.p;
    const b = seats.find((x) => x.teamId === g.match.awayTeamId)!.p;
    const res = await Promise.allSettled([leaveLobby(a.id, g.match.id), leaveLobby(b.id, g.match.id)]);
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await seatedIds(g.match.id)).toHaveLength(8);
    const m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBeNull(); // Festschreibung aufgehoben
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, g.match.id))).toHaveLength(0); // nichts bezahlt, nichts erstattet
    for (const p of g.players.filter((x) => x.id !== a.id && x.id !== b.id)) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.organizer.id, g.match.id);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1500); // 12000 / 8
  });

  // R-T334: Gegenstück zu "Anteil = Miete ÷ eingeteilte Spieler (KEIN Deckel bei 12)" und "14 Spieler: kein Deckel bei 12": MEHR als 12 Spieler, Anteil literal
  it("14 Spieler: Anteil = Miete ÷ 14 aufgerundet (12000 / 14 = 857,14 -> 858), kein Deckel bei 12 und kein Mindestwert; beim zweiten Bereit fixiert, nichts bezahlt", async () => {
    const g = await game(13, { rentCents: 12_000, maxPlayers: 14 });
    expect(g.players).toHaveLength(14);
    await randomSplit(g.organizer.id, g.match.id);
    await giveCards(g.match.id);
    for (const p of g.players) await setReady(p.id, g.match.id, true);
    await finalConfirm(g.organizer.id, g.match.id);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(858); // Deckel 12 ergäbe 1000, Mindestzahl 8 / Deckel 12 wären 1500 bzw. 1000
    for (const p of g.players) expect((await seat(g.match.id, p.id)).paidCents).toBe(0);
  });

  // R-T334: Gegenstück zu den entfernten "Abrechnung ohne zweites Bereit: Privatspiel rechnet nie mit Mindestzahl 8/Deckel 12, sondern mit Miete ÷ eingeteilte Spieler" (die laufende Neuberechnung vor dem Fixieren)
  it("laufender Anteil vor dem Fixieren: Miete ÷ eingeteilte Spieler, nie mit Mindestzahl 8 und nie mit Deckel 12 (6 Spieler: 2000, 14 Spieler: 858)", async () => {
    const six = await game(5, { rentCents: 12_000 });
    await randomSplit(six.organizer.id, six.match.id);
    expect(await shareToCharge(db, await reloadMatch(six.match.id), 12_000)).toBe(2000); // Mindestzahl 8 ergäbe 1500
    const fourteen = await game(13, { rentCents: 12_000, maxPlayers: 14 });
    await randomSplit(fourteen.organizer.id, fourteen.match.id);
    expect(await shareToCharge(db, await reloadMatch(fourteen.match.id), 12_000)).toBe(858); // Deckel 12 ergäbe 1000
  });
});
