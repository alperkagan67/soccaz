ALTER TABLE "payment_charges" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_disputes_tournament_idx" ON "payment_disputes" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_tournament_idx" ON "payment_refunds" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "payment_setup_intents_tournament_idx" ON "payment_setup_intents" USING btree ("tournament_id");--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_scope_xor" CHECK (("payment_charges"."match_id" is null) <> ("payment_charges"."tournament_id" is null));--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_tournament_no_slot" CHECK ("payment_charges"."tournament_id" is null or ("payment_charges"."slot_of" is null and "payment_charges"."slot_team_id" is null));--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_scope_xor" CHECK (("payment_refunds"."match_id" is null) <> ("payment_refunds"."tournament_id" is null));