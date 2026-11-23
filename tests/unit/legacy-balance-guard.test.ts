import { describe, expect, it } from "vitest";
import { evaluateGuard, GUARD_FAIL_MESSAGE, historyInfo, type GuardFindings } from "../../scripts/lib/legacy-balance-guard";

// Salden-Guard (012 M6b 1c-ii-b): ok NUR, wenn alles 0 ist; jede einzelne Abweichung blockiert und steht mit Zahlen (ohne Personendaten) in der Meldung.
const ZERO: GuardFindings = { walletUsers: 0, walletNetCents: 0, matchPaidRows: 0, matchPaidCents: 0, tournamentPaidRows: 0, tournamentPaidCents: 0, pendingRefundRows: 0, pendingRefundCents: 0, legacyGames: 0, legacyManual: 0, walletUnassignedCents: 0, paymentsPending: 0, paymentsUnbooked: 0, matchPaidHistRows: 0, tournamentPaidHistRows: 0 };

describe("evaluateGuard", () => {
  it("alles 0: erfuellt, keine Zeilen", () => {
    expect(evaluateGuard(ZERO)).toEqual({ ok: true, lines: [] });
  });

  const cases: [string, Partial<GuardFindings>, RegExp][] = [
    ["Guthaben-Saldo", { walletUsers: 1, walletNetCents: 500 }, /Guthaben-Salden: 1 Nutzer.*500 Cent/],
    ["Guthaben-Saldo mit Summe 0 aber Nutzer != 0", { walletUsers: 2 }, /Guthaben-Salden: 2 Nutzer/],
    ["paid_cents im Spiel", { matchPaidRows: 1, matchPaidCents: 300 }, /Spielpl.tze.*1 Pl.tze, 300 Cent/],
    ["paid_cents im Turnier", { tournamentPaidRows: 2, tournamentPaidCents: 2000 }, /Turnierpl.tze.*2 Pl.tze, 2000 Cent/],
    ["pending_refunds", { pendingRefundRows: 1, pendingRefundCents: 100 }, /pending_refunds.*1 Zeilen, 100 Cent/],
    ["Buchungen ohne Nutzerbezug", { walletUnassignedCents: -40 }, /ohne Nutzerbezug: -40 Cent/],
    ["alte Aufladung pending", { paymentsPending: 3 }, /pending \(payments\): 3/],
    ["erfolgreiche Aufladung ohne Hauptbucheintrag", { paymentsUnbooked: 1 }, /ohne Hauptbucheintrag \(payments\): 1/],
    ["offenes Altspiel schliessbar", { legacyGames: 1 }, /Altspiele.*1 schlie.bar, 0 manuell/],
    ["offenes Altspiel manuell", { legacyManual: 1 }, /Altspiele.*0 schlie.bar, 1 manuell/],
  ];
  for (const [name, over, re] of cases) {
    it(`${name}: nicht erfuellt, genau eine Zeile mit Zahlen`, () => {
      const r = evaluateGuard({ ...ZERO, ...over });
      expect(r.ok).toBe(false);
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatch(re);
    });
  }

  it("historische Zeilen (abgerechnete/abgesagte Spiele, beendete Turniere) sind nur Information: Ausgang bleibt erfuellt", () => {
    const f = { ...ZERO, matchPaidHistRows: 4, tournamentPaidHistRows: 2 };
    expect(evaluateGuard(f)).toEqual({ ok: true, lines: [] });
    expect(historyInfo(f)).toMatch(/4 in abgeschlossenen Spielen, 2 in beendeten Turnieren/);
    expect(historyInfo(ZERO)).toBeNull();
  });

  it("mehrere Befunde: eine Zeile je Befund; die Fehlermeldung nennt die fehlende Loeschung", () => {
    const r = evaluateGuard({ ...ZERO, walletUsers: 1, walletNetCents: 1, pendingRefundRows: 1, pendingRefundCents: 1 });
    expect(r.ok).toBe(false);
    expect(r.lines).toHaveLength(2);
    expect(GUARD_FAIL_MESSAGE).toMatch(/KEINE L.schung/);
  });
});
