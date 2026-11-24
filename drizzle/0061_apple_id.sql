-- Anmeldung mit Apple (Auftrag t2s, Turnier 12.12.): users.apple_id (Apple-sub, nullable) mit TEIL-eindeutigem Index (nur nicht leere Werte). Rein additiv, keine Backfill-Zeilen, keine Wirkung auf bestehende Konten.
-- Rueckfall: drizzle/down/0061_down.sql (bricht ab, sobald ein Konto eine Apple-Kennung hat).
ALTER TABLE "users" ADD COLUMN "apple_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_apple_id_unique" ON "users" USING btree ("apple_id") WHERE "users"."apple_id" is not null;