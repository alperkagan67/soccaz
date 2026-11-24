-- Vertrag 010 M1 (Plan docs/design/plan-010-m1-hallenbewertung.md): Hallenbewertung mit fuenf Kategorien und optionalem Text, einmal je Spiel oder je Turnier, Halle und Nutzer; Meldungen. Rein additiv.
-- Rueckfall: drizzle/down/0060_down.sql (bricht ab, sobald Bewertungen existieren). Keine Beweis-/Definer-Funktion, keine Wirkung auf das Hauptbuch.
CREATE TABLE "venue_review_reports" (
	"review_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_review_reports_review_id_reporter_id_pk" PRIMARY KEY("review_id","reporter_id")
);
--> statement-breakpoint
CREATE TABLE "venue_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"match_id" uuid,
	"tournament_id" uuid,
	"user_id" uuid,
	"floor" integer NOT NULL,
	"changing_rooms" integer NOT NULL,
	"cleanliness" integer NOT NULL,
	"showers" integer NOT NULL,
	"parking" integer NOT NULL,
	"body" text,
	"status" text DEFAULT 'visible' NOT NULL,
	"hidden_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_reviews_target_xor" CHECK (("venue_reviews"."match_id" is not null) <> ("venue_reviews"."tournament_id" is not null)),
	CONSTRAINT "venue_reviews_scores_check" CHECK ("venue_reviews"."floor" between 1 and 5 and "venue_reviews"."changing_rooms" between 1 and 5 and "venue_reviews"."cleanliness" between 1 and 5 and "venue_reviews"."showers" between 1 and 5 and "venue_reviews"."parking" between 1 and 5),
	CONSTRAINT "venue_reviews_body_len" CHECK ("venue_reviews"."body" is null or char_length("venue_reviews"."body") between 3 and 500),
	CONSTRAINT "venue_reviews_status_check" CHECK ("venue_reviews"."status" in ('visible', 'hidden', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "venue_review_reports" ADD CONSTRAINT "venue_review_reports_review_id_venue_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."venue_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_review_reports" ADD CONSTRAINT "venue_review_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_reviews" ADD CONSTRAINT "venue_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_reviews_match_user_idx" ON "venue_reviews" USING btree ("match_id","user_id") WHERE "venue_reviews"."match_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_reviews_tournament_user_idx" ON "venue_reviews" USING btree ("tournament_id","venue_id","user_id") WHERE "venue_reviews"."tournament_id" is not null;--> statement-breakpoint
CREATE INDEX "venue_reviews_venue_idx" ON "venue_reviews" USING btree ("venue_id","status","created_at");