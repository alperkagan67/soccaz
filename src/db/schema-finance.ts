import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  smallint,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { matches, users } from "./schema";

// ---------------------------------------------------------------------------------------------
// Phase 2: Geld und Halle
// ---------------------------------------------------------------------------------------------

export const ledgerAccount = pgEnum("ledger_account", ["wallet", "clearing", "bank", "revenue", "venue_cost", "fees", "promo", "chargeback", "tournament", "venue_payable", "commission"]);
export const ledgerKind = pgEnum("ledger_kind", ["topup", "fee", "promo_credit", "match_share", "refund", "venue_cost", "adjustment", "chargeback", "tournament_entry", "tournament_refund", "tournament_payout", "tournament_commission", "commission", "commission_bonus", "tournament_share"]);
export const paymentProvider = pgEnum("payment_provider", ["dev", "stripe"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "canceled"]);
export const bookingStatus = pgEnum("booking_status", ["open", "in_progress", "booked", "unavailable", "confirmed", "withdrawn", "done"]);

/** Einstellungen, die Admins ohne Neustart ändern (z. B. Zahlungen an oder aus). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

export const venues = pgTable(
  "venues",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  contact: text("contact"),
  surface: text("surface"),
  hasShowers: boolean("has_showers").notNull().default(false),
  hasParking: boolean("has_parking").notNull().default(false),
  isPartner: boolean("is_partner").notNull().default(false),
  source: text("source").notNull().default("manual"), // manual | osm
  osmId: text("osm_id").unique(),
  website: text("website"),
  verified: boolean("verified").notNull().default(true), // false = Angaben aus OpenStreetMap, Buchbarkeit und Preis ungeprüft
  active: boolean("active").notNull().default(true),
  managerUserId: uuid("manager_user_id"), // Hallenbetreiber: bestätigt Spielanfragen für diese Halle
  // Vertrag 009 M2: Provision je Halle (nur Admin 1). Prozent der Hallenmiete (0 bis 100, höchstens 2 Nachkommastellen); der 10er-Bonus ist kumulierbar (Entscheid t9).
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  commissionBonusEnabled: boolean("commission_bonus_enabled").notNull().default(false),
  invoiceEmail: text("invoice_email"), // Adresse für die Monatsrechnung (Vertrag 009 M2); ohne Adresse bleibt die Rechnung im Admin abrufbar
  // Vertrag 013 v3 AC-31 (Freischaltung): Eine Halle aus der Anfrage ("Anfrage senden") ist "requested" und inaktiv; erst die Freischaltung durch Admin 1/2 setzt "approved" und active. Standard "approved" (Altbestand, Admin-Anlage, Import).
  approvalStatus: text("approval_status").$type<"requested" | "approved" | "rejected">().notNull().default("approved"),
  approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true }),
  approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
  approvalDecidedBy: uuid("approval_decided_by").references(() => users.id, { onDelete: "set null" }),
  approvalReason: text("approval_reason"), // Grund der Ablehnung (3 bis 200 Zeichen), keine Personendaten
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("venues_commission_percent_range", sql`${t.commissionPercent} >= 0 and ${t.commissionPercent} <= 100`),
    check("venues_approval_status_chk", sql`${t.approvalStatus} in ('requested', 'approved', 'rejected')`),
  ],
);

/**
 * Provision je Spiel (Vertrag 009 M2): Schnappschuss von Satz und Bemessungsgrundlage zum Buchungszeitpunkt, genau eine Zeile je Spiel. NUR ANHÄNGEN (Trigger wie das Hauptbuch):
 * Die Stornierung steht im Hauptbuch (Gegenbuchung), nicht hier. Die Hallenmiete (cost_cents des Spiels) ist die Bemessungsgrundlage (Entscheid t9, P6).
 */
export const matchCommissions = pgTable(
  "match_commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().unique().references(() => matches.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
    ratePercent: numeric("rate_percent", { precision: 5, scale: 2 }).notNull(),
    baseCents: integer("base_cents").notNull(),
    commissionCents: integer("commission_cents").notNull(),
    ledgerEntryId: uuid("ledger_entry_id"), // die Provisionsbuchung (kann fehlen, wenn die Provision 0 ist)
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("match_commissions_venue_idx").on(t.venueId, t.bookedAt),
    check("match_commissions_amounts_check", sql`${t.baseCents} >= 0 and ${t.commissionCents} >= 0 and ${t.commissionCents} <= ${t.baseCents}`),
  ],
);

/** Zähler der Rechnungsnummern je Jahr (Zeilensperre, lückenlos auch bei Abbruch; Vertrag 009 M2). */
export const invoiceNumberCounters = pgTable("invoice_number_counters", {
  year: integer("year").primaryKey(),
  last: integer("last").notNull().default(0),
});

/**
 * Betreiber-Zugang je Halle (Vertrag 011 M1, Entscheid t9: je Halle eine Zeile, ein Zugang geteilt mit den Mitarbeitern). invited = Admin 1 hat eine Google-E-Mail freigegeben (user_id leer),
 * active = beim ersten verifizierten Google-Login eingelöst (danach hängt der Zugang an user_id, nie wieder an der E-Mail), revoked = entzogen (Historie bleibt, E-Mail geleert).
 * Genau ein offener oder aktiver Zugang je Halle (partieller Unique). venues.manager_user_id bleibt bis 011 M4 als Rückfall und wird in jedem Pfad mitgeschrieben.
 */
export const venueAccess = pgTable(
  "venue_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id),
    invitedEmail: text("invited_email"),
    status: text("status").$type<"invited" | "active" | "revoked">().notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("venue_access_one_open_per_venue").on(t.venueId).where(sql`${t.status} <> 'revoked'`),
    index("venue_access_user_idx").on(t.userId),
    index("venue_access_email_idx").on(sql`lower(${t.invitedEmail})`).where(sql`${t.status} = 'invited'`),
    check("venue_access_invited_chk", sql`${t.status} <> 'invited' or (${t.userId} is null and ${t.invitedEmail} is not null)`),
    check("venue_access_active_chk", sql`${t.status} <> 'active' or ${t.userId} is not null`),
  ],
);

/** Monatssammelrechnung über die Provision an eine Halle. NUR ANHÄNGEN (Trigger): Korrektur = Gutschrift als eigene Rechnung. Eine Rechnung je Halle und Monat. */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: text("number").notNull().unique(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "restrict" }),
    period: text("period").notNull(), // YYYY-MM
    vatMode: text("vat_mode").$type<"19" | "kleinunternehmer">().notNull(),
    vatPercent: integer("vat_percent").notNull(),
    netCents: integer("net_cents").notNull(),
    vatCents: integer("vat_cents").notNull(),
    grossCents: integer("gross_cents").notNull(),
    note: text("note"), // Hinweistext (z. B. Kleinunternehmer), Wortlaut aus der Einstellung
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_venue_period_idx").on(t.venueId, t.period),
    check("invoices_amounts_check", sql`${t.netCents} > 0 and ${t.vatCents} >= 0 and ${t.grossCents} = ${t.netCents} + ${t.vatCents}`),
  ],
);

/** Zeile je Provisionsbuchung (Provision eines Spiels oder Bonus). Jede Hauptbuch-Buchung wird höchstens einmal abgerechnet (eindeutig). NUR ANHÄNGEN. */
export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"commission" | "bonus">().notNull(),
    ledgerEntryId: uuid("ledger_entry_id").notNull().unique(),
    matchId: uuid("match_id"),
    gameStartsAt: timestamp("game_starts_at", { withTimezone: true }),
    gameNumber: integer("game_number"),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId), check("invoice_lines_amount_positive", sql`${t.amountCents} > 0`)],
);

/** Versand der Rechnung (Outbox mit Wiederholung). Hier sind Änderungen erlaubt; die Rechnung selbst bleibt unverändert. */
export const invoiceDeliveries = pgTable(
  "invoice_deliveries",
  {
    invoiceId: uuid("invoice_id").primaryKey().references(() => invoices.id, { onDelete: "restrict" }),
    status: text("status").$type<"pending" | "sent" | "skipped" | "failed">().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextTryAt: timestamp("next_try_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("invoice_deliveries_due_idx").on(t.status, t.nextTryAt),
    check("invoice_deliveries_status_check", sql`${t.status} in ('pending', 'sent', 'skipped', 'failed')`),
  ],
);

/** Preis, den Spieler für die Halle zahlen, und Kosten, die uns die Halle berechnet. Ohne Halle gilt der Standard. */
export const priceRules = pgTable("price_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  venueId: uuid("venue_id").references(() => venues.id, { onDelete: "cascade" }),
  durationMin: integer("duration_min").notNull(),
  priceCents: integer("price_cents").notNull(),
  costCents: integer("cost_cents").notNull(),
  validFrom: date("valid_from").notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    provider: paymentProvider("provider").notNull(),
    providerRef: text("provider_ref").unique(),
    kind: text("kind").notNull().default("topup"),
    amountCents: integer("amount_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    status: paymentStatus("status").notNull().default("pending"),
    promoCodeId: uuid("promo_code_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    failureReason: text("failure_reason"),
    returnTo: text("return_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt)],
);

export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull(), // percent | fixed
  value: integer("value").notNull(),
  minTopupCents: integer("min_topup_cents").notNull().default(0),
  maxBonusCents: integer("max_bonus_cents"),
  budgetCents: integer("budget_cents"),
  usedCents: integer("used_cents").notNull().default(0),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  newUsersOnly: boolean("new_users_only").notNull().default(false),
  maxPerUser: integer("max_per_user").notNull().default(1),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promoRedemptions = pgTable("promo_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  codeId: uuid("code_id").notNull().references(() => promoCodes.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  paymentId: uuid("payment_id").notNull().references(() => payments.id).unique(),
  amountCents: integer("amount_cents").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

/** Das Buchungsjournal. Jede Zeile ist eine vollständige Buchung (Soll an Haben), unveränderlich (Datenbank-Trigger). */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    debitAccount: ledgerAccount("debit_account").notNull(),
    debitUserId: uuid("debit_user_id").references(() => users.id),
    creditAccount: ledgerAccount("credit_account").notNull(),
    creditUserId: uuid("credit_user_id").references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    kind: ledgerKind("kind").notNull(),
    matchId: uuid("match_id").references(() => matches.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    tournamentId: uuid("tournament_id"), // Turniergelder (Fremdschlüssel in der Migration, um Importschleifen zu vermeiden)
    reversesEntryId: uuid("reverses_entry_id"),
    reason: text("reason"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    actorId: uuid("actor_id").references(() => users.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("ledger_amount_positive", sql`${t.amountCents} > 0`),
    index("ledger_debit_user_idx").on(t.debitUserId, t.at),
    index("ledger_credit_user_idx").on(t.creditUserId, t.at),
    index("ledger_match_idx").on(t.matchId),
    index("ledger_at_idx").on(t.at),
  ],
);

export const bookingJobs = pgTable("booking_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }).unique(),
  venueId: uuid("venue_id").references(() => venues.id),
  status: bookingStatus("status").notNull().default("open"),
  assigneeId: uuid("assignee_id").references(() => users.id),
  proofUrl: text("proof_url"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").references(() => matches.id),
  kind: text("kind").notNull().default("venue"), // venue | other
  amountCents: integer("amount_cents").notNull(),
  note: text("note"),
  receiptUrl: text("receipt_url"),
  paidOn: date("paid_on").notNull().defaultNow(),
  ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Belege mit fortlaufender Nummer (Sequenz receipt_number_seq). */
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: text("number").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // topup | match | tournament
  paymentId: uuid("payment_id").references(() => payments.id),
  matchId: uuid("match_id").references(() => matches.id),
  // M5-4: Beleg zu einem Turnier (kind = tournament); der Fremdschluessel (NO ACTION) steht in der Migration (schema-league importiert aus schema, nicht umgekehrt)
  tournamentId: uuid("tournament_id"),
  amountCents: integer("amount_cents").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Erstattungen, die erst fällig werden, wenn für einen ausgefallenen Spieler ein Ersatz bezahlt hat. */
export const pendingRefunds = pgTable(
  "pending_refunds",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
);

// ---------------------------------------------------------------------------------------------
// Beweisprotokoll (Vertrag 009 M3, Plan docs/design/009-m3-plan.md)
// ---------------------------------------------------------------------------------------------

/**
 * Beweisprotokoll der Hallenanfragen und Buchungsaufträge. NUR ANHÄNGEN (Trigger forbid_append_only_mutation, Wartungsausnahme socaz.ledger_maintenance).
 * seq, prev_hash, hash und at setzt der INSERT-Trigger aus dem Zählerstand (booking_evidence_counter): die Anwendung kann keinen dieser Werte vorgeben.
 * Im Hash steht kein Personenbezug (nur actor_commitment); Name und E-Mail des Betreibers liegen getrennt in evidence_actor.
 */
export const bookingEvidence = pgTable(
  "booking_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: integer("seq").notNull().default(0),
    // KEINE Fremdschluessel (Plan 14.1): ein INSERT mit FK nimmt FOR KEY SHARE auf matches/venues; die DEFERRABLE-Trigger schreiben beim COMMIT unter der Zaehlersperre, das ergaebe einen Deadlock-Zyklus.
    // Ersatz fuer RESTRICT: BEFORE-DELETE-Guard-Trigger auf matches/venues (Migration); Verwaiste meldet verifyEvidenceChain/Tagesjob.
    matchId: uuid("match_id"), // NULL nur bei Betreff 'tournament' (XOR-CHECK, Nachlieferung 009 M3, Plan 16c.1)
    venueId: uuid("venue_id"),
    round: integer("round").notNull().default(0),
    jobId: uuid("job_id"),
    kind: text("kind").notNull(),
    reason: text("reason"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorCommitment: text("actor_commitment").notNull().default(""),
    prevHash: text("prev_hash").notNull().default(""),
    hash: text("hash").notNull().default(""),
    txId: bigint("tx_id", { mode: "number" }).notNull().default(sql`txid_current()`), // Transaktionsnummer: Eintraege einer Hallenpruefung gehoeren zur selben Runde (Plan 14.4); nicht im Hash
    matchPrevHash: text("match_prev_hash"), // Variante Z (Kette je Spiel): nur als Spalte angelegt, nicht ausgewertet (Entscheid t9)
    // --- Nachlieferung 009 M3 (Migration 0054, Plan 16b bis 16h): Hash-Version 2 ---
    // Altzeilen (0052) sind Version 1 (eingefrorene Funktion evidence_hash); Spaltenstandard nach der Migration 2, Version 1 nur unter der Wartungsausnahme (16f.5).
    hashVersion: smallint("hash_version").notNull().default(2),
    subject: text("subject").notNull().default("match"), // 'match' | 'tournament'
    tournamentId: uuid("tournament_id"),
    reasonCode: text("reason_code").notNull().default(""), // belegt | wartung | veranstaltung | sonstiges, leer = keiner (im Hash)
    reasonCommitment: text("reason_commitment").notNull().default(""), // sha256(salt:text) des Freitexts, Klartext in booking_evidence_reason_text (im Hash)
    deadlineAt: timestamp("deadline_at", { withTimezone: true }), // Antwortfrist (Spiele), im Hash
    decidedAt: timestamp("decided_at", { withTimezone: true }), // Entscheidungszeit = transaction_timestamp(), im Hash
    statementAt: timestamp("statement_at", { withTimezone: true }), // Anweisungszeit (clock_timestamp), im Hash, informativ
    enforced: boolean("enforced"), // Schalterstand evidence_enforcement bei der Entscheidung; NULL = nicht anwendbar (Hash: '1' | '0' | '')
  },
  (t) => [
    uniqueIndex("booking_evidence_seq_idx").on(t.seq),
    uniqueIndex("booking_evidence_request_idx").on(t.matchId, t.venueId, t.round, t.kind).where(sql`${t.subject} = 'match' and ${t.kind} in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired', 'late_attempt')`),
    // Turnier: Einmaligkeit nicht auf 'accepted' beschraenkt, damit spaetere Arten automatisch einmalig sind (Plan 16d.8)
    uniqueIndex("booking_evidence_tournament_unique_idx").on(t.tournamentId, t.venueId, t.round, t.kind).where(sql`${t.subject} = 'tournament'`),
    index("booking_evidence_match_idx").on(t.matchId, t.seq),
    index("booking_evidence_tournament_idx").on(t.tournamentId, t.seq),
    index("booking_evidence_venue_idx").on(t.venueId), // Abgleich, Verwaisten-Pruefung (sonst Seq-Scans)
    index("booking_evidence_job_idx").on(t.jobId), // Abgleich der Auftraege
    check(
      "booking_evidence_kind_check",
      sql`${t.kind} in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired', 'late_attempt', 'job_open', 'job_booked', 'job_confirmed', 'job_unavailable', 'job_withdrawn', 'job_done')`,
    ),
    check("booking_evidence_tournament_kind_check", sql`${t.subject} = 'match' or ${t.kind} = 'accepted'`), // spaeter per DROP/ADD erweiterbar (16d.8)
    check("booking_evidence_reason_len", sql`${t.reason} is null or char_length(${t.reason}) <= 300`),
    check("booking_evidence_subject_xor", sql`(${t.subject} = 'match' and ${t.matchId} is not null and ${t.tournamentId} is null) or (${t.subject} = 'tournament' and ${t.tournamentId} is not null and ${t.matchId} is null)`),
    check("booking_evidence_hash_version_check", sql`${t.hashVersion} in (1, 2)`),
    check(
      "booking_evidence_v1_check",
      sql`${t.hashVersion} <> 1 or (${t.subject} = 'match' and ${t.matchId} is not null and ${t.reasonCode} = '' and ${t.reasonCommitment} = '' and ${t.deadlineAt} is null and ${t.decidedAt} is null and ${t.statementAt} is null and ${t.enforced} is null and ${t.kind} <> 'late_attempt')`,
    ),
    check("booking_evidence_v2_check", sql`${t.hashVersion} <> 2 or ${t.reason} is null`), // Klartext nur in der Nebentabelle
    check("booking_evidence_reason_code_check", sql`${t.reasonCode} in ('', 'belegt', 'wartung', 'veranstaltung', 'sonstiges')`),
    // Frist-CHECKs (16e.2/16g.2): nur Version 2; Spiele mit Durchsetzung verlangen Frist und rechtzeitige Antwort, ein declined (Antwort) einen Code; expired: KEIN harter CHECK (Uhr, Befund im Abgleich)
    check(
      "booking_evidence_match_deadline_check",
      sql`${t.hashVersion} <> 2 or ${t.subject} <> 'match' or ${t.kind} not in ('accepted', 'declined') or ${t.enforced} is not true or (${t.deadlineAt} is not null and ${t.decidedAt} is not null and ${t.decidedAt} <= ${t.deadlineAt} and (${t.kind} <> 'declined' or ${t.reasonCode} <> ''))`,
    ),
    check("booking_evidence_tournament_deadline_check", sql`${t.subject} <> 'tournament' or (${t.decidedAt} is not null and ${t.deadlineAt} is null)`),
    check("booking_evidence_enforced_check", sql`${t.enforced} is null or (${t.subject} = 'match' and ${t.kind} in ('accepted', 'declined', 'expired', 'late_attempt'))`), // Plan 16h.1: Schalterstand nur bei Antwort/Ablauf/Antwortversuch
    check("booking_evidence_tournament_statement_check", sql`${t.subject} <> 'tournament' or ${t.statementAt} = ${t.decidedAt}`), // Plan 16h.1 (c): Turnier: Anweisungszeit = Entscheidungszeit
    check("booking_evidence_late_check", sql`${t.kind} <> 'late_attempt' or (${t.deadlineAt} is not null and ${t.decidedAt} is not null and ${t.decidedAt} > ${t.deadlineAt})`),
  ],
);

/** Eine Zeile (id = 1): letzter Stand der Kette. Der INSERT-Trigger sperrt sie, zählt hoch und schreibt den neuen Kopf-Hash. */
export const bookingEvidenceCounter = pgTable(
  "booking_evidence_counter",
  {
    id: integer("id").primaryKey().default(1),
    lastSeq: integer("last_seq").notNull().default(0),
    lastHash: text("last_hash").notNull().default(""),
  },
  (t) => [check("booking_evidence_counter_single", sql`${t.id} = 1`)],
);

/**
 * Personenfelder zum Protokolleintrag (Betreiber, der geantwortet hat; Plan 011 P2), AUSSERHALB des Hashes. Das Salz je Zeile liegt hier: Löschen/Anonymisieren der Zeile löst den
 * Bezug endgültig, die Kette bleibt gültig (im Hash steht nur actor_commitment = sha256(salt || user_id)). Entwurf, Frage R3 (Anwalt).
 */
export const evidenceActor = pgTable("evidence_actor", {
  evidenceId: uuid("evidence_id").primaryKey().references(() => bookingEvidence.id, { onDelete: "cascade" }),
  userId: uuid("user_id"), // KEIN Fremdschluessel (Plan 14.1: users wird oft FOR UPDATE gesperrt); die Kontoloeschung leert user_id, name, email
  name: text("name"),
  email: text("email"),
  salt: text("salt").notNull(),
});

/**
 * Klartext der Begruendung (Freitext des Betreibers) zum Protokolleintrag, AUSSERHALB des Hashes (Nachlieferung 009 M3, Plan 16b.1/16f.7): im Hash steht nur reason_commitment = sha256(salt:reason).
 * NICHT anhaengend: Loeschen der Zeile (Kontoloeschung, Aufbewahrung, Anwaltsanfrage) laesst die Kette gueltig. Anonymisieren nur per DELETE (ein UPDATE bricht das Commitment).
 * Frage R3 (Anwalt): Speicherung zum Beweiszweck, Aufbewahrung; Backups/WAL erreicht das Loeschen nicht.
 */
export const bookingEvidenceReasonText = pgTable(
  "booking_evidence_reason_text",
  {
    evidenceId: uuid("evidence_id").primaryKey().references(() => bookingEvidence.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    salt: text("salt").notNull(),
  },
  (t) => [check("booking_evidence_reason_text_len", sql`char_length(${t.reason}) between 3 and 200`), check("booking_evidence_reason_text_salt", sql`char_length(${t.salt}) > 0`)],
);
