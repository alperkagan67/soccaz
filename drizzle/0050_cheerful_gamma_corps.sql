ALTER TABLE "tournaments" ADD COLUMN "venue_id" uuid;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_access_required_snapshot" boolean;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "commission_percent_snapshot" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;
