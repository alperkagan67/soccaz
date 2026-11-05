import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, teamMembers } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
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
  reopenRosters,
  setOrganizer,
  setRosterComplete,
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

// 2 Stunden à 80 Euro = 160 Euro Hallenkosten, 4 Teams
const base = { name: "Hallen-Cup", city: "Essen", startsAt: days(5), registrationDeadline: days(3), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
const newTournament = async (o: { id: string }, over: Partial<typeof base & { isPrivate: boolean }> = {}) => createTournament(o.id, { ...base, ...over });
const orgView = (o: { id: string }, tid: string) => getTournament(tid, { id: o.id, role: "player" });
const statusOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];

type Squad = Awaited<ReturnType<typeof squad>>;

/** Ein Team mit Captain und \`size\` Spielern im Kader; auf Wunsch meldet der Captain "vollzählig". */
async function squad(tid: string, size = 4, complete = false) {
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
  if (complete) await setRosterComplete(captain.id, tid, true);
  return { captain, team, players };
}

/** Alle Spieler bekommen Guthaben und zahlen selbst. */
async function payAll(tid: string, squads: Squad[]) {
  for (const s of squads) for (const p of s.players) {
    await fund(p.id, 3000);
    await payEntry(p.id, tid);
  }
}

/** Turnier mit vier Teams (je 4 Spieler): alle vollzählig, alle bezahlt, Bracket steht. Anteil 10 Euro. */
async function runningTournament(o: { id: string }, over: Partial<typeof base> = {}) {
  const t = await newTournament(o, over);
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, 4, true));
  await payAll(t.id, squads);
  return { t, squads };
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
    expect(t).toMatchObject({ status: "registration", isPrivate: true, format: "knockout", bracketGeneratedAt: null, totalCents: 16_000, finalShareCents: null });
    expect(t.inviteToken).toBeTruthy();
    const admin = await makeUser("tadm2", "admin");
    expect((await createTournament(admin.id, base)).organizerId).toBe(admin.id); // Plattform-Admins dürfen immer
  });

  it("Bracket sehen alle, Kader, Zahlungen und Einladungslink privater Turniere nur Eingeweihte", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const stranger = await makeUser("fremd");
    const sq0 = await squad(t.id, 4);
    for (const viewer of [null, { id: stranger.id, role: "player" as const }]) {
      const v = await getTournament(t.id, viewer, "falscher-token");
      expect(v).not.toBeNull(); // Zuschauer
      expect(v?.tournament.inviteToken).toBeNull();
      expect(v?.teams.every((x) => x.players.length === 0)).toBe(true);
      expect(v?.viewer?.registerableTeams ?? []).toEqual([]);
    }
    expect((await getTournament(t.id, { id: sq0.players[1].id, role: "player" }))?.teams.some((x) => x.players.length > 0)).toBe(true);
    expect(await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken)).not.toBeNull();
    expect((await orgView(o, t.id))?.tournament.inviteToken).toBe(t.inviteToken); // der Veranstalter sieht den Link
    expect((await getTournament(t.id, { id: stranger.id, role: "player" }, t.inviteToken))?.tournament.inviteToken).toBeNull(); // Gäste mit Link nicht den Token zum Weitergeben
    const sq = await squad(t.id, 4);
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
    for (let i = 0; i < 4; i++) {
      const x = await makeUser("pl");
      await db.insert(teamMembers).values({ teamId: team.id, userId: x.id, role: "player" });
      await joinAsPlayer(x.id, t.id, team.id);
    }
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: team.id, userId: extra.id, role: "player" });
    await expect(joinAsPlayer(extra.id, t.id, team.id)).rejects.toThrow(/Kader ist voll/);
    await squad(t.id, 4);
    await squad(t.id, 4);
    await squad(t.id, 4);
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

describe("Team vollzählig: erst wenn alle da sind, dann wird der Preis automatisch berechnet", () => {
  it("nur der Captain, 4 bis 6 Spieler; Kaderänderung hebt die Meldung auf; vorher kann niemand bezahlen", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const small = await squad(t.id, 3);
    await expect(setRosterComplete(small.captain.id, t.id, true)).rejects.toThrow(/4 bis 6/);
    await expect(setRosterComplete(small.players[1].id, t.id, true)).rejects.toThrow(/Captain/); // normaler Spieler
    await expect(setRosterComplete((await makeUser("fremd")).id, t.id, true)).rejects.toThrow(/Captain/);
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: small.team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, small.team.id);
    await setRosterComplete(small.captain.id, t.id, true);
    expect((await orgView(o, t.id))!.teams[0].ready).toBe(true);

    // vor der Preisfestlegung zahlen geht nicht
    await fund(small.captain.id, 3000);
    await expect(payEntry(small.captain.id, t.id)).rejects.toThrow(/Preis pro Spieler feststeht/);
    await expect(payForTeam(small.captain.id, t.id)).rejects.toThrow(/Preis pro Spieler feststeht/);

    // ein neuer Spieler: die Meldung ist aufgehoben
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: small.team.id, userId: late.id, role: "player" });
    await joinAsPlayer(late.id, t.id, small.team.id);
    expect((await orgView(o, t.id))!.teams[0].ready).toBe(false);
    await setRosterComplete(small.captain.id, t.id, true);
    await setRosterComplete(small.captain.id, t.id, false); // zurücknehmen geht, solange der Preis nicht feststeht
    expect((await orgView(o, t.id))!.teams[0].ready).toBe(false);
    expect((await statusOf(t.id)).status).toBe("registration");
  });

  it("alle Teams vollzählig: der Preis ist Hallenkosten durch alle Spieler, der Kader ist gesperrt", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    for (const n of [4, 5, 5]) await squad(t.id, n, true);
    expect((await statusOf(t.id)).status).toBe("registration"); // das vierte Team fehlt noch
    const last = await squad(t.id, 6, false);
    expect((await statusOf(t.id)).status).toBe("registration"); // da, aber nicht vollzählig
    await setRosterComplete(last.captain.id, t.id, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 800 }); // 160 Euro / 20 Spieler
    expect((await orgView(o, t.id))!.pricing).toMatchObject({ shareCents: 800, players: 20 });
  });

  it("in der Zahlungsphase ist der Kader gesperrt", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    expect((await statusOf(t.id)).status).toBe("payment");
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: squads[0].team.id, userId: late.id, role: "player" });
    await expect(joinAsPlayer(late.id, t.id, squads[0].team.id)).rejects.toThrow(/geschlossen/);
    await expect(leavePlayer(squads[0].captain.id, t.id, squads[0].players[1].id)).rejects.toThrow(/keine Änderung/);
    await expect(withdrawTeam(squads[0].captain.id, t.id, squads[0].team.id)).rejects.toThrow(/Nach dem Start/);
    await expect(setRosterComplete(squads[0].captain.id, t.id, false)).rejects.toThrow(/Preis steht schon fest/);
  });
});

describe("Zahlung: genau der Preis, jeder selbst, nie doppelt", () => {
  it("abbuchen, nicht doppelt, auch bei gleichzeitigen Anfragen; ohne Guthaben nichts", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true)); // 16 Spieler, 10 Euro
    const p = squads[0].players[1];
    await expect(payEntry(p.id, t.id)).rejects.toThrow(/Guthaben/);
    await fund(p.id, 3000);
    const tb0 = await tournamentAccount();
    await Promise.allSettled([payEntry(p.id, t.id), payEntry(p.id, t.id), payEntry(p.id, t.id)]); // Doppelklick
    expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await tournamentAccount()).toBe(tb0 + 1000);
    await expect(payEntry(p.id, t.id)).rejects.toThrow(/schon bezahlt/);
    await expect(payEntry((await makeUser("fremd")).id, t.id)).rejects.toThrow(/nicht im Turnier-Kader/);
    const rows = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, p.id)));
    expect(rows[0]).toMatchObject({ paidCents: 1000, paidBy: p.id });
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Captain zahlt für alle oder einzelne, alles oder nichts; Erstattung geht an den Zahler", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const [a, b] = [squads[0], squads[1]];
    await expect(payForTeam(a.players[1].id, t.id)).rejects.toThrow(/Captain/); // normale Spieler dürfen nicht für andere zahlen
    await expect(payForTeam(a.captain.id, t.id, b.players[1].id)).rejects.toThrow(/nicht in deinem Team/);

    // zu wenig Guthaben: nichts wird gebucht
    await fund(a.captain.id, 2500);
    await expect(payForTeam(a.captain.id, t.id)).rejects.toThrow(/Guthaben/);
    expect(await walletBalance(db, a.captain.id)).toBe(2500);

    await payForTeam(a.captain.id, t.id, a.players[1].id); // nur ein Spieler: 10 Euro
    expect(await walletBalance(db, a.captain.id)).toBe(1500);
    await expect(payForTeam(a.captain.id, t.id, a.players[1].id)).rejects.toThrow(/schon bezahlt/);
    await fund(a.players[2].id, 1000);
    await payEntry(a.players[2].id, t.id); // der Spieler zahlt selbst
    await fund(a.captain.id, 500);
    await payForTeam(a.captain.id, t.id); // alle übrigen (Captain und Spieler 3): 2 x 10 Euro
    expect(await walletBalance(db, a.captain.id)).toBe(0);
    await expect(payForTeam(a.captain.id, t.id)).rejects.toThrow(/schon komplett/);
    expect((await orgView(o, t.id))!.teams[0].players.filter((x) => x.paidByOther)).toHaveLength(2); // Spieler 1 und 3 hat der Captain bezahlt (sich selbst nicht als "von anderen")

    // Absage: jeder bekommt zurück, was er selbst gezahlt hat; der Captain das, was er für andere zahlte
    await cancelTournament(o.id, t.id);
    expect(await walletBalance(db, a.captain.id)).toBe(3000);
    expect(await walletBalance(db, a.players[2].id)).toBe(1000);
    expect(await walletBalance(db, a.players[1].id)).toBe(0);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Bracket: verborgen, bis alle bezahlt haben, dann genau einmal", () => {
  it("vor der letzten Zahlung kein Bracket; nach der letzten genau eines; echte Spiele mit allen Spielern", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const players = squads.flatMap((s) => s.players);
    expect(players).toHaveLength(16);
    expect((await orgView(o, t.id))!.bracketVisible).toBe(false);

    // alle bis auf die letzten zwei zahlen
    for (const p of players.slice(0, 14)) {
      await fund(p.id, 2000);
      await payEntry(p.id, t.id);
    }
    expect(await bracketRows(t.id)).toHaveLength(0);
    let view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect((await statusOf(t.id)).status).toBe("payment");

    // die letzten beiden zahlen gleichzeitig: genau ein Bracket
    for (const p of players.slice(14)) await fund(p.id, 2000);
    await Promise.allSettled(players.slice(14).map((p) => payEntry(p.id, t.id)));
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(3); // 2 Halbfinals und das Finale
    view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(true);
    expect(view.tournament.status).toBe("running");
    expect(view.stages.map((s) => s.stage)).toEqual(["ko:4", "ko:2"]);
    await expect(payEntry(players[0].id, t.id)).rejects.toThrow(/Preis pro Spieler feststeht/);

    const semis = rows.filter((r) => r.stage === "ko:4");
    for (const s of semis) {
      const [g] = await db.select().from(matches).where(eq(matches.id, s.matchId!));
      expect(g).toMatchObject({ kind: "tournament", visibility: "private", status: "confirmed", homeTeamId: s.teamA, awayTeamId: s.teamB });
      expect(await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.id))).toHaveLength(8);
    }
    expect(rows.find((r) => r.stage === "ko:2")!.matchId).toBeNull(); // das Finale entsteht erst, wenn beide feststehen
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("kostenloses Turnier: das Bracket steht, sobald alle Teams vollzählig sind", async () => {
    const o = await organizer();
    const t = await newTournament(o, { hourlyCents: 0 });
    for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "running", finalShareCents: 0 });
    expect(await bracketRows(t.id)).toHaveLength(3);
  });

  it("Freilose: 5 Teams ergeben 4 Spiele, Teams mit Freilos spielen erst in der nächsten Runde", async () => {
    const o = await organizer();
    const t = await newTournament(o, { maxTeams: 5 });
    const squads: Squad[] = [];
    for (let i = 0; i < 5; i++) squads.push(await squad(t.id, 4, true)); // 20 Spieler, 8 Euro
    await payAll(t.id, squads);
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(4); // n - 1 Spiele
    expect(rows.filter((r) => r.stage === "ko:8")).toHaveLength(1);
    for (const r of rows.filter((x) => x.matchId)) expect(r.teamA && r.teamB).toBeTruthy();
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
    const orgBefore = await walletBalance(db, o.id);
    const { t, squads } = await runningTournament(o); // 16 Spieler x 10 Euro = 160 Euro
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));

    let rows = await bracketRows(t.id);
    const semis = rows.filter((r) => r.stage === "ko:4").sort((x, y) => x.slot - y.slot);
    const final = rows.find((r) => r.stage === "ko:2")!;
    // erstes Halbfinale endet unentschieden: der Veranstalter entscheidet das Siebenmeterschießen
    await play(semis[0], 2, 2, captains);
    rows = await bracketRows(t.id);
    expect(rows.find((r) => r.id === semis[0].id)).toMatchObject({ scoreA: 2, scoreB: 2, shootoutWinner: null });
    expect(rows.find((r) => r.id === final.id)!.teamA).toBeNull(); // noch kein Sieger
    expect((await orgView(o, t.id))!.stages[0].matches.find((m) => m.id === semis[0].id)!.pendingShootout).toBe(true);
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
    expect((await statusOf(t.id)).status).toBe("running");

    await play(f, 0, 1, captains);
    const done = await statusOf(t.id);
    expect(done).toMatchObject({ status: "finished", winnerTeamId: f.teamB });
    expect(done.settledAt).not.toBeNull();

    // 16 Spieler x 10 Euro = 160 Euro, 10 % Provision
    expect(await walletBalance(db, o.id)).toBe(orgBefore + 14_400);
    expect((await trialBalance()).balanced).toBe(true);
    for (const s of squads) expect(await db.select().from(teamStats).where(eq(teamStats.teamId, s.team.id))).toHaveLength(0);
  });

  it("Auszahlung bei ungleich großen Kadern: Hallenkosten durch alle Spieler, nie unterdeckt", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 5, true)); // 20 Spieler, 8 Euro
    expect((await statusOf(t.id)).finalShareCents).toBe(800);
    await payAll(t.id, squads);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const orgBefore = await walletBalance(db, o.id);
    for (let i = 0; i < 3; i++) {
      const next = (await bracketRows(t.id)).find((r) => r.matchId && r.scoreA === null);
      if (!next) break;
      await play(next, 1, 0, captains);
    }
    expect((await statusOf(t.id)).status).toBe("finished");
    expect(await walletBalance(db, o.id)).toBe(orgBefore + 16_000 - 1600); // 20 x 8 Euro, 10 % Provision
    expect((await trialBalance()).balanced).toBe(true);
  });
});

describe("Sonderfälle: Teams ersetzen, mit weniger Teams starten, Kader wieder öffnen, absagen", () => {
  it("der Veranstalter ersetzt ein Team bis zum Anmeldeschluss; danach nicht mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const a = await squad(t.id, 4, true);
    await squad(t.id, 4, true);
    const stranger = await makeUser("fremd");
    await expect(withdrawTeam(stranger.id, t.id, a.team.id)).rejects.toThrow(/Captain oder der Veranstalter/);
    await withdrawTeam(o.id, t.id, a.team.id);
    expect(await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.teamId, a.team.id)))).toHaveLength(0);
    const replacement = await squad(t.id, 4, true); // Platz ist wieder frei
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(withdrawTeam(o.id, t.id, replacement.team.id)).rejects.toThrow(/Anmeldeschluss/);
    await withdrawTeam(replacement.captain.id, t.id, replacement.team.id); // der Captain selbst darf sich abmelden
  });

  it("nach dem Anmeldeschluss mit weniger Teams starten (mindestens 4); der Preis wird dann mit den vorhandenen Teams berechnet", async () => {
    const o = await organizer();
    const t = await newTournament(o, { maxTeams: 5 });
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    expect((await statusOf(t.id)).status).toBe("registration"); // das fünfte Team fehlt
    await expect(closeWithJoinedTeams(o.id, t.id)).rejects.toThrow(/nach dem Anmeldeschluss/);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t.id));
    await expect(closeWithJoinedTeams(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await closeWithJoinedTeams(o.id, t.id);
    expect(await statusOf(t.id)).toMatchObject({ maxTeams: 4, status: "payment", finalShareCents: 1000 }); // 160 Euro / 16 Spieler

    const t2 = await newTournament(o, { maxTeams: 8 });
    for (let i = 0; i < 3; i++) await squad(t2.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, t2.id));
    await expect(closeWithJoinedTeams(o.id, t2.id)).rejects.toThrow(/weniger als 4/);
  });

  it("Kader wieder öffnen: alles wird erstattet, der Preis wird neu berechnet, Zahlen geht danach wieder sauber", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const players = squads.flatMap((s) => s.players);
    for (const p of players.slice(0, 10)) {
      await fund(p.id, 3000);
      await payEntry(p.id, t.id); // zehn haben bezahlt, sechs nicht
    }
    await expect(reopenRosters(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await reopenRosters(o.id, t.id);
    expect(await statusOf(t.id)).toMatchObject({ status: "registration", finalShareCents: null });
    for (const p of players.slice(0, 10)) expect(await walletBalance(db, p.id)).toBe(3000);
    expect((await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id))).every((x) => x.paidCents === 0)).toBe(true);
    expect((await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))).every((x) => x.readyAt === null)).toBe(true);
    await expect(reopenRosters(o.id, t.id)).rejects.toThrow(/Zahlung läuft/);
    expect((await trialBalance()).balanced).toBe(true);

    // ein Team nimmt einen Spieler dazu: wieder vollzählig, neuer Preis (17 Spieler), zahlen mit neuem Buchungsschlüssel
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: squads[1].team.id, userId: extra.id, role: "player" });
    await joinAsPlayer(extra.id, t.id, squads[1].team.id);
    for (const s of squads) await setRosterComplete(s.captain.id, t.id, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 942 }); // 160 Euro / 17 Spieler, aufgerundet
    const first = players[0];
    await payEntry(first.id, t.id);
    expect(await walletBalance(db, first.id)).toBe(3000 - 942);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Absage erstattet alle bezahlten Anteile vollständig, genau einmal; nach einem Ergebnis nicht mehr", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const players = squads.flatMap((s) => s.players);
    for (const p of players.slice(0, 12)) {
      await fund(p.id, 2000);
      await payEntry(p.id, t.id); // zwölf haben bezahlt
    }
    const tbBefore = await tournamentAccount();
    await expect(cancelTournament((await makeUser("fremd")).id, t.id)).rejects.toThrow(/Veranstalter/);
    await cancelTournament(o.id, t.id);
    for (const p of players.slice(0, 12)) expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await tournamentAccount()).toBe(tbBefore - 12_000);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/beendet oder abgesagt/);
    expect((await trialBalance()).balanced).toBe(true);

    // nach der Bracket-Erzeugung, vor dem ersten Ergebnis: die Spiele werden mit abgesagt
    const r2 = await runningTournament(o);
    const gameIds = (await bracketRows(r2.t.id)).filter((r) => r.matchId).map((r) => r.matchId!);
    expect(gameIds.length).toBe(2);
    await cancelTournament(o.id, r2.t.id);
    for (const id of gameIds) expect((await db.select().from(matches).where(eq(matches.id, id)))[0].status).toBe("cancelled");
    for (const p of r2.squads.flatMap((s) => s.players)) expect(await walletBalance(db, p.id)).toBe(3000);

    // nach dem ersten Ergebnis geht es nicht mehr
    const r3 = await runningTournament(o);
    const captains = new Map(r3.squads.map((s) => [s.team.id, s.captain]));
    const first = (await bracketRows(r3.t.id)).find((r) => r.matchId)!;
    await play(first, 1, 0, captains);
    await expect(cancelTournament(o.id, r3.t.id)).rejects.toThrow(/schon Ergebnisse/);
  });
});

describe("Lobby-Ansicht", () => {
  it("Spielernamen, Captain und Zahlungsstatus stehen in der Ansicht", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    await fund(squads[0].players[1].id, 2000);
    await payEntry(squads[0].players[1].id, t.id);
    const view = (await orgView(o, t.id))!;
    const team = view.teams[0];
    expect(team.players).toHaveLength(4);
    expect(team.players.filter((p) => p.paid)).toHaveLength(1);
    expect(team.players.find((p) => p.isCaptain)?.userId).toBe(squads[0].captain.id);
    expect(team.captainName).toBeTruthy();
    expect(team.ready).toBe(true);
    expect(team.dueCents).toBe(3000);
    expect(view.pricing).toMatchObject({ shareCents: 1000, players: 16 });
  });
});
