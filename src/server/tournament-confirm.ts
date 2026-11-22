// Zusage der Halle fuer Turniere (Vertrag 012, M5-7b, Plan 19.3/19.11/19.12). Der Betreiber einer Halle MIT Zugang sagt ein fixiertes Turnier zu (Snapshot "Zugang noetig"); ohne Zusage ist es
// nie abbuchbar (hallZusageOk) und wird zur Frist abgesagt. Es gibt KEIN "Ablehnen" (Entscheid t2q F4, Backlog 161): Nicht-Zusage = Absage zur Frist, dafuer die Erinnerung 24 h und 6 h vorher.
//
// Beweisprotokoll: kein App-Aufruf einer Beweisfunktion in dieser Transaktion (Zaehlersperre vor dem COMMIT waere ein Deadlock-Muster). Der Eintrag entsteht durch den DEFERRABLE-Trigger auf
// tournaments (Nachlieferung 009 M3, Migration 0054, Variante T): UPDATE venue_confirmed_at NULL -> Wert. DIESE Datei setzt nur die Spalten.
// STAND: UNGETESTET GEGEN DIE DATENBANK, und venue_confirmed_by gibt es erst mit 0054 (TODO(0054): in confirmTournamentVenue und resetVenueConfirmation mit setzen/leeren).
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { formatEuro } from "@/lib/money";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";
import { DomainError } from "./teams";
import { chargeDueAt, lockTournament } from "./tournaments";
import { hasVenueAccess, venueIdsOf } from "./venue-access-rules";

/** Erinnerungsstufen vor der Frist (Entscheid t2q F4): 24 h und 6 h, je Stufe einmal je Turnier. */
export const HALL_REMINDER_STAGES = [24, 6] as const;

/** Die Stufe, die jetzt gilt: die kleinste Stufe, deren Zeitpunkt erreicht ist; undefined = zu frueh oder die Frist ist vorbei. Rein rechnerisch (Unit-Test). */
export function currentReminderStage(now: Date, due: Date, stages: readonly number[] = HALL_REMINDER_STAGES): number | undefined {
  if (now.getTime() >= due.getTime()) return undefined;
  const reached = stages.filter((h) => now.getTime() >= due.getTime() - h * 3_600_000);
  return reached.length === 0 ? undefined : Math.min(...reached);
}

/** Text der Erinnerung an den Veranstalter und die Captains: nennt das Turnier, keine Namen Dritter. */
export function hallReminderText(tournamentName: string, hours: number): string {
  return `${tournamentName}: Die Halle hat noch nicht zugesagt. Ohne Zusage fällt das Turnier aus. Die Frist ist in etwa ${hours} Stunden.`;
}

const NOT_POSSIBLE = "Dieses Turnier lässt sich gerade nicht zusagen.";

/**
 * Zusage der Halle (Aktion des Betreibers, im Namen der Halle). Eine Transaktion, Reihenfolge: Turnier (gesperrt) -> Zugang (nur gelesen). Pruefungen: Status payment, kein Bracket, nicht
 * abgesagt; Halle gesetzt; Snapshot "Zugang noetig" = true; Zugang JETZT aktiv (hasVenueAccess, auch nach Entzug nie moeglich); vor der Abbuchungsfrist (DB-Uhr). Idempotent: schon zugesagt = nichts zu tun.
 * Setzt nur die Spalte(n); der Beweiseintrag entsteht durch den Trigger der Nachlieferung. opts.now nur fuer Tests (sonst die Datenbankuhr).
 */
export async function confirmTournamentVenue(userId: string, tournamentId: string, opts: { now?: Date } = {}): Promise<{ confirmed: boolean }> {
  return db.transaction(async (tx) => {
    const t = await lockTournament(tx, tournamentId); // Turniersperre zuerst
    if (t.status === "cancelled" || t.status === "finished") throw new DomainError("Das Turnier ist schon beendet oder abgesagt.");
    if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt) throw new DomainError(NOT_POSSIBLE);
    if (!t.venueId) throw new DomainError("Für dieses Turnier ist keine Halle gewählt.");
    // Zugang zur Halle des Turniers, jetzt: der Betreiber muss aktiv sein (nicht gesperrt, kein Admin); gelesen, nie gesperrt
    if (!(await hasVenueAccess(t.venueId, userId, tx))) throw new DomainError(NOT_POSSIBLE);
    if (t.venueAccessRequiredSnapshot !== true) throw new DomainError(NOT_POSSIBLE); // nichts zuzusagen (Halle hatte beim Fixieren keinen Zugang)
    if (t.venueConfirmedAt) return { confirmed: false }; // schon zugesagt: nichts aendern, kein Fehler
    const now = opts.now ?? (await dbNow(tx));
    const due = await chargeDueAt(tx, t);
    if (due && now.getTime() >= due.getTime()) throw new DomainError("Die Frist ist vorbei. Das Turnier wird nicht mehr zugesagt.");
    // EINE Anweisung; die Bedingung "is null" macht es zum Compare-and-set (der Trigger feuert nur beim Uebergang NULL -> Wert). TODO(0054): venueConfirmedBy: userId in dieselbe Anweisung.
    const updated = await tx.update(tournaments).set({ venueConfirmedAt: sql`now()` }).where(and(eq(tournaments.id, t.id), isNull(tournaments.venueConfirmedAt))).returning({ id: tournaments.id });
    if (updated.length === 0) return { confirmed: false };
    await audit(userId, "tournament.venue_confirm", "tournament", t.id, { after: { venueId: t.venueId } }, tx);
    const [v] = await tx.select({ name: venues.name }).from(venues).where(eq(venues.id, t.venueId));
    const captains = await tx.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
    const recipients = [...new Set([t.organizerId, ...captains.map((c) => c.captainId)])].filter((x): x is string => Boolean(x));
    // im Namen der Halle: die Mitteilung nennt Halle und Turnier, keine Person
    await notifyUsers(recipients, { type: "system", title: "Zusage der Halle", body: `${v?.name ?? "Die Halle"} hat für ${t.name} zugesagt.`, url: `/turniere/${t.id}` }, tx);
    return { confirmed: true };
  });
}

async function dbNow(tx: Pick<typeof db, "execute">): Promise<Date> {
  const r = await tx.execute(sql`select now() as n`);
  return new Date((r.rows as { n: Date | string }[])[0].n);
}

export type HallConfirmation = { tournamentId: string; name: string; venueName: string; startsAt: Date | null; durationMin: number; teams: number; rentCents: number | null; due: Date | null };

/**
 * Turniere, die der Betreiber zusagen kann (Entscheid F1/F3): eigene Hallen, Status payment, eingefrorene Halle mit Snapshot "Zugang noetig", Zusage fehlt, Frist nicht vorbei. NAMENFREI:
 * Turniername, Termin, Dauer, Teamzahl, Hallenmiete; nie Spieler, Teams oder Veranstalter.
 */
export async function listTournamentConfirmations(userId: string, now: Date = new Date()): Promise<HallConfirmation[]> {
  const mine = await venueIdsOf(userId);
  if (mine.length === 0) return [];
  const rows = await db
    .select({ id: tournaments.id, name: tournaments.name, venueId: tournaments.venueId, startsAt: tournaments.startsAt, durationMin: tournaments.durationMin, totalCents: tournaments.totalCents, createdAt: tournaments.createdAt, registrationDeadline: tournaments.registrationDeadline })
    .from(tournaments)
    .where(and(inArray(tournaments.venueId, mine), eq(tournaments.status, "payment"), eq(tournaments.venueAccessRequiredSnapshot, true), isNull(tournaments.venueConfirmedAt), isNull(tournaments.bracketGeneratedAt), isNotNull(tournaments.startsAt)))
    .orderBy(asc(tournaments.startsAt));
  const out: HallConfirmation[] = [];
  for (const r of rows) {
    const [v] = await db.select({ name: venues.name }).from(venues).where(eq(venues.id, r.venueId!));
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, r.id));
    const due = await chargeDueAt(db, { startsAt: r.startsAt, createdAt: r.createdAt, registrationDeadline: r.registrationDeadline, id: r.id });
    if (due && now.getTime() >= due.getTime()) continue;
    out.push({ tournamentId: r.id, name: r.name, venueName: v?.name ?? "", startsAt: r.startsAt, durationMin: r.durationMin ?? 0, teams: n, rentCents: r.totalCents, due });
  }
  return out;
}

export const rentText = (c: number | null) => (c === null ? "" : formatEuro(c));

/**
 * Erinnerung an den Veranstalter und die Captains, solange die Halle nicht zugesagt hat: 24 h und 6 h vor der Frist, je Stufe einmal je Turnier (Audit-Marker unter der Turniersperre), ohne
 * Namen Dritter; nur Turniere im Kartenmodell mit Snapshot "Zugang noetig" und fehlender Zusage. Gibt die Zahl der benachrichtigten Turniere zurueck. Wie notifyMissingCardReminders.
 */
export async function notifyHallConfirmReminders(now: Date = new Date()): Promise<number> {
  const candidates = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.status, "payment"), isNull(tournaments.bracketGeneratedAt), isNull(tournaments.settledAt), eq(tournaments.venueAccessRequiredSnapshot, true), isNull(tournaments.venueConfirmedAt), isNotNull(tournaments.startsAt)));
  let sent = 0;
  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, c.id);
        if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt || t.venueAccessRequiredSnapshot !== true || t.venueConfirmedAt) return;
        const due = await chargeDueAt(tx, t);
        if (!due) return;
        const stage = currentReminderStage(now, due);
        if (stage === undefined) return;
        const action = `tournament.hall_reminder.${stage}`;
        const [done] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, t.id))).limit(1);
        if (done) return;
        const captains = await tx.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
        const recipients = [...new Set([t.organizerId, ...captains.map((x) => x.captainId)])].filter((x): x is string => Boolean(x));
        await notifyUsers(recipients, { type: "system", title: "Halle hat noch nicht zugesagt", body: hallReminderText(t.name, stage), url: `/turniere/${t.id}` }, tx);
        await audit(null, action, "tournament", t.id, { after: { recipients: recipients.length } }, tx);
        sent += 1;
      });
    } catch (error) {
      console.error("notifyHallConfirmReminders: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}
