import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { gameNumber, matches, teams, users } from "./schema";

// ---------------------------------------------------------------------------------------------
// Matchmaking-Warteschlange (wie bei Ranked) und gemeinsame Wahl von Termin und Ort (wie bei FACEIT)
// ---------------------------------------------------------------------------------------------

export type QueueStatus = "waiting" | "matched" | "cancelled" | "expired";
export type QueueWindow = { from: string; to: string }; // ISO-Zeitpunkte (UTC)

export const matchmakingQueue = pgTable(
  "matchmaking_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: gameNumber("number"),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    city: text("city").notNull(),
    durationMin: integer("duration_min").notNull(),
    windows: jsonb("windows").$type<QueueWindow[]>().notNull(),
    note: text("note"), // freier Hinweis an mögliche Gegner
    wantStrengthMin: integer("want_strength_min"), // gesuchte Spielstärke des Gegners (Selbsteinschätzung 1 bis 5), leer = egal
    wantStrengthMax: integer("want_strength_max"),
    status: text("status").$type<QueueStatus>().notNull().default("waiting"),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("matchmaking_one_waiting_per_team").on(t.teamId).where(sql`${t.status} = 'waiting'`), index("matchmaking_waiting_idx").on(t.status, t.city, t.durationMin)],
);

/** Ein Vorschlag für Termin und Ort. proposedByTeam leer = vom System aus der Überschneidung der Zeitfenster. */
export const matchOptions = pgTable(
  "match_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    venueId: uuid("venue_id"),
    venueText: text("venue_text"),
    proposedByTeam: uuid("proposed_by_team").references(() => teams.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_options_match_idx").on(t.matchId)],
);

/** Jedes Team hat pro Spiel genau eine Stimme. Stimmen beide Teams für dieselbe Option, steht der Termin. */
export const matchOptionVotes = pgTable(
  "match_option_votes",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull().references(() => matchOptions.id, { onDelete: "cascade" }),
    votedBy: uuid("voted_by").references(() => users.id, { onDelete: "set null" }),
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.teamId] })],
);

/** Die Hallen im Veto eines Spiels. Abwechselnd werden Hallen gebannt, die letzte übrige ist die gewählte. */
export const matchVetoHalls = pgTable(
  "match_veto_halls",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").notNull(),
    position: integer("position").notNull(),
    bannedByTeam: uuid("banned_by_team").references(() => teams.id, { onDelete: "set null" }),
    bannedAuto: boolean("banned_auto").notNull().default(false), // Zeit abgelaufen, das System hat gebannt
    banOrder: integer("ban_order"),
    picked: boolean("picked").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.venueId] })],
);
