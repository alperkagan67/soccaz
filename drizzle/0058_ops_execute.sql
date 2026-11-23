-- G25-009 Etappe B (zweite Verbindungsrolle soccaz_ops, Plan docs/design/g25-009-db-rollenmodell.md Abschnitt 5): EXECUTE auf die zwei Funktionen, die der Ops-Pool (src/db/ops.ts) aufruft.
-- NUR GRANT, kein REVOKE: den Entzug von PUBLIC und soccaz_app macht die A2-Migration zusammen mit dem Rechtewechsel und dem URL-Wechsel (sonst scheitert jede Verbindung, die heute nicht als Eigentuemer
-- laeuft, an einer Funktion, die sie braucht). Verhaltensneutral: die Rolle ist heute unbenutzt. Fehlt die Rolle (Datenbank ohne Rollen, db-roles.mjs nicht angewendet), nur eine Warnung (kein Verschlucken von Fehlern).
-- Rueckfall: drizzle/down/0058_down.sql.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'soccaz_ops') THEN
    GRANT EXECUTE ON FUNCTION public.evidence_set_setting(text, text, uuid, text) TO soccaz_ops;
    GRANT EXECUTE ON FUNCTION public.evidence_late_attempt(uuid, uuid, uuid) TO soccaz_ops;
  ELSE
    RAISE WARNING 'soccaz_ops existiert nicht: EXECUTE-Rechte fuer den Ops-Pool nicht gesetzt (scripts/db-roles.mjs anwenden und diese Rechte nachholen).';
  END IF;
END
$$;
