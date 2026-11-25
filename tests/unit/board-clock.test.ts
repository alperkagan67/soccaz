import { describe, expect, it } from "vitest";
import { blockBeendetUm } from "@/lib/board-clock";

// Tafeluhr: ein Spielblock gilt erst als beendet, wenn ALLE echten Spiele beendet sind; das Spaßspiel zählt nicht.
const spiel = (matchId: string | null, playedIso: string | null, fun = false) => ({ fun, matchId, playedIso });

describe("blockBeendetUm", () => {
  it("alle echten Spiele beendet: der Zeitpunkt des letzten Endes", () => {
    expect(blockBeendetUm([spiel("m1", "2026-12-12T13:05:00.000Z"), spiel("m2", "2026-12-12T13:09:30.000Z")])).toBe("2026-12-12T13:09:30.000Z");
  });
  it("ein Spiel noch offen oder ohne feststehendes Spiel: nicht beendet (null)", () => {
    expect(blockBeendetUm([spiel("m1", "2026-12-12T13:05:00.000Z"), spiel("m2", null)])).toBeNull();
    expect(blockBeendetUm([spiel("m1", "2026-12-12T13:05:00.000Z"), spiel(null, null)])).toBeNull();
  });
  it("das Spaßspiel (ohne Ergebnis) zählt nicht mit; ein Block nur mit Spaßspiel oder leer ist nie beendet", () => {
    expect(blockBeendetUm([spiel("m1", "2026-12-12T14:00:00.000Z"), spiel(null, null, true)])).toBe("2026-12-12T14:00:00.000Z");
    expect(blockBeendetUm([spiel(null, null, true)])).toBeNull();
    expect(blockBeendetUm([])).toBeNull();
  });
  it("ungültiges Datum: nicht beendet statt Fehler", () => {
    expect(blockBeendetUm([spiel("m1", "kein-datum")])).toBeNull();
  });
});
