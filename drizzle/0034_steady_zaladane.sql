ALTER TABLE "matches" ADD COLUMN "legacy_share_model" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "matches" SET "legacy_share_model" = true;
