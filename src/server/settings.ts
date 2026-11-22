import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema-finance";
import { audit } from "./audit";
import { DomainError } from "./teams";

type Exec = Pick<typeof db, "select">;

export async function getSetting<T>(key: string, fallback: T, exec: Exec = db): Promise<T> {
  const [row] = await exec.select({ value: settings.value }).from(settings).where(eq(settings.key, key));
  return row ? (row.value as T) : fallback;
}

/** Geschuetzte Beweisprotokoll-Einstellungen (Plan 16g.1): nur ueber die SQL-Funktion evidence_set_setting (Akteur Pflicht, Audit), nie ueber setSetting. */
export const PROTECTED_EVIDENCE_SETTINGS = ["evidence_enforcement", "evidence_clock_source", "evidence_reason_retention_days", "evidence_cutover_at", "evidence_tournament_cutover_at"] as const;

export async function setSetting(actorId: string | null, key: string, value: unknown) {
  if ((PROTECTED_EVIDENCE_SETTINGS as readonly string[]).includes(key)) throw new DomainError(`Einstellung ${key} wird nur ueber evidence_set_setting geaendert (Beweisprotokoll).`);
  const before = await getSetting<unknown>(key, null);
  await db
    .insert(settings)
    .values({ key, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: actorId, updatedAt: new Date() } });
  await audit(actorId, "setting.change", "setting", key, { before: { value: before }, after: { value } });
}

/** Sind Zahlungen eingeschaltet? Solange nicht, bleibt die Lobby kostenlos (Phase 1). */
export async function paymentsEnabled(exec: Exec = db): Promise<boolean> {
  return (await getSetting<boolean>("payments_enabled", false, exec)) === true;
}

/**
 * Kartenmodell (Vertrag 012) eingeschaltet? Standard AUS = Guthaben, Bezahlen und Parken wie bisher. EIN: In neuen Teamspielen und Privatspielen heißt "Bereit"
 * "Karte hinterlegt"; es gibt weder Guthabenprüfung noch -buchung in der Lobby, und die Spielerzahl ändert nur den angezeigten Anteil. Einstellung ohne Schema (Key in settings).
 */
export async function cardPaymentsEnabled(exec: Exec = db): Promise<boolean> {
  return (await getSetting<boolean>("card_payments_enabled", false, exec)) === true;
}

/** Mindestzahl zahlender Spieler, ab der ein Spiel stattfindet und durch die der Hallenpreis höchstens geteilt wird. */
export async function minPaidPlayers(exec: Exec = db): Promise<number> {
  const n = await getSetting<number>("min_paid_players", 8, exec);
  return Number.isInteger(n) && n >= 2 && n <= 12 ? n : 8;
}
