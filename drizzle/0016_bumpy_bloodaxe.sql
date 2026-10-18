CREATE TABLE "match_option_votes" (
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"voted_by" uuid,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_option_votes_match_id_team_id_pk" PRIMARY KEY("match_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "match_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"venue_id" uuid,
	"venue_text" text,
	"proposed_by_team" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchmaking_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"created_by" uuid,
	"city" text NOT NULL,
	"duration_min" integer NOT NULL,
	"windows" jsonb NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"match_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "scheduling_open" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "scheduling_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_option_votes" ADD CONSTRAINT "match_option_votes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_option_votes" ADD CONSTRAINT "match_option_votes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_option_votes" ADD CONSTRAINT "match_option_votes_option_id_match_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."match_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_option_votes" ADD CONSTRAINT "match_option_votes_voted_by_users_id_fk" FOREIGN KEY ("voted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_options" ADD CONSTRAINT "match_options_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_options" ADD CONSTRAINT "match_options_proposed_by_team_teams_id_fk" FOREIGN KEY ("proposed_by_team") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_options_match_idx" ON "match_options" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matchmaking_one_waiting_per_team" ON "matchmaking_queue" USING btree ("team_id") WHERE "matchmaking_queue"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "matchmaking_waiting_idx" ON "matchmaking_queue" USING btree ("status","city","duration_min");