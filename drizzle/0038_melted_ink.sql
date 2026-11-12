CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"refund_id" text,
	"idempotency_key" text NOT NULL,
	"reason" text,
	"failure_code" text,
	"attempt_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "payment_refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_refunds_amount_positive" CHECK ("payment_refunds"."amount_cents" > 0),
	CONSTRAINT "payment_refunds_status_check" CHECK ("payment_refunds"."status" in ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_charge_id_payment_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."payment_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_charge_idx" ON "payment_refunds" USING btree ("charge_id");