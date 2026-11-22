import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { venueAccess } from "@/db/schema-finance";
import type { Tx } from "./tx";

// Lesen der Betreiber-Zugänge (Vertrag 011 M1). Eine Quelle für „Halle mit Zugang“: nur aktive Zeilen, Konto nicht gesperrt und kein Admin-Konto (Entscheid t9 P4: Admin ist nicht Betreiber).
// Die Berechtigung wird nie im JWT geführt, jede Prüfung liest die Datenbank: ein Entzug wirkt sofort. Diese Datei importiert nichts aus veto.ts (kein Importkreis).

type Reader = Pick<Tx, "select">;

/** Einladung gilt 14 Tage (Entscheid t9 P6); danach nicht mehr einlösbar, Admin 1 lädt neu ein oder zieht zurück. */
export const INVITE_VALID_DAYS = 14;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const isAnonymizedEmail = (e: string) => /^geloescht-[0-9a-f-]+@geloescht\.invalid$/i.test(e.trim());

/** Hat dieses Konto jetzt Zugang zu dieser Halle? */
export async function hasVenueAccess(venueId: string, userId: string, exec: Reader = db): Promise<boolean> {
  const [row] = await exec
    .select({ id: venueAccess.id })
    .from(venueAccess)
    .innerJoin(users, eq(users.id, venueAccess.userId))
    .where(and(eq(venueAccess.venueId, venueId), eq(venueAccess.userId, userId), eq(venueAccess.status, "active"), isNull(users.bannedAt), ne(users.role, "admin")))
    .limit(1);
  return Boolean(row);
}

/** Alle Hallen, zu denen dieses Konto Zugang hat. */
export async function venueIdsOf(userId: string, exec: Reader = db): Promise<string[]> {
  const rows = await exec
    .select({ venueId: venueAccess.venueId })
    .from(venueAccess)
    .innerJoin(users, eq(users.id, venueAccess.userId))
    .where(and(eq(venueAccess.userId, userId), eq(venueAccess.status, "active"), isNull(users.bannedAt), ne(users.role, "admin")))
    .orderBy(asc(venueAccess.venueId));
  return rows.map((r) => r.venueId);
}

/** Ist das Konto Betreiber mindestens einer Halle? (Eintrag „Meine Halle“, Bereich /halle) */
export async function isVenueManager(userId: string, exec: Reader = db): Promise<boolean> {
  return (await venueIdsOf(userId, exec)).length > 0;
}

/** Halle → Konto mit Zugang (für die Hallenanfrage: Halle mit Zugang muss antworten, ohne Zugang bleibt sie „unmanaged“). */
export async function accessHolders(exec: Reader = db): Promise<Map<string, string>> {
  const rows = await exec
    .select({ venueId: venueAccess.venueId, userId: venueAccess.userId })
    .from(venueAccess)
    .innerJoin(users, eq(users.id, venueAccess.userId))
    .where(and(eq(venueAccess.status, "active"), isNull(users.bannedAt), ne(users.role, "admin")));
  return new Map(rows.filter((r) => r.userId).map((r) => [r.venueId, r.userId!]));
}
