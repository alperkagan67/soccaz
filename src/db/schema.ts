import { sql } from "drizzle-orm";
import { COLOR_KEYS } from "../lib/team-color";
﻿import {
  boolean,
  check,
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

export type CardStatus = "none" | "card_ready" | "charge_pending" | "charged" | "failed";

export const userRole = pgEnum("user_role", ["player", "admin", "moderator", "finance", "booking"]);
export const teamRole = pgEnum("team_role", ["admin", "player"]);
export const visibility = pgEnum("visibility", ["public", "private"]);
export const requestStatus = pgEnum("request_status", ["open", "matched", "cancelled", "expired"]);
export const matchStatus = pgEnum("match_status", ["lobby", "confirmed", "played", "disputed", "cancelled"]);
export const eventType = pgEnum("event_type", ["goal", "yellow_card", "red_card"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  googleId: text("google_id").unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: userRole("role").notNull().default("player"),
  city: text("city"),
  position: text("position"),
  isVerifiedPro: boolean("is_verified_pro").notNull().default(false),
  profilePublic: boolean("profile_public").notNull().default(true),
  bio: text("bio"), // kurzer Steckbrief, höchstens 280 Zeichen
  nickname: text("nickname"), // Spitzname / Gamertag, höchstens 24 Zeichen
  accentColor: text("accent_color"), // Profilfarbe (green, cyan, violet, pink, coral, yellow, sky)
  shirtNumber: integer("shirt_number"), // 1 bis 99
  favoriteClub: text("favorite_club"),
  strongFoot: text("strong_foot"), // links | rechts | beidfüßig
  isOrganizer: boolean("is_organizer").notNull().default(false), // darf Turniere gegen Startgeld veranstalten
  locale: text("locale").notNull().default("de"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable(
  "teams",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  logoUrl: text("logo_url"),
  bio: text("bio"), // "Über uns", höchstens 280 Zeichen
  strength: integer("strength").notNull().default(3), // 1-5 Selbsteinschätzung, später Elo
  isVerified: boolean("is_verified").notNull().default(false),
  kind: text("kind").$type<"team" | "private">().notNull().default("team"), // "private": unsichtbares Spiel-Team eines Privatspiels (nicht im Verzeichnis, nicht in Listen)
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  color: text("color"), // Teamfarbe: Schlüssel der 12er-Palette (src/lib/team-color.ts) oder null (dann Standardfarbe aus dem Slug)
  },
  () => [check("teams_color_check", sql.raw(`"color" is null or "color" in (${COLOR_KEYS.map((k) => `'${k}'`).join(", ")})`))],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: teamRole("role").notNull().default("player"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Laufende Spielnummer für alles, was Teams ausmachen (Suche, Matchmaking, Spiel). Ein Spiel behält die Nummer seiner Suche. */
export const gameNumber = (name: string) => integer(name).notNull().default(sql`nextval('game_number_seq')`);

export const matchRequests = pgTable(
  "match_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: gameNumber("number"),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60), // 60 | 90
    strength: integer("strength").notNull().default(3),
    visibility: visibility("visibility").notNull().default("public"),
    status: requestStatus("status").notNull().default("open"),
    note: text("note"),
    targetTeamId: uuid("target_team_id").references(() => teams.id, { onDelete: "cascade" }), // Herausforderung an genau dieses Team
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_requests_open_idx").on(t.status, t.city, t.startsAt)],
);

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: gameNumber("number"),
  requestId: uuid("request_id").references(() => matchRequests.id),
  homeTeamId: uuid("home_team_id").notNull().references(() => teams.id),
  awayTeamId: uuid("away_team_id").notNull().references(() => teams.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull(),
  venueText: text("venue_text"),
  visibility: visibility("visibility").notNull().default("public"),
  minPlayers: integer("min_players").notNull().default(8),
  venueId: uuid("venue_id"),
  priceCents: integer("price_cents"),
  costCents: integer("cost_cents"),
  finalShareCents: integer("final_share_cents"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }), // 012 M3a: Absage angefordert; das Spiel bleibt lobby/confirmed, bis alle Erstattungen auf die Karte terminal sind
  cancelReason: text("cancel_reason"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  mvpUserId: uuid("mvp_user_id"),
  mvpClosedAt: timestamp("mvp_closed_at", { withTimezone: true }),
  challengeStatus: text("challenge_status").$type<"none" | "pending" | "accepted">().notNull().default("none"), // Direkt-Herausforderung: Lobby steht, das Zielteam muss noch annehmen
  maxPlayers: integer("max_players"), // nur Privatspiele: Spieler insgesamt (Standard 10, je Team die Hälfte)
  kind: text("kind").$type<"team" | "private" | "tournament">().notNull().default("team"), // Teamspiel, Privatspiel oder Turnierspiel (nur Teamspiele zählen für Elo und Rangliste)
  legacyShareModel: boolean("legacy_share_model").notNull().default(false), // true: vor der Umstellung angelegtes Spiel, altes Modell (Reservierung, Mindestzahl 8, Deckel 12, 24-h-Pfad) bis zum Anstoß
  homeFinalAt: timestamp("home_final_at", { withTimezone: true }), // letzte Bestätigung des Captains: alle im Team bereit und bezahlt
  awayFinalAt: timestamp("away_final_at", { withTimezone: true }),
  timeWindows: jsonb("time_windows").$type<{ from: string; to: string }[]>(), // vereinbartes Zeitfenster: nur die Uhrzeit wird noch gewählt (leer = Tag frei, z. B. bei Herausforderungen)
  vetoStatus: text("veto_status").$type<"none" | "halls" | "running" | "done">().notNull().default("none"), // Hallen-Veto vor der Terminwahl
  vetoTurnTeamId: uuid("veto_turn_team_id"),
  vetoTurnDeadline: timestamp("veto_turn_deadline", { withTimezone: true }),
  schedulingOpen: boolean("scheduling_open").notNull().default(false), // Termin und Ort werden noch von den Teams gewählt
  schedulingDeadline: timestamp("scheduling_deadline", { withTimezone: true }),
  streamUrl: text("stream_url"), // Twitch, YouTube oder Kick (wird beim Anzeigen erneut geprüft)
  status: matchStatus("status").notNull().default("lobby"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchParticipants = pgTable(
  "match_participants",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    teamId: uuid("team_id").references(() => teams.id), // null = freier Ersatzspieler
    isSubstitute: boolean("is_substitute").notNull().default(false),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    paidCents: integer("paid_cents").notNull().default(0),
    noShow: boolean("no_show").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // Kartenstatus je Platz (Vertrag 012, ADR 0001): none, card_ready (Karte hinterlegt), charge_pending (Abbuchung angelegt), charged, failed.
    // Spaeter (M3): charge_due_at, grace_until und covered_by_user_id ("Anteil uebernehmen"). Aendert weder paid_cents (nur Guthaben) noch das Hauptbuch.
    cardStatus: text("card_status").$type<CardStatus>().notNull().default("none"),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] }), check("match_participants_card_status_check", sql`${t.cardStatus} in ('none', 'card_ready', 'charge_pending', 'charged', 'failed')`)],
);

export const matchEvents = pgTable("match_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  type: eventType("type").notNull(),
  userId: uuid("user_id").references(() => users.id),
  teamId: uuid("team_id").notNull().references(() => teams.id),
  minute: integer("minute"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const matchResults = pgTable("match_results", {
  matchId: uuid("match_id").primaryKey().references(() => matches.id, { onDelete: "cascade" }),
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  confirmedHome: boolean("confirmed_home").notNull().default(false),
  confirmedAway: boolean("confirmed_away").notNull().default(false),
  disputed: boolean("disputed").notNull().default(false),
  submittedBy: uuid("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  confirmDeadline: timestamp("confirm_deadline", { withTimezone: true }),
  disputeReason: text("dispute_reason"),
  decidedBy: uuid("decided_by").references(() => users.id),
  autoConfirmed: boolean("auto_confirmed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);


// ---------------------------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt), index("notifications_undelivered_idx").on(t.deliveredAt)],
);

export const notificationPrefs = pgTable("notification_prefs", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  push: boolean("push").notNull().default(true),
  email: boolean("email").notNull().default(true),
  disabledTypes: text("disabled_types").array().notNull().default(sql`'{}'::text[]`),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryLog = pgTable("delivery_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // push | email
  status: text("status").notNull(), // sent | skipped | failed
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Verhindert, dass dieselbe Erinnerung (z. B. 24 h vor Anstoß) doppelt rausgeht. */
export const remindersSent = pgTable(
  "reminders_sent",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.kind] })],
);

// Zahlung per Karte (Vertrag 012, M1a). Nur Stripe-IDs und Anzeigedaten; nie Kartennummer, Ablaufdatum oder CVC.
/** Stripe-Kunde und hinterlegtes Zahlungsmittel je Nutzer. brand und last4 dienen nur der Anzeige ("Visa ... 4242"). Das Mandat ist der Text, dem zugestimmt wurde. */
export const paymentProfiles = pgTable("payment_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  paymentMethodId: text("payment_method_id"),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  mandateText: text("mandate_text"),
  mandateAcceptedAt: timestamp("mandate_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Jeder angelegte SetupIntent: wem er gehoert, fuer welchen Platz (match_id, optional) und welcher Mandatstext zu welchem Zeitpunkt akzeptiert wurde. */
export const paymentSetupIntents = pgTable(
  "payment_setup_intents",
  {
    id: text("id").primaryKey(), // Stripe-ID seti_...
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    status: text("status").$type<"created" | "succeeded" | "failed">().notNull().default("created"),
    mandateText: text("mandate_text").notNull(),
    mandateAcceptedAt: timestamp("mandate_accepted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_setup_intents_user_idx").on(t.userId, t.createdAt), check("payment_setup_intents_status_check", sql`${t.status} in ('created', 'succeeded', 'failed')`)],
);

/** Verarbeitete Stripe-Webhook-Ereignisse: event_id eindeutig, damit ein doppelt zugestelltes Ereignis nur einmal wirkt. */
export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

/**
 * Abbuchung je Spieler und Spiel (Vertrag 012, M2). Genau eine Zeile je Platz; payment_intent_id und idempotency_key sind eindeutig.
 * Das Geld steht im Hauptbuch (clearing -> revenue, Schluessel charge:<paymentIntentId>), NICHT in match_participants.paid_cents (das bleibt Guthaben).
 * status: pending (angelegt, noch nicht bei Stripe), requires_action (Authentifizierung noetig), succeeded, failed. fee_cents erst gesetzt, wenn die echte
 * Stripe-Gebuehr gebucht ist (Schluessel fee:<paymentIntentId>).
 */
export const paymentCharges = pgTable(
  "payment_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<"pending" | "requires_action" | "succeeded" | "failed">().notNull().default("pending"),
    paymentIntentId: text("payment_intent_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    failureCode: text("failure_code"),
    feeCents: integer("fee_cents"),
    attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }),
    // Nachzahlfenster (Vertrag 012, AC-6): Ende des Fensters nach dem ersten Fehler, null = kein Fenster (weniger als 1 h bis zum Anstoss oder kein Problem)
    graceUntil: timestamp("grace_until", { withTimezone: true }),
    // Nummer des LAUFENDEN Versuchs (1 = erster Versuch). Diese Zeile ist der Zustand des laufenden Versuchs; abgeschlossene Versuche stehen in payment_charge_attempts.
    currentAttempt: integer("current_attempt").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_charges_match_user_idx").on(t.matchId, t.userId),
    check("payment_charges_attempt_positive", sql`${t.currentAttempt} >= 1`),
    check("payment_charges_amount_positive", sql`${t.amountCents} > 0`),
    check("payment_charges_fee_nonneg", sql`${t.feeCents} is null or ${t.feeCents} >= 0`),
    check("payment_charges_status_check", sql`${t.status} in ('pending', 'requires_action', 'succeeded', 'failed')`),
  ],
);

/**
 * Erstattung einer Abbuchung auf die Karte (Vertrag 012, M3a). Genau eine (volle) Erstattung je Abbuchungszeile (UNIQUE charge_id): erstattet wird der gezahlte Betrag.
 * Hauptbuch erst bei Erfolg (revenue -> clearing, Schluessel refund:<refund_id>); die Stripe-Gebuehr wird nicht zurueckgebucht (Soccaz traegt sie).
 * status: pending (angelegt oder bei Stripe unterwegs), succeeded, failed (manuell zu klaeren, Admin-Alarm). idempotency_key = refund:<charge_id>.
 */
/**
 * Historie ABGESCHLOSSENER Abbuchungsversuche einer Zeile (Vertrag 012, M3c-1). Jeder Versuch hat einen eigenen Idempotenzschluessel und PaymentIntent
 * (charge:<m>:<u>:<n> ab Versuch 2). Dient der Webhook-Zuordnung alter PaymentIntents; der laufende Versuch steht auf payment_charges.
 */
export const paymentChargeAttempts = pgTable(
  "payment_charge_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargeId: uuid("charge_id").notNull().references(() => paymentCharges.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    paymentIntentId: text("payment_intent_id").unique(),
    status: text("status").$type<"pending" | "requires_action" | "succeeded" | "failed">().notNull(),
    failureCode: text("failure_code"),
    attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_charge_attempts_charge_no_idx").on(t.chargeId, t.attemptNo),
    check("payment_charge_attempts_no_positive", sql`${t.attemptNo} >= 1`),
    check("payment_charge_attempts_status_check", sql`${t.status} in ('pending', 'requires_action', 'succeeded', 'failed')`),
  ],
);

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargeId: uuid("charge_id").notNull().references(() => paymentCharges.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").$type<"pending" | "succeeded" | "failed">().notNull().default("pending"),
    refundId: text("refund_id").unique(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    reason: text("reason"),
    failureCode: text("failure_code"),
    attemptStartedAt: timestamp("attempt_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_refunds_charge_idx").on(t.chargeId),
    check("payment_refunds_amount_positive", sql`${t.amountCents} > 0`),
    check("payment_refunds_status_check", sql`${t.status} in ('pending', 'succeeded', 'failed')`),
  ],
);
