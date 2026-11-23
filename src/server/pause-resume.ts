import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Karenz nach der Pause (Entscheid t2q/t2s): Nach dem Wiedereinschalten der Kartenzahlung (Audit card_switch.on) gilt frühestens 2 Stunden später eine Frist als fällig. Gemeinsames Modul für Spiel-Frist,
// Turnier-Frist und Nachzahlfenster. Kein Import von finance/scheduled/payment-switch (Zyklus). Ohne Audit-Eintrag (Seed, SQL ohne Eintrag) gibt es keine Karenz: sichere Richtung.
export const RESUME_GRACE_MS = 2 * 3_600_000;

/** Zeitpunkt des letzten Wiedereinschaltens (Audit card_switch.on), sonst null. */
export async function lastResumeAt(exec: Pick<typeof db, "select"> = db): Promise<Date | null> {
  const [row] = await exec
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "setting"), eq(auditLog.entityId, "card_payments_enabled"), eq(auditLog.action, "card_switch.on")));
  return row?.at ?? null;
}

/**
 * Untergrenze der Fälligkeit: `due`, aber nie vor Wiedereinschalten + 2 Stunden. Reicht die Karenz bis zum Anstoß (`limit`) oder darüber, gilt sie nicht (`capped`): dann bleibt die bestehende Absageregel
 * (die Halle ist gebucht, Notbremse vor dem Anstoß), und die Absage nennt die Pause als Grund.
 */
export function resumeFloor(due: Date, limit: Date, resumeAt: Date | null): { due: Date; capped: boolean } {
  if (!resumeAt) return { due, capped: false };
  const until = new Date(resumeAt.getTime() + RESUME_GRACE_MS);
  if (until.getTime() <= due.getTime()) return { due, capped: false };
  if (until.getTime() >= limit.getTime()) return { due, capped: true };
  return { due: until, capped: false };
}

/** Klartext der Absage, wenn die Pause die Karenz verhindert hat (nie eine stille Absage). */
export const PAUSE_CANCEL_REASON = "Die Bezahlung war pausiert, das Spiel kann nicht mehr stattfinden. Alle bekommen ihren Anteil zurück, falls schon etwas bezahlt wurde: Die Erstattung folgt.";
