import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { settings } from "@/db/schema-finance";
import { SWITCH_TEXTS, normalizeState, planSwitch } from "@/lib/evidence-switch";
import { pgCodeOf } from "@/lib/hall-answer-errors";
import { isOwner } from "@/lib/roles";
import { DomainError } from "./teams";

export type EvidenceSwitchState = { enforcementOn: boolean; clockDb: boolean; changedAt: Date | null };

async function readRaw() {
  const rows = await db.select({ key: settings.key, value: settings.value, at: settings.updatedAt }).from(settings).where(inArray(settings.key, ["evidence_enforcement", "evidence_clock_source"]));
  const by = new Map(rows.map((r) => [r.key, r]));
  const times = rows.map((r) => r.at).filter((t): t is Date => Boolean(t));
  return {
    enforcement: by.get("evidence_enforcement")?.value,
    clockSource: by.get("evidence_clock_source")?.value,
    changedAt: times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null,
  };
}

/** Stand der beiden Schalter (nur Lesen). Fehlt ein Wert, gilt wie in der Datenbank: Durchsetzung „on“ (fail-closed), Uhrenquelle „js“. */
export async function getEvidenceSwitchState(): Promise<EvidenceSwitchState> {
  const raw = await readRaw();
  return { ...normalizeState(raw), changedAt: raw.changedAt };
}

/**
 * Admin 1 stellt die Uhrenquelle auf Datenbank oder schaltet die Beweispflicht ein. Prüft Rolle (Admin 1, nicht gesperrt) UND Schritt/Grund, ruft dann NUR die Datenbankfunktion
 * evidence_set_setting auf (Akteur = angemeldetes Konto, Audit in der Funktion). Kein Ausschalten, kein setSetting. Datenbankfehler werden neutral übersetzt (nie deren Meldung).
 */
export async function switchEvidence(actorId: string, step: unknown, reason: string | null | undefined): Promise<void> {
  const [actor] = await db.select({ role: users.role, isOwner: users.isOwner, bannedAt: users.bannedAt }).from(users).where(eq(users.id, actorId));
  if (!actor || actor.bannedAt || !isOwner(actor)) throw new DomainError("Nur Admin 1 darf die Beweispflicht ändern.");
  const plan = planSwitch(step, await readRaw(), reason);
  if (plan.kind === "invalid") throw new DomainError(plan.error);
  try {
    await db.execute(sql`select evidence_set_setting(${plan.key}, ${plan.value}, ${actorId}::uuid, ${plan.reason})`);
  } catch (error) {
    console.error("switchEvidence:", pgCodeOf(error) ?? "Fehler");
    throw new DomainError(SWITCH_TEXTS.technical);
  }
}
