// Kontext einer Kartenabbuchung (012 M5-2b): gehoert die Zeile zu einem Spiel (Teamspiel/Privatspiel) oder zu einem Turnier?
// Seit der XOR-Pruefung am Schema (Migration 0047) ist genau eines von beiden gesetzt. Dieses Modul LIEST nur: kein Teamspiel-Pfad schreibt tournament_id (Test in
// tests/integration/tournament-schema.test.ts). Die Spiel-Pfade rufen matchIdOf(): eine Turnier-Zeile darf dort nie ankommen und wirft, statt still falsch zu laufen.

export type ChargeScope = { kind: "match"; matchId: string } | { kind: "tournament"; tournamentId: string };

export function scopeOf(row: { matchId: string | null; tournamentId: string | null }): ChargeScope {
  if (row.matchId !== null && row.tournamentId === null) return { kind: "match", matchId: row.matchId };
  if (row.tournamentId !== null && row.matchId === null) return { kind: "tournament", tournamentId: row.tournamentId };
  throw new Error("charge_scope_invalid"); // beide oder keines gesetzt: verletzt die XOR-Regel
}

/** Fuer die Spiel-Pfade: die Spiel-ID der Zeile. Eine Turnier-Zeile (match_id leer) darf hier nicht ankommen. */
export function matchIdOf(row: { matchId: string | null }): string {
  if (row.matchId === null) throw new Error("charge_not_match_scoped");
  return row.matchId;
}
