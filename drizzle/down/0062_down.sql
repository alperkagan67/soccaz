-- Rueckfall zu 0062_turnier_tiebreak_puffer: erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- Gibt es schon ein Spiel mit Golden Goal/Neunmeter (decided_by, shootout_a/b) oder ein Turnier mit anderem Puffer als 5 Minuten, bricht der Rueckfall AB (nichts wird geaendert): diese Angaben gehen sonst verloren und der Spielplan wuerde anders berechnet. Vorher bewusst klaeren. Ohne solche Zeilen wird alles zurueckgebaut. Zweimal hintereinander ausfuehrbar.
-- Danach von Hand: den Eintrag "0062_turnier_tiebreak_puffer" aus drizzle.__drizzle_migrations entfernen.
DO $$
DECLARE
  n_tm bigint := 0;
  n_t bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournament_matches' AND column_name = 'decided_by') THEN
    EXECUTE 'select count(*) from public.tournament_matches where decided_by is not null or shootout_a is not null or shootout_b is not null' INTO n_tm;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tournaments' AND column_name = 'gap_minutes') THEN
    EXECUTE 'select count(*) from public.tournaments where gap_minutes <> 5' INTO n_t;
  END IF;
  IF n_tm > 0 OR n_t > 0 THEN
    RAISE EXCEPTION 'Rueckfall 0062 abgebrochen: % Turnierspiele mit Golden Goal/Neunmeter und % Turniere mit anderem Puffer als 5 Minuten', n_tm, n_t;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP CONSTRAINT IF EXISTS "tournament_matches_shootout_count";--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP CONSTRAINT IF EXISTS "tournament_matches_decided_by_shape";--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP CONSTRAINT IF EXISTS "tournament_matches_decided_by_check";--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_gap_range";--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "shootout_b";--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "shootout_a";--> statement-breakpoint
ALTER TABLE "tournament_matches" DROP COLUMN IF EXISTS "decided_by";--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "gap_minutes";
