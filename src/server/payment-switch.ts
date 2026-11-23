import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { settings } from "@/db/schema-finance";
import { isOwner } from "@/lib/roles";
import { audit } from "./audit";
import { DomainError } from "./teams";

// Notschalter Kartenzahlung (t2q/t2s): `card_payments_enabled` AUS = Zahlungen PAUSIERT (Entscheid D): kein Guthaben-Fallback, nicht kostenlos, neue Beitritte/Bereit zeigen "Bezahlung ist gerade
// nicht moeglich", faellige Abbuchungen warten, Turniere frieren ein (Alarm nach 6 Stunden), bestehende bezahlte Plaetze bleiben. NUR Admin 1 darf schalten (die Funktion prueft das selbst).
// Protokoll: audit_log (card_switch.on/off) mit before/after, Grund im Klartext UND als SHA-256 (Commitment), ohne Personendaten; die Einstellung selbst traegt updated_at/updated_by ("seit wann").
export const CARD_SWITCH_KEY = "card_payments_enabled";

/** Steuerzeichen und Zeilenumbrueche raus (der Grund steht im Audit und in der Anzeige). */
const stripControl = (x: string) => x.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/ {2,}/g, " ");

export type CardSwitchState = { enabled: boolean; since: Date | null; neverSwitched: boolean };

/** Zustand und seit wann (Zeitpunkt der letzten Aenderung). Ohne Zeile: Standard AUS, "noch nie geschaltet". */
export async function getCardSwitch(): Promise<CardSwitchState> {
  await connection();
  const [row] = await db.select({ value: settings.value, updatedAt: settings.updatedAt }).from(settings).where(eq(settings.key, CARD_SWITCH_KEY));
  if (!row) return { enabled: false, since: null, neverSwitched: true };
  return { enabled: row.value === true, since: row.updatedAt, neverSwitched: false };
}

/**
 * Schaltet die Kartenzahlung ein oder aus. Nur Admin 1 (nicht Admin 2, nicht finance); Grund 3 bis 200 Zeichen (bereinigt) und Bestaetigung der Folgen sind Pflicht; eine Transaktion unter
 * Sperre (genau ein Gewinner bei gleichzeitigen Klicks); "steht schon auf ..." wird abgewiesen.
 */
export async function setCardSwitch(actorId: string, enabled: boolean, reason: string, confirmed: boolean): Promise<void> {
  const clean = stripControl(reason).trim();
  if (clean.length < 3 || clean.length > 200) throw new DomainError("Bitte gib einen Grund an (3 bis 200 Zeichen).");
  if (!confirmed) throw new DomainError("Bitte bestätige, dass du die Folgen gelesen hast.");
  await db.transaction(async (tx) => {
    const [a] = await tx.select({ role: users.role, isOwner: users.isOwner, bannedAt: users.bannedAt }).from(users).where(eq(users.id, actorId));
    if (!a || a.bannedAt || !isOwner(a)) throw new DomainError("Das darf nur Admin 1.");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"card-switch"}))`); // die Zeile kann fehlen: Sperre unabhaengig davon
    const [row] = await tx.select({ value: settings.value, updatedAt: settings.updatedAt }).from(settings).where(eq(settings.key, CARD_SWITCH_KEY));
    const current = row?.value === true;
    if (current === enabled) throw new DomainError(enabled ? "Die Kartenzahlung ist schon eingeschaltet." : "Die Kartenzahlung ist schon ausgeschaltet.");
    await tx
      .insert(settings)
      .values({ key: CARD_SWITCH_KEY, value: enabled, updatedBy: actorId })
      .onConflictDoUpdate({ target: settings.key, set: { value: enabled, updatedBy: actorId, updatedAt: new Date() } });
    await audit(
      actorId,
      enabled ? "card_switch.on" : "card_switch.off",
      "setting",
      CARD_SWITCH_KEY,
      { before: { value: current, since: row?.updatedAt ?? null }, after: { value: enabled, reason: clean, reasonSha256: createHash("sha256").update(clean, "utf8").digest("hex") } },
      tx,
    );
  });
}
