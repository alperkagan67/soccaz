import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

// Karenz nach der Pause (Entscheid t2q/t2s): Eine Frist (oder ein Nachzahlfenster), die WÄHREND einer Pause ablief (nach dem Ausschalten, bis zum Wiedereinschalten), gilt frühestens 2 Stunden nach dem
// Wiedereinschalten dieser Pause als fällig. Mehrere Pausen (der Notschalter kann flattern): Pausen mit Abstand unter 2 Stunden werden zu EINER Pause zusammengeführt (Karenz verkettet); für jede Frist D zählt jede Pause k mit off_k < D <= on_k;
// die Karenz ist das MAXIMUM ihrer Enden on_k + 2 h (Definition für TS und SQL, Paritätstest). Fristen vor jeder Pause und Fristen nach dem Wiedereinschalten bleiben unberührt (kein Wiederaufleben alter Fenster). Gemeinsames Modul für Spiel-Frist, Turnier-Frist
// und Nachzahlfenster. Kein Import von finance/scheduled/payment-switch (Zyklus). Ohne beide Audit-Einträge (off UND on; Seed, SQL ohne Eintrag) gibt es keine Karenz: sichere Richtung.
export const RESUME_GRACE_MS = 2 * 3_600_000;
const LOOKBACK_MS = 14 * 24 * 3_600_000; // Rückblick auf Ein-/Ausschalten; ein Ausschalten davor wird für eine längere Pause zusätzlich geladen
const MAX_PAUSES = 10;

/** Eine Pause: Ausschalten, Wiedereinschalten und Ende der Karenz (+2 h). */
export type Pause = { offAt: Date; onAt: Date; until: Date };
/** Die letzte Pause (offAt, onAt, until: für Schlüssel und Mitteilung) und alle jüngeren Pausen (pauses, älteste zuerst). */
export type ResumeInfo = { offAt: Date | null; onAt: Date; until: Date; pauses: Pause[] };

const SWITCH_AUDIT = and(eq(auditLog.entity, "setting"), eq(auditLog.entityId, "card_payments_enabled"));

/** Zeitpunkt des letzten Wiedereinschaltens (Audit card_switch.on), sonst null. */
export async function lastResumeAt(exec: Pick<typeof db, "select"> = db): Promise<Date | null> {
  const [row] = await exec
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(SWITCH_AUDIT, eq(auditLog.action, "card_switch.on")));
  return row?.at ?? null;
}

/** Aus der Folge der Audit-Einträge (aufsteigend) die vollständigen Pausen bilden: ein Ausschalten, gefolgt vom nächsten Einschalten. Ein Einschalten ohne Ausschalten davor zählt nicht (sichere Richtung). */
export function pausesFrom(events: { action: string; at: Date }[]): Pause[] {
  const pauses: Pause[] = [];
  let off: Date | null = null;
  for (const e of events) {
    if (e.action === "card_switch.off") off = e.at;
    else if (e.action === "card_switch.on" && off) {
      pauses.push({ offAt: off, onAt: e.at, until: new Date(e.at.getTime() + RESUME_GRACE_MS) });
      off = null;
    }
  }
  // Pausen mit Abstand unter der Karenz (Ausschalten der nächsten Pause weniger als 2 Stunden nach dem Wiedereinschalten) gelten als EINE Pause (Flattern): off_k .. on_{k+1}; die Karenz wird so verkettet
  const merged: Pause[] = [];
  for (const p of pauses) {
    const prev = merged[merged.length - 1];
    if (prev && p.offAt.getTime() - prev.onAt.getTime() < RESUME_GRACE_MS) merged[merged.length - 1] = { offAt: prev.offAt, onAt: p.onAt, until: p.until };
    else merged.push(p);
  }
  return merged.slice(-MAX_PAUSES);
}

/**
 * Pausen und Karenz der letzten Zeit (Audit card_switch.off/on), sonst null. Unter der Sperre des Aufrufers (Spiel-/Turniersperre) frisch lesen, nie einen Wert aus der Kandidatenauswahl weiterverwenden:
 * schaltet der Admin während des Laufs ein, muss die Entscheidung in der Transaktion die Karenz sehen.
 */
export async function resumeUntil(exec: Pick<typeof db, "select"> = db): Promise<ResumeInfo | null> {
  const cutoff = new Date(Date.now() - LOOKBACK_MS);
  const events = await exec
    .select({ action: auditLog.action, at: auditLog.at })
    .from(auditLog)
    .where(and(SWITCH_AUDIT, inArray(auditLog.action, ["card_switch.off", "card_switch.on"]), sql`${auditLog.at} > ${cutoff}`))
    .orderBy(asc(auditLog.at));
  // Eine Pause kann länger als der Rückblick sein (off davor, on darin): das letzte Ausschalten VOR dem Fenster immer mitladen, sonst fehlte das Paar und es gäbe keine Karenz (unsichere Richtung)
  const [before] = await exec
    .select({ action: auditLog.action, at: auditLog.at })
    .from(auditLog)
    .where(and(SWITCH_AUDIT, eq(auditLog.action, "card_switch.off"), sql`${auditLog.at} <= ${cutoff}`))
    .orderBy(desc(auditLog.at))
    .limit(1);
  const pauses = pausesFrom(before ? [before, ...events] : events);
  if (pauses.length === 0) return null;
  const last = pauses.reduce((a, b) => (b.onAt.getTime() > a.onAt.getTime() ? b : a));
  return { offAt: last.offAt, onAt: last.onAt, until: last.until, pauses };
}

const inPause = (end: Date, p: Pause) => end.getTime() > p.offAt.getTime() && end.getTime() <= p.onAt.getTime();
const latest = (ds: Date[]) => new Date(Math.max(...ds.map((d) => d.getTime())));

/**
 * Untergrenze der Fälligkeit: eine Frist, die während einer Pause ablief, gilt frühestens bei Wiedereinschalten + 2 Stunden (bei mehreren Pausen: dem spätesten dieser Enden). Reicht die Karenz bis zum Anstoß
 * (`limit`) oder darüber, gilt sie nicht (`capped`): dann bleibt die bestehende Absageregel (die Halle ist gebucht, Notbremse vor dem Anstoß), und die Absage nennt die Pause als Grund.
 */
export function resumeFloor(due: Date, limit: Date, info: ResumeInfo | null): { due: Date; capped: boolean } {
  if (!info) return { due, capped: false };
  const hit = info.pauses.filter((p) => inPause(due, p));
  if (hit.length === 0) return { due, capped: false };
  const until = latest(hit.map((p) => p.until));
  if (until.getTime() >= limit.getTime()) return { due, capped: true };
  return { due: until, capped: false };
}

/** Klartext der Absage, wenn die Pause die Karenz verhindert hat (nie eine stille Absage). */
export const PAUSE_CANCEL_REASON = "Die Bezahlung war pausiert, das Spiel kann nicht mehr stattfinden. Alle bekommen ihren Anteil zurück, falls schon etwas bezahlt wurde: Die Erstattung folgt.";

export const PAUSE_CANCEL_REASON_TOURNAMENT = "Die Bezahlung war pausiert, das Turnier kann nicht mehr stattfinden. Alle bekommen ihren Anteil zurück, falls schon etwas bezahlt wurde: Die Erstattung folgt.";

// --- Nachzahlfenster (AC-9) ---
// Ein Fenster, das in einer Pause ablief, gäbe den Platz sofort nach dem Wiedereinschalten frei (trifft dieselben Spieler). Deshalb gilt dieselbe Untergrenze: Wiedereinschalten + 2 Stunden, aber nur, wenn das
// Fensterende in diese Pause fiel und die Karenz vor dem Deckel des Fensters (Anstoß minus 1 Stunde) endet; sonst bleibt das Fenster, wie es ist (bestehende Regel). GRENZE: Endet die Karenz erst nach dem Deckel
// (Wiedereinschalten + 2 Stunden >= Anstoß minus 1 Stunde), gibt der Nachrücker-Lauf den Platz direkt nach dem Wiedereinschalten frei (kein Aufschub über den Deckel hinaus; in BETRIEB benannt).

const WINDOW_CAP_MS = 3_600_000; // Fenster enden nie nach Anstoß minus 1 Stunde (lib/grace)

/** Effektives Fensterende mit Karenz: `end` (aus effectiveGraceEnd), angehoben auf das späteste Karenzende der Pausen, in die es fiel, soweit dieses vor Anstoß minus 1 Stunde liegt. */
export function windowEndAfterResume(end: Date | null, startsAt: Date, info: ResumeInfo | null): Date | null {
  if (end === null || info === null) return end;
  const ups = info.pauses.filter((p) => inPause(end, p) && p.until.getTime() < startsAt.getTime() - WINDOW_CAP_MS).map((p) => p.until);
  return ups.length ? latest([end, ...ups]) : end;
}

/** Dasselbe als SQL-Ausdruck (Kandidatenlisten): effektives Fensterende mit Karenz. Gleiche Regel wie `windowEndAfterResume` (Paritätstest, auch mit mehreren Pausen). */
export function windowEndSql(graceCol: unknown, startsCol: unknown, info: ResumeInfo | null) {
  const effective = sql`least(${graceCol}, ${startsCol} - interval '1 hour')`;
  if (!info || info.pauses.length === 0) return sql`(${effective})`;
  const parts = info.pauses.map((p) => {
    const off = sql`${p.offAt.toISOString()}::timestamptz`;
    const on = sql`${p.onAt.toISOString()}::timestamptz`;
    const until = sql`${p.until.toISOString()}::timestamptz`;
    return sql`(case when ${effective} > ${off} and ${effective} <= ${on} and ${until} < ${startsCol} - interval '1 hour' then ${until} end)`; // NULL, wenn die Pause nicht greift (greatest ignoriert NULL)
  });
  return sql`greatest(${effective}, ${sql.join(parts, sql`, `)})`;
}
