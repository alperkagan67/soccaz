import { NEUNMETER_MAX_TREFFER } from "@/lib/turnier-grenzen";

// PR 1b (Oberfläche Tie-Break im K.-o.): EINE Quelle für alle Texte und Rechenregeln der Anzeige. Der Server (decideTie, PR 1a) prüft alles noch einmal; hier steht nur, was die Oberfläche zeigt.
// Kein Zahlungswort (Wortscan tests/unit/tiebreak-regeln.test.ts).

/** Regeltext im Kasten "Ablauf des Turniers" (kurz). */
export const TIEBREAK_REGEL = "Endet ein K.-o.-Spiel unentschieden, entscheidet zuerst ein Golden Goal (2 Minuten), danach Neunmeter. Den Sieger trägt der Veranstalter ein.";
export const TIEBREAK_KEINE_TORE = "Keine Tore erfasst: Das Spiel endet 0:0.";
export const TIEBREAK_ABPFIFF_HINWEIS = "Unentschieden: Nach dem Abpfiff trägst du direkt Golden Goal oder Neunmeter ein.";
export const TIEBREAK_OFFEN_GAST = "Unentschieden: Der Veranstalter trägt Golden Goal oder Neunmeter ein.";
export const TIEBREAK_FORM_TITEL = "Gleichstand: Entscheidung eintragen";
export const TIEBREAK_PFLICHT = "Bitte wähle, wie das Spiel entschieden wurde.";
export const TIEBREAK_ZAEHLER_HINWEIS = "Treffer (freiwillig, nur zur Anzeige)";
export const TIEBREAK_ZAEHLER_FEHLER = `Bitte beide Trefferzahlen angeben oder beide leer lassen (ganze Zahlen von 0 bis ${NEUNMETER_MAX_TREFFER}).`;
export const TIEBREAK_BESTAETIGEN = "Endgültig eintragen";
export const TIEBREAK_FEHLER_ALLGEMEIN = "Das hat nicht geklappt. Lade die Seite neu und prüfe den Stand, bevor du es noch einmal versuchst.";

export type TieKind = "gg" | "9m";
export type TieSide = "a" | "b";
export type TieOption = { key: string; kind: TieKind; side: TieSide; label: string };

/** Die vier Wahlmöglichkeiten (Pflichtauswahl) mit den Teamnamen. */
export function tieOptionen(nameA: string, nameB: string): TieOption[] {
  return [
    { key: "gg-a", kind: "gg", side: "a", label: `Golden Goal für ${nameA}` },
    { key: "gg-b", kind: "gg", side: "b", label: `Golden Goal für ${nameB}` },
    { key: "9m-a", kind: "9m", side: "a", label: `Neunmeter, Sieger ${nameA}` },
    { key: "9m-b", kind: "9m", side: "b", label: `Neunmeter, Sieger ${nameB}` },
  ];
}

/** Große Bestätigung im Dialog: "A 2 : 2 B → Golden Goal für A" (nach Golden Goal wird der Plan-Stand des Siegers +1 gezählt, das nennt der Dialogtext). */
export function tieFolge(nameA: string, nameB: string, score: number, option: TieOption): string {
  return `${nameA} ${score} : ${score} ${nameB} → ${option.label}`;
}

export function tieDialogText(option: TieOption): string {
  return option.kind === "gg"
    ? "Das Golden Goal zählt im Turnierplan als Tor des Siegers (der Stand steigt um 1). Die Entscheidung ist endgültig und der Sieger rückt weiter."
    : "Der Stand bleibt, der Sieger der Neunmeter rückt weiter. Die Entscheidung ist endgültig.";
}

/** Trefferzahlen aus den Eingabefeldern (beide oder keine). */
export function parseTreffer(a: string, b: string): { ok: true; counts?: { a: number; b: number } } | { ok: false; error: string } {
  const ta = a.trim();
  const tb = b.trim();
  if (ta === "" && tb === "") return { ok: true };
  if (ta === "" || tb === "") return { ok: false, error: TIEBREAK_ZAEHLER_FEHLER };
  if (!/^\d{1,3}$/.test(ta) || !/^\d{1,3}$/.test(tb)) return { ok: false, error: TIEBREAK_ZAEHLER_FEHLER };
  const na = Number(ta);
  const nb = Number(tb);
  if (na > NEUNMETER_MAX_TREFFER || nb > NEUNMETER_MAX_TREFFER) return { ok: false, error: TIEBREAK_ZAEHLER_FEHLER };
  return { ok: true, counts: { a: na, b: nb } };
}

/** Kurzmarke im Bracket und auf der Spielkarte: "n. GG" bzw. "n. 9m" (mit Trefferzahl a:b, falls gesetzt); null ohne Tie-Break. */
export function tieMarke(m: { decidedBy?: "gg" | "9m" | null; shootoutA?: number | null; shootoutB?: number | null }): string | null {
  if (m.decidedBy === "gg") return "n. GG";
  if (m.decidedBy === "9m") return m.shootoutA != null && m.shootoutB != null ? `n. 9m (${m.shootoutA}:${m.shootoutB})` : "n. 9m";
  return null;
}

/** Ein K.-o.-Spiel ist offen unentschieden (gleiche Regel wie der Server). */
export function tieOffen(m: { scoreA: number | null; scoreB: number | null; shootoutWinner?: string | null; decidedBy?: "gg" | "9m" | null }): boolean {
  return m.scoreA !== null && m.scoreA === m.scoreB && !m.shootoutWinner && !m.decidedBy;
}
