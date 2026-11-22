CREATE TABLE "payment_erasure_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_customer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_try_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_until" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "payment_erasure_tasks_status_check" CHECK ("payment_erasure_tasks"."status" in ('pending', 'claimed', 'done', 'failed')),
	CONSTRAINT "payment_erasure_tasks_attempts_nonneg" CHECK ("payment_erasure_tasks"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment_erasure_tasks" ADD CONSTRAINT "payment_erasure_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_erasure_tasks_user_idx" ON "payment_erasure_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_erasure_tasks_due_idx" ON "payment_erasure_tasks" USING btree ("status","next_try_at");