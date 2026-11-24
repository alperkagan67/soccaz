import { isPlatformAdmin } from "@/lib/roles";
import { lobbySicht, type LobbySicht } from "@/lib/lobby-namen";
import { getCurrentUser } from "./session";
import { isVenueManager } from "./venue-access-rules";

/**
 * EINE Stelle für "was darf dieser Betrachter von Personen sehen" auf öffentlichen Seiten (AC-17, Entscheid t2q 2026-11-24).
 * Die Entscheidung trifft lobbySicht/cardViewerFor (wie Lobby und Teamseite), keine zweite Regel: Gast (nicht angemeldet) = Initialen; reiner Hallenbetreiber (Zugang zu einer Halle, weder Plattform-Admin noch Teilnehmer noch Team-Admin) = namenfrei; sonst Name.
 * `participant`/`teamAdmin`: nur setzen, wenn die Seite es kennt (Spiel, Team); ohne Angabe gilt false, ein Betreiber, der zugleich ein Team verwaltet, sähe auf einer allgemeinen Seite also Initialen (die sichere Richtung).
 * Die Betreiber-Abfrage läuft nur, wenn sie etwas ändern kann (angemeldet, kein Plattform-Admin, weder Teilnehmer noch Team-Admin).
 */
export async function getViewerSicht(ctx: { participant?: boolean; teamAdmin?: boolean } = {}) {
  const user = await getCurrentUser();
  const participant = ctx.participant ?? false;
  const teamAdmin = ctx.teamAdmin ?? false;
  const platformAdmin = isPlatformAdmin(user);
  const hallOperator = user && !participant && !teamAdmin && !platformAdmin ? await isVenueManager(user.id) : false;
  const sicht: LobbySicht = lobbySicht({ userId: user?.id ?? null, hallOperator, participant, teamAdmin, platformAdmin });
  return { user, sicht };
}
