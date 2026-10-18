ALTER TABLE "match_events" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "submitted_by" uuid;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "submitted_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "confirm_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "dispute_reason" text;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "match_results" ADD COLUMN "auto_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;