-- Rueckfall zu 0059_turnier_ablehnen (Backlog 161, Turnier-Ablehnen): erst den Code zurueckrollen, dann im Wartungsfenster ausfuehren (NICHT vom Migrator ausgefuehrt).
-- booking_evidence ist APPEND-ONLY: gibt es schon einen Eintrag kind = 'declined' (Turnier), bricht der Rueckfall AB (die Zeile muesste sonst den erweiterten CHECK verlieren oder geloescht werden);
-- dann bleibt der Stand von 0059 bestehen (Trigger, Spalten, CHECK). Ohne declined-Zeile wird alles zurueckgebaut. Zweimal hintereinander ausfuehrbar.
-- Danach von Hand: den Eintrag "0059_turnier_ablehnen" aus drizzle.__drizzle_migrations entfernen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM booking_evidence WHERE subject = 'tournament' AND kind = 'declined') THEN
    RAISE EXCEPTION 'Rueckfall 0059 abgebrochen: das Beweisprotokoll enthaelt Turnier-Ablehnungen (append-only). Nichts wurde geaendert.';
  END IF;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tournaments_evidence_decline_ins ON tournaments;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tournaments_evidence_decline_upd ON tournaments;
--> statement-breakpoint
DROP FUNCTION IF EXISTS evidence_tournament_decline_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tournaments_reset_confirmation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.venue_id IS DISTINCT FROM NEW.venue_id THEN
    NEW.venue_confirmed_at := NULL;
    NEW.venue_confirmed_by := NULL;
  END IF;
  IF NEW.venue_confirmed_at IS NULL THEN
    NEW.venue_confirmed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
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
    IF p_round_mode <> 'accepted_count' THEN
      RAISE EXCEPTION 'evidence_emit: round_mode % passt nicht zum Betreff tournament.', p_round_mode;
    END IF;
    -- Einmaligkeit beim Turnier bewusst NICHT ueber Existenz: v_round = 1 + Anzahl accepted ist immer neu, die Existenzpruefung unten greift hier nie. Die Idempotenz liefert das WHEN des Triggers
    -- (nur NULL -> Wert), der partielle UNIQUE (tournament_id, venue_id, round, kind) sichert ab; Zusage, Ruecknahme, Zusage = zwei accepted ist gewollt (Plan 16f.9; Test 'Turnier-Idempotenz').
    SELECT 1 + count(*) INTO v_round FROM booking_evidence WHERE subject = 'tournament' AND tournament_id = p_tournament AND kind = 'accepted';
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
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_decline_by_needs_declined";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_decline_needs_code";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_decline_code_check";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_decline_needs_venue";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_decline_xor_confirm";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "venue_decline_code";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "venue_declined_by";
--> statement-breakpoint
ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "venue_declined_at";
--> statement-breakpoint
ALTER TABLE "booking_evidence" DROP CONSTRAINT IF EXISTS "booking_evidence_tournament_kind_check";
--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_tournament_kind_check" CHECK ("booking_evidence"."subject" = 'match' or "booking_evidence"."kind" = 'accepted');
