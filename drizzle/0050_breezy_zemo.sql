CREATE TABLE "booking_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"match_id" uuid NOT NULL,
	"venue_id" uuid,
	"round" integer DEFAULT 0 NOT NULL,
	"job_id" uuid,
	"kind" text NOT NULL,
	"reason" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_commitment" text DEFAULT '' NOT NULL,
	"prev_hash" text DEFAULT '' NOT NULL,
	"hash" text DEFAULT '' NOT NULL,
	"tx_id" bigint DEFAULT txid_current() NOT NULL,
	"match_prev_hash" text,
	CONSTRAINT "booking_evidence_kind_check" CHECK ("booking_evidence"."kind" in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired', 'job_open', 'job_booked', 'job_confirmed', 'job_unavailable', 'job_withdrawn', 'job_done')),
	CONSTRAINT "booking_evidence_reason_len" CHECK ("booking_evidence"."reason" is null or char_length("booking_evidence"."reason") <= 300)
);
--> statement-breakpoint
CREATE TABLE "booking_evidence_counter" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	"last_hash" text DEFAULT '' NOT NULL,
	CONSTRAINT "booking_evidence_counter_single" CHECK ("booking_evidence_counter"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "evidence_actor" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"name" text,
	"email" text,
	"salt" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_actor" ADD CONSTRAINT "evidence_actor_evidence_id_booking_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."booking_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_seq_idx" ON "booking_evidence" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_request_idx" ON "booking_evidence" USING btree ("match_id","venue_id","round","kind") WHERE "booking_evidence"."kind" in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE INDEX "booking_evidence_match_idx" ON "booking_evidence" USING btree ("match_id","seq");--> statement-breakpoint
CREATE INDEX "booking_evidence_venue_idx" ON "booking_evidence" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "booking_evidence_job_idx" ON "booking_evidence" USING btree ("job_id");
--> statement-breakpoint
-- Beweisprotokoll (Vertrag 009 M3): Kette und Unveraenderlichkeit. Kern-sha256() (PostgreSQL 11+), kein pgcrypto.
-- Zaehlerzeile (genau eine, id = 1): letzter Stand der Kette.
INSERT INTO booking_evidence_counter (id, last_seq, last_hash) VALUES (1, 0, '') ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Hash einer Zeile: laengenpraefixierte Kodierung (<Bytes>:<Text>) in fester Feldfolge, damit weder '|' noch Zeilenumbrueche im Begruendungstext die Felder verschieben.
-- Dieselbe Funktion rechnet beim Schreiben (Trigger) und beim Pruefen (verifyEvidenceChain).
CREATE OR REPLACE FUNCTION evidence_hash(
  p_seq integer, p_match_id uuid, p_venue_id uuid, p_round integer, p_job_id uuid, p_kind text, p_reason text, p_at timestamptz, p_commitment text, p_prev_hash text
) RETURNS text AS $$
DECLARE
  parts text[];
  part text;
  buf text := '';
BEGIN
  parts := ARRAY[
    p_seq::text,
    p_match_id::text,
    coalesce(p_venue_id::text, ''),
    p_round::text,
    coalesce(p_job_id::text, ''),
    p_kind,
    coalesce(p_reason, ''),
    to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    p_commitment,
    p_prev_hash
  ];
  FOREACH part IN ARRAY parts LOOP
    buf := buf || octet_length(convert_to(part, 'UTF8'))::text || ':' || part || ';';
  END LOOP;
  RETURN encode(sha256(convert_to(buf, 'UTF8')), 'hex');
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint
-- INSERT-Trigger: sperrt den Zaehler, setzt seq, prev_hash, at und hash (Werte der Anwendung werden ueberschrieben), schreibt den neuen Stand in den Zaehler.
CREATE OR REPLACE FUNCTION booking_evidence_before_insert() RETURNS trigger AS $$
DECLARE
  c booking_evidence_counter%ROWTYPE;
BEGIN
  SELECT * INTO c FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_evidence_counter fehlt';
  END IF;
  NEW.seq := c.last_seq + 1;
  NEW.prev_hash := c.last_hash;
  NEW.at := clock_timestamp();
  NEW.hash := evidence_hash(NEW.seq, NEW.match_id, NEW.venue_id, NEW.round, NEW.job_id, NEW.kind, NEW.reason, NEW.at, NEW.actor_commitment, NEW.prev_hash);
  -- nur dieser Trigger darf den Zaehler aendern: Sitzungsvariable nur fuer die Dauer dieses UPDATE gesetzt (Restrisiko: jede App-SQL koennte sie ebenfalls setzen, siehe BETRIEB.md)
  PERFORM set_config('socaz.evidence_insert', 'on', true);
  UPDATE booking_evidence_counter SET last_seq = NEW.seq, last_hash = NEW.hash WHERE id = 1;
  PERFORM set_config('socaz.evidence_insert', 'off', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_evidence_before_insert ON booking_evidence;
--> statement-breakpoint
CREATE TRIGGER booking_evidence_before_insert
  BEFORE INSERT ON booking_evidence
  FOR EACH ROW EXECUTE FUNCTION booking_evidence_before_insert();
--> statement-breakpoint
-- nur anhaengend (Funktion forbid_append_only_mutation aus der Migration 009 M2); Wartungsausnahme: set local socaz.ledger_maintenance = 'on'
DROP TRIGGER IF EXISTS booking_evidence_append_only ON booking_evidence;
--> statement-breakpoint
CREATE TRIGGER booking_evidence_append_only
  BEFORE UPDATE OR DELETE ON booking_evidence
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
-- Der Zaehler wird nur vom INSERT-Trigger veraendert (UPDATE/DELETE durch die Anwendung ausser Wartung abgelehnt; der Trigger selbst aktualisiert ihn als Teil des INSERT)
CREATE OR REPLACE FUNCTION booking_evidence_counter_guard() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' OR coalesce(current_setting('socaz.evidence_insert', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'booking_evidence_counter darf nur der Beweisprotokoll-Trigger aendern (Operation %).', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_evidence_counter_guard ON booking_evidence_counter;
--> statement-breakpoint
CREATE TRIGGER booking_evidence_counter_guard
  BEFORE UPDATE OR DELETE ON booking_evidence_counter
  FOR EACH ROW EXECUTE FUNCTION booking_evidence_counter_guard();
--> statement-breakpoint
-- TRUNCATE darf das Beweisprotokoll und seinen Zaehler nicht leeren (die Zeilen-Trigger greifen bei TRUNCATE nicht); gleiche Wartungsausnahme wie bei UPDATE/DELETE
CREATE OR REPLACE FUNCTION forbid_evidence_truncate() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION '% ist nur anhaengend (Operation TRUNCATE).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_evidence_no_truncate ON booking_evidence;
--> statement-breakpoint
CREATE TRIGGER booking_evidence_no_truncate
  BEFORE TRUNCATE ON booking_evidence
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_evidence_truncate();
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_evidence_counter_no_truncate ON booking_evidence_counter;
--> statement-breakpoint
CREATE TRIGGER booking_evidence_counter_no_truncate
  BEFORE TRUNCATE ON booking_evidence_counter
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_evidence_truncate();
--> statement-breakpoint
-- Beweisprotokoll, DEFERRABLE-Haken (Plan 009 M3 v4/v5): UNGETESTET gegen die Datenbank (Stand: lokal ohne Datenbank geschrieben).
-- Ersatz fuer RESTRICT: Spiele und Hallen mit Protokolleintraegen werden nicht geloescht (liest ohne Zeilensperre; Restluecke: Plan 14.2)
CREATE OR REPLACE FUNCTION forbid_delete_with_evidence() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'matches' AND EXISTS (SELECT 1 FROM booking_evidence WHERE match_id = OLD.id) THEN
    RAISE EXCEPTION 'Spiel % hat Beweisprotokoll-Eintraege und kann nicht geloescht werden.', OLD.id;
  END IF;
  IF TG_TABLE_NAME = 'venues' AND EXISTS (SELECT 1 FROM booking_evidence WHERE venue_id = OLD.id) THEN
    RAISE EXCEPTION 'Halle % hat Beweisprotokoll-Eintraege und kann nicht geloescht werden.', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS matches_forbid_delete_with_evidence ON matches;
--> statement-breakpoint
CREATE TRIGGER matches_forbid_delete_with_evidence BEFORE DELETE ON matches FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_evidence();
--> statement-breakpoint
DROP TRIGGER IF EXISTS venues_forbid_delete_with_evidence ON venues;
--> statement-breakpoint
CREATE TRIGGER venues_forbid_delete_with_evidence BEFORE DELETE ON venues FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_evidence();
--> statement-breakpoint
-- Eintrag schreiben (nach dem Sperren des Zaehlers). actor_commitment = sha256(salt:user_id), wie src/server/evidence-write.ts (actorCommitment).
CREATE OR REPLACE FUNCTION evidence_write(p_match uuid, p_venue uuid, p_job uuid, p_round integer, p_kind text, p_actor uuid) RETURNS void AS $$
DECLARE
  v_id uuid;
  v_salt text;
  v_name text;
  v_email text;
  v_commit text := '';
BEGIN
  IF p_actor IS NOT NULL THEN
    -- einfacher Lesezugriff, keine Zeilensperre; ein geloeschtes oder anonymisiertes Konto (E-Mail geloescht-<id>@geloescht.invalid) bekommt KEINEN Actor (Loeschpflicht, Plan 14.1)
    SELECT name, email INTO v_name, v_email FROM users WHERE id = p_actor AND email NOT LIKE 'geloescht-%@geloescht.invalid';
    IF NOT FOUND THEN
      p_actor := NULL;
    END IF;
  END IF;
  IF p_actor IS NOT NULL THEN
    v_salt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
    v_commit := encode(sha256(convert_to(v_salt || ':' || p_actor::text, 'UTF8')), 'hex');
  END IF;
  INSERT INTO booking_evidence (match_id, venue_id, job_id, round, kind, actor_commitment)
    VALUES (p_match, p_venue, p_job, p_round, p_kind, v_commit)
    RETURNING id INTO v_id; -- der BEFORE-INSERT-Trigger setzt seq, prev_hash, at, hash
  IF p_actor IS NOT NULL THEN
    INSERT INTO evidence_actor (evidence_id, user_id, name, email, salt) VALUES (v_id, p_actor, v_name, v_email, v_salt);
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Anfragezeilen: Ereignis -> Art (Plan 13.2/14). Laeuft erst beim COMMIT (DEFERRABLE INITIALLY DEFERRED).
CREATE OR REPLACE FUNCTION evidence_hall_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_round integer;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
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

  PERFORM 1 FROM booking_evidence_counter WHERE id = 1 FOR UPDATE; -- Zaehler zuerst sperren, dann Existenz pruefen (R-T210)

  IF TG_OP = 'INSERT' THEN
    -- nur INSERT-Ereignisse eroeffnen eine Runde: dieselbe Transaktion = dieselbe Runde, sonst die naechste (Plan 14.4)
    SELECT round INTO v_round FROM booking_evidence
      WHERE match_id = NEW.match_id AND tx_id = txid_current() AND kind IN ('request_sent', 'unmanaged') LIMIT 1;
    IF v_round IS NULL THEN
      SELECT coalesce(max(round), 0) + 1 INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id;
    END IF;
  ELSE
    SELECT coalesce(max(round), 0) INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id;
  END IF;

  IF EXISTS (SELECT 1 FROM booking_evidence WHERE match_id = NEW.match_id AND venue_id = NEW.venue_id AND round = v_round AND kind = k) THEN
    RETURN NULL; -- schon vorhanden: still weiter, keine seq
  END IF;

  PERFORM evidence_write(NEW.match_id, NEW.venue_id, NULL, v_round, k, CASE WHEN k IN ('accepted', 'declined') THEN NEW.answered_by ELSE NULL END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_hall_requests_evidence_ins ON match_hall_requests;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER match_hall_requests_evidence_ins
  AFTER INSERT ON match_hall_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_hall_event();
--> statement-breakpoint
DROP TRIGGER IF EXISTS match_hall_requests_evidence_upd ON match_hall_requests;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER match_hall_requests_evidence_upd
  AFTER UPDATE ON match_hall_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION evidence_hall_event();
--> statement-breakpoint
-- Buchungsauftraege: Ereignis -> Art. in_progress und Updates ohne Statuswechsel erzeugen nichts.
CREATE OR REPLACE FUNCTION evidence_job_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_round integer;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
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
  PERFORM 1 FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;
  SELECT coalesce(max(round), 0) INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id; -- job_* tragen die aktuelle Runde
  PERFORM evidence_write(NEW.match_id, NEW.venue_id, NEW.id, v_round, k, NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_jobs_evidence_ins ON booking_jobs;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER booking_jobs_evidence_ins
  AFTER INSERT ON booking_jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_job_event();
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_jobs_evidence_upd ON booking_jobs;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER booking_jobs_evidence_upd
  AFTER UPDATE ON booking_jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION evidence_job_event();
--> statement-breakpoint
-- Stichtag fuer den Abgleich: ab hier erzeugen die Trigger Eintraege; Altbestand wird nicht nachgetragen (kein Backfill)
INSERT INTO settings (key, value) VALUES ('evidence_cutover_at', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- Abgleich (Tagesjob evidence-head, Plan 14.3/15.2): Zeilen im Endstatus OHNE passenden Protokolleintrag IN DER AKTUELLEN RUNDE (sonst gaelte ein Altrunden-Eintrag als vorhanden).
-- STICHTAG (Altbestand ohne Eintraege): nur Zeilen, die NACH der Migration entstanden sind (created_at >= Setting evidence_cutover_at); Altzeilen haben keine Eintraege (kein Backfill).
-- Ein Wechsel confirmed -> declined o. ae. erzeugt keinen Eintrag; so eine Zeile (declined MIT answered_at und accepted in der aktuellen Runde) gilt als ERWARTET. in_progress und geloeschte Zeilen sind ausgenommen.
CREATE OR REPLACE FUNCTION evidence_reconcile() RETURNS TABLE (src text, r_match uuid, r_venue uuid, r_job uuid, r_status text) AS $$
  WITH cur AS (SELECT e.match_id AS m, max(e.round) AS r FROM booking_evidence e GROUP BY e.match_id)
  SELECT 'hall'::text, h.match_id, h.venue_id, NULL::uuid, h.status::text
  FROM match_hall_requests h
  LEFT JOIN cur ON cur.m = h.match_id
  WHERE h.status IN ('pending', 'confirmed', 'declined', 'unmanaged')
    AND h.created_at >= coalesce((SELECT (value #>> '{}')::timestamptz FROM settings WHERE key = 'evidence_cutover_at'), '-infinity'::timestamptz)
    AND NOT EXISTS (
      SELECT 1 FROM booking_evidence e
      WHERE e.match_id = h.match_id AND e.venue_id = h.venue_id AND e.round = coalesce(cur.r, -1)
        AND (
          (h.status = 'pending' AND e.kind = 'request_sent')
          OR (h.status = 'confirmed' AND e.kind = 'accepted')
          OR (h.status = 'declined' AND e.kind IN ('declined', 'expired'))
          OR (h.status = 'declined' AND h.answered_at IS NOT NULL AND e.kind = 'accepted')
          OR (h.status = 'unmanaged' AND e.kind = 'unmanaged')
        )
    )
  UNION ALL
  SELECT 'job'::text, j.match_id, j.venue_id, j.id, j.status::text
  FROM booking_jobs j
  WHERE j.status::text <> 'in_progress'
    AND j.created_at >= coalesce((SELECT (value #>> '{}')::timestamptz FROM settings WHERE key = 'evidence_cutover_at'), '-infinity'::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM booking_evidence e WHERE e.job_id = j.id AND e.kind = 'job_' || j.status::text);
$$ LANGUAGE sql STABLE;
