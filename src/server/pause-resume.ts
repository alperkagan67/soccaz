import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Karenz nach der Pause (Entscheid t2q/t2s): Eine Frist (oder ein Nachzahlfenster), die WÄHREND der Pause ablief (nach dem Ausschalten, bis zum Wiedereinschalten), gilt frühestens 2 Stunden nach dem
// Wiedereinschalten als fällig. Fristen vor der Pause und Fristen nach dem Wiedereinschalten bleiben unberührt (engere Regel, Review w4/security). Gemeinsames Modul für Spiel-Frist, Turnier-Frist und
// Nachzahlfenster (TypeScript UND SQL, mit Paritätstest). Kein Import von finance/scheduled/payment-switch (Zyklus). Ohne beide Audit-Einträge (Seed, SQL ohne Eintrag) gibt es keine Karenz: sichere Richtung.
export const RESUME_GRACE_MS = 2 * 3_600_000;

/** Pausenbeginn (letztes Ausschalten), Wiedereinschalten (letztes Einschalten) und Ende der Karenz. */
export type ResumeInfo = { offAt: Date | null; onAt: Date; until: Date };

const SWITCH_AUDIT = and(eq(auditLog.entity, "setting"), eq(auditLog.entityId, "card_payments_enabled"));

/** Zeitpunkt des letzten Wiedereinschaltens (Audit card_switch.on), sonst null. */
export async function lastResumeAt(exec: Pick<typeof db, "select"> = db): Promise<Date | null> {
  const [row] = await exec
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(SWITCH_AUDIT, eq(auditLog.action, "card_switch.on")));
  return row?.at ?? null;
}

/**
 * Pause und Karenz des letzten Wiedereinschaltens (Audit card_switch.off/on), sonst null. Unter der Sperre des Aufrufers (Spiel-/Turniersperre) frisch lesen, nie einen Wert aus der Kandidatenauswahl
 * weiterverwenden: schaltet der Admin während des Laufs ein, muss die Entscheidung in der Transaktion die Karenz sehen.
 */
export async function resumeUntil(exec: Pick<typeof db, "select"> = db): Promise<ResumeInfo | null> {
  const onAt = await lastResumeAt(exec);
  if (!onAt) return null;
  const [row] = await exec
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(SWITCH_AUDIT, eq(auditLog.action, "card_switch.off"), sql`${auditLog.at} <= ${onAt}`));
  return { offAt: row?.at ?? null, onAt, until: new Date(onAt.getTime() + RESUME_GRACE_MS) };
}

/** Lief die Frist/das Fensterende WÄHREND der Pause ab (nach dem Ausschalten, bis zum Wiedereinschalten)? Ohne Pausenbeginn nie (sichere Richtung). */
function expiredInPause(end: Date, info: ResumeInfo): boolean {
  return info.offAt !== null && end.getTime() > info.offAt.getTime() && end.getTime() <= info.onAt.getTime();
}

/**
 * Untergrenze der Fälligkeit: eine Frist, die während der Pause ablief, gilt frühestens bei Wiedereinschalten + 2 Stunden. Reicht die Karenz bis zum Anstoß (`limit`) oder darüber, gilt sie nicht
 * (`capped`): dann bleibt die bestehende Absageregel (die Halle ist gebucht, Notbremse vor dem Anstoß), und die Absage nennt die Pause als Grund.
 */
export function resumeFloor(due: Date, limit: Date, info: ResumeInfo | null): { due: Date; capped: boolean } {
  if (!info || !expiredInPause(due, info)) return { due, capped: false };
  if (info.until.getTime() >= limit.getTime()) return { due, capped: true };
  return { due: info.until, capped: false };
}

/** Klartext der Absage, wenn die Pause die Karenz verhindert hat (nie eine stille Absage). */
export const PAUSE_CANCEL_REASON = "Die Bezahlung war pausiert, das Spiel kann nicht mehr stattfinden. Alle bekommen ihren Anteil zurück, falls schon etwas bezahlt wurde: Die Erstattung folgt.";

export const PAUSE_CANCEL_REASON_TOURNAMENT = "Die Bezahlung war pausiert, das Turnier kann nicht mehr stattfinden. Alle bekommen ihren Anteil zurück, falls schon etwas bezahlt wurde: Die Erstattung folgt.";

// --- Nachzahlfenster (AC-9) ---
// Ein Fenster, das in der Pause ablief, gäbe den Platz sofort nach dem Wiedereinschalten frei (trifft dieselben Spieler). Deshalb gilt dieselbe Untergrenze: Wiedereinschalten + 2 Stunden, aber nur, wenn das
// Fensterende in die Pause fiel und die Karenz vor dem Deckel des Fensters (Anstoß minus 1 Stunde) endet; sonst bleibt das Fenster, wie es ist (bestehende Regel). GRENZE: Endet die Karenz erst nach dem Deckel
// (Wiedereinschalten + 2 Stunden >= Anstoß minus 1 Stunde), gibt der Nachrücker-Lauf den Platz direkt nach dem Wiedereinschalten frei (kein Aufschub über den Deckel hinaus; in BETRIEB benannt).

const WINDOW_CAP_MS = 3_600_000; // Fenster enden nie nach Anstoß minus 1 Stunde (lib/grace)

/** Effektives Fensterende mit Karenz: `end` (aus effectiveGraceEnd), angehoben auf das Ende der Karenz, wenn es in die Pause fiel und die Karenz vor Anstoß minus 1 Stunde endet. */
export function windowEndAfterResume(end: Date | null, startsAt: Date, info: ResumeInfo | null): Date | null {
  if (end === null || info === null) return end;
  if (expiredInPause(end, info) && info.until.getTime() < startsAt.getTime() - WINDOW_CAP_MS) return info.until;
  return end;
}

/** Dasselbe als SQL-Ausdruck (Kandidatenlisten): effektives Fensterende mit Karenz. Gleiche Regel wie `windowEndAfterResume` (Paritätstest). */
export function windowEndSql(graceCol: unknown, startsCol: unknown, info: ResumeInfo | null) {
  const effective = sql`least(${graceCol}, ${startsCol} - interval '1 hour')`;
  if (!info || !info.offAt) return sql`(${effective})`;
  const off = sql`${info.offAt.toISOString()}::timestamptz`;
  const on = sql`${info.onAt.toISOString()}::timestamptz`;
  const until = sql`${info.until.toISOString()}::timestamptz`;
  return sql`(case when ${effective} > ${off} and ${effective} <= ${on} and ${until} < ${startsCol} - interval '1 hour' then ${until} else ${effective} end)`;
}
