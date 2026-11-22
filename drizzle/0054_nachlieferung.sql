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
--> statement-breakpoint
-- ===== Teil 2: Einstellungen, Schalter, Schreib-/Trigger-Funktionen (Plan 16b bis 16h). UNGETESTET gegen die Datenbank (Stand: lokal ohne Datenbank geschrieben). =====
-- Fehlercodes (SQLSTATE) fuer die App: EV001 Antwortfrist abgelaufen, EV002 Begruendung fehlt/ungueltig (Fehlertext enthaelt NIE den Freitext), EV003 Frist fehlt, EV004 kein Hallenzugang.
-- Deadlock-Regel (Plan 16e.6): ausser FOR UPDATE auf booking_evidence_counter in diesem Teil KEINE Zeilensperre (nur reine SELECTs auf matches, Fachzeilen, users, venue_access).

-- Einstellungen lesen (Text) und Schalter (fail-closed: alles ausser genau 'off' gilt als 'on', Plan 16g.1)
CREATE OR REPLACE FUNCTION evidence_setting(p_key text) RETURNS text AS $$
  SELECT value #>> '{}' FROM settings WHERE key = p_key
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidence_enforced() RETURNS boolean AS $$
  SELECT lower(coalesce(nullif(evidence_setting('evidence_enforcement'), ''), 'on')) <> 'off'
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
INSERT INTO settings (key, value) VALUES ('evidence_enforcement', to_jsonb('off'::text)) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO settings (key, value) VALUES ('evidence_clock_source', to_jsonb('js'::text)) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO settings (key, value) VALUES ('evidence_reason_retention_days', to_jsonb('0'::text)) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO settings (key, value) VALUES ('evidence_tournament_cutover_at', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- Schreibschutz der evidence_*-Einstellungen (Plan 16g.1): nur ueber evidence_set_setting (transaktionslokaler Marker) oder unter der Wartungsausnahme; Werte werden geprueft.
-- Grenze: kein Schutz gegen jeden mit SQL-Zugriff (G25-009), Verteidigung in der Tiefe.
CREATE OR REPLACE FUNCTION evidence_settings_guard() RETURNS trigger AS $$
DECLARE
  k text := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  v text;
BEGIN
  IF k NOT LIKE 'evidence\_%' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') <> 'on' AND coalesce(current_setting('socaz.evidence_setting_write', true), '') <> 'on' THEN
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
DROP TRIGGER IF EXISTS settings_evidence_guard ON settings;
--> statement-breakpoint
CREATE TRIGGER settings_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON settings FOR EACH ROW EXECUTE FUNCTION evidence_settings_guard();
--> statement-breakpoint
-- Aenderung nur ueber diese Funktion: Akteur Pflicht (nie NULL), Pflicht-Eintrag in audit_log, 'on' nur bei evidence_clock_source = 'db' (Plan 16g.5).
CREATE OR REPLACE FUNCTION evidence_set_setting(p_key text, p_value text, p_actor uuid, p_reason text) RETURNS void AS $$
DECLARE
  v_old text;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'evidence_set_setting braucht einen Akteur.';
  END IF;
  IF p_key NOT IN ('evidence_enforcement', 'evidence_clock_source', 'evidence_reason_retention_days', 'evidence_cutover_at', 'evidence_tournament_cutover_at') THEN
    RAISE EXCEPTION 'unbekannte evidence-Einstellung %.', p_key;
  END IF;
  IF p_key = 'evidence_enforcement' AND p_value = 'on' AND coalesce(evidence_setting('evidence_clock_source'), 'js') <> 'db' THEN
    RAISE EXCEPTION 'Durchsetzung erst einschalten, wenn evidence_clock_source = db (011 M2a).';
  END IF;
  v_old := evidence_setting(p_key);
  PERFORM set_config('socaz.evidence_setting_write', 'on', true);
  INSERT INTO settings (key, value, updated_at, updated_by) VALUES (p_key, to_jsonb(p_value), now(), p_actor)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = p_actor;
  PERFORM set_config('socaz.evidence_setting_write', 'off', true);
  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
    VALUES (p_actor, 'evidence_setting', 'settings', p_key, jsonb_build_object('value', v_old), jsonb_build_object('value', p_value, 'reason', p_reason));
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Bereinigung des Freitexts (Quelle der Wahrheit, Plan 16b.2/16f.10): Steuer-, Bidi- und Zero-Width-Zeichen (aufgezaehlt, PG-Regex kennt kein \p{Cf}) entfernen, Leerraum zusammenfassen, trimmen. KEIN Kuerzen:
-- evidence_check_reason lehnt zu lange Texte ab. char_length zaehlt Codepunkte (JS: Array.from).
CREATE OR REPLACE FUNCTION evidence_clean_reason(p text) RETURNS text AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p, ''), '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏  ‪-‮⁠-⁤⁦-⁩﻿]', '', 'g'),
        '[ \t]+', ' ', 'g'),
      '\n{3,}', E'\n\n', 'g'),
    '^\s+|\s+$', '', 'g')
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Prueft Code und Text (Plan 16b.2): Code aus der Liste; Text leer oder 3 bis 200 Zeichen; 'sonstiges' verlangt Text. Gibt den bereinigten Text zurueck. Fehlertext ohne Freitext.
CREATE OR REPLACE FUNCTION evidence_check_reason(p_code text, p_reason text, p_require_code boolean) RETURNS text AS $$
DECLARE
  v_text text := evidence_clean_reason(p_reason);
  v_code text := coalesce(p_code, '');
BEGIN
  IF v_code NOT IN ('', 'belegt', 'wartung', 'veranstaltung', 'sonstiges') THEN
    RAISE EXCEPTION 'Ablehnungsgrund ungueltig.' USING ERRCODE = 'EV002';
  END IF;
  IF p_require_code AND v_code = '' THEN
    RAISE EXCEPTION 'Ablehnung braucht einen Grund (Kategorie).' USING ERRCODE = 'EV002';
  END IF;
  IF v_text <> '' AND char_length(v_text) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Begruendung muss 3 bis 200 Zeichen haben (Laenge %).', char_length(v_text) USING ERRCODE = 'EV002';
  END IF;
  IF p_require_code AND v_code = 'sonstiges' AND v_text = '' THEN
    RAISE EXCEPTION 'Grund "sonstiges" braucht eine Begruendung.' USING ERRCODE = 'EV002';
  END IF;
  RETURN v_text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
-- Sitzungswert-Name je Zeile (Plan 16d.2): socaz.<prefix>.r<md5(m:match:venue)>; <= 60 Zeichen. Leer = fehlt (nullif, Plan 16e.5).
CREATE OR REPLACE FUNCTION evidence_session_key(p_prefix text, p_match uuid, p_venue uuid) RETURNS text AS $$
  SELECT 'socaz.' || p_prefix || '.r' || md5('m:' || p_match::text || ':' || p_venue::text)
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Aktiver Hallenzugang wie hasVenueAccess (venue-access-rules.ts): venue_access aktiv, Konto nicht gesperrt, keine Admin-Rolle.
CREATE OR REPLACE FUNCTION evidence_has_venue_access(p_venue uuid, p_user uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM venue_access va JOIN users u ON u.id = va.user_id
    WHERE va.venue_id = p_venue AND va.user_id = p_user AND va.status = 'active' AND u.banned_at IS NULL AND u.role <> 'admin'
  )
$$ LANGUAGE sql STABLE;
--> statement-breakpoint
-- Alte Schreibfunktion (6 Argumente) und alter Abgleich (andere Rueckgabespalten) fallen weg: genau eine Funktion je Name (Plan 16e.7).
DROP FUNCTION IF EXISTS evidence_write(uuid, uuid, uuid, integer, text, uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS evidence_reconcile();
--> statement-breakpoint
-- Unterste Ebene: nur INSERT + Nebentabellen (Plan 16e.10). actor_commitment = sha256(salt:user_id); Freitext: Commitment sha256(salt:text) im Datensatz, Klartext in booking_evidence_reason_text.
CREATE OR REPLACE FUNCTION evidence_write(
  p_subject text, p_match uuid, p_tournament uuid, p_venue uuid, p_job uuid, p_round integer, p_kind text, p_actor uuid,
  p_reason text, p_reason_code text, p_deadline timestamptz, p_decided timestamptz, p_statement_at timestamptz, p_enforced boolean
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_salt text;
  v_name text;
  v_email text;
  v_commit text := '';
  v_reason text := '';
  v_rsalt text;
  v_rcommit text := '';
BEGIN
  IF p_actor IS NOT NULL THEN
    -- einfacher Lesezugriff ohne Zeilensperre; geloeschtes/anonymisiertes Konto bekommt KEINEN Actor (Plan 14.1)
    SELECT name, email INTO v_name, v_email FROM users WHERE id = p_actor AND email NOT LIKE 'geloescht-%@geloescht.invalid';
    IF NOT FOUND THEN
      p_actor := NULL;
    END IF;
  END IF;
  IF p_actor IS NOT NULL THEN
    v_salt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
    v_commit := encode(sha256(convert_to(v_salt || ':' || p_actor::text, 'UTF8')), 'hex');
  END IF;
  IF coalesce(p_reason, '') <> '' THEN
    v_reason := evidence_check_reason(p_reason_code, p_reason, false);
    IF v_reason <> '' THEN
      v_rsalt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
      v_rcommit := encode(sha256(convert_to(v_rsalt || ':' || v_reason, 'UTF8')), 'hex');
    END IF;
  END IF;
  INSERT INTO booking_evidence (hash_version, subject, match_id, tournament_id, venue_id, job_id, round, kind, actor_commitment, reason_code, reason_commitment, deadline_at, decided_at, statement_at, enforced)
    VALUES (2, p_subject, p_match, p_tournament, p_venue, p_job, p_round, p_kind, v_commit, coalesce(p_reason_code, ''), v_rcommit, p_deadline, p_decided, p_statement_at, p_enforced)
    RETURNING id INTO v_id; -- der BEFORE-INSERT-Trigger setzt seq, prev_hash, at, hash
  IF p_actor IS NOT NULL THEN
    INSERT INTO evidence_actor (evidence_id, user_id, name, email, salt) VALUES (v_id, p_actor, v_name, v_email, v_salt);
  END IF;
  IF v_reason <> '' THEN
    INSERT INTO booking_evidence_reason_text (evidence_id, reason, salt) VALUES (v_id, v_reason, v_rsalt);
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Eintrag erzeugen (Plan 16e.10, mit p_enforced am Ende, Plan 16h.1): sperrt den Zaehler ZUERST, bestimmt die Runde je Betreff, prueft die Einmaligkeit, schreibt ueber evidence_write. Gibt NULL zurueck, wenn schon vorhanden.
-- p_round_mode: 'open' (neue Runde, tx_id-Regel, Spiel-Anfragen), 'current' (max(round) des Betreffs), 'accepted_count' (1 + bisherige accepted, Turnier-Zusage). Der Betreff ist Parameter (TG_TABLE_NAME nur in den Trigger-Huellen).
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
-- Sofort-Trigger auf match_hall_requests (BEFORE INSERT OR UPDATE, Plan 16g.3/16g.4): setzt reply_deadline, decision_statement_at und decision_enforced IMMER selbst (Werte der Anwendung werden verworfen);
-- nach dem Setzen unveraenderlich (spaetere UPDATEs uebernehmen OLD). Liest matches.veto_turn_deadline per reinem SELECT (Aufrufer halten das FOR UPDATE des Spiels).
-- Pflichtpruefung und Frist-RAISE NUR im Antwortpfad (answered_at gesetzt) und nur bei eingeschalteter Durchsetzung; der Ablauf (declined ohne answered_at, settleHallCheck) wird nur festgehalten.
CREATE OR REPLACE FUNCTION evidence_hall_before() RETURNS trigger AS $$
DECLARE
  v_enf boolean;
  v_code text;
  v_text text;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
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
DROP TRIGGER IF EXISTS match_hall_requests_evidence_before ON match_hall_requests;
--> statement-breakpoint
CREATE TRIGGER match_hall_requests_evidence_before BEFORE INSERT OR UPDATE ON match_hall_requests FOR EACH ROW EXECUTE FUNCTION evidence_hall_before();
--> statement-breakpoint
-- Aufgeschobener Trigger der Anfragezeilen (laeuft beim COMMIT): liest NEW (Frist/Anweisungszeit/Schalterstand reisen im Ereignis-Tupel) und den Sitzungswert von Code und Text; decided_at = transaction_timestamp().
CREATE OR REPLACE FUNCTION evidence_hall_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_code text := '';
  v_text text := NULL;
  v_decided timestamptz := NULL;
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
    CASE WHEN k IN ('request_sent', 'unmanaged') THEN 'open' ELSE 'current' END,
    CASE WHEN k IN ('accepted', 'declined') THEN NEW.answered_by ELSE NULL END,
    v_code, v_text,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.reply_deadline ELSE NULL END, v_decided,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.decision_statement_at ELSE NULL END,
    CASE WHEN k IN ('accepted', 'declined', 'expired') THEN NEW.decision_enforced ELSE NULL END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Buchungsauftraege (Plan 16h.1 (b)): statement_at und enforced leer; job_* tragen die aktuelle Runde. Laeuft ueber evidence_job_event, NICHT ueber den Antwort-Trigger (Plan 16h.4).
CREATE OR REPLACE FUNCTION evidence_job_event() RETURNS trigger AS $$
DECLARE
  k text;
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
  PERFORM evidence_emit('match', NEW.match_id, NULL, NEW.venue_id, NEW.id, k, 'current', NULL, '', NULL, NULL, NULL, NULL, NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Antwortversuch nach Fristende (Plan 16b.4, 16e.1, 16h.1 (d)): prueft Zugang (Verteidigung in der Tiefe, G25-009), Zeile der aktuellen Runde noch pending ODER vom Ablauf entschieden (declined ohne answered_at),
-- Frist abgelaufen (DB-Zeit), Einmaligkeit. Nur reine SELECTs (keine Zeilensperre). Gibt true zurueck, wenn ein Eintrag entstand, false wenn schon vorhanden.
CREATE OR REPLACE FUNCTION evidence_late_attempt(p_match uuid, p_venue uuid, p_actor uuid) RETURNS boolean AS $$
DECLARE
  h match_hall_requests%ROWTYPE;
  v_deadline timestamptz;
  v_round integer;
  v_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT evidence_has_venue_access(p_venue, p_actor) THEN
    RAISE EXCEPTION 'Kein Hallenzugang fuer den Antwortversuch.' USING ERRCODE = 'EV004';
  END IF;
  SELECT * INTO h FROM match_hall_requests WHERE match_id = p_match AND venue_id = p_venue;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Keine Hallenanfrage fuer Spiel und Halle.';
  END IF;
  IF NOT (h.status = 'pending' OR (h.status = 'declined' AND h.answered_at IS NULL)) THEN
    RAISE EXCEPTION 'Anfrage ist nicht mehr offen (vom Betreiber beantwortet).';
  END IF;
  SELECT max(round) INTO v_round FROM booking_evidence WHERE subject = 'match' AND match_id = p_match;
  IF v_round IS NULL THEN
    RAISE EXCEPTION 'Kein Beweisprotokoll-Eintrag zum Spiel.';
  END IF;
  SELECT coalesce(h.reply_deadline, (SELECT veto_turn_deadline FROM matches WHERE id = p_match)) INTO v_deadline;
  IF v_deadline IS NULL OR transaction_timestamp() <= v_deadline THEN
    RAISE EXCEPTION 'Antwortfrist noch nicht abgelaufen.';
  END IF;
  v_id := evidence_emit('match', p_match, NULL, p_venue, NULL, 'late_attempt', 'current', p_actor, '', NULL, v_deadline, transaction_timestamp(), clock_timestamp(), evidence_enforced());
  RETURN v_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Turnier-Zusage (Plan 16c.2, 16f.8, 16h.1 (c)): AFTER-Trigger (DEFERRABLE) auf dem Uebergang venue_confirmed_at NULL -> Wert. Actor nur bei aktivem Hallenzugang (sonst weggelassen).
CREATE OR REPLACE FUNCTION evidence_tournament_event() RETURNS trigger AS $$
DECLARE
  v_actor uuid := NULL;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
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
DROP TRIGGER IF EXISTS tournaments_evidence_ins ON tournaments;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER tournaments_evidence_ins
  AFTER INSERT ON tournaments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.venue_confirmed_at IS NOT NULL) EXECUTE FUNCTION evidence_tournament_event();
--> statement-breakpoint
DROP TRIGGER IF EXISTS tournaments_evidence_upd ON tournaments;
--> statement-breakpoint
-- gewoehnlicher AFTER UPDATE mit WHEN, NICHT "OF venue_confirmed_at" (Plan 16e.9)
CREATE CONSTRAINT TRIGGER tournaments_evidence_upd
  AFTER UPDATE ON tournaments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.venue_confirmed_at IS NULL AND NEW.venue_confirmed_at IS NOT NULL) EXECUTE FUNCTION evidence_tournament_event();
--> statement-breakpoint
-- Hallenwechsel setzt die Zusage zurueck (Plan 16d.7/16f.9): WHEN-frei, weil der Trigger auch INSERT bedient; venue_confirmed_at NULL => venue_confirmed_by NULL.
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
DROP TRIGGER IF EXISTS tournaments_reset_confirmation ON tournaments;
--> statement-breakpoint
CREATE TRIGGER tournaments_reset_confirmation BEFORE INSERT OR UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION tournaments_reset_confirmation();
--> statement-breakpoint
-- Loeschschutz (Plan 16d.3): Spiele mit Eintraegen (wie 0052) UND Turniere mit accepted-Eintrag; Wartungsausnahme wie bisher.
CREATE OR REPLACE FUNCTION forbid_delete_with_evidence() RETURNS trigger AS $$
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN
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
DROP TRIGGER IF EXISTS tournaments_forbid_delete_with_evidence ON tournaments;
--> statement-breakpoint
CREATE TRIGGER tournaments_forbid_delete_with_evidence BEFORE DELETE ON tournaments FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_evidence();
--> statement-breakpoint
-- Altzeilen Version 1 mit Klartext in booking_evidence.reason (Plan 16b.1): bleiben, markiert; fuer den R3-Eintrag.
CREATE OR REPLACE VIEW evidence_legacy_plaintext AS
  SELECT id, seq, match_id, venue_id, kind FROM booking_evidence WHERE hash_version = 1 AND reason IS NOT NULL;
--> statement-breakpoint
-- Abgleich (Plan 14.3, 16c.3, 16e.2, 16f.9): neue Rueckgabespalten (Betreff, Turnier). Stichtage: Spiele evidence_cutover_at, Turniere evidence_tournament_cutover_at.
-- Hall: wie 0052; Turnier: venue_confirmed_at gesetzt (ab Stichtag) braucht accepted fuer SEINE venue_id UND die aktuelle Runde; early_expiry: expired mit decided_at <= deadline_at (Befund statt harter CHECK).
CREATE OR REPLACE FUNCTION evidence_reconcile() RETURNS TABLE (src text, r_subject text, r_match uuid, r_tournament uuid, r_venue uuid, r_job uuid, r_status text) AS $$
  WITH cur AS (SELECT e.match_id AS m, max(e.round) AS r FROM booking_evidence e WHERE e.subject = 'match' GROUP BY e.match_id)
  SELECT 'hall'::text, 'match'::text, h.match_id, NULL::uuid, h.venue_id, NULL::uuid, h.status::text
  FROM match_hall_requests h
  LEFT JOIN cur ON cur.m = h.match_id
  WHERE h.status IN ('pending', 'confirmed', 'declined', 'unmanaged')
    AND h.created_at >= coalesce((SELECT (value #>> '{}')::timestamptz FROM settings WHERE key = 'evidence_cutover_at'), '-infinity'::timestamptz)
    AND NOT EXISTS (
      SELECT 1 FROM booking_evidence e
      WHERE e.subject = 'match' AND e.match_id = h.match_id AND e.venue_id = h.venue_id AND e.round = coalesce(cur.r, -1)
        AND (
          (h.status = 'pending' AND e.kind = 'request_sent')
          OR (h.status = 'confirmed' AND e.kind = 'accepted')
          OR (h.status = 'declined' AND e.kind IN ('declined', 'expired'))
          OR (h.status = 'declined' AND h.answered_at IS NOT NULL AND e.kind = 'accepted')
          OR (h.status = 'unmanaged' AND e.kind = 'unmanaged')
        )
    )
  UNION ALL
  SELECT 'job'::text, 'match'::text, j.match_id, NULL::uuid, j.venue_id, j.id, j.status::text
  FROM booking_jobs j
  WHERE j.status::text <> 'in_progress'
    AND j.created_at >= coalesce((SELECT (value #>> '{}')::timestamptz FROM settings WHERE key = 'evidence_cutover_at'), '-infinity'::timestamptz)
    AND NOT EXISTS (SELECT 1 FROM booking_evidence e WHERE e.job_id = j.id AND e.kind = 'job_' || j.status::text)
  UNION ALL
  SELECT 'tournament'::text, 'tournament'::text, NULL::uuid, t.id, t.venue_id, NULL::uuid, 'confirmed'::text
  FROM tournaments t
  WHERE t.venue_confirmed_at IS NOT NULL
    AND t.venue_confirmed_at >= coalesce((SELECT (value #>> '{}')::timestamptz FROM settings WHERE key = 'evidence_tournament_cutover_at'), '-infinity'::timestamptz)
    AND NOT EXISTS (
      SELECT 1 FROM booking_evidence e
      WHERE e.subject = 'tournament' AND e.tournament_id = t.id AND e.venue_id = t.venue_id AND e.kind = 'accepted'
        AND e.round = (SELECT max(e2.round) FROM booking_evidence e2 WHERE e2.subject = 'tournament' AND e2.tournament_id = t.id)
    )
  UNION ALL
  SELECT 'early_expiry'::text, e.subject, e.match_id, e.tournament_id, e.venue_id, NULL::uuid, 'expired'::text
  FROM booking_evidence e
  WHERE e.kind = 'expired' AND e.deadline_at IS NOT NULL AND e.decided_at IS NOT NULL AND e.decided_at <= e.deadline_at;
$$ LANGUAGE sql STABLE;
