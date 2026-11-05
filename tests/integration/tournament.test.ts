import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { tournamentMatches, tournamentPlayers, tournaments } from "@/db/schema-league";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { confirmResult, submitResult } from "@/server/results";
import {
  cancelTournament,
  closeWithJoinedTeams,
  createTournament,
  decideShootout,
  getTournament,
  joinAsPlayer,
  leavePlayer,
  payEntry,
  payForTeam,
  registerTeam,
  setOrganizer,
  setTeamReady,
  withdrawTeam,
} from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

const days = (n: number) => new Date(Date.now() + n * 86_400_000);
let key = 0;

async function fund(userId: string, cents: number) {
  await db.transaction((tx) => creditWallet(tx, userId, { from: "bank", amountCents: cents, kind: "adjustment", idempotencyKey: `tfund-${userId}-${++key}` }));
}

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}

// 2 Stunden à 80 Euro = 160 Euro Hallenkosten; bei 4 Teams mit mindestens 4 Spielern zahlt jeder vorab 10 Euro
const base = { name: "Hallen-Cup", city: "Essen", startsAt: days(5), registrationDeadline: days(3), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const newTournament = async (o: { id: string }, over: Partial<typeof base & { isPrivate: boolean }> = {}) => createTournament(o.id, { ...base, ...over });

/** Ein Team mit Captain und `size` Spielern insgesamt, alle im Kader; auf Wunsch haben alle bezahlt. */
async function squad(tid: string, size = 4, pay = true, fee = 1000) {
  const captain = await makeUser("cap");
  const team = await makeTeam(captain.id, "Turnier");
  await registerTeam(captain.id, tid, team.id);
  const players = [captain];
  for (let i = 1; i < size; i++) {
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, tid, team.id);
    players.push(p);
  }
  if (pay) for (const p of players) {
    await fund(p.id, fee * 2);
    await payEntry(p.id, tid);
  }
  return { captain, team, players };
}

const tournamentAccount = async () => (await trialBalance()).rows.find((r) => r.account === "tournament")?.balance ?? 0;
const bracketRows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid));

describe("Turnier anlegen", () => {
  it("nur freigeschaltete Veranstalter, Eingaben werden geprüft, standardmäßig privat mit Einladungstoken", async () => {
    const plain = await makeUser("plain");
    await expect(createTournament(plain.id, base)).rejects.toThrow(/freigeschaltete Veranstalter/);
    const o = await organizer();
    await expect(createTournament(o.id, { ...base, name: "ab" })).rejects.toThrow(/3 bis 80/);
    await expect(createTournament(o.id, { ...base, startsAt: new Date(Date.now() - 1000) })).rejects.toThrow(/Zukunft/);
    await expect(createTournament(o.id, { ...base, registrationDeadline: days(9) })).rejects.toThrow(/vor dem Turnierbeginn/);
    await expect(createTournament(o.id, { ...base, maxTeams: 3 })).rejects.toThrow(/4 bis 32/);
    await expect(createTournament(o.id, { ...base, maxTeams: 33 })).rejects.toThrow(/4 bis 32/);
    await expect(createTournament(o.id, { ...base, hourlyCents: 200_000 })).rejects.toThrow(/1.000 Euro/);
    await expect(createTournament(o.id, { ...base, hourlyCents: -1 })).rejects.toThrow(/1.000 Euro/);
    await expect(createTournament(o.id, { ...base, durationMin: 20 })).rejects.toThrow(/30 Minuten/);
    await expect(createTournament(o.id, { ...base, durationMin: 125 })).rejects.toThrow(/30 Minuten/);
    const t = await newTournament(o);
    expect(t).toMatchObject({ status: "registration", isPrivate: true, format: "knockout", bracketGeneratedAt: null });
    expect(t.inviteToken).toBeTruthy();
    const admin = await makeUser("tadm2", "admin");
    expect((await createTournament(admin.id, base)).organizerId).toBe(admin.id); // Plattform-Admins dürfen immer
  });

  it("private Turniere sieht nur, wer den Token hat, der Veranstalter oder Mitglieder angemeldeter Teams", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const stranger = await makeUser("fremd");
    expect(await getTournament(t.id, { id: stranger.id, role: "player" })).toBeNull();
    expect(await getTournament(t.id, null)).toBeNull();
    expect(await getTournament(t.id, { id: stranger.id, role: "player" }, "falscher-token")).toBeNull();
    expect(await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken)).not.toBeNull();
    const view = await getTournament(t.id, { id: o.id, role: "player" });
    expect(view?.tournament.inviteToken).toBe(t.inviteToken); // der Veranstalter sieht den Link
    expect((await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken))?.tournament.inviteToken).toBeNull(); // Gäste mit Link nicht den Token zum Weitergeben
    const sq = await squad(t.id, 4, false);
    expect(await getTournament(t.id, { id: sq.players[1].id, role: "player" })).not.toBeNull(); // Mitglied eines angemeldeten Teams
    const open = await newTournament(o, { isPrivate: false });
    expect(await getTournament(open.id, null)).not.toBeNull();
  });
});

describe("Beitritt: ein Captain pro Team, Spieler über die Teamlogik", () => {
  it("Regeln für Anmeldung und Kader", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const cap = await makeUser("cap");
    const team = await makeTeam(cap.id, "Regel");
    const outsider = await makeUser("out");
    await expect(registerTeam(outsider.id, t.id, team.id)).rejects.toThrow(/Team-Admins/);
    await registerTeam(cap.id, t.id, team.id);
    await expect(registerTeam(cap.id, t.id, team.id)).rejects.toThrow(/schon angemeldet/);
    const second = await makeTeam(cap.id, "Zweites");
    await expect(registerTeam(cap.id, t.id, second.id)).rejects.toThrow(/schon in einem anderen Team/); // ein Captain, ein Team

    await expect(joinAsPlayer(outsider.id, t.id, team.id)).rejects.toThrow(/Mitglieder des Teams/);
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, team.id);
    await expect(joinAsPlayer(p.id, t.id, team.id)).rejects.toThrow(/schon im Turnier-Kader/);
    await expect(joinAsPlayer(p.id, t.id, second.id)).rejects.toThrow(/nicht im Turnier/);
    // der Kader ist begrenzt
    for (let i = 0; i < 4; i++) {
      const x = await makeUser("pl");
      await db.insert(teamMembers).values({ teamId: team.id, userId: x.id, role: "player" });
      await joinAsPlayer(x.id, t.id, team.id);
    }
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: extra.id, role: "player" });
    await expect(joinAsPlayer(extra.id, t.id, team.id)).rejects.toThrow(/Kader ist voll/);
    // Platzgrenze
    await squad(t.id, 4, false);
    await squad(t.id, 4, false);
    await squad(t.id, 4, false);
    const late = await makeUser("late");
    const lateTeam = await makeTeam(late.id, "Zuspät");
    await expect(registerTeam(late.id, t.id, lateTeam.id)).rejects.toThrow(/voll/);
  });

  it("nach dem Anmeldeschluss geht keine Anmeldung mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    const cap = await makeUser("cap");
    const team = await makeTeam(cap.id, "Spät");
    await expect(registerTeam(cap.id, t.id, team.id)).rejects.toThrow(/Anmeldeschluss/);
  });
});

describe("Eintritt: jeder Spieler zahlt selbst, nie doppelt", () => {
  it("abbuchen, nicht doppelt, auch bei gleichzeitigen Anfragen; Austritt erstattet", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const sq = await squad(t.id, 4, false);
    const p = sq.players[1];
    await expect(payEntry(p.id, t.id)).rejects.toThrow(/Guthaben/); // ohne Guthaben
    await fund(p.id, 3000);
    const tb0 = await tournamentAccount();
    await Promise.allSettled([payEntry(p.id, t.id), payEntry(p.id, t.id), payEntry(p.id, t.id)]); // Doppelklick
    expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await tournamentAccount()).toBe(tb0 + 1000);
    await expect(payEntry(p.id, t.id)).rejects.toThrow(/schon bezahlt/);
    const stranger = await makeUser("fremd");
    await expect(payEntry(stranger.id, t.id)).rejects.toThrow(/nicht im Turnier-Kader/);

    await expect(leavePlayer(stranger.id, t.id, p.id)).rejects.toThrow(/Berechtigung/);
    await expect(leavePlayer(p.id, t.id, sq.captain.id)).rejects.toThrow(/Berechtigung|Captain/);
    await expect(leavePlayer(sq.captain.id, t.id, sq.captain.id)).rejects.toThrow(/Captain kann nicht austreten/);
    await leavePlayer(p.id, t.id, p.id);
    expect(await walletBalance(db, p.id)).toBe(3000); // erstattet, genau einmal
    await expect(leavePlayer(p.id, t.id, p.id)).rejects.toThrow(/nicht im Kader/);
    // erneuter Beitritt und erneutes Bezahlen bucht sauber noch einmal
    await joinAsPlayer(p.id, t.id, sq.team.id);
    await payEntry(p.id, t.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Bereit nur bei vollständiger Zahlung (serverseitig)", () => {
  it("Captain kann nicht bereit drücken, solange jemand nicht bezahlt hat; Kaderänderung setzt zurück", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const sq = await squad(t.id, 4, false);
    const other = await makeUser("pl");
    await expect(setTeamReady(other.id, t.id, true)).rejects.toThrow(/Captain/);
    await expect(setTeamReady(sq.players[1].id, t.id, true)).rejects.toThrow(/Captain/); // normaler Spieler
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/bezahlt/); // niemand hat bezahlt
    for (const p of sq.players.slice(0, 3)) {
      await fund(p.id, 2000);
      await payEntry(p.id, t.id);
    }
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/bezahlt/); // einer fehlt noch
    await fund(sq.players[3].id, 2000);
    await payEntry(sq.players[3].id, t.id);
    await setTeamReady(sq.captain.id, t.id, true);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].ready).toBe(true);

    // neuer, unbezahlter Spieler: "Bereit" ist zurückgesetzt
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: sq.team.id, userId: late.id, role: "player" });
    await joinAsPlayer(late.id, t.id, sq.team.id);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].ready).toBe(false);
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/bezahlt/);
    // er tritt wieder aus: Bereit geht wieder
    await leavePlayer(late.id, t.id, late.id);
    await setTeamReady(sq.captain.id, t.id, true);
    // ein bezahlter Spieler geht: Kader unter dem Minimum, Bereit zurückgesetzt, Erstattung
    await leavePlayer(sq.players[3].id, t.id, sq.players[3].id);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].ready).toBe(false);
    expect(await walletBalance(db, sq.players[3].id)).toBe(2000);
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/mindestens 4/);
    // Bereit lässt sich zurücknehmen
    await joinAsPlayer(sq.players[3].id, t.id, sq.team.id);
    await payEntry(sq.players[3].id, t.id);
    await setTeamReady(sq.captain.id, t.id, true);
    await setTeamReady(sq.captain.id, t.id, false);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].ready).toBe(false);
  });

  it("kostenloses Turnier: Bereit braucht keine Zahlung, aber mindestens 4 Spieler", async () => {
    const o = await organizer();
    const t = await newTournament(o, { hourlyCents: 0 });
    const sq = await squad(t.id, 3, false, 0);
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/mindestens 4/);
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: sq.team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, sq.team.id);
    await setTeamReady(sq.captain.id, t.id, true);
    await expect(payEntry(p.id, t.id)).rejects.toThrow(/kostenlos/);
  });
});

describe("Bracket: verborgen, dann genau einmal", () => {
  it("vor dem letzten Bereit gibt es kein Bracket; danach genau eines; Spiele sind echte Spiele mit allen Spielern", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads = [];
    for (let i = 0; i < 3; i++) squads.push(await squad(t.id, 4, true));
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);
    // das vierte Team fehlt noch: weder Spiele noch Bracket
    expect(await bracketRows(t.id)).toHaveLength(0);
    let view = (await getTournament(t.id, { id: o.id, role: "player" }))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect(view.tournament.status).toBe("registration");
    // das vierte Team ist da, aber noch nicht bereit
    const fourth = await squad(t.id, 4, true);
    expect(await bracketRows(t.id)).toHaveLength(0);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.stages).toEqual([]);

    // die letzten beiden Captains drücken gleichzeitig: genau ein Bracket
    await setTeamReady(squads[0].captain.id, t.id, false);
    await Promise.allSettled([setTeamReady(squads[0].captain.id, t.id, true), setTeamReady(fourth.captain.id, t.id, true)]);
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(3); // 2 Halbfinals und das Finale
    view = (await getTournament(t.id, { id: o.id, role: "player" }))!;
    expect(view.bracketVisible).toBe(true);
    expect(view.tournament.status).toBe("running");
    expect(view.stages.map((s) => s.stage)).toEqual(["ko:4", "ko:2"]);
    await expect(setTeamReady(squads[0].captain.id, t.id, false)).rejects.toThrow(/Bracket steht schon/);
    await expect(joinAsPlayer((await makeUser("x")).id, t.id, squads[0].team.id)).rejects.toThrow(/geschlossen/);

    // Halbfinals sind echte Turnierspiele: privat, ohne Elo, mit allen Spielern beider Teams
    const semis = rows.filter((r) => r.stage === "ko:4");
    for (const s of semis) {
      const [g] = await db.select().from(matches).where(eq(matches.id, s.matchId!));
      expect(g).toMatchObject({ kind: "tournament", visibility: "private", status: "confirmed", homeTeamId: s.teamA, awayTeamId: s.teamB });
      expect(await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.id))).toHaveLength(8);
    }
    expect(rows.find((r) => r.stage === "ko:2")!.matchId).toBeNull(); // das Finale entsteht erst, wenn beide feststehen
  });

  it("Freilose: 5 Teams ergeben 4 Spiele, Teams mit Freilos spielen erst in der nächsten Runde", async () => {
    const o = await organizer();
    const t = await newTournament(o, { maxTeams: 5 });
    const squads = [];
    for (let i = 0; i < 5; i++) squads.push(await squad(t.id, 4, true));
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(4); // n - 1 Spiele
    expect(rows.filter((r) => r.stage === "ko:8")).toHaveLength(1); // nur eine echte Paarung in der ersten Runde
    const withGame = rows.filter((r) => r.matchId);
    expect(withGame.length).toBeGreaterThanOrEqual(1);
    for (const r of withGame) expect(r.teamA && r.teamB).toBeTruthy();
  });
});

async function play(m: { id: string; matchId: string | null; teamA: string | null; teamB: string | null }, a: number, b: number, captains: Map<string, { id: string }>) {
  await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
  await submitResult(captains.get(m.teamA!)!.id, m.matchId!, a, b);
  await confirmResult(captains.get(m.teamB!)!.id, m.matchId!);
}

describe("Ergebnisse führen die Sieger weiter, Auszahlung genau einmal", () => {
  it("Halbfinals, Siebenmeterschießen, Finale, Sieger, Auszahlung abzüglich Provision, Buchhaltung ausgeglichen, kein Elo", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const orgBefore = await walletBalance(db, o.id);
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);

    let rows = await bracketRows(t.id);
    const semis = rows.filter((r) => r.stage === "ko:4").sort((x, y) => x.slot - y.slot);
    const final = rows.find((r) => r.stage === "ko:2")!;
    // erstes Halbfinale endet unentschieden: der Veranstalter entscheidet das Siebenmeterschießen
    await play(semis[0], 2, 2, captains);
    rows = await bracketRows(t.id);
    expect(rows.find((r) => r.id === semis[0].id)).toMatchObject({ scoreA: 2, scoreB: 2, shootoutWinner: null });
    expect((await bracketRows(t.id)).find((r) => r.id === final.id)!.teamA).toBeNull(); // noch kein Sieger
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.stages[0].matches.find((m) => m.id === semis[0].id)!.pendingShootout).toBe(true);
    await expect(decideShootout(squads[0].captain.id, t.id, semis[0].id, semis[0].teamB!)).rejects.toThrow(/Veranstalter/);
    await expect(decideShootout(o.id, t.id, semis[0].id, crypto.randomUUID())).rejects.toThrow(/spielt in diesem Spiel nicht/);
    await decideShootout(o.id, t.id, semis[0].id, semis[0].teamB!);
    await expect(decideShootout(o.id, t.id, semis[0].id, semis[0].teamB!)).rejects.toThrow(/kein Siebenmeterschießen/);

    await play(semis[1], 3, 1, captains);
    rows = await bracketRows(t.id);
    const f = rows.find((r) => r.id === final.id)!;
    expect(f.teamA).toBe(semis[0].teamB);
    expect(f.teamB).toBe(semis[1].teamA);
    expect(f.matchId).not.toBeNull(); // das Finale ist jetzt ein echtes Spiel
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("running");

    await play(f, 0, 1, captains);
    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(done).toMatchObject({ status: "finished", winnerTeamId: f.teamB });
    expect(done.settledAt).not.toBeNull();

    // 16 Spieler x 10 Euro = 160 Euro, 10 % Provision
    expect(await walletBalance(db, o.id)).toBe(orgBefore + 14_400);
    expect((await trialBalance()).balanced).toBe(true);
    // Turnierspiele zählen nicht für Elo und Rangliste
    for (const s of squads) expect(await db.select().from(teamStats).where(eq(teamStats.teamId, s.team.id))).toHaveLength(0);
  });
});

describe("Sonderfälle: Teams ersetzen, mit weniger Teams starten, absagen", () => {
  it("der Veranstalter ersetzt ein Team bis zum Anmeldeschluss; danach nicht mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const a = await squad(t.id, 4, true);
    await squad(t.id, 4, true);
    const stranger = await makeUser("fremd");
    await expect(withdrawTeam(stranger.id, t.id, a.team.id)).rejects.toThrow(/Captain oder der Veranstalter/);
    const before = await walletBalance(db, a.players[1].id);
    await withdrawTeam(o.id, t.id, a.team.id);
    expect(await walletBalance(db, a.players[1].id)).toBe(before + 1000); // erstattet
    expect(await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.teamId, a.team.id)))).toHaveLength(0);
    const replacement = await squad(t.id, 4, true); // Platz ist wieder frei
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(withdrawTeam(o.id, t.id, replacement.team.id)).rejects.toThrow(/Anmeldeschluss/);
    await withdrawTeam(replacement.captain.id, t.id, replacement.team.id); // der Captain selbst darf sich abmelden
  });

  it("nach dem Anmeldeschluss mit weniger Teams starten (mindestens 4); sonst nur absagen", async () => {
    const o = await organizer();
    const t = await newTournament(o, { maxTeams: 5 });
    const squads = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    await expect(closeWithJoinedTeams(o.id, t.id)).rejects.toThrow(/nach dem Anmeldeschluss/);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(closeWithJoinedTeams(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await closeWithJoinedTeams(o.id, t.id);
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].maxTeams).toBe(4);
    // mit 4 statt 5 Teams steigt die Vorauszahlung von 8 auf 10 Euro: wer weniger gezahlt hat, zahlt nach, sonst geht Bereit nicht
    await expect(setTeamReady(squads[0].captain.id, t.id, true)).rejects.toThrow(/bezahlt/);
    for (const s of squads) for (const p of s.players) {
      await payEntry(p.id, t.id);
      expect(await walletBalance(db, p.id)).toBe(2000 - 1000);
      await expect(payEntry(p.id, t.id)).rejects.toThrow(/schon bezahlt/);
    }
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);
    expect(await bracketRows(t.id)).toHaveLength(3);

    const t2 = await newTournament(o, { maxTeams: 8 });
    for (let i = 0; i < 3; i++) await squad(t2.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t2.id));
    await expect(closeWithJoinedTeams(o.id, t2.id)).rejects.toThrow(/weniger als 4/);
  });

  it("Absage erstattet alle bezahlten Eintritte vollständig, genau einmal; nach einem Ergebnis nicht mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const unpaid = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: squads[0].team.id, userId: unpaid.id, role: "player" });
    await joinAsPlayer(unpaid.id, t.id, squads[0].team.id); // ein Spieler ohne Zahlung
    const tbBefore = await tournamentAccount();
    const stranger = await makeUser("fremd");
    await expect(cancelTournament(stranger.id, t.id)).rejects.toThrow(/Veranstalter/);
    await cancelTournament(o.id, t.id);
    for (const s of squads) for (const p of s.players) expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await tournamentAccount()).toBe(tbBefore - 16_000);
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].status).toBe("cancelled");
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/beendet oder abgesagt/);
    expect((await trialBalance()).balanced).toBe(true);

    // abgesagt nach der Bracket-Erzeugung, vor dem ersten Ergebnis: Spiele werden mit abgesagt
    const t2 = await newTournament(o);
    const sq2 = [];
    for (let i = 0; i < 4; i++) sq2.push(await squad(t2.id, 4, true));
    for (const s of sq2) await setTeamReady(s.captain.id, t2.id, true);
    const gameIds = (await bracketRows(t2.id)).filter((r) => r.matchId).map((r) => r.matchId!);
    expect(gameIds.length).toBe(2);
    await cancelTournament(o.id, t2.id);
    for (const id of gameIds) expect((await db.select().from(matches).where(eq(matches.id, id)))[0].status).toBe("cancelled");
    for (const p of sq2.flatMap((s) => s.players)) expect(await walletBalance(db, p.id)).toBe(2000);

    // nach dem ersten Ergebnis geht es nicht mehr
    const t3 = await newTournament(o);
    const sq3 = [];
    for (let i = 0; i < 4; i++) sq3.push(await squad(t3.id, 4, true));
    for (const s of sq3) await setTeamReady(s.captain.id, t3.id, true);
    const captains = new Map(sq3.map((s) => [s.team.id, s.captain]));
    const first = (await bracketRows(t3.id)).find((r) => r.matchId)!;
    await play(first, 1, 0, captains);
    await expect(cancelTournament(o.id, t3.id)).rejects.toThrow(/schon Ergebnisse/);
  });
});

describe("Hallenkosten werden nach der echten Spielerzahl abgerechnet", () => {
  it("Vorauszahlung ist der höchste Anteil; beim Bracket wird genau abgerechnet und der Rest sofort erstattet; Auszahlung stimmt", async () => {
    const o = await organizer();
    const t = await newTournament(o); // 160 Euro, 4 Teams: Vorauszahlung 10 Euro
    expect(t).toMatchObject({ totalCents: 16_000, hourlyCents: 8000, durationMin: 120 });
    const sizes = [4, 5, 5, 6]; // 20 Spieler: endgültiger Anteil 8 Euro
    const squads = [];
    for (const n of sizes) squads.push(await squad(t.id, n, true));
    const view = (await getTournament(t.id, { id: o.id, role: "player" }))!;
    expect(view.pricing).toMatchObject({ totalCents: 16_000, reservationCents: 1000, finalShareCents: null });
    expect(view.pricing.range).toEqual({ lowest: 667, highest: 1000 }); // alle Teams voll (24 Spieler) bis nur das Minimum (16)
    const everyone = squads.flatMap((s) => s.players);
    for (const p of everyone) expect(await walletBalance(db, p.id)).toBe(1000); // 20 Euro Guthaben, 10 Euro vorab gezahlt

    const orgBefore = await walletBalance(db, o.id);
    const tb = await tournamentAccount();
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(row.finalShareCents).toBe(800);
    for (const p of everyone) expect(await walletBalance(db, p.id)).toBe(1200); // 2 Euro zurück, genau einmal
    expect(await tournamentAccount()).toBe(tb - 20 * 200);
    const paid = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
    expect(paid.every((p) => p.paidCents === 800)).toBe(true);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.pricing.finalShareCents).toBe(800);
    expect((await trialBalance()).balanced).toBe(true);

    // Absage nach dem Bracket erstattet den endgültigen Anteil vollständig
    await cancelTournament(o.id, t.id);
    for (const p of everyone) expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await walletBalance(db, o.id)).toBe(orgBefore);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Auszahlung an den Veranstalter: gesammelte Anteile abzüglich Provision", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads = [];
    for (const n of [5, 5, 5, 5]) squads.push(await squad(t.id, n, true)); // 20 Spieler, 8 Euro
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const orgBefore = await walletBalance(db, o.id);
    for (const s of squads) await setTeamReady(s.captain.id, t.id, true);
    for (let round = 0; round < 3; round++) {
      const next = (await bracketRows(t.id)).find((r) => r.matchId && r.scoreA === null);
      if (!next) break;
      await play(next, 1, 0, captains);
    }
    const [done] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(done.status).toBe("finished");
    expect(await walletBalance(db, o.id)).toBe(orgBefore + 16_000 - 1600); // 20 x 8 Euro, 10 % Provision
    expect((await trialBalance()).balanced).toBe(true);
  });
});

/** Team mit Captain und `size` Spielern im Kader, noch ohne Zahlung. */
async function squadUnpaid(tid: string, size: number) {
  return squad(tid, size, false);
}

describe("Wer bezahlt: jeder für sich, der Captain für alle oder für einzelne Spieler", () => {
  it("Captain zahlt für alle offenen Spieler: alles oder nichts, nur der Captain, Nachzahlung für neue Spieler", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const sq = await squadUnpaid(t.id, 4);
    const [p1, p2] = [sq.players[1], sq.players[2]];
    await expect(payForTeam(p1.id, t.id)).rejects.toThrow(/Captain/); // normale Spieler dürfen nicht für andere zahlen
    await expect(payForTeam((await makeUser("fremd")).id, t.id)).rejects.toThrow(/Captain/);
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/bezahlt/);

    // zu wenig Guthaben: es wird gar nichts gebucht
    await fund(sq.captain.id, 2500);
    await expect(payForTeam(sq.captain.id, t.id)).rejects.toThrow(/Guthaben/);
    expect(await walletBalance(db, sq.captain.id)).toBe(2500);
    expect((await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id))).every((x) => x.paidCents === 0)).toBe(true);

    await fund(sq.captain.id, 2500);
    await payForTeam(sq.captain.id, t.id);
    expect(await walletBalance(db, sq.captain.id)).toBe(1000); // 5.000 minus 4 x 10 Euro
    for (const p of sq.players.slice(1)) expect(await walletBalance(db, p.id)).toBe(0); // die Spieler zahlen nichts
    await expect(payForTeam(sq.captain.id, t.id)).rejects.toThrow(/schon komplett/);
    await expect(payEntry(p1.id, t.id)).rejects.toThrow(/schon bezahlt/);
    await setTeamReady(sq.captain.id, t.id, true);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].players.filter((x) => x.paidByOther)).toHaveLength(3);

    // ein neuer Spieler: "Bereit" ist zurückgesetzt, der Captain zahlt nur dessen Anteil
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: sq.team.id, userId: late.id, role: "player" });
    await joinAsPlayer(late.id, t.id, sq.team.id);
    expect((await getTournament(t.id, { id: o.id, role: "player" }))!.teams[0].ready).toBe(false);
    await payForTeam(sq.captain.id, t.id);
    expect(await walletBalance(db, sq.captain.id)).toBe(0);
    await setTeamReady(sq.captain.id, t.id, true);

    // Austritt eines Spielers: die Erstattung geht an den Captain, der gezahlt hat
    await leavePlayer(p2.id, t.id, p2.id);
    expect(await walletBalance(db, sq.captain.id)).toBe(1000);
    expect(await walletBalance(db, p2.id)).toBe(0);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Captain zahlt nur für einzelne Spieler, die anderen zahlen selbst; Erstattung geht jeweils an den Zahler", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const sq = await squadUnpaid(t.id, 4);
    const [p1, p2, p3] = [sq.players[1], sq.players[2], sq.players[3]];
    await expect(payForTeam(sq.captain.id, t.id, (await makeUser("fremd")).id)).rejects.toThrow(/nicht in deinem Team/);
    await fund(sq.captain.id, 3000);
    await payForTeam(sq.captain.id, t.id, p1.id); // nur Spieler 1
    await expect(payForTeam(sq.captain.id, t.id, p1.id)).rejects.toThrow(/schon bezahlt/);
    expect(await walletBalance(db, sq.captain.id)).toBe(2000);
    await fund(p2.id, 1500);
    await payEntry(p2.id, t.id); // Spieler 2 zahlt selbst
    await expect(setTeamReady(sq.captain.id, t.id, true)).rejects.toThrow(/bezahlt/); // Captain und Spieler 3 fehlen
    await payEntry(sq.captain.id, t.id); // der Captain zahlt auch seinen eigenen Anteil
    await payForTeam(sq.captain.id, t.id, p3.id);
    expect(await walletBalance(db, sq.captain.id)).toBe(0);
    await setTeamReady(sq.captain.id, t.id, true);
    const rows = await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id));
    expect(rows.find((x) => x.userId === p1.id)!.paidBy).toBe(sq.captain.id);
    expect(rows.find((x) => x.userId === p2.id)!.paidBy).toBe(p2.id);

    // Spieler 2 (selbst gezahlt) geht: das Geld kommt zu ihm zurück; Spieler 1 (vom Captain bezahlt): zum Captain
    await leavePlayer(p2.id, t.id, p2.id);
    expect(await walletBalance(db, p2.id)).toBe(1500);
    await leavePlayer(sq.captain.id, t.id, p1.id);
    expect(await walletBalance(db, p1.id)).toBe(0);
    expect(await walletBalance(db, sq.captain.id)).toBe(1000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("gemischt über mehrere Teams: Abrechnung beim Bracket und Absage gehen an den jeweiligen Zahler", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const cap = await squadUnpaid(t.id, 5); // Captain zahlt 50 Euro für alle fünf
    await fund(cap.captain.id, 5000);
    await payForTeam(cap.captain.id, t.id);
    const others = [];
    for (let i = 0; i < 3; i++) others.push(await squad(t.id, 5, true)); // je Spieler 10 Euro vorab
    const everyone = [...cap.players, ...others.flatMap((x) => x.players)];
    expect(everyone).toHaveLength(20);
    await setTeamReady(cap.captain.id, t.id, true);
    for (const x of others) await setTeamReady(x.captain.id, t.id, true);

    // 20 Spieler: endgültiger Anteil 8 Euro, 2 Euro je Spieler zurück: beim Captain-Team 5 x 2 = 10 Euro an den Captain
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].finalShareCents).toBe(800);
    expect(await walletBalance(db, cap.captain.id)).toBe(1000);
    for (const p of cap.players.slice(1)) expect(await walletBalance(db, p.id)).toBe(0);
    for (const x of others) for (const p of x.players) expect(await walletBalance(db, p.id)).toBe(1200);
    expect((await trialBalance()).balanced).toBe(true);

    await cancelTournament(o.id, t.id); // Absage: der Captain bekommt seine 5 x 8 Euro zurück
    expect(await walletBalance(db, cap.captain.id)).toBe(5000);
    for (const x of others) for (const p of x.players) expect(await walletBalance(db, p.id)).toBe(2000);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Aufräumen der Zählung", () => {
  it("Spielernamen und Zahlungsstatus stehen in der Lobby-Ansicht", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const sq = await squad(t.id, 4, false);
    await fund(sq.players[1].id, 2000);
    await payEntry(sq.players[1].id, t.id);
    const view = (await getTournament(t.id, { id: o.id, role: "player" }))!;
    const team = view.teams[0];
    expect(team.players).toHaveLength(4);
    expect(team.players.filter((p) => p.paid)).toHaveLength(1);
    expect(team.players.find((p) => p.isCaptain)?.userId).toBe(sq.captain.id);
    expect(team.captainName).toBeTruthy();
    expect(team.complete).toBe(false);
  });
});
