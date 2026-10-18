import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { matches, teams, users } from "./schema";

// ---------------------------------------------------------------------------------------------
// Phase 4: Ligen, Stadt-Challenge, Profi-Tag, Turniere, Sponsoren
// ---------------------------------------------------------------------------------------------

export type LeagueStatus = "draft" | "active" | "finished";

/** Eine Liga (Saison). Die Tabelle wird live aus allen gespielten Spielen zwischen Teilnehmern im Zeitraum berechnet. */
export const leagues = pgTable("leagues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  city: text("city"), // leer = ganz NRW
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  status: text("status").$type<LeagueStatus>().notNull().default("active"),
  openJoin: boolean("open_join").notNull().default(true), // Team-Admins dürfen selbst beitreten
  championTeamId: uuid("champion_team_id").references(() => teams.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leagueTeams = pgTable(
  "league_teams",
  {
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.teamId] })],
);

/** Monatsergebnis der Stadt-Challenge (wird vom Monatsjob geschrieben). */
export const cityChallengeResults = pgTable(
  "city_challenge_results",
  {
    month: text("month").notNull(), // YYYY-MM
    city: text("city").notNull(),
    wins: integer("wins").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [primaryKey({ columns: [t.month, t.city] })],
);

export type ProEventStatus = "open" | "drawn" | "cancelled";

/** Profi-Tag: ein verifiziertes Team spielt gegen ausgeloste Amateur-Teams. */
export const proEvents = pgTable("pro_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  proTeamId: uuid("pro_team_id").notNull().references(() => teams.id),
  city: text("city").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  slots: integer("slots").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(60),
  applyUntil: timestamp("apply_until", { withTimezone: true }).notNull(),
  status: text("status").$type<ProEventStatus>().notNull().default("open"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proApplications = pgTable(
  "pro_applications",
  {
    eventId: uuid("event_id").notNull().references(() => proEvents.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    appliedBy: uuid("applied_by").references(() => users.id, { onDelete: "set null" }),
    selected: boolean("selected").notNull().default(false),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.teamId] })],
);

export type TournamentFormat = "round_robin" | "knockout" | "groups_ko";
export type TournamentStatus = "registration" | "running" | "finished" | "cancelled";

export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    city: text("city").notNull(),
    venueText: text("venue_text"),
    startsOn: date("starts_on").notNull(),
    format: text("format").$type<TournamentFormat>().notNull(),
    maxTeams: integer("max_teams").notNull(),
    entryFeeCents: integer("entry_fee_cents").notNull().default(0),
    status: text("status").$type<TournamentStatus>().notNull().default("registration"),
    winnerTeamId: uuid("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("tournaments_fee_nonneg", sql`${t.entryFeeCents} >= 0`), check("tournaments_teams_range", sql`${t.maxTeams} between 2 and 32`), index("tournaments_status_idx").on(t.status, t.startsOn)],
);

export const tournamentTeams = pgTable(
  "tournament_teams",
  {
    tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
    feeCents: integer("fee_cents").notNull().default(0),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.teamId] })],
);

/** Ein Spiel im Turnier. Teams sind leer, solange sie noch nicht feststehen (K.-o.-Runden). */
export const tournamentMatches = pgTable(
  "tournament_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(), // "group:A" | "round" | "ko:<n>" (n = Teams in dieser Runde)
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    teamA: uuid("team_a").references(() => teams.id),
    teamB: uuid("team_b").references(() => teams.id),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    shootoutWinner: uuid("shootout_winner").references(() => teams.id),
    feedsMatchId: uuid("feeds_match_id"),
    feedsSide: text("feeds_side").$type<"a" | "b">(),
    playedAt: timestamp("played_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("tournament_matches_slot").on(t.tournamentId, t.stage, t.round, t.slot), index("tournament_matches_tournament_idx").on(t.tournamentId)],
);

export type SponsorKind = "sponsor" | "jersey";

export const sponsors = pgTable("sponsors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  kind: text("kind").$type<SponsorKind>().notNull().default("sponsor"),
  tagline: text("tagline"),
  active: boolean("active").notNull().default(true),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Trikot-Partner eines Teams. */
export const teamSponsors = pgTable(
  "team_sponsors",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    sponsorId: uuid("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.sponsorId] })],
);
