// Mitteilungen an die Zugangsinhaber der Halle (Vertrag 012, M5-7b, Entscheid t2q A). Kleines Modul OHNE Import von tournaments.ts, damit tournaments.ts (Fixieren) es statisch einbinden kann,
// ohne Importkreis mit tournament-confirm.ts (R-T247). Ohne Namen Dritter: Turnier, Termin, Frist, Link nach /halle. Entprellt je Turnier und Zeitpunkt (Audit-Marker unter der Turniersperre).
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { formatDateTime } from "@/lib/time";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";
import type { Tx } from "./tx";
import { venueAccessHolderIds } from "./venue-access-rules";

/**
 * Entscheid t2q A (JA): Mitteilung an die Zugangsinhaber der Halle (a) beim Fixieren mit Snapshot "Zusage noetig" und (b) 24 h/6 h vor der Frist, damit sie rechtzeitig zusagen. Ohne Namen Dritter:
 * Turnier, Termin, Frist, Link nach /halle. Entprellt je Turnier und Zeitpunkt (Audit-Marker unter der Turniersperre). Empfaenger kommen aus derselben Zugangsbedingung wie hasVenueAccess.
 */
export const NOTIFY_ACCESS_HOLDERS = true; // Entscheid t2q A: JA (In-App/Push; Mail fehlt, FEHLT-NOCH)

export const accessHolderIdsOf = (venueId: string, exec: Pick<typeof db, "select"> = db) => venueAccessHolderIds(venueId, exec);


/** Text an die Zugangsinhaber der Halle (Entscheid A): Turnier, Termin, Frist; keine Namen Dritter. stage = Stunden bis zur Frist, null = beim Fixieren. */
export function holderText(tournamentName: string, startsAt: Date | null, due: Date | null, stage: number | null): string {
  const when = startsAt ? ` am ${formatDateTime(startsAt)} Uhr` : "";
  const until = due ? ` Zusage bis ${formatDateTime(due)} Uhr.` : "";
  const lead = stage === null ? "Ein Turnier wartet auf die Zusage der Halle" : `Die Zusage der Halle fehlt noch (Frist in etwa ${stage} Stunden)`;
  return `${lead}: ${tournamentName}${when}.${until} Die Zusage ist verbindlich.`;
}


/**
 * Beim Fixieren des Preises (Snapshot "Zugang noetig"): Zugangsinhaber der Halle benachrichtigen, entprellt je Turnier und Preisrunde (Marker unter der Turniersperre des Aufrufers). In der Transaktion
 * des Aufrufers (maybeFixPrice), als Savepoint gekapselt: ein Fehler hier darf das Fixieren nie kippen.
 */
export async function notifyHolderOnFix(tx: Tx, t: { id: string; name: string; venueId: string | null; startsAt: Date | null; priceRound: number }, due: Date | null): Promise<void> {
  if (!NOTIFY_ACCESS_HOLDERS || !t.venueId) return;
  const action = `tournament.hall_fixed_notice.${t.priceRound}`;
  try {
    await tx.transaction(async (sp) => {
      const [done] = await sp.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, t.id))).limit(1);
      if (done) return;
      const holders = await accessHolderIdsOf(t.venueId!, sp);
      await notifyUsers(holders, { type: "system", title: "Zusage der Halle gefragt", body: holderText(t.name, t.startsAt, due, null), url: "/halle" }, sp);
      await audit(null, action, "tournament", t.id, { after: { holders: holders.length } }, sp);
    });
  } catch {
    /* Zugabe: das Fixieren gilt */
  }
}

