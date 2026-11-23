-- Rueckfall zu 0056_venue_approval (Freischaltung von Hallen, 013 v3 AC-31): erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- Rein additiv: nichts anderes haengt an den Spalten, solange der alte Code laeuft. Angefragte/abgelehnte Hallen (approval_status <> 'approved') gehen dabei NICHT verloren, bleiben aber inaktiv.
-- Danach von Hand: den Eintrag "0056_venue_approval" aus drizzle.__drizzle_migrations entfernen.
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_requested_inactive_chk";
--> statement-breakpoint
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_approval_status_chk";
--> statement-breakpoint
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_approval_decided_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN IF EXISTS "approval_reason", DROP COLUMN IF EXISTS "approval_decided_by", DROP COLUMN IF EXISTS "approval_decided_at", DROP COLUMN IF EXISTS "approval_requested_at", DROP COLUMN IF EXISTS "approval_status";
