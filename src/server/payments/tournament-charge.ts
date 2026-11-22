// Abbuchung eines Turniers (Vertrag 012, M5-4): dieselben vier Phasen wie das Teamspiel (charge-run.ts), aber je Turnier. Netzaufrufe nur ausserhalb von Transaktionen.
//  A  (Tx, Turniersperre)  Voraussetzungen pruefen, je Spieler eine Zeile payment_charges (pending) anlegen und COMMITTEN, bevor Stripe etwas sieht.
//  B  (Netz)               je Zeile ohne PaymentIntent: Zeile beanspruchen (FOR UPDATE SKIP LOCKED, kurze Tx), PaymentIntent anlegen (fester Schluessel).
//  C  (Tx)                 Ergebnis ueber applyChargeInTx verbuchen (dort der Zweig fuer Turnierzeilen: applyTournamentCharge).
//  D  (Tx, Turniersperre)  sind ALLE Zeilen erfolgreich: Turnier gebucht (settled_at), Beleg je Zahler, Provision, danach entsteht das Bracket.
// Alles-oder-nichts: ein Fehlschlag bucht nichts zurueck; erfolgreiche Zahlungen bleiben, das Turnier wartet (Nachzahlfenster, Absage und Erstattung: M5-5).
// Dieses Modul schreibt tournament_id (Zeilen, Erstattungen); die Teamspiel-Pfade nie.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentChargeAttempts, paymentCharges, paymentProfiles } from "@/db/schema";
import { ledgerEntries } from "@/db/schema-finance";
import { tournamentPlayers, tournamentTeams, tournaments } from "@/db/schema-league";
import { audit } from "../audit";
import { noteIgnoredCharge } from "./unmatched";
import { DomainError } from "../teams";
import type { Tx } from "../tx";
import { dueWithGrace, fixDeadline, hasLongLead } from "@/lib/deadlines";
import { formatEuro } from "@/lib/money";
import { graceUntil, inGraceWindow, isCardProblemCode, NON_CARD_CODES } from "@/lib/grace";
import { post } from "../ledger";
import { notifyUsers } from "../notifications";
import { issueReceipt } from "../receipts";
import { lockTournament, maybeGenerateBracket, tournamentPayOpenAt } from "../tournaments";
import { seatsOf, tournamentCardMode } from "../tournament-card";
import { hallZusageOkLive } from "../tournament-venue";
import { validCoversOf } from "./cover";
import { cardPaymentsEnabled } from "../settings";
import { getPaymentProvider, PaymentIdempotencyError } from "./provider";
import { type ApplyResult, type ChargeOutcome, type ChargeReport, bookChargeFee, ensureRefundRow } from "./charge";
import { ATTEMPT_MAX_AGE_MS, CLAIM_LEASE_MS, MIN_CHARGE_CENTS, UNKNOWN_OUTCOME, AFTER_START } from "./charge-run";

export const tournamentChargeKey = (tournamentId: string, userId: string, priceRound: number, attempt = 1) => `charge:t:${tournamentId}:${userId}:${priceRound}:${attempt}`;

type T = typeof tournaments.$inferSelect;
export type TournamentEligibility = "not_open" | "not_due" | "not_card_mode" | "no_venue" | "no_zusage" | "teams_missing" | "not_ready" | "not_fixed" | "free" | "cards_missing" | "ready";

/** Betrag der Abbuchung: der fixierte Anteil, mindestens 0,50 EUR (AC-19); kostenlos = keine Abbuchung. */
export function tournamentChargeAmount(finalShareCents: number | null): number | null {
  if (finalShareCents === null || finalShareCents <= 0) return null;
  return Math.max(finalShareCents, MIN_CHARGE_CENTS);
}

/** Ist der Zeitpunkt der Abbuchung erreicht? Vorlauf >= 48 Stunden: ab der Frist (Start minus 48 h, mit Karenz); kuerzerer Vorlauf: sofort (alle Teams sind schon bereit). */
export async function tournamentChargeDue(tx: Tx, t: T, now: Date): Promise<boolean> {
  if (!t.startsAt) return false;
  const long = hasLongLead(t.startsAt, t.createdAt);
  if (!long) return true;
  if (!t.registrationDeadline || t.registrationDeadline.getTime() > fixDeadline(t.startsAt).getTime()) return false; // Altturnier: alte Regeln
  const payOpenAt = await tournamentPayOpenAt(tx, t);
  return now.getTime() >= dueWithGrace(fixDeadline(t.startsAt), payOpenAt, t.startsAt, t.createdAt).getTime();
}

/** Darf dieses Turnier jetzt abgebucht werden? In der Transaktion des Aufrufers unter der Turniersperre. */
export async function tournamentChargeEligibility(tx: Tx, t: T, now: Date, requireDue = false) {
  const none = (reason: TournamentEligibility) => ({ reason, players: [] as string[], amountCents: null as number | null, payers: new Map<string, string>() });
  if (t.status !== "payment" || t.bracketGeneratedAt !== null || t.settledAt !== null || !t.startsAt || t.startsAt.getTime() <= now.getTime()) return none("not_open");
  if (!(await tournamentCardMode(tx, t.id))) return none("not_card_mode");
  if (!t.venueId) return none("no_venue");
  if (t.venueAccessRequiredSnapshot === null) return none("not_fixed"); // fail-closed: der Zugangs-Snapshot muss beim Fixieren eingefroren sein (M5-7)
  if (!(await hallZusageOkLive(tx, t))) return none("no_zusage"); // Zugang JETZT aktiv und keine Zusage: nicht abbuchbar, auch bei Snapshot false (Plan 19.14)
  if (t.finalShareCents === null) return none("not_fixed");
  const amount = tournamentChargeAmount(t.finalShareCents);
  if (amount === null) return none("free");
  const entries = await tx.select({ ready: tournamentTeams.paidReadyAt }).from(tournamentTeams).where(eq(tournamentTeams.tournamentId, t.id));
  if (entries.length !== t.maxTeams) return none("teams_missing");
  if (entries.some((e) => e.ready === null)) return none("not_ready");
  if (requireDue && !(await tournamentChargeDue(tx, t, now))) return none("not_due");
  // Karte ODER gueltiger Uebernehmer (validCoversOf, nicht die Rohspalte): eine eigene Karte nach der Uebernahme macht die Uebernahme ungueltig, der Spieler zahlt dann selbst
  const seats = await seatsOf(tx, t.id);
  const payers = validCoversOf(seats, true);
  const ids = seats.map((s) => s.userId);
  if (ids.length === 0 || seats.some((s) => !s.hasCard && !payers.has(s.userId))) return { reason: "cards_missing" as const, players: ids, amountCents: amount, payers };
  return { reason: "ready" as const, players: ids, amountCents: amount, payers };
}

export type TournamentRunResult = { reason: TournamentEligibility | "rows_exist"; created: number; attempted: number; settled: boolean };

/** Bucht ein Turnier ab (alle Phasen). Idempotent und nachholbar: zweiter oder paralleler Lauf legt nichts doppelt an und sendet nichts doppelt. */
export async function runTournamentCharges(tournamentId: string, now: Date = new Date(), opts: { requireDue?: boolean } = {}): Promise<TournamentRunResult> {
  const phaseA = await db.transaction(async (tx) => {
    // nur "Turnier nicht gefunden" ist ein erwarteter Ausgang; jeder andere Fehler (Sperre, Datenbank) bricht den Lauf ab und wird nie verschluckt
    const t = await lockTournament(tx, tournamentId).catch((error: unknown) => {
      if (error instanceof DomainError) return null;
      throw error;
    });
    if (!t) return { reason: "not_open" as const, created: 0 };
    const existing = await tx.select({ id: paymentCharges.id }).from(paymentCharges).where(eq(paymentCharges.tournamentId, tournamentId)).limit(1);
    if (existing.length > 0) return { reason: "rows_exist" as const, created: 0 };
    const e = await tournamentChargeEligibility(tx, t, now, opts.requireDue === true);
    if (e.reason !== "ready" || e.amountCents === null) return { reason: e.reason, created: 0 };
    for (const userId of e.players) {
      await tx
        .insert(paymentCharges)
        .values({ tournamentId, userId, amountCents: e.amountCents, idempotencyKey: tournamentChargeKey(tournamentId, userId, t.priceRound), payerUserId: e.payers.get(userId) ?? null })
        .onConflictDoNothing();
    }
    await audit(null, "charge.created", "tournament", tournamentId, { after: { players: e.players.length, amountCents: e.amountCents } }, tx);
    return { reason: "ready" as const, created: e.players.length };
  }); // <- Commit: die Zeilen stehen, bevor Stripe etwas sieht

  let attempted = 0;
  for (let guard = 0; guard < 400; guard++) {
    const claimed = await claimNext(tournamentId, now);
    if (!claimed) break;
    attempted += 1;
    await sendCharge(claimed);
  }
  const [after] = await db.select({ settledAt: tournaments.settledAt }).from(tournaments).where(eq(tournaments.id, tournamentId));
  return { reason: phaseA.reason, created: phaseA.created, attempted, settled: Boolean(after?.settledAt) };
}

/** Der 5-Minuten-Job: alle Turniere im Kartenmodell, bei denen die Abbuchung faellig ist. Ein Fehler bei einem Turnier stoppt die anderen nicht. */
export async function runTournamentChargesDue(now: Date = new Date()): Promise<{ turniere: number; created: number }> {
  const candidates = await db.select({ id: tournaments.id }).from(tournaments).where(and(eq(tournaments.status, "payment"), isNull(tournaments.bracketGeneratedAt), isNull(tournaments.settledAt)));
  let turniere = 0;
  let created = 0;
  for (const c of candidates) {
    try {
      if (!(await tournamentCardMode(db, c.id))) continue; // nur Turniere im Kartenmodell (Guthabenturniere nicht alle 5 Minuten sperren)
      const r = await runTournamentCharges(c.id, now, { requireDue: true });
      if (r.created > 0 || r.attempted > 0) turniere += 1;
      created += r.created;
    } catch (error) {
      console.error("runTournamentChargesDue: Fehler bei Turnier", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  return { turniere, created };
}

/** Fuer setPaidReady: nach dem Commit, ohne darauf zu warten. Fehler duerfen "Bereit" nie verzoegern; der Job holt nach. */
export function triggerTournamentChargesInBackground(tournamentId: string): Promise<void> {
  return runTournamentCharges(tournamentId, new Date(), { requireDue: true }).then(
    () => undefined,
    (error: unknown) => {
      console.error("triggerTournamentCharges: Fehler", error instanceof Error ? error.name : "Fehler");
    },
  );
}

type Claimed = { id: string; tournamentId: string; userId: string; payerUserId: string | null; amountCents: number; idempotencyKey: string; prevStarted: Date | null };

/** Beansprucht die naechste sendefaehige Zeile (pending, ohne PaymentIntent, nicht gerade in Arbeit). Turniersperre FOR SHARE VOR den Zeilen (Reihenfolge Turnier -> Zeile). */
async function claimNext(tournamentId: string, now: Date): Promise<Claimed | null> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("share");
    // "offen": das Turnier selbst laeuft noch (Zahlungsphase, nicht gebucht, nicht gestartet). tournament_closed (terminal) gibt es NUR, wenn das Turnier selbst nicht mehr offen ist.
    // Ist es offen, aber das Kartenmodell gerade aus (Notabschaltung/Schalter AUS), bleiben die Zeilen pending und es wird nichts gesendet: nach dem Wieder-Einschalten geht es weiter.
    const selfOpen = Boolean(t) && t.status === "payment" && t.settledAt === null && t.bracketGeneratedAt === null && Boolean(t.startsAt) && t.startsAt!.getTime() > now.getTime();
    const open = selfOpen && (await tournamentCardMode(tx, tournamentId));
    if (selfOpen && !open) return null;
    const rows = await tx.execute(sql`
      select id, tournament_id, user_id, payer_user_id, amount_cents, idempotency_key, attempt_started_at, updated_at
      from payment_charges
      where tournament_id = ${tournamentId} and status = 'pending' and payment_intent_id is null and (failure_code is null or failure_code not in (${UNKNOWN_OUTCOME}, ${AFTER_START}))
      order by user_id
      for update skip locked`);
    for (const row of rows.rows as { id: string; tournament_id: string; user_id: string; payer_user_id: string | null; amount_cents: number; idempotency_key: string; attempt_started_at: Date | null; updated_at: Date }[]) {
      if (!open) {
        if (row.attempt_started_at) await markUnknown(tx, row.id, row.tournament_id, row.user_id, "tournament_closed");
        else await failRow(tx, row.id, row.tournament_id, row.user_id, "tournament_closed");
        continue;
      }
      const started = row.attempt_started_at ? new Date(row.attempt_started_at).getTime() : null;
      if (started !== null && now.getTime() - started > ATTEMPT_MAX_AGE_MS) {
        await markUnknown(tx, row.id, row.tournament_id, row.user_id, "attempt_expired");
        continue;
      }
      if (started !== null && now.getTime() - new Date(row.updated_at).getTime() < CLAIM_LEASE_MS) continue; // gerade in Arbeit (Lease)
      await tx.update(paymentCharges).set({ attemptStartedAt: started === null ? now : new Date(started), updatedAt: now }).where(eq(paymentCharges.id, row.id));
      return { id: row.id, tournamentId: row.tournament_id, userId: row.user_id, payerUserId: row.payer_user_id, amountCents: row.amount_cents, idempotencyKey: row.idempotency_key, prevStarted: started === null ? null : new Date(started) };
    }
    return null;
  });
}

async function markUnknown(tx: Tx, rowId: string, tournamentId: string, userId: string, reason: string) {
  const updated = await tx
    .update(paymentCharges)
    .set({ failureCode: UNKNOWN_OUTCOME, updatedAt: new Date() })
    .where(and(eq(paymentCharges.id, rowId), eq(paymentCharges.status, "pending"), isNull(paymentCharges.paymentIntentId)))
    .returning({ id: paymentCharges.id });
  if (updated.length > 0) await audit(null, "charge.unknown_outcome", "tournament", tournamentId, { after: { userId, reason } }, tx);
}

/** Ein Fehlschlag einer Zeile (nie gesendet oder abgelehnt): Status failed, Nachzahlfenster beginnt (nur bei Kartenproblemen), Betroffener und Captain werden benachrichtigt (nie der Veranstalter). */
async function failRow(tx: Tx, rowId: string, tournamentId: string, userId: string, code: string) {
  const [t] = await tx.select({ startsAt: tournaments.startsAt, name: tournaments.name }).from(tournaments).where(eq(tournaments.id, tournamentId));
  const userProblem = isCardProblemCode(code);
  const now = new Date();
  const grace = userProblem && t?.startsAt ? graceUntil(now, t.startsAt) : null;
  const [row] = await tx
    .update(paymentCharges)
    .set({ status: "failed", failureCode: code, ...(userProblem ? { graceUntil: grace } : {}), updatedAt: now })
    .where(and(eq(paymentCharges.id, rowId), eq(paymentCharges.status, "pending")))
    .returning();
  await audit(null, "charge.failed", "tournament", tournamentId, { after: { userId, outcome: "failed", code } }, tx);
  if (userProblem && row) await notifyTournamentProblem(tx, tournamentId, t?.name ?? "Turnier", row.payerUserId ?? row.userId, row.userId, code);
}

/** Nachricht an den Zahler (Betroffener) und den Captain seines Teams; Dritte und der Veranstalter erfahren den Grund nie (AC-12/AC-20, Plan v3 Matrix). */
async function notifyTournamentProblem(tx: Tx, tournamentId: string, name: string, payerId: string, seatUserId: string, code: string | null) {
  const [team] = await tx.select({ captainId: tournamentTeams.captainId }).from(tournamentTeams).innerJoin(tournamentPlayers, and(eq(tournamentPlayers.tournamentId, tournamentTeams.tournamentId), eq(tournamentPlayers.teamId, tournamentTeams.teamId))).where(and(eq(tournamentTeams.tournamentId, tournamentId), eq(tournamentPlayers.userId, seatUserId)));
  const body = code === "authentication_required" ? `${name}: Deine Abbuchung braucht noch deine Freigabe bei der Bank.` : `${name}: Die Abbuchung von deiner Karte hat nicht geklappt. Bitte hinterlege eine andere Karte.`;
  await notifyUsers([payerId], { type: "payment", title: "Abbuchung fehlgeschlagen", body, url: `/turniere/${tournamentId}` }, tx);
  if (team?.captainId && team.captainId !== payerId) {
    await notifyUsers([team.captainId], { type: "payment", title: "Abbuchung fehlgeschlagen", body: `${name}: Bei einem Spieler deines Teams hat die Abbuchung nicht geklappt.`, url: `/turniere/${tournamentId}` }, tx);
  }
}

/** Phase B (Netz) und C (Verbuchung) fuer eine beanspruchte Zeile. */
async function sendCharge(c: Claimed): Promise<void> {
  const [profile] = await db.select().from(paymentProfiles).where(eq(paymentProfiles.userId, c.payerUserId ?? c.userId));
  if (!profile?.paymentMethodId) {
    await db.transaction((tx) => failRow(tx, c.id, c.tournamentId, c.userId, "no_payment_method"));
    return;
  }
  const provider = await getPaymentProvider();
  // Notabschaltung (Schalter AUS): ein Select unmittelbar VOR dem Netzaufruf, ausserhalb der Transaktion. Eine schon beanspruchte Zeile geht nach dem Abschalten nicht mehr raus: sie bleibt
  // pending, die Beanspruchung wird zurueckgenommen (frueherer Versuchsstand), der naechste Lauf nach dem Wieder-Einschalten holt sie nach. Restfenster: der Schalter wird zwischen diesem
  // Select und dem Aufruf umgelegt (Millisekunden, siehe BETRIEB).
  if (!(await cardPaymentsEnabled())) {
    await db.update(paymentCharges).set({ attemptStartedAt: c.prevStarted, updatedAt: new Date() }).where(and(eq(paymentCharges.id, c.id), eq(paymentCharges.status, "pending"), isNull(paymentCharges.paymentIntentId)));
    return;
  }
  let res;
  try {
    res = await provider.createPaymentIntent({ customerId: profile.stripeCustomerId, paymentMethodId: profile.paymentMethodId, amountCents: c.amountCents, idempotencyKey: c.idempotencyKey, metadata: { tournamentId: c.tournamentId, userId: c.userId } });
  } catch (error) {
    if (error instanceof PaymentIdempotencyError) {
      await db.transaction((tx) => failRow(tx, c.id, c.tournamentId, c.userId, "idempotency_mismatch"));
      return;
    }
    return; // Ergebnis unbekannt: Zeile bleibt pending, der naechste Lauf sendet mit demselben Schluessel erneut (bis zur 20-Stunden-Grenze)
  }
  const outcome: ChargeOutcome | null = res.status === "succeeded" ? "succeeded" : res.status === "requires_action" ? "requires_action" : res.status === "failed" ? "failed" : null;
  await db.transaction(async (tx) => {
    if (outcome === null) {
      await tx.update(paymentCharges).set({ paymentIntentId: res.id, updatedAt: new Date() }).where(and(eq(paymentCharges.id, c.id), isNull(paymentCharges.paymentIntentId)));
      return;
    }
    await applyTournamentCharge(tx, { outcome, paymentIntentId: res.id, amountCents: c.amountCents, currency: "eur", customerId: profile.stripeCustomerId, metadata: { matchId: null, tournamentId: c.tournamentId, userId: c.userId }, failureCode: res.failureCode ?? null });
  });
  if (outcome === "succeeded") {
    try {
      await bookChargeFee(res.id);
    } catch {
      /* nichts loggen */
    }
  }
}

const RANK: Record<string, number> = { pending: 0, requires_action: 1, failed: 2, succeeded: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanCode = (c: string | null) => (typeof c === "string" && /^[a-z0-9_.-]{1,64}$/i.test(c) ? c : c ? "unknown" : null);

/**
 * Verbucht ein Abbuchungs-Ergebnis zu einer TURNIER-Zeile (Zweig von applyChargeInTx). Sperrreihenfolge: ERST das Turnier, DANN die Zeile (die Zeile wird zuerst ohne Sperre gesucht).
 * Betrag, Waehrung, Kunde (des Zahlers) und Metadaten (tournamentId, userId) muessen passen, sonst wird NICHTS gebucht. succeeded gewinnt immer.
 * Erfolg: Anteil clearing -> venue_payable (Art tournament_share, Schluessel charge:<PI>, Verbindlichkeit der Halle, nur die Provision ist Ertrag); danach Phase D.
 */
export async function applyTournamentCharge(tx: Tx, r: ChargeReport): Promise<ApplyResult> {
  const ignore = async (reason: string): Promise<ApplyResult> => {
    await noteIgnoredCharge(tx, r, reason); // Audit mit Ergebnis; erfolgreiche Zahlung ohne Zuordnung: sofortiger Alarm an Admin 1 (Backlog 118)
    return { status: "ignored", reason };
  };
  const byPi = async (lock: boolean) => {
    const q = tx.select().from(paymentCharges).where(eq(paymentCharges.paymentIntentId, r.paymentIntentId));
    return (lock ? await q.for("update") : await q)[0];
  };
  const byMeta = async (lock: boolean) => {
    const { tournamentId, userId } = r.metadata;
    if (!tournamentId || !userId || !UUID.test(tournamentId) || !UUID.test(userId)) return undefined;
    const q = tx.select().from(paymentCharges).where(and(eq(paymentCharges.tournamentId, tournamentId), eq(paymentCharges.userId, userId)));
    return (lock ? await q.for("update") : await q)[0];
  };
  // Ein ALTER, abgeschlossener Versuch (Historie, Wiederholen im Nachzahlfenster): die Zeile gehoert zu dem Versuch, der inzwischen durch einen neueren ersetzt wurde
  const byHistory = async (lock: boolean) => {
    const [h] = await tx.select({ chargeId: paymentChargeAttempts.chargeId }).from(paymentChargeAttempts).where(eq(paymentChargeAttempts.paymentIntentId, r.paymentIntentId));
    if (!h) return undefined;
    const q = tx.select().from(paymentCharges).where(eq(paymentCharges.id, h.chargeId));
    return (lock ? await q.for("update") : await q)[0];
  };
  const probe = (await byPi(false)) ?? (await byHistory(false)) ?? (await byMeta(false));
  if (!probe || probe.tournamentId === null) return ignore("unknown_payment_intent");
  await tx.select({ id: tournaments.id }).from(tournaments).where(eq(tournaments.id, probe.tournamentId)).for("update"); // Turnier zuerst
  let row: typeof paymentCharges.$inferSelect | undefined = await byPi(true);
  let oldAttempt = false;
  if (!row) {
    row = await byHistory(true);
    oldAttempt = row !== undefined;
  }
  if (!row) {
    row = await byMeta(true);
    if (!row) return ignore("unknown_charge");
    if (row.paymentIntentId !== null && row.paymentIntentId !== r.paymentIntentId) {
      if (!(r.outcome === "succeeded" && row.status === "succeeded")) return ignore("other_payment_intent");
    }
  }
  const tournamentId = row.tournamentId!;
  if (r.metadata.matchId) return ignore("metadata_mismatch"); // genau eines von beiden: eine Turnier-Zeile traegt nie die Metadaten eines Spiels
  if ((r.metadata.tournamentId ?? null) !== null && r.metadata.tournamentId !== tournamentId) return ignore("metadata_mismatch");
  if (r.metadata.userId !== null && r.metadata.userId !== row.userId) return ignore("metadata_mismatch");
  if (r.amountCents !== row.amountCents || r.currency?.toLowerCase() !== "eur") return ignore("amount_mismatch");
  const [profile] = await tx.select({ stripeCustomerId: paymentProfiles.stripeCustomerId }).from(paymentProfiles).where(eq(paymentProfiles.userId, row.payerUserId ?? row.userId));
  if (!profile || r.customerId !== profile.stripeCustomerId) return ignore("customer_mismatch");

  // Ereignis eines ALTEN Versuchs: ein Fehlschlag aendert nichts (der neuere Versuch zaehlt), ein Erfolg ist trotzdem Geld und wird verbucht (succeeded gewinnt immer)
  if (oldAttempt && r.outcome !== "succeeded") {
    await audit(null, "charge.old_attempt_event", "tournament", tournamentId, { after: { userId: row.userId, outcome: r.outcome } }, tx);
    return { status: "already" };
  }
  if (r.outcome === "succeeded" && row.status === "succeeded") {
    // ZWEITER erfolgreicher PaymentIntent zur selben Zeile: der Betrag liegt bei uns, also gebucht UND sofort voll erstattet (nie stilles Behalten), mit Audit
    if (row.paymentIntentId === r.paymentIntentId) return { status: "already" };
    const [booked] = await tx.select({ id: ledgerEntries.id }).from(ledgerEntries).where(eq(ledgerEntries.idempotencyKey, `charge:${r.paymentIntentId}`));
    if (booked) return { status: "already" };
    await post(tx, { debit: { account: "clearing" }, credit: { account: "venue_payable" }, amountCents: row.amountCents, kind: "tournament_share", tournamentId, idempotencyKey: `charge:${r.paymentIntentId}`, reason: "Abbuchung Anteil (Karte), doppelt" });
    await ensureRefundRow(tx, row, "Doppelte Abbuchung", r.paymentIntentId);
    await audit(null, "charge.duplicate_success", "tournament", tournamentId, { after: { userId: row.userId, paymentIntentId: r.paymentIntentId } }, tx);
    return { status: "applied" };
  }
  if (row.status === "succeeded") return { status: "already" };
  if (r.outcome !== "succeeded" && RANK[r.outcome] < RANK[row.status]) return { status: "already" };
  if (row.paymentIntentId === null) await tx.update(paymentCharges).set({ paymentIntentId: r.paymentIntentId }).where(eq(paymentCharges.id, row.id));
  else if (r.outcome === "succeeded" && row.paymentIntentId !== r.paymentIntentId) {
    // der BEZAHLTE PaymentIntent ist nicht der gebundene: der bisher gebundene wandert in die Historie (spaetere Ereignisse zu ihm werden weiter zugeordnet), die Zeile zeigt auf den bezahlten
    await tx
      .insert(paymentChargeAttempts)
      .values({ chargeId: row.id, attemptNo: row.currentAttempt, idempotencyKey: row.idempotencyKey, paymentIntentId: row.paymentIntentId, status: row.status, failureCode: row.failureCode, attemptStartedAt: row.attemptStartedAt })
      .onConflictDoNothing();
    await tx.update(paymentCharges).set({ paymentIntentId: r.paymentIntentId }).where(eq(paymentCharges.id, row.id));
  }

  if (r.outcome === "succeeded") {
    await post(tx, { debit: { account: "clearing" }, credit: { account: "venue_payable" }, amountCents: row.amountCents, kind: "tournament_share", tournamentId, idempotencyKey: `charge:${r.paymentIntentId}`, reason: "Abbuchung Anteil (Karte), Turnier" });
    await tx.update(paymentCharges).set({ status: "succeeded", failureCode: null, updatedAt: new Date() }).where(eq(paymentCharges.id, row.id));
    await audit(null, "charge.succeeded", "tournament", tournamentId, { after: { userId: row.userId, amountCents: row.amountCents } }, tx);
    // Gelingt die Abbuchung erst NACH der Absage, wird sofort erstattet: nie Geld eines abgesagten Turniers behalten
    const [t] = await tx.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, tournamentId));
    if (t?.status === "cancelled") {
      await ensureRefundRow(tx, { ...row, status: "succeeded" }, "Abbuchung nach Absage");
      await audit(null, "refund.auto", "tournament", tournamentId, { after: { userId: row.userId } }, tx);
    }
    await settleTournamentIfComplete(tx, tournamentId);
    return { status: "applied" };
  }

  if (row.status === r.outcome && row.failureCode === cleanCode(r.failureCode)) return { status: "already" };
  const firstProblem = row.status !== "failed" && row.status !== "requires_action";
  const code = cleanCode(r.failureCode) ?? (r.outcome === "requires_action" ? "authentication_required" : "card_declined");
  const [t] = await tx.select({ startsAt: tournaments.startsAt, name: tournaments.name }).from(tournaments).where(eq(tournaments.id, tournamentId));
  const now = new Date();
  const grace = firstProblem && row.currentAttempt === 1 && t?.startsAt ? graceUntil(now, t.startsAt) : row.graceUntil;
  await tx.update(paymentCharges).set({ status: r.outcome, failureCode: code, graceUntil: grace, updatedAt: now }).where(eq(paymentCharges.id, row.id));
  await audit(null, "charge.failed", "tournament", tournamentId, { after: { userId: row.userId, outcome: r.outcome, code } }, tx);
  if (firstProblem) await notifyTournamentProblem(tx, tournamentId, t?.name ?? "Turnier", row.payerUserId ?? row.userId, row.userId, code);
  return { status: "applied" };
}

/**
 * Phase D: haben ALLE Spieler erfolgreich gezahlt, ist das Turnier gebucht: settled_at (einmal), Beleg je Zahler (Summe der Posten), Benachrichtigung, Provision (aus dem eingefrorenen Satz),
 * danach entsteht das Bracket genau einmal. Laeuft unter der Turniersperre; idempotent (settled_at, Beleg je Zahler und Turnier, Provisions-Schluessel).
 * Gebucht wird erst, wenn JEDER Spieler eine erfolgreiche Zeile hat (Zeilenanzahl = Spielerzahl, keine uebersprungen).
 */
export async function settleTournamentIfComplete(tx: Tx, tournamentId: string): Promise<boolean> {
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
  if (!t || t.settledAt !== null || t.status !== "payment") return false;
  const rows = await tx.select().from(paymentCharges).where(eq(paymentCharges.tournamentId, tournamentId));
  const players = await tx.select({ userId: tournamentPlayers.userId }).from(tournamentPlayers).where(eq(tournamentPlayers.tournamentId, tournamentId));
  if (rows.length === 0 || rows.length !== players.length || rows.some((r) => r.status !== "succeeded")) return false;
  const paid = new Set(rows.map((r) => r.userId));
  if (players.some((p) => !paid.has(p.userId))) return false;

  const upd = await tx.update(tournaments).set({ settledAt: new Date() }).where(and(eq(tournaments.id, tournamentId), isNull(tournaments.settledAt))).returning({ id: tournaments.id });
  if (upd.length === 0) return false;
  const byPayer = new Map<string, number>();
  for (const r of rows) byPayer.set(r.payerUserId ?? r.userId, (byPayer.get(r.payerUserId ?? r.userId) ?? 0) + r.amountCents);
  for (const [payer, cents] of byPayer) {
    await issueReceipt(tx, { userId: payer, kind: "tournament", tournamentId, amountCents: cents });
    await notifyUsers([payer], { type: "payment", title: "Abrechnung", body: `${t.name}: ${formatEuro(cents)} wurden von deiner Karte abgebucht.`, url: `/turniere/${tournamentId}` }, tx);
  }
  await bookTournamentCommission(tx, { ...t, settledAt: new Date() });
  await audit(null, "charge.settled", "tournament", tournamentId, { after: { payers: rows.length, totalCents: rows.reduce((s, r) => s + r.amountCents, 0) } }, tx);
  await maybeGenerateBracket(tx, { ...t, settledAt: new Date() });
  return true;
}

/**
 * Provision des Turniers aus dem beim Fixieren eingefrorenen Satz (M5-1): `venue_payable -> commission`, genau einmal (Schluessel commission:t:<Turnier>). Basis: die Hallenkosten des
 * Turniers (total_cents), abgerundet auf Cent wie im Teamspiel. Satz 0 oder keine Basis: nichts wird gebucht (bis 009 M2f ist der Satz 0).
 */
export async function bookTournamentCommission(tx: Tx, t: T): Promise<boolean> {
  const pct = t.commissionPercentSnapshot === null ? 0 : Number(t.commissionPercentSnapshot);
  if (!Number.isFinite(pct) || pct <= 0 || !t.totalCents || t.totalCents <= 0) return false;
  const cents = Math.floor((t.totalCents * pct) / 100);
  if (cents <= 0) return false;
  const r = await post(tx, { debit: { account: "venue_payable" }, credit: { account: "commission" }, amountCents: cents, kind: "commission", tournamentId: t.id, idempotencyKey: `commission:t:${t.id}`, reason: `Provision ${pct} % der Hallenkosten (Turnier)` });
  return r.created;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// Wiederholen im Nachzahlfenster / neue Karte (M5-5): wie retryChargesInWindow fuer Spiele (charge-retry.ts), aber je Turnier. Signal ist die NEUE Karte des Zahlers (Profil nach dem Fehlschlag aktualisiert,
// Zahlungsmittel vorhanden), nie ein Platzstatus; hoechstens ein Versuch je Kartenaenderung und nur im effektiven Fenster (das fruehere von grace_until und Start minus 1 Stunde).
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------

type RetryCandidate = { id: string; tournamentId: string; userId: string; attempt: number; amountCents: number; currentPi: string | null };

/** Prueft ALLE bekannten PaymentIntents einer Turnier-Zeile (laufender + Historie) per retrieve: succeeded => verbuchen ("booked"); processing/Netzfehler => "skip"; offene werden abgebrochen; sonst "go". Netz, nie in einer Transaktion. */
export async function reconcileTournamentIntents(c: RetryCandidate): Promise<"booked" | "skip" | "go"> {
  const provider = await getPaymentProvider();
  const book = async (f: { id: string; amountCents: number | null; currency: string | null; customerId: string | null }) => {
    await db.transaction((tx) => applyTournamentCharge(tx, { outcome: "succeeded", paymentIntentId: f.id, amountCents: f.amountCents, currency: f.currency, customerId: f.customerId, metadata: { matchId: null, tournamentId: c.tournamentId, userId: c.userId }, failureCode: null }));
    try {
      await bookChargeFee(f.id);
    } catch {
      /* der Nachholer bucht die Gebuehr spaeter */
    }
  };
  try {
    const hist = await db.select({ pi: paymentChargeAttempts.paymentIntentId }).from(paymentChargeAttempts).where(eq(paymentChargeAttempts.chargeId, c.id));
    const known = [...new Set([c.currentPi, ...hist.map((h) => h.pi)].filter((x): x is string => typeof x === "string"))];
    for (const id of known) {
      const f = await provider.retrievePaymentIntent(id);
      if (f === null) continue;
      if (f.status === "succeeded") {
        await book(f);
        return "booked";
      }
      if (f.status === "processing") return "skip";
      const res = await provider.cancelPaymentIntent(f.id);
      if (res.status === "succeeded") {
        await book({ ...f });
        return "booked";
      }
      if (res.status === "other") return "skip";
    }
  } catch {
    return "skip"; // Netzfehler: diese Runde auslassen, nie blind neu senden
  }
  return "go";
}

/** Phase 2 (Tx): schliesst den Versuch in der Historie ab und setzt die Zeile auf einen frischen pending-Versuch (Compare-and-set auf current_attempt, alle Bedingungen unter der Sperre neu geprueft). */
export async function rotateTournamentAttempt(c: RetryCandidate, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, c.tournamentId)).for("share");
    if (!t || t.status !== "payment" || t.settledAt !== null || t.bracketGeneratedAt !== null || !t.startsAt || t.startsAt.getTime() <= now.getTime()) return false;
    if (!(await tournamentCardMode(tx, t.id))) return false;
    const [row] = await tx.select().from(paymentCharges).where(eq(paymentCharges.id, c.id)).for("update");
    if (!row || !["failed", "requires_action"].includes(row.status) || row.currentAttempt !== c.attempt) return false;
    if (!inGraceWindow(row.graceUntil, t.startsAt, now)) return false; // effektives Ende, Altzeilen (null) nie
    if (NON_CARD_CODES.includes(row.failureCode ?? "")) return false;
    const payerId = row.payerUserId ?? row.userId;
    const [prof] = await tx.select({ pm: paymentProfiles.paymentMethodId, at: paymentProfiles.updatedAt }).from(paymentProfiles).where(eq(paymentProfiles.userId, payerId)).for("share");
    if (!prof?.pm || prof.at.getTime() <= row.updatedAt.getTime()) return false; // ohne neue Karte kein Wiederholen (kein Dauerbeschuss)
    await tx.insert(paymentChargeAttempts).values({ chargeId: row.id, attemptNo: row.currentAttempt, idempotencyKey: row.idempotencyKey, paymentIntentId: row.paymentIntentId, status: row.status, failureCode: row.failureCode, attemptStartedAt: row.attemptStartedAt });
    const next = row.currentAttempt + 1;
    await tx.update(paymentCharges).set({ status: "pending", paymentIntentId: null, idempotencyKey: tournamentChargeKey(t.id, row.userId, t.priceRound, next), failureCode: null, attemptStartedAt: null, currentAttempt: next, updatedAt: now }).where(eq(paymentCharges.id, row.id));
    await audit(null, "charge.retry", "tournament", t.id, { after: { userId: row.userId, attempt: next } }, tx);
    return true;
  });
}

/**
 * Startet neue Versuche fuer alle fehlgeschlagenen Abbuchungen im Fenster, deren Zahler eine NEUE Karte gespeichert hat. Optional auf einen Nutzer (als Platz oder Zahler) eingegrenzt.
 * Liefert die Zahl der neu angelegten Versuche. Wiederholbar und parallel sicher. Ausloeser: Webhook "Karte aendern" und der Job card-charges.
 */
export async function retryTournamentChargesInWindow(opts: { userId?: string; now?: Date; limit?: number; budgetMs?: number } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const startedAt = Date.now();
  const overBudget = () => opts.budgetMs !== undefined && Date.now() - startedAt >= opts.budgetMs; // Webhook-Pfad: nichts Neues mehr beginnen, der Rest kommt mit dem Job
  const rows = await db.execute(sql`
    select c.id, c.tournament_id, c.user_id, c.current_attempt, c.amount_cents, c.payment_intent_id
    from payment_charges c join tournaments t on t.id = c.tournament_id
    where c.status in ('failed', 'requires_action') and c.grace_until is not null
      and least(c.grace_until, t.starts_at - interval '1 hour') > ${now}
      and t.status = 'payment' and t.settled_at is null and t.bracket_generated_at is null and t.starts_at > ${now}
      and (c.failure_code is null or c.failure_code not in (${sql.join(NON_CARD_CODES.map((x) => sql`${x}`), sql`, `)}))
      and exists (select 1 from payment_profiles pp where pp.user_id = coalesce(c.payer_user_id, c.user_id) and pp.payment_method_id is not null and pp.updated_at > c.updated_at)
      ${opts.userId ? sql`and coalesce(c.payer_user_id, c.user_id) = ${opts.userId}` : sql``}
    order by c.created_at, c.id`);
  const cands = (rows.rows as { id: string; tournament_id: string; user_id: string; current_attempt: number; amount_cents: number; payment_intent_id: string | null }[]).map((r) => ({ id: r.id, tournamentId: r.tournament_id, userId: r.user_id, attempt: r.current_attempt, amountCents: r.amount_cents, currentPi: r.payment_intent_id }));
  let started = 0;
  const toSend = new Set<string>();
  for (const c of opts.limit !== undefined ? cands.slice(0, Math.max(0, opts.limit)) : cands) {
    if (overBudget()) break;
    try {
      if ((await reconcileTournamentIntents(c)) !== "go") continue;
      if (await rotateTournamentAttempt(c, now)) {
        started += 1;
        toSend.add(c.tournamentId);
      }
    } catch (error) {
      console.error("retryTournamentChargesInWindow: Fehler bei Zeile", c.id, error instanceof Error ? error.name : "Fehler");
    }
  }
  for (const tid of toSend) {
    if (overBudget()) break;
    try {
      await runTournamentCharges(tid, now); // Phase B und C fuer die frisch angelegten pending-Versuche (Zeilen existieren: rows_exist)
    } catch (error) {
      console.error("retryTournamentChargesInWindow: Senden fehlgeschlagen", tid, error instanceof Error ? error.name : "Fehler");
    }
  }
  return started;
}
