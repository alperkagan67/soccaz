import type { BoardEntry, BoardPlayer } from "@/server/board";
import { initialsOf } from "@/lib/guest-roster";

/**
 * Offene Lobbys, Suchen und laufende Spiele für Gäste (nicht angemeldet), Vertrag 013 Sichtbarkeitsmatrix und Vertrag 012 AC-12: nur Zahlen und
 * Initialen, KEIN Status je Person. Der Server ersetzt die Kader VOR dem Rendern, damit weder Namen noch Spieler-IDs, Positionen, Elo noch die
 * Ampel je Person im HTML oder in den RSC-Props des Browsers landen.
 */
const guestPlayers = (players: BoardPlayer[]): BoardPlayer[] => players.map((p, i) => ({ userId: `g${i}`, name: initialsOf(p.name), light: null, isSubstitute: false, isPro: false }));

export function guestBoardEntries(entries: BoardEntry[]): BoardEntry[] {
  return entries.map((e) =>
    e.kind === "search"
      ? { ...e, roster: e.roster.map((p, i) => ({ userId: `g${i}`, name: initialsOf(p.name), position: null, elo: null, isAdmin: false })) }
      : { ...e, homePlayers: guestPlayers(e.homePlayers), awayPlayers: guestPlayers(e.awayPlayers) },
  );
}
