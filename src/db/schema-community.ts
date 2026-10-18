import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { matches, teams, users } from "./schema";

// ---------------------------------------------------------------------------------------------
// Phase 3: Statistik, Elo, Zuverlässigkeit, Abzeichen, Spieler des Spiels
// ---------------------------------------------------------------------------------------------

/** Marker: dieses Spiel wurde schon in Statistik und Elo eingerechnet (verhindert doppeltes Zählen). */
export const matchFinalizations = pgTable("match_finalizations", {
  matchId: uuid("match_id").primaryKey().references(() => matches.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamStats = pgTable("team_stats", {
  teamId: uuid("team_id").primaryKey().references(() => teams.id, { onDelete: "cascade" }),
  matches: integer("matches").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  elo: integer("elo").notNull(),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});

export const playerStats = pgTable("player_stats", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  matches: integer("matches").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goals: integer("goals").notNull().default(0),
  yellowCards: integer("yellow_cards").notNull().default(0),
  redCards: integer("red_cards").notNull().default(0),
  mvps: integer("mvps").notNull().default(0),
  cleanStreak: integer("clean_streak").notNull().default(0),
  winStreak: integer("win_streak").notNull().default(0),
  elo: integer("elo").notNull().default(1000),
  lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
});

/** Verlauf der Elo-Werte (Team und Spieler) für spätere Diagramme und Nachvollziehbarkeit. */
export const ratingHistory = pgTable(
  "rating_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // team | user
    subjectId: uuid("subject_id").notNull(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    eloBefore: integer("elo_before").notNull(),
    eloAfter: integer("elo_after").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rating_history_subject_idx").on(t.kind, t.subjectId, t.at)],
);

/** Zuverlässigkeit: nur für Admins und Team-Admins sichtbar. */
export const userReliability = pgTable("user_reliability", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  attended: integer("attended").notNull().default(0),
  noShows: integer("no_shows").notNull().default(0),
  lateCancels: integer("late_cancels").notNull().default(0),
});

/** Abmeldung weniger als 24 Stunden vor dem Spiel (zählt gegen die Zuverlässigkeit). */
export const lateCancels = pgTable(
  "late_cancels",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.matchId] })],
);

export const userBadges = pgTable(
  "user_badges",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.code] })],
);

/** Stimmen für den Spieler des Spiels: ein Spieler, eine Stimme, nicht für sich selbst. */
export const mvpVotes = pgTable(
  "mvp_votes",
  {
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.voterId] }), index("mvp_votes_candidate_idx").on(t.matchId, t.candidateId)],
);

