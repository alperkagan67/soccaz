ALTER TABLE "payment_charges" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_setup_intents" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_charges_tournament_user_idx" ON "payment_charges" USING btree ("tournament_id","user_id") WHERE "payment_charges"."tournament_id" is not null;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_setup_intents" ADD CONSTRAINT "payment_setup_intents_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;
