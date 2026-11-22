// Nachruecker von der Warteliste (Vertrag 012, M3c-2a, AC-8). Job-Schritt (alle 5 Minuten, auch sofort aufrufbar):
//  1  Fensterende: der Platz des Zahlungsunfaehigen wird frei (Zeile resolution=replaced mit dem Team des Platzes, Teilnehmer ENTFERNT; der Ersetzte kann nicht wieder beitreten).
//  2  Offener Platz: der Erste der Warteliste (nicht eingeteilt, Karte hinterlegt, nicht gesperrt, keine eigene Abbuchungszeile; sortiert nach Beitrittszeit, der Captain kann
//     nichts aendern) wird in das Team gesetzt und bekommt eine NEUE Abbuchungszeile (gleicher Anteil, slot_of = Ursprungszeile). Hoechstens EINE aktive (pending) und hoechstens 3
//     gescheiterte Nachruecker-Zeilen je Platz; failed/requires_action zaehlt sofort als gescheitert, pending verbraucht keinen Versuch und startet keinen zweiten Nachruecker.
//     Die Zaehlung wird aus den Zeilen abgeleitet und nur unter der Spielsperre gelesen (Spiel -> Zeilen).
//  3  Senden: normaler Weg (runCharges: Beanspruchen mit Lease, Senden ausserhalb jeder Transaktion, Verbuchen ueber applyChargeInTx).
// Ohne Kandidaten oder nach 3 Fehlschlaegen bleibt der Platz offen und wird als "erschoepft" gemeldet (die automatische Absage ist M3c-2b).
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { clearCoversInvolving } from "./cover-clear";
import { db } from "@/db";
import { matchParticipants, matches, paymentCharges } from "@/db/schema";
import { effectiveGraceEnd, isCardProblemCode } from "@/lib/grace";
import { formatEuro } from "@/lib/money";
import { audit } from "../audit";
import { teamName } from "../names";
import { notifyUsers, teamAdminIds } from "../notifications";
import { cardModeActive } from "../wallet";
import { reconcileKnownIntents } from "./charge-retry";
import { chargeKey, runCharges } from "./charge-run";
import { requestMatchCancel } from "./refund";
import { matchIdOf } from "./charge-context";

export const MAX_SUBSTITUTE_FAILURES = 3;
export const CANCEL_REASON = "Zur Frist ist die Zahlung nicht für alle Plätze zustande gekommen, und es fand sich kein Nachrücker. Alle bekommen ihren Anteil zurück.";

export type SubstituteResult = { released: number; filled: number; exhausted: string[] };

/**
 * Netz-Phase VOR dem Freigeben (Review R-T158): Ein Platz darf erst vergeben werden, wenn bei Stripe kein bestaetigbarer PaymentIntent seiner Zeile mehr offen ist, sonst
 * koennte ein spaeterer Erfolg doppelt zahlen lassen. Je abgelaufener Ursprungszeile werden die bekannten PaymentIntents per retrieve geprueft: succeeded => verbucht (die Zeile ist
 * dann bezahlt, kein Ersatz); processing => nicht ersetzen (Runde auslassen); offene werden abgebrochen. Ebenso werden die PaymentIntents ersetzter Nachruecker mit
 * requires_action abgebrochen. Liefert die Zeilen, die freigegeben werden duerfen. Netz, nie in einer Transaktion.
 */
async function prepareReleases(matchId: string, now: Date): Promise<Set<string>> {
  const allowed = new Set<string>();
  const roots = await db
    .select({ row: paymentCharges, startsAt: matches.startsAt })
    .from(paymentCharges)
    .innerJoin(matches, eq(matches.id, paymentCharges.matchId))
    .where(and(eq(paymentCharges.matchId, matchId), isNull(paymentCharges.slotOf), isNull(paymentCharges.resolution), inArray(paymentCharges.status, ["failed", "requires_action"]), sql`${paymentCharges.graceUntil} is not null`));
  for (const { row, startsAt } of roots) {
    if (!isCardProblemCode(row.failureCode)) continue;
    const end = effectiveGraceEnd(row.graceUntil, startsAt);
    if (end === null || end.getTime() > now.getTime()) continue;
    const verdict = await reconcileKnownIntents({ id: row.id, matchId, userId: row.userId, attempt: row.currentAttempt, amountCents: row.amountCents }, row.paymentIntentId);
    if (verdict !== "go") continue;
    if (row.status === "requires_action") await db.update(paymentCharges).set({ status: "failed", updatedAt: now }).where(and(eq(paymentCharges.id, row.id), eq(paymentCharges.status, "requires_action"))); // der PaymentIntent ist abgebrochen
    allowed.add(row.id);
  }
  // gescheiterte Nachruecker mit offenem PaymentIntent (requires_action): abbrechen, damit er nicht spaeter bestaetigt wird
  const kids = await db.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, matchId), isNotNull(paymentCharges.slotOf), eq(paymentCharges.resolution, "replaced"), eq(paymentCharges.status, "requires_action")));
  for (const k of kids) {
    const verdict = await reconcileKnownIntents({ id: k.id, matchId, userId: k.userId, attempt: k.currentAttempt, amountCents: k.amountCents }, k.paymentIntentId);
    if (verdict === "go") await db.update(paymentCharges).set({ status: "failed", updatedAt: now }).where(and(eq(paymentCharges.id, k.id), eq(paymentCharges.status, "requires_action")));
  }
  return allowed;
}

async function processMatch(matchId: string, now: Date, allowed: Set<string>): Promise<SubstituteResult> {
  return db.transaction(async (tx) => {
    const out: SubstituteResult = { released: 0, filled: 0, exhausted: [] };
    // Sperrreihenfolge: Spiel -> Abbuchungszeilen (sortiert) -> Teilnehmerzeilen
    const [game] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!game || !["lobby", "confirmed"].includes(game.status) || game.settledAt !== null || game.cancelRequestedAt !== null || game.startsAt.getTime() <= now.getTime()) return out;
    if (!(await cardModeActive(tx, game))) return out;

    const roots = await tx.select().from(paymentCharges).where(and(eq(paymentCharges.matchId, matchId), isNull(paymentCharges.slotOf))).orderBy(asc(paymentCharges.id)).for("update");

    // 1) Fenster abgelaufen: der Platz wird frei
    for (const r of roots) {
      // Doppelte Verteidigung: prepareReleases laesst technische Zustaende (kein Kartenfehler) nie in `allowed`; die Pruefung hier faengt sie unabhaengig davon ab (aequivalente Mutante
      // bei einzelner Entfernung, Review R-T158)
      if (r.resolution !== null || !["failed", "requires_action"].includes(r.status) || r.graceUntil === null || !isCardProblemCode(r.failureCode)) continue;
      const end = effectiveGraceEnd(r.graceUntil, game.startsAt);
      if (end === null || end.getTime() > now.getTime()) continue;
      if (!allowed.has(r.id)) continue; // der offene PaymentIntent konnte noch nicht geklaert/abgebrochen werden: naechste Runde
      const [seat] = await tx.select({ teamId: matchParticipants.teamId }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, r.userId))).for("update");
      const slotTeamId = seat?.teamId ?? game.homeTeamId;
      await clearCoversInvolving(tx, matchId, r.userId);
      await tx.delete(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, r.userId)));
      await tx.update(paymentCharges).set({ resolution: "replaced", slotTeamId, updatedAt: now }).where(eq(paymentCharges.id, r.id));
      r.resolution = "replaced";
      r.slotTeamId = slotTeamId;
      out.released += 1;
      await audit(null, "charge.seat_released", "match", matchId, { after: { userId: r.userId } }, tx);
      // NUR der Ersetzte (er ist der Betroffene), nichts an Dritte
      await notifyUsers(
        [r.userId],
        {
          type: "payment",
          title: "Dein Platz wurde vergeben",
          body: `${await teamName(tx, game.homeTeamId)} gegen ${await teamName(tx, game.awayTeamId)}: Dein Platz wurde vergeben, weil die Zahlung nicht zustande kam. Es wurde nichts abgebucht.`,
          url: `/lobby/${matchId}`,
        },
        tx,
      );
    }

    // 2) offene Plaetze: Nachruecker von der Warteliste
    for (const slot of roots.filter((r) => r.resolution === "replaced")) {
      const kids = await tx.select().from(paymentCharges).where(eq(paymentCharges.slotOf, slot.id));
      if (kids.some((k) => k.status === "succeeded" && k.resolution === null)) continue; // Platz besetzt (ein ERSETZTER Nachruecker mit spaetem Erfolg zaehlt nicht)
      // Ein eingeteilter Nachruecker, dessen Zeile wegen Absage/Schalter AUS geschlossen wurde (match_closed), besetzt den Platz weiter; kein zweiter Kandidat, sonst zwei Spieler auf einem Platz
      if (kids.some((k) => k.resolution === null && k.failureCode === "match_closed")) continue;
      if (kids.some((k) => k.status === "pending")) continue; // ein Nachruecker ist unterwegs: weder Versuch verbrauchen noch einen zweiten starten
      // Gescheiterte Nachruecker zaehlen ueber resolution=replaced (setzt failSubstitute immer), NICHT nur ueber den Status: ein gescheiterter Nachruecker, dessen alter PaymentIntent spaeter doch
      // noch gelingt, hat status=succeeded und failureCode=null, bleibt aber replaced und verbraucht seinen Versuch weiter (sonst sinkt die Zaehlung und ein vierter Kandidat wird abgebucht, Review PR #109).
      // Offene Zustaende ohne resolution (failed/requires_action) zaehlen wie bisher; match_closed (Absage/Schalter AUS) ist kein Fehlversuch.
      if (kids.filter((k) => k.failureCode !== "match_closed" && (k.resolution === "replaced" || k.status === "failed" || k.status === "requires_action")).length >= MAX_SUBSTITUTE_FAILURES) {
        out.exhausted.push(slot.id);
        continue;
      }
      // Kandidaten muessen eingerichtet sein (onboarded_at UND age_confirmed_at: Alterspruefung beim Onboarding, MIN_AGE): zweite Schicht neben dem Beitritts-Gate. Plattform-Mitarbeiter (ensureStaffOnboarded)
      // bekommen onboarded_at ohne Alterspruefung, haben aber kein age_confirmed_at und spielen nicht mit: sie sind nie Kandidat.
      const [next] = (
        await tx.execute(sql`
          select p.user_id from match_participants p join users u on u.id = p.user_id
          where p.match_id = ${matchId} and p.team_id is null and p.card_status = 'card_ready' and u.banned_at is null and u.onboarded_at is not null and u.age_confirmed_at is not null
            and not exists (select 1 from payment_charges c where c.match_id = p.match_id and c.user_id = p.user_id)
          order by p.joined_at, p.user_id
          limit 1
          for update of p skip locked`)
      ).rows as { user_id: string }[];
      if (!next) {
        // Gibt es Kandidaten, die nur gerade von einer anderen Transaktion gehalten werden (z. B. Kartenaenderung), ist der Platz NICHT erschoepft: Runde auslassen. Eine
        // Auto-Absage ist unumkehrbar und darf nie auf einer zufaelligen Sperre beruhen.
        const [locked] = (
          await tx.execute(sql`
            select count(*)::int as n from match_participants p join users u on u.id = p.user_id
            where p.match_id = ${matchId} and p.team_id is null and p.card_status = 'card_ready' and u.banned_at is null and u.onboarded_at is not null and u.age_confirmed_at is not null
              and not exists (select 1 from payment_charges c where c.match_id = p.match_id and c.user_id = p.user_id)`)
        ).rows as { n: number }[];
        if ((locked?.n ?? 0) === 0) out.exhausted.push(slot.id);
        continue;
      }
      const teamId = slot.slotTeamId ?? game.homeTeamId;
      await tx.update(matchParticipants).set({ teamId, cardStatus: "charge_pending", readyAt: now }).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, next.user_id)));
      await tx.insert(paymentCharges).values({ matchId, userId: next.user_id, amountCents: slot.amountCents, idempotencyKey: chargeKey(matchId, next.user_id), slotOf: slot.id });
      out.filled += 1;
      await audit(null, "charge.substitute", "match", matchId, { after: { userId: next.user_id, slot: slot.id } }, tx);
      const label = `${await teamName(tx, game.homeTeamId)} gegen ${await teamName(tx, game.awayTeamId)}`;
      await notifyUsers([next.user_id], { type: "payment", title: "Du bist nachgerückt", body: `${label}: Du bist nachgerückt. Dein Anteil von ${formatEuro(slot.amountCents)} wird jetzt von deiner Karte abgebucht.`, url: `/lobby/${matchId}` }, tx);
      // Dritte (Captain des Teams): nur die neutrale Kaderaenderung, kein Name, kein Grund
      await notifyUsers(await teamAdminIds(tx, teamId), { type: "payment", title: "Kader geändert", body: `${label}: Ein Platz wurde neu besetzt.`, url: `/lobby/${matchId}` }, tx, next.user_id);
    }
    return out;
  });
}

/**
 * Fuehrt den Schritt fuer ein Spiel oder alle betroffenen Spiele aus und sendet danach die neuen Nachruecker-Zeilen. Gescheiterte Nachruecker werden in
 * demselben Lauf durch den Naechsten ersetzt (hoechstens MAX_SUBSTITUTE_FAILURES + 1 Durchgaenge). Fehler bei einem Spiel stoppen die anderen nicht.
 */
export async function runSubstitutes(opts: { matchId?: string; now?: Date } = {}): Promise<SubstituteResult> {
  const now = opts.now ?? new Date();
  const total: SubstituteResult = { released: 0, filled: 0, exhausted: [] };
  let matchIds: string[];
  if (opts.matchId) matchIds = [opts.matchId];
  else {
    const rows = await db
      .selectDistinct({ id: paymentCharges.matchId })
      .from(paymentCharges)
      .innerJoin(matches, eq(matches.id, paymentCharges.matchId))
      .where(
        and(
          isNull(paymentCharges.slotOf),
          inArray(matches.status, ["lobby", "confirmed"]),
          isNull(matches.cancelRequestedAt),
          isNull(matches.settledAt),
          sql`${matches.startsAt} > ${now}`,
          sql`(${paymentCharges.resolution} = 'replaced' or (${paymentCharges.resolution} is null and ${paymentCharges.status} in ('failed', 'requires_action') and ${paymentCharges.graceUntil} is not null and least(${paymentCharges.graceUntil}, ${matches.startsAt} - interval '1 hour') <= ${now}))`,
        ),
      );
    matchIds = rows.map((r) => matchIdOf({ matchId: r.id }));
  }
  for (const matchId of matchIds) {
    try {
      const exhausted = new Set<string>();
      for (let pass = 0; pass <= MAX_SUBSTITUTE_FAILURES; pass++) {
        const allowed = await prepareReleases(matchId, now);
        const r = await processMatch(matchId, now, allowed);
        total.released += r.released;
        total.filled += r.filled;
        r.exhausted.forEach((e) => exhausted.add(e));
        if (r.filled === 0) break;
        await runCharges(matchId, now); // Netz ausserhalb jeder Transaktion
        // ist der neue Nachruecker sofort gescheitert, kommt im naechsten Durchgang der Naechste; sonst ist der Platz besetzt oder offen (pending)
      }
      for (const e of exhausted) if (!total.exhausted.includes(e)) total.exhausted.push(e);
      // AC-9: kein Nachruecker fuer einen Platz (Warteliste leer oder 3 Fehlschlaege) => das Spiel wird AUTOMATISCH abgesagt: System-Absage ohne Akteur und ohne Rollenpruefung,
      // alle bereits Abgebuchten werden ueber den Ablauf aus M3a voll auf die Karte erstattet. Der Text nennt weder Namen noch den Fehlschlag einer einzelnen Abbuchung (AC-20).
      if (exhausted.size > 0) await requestMatchCancel(null, matchId, CANCEL_REASON, now);
    } catch (error) {
      console.error("runSubstitutes: Fehler bei Spiel", matchId, error instanceof Error ? error.name : "Fehler");
    }
  }
  return total;
}
