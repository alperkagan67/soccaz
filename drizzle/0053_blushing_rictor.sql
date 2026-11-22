ALTER TYPE "public"."ledger_kind" ADD VALUE 'tournament_share';--> statement-breakpoint
ALTER TABLE "receipts" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;
