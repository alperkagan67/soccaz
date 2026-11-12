// "Gast" heißt hier: nicht angemeldet (`!user`). Angemeldete sehen den vollen Kader, Gäste nur Anzahl und Initialen.

const SEGMENTER = new Intl.Segmenter("de", { granularity: "grapheme" });

/** Erstes Zeichen (Graphem) eines Wortes: Emoji, Surrogatpaare und kombinierende Zeichen bleiben zusammen. */
function firstGrapheme(word: string): string {
  return SEGMENTER.segment(word)[Symbol.iterator]().next().value?.segment ?? "";
}

/**
 * Initialen für Gäste: erster Buchstabe des ersten und des letzten Namensteils, z. B. "Max Muster" -> "MM".
 * Entscheidungen (Tests in tests/unit/guest-roster.test.ts):
 * - Ein Namensteil gibt nur eine Initiale. Ein Ein-Zeichen-Name ("X") ergibt "X"; das ist der ganze Name,
 *   aber ein einzelnes Zeichen verrät nicht mehr als jede andere Initiale, deshalb kein Sonderfall.
 * - Großschreibung nach deutschen Regeln: "ß" wird zu "SS" (zwei Buchstaben, bewusst nicht gekürzt).
 * - Leerer Name ergibt "?".
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = firstGrapheme(parts[0]);
  const last = parts.length > 1 ? firstGrapheme(parts[parts.length - 1]) : "";
  return (first + last).toLocaleUpperCase("de-DE");
}

/** Gast-Ansicht eines Kaders: Anzahl und Initialen, keine Namen, Positionen, Elo oder Spieler-IDs. */
export function guestRosterView(roster: { name: string }[]): { count: number; initials: string[] } {
  return { count: roster.length, initials: roster.map((m) => initialsOf(m.name)) };
}
