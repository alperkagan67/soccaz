import { initialsOf } from "./guest-roster";
import { cardViewerFor } from "./player-card";

// 013 M3 PR 5a (AC-17, Backlog 216): was die Lobby je Betrachter von einer Person zeigt.
// Mitglied (Teilnehmer, Team-Admin, Plattform-Admin, sonst jeder Angemeldete): Name. Gast: Initialen. Reiner Hallenbetreiber (venue_access, aber weder Teilnehmer noch Team-Admin noch Plattform-Admin): namenfrei.
// Die Entscheidung trifft cardViewerFor (eine Quelle mit Teamseite und Karten); wer zugleich Teilnehmer ist, sieht wie jeder Teilnehmer.
export type LobbySicht = "guest" | "member" | "hall";

export function lobbySicht(r: { userId: string | null | undefined; hallOperator: boolean; participant: boolean; teamAdmin: boolean; platformAdmin: boolean }): LobbySicht {
  return cardViewerFor(r).kind;
}

/** Anzeigename einer Person; `index` zählt die Person in ihrer Liste (für die namenfreie Sicht). */
export function personLabel(name: string, sicht: LobbySicht, index: number): string {
  if (sicht === "member") return name;
  if (sicht === "guest") return initialsOf(name);
  return `Spieler ${index + 1}`;
}

/**
 * Autorname in öffentlichen Inhalten (Kommentare, Bewertungen; Entscheid t2q 2026-11-24, AC-17): Angemeldete sehen den Namen, Gäste UND reine Hallenbetreiber nur die Initialen (ohne Link auf /spieler).
 * Dieselbe Sicht (LobbySicht) wie die Lobby; die Lobby nennt den Betreiber "Spieler N", weil dort Plätze gezählt werden, ein Kommentar hat keinen Platz.
 */
export function autorLabel(name: string, sicht: LobbySicht): string {
  return sicht === "member" ? name : initialsOf(name);
}

/** Eine Person in einer öffentlichen Liste (AC-17): Name und Link nur für Angemeldete; sonst Initialen, kein Link und ein Listenschlüssel ohne Kennung (React-Schlüssel stehen in der RSC-Nutzlast). */
export type PersonRef = { key: string; label: string; href: string | null };

export function personRef(sicht: LobbySicht, id: string, name: string, index: number): PersonRef {
  return sicht === "member" ? { key: id, label: name, href: `/spieler/${id}` } : { key: `p${index}`, label: initialsOf(name), href: null };
}

/**
 * Veranstalter in der Einladung für Gäste (Entscheid t2q 2026-11-24): Vorname und Initiale des Nachnamens ("Alper K."), nie der Nachname. Ein einteiliger Name bleibt, wie er ist.
 * Komma-Schreibweise "Nachname, Vorname" (R-T380): der Teil vor dem Komma ist der Nachname. Bekannte Grenze (kosmetisch): "ß" am Anfang des Nachnamens wird wie in initialsOf zu "SS." (zwei Buchstaben).
 */
const teile = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export function vornameInitial(name: string): string {
  const komma = name.indexOf(",");
  if (komma >= 0) {
    const nach = teile(name.slice(0, komma));
    const vor = teile(name.slice(komma + 1));
    if (nach.length > 0 && vor.length > 0) return `${vor[0]} ${initialsOf(nach[nach.length - 1])}.`;
    name = [...nach, ...vor].join(" "); // "Kagan," oder ",Alper": kein vollständiges Paar, wie ein einteiliger Name behandeln
  }
  const parts = teile(name);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${initialsOf(parts[parts.length - 1])}.`;
}

/** Veranstalter überall (Entscheid t2q 2026-11-24): Angemeldete sehen den vollen Namen, Gäste und reine Hallenbetreiber "Vorname + Initial" ("Alper K."), nie den Nachnamen. Eine Regel für Turnier und Privatspiel-Einladung. */
export function veranstalterLabel(name: string, sicht: LobbySicht): string {
  return sicht === "member" ? name : vornameInitial(name);
}
