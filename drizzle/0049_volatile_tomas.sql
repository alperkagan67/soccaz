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
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_actor" ADD CONSTRAINT "evidence_actor_evidence_id_booking_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."booking_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_actor" ADD CONSTRAINT "evidence_actor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_seq_idx" ON "booking_evidence" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_request_idx" ON "booking_evidence" USING btree ("match_id","venue_id","round","kind") WHERE "booking_evidence"."kind" in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE INDEX "booking_evidence_match_idx" ON "booking_evidence" USING btree ("match_id","seq");
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
