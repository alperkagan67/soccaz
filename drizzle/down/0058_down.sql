-- Rueckfall zu 0058_ops_execute: nimmt die EXECUTE-Rechte von soccaz_ops zurueck (falls die Rolle existiert).
-- Danach von Hand: den Eintrag "0058_ops_execute" aus drizzle.__drizzle_migrations entfernen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'soccaz_ops') THEN
    REVOKE EXECUTE ON FUNCTION public.evidence_set_setting(text, text, uuid, text) FROM soccaz_ops;
    REVOKE EXECUTE ON FUNCTION public.evidence_late_attempt(uuid, uuid, uuid) FROM soccaz_ops;
  END IF;
END
$$;
