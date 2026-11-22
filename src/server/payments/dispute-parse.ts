// Zahlungsstreit (Vertrag 012, M4a): macht aus einem ungeprueften Stripe-Streit-Objekt (Webhook oder retrieve) eine typisierte Meldung. Alle Werte sind Eingabe von aussen und werden NICHT
// vertraut; was fehlt oder nicht passt, wird null/leer (die Verbuchung in dispute.ts prueft und alarmiert). Keine Freitexte von Stripe, nur Codes.

export type DisputeBalanceTransaction = {
  id: string;
  /** negativ = Abzug, positiv = Rueckbuchung (wie bei Stripe) */
  amountCents: number;
  feeCents: number;
  currency: string | null;
  category: string | null;
};

export type DisputeReport = {
  disputeId: string;
  paymentIntentId: string | null;
  chargeId: string | null;
  amountCents: number | null;
  currency: string | null;
  reason: string;
  status: string;
  evidenceDueBy: Date | null;
  /** null = das Objekt enthielt keine Liste (dann ist ein Abruf noetig); [] = leere Liste */
  balanceTransactions: DisputeBalanceTransaction[] | null;
};

const id = (v: unknown, prefix: string) => (typeof v === "string" && v.startsWith(prefix) && /^[A-Za-z0-9_]{3,80}$/.test(v) ? v : null);
const code = (v: unknown) => (typeof v === "string" && /^[a-z0-9_.-]{1,64}$/i.test(v) ? v : null);

/** Parst ein Stripe-Streit-Objekt. null, wenn nicht einmal die Streit-ID brauchbar ist. */
export function parseDispute(o: Record<string, unknown>): DisputeReport | null {
  const disputeId = id(o.id, "dp_");
  if (!disputeId) return null;
  const pi = typeof o.payment_intent === "string" ? o.payment_intent : (o.payment_intent as { id?: unknown } | null | undefined)?.id;
  const ch = typeof o.charge === "string" ? o.charge : (o.charge as { id?: unknown } | null | undefined)?.id;
  const due = (o.evidence_details as { due_by?: unknown } | null | undefined)?.due_by;
  let bts: DisputeBalanceTransaction[] | null = null;
  if (Array.isArray(o.balance_transactions)) {
    bts = [];
    for (const raw of o.balance_transactions) {
      if (!raw || typeof raw !== "object") continue;
      const b = raw as Record<string, unknown>;
      const btId = id(b.id, "txn_");
      if (!btId || typeof b.amount !== "number" || !Number.isInteger(b.amount)) continue;
      bts.push({
        id: btId,
        amountCents: b.amount,
        feeCents: typeof b.fee === "number" && Number.isInteger(b.fee) ? b.fee : 0, // negativ = Gebuehrenrueckerstattung (gewonnener Streit)
        currency: typeof b.currency === "string" ? b.currency.toLowerCase() : null,
        category: code(b.reporting_category) ?? code(b.type),
      });
    }
  }
  return {
    disputeId,
    paymentIntentId: id(pi, "pi_"),
    chargeId: id(ch, "ch_"),
    amountCents: typeof o.amount === "number" && Number.isInteger(o.amount) ? o.amount : null,
    currency: typeof o.currency === "string" ? o.currency.toLowerCase() : null,
    reason: code(o.reason) ?? "unknown",
    status: code(o.status) ?? "unknown",
    evidenceDueBy: typeof due === "number" && Number.isFinite(due) ? new Date(due * 1000) : null,
    balanceTransactions: bts,
  };
}

/** Rang des Streitstatus: ein Endstatus (3) wird nie ueberschrieben, Unbekanntes hat Rang 0 (wird toleriert, nie als Fehler abgelehnt). */
export const RANK: Record<string, number> = { needs_response: 1, warning_needs_response: 1, under_review: 2, warning_under_review: 2, won: 3, lost: 3, warning_closed: 3, prevented: 3 };
export const disputeRank = (status: string) => RANK[status] ?? 0;
/** Alle bekannten Streitstatus (alles andere gilt als unbekannt und damit als OFFEN). */
export const KNOWN_DISPUTE_STATUSES = Object.keys(RANK);
/** Offene Streite sperren die Erstattung. Ein UNBEKANNTER Status gilt als offen (lieber keine Erstattung als Geld verlieren). */
export const OPEN_DISPUTE_STATUSES = ["needs_response", "under_review", "warning_needs_response", "warning_under_review"] as const;
export const isDisputeOpen = (status: string) => (OPEN_DISPUTE_STATUSES as readonly string[]).includes(status) || !(status in RANK);
