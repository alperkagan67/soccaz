-- Rueckfall zu 0061_apple_id: erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- Eine Apple-Kennung ist eine Anmeldeverknuepfung (Nutzerdaten): hat schon ein Konto eine, bricht der Rueckfall AB (nichts wird geaendert); vorher bewusst klaeren (Spieler melden sich sonst nicht mehr mit Apple an). Ohne Kennungen wird alles zurueckgebaut. Zweimal hintereinander ausfuehrbar.
-- Danach von Hand: den Eintrag "0061_apple_id" aus drizzle.__drizzle_migrations entfernen.
DO $$
DECLARE
  n bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'apple_id') THEN
    EXECUTE 'select count(*) from public.users where apple_id is not null' INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Rueckfall 0061 abgebrochen: % Konten haben eine Apple-Kennung (Anmeldeverknuepfung). Nichts wurde geaendert.', n;
    END IF;
  END IF;
END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "users_apple_id_unique";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "apple_id";
