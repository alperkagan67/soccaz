DROP INDEX "payment_refunds_charge_idx";--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "resolution" text;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "slot_of" uuid;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "slot_team_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_slot_of_payment_charges_id_fk" FOREIGN KEY ("slot_of") REFERENCES "public"."payment_charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_slot_team_id_teams_id_fk" FOREIGN KEY ("slot_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_charge_idx" ON "payment_refunds" USING btree ("charge_id",coalesce("payment_intent_id", ''));--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_resolution_check" CHECK ("payment_charges"."resolution" is null or "payment_charges"."resolution" = 'replaced');