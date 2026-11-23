// Vertrag 013 v3, AC-17 und AC-19: Spieler- und Teamkarte. Die SICHTBARKEIT wird hier auf dem Server entschieden: die Komponenten bekommen nur das gefilterte Objekt,
// ein verbotenes Feld steht nie im HTML/RSC-Payload (Muster cardDisplayFor in card-visibility.ts). Reine Funktionen ohne Datenbankzugriff.
//
// Matrix (Karte): Gast (nicht angemeldet) = Initialen + Teamfarbe, KEIN Name, keine Wertung, keine Position (neutrale Karte).
// Angemeldet (Mitspieler, Teamkamerad, fremder Nutzer, Captain/Admin, Plattform-Admin) = Name, Wertung, Stufe, Position.
// Hallenbetreiber (angemeldet, ohne Admin-Recht am Team) = namenfrei: Wertung, Stufe, Position, aber weder Name noch Initialen (Initialen wären ein Teil des Namens).
// Der Kartenstatus (Zahlung) gehört NICHT auf die Karte: dafür gilt die getrennte Matrix in card-visibility.ts.
import { TEAM_COLORS, textOn } from "./color";
import { effectiveColorKey } from "./team-color";

/** Wertung und Stufe kommen aus rating.ts (w2); hier eingespritzt, damit dieses Modul nicht von der Reihenfolge der PRs abhängt. */
export type RatingApi = { ratingFromElo: (elo: number) => number; tierFor: (rating: number) => string };

export type CardViewer = { userId: string | null; hallOperator?: boolean };
export type CardPerson = { name: string; elo: number; position: string | null; teamColor: string | null; teamSlug: string };

export type PlayerCardData =
  | { kind: "neutral"; initials: string; colorKey: string }
  | { kind: "full"; initials: string; name: string; rating: number; tier: string; position: string | null; colorKey: string }
  | { kind: "nameless"; rating: number; tier: string; position: string | null; colorKey: string };

/** Initialen aus dem Namen: erste Buchstaben der ersten zwei Wörter, groß; ohne Namen ein Fragezeichen. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => Array.from(p)[0].toUpperCase()).join("");
}

/** Das Datenobjekt der Spielerkarte für diesen Betrachter. Gast: neutral; Hallenbetreiber: namenlos; sonst voll. */
export function playerCardFor(viewer: CardViewer, person: CardPerson, rating: RatingApi): PlayerCardData {
  const colorKey = effectiveColorKey(person.teamColor, person.teamSlug);
  if (!viewer.userId) return { kind: "neutral", initials: initialsOf(person.name), colorKey };
  const r = rating.ratingFromElo(person.elo);
  const tier = rating.tierFor(r);
  if (viewer.hallOperator) return { kind: "nameless", rating: r, tier, position: person.position, colorKey };
  return { kind: "full", initials: initialsOf(person.name), name: person.name, rating: r, tier, position: person.position, colorKey };
}

export type TeamCardData = { name: string; initials: string; colorKey: string; hex: string; textColor: string; teamRating: number | null; members: number };

/**
 * Teamkarte: Trikotfarbe als Fläche mit automatischer Textfarbe (AC-19), Wappen-Platzhalter aus Initialen, Teamwertung = Durchschnitt der Mitglieder-Wertungen (nur eine Zahl).
 * Annahme (Matrix "Team-Elo für alle"): die Teamwertung sehen auch Gäste; die Einzelwertungen der Mitglieder nie.
 */
export function teamCardFor(team: { name: string; slug: string; color: string | null; memberElos: readonly number[] }, rating: RatingApi): TeamCardData {
  const colorKey = effectiveColorKey(team.color, team.slug);
  const hex = TEAM_COLORS.find((c) => c.key === colorKey)!.hex;
  const ratings = team.memberElos.map((e) => rating.ratingFromElo(e));
  const teamRating = ratings.length === 0 ? null : Math.round(ratings.reduce((s, x) => s + x, 0) / ratings.length);
  return { name: team.name, initials: initialsOf(team.name), colorKey, hex, textColor: textOn(hex), teamRating, members: ratings.length };
}
