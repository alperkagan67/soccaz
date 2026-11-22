import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 012-Rest PR C (Backlog 144): die Sperrreihenfolge ist Teil des Codes (docs/BETRIEB.md): Halle -> Zugang -> TURNIER -> SPIEL -> Zahlungszeile -> Nutzer. Strukturtest fuer die beiden Pfade, die Turnier und Spiel
// zusammen sperren (Deadlock-Verhalten belegt tests/integration/tournament-lock-order.test.ts).
const account = readFileSync("src/server/account.ts", "utf8");
const tournaments = readFileSync("src/server/tournaments.ts", "utf8");

describe("deleteAccount: Turniere VOR Spielen", () => {
  it("die Sperre der Turniere steht vor der Sperre der Spiele und vor den Zahlungszeilen und dem Nutzer", () => {
    const iT = account.indexOf("const lockedTournaments");
    const iM = account.indexOf("const lockedAll");
    const iC = account.indexOf("const lockedCharges");
    const iU = account.indexOf("const [user] = await tx.select().from(users)");
    expect(iT).toBeGreaterThan(0);
    expect(iT).toBeLessThan(iM);
    expect(iM).toBeLessThan(iC);
    expect(iC).toBeLessThan(iU);
  });
  it("die Turniere der betroffenen Spiele gehoeren zur Sperrmenge (Turnierspiele)", () => {
    expect(account).toMatch(/tIdsFromGames[\s\S]{0,400}tournamentMatches/);
    expect(account).toMatch(/\.\.\.tIdsFromGames\]/);
  });
});

describe("cancelTournamentTx: Spiele sortiert und ohne Warten", () => {
  const body = tournaments.slice(tournaments.indexOf("export async function lockTournamentGames"), tournaments.indexOf("export async function lockTournamentGames") + 2500);
  it("sortiert (id) und NOWAIT, bounded Wiederholung, Protokoll ohne Personendaten", () => {
    expect(body).toMatch(/\.sort\(\)/);
    expect(body).toMatch(/orderBy\(matches\.id\)/);
    expect(body).toMatch(/noWait: true/);
    expect(body).toMatch(/BUSY_BACKOFF_MS/);
    expect(body).toMatch(/tournament\.cancel_busy/);
    expect(body).toMatch(/throw new TournamentBusyError/);
  });
  it("die Absage ruft lockTournamentGames statt eines blockierenden Updates ohne vorherige Sperre", () => {
    const cancel = tournaments.slice(tournaments.indexOf("async function cancelTournamentTx"), tournaments.indexOf("async function cancelTournamentTx") + 6000);
    const iLock = cancel.indexOf("lockTournamentGames(tx, tournamentId)");
    const iUpdate = cancel.indexOf('update(matches).set({ status: "cancelled" })');
    expect(iLock).toBeGreaterThan(0);
    expect(iLock).toBeLessThan(iUpdate);
  });
});
