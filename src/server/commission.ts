import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { matchCommissions, venues } from "@/db/schema-finance";
import { bonusNumber, commissionCents, parseCommissionPercent, percentFromDb } from "@/lib/commission";
import { audit } from "./audit";
import { getSetting } from "./settings";
import { post, reverseEntry, type Account } from "./ledger";
import { DomainError } from "./teams";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MatchRow = typeof matches.$inferSelect;

/** Vorgabe für neue Hallen: die Einstellung tournament_commission_percent (Standard 10, Vertrag 009: bleibt nur Vorgabe). */
export async function defaultCommissionPercent(exec: Pick<typeof db, "select"> = db): Promise<number> {
  const v = parseCommissionPercent(await getSetting<number>("tournament_commission_percent", 10, exec));
  return v ?? 10;
}

/** Konto, auf das die Abbuchung eines Spieleranteils fließt: neues Modell = Verbindlichkeit gegenüber der Halle, Altspiele = revenue (Entscheid t9 P4, S1 Variante A). */
export function shareAccount(model: "legacy" | "commission"): Account {
  return model === "commission" ? "venue_payable" : "revenue";
}

export async function shareAccountFor(tx: Tx, matchId: string): Promise<Account> {
  const [m] = await tx.select({ model: matches.ledgerModel }).from(matches).where(eq(matches.id, matchId));
  return shareAccount(m?.model ?? "legacy");
}

/**
 * Provision und 10er-Bonus einer Halle einstellen (nur Admin 1, der Aufrufer prüft die Berechtigung). Pflicht-Begründung (3 bis 200 Zeichen), Wertebereich 0 bis 100 mit höchstens
 * zwei Nachkommastellen, Protokoll wer/wann/vorher/nachher. Wirkt nur auf künftige Buchungen (Schnappschuss je Spiel).
 */
export async function setVenueCommission(actorId: string, venueId: string, input: { percent: unknown; bonusEnabled: boolean; reason: string; invoiceEmail?: string | null }) {
  const percent = parseCommissionPercent(input.percent);
  if (percent === null) throw new DomainError("Der Satz muss eine Zahl von 0 bis 100 mit höchstens zwei Nachkommastellen sein.");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("Bitte gib einen Grund an (mindestens 3 Zeichen).");
  if (reason.length > 200) throw new DomainError("Der Grund darf höchstens 200 Zeichen lang sein.");
  const email = (input.invoiceEmail ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("Die Rechnungsadresse ist keine E-Mail-Adresse.");
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(venues).where(eq(venues.id, venueId)).for("update");
    if (!v) throw new DomainError("Halle nicht gefunden.");
    await tx.update(venues).set({ commissionPercent: percent.toFixed(2), commissionBonusEnabled: input.bonusEnabled, ...(input.invoiceEmail === undefined ? {} : { invoiceEmail: email || null }) }).where(eq(venues.id, venueId));
    await audit(
      actorId,
      "venue.commission",
      "venue",
      venueId,
      { before: { percent: percentFromDb(v.commissionPercent), bonus: v.commissionBonusEnabled, hasInvoiceEmail: Boolean(v.invoiceEmail) }, after: { percent, bonus: input.bonusEnabled, hasInvoiceEmail: input.invoiceEmail === undefined ? Boolean(v.invoiceEmail) : Boolean(email), reason } },
      tx,
    );
  });
}

/** Anzahl der gezählten Spiele einer Halle: gebuchte Spiele mit Provisionszeile, nicht abgesagt (Vertrag 009, 10er-Bonus). */
export async function countedGames(tx: Pick<typeof db, "select">, venueId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(matchCommissions)
    .innerJoin(matches, eq(matches.id, matchCommissions.matchId))
    .where(and(eq(matchCommissions.venueId, venueId), ne(matches.status, "cancelled")));
  return row?.n ?? 0;
}

/**
 * Bucht die Provision eines Spiels (Modell commission) genau einmal: Schnappschuss (Satz, Hallenmiete) in match_commissions und `venue_payable → commission`.
 * Aufruf unter der Spielsperre, wenn alle Abbuchungen erfolgreich sind (settleIfComplete). Reihenfolge der Sperren: Spiel (hält der Aufrufer) → Halle (FOR UPDATE) → Buchungen.
 * Danach prüft sie den 10er-Bonus unter der Hallensperre: jedes 10. gezählte Spiel löst die Hallenmiete DIESES Spiels als Bonus aus (kumulierbar mit dem Prozentsatz,
 * ein ausgelöster Bonus bleibt auch bei späterer Absage, Entscheid t9 P1/P3). Idempotent über die Buchungsschlüssel.
 */
export async function bookCommission(tx: Tx, match: MatchRow): Promise<{ booked: boolean }> {
  if (match.ledgerModel !== "commission" || !match.venueId || match.costCents === null) return { booked: false }; // Altspiel, Halle unbekannt oder ohne Hallenmiete: keine Provision
  const [venue] = await tx.select().from(venues).where(eq(venues.id, match.venueId)).for("update"); // Hallensperre vor dem Zählen (Rennen um den 10. Platz)
  if (!venue) return { booked: false };
  const [existing] = await tx.select({ id: matchCommissions.id }).from(matchCommissions).where(eq(matchCommissions.matchId, match.id));
  if (existing) return { booked: false };

  const rate = percentFromDb(venue.commissionPercent);
  const commission = commissionCents(match.costCents, rate);
  let entryId: string | null = null;
  if (commission > 0) {
    const entry = await post(tx, {
      debit: { account: "venue_payable" },
      credit: { account: "commission" },
      amountCents: commission,
      kind: "commission",
      matchId: match.id,
      idempotencyKey: `commission:${match.id}`,
      reason: `Provision ${rate} % der Hallenmiete`,
    });
    entryId = entry.id;
  }
  await tx.insert(matchCommissions).values({ matchId: match.id, venueId: venue.id, ratePercent: rate.toFixed(2), baseCents: match.costCents, commissionCents: commission, ledgerEntryId: entryId });

  if (venue.commissionBonusEnabled) {
    const counted = await countedGames(tx, venue.id); // unter der Hallensperre, einschließlich dieses Spiels
    const k = bonusNumber(counted);
    if (k > 0 && match.costCents > 0) {
      await post(tx, {
        debit: { account: "venue_payable" },
        credit: { account: "commission" },
        amountCents: match.costCents,
        kind: "commission_bonus",
        matchId: match.id,
        idempotencyKey: `bonus:${venue.id}:${k}`,
        reason: `10er-Bonus Nr. ${k}: Hallenmiete des ${counted}. Spiels`,
      });
      await audit(null, "commission.bonus", "venue", venue.id, { after: { k, counted, matchId: match.id, amountCents: match.costCents } }, tx);
    }
  }
  await audit(null, "commission.booked", "match", match.id, { after: { venueId: venue.id, rate, baseCents: match.costCents, commissionCents: commission } }, tx);
  return { booked: true };
}

/** Absage: die Provision des Spiels wird GANZ storniert (Gegenbuchung, genau einmal); ein ausgelöster 10er-Bonus bleibt (Entscheid t9 P3/P7). */
export async function reverseCommission(tx: Tx, matchId: string): Promise<boolean> {
  const [mc] = await tx.select({ entryId: matchCommissions.ledgerEntryId }).from(matchCommissions).where(eq(matchCommissions.matchId, matchId));
  if (!mc?.entryId) return false;
  const r = await reverseEntry(tx, mc.entryId, { reason: "Provision storniert (Spiel abgesagt)", idempotencyKey: `commission-reversal:${matchId}` });
  return r.created;
}
