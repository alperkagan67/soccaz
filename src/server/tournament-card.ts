// Turnier auf Karte (Vertrag 012, M5-3): Kartenstatus der Spieler, "Bereit" = Karte hinterlegt, "Anteil uebernehmen" (nur im eigenen Team).
// Der Kartenstatus eines Turnierspielers ist der Stand seines Profils (payment_profiles.payment_method_id), nicht ein Platzstatus wie im Teamspiel.
// Abgebucht wird hier NICHTS (kommt mit M5-4, zur Frist). Gilt nur im Kartenmodell: Schalter card_payments_enabled EIN und kein Platz mit Geld aus dem Guthabenmodell.
import { and, eq, gt, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { paymentCharges, paymentProfiles } from "@/db/schema";
import { tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { audienceFor, cardDisplayFor, type CardDisplay, type CardViewer } from "@/lib/card-visibility";
import { COVER_MANDATE_KEY } from "@/lib/cover";
import { audit } from "./audit";
import { validCoversOf, type CoverSeat } from "./payments/cover";
import { tournamentPaymentsActive } from "./settings";
import { DomainError } from "./teams";
import type { Tx } from "./tx";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_POSSIBLE = "Den Anteil kannst du gerade nicht übernehmen.";

/**
 * Gilt fuer dieses Turnier das Kartenmodell? Nur bei eingeschaltetem Schalter; liegt schon Geld im Turnier (ein Spieler mit paid_cents > 0 aus dem Guthabenmodell),
 * bleibt das Turnier im Guthabenmodell, bis es abgesagt oder beendet ist (kein Mischzustand; Altturniere werden zurueckgesetzt, Plan T-18). Unter der Turniersperre des Aufrufers lesen.
 */
export async function tournamentCardMode(tx: Pick<Tx, "select">, tournamentId: string): Promise<boolean> {
  if (!(await tournamentPaymentsActive(tx as Tx))) return false;
  // Kostenlose Turniere (Hallenkosten 0 bzw. Anteil 0) haben nichts abzubuchen: sie laufen wie bisher (Bereit ohne Karte, Bracket sofort), sonst haengen sie im Kartenmodell fest (Security-Review M5-3).
  const [t] = await tx.select({ totalCents: tournaments.totalCents, finalShareCents: tournaments.finalShareCents, entryFeeCents: tournaments.entryFeeCents }).from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t || t.totalCents === 0 || t.finalShareCents === 0 || (t.totalCents === null && t.entryFeeCents === 0)) return false;
  const [paid] = await tx.select({ userId: tournamentPlayers.userId }).from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tournamentId), gt(tournamentPlayers.paidCents, 0))).limit(1);
  return !paid;
}

export type Seat = CoverSeat & { hasCard: boolean };

/** Die Plaetze des Turniers als Plaetze im Sinne von validCoversOf: "card_ready" = Profil mit Zahlungsmittel, sonst "none". */
export async function seatsOf(tx: Pick<Tx, "select">, tournamentId: string, lock = false): Promise<Seat[]> {
  const q = tx
    .select({ userId: tournamentPlayers.userId, teamId: tournamentPlayers.teamId, coveredByUserId: tournamentPlayers.coveredByUserId, pm: paymentProfiles.paymentMethodId })
    .from(tournamentPlayers)
    .leftJoin(paymentProfiles, eq(paymentProfiles.userId, tournamentPlayers.userId))
    .where(eq(tournamentPlayers.tournamentId, tournamentId));
  const rows = await (lock ? q.for("update", { of: tournamentPlayers }) : q);
  return rows.map((r) => ({ userId: r.userId, teamId: r.teamId, coveredByUserId: r.coveredByUserId, cardStatus: r.pm ? "card_ready" : "none", hasCard: Boolean(r.pm) }));
}

/** Spieler ohne eigene Karte UND ohne gueltigen Uebernehmer (validCoversOf): fuer die Erinnerung vor der Frist. */
export async function tournamentMissingCards(tx: Pick<Tx, "select">, tournamentId: string): Promise<{ userId: string; teamId: string | null }[]> {
  const seats = await seatsOf(tx, tournamentId);
  const valid = validCoversOf(seats, true);
  return seats.filter((s) => !s.hasCard && !valid.has(s.userId)).map((s) => ({ userId: s.userId, teamId: s.teamId }));
}

/** Hat in JEDEM Team jeder Spieler eine Karte oder einen gueltigen Uebernehmer (validCoversOf)? Fuer die Frist: ohne vollstaendige Karten kann nicht abgebucht werden. */
export async function tournamentAllCardsReady(tx: Pick<Tx, "select">, tournamentId: string): Promise<boolean> {
  const seats = await seatsOf(tx, tournamentId);
  if (seats.length === 0) return false;
  const valid = validCoversOf(seats, true);
  return seats.every((s) => s.hasCard || valid.has(s.userId));
}

/** Hat jeder Spieler des Teams eine Karte oder einen gueltigen Uebernehmer? Ein leeres Team ist nicht bereit. */
export async function tournamentTeamCardsReady(tx: Pick<Tx, "select">, tournamentId: string, teamId: string): Promise<boolean> {
  const seats = await seatsOf(tx, tournamentId);
  const mine = seats.filter((s) => s.teamId === teamId);
  if (mine.length === 0) return false;
  const valid = validCoversOf(seats, true);
  return mine.every((s) => s.hasCard || valid.has(s.userId));
}

/** Loescht jede Uebernahme, an der der Nutzer beteiligt ist (als Platz oder als Uebernehmer). In der Transaktion des Aufrufers, unter der Turniersperre. */
export async function clearTournamentCovers(tx: Pick<Tx, "update">, tournamentId: string, userId: string): Promise<void> {
  await tx
    .update(tournamentPlayers)
    .set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null })
    .where(and(eq(tournamentPlayers.tournamentId, tournamentId), or(eq(tournamentPlayers.userId, userId), eq(tournamentPlayers.coveredByUserId, userId))));
}

/** Uebernahme moeglich? Nur solange der Kader offen oder die Zahlungsphase laeuft, kein Bracket steht und noch keine Abbuchungszeilen existieren. Unter der Turniersperre. */
async function coverClosed(tx: Pick<Tx, "select">, t: typeof tournaments.$inferSelect): Promise<boolean> {
  if ((t.status !== "registration" && t.status !== "payment") || t.bracketGeneratedAt !== null) return true;
  const [row] = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(and(isNotNull(paymentCharges.tournamentId), eq(paymentCharges.tournamentId, t.id))).limit(1);
  return Boolean(row);
}

/** B uebernimmt den Anteil des Platzes von A (nur im eigenen Team). Der Zahler kommt aus der Sitzung (payerId), nie aus der Eingabe. */
export async function takeOverTournamentShare(payerId: string, tournamentId: string, targetUserId: string, mandateAccepted: boolean, now: Date = new Date()): Promise<void> {
  if (typeof tournamentId !== "string" || !UUID.test(tournamentId) || typeof targetUserId !== "string" || !UUID.test(targetUserId)) throw new DomainError(NOT_POSSIBLE);
  if (mandateAccepted !== true) throw new DomainError("Bitte bestätige zuerst den Zusatz zum Lastschrift-Mandat.");
  if (payerId === targetUserId) throw new DomainError(NOT_POSSIBLE);
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t || !(await tournamentCardMode(tx, t.id)) || (await coverClosed(tx, t))) throw new DomainError(NOT_POSSIBLE);
    const seats = await seatsOf(tx, tournamentId, true);
    const payer = seats.find((s) => s.userId === payerId);
    const target = seats.find((s) => s.userId === targetUserId);
    if (!payer || !target || payer.teamId !== target.teamId) throw new DomainError(NOT_POSSIBLE); // nur im eigenen Team
    if (!payer.hasCard) throw new DomainError("Zum Übernehmen brauchst du selbst eine hinterlegte Karte.");
    if (target.hasCard) throw new DomainError(NOT_POSSIBLE); // nur ein roter Platz (ohne Karte)
    const valid = validCoversOf(seats, true);
    if (valid.has(targetUserId)) throw new DomainError("Dieser Anteil ist schon übernommen.");
    if ([...valid.values()].includes(payerId)) throw new DomainError("Du übernimmst in diesem Turnier schon einen Anteil."); // ein Platz je Uebernehmer
    // veraltete (nicht mehr gueltige) Uebernahmen dieses Zahlers aufraeumen, damit der eindeutige Index nicht blockiert
    await tx.update(tournamentPlayers).set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.coveredByUserId, payerId)));
    await tx.update(tournamentPlayers).set({ coveredByUserId: payerId, coverMandateText: COVER_MANDATE_KEY, coverAcceptedAt: now }).where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, targetUserId)));
    // eine Uebernahme aendert, ob das Team vollstaendig ist: "Bereit" des Teams gilt nur weiter, wenn es das noch ist (wird bei setPaidReady neu geprueft)
    await audit(payerId, "tournament.cover.taken", "tournament", tournamentId, { after: { targetUserId } }, tx);
  });
}

/** B nimmt seine Uebernahme zurueck. Das "Bereit" seines Teams faellt weg, wenn das Team dadurch nicht mehr vollstaendig ist. */
export async function releaseTournamentCover(payerId: string, tournamentId: string): Promise<string> {
  if (typeof tournamentId !== "string" || !UUID.test(tournamentId)) throw new DomainError(NOT_POSSIBLE);
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t || (await coverClosed(tx, t))) throw new DomainError("Die Übernahme kann nicht mehr zurückgenommen werden.");
    const released = await tx
      .update(tournamentPlayers)
      .set({ coveredByUserId: null, coverMandateText: null, coverAcceptedAt: null })
      .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.coveredByUserId, payerId)))
      .returning({ userId: tournamentPlayers.userId, teamId: tournamentPlayers.teamId });
    if (released.length === 0) throw new DomainError("Du übernimmst in diesem Turnier keinen Anteil.");
    if (!(await tournamentTeamCardsReady(tx, tournamentId, released[0].teamId))) {
      await tx.update(tournamentTeams).set({ paidReadyAt: null }).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentTeams.teamId, released[0].teamId)));
    }
    await audit(payerId, "tournament.cover.released", "tournament", tournamentId, { after: { targetUserId: released[0].userId } }, tx);
    return released[0].userId;
  });
}

/**
 * Kartenstatus je Spieler FUER EINEN BETRACHTER (Plan v3, Sichtbarkeitsmatrix): der Spieler selbst sieht sich, der Captain seines Teams und Plattform-Admins sehen den echten
 * Stand (Support-Sicht), Mitspieler DESSELBEN Teams nur die neutrale Ampel, alle anderen (andere Teams, Gaeste) und der VERANSTALTER nichts je Person.
 */
export async function getTournamentCardDisplays(tournamentId: string, viewer: { id: string | null; platformAdmin: boolean }): Promise<Record<string, CardDisplay>> {
  const seats = await seatsOf(db, tournamentId);
  const captains = await db.select({ teamId: tournamentTeams.teamId, captainId: tournamentTeams.captainId }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, tournamentId));
  const myTeam = viewer.id ? seats.find((s) => s.userId === viewer.id)?.teamId ?? null : null;
  const adminOf = viewer.id ? captains.filter((c) => c.captainId === viewer.id).map((c) => c.teamId) : [];
  const cv: CardViewer = { userId: viewer.id, platformAdmin: viewer.platformAdmin, adminOf, isParticipant: myTeam !== null };
  const valid = validCoversOf(seats, true);
  const out: Record<string, CardDisplay> = {};
  for (const s of seats) {
    // Mitspieler anderer Teams sind fuer diesen Betrachter Gaeste (Zahlstatus nur im eigenen Team)
    const person = { userId: s.userId, teamId: s.teamId };
    let audience = audienceFor(cv, person);
    if (audience === "member" && s.teamId !== myTeam) audience = "guest";
    const d = cardDisplayFor(audience, s.hasCard ? "card_ready" : "none", null, null, false, !s.hasCard && valid.has(s.userId) ? "active" : null);
    if (d) out[s.userId] = d;
  }
  return out;
}
