import { afterAll, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches } from "@/db/schema";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { endMatch, submitResult } from "@/server/results";
import { decideShootout, decideTie, maybeGenerateBracket } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// PR 1a (Plan Demo-Funde, Entscheid t2q 2026-11-27): K.-o.-Unentschieden. Nach der Spielzeit entscheidet der Veranstalter EIN Tie-Break: Golden Goal (Tor im Turnierplan, 0:0 -> 1:0, decided_by 'gg')
// oder Neunmeter (Stand bleibt, Sieger gesetzt, decided_by '9m'). Nur K.-o.-Spiele, nur bei offenem Gleichstand, nur der Veranstalter (oder Plattform-Admin). Das Spiel selbst (matches/match_results) bleibt unberührt (Q1).
afterAll(cleanup);
const DAY = 86_400_000;

async function turnier(n = 4) {
  const org = await makeUser("tb-org");
  const admin = await makeUser("tb-adm", "admin");
  const [t] = await db
    .insert(tournaments)
    .values({ organizerId: org.id, name: `Tie-Cup ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: n, status: "payment", startsAt: new Date(Date.now() + 6 * DAY), durationMin: 120, matchMinutes: 15, isPrivate: false, finalShareCents: 0, totalCents: 0, hourlyCents: 0 } as typeof tournaments.$inferInsert)
    .returning();
  const caps: { id: string; teamId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cap = await makeUser("tb-cap");
    const team = await makeTeam(cap.id, `TB ${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id, readyAt: new Date(), paidReadyAt: new Date() });
    await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: cap.id });
    caps.push({ id: cap.id, teamId: team.id });
  }
  await db.transaction((tx) => maybeGenerateBracket(tx, t));
  return { t, org, admin, caps };
}
const rows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
const unentschieden = async (tid: string, org: { id: string }, index = 0) => {
  const m = (await rows(tid)).filter((r) => r.matchId && r.stage === "ko:4")[index];
  await endMatch(org.id, m.matchId!); // 0:0
  return (await rows(tid)).find((r) => r.id === m.id)!;
};

describe("decideTie: Golden Goal", () => {
  it("Sieger +1 im Turnierplan (decided_by gg), Sieger rückt weiter, das Spiel selbst bleibt unverändert, Audit", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await decideTie(org.id, t.id, m.id, "gg", m.teamA!);
    const after = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([after.scoreA, after.scoreB, after.shootoutWinner, after.decidedBy]).toEqual([1, 0, null, "gg"]);
    const final = (await rows(t.id)).find((r) => r.id === m.feedsMatchId)!;
    expect([final.teamA, final.teamB]).toContain(m.teamA);
    const game = (await db.select().from(matches).where(eq(matches.id, m.matchId!)))[0];
    expect(game.status).toBe("played"); // das Spiel selbst bleibt 0:0 gespielt
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id));
    expect(audits.map((a) => a.action)).toContain("tournament.tiebreak");
  });
  it("Golden Goal für Team B erhöht scoreB", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await decideTie(org.id, t.id, m.id, "gg", m.teamB!);
    const after = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([after.scoreA, after.scoreB, after.decidedBy]).toEqual([0, 1, "gg"]);
  });
});

describe("decideTie: Neunmeter", () => {
  it("Stand bleibt, Sieger gesetzt, decided_by 9m, Sieger rückt weiter; decideShootout (alt) ist dasselbe", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await decideTie(org.id, t.id, m.id, "9m", m.teamB!);
    const after = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([after.scoreA, after.scoreB, after.shootoutWinner, after.decidedBy]).toEqual([0, 0, m.teamB, "9m"]);
    const other = await turnier();
    const m2 = await unentschieden(other.t.id, other.org);
    await decideShootout(other.org.id, other.t.id, m2.id, m2.teamA!);
    expect((await rows(other.t.id)).find((r) => r.id === m2.id)!.decidedBy).toBe("9m");
  });
  it("Finale per Golden Goal beendet das Turnier mit Sieger", async () => {
    const { t, org } = await turnier();
    const semis = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4");
    for (const s of semis) await submitResult(org.id, s.matchId!, 2, 1);
    const final = (await rows(t.id)).find((r) => r.stage === "ko:2")!;
    await endMatch(org.id, final.matchId!);
    const f = (await rows(t.id)).find((r) => r.id === final.id)!;
    await decideTie(org.id, t.id, f.id, "gg", f.teamA!);
    const [after] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect([after.status, after.winnerTeamId]).toEqual(["finished", f.teamA]);
  });
});

describe("decideTie: Abweisungen", () => {
  it("nur der Veranstalter (oder Admin): Captain und Fremde abgewiesen, Plattform-Admin erlaubt", async () => {
    const { t, org, caps, admin } = await turnier();
    const m = await unentschieden(t.id, org);
    await expect(decideTie(caps[0].id, t.id, m.id, "gg", m.teamA!)).rejects.toThrow(/Nur der Veranstalter/);
    const fremd = await makeUser("tb-fremd");
    await expect(decideTie(fremd.id, t.id, m.id, "9m", m.teamA!)).rejects.toThrow(/Nur der Veranstalter/);
    expect((await rows(t.id)).find((r) => r.id === m.id)!.decidedBy).toBeNull();
    await decideTie(admin.id, t.id, m.id, "9m", m.teamA!);
    expect((await rows(t.id)).find((r) => r.id === m.id)!.decidedBy).toBe("9m");
  });
  it("nur bei offenem Gleichstand: reguläres Ergebnis und schon entschiedenes Spiel werden abgewiesen", async () => {
    const { t, org } = await turnier();
    const reg = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4");
    await submitResult(org.id, reg[0].matchId!, 2, 1);
    await expect(decideTie(org.id, t.id, reg[0].id, "gg", reg[0].teamA!)).rejects.toThrow(/kein Gleichstand/);
    const m = await unentschieden(t.id, org, 1);
    await decideTie(org.id, t.id, m.id, "9m", m.teamA!);
    await expect(decideTie(org.id, t.id, m.id, "gg", m.teamB!)).rejects.toThrow(/kein Gleichstand/);
  });
  it("falsches Team, unbekannte Art und Spiel ohne Ergebnis werden abgewiesen", async () => {
    const { t, org } = await turnier();
    const open = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await expect(decideTie(org.id, t.id, open.id, "gg", open.teamA!)).rejects.toThrow(/kein Gleichstand/);
    const m = await unentschieden(t.id, org);
    await expect(decideTie(org.id, t.id, m.id, "gg", crypto.randomUUID())).rejects.toThrow(/spielt in diesem Spiel nicht/);
    await expect(decideTie(org.id, t.id, m.id, "xx" as "gg", m.teamA!)).rejects.toThrow(/Art/);
  });
  it("kein K.-o.-Spiel (Gruppenphase, Spaßspiel): Tie-Break abgewiesen", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await db.update(tournamentMatches).set({ stage: "group:A" }).where(eq(tournamentMatches.id, m.id));
    await expect(decideTie(org.id, t.id, m.id, "gg", m.teamA!)).rejects.toThrow(/K\.-o\.-Spiele/);
  });
});

describe("decideTie: Trefferzahlen und Überschreiben", () => {
  it("9m mit Trefferzahlen: shootout_a/b gesetzt (z. B. 4:3 bei Sieger A)", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await decideTie(org.id, t.id, m.id, "9m", m.teamA!, { a: 4, b: 3 });
    const after = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([after.decidedBy, after.shootoutA, after.shootoutB]).toEqual(["9m", 4, 3]);
  });
  it("Trefferzahlen: nur bei 9m, beide gesetzt, ganze Zahlen 0 bis 50, sonst abgewiesen und nichts gespeichert", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await expect(decideTie(org.id, t.id, m.id, "gg", m.teamA!, { a: 1, b: 0 })).rejects.toThrow(/nur bei Neunmetern/);
    for (const bad of [{ a: -1, b: 2 }, { a: 51, b: 2 }, { a: 1.5, b: 2 }, { a: 3 } as unknown as { a: number; b: number }, { a: NaN, b: 1 }]) {
      await expect(decideTie(org.id, t.id, m.id, "9m", m.teamA!, bad)).rejects.toThrow(/ganze Zahlen von 0 bis 50/);
    }
    const nochOffen = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([nochOffen.decidedBy, nochOffen.shootoutWinner, nochOffen.shootoutA]).toEqual([null, null, null]);
    await decideTie(org.id, t.id, m.id, "9m", m.teamA!, { a: 0, b: 50 }); // Grenzen gelten
    expect((await rows(t.id)).find((r) => r.id === m.id)!.shootoutB).toBe(50);
  });
  it("der 9m-Sieger wird beim zweiten Aufruf (anderer Sieger) NICHT überschrieben", async () => {
    const { t, org } = await turnier();
    const m = await unentschieden(t.id, org);
    await decideTie(org.id, t.id, m.id, "9m", m.teamA!);
    await expect(decideTie(org.id, t.id, m.id, "9m", m.teamB!)).rejects.toThrow(/kein Gleichstand/);
    await expect(decideTie(org.id, t.id, m.id, "gg", m.teamB!)).rejects.toThrow(/kein Gleichstand/);
    const after = (await rows(t.id)).find((r) => r.id === m.id)!;
    expect([after.shootoutWinner, after.decidedBy]).toEqual([m.teamA, "9m"]);
  });
});
