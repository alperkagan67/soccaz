import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, teamMembers } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { fixDeadline } from "@/lib/deadlines";
import { creditWallet, trialBalance, walletBalance } from "@/server/ledger";
import { finalConfirm, joinLobby, leaveLobby, payShare, removeParticipant, setReady } from "@/server/lobby";
import { closeLobbiesAtDeadline } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { cardModeActive, teamShareNow } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch } from "./helpers";

beforeAll(async () => {
  await setSetting(null, "payments_enabled", true);
});
beforeEach(async () => {
  await setSetting(null, "card_payments_enabled", true);
});
afterAll(async () => {
  await setSetting(null, "card_payments_enabled", false);
  await setSetting(null, "payments_enabled", false);
  await cleanup();
});

const fund = (userId: string, cents: number) => creditWallet(db, userId, { from: "clearing", amountCents: cents, kind: "topup", idempotencyKey: `cl-${Math.random().toString(36).slice(2)}` });
const seat = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const giveCard = (matchId: string, userId: string) => db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
const ledgerOf = (matchId: string, userIds: string[]) =>
  db.select().from(ledgerEntries).where(or(eq(ledgerEntries.matchId, matchId), inArray(ledgerEntries.debitUserId, userIds), inArray(ledgerEntries.creditUserId, userIds)));

/** Teamspiel (neues Modell), Preis 80 EUR, `n` Spieler, alle mit 30 EUR Guthaben (um zu beweisen, dass es unangetastet bleibt). */
async function game(startsInH = 72, n = 10, priceCents = 8000) {
  const m = await makeMatch({ hoursAhead: startsInH, priceCents, costCents: priceCents });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
  for (const p of all) await fund(p.id, 3000);
  return { ...m, all, ids: all.map((p) => p.id) };
}
type Game = Awaited<ReturnType<typeof game>>;
const cardsAll = async (g: Game) => {
  for (const p of g.all) await giveCard(g.match.id, p.id);
};
const readyAll = async (g: Game) => {
  for (const p of g.all) await setReady(p.id, g.match.id, true);
};
const bothCaptains = async (g: Game) => {
  await finalConfirm(g.adminA.id, g.match.id);
  await finalConfirm(g.adminB.id, g.match.id);
};

describe("EIN: AC-2 Bereit nur mit Karte", () => {
  it("ohne Karte wird Bereit abgelehnt (nichts gesetzt), mit Karte gelingt es; kein Guthaben nötig, nichts gebucht", async () => {
    const g = await game();
    await expect(setReady(g.adminA.id, g.match.id, true)).rejects.toThrow(/Karte/);
    expect((await seat(g.match.id, g.adminA.id)).readyAt).toBeNull();

    await giveCard(g.match.id, g.adminA.id);
    await setReady(g.adminA.id, g.match.id, true);
    const s = await seat(g.match.id, g.adminA.id);
    expect(s.readyAt).not.toBeNull();
    expect(s.paidCents).toBe(0);
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect(await walletBalance(db, g.adminA.id)).toBe(3000);
  });

  it("Guthaben hilft im Kartenmodell nicht: wer Guthaben, aber keine Karte hat, ist nicht bereit", async () => {
    const g = await game();
    await expect(setReady(g.adminB.id, g.match.id, true)).rejects.toThrow(/Karte/);
  });

  it("Bezahlen vom Guthaben (payShare) ist im Kartenmodell nicht möglich, nichts wird gebucht", async () => {
    const g = await game();
    await expect(payShare(g.adminA.id, g.match.id)).rejects.toThrow(/Karte/);
    expect((await seat(g.match.id, g.adminA.id)).paidCents).toBe(0);
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect(await walletBalance(db, g.adminA.id)).toBe(3000);
  });

  it("Bereit zurücknehmen geht immer; kostenloses Spiel (0 EUR) braucht keine Karte", async () => {
    const g = await game();
    await giveCard(g.match.id, g.adminA.id);
    await setReady(g.adminA.id, g.match.id, true);
    await setReady(g.adminA.id, g.match.id, false);
    expect((await seat(g.match.id, g.adminA.id)).readyAt).toBeNull();
    const free = await game(72, 4, 0);
    await setReady(free.adminA.id, free.match.id, true);
    expect((await seat(free.match.id, free.adminA.id)).readyAt).not.toBeNull();
  });

  it("Captain-Bereit (finalConfirm): nur wenn alle im Team bereit sind und eine Karte haben", async () => {
    const g = await game();
    await cardsAll(g);
    await readyAll(g);
    // ein Spieler im Heimteam verliert die Karte (z. B. Karte entfernt): das Team ist nicht komplett
    const victim = g.all.find((p) => p.id !== g.adminA.id && p.id !== g.adminB.id)!;
    const victimTeamAdmin = (await seat(g.match.id, victim.id)).teamId === g.home.id ? g.adminA : g.adminB;
    await db.update(matchParticipants).set({ cardStatus: "none" }).where(and(eq(matchParticipants.matchId, g.match.id), eq(matchParticipants.userId, victim.id)));
    await expect(finalConfirm(victimTeamAdmin.id, g.match.id)).rejects.toThrow(/Karte/);
    expect((await reloadMatch(g.match.id)).homeFinalAt).toBeNull();
    expect((await reloadMatch(g.match.id)).awayFinalAt).toBeNull();

    await giveCard(g.match.id, victim.id);
    await finalConfirm(victimTeamAdmin.id, g.match.id);
    const m = await reloadMatch(g.match.id);
    expect(victimTeamAdmin.id === g.adminA.id ? m.homeFinalAt : m.awayFinalAt).not.toBeNull();
  });
});

describe("EIN: AC-3 Spielerzahl ändert sich, keine Geldbewegung", () => {
  it("Austritt und Rauswurf vor dem Fixieren: Anteil neu berechnet, Bereit beider Teams zurückgesetzt, kein Ledger-Eintrag, keine Erstattung", async () => {
    const g = await game();
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g);
    let m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBe(800); // 80 EUR / 10, nur festgeschrieben
    expect(m.homeFinalAt && m.awayFinalAt).toBeTruthy();
    const base = (await ledgerOf(g.match.id, g.ids)).length;

    const leaver = g.all[5];
    await leaveLobby(leaver.id, g.match.id);
    m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBeNull(); // Festschreibung aufgehoben
    expect(m.homeFinalAt).toBeNull();
    expect(m.awayFinalAt).toBeNull();
    expect(await teamShareNow(db, m, 8000)).toBe(889); // 80 EUR / 9, aufgerundet
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(base); // keine Gutschrift, keine Nachforderung
    expect(await walletBalance(db, leaver.id)).toBe(3000);

    const kicked = g.all[7];
    await removeParticipant(g.adminA.id === (await seat(g.match.id, kicked.id)).teamId ? g.adminA.id : (await seat(g.match.id, kicked.id)).teamId === g.home.id ? g.adminA.id : g.adminB.id, g.match.id, kicked.id);
    expect(await teamShareNow(db, await reloadMatch(g.match.id), 8000)).toBe(1000); // 80 EUR / 8
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(base);
    expect((await trialBalance()).balanced).toBe(true);
  });

  it("Beitritt vor dem Fixieren: Anteil sinkt, Bereit beider Teams zurückgesetzt, keine Buchung", async () => {
    const g = await game(72, 8);
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1000);
    const base = (await ledgerOf(g.match.id, g.ids)).length;
    const extra = await makeUser("kartejoin");
    await db.insert(teamMembers).values({ teamId: g.home.id, userId: extra.id, role: "player" });
    await joinLobby(extra.id, g.match.id);
    const m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBeNull();
    expect(m.homeFinalAt).toBeNull();
    expect(await teamShareNow(db, m, 8000)).toBe(889);
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(base);
    expect((await seat(g.match.id, extra.id)).cardStatus).toBe("none"); // neuer Platz: erst Karte, dann Bereit
  });

  it("selbst wenn ein Platz noch einen Altbetrag (paid_cents) trägt, wird bei Austritt und Zahlenänderung nichts erstattet oder nachgefordert", async () => {
    const g = await game(72, 8);
    const [stays, leaves] = [g.all[2], g.all[5]];
    await db.update(matchParticipants).set({ paidCents: 2000 }).where(and(eq(matchParticipants.matchId, g.match.id), inArray(matchParticipants.userId, [stays.id, leaves.id])));
    const before = (await ledgerOf(g.match.id, g.ids)).length;
    await leaveLobby(leaves.id, g.match.id); // Zahl ändert sich: im AUS-Modus gäbe es Erstattung/Nachforderung
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(before);
    expect((await seat(g.match.id, stays.id)).paidCents).toBe(2000);
    expect(await walletBalance(db, leaves.id)).toBe(3000);
  });

  it("Spielerzahl-Änderung ohne bezahlte Plätze erzeugt in keinem Fall Ledger-Einträge (mehrere Änderungen hintereinander)", async () => {
    const g = await game(72, 10);
    const before = (await ledgerOf(g.match.id, g.ids)).length;
    for (const p of [g.all[4], g.all[6], g.all[8]]) await leaveLobby(p.id, g.match.id);
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(before);
  });
});

describe("EIN: Fixieren und Frist in M1 (nur Status, kein Geld)", () => {
  it("zweites Bereit bei langem Vorlauf: nur Preis und Spielerzahl festgeschrieben, keine Abbuchung, nichts gebucht", async () => {
    const g = await game(72);
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g);
    const m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBe(800);
    expect(m.settledAt).toBeNull();
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect((await seat(g.match.id, g.adminA.id)).paidCents).toBe(0);
  });

  it("kurzer Vorlauf (Sofortbuchung des Guthabenmodells): die Bestätigung gelingt, es wird aber nicht gebucht (Abbuchung kommt mit M2)", async () => {
    const g = await game(30);
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g); // im AUS-Modus würde hier gebucht oder abgelehnt
    const m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBe(800);
    expect(m.settledAt).toBeNull();
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
  });

  it("Frist: der Job (unverändert) bucht im Kartenmodell nichts ab; ein Spiel, das nicht gebucht werden kann, wird abgesagt, nur Status, kein Geld, Hauptbuch ausgeglichen", async () => {
    const g = await game(72);
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g);
    const start = (await reloadMatch(g.match.id)).startsAt;
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    const m = await reloadMatch(g.match.id);
    expect(m.settledAt).toBeNull(); // nichts abgerechnet
    expect(m.status).toBe("cancelled"); // M1: ohne Abbuchung gilt das Spiel zur Frist als nicht gebucht (M2 ersetzt das)
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
    for (const p of g.all) expect(await walletBalance(db, p.id)).toBe(3000);
  });
});

describe("Schalter und Rückwärtsverträglichkeit", () => {
  it("cardModeActive: nur bei eingeschaltetem Schalter und nur für Spiele der Frist-Regel (nicht für Altspiele)", async () => {
    const g = await game(72, 4);
    const legacy = await makeMatch({ legacy: true });
    expect(await cardModeActive(db, g.match)).toBe(true);
    expect(await cardModeActive(db, await reloadMatch(legacy.match.id))).toBe(false);
    await setSetting(null, "card_payments_enabled", false);
    expect(await cardModeActive(db, g.match)).toBe(false);
  });

  it("AUS (Standard): Bereit braucht Bezahlung vom Guthaben wie bisher, Karte spielt keine Rolle; payShare bucht", async () => {
    await setSetting(null, "card_payments_enabled", false);
    const g = await game(72, 4);
    await giveCard(g.match.id, g.adminA.id); // Karte allein reicht im AUS-Modus nicht
    await expect(setReady(g.adminA.id, g.match.id, true)).rejects.toThrow(/zahle zuerst/);
    await payShare(g.adminA.id, g.match.id);
    await setReady(g.adminA.id, g.match.id, true);
    const s = await seat(g.match.id, g.adminA.id);
    expect(s.paidCents).toBe(2000); // 80 EUR / 4
    expect(await walletBalance(db, g.adminA.id)).toBe(1000);
  });

  it("AUS: Spielerzahl-Änderung erstattet wie bisher (Differenz zurück aufs Guthaben)", async () => {
    await setSetting(null, "card_payments_enabled", false);
    const g = await game(72, 6);
    await payShare(g.adminA.id, g.match.id); // 80 EUR / 6 = 13,34
    expect((await seat(g.match.id, g.adminA.id)).paidCents).toBe(1334);
    await joinLobbyExtra(g); // 7 Spieler: 11,43
    expect((await seat(g.match.id, g.adminA.id)).paidCents).toBe(1143);
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.kind === "refund")).toHaveLength(1);
    expect(await walletBalance(db, g.adminA.id)).toBe(3000 - 1143);
  });

  it("Altspiel bleibt auch bei eingeschaltetem Kartenmodell beim Guthaben (Reservierung, bezahlt vor Bereit)", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72 });
    await fund(m.adminA.id, 3000);
    await expect(setReady(m.adminA.id, m.match.id, true)).rejects.toThrow(/zahle zuerst/);
    await payShare(m.adminA.id, m.match.id);
    await setReady(m.adminA.id, m.match.id, true);
    expect((await seat(m.match.id, m.adminA.id)).paidCents).toBeGreaterThan(0);
  });
});

async function joinLobbyExtra(g: Game) {
  const extra = await makeUser("kartejoin2");
  await db.insert(teamMembers).values({ teamId: g.home.id, userId: extra.id, role: "player" });
  await joinLobby(extra.id, g.match.id);
}

