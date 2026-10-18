import { sql } from "drizzle-orm";
import { customType, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema";

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
