import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tournamentMatches, tournaments } from "@/db/schema-league";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { cancelTournament, createTournament, getTournament, registerTeam, reportResult, setOrganizer, startTournament, withdrawTeam } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

afterAll(cleanup);

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
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

async function teamsWithAdmins(n: number, fee = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const admin = await makeUser(`tm${i}`);
    const team = await makeTeam(admin.id, `Turnier ${i}`);
    if (fee) await fund(admin.id, fee * 2);
    out.push({ admin, team });
  }
  return out;
}

const tournamentAccount = async () => (await trialBalance()).rows.find((r) => r.account === "tournament")?.balance ?? 0;

describe("Turnier anlegen", () => {
  it("nur freigeschaltete Veranstalter, Eingaben werden geprüft", async () => {
    const plain = await makeUser("plain");
    const base = { name: "Hallen-Cup", city: "Essen", startsOn: tomorrow(), format: "knockout" as const, maxTeams: 8, entryFeeCents: 2000 };
    await expect(createTournament(plain.id, base)).rejects.toThrow(/freigeschaltete Veranstalter/);
    const o = await organizer();
    await expect(createTournament(o.id, { ...base, name: "ab" })).rejects.toThrow(/3 bis 80/);
    await expect(createTournament(o.id, { ...base, startsOn: "2020-01-01" })).rejects.toThrow(/Zukunft/);
    await expect(createTournament(o.id, { ...base, maxTeams: 33 })).rejects.toThrow(/2 bis 32/);
    await expect(createTournament(o.id, { ...base, format: "groups_ko", maxTeams: 4 })).rejects.toThrow(/mindestens 6/);
    await expect(createTournament(o.id, { ...base, entryFeeCents: 60_000 })).rejects.toThrow(/500 Euro/);
    await expect(createTournament(o.id, { ...base, entryFeeCents: -1 })).rejects.toThrow(/500 Euro/);
    expect((await createTournament(o.id, base)).status).toBe("registration");
    // Plattform-Admins dürfen immer
    const admin = await makeUser("tadm2", "admin");
    expect((await createTournament(admin.id, base)).organizerId).toBe(admin.id);
  });
});

describe("Anmeldung und Startgeld", () => {
  it("Startgeld wird abgebucht, Platzgrenze und Doppelanmeldung greifen, Abmeldung erstattet genau einmal", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "Geld-Cup", city: "Essen", startsOn: tomorrow(), format: "round_robin", maxTeams: 2, entryFeeCents: 1500 });
    const [a, b, c] = await teamsWithAdmins(3, 1500);
    const poorAdmin = await makeUser("poor");
    const poorTeam = await makeTeam(poorAdmin.id, "Arm");
    const before = await tournamentAccount();

    await expect(registerTeam(poorAdmin.id, t.id, poorTeam.id)).rejects.toThrow(/Guthaben reicht nicht/);
    await expect(registerTeam(a.admin.id, t.id, b.team.id)).rejects.toThrow(/Team-Admins/);
    await registerTeam(a.admin.id, t.id, a.team.id);
    await expect(registerTeam(a.admin.id, t.id, a.team.id)).rejects.toThrow(/schon angemeldet/);
    expect(await walletBalance(db, a.admin.id)).toBe(3000 - 1500);
    expect(await tournamentAccount()).toBe(before + 1500);

    await registerTeam(b.admin.id, t.id, b.team.id);
    await expect(registerTeam(c.admin.id, t.id, c.team.id)).rejects.toThrow(/voll/);
    expect(await walletBalance(db, c.admin.id)).toBe(3000); // nichts abgebucht

    await withdrawTeam(a.admin.id, t.id, a.team.id);
    expect(await walletBalance(db, a.admin.id)).toBe(3000);
    expect(await tournamentAccount()).toBe(before + 1500); // nur noch Team B
    await expect(withdrawTeam(a.admin.id, t.id, a.team.id)).rejects.toThrow(/nicht angemeldet/);
    expect(await walletBalance(db, a.admin.id)).toBe(3000);
    // Platz ist wieder frei
    await registerTeam(c.admin.id, t.id, c.team.id);
  });

  it("gleichzeitige Anmeldungen: nie mehr als maxTeams, nie doppelt abgebucht", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "Rennen-Cup", city: "Essen", startsOn: tomorrow(), format: "knockout", maxTeams: 2, entryFeeCents: 1000 });
    const four = await teamsWithAdmins(4, 1000);
    const results = await Promise.allSettled(four.map((x) => registerTeam(x.admin.id, t.id, x.team.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const paid = await Promise.all(four.map((x) => walletBalance(db, x.admin.id)));
    expect(paid.filter((p) => p === 1000)).toHaveLength(2); // Angemeldete haben 1000 von 2000 bezahlt
    expect(paid.filter((p) => p === 2000)).toHaveLength(2);
  });
});

describe("K.-o.-Turnier mit Startgeld", () => {
  it("Spielplan, Weiterkommen, Sieger, Auszahlung abzüglich Provision, Buchhaltung bleibt ausgeglichen", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "KO-Cup", city: "Essen", startsOn: tomorrow(), format: "knockout", maxTeams: 4, entryFeeCents: 1000 });
    const four = await teamsWithAdmins(4, 1000);
    const orgBefore = await walletBalance(db, o.id);
    await expect(startTournament(o.id, t.id)).rejects.toThrow(/mindestens 2/);
    for (const x of four) await registerTeam(x.admin.id, t.id, x.team.id);
    await expect(startTournament(four[0].admin.id, t.id)).rejects.toThrow(/Veranstalter/);
    await startTournament(o.id, t.id);
    await expect(registerTeam(four[0].admin.id, t.id, four[0].team.id)).rejects.toThrow(/geschlossen/);
    await expect(withdrawTeam(four[0].admin.id, t.id, four[0].team.id)).rejects.toThrow(/Nach dem Start/);

    let view = (await getTournament(t.id))!;
    const semis = view.stages.find((s) => s.stage === "ko:4")!.matches;
    expect(semis).toHaveLength(2);
    const final = view.stages.find((s) => s.stage === "ko:2")!.matches[0];
    expect(final.teamA).toBeNull();
    await expect(reportResult(o.id, t.id, final.id, { scoreA: 1, scoreB: 0 })).rejects.toThrow(/noch nicht fest/);
    await expect(reportResult(four[0].admin.id, t.id, semis[0].id, { scoreA: 1, scoreB: 0 })).rejects.toThrow(/Veranstalter/);
    await expect(reportResult(o.id, t.id, semis[0].id, { scoreA: -1, scoreB: 0 })).rejects.toThrow(/0 bis 99/);
    await expect(reportResult(o.id, t.id, semis[0].id, { scoreA: 2, scoreB: 2 })).rejects.toThrow(/Sieger/);
    await expect(reportResult(o.id, t.id, semis[0].id, { scoreA: 2, scoreB: 2, shootoutWinner: four[3].team.id === semis[0].teamA ? "x" : "00000000-0000-0000-0000-000000000000" })).rejects.toThrow(/Sieger/);

    // erstes Halbfinale endet 2:2, Siebenmeterschießen entscheidet für Team B
    await reportResult(o.id, t.id, semis[0].id, { scoreA: 2, scoreB: 2, shootoutWinner: semis[0].teamB });
    await reportResult(o.id, t.id, semis[1].id, { scoreA: 3, scoreB: 1 });
    view = (await getTournament(t.id))!;
    const f = view.stages.find((s) => s.stage === "ko:2")!.matches[0];
    expect(f.teamA).toBe(semis[0].teamB);
    expect(f.teamB).toBe(semis[1].teamA);
    expect(view.tournament.status).toBe("running");

    // korrigieren geht, solange das Finale nicht gespielt ist
    await reportResult(o.id, t.id, semis[1].id, { scoreA: 1, scoreB: 3 });
    expect((await getTournament(t.id))!.stages.find((s) => s.stage === "ko:2")!.matches[0].teamB).toBe(semis[1].teamB);
    await reportResult(o.id, t.id, semis[1].id, { scoreA: 3, scoreB: 1 });

    await reportResult(o.id, t.id, f.id, { scoreA: 0, scoreB: 1 });
    await expect(reportResult(o.id, t.id, semis[0].id, { scoreA: 5, scoreB: 0 })).rejects.toThrow(/läuft nicht/); // Turnier ist beendet

    view = (await getTournament(t.id))!;
    expect(view.tournament.status).toBe("finished");
    expect(view.tournament.winnerTeamId).toBe(semis[1].teamA);
    expect(view.winner).toBeTruthy();

    // Geld: 4 x 10 Euro, 10 % Provision
    expect(await walletBalance(db, o.id)).toBe(orgBefore + 3600);
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
    expect((await db.select().from(tournaments).where(eq(tournaments.id, t.id)))[0].settledAt).not.toBeNull();
  });

  it("Spielplan nach Reihenfolge der Anmeldung; Absage vor Ergebnissen erstattet alles, danach nicht mehr", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "Absage-Cup", city: "Essen", startsOn: tomorrow(), format: "round_robin", maxTeams: 4, entryFeeCents: 800 });
    const three = await teamsWithAdmins(3, 800);
    for (const x of three) await registerTeam(x.admin.id, t.id, x.team.id);
    await startTournament(o.id, t.id);
    expect(await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id))).toHaveLength(3);
    const tbBefore = await tournamentAccount();
    await cancelTournament(o.id, t.id);
    for (const x of three) expect(await walletBalance(db, x.admin.id)).toBe(1600);
    expect(await tournamentAccount()).toBe(tbBefore - 2400);
    expect((await getTournament(t.id))!.tournament.status).toBe("cancelled");
    await expect(cancelTournament(o.id, t.id)).rejects.toThrow(/beendet oder abgesagt/);

    const t2 = await createTournament(o.id, { name: "Zu-spät-Cup", city: "Essen", startsOn: tomorrow(), format: "round_robin", maxTeams: 3, entryFeeCents: 0 });
    for (const x of three) await registerTeam(x.admin.id, t2.id, x.team.id);
    await startTournament(o.id, t2.id);
    const m = (await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t2.id)))[0];
    await reportResult(o.id, t2.id, m.id, { scoreA: 1, scoreB: 0 });
    await expect(cancelTournament(o.id, t2.id)).rejects.toThrow(/schon Ergebnisse/);
  });
});

describe("Jeder gegen jeden und Gruppen mit K.-o.-Runde", () => {
  it("Liga-Turnier endet mit der Tabellenersten, ohne Startgeld keine Buchung", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "RR-Cup", city: "Essen", startsOn: tomorrow(), format: "round_robin", maxTeams: 3, entryFeeCents: 0 });
    const three = await teamsWithAdmins(3);
    for (const x of three) await registerTeam(x.admin.id, t.id, x.team.id);
    await startTournament(o.id, t.id);
    const matchesRows = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, t.id));
    // Team 1 gewinnt beide, Rest 1:0
    for (const m of matchesRows) {
      const first = three[0].team.id;
      await reportResult(o.id, t.id, m.id, m.teamA === first ? { scoreA: 2, scoreB: 0 } : m.teamB === first ? { scoreA: 0, scoreB: 2 } : { scoreA: 1, scoreB: 0 });
    }
    const view = (await getTournament(t.id))!;
    expect(view.tournament.status).toBe("finished");
    expect(view.tournament.winnerTeamId).toBe(three[0].team.id);
    expect(view.tables[0].rows[0]).toMatchObject({ teamId: three[0].team.id, points: 6 });
    expect(await walletBalance(db, o.id)).toBe(0);
  });

  it("6 Teams in zwei Gruppen: nach der Gruppenphase entsteht die K.-o.-Runde, Finale beendet das Turnier", async () => {
    const o = await organizer();
    const t = await createTournament(o.id, { name: "Gruppen-Cup", city: "Essen", startsOn: tomorrow(), format: "groups_ko", maxTeams: 6, entryFeeCents: 500 });
    const six = await teamsWithAdmins(6, 500);
    for (const x of six) await registerTeam(x.admin.id, t.id, x.team.id);
    await startTournament(o.id, t.id);

    let view = (await getTournament(t.id))!;
    const groupStages = view.stages.filter((s) => s.stage.startsWith("group:"));
    expect(groupStages).toHaveLength(2);
    expect(groupStages.flatMap((s) => s.matches)).toHaveLength(6); // 2 Gruppen à 3 Teams: je 3 Spiele
    expect(view.stages.some((s) => s.stage.startsWith("ko:"))).toBe(false);

    // Immer das Team mit der kleineren Setzposition gewinnt 1:0
    const rank = new Map(six.map((x, i) => [x.team.id, i]));
    for (const s of groupStages) {
      for (const m of s.matches) {
        const aWins = rank.get(m.teamA!)! < rank.get(m.teamB!)!;
        await reportResult(o.id, t.id, m.id, aWins ? { scoreA: 1, scoreB: 0 } : { scoreA: 0, scoreB: 1 });
      }
    }
    view = (await getTournament(t.id))!;
    expect(view.tournament.status).toBe("running");
    const semis = view.stages.find((s) => s.stage === "ko:4")!.matches;
    expect(semis).toHaveLength(2);
    expect(semis.every((m) => m.teamA && m.teamB)).toBe(true);

    for (const m of semis) await reportResult(o.id, t.id, m.id, { scoreA: 1, scoreB: 0 });
    const finalMatch = (await getTournament(t.id))!.stages.find((s) => s.stage === "ko:2")!.matches[0];
    await reportResult(o.id, t.id, finalMatch.id, { scoreA: 4, scoreB: 3 });
    view = (await getTournament(t.id))!;
    expect(view.tournament.status).toBe("finished");
    expect(view.tournament.winnerTeamId).toBe(finalMatch.teamA);
    expect((await trialBalance()).balanced).toBe(true);
  });
});
