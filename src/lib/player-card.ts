// Vertrag 013 v3, AC-17 und AC-19: Spieler- und Teamkarte. Die SICHTBARKEIT wird hier auf dem Server entschieden: die Komponenten bekommen nur das gefilterte Objekt,
// ein verbotenes Feld steht nie im HTML/RSC-Payload (Muster cardDisplayFor in card-visibility.ts). Reine Funktionen ohne Datenbankzugriff.
//
// Matrix (Karte): Gast (nicht angemeldet) = Initialen + Teamfarbe, KEIN Name, keine Wertung, keine Position (neutrale Karte).
// Angemeldet (Mitspieler, Teamkamerad, fremder Nutzer, Captain/Admin, Plattform-Admin) = Name, Wertung, Stufe, Position.
// Hallenbetreiber (angemeldet, ohne Admin-Recht am Team) = namenfrei: Wertung, Stufe, Position, aber weder Name noch Initialen (Initialen wären ein Teil des Namens).
// Der Kartenstatus (Zahlung) gehört NICHT auf die Karte: dafür gilt die getrennte Matrix in card-visibility.ts.
import { TEAM_COLORS, textOn } from "./color";
import { initialsOf } from "./guest-roster";
import { TIER_LABELS, ratingFromElo, tierFromRating, type Tier } from "./rating";
import { effectiveColorKey } from "./team-color";

/** Wertung und Stufe kommen aus rating.ts (w2); hier eingespritzt, damit dieses Modul nicht von der Reihenfolge der PRs abhängt. */
export type RatingApi = { ratingFromElo: (elo: number) => number; tierFor: (rating: number) => Tier };

/** Die echten Funktionen aus rating.ts (einzige Quelle der Wertung und der Stufen); Tests dürfen eine Attrappe einspritzen. */
export const RATING: RatingApi = { ratingFromElo, tierFor: tierFromRating };

/**
 * Wer schaut? Diskriminiert und OHNE Voreinstellung: der Aufrufer muss sich entscheiden (cardViewerFor liefert die Sicht aus den Rechten). Unbekannt oder fehlend = Gast (fail-closed, restriktivste Sicht).
 * "hall" = Hallenbetreiber ohne Admin-Recht am Team: namenfrei. Wer zugleich Team-Admin oder Plattform-Admin ist, ist "member" (sieht Namen, Vertrag).
 */
export type CardViewer = { kind: "guest" } | { kind: "member" } | { kind: "hall" };

/**
 * Rechte -> Sicht, ALLE Felder Pflicht (der Compiler erzwingt, dass der Aufrufer sich entscheidet). Die Funktion entscheidet bei Überlappung:
 * Mitspieler, Team-Admin und Plattform-Admin gewinnen (member, sehen Namen); nur ein reiner Hallenbetreiber ohne Teilnahme ist namenfrei (hall); sonst angemeldet = member.
 * Leere oder fehlende Kennung = Gast.
 */
export function cardViewerFor(r: { userId: string | null | undefined; hallOperator: boolean; participant: boolean; teamAdmin: boolean; platformAdmin: boolean }): CardViewer {
  if (!r || typeof r.userId !== "string" || r.userId === "") return { kind: "guest" };
  if (r.participant || r.teamAdmin || r.platformAdmin) return { kind: "member" };
  if (r.hallOperator) return { kind: "hall" };
  return { kind: "member" };
}
export type CardPerson = { name: string; elo: number; position: string | null; teamColor: string | null; teamSlug: string };

export type PlayerCardData =
  | { kind: "neutral"; initials: string; colorKey: string }
  | { kind: "full"; initials: string; name: string; rating: number; tier: Tier; position: string | null; colorKey: string }
  | { kind: "nameless"; rating: number; tier: Tier; position: string | null; colorKey: string };

/**
 * Die Wertungs-Sicht eines Kartenobjekts, oder null (fail-closed): nur "full" und "nameless" MIT endlicher Wertung und bekannter Stufe zählen (Object.hasOwn: "constructor" und "__proto__" sind keine Stufe).
 * Alles andere (leer, null, JSON ohne kind, unbekannte Art, full ohne Wertung) liefert null und wird von Karte und Zeile wie die neutrale Sicht gerendert.
 */
export function ratedCard(data: unknown): Extract<PlayerCardData, { kind: "full" | "nameless" }> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { kind?: unknown; rating?: unknown; tier?: unknown };
  if (d.kind !== "full" && d.kind !== "nameless") return null;
  if (typeof d.rating !== "number" || !Number.isFinite(d.rating)) return null;
  if (typeof d.tier !== "string" || !Object.hasOwn(TIER_LABELS, d.tier)) return null;
  return data as Extract<PlayerCardData, { kind: "full" | "nameless" }>;
}

/** Initialen: EINE Regel für Karten, Zeilen und Gast-Ansichten (guest-roster.ts, Graphem-sicher: erster und letzter Namensteil, ohne Namen ein Fragezeichen). */
export { initialsOf };

/** Das Datenobjekt der Spielerkarte für diesen Betrachter. Gast: neutral; Hallenbetreiber: namenlos; sonst voll. */
export function playerCardFor(viewer: CardViewer, person: CardPerson, rating: RatingApi = RATING): PlayerCardData {
  const colorKey = effectiveColorKey(person.teamColor, person.teamSlug);
  const kind = viewer && typeof viewer === "object" ? viewer.kind : undefined;
  if (kind !== "member" && kind !== "hall") return { kind: "neutral", initials: initialsOf(person.name), colorKey }; // Gast, unbekannt, fehlend: restriktivste Sicht
  const r = rating.ratingFromElo(person.elo);
  const tier = rating.tierFor(r);
  if (kind === "hall") return { kind: "nameless", rating: r, tier, position: person.position, colorKey };
  return { kind: "full", initials: initialsOf(person.name), name: person.name, rating: r, tier, position: person.position, colorKey };
}

/** Ab so vielen Mitgliedern gibt es eine Teamwertung; darunter wäre sie die (fast) ablesbare Einzelwertung (1 Mitglied: genau diese, 2: Mittelwert zweier Personen). */
export const TEAM_RATING_MIN_MEMBERS = 3;

export type TeamCardData = { name: string; initials: string; colorKey: string; hex: string; textColor: string; teamRating: number | null; members: number };

/**
 * Teamkarte: Trikotfarbe als Fläche mit automatischer Textfarbe (AC-19), Wappen-Platzhalter aus Initialen, Teamwertung = Durchschnitt der Mitglieder-Wertungen (nur eine Zahl).
 * Annahme (Matrix "Team-Elo für alle"): die Teamwertung sehen auch Gäste; die Einzelwertungen der Mitglieder nie, deshalb erst ab TEAM_RATING_MIN_MEMBERS Mitgliedern.
 */
export function teamCardFor(team: { name: string; slug: string; color: string | null; memberElos: readonly number[] }, rating: RatingApi = RATING): TeamCardData {
  const colorKey = effectiveColorKey(team.color, team.slug);
  const color = TEAM_COLORS.find((c) => c.key === colorKey) ?? TEAM_COLORS[0]; // effectiveColorKey liefert immer einen gültigen Schlüssel; der Rückfall verhindert trotzdem einen Absturz
  const hex = color.hex;
  const ratings = team.memberElos.map((e) => rating.ratingFromElo(e));
  const teamRating = ratings.length < TEAM_RATING_MIN_MEMBERS ? null : Math.round(ratings.reduce((s, x) => s + x, 0) / ratings.length);
  return { name: team.name, initials: initialsOf(team.name), colorKey: color.key, hex, textColor: textOn(hex), teamRating, members: ratings.length };
}
