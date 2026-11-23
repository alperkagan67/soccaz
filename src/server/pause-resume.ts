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

// --- Nachzahlfenster (AC-9) ---
// Ein Fenster, das in der Pause ablief, gäbe den Platz sofort nach dem Wiedereinschalten frei (trifft dieselben Spieler). Deshalb gilt dieselbe Untergrenze: Wiedereinschalten + 2 Stunden, aber nur, wenn sie
// vor dem Deckel des Fensters (Anstoß minus 1 Stunde) liegt; sonst bleibt das Fenster, wie es ist (bestehende Regel, mit Erstattung).

/** Ende der Karenz (Wiedereinschalten + 2 Stunden) oder null. Einmal je Aufruf lesen und weiterreichen. */
export async function resumeUntil(exec: Pick<typeof db, "select"> = db): Promise<Date | null> {
  const at = await lastResumeAt(exec);
  return at ? new Date(at.getTime() + RESUME_GRACE_MS) : null;
}

const WINDOW_CAP_MS = 3_600_000; // Fenster enden nie nach Anstoß minus 1 Stunde (lib/grace)

/** Effektives Fensterende mit Karenz: `end` (aus effectiveGraceEnd), angehoben auf `until`, wenn `until` später ist und vor Anstoß minus 1 Stunde liegt. */
export function windowEndAfterResume(end: Date | null, startsAt: Date, until: Date | null): Date | null {
  if (end === null || until === null) return end;
  if (until.getTime() > end.getTime() && until.getTime() < startsAt.getTime() - WINDOW_CAP_MS) return until;
  return end;
}

/** Dasselbe als SQL-Ausdruck (Kandidatenlisten): effektives Fensterende mit Karenz. */
export function windowEndSql(graceCol: unknown, startsCol: unknown, until: Date | null) {
  const floor = until ? sql`${until.toISOString()}::timestamptz` : sql`null::timestamptz`;
  return sql`(case when ${floor} is not null and ${floor} > least(${graceCol}, ${startsCol} - interval '1 hour') and ${floor} < ${startsCol} - interval '1 hour' then ${floor} else least(${graceCol}, ${startsCol} - interval '1 hour') end)`;
}
