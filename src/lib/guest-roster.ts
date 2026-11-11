/** Initialen für Gäste: höchstens zwei Buchstaben, z. B. "Max Muster" -> "MM". Der Name selbst verlässt den Server nicht. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0])[0] ?? "?";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] ?? "") : "";
  return (first + last).toLocaleUpperCase("de-DE");
}

/** Gast-Ansicht eines Kaders: Anzahl und Initialen, keine Namen, Positionen, Elo oder Spieler-IDs. */
export function guestRosterView(roster: { name: string }[]): { count: number; initials: string[] } {
  return { count: roster.length, initials: roster.map((m) => initialsOf(m.name)) };
}
