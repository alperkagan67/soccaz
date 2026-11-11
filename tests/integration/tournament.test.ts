import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matchParticipants, matches, notifications, teamMembers } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { ledgerEntries } from "@/db/schema-finance";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { abortDeadline, fixDeadline } from "@/lib/deadlines";
import { creditWallet, debitWallet, trialBalance, walletBalance } from "@/server/ledger";
import { confirmResult, decideResult, disputeResult, submitResult } from "@/server/results";
import {
  cancelTournament,
  closeTournamentsAtDeadline,
  closeWithJoinedTeams,
  createTournament,
  decideShootout,
  getTournament,
  joinAsPlayer,
  leavePlayer,
  payEntry,
  notifyRegistrationDeadlines,
  payForTeam,
  registerTeam,
  reopenRosters,
  setDrawRandom,
  setOrganizer,
  setPaidReady,
  setRosterComplete,
  withdrawTeam,
} from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

// Für den Test "ein Fehler bricht die übrigen Turniere nicht ab": Benachrichtigungen für ein bestimmtes Turnier schlagen fehl.
const forced = vi.hoisted(() => ({ failUrlSuffix: null as string | null }));
vi.mock("@/server/notifications", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/server/notifications")>();
  return {
    ...orig,
    notifyUsers: async (...args: Parameters<typeof orig.notifyUsers>) => {
      if (forced.failUrlSuffix && args[1].url?.endsWith(forced.failUrlSuffix)) throw new Error("erzwungener Fehler");
      return orig.notifyUsers(...args);
    },
  };
});

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
  for (const s of squads) await setPaidReady(s.captain.id, tid);
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

  it("M1 AC-7: Anteil = aufgerundet Gesamtpreis ÷ tatsächliche Spieler (keine Reservierung), Vorschau als Spanne", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const before = (await orgView(o, t.id))!.pricing;
    expect(before.range).toEqual({ lowest: 667, highest: 1000 }); // 160 Euro: 4 Teams mit 6 bzw. 4 Spielern
    for (const n of [4, 5, 5, 5]) await squad(t.id, n, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 843 }); // 16000 ÷ 19 = 842,1 aufgerundet
    expect((await orgView(o, t.id))!.pricing).toMatchObject({ shareCents: 843, players: 19 });
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

describe("Zahlung füreinander im eigenen Team (AC-4, AC-5)", () => {
  async function paymentPhase() {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true)); // 16 Spieler, 10 Euro
    return { o, t, squads };
  }

  it("AC-4: Spieler A zahlt für Teamkollegen B: B bezahlt, A belastet, paidBy = A", async () => {
    const { t, squads } = await paymentPhase();
    const [a, b] = [squads[0].players[1], squads[0].players[2]];
    await fund(a.id, 3000);
    await payForTeam(a.id, t.id, b.id);
    expect(await walletBalance(db, a.id)).toBe(2000);
    expect(await walletBalance(db, b.id)).toBe(0);
    const [row] = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, b.id)));
    expect(row).toMatchObject({ paidCents: 1000, paidBy: a.id });
    // ohne Ziel darf ein normaler Spieler weiterhin nicht für alle zahlen
    await expect(payForTeam(a.id, t.id)).rejects.toThrow(/Captain/);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-4: zweite (parallele) Zahlung für denselben Spieler wird abgewiesen, nur einmal gebucht", async () => {
    const { t, squads } = await paymentPhase();
    const [a, c, b] = [squads[0].players[1], squads[0].players[2], squads[0].players[3]];
    await fund(a.id, 3000);
    await fund(c.id, 3000);
    const tb0 = await tournamentAccount();
    const res = await Promise.allSettled([payForTeam(a.id, t.id, b.id), payForTeam(c.id, t.id, b.id), payEntry(b.id, t.id)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await tournamentAccount()).toBe(tb0 + 1000);
    const [row] = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, b.id)));
    expect(row.paidCents).toBe(1000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-4: ist die Buchung schon vorhanden (created = false), wird nicht still als bezahlt markiert", async () => {
    const { t, squads } = await paymentPhase();
    const [a, b] = [squads[0].players[1], squads[0].players[2]];
    const [row] = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, b.id)));
    const tr = await statusOf(t.id);
    await fund(a.id, 3000);
    // eine frühere Buchung mit demselben Schlüssel existiert, die Zeile steht aber noch auf "unbezahlt"
    await db.transaction((tx) => debitWallet(tx, a.id, { to: "tournament", amountCents: 1000, kind: "tournament_entry", tournamentId: t.id, idempotencyKey: `tournament-entry:${t.id}:${b.id}:${row.joinedAt.getTime()}:${tr.priceRound}`, reason: "vorab" }));
    await expect(payForTeam(a.id, t.id, b.id)).rejects.toThrow(/schon gebucht|bezahlt/);
    const [after] = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, b.id)));
    expect(after.paidCents).toBe(0);
  });

  it("AC-5: Zahlung für einen Spieler eines anderen Teams wird abgelehnt (auch durch einen Captain), Nicht-Kader ebenso", async () => {
    const { t, squads } = await paymentPhase();
    const [a, other] = [squads[0].players[1], squads[1].players[1]];
    await fund(a.id, 3000);
    await fund(squads[0].captain.id, 3000);
    await expect(payForTeam(a.id, t.id, other.id)).rejects.toThrow(/nicht in deinem Team/);
    await expect(payForTeam(squads[0].captain.id, t.id, other.id)).rejects.toThrow(/nicht in deinem Team/);
    const stranger = await makeUser("fremd");
    await fund(stranger.id, 3000);
    await expect(payForTeam(stranger.id, t.id, other.id)).rejects.toThrow(/Kader|Captain/);
    expect(await walletBalance(db, a.id)).toBe(3000);
    expect(await walletBalance(db, stranger.id)).toBe(3000);
    const [row] = await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, other.id)));
    expect(row.paidCents).toBe(0);
  });
});

describe("paidReady ist für Zuschauer privater Turniere verborgen", () => {
  it("Zuschauer sehen weder paidReady noch paidReadyAt, Beteiligte schon", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    for (const p of a.players) {
      await fund(p.id, 3000);
      await payEntry(p.id, t.id);
    }
    await setPaidReady(a.captain.id, t.id);
    const stranger = await makeUser("fremd");
    for (const viewer of [null, { id: stranger.id, role: "player" as const }]) {
      const v = await getTournament(t.id, viewer, "falscher-token");
      for (const team of v!.teams) {
        expect(team.paidReady).toBe(false);
        expect(JSON.stringify(team)).not.toContain("paidReadyAt");
      }
    }
    const member = await getTournament(t.id, { id: a.players[1].id, role: "player" });
    expect(member!.teams.find((x) => x.teamId === a.team.id)!.paidReady).toBe(true);
    expect(JSON.stringify(member!.teams)).not.toContain("paidReadyAt");
  });
});

const paidReadyOf = async (tid: string, teamId: string) =>
  (await db.select({ v: tournamentTeams.paidReadyAt }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tid), eq(tournamentTeams.teamId, teamId))))[0].v;

describe("Bereit nach Zahlung (paid_ready_at)", () => {
  it("AC-1: Bereit nur in Phase payment, nur der Captain, nur wenn alle Spieler des Teams bezahlt haben (auch durch andere)", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 3; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    // vor der Zahlungsphase: abgelehnt
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Zahlung/);
    squads.push(await squad(t.id, 4, true));
    expect((await statusOf(t.id)).status).toBe("payment");

    // nichts bezahlt: Fehler, Spalte bleibt leer
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/bezahlt/);
    expect(await paidReadyOf(t.id, a.team.id)).toBeNull();

    // nur Captain-Recht: normale Spieler und Fremde dürfen nicht
    await fund(a.players[1].id, 1000);
    await payEntry(a.players[1].id, t.id);
    await expect(setPaidReady(a.players[1].id, t.id)).rejects.toThrow(/Captain/);
    await expect(setPaidReady((await makeUser("fremd")).id, t.id)).rejects.toThrow(/Captain/);

    // teilweise bezahlt: weiter Fehler
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/bezahlt/);

    // der Rest wird vom Captain bezahlt (auch für andere): jetzt gelingt Bereit
    await fund(a.captain.id, 3000);
    await payForTeam(a.captain.id, t.id);
    await setPaidReady(a.captain.id, t.id);
    expect(await paidReadyOf(t.id, a.team.id)).not.toBeNull();
    // ready_at ("Kader vollzählig") bleibt unberührt
    expect((await orgView(o, t.id))!.teams.find((x) => x.teamId === a.team.id)!.ready).toBe(true);
    // Team B ist unberührt
    expect(await paidReadyOf(t.id, squads[1].team.id)).toBeNull();
    // die Bracket-Erzeugung hängt (noch) nicht an Bereit: nicht alle haben bezahlt, also kein Bracket
    expect((await statusOf(t.id)).bracketGeneratedAt).toBeNull();
  });

  it("AC-1: Zahlung durch einen Mitspieler genügt (jeder zahlt selbst)", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    for (const p of a.players) {
      await fund(p.id, 3000);
      await payEntry(p.id, t.id);
    }
    await setPaidReady(a.captain.id, t.id);
    expect(await paidReadyOf(t.id, a.team.id)).not.toBeNull();
  });

  it("AC-2: Kaderänderung setzt Bereit zurück", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const s = await squad(t.id, 4, false);
    await db.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, s.team.id)));
    const late = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: s.team.id, userId: late.id, role: "player" });
    await joinAsPlayer(late.id, t.id, s.team.id);
    expect(await paidReadyOf(t.id, s.team.id)).toBeNull();

    await db.update(tournamentTeams).set({ paidReadyAt: new Date() }).where(and(eq(tournamentTeams.tournamentId, t.id), eq(tournamentTeams.teamId, s.team.id)));
    await leavePlayer(late.id, t.id, late.id);
    expect(await paidReadyOf(t.id, s.team.id)).toBeNull();
  });

  it("AC-2: Kader wieder öffnen (mit Erstattung) setzt Bereit aller Teams zurück", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    for (const p of a.players) {
      await fund(p.id, 3000);
      await payEntry(p.id, t.id);
    }
    await setPaidReady(a.captain.id, t.id);
    expect(await paidReadyOf(t.id, a.team.id)).not.toBeNull();
    await reopenRosters(o.id, t.id);
    for (const s of squads) expect(await paidReadyOf(t.id, s.team.id)).toBeNull();
    // nach dem Wiederöffnen ist Bereit nicht mehr möglich
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Zahlung/);
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
    for (const s of squads.slice(0, 3)) await setPaidReady(s.captain.id, t.id);
    expect(await bracketRows(t.id)).toHaveLength(0);
    let view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect((await statusOf(t.id)).status).toBe("payment");

    // die letzten beiden zahlen gleichzeitig: genau ein Bracket
    for (const p of players.slice(14)) await fund(p.id, 2000);
    await Promise.allSettled(players.slice(14).map((p) => payEntry(p.id, t.id)));
    expect(await bracketRows(t.id)).toHaveLength(0); // voll bezahlt, aber das letzte Team hat noch nicht "Bereit" gedrückt
    await setPaidReady(squads[3].captain.id, t.id);
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
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 0 });
    expect(await bracketRows(t.id)).toHaveLength(0);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    expect(await statusOf(t.id)).toMatchObject({ status: "running", finalShareCents: 0 });
    expect(await bracketRows(t.id)).toHaveLength(3);
  });

  it("AC-3: Bracket erst, wenn alle Teams Bereit gedrückt haben; parallele Aufrufe ergeben genau ein Bracket; vorher auch serverseitig nichts", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    for (const s of squads) for (const p of s.players) { await fund(p.id, 2000); await payEntry(p.id, t.id); }
    expect(await bracketRows(t.id)).toHaveLength(0); // alles bezahlt, aber niemand ist bereit
    for (const s of squads.slice(0, 2)) await setPaidReady(s.captain.id, t.id);
    expect(await bracketRows(t.id)).toHaveLength(0);
    let view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect((await statusOf(t.id)).status).toBe("payment");
    // die letzten zwei gleichzeitig: genau ein Bracket
    await Promise.allSettled(squads.slice(2).map((s) => setPaidReady(s.captain.id, t.id)));
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect((await statusOf(t.id)).status).toBe("running");
    view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(true);
    await setPaidReady(squads[0].captain.id, t.id).catch(() => {}); // wiederholter Aufruf ändert nichts
    expect(await bracketRows(t.id)).toHaveLength(3);
  });

  it("AC-9: Auslosung zufällig mit injizierter Zufallsquelle, nicht die Anmeldereihenfolge, jedes Team genau einmal, genau ein Bracket", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const [A, B, C, D] = squads.map((s) => s.team.id);
    setDrawRandom(() => 0); // Fisher-Yates mit r = 0: [A,B,C,D] wird zu [B,C,D,A]
    try {
      await payAll(t.id, squads);
    } finally {
      setDrawRandom(null);
    }
    const rows = (await bracketRows(t.id)).filter((r) => r.stage === "ko:4").sort((x, y) => x.slot - y.slot);
    expect(rows.map((r) => [r.teamA, r.teamB])).toEqual([[B, A], [C, D]]); // Anmeldereihenfolge hätte A-D und B-C ergeben
    expect(new Set(rows.flatMap((r) => [r.teamA, r.teamB])).size).toBe(4);
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect((await statusOf(t.id)).bracketGeneratedAt).not.toBeNull();
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

  it("AC-11: Anmeldeschluss mit 3, 4 und 5 von 8 Teams: Weitermachen nur ab 4, Absage immer, nur der Veranstalter", async () => {
    const o = await organizer();
    const expire = (id: string) => db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, id));
    for (const n of [3, 4, 5]) {
      const t = await newTournament(o, { maxTeams: 8 });
      const squads: Squad[] = [];
      for (let i = 0; i < n; i++) squads.push(await squad(t.id, 4, true));
      await expire(t.id);
      const stranger = await makeUser("fremd");
      await expect(closeWithJoinedTeams(stranger.id, t.id)).rejects.toThrow(/Veranstalter/);
      await expect(closeWithJoinedTeams(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
      await expect(cancelTournament(stranger.id, t.id)).rejects.toThrow(/Veranstalter/);
      await expect(cancelTournament(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
      if (n < 4) {
        await expect(closeWithJoinedTeams(o.id, t.id)).rejects.toThrow(/weniger als 4/);
        expect((await statusOf(t.id)).status).toBe("registration");
        await cancelTournament(o.id, t.id);
        expect((await statusOf(t.id)).status).toBe("cancelled");
      } else {
        await closeWithJoinedTeams(o.id, t.id);
        expect(await statusOf(t.id)).toMatchObject({ status: "payment", maxTeams: n });
        // Bedingung "alle angemeldeten Teams bereit und bezahlt" gilt weiter: ohne Zahlung kein Bracket
        expect(await bracketRows(t.id)).toHaveLength(0);
        await payAll(t.id, squads);
        expect((await bracketRows(t.id)).length).toBe(n - 1); // mit Freilosen bei 5 Teams
      }
    }
    // Absage mit Vollerstattung an den Zahler nach Anmeldeschluss
    const t = await newTournament(o, { maxTeams: 8 });
    const sq: Squad[] = [];
    for (let i = 0; i < 4; i++) sq.push(await squad(t.id, 4, true));
    await expire(t.id);
    await closeWithJoinedTeams(o.id, t.id);
    await fund(sq[0].captain.id, 5000);
    await payForTeam(sq[0].captain.id, t.id);
    expect(await walletBalance(db, sq[0].captain.id)).toBe(5000 - 4 * 1000);
    await cancelTournament(o.id, t.id);
    expect(await walletBalance(db, sq[0].captain.id)).toBe(5000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-11: der Veranstalter bekommt am Anmeldeschluss genau eine Benachrichtigung, auch bei doppeltem Job-Lauf", async () => {
    const o = await organizer();
    const countFor = async (tid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.url, `/turniere/${tid}`), eq(notifications.title, "Anmeldeschluss erreicht")))).length;
    const open = await newTournament(o, { maxTeams: 8 }); // Frist nicht erreicht
    const t = await newTournament(o, { maxTeams: 8 });
    const full = await newTournament(o, { maxTeams: 4 });
    for (let i = 0; i < 4; i++) await squad(full.id, 4, true);
    for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    for (const id of [t.id, full.id]) await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, id));
    await Promise.all([notifyRegistrationDeadlines(), notifyRegistrationDeadlines()]);
    await notifyRegistrationDeadlines();
    expect(await countFor(t.id)).toBe(1);
    expect(await countFor(open.id)).toBe(0); // Frist nicht erreicht
    expect(await countFor(full.id)).toBe(0); // volles Turnier: unverändert, keine Meldung
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

describe("Erstattung geht an den Zahler, Austritt und Abmeldung ab der Zahlungsphase nicht mehr", () => {
  it("AC-6: Hat A für B bezahlt, geht die Erstattung (Kader öffnen / Absage) an A; genau einmal; auch wenn A nicht mehr im Kader steht", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    const [mate, b] = [a.players[1], a.players[2]];
    await fund(a.captain.id, 3000);
    await fund(mate.id, 3000);
    await payForTeam(a.captain.id, t.id, b.id); // Captain zahlt für B: 10 Euro
    expect(await walletBalance(db, a.captain.id)).toBe(2000);
    await reopenRosters(o.id, t.id);
    expect(await walletBalance(db, a.captain.id)).toBe(3000); // zurück an A
    expect(await walletBalance(db, b.id)).toBe(0); // nicht an B
    await expect(reopenRosters(o.id, t.id)).rejects.toThrow(/Zahlung läuft/); // kein zweites Mal
    expect(await walletBalance(db, a.captain.id)).toBe(3000);

    // Mitspieler zahlt für B, steht danach nicht mehr im Kader (Zeile weg): die Absage erstattet trotzdem an ihn
    for (const sq of squads) await setRosterComplete(sq.captain.id, t.id, true);
    await payForTeam(mate.id, t.id, b.id);
    expect(await walletBalance(db, mate.id)).toBe(2000);
    await db.delete(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, mate.id)));
    await cancelTournament(o.id, t.id);
    expect(await walletBalance(db, mate.id)).toBe(3000);
    expect(await walletBalance(db, b.id)).toBe(0);
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/schon beendet oder abgesagt/);
    expect(await walletBalance(db, mate.id)).toBe(3000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-8: Ab der Zahlungsphase lehnt der Server Austritt und Abmeldung ab; Kader öffnen nur der Veranstalter, mit voller Erstattung", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const a = squads[0];
    const pl = a.players[1];
    await fund(pl.id, 3000);
    await payEntry(pl.id, t.id);
    expect((await statusOf(t.id)).status).toBe("payment");

    await expect(leavePlayer(pl.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // Spieler selbst
    await expect(leavePlayer(a.captain.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // Captain
    await expect(leavePlayer(o.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // sogar der Veranstalter: Weg ist reopenRosters
    await expect(withdrawTeam(a.captain.id, t.id, a.team.id)).rejects.toThrow(/Abmeldung/);
    await expect(withdrawTeam(o.id, t.id, a.team.id)).rejects.toThrow(/Abmeldung/);
    await expect(reopenRosters(a.captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await expect(reopenRosters(pl.id, t.id)).rejects.toThrow(/Veranstalter/);
    // nichts hat sich geändert
    expect(await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id))).toHaveLength(16);
    expect(await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))).toHaveLength(4);
    expect(await walletBalance(db, pl.id)).toBe(2000);

    await reopenRosters(o.id, t.id);
    expect(await walletBalance(db, pl.id)).toBe(3000); // voll erstattet
    expect((await trialBalance()).balanced).toBe(true);
    // zurück in der Anmeldephase gehen Austritt und Abmeldung wieder
    await leavePlayer(pl.id, t.id, pl.id);
    await withdrawTeam(squads[1].captain.id, t.id, squads[1].team.id);
  });
});

describe("AC-10: Der Veranstalter trägt Ergebnisse ein und entscheidet Streit", () => {
  const openSemi = async (tid: string) => {
    const m = (await bracketRows(tid)).find((r) => r.stage === "ko:4" && r.matchId)!;
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
    return m;
  };

  it("Veranstalter (weder Team-Admin noch Plattform-Admin) trägt direkt ein, Sieger rückt auf; Fremde und andere Veranstalter werden abgewiesen", async () => {
    const o = await organizer();
    const { t, squads } = await runningTournament(o);
    const m = await openSemi(t.id);
    const stranger = await makeUser("fremd");
    const otherOrg = await organizer(); // Veranstalter, aber eines anderen Turniers
    await expect(submitResult(stranger.id, m.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
    await expect(submitResult(otherOrg.id, m.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
    await expect(decideResult(stranger.id, m.matchId!, 2, 1, "ich bestimme")).rejects.toThrow(/entscheiden/);
    await expect(decideResult(otherOrg.id, m.matchId!, 2, 1, "ich bestimme")).rejects.toThrow(/entscheiden/);
    expect((await bracketRows(t.id)).find((r) => r.id === m.id)!.scoreA).toBeNull();

    await submitResult(o.id, m.matchId!, 2, 1);
    const after = (await bracketRows(t.id)).find((r) => r.id === m.id)!;
    expect(after).toMatchObject({ scoreA: 2, scoreB: 1 });
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).toBe("played");
    const final = (await bracketRows(t.id)).find((r) => r.stage === "ko:2")!;
    expect([final.teamA, final.teamB]).toContain(m.teamA); // Sieger steht im Finale
    expect(squads.length).toBe(4);
  });

  it("Streit: Veranstalter entscheidet, Fremde nicht; Plattform-Admin bleibt Fallback", async () => {
    const o = await organizer();
    const { t, squads } = await runningTournament(o);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const m = await openSemi(t.id);
    await submitResult(captains.get(m.teamA!)!.id, m.matchId!, 3, 0);
    await disputeResult(captains.get(m.teamB!)!.id, m.matchId!, "stimmt nicht");
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).toBe("disputed");
    const stranger = await makeUser("fremd");
    await expect(decideResult(stranger.id, m.matchId!, 0, 3, "ich entscheide")).rejects.toThrow(/entscheiden/);
    await decideResult(o.id, m.matchId!, 1, 2, "Schiedsrichterbericht");
    expect((await bracketRows(t.id)).find((r) => r.id === m.id)).toMatchObject({ scoreA: 1, scoreB: 2 });
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).toBe("played");

    // Plattform-Admin bleibt Fallback
    const m2 = (await bracketRows(t.id)).find((r) => r.stage === "ko:4" && r.matchId && r.scoreA === null)!;
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m2.matchId!));
    const admin = await makeUser("padmin", "admin");
    await decideResult(admin.id, m2.matchId!, 2, 2, "Admin");
    expect((await bracketRows(t.id)).find((r) => r.id === m2.id)).toMatchObject({ scoreA: 2, scoreB: 2 });
  });

  it("Randfall: Ist der Veranstalter zugleich Team-Admin eines beteiligten Teams, gilt er in diesem Spiel nur als dieses Team (Gegenpartei bestätigt, kein Selbst-Bestätigen, keine Selbst-Entscheidung)", async () => {
    const o = await organizer();
    const { t, squads } = await runningTournament(o);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const m = await openSemi(t.id);
    await db.insert(teamMembers).values({ teamId: m.teamA!, userId: o.id, role: "admin" });
    await submitResult(o.id, m.matchId!, 5, 0); // nur als Meldung seines Teams
    let row = (await bracketRows(t.id)).find((r) => r.id === m.id)!;
    expect(row.scoreA).toBeNull(); // noch nicht endgültig
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).not.toBe("played");
    await expect(confirmResult(o.id, m.matchId!)).rejects.toThrow(/andere Team/); // bestätigt nicht sein eigenes Ergebnis
    await expect(decideResult(o.id, m.matchId!, 5, 0, "in eigener Sache")).rejects.toThrow(/entscheiden/);
    await confirmResult(captains.get(m.teamB!)!.id, m.matchId!); // die Gegenpartei bestätigt
    row = (await bracketRows(t.id)).find((r) => r.id === m.id)!;
    expect(row).toMatchObject({ scoreA: 5, scoreB: 0 });
  });

  it("Regression: Veranstalterrecht gilt nur für Turnierspiele; Plattform-Admin-Pflicht bei anderen Spielen bleibt", async () => {
    const o = await organizer();
    const [other] = await db.select({ id: matches.id }).from(matches).limit(1);
    if (other) await expect(decideResult(o.id, other.id, 1, 0, "grundlos")).rejects.toThrow();
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

describe("Veranstalter in eigener Sache (T43 AC-1)", () => {
  const openSemis = async (tid: string) => {
    const rows = (await bracketRows(tid)).filter((r) => r.stage === "ko:4" && r.matchId).sort((a, b) => a.slot - b.slot);
    for (const m of rows) await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
    return rows;
  };
  const scoreOf = async (id: string) => (await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id)))[0].scoreA;

  for (const via of ["Teammitglied", "Turnier-Kader"] as const) {
    it(`Veranstalter nur als ${via} (ohne Admin-Rolle) eines beteiligten Teams: kein endgültiges Ergebnis, keine Entscheidung; anderes Spiel bleibt erlaubt`, async () => {
      const o = await organizer();
      const { t } = await runningTournament(o);
      const [mine, other] = await openSemis(t.id);
      if (via === "Teammitglied") await db.insert(teamMembers).values({ teamId: mine.teamA!, userId: o.id, role: "player" });
      else await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: mine.teamA!, userId: o.id });

      await expect(submitResult(o.id, mine.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
      await expect(decideResult(o.id, mine.matchId!, 2, 1, "in eigener Sache")).rejects.toThrow(/entscheiden/);
      expect(await scoreOf(mine.id)).toBeNull();
      expect((await db.select().from(matches).where(eq(matches.id, mine.matchId!)))[0].status).not.toBe("played");

      // Spiel ohne Beteiligung seines Teams: weiter erlaubt (AC-10 aus Vertrag 005)
      await submitResult(o.id, other.matchId!, 2, 1);
      expect(await scoreOf(other.id)).toBe(2);
      // Plattform-Admin entscheidet weiterhin
      const admin = await makeUser("padmin", "admin");
      await decideResult(admin.id, mine.matchId!, 1, 0, "Admin");
      expect(await scoreOf(mine.id)).toBe(1);
    });
  }
});

describe("Anmeldeschluss-Job: ein Fehler bricht die übrigen Turniere nicht ab (T43 AC-2)", () => {
  it("Turnier 1 schlägt fehl, Turnier 2 bekommt genau eine Meldung; Turnier 1 beim nächsten Lauf", async () => {
    const o = await organizer();
    const countFor = async (tid: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, o.id), eq(notifications.url, `/turniere/${tid}`), eq(notifications.title, "Anmeldeschluss erreicht")))).length;
    const t1 = await newTournament(o, { maxTeams: 8 });
    const t2 = await newTournament(o, { maxTeams: 8 });
    for (const t of [t1, t2]) for (let i = 0; i < 4; i++) await squad(t.id, 4, true);
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 2 * 3_600_000) }).where(eq(tournaments.id, t1.id)); // zuerst dran
    await db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 3_600_000) }).where(eq(tournaments.id, t2.id));

    forced.failUrlSuffix = t1.id;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(notifyRegistrationDeadlines()).resolves.toBeGreaterThanOrEqual(1); // wirft nicht
      await notifyRegistrationDeadlines();
      expect(await countFor(t1.id)).toBe(0);
      expect(await countFor(t2.id)).toBe(1);
      const logged = JSON.stringify(err.mock.calls);
      expect(logged).toContain(t1.id); // Fehler wurde mit Turnier-ID geloggt
      expect(logged).not.toContain(o.id);
    } finally {
      forced.failUrlSuffix = null;
      err.mockRestore();
    }
    await notifyRegistrationDeadlines();
    expect(await countFor(t1.id)).toBe(1);
    expect(await countFor(t2.id)).toBe(1);
  });
});

describe("Fristen (Vertrag 008 v4, M3b): 48-h-Frist, Sofortbuchung, 1-h-Abbruch", () => {
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
  const refundsOf = (tid: string) => db.select().from(ledgerEntries).where(and(eq(ledgerEntries.tournamentId, tid), eq(ledgerEntries.kind, "tournament_refund")));
  /** Was dieses Turnier im Turnierkonto hält (Eintritte minus Erstattungen). */
  const heldFor = async (tid: string) => (await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, tid))).reduce((a, e) => a + (e.creditAccount === "tournament" ? e.amountCents : 0) - (e.debitAccount === "tournament" ? e.amountCents : 0), 0);
  const cancelAudits = async (tid: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entity, "tournament"), eq(auditLog.entityId, tid), eq(auditLog.action, "tournament.cancel")))).length;
  /** Kurzer Vorlauf: Start in `startH` Stunden, Anmeldeschluss davor. */
  const shortTournament = (o: { id: string }, startH = 20) => newTournament(o, { startsAt: hours(startH), registrationDeadline: hours(startH / 2) });
  /** Vier Teams mit je vier Spielern, alle vollzählig (Preis fix); `pay` Spieler zahlen (alle mit Guthaben), `ready` Captains drücken Bereit. */
  async function pricedTournament(t: { id: string }, pay: number) {
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 4, true));
    const players = squads.flatMap((x) => x.players);
    for (const p of players) await fund(p.id, 3000);
    for (const p of players.slice(0, pay)) await payEntry(p.id, t.id);
    return { squads, players };
  }

  it("AC-12: mit mindestens 48 Stunden Vorlauf muss der Anmeldeschluss mindestens 48 Stunden vor dem Start liegen, sonst Fehler und nichts gespeichert; darunter gilt nur 'vor dem Start'", async () => {
    const o = await organizer();
    const start = days(5);
    const before = (await db.select().from(tournaments).where(eq(tournaments.organizerId, o.id))).length;
    await expect(createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 47 * 3_600_000) })).rejects.toThrow(/48 Stunden/);
    await expect(createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000 + 1) })).rejects.toThrow(/48 Stunden/); // eine Millisekunde zu spät
    expect((await db.select().from(tournaments).where(eq(tournaments.organizerId, o.id))).length).toBe(before); // nichts gespeichert
    await createTournament(o.id, { ...base, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000) }); // genau 48 Stunden geht
    const shortStart = hours(30); // weniger als 48 Stunden Vorlauf: nur vor dem Start
    await createTournament(o.id, { ...base, startsAt: shortStart, registrationDeadline: hours(29) });
  });

  it("AC-11: zur 48-h-Frist fällt ein Turnier aus, wenn nicht alle Teams vollzählig, bezahlt und bereit sind: alle erstattet, genau einmal (auch parallel), nicht vorher", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    const { players } = await pricedTournament(t, 13); // 13 von 16 haben bezahlt
    const start = (await statusOf(t.id)).startsAt!;
    await closeTournamentsAtDeadline(new Date(fixDeadline(start).getTime() - 1));
    expect((await statusOf(t.id)).status).toBe("payment"); // vor der Frist offen
    const at = fixDeadline(start);
    const runs = await Promise.all([closeTournamentsAtDeadline(at), closeTournamentsAtDeadline(at), closeTournamentsAtDeadline(at)]);
    expect(runs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    for (const pl of players) expect(await walletBalance(db, pl.id)).toBe(3000);
    expect(await refundsOf(t.id)).toHaveLength(13);
    expect(await cancelAudits(t.id)).toBe(1); // genau eine Absage
    expect(await heldFor(t.id)).toBe(0); // nichts bleibt im Turnierkonto
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-11: ein Turnier, das zur Frist noch in der Anmeldung steht (Teams nicht vollzählig), fällt aus; ein Turnier mit Bracket (gebucht) nie", async () => {
    const o = await organizer();
    const open = await newTournament(o);
    await squad(open.id, 4, true);
    await squad(open.id, 3, false);
    const { t: booked } = await runningTournament(o);
    await closeTournamentsAtDeadline(new Date(fixDeadline((await statusOf(open.id)).startsAt!).getTime() + 1000));
    expect((await statusOf(open.id)).status).toBe("cancelled");
    expect((await statusOf(booked.id)).status).toBe("running");
    expect(await refundsOf(booked.id)).toHaveLength(0);
  });

  it("Altturnier (Anmeldeschluss später als 48 Stunden vor dem Start, vor der Umstellung angelegt) bleibt bei den alten Regeln: der Job sagt es nicht ab", async () => {
    const o = await organizer();
    const t = await newTournament(o);
    await db.update(tournaments).set({ registrationDeadline: new Date(t.startsAt!.getTime() - 24 * 3_600_000) }).where(eq(tournaments.id, t.id));
    await closeTournamentsAtDeadline(new Date(fixDeadline(t.startsAt!).getTime() + 3_600_000));
    expect((await statusOf(t.id)).status).toBe("registration");
  });

  it("Karenz: Steht der Preis erst kurz vor der Frist fest, gilt die Frist frühestens 12 Stunden danach", async () => {
    const o = await organizer();
    const start = hours(49); // 49 Stunden Vorlauf, Anmeldeschluss 48 Stunden vor dem Start
    const t = await createTournament(o.id, { ...base, startsAt: start, registrationDeadline: hours(1) });
    await pricedTournament(t, 5); // Preis steht jetzt fest (Audit tournament.price)
    await closeTournamentsAtDeadline(new Date(fixDeadline(start).getTime() + 3_600_000)); // die 48-h-Frist ist schon eine Stunde her, die Karenz läuft noch
    expect((await statusOf(t.id)).status).toBe("payment");
    await closeTournamentsAtDeadline(new Date(Date.now() + 12 * 3_600_000 + 5000));
    expect((await statusOf(t.id)).status).toBe("cancelled");
  });

  it("AC-14: Turnier mit weniger als 48 Stunden Vorlauf: sobald alle Teams voll bezahlt und bereit sind, wird sofort gebucht (Bracket), danach sagt auch der 1-h-Job nicht mehr ab", async () => {
    const o = await organizer();
    const t = await shortTournament(o);
    const { squads, players } = await pricedTournament(t, 16);
    expect((await statusOf(t.id)).status).toBe("payment");
    for (const x of squads.slice(0, 3)) await setPaidReady(x.captain.id, t.id);
    expect((await statusOf(t.id)).bracketGeneratedAt).toBeNull(); // ein Captain fehlt noch: nicht gebucht
    await setPaidReady(squads[3].captain.id, t.id);
    const done = await statusOf(t.id);
    expect(done.status).toBe("running");
    expect(done.bracketGeneratedAt).not.toBeNull();
    await closeTournamentsAtDeadline(new Date(abortDeadline(done.startsAt!).getTime() + 60_000));
    expect((await statusOf(t.id)).status).toBe("running");
    expect(await refundsOf(t.id)).toHaveLength(0);
    expect(players).toHaveLength(16);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-14: kein Austritt mit Erstattung nach der Zahlung (Kader gesperrt), die Erstattung gibt es nur über Absage oder wiedergeöffnete Kader durch den Veranstalter", async () => {
    const o = await organizer();
    const t = await shortTournament(o);
    const { squads, players } = await pricedTournament(t, 16);
    await expect(leavePlayer(squads[0].captain.id, t.id, players[1].id)).rejects.toThrow(/keine Änderung/);
    expect(await walletBalance(db, players[1].id)).toBe(3000 - (await statusOf(t.id)).finalShareCents!);
  });

  it("AC-16: 1 Stunde vor dem Start fällt ein Turnier mit kurzem Vorlauf aus, wenn nicht alles bezahlt und bereit ist: alle erstattet, genau einmal, Hauptbuch ausgeglichen; eine Millisekunde früher nicht", async () => {
    const o = await organizer();
    const t = await shortTournament(o, 20);
    const { players } = await pricedTournament(t, 12);
    const abort = abortDeadline((await statusOf(t.id)).startsAt!);
    await closeTournamentsAtDeadline(new Date(abort.getTime() - 1));
    expect((await statusOf(t.id)).status).toBe("payment");
    const runs = await Promise.all([closeTournamentsAtDeadline(abort), closeTournamentsAtDeadline(abort)]);
    expect(runs.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    for (const pl of players) expect(await walletBalance(db, pl.id)).toBe(3000);
    expect(await refundsOf(t.id)).toHaveLength(12);
    expect(await cancelAudits(t.id)).toBe(1);
    expect(await heldFor(t.id)).toBe(0);
    expect((await trialBalance()).balanced).toBe(true);
  });
});
