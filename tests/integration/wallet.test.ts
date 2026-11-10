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

  it("zu wenig Guthaben: nicht bereit, nichts gebucht, Fehler nennt den Betrag", async () => {
    const m = await makeMatch({ legacy: true });
    await fund(m.adminA.id, 500);
    await expect(payShare(m.adminA.id, m.match.id)).rejects.toBeInstanceOf(InsufficientFunds);
    const p = await participant(m.match.id, m.adminA.id);
    expect(p.readyAt).toBeNull();
    expect(p.paidCents).toBe(0);
    expect(await walletBalance(db, m.adminA.id)).toBe(500);
  });

  it("60 Minuten: reserviert 10,00 EUR, 90 Minuten: 13,75 EUR", async () => {
    const a = await makeMatch({ legacy: true, durationMin: 60, priceCents: 8000 });
    await fund(a.adminA.id, 5000);
    await payShare(a.adminA.id, a.match.id);
    await setReady(a.adminA.id, a.match.id, true);
    expect(await walletBalance(db, a.adminA.id)).toBe(4000);
    expect((await participant(a.match.id, a.adminA.id)).paidCents).toBe(1000);

    const b = await makeMatch({ legacy: true, durationMin: 90, priceCents: 11000 });
    await fund(b.adminA.id, 5000);
    await payShare(b.adminA.id, b.match.id);
    await setReady(b.adminA.id, b.match.id, true);
    expect((await participant(b.match.id, b.adminA.id)).paidCents).toBe(1375);
  });

  it("wieder bereit nach Zurücknehmen kostet nicht doppelt", async () => {
    const m = await makeMatch({ legacy: true });
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
    const m = await makeMatch({ legacy: true, durationMin: 75, priceCents: null, costCents: null });
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
    const m = await makeMatch({ legacy: true, hoursAhead: 72 });
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
    const m = await makeMatch({ legacy: true, hoursAhead: 10 });
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
    const m = await makeMatch({ legacy: true, hoursAhead: 5 });
    const p = await addPlayer(m.match.id, m.home.id);
    await fund(p.id, 2000);
    await payShare(p.id, m.match.id);
    await setReady(p.id, m.match.id, true);
    await removeParticipant(m.adminA.id, m.match.id, p.id);
    expect(await walletBalance(db, p.id)).toBe(2000);
  });

  it("Absage: alle bekommen alles zurück, auch wer kurz vorher ausgestiegen war, Buchung wird zurückgezogen", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 10 });
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

  it("AC-9: Altspiel (legacy_share_model) rechnet mit Reservierung und Mindestzahl, Neuspiel mit Spielerzahl; neue Spiele sind standardmäßig neu", async () => {
    const oldGame = await makeMatch({ legacy: true, priceCents: 8000, costCents: 8000 });
    const newGame = await makeMatch({ priceCents: 8000, costCents: 8000 });
    expect(oldGame.match.legacyShareModel).toBe(true);
    expect(newGame.match.legacyShareModel).toBe(false);
    for (const g of [oldGame, newGame]) {
      const all = await seat(g, 10);
      await payShare(all[0].id, g.match.id);
    }
    expect(await paid(oldGame.match.id, oldGame.adminA.id)).toBe(1000); // 8000 ÷ 8 (Reservierung)
    expect(await paid(newGame.match.id, newGame.adminA.id)).toBe(800); // 8000 ÷ 10
    // Altspiel wird beim Abrechnen weiter nach altem Modell berechnet: zwei Zahler, Mindestzahl 8
    const payers = [oldGame.adminB];
    for (const p of payers) await payShare(p.id, oldGame.match.id);
    await db.update(matches).set({ status: "confirmed" }).where(eq(matches.id, oldGame.match.id));
    expect(await settleMatch(db as never, await reloadMatch(oldGame.match.id))).toBe(true);
    expect((await reloadMatch(oldGame.match.id)).finalShareCents).toBe(1000); // zwei Zahler, Mindestzahl 8: 8000 ÷ 8
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
