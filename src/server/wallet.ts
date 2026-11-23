import { clearCoversInvolving } from "./payments/cover-clear";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { auditLog, matchParticipants, matches, paymentCharges } from "@/db/schema";
import { joinClosedByTime, leaveClosedByTime } from "@/lib/deadlines";
import { MIN_PRIVATE_PLAYERS } from "@/lib/lobby-rules";
import { reservationFor, shareCents } from "@/lib/money";
import { audit } from "./audit";
import { priceFor } from "./pricing";
import { cardPaymentsEnabled, minPaidPlayers, paymentsEnabled } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

type MatchRow = typeof matches.$inferSelect;

export const FREE_CANCEL_HOURS = 24; // kostenlos abmelden bis 24 Stunden vor dem Anstoß

/** Privatspiel: Ab so vielen Stunden vor dem Anstoß ist die Teilnehmerliste gesperrt (kein Austritt, kein Rauswurf). */
export const PRIVATE_LIST_LOCK_HOURS = 48;
/** Ist die Teilnehmerliste dieses Altspiels (Privatspiel des alten Modells) gesperrt (weniger als 48 Stunden bis Anstoß)? Teamspiel und Turnier: nie. */
export function privateListLocked(match: Pick<MatchRow, "kind" | "startsAt">): boolean {
  return match.kind === "private" && match.startsAt.getTime() - Date.now() < PRIVATE_LIST_LOCK_HOURS * 3_600_000;
}

/**
 * Gilt für dieses Spiel die neue Frist-Regel (Verträge 006/008 v3)? Privat- und Teamspiele, die nach der Umstellung angelegt wurden.
 * Altspiele (`legacyShareModel`) behalten den alten Pfad bis zu ihrem Anstoß, Turniere haben eigene Regeln (M3b).
 */
export function isDeadlineModel(match: Pick<MatchRow, "kind" | "legacyShareModel">): boolean {
  return (match.kind === "private" || match.kind === "team") && !match.legacyShareModel;
}

/**
 * Gilt für dieses Spiel das Kartenmodell (Vertrag 012, M1)? Nur bei eingeschaltetem Schalter `card_payments_enabled` und nur für Spiele der Frist-Regel
 * (Privat- und Teamspiele des neuen Modells). Altspiele (`legacyShareModel`) sind geschlossen (012 F2). Im Kartenmodell bewegt die Lobby kein Geld (012 M6b: Guthaben entfernt).
 * Die Abbuchung (beim Fixieren, zur Frist, sofort) kommt mit M2.
 */
export async function cardModeActive(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "kind" | "legacyShareModel">): Promise<boolean> {
  return isDeadlineModel(match) && (await cardPaymentsEnabled(tx as Tx));
}

/**
 * Existieren für dieses Spiel Abbuchungszeilen (012 M2)? Dann ist die Abbuchung angelaufen oder abgeschlossen: Die Spielerliste und die Absage sind gesperrt,
 * weil Austritt, Einteilung oder Absage sonst Geld bewegen müssten, das schon (oder gleich) auf der Karte liegt (Erstattung = Stripe-Refund, kommt mit M3).
 * Gelesen unter der Spielsperre des Aufrufers (alle Listenänderungen und Absagen nehmen FOR UPDATE auf dem Spiel; die Zeilen legt runCharges ebenfalls unter
 * dieser Sperre an und committet sie, bevor Stripe etwas sieht). Das schließt das Fenster zwischen Beanspruchen und Stripe-Aufruf.
 */
export async function hasChargeRows(tx: Pick<Tx, "select">, matchId: string): Promise<boolean> {
  const [row] = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.matchId, matchId)).limit(1);
  return Boolean(row);
}

export const CHARGES_LOCKED = "Die Abbuchung für dieses Spiel hat begonnen: Die Teilnehmerliste ist gesperrt. Bitte kontaktiere den Support.";

type DeadlineFields = Pick<MatchRow, "id" | "kind" | "startsAt" | "createdAt" | "settledAt" | "finalShareCents" | "priceCents" | "legacyShareModel" | "schedulingOpen" | "vetoStatus">;

/** Können die Spieler jetzt überhaupt zahlen und "Bereit" drücken? Nicht, solange Termin oder Hallen-Veto laufen (lobby.ts sperrt beides). Dann gibt es keine Frist. */
export function payAndReadyPossible(match: Pick<MatchRow, "schedulingOpen" | "vetoStatus">): boolean {
  return !match.schedulingOpen && match.vetoStatus !== "halls" && match.vetoStatus !== "running";
}

/**
 * Ab wann zählt der Vorlauf? Meist ab der Anlage. Bei Teamspielen, deren Termin erst nachträglich festgelegt wird (Terminwahl, Herausforderung) oder
 * die ein Hallen-Veto durchlaufen, ab dem letzten dieser Zeitpunkte (Audit-Einträge "scheduling.locked" und "veto.done"): sonst wäre ein Spiel, das vor
 * Tagen angelegt und für morgen vereinbart wurde, schon über die 48-h-Frist hinaus, bevor jemand zahlen konnte. Keine eigene Spalte (keine Migration).
 */
export async function leadStart(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "kind" | "createdAt">): Promise<Date> {
  if (match.kind !== "team") return match.createdAt;
  const [row] = await tx
    .select({ at: sql<Date | null>`max(${auditLog.at})`.mapWith(auditLog.at) })
    .from(auditLog)
    .where(and(eq(auditLog.entity, "match"), eq(auditLog.entityId, match.id), inArray(auditLog.action, ["scheduling.locked", "veto.done"])));
  return row?.at ?? match.createdAt;
}

/**
 * Gilt die Frist-Regel jetzt auch ohne Privatspiel? Teamspiele halten die Regel nur ein, solange Zahlungen eingeschaltet sind
 * (ohne Zahlungen läuft die Lobby wie bisher kostenlos, Phase 1); Privatspiele immer.
 */
async function deadlineRulesActive(tx: Pick<Tx, "select">, match: DeadlineFields): Promise<boolean> {
  if (!isDeadlineModel(match)) return false;
  return match.kind === "private" || (await paymentsEnabled(tx as Tx));
}

/**
 * Darf jetzt niemand mehr beitreten? Neue Regel: Mit mindestens 48 Stunden Vorlauf bei der Anlage schließt die Lobby zur 48-h-Frist;
 * mit kürzerem Vorlauf bleibt der Beitritt offen bis zur Buchung (abgerechnet) oder zum 1-h-Abbruch. Altspiele: wie bisher (Privatspiel nach
 * dem Fixieren nur noch Ersatz für einen Ausgestiegenen, davor offen).
 */
export async function joinClosed(tx: Pick<Tx, "select">, match: DeadlineFields, now: Date): Promise<boolean> {
  if (await hasChargeRows(tx, match.id)) return true;
  if (await deadlineRulesActive(tx, match)) {
    if (match.settledAt !== null) return true;
    if (!payAndReadyPossible(match)) return false; // Termin oder Hallen-Veto laufen: zahlen geht noch nicht, also noch keine Frist
    return joinClosedByTime(match.startsAt, await leadStart(tx, match), now, match.createdAt);
  }
  if (match.kind !== "private" || !privateListLocked(match)) return false;
  if (match.finalShareCents === null) return false;
  if (!match.priceCents || !(await paymentsEnabled(tx as Tx))) return false;
  // Altspiel-Pfad (legacy, Guthaben): Der Ersatz-Beitritt unter 48 Stunden hing an offenen Erstattungsansprüchen (pending_refunds). Diese Ansprüche entstehen seit 012 M6b nicht mehr
  // und Altspiele sind geschlossen (F2): die Liste bleibt hier zu. Die Lesestelle auf pending_refunds ist damit entfernt (die Tabelle selbst fällt mit PR 2 aus der Nutzung).
  return true;
}

/** Sind Austritt und Rauswurf gesperrt? Neue Regel: ab 48 Stunden vor Anstoß (bei Anlage unter 48 Stunden von Anfang an) und nach der Abrechnung. */
export async function leaveClosed(tx: Pick<Tx, "select">, match: DeadlineFields, now: Date): Promise<boolean> {
  if (await hasChargeRows(tx, match.id)) return true;
  if (await deadlineRulesActive(tx, match)) return match.settledAt !== null || (payAndReadyPossible(match) && leaveClosedByTime(match.startsAt, now));
  return privateListLocked(match);
}

/** Preis des Spiels, falls noch nicht festgelegt aus den Preisregeln (Halle oder Standard) ermitteln und am Spiel speichern. */
export async function ensurePrice(tx: Tx, match: MatchRow): Promise<{ priceCents: number; costCents: number; match: MatchRow }> {
  if (match.priceCents !== null && match.costCents !== null) return { priceCents: match.priceCents, costCents: match.costCents, match };
  const price = await priceFor(tx, match.venueId, match.durationMin);
  if (!price) throw new DomainError("Für diese Spieldauer ist noch kein Preis hinterlegt. Bitte wende dich an die Admins.");
  const [updated] = await tx.update(matches).set({ priceCents: price.priceCents, costCents: price.costCents }).where(eq(matches.id, match.id)).returning();
  return { ...price, match: updated };
}

/** Betrag, den ein Spieler jetzt zahlt: vor der Abrechnung die Reservierung (höchster Anteil), danach der endgültige Anteil. */
export function amountToCharge(match: Pick<MatchRow, "settledAt" | "finalShareCents">, priceCents: number, minPaid: number): number {
  return match.settledAt && match.finalShareCents ? match.finalShareCents : reservationFor(priceCents, minPaid);
}

/**
 * Anteil im Teamspiel nach dem neuen Modell (008): Hallenpreis geteilt durch die Zahl der eingeteilten Spieler (aufgerundet, mindestens 4 wie der
 * Wertebereich der Spielerzahl), ohne Mindestzahl 8, ohne Deckel 12 und ohne Reservierung. Nach der Abrechnung gilt der feste Anteil.
 * Spiele des alten Modells (`legacyShareModel`) rechnen weiter mit `amountToCharge`.
 */
export async function teamShareNow(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "finalShareCents">, priceCents: number): Promise<number> {
  if (match.finalShareCents !== null) return match.finalShareCents; // fixiert (zweites Bereit) oder abgerechnet
  return shareCents(priceCents, Math.max(await seatedCount(tx, match.id), MIN_PRIVATE_PLAYERS));
}

/**
 * Rechnet das Spiel nach dem Modell "Preis ÷ eingeteilte Spieler" mit Neuberechnung und Fixierung? Privatspiele immer, Teamspiele (nicht Turnier)
 * nur, wenn sie nach der Umstellung angelegt wurden. Altspiele (`legacyShareModel`) behalten Reservierung und Mindestzahl.
 */
export function usesFixedShareModel(match: Pick<MatchRow, "kind" | "legacyShareModel">): boolean {
  return match.kind === "private" || (match.kind === "team" && !match.legacyShareModel);
}

/** Divisor des Anteils: eingeteilte Spieler; im Teamspiel mindestens 4 (Wertebereich der Spielerzahl). */
export function shareDivisor(match: Pick<MatchRow, "kind">, seated: number): number {
  return match.kind === "private" ? seated : Math.max(seated, MIN_PRIVATE_PLAYERS);
}

/** Betrag, den ein Spieler jetzt zahlt, je nach Modell: Privatspiel und neues Teamspiel Miete ÷ Spielerzahl, Altspiel die Reservierung. */
export async function shareToCharge(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "kind" | "finalShareCents" | "settledAt" | "legacyShareModel">, priceCents: number): Promise<number> {
  if (match.kind === "private") return privateShareNow(tx, match, priceCents);
  if (usesFixedShareModel(match)) return teamShareNow(tx, match, priceCents);
  return amountToCharge(match, priceCents, await minPaidPlayers(tx));
}

/**
 * Anteil im Privatspiel: Miete geteilt durch die Zahl der eingeteilten Spieler (aufgerundet, ohne Deckel und ohne Mindestzahl).
 * Steht der Preis schon fest (zweites Bereit), gilt der feste Anteil. Nur für Privatspiele; Teamspiel und Turnier rechnen weiter mit der Reservierung.
 */
export async function privateShareNow(tx: Pick<Tx, "select">, match: Pick<MatchRow, "id" | "finalShareCents">, rentCents: number): Promise<number> {
  if (match.finalShareCents !== null) return match.finalShareCents;
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(matchParticipants).where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  return shareCents(rentCents, Math.max(n, 1));
}

/**
 * Zweites Bereit im Privatspiel (beide Captains haben bestätigt): Die Spielerzahl wird festgeschrieben, der Anteil steht fest.
 * Hat jemand zu viel gezahlt, geht die Differenz sofort zurück (fester Schlüssel je Spieler); hat jemand zu wenig gezahlt, wird abgelehnt
 * (die ganze Bestätigung wird zurückgerollt; Nachfordern ist Teil der Neuberechnung). Genau einmal: Der Aufrufer hält die Zeilensperre
 * auf dem Spiel, und nur `final_share_cents IS NULL` darf fixiert werden. Die Abrechnung beim Anstoß (Beleg, Benachrichtigung, `settled_at`)
 * läuft danach unverändert weiter und übernimmt diesen Anteil.
 */
export async function fixShare(tx: Tx, match: MatchRow): Promise<void> {
  if (!usesFixedShareModel(match)) return;
  const [current] = await tx.select({ finalShareCents: matches.finalShareCents }).from(matches).where(eq(matches.id, match.id));
  if (!current || current.finalShareCents !== null) return; // schon fixiert

  const { priceCents } = await ensurePrice(tx, match);
  const seated = await tx
    .select({ userId: matchParticipants.userId })
    .from(matchParticipants)
    .where(and(eq(matchParticipants.matchId, match.id), isNotNull(matchParticipants.teamId)));
  if (seated.length === 0) return;
  const share = shareCents(priceCents, shareDivisor(match, seated.length));
  // Nur Preis und Spielerzahl festschreiben; die Lobby bewegt kein Geld (012 M6b: Guthaben entfernt, abgebucht wird von der Karte)
  const [fixed] = await tx.update(matches).set({ finalShareCents: share }).where(and(eq(matches.id, match.id), isNull(matches.finalShareCents))).returning({ id: matches.id });
  if (!fixed) return;
  await audit(null, match.kind === "private" ? "wallet.private_fix" : "wallet.team_fix", "match", match.id, { after: { players: seated.length, finalShareCents: share, rentCents: priceCents } }, tx);
}

/** Zahl der einem Team zugeteilten Spieler (nur diese zählen für den Anteil im Privatspiel). */
export async function seatedCount(tx: Pick<Tx, "select">, matchId: string): Promise<number> {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), isNotNull(matchParticipants.teamId)));
  return n;
}

/**
 * Privatspiel vor dem Fixieren: Hat sich die Zahl der eingeteilten Spieler geändert, wird "Bereit" beider Captains zurückgesetzt; der Anteil wird neu angezeigt (Miete ÷ neue Zahl).
 * Keine Erstattung und keine Nachforderung: die Lobby bewegt kein Geld (012 M6b). Der Aufrufer hält die Zeilensperre auf dem Spiel (genau einmal je Änderung).
 */
export async function recalcShares(tx: Tx, match: MatchRow, actorId: string | null): Promise<void> {
  if (!usesFixedShareModel(match)) return;
  const [current] = await tx.select().from(matches).where(eq(matches.id, match.id));
  if (!current || current.finalShareCents !== null) return; // Preis steht fest: nichts neu rechnen
  await tx.update(matches).set({ homeFinalAt: null, awayFinalAt: null }).where(eq(matches.id, match.id));
  // Keine Erstattung und keine Nachforderung: der Anteil wird nur neu angezeigt (Miete ÷ eingeteilte Spieler); "Bereit" ist zurückgesetzt
  await audit(actorId, "wallet.private_recalc", "match", match.id, { after: { bereitReset: true } }, tx);
}

/** Wird aufgerufen, wenn jemand die Lobby verlässt oder entfernt wird: Übernahmen (012 M3c-3) enden mit dem Platz. Geld bewegt die Lobby nicht (012 M6b). */
export async function onParticipantLeaves(tx: Tx, match: MatchRow, userId: string) {
  await clearCoversInvolving(tx, match.id, userId); // Wiedereintritt braucht neue Zustimmung
}
