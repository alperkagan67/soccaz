ALTER TABLE "venues" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "approval_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "approval_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "approval_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "approval_reason" text;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_approval_decided_by_users_id_fk" FOREIGN KEY ("approval_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_approval_status_chk" CHECK ("venues"."approval_status" in ('requested', 'approved', 'rejected'));--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_requested_inactive_chk" CHECK ("venues"."approval_status" = 'approved' or "venues"."active" = false);