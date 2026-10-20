import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants } from "@/db/schema";
import { bookingJobs, ledgerEntries, pendingRefunds, receipts } from "@/db/schema-finance";
import { creditWallet, trialBalance, walletBalance, InsufficientFunds } from "@/server/ledger";
import { cancelMatch, leaveLobby, removeParticipant, payShare, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { settleMatch } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, reloadMatch } from "./helpers";

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
  const m = await makeMatch({ hoursAhead, durationMin, priceCents, costCents: priceCents });
  const players = [m.adminA, m.adminB];
  for (let i = 0; i < 4; i++) players.push(await addPlayer(m.match.id, m.home.id), await addPlayer(m.match.id, m.away.id));
  for (const p of players) {
    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
  }
  return { ...m, players };
}

describe("Anteil reservieren beim Bereitmachen", () => {
  it("ohne eingeschaltete Zahlungen wird nichts gebucht", async () => {
    await setSetting(null, "payments_enabled", false);
    const m = await makeMatch();
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    expect(await walletBalance(db, m.adminA.id)).toBe(0);
    expect((await participant(m.match.id, m.adminA.id)).readyAt).not.toBeNull();
    await setSetting(null, "payments_enabled", true);
  });

  it("zu wenig Guthaben: nicht bereit, nichts gebucht, Fehler nennt den Betrag", async () => {
    const m = await makeMatch();
    await fund(m.adminA.id, 500);
    await expect(payShare(m.adminA.id, m.match.id)).rejects.toBeInstanceOf(InsufficientFunds);
    const p = await participant(m.match.id, m.adminA.id);
    expect(p.readyAt).toBeNull();
    expect(p.paidCents).toBe(0);
    expect(await walletBalance(db, m.adminA.id)).toBe(500);
  });

  it("60 Minuten: reserviert 10,00 EUR, 90 Minuten: 13,75 EUR", async () => {
    const a = await makeMatch({ durationMin: 60, priceCents: 8000 });
    await fund(a.adminA.id, 5000);
    await payShare(a.adminA.id, a.match.id);
    await setReady(a.adminA.id, a.match.id, true);
    expect(await walletBalance(db, a.adminA.id)).toBe(4000);
    expect((await participant(a.match.id, a.adminA.id)).paidCents).toBe(1000);

    const b = await makeMatch({ durationMin: 90, priceCents: 11000 });
    await fund(b.adminA.id, 5000);
    await payShare(b.adminA.id, b.match.id);
    await setReady(b.adminA.id, b.match.id, true);
    expect((await participant(b.match.id, b.adminA.id)).paidCents).toBe(1375);
  });

  it("wieder bereit nach Zurücknehmen kostet nicht doppelt", async () => {
    const m = await makeMatch();
    await fund(m.adminA.id, 3000);
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    await setReady(m.adminA.id, m.match.id, false);
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    expect(await walletBalance(db, m.adminA.id)).toBe(2000);
    expect(await db.select().from(ledgerEntries).where(and(eq(ledgerEntries.matchId, m.match.id), eq(ledgerEntries.kind, "match_share")))).toHaveLength(1);
  });

  it("Preis wird bei fehlender Regel verständlich abgelehnt", async () => {
    const m = await makeMatch({ durationMin: 75, priceCents: null, costCents: null });
    await fund(m.adminA.id, 3000);
    await expect(payShare(m.adminA.id, m.match.id)).rejects.toThrow(/kein Preis hinterlegt/);
  });
});

describe("Bestätigung, Buchungsauftrag und Abrechnung", () => {
  it("bestätigtes Spiel erzeugt genau einen Buchungsauftrag", async () => {
    const m = await confirmedMatch();
    expect((await reloadMatch(m.match.id)).status).toBe("confirmed");
    const jobs = await db.select().from(bookingJobs).where(eq(bookingJobs.matchId, m.match.id));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("open");
  });

  it("Abrechnung: 10 Zahler teilen 80 EUR, 2,00 EUR gehen jeweils zurück, nur einmal", async () => {
    const m = await confirmedMatch();
    // vorher: alle haben 10,00 reserviert, 10,00 übrig
    for (const p of m.players) expect(await walletBalance(db, p.id)).toBe(1000);
    expect(await revenueFor(m.match.id)).toBe(10_000);

    const done = await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)));
    expect(done).toBe(true);
    for (const p of m.players) {
      expect(await walletBalance(db, p.id)).toBe(1200);
      expect((await participant(m.match.id, p.id)).paidCents).toBe(800);
    }
    expect(await revenueFor(m.match.id)).toBe(8000); // genau der Hallenpreis
    const after = await reloadMatch(m.match.id);
    expect(after.finalShareCents).toBe(800);
    expect(after.settledAt).not.toBeNull();
    expect(await db.select().from(receipts).where(eq(receipts.matchId, m.match.id))).toHaveLength(10);

    // zweite Abrechnung ändert nichts
    expect(await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)))).toBe(false);
    for (const p of m.players) expect(await walletBalance(db, p.id)).toBe(1200);
  });

  it("90 Minuten: 110 EUR geteilt durch 10 sind 11,00 EUR, Rest zurück", async () => {
    const m = await confirmedMatch(72, 90, 11_000);
    await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)));
    expect((await reloadMatch(m.match.id)).finalShareCents).toBe(1100);
    expect(await revenueFor(m.match.id)).toBe(11_000);
  });

  it("Spieler nach der Abrechnung zahlen den endgültigen Anteil", async () => {
    const m = await confirmedMatch();
    await db.transaction(async (tx) => settleMatch(tx, await reloadMatch(m.match.id)));
    const late = await addPlayer(m.match.id, m.home.id);
    await fund(late.id, 2000);
    await payShare(late.id, m.match.id);
    await setReady(late.id, m.match.id, true);
    expect((await participant(m.match.id, late.id)).paidCents).toBe(800);
    expect(await walletBalance(db, late.id)).toBe(1200);
  });
});

describe("Abmelden, Entfernen und Absage", () => {
  it("mehr als 24 Stunden vorher: volle Erstattung sofort", async () => {
    const m = await makeMatch({ hoursAhead: 72 });
    const p = await addPlayer(m.match.id, m.home.id);
    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
    expect(await walletBalance(db, p.id)).toBe(1000);
    await leaveLobby(p.id, m.match.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await revenueFor(m.match.id)).toBe(0);
  });

  it("weniger als 24 Stunden vorher: keine Erstattung, bis ein Ersatz bezahlt hat", async () => {
    const m = await makeMatch({ hoursAhead: 10 });
    const leaver = await addPlayer(m.match.id, m.home.id);
    await fund(leaver.id, 2000);
    await payShare(leaver.id, m.match.id);
    await setReady(leaver.id, m.match.id, true);
    await leaveLobby(leaver.id, m.match.id);
    expect(await walletBalance(db, leaver.id)).toBe(1000); // Geld bleibt vorerst weg
    expect(await db.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, m.match.id))).toHaveLength(1);

    // Ersatz zahlt: Erstattung für den Ausgestiegenen
    const sub = await addPlayer(m.match.id, m.home.id);
    await fund(sub.id, 2000);
    await payShare(sub.id, m.match.id);
    await setReady(sub.id, m.match.id, true);
    expect(await walletBalance(db, leaver.id)).toBe(2000);
    expect(await db.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, m.match.id))).toHaveLength(0);

    // ein weiterer Zahler löst keine zweite Erstattung aus
    const extra = await addPlayer(m.match.id, m.away.id);
    await fund(extra.id, 2000);
    await payShare(extra.id, m.match.id);
    await setReady(extra.id, m.match.id, true);
    expect(await walletBalance(db, leaver.id)).toBe(2000);
  });

  it("Entfernen durch einen Admin: sofort volle Erstattung, auch kurz vor dem Spiel", async () => {
    const m = await makeMatch({ hoursAhead: 5 });
    const p = await addPlayer(m.match.id, m.home.id);
    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
    await removeParticipant(m.adminA.id, m.match.id, p.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
  });

  it("Absage: alle bekommen alles zurück, auch wer kurz vorher ausgestiegen war, Buchung wird zurückgezogen", async () => {
    const m = await makeMatch({ hoursAhead: 10 });
    const a = await addPlayer(m.match.id, m.home.id);
    const b = await addPlayer(m.match.id, m.away.id);
    const leaver = await addPlayer(m.match.id, m.home.id);
    for (const p of [a, b, leaver]) {
      await fund(p.id, 2000);
      await payShare(p.id, m.match.id);
      await setReady(p.id, m.match.id, true);
    }
    await leaveLobby(leaver.id, m.match.id); // zu spät: Erstattung offen
    await db.insert(bookingJobs).values({ matchId: m.match.id });

    await cancelMatch(m.adminA.id, m.match.id, "Halle gesperrt");
    for (const p of [a, b, leaver]) expect(await walletBalance(db, p.id)).toBe(2000);
    expect(await revenueFor(m.match.id)).toBe(0);
    expect((await db.select().from(bookingJobs).where(eq(bookingJobs.matchId, m.match.id)))[0].status).toBe("withdrawn");
    expect((await reloadMatch(m.match.id)).status).toBe("cancelled");
    expect(await db.select().from(pendingRefunds).where(eq(pendingRefunds.matchId, m.match.id))).toHaveLength(0);

    // Wiederholte Absage verändert nichts (Spiel ist nicht mehr aktiv)
    await expect(cancelMatch(m.adminA.id, m.match.id, "nochmal")).rejects.toThrow();
    for (const p of [a, b, leaver]) expect(await walletBalance(db, p.id)).toBe(2000);
  });
});

describe("Buchführung insgesamt", () => {
  it("Saldenprobe ausgeglichen, jede Bewegung hat eine Gegenseite", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
  });
});
