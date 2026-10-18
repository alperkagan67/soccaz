ALTER TYPE "public"."ledger_account" ADD VALUE 'tournament';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'tournament_entry';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'tournament_refund';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'tournament_payout';--> statement-breakpoint
ALTER TYPE "public"."ledger_kind" ADD VALUE 'tournament_commission';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_organizer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;
