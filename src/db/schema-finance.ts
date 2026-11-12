import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
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
export const ledgerKind = pgEnum("ledger_kind", ["topup", "fee", "promo_credit", "match_share", "refund", "venue_cost", "adjustment", "chargeback", "tournament_entry", "tournament_refund", "tournament_payout", "tournament_commission", "commission", "commission_bonus"]);
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
  commissionPercent: numeric("commission_percent", { precision: 5, scale: 2 }).notNull().default("10"),
  commissionBonusEnabled: boolean("commission_bonus_enabled").notNull().default(false),
  invoiceEmail: text("invoice_email"), // Adresse für die Monatsrechnung (Vertrag 009 M2); ohne Adresse bleibt die Rechnung im Admin abrufbar
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("venues_commission_percent_range", sql`${t.commissionPercent} >= 0 and ${t.commissionPercent} <= 100`)],
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
  kind: text("kind").notNull(), // topup | match
  paymentId: uuid("payment_id").references(() => payments.id),
  matchId: uuid("match_id").references(() => matches.id),
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
