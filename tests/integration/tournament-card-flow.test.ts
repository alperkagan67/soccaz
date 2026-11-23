import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges, paymentProfiles, teamMembers } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournamentMatches, tournaments } from "@/db/schema-league";
import { trialBalance, walletBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { confirmResult, submitResult } from "@/server/results";
import { setSetting } from "@/server/settings";
import { createTournament, decideShootout, getTournament, joinAsPlayer, registerTeam, setOrganizer, setPaidReady, setRosterComplete } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// 012 M6b b2-i Teil 2, Paket 1: Karten-Gegenstücke zu den Guthaben-Tests von tournament.test.ts (Bracket, Ergebnisse, Ansicht). Der Altpfad (payEntry, Auszahlung) wird in b2-ii gelöscht;
// hier steht, was bleibt: das Bracket entsteht genau einmal NACH der Abbuchung aller Spieler und dem Bereit aller Teams, die Ergebnisse führen weiter, der Veranstalter bekommt KEIN Preisgeld
// (F4), die Provision kommt aus dem eingefrorenen Satz. Die Abbuchung läuft deterministisch über runTournamentCharges (ohne Fälligkeitsprüfung) mit dem FakeProvider.
let provider: FakeProvider;
let hall = "";
beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "card_payments_enabled", true);
  const [v] = await db.insert(venues).values({ name: `TKF Halle ${Date.now()}`, city: "Essen", isPartner: true, active: true, commissionPercent: "10" }).returning();
  hall = v.id;
});
beforeEach(() => {
  provider = new FakeProvider();
  setPaymentProviderForTests(provider);
});
afterEach(() => setPaymentProviderForTests(null));
afterAll(async () => {
  await setSetting(null, "payments_enabled", false);
  await setSetting(null, "card_payments_enabled", false);
  await cleanup();
});

const T0 = Date.now();
const base = { name: "Karten-Bracket-Cup", city: "Essen", startsAt: new Date(T0 + 5 * 86_400_000), registrationDeadline: new Date(T0 + 3 * 86_400_000), maxTeams: 4, durationMin: 120, hourlyCents: 8000 };
let seq = 0;

async function organizer() {
  const o = await makeUser("org");
  const admin = await makeUser("tadmin", "admin");
  await setOrganizer(admin.id, o.id, true);
  return o;
}
type Squad = Awaited<ReturnType<typeof squad>>;
async function squad(tid: string, size = 4, complete = true) {
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
/** Zahlungsprofil mit Zahlungsmethode = "Karte hinterlegt". */
const giveCards = (users: { id: string }[]) =>
  db.insert(paymentProfiles).values(users.map((u) => ({ userId: u.id, stripeCustomerId: `cus_tkf_${u.id}_${++seq}`, paymentMethodId: `pm_tkf_${u.id}` }))).onConflictDoNothing();

/** Turnier im Kartenmodell: Partnerhalle gewählt, 4 Teams vollzählig (Preis fest, Zugangs-Snapshot eingefroren), Status payment, noch keine Karten. */
async function cardTournament(o: { id: string }, size = 4) {
  const t = await createTournament(o.id, { ...base, venueId: hall });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, size));
  expect((await statusOf(t.id)).status).toBe("payment");
  return { t, squads, players: squads.flatMap((s) => s.players) };
}
/** Karten für alle, alle Captains bereit, abgebucht: das Bracket steht. */
async function runningCardTournament(o: { id: string }, size = 4) {
  const r = await cardTournament(o, size);
  await giveCards(r.players);
  for (const s of r.squads) await setPaidReady(s.captain.id, r.t.id);
  await charge(r.t.id);
  return r;
}
const charge = (tid: string) => runTournamentCharges(tid, new Date());
const statusOf = async (tid: string) => (await db.select().from(tournaments).where(eq(tournaments.id, tid)))[0];
const orgView = (o: { id: string }, tid: string) => getTournament(tid, { id: o.id, role: "player" });
const bracketRows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid));
const chargesOf = (tid: string) => db.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tid));
const commissionOf = async (tid: string) => (await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, tid))).filter((e) => e.kind === "commission");

async function play(m: { id: string; matchId: string | null; teamA: string | null; teamB: string | null }, a: number, b: number, captains: Map<string, { id: string }>) {
  await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
  await submitResult(captains.get(m.teamA!)!.id, m.matchId!, a, b);
  await confirmResult(captains.get(m.teamB!)!.id, m.matchId!);
}

describe("Turnier im Kartenmodell: Bracket erst nach Karten, Bereit und Abbuchung", () => {
  it("Gegenstück zu 'vor der letzten Zahlung kein Bracket': ohne vollständige Karten kein Bereit, nichts abgebucht, nach der Abbuchung genau EIN Bracket (auch bei parallelen Läufen) mit echten Spielen", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    expect(players).toHaveLength(16);
    expect((await orgView(o, t.id))!.bracketVisible).toBe(false);

    // Karten für alle bis auf die letzten zwei: drei Teams sind bereit, das vierte kann nicht bereit sein
    await giveCards(players.slice(0, 14));
    for (const s of squads.slice(0, 3)) await setPaidReady(s.captain.id, t.id);
    await expect(setPaidReady(squads[3].captain.id, t.id)).rejects.toThrow(/Karte/);
    expect(await bracketRows(t.id)).toHaveLength(0);
    expect(await chargesOf(t.id)).toHaveLength(0);
    expect((await charge(t.id)).reason).toBe("not_ready"); // nicht abbuchbar, solange ein Team nicht bereit ist
    let view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect((await statusOf(t.id)).status).toBe("payment");

    // die letzten zwei haben Karten, das vierte Team ist bereit: erst die Abbuchung erzeugt das Bracket (zwei Läufe gleichzeitig: genau ein Bracket)
    await giveCards(players.slice(14));
    await setPaidReady(squads[3].captain.id, t.id);
    expect(await bracketRows(t.id)).toHaveLength(0); // bereit, aber noch nicht abgebucht
    await Promise.all([charge(t.id), charge(t.id)]);
    const charges = await chargesOf(t.id);
    expect(charges).toHaveLength(16);
    expect(charges.every((c) => c.status === "succeeded")).toBe(true);
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(3); // 2 Halbfinals und das Finale
    view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(true);
    expect(view.tournament.status).toBe("running");
    expect(view.stages.map((s) => s.stage)).toEqual(["ko:4", "ko:2"]);
    for (const s of rows.filter((r) => r.stage === "ko:4")) {
      const [g] = await db.select().from(matches).where(eq(matches.id, s.matchId!));
      expect(g).toMatchObject({ kind: "tournament", visibility: "private", status: "confirmed", homeTeamId: s.teamA, awayTeamId: s.teamB });
      expect(await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, g.id))).toHaveLength(8);
    }
    expect(rows.find((r) => r.stage === "ko:2")!.matchId).toBeNull(); // das Finale entsteht erst, wenn beide feststehen
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu 'AC-3: Bracket erst, wenn alle Teams Bereit gedrückt haben': alle Karten, aber niemand bereit: nichts; parallele Bereit und Läufe ergeben genau ein Bracket; Wiederholung ändert nichts", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    await giveCards(players);
    expect((await charge(t.id)).reason).toBe("not_ready"); // Karten da, aber niemand ist bereit
    expect(await bracketRows(t.id)).toHaveLength(0);
    for (const s of squads.slice(0, 2)) await setPaidReady(s.captain.id, t.id);
    expect((await charge(t.id)).reason).toBe("not_ready");
    expect(await bracketRows(t.id)).toHaveLength(0);
    let view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(false);
    expect(view.stages).toEqual([]);
    expect((await statusOf(t.id)).status).toBe("payment");
    // die letzten zwei gleichzeitig bereit, dann zwei Läufe gleichzeitig: genau ein Bracket
    await Promise.all(squads.slice(2).map((s) => setPaidReady(s.captain.id, t.id)));
    await Promise.all([charge(t.id), charge(t.id)]);
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect((await statusOf(t.id)).status).toBe("running");
    view = (await orgView(o, t.id))!;
    expect(view.bracketVisible).toBe(true);
    await setPaidReady(squads[0].captain.id, t.id).catch(() => {}); // wiederholter Aufruf ändert nichts
    await charge(t.id);
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect(await chargesOf(t.id)).toHaveLength(16); // nichts doppelt abgebucht
  });

  it("Gegenstück zu 'Spielernamen, Captain und Zahlungsstatus stehen in der Ansicht': Kader, Captain, Karten-Ampel statt Zahlungsstatus, nichts offen zu zahlen", async () => {
    const o = await organizer();
    const { t, squads } = await cardTournament(o);
    await giveCards([squads[0].players[1]]);
    const captainView = (await getTournament(t.id, { id: squads[0].captain.id, role: "player" }))!;
    const team = captainView.teams.find((x) => x.teamId === squads[0].team.id)!;
    expect(team.players).toHaveLength(4);
    expect(team.players.filter((p) => p.paid)).toHaveLength(1); // im Kartenmodell: Karte hinterlegt
    expect(team.players.find((p) => p.isCaptain)?.userId).toBe(squads[0].captain.id);
    expect(team.captainName).toBeTruthy();
    expect(team.ready).toBe(true);
    expect(team.dueCents).toBe(0); // es gibt nichts zu bezahlen, abgebucht wird zur Frist
    expect(team.cardMissing).toBe(3);
    expect(captainView.pricing).toMatchObject({ shareCents: 1000, players: 16 });
    const organizerView = (await orgView(o, t.id))!;
    expect(organizerView.teams.every((x) => x.cardsComplete === false)).toBe(true); // der Veranstalter sieht je Team nur "komplett oder nicht"
  });
});

describe("Turnier im Kartenmodell: Ergebnisse, kein Preisgeld, Provision aus dem Satz", () => {
  it("Gegenstück zu 'Halbfinals, Siebenmeterschießen, Finale, Sieger, Auszahlung': die Ergebnisse führen weiter, der Veranstalter bekommt KEIN Preisgeld (F4), die Provision kommt aus dem eingefrorenen Satz, Buchhaltung ausgeglichen, kein Elo", async () => {
    const o = await organizer();
    const orgBefore = await walletBalance(db, o.id);
    const { t, squads } = await runningCardTournament(o); // 16 Spieler x 10 Euro = 160 Euro
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
    expect(done.settledAt).not.toBeNull(); // gebucht wurde mit der Abbuchung, nicht erst am Ende

    // 16 Spieler x 10 Euro = 160 Euro von den Karten; Provision 10 % aus dem eingefrorenen Satz; der Veranstalter bekommt nichts ausgezahlt
    expect((await chargesOf(t.id)).reduce((sum, c) => sum + c.amountCents, 0)).toBe(16_000);
    expect((await commissionOf(t.id)).map((e) => e.amountCents)).toEqual([1600]);
    expect(await walletBalance(db, o.id)).toBe(orgBefore);
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, t.id))).some((e) => e.kind === "tournament_payout")).toBe(false);
    expect((await trialBalance()).balanced).toBe(true);
    for (const s of squads) expect(await db.select().from(teamStats).where(eq(teamStats.teamId, s.team.id))).toHaveLength(0);
  });

  it("Gegenstück zu 'Auszahlung bei ungleich großen Kadern': Hallenkosten durch alle Spieler, nie unterdeckt, kein Preisgeld", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const squads: Squad[] = [];
    for (let i = 0; i < 4; i++) squads.push(await squad(t.id, 5)); // 20 Spieler, 8 Euro
    expect((await statusOf(t.id)).finalShareCents).toBe(800);
    await giveCards(squads.flatMap((s) => s.players));
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    await charge(t.id);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const orgBefore = await walletBalance(db, o.id);
    for (let i = 0; i < 3; i++) {
      const next = (await bracketRows(t.id)).find((r) => r.matchId && r.scoreA === null);
      if (!next) break;
      await play(next, 1, 0, captains);
    }
    expect((await statusOf(t.id)).status).toBe("finished");
    expect((await chargesOf(t.id)).reduce((sum, c) => sum + c.amountCents, 0)).toBe(16_000); // 20 x 8 Euro decken die Hallenkosten
    expect((await commissionOf(t.id)).map((e) => e.amountCents)).toEqual([1600]);
    expect(await walletBalance(db, o.id)).toBe(orgBefore); // kein Preisgeld
    expect((await trialBalance()).balanced).toBe(true);
  });
});
