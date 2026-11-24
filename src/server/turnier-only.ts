import { eq } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { tournamentMatches } from "@/db/schema-league";
import { KOMMT_BALD_TEXT, turnierOnlyOn } from "@/lib/turnier-only";
import { isPlatformAdmin } from "@/lib/roles";
import { getCurrentUser } from "./session";
import { DomainError } from "./teams";

// Turnier 12.12. (TURNIER_ONLY=1): Server-Seite der Sperre. Gilt für Seiten (BereichGate), Server-Aktionen (assertBereichOffen) und Live-Kanäle (bereichGesperrt).
// Der Plattform-Admin darf alles (Betrieb, Prüfung, Support). Ohne die Variable ist alles offen (Standard).

/** true, wenn der Bereich für die aktuelle Person gesperrt ist: Betriebsart an und kein Plattform-Admin. */
export async function bereichGesperrt(): Promise<boolean> {
  if (!turnierOnlyOn()) return false;
  return !isPlatformAdmin(await getCurrentUser());
}

/** Am ANFANG jeder Server-Aktion eines gesperrten Moduls: wirft, bevor irgendetwas gelesen oder geschrieben wird. */
export async function assertBereichOffen(): Promise<void> {
  if (await bereichGesperrt()) throw new DomainError(KOMMT_BALD_TEXT);
}

const UUID_FORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true, wenn dieses Spiel für die aktuelle Person gesperrt ist: Betriebsart an, kein Plattform-Admin und kein Turnier-Spiel (unbekannte Spiele gelten als gesperrt). */
export async function spielGesperrt(matchId: string): Promise<boolean> {
  if (!(await bereichGesperrt())) return false;
  if (!UUID_FORM.test(matchId)) return true; // keine Spiel-id: gesperrt, keine Datenbankabfrage (kein 500 durch eine fremde Zeichenfolge in der Adresse)
  // Offen nur, wenn das Spiel serverseitig zu einem Turnier gehört: Spielart tournament UND eine Zeile in tournament_matches verweist darauf (beides, nicht nur die Spielart)
  const [m] = await db
    .select({ kind: matches.kind, tournamentRow: tournamentMatches.id })
    .from(matches)
    .leftJoin(tournamentMatches, eq(tournamentMatches.matchId, matches.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  return !(m?.kind === "tournament" && m.tournamentRow !== null);
}

/** Für Aktionen auf ein bestimmtes Spiel (Ergebnis melden, Absage, Clips ...): Spiele eines TURNIERS bleiben bedienbar (Captains melden dort das Ergebnis), alle anderen Spiele sind gesperrt. */
export async function assertSpielOffen(matchId: string): Promise<void> {
  if (await spielGesperrt(matchId)) throw new DomainError(KOMMT_BALD_TEXT);
}

/** Antwort der Live-Kanäle und Schnittstellen bei gesperrtem Bereich (kein Inhalt, kein Verbindungsaufbau). */
export const gesperrteAntwort = () => new Response("Dieser Bereich kommt bald.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
