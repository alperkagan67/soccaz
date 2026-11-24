import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, matches, matchEvents, matchResults } from "@/db/schema";
import { sql } from "drizzle-orm";
import { tournamentMatches, tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { endMatch, submitResult, submitScore } from "@/server/results";
import { maybeGenerateBracket } from "@/server/tournaments";
import { cleanup, makeTeam, makeUser } from "./helpers";

// Live-Demo-Fund (t2q 2026-11-26): Veranstalter/Admin (ohne Team) tragen ein Turnierspiel ueber 'Ergebnis melden' (submitResult) und 'Ergebnis eintragen' (submitScore) ein, das Spiel blieb 'confirmed'.
// URSACHE: requireStarted() in submitResult/recordEvent/decideResult: die Spiele eines Turniers haben die GEPLANTE Anstosszeit (Spielplan, meist spaeter); davor wirft jede Aktion 'Das Spiel hat noch nicht begonnen.'
// (auch fuer den Veranstalter). Fix: Veranstalter/Admin duerfen jederzeit eintragen (Planzeit nur Richtwert), Captains erst ab Planbeginn. Dazu der Abpfiff (endMatch).
afterAll(cleanup);
const DAY = 86_400_000;

async function turnier(n = 4, mitSpielern = false) {
  const org = await makeUser("er-org"); // Veranstalter ohne Team-Mitgliedschaft
  const admin = await makeUser("er-adm", "admin"); // Plattform-Admin ohne Team
  const [t] = await db
    .insert(tournaments)
    .values({ organizerId: org.id, name: `Ergebnis-Cup ${Date.now()}`, city: "Essen", startsOn: new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10), format: "knockout", maxTeams: n, status: "payment", startsAt: new Date(Date.now() + 6 * DAY), durationMin: 120, matchMinutes: 15, isPrivate: false, finalShareCents: 0, totalCents: 0, hourlyCents: 0 } as typeof tournaments.$inferInsert)
    .returning();
  const caps: { id: string; teamId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const cap = await makeUser("er-cap");
    const team = await makeTeam(cap.id, `ER ${i}`);
    await db.insert(tournamentTeams).values({ tournamentId: t.id, teamId: team.id, captainId: cap.id, readyAt: new Date(), paidReadyAt: new Date() });
    if (mitSpielern) {
      await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: cap.id });
      for (let p = 0; p < 3; p++) await db.insert(tournamentPlayers).values({ tournamentId: t.id, teamId: team.id, userId: (await makeUser("er-pl")).id });
    }
    caps.push({ id: cap.id, teamId: team.id });
  }
  await db.transaction((tx) => maybeGenerateBracket(tx, t));
  return { t, org, admin, caps };
}
const rows = (tid: string) => db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, tid)).orderBy(asc(tournamentMatches.round), asc(tournamentMatches.slot));
const gameOf = async (matchId: string) => (await db.select().from(matches).where(eq(matches.id, matchId)))[0];

describe("Ursache belegt: Turnierspiel liegt in der Zukunft (Spielplan), Eintragen durch den Veranstalter", () => {
  it("das Turnierspiel hat die GEPLANTE (zukünftige) Anstoßzeit und den Status confirmed", async () => {
    const { t } = await turnier();
    const first = (await rows(t.id)).find((r) => r.matchId)!;
    const g = await gameOf(first.matchId!);
    expect(g.status).toBe("confirmed");
    expect(g.startsAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("Veranstalter (ohne Team): 'Ergebnis melden' (submitResult) gilt SOFORT als Endergebnis, auch VOR der geplanten Zeit; Spiel played, Bracket rückt weiter", async () => {
    const { t, org } = await turnier();
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await submitResult(org.id, first.matchId!, 3, 1);
    expect((await gameOf(first.matchId!)).status).toBe("played");
    const [res] = await db.select().from(matchResults).where(eq(matchResults.matchId, first.matchId!));
    expect(res).toMatchObject({ homeScore: 3, awayScore: 1, confirmedHome: true, confirmedAway: true });
    const final = (await rows(t.id)).find((r) => r.stage === "ko:2")!;
    expect([final.teamA, final.teamB]).toContain(first.teamA); // der Sieger (Heim) steht im Finale
  });
  it("Plattform-Admin (ohne Team): 'Ergebnis eintragen' (submitScore: Tore als Ereignisse) schließt das Spiel ab, Endergebnis aus den Toren", async () => {
    const { t, admin } = await turnier();
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await submitScore(admin.id, first.matchId!, [{ teamId: first.teamA! }, { teamId: first.teamA! }, { teamId: first.teamB! }]);
    expect((await gameOf(first.matchId!)).status).toBe("played");
    const [res] = await db.select().from(matchResults).where(eq(matchResults.matchId, first.matchId!));
    expect(res).toMatchObject({ homeScore: 2, awayScore: 1 });
  });
  it("Captain eines beteiligten Teams: VOR dem Planbeginn weiterhin gesperrt", async () => {
    const { t, caps } = await turnier();
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    const cap = caps.find((c) => c.teamId === first.teamA)!;
    await expect(submitResult(cap.id, first.matchId!, 1, 0)).rejects.toThrow(/noch nicht begonnen/);
  });
});

describe("Abpfiff: das Spiel mit dem aktuellen Spielstand beenden", () => {
  it("Veranstalter: Abpfiff nach zwei Heim-Toren beendet das Spiel mit 2:0 (Endergebnis), jederzeit", async () => {
    const { t, org, admin } = await turnier();
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    const { recordEvent } = await import("@/server/results");
    await recordEvent(admin.id, first.matchId!, { type: "goal", teamId: first.teamA! });
    await recordEvent(admin.id, first.matchId!, { type: "goal", teamId: first.teamA! });
    expect((await db.select().from(matchEvents).where(eq(matchEvents.matchId, first.matchId!))).length).toBe(2);
    await endMatch(org.id, first.matchId!);
    const [res] = await db.select().from(matchResults).where(eq(matchResults.matchId, first.matchId!));
    expect(res).toMatchObject({ homeScore: 2, awayScore: 0, confirmedHome: true, confirmedAway: true });
    expect((await gameOf(first.matchId!)).status).toBe("played");
  });
  it("Abpfiff ohne Tore: 0:0 im Turnier ist ein Unentschieden (Siebenmeterschießen durch den Veranstalter), kein Absturz", async () => {
    const { t, org } = await turnier();
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await endMatch(org.id, first.matchId!);
    const [row] = (await rows(t.id)).filter((r) => r.id === first.id);
    expect(row.scoreA).toBe(0);
    expect(row.scoreB).toBe(0);
    expect((await db.select().from(auditLog).where(and(eq(auditLog.entityId, first.matchId!), eq(auditLog.action, "result.decide")))).length).toBe(1);
  });
  it("Fremder (weder Veranstalter, Admin noch Team-Admin): kein Abpfiff", async () => {
    const { t } = await turnier();
    const stranger = await makeUser("er-fremd");
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await expect(endMatch(stranger.id, first.matchId!)).rejects.toThrow();
    expect((await gameOf(first.matchId!)).status).toBe("confirmed");
  });
});

describe("Ganzer Weg bis zum Turnierende: Finale -> Turnier beendet + Sieger (echter Finalisierungsweg)", () => {
  for (const n of [4, 5, 6, 8, 16]) {
    it(`${n} Teams: Veranstalter trägt jedes Spiel ein (Ergebnis melden), das Finale beendet das Turnier mit genau einem Sieger`, async () => {
      const { t, org } = await turnier(n);
      for (let guard = 0; guard < 2 * n; guard++) {
        const open = (await rows(t.id)).filter((r) => r.matchId && r.teamA && r.teamB && r.scoreA === null).sort((a, b) => a.round - b.round || a.slot - b.slot)[0];
        if (!open) break;
        await submitResult(org.id, open.matchId!, 2, 1);
        expect((await gameOf(open.matchId!)).status, `${open.stage}|${open.slot} beendet`).toBe("played");
      }
      const all = await rows(t.id);
      expect(all.every((r) => r.scoreA !== null)).toBe(true);
      const [after] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
      expect(after.status).toBe("finished");
      const final = all.find((r) => r.stage === "ko:2")!;
      expect(after.winnerTeamId).toBe(final.teamA); // Heim gewinnt jedes Spiel (2:1)
    });
  }
  it("Finale per 'Ergebnis eintragen' (submitScore) durch den Plattform-Admin ohne Team: Turnier beendet, Sieger gesetzt", async () => {
    const { t, org, admin } = await turnier(4);
    for (const stage of ["ko:4", "ko:4", "ko:2"]) {
      const r = (await rows(t.id)).filter((x) => x.stage === stage && x.matchId && x.scoreA === null && x.teamA && x.teamB)[0];
      await submitScore(stage === "ko:2" ? admin.id : org.id, r.matchId!, [{ teamId: r.teamB! }, { teamId: r.teamB! }, { teamId: r.teamA! }]);
    }
    const [after] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(after.status).toBe("finished");
    const final = (await rows(t.id)).find((x) => x.stage === "ko:2")!;
    expect(after.winnerTeamId).toBe(final.teamB); // Gast gewinnt 2:1
  });
});

describe("Kampflos werten (Veranstalter/Admin), normaler Finalisierungsweg", () => {
  it("Veranstalter wertet das erste Halbfinale kampflos für das Gastteam: 0:3, Spiel played, Sieger rückt ins Finale, Audit mit Vorher/Nachher", async () => {
    const { t, org } = await turnier(4);
    const { forfeitTournamentMatch } = await import("@/server/tournaments");
    const first = (await rows(t.id)).filter((r) => r.stage === "ko:4")[0];
    await forfeitTournamentMatch(org.id, t.id, first.id, first.teamB!);
    const [res] = await db.select().from(matchResults).where(eq(matchResults.matchId, first.matchId!));
    expect(res).toMatchObject({ homeScore: 0, awayScore: 3, confirmedHome: true, confirmedAway: true });
    expect((await gameOf(first.matchId!)).status).toBe("played");
    const final = (await rows(t.id)).find((r) => r.stage === "ko:2")!;
    expect([final.teamA, final.teamB]).toContain(first.teamB); // das Team, das antritt, steht im Finale
    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, first.matchId!));
    const decide = audits.find((a) => a.action === "result.decide")!;
    expect(JSON.stringify(decide)).toContain("Kampflos");
    expect((await db.select().from(auditLog).where(and(eq(auditLog.entityId, t.id), eq(auditLog.action, "tournament.forfeit")))).length).toBe(1);
  });
  it("kampflos bis zum Turnierende: beide Halbfinals und das Finale kampflos: Turnier beendet, ein Sieger, Folgespiel (Finale) entstand echt", async () => {
    const { t, org } = await turnier(4);
    const { forfeitTournamentMatch } = await import("@/server/tournaments");
    for (const stage of ["ko:4", "ko:4", "ko:2"]) {
      const r = (await rows(t.id)).find((x) => x.stage === stage && x.scoreA === null && x.teamA && x.teamB && x.matchId)!;
      expect(r, stage).toBeDefined();
      await forfeitTournamentMatch(org.id, t.id, r.id, r.teamA!);
    }
    const [after] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    expect(after.status).toBe("finished");
    expect(after.winnerTeamId).not.toBeNull();
  });
  it("nur Veranstalter oder Admin; kein Spiel mit fehlendem Team, fremdes Team, schon entschiedenes Spiel", async () => {
    const { t, org, admin, caps } = await turnier(4);
    const { forfeitTournamentMatch } = await import("@/server/tournaments");
    const all = await rows(t.id);
    const first = all.filter((r) => r.stage === "ko:4")[0];
    const final = all.find((r) => r.stage === "ko:2")!;
    await expect(forfeitTournamentMatch(caps[0].id, t.id, first.id, first.teamA!)).rejects.toThrow(/Nur der Veranstalter/);
    await expect(forfeitTournamentMatch(org.id, t.id, final.id, first.teamA!)).rejects.toThrow(/noch nicht fest/);
    await expect(forfeitTournamentMatch(org.id, t.id, first.id, caps.find((c) => c.teamId !== first.teamA && c.teamId !== first.teamB)!.teamId)).rejects.toThrow(/spielt in diesem Spiel nicht/);
    await forfeitTournamentMatch(admin.id, t.id, first.id, first.teamA!); // Plattform-Admin darf
    await expect(forfeitTournamentMatch(org.id, t.id, first.id, first.teamB!)).rejects.toThrow(/schon entschieden/);
  });
});

describe("'Ergebnis eintragen' (submitScore) atomar: Tore und Ergebnis in EINER Transaktion (Live-Demo-Fund)", () => {
  it("1:0 als Plattform-Admin+Veranstalter ohne Team, Spiel gestartet UND Plan-Ende überschritten, mit Spielern im Turnier: Spiel played, Tor und Ergebnis gespeichert", async () => {
    const { t, org } = await turnier(4, true);
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await db.update(matches).set({ startsAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(matches.id, first.matchId!)); // Plan-Ende laengst vorbei
    await db.update((await import("@/db/schema")).users).set({ role: "admin" }).where(eq((await import("@/db/schema")).users.id, org.id)); // Veranstalter UND Plattform-Admin, ohne Team
    await submitScore(org.id, first.matchId!, [{ teamId: first.teamA! }]);
    expect((await gameOf(first.matchId!)).status).toBe("played");
    expect((await db.select().from(matchEvents).where(eq(matchEvents.matchId, first.matchId!))).length).toBe(1);
    const [res] = await db.select().from(matchResults).where(eq(matchResults.matchId, first.matchId!));
    expect(res).toMatchObject({ homeScore: 1, awayScore: 0 });
  });
  it("scheitert der Abschluss, wird auch das Tor NICHT gespeichert (Rollback), die Meldung kommt beim Aufrufer an; danach klappt der Eintrag", async () => {
    const { t, org } = await turnier(4);
    const first = (await rows(t.id)).filter((r) => r.matchId && r.stage === "ko:4")[0];
    await db.execute(sql`create or replace function test_abbruch_ergebnis() returns trigger as $$ begin raise exception 'Test-Abbruch beim Ergebnis'; end $$ language plpgsql`);
    await db.execute(sql`create trigger test_abbruch_ergebnis before insert on match_results for each row execute function test_abbruch_ergebnis()`);
    try {
      let fehler: unknown;
      try {
        await submitScore(org.id, first.matchId!, [{ teamId: first.teamA! }]);
      } catch (e) {
        fehler = e;
      }
      expect((fehler as { cause?: { message?: string } })?.cause?.message ?? "").toContain("Test-Abbruch"); // der Fehler kommt beim Aufrufer an
      expect((await db.select().from(matchEvents).where(eq(matchEvents.matchId, first.matchId!))).length).toBe(0); // kein halber Zustand
      expect((await gameOf(first.matchId!)).status).toBe("confirmed");
    } finally {
      await db.execute(sql`drop trigger if exists test_abbruch_ergebnis on match_results`);
      await db.execute(sql`drop function if exists test_abbruch_ergebnis()`);
    }
    await submitScore(org.id, first.matchId!, [{ teamId: first.teamA! }]);
    expect((await gameOf(first.matchId!)).status).toBe("played");
  });
  it("Fehlerpfad im UI: ScoreDialog und die Spielformulare zeigen auch unerwartete Serverfehler an (kein stilles Verschlucken)", async () => {
    const { readFileSync } = await import("node:fs");
    const dialog = readFileSync("src/app/lobby/[id]/uebersicht/ScoreDialog.tsx", "utf8");
    expect(dialog).toContain("} catch {");
    expect(dialog).toContain("Das Ergebnis konnte nicht gespeichert werden");
    expect(dialog).toContain('{error && <p className="error" role="alert">{error}</p>}');
    expect(readFileSync("src/app/spiele/[id]/MatchClient.tsx", "utf8")).toContain("Es wurde nichts gespeichert");
  });
});
