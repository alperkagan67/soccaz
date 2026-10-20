CREATE TABLE "match_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "home_final_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "away_final_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_clips" ADD CONSTRAINT "match_clips_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_clips" ADD CONSTRAINT "match_clips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_clips_match_idx" ON "match_clips" USING btree ("match_id");