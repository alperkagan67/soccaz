CREATE TABLE "booking_evidence_reason_text" (
	"evidence_id" uuid PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"salt" text NOT NULL,
	CONSTRAINT "booking_evidence_reason_text_len" CHECK (char_length("booking_evidence_reason_text"."reason") between 3 and 200)
);
--> statement-breakpoint
ALTER TABLE "booking_evidence" DROP CONSTRAINT "booking_evidence_kind_check";--> statement-breakpoint
DROP INDEX "booking_evidence_request_idx";--> statement-breakpoint
ALTER TABLE "booking_evidence" ALTER COLUMN "match_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "hash_version" smallint DEFAULT 1 NOT NULL; -- Altzeilen (0052) = Version 1; der Spaltenstandard wird danach auf 2 gesetzt (Plan 16f.5)--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "subject" text DEFAULT 'match' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "tournament_id" uuid;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "reason_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "reason_commitment" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "statement_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD COLUMN "enforced" boolean;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "venue_confirmed_by" uuid;--> statement-breakpoint
ALTER TABLE "match_hall_requests" ADD COLUMN "reply_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_hall_requests" ADD COLUMN "decision_statement_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match_hall_requests" ADD COLUMN "decision_enforced" boolean;--> statement-breakpoint
ALTER TABLE "booking_evidence_reason_text" ADD CONSTRAINT "booking_evidence_reason_text_evidence_id_booking_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."booking_evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_tournament_unique_idx" ON "booking_evidence" USING btree ("tournament_id","venue_id","round","kind") WHERE "booking_evidence"."subject" = 'tournament';--> statement-breakpoint
CREATE INDEX "booking_evidence_tournament_idx" ON "booking_evidence" USING btree ("tournament_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_evidence_request_idx" ON "booking_evidence" USING btree ("match_id","venue_id","round","kind") WHERE "booking_evidence"."subject" = 'match' and "booking_evidence"."kind" in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired', 'late_attempt');--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_tournament_kind_check" CHECK ("booking_evidence"."subject" = 'match' or "booking_evidence"."kind" = 'accepted');--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_subject_xor" CHECK (("booking_evidence"."subject" = 'match' and "booking_evidence"."match_id" is not null and "booking_evidence"."tournament_id" is null) or ("booking_evidence"."subject" = 'tournament' and "booking_evidence"."tournament_id" is not null and "booking_evidence"."match_id" is null));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_hash_version_check" CHECK ("booking_evidence"."hash_version" in (1, 2));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_v1_check" CHECK ("booking_evidence"."hash_version" <> 1 or ("booking_evidence"."subject" = 'match' and "booking_evidence"."match_id" is not null and "booking_evidence"."reason_code" = '' and "booking_evidence"."reason_commitment" = '' and "booking_evidence"."deadline_at" is null and "booking_evidence"."decided_at" is null and "booking_evidence"."statement_at" is null and "booking_evidence"."enforced" is null and "booking_evidence"."kind" <> 'late_attempt'));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_v2_check" CHECK ("booking_evidence"."hash_version" <> 2 or "booking_evidence"."reason" is null);--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_reason_code_check" CHECK ("booking_evidence"."reason_code" in ('', 'belegt', 'wartung', 'veranstaltung', 'sonstiges'));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_match_deadline_check" CHECK ("booking_evidence"."hash_version" <> 2 or "booking_evidence"."subject" <> 'match' or "booking_evidence"."kind" not in ('accepted', 'declined') or "booking_evidence"."enforced" is not true or ("booking_evidence"."deadline_at" is not null and "booking_evidence"."decided_at" is not null and "booking_evidence"."decided_at" <= "booking_evidence"."deadline_at" and ("booking_evidence"."kind" <> 'declined' or "booking_evidence"."reason_code" <> '')));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_tournament_deadline_check" CHECK ("booking_evidence"."subject" <> 'tournament' or ("booking_evidence"."decided_at" is not null and "booking_evidence"."deadline_at" is null));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_late_check" CHECK ("booking_evidence"."kind" <> 'late_attempt' or ("booking_evidence"."deadline_at" is not null and "booking_evidence"."decided_at" is not null and "booking_evidence"."decided_at" > "booking_evidence"."deadline_at"));--> statement-breakpoint
ALTER TABLE "booking_evidence" ADD CONSTRAINT "booking_evidence_kind_check" CHECK ("booking_evidence"."kind" in ('request_sent', 'unmanaged', 'accepted', 'declined', 'expired', 'late_attempt', 'job_open', 'job_booked', 'job_confirmed', 'job_unavailable', 'job_withdrawn', 'job_done'));--> statement-breakpoint
-- Altdaten bereinigen (Plan 16f.2), BEVOR die CHECKs und die Trigger auf tournaments angelegt werden; Anzahl wird protokolliert (NOTICE der Migration)
DO $$
DECLARE n_a integer; n_b integer;
BEGIN
  SELECT count(*) INTO n_a FROM tournaments WHERE venue_confirmed_at IS NOT NULL AND venue_id IS NULL;
  UPDATE tournaments SET venue_confirmed_at = NULL WHERE venue_confirmed_at IS NOT NULL AND venue_id IS NULL;
  SELECT count(*) INTO n_b FROM tournaments WHERE venue_confirmed_by IS NOT NULL AND venue_confirmed_at IS NULL;
  UPDATE tournaments SET venue_confirmed_by = NULL WHERE venue_confirmed_by IS NOT NULL AND venue_confirmed_at IS NULL;
  RAISE NOTICE 'Migration 0054: % Turniere ohne Halle: Zusage zurueckgesetzt; % Turniere: venue_confirmed_by bereinigt', n_a, n_b;
END $$;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_confirmed_needs_venue" CHECK ("tournaments"."venue_confirmed_at" is null or "tournaments"."venue_id" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_confirmed_by_needs_confirmed" CHECK ("tournaments"."venue_confirmed_by" is null or "tournaments"."venue_confirmed_at" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "tournaments" VALIDATE CONSTRAINT "tournaments_confirmed_needs_venue";--> statement-breakpoint
ALTER TABLE "tournaments" VALIDATE CONSTRAINT "tournaments_confirmed_by_needs_confirmed";--> statement-breakpoint
ALTER TABLE "booking_evidence" ALTER COLUMN "hash_version" SET DEFAULT 2;
--> statement-breakpoint
-- ===== Hash Version 2 (Plan 16b.1, 16c.1, 16g.2, 16h.1): evidence_hash (Version 1, 10 Argumente) bleibt EINGEFROREN und unveraendert =====
-- Feldliste v2 FINAL: v2, subject, seq, match_id, tournament_id, venue_id, round, job_id, kind, reason_code, reason_commitment, at, actor_commitment, prev_hash, deadline_at, decided_at, statement_at, enforced.
-- Kodierung: je Teil "<Bytes UTF-8>:<Text>;"; NULL = leerer Teil (0:;); Zeiten UTC mit Mikrosekunden (YYYY-MM-DDTHH24:MI:SS.US Z); enforced '1' / '0' / ''.
-- Alle Teile coalesce: nie ein NULL-Hash. JS-Gegenstueck: scripts/lib/evidence-chain.mjs (evidenceHash2).
CREATE OR REPLACE FUNCTION evidence_ts(p timestamptz) RETURNS text AS $$
  SELECT CASE WHEN p IS NULL THEN '' ELSE to_char(p AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_hash2(
  p_subject text, p_seq integer, p_match_id uuid, p_tournament_id uuid, p_venue_id uuid, p_round integer, p_job_id uuid, p_kind text,
  p_reason_code text, p_reason_commitment text, p_at timestamptz, p_actor_commitment text, p_prev_hash text,
  p_deadline_at timestamptz, p_decided_at timestamptz, p_statement_at timestamptz, p_enforced boolean
) RETURNS text AS $$
DECLARE
  parts text[];
  part text;
  buf text := '';
BEGIN
  parts := ARRAY[
    'v2',
    coalesce(p_subject, ''),
    coalesce(p_seq::text, ''),
    coalesce(p_match_id::text, ''),
    coalesce(p_tournament_id::text, ''),
    coalesce(p_venue_id::text, ''),
    coalesce(p_round::text, ''),
    coalesce(p_job_id::text, ''),
    coalesce(p_kind, ''),
    coalesce(p_reason_code, ''),
    coalesce(p_reason_commitment, ''),
    evidence_ts(p_at),
    coalesce(p_actor_commitment, ''),
    coalesce(p_prev_hash, ''),
    evidence_ts(p_deadline_at),
    evidence_ts(p_decided_at),
    evidence_ts(p_statement_at),
    CASE WHEN p_enforced IS NULL THEN '' WHEN p_enforced THEN '1' ELSE '0' END
  ];
  FOREACH part IN ARRAY parts LOOP
    buf := buf || octet_length(convert_to(part, 'UTF8'))::text || ':' || part || ';';
  END LOOP;
  RETURN encode(sha256(convert_to(buf, 'UTF8')), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
-- Zentrale Hash-Auswahl nach hash_version (Pruefer-SQL und INSERT-Trigger nutzen sie): unbekannte Version = Fehler, KEIN stilles Zurueckfallen auf Version 1 (Plan 16e.4).
CREATE OR REPLACE FUNCTION evidence_hash_of(e booking_evidence) RETURNS text AS $$
BEGIN
  IF e.hash_version = 1 THEN
    IF e.match_id IS NULL THEN
      RAISE EXCEPTION 'hash_version 1 verlangt match_id (Eintrag %).', e.id;
    END IF;
    RETURN evidence_hash(e.seq, e.match_id, e.venue_id, e.round, e.job_id, e.kind, e.reason, e.at, e.actor_commitment, e.prev_hash);
  ELSIF e.hash_version = 2 THEN
    RETURN evidence_hash2(e.subject, e.seq, e.match_id, e.tournament_id, e.venue_id, e.round, e.job_id, e.kind, e.reason_code, e.reason_commitment,
                          e.at, e.actor_commitment, e.prev_hash, e.deadline_at, e.decided_at, e.statement_at, e.enforced);
  END IF;
  RAISE EXCEPTION 'unbekannte hash_version % (Eintrag %).', e.hash_version, e.id;
END;
$$ LANGUAGE plpgsql STABLE;
--> statement-breakpoint
-- INSERT-Trigger: wie 0052, aber Hash nach hash_version; Version 1 nur unter der Wartungsausnahme (Plan 16f.5); NEW.at setzt der Trigger (clock_timestamp), Werte der Anwendung werden ueberschrieben.
CREATE OR REPLACE FUNCTION booking_evidence_before_insert() RETURNS trigger AS $$
DECLARE
  c booking_evidence_counter%ROWTYPE;
BEGIN
  IF NEW.hash_version = 1 AND coalesce(current_setting('socaz.ledger_maintenance', true), '') <> 'on' THEN
    RAISE EXCEPTION 'hash_version 1 ist nur unter der Wartungsausnahme erlaubt (neue Eintraege sind Version 2).';
  END IF;
  IF NEW.hash_version NOT IN (1, 2) THEN
    RAISE EXCEPTION 'unbekannte hash_version %.', NEW.hash_version;
  END IF;
  SELECT * INTO c FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_evidence_counter fehlt';
  END IF;
  NEW.seq := c.last_seq + 1;
  NEW.prev_hash := c.last_hash;
  NEW.at := clock_timestamp();
  NEW.hash := evidence_hash_of(NEW);
  PERFORM set_config('socaz.evidence_insert', 'on', true);
  UPDATE booking_evidence_counter SET last_seq = NEW.seq, last_hash = NEW.hash WHERE id = 1;
  PERFORM set_config('socaz.evidence_insert', 'off', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
