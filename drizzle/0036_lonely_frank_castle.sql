CREATE TABLE "payment_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"payment_method_id" text,
	"card_brand" text,
	"card_last4" text,
	"mandate_text" text,
	"mandate_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_profiles_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "payment_setup_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"match_id" uuid,
	"status" text DEFAULT 'created' NOT NULL,
	"mandate_text" text NOT NULL,
	"mandate_accepted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_setup_intents_status_check" CHECK ("payment_setup_intents"."status" in ('created', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "match_participants" ADD COLUMN "card_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_profiles" ADD CONSTRAINT "payment_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_setup_intents" ADD CONSTRAINT "payment_setup_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_setup_intents" ADD CONSTRAINT "payment_setup_intents_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_setup_intents_user_idx" ON "payment_setup_intents" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_card_status_check" CHECK ("match_participants"."card_status" in ('none', 'card_ready'));