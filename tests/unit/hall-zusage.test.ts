import { describe, expect, it } from "vitest";
import { hallZusageOk } from "@/server/tournament-venue";

// 012 M5-1: Wahrheitstabelle der Zusage-Schnittstelle (Plan 3.6). M5-7a: fail-closed bei NULL-Snapshot.
// AC-5-Aenderung (Bestandstest, EINE Zeile): "noch nicht eingefroren (null), keine Zusage" erwartete bisher true (fail-open, nur mit der Attrappe vertretbar, G24-012, R-T207b);
// jetzt false: ein Turnier darf nicht mit NULL-Snapshot in "payment"/"bereit" durchrutschen. Keine Abschwaechung: die uebrigen vier Zeilen sind unveraendert, eine Zeile kam hinzu.
describe("hallZusageOk", () => {
  const at = new Date();
  it.each([
    ["kein Zugang noetig, keine Zusage", false, null, true],
    ["kein Zugang noetig, Zusage da", false, at, true],
    ["Zugang noetig, Zusage fehlt", true, null, false],
    ["Zugang noetig, Zusage da", true, at, true],
    ["noch nicht eingefroren (null), keine Zusage: fail-closed", null, null, false],
    ["noch nicht eingefroren (null), Zusage da: trotzdem fail-closed", null, at, false],
  ] as const)("%s", (_name, required, confirmed, ok) => {
    expect(hallZusageOk({ venueAccessRequiredSnapshot: required, venueConfirmedAt: confirmed })).toBe(ok);
  });
});
