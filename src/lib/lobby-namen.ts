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
