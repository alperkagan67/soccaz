ALTER TABLE "tournament_players" ADD COLUMN "paid_by" uuid;--> statement-breakpoint
ALTER TABLE "tournament_teams" ADD COLUMN "pay_mode" text DEFAULT 'players' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;