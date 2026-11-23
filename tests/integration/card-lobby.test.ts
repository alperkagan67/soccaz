import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, teamMembers } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { fixDeadline } from "@/lib/deadlines";
import { trialBalance } from "@/server/ledger";
import { finalConfirm, joinLobby, leaveLobby, removeParticipant, setReady } from "@/server/lobby";
import { closeLobbiesAtDeadline } from "@/server/scheduled";
import { setSetting } from "@/server/settings";
import { cardModeActive, teamShareNow } from "@/server/wallet";
import { addPlayer, cleanup, makeMatch, makeUser, reloadMatch, seedShare, seedWalletBalance } from "./helpers";

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

const seat = async (matchId: string, userId: string) => (await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))))[0];
const giveCard = (matchId: string, userId: string) => db.update(matchParticipants).set({ cardStatus: "card_ready" }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId)));
const ledgerOf = (matchId: string, userIds: string[]) =>
  db.select().from(ledgerEntries).where(or(eq(ledgerEntries.matchId, matchId), inArray(ledgerEntries.debitUserId, userIds), inArray(ledgerEntries.creditUserId, userIds)));

/** Teamspiel (neues Modell), Preis 80 EUR, `n` Spieler, ohne Guthaben (Kartenmodell: es fließt erst bei der Abbuchung Geld). */
async function game(startsInH = 72, n = 10, priceCents = 8000) {
  const m = await makeMatch({ hoursAhead: startsInH, priceCents, costCents: priceCents });
  const all = [m.adminA, m.adminB];
  while (all.length < n) all.push(await addPlayer(m.match.id, all.length % 2 === 0 ? m.home.id : m.away.id));
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
  });

  it("Guthaben hilft im Kartenmodell nicht: wer Altsaldo, aber keine Karte hat, ist nicht bereit", async () => {
    const g = await game();
    await seedWalletBalance(g.adminB.id, 3000); // Altsaldo (lebt bis PR 2)
    await expect(setReady(g.adminB.id, g.match.id, true)).rejects.toThrow(/Karte/);
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

  it("Spielerzahl-Änderung ohne bezahlte Plätze erzeugt in keinem Fall Ledger-Einträge (mehrere Änderungen hintereinander)", async () => {
    const g = await game(72, 10);
    const before = (await ledgerOf(g.match.id, g.ids)).length;
    for (const p of [g.all[4], g.all[6], g.all[8]]) await leaveLobby(p.id, g.match.id);
    expect((await ledgerOf(g.match.id, g.ids)).length).toBe(before);
  });
});

// 012 M6b Kartenfixture Paket 3: Gegenstücke zu wallet.test.ts "AC-1 Betrag = Preis ÷ eingeteilte Spieler (min_paid_players ohne Wirkung)", "wenige Spieler: mindestens ÷ 4" und
// "AC-3 zweites Bereit fixiert, auch bei parallelen Aufrufen" über den ECHTEN Fixierpfad (setReady + finalConfirm) im Kartenmodell.
describe("EIN: Anteil und Fixierung (Gegenstück zum Guthaben-Neumodell)", () => {
  it("Anteil = Preis ÷ eingeteilte Spieler, aufgerundet: kein Deckel bei 12, keine Mindestzahl 8 (Einstellung min_paid_players ohne Wirkung), mindestens durch 4 geteilt", async () => {
    await setSetting(null, "min_paid_players", 12);
    try {
      const g = await game(72, 10, 12_000);
      await cardsAll(g);
      await readyAll(g);
      await bothCaptains(g);
      expect((await reloadMatch(g.match.id)).finalShareCents).toBe(1200); // Altmodell mit Mindestzahl 12 wäre 1000, mit Mindestzahl 8 wäre es 1500

      const g12 = await game(72, 12, 12_000);
      await cardsAll(g12);
      await readyAll(g12);
      await bothCaptains(g12);
      expect((await reloadMatch(g12.match.id)).finalShareCents).toBe(1000);

      const few = await game(72, 2, 8000); // 2 eingeteilt: 8000 ÷ 4
      expect(await teamShareNow(db, await reloadMatch(few.match.id), 8000)).toBe(2000);
    } finally {
      await setSetting(null, "min_paid_players", 8);
    }
  });

  it("14 Spieler im Teamspiel: Anteil = Preis ÷ 14 aufgerundet (12000 / 14 -> 858), kein Deckel bei 12", async () => {
    const g = await game(72, 14, 12_000);
    expect(await teamShareNow(db, await reloadMatch(g.match.id), 12_000)).toBe(858); // vor dem Fixieren: die laufende Neuberechnung (Deckel 12 ergäbe 1000)
    await cardsAll(g);
    await readyAll(g);
    await bothCaptains(g);
    expect((await reloadMatch(g.match.id)).finalShareCents).toBe(858); // Deckel 12 ergäbe 1000
  });

  it("das zweite Bereit fixiert genau einmal, auch bei parallelen Bestätigungen; es entsteht kein Ledger-Eintrag und niemand zahlt", async () => {
    const g = await game(72, 10, 8000);
    await cardsAll(g);
    await readyAll(g);
    await Promise.all([finalConfirm(g.adminA.id, g.match.id), finalConfirm(g.adminB.id, g.match.id), finalConfirm(g.adminA.id, g.match.id), finalConfirm(g.adminB.id, g.match.id)]);
    const m = await reloadMatch(g.match.id);
    expect(m.finalShareCents).toBe(800);
    expect(m.homeFinalAt && m.awayFinalAt).toBeTruthy();
    expect(m.settledAt).toBeNull();
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect((await seat(g.match.id, g.adminA.id)).paidCents).toBe(0);
  });
});

describe("Doppelbelastungs-Schutz: ein bezahlter Platz (paid_cents > 0, Altgeld bis PR 2) macht das Spiel zum Nicht-Kartenspiel", () => {
  const sw = (on: boolean) => setSetting(null, "card_payments_enabled", on);

  it("unbezahltes Spiel läuft im Kartenmodell; sobald dort ein Platz bezahlt wäre, gilt es nicht mehr, und wenn der letzte bezahlte Platz geht, wird es wieder Kartenmodell", async () => {
    await sw(false);
    const g = await game(72, 6);
    const payer = g.all[2];
    await seedShare(payer.id, g.match.id, 800); // bezahlter Platz (paid_cents > 0) ohne Geldweg
    await sw(true);
    expect(await cardModeActive(db, await reloadMatch(g.match.id))).toBe(false); // Doppelbelastungs-Schutz: kein Kartenspiel
    const other = await game(72, 6);
    expect(await cardModeActive(db, await reloadMatch(other.match.id))).toBe(true);
    await leaveLobby(payer.id, g.match.id); // letzter bezahlter Platz geht
    expect(await cardModeActive(db, await reloadMatch(g.match.id))).toBe(true);
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

  it("Frist: ein Kartenspiel, das nicht abbuchungsbereit ist (Captains nicht beide bereit), wird abgesagt, nur Status, kein Geld, Hauptbuch ausgeglichen", async () => {
    const g = await game(72);
    await cardsAll(g);
    await readyAll(g);
    const start = (await reloadMatch(g.match.id)).startsAt;
    await closeLobbiesAtDeadline(new Date(fixDeadline(start).getTime() + 60_000));
    const m = await reloadMatch(g.match.id);
    expect(m.settledAt).toBeNull(); // nichts abgerechnet
    expect(m.status).toBe("cancelled"); // zur Frist nicht bereit: Absage (es wurde nichts abgebucht, nichts zu erstatten)
    expect((await ledgerOf(g.match.id, g.ids)).filter((e) => e.matchId === g.match.id)).toHaveLength(0);
    expect((await trialBalance()).balanced).toBe(true);
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

  it("Altspiel ist auch bei eingeschaltetem Kartenmodell stillgelegt (1c-ii a-1): Bereit und Bestaetigen werden abgewiesen, nichts gebucht", async () => {
    const m = await makeMatch({ legacy: true, hoursAhead: 72 });
    await expect(setReady(m.adminA.id, m.match.id, true)).rejects.toThrow(/zahle zuerst/); // Bereit braucht weiter die Zahlung, die es nicht mehr gibt
    await expect(finalConfirm(m.adminA.id, m.match.id)).rejects.toThrow(/alten Zahlungsmodell/);
    expect((await seat(m.match.id, m.adminA.id)).paidCents).toBe(0);
  });
});

