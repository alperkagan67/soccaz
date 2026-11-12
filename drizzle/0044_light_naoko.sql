ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_one_owner" ON "users" USING btree ("is_owner") WHERE "users"."is_owner";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_owner_is_admin" CHECK (not "users"."is_owner" or "users"."role" = 'admin');