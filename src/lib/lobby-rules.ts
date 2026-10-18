// Spielregeln der Lobby: 5 gegen 5 plus 1 Ersatz je Team.
export const STARTERS_PER_TEAM = 5;
export const MAX_PER_TEAM = 6; // 5 Startspieler + 1 Ersatz
export const MIN_READY_PER_TEAM = 4; // darunter ist kein 5-gegen-5 sinnvoll, Mindestanzahl gesamt: 8
export const MAX_PENDING_STRANGERS = 4;

export const MIN_READY_TOTAL = MIN_READY_PER_TEAM * 2;

/** Ein Spiel ist bestätigt, wenn beide Teams genug bereite Spieler haben. */
export function isConfirmable(readyHome: number, readyAway: number): boolean {
  return readyHome >= MIN_READY_PER_TEAM && readyAway >= MIN_READY_PER_TEAM;
}

/** Ersatz ist, wer von außen kam oder nach den ersten fünf Spielern des Teams beigetreten ist. */
export function isSubstituteByRank(rankInTeam: number, fromOutside: boolean): boolean {
  return fromOutside || rankInTeam >= STARTERS_PER_TEAM;
}

export function hasFreeSlot(currentInTeam: number): boolean {
  return currentInTeam < MAX_PER_TEAM;
}

/** Verbleibende Zeit bis zum Anstoß als lesbarer Text. */
export function countdownText(msLeft: number): string {
  if (msLeft <= 0) return "Anstoß erreicht";
  const minutes = Math.floor(msLeft / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days} ${days === 1 ? "Tag" : "Tagen"} ${hours} Std`;
  if (hours > 0) return `in ${hours} Std ${mins} Min`;
  return `in ${mins} Min`;
}
