import type { CardStatus } from "@/db/schema";

/**
 * Wer darf den Kartenstatus eines Platzes sehen (Vertrag 012, AC-12 und AC-20)? Reine Funktion, wird auf dem SERVER aufgerufen;
 * der Seite und dem Client wird nur das Ergebnis übergeben, nie der Rohstatus oder der Fehlercode.
 *  - self: der Betroffene selbst, manager: Captain/Veranstalter (Admin des Teams) oder Plattform-Admin: echter Status, bei failed der Grund.
 *  - member: angemeldeter Mitspieler: failed und none sind eine einzige neutrale rote Ampel "Zahlung ausstehend", ohne Grund.
 *  - guest: nicht angemeldet oder kein Teilnehmer: nichts je Person.
 */
export type Audience = "self" | "manager" | "member" | "guest";
export type CardDisplay = { status: CardStatus | "open"; reason: string | null };

export function cardDisplayFor(audience: Audience, status: CardStatus, failureCode: string | null): CardDisplay | null {
  switch (audience) {
    case "guest":
      return null;
    case "self":
    case "manager":
      return { status, reason: status === "failed" ? (failureCode ?? "unknown") : null };
    case "member":
      return status === "failed" || status === "none" ? { status: "open", reason: null } : { status, reason: null };
    default:
      return audience satisfies never;
  }
}

/**
 * Wer ist der Betrachter zu einem Platz? Eine einzige reine Funktion (Seite und Tests nutzen sie gemeinsam).
 * ZWEI Begriffe von "Gast", nicht verwechseln (Entscheid t9, Produktfrage 3):
 *  - Für NAMEN, Elo und Position gilt: Gast = nicht angemeldet (!userId). Angemeldete sehen Namen auch ohne Teilnahme.
 *  - Für den ZAHLSTATUS je Person gilt: Gast = keine Teilnahme (und kein Captain/Veranstalter/Admin). Nur Teilnehmer, Manager und der Betroffene sehen ihn.
 * Manager = Plattform-Admin oder Admin (Captain/Veranstalter) des Teams, dem der Platz gehört.
 */
export type CardViewer = { userId: string | null; platformAdmin: boolean; adminOf: readonly string[]; isParticipant: boolean };

export function audienceFor(viewer: CardViewer, person: { userId: string; teamId: string | null }): Audience {
  if (!viewer.userId) return "guest";
  if (person.userId === viewer.userId) return "self";
  if (viewer.platformAdmin || (person.teamId !== null && viewer.adminOf.includes(person.teamId))) return "manager";
  return viewer.isParticipant ? "member" : "guest";
}

/** Sieht der Betrachter überhaupt Ampeln/Legende (irgendeine Person)? Gleiche Regel wie audienceFor, ohne Bezug auf eine Person. */
export function canSeeAnyStatus(viewer: CardViewer): boolean {
  return Boolean(viewer.userId && (viewer.isParticipant || viewer.platformAdmin || viewer.adminOf.length > 0));
}
