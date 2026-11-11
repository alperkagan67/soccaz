CREATE TABLE "payment_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_intent_id" text,
	"idempotency_key" text NOT NULL,
	"failure_code" text,
	"fee_cents" integer,
	"attempt_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_charges_payment_intent_id_unique" UNIQUE("payment_intent_id"),
	CONSTRAINT "payment_charges_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_charges_amount_positive" CHECK ("payment_charges"."amount_cents" > 0),
	CONSTRAINT "payment_charges_fee_nonneg" CHECK ("payment_charges"."fee_cents" is null or "payment_charges"."fee_cents" >= 0),
	CONSTRAINT "payment_charges_status_check" CHECK ("payment_charges"."status" in ('pending', 'requires_action', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "match_participants" DROP CONSTRAINT "match_participants_card_status_check";--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_charges_match_user_idx" ON "payment_charges" USING btree ("match_id","user_id");--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_card_status_check" CHECK ("match_participants"."card_status" in ('none', 'card_ready', 'charge_pending', 'charged', 'failed'));