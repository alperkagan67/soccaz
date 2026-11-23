import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, teamMembers } from "@/db/schema";
import { bookingJobs, ledgerEntries, pendingRefunds, receipts } from "@/db/schema-finance";
import { creditWallet, trialBalance, walletBalance, InsufficientFunds } from "@/server/ledger";
import { cancelMatch, finalConfirm, joinLobby, leaveLobby, removeParticipant, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch, seedShare } from "./helpers";

beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
  await setSetting(null, "min_paid_players", 8);
});
afterAll(cleanup);

const key = () => `w-${Math.random().toString(36).slice(2)}`;
const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: key() });
const participant = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const revenueFor = async (matchId: string) => {
  const rows = await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, matchId));
  return rows.reduce((s, r) => s + (r.creditAccount === "revenue" ? r.amountCents : 0) - (r.debitAccount === "revenue" ? r.amountCents : 0), 0);
};

/** Zwei Teams mit je 5 bezahlten, bereiten Spielern (Spiel bestätigt, Buchungsauftrag erzeugt). */
async function confirmedMatch(hoursAhead = 72, durationMin = 60, priceCents = 8000) {
  const m = await makeMatch({ legacy: true, hoursAhead, durationMin, priceCents, costCents: priceCents });
  const players = [m.adminA, m.adminB];
  for (let i = 0; i < 4; i++) players.push(await addPlayer(m.match.id, m.home.id), await addPlayer(m.match.id, m.away.id));
  for (const p of players) {
    await fund(p.id, 2000);
    await seedShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
  }
  return { ...m, players };
}

describe("Bestätigung, Buchungsauftrag und Abrechnung", () => {
  it("bestätigtes Spiel erzeugt genau einen Buchungsauftrag", async () => {
    const m = await confirmedMatch();
    expect((await reloadMatch(m.match.id)).status).toBe("confirmed");
    const jobs = await db.select().from(bookingJobs).where(eq(bookingJobs.matchId, m.match.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("open");
  });

});

describe("Buchführung insgesamt", () => {
  it("Saldenprobe ausgeglichen, jede Bewegung hat eine Gegenseite", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
  });
});

describe("Neues Modell im Teamspiel (008 M1): Preis ÷ tatsächliche Spielerzahl", () => {
  /** Zwei Teams, n Spieler eingeteilt (die beiden Admins zählen mit), jeder mit Guthaben. */
  const seat = async (m: Awaited<ReturnType<typeof makeMatch>>, n: number) => {
    const all = [m.adminA, m.adminB];
    while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
    for (const p of all) await fund(p.id, 3000);
    return all;
  };
  const paid = async (matchId: string, userId: string) => (await participant(matchId, userId)).paidCents;

  it("wenige eingeteilte Spieler: Anteil mindestens durch 4 geteilt, keine Reservierung mit 8", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 5000);
    await seedShare(m.adminA.id, m.match.id);
    expect(await paid(m.match.id, m.adminA.id)).toBe(2000); // 2 eingeteilt: 8000 ÷ 4
  });

});

describe("Teamspiel neues Modell (008 M2a): Neuberechnung, Fixierung, Austritt", () => {
  const sumPaid = async (matchId: string) => (await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, matchId))).reduce((a, x) => a + x.paidCents, 0);
  const bal = (id: string) => walletBalance(db, id);
  const paidOf = async (matchId: string, id: string) => (await participant(matchId, id)).paidCents;
  type M = Awaited<ReturnType<typeof makeMatch>>;
  /** Spieler tritt über die Lobby-Aktion bei (löst die Neuberechnung aus). */
  const joinVia = async (m: M, teamId: string) => {
    const u = await makeUser("jn");
    await db.insert(teamMembers).values({ teamId, userId: u.id, role: "player" });
    await fund(u.id, 3000);
    await joinLobby(u.id, m.match.id);
    return u;
  };
  /** Teams mit n eingeteilten Spielern (Admins zählen mit); alle haben Guthaben, niemand hat bezahlt. */
  const squad = async (m: M, n: number) => {
    const all = [m.adminA, m.adminB];
    while (all.length < n) all.push(await joinVia(m, all.length % 2 === 0 ? m.home.id : m.away.id));
    for (const x of all.slice(0, 2)) await fund(x.id, 3000);
    return all;
  };
  const resetFinal = (m: M) => db.update(matches).set({ homeFinalAt: new Date(), awayFinalAt: new Date() }).where(eq(matches.id, m.match.id));

  it("AC-3: hat im Team jemand nicht bezahlt, kann der Captain nicht bestätigen; es wird nichts fixiert", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const all = await squad(m, 8);
    for (const x of all) await seedShare(x.id, m.match.id); // 8 × 1000
    for (const x of all) await setReady(x.id, m.match.id, true);
    await joinVia(m, m.home.id); // 9 eingeteilt: Anteil 889, der Neue hat nichts bezahlt
    await joinVia(m, m.away.id);
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow();
    expect((await reloadMatch(m.match.id)).finalShareCents).toBeNull();
  });

  it("AC-4: Austritt oder Entfernen nach dem Fixieren (mehr als 48 Stunden vor Anstoß): sofortige Erstattung, Festschreibung aufgehoben, Bereit zurückgesetzt", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000, hoursAhead: 100 });
    const all = await squad(m, 10);
    for (const x of all) await seedShare(x.id, m.match.id);
    for (const x of all) await setReady(x.id, m.match.id, true);
    await finalConfirm(m.adminA.id, m.match.id);
    await finalConfirm(m.adminB.id, m.match.id);
    expect((await reloadMatch(m.match.id)).finalShareCents).toBe(800);
    await removeParticipant(m.adminB.id, m.match.id, all[9].id); // all[9] spielt im Gast-Team
    expect(await bal(all[9].id)).toBe(3000);
    let fresh = await reloadMatch(m.match.id);
    expect(fresh.finalShareCents).toBeNull();
    expect(fresh.homeFinalAt).toBeNull();
    expect(fresh.awayFinalAt).toBeNull();
    for (const x of all.slice(0, 9)) expect(await paidOf(m.match.id, x.id)).toBe(800); // neuer Anteil 8000 ÷ 9 = 889, der Rest wird nachgefordert
    await leaveLobby(all[8].id, m.match.id);
    expect(await bal(all[8].id)).toBe(3000);
    fresh = await reloadMatch(m.match.id);
    expect(fresh.finalShareCents).toBeNull();
    expect(await db.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, m.match.id))).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
  });
});
