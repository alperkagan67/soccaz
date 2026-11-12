ALTER TABLE "match_participants" ADD COLUMN "covered_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "cover_mandate_text" text;--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "cover_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "payer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_covered_by_user_id_users_id_fk" FOREIGN KEY ("covered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_participants_cover_payer_idx" ON "match_participants" USING btree ("match_id","covered_by_user_id") WHERE "match_participants"."covered_by_user_id" is not null;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_cover_not_self" CHECK ("match_participants"."covered_by_user_id" is null or "match_participants"."covered_by_user_id" <> "match_participants"."user_id");--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_cover_consent" CHECK (("match_participants"."covered_by_user_id" is null) = ("match_participants"."cover_accepted_at" is null));--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_payer_not_self" CHECK ("payment_charges"."payer_user_id" is null or "payment_charges"."payer_user_id" <> "payment_charges"."user_id");