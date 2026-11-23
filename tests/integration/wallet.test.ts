import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, teamMembers } from "@/db/schema";
import { bookingJobs, ledgerEntries, pendingRefunds, receipts } from "@/db/schema-finance";
import { creditWallet, trialBalance, walletBalance, InsufficientFunds } from "@/server/ledger";
import { cancelMatch, finalConfirm, joinLobby, leaveLobby, removeParticipant, payShare, setReady } from "@/server/lobby";
import { setSetting } from "@/server/settings";
import { settleMatch } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

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
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
  }
  return { ...m, players };
}

describe("Anteil reservieren beim Bereitmachen", () => {
  it("ohne eingeschaltete Zahlungen wird nichts gebucht", async () => {
    await setSetting(null, "payments_enabled", false);
    const m = await makeMatch({ legacy: true });
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    expect(await walletBalance(db, m.adminA.id)).toBe(0);
    expect((await participant(m.match.id, m.adminA.id)).readyAt).not.toBeNull();
    await setSetting(null, "payments_enabled", true);
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

  it("AC-1: der Betrag ist Preis ÷ eingeteilte Spieler, kein Deckel bei 12 und keine Mindestzahl 8 (Einstellung min_paid_players ohne Wirkung)", async () => {
    await setSetting(null, "min_paid_players", 12);
    try {
      const m = await makeMatch({ priceCents: 12_000, costCents: 12_000 });
      const all = await seat(m, 10);
      await payShare(all[0].id, m.match.id);
      expect(await paid(m.match.id, all[0].id)).toBe(1200); // Altmodell mit Mindestzahl 12 wäre 1000, mit Mindestzahl 8 wäre es 1500
      expect(await walletBalance(db, all[0].id)).toBe(1800);
      const m2 = await makeMatch({ priceCents: 12_000, costCents: 12_000 });
      const eleven = await seat(m2, 12);
      await payShare(eleven[0].id, m2.match.id);
      expect(await paid(m2.match.id, eleven[0].id)).toBe(1000);
    } finally {
      await setSetting(null, "min_paid_players", 8);
    }
  });

  it("wenige eingeteilte Spieler: Anteil mindestens durch 4 geteilt, keine Reservierung mit 8", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    await fund(m.adminA.id, 5000);
    await payShare(m.adminA.id, m.match.id);
    expect(await paid(m.match.id, m.adminA.id)).toBe(2000); // 2 eingeteilt: 8000 ÷ 4
  });

  it("Abrechnung: wer früher mehr gezahlt hat, bekommt die Differenz zurück; Einnahmen sind genau der Preis, Hauptbuch ausgeglichen", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const first = m.adminA;
    await fund(first.id, 5000);
    await payShare(first.id, m.match.id); // 2 eingeteilt: 2000
    const rest = [m.adminB];
    for (let i = 0; i < 8; i++) rest.push(await addPlayer(m.match.id, i % 2 === 0 ? m.home.id : m.away.id));
    for (const p of rest) {
      await fund(p.id, 3000);
      await payShare(p.id, m.match.id);
      expect(await paid(m.match.id, p.id)).toBe(800); // 10 eingeteilt
    }
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id));
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id)); // die Zahlungen haben die Bestätigung zurückgenommen
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(true);
    expect((await reloadMatch(m.match.id)).finalShareCents).toBe(800);
    expect(await paid(m.match.id, first.id)).toBe(800);
    expect(await walletBalance(db, first.id)).toBe(5000 - 800);
    expect(await revenueFor(m.match.id)).toBe(8000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Abrechnung teilt durch die eingeteilten Spieler und rechnet nie ab, solange die Summe der Anteile den Preis nicht deckt", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const all = await seat(m, 6);
    for (const p of all.slice(0, 4)) await payShare(p.id, m.match.id); // 6 eingeteilt: 8000 ÷ 6 = 1334; zwei zahlen nicht
    expect(await paid(m.match.id, all[0].id)).toBe(1334);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id));
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(false); // 4 × 1334 = 5336 < 8000: Fehlbetrag, keine Abrechnung
    expect((await reloadMatch(m.match.id)).settledAt).toBeNull();
    for (const p of all.slice(4)) await payShare(p.id, m.match.id); // jetzt zahlen alle
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id)); // die Zahlungen haben die Bestätigung zurückgenommen
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(true);
    expect((await reloadMatch(m.match.id)).finalShareCents).toBe(1334); // Altmodell: 8000 ÷ 8 = 1000
    expect(await revenueFor(m.match.id)).toBeGreaterThanOrEqual(8000);
    expect((await trialBalance()).balanced).toBe(true);
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

  it("AC-2: Spielerzahl steigt nach der Zahlung: Überzahlung geht sofort zurück, Bereit beider Teams wird zurückgesetzt", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const first = await squad(m, 4);
    for (const x of first) await payShare(x.id, m.match.id); // 8000 ÷ 4 = 2000
    for (const x of first) expect(await paidOf(m.match.id, x.id)).toBe(2000);
    await resetFinal(m);
    for (let i = 0; i < 6; i++) await joinVia(m, i % 2 === 0 ? m.home.id : m.away.id); // 10 eingeteilt: 8000 ÷ 10 = 800
    for (const x of first) {
      expect(await paidOf(m.match.id, x.id)).toBe(800);
      expect(await bal(x.id)).toBe(3000 - 800);
    }
    const fresh = await reloadMatch(m.match.id);
    expect(fresh.homeFinalAt).toBeNull();
    expect(fresh.awayFinalAt).toBeNull();
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Spielerzahl sinkt nach der Zahlung: Aussteiger werden erstattet, die anderen zahlen nach, abgerechnet wird nur bei gedecktem Preis (kein Fehlbetrag)", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const all = await squad(m, 10);
    for (const x of all) await payShare(x.id, m.match.id); // 10 × 800 = 8000
    expect(await sumPaid(m.match.id)).toBe(8000);
    await resetFinal(m);
    const leavers = all.slice(6); // vier Spieler gehen, es bleiben sechs
    for (const x of leavers) await leaveLobby(x.id, m.match.id);
    for (const x of leavers) expect(await bal(x.id)).toBe(3000); // sofort voll erstattet
    const stay = all.slice(0, 6);
    for (const x of stay) expect(await paidOf(m.match.id, x.id)).toBe(800); // noch nicht nachgezahlt: neuer Anteil wäre 1334
    expect((await reloadMatch(m.match.id)).homeFinalAt).toBeNull();
    // die Neuberechnung hat die Zahler über den höheren Anteil informiert (Nachforderung)
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, stay[0].id), eq(notifications.title, "Anteil hat sich geändert")));
    expect(notes.length).toBeGreaterThanOrEqual(1);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id));
    // 6 × 800 = 4800 < 8000: das Fehlbetrag-Szenario darf nicht abgerechnet werden
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(false);
    for (const x of stay) await payShare(x.id, m.match.id); // Nachzahlung auf 1334
    for (const x of stay) expect(await paidOf(m.match.id, x.id)).toBe(1334);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id)); // die Zahlungen haben die Bestätigung zurückgenommen
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(true);
    expect(await sumPaid(m.match.id)).toBeGreaterThanOrEqual(8000); // Invariante: nie weniger kassiert als der Preis
    expect(await revenueFor(m.match.id)).toBe(await sumPaid(m.match.id));
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-3: das zweite Bereit fixiert Spielerzahl und Preis, das Geld bleibt geparkt (nur Anteile auf revenue, nichts an Veranstalter oder Halle), auch bei parallelen Aufrufen", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const all = await squad(m, 10);
    for (const x of all) await payShare(x.id, m.match.id);
    for (const x of all) await setReady(x.id, m.match.id, true);
    await Promise.allSettled([finalConfirm(m.adminA.id, m.match.id), finalConfirm(m.adminB.id, m.match.id), finalConfirm(m.adminA.id, m.match.id)]);
    const fixed = await reloadMatch(m.match.id);
    expect(fixed.finalShareCents).toBe(800);
    expect(fixed.homeFinalAt).not.toBeNull();
    expect(fixed.awayFinalAt).not.toBeNull();
    expect(fixed.settledAt).toBeNull();
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, m.match.id));
    expect(entries.every((e) => e.kind === "match_share" || e.kind === "refund")).toBe(true);
    expect(entries.some((e) => (e.creditAccount !== "wallet" && e.creditAccount !== "revenue") || (e.debitAccount !== "wallet" && e.debitAccount !== "revenue"))).toBe(false);
    expect(await revenueFor(m.match.id)).toBe(8000);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-3: hat im Team jemand nicht bezahlt, kann der Captain nicht bestätigen; es wird nichts fixiert", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 });
    const all = await squad(m, 8);
    for (const x of all) await payShare(x.id, m.match.id); // 8 × 1000
    for (const x of all) await setReady(x.id, m.match.id, true);
    await joinVia(m, m.home.id); // 9 eingeteilt: Anteil 889, der Neue hat nichts bezahlt
    await joinVia(m, m.away.id);
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow();
    expect((await reloadMatch(m.match.id)).finalShareCents).toBeNull();
  });

  it("nach der Abrechnung ist die Liste zu: Austritt, Entfernen und Beitritt werden abgewiesen, keine Buchung, Preis und Hauptbuch unverändert", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000, hoursAhead: 100 });
    const all = await squad(m, 10);
    for (const x of all) await payShare(x.id, m.match.id);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, m.match.id));
    expect(await settleMatch(db as never, await reloadMatch(m.match.id))).toBe(true);
    const before = await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, m.match.id));
    const newcomer = await makeUser("nc");
    await db.insert(teamMembers).values({ teamId: m.home.id, userId: newcomer.id, role: "player" });
    await expect(leaveLobby(all[9].id, m.match.id)).rejects.toThrow(/gesperrt/);
    await expect(removeParticipant(m.adminB.id, m.match.id, all[9].id)).rejects.toThrow(/gesperrt/);
    await expect(joinLobby(newcomer.id, m.match.id)).rejects.toThrow(/gesperrt/);
    const after = await reloadMatch(m.match.id);
    expect(after.finalShareCents).toBe(800);
    expect(after.settledAt).not.toBeNull();
    expect(await db.select().from(ledgerEntries).where(eq(ledgerEntries.matchId, m.match.id))).toHaveLength(before.length);
    expect(await revenueFor(m.match.id)).toBe(8000);
    expect(await bal(all[9].id)).toBe(3000 - 800);
    expect((await participant(m.match.id, all[9].id))).toBeTruthy();
    expect(await participant(m.match.id, newcomer.id)).toBeUndefined();
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("AC-4: Austritt oder Entfernen nach dem Fixieren (mehr als 48 Stunden vor Anstoß): sofortige Erstattung, Festschreibung aufgehoben, Bereit zurückgesetzt", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000, hoursAhead: 100 });
    const all = await squad(m, 10);
    for (const x of all) await payShare(x.id, m.match.id);
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
