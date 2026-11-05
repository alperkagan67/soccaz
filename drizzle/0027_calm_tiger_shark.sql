CREATE TABLE "tournament_players" (
	"tournament_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_players_tournament_id_user_id_pk" PRIMARY KEY("tournament_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "kind" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD COLUMN "match_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD COLUMN "captain_id" uuid;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "is_private" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "registration_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "match_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "bracket_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_players_team_idx" ON "tournament_players" USING btree ("tournament_id","team_id");--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD CONSTRAINT "tournament_teams_captain_id_users_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_invite_token_unique" UNIQUE("invite_token");