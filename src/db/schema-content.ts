import { sql } from "drizzle-orm";
import { check, customType, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { matches, users } from "./schema";
import { venues } from "./schema-finance";
import { tournaments } from "./schema-league";

// ---------------------------------------------------------------------------------------------
// Phase 3: Kommentare, Bewertungen, Meldungen, Verwarnungen, Bilder
// ---------------------------------------------------------------------------------------------

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export type CommentTarget = "team" | "player" | "venue";
export type CommentStatus = "visible" | "hidden" | "removed";

/** Kommentar auf einem Team- oder Spielerprofil, bei Hallen zusätzlich mit Sternen (eine Bewertung pro Person). */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").$type<CommentTarget>().notNull(),
    targetId: uuid("target_id").notNull(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    rating: integer("rating"),
    status: text("status").$type<CommentStatus>().notNull().default("visible"),
    hiddenReason: text("hidden_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comments_target_idx").on(t.targetType, t.targetId, t.status, t.createdAt),
    index("comments_author_idx").on(t.authorId, t.createdAt),
    uniqueIndex("comments_one_review_per_venue").on(t.targetId, t.authorId).where(sql`${t.targetType} = 'venue'`),
  ],
);

export const commentReports = pgTable(
  "comment_reports",
  {
    commentId: uuid("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.reporterId] })],
);

export const userWarnings = pgTable(
  "user_warnings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    byId: uuid("by_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("user_warnings_user_idx").on(t.userId)],
);

export type MediaKind = "team_logo" | "avatar" | "match_photo";

/** Hochgeladene Bilder. Sie werden beim Hochladen neu kodiert (keine Metadaten, feste Größe) und direkt aus der Datenbank ausgeliefert. */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").$type<MediaKind>().notNull(),
    refId: uuid("ref_id").notNull(),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    status: text("status").$type<CommentStatus>().notNull().default("visible"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_ref_idx").on(t.kind, t.refId, t.createdAt)],
);

/** "Ich suche ein Spiel": Spieler ohne Team (oder mit freiem Abend) tragen sich für einen Tag ein, Team-Admins können sie anfragen. */
export const freePlayerPosts = pgTable(
  "free_player_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD, Berliner Datum
    note: text("note"),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("free_player_posts_open_idx").on(t.status, t.city, t.day), uniqueIndex("free_player_one_per_day").on(t.userId, t.day).where(sql`${t.status} = 'open'`)],
);

// ---------------------------------------------------------------------------------------------
// Vertrag 010 M1 (Plan docs/design/plan-010-m1-hallenbewertung.md): Hallenbewertung mit Kategorien, einmal je Spiel (Team-/Privatspiel) oder je Turnier, Halle und Nutzer
// ---------------------------------------------------------------------------------------------

export type ReviewStatus = "visible" | "hidden" | "removed";

/**
 * Bewertung einer Halle durch einen Spieler, der dort gespielt hat: fuenf Kategorien (1 bis 5) und ein optionaler Text (3 bis 500 Zeichen, ohne Links, E-Mail-Adressen und Telefonnummern).
 * Genau EIN Bezug: ein Spiel (match_id) ODER ein Turnier (tournament_id). Eindeutig je Spiel und Nutzer bzw. je Turnier, Halle und Nutzer. Konto loeschen: deleteAccount (account.ts) anonymisiert das Konto und LOESCHT ES NIE, deshalb setzt es body und user_id ausdruecklich auf NULL (der Fremdschluessel ON DELETE SET NULL waere nur
 * ein Netz, falls je ein Konto geloescht wird; Entscheid t2q 2026-11-24); die Zahlen bleiben anonym im Durchschnitt. Die frueheren Sterne-Kommentare (comments, target_type venue) bleiben unberuehrt und getrennt.
 */
export const venueReviews = pgTable(
  "venue_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id").notNull().references(() => venues.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "cascade" }),
    tournamentId: uuid("tournament_id").references(() => tournaments.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    floor: integer("floor").notNull(),
    changingRooms: integer("changing_rooms").notNull(),
    cleanliness: integer("cleanliness").notNull(),
    showers: integer("showers").notNull(),
    parking: integer("parking").notNull(),
    body: text("body"),
    status: text("status").$type<ReviewStatus>().notNull().default("visible"),
    hiddenReason: text("hidden_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("venue_reviews_match_user_idx").on(t.matchId, t.userId).where(sql`${t.matchId} is not null`),
    uniqueIndex("venue_reviews_tournament_user_idx").on(t.tournamentId, t.venueId, t.userId).where(sql`${t.tournamentId} is not null`),
    index("venue_reviews_venue_idx").on(t.venueId, t.status, t.createdAt),
    check("venue_reviews_target_xor", sql`(${t.matchId} is not null) <> (${t.tournamentId} is not null)`),
    check(
      "venue_reviews_scores_check",
      sql`${t.floor} between 1 and 5 and ${t.changingRooms} between 1 and 5 and ${t.cleanliness} between 1 and 5 and ${t.showers} between 1 and 5 and ${t.parking} between 1 and 5`,
    ),
    check("venue_reviews_body_len", sql`${t.body} is null or char_length(${t.body}) between 3 and 500`),
    check("venue_reviews_status_check", sql`${t.status} in ('visible', 'hidden', 'removed')`),
  ],
);

/** Meldung einer Bewertung (wie comment_reports): ein Melden je Person, Admin 2 prueft (PR 2). */
export const venueReviewReports = pgTable(
  "venue_review_reports",
  {
    reviewId: uuid("review_id").notNull().references(() => venueReviews.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.reporterId] })],
);
