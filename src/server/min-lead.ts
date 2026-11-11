import { hasMinLead } from "@/lib/deadlines";
import { DomainError } from "./teams";

/** Zentrale Prüfung des Mindestvorlaufs (Vertrag 008 AC-13): Ein Termin unter einer Stunde in der Zukunft wird abgewiesen, in jedem Modus. */
export function assertMinLead(startsAt: Date, now: Date = new Date()): void {
  if (Number.isNaN(startsAt.getTime()) || !hasMinLead(startsAt, now)) throw new DomainError("Der Termin muss mindestens eine Stunde in der Zukunft liegen.");
}
