CREATE TABLE "match_veto_halls" (
	"match_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"banned_by_team" uuid,
	"banned_auto" boolean DEFAULT false NOT NULL,
	"ban_order" integer,
	"picked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "match_veto_halls_match_id_venue_id_pk" PRIMARY KEY("match_id","venue_id")
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "veto_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "veto_turn_team_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "veto_turn_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "osm_id" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "match_veto_halls" ADD CONSTRAINT "match_veto_halls_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_veto_halls" ADD CONSTRAINT "match_veto_halls_banned_by_team_teams_id_fk" FOREIGN KEY ("banned_by_team") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_osm_id_unique" UNIQUE("osm_id");