// Zusage der Halle fuer Turniere (Vertrag 012, M5-7b, Plan 19.3/19.11/19.12). Der Betreiber einer Halle MIT Zugang sagt ein fixiertes Turnier zu (Snapshot "Zugang noetig"); ohne Zusage ist es
// nie abbuchbar (hallZusageOk) und wird zur Frist abgesagt. Backlog 161 (Plan docs/design/plan-turnier-ablehnen.md): die Halle kann auch ABLEHNEN (declineTournamentVenue, nur Grund-Kategorie, kein Freitext
// an Teams); die Ablehnung sagt nichts ab: Frist-Absage wie bisher, der Veranstalter waehlt eine andere Halle (reopenRosters + setTournamentVenue) oder sagt selbst ab.
//
// Beweisprotokoll: kein App-Aufruf einer Beweisfunktion in dieser Transaktion (Zaehlersperre vor dem COMMIT waere ein Deadlock-Muster). Der Eintrag entsteht durch den DEFERRABLE-Trigger auf
// tournaments (Nachlieferung 009 M3, Migration 0054, Variante T): UPDATE venue_confirmed_at NULL -> Wert. DIESE Datei setzt nur die Spalten.
// venue_confirmed_by (0054) wird mit der Zusage gesetzt und bei den Resets geleert.
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, paymentCharges } from "@/db/schema";
import { venues } from "@/db/schema-finance";
import { tournamentTeams, tournaments } from "@/db/schema-league";
import { DECLINE_LABELS, validateDecline } from "@/lib/hall-decline";
import { formatEuro } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { audit } from "./audit";
import { notifyUsers } from "./notifications";
import { hasTournamentChargeRows } from "./payments/tournament-cancel";
import { DomainError } from "./teams";
import type { Tx } from "./tx";
import { chargeDueAt, lockTournament } from "./tournaments";
import { accessHolderIdsOf, holderText, NOTIFY_ACCESS_HOLDERS, notifyHolderOnFix } from "./tournament-holders";
import { zusageRequired } from "./tournament-venue";
import { hasVenueAccess, venueIdsOf } from "./venue-access-rules";

export { holderText, NOTIFY_ACCESS_HOLDERS, notifyHolderOnFix };

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

/**
 * Erinnerung nach einer Ablehnung der Halle (Plan 4): nennt keine Rechtsfolge, keine Namen Dritter, nie den Freitext. "kann nicht ausrichten" statt "abgesagt": das Turnier selbst ist NICHT abgesagt.
 * Zwei Fassungen: nur der Veranstalter kann eine andere Halle waehlen oder das Turnier absagen, die Captains erfahren nur, dass er entscheidet.
 */
export function hallDeclinedReminderText(tournamentName: string, hours: number, forOrganizer = true): string {
  return forOrganizer
    ? `${tournamentName}: Die Halle kann das Turnier nicht ausrichten. Wähle eine andere Halle oder sage das Turnier ab. Die Frist ist in etwa ${hours} Stunden.`
    : `${tournamentName}: Die Halle kann das Turnier nicht ausrichten. Der Veranstalter wählt eine andere Halle oder sagt das Turnier ab. Die Frist ist in etwa ${hours} Stunden.`;
}

/** Mitteilung an Veranstalter und Captains bei einer Ablehnung: Turnier, Halle und die Kategorie in Worten; nie der Freitext, nie der Betreiber. */
export function hallDeclinedText(tournamentName: string, venueName: string, code: keyof typeof DECLINE_LABELS): string {
  return `${venueName} kann ${tournamentName} nicht ausrichten (Grund: ${DECLINE_LABELS[code]}). Der Veranstalter wählt eine andere Halle oder sagt das Turnier ab.`;
}

const NOT_POSSIBLE = "Dieses Turnier lässt sich gerade nicht zusagen.";
/** Meldung an die Halle: die Ablehnung ist endgueltig (Entscheid t2q); Wortlaut auch fuer Hinweis und Rueckmeldung der Oberflaeche (PR 2). Entwurf, keine Rechtsaussage. */
export const HALL_DECLINE_FINAL = "Die Ablehnung ist endgültig. Bitte den Veranstalter, die Halle erneut zu wählen.";
const DECLINE_NOT_POSSIBLE = "Dieses Turnier lässt sich gerade nicht ablehnen.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Zusage der Halle (Aktion des Betreibers, im Namen der Halle). Eine Transaktion, Reihenfolge: Turnier (gesperrt) -> Zugang (nur gelesen). Pruefungen: Status payment, kein Bracket, nicht
 * abgesagt; Halle gesetzt; Snapshot "Zugang noetig" = true; Zugang JETZT aktiv (hasVenueAccess, auch nach Entzug nie moeglich); vor der Abbuchungsfrist (DB-Uhr). Idempotent: schon zugesagt = nichts zu tun.
 * Setzt nur die Spalte(n); der Beweiseintrag entsteht durch den Trigger der Nachlieferung. opts.now nur fuer Tests (sonst die Datenbankuhr).
 */
export async function confirmTournamentVenue(userId: string, tournamentId: string, opts: { now?: Date } = {}): Promise<{ confirmed: boolean }> {
  return db.transaction(async (tx) => {
    // N1 (Security): keine Zeilensperre fremder Turniere und kein Roh-Fehler bei ungueltiger ID: erst die ID-Form, dann die Berechtigung (OHNE Sperre gelesen), erst danach die Turniersperre.
    if (typeof tournamentId !== "string" || !UUID.test(tournamentId)) throw new DomainError(NOT_POSSIBLE);
    const [pre] = await tx.select({ venueId: tournaments.venueId }).from(tournaments).where(eq(tournaments.id, tournamentId));
    if (!pre?.venueId || !(await hasVenueAccess(pre.venueId, userId, tx))) throw new DomainError(NOT_POSSIBLE);
    // Turniersperre; ein unbekanntes Turnier (lockTournament wirft) bekommt dieselbe neutrale Meldung wie jeder andere Mangel
    let t: Awaited<ReturnType<typeof lockTournament>>;
    try {
      t = await lockTournament(tx, tournamentId);
    } catch (error) {
      if (error instanceof DomainError) throw new DomainError(NOT_POSSIBLE);
      throw error;
    }
    // BERECHTIGUNG ZUERST (R-T244 1): Zugang zur Halle DES Turniers, jetzt (aktiv, nicht gesperrt, kein Admin); nur gelesen. Jeder Mangel (kein Zugang, keine Halle, abgesagt, fixiert, Snapshot) gibt
    // dem Unberechtigten dieselbe Antwort: nichts verraet, ob es das Turnier gibt oder in welchem Stand es ist.
    if (!t.venueId || !(await hasVenueAccess(t.venueId, userId, tx))) throw new DomainError(NOT_POSSIBLE);
    if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt) throw new DomainError(NOT_POSSIBLE);
    if (t.venueConfirmedAt) return { confirmed: false }; // schon zugesagt: nichts aendern, kein Fehler
    // Entscheid t2q (2026-11-24): die Entscheidung der Halle je Anfrage ist ENDGUELTIG (append-only, Veranstalter und Teams sind evtl. schon informiert). Will die Halle doch, waehlt der Veranstalter sie erneut
    // (neue Anfrage, neuer Beweiseintrag; der Hallenwechsel setzt die Ablehnung zurueck). Die Meldung geht nur an einen Berechtigten (Zugang zur Halle ist oben geprueft).
    if (t.venueDeclinedAt) throw new DomainError(HALL_DECLINE_FINAL);
    const now = opts.now ?? (await dbNow(tx));
    const due = await chargeDueAt(tx, t);
    // dieselbe Regel wie die Abbuchungspruefung (zusageRequired): verlangt sie eine Zusage, nimmt diese Aktion sie an (Snapshot true ODER Live-Pflicht vor der Frist)
    const required = await zusageRequired(tx, t, due);
    if (!required) throw new DomainError(NOT_POSSIBLE);
    if (due && now.getTime() >= due.getTime()) throw new DomainError("Die Frist ist vorbei. Das Turnier wird nicht mehr zugesagt.");
    const livePflicht = t.venueAccessRequiredSnapshot !== true; // Snapshot war false: die Live-Pflicht wird mit der Zusage festgehalten
    // EINE Anweisung; die Bedingung "is null" macht es zum Compare-and-set (der Trigger feuert nur beim Uebergang NULL -> Wert). venue_confirmed_by (Akteur, 0054) steht in derselben Anweisung.
    const updated = await tx.update(tournaments).set({ venueConfirmedAt: sql`now()`, venueConfirmedBy: userId, ...(livePflicht ? { venueAccessRequiredSnapshot: true } : {}) }).where(and(eq(tournaments.id, t.id), isNull(tournaments.venueConfirmedAt))).returning({ id: tournaments.id });
    if (updated.length === 0) return { confirmed: false };
    await audit(userId, "tournament.venue_confirm", "tournament", t.id, { after: { venueId: t.venueId, livePflicht } }, tx);
    // Die Mitteilung laeuft in einem Savepoint (wie der Webhook-Alarm): ein Fehler dort darf die Zusage nicht kippen
    try {
      await tx.transaction(async (sp) => {
        const [v] = await sp.select({ name: venues.name }).from(venues).where(eq(venues.id, t.venueId!));
        const captains = await sp.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
        const recipients = [...new Set([t.organizerId, ...captains.map((c) => c.captainId)])].filter((x): x is string => Boolean(x));
        // im Namen der Halle: die Mitteilung nennt Halle und Turnier, keine Person
        await notifyUsers(recipients, { type: "system", title: "Zusage der Halle", body: `${v?.name ?? "Die Halle"} hat für ${t.name} zugesagt.`, url: `/turniere/${t.id}` }, sp);
      });
    } catch {
      /* die Zusage gilt; die Mitteilung ist Zugabe */
    }
    return { confirmed: true };
  });
}

/**
 * Ablehnung der Halle mit Grund (Backlog 161, Plan 2/3). Gleiche Berechtigung wie die Zusage (aktiver Zugang zur Halle DES Turniers, Reihenfolge Pruefung ohne Sperre -> Turniersperre -> Berechtigung erneut) und
 * dieselbe neutrale Antwort bei jedem Mangel. Erlaubt nur: Status payment, kein Bracket, nicht abgeschlossen, Snapshot verlangt die Zusage, Frist nicht vorbei, noch keine Zusage und KEINE Abbuchungszeile
 * (ab der ersten Abbuchung bleibt nur die Absage durch Admin 1 mit Erstattung). Idempotent: schon abgelehnt = nichts zu tun. Setzt nur die Spalten (Compare-and-set); den Beweiseintrag
 * 'declined' schreibt der Trigger beim Commit. Der Freitext geht als Sitzungswert in die Transaktion (nur Beweisprotokoll), nie in Mitteilungen.
 */
export async function declineTournamentVenue(userId: string, tournamentId: string, input: { code?: string | null; text?: string | null }, opts: { now?: Date } = {}): Promise<{ declined: boolean }> {
  return db.transaction(async (tx) => {
    if (typeof tournamentId !== "string" || !UUID.test(tournamentId)) throw new DomainError(DECLINE_NOT_POSSIBLE);
    const [pre] = await tx.select({ venueId: tournaments.venueId }).from(tournaments).where(eq(tournaments.id, tournamentId));
    if (!pre?.venueId || !(await hasVenueAccess(pre.venueId, userId, tx))) throw new DomainError(DECLINE_NOT_POSSIBLE);
    let t: Awaited<ReturnType<typeof lockTournament>>;
    try {
      t = await lockTournament(tx, tournamentId);
    } catch (error) {
      if (error instanceof DomainError) throw new DomainError(DECLINE_NOT_POSSIBLE);
      throw error;
    }
    if (!t.venueId || !(await hasVenueAccess(t.venueId, userId, tx))) throw new DomainError(DECLINE_NOT_POSSIBLE);
    // erst NACH der Berechtigung: Eingabefehler (Kategorie fehlt, "sonstiges" ohne Begruendung) sind Meldungen an den Betreiber
    const check = validateDecline(input);
    if (!check.ok) throw new DomainError(Object.values(check.fieldErrors)[0] ?? DECLINE_NOT_POSSIBLE);
    if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt || t.venueConfirmedAt) throw new DomainError(DECLINE_NOT_POSSIBLE);
    if (t.venueDeclinedAt) return { declined: false }; // schon abgelehnt: nichts aendern
    if (await hasTournamentChargeRows(tx, t.id)) throw new DomainError(DECLINE_NOT_POSSIBLE); // ab der ersten Abbuchungszeile gesperrt (Entscheid t2q b)
    const now = opts.now ?? (await dbNow(tx));
    const due = await chargeDueAt(tx, t);
    if (!(await zusageRequired(tx, t, due))) throw new DomainError(DECLINE_NOT_POSSIBLE);
    if (due && now.getTime() >= due.getTime()) throw new DomainError("Die Frist ist vorbei. Das Turnier wird nicht mehr abgelehnt.");
    if (check.text) {
      // Freitext nur fuer den Trigger (Beweisprotokoll); Name der Sitzungsvariable baut die Datenbank (wie veto.ts), gilt bis zum Transaktionsende
      await tx.execute(sql`select set_config(evidence_session_key('evidence_reason', ${t.id}::uuid, ${t.venueId}::uuid), ${check.text}, true)`);
    }
    const updated = await tx
      .update(tournaments)
      .set({ venueDeclinedAt: sql`now()`, venueDeclinedBy: userId, venueDeclineCode: check.code })
      .where(and(eq(tournaments.id, t.id), isNull(tournaments.venueDeclinedAt), isNull(tournaments.venueConfirmedAt)))
      .returning({ id: tournaments.id });
    if (updated.length === 0) return { declined: false };
    await audit(userId, "tournament.venue_decline", "tournament", t.id, { after: { venueId: t.venueId, code: check.code } }, tx); // nie der Freitext
    try {
      await tx.transaction(async (sp) => {
        const [v] = await sp.select({ name: venues.name }).from(venues).where(eq(venues.id, t.venueId!));
        const captains = await sp.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
        const recipients = [...new Set([t.organizerId, ...captains.map((c) => c.captainId)])].filter((x): x is string => Boolean(x));
        await notifyUsers(recipients, { type: "system", title: "Die Halle kann nicht ausrichten", body: hallDeclinedText(t.name, v?.name ?? "Die Halle", check.code), url: `/turniere/${t.id}` }, sp);
      });
    } catch {
      /* die Ablehnung gilt; die Mitteilung ist Zugabe */
    }
    return { declined: true };
  });
}

async function dbNow(tx: Pick<typeof db, "execute">): Promise<Date> {
  const r = await tx.execute(sql`select now() as n`);
  return new Date((r.rows as { n: Date | string }[])[0].n);
}

export type HallConfirmation = { tournamentId: string; name: string; venueName: string; startsAt: Date | null; durationMin: number; teams: number; rentCents: number | null; due: Date | null; declined: boolean; chargesStarted: boolean };

/**
 * Turniere, die der Betreiber zusagen kann (Entscheid F1/F3): eigene Hallen, Status payment, eingefrorene Halle mit Snapshot "Zugang noetig", Zusage fehlt, Frist nicht vorbei. NAMENFREI:
 * Turniername, Termin, Dauer, Teamzahl, Hallenmiete; nie Spieler, Teams oder Veranstalter.
 */
export async function listTournamentConfirmations(userId: string, nowOverride?: Date): Promise<HallConfirmation[]> {
  const mine = await venueIdsOf(userId);
  if (mine.length === 0) return [];
  const now = nowOverride ?? (await dbNow(db)); // Datenbankuhr (R-T255 N5)
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      venueName: venues.name,
      startsAt: tournaments.startsAt,
      durationMin: tournaments.durationMin,
      totalCents: tournaments.totalCents,
      createdAt: tournaments.createdAt,
      registrationDeadline: tournaments.registrationDeadline,
      venueId: tournaments.venueId,
      snapshot: tournaments.venueAccessRequiredSnapshot,
      teams: sql<number>`(select count(*)::int from tournament_teams x where x.tournament_id = ${tournaments.id})`,
      declinedAt: tournaments.venueDeclinedAt,
      chargesStarted: sql<boolean>`exists (select 1 from payment_charges c where c.tournament_id = ${tournaments.id})`,
    })
    .from(tournaments)
    .innerJoin(venues, eq(venues.id, tournaments.venueId))
    .where(and(inArray(tournaments.venueId, mine), eq(tournaments.status, "payment"), isNotNull(tournaments.venueAccessRequiredSnapshot), isNull(tournaments.venueConfirmedAt), isNull(tournaments.bracketGeneratedAt), isNotNull(tournaments.startsAt)))
    .orderBy(asc(tournaments.startsAt));
  const out: HallConfirmation[] = [];
  for (const r of rows) {
    // die Frist rechnet je Turnier (sie liest den Zeitpunkt der Preisfestlegung); die Zahl der Turniere je Halle ist klein
    const due = await chargeDueAt(db, { startsAt: r.startsAt, createdAt: r.createdAt, registrationDeadline: r.registrationDeadline, id: r.id });
    if (due && now.getTime() >= due.getTime()) continue;
    // dieselbe Regel wie Abbuchungspruefung und Zusage (zusageRequired): auch ein Turnier mit Live-Pflicht (Zugang ohne Einloesen entstanden, N2) steht in der Liste
    if (!(await zusageRequired(db, { id: r.id, venueId: r.venueId, venueAccessRequiredSnapshot: r.snapshot, venueConfirmedAt: null }, due))) continue;
    out.push({ tournamentId: r.id, name: r.name, venueName: r.venueName, startsAt: r.startsAt, durationMin: r.durationMin ?? 0, teams: Number(r.teams), rentCents: r.totalCents, due, declined: r.declinedAt !== null, chargesStarted: Boolean(r.chargesStarted) });
  }
  return out;
}

export const rentText = (c: number | null) => (c === null ? "" : formatEuro(c));

/**
 * Erinnerung an den Veranstalter und die Captains, solange die Halle nicht zugesagt hat: 24 h und 6 h vor der Frist, je Stufe einmal je Turnier (Audit-Marker unter der Turniersperre), ohne
 * Namen Dritter; nur Turniere im Kartenmodell mit Snapshot "Zugang noetig" und fehlender Zusage. Gibt die Zahl der benachrichtigten Turniere zurueck. Wie notifyMissingCardReminders.
 */
export async function notifyHallConfirmReminders(nowOverride?: Date): Promise<number> {
  const now = nowOverride ?? (await dbNow(db)); // Datenbankuhr fuer die Stufen (R-T257 1); nur Tests geben die Zeit vor
  const candidates = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(and(eq(tournaments.status, "payment"), isNull(tournaments.bracketGeneratedAt), isNull(tournaments.settledAt), isNotNull(tournaments.venueAccessRequiredSnapshot), isNull(tournaments.venueConfirmedAt), isNotNull(tournaments.startsAt)));
  let sent = 0;
  for (const c of candidates) {
    try {
      await db.transaction(async (tx) => {
        const t = await lockTournament(tx, c.id);
        if (t.status !== "payment" || t.bracketGeneratedAt || t.settledAt || t.venueAccessRequiredSnapshot === null || t.venueConfirmedAt) return;
        const due = await chargeDueAt(tx, t);
        if (!due) return;
        if (!(await zusageRequired(tx, t, due))) return; // dieselbe Regel (N2): Snapshot true ODER Live-Pflicht
        const stage = currentReminderStage(now, due);
        if (stage === undefined) return;
        const action = `tournament.hall_reminder.${stage}`;
        const [done] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, t.id))).limit(1);
        if (done) return;
        const captains = await tx.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
        const recipients = [...new Set([t.organizerId, ...captains.map((x) => x.captainId)])].filter((x): x is string => Boolean(x));
        if (t.venueDeclinedAt) {
          const others = recipients.filter((x) => x !== t.organizerId);
          await notifyUsers([t.organizerId], { type: "system", title: "Die Halle kann nicht ausrichten", body: hallDeclinedReminderText(t.name, stage, true), url: `/turniere/${t.id}` }, tx);
          if (others.length > 0) await notifyUsers(others, { type: "system", title: "Die Halle kann nicht ausrichten", body: hallDeclinedReminderText(t.name, stage, false), url: `/turniere/${t.id}` }, tx);
        } else {
          await notifyUsers(recipients, { type: "system", title: "Halle hat noch nicht zugesagt", body: hallReminderText(t.name, stage), url: `/turniere/${t.id}` }, tx);
        }
        if (NOTIFY_ACCESS_HOLDERS && t.venueId) {
          // Savepoint (R-T247 c): ein Fehler bei den Zugangsinhabern darf weder die Erinnerung an den Veranstalter noch den Marker kippen
          try {
            await tx.transaction(async (sp) => {
              const holders = await accessHolderIdsOf(t.venueId!, sp);
              await notifyUsers(holders, { type: "system", title: "Zusage der Halle fehlt", body: holderText(t.name, t.startsAt, due, stage), url: "/halle" }, sp);
            });
          } catch {
            /* Zugabe */
          }
        }
        await audit(null, action, "tournament", t.id, { after: { recipients: recipients.length } }, tx);
        sent += 1;
      });
    } catch (error) {
      console.error("notifyHallConfirmReminders: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return sent;
}

/**
 * Fairness-Zusatz (Entscheid t2q, Plan 19.14): ein Zugang wird WIRKSAM (Einladung eingeloest), waehrend ein Turnier mit dieser Halle im Status payment ohne Zusage existiert und sein Snapshot
 * "Zusage noetig" false ist. Dann wird der Snapshot true gesetzt und die Zugangsinhaber werden wie beim Fixieren benachrichtigt (entprellt je Turnier und Preisrunde). In der Transaktion des Aufrufers
 * (redeemVenueInvites), NACH den Hallensperren; die Turniere werden nach id sortiert gesperrt. Gibt die Zahl der geaenderten Turniere zurueck.
 */
export async function armConfirmationForNewAccess(tx: Tx, venueIds: string[], opts: { now?: Date } = {}): Promise<number> {
  if (venueIds.length === 0) return 0;
  const now = opts.now ?? (await dbNow(tx)); // Datenbankuhr (nur Tests geben die Zeit vor)
  const candidates = await tx
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(
      and(
        inArray(tournaments.venueId, venueIds),
        eq(tournaments.status, "payment"),
        isNull(tournaments.venueConfirmedAt),
        isNull(tournaments.bracketGeneratedAt),
        isNull(tournaments.settledAt),
        sql`not exists (select 1 from payment_charges c where c.tournament_id = ${tournaments.id})`, // eine laufende oder erfolgte Abbuchung wird nie nachtraeglich zusagepflichtig
      ),
    )
    .orderBy(asc(tournaments.id));
  let armed = 0;
  for (const c of candidates) {
    // je Turnier ein Savepoint: ein Fehler hier darf das Einloesen des Zugangs nie kippen (sonst bliebe der Betreiber ausgesperrt); ohne Personendaten loggen
    try {
      await tx.transaction(async (sp) => {
        const t = await lockTournament(sp, c.id);
        if (t.status !== "payment" || t.venueConfirmedAt || t.bracketGeneratedAt || t.settledAt || !t.venueId || !venueIds.includes(t.venueId) || t.venueAccessRequiredSnapshot !== false) return; // nur: fixiert ohne Zusagepflicht, genau diese Hallen
        const [row] = await sp.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.tournamentId, t.id)).limit(1);
        if (row) return; // nach der Sperre erneut: Abbuchung hat begonnen
        const due = await chargeDueAt(sp, t);
        if (!due) return; // Altturnier ohne Frist: kein stilles Scharfschalten
        if (now.getTime() >= due.getTime()) return; // Frist vorbei: das Turnier laeuft/endet wie es ist
        await sp.update(tournaments).set({ venueAccessRequiredSnapshot: true }).where(eq(tournaments.id, t.id));
        await audit(null, "tournament.venue_access_armed", "tournament", t.id, { after: { venueId: t.venueId } }, sp);
        await notifyHolderOnFix(sp, { id: t.id, name: t.name, venueId: t.venueId, startsAt: t.startsAt, priceRound: t.priceRound }, due);
        armed += 1;
      });
    } catch (error) {
      console.error("armConfirmationForNewAccess: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
      try {
        await audit(null, "tournament.venue_access_arm_failed", "tournament", c.id, {}, tx); // ohne Details (R-T251 4)
      } catch {
        /* das Protokoll ist Zugabe */
      }
    }
  }
  return armed;
}
