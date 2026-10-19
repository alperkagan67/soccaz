CREATE TABLE "match_hall_requests" (
	"match_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" text NOT NULL,
	"answered_by" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_hall_requests_match_id_venue_id_pk" PRIMARY KEY("match_id","venue_id")
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "manager_user_id" uuid;--> statement-breakpoint
ALTER TABLE "match_hall_requests" ADD CONSTRAINT "match_hall_requests_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_hall_requests" ADD CONSTRAINT "match_hall_requests_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;