CREATE SEQUENCE IF NOT EXISTS game_number_seq START 1001;
--> statement-breakpoint
ALTER TABLE "match_requests" ADD COLUMN "number" integer DEFAULT nextval('game_number_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "number" integer DEFAULT nextval('game_number_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD COLUMN "number" integer DEFAULT nextval('game_number_seq') NOT NULL;