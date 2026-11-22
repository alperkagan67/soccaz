CREATE TABLE "payment_charge_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_intent_id" text,
	"status" text NOT NULL,
	"failure_code" text,
	"attempt_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_charge_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_charge_attempts_payment_intent_id_unique" UNIQUE("payment_intent_id"),
	CONSTRAINT "payment_charge_attempts_no_positive" CHECK ("payment_charge_attempts"."attempt_no" >= 1),
	CONSTRAINT "payment_charge_attempts_status_check" CHECK ("payment_charge_attempts"."status" in ('pending', 'requires_action', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "grace_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_charges" ADD COLUMN "current_attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_charge_attempts" ADD CONSTRAINT "payment_charge_attempts_charge_id_payment_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."payment_charges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_charge_attempts_charge_no_idx" ON "payment_charge_attempts" USING btree ("charge_id","attempt_no");--> statement-breakpoint
ALTER TABLE "payment_charges" ADD CONSTRAINT "payment_charges_attempt_positive" CHECK ("payment_charges"."current_attempt" >= 1);