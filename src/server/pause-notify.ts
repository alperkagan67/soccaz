import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches, remindersSent } from "@/db/schema";
import { abortDeadline, dueWithGrace, fixDeadline, hasLongLead } from "@/lib/deadlines";
import { matchParticipantIds, notifyUsers, teamAdminIds } from "./notifications";
import { RESUME_GRACE_MS, lastResumeAt } from "./pause-resume";
import { leadStart } from "./wallet";

/** "Mi., 25.11., 19:30 Uhr" in Berliner Zeit (nie die Serverzeit). */
export function berlinTime(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(d) + " Uhr";
}

/**
 * Nach dem Wiedereinschalten der Kartenzahlung (Entscheid t2q/t2s): Spieler und Captains der Spiele, deren Frist die Karenz (Wiedereinschalten + 2 Stunden) nach hinten schiebt, erfahren die neue Frist,
 * sonst läuft die Karenz ins Leere. Nur Teilnehmer und Team-Captains des Spiels, Text ohne Namen Dritter. Entprellt je Spiel und je Einschaltung (reminders_sent, Schlüssel mit dem Einschaltzeitpunkt).
 * Läuft NACH dem Commit des Schalters und best effort: ein Fehler hier darf das Einschalten nie verhindern (Aufrufer fängt ab). Gibt die Zahl der benachrichtigten Spiele zurück.
 */
export async function notifyResumedGames(now: Date = new Date()): Promise<number> {
  const resumeAt = await lastResumeAt();
  if (!resumeAt) return 0;
  const until = new Date(resumeAt.getTime() + RESUME_GRACE_MS);
  const games = await db
    .select()
    .from(matches)
    .where(and(inArray(matches.kind, ["private", "team"]), eq(matches.legacyShareModel, false), inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.settledAt} is null`, eq(matches.schedulingOpen, false), inArray(matches.vetoStatus, ["none", "done"]), sql`${matches.startsAt} > ${now}`));
  let notified = 0;
  for (const m of games) {
    if (until.getTime() >= m.startsAt.getTime()) continue; // die Karenz reicht nicht bis zum Anstoß: die Absageregel mit Klartext greift, keine "neue Frist"
    const payOpenAt = await leadStart(db, m);
    const due = dueWithGrace(hasLongLead(m.startsAt, payOpenAt) ? fixDeadline(m.startsAt) : abortDeadline(m.startsAt), payOpenAt, m.startsAt, m.createdAt);
    if (due.getTime() >= until.getTime()) continue; // die Frist liegt ohnehin später: nichts verschoben
    const [mark] = await db.insert(remindersSent).values({ matchId: m.id, kind: `pause-resume:${resumeAt.getTime()}` }).onConflictDoNothing().returning({ kind: remindersSent.kind });
    if (!mark) continue; // je Spiel und Einschaltung genau einmal
    const ids = [...(await matchParticipantIds(db, m.id)), ...(await teamAdminIds(db, m.homeTeamId)), ...(await teamAdminIds(db, m.awayTeamId))];
    await notifyUsers(ids, { type: "payment", title: "Bezahlung ist wieder möglich", body: `Die Bezahlung läuft wieder. Neue Frist: ${berlinTime(until)}. Bitte hinterlege bis dahin deine Karte.`, url: `/lobby/${m.id}` });
    notified += 1;
  }
  return notified;
}
