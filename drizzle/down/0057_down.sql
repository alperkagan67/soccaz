-- Rueckfall zu 0057_venue_court_count (Anzahl Plaetze der Hallen-Anfrage, 013 v3 AC-25): erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- Rein additiv: die Spalte wird nur von der Hallen-Anfrage geschrieben. Danach von Hand: den Eintrag "0057_venue_court_count" aus drizzle.__drizzle_migrations entfernen.
ALTER TABLE "venues" DROP CONSTRAINT IF EXISTS "venues_court_count_chk";
--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN IF EXISTS "court_count";
