import { timingSafeEqual } from "node:crypto";

// Einladungslink privater Turniere (PR 3, Entscheid t2q 2026-11-27): ein privates Turnier gibt es für Fremde NUR mit dem richtigen Token. Fehlt er oder ist er falsch, ist die Antwort NEUTRAL und
// für "existiert nicht" und "falscher Token" gleich (kein Existenz-Orakel).
export const TOKEN_UNGUELTIG_TEXT = "Dieser Einladungslink ist ungültig oder abgelaufen.";
export const TOKEN_UNGUELTIG_HINWEIS = "Bitte frag den Veranstalter nach einem neuen Link.";

/** Prüft den Token zeitkonstant. Ohne erwarteten Token (null/leer) oder ohne gelieferten Token ist er nie gültig. */
export function tokenGueltig(erwartet: string | null | undefined, geliefert: unknown): boolean {
  if (typeof erwartet !== "string" || erwartet === "" || typeof geliefert !== "string" || geliefert === "") return false;
  const a = Buffer.from(erwartet);
  const b = Buffer.from(geliefert);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
