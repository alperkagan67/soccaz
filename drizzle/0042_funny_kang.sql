CREATE TABLE "payment_dispute_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_row_id" uuid NOT NULL,
	"balance_transaction_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"reject_reason" text,
	"booked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_dispute_entries_balance_transaction_id_unique" UNIQUE("balance_transaction_id"),
	CONSTRAINT "payment_dispute_entries_kind_check" CHECK ("payment_dispute_entries"."kind" in ('withdrawal', 'reversal')),
	CONSTRAINT "payment_dispute_entries_status_check" CHECK ("payment_dispute_entries"."status" in ('booked', 'parked', 'rejected')),
	CONSTRAINT "payment_dispute_entries_amount_positive" CHECK ("payment_dispute_entries"."amount_cents" > 0),
	CONSTRAINT "payment_dispute_entries_fee_nonneg" CHECK ("payment_dispute_entries"."fee_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" text NOT NULL,
	"charge_id" uuid,
	"payment_intent_id" text,
	"match_id" uuid,
	"payer_user_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"reason" text DEFAULT 'unknown' NOT NULL,
	"status" text NOT NULL,
	"evidence_due_by" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"alerted_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"refund_conflict" boolean DEFAULT false NOT NULL,
	"double_loss_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_disputes_dispute_id_unique" UNIQUE("dispute_id"),
	CONSTRAINT "payment_disputes_amount_positive" CHECK ("payment_disputes"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_status_check";--> statement-breakpoint
ALTER TABLE "payment_dispute_entries" ADD CONSTRAINT "payment_dispute_entries_dispute_row_id_payment_disputes_id_fk" FOREIGN KEY ("dispute_row_id") REFERENCES "public"."payment_disputes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_charge_id_payment_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."payment_charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_dispute_entries_dispute_idx" ON "payment_dispute_entries" USING btree ("dispute_row_id");--> statement-breakpoint
CREATE INDEX "payment_disputes_payer_idx" ON "payment_disputes" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "payment_disputes_status_idx" ON "payment_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_disputes_pi_idx" ON "payment_disputes" USING btree ("payment_intent_id");--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_status_check" CHECK ("payment_refunds"."status" in ('pending', 'succeeded', 'failed', 'cancelled_dispute'));