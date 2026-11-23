import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants } from "@/db/schema";
import { trialBalance, walletBalance } from "@/server/ledger";
import { setReady } from "@/server/lobby";
import { cleanup, makeMatch } from "./helpers";

// 012 M6b Kartenfixture Paket 3: Die Guthaben-Tests des "neuen Guthabenmodells" (Preis ÷ Spieler mit Reservierung/Abrechnung über payShare, settleMatch, fund) entfallen mit dem Guthabenpfad.
// Zuordnung (AC-5) der entfernten Tests zu den Karten-Gegenstücken:
//  - "AC-1 Betrag = Preis ÷ eingeteilte Spieler, kein Deckel 12, min_paid_players ohne Wirkung" und "wenige Spieler: mindestens ÷ 4"
//      -> card-lobby.test.ts "EIN: Anteil und Fixierung ... Anteil = Preis ÷ eingeteilte Spieler" (echter Fixierpfad; Mutation Mindestzahl 8 -> rot)
//  - "AC-3 zweites Bereit fixiert, auch bei parallelen Aufrufen" -> card-lobby "das zweite Bereit fixiert genau einmal, auch bei parallelen Bestätigungen" und "zweites Bereit bei langem Vorlauf"
//  - "Abrechnung: Differenz zurück; Einnahmen genau der Preis" und "Abrechnung rechnet nie ab, solange die Summe den Preis nicht deckt"
//      -> card-run.test.ts "jeder eingeteilte Spieler wird genau einmal mit dem fixierten Anteil belastet", "die Summe der Abbuchungen deckt die Miete (Rundung)", "zu wenig eingeteilte Spieler für die Miete"
//  - "AC-2 Spielerzahl steigt/sinkt nach der Zahlung (Überzahlung/Nachzahlung)" -> card-lobby "Beitritt vor dem Fixieren: Anteil sinkt, Bereit zurückgesetzt, keine Buchung", "Austritt und Rauswurf vor dem Fixieren (auch nach dem zweiten Bereit): Festschreibung aufgehoben, keine Erstattung"
//  - "AC-3 jemand nicht bezahlt: Captain kann nicht bestätigen" -> card-lobby "Captain-Bereit (finalConfirm): nur wenn alle im Team bereit sind und eine Karte haben"
//  - "nach der Abrechnung ist die Liste zu" -> card-trigger.test.ts (CHARGES_LOCKED für Beitritt, Austritt, Rauswurf)
//  - "AC-4 Austritt nach dem Fixieren (> 48 h): Erstattung, Festschreibung aufgehoben" -> card-lobby "Austritt und Rauswurf vor dem Fixieren" (bestätigt zuerst beide Captains, dann Austritt: Festschreibung und Bereit weg)
//  - "ohne eingeschaltete Zahlungen wird nichts gebucht" -> unten (Gratis) sowie lobby-ready.test.ts / payments-off-free.test.ts
afterAll(cleanup);

describe("Zahlungen aus (Gratis)", () => {
  it("ohne eingeschaltete Zahlungen geht Bereit ohne Karte und es wird nichts gebucht", async () => {
    const m = await makeMatch({ priceCents: 8000, costCents: 8000 }); // Tests starten mit Zahlungen AUS (setup.ts)
    await setReady(m.adminA.id, m.match.id, true);
    expect(await walletBalance(db, m.adminA.id)).toBe(0);
    const [seat] = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, m.match.id), eq(matchParticipants.userId, m.adminA.id)));
    expect(seat.readyAt).not.toBeNull();
    expect(seat.paidCents).toBe(0);
  });
});

describe("Buchführung insgesamt", () => {
  it("Saldenprobe ausgeglichen, jede Bewegung hat eine Gegenseite", async () => {
    const tb = await trialBalance();
    expect(tb.balanced).toBe(true);
  });
});
