-- G25-009 A1 (verhaltensneutral, Plan docs/design/g25-009-db-rollenmodell.md und Code-Plan v5): Wartungsausnahme an die Rollenmitgliedschaft binden.
-- Ohne die Rolle soccaz_maintenance (Datenbank ohne Rollen) gilt WIE HEUTE nur der Sitzungswert (benannter Zwischenzustand); mit der Rolle zaehlt der Wert nur fuer Mitglieder (session_user).
-- Superuser sind implizit Mitglied: Tests und CI (postgres) laufen unveraendert. Die Marker (socaz.evidence_insert, socaz.evidence_setting_write) und die Guards bleiben bis A2 unveraendert.
-- Rueckfall (nur VOR A2): drizzle/down/0055_down.sql.
CREATE OR REPLACE FUNCTION socaz_maintenance_allowed() RETURNS boolean AS $$
  SELECT coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on'
    AND (
      NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'soccaz_maintenance') -- Zwischenzustand ohne Rollen: nur der Wert (A2 ersetzt das durch die harte Fassung)
      OR pg_catalog.pg_has_role(session_user, 'soccaz_maintenance', 'member')
    )
$$ LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'ledger_entries ist unveränderlich (Operation %). Bitte eine Gegenbuchung erzeugen.', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% ist nur anhaengend (Operation %).', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_ledger_model_change() RETURNS trigger AS $$
BEGIN
  IF NEW.ledger_model IS DISTINCT FROM OLD.ledger_model AND NOT public.socaz_maintenance_allowed() THEN
    RAISE EXCEPTION 'matches.ledger_model ist unveraenderlich.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_evidence_truncate() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION '% ist nur anhaengend (Operation TRUNCATE).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION booking_evidence_counter_guard() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() OR coalesce(current_setting('socaz.evidence_insert', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'booking_evidence_counter darf nur der Beweisprotokoll-Trigger aendern (Operation %).', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_delete_with_evidence() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'matches' AND EXISTS (SELECT 1 FROM booking_evidence WHERE subject = 'match' AND match_id = OLD.id) THEN
    RAISE EXCEPTION 'Spiel % hat Beweisprotokoll-Eintraege und kann nicht geloescht werden.', OLD.id;
  END IF;
  IF TG_TABLE_NAME = 'tournaments' AND EXISTS (SELECT 1 FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = OLD.id AND kind = 'accepted') THEN
    RAISE EXCEPTION 'Turnier % hat Beweisprotokoll-Eintraege (Zusage der Halle) und kann nicht geloescht werden.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_settings_guard() RETURNS trigger AS $$
DECLARE
  k text := CASE WHEN TG_OP = 'INSERT' THEN NEW.key ELSE OLD.key END;
  v text;
BEGIN
  IF k NOT IN ('evidence_enforcement', 'evidence_clock_source', 'evidence_reason_retention_days', 'evidence_cutover_at', 'evidence_tournament_cutover_at')
     AND (TG_OP <> 'UPDATE' OR NEW.key NOT IN ('evidence_enforcement', 'evidence_clock_source', 'evidence_reason_retention_days', 'evidence_cutover_at', 'evidence_tournament_cutover_at')) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF NOT public.socaz_maintenance_allowed() AND coalesce(current_setting('socaz.evidence_setting_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Einstellung % darf nur ueber evidence_set_setting geaendert werden.', k;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  v := NEW.value #>> '{}';
  IF k = 'evidence_enforcement' AND coalesce(v, '') NOT IN ('off', 'on') THEN
    RAISE EXCEPTION 'evidence_enforcement nur off oder on.';
  ELSIF k = 'evidence_clock_source' AND coalesce(v, '') NOT IN ('js', 'db') THEN
    RAISE EXCEPTION 'evidence_clock_source nur js oder db.';
  ELSIF k = 'evidence_reason_retention_days' AND coalesce(v, '') !~ '^[0-9]{1,5}$' THEN
    RAISE EXCEPTION 'evidence_reason_retention_days: ganze Zahl.';
  ELSIF k IN ('evidence_cutover_at', 'evidence_tournament_cutover_at') THEN
    PERFORM v::timestamptz; -- formal pruefen (Fehler bei ungueltigem Zeitstempel)
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_hall_before() RETURNS trigger AS $$
DECLARE
  v_enf boolean;
  v_code text;
  v_text text;
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NEW; -- nur Test-Cleanup/Wartung
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.reply_deadline := NULL;
    NEW.decision_statement_at := NULL;
    NEW.decision_enforced := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined') THEN
    v_enf := evidence_enforced();
    SELECT veto_turn_deadline INTO NEW.reply_deadline FROM matches WHERE id = NEW.match_id; -- Zeile noch unveraendert (vor settleHallCheck)
    NEW.decision_statement_at := clock_timestamp();
    NEW.decision_enforced := v_enf;
    IF v_enf AND NEW.answered_at IS NOT NULL THEN
      IF NEW.reply_deadline IS NULL THEN
        RAISE EXCEPTION 'Antwortfrist des Spiels fehlt.' USING ERRCODE = 'EV003';
      END IF;
      IF transaction_timestamp() > NEW.reply_deadline THEN
        RAISE EXCEPTION 'Antwortfrist abgelaufen.' USING ERRCODE = 'EV001';
      END IF;
      IF NEW.status = 'declined' THEN
        v_code := nullif(current_setting(evidence_session_key('evidence_reason_code', NEW.match_id, NEW.venue_id), true), '');
        v_text := nullif(current_setting(evidence_session_key('evidence_reason', NEW.match_id, NEW.venue_id), true), '');
        PERFORM evidence_check_reason(v_code, v_text, true);
      END IF;
    END IF;
  ELSE
    NEW.reply_deadline := OLD.reply_deadline;
    NEW.decision_statement_at := OLD.decision_statement_at;
    NEW.decision_enforced := OLD.decision_enforced;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_hall_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_code text := '';
  v_text text := NULL;
  v_decided timestamptz := NULL;
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NULL; -- nur Test-Cleanup (Plan 14.3)
  END IF;
  IF TG_OP = 'INSERT' THEN
    k := CASE NEW.status WHEN 'pending' THEN 'request_sent' WHEN 'unmanaged' THEN 'unmanaged' ELSE NULL END;
  ELSE
    IF OLD.status <> 'pending' THEN
      RETURN NULL;
    END IF;
    k := CASE NEW.status
           WHEN 'confirmed' THEN 'accepted'
           WHEN 'declined' THEN CASE WHEN NEW.answered_at IS NULL THEN 'expired' ELSE 'declined' END
           WHEN 'unmanaged' THEN 'unmanaged'
           ELSE NULL END;
  END IF;
  IF k IS NULL THEN
    RETURN NULL; -- frueh zurueck, bevor der Zaehler gesperrt wird (Plan 14.5)
  END IF;
  IF k = 'declined' THEN
    v_code := coalesce(nullif(current_setting(evidence_session_key('evidence_reason_code', NEW.match_id, NEW.venue_id), true), ''), '');
    IF v_code NOT IN ('belegt', 'wartung', 'veranstaltung', 'sonstiges') THEN
      v_code := ''; -- bei ausgeschalteter Durchsetzung darf der Code fehlen; ungueltige Werte werden nicht uebernommen
    END IF;
    v_text := nullif(current_setting(evidence_session_key('evidence_reason', NEW.match_id, NEW.venue_id), true), '');
    IF v_text IS NOT NULL AND (evidence_clean_reason(v_text) = '' OR char_length(evidence_clean_reason(v_text)) NOT BETWEEN 3 AND 200) THEN
      v_text := NULL; -- ungueltiger Text bei ausgeschalteter Durchsetzung: nicht speichern (bei 'on' hat der Sofort-Trigger abgelehnt)
    END IF;
  END IF;
  IF k IN ('accepted', 'declined', 'expired') THEN
    v_decided := transaction_timestamp();
  END IF;
  PERFORM evidence_emit('match', NEW.match_id, NULL, NEW.venue_id, NULL, k,
    CASE WHEN TG_OP = 'INSERT' AND k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END, -- nur INSERT-Ereignisse eroeffnen eine Runde (Plan 14.4)
    CASE WHEN k IN ('accepted', 'declined') THEN NEW.answered_by ELSE NULL END,
    v_code, v_text,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.reply_deadline ELSE NULL END, v_decided,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.decision_statement_at ELSE NULL END,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.decision_enforced ELSE NULL END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_job_event() RETURNS trigger AS $$
DECLARE
  k text;
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    k := 'job_open';
  ELSE
    k := CASE NEW.status
           WHEN 'booked' THEN 'job_booked' WHEN 'confirmed' THEN 'job_confirmed' WHEN 'unavailable' THEN 'job_unavailable'
           WHEN 'withdrawn' THEN 'job_withdrawn' WHEN 'done' THEN 'job_done' ELSE NULL END;
  END IF;
  IF k IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM evidence_emit('match', NEW.match_id, NULL, NEW.venue_id, NEW.id, k, 'current', NULL, '', NULL, NULL, NULL, NULL, NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_tournament_event() RETURNS trigger AS $$
DECLARE
  v_actor uuid := NULL;
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NULL;
  END IF;
  IF NEW.venue_id IS NULL THEN
    RAISE EXCEPTION 'Zusage ohne Halle (Turnier %).', NEW.id;
  END IF;
  IF NEW.venue_confirmed_by IS NOT NULL AND evidence_has_venue_access(NEW.venue_id, NEW.venue_confirmed_by) THEN
    v_actor := NEW.venue_confirmed_by;
  END IF;
  PERFORM evidence_emit('tournament', NULL, NEW.id, NEW.venue_id, NULL, 'accepted', 'accepted_count', v_actor, '', NULL, NULL, transaction_timestamp(), transaction_timestamp(), NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION booking_evidence_before_insert() RETURNS trigger AS $$
DECLARE
  c booking_evidence_counter%ROWTYPE;
BEGIN
  IF NEW.hash_version = 1 AND NOT public.socaz_maintenance_allowed() THEN
    RAISE EXCEPTION 'hash_version 1 ist nur unter der Wartungsausnahme erlaubt (neue Eintraege sind Version 2).';
  END IF;
  IF NEW.hash_version NOT IN (1, 2) THEN
    RAISE EXCEPTION 'unbekannte hash_version %.', NEW.hash_version;
  END IF;
  SELECT * INTO c FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_evidence_counter fehlt';
  END IF;
  IF public.socaz_maintenance_allowed() AND coalesce(current_setting('socaz.evidence_restore', true), '') = 'on'
     AND ((c.last_seq = 0 AND NOT EXISTS (SELECT 1 FROM booking_evidence)) -- Start NUR in eine LEERE Tabelle (vom Wert allein nicht umgehbar)
          OR (c.last_seq > 0 AND (SELECT xmin FROM booking_evidence WHERE seq = c.last_seq) = pg_current_xact_id()::xid)) THEN -- Fortsetzung nur, wenn die Vorzeile in DIESER Transaktion eingefuegt wurde
    -- Wiederherstellung (logischer Restore, Plan 10.3): seq/prev_hash/at/hash bleiben UNVERAENDERT, werden aber geprueft; Wartungsmitglied noetig; evidence_restore_finish() ist Pflicht (aufgeschobener Trigger)
    PERFORM set_config('socaz.evidence_restore_pending', 'on', true);
    IF NEW.at IS NULL THEN RAISE EXCEPTION 'Restore: at fehlt (seq %)', NEW.seq; END IF;
    IF NEW.at > clock_timestamp() + interval '1 minute' THEN RAISE EXCEPTION 'Restore: at liegt in der Zukunft (seq %)', NEW.seq; END IF;
    IF NEW.seq IS DISTINCT FROM c.last_seq + 1 THEN RAISE EXCEPTION 'Restore: seq % erwartet %', NEW.seq, c.last_seq + 1; END IF;
    IF NEW.prev_hash IS DISTINCT FROM c.last_hash THEN RAISE EXCEPTION 'Restore: prev_hash passt nicht zu seq %', NEW.seq; END IF;
    IF NEW.hash IS DISTINCT FROM evidence_hash_of(NEW) THEN RAISE EXCEPTION 'Restore: Hash stimmt nicht (seq %)', NEW.seq; END IF;
    IF c.last_seq > 0 AND NEW.at < (SELECT at FROM booking_evidence WHERE seq = c.last_seq) THEN RAISE EXCEPTION 'Restore: at nicht monoton (seq %)', NEW.seq; END IF;
  ELSE
  NEW.seq := c.last_seq + 1;
  NEW.prev_hash := c.last_hash;
  NEW.at := clock_timestamp();
  NEW.hash := evidence_hash_of(NEW);
  END IF;
  PERFORM set_config('socaz.evidence_insert', 'on', true);
  UPDATE booking_evidence_counter SET last_seq = NEW.seq, last_hash = NEW.hash WHERE id = 1;
  PERFORM set_config('socaz.evidence_insert', 'off', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Restore-Wartungsmodus (logischer Restore der Beweiskette): nur fuer Mitglieder der Wartungsrolle, nur in eine LEERE Zieltabelle, mit erwartetem Kopf-Hash
CREATE OR REPLACE FUNCTION evidence_restore_begin() RETURNS void AS $$
BEGIN
  IF NOT public.socaz_maintenance_allowed() THEN
    RAISE EXCEPTION 'evidence_restore_begin: nur fuer die Wartungsrolle (Wartungsausnahme gesetzt und Mitglied von soccaz_maintenance)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.booking_evidence) OR EXISTS (SELECT 1 FROM public.booking_evidence_counter WHERE id = 1 AND (last_seq <> 0 OR last_hash <> '')) THEN
    RAISE EXCEPTION 'evidence_restore_begin: Zieltabelle ist nicht leer';
  END IF;
  PERFORM set_config('socaz.evidence_restore', 'on', true);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_restore_finish(p_expected_head text) RETURNS void AS $$
DECLARE
  c public.booking_evidence_counter%ROWTYPE;
  n bigint;
BEGIN
  IF NOT public.socaz_maintenance_allowed() OR coalesce(current_setting('socaz.evidence_restore', true), '') <> 'on' THEN
    RAISE EXCEPTION 'evidence_restore_finish: kein Restore-Modus aktiv';
  END IF;
  IF coalesce(p_expected_head, '') = '' THEN RAISE EXCEPTION 'evidence_restore_finish: erwarteter Kopf-Hash ist Pflicht'; END IF;
  SELECT * INTO c FROM public.booking_evidence_counter WHERE id = 1;
  SELECT count(*) INTO n FROM public.booking_evidence;
  IF c.last_hash IS DISTINCT FROM p_expected_head THEN RAISE EXCEPTION 'evidence_restore_finish: Kopf-Hash weicht ab'; END IF;
  IF n <> c.last_seq THEN RAISE EXCEPTION 'evidence_restore_finish: Zeilenzahl % passt nicht zum Zaehler %', n, c.last_seq; END IF;
  PERFORM set_config('socaz.evidence_restore', 'off', true);
  PERFORM set_config('socaz.evidence_restore_pending', 'off', true);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Erzwingt evidence_restore_finish: wurde in dieser Transaktion ein Restore-Insert gemacht, muss finish vor dem COMMIT gelaufen sein (nur Schutz vor Versehen, ein Mitglied kann den Wert ohnehin setzen)
CREATE OR REPLACE FUNCTION evidence_restore_done() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('socaz.evidence_restore_pending', true), '') = 'on' THEN
    RAISE EXCEPTION 'Restore nicht mit evidence_restore_finish abgeschlossen';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_evidence_restore_done ON booking_evidence
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER booking_evidence_restore_done AFTER INSERT ON booking_evidence DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_restore_done()
