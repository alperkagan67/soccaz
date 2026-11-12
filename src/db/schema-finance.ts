import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
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

export const ledgerAccount = pgEnum("ledger_account", ["wallet", "clearing", "bank", "revenue", "venue_cost", "fees", "promo", "chargeback", "tournament"]);
export const ledgerKind = pgEnum("ledger_kind", ["topup", "fee", "promo_credit", "match_share", "refund", "venue_cost", "adjustment", "chargeback", "tournament_entry", "tournament_refund", "tournament_payout", "tournament_commission"]);
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

export const venues = pgTable("venues", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
