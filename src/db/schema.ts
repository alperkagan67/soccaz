import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["player", "admin"]);
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
  locale: text("locale").notNull().default("de"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  city: text("city").notNull(),
  logoUrl: text("logo_url"),
  strength: integer("strength").notNull().default(3), // 1-5 SelbsteinschÃ¤tzung, spÃ¤ter Elo
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const matchRequests = pgTable(
  "match_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60), // 60 | 90
    strength: integer("strength").notNull().default(3),
    visibility: visibility("visibility").notNull().default("public"),
    status: requestStatus("status").notNull().default("open"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_requests_open_idx").on(t.status, t.city, t.startsAt)],
);

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").references(() => matchRequests.id),
  homeTeamId: uuid("home_team_id").notNull().references(() => teams.id),
  awayTeamId: uuid("away_team_id").notNull().references(() => teams.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMin: integer("duration_min").notNull(),
  venueText: text("venue_text"),
  visibility: visibility("visibility").notNull().default("public"),
  minPlayers: integer("min_players").notNull().default(8),
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
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.userId] })],
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

