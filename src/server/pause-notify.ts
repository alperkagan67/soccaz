import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, remindersSent } from "@/db/schema";
import { settings } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { abortDeadline, dueWithGrace, fixDeadline, hasLongLead } from "@/lib/deadlines";
import { notifyUsers, teamAdminIds } from "./notifications";
import { resumeFloor, resumeUntil, type ResumeInfo } from "./pause-resume";
import { cardPaymentsEnabled, paymentsEnabled } from "./settings";
import { tournamentCardMode, tournamentMissingCards } from "./tournament-card";
import { cardModeActive, hasChargeRows, isChargeBound, leadStart } from "./wallet";

/** "Mi., 25.11., 19:30 Uhr" in Berliner Zeit (nie die Serverzeit). */
export function berlinTime(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }).format(d) + " Uhr";
}

/** Höchstens so viele Spiele/Turniere je Aufruf (die Admin-Aktion bleibt kurz); der Rest kommt über den 5-Minuten-Job (runCardCharges), solange die Karenz läuft. */
export const NOTIFY_LIMIT = 200;
const CARD_PRESENT = ["card_ready", "charge_pending", "charged"];

/**
 * Nach dem Wiedereinschalten der Kartenzahlung (Entscheid t2q/t2s): wer noch handeln muss, erfährt die neue Frist, sonst läuft die Karenz ins Leere. Nur für Spiele/Turniere, deren Frist WÄHREND der Pause ablief
 * und durch die Karenz verschoben wird (dieselben Bedingungen wie die Frist-Jobs: Kartenmodell, nicht abrechnungsgebunden, kein Abbuchungslauf, kein kostenloses Spiel), und nur an Spieler OHNE hinterlegte Karte
 * bzw. die Captains ihrer Teams (Turnier: auch der Veranstalter), ohne Namen Dritter. Entprellt je Spiel/Turnier und Einschaltung; Marke und Versand je Spiel in EINER Transaktion; ein Fehler bei einem Spiel
 * bricht die übrigen nicht ab. Läuft nach dem Commit des Schalters und im 5-Minuten-Job, nie in der Schalter-Transaktion. Gibt die Zahl der benachrichtigten Spiele/Turniere zurück.
 */
export async function notifyResumedGames(now: Date = new Date(), opts: { limit?: number } = {}): Promise<number> {
  const info = await resumeUntil();
  if (!info || !info.offAt || now.getTime() >= info.until.getTime()) return 0; // nie wieder eingeschaltet, kein Pausenbeginn (keine Karenz) oder die Karenz ist vorbei
  if (!(await paymentsEnabled()) || !(await cardPaymentsEnabled())) return 0;
  const limit = opts.limit ?? NOTIFY_LIMIT;
  const games = await notifyGames(now, info, limit);
  const tournamentsDone = games < limit ? await notifyTournaments(now, info, limit - games) : 0;
  return games + tournamentsDone;
}

async function notifyGames(now: Date, info: ResumeInfo, limit: number): Promise<number> {
  const candidates = await db
    .select()
    .from(matches)
    .where(and(inArray(matches.kind, ["private", "team"]), eq(matches.legacyShareModel, false), inArray(matches.status, ["lobby", "confirmed"]), sql`${matches.settledAt} is null`, eq(matches.schedulingOpen, false), inArray(matches.vetoStatus, ["none", "done"]), sql`${matches.startsAt} > ${now}`));
  let notified = 0;
  for (const c of candidates) {
    if (notified >= limit) break;
    try {
      const payOpenAt = await leadStart(db, c);
      const due = dueWithGrace(hasLongLead(c.startsAt, payOpenAt) ? fixDeadline(c.startsAt) : abortDeadline(c.startsAt), payOpenAt, c.startsAt, c.createdAt);
      const floored = resumeFloor(due, c.startsAt, info);
      if (floored.capped || floored.due.getTime() <= due.getTime()) continue; // Frist nicht in der Pause abgelaufen oder die Karenz reicht nicht bis zum Anstoß (Absage mit Klartext): keine "neue Frist"
      const sent = await db.transaction(async (tx) => {
        const [m] = await tx.select().from(matches).where(eq(matches.id, c.id)).for("update");
        if (!m || !["lobby", "confirmed"].includes(m.status) || m.settledAt !== null || m.startsAt.getTime() <= now.getTime()) return false;
        // wie der Frist-Job: kostenlos, abrechnungsgebunden oder schon in der Abbuchung (Zeilen): die Frist-Regel verschiebt dort nichts
        if (m.priceCents === 0 || !(await cardModeActive(tx, m)) || (await isChargeBound(tx, m.id)) || (await hasChargeRows(tx, m.id))) return false;
        const [mark] = await tx.insert(remindersSent).values({ matchId: m.id, kind: `pause-resume:${info.onAt.getTime()}` }).onConflictDoNothing().returning({ kind: remindersSent.kind });
        if (!mark) return false; // je Spiel und Einschaltung genau einmal
        const seats = await tx.select({ userId: matchParticipants.userId, teamId: matchParticipants.teamId, cardStatus: matchParticipants.cardStatus }).from(matchParticipants).where(eq(matchParticipants.matchId, m.id));
        const missing = seats.filter((s) => s.teamId !== null && !CARD_PRESENT.includes(s.cardStatus ?? ""));
        if (missing.length === 0) return true; // alle haben eine Karte: nichts zu melden (Marke bleibt, damit nichts nachgeholt wird)
        const players = [...new Set(missing.map((s) => s.userId))];
        await notifyUsers(players, { type: "payment", title: "Bezahlung ist wieder möglich", body: `Die Bezahlung läuft wieder. Neue Frist: ${berlinTime(info.until)}. Bitte hinterlege bis dahin deine Karte.`, url: `/lobby/${m.id}` }, tx);
        const teamIds = [...new Set(missing.map((s) => s.teamId!))];
        const captains = [...new Set((await Promise.all(teamIds.map((teamId) => teamAdminIds(tx, teamId)))).flat())].filter((id) => !players.includes(id));
        await notifyUsers(captains, { type: "payment", title: "Bezahlung ist wieder möglich", body: `Die Bezahlung läuft wieder. Neue Frist: ${berlinTime(info.until)}. In deinem Team fehlen noch Karten.`, url: `/lobby/${m.id}` }, tx);
        return true;
      });
      if (sent) notified += 1;
    } catch (error) {
      console.error("notifyResumedGames: Fehler bei Spiel", c.id, error instanceof Error ? error.name : "Fehler"); // ein Spiel bricht die übrigen nicht ab
    }
  }
  return notified;
}

/**
 * Turniere: wie die Spiele (Frist in der Pause abgelaufen, durch die Karenz verschoben, Kartenmodell, mit Preis); Empfänger: Spieler ohne Karte (und ohne gültigen Übernehmer), die Captains ihrer Teams und der Veranstalter.
 * Entprellt atomar über einen Marker mit eindeutigem Schlüssel (Einstellungstabelle, `pause_notified:<Turnier>:<Einschaltung>`), Marke und Versand in einer Transaktion. Dynamischer Import von chargeDueAt
 * gegen den Importkreis (tournaments importiert Zahlungsmodule).
 */
async function notifyTournaments(now: Date, info: ResumeInfo, limit: number): Promise<number> {
  const { chargeDueAt } = await import("./tournaments");
  const rows = await db
    .select()
    .from(tournaments)
    .where(and(inArray(tournaments.status, ["registration", "payment"]), sql`${tournaments.bracketGeneratedAt} is null`, sql`${tournaments.startsAt} > ${now}`));
  let notified = 0;
  for (const t of rows) {
    if (notified >= limit) break;
    try {
      if (!t.startsAt) continue;
      const due = await chargeDueAt(db, t);
      if (!due) continue; // Altturnier ohne Fristregel
      const floored = resumeFloor(due, t.startsAt, info);
      if (floored.capped || floored.due.getTime() <= due.getTime()) continue;
      const sent = await db.transaction(async (tx) => {
        const [fresh] = await tx.select().from(tournaments).where(eq(tournaments.id, t.id)).for("update");
        if (!fresh || !["registration", "payment"].includes(fresh.status) || fresh.bracketGeneratedAt || !(await tournamentCardMode(tx, t.id))) return false; // kostenlos/ohne Kartenfluss: keine Karte nötig
        const [mark] = await tx.insert(settings).values({ key: `pause_notified:${t.id}:${info.onAt.getTime()}`, value: true }).onConflictDoNothing().returning({ key: settings.key });
        if (!mark) return false; // je Turnier und Einschaltung genau einmal (atomar über den eindeutigen Schlüssel)
        const missing = await tournamentMissingCards(tx, t.id);
        if (missing.length === 0) return true;
        const players = [...new Set(missing.map((m) => m.userId))];
        await notifyUsers(players, { type: "payment", title: "Bezahlung ist wieder möglich", body: `Die Bezahlung läuft wieder. Neue Frist für das Turnier: ${berlinTime(info.until)}. Bitte hinterlege bis dahin deine Karte.`, url: `/turniere/${t.id}` }, tx);
        const teamIds = [...new Set(missing.map((m) => m.teamId).filter((x): x is string => Boolean(x)))];
        const captains = teamIds.length ? (await tx.select({ id: tournamentTeams.captainId }).from(tournamentTeams).where(and(eq(tournamentTeams.tournamentId, t.id), inArray(tournamentTeams.teamId, teamIds)))).map((c) => c.id) : [];
        const staff = [...new Set([fresh.organizerId, ...captains.filter((x): x is string => Boolean(x))])].filter((id) => !players.includes(id));
        await notifyUsers(staff, { type: "payment", title: "Bezahlung ist wieder möglich", body: `Die Bezahlung läuft wieder. Neue Frist für das Turnier: ${berlinTime(info.until)}. Es fehlen noch Karten.`, url: `/turniere/${t.id}` }, tx);
        return true;
      });
      if (sent) notified += 1;
    } catch (error) {
      console.error("notifyResumedGames: Fehler bei Turnier", t.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return notified;
}
