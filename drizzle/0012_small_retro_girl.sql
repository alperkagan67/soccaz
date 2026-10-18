CREATE TABLE "free_player_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"city" text NOT NULL,
	"day" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "free_player_posts" ADD CONSTRAINT "free_player_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "free_player_posts_open_idx" ON "free_player_posts" USING btree ("status","city","day");--> statement-breakpoint
CREATE UNIQUE INDEX "free_player_one_per_day" ON "free_player_posts" USING btree ("user_id","day") WHERE "free_player_posts"."status" = 'open';