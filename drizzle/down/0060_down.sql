-- Rueckfall zu 0060_venue_reviews (Vertrag 010 M1): erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- Bewertungen sind Nutzerdaten: gibt es schon eine Zeile in venue_reviews, bricht der Rueckfall AB (nichts wird geloescht); vorher exportieren und bewusst leeren. Ohne Zeilen wird alles zurueckgebaut. Zweimal hintereinander ausfuehrbar.
-- Danach von Hand: den Eintrag "0060_venue_reviews" aus drizzle.__drizzle_migrations entfernen.
DO $$
DECLARE
  n bigint := 0;
BEGIN
  IF to_regclass('public.venue_reviews') IS NOT NULL THEN
    EXECUTE 'select count(*) from public.venue_reviews' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Rueckfall 0060 abgebrochen: venue_reviews enthaelt % Bewertungen (Nutzerdaten). Nichts wurde geaendert.', n;
    END IF;
  END IF;
END
$$;
--> statement-breakpoint
DROP TABLE IF EXISTS "venue_review_reports";
--> statement-breakpoint
DROP TABLE IF EXISTS "venue_reviews";
