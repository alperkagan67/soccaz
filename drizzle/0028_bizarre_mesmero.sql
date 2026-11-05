CREATE TABLE "game_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "max_players" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "kind" text DEFAULT 'team' NOT NULL;--> statement-breakpoint
ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_invites_match_idx" ON "game_invites" USING btree ("match_id");