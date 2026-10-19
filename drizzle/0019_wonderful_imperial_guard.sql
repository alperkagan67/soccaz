ALTER TABLE "matchmaking_queue" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD COLUMN "want_strength_min" integer;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD COLUMN "want_strength_max" integer;