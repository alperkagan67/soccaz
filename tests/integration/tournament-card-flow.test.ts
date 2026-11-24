import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, notifications, matchParticipants, matches, paymentCharges, paymentProfiles, paymentRefunds, teamMembers } from "@/db/schema";
import { teamStats } from "@/db/schema-community";
import { ledgerEntries, venues } from "@/db/schema-finance";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { abortDeadline, fixDeadline } from "@/lib/deadlines";
import { cancelUnderfilledLobbies } from "@/server/scheduled";
import { sendPendingTournamentRefunds } from "@/server/payments/tournament-refund";
import { trialBalance, walletBalance } from "@/server/ledger";
import { FakeProvider } from "@/server/payments/fake";
import { setPaymentProviderForTests } from "@/server/payments/provider";
import { runTournamentCharges } from "@/server/payments/tournament-charge";
import { confirmResult, decideResult, disputeResult, submitResult } from "@/server/results";
import { setSetting } from "@/server/settings";
import { cancelTournament, closeTournamentsAtDeadline, closeWithJoinedTeams, createTournament, decideShootout, getTournament, joinAsPlayer, leavePlayer, registerTeam, reopenRosters, setDrawRandom, setOrganizer, setPaidReady, setRosterComplete, withdrawTeam } from "@/server/tournaments";
import { takeOverTournamentShare } from "@/server/tournament-card";
import { cleanup, makeTeam, makeUser, tokenOf } from "./helpers";

// 012 M6b b2-i Teil 2, Paket 1: Karten-Gegenstücke zu den Guthaben-Tests von tournament.test.ts (Bracket, Ergebnisse, Ansicht). Der Altpfad (payEntry, Auszahlung) wird in b2-ii gelöscht;
// hier steht, was bleibt: das Bracket entsteht genau einmal NACH der Abbuchung aller Spieler und dem Bereit aller Teams, die Ergebnisse führen weiter, der Veranstalter bekommt KEIN Preisgeld
// (F4), die Provision kommt aus dem eingefrorenen Satz. Die Abbuchung läuft deterministisch über runTournamentCharges (ohne Fälligkeitsprüfung) mit dem FakeProvider.
let provider: FakeProvider;
let hall = "";
let owner: { id: string }; // Admin 1: nach der ersten Abbuchung sagt nur er ein Turnier ab (AC-21), der Veranstalter schlägt nur vor
beforeAll(async () => {
  owner = await makeUser("adm1", "owner");
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
  await registerTeam(captain.id, tid, team.id, await tokenOf(tid));
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
    await expect(decideShootout(o.id, t.id, semis[0].id, semis[0].teamB!)).rejects.toThrow(/kein Gleichstand/);

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

// --- Paket 2: Kader, Bereit, Zahlung ---
// Zuordnung (AC-5) der Guthaben-Tests von tournament.test.ts, die in b2-ii entfallen, zu den Karten-Gegenstücken:
//  - "nur der Captain, 4 bis 6 Spieler; Kaderänderung hebt die Meldung auf; vorher kann niemand bezahlen" -> unten (Kaderregeln; "vorher kein Bereit" statt "vorher nicht bezahlen")
//  - "Zuschauer sehen weder paidReady noch paidReadyAt, Beteiligte schon" -> unten
//  - "AC-1: Bereit nur in Phase payment, nur der Captain, nur wenn alle bezahlt haben (auch durch andere)" -> unten (Karten statt Zahlung, "durch andere" = Übernahme)
//  - "AC-2: Kader wieder öffnen setzt Bereit aller Teams zurück" -> unten
//  - "abbuchen, nicht doppelt, auch bei gleichzeitigen Anfragen; ohne Guthaben nichts" -> tournament-charge.test.ts ('zur Frist: jeder Spieler genau einmal', 'nicht abbuchbar: ... Karte fehlt') + Paket 1 (parallele Läufe)
//  - "Captain zahlt für alle oder einzelne, alles oder nichts" / AC-4 (A zahlt für B, parallel, created=false) / AC-5 (anderes Team, Nicht-Kader) / AC-1 "Zahlung durch Mitspieler genügt"
//    -> tournament-card.test.ts ('Anteil uebernehmen', 'Uebernahme abgelehnt: ... aus einem anderen Team, doppelt'), tournament-charge.test.ts ('Anteil uebernehmen: der Zahler ist B', 'Alles-oder-nichts')
//  - "Erstattung geht an den Zahler" -> Paket 3 (Absage)
const paidReadyOf = async (tid: string, teamId: string) =>
  (await db.select({ v: tournamentTeams.paidReadyAt }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, tid), eq(tournamentTeams.teamId, teamId))))[0].v;

describe("Turnier im Kartenmodell: Kader und Bereit", () => {
  it("Gegenstück zu 'nur der Captain, 4 bis 6 Spieler': Kaderregeln unverändert; vor dem festen Preis gibt es kein Bereit; ein neuer Spieler hebt die Meldung auf", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const small = await squad(t.id, 3, false);
    await expect(setRosterComplete(small.captain.id, t.id, true)).rejects.toThrow(/4 bis 6/);
    await expect(setRosterComplete(small.players[1].id, t.id, true)).rejects.toThrow(/Captain/); // normaler Spieler
    await expect(setRosterComplete((await makeUser("fremd")).id, t.id, true)).rejects.toThrow(/Captain/);
    const p = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: small.team.id, userId: p.id, role: "player" });
    await joinAsPlayer(p.id, t.id, small.team.id);
    await setRosterComplete(small.captain.id, t.id, true);
    expect((await orgView(o, t.id))!.teams[0].ready).toBe(true);

    // vor der Preisfestlegung gibt es kein Bereit (Zahlungsphase fehlt) und nichts wird abgebucht
    await giveCards(small.players);
    await expect(setPaidReady(small.captain.id, t.id)).rejects.toThrow(/Zahlung/);
    expect(await chargesOf(t.id)).toHaveLength(0);

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

  it("Gegenstück zu 'AC-1: Bereit nur in Phase payment, nur der Captain, nur wenn alle bezahlt haben': Bereit nur in der Zahlungsphase, nur der Captain, nur mit Karten aller Spieler (auch durch Übernahme)", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const squads: Squad[] = [];
    for (let i = 0; i < 3; i++) squads.push(await squad(t.id, 4));
    const a = squads[0];
    // vor der Zahlungsphase: abgelehnt (auch mit Karten)
    await giveCards(a.players);
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Zahlung/);
    squads.push(await squad(t.id, 4));
    expect((await statusOf(t.id)).status).toBe("payment");

    // keine Karten: Fehler, Spalte bleibt leer (die Karten wurden oben vergeben: für den Test wieder entziehen)
    for (const p of a.players.slice(1)) await db.delete(paymentProfiles).where(eq(paymentProfiles.userId, p.id));
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Karte/);
    expect(await paidReadyOf(t.id, a.team.id)).toBeNull();

    // nur Captain-Recht: normale Spieler und Fremde dürfen nicht
    await giveCards([a.players[1]]);
    await expect(setPaidReady(a.players[1].id, t.id)).rejects.toThrow(/Captain/);
    await expect(setPaidReady((await makeUser("fremd")).id, t.id)).rejects.toThrow(/Captain/);

    // teilweise Karten: weiter Fehler
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Karte/);

    // Spieler 3 bekommt eine eigene Karte, Spieler 2 wird vom Captain übernommen ("durch andere"): jetzt gelingt Bereit
    await giveCards([a.players[3]]);
    await takeOverTournamentShare(a.captain.id, t.id, a.players[2].id, true);
    await setPaidReady(a.captain.id, t.id);
    expect(await paidReadyOf(t.id, a.team.id)).not.toBeNull();
    // ready_at ("Kader vollzählig") bleibt unberührt
    expect((await orgView(o, t.id))!.teams.find((x) => x.teamId === a.team.id)!.ready).toBe(true);
    // Team B ist unberührt, und es gibt kein Bracket (die anderen Teams sind nicht bereit, nichts ist abgebucht)
    expect(await paidReadyOf(t.id, squads[1].team.id)).toBeNull();
    expect((await statusOf(t.id)).bracketGeneratedAt).toBeNull();
    expect(await chargesOf(t.id)).toHaveLength(0);
  });

  it("Gegenstück zu 'Zuschauer sehen weder paidReady noch paidReadyAt, Beteiligte schon'", async () => {
    const o = await organizer();
    const { t, squads } = await cardTournament(o);
    const a = squads[0];
    await giveCards(a.players);
    await setPaidReady(a.captain.id, t.id);
    const stranger = await makeUser("fremd");
    for (const viewer of [null, { id: stranger.id, role: "player" as const }]) {
      expect(await getTournament(t.id, viewer, "falscher-token")).toBeNull(); // privates Turnier: Fremde sehen nichts (PR 3)
      expect(await getTournament(t.id, viewer)).toBeNull(); // der frühere Zuschauer-Modus (ohne Zahlungsstand) entfällt: ohne Zugang gibt es gar keine Sicht
    }
    const member = await getTournament(t.id, { id: a.players[1].id, role: "player" });
    expect(member!.teams.find((x) => x.teamId === a.team.id)!.paidReady).toBe(true);
    expect(JSON.stringify(member!.teams)).not.toContain("paidReadyAt");
  });

  it("Gegenstück zu 'AC-2: Kader wieder öffnen setzt Bereit aller Teams zurück': vor der Abbuchung gibt es nichts zu erstatten, Bereit ist danach nicht mehr möglich", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    await giveCards(players);
    const a = squads[0];
    await setPaidReady(a.captain.id, t.id);
    await setPaidReady(squads[1].captain.id, t.id);
    expect(await paidReadyOf(t.id, a.team.id)).not.toBeNull();
    await reopenRosters(o.id, t.id);
    for (const s of squads) expect(await paidReadyOf(t.id, s.team.id)).toBeNull();
    expect((await statusOf(t.id)).status).toBe("registration");
    expect(await chargesOf(t.id)).toHaveLength(0); // es war nichts abgebucht, also gibt es nichts zu erstatten
    // nach dem Wiederöffnen ist Bereit nicht mehr möglich
    await expect(setPaidReady(a.captain.id, t.id)).rejects.toThrow(/Zahlung/);
  });
});

// --- Paket 3: Frist, Absage, Erstattung ---
// Zuordnung (AC-5) der Guthaben-Tests von tournament.test.ts, die in b2-ii entfallen:
//  - "AC-11: Anmeldeschluss mit 3, 4 und 5 von 8 Teams ... Absage mit Vollerstattung an den Zahler" -> unten (Erstattung auf die Karte des Zahlers/Übernehmers)
//  - "Kader wieder öffnen: alles wird erstattet, der Preis wird neu berechnet, Zahlen geht danach wieder sauber" -> unten (vor der Abbuchung nichts zu erstatten; neuer Preis; neue Abbuchung)
//  - "Absage erstattet alle bezahlten Anteile vollständig, genau einmal; nach einem Ergebnis nicht mehr" -> unten
//  - "AC-6: Hat A für B bezahlt, geht die Erstattung an A" -> unten (Übernehmer A zahlt für B: die Erstattung geht an A)
//  - "AC-8: Ab der Zahlungsphase lehnt der Server Austritt und Abmeldung ab" und "AC-14: kein Austritt mit Erstattung nach der Zahlung" -> unten
//  - "AC-11: zur 48-h-Frist fällt ein Turnier aus ..." und "AC-16: 1 Stunde vor dem Start ..." -> unten (nichts abgebucht, also nichts zu erstatten; genau eine Absage, auch parallel)
const refundsOfTournament = (tid: string) => db.select().from(paymentRefunds).where(eq(paymentRefunds.tournamentId, tid));
const cancelAudits = async (tid: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entityId, tid), eq(auditLog.action, "tournament.cancel")))).length;
const refundCalls = () => provider.calls.filter((c) => c.method === "createRefund");
/** Turnier mit kurzem Vorlauf (Anstoß in 20 Stunden, Anmeldeschluss in 10 Stunden), im Kartenmodell, 4 Teams vollzählig. */
async function shortCardTournament(o: { id: string }) {
  const now = Date.now();
  const t = await createTournament(o.id, { ...base, venueId: hall, startsAt: new Date(now + 20 * 3_600_000), registrationDeadline: new Date(now + 10 * 3_600_000) });
  const squads: Squad[] = [];
  for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, 4));
  expect((await statusOf(t.id)).status).toBe("payment");
  return { t, squads, players: squads.flatMap((s) => s.players) };
}

describe("Turnier im Kartenmodell: Anmeldeschluss, Kader öffnen, Absage und Erstattung", () => {
  it("Gegenstück zu 'AC-11: Anmeldeschluss mit 3, 4 und 5 von 8 Teams': Weitermachen nur ab 4, Absage immer, nur der Veranstalter; danach Karten, Bereit, Abbuchung und Bracket (mit Freilosen)", async () => {
    const o = await organizer();
    const expire = (id: string) => db.update(tournaments).set({ registrationDeadline: new Date(Date.now() - 1000) }).where(eq(tournaments.id, id));
    for (const n of [3, 4, 5]) {
      const t = await createTournament(o.id, { ...base, venueId: hall, maxTeams: 8 });
      const squads: Squad[] = [];
      for (let i = 0; i < n; i++) squads.push(await squad(t.id, 4));
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
        // Bedingung "alle angemeldeten Teams bereit und abgebucht" gilt weiter: ohne Karten und Abbuchung kein Bracket
        expect(await bracketRows(t.id)).toHaveLength(0);
        await giveCards(squads.flatMap((s) => s.players));
        for (const s of squads) await setPaidReady(s.captain.id, t.id);
        await charge(t.id);
        expect((await bracketRows(t.id)).length).toBe(n - 1); // mit Freilosen bei 5 Teams
      }
    }
  });

  it("Gegenstück zu 'Absage mit Vollerstattung an den Zahler' und AC-6 ('Hat A für B bezahlt, geht die Erstattung an A'): der Übernehmer A zahlt für B, nach der Abbuchung bekommt A beide Anteile auf die Karte zurück, genau einmal", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    const a = squads[0];
    const [mate, b] = [a.players[1], a.players[2]];
    await giveCards(players.filter((p) => p.id !== b.id)); // B hat keine Karte: der Captain übernimmt
    await takeOverTournamentShare(a.captain.id, t.id, b.id, true);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    await charge(t.id);
    const charges = await chargesOf(t.id);
    expect(charges).toHaveLength(16);
    expect(charges.find((c) => c.userId === b.id)!.payerUserId).toBe(a.captain.id); // gezahlt hat der Captain, nicht B

    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/nur Admin 1/); // nach der ersten Abbuchung: nur ein Vorschlag, nichts wird erstattet
    expect(await refundsOfTournament(t.id)).toHaveLength(0);
    await cancelTournament(owner.id, t.id); // Admin 1 sagt ab, vor dem ersten Ergebnis
    await sendPendingTournamentRefunds(t.id);
    await sendPendingTournamentRefunds(t.id); // zweiter Lauf sendet nichts doppelt
    const refunds = await refundsOfTournament(t.id);
    expect(refunds).toHaveLength(16);
    expect(refunds.every((r) => r.status === "succeeded" && r.amountCents === 1000)).toBe(true);
    expect(refunds.filter((r) => r.userId === a.captain.id)).toHaveLength(2); // eigener Anteil UND der übernommene Anteil von B an den Zahler
    expect(refunds.some((r) => r.userId === b.id)).toBe(false); // nicht an B
    expect(refundCalls()).toHaveLength(16);
    expect(refunds.filter((r) => r.userId === mate.id)).toHaveLength(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    await expect(cancelTournament(owner.id, t.id)).rejects.toThrow(/beendet oder abgesagt/);
    expect(refundCalls()).toHaveLength(16); // auch die zweite Absage erstattet nichts erneut
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu 'Absage erstattet alle bezahlten Anteile vollständig, genau einmal; nach einem Ergebnis nicht mehr': Absage vor der Abbuchung (nichts zu erstatten), Absage mit Bracket (Spiele abgesagt, alle erstattet), nach dem ersten Ergebnis nicht mehr", async () => {
    const o = await organizer();
    // vor der Abbuchung: nur der Veranstalter, nichts zu erstatten
    const early = await cardTournament(o);
    await expect(cancelTournament((await makeUser("fremd")).id, early.t.id)).rejects.toThrow(/Veranstalter/);
    await cancelTournament(o.id, early.t.id);
    expect((await statusOf(early.t.id)).status).toBe("cancelled");
    expect(await refundsOfTournament(early.t.id)).toHaveLength(0);
    expect(await chargesOf(early.t.id)).toHaveLength(0);

    // nach der Bracket-Erzeugung, vor dem ersten Ergebnis: die Spiele werden mit abgesagt, alle 16 erstattet
    const r2 = await runningCardTournament(o);
    const gameIds = (await bracketRows(r2.t.id)).filter((r) => r.matchId).map((r) => r.matchId!);
    expect(gameIds.length).toBe(2);
    await cancelTournament(owner.id, r2.t.id);
    await sendPendingTournamentRefunds(r2.t.id);
    for (const id of gameIds) expect((await db.select().from(matches).where(eq(matches.id, id)))[0].status).toBe("cancelled");
    expect((await refundsOfTournament(r2.t.id)).filter((r) => r.status === "succeeded")).toHaveLength(16);

    // nach dem ersten Ergebnis geht es nicht mehr
    const r3 = await runningCardTournament(o);
    const captains = new Map(r3.squads.map((s) => [s.team.id, s.captain]));
    const first = (await bracketRows(r3.t.id)).find((r) => r.matchId)!;
    await play(first, 1, 0, captains);
    await expect(cancelTournament(owner.id, r3.t.id)).rejects.toThrow(/schon Ergebnisse/);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu 'Kader wieder öffnen: alles wird erstattet, der Preis wird neu berechnet': nur der Veranstalter; vor der Abbuchung nichts zu erstatten; neuer Preis (17 Spieler); danach wird mit dem neuen Preis abgebucht", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    await giveCards(players);
    await setPaidReady(squads[0].captain.id, t.id);
    await expect(reopenRosters(squads[0].captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await reopenRosters(o.id, t.id);
    expect(await statusOf(t.id)).toMatchObject({ status: "registration", finalShareCents: null });
    expect((await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))).every((x) => x.readyAt === null && x.paidReadyAt === null)).toBe(true);
    expect(await chargesOf(t.id)).toHaveLength(0);
    await expect(reopenRosters(o.id, t.id)).rejects.toThrow(/Zahlung läuft/);

    // ein Team nimmt einen Spieler dazu: wieder vollzählig, neuer Preis (17 Spieler), neue Abbuchung mit dem neuen Preis
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: squads[1].team.id, userId: extra.id, role: "player" });
    await joinAsPlayer(extra.id, t.id, squads[1].team.id);
    for (const s of squads) await setRosterComplete(s.captain.id, t.id, true);
    expect(await statusOf(t.id)).toMatchObject({ status: "payment", finalShareCents: 942 }); // 160 Euro / 17 Spieler, aufgerundet
    await giveCards([extra]);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    await charge(t.id);
    const charges = await chargesOf(t.id);
    expect(charges).toHaveLength(17);
    expect(charges.every((c) => c.amountCents === 942 && c.status === "succeeded")).toBe(true);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu AC-8 und AC-14: ab der Zahlungsphase lehnt der Server Austritt und Abmeldung ab (auch für den Veranstalter); Kader öffnen nur der Veranstalter; danach geht beides wieder", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    const a = squads[0];
    const pl = a.players[1];
    await giveCards([pl]);
    expect((await statusOf(t.id)).status).toBe("payment");
    await expect(leavePlayer(pl.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // Spieler selbst
    await expect(leavePlayer(a.captain.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // Captain
    await expect(leavePlayer(o.id, t.id, pl.id)).rejects.toThrow(/keine Änderung/); // sogar der Veranstalter: Weg ist reopenRosters
    await expect(withdrawTeam(a.captain.id, t.id, a.team.id)).rejects.toThrow(/Abmeldung/);
    await expect(withdrawTeam(o.id, t.id, a.team.id)).rejects.toThrow(/Abmeldung/);
    await expect(reopenRosters(a.captain.id, t.id)).rejects.toThrow(/Veranstalter/);
    await expect(reopenRosters(pl.id, t.id)).rejects.toThrow(/Veranstalter/);
    // nichts hat sich geändert
    expect(await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t.id))).toHaveLength(players.length);
    expect(await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))).toHaveLength(4);
    expect(await chargesOf(t.id)).toHaveLength(0); // es gibt keinen Austritt mit Erstattung: nichts abgebucht
    await reopenRosters(o.id, t.id);
    // zurück in der Anmeldephase gehen Austritt und Abmeldung wieder
    await leavePlayer(pl.id, t.id, pl.id);
    await withdrawTeam(squads[1].captain.id, t.id, squads[1].team.id);
  });

  it("Gegenstück zu 'AC-11: zur 48-h-Frist fällt ein Turnier aus': nicht alle Teams bereit/mit Karten: abgesagt, genau einmal (auch parallel), nicht vorher; nichts war abgebucht, also nichts zu erstatten", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    await giveCards(players.slice(0, 13)); // drei Spieler ohne Karte
    for (const s of squads.slice(0, 3)) await setPaidReady(s.captain.id, t.id);
    const start = (await statusOf(t.id)).startsAt!;
    await closeTournamentsAtDeadline(new Date(fixDeadline(start).getTime() - 1));
    expect((await statusOf(t.id)).status).toBe("payment"); // vor der Frist offen
    const at = fixDeadline(start);
    const runs = await Promise.all([closeTournamentsAtDeadline(at), closeTournamentsAtDeadline(at), closeTournamentsAtDeadline(at)]);
    expect(runs.reduce((x, y) => x + y, 0)).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    expect(await cancelAudits(t.id)).toBe(1); // genau eine Absage
    expect(await chargesOf(t.id)).toHaveLength(0);
    expect(await refundsOfTournament(t.id)).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu 'AC-16: 1 Stunde vor dem Start fällt ein Turnier mit kurzem Vorlauf aus': nicht alles bereit: abgesagt, genau einmal (parallel); eine Millisekunde früher nicht", async () => {
    const o = await organizer();
    const { t, squads, players } = await shortCardTournament(o);
    await giveCards(players.slice(0, 12));
    for (const s of squads.slice(0, 3)) await setPaidReady(s.captain.id, t.id);
    const abort = abortDeadline((await statusOf(t.id)).startsAt!);
    await closeTournamentsAtDeadline(new Date(abort.getTime() - 1));
    expect((await statusOf(t.id)).status).toBe("payment");
    const runs = await Promise.all([closeTournamentsAtDeadline(abort), closeTournamentsAtDeadline(abort)]);
    expect(runs.reduce((x, y) => x + y, 0)).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
    expect(await cancelAudits(t.id)).toBe(1);
    expect(await chargesOf(t.id)).toHaveLength(0);
    expect(await refundsOfTournament(t.id)).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
  });
});

// --- Nachtrag R-T319: Auslosung und Freilose ---
//  - "AC-9: Auslosung zufällig mit injizierter Zufallsquelle" und "Freilose: 5 Teams" (tournament.test.ts) liefen über payAll (Guthaben): Gegenstücke unten.
//  - "scheitert Turnier 1 NACH dem Eintragen (Rollback) ..." (Job notifyRegistrationDeadlines) nutzt NUR squad(): UNABHÄNGIG vom Guthabenweg, bleibt in tournament.test.ts bestehen.
describe("Turnier im Kartenmodell: Auslosung und Freilose", () => {
  it("Gegenstück zu 'AC-9: Auslosung zufällig mit injizierter Zufallsquelle': das Bracket entsteht mit der Abbuchung, die Auslosung folgt der Zufallsquelle (nicht der Anmeldereihenfolge), jedes Team genau einmal", async () => {
    const o = await organizer();
    const { t, squads, players } = await cardTournament(o);
    const [A, B, C, D] = squads.map((s) => s.team.id);
    await giveCards(players);
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    setDrawRandom(() => 0); // Fisher-Yates mit r = 0: [A,B,C,D] wird zu [B,C,D,A]
    try {
      await charge(t.id);
    } finally {
      setDrawRandom(null);
    }
    const rows = (await bracketRows(t.id)).filter((r) => r.stage === "ko:4").sort((x, y) => x.slot - y.slot);
    expect(rows.map((r) => [r.teamA, r.teamB])).toEqual([[B, A], [C, D]]); // Anmeldereihenfolge hätte A-D und B-C ergeben
    expect(new Set(rows.flatMap((r) => [r.teamA, r.teamB])).size).toBe(4);
    expect(await bracketRows(t.id)).toHaveLength(3);
    expect((await statusOf(t.id)).bracketGeneratedAt).not.toBeNull();
  });

  it("Gegenstück zu 'Freilose: 5 Teams ergeben 4 Spiele': Teams mit Freilos spielen erst in der nächsten Runde", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall, maxTeams: 5 });
    const squads: Squad[] = [];
    for (let i = 0; i < 5; i++) squads.push(await squad(t.id, 4)); // 20 Spieler, 8 Euro
    await giveCards(squads.flatMap((s) => s.players));
    for (const s of squads) await setPaidReady(s.captain.id, t.id);
    await charge(t.id);
    const rows = await bracketRows(t.id);
    expect(rows).toHaveLength(4); // n - 1 Spiele
    const first = rows.filter((r) => r.stage === "ko:8");
    expect(first).toHaveLength(1); // nur ein Spiel in der ersten Runde
    for (const r of rows.filter((x) => x.matchId)) expect(r.teamA && r.teamB).toBeTruthy();
    const inFirst = new Set(first.flatMap((r) => [r.teamA, r.teamB]).filter(Boolean));
    expect(inFirst.size).toBe(2);
    const semis = rows.filter((r) => r.stage === "ko:4");
    // die drei Teams mit Freilos stehen schon in der zweiten Runde und haben in der ersten Runde nicht gespielt
    const freilos = new Set(semis.flatMap((r) => [r.teamA, r.teamB]).filter((x): x is string => Boolean(x) && !inFirst.has(x as string)));
    expect(freilos.size).toBe(3);
    expect([...inFirst, ...freilos].sort()).toEqual(squads.map((s) => s.team.id).sort());
  });
});

// --- b2-ii: Ergebnisrechte im Kartenturnier (Gegenstücke zu 4 Altpfad-Tests aus tournament.test.ts, deren Thema nicht das Guthaben ist, deren Aufbau aber payAll nutzte) ---
describe("Turnier im Kartenmodell: Ergebnisrechte des Veranstalters", () => {
  const openSemi = async (tid: string) => {
    const m = (await bracketRows(tid)).find((r) => r.stage === "ko:4" && r.matchId)!;
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
    return m;
  };
  const openSemis = async (tid: string) => {
    const rows = (await bracketRows(tid)).filter((r) => r.stage === "ko:4" && r.matchId).sort((a, b) => a.slot - b.slot);
    for (const m of rows) await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m.matchId!));
    return rows;
  };
  const scoreOf = async (id: string) => (await db.select().from(tournamentMatches).where(eq(tournamentMatches.id, id)))[0].scoreA;

  it("Veranstalter (weder Team-Admin noch Plattform-Admin) trägt direkt ein, Sieger rückt auf; Fremde und andere Veranstalter werden abgewiesen", async () => {
    const o = await organizer();
    const { t, squads } = await runningCardTournament(o);
    const m = await openSemi(t.id);
    const stranger = await makeUser("fremd");
    const otherOrg = await organizer();
    await expect(submitResult(stranger.id, m.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
    await expect(submitResult(otherOrg.id, m.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
    await expect(decideResult(stranger.id, m.matchId!, 2, 1, "ich bestimme")).rejects.toThrow(/entscheiden/);
    await expect(decideResult(otherOrg.id, m.matchId!, 2, 1, "ich bestimme")).rejects.toThrow(/entscheiden/);
    expect(await scoreOf(m.id)).toBeNull();
    await submitResult(o.id, m.matchId!, 2, 1);
    expect(await scoreOf(m.id)).toBe(2);
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).toBe("played");
    const final = (await bracketRows(t.id)).find((r) => r.stage === "ko:2")!;
    expect([final.teamA, final.teamB]).toContain(m.teamA);
    expect(squads.length).toBe(4);
  });

  it("Streit: Veranstalter entscheidet, Fremde nicht; Plattform-Admin bleibt Fallback", async () => {
    const o = await organizer();
    const { t, squads } = await runningCardTournament(o);
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
    const m2 = (await bracketRows(t.id)).find((r) => r.stage === "ko:4" && r.matchId && r.scoreA === null)!;
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, m2.matchId!));
    const admin = await makeUser("padmin", "admin");
    await decideResult(admin.id, m2.matchId!, 2, 2, "Admin");
    expect((await bracketRows(t.id)).find((r) => r.id === m2.id)).toMatchObject({ scoreA: 2, scoreB: 2 });
  });

  it("Randfall: Ist der Veranstalter zugleich Team-Admin eines beteiligten Teams, gilt er in diesem Spiel nur als dieses Team (Gegenpartei bestätigt, kein Selbst-Bestätigen, keine Selbst-Entscheidung)", async () => {
    const o = await organizer();
    const { t, squads } = await runningCardTournament(o);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    const m = await openSemi(t.id);
    await db.insert(teamMembers).values({ teamId: m.teamA!, userId: o.id, role: "admin" });
    await submitResult(o.id, m.matchId!, 5, 0);
    expect((await bracketRows(t.id)).find((r) => r.id === m.id)!.scoreA).toBeNull();
    expect((await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0].status).not.toBe("played");
    await expect(confirmResult(o.id, m.matchId!)).rejects.toThrow(/andere Team/);
    await expect(decideResult(o.id, m.matchId!, 5, 0, "in eigener Sache")).rejects.toThrow(/entscheiden/);
    await confirmResult(captains.get(m.teamB!)!.id, m.matchId!);
    expect((await bracketRows(t.id)).find((r) => r.id === m.id)).toMatchObject({ scoreA: 5, scoreB: 0 });
  });

  for (const via of ["Teammitglied", "Turnier-Kader"] as const) {
    it(`Veranstalter nur als ${via} (ohne Admin-Rolle) eines beteiligten Teams: kein endgültiges Ergebnis, keine Entscheidung; anderes Spiel bleibt erlaubt`, async () => {
      const o = await organizer();
      const { t } = await runningCardTournament(o);
      const [mine, other] = await openSemis(t.id);
      if (via === "Teammitglied") await db.insert(teamMembers).values({ teamId: mine.teamA!, userId: o.id, role: "player" });
      else await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: mine.teamA!, userId: o.id });
      await expect(submitResult(o.id, mine.matchId!, 2, 1)).rejects.toThrow(/Team-Admins/);
      await expect(decideResult(o.id, mine.matchId!, 2, 1, "in eigener Sache")).rejects.toThrow(/entscheiden/);
      expect(await scoreOf(mine.id)).toBeNull();
      expect((await db.select().from(matches).where(eq(matches.id, mine.matchId!)))[0].status).not.toBe("played");
      await submitResult(o.id, other.matchId!, 2, 1);
      expect(await scoreOf(other.id)).toBe(2);
      const admin = await makeUser("padmin", "admin");
      await decideResult(admin.id, mine.matchId!, 1, 0, "Admin");
      expect(await scoreOf(mine.id)).toBe(1);
    });
  }
});

// --- b2-ii: Altgeld (paid_cents > 0 aus dem früheren Guthabenmodell) wird nicht mehr erstattet/ausgezahlt, sondern nur protokolliert ---
describe("Turnier: Altgeld wird nur protokolliert (012 M6b b2-ii)", () => {
  const auditsOf = async (tid: string, action: string) => (await db.select().from(auditLog).where(and(eq(auditLog.entity, "tournament"), eq(auditLog.entityId, tid), eq(auditLog.action, action))));

  it("Austritt eines Spielers mit Altgeld: nichts wird aufs Guthaben gebucht, 'tournament.refund_skipped' hält Betrag und Grund ohne Personendaten fest; Bereit des Teams entfällt", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const s = await squad(t.id, 3, false);
    const extra = await makeUser("pl");
    await db.insert(teamMembers).values({ teamId: s.team.id, userId: extra.id, role: "player" });
    await joinAsPlayer(extra.id, t.id, s.team.id);
    await db.update(tournamentPlayers).set({ paidCents: 1000, paidAt: new Date() }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, extra.id)));
    const before = await walletBalance(db, extra.id);
    const entriesBefore = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, t.id))).length;
    await leavePlayer(extra.id, t.id, extra.id);
    expect(await walletBalance(db, extra.id)).toBe(before); // kein Guthaben mehr
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, t.id))).length).toBe(entriesBefore);
    const rows = await auditsOf(t.id, "tournament.refund_skipped");
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ amountCents: 1000, userId: extra.id }); // Anspruch bleibt nach dem Löschen der Zeile zuordenbar (interne ID, kein Name/keine E-Mail)
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain("@");
  });

  it("Anspruch nach Abmeldung des Teams und nach Wiederöffnen zuordenbar: je Spieler mit Altgeld ein Eintrag mit userId und paidBy, bevor Zeile gelöscht/genullt wird", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall });
    const s = await squad(t.id, 3, false);
    const payer = await makeUser("zahler");
    await db.update(tournamentPlayers).set({ paidCents: 700, paidAt: new Date(), paidBy: payer.id }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, s.players[1].id)));
    await withdrawTeam(s.captain.id, t.id, s.team.id);
    let rows = await auditsOf(t.id, "tournament.refund_skipped");
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ userId: s.players[1].id, paidBy: payer.id, amountCents: 700 });

    const o2 = await organizer();
    const { t: t2, players } = await cardTournament(o2);
    await db.update(tournamentPlayers).set({ paidCents: 300, paidAt: new Date(), paidBy: players[2].id }).where(and(eq(tournamentPlayers.tournamentId, t2.id), eq(tournamentPlayers.userId, players[3].id)));
    await reopenRosters(o2.id, t2.id);
    rows = await auditsOf(t2.id, "tournament.refund_skipped");
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ userId: players[3].id, paidBy: players[2].id, amountCents: 300 });
    expect((await db.select().from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, t2.id))).every((p) => p.paidCents === 0)).toBe(true); // genullt, Anspruch steht im Protokoll
    const reopen = await auditsOf(t2.id, "tournament.reopen");
    expect(reopen[0].after).toMatchObject({ refundSkipped: 1 }); // Altgeld zählt nicht als erstattet
  });

  it("Absage im Mischzustand (Kartenabbuchung vorhanden, ein Spieler mit Altgeld): Kartenzweig erstattet die Abbuchungen UND protokolliert das Altgeld, Meldung behauptet keine Guthaben-Erstattung", async () => {
    const o = await organizer();
    const { t, players } = await runningCardTournament(o);
    await db.update(tournamentPlayers).set({ paidCents: 400, paidAt: new Date(2026, 0, 2) }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, players[0].id)));
    await cancelTournament(owner.id, t.id); // nach der ersten Abbuchung sagt nur Admin 1 ab (AC-21)
    const rows = await auditsOf(t.id, "tournament.refund_skipped");
    expect(rows).toHaveLength(1);
    expect(rows[0].after).toMatchObject({ userId: players[0].id, amountCents: 400 });
    expect((await auditsOf(t.id, "tournament.cancel"))[0].after).toMatchObject({ refundSkipped: 1 });
    expect((await statusOf(t.id)).status).toBe("cancelled");
  });

  it("Idempotenz: derselbe Anspruch (Spieler, Bezahlzeitpunkt, Anlass) wird nur einmal protokolliert, auch wenn das Öffnen wiederholt wird", async () => {
    const o = await organizer();
    const { t, players } = await cardTournament(o);
    const paidAt = new Date(2026, 0, 3);
    for (let n = 0; n < 2; n++) {
      await db.update(tournamentPlayers).set({ paidCents: 250, paidAt }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, players[1].id)));
      await reopenRosters(o.id, t.id);
      // wieder in die Zahlungsphase: alle Teams melden erneut vollzählig
      for (const e of await db.select().from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id))) await setRosterComplete(e.captainId!, t.id, true);
    }
    expect(await auditsOf(t.id, "tournament.refund_skipped")).toHaveLength(1);
  });

  it("Abschluss mit Altgeld: keine Auszahlung an den Veranstalter, keine Provisionsbuchung; 'tournament.settle_skipped' mit Summe; settled_at gesetzt; Hauptbuch ausgeglichen", async () => {
    const o = await organizer();
    const { t, squads, players } = await runningCardTournament(o);
    const captains = new Map(squads.map((s) => [s.team.id, s.captain]));
    // Altgeld simulieren: Karten-Abrechnung zurücknehmen und einem Spieler 5 Euro Altgeld geben
    await db.update(tournaments).set({ settledAt: null }).where(eq(tournaments.id, t.id));
    await db.update(tournamentPlayers).set({ paidCents: 500 }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, players[0].id)));
    const orgBefore = await walletBalance(db, o.id);
    const ledgerBefore = (await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, t.id))).length;
    const rows = await bracketRows(t.id);
    const semis = rows.filter((r) => r.stage === "ko:4").sort((x, y) => x.slot - y.slot);
    await play(semis[0], 3, 1, captains);
    await play(semis[1], 2, 0, captains);
    const final = (await bracketRows(t.id)).find((r) => r.stage === "ko:2")!;
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3_600_000) }).where(eq(matches.id, final.matchId!));
    await play(final, 1, 0, captains);
    expect((await statusOf(t.id)).status).toBe("finished");
    expect((await statusOf(t.id)).settledAt).not.toBeNull();
    expect(await walletBalance(db, o.id)).toBe(orgBefore); // kein Preisgeld
    expect((await db.select().from(ledgerEntries).where(eq(ledgerEntries.tournamentId, t.id))).length).toBe(ledgerBefore); // keine neue Buchung
    const skipped = await auditsOf(t.id, "tournament.settle_skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].after).toMatchObject({ totalCents: 500 });
    expect((await trialBalance()).balanced).toBe(true);
  });
});

// --- b2-ii (R-T320 B): Gegenstücke zu fünf Fristen-Tests aus tournament.test.ts, deren Aufbau über das Guthaben lief ---
describe("Turnier im Kartenmodell: Fristen-Gegenstücke", () => {
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

  it("Gegenstück zu 'Karenz: Steht der Preis erst kurz vor der Frist fest, gilt die Frist frühestens 12 Stunden danach'", async () => {
    const o = await organizer();
    const start = hours(49);
    const t = await createTournament(o.id, { ...base, venueId: hall, startsAt: start, registrationDeadline: new Date(start.getTime() - 48 * 3_600_000) });
    for (let i = 0; i < t.maxTeams; i++) await squad(t.id, 4); // Preis steht jetzt fest
    expect((await statusOf(t.id)).status).toBe("payment");
    await closeTournamentsAtDeadline(new Date(fixDeadline(start).getTime() + 3_600_000)); // 48-h-Frist eine Stunde her, die Karenz läuft noch
    expect((await statusOf(t.id)).status).toBe("payment");
    await closeTournamentsAtDeadline(new Date(Date.now() + 12 * 3_600_000 + 5000));
    expect((await statusOf(t.id)).status).toBe("cancelled");
  });

  it("Gegenstück zu 'AC-14: weniger als 48 Stunden Vorlauf': sobald alle Karten da und alle bereit sind, wird sofort abgebucht (Bracket), danach sagt auch der 1-h-Job nicht mehr ab", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { ...base, venueId: hall, startsAt: hours(20), registrationDeadline: hours(10) });
    const squads: Squad[] = [];
    for (let i = 0; i < t.maxTeams; i++) squads.push(await squad(t.id, 4));
    await giveCards(squads.flatMap((x) => x.players));
    for (const x of squads.slice(0, 3)) await setPaidReady(x.captain.id, t.id);
    expect((await charge(t.id)).reason).toBe("not_ready");
    expect((await statusOf(t.id)).bracketGeneratedAt).toBeNull();
    await setPaidReady(squads[3].captain.id, t.id);
    await charge(t.id);
    const done = await statusOf(t.id);
    expect(done.status).toBe("running");
    expect(done.bracketGeneratedAt).not.toBeNull();
    await closeTournamentsAtDeadline(new Date(abortDeadline(done.startsAt!).getTime() + 60_000));
    expect((await statusOf(t.id)).status).toBe("running");
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Gegenstück zu 'AC-11: ein Turnier, das zur Frist noch in der Anmeldung steht, fällt aus; ein Turnier mit Bracket nie'", async () => {
    const o = await organizer();
    const open = await createTournament(o.id, { ...base, venueId: hall });
    await squad(open.id, 4);
    await squad(open.id, 3, false);
    const { t: booked } = await runningCardTournament(o);
    await closeTournamentsAtDeadline(new Date(fixDeadline((await statusOf(open.id)).startsAt!).getTime() + 1000));
    expect((await statusOf(open.id)).status).toBe("cancelled");
    expect((await statusOf(booked.id)).status).toBe("running");
  });

  it("Gegenstück zu 'Empfänger der Absage': Veranstalter, Zahler (paidBy) und Spieler bekommen die Absage je genau einmal", async () => {
    const o = await organizer();
    const { t, players } = await cardTournament(o);
    const payer = await makeUser("paidby");
    await db.update(tournamentPlayers).set({ paidBy: payer.id }).where(and(eq(tournamentPlayers.tournamentId, t.id), eq(tournamentPlayers.userId, players[0].id)));
    await closeTournamentsAtDeadline(fixDeadline((await statusOf(t.id)).startsAt!));
    expect((await statusOf(t.id)).status).toBe("cancelled");
    const got = async (userId: string) => (await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.title, "Turnier abgesagt"), eq(notifications.url, `/turniere/${t.id}`)))).length;
    expect(await got(o.id)).toBe(1);
    expect(await got(payer.id)).toBe(1);
    for (const pl of players) expect(await got(pl.id), "Spieler genau einmal (nicht doppelt als Zahler)").toBe(1);
  });

  it("Cron-Einbindung (guthabenunabhängig, erhalten): der Job lobby-deadlines (cancelUnderfilledLobbies) ruft die Turnier-Frist auf", async () => {
    const o = await organizer();
    const { t } = await cardTournament(o);
    const n = await cancelUnderfilledLobbies(fixDeadline((await statusOf(t.id)).startsAt!));
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await statusOf(t.id)).status).toBe("cancelled");
  });
});
