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
