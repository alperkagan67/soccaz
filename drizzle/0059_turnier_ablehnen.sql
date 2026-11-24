ALTER TABLE "booking_evidence" DROP CONSTRAINT "booking_evidence_tournament_kind_check";--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_declined_by" uuid;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_decline_code" text;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_tournament_kind_check" CHECK ("booking_evidence"."subject" = 'match' or "booking_evidence"."kind" in ('accepted', 'declined'));--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_decline_xor_confirm" CHECK ("tournaments"."venue_declined_at" is null or "tournaments"."venue_confirmed_at" is null);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_decline_needs_venue" CHECK ("tournaments"."venue_declined_at" is null or "tournaments"."venue_id" is not null);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_decline_code_check" CHECK ("tournaments"."venue_decline_code" is null or ("tournaments"."venue_declined_at" is not null and "tournaments"."venue_decline_code" in ('belegt', 'wartung', 'veranstaltung', 'sonstiges')));--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_decline_needs_code" CHECK ("tournaments"."venue_declined_at" is null or "tournaments"."venue_decline_code" is not null);--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_decline_by_needs_declined" CHECK ("tournaments"."venue_declined_by" is null or "tournaments"."venue_declined_at" is not null);
--> statement-breakpoint
-- Backlog 161 (Plan docs/design/plan-turnier-ablehnen.md): die Halle LEHNT ein Turnier mit Grund-Kategorie ab; der Beweiseintrag kind = 'declined' entsteht durch einen DEFERRABLE-Trigger auf dem Uebergang
-- venue_declined_at NULL -> Wert (Muster evidence_tournament_event, 0055). Die App setzt nur die Spalten (und den Freitext als Sitzungswert), sie ruft keine Beweisfunktion.
-- Rundenzaehlung: jede neue Ablehnung ist eine neue Runde (1 + Zahl der bisherigen 'declined' des Turniers); "zweimal ablehnen = einmal" gilt nur fuer DIESELBE Ablehnung (WHEN nur NULL -> Wert, partieller UNIQUE).
-- evidence_emit: gleiche Signatur wie 0054 (CREATE OR REPLACE, keine Ueberladung), nur der Zweig 'tournament' kennt jetzt zwei Modi.
CREATE OR REPLACE FUNCTION evidence_emit(
  p_subject text, p_match uuid, p_tournament uuid, p_venue uuid, p_job uuid, p_kind text, p_round_mode text, p_actor uuid,
  p_reason_code text, p_reason text, p_deadline timestamptz, p_decided timestamptz, p_statement_at timestamptz, p_enforced boolean
) RETURNS uuid AS $$
DECLARE
  v_round integer;
BEGIN
  PERFORM 1 FROM booking_evidence_counter WHERE id = 1 FOR UPDATE; -- Zaehler zuerst sperren, dann Existenz pruefen (R-T210)
  IF p_subject = 'match' THEN
    IF p_round_mode = 'open' THEN
      SELECT round INTO v_round FROM booking_evidence
        WHERE subject = 'match' AND match_id = p_match AND tx_id = txid_current() AND kind IN ('request_sent', 'unmanaged') LIMIT 1;
      IF v_round IS NULL THEN
        SELECT coalesce(max(round), 0) + 1 INTO v_round FROM booking_evidence WHERE subject = 'match' AND match_id = p_match;
      END IF;
    ELSIF p_round_mode = 'current' THEN
      SELECT coalesce(max(round), 0) INTO v_round FROM booking_evidence WHERE subject = 'match' AND match_id = p_match;
    ELSE
      RAISE EXCEPTION 'evidence_emit: round_mode % passt nicht zum Betreff match.', p_round_mode;
    END IF;
    IF p_kind NOT LIKE 'job\_%' AND EXISTS (
      SELECT 1 FROM booking_evidence WHERE subject = 'match' AND match_id = p_match AND venue_id IS NOT DISTINCT FROM p_venue AND round = v_round AND kind = p_kind
    ) THEN
      RETURN NULL; -- schon vorhanden: still weiter, keine seq
    END IF;
  ELSIF p_subject = 'tournament' THEN
    -- Einmaligkeit beim Turnier bewusst NICHT ueber Existenz: v_round = 1 + Anzahl der bisherigen Eintraege DERSELBEN Art ist immer neu, die Existenzpruefung unten greift hier nie. Die Idempotenz liefert das WHEN
    -- des Triggers (nur NULL -> Wert), der partielle UNIQUE (tournament_id, venue_id, round, kind) sichert ab; Zusage, Ruecknahme, Zusage = zwei accepted (Plan 16f.9), Ablehnung, Hallenwechsel, spaetere Ablehnung = zwei declined.
    IF p_round_mode = 'accepted_count' AND p_kind = 'accepted' THEN
      SELECT 1 + count(*) INTO v_round FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = p_tournament AND kind = 'accepted';
    ELSIF p_round_mode = 'declined_count' AND p_kind = 'declined' THEN
      SELECT 1 + count(*) INTO v_round FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = p_tournament AND kind = 'declined';
    ELSE
      RAISE EXCEPTION 'evidence_emit: round_mode % passt nicht zum Betreff tournament (Art %).', p_round_mode, p_kind;
    END IF;
    IF EXISTS (
      SELECT 1 FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = p_tournament AND venue_id IS NOT DISTINCT FROM p_venue AND round = v_round AND kind = p_kind
    ) THEN
      RETURN NULL;
    END IF;
  ELSE
    RAISE EXCEPTION 'evidence_emit: unbekannter Betreff %.', p_subject;
  END IF;
  RETURN evidence_write(p_subject, p_match, p_tournament, p_venue, p_job, v_round, p_kind, p_actor, p_reason, p_reason_code, p_deadline, p_decided, p_statement_at, p_enforced);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_tournament_decline_event() RETURNS trigger AS $$
DECLARE
  v_actor uuid := NULL;
  v_text text;
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN NULL;
  END IF;
  IF NEW.venue_id IS NULL THEN
    RAISE EXCEPTION 'Ablehnung ohne Halle (Turnier %).', NEW.id;
  END IF;
  IF NEW.venue_declined_by IS NOT NULL AND evidence_has_venue_access(NEW.venue_id, NEW.venue_declined_by) THEN
    v_actor := NEW.venue_declined_by;
  END IF;
  -- Freitext (optional) als Sitzungswert der Aktion, nur im Beweisprotokoll (Hash plus Nebentabelle); Kategorie Pflicht, "sonstiges" braucht eine Begruendung
  v_text := nullif(current_setting(evidence_session_key('evidence_reason', NEW.id, NEW.venue_id), true), '');
  PERFORM evidence_check_reason(NEW.venue_decline_code, v_text, true);
  PERFORM evidence_emit('tournament', NULL, NEW.id, NEW.venue_id, NULL, 'declined', 'declined_count', v_actor, NEW.venue_decline_code, v_text, NULL, transaction_timestamp(), transaction_timestamp(), NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tournaments_evidence_decline_ins ON tournaments;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tournaments_evidence_decline_ins
  AFTER INSERT ON tournaments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.venue_declined_at IS NOT NULL) EXECUTE FUNCTION evidence_tournament_decline_event();
--> statement-breakpoint
DROP TRIGGER IF EXISTS tournaments_evidence_decline_upd ON tournaments;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tournaments_evidence_decline_upd
  AFTER UPDATE ON tournaments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.venue_declined_at IS NULL AND NEW.venue_declined_at IS NOT NULL) EXECUTE FUNCTION evidence_tournament_decline_event();
--> statement-breakpoint
-- Zusage und Ablehnung schliessen sich aus: nur ein Hallenwechsel (neue Hallenwahl des Veranstalters = neue Anfrage) setzt die Ablehnung zurueck; eine Zusage NACH einer Ablehnung ist endgueltig gesperrt
-- (Entscheid t2q 2026-11-24): der CHECK tournaments_decline_xor_confirm weist sie ab. Akteur und Code folgen dem Zeitstempel (wie venue_confirmed_by).
CREATE OR REPLACE FUNCTION tournaments_reset_confirmation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN
    NEW.venue_confirmed_at := NULL;
    NEW.venue_confirmed_by := NULL;
    NEW.venue_declined_at := NULL;
  END IF;
  IF NEW.venue_confirmed_at IS NULL THEN
    NEW.venue_confirmed_by := NULL;
  END IF;
  IF NEW.venue_declined_at IS NULL THEN
    NEW.venue_declined_by := NULL;
    NEW.venue_decline_code := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Loeschschutz: auch ein Turnier mit NUR einer Ablehnung im Beweisprotokoll ist nicht loeschbar (sonst verwaist die Beweiszeile)
CREATE OR REPLACE FUNCTION forbid_delete_with_evidence() RETURNS trigger AS $$
BEGIN
  IF public.socaz_maintenance_allowed() THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'matches' AND EXISTS (SELECT 1 FROM booking_evidence WHERE subject = 'match' AND match_id = OLD.id) THEN
    RAISE EXCEPTION 'Spiel % hat Beweisprotokoll-Eintraege und kann nicht geloescht werden.', OLD.id;
  END IF;
  IF TG_TABLE_NAME = 'tournaments' AND EXISTS (SELECT 1 FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = OLD.id AND kind IN ('accepted', 'declined')) THEN
    RAISE EXCEPTION 'Turnier % hat Beweisprotokoll-Eintraege (Zusage oder Ablehnung der Halle) und kann nicht geloescht werden.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
