-- Rollen des Datenbank-Rollenmodells (G25-009, Plan docs/design/g25-009-db-rollenmodell.md Abschnitt 2), CLUSTER-Teil. Idempotent, ohne Passwoerter (die setzt scripts/db-roles.mjs aus Umgebungsvariablen).
-- Dieses Skript aendert KEIN Verhalten der Anwendung: es legt nur Rollen an, die noch niemand benutzt (Eigentum, Rechte und Guards kommen mit A1/A2).
-- Ausfuehrung nur ueber scripts/db-roles.mjs (Wachter db-guard: nur lokale Datenbank).
DO $$
BEGIN
  -- Eigentuemer aller Objekte: keine Anmeldung, kein Superuser, KEIN Mitglied von soccaz_maintenance
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_owner') THEN
    CREATE ROLE soccaz_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- die einzige Rolle, die eine Wartungsausnahme nutzen darf (nur Mitglieder, im Wartungsfenster)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_maintenance') THEN
    CREATE ROLE soccaz_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Migration/Wartung
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_migrate') THEN
    CREATE ROLE soccaz_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- laufende Anwendung
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_app') THEN
    CREATE ROLE soccaz_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Admin- und Fristhandlungen (nur nach Etappe B benutzt)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_ops') THEN
    CREATE ROLE soccaz_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Sicherungen und Berichte (nur lesend)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'soccaz_backup') THEN
    CREATE ROLE soccaz_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;
--> statement
-- Eigenschaften auch bei bestehenden Rollen erzwingen (idempotent: eine fruehere abweichende Anlage wird korrigiert; auch REPLICATION, INHERIT, Verbindungslimit)
ALTER ROLE soccaz_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
ALTER ROLE soccaz_maintenance NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
ALTER ROLE soccaz_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
ALTER ROLE soccaz_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
ALTER ROLE soccaz_ops LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
ALTER ROLE soccaz_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION INHERIT CONNECTION LIMIT -1;
--> statement
-- Mitgliedschaften (Soll-Liste): soccaz_migrate erbt soccaz_owner; soccaz_migrate ist NICHT dauerhaft Mitglied von soccaz_maintenance (nur im Wartungsfenster);
-- soccaz_owner ist KEIN Mitglied von soccaz_maintenance; soccaz_app/ops sind in keiner Rolle; soccaz_backup liest alles.
GRANT soccaz_owner TO soccaz_migrate;
--> statement
GRANT pg_read_all_data TO soccaz_backup;
-- Abweichende Mitgliedschaften entzieht scripts/db-roles.mjs nach diesem Teil anhand von pg_auth_members (Soll-Liste, bricht bei fremden Mitgliedern ab).
