CREATE TABLE "venue_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"user_id" uuid,
	"invited_email" text,
	"status" text NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "venue_access_invited_chk" CHECK ("venue_access"."status" <> 'invited' or ("venue_access"."user_id" is null and "venue_access"."invited_email" is not null)),
	CONSTRAINT "venue_access_active_chk" CHECK ("venue_access"."status" <> 'active' or "venue_access"."user_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "venue_access" ADD CONSTRAINT "venue_access_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_access" ADD CONSTRAINT "venue_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_access" ADD CONSTRAINT "venue_access_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "venue_access_one_open_per_venue" ON "venue_access" USING btree ("venue_id") WHERE "venue_access"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "venue_access_user_idx" ON "venue_access" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "venue_access_email_idx" ON "venue_access" USING btree (lower("invited_email")) WHERE "venue_access"."status" = 'invited';--> statement-breakpoint
-- Datenuebernahme (idempotent, zweimal ausfuehrbar): jede Halle mit Betreiber, dessen Konto existiert, nicht anonymisiert und kein Admin-Konto ist (Entscheid P4/P11),
-- ergibt genau eine aktive Zeile. Verwaiste und anonymisierte Zuordnungen werden uebersprungen (die Halle gilt danach als ohne Zugang, Admin 1 laedt neu ein).
-- Gesperrte Konten werden als active uebernommen; hasVenueAccess schliesst sie aus (Arbeitsannahme A7). manager_user_id bleibt unveraendert als Rueckfall bis 011 M4.
INSERT INTO "venue_access" ("venue_id", "user_id", "status", "assigned_at")
SELECT v."id", v."manager_user_id", 'active', now()
FROM "venues" v
JOIN "users" u ON u."id" = v."manager_user_id"
WHERE u."email" NOT LIKE 'geloescht-%@geloescht.invalid' AND u."role" <> 'admin'
ON CONFLICT DO NOTHING;
