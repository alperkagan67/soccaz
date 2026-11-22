# Entwurf: SQL des M3a-Umbaus (DEFERRABLE-Trigger), Plan 009 M3 v5

Status: **ENTWURF, nicht ausgeführt, nicht geprüft** (die lokale Datenbank ist gesperrt, NEEDS-USER). Nur Text zum Review; nicht in eine Migration kopieren, bevor der Spike (Plan 14.7) gelaufen ist. Stand 2026-11-22, worker-2. Gehört zu `docs/design/009-m3-plan.md` (Abschnitte 13 bis 15).

Der Umbau fließt in die **M3a-Migration** (noch nicht auf main; Journal-`when` > 1795357125760 der Migration 0051, endgültige Nummer 0052). Die Tabellen-Änderungen entstehen über `src/db/schema-finance.ts` und `drizzle-kit generate` (keine Handarbeit), die Funktionen und Trigger kommen wie bisher über das Nachbearbeitungsskript (`m3-sqlfix`) an die erzeugte Datei.

## A. Änderungen im Schema (drizzle, nicht SQL von Hand)
- `booking_evidence`: **keine** Fremdschlüssel `match_id`/`venue_id` (`.references(...)` entfällt); neue Spalte `tx_id bigint not null default txid_current()` (nicht im Hash); neue Indizes `booking_evidence_venue_idx (venue_id)` und `booking_evidence_job_idx (job_id)` (Guard und Abgleich, sonst Seq-Scans); optional `answer_kind` nur, wenn 14.3 es verlangt.
- `evidence_actor`: **kein** Fremdschlüssel `user_id` auf `users`.

## B. Guard gegen das Löschen von Spielen und Hallen mit Protokoll (Ersatz für RESTRICT)
```sql
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

CREATE TRIGGER matches_forbid_delete_with_evidence BEFORE DELETE ON matches FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_evidence();
CREATE TRIGGER venues_forbid_delete_with_evidence  BEFORE DELETE ON venues  FOR EACH ROW EXECUTE FUNCTION forbid_delete_with_evidence();
```
Liest ohne Zeilensperre (Plan 14.2: Restlücke, der Tagesjob meldet Verwaiste). Hinweis: `matches` wird bei Spielen mit `ON DELETE CASCADE` auf Teams/Nutzer gelöscht; das Löschen schlägt dann bewusst fehl, solange Einträge existieren (Test-Cleanup löscht Einträge vorher, siehe cleanup-Reihenfolge).

## C. Hilfsfunktion: Eintrag schreiben (nach dem Sperren des Zählers)
```sql
CREATE OR REPLACE FUNCTION evidence_write(
  p_match uuid, p_venue uuid, p_job uuid, p_round integer, p_kind text, p_actor uuid
) RETURNS void AS $$
DECLARE
  v_id uuid;
  v_salt text;
  v_name text;
  v_email text;
  v_commit text := '';
BEGIN
  IF p_actor IS NOT NULL THEN
    SELECT name, email INTO v_name, v_email FROM users WHERE id = p_actor;  -- einfacher Lesezugriff, keine Zeilensperre
    v_salt := encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
    v_commit := encode(sha256(convert_to(v_salt || ':' || p_actor::text, 'UTF8')), 'hex');
  END IF;
  INSERT INTO booking_evidence (match_id, venue_id, job_id, round, kind, actor_commitment)
    VALUES (p_match, p_venue, p_job, p_round, p_kind, v_commit)
    RETURNING id INTO v_id;                                                -- BEFORE-INSERT-Trigger setzt seq, prev_hash, at, hash
  IF p_actor IS NOT NULL THEN
    INSERT INTO evidence_actor (evidence_id, user_id, name, email, salt) VALUES (v_id, p_actor, v_name, v_email, v_salt);
  END IF;
END;
$$ LANGUAGE plpgsql;
```
`actor_commitment` muss wie in `src/server/evidence.ts` (`sha256(salt:user_id)`, UTF-8, hex) gerechnet werden; ein Test vergleicht beide Wege.

## D. Anfragezeilen (`match_hall_requests`)
```sql
CREATE OR REPLACE FUNCTION evidence_hall_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_round integer;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN RETURN NULL; END IF;  -- nur Test-Cleanup (Plan 14.3)

  IF TG_OP = 'INSERT' THEN
    k := CASE NEW.status WHEN 'pending' THEN 'request_sent' WHEN 'unmanaged' THEN 'unmanaged' ELSE NULL END;
  ELSE  -- UPDATE, nur bei geaendertem Status (WHEN-Bedingung am Trigger)
    IF OLD.status <> 'pending' THEN RETURN NULL; END IF;
    k := CASE NEW.status
           WHEN 'confirmed' THEN 'accepted'
           WHEN 'declined'  THEN CASE WHEN NEW.answered_at IS NULL THEN 'expired' ELSE 'declined' END
           WHEN 'unmanaged' THEN 'unmanaged'
           ELSE NULL END;
  END IF;
  IF k IS NULL THEN RETURN NULL; END IF;                              -- FRUEH zurueck, bevor der Zaehler gesperrt wird (Plan 14.5)

  PERFORM 1 FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;    -- Zaehler zuerst sperren, dann Existenz pruefen (R-T210)

  IF TG_OP = 'INSERT' THEN
    -- nur INSERT-Ereignisse eroeffnen eine Runde: gleiche Transaktion = gleiche Runde, sonst naechste
    SELECT round INTO v_round FROM booking_evidence
      WHERE match_id = NEW.match_id AND tx_id = txid_current() AND kind IN ('request_sent', 'unmanaged') LIMIT 1;
    IF v_round IS NULL THEN
      SELECT coalesce(max(round), 0) + 1 INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id;
    END IF;
  ELSE
    SELECT coalesce(max(round), 0) INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id;
  END IF;

  IF EXISTS (SELECT 1 FROM booking_evidence WHERE match_id = NEW.match_id AND venue_id = NEW.venue_id AND round = v_round AND kind = k) THEN
    RETURN NULL;                                                      -- schon vorhanden: still weiter, keine seq
  END IF;

  PERFORM evidence_write(NEW.match_id, NEW.venue_id, NULL, v_round, k, CASE WHEN k IN ('accepted', 'declined') THEN NEW.answered_by ELSE NULL END);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER match_hall_requests_evidence_ins
  AFTER INSERT ON match_hall_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_hall_event();
CREATE CONSTRAINT TRIGGER match_hall_requests_evidence_upd
  AFTER UPDATE ON match_hall_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION evidence_hall_event();
```
Offen im Spike (14.7): (1) wird das INSERT-Ereignis einer in derselben Transaktion gelöschten Zeile ausgeführt (Quelle: `trigger.c` holt `NEW` mit `SnapshotAny`, Plan 15.1); (2) `WHEN` bei Constraint-Triggern; (3) `PERFORM … FOR UPDATE` im Trigger beim COMMIT.

## E. Buchungsaufträge (`booking_jobs`)
```sql
CREATE OR REPLACE FUNCTION evidence_job_event() RETURNS trigger AS $$
DECLARE
  k text;
  v_round integer;
BEGIN
  IF coalesce(current_setting('socaz.ledger_maintenance', true), '') = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    k := 'job_open';
  ELSE
    k := CASE NEW.status
           WHEN 'booked' THEN 'job_booked' WHEN 'confirmed' THEN 'job_confirmed' WHEN 'unavailable' THEN 'job_unavailable'
           WHEN 'withdrawn' THEN 'job_withdrawn' WHEN 'done' THEN 'job_done' ELSE NULL END;   -- in_progress: kein Eintrag
  END IF;
  IF k IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM booking_evidence_counter WHERE id = 1 FOR UPDATE;
  SELECT coalesce(max(round), 0) INTO v_round FROM booking_evidence WHERE match_id = NEW.match_id;  -- job_* tragen die aktuelle Runde
  PERFORM evidence_write(NEW.match_id, NEW.venue_id, NEW.id, v_round, k, NULL);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER booking_jobs_evidence_ins
  AFTER INSERT ON booking_jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evidence_job_event();
CREATE CONSTRAINT TRIGGER booking_jobs_evidence_upd
  AFTER UPDATE ON booking_jobs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION evidence_job_event();
```
`createBookingJob` nutzt `ON CONFLICT DO NOTHING`: bei bestehendem Auftrag entsteht kein INSERT-Ereignis (Test 14.6). Job-Einträge sind nicht eindeutig (derselbe Wechsel kann wiederkehren).

## F. Abgleich (Job `evidence-head`, Plan 14.3 und 15)
```sql
-- fehlende Eintraege: Anfragezeilen
SELECT r.match_id, r.venue_id, r.status
FROM match_hall_requests r
WHERE r.status IN ('pending', 'confirmed', 'declined', 'unmanaged')
  AND NOT EXISTS (
    SELECT 1 FROM booking_evidence e
    WHERE e.match_id = r.match_id AND e.venue_id = r.venue_id
      AND e.kind = CASE r.status WHEN 'pending' THEN 'request_sent' WHEN 'confirmed' THEN 'accepted'
                                 WHEN 'declined' THEN 'declined' ELSE 'unmanaged' END
      OR (r.status = 'declined' AND e.kind = 'expired' AND e.match_id = r.match_id AND e.venue_id = r.venue_id));
-- fehlende Eintraege: Auftraege (open -> job_open, sonst job_<status>)
SELECT j.id, j.match_id, j.status
FROM booking_jobs j
WHERE j.status <> 'in_progress'
  AND NOT EXISTS (SELECT 1 FROM booking_evidence e WHERE e.job_id = j.id AND e.kind = 'job_' || j.status);
-- verwaiste Verweise (Plan 14.2)
SELECT e.seq FROM booking_evidence e LEFT JOIN matches m ON m.id = e.match_id WHERE m.id IS NULL;
SELECT e.seq FROM booking_evidence e LEFT JOIN venues  v ON v.id = e.venue_id WHERE e.venue_id IS NOT NULL AND v.id IS NULL;
```
Die Klammerung der ersten Abfrage ist im Entwurf bewusst grob (OR-Zweig für `expired`); im Bau als zwei getrennte `EXISTS` schreiben und testen. Zeilen, die ein Spiel inzwischen verlassen haben (gelöscht), fallen nicht unter den Abgleich.

## G. Zusätzliche Prüfungen für `scripts/migrate-check.mjs` (Plan 15 d)
Trigger je Tabelle (`match_hall_requests_evidence_ins/upd`, `booking_jobs_evidence_ins/upd`, jeweils `tgdeferrable` und `tginitdeferred` wahr, `tgconstraint` gesetzt), Guards (`matches_forbid_delete_with_evidence`, `venues_forbid_delete_with_evidence`), TRUNCATE-Trigger, Indizes `booking_evidence_venue_idx`/`booking_evidence_job_idx`, Funktionen `evidence_write`/`evidence_hall_event`/`evidence_job_event`, keine Fremdschlüssel an `booking_evidence`/`evidence_actor.user_id`.

## H. Reihenfolge im `tests/cleanup.ts`
`booking_evidence` (und `evidence_actor` per Kaskade) **vor** `matches` und `venues` löschen (Guards), unter der Wartungsausnahme (die Trigger auf `match_hall_requests`/`booking_jobs` schreiben dann keine Einträge); danach Zähler zurücksetzen, wenn die Tabelle leer ist. Worker-Datenbanken neu anlegen (die M3a-Migration hat sich geändert).
