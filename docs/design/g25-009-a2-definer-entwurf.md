# G25-009 A2: Definer-Umstellung, Marker-Härtung, Entzug und URL-Wechsel (ENTWURF v2, nicht anwenden)

Status: **PLAN/ENTWURF v2** (worker-1, 2026-11-24; v2 nach security-Review REVIEW-CHANGES zu #308). Keine Migration unter `drizzle/`, nichts angewendet. Bau erst nach erneutem Review (security-reviewer Pflicht, w3); **Anwendung in Produktion** erst nach dem Hoster-Spike (NEEDS-USER). Bezug: `g25-009-db-rollenmodell.md` Abschnitte 5, 8, 10; Backlog 228 (1) und (2); GO-LIVE-AUDIT G25-009 und G25-009-B.

## 1. Ist (gelesen aus dem Repo)
- `evidence_set_setting(text,text,uuid,text)` und `evidence_late_attempt(uuid,uuid,uuid)` (0054) sind `LANGUAGE plpgsql`, **SECURITY INVOKER**, ohne festen `search_path`.
- Die Marker `socaz.evidence_insert` und `socaz.evidence_setting_write` werden **nicht** von `evidence_write`, sondern von `booking_evidence_before_insert()` (0052/0054/0055) und `evidence_set_setting` (0054) gesetzt (Korrektur zu Entwurf v1); die Restore-Funktionen setzen `socaz.evidence_restore`/`_pending` (nur unter der Wartungsausnahme). Der bestehende Katalogtest `tests/integration/maintenance-role.test.ts` (ca. Zeile 187) belegt die Menge der Funktionen mit Marker im Quelltext und dass heute keine Funktion `prosecdef` ist.
- Die Beweiseinträge der App entstehen über Trigger der Fachtabellen (`evidence_hall_event`, `evidence_job_event`, `evidence_tournament_event`, 0055) und `recordEvidence`: sie rufen `evidence_emit` → `evidence_write` → `INSERT INTO booking_evidence` im Kontext der **aufrufenden App-Rolle**.
- Migration 0058 gab nur `EXECUTE` und `USAGE ON SCHEMA public` an `soccaz_ops`, kein Entzug; die Entzugs-Anweisungen stehen als `A2_REVOKE` in `tests/integration/db-ops-pool.test.ts`.
- `socaz_maintenance_allowed()` (0055) bindet die Wartungsausnahme an die Mitgliedschaft in `soccaz_maintenance` (`session_user`); ohne diese Rolle gilt nur der Sitzungswert (Zwischenzustand, Muster für "Rolle fehlt").

## 2. Ziel und Prinzip
Nach A2 erzeugt **nur Code, der als Eigentümer (`soccaz_owner`) läuft**, Beweiseinträge und Beweis-Einstellungen. Die Guards lassen die Marker nur zu, wenn die ausführende Rolle Mitglied von `soccaz_owner` ist. Dafür müssen **alle** Funktionen, die zu einem Beweiseintrag oder einer Beweis-Einstellung führen, `SECURITY DEFINER` sein; die **Guards bleiben SECURITY INVOKER** (sonst wäre `current_user` dort immer der Eigentümer und die Härtung wirkungslos: Test, Abschnitt 8).

## 3. Funktionsumfang (vollständige Liste, der Katalogtest entscheidet im Bau)
**DEFINER (`SET search_path = pg_catalog, pg_temp`, Eigentümer `soccaz_owner`):**
1. `evidence_set_setting`, `evidence_late_attempt` (Ops-Aufrufer, `EXECUTE` nur `soccaz_ops`).
2. `booking_evidence_before_insert` (setzt `socaz.evidence_insert`).
3. Ereignis-Trigger `evidence_hall_event`, `evidence_job_event`, `evidence_tournament_event` (feuern bei Hallenanfragen, Jobs, Turnieren der App-Rolle; ohne DEFINER scheitert jede solche Fachaktion nach dem Entzug mit 42501).
4. `evidence_emit`, `evidence_write` (freie Parameter; nur von Triggern/Definer-Funktionen: `EXECUTE` für PUBLIC, `soccaz_app` und `soccaz_ops` entzogen).
5. Restore-Funktionen (`evidence_restore_begin/finish/done`): bleiben unter der Wartungsausnahme (`soccaz_maintenance`); im Bau entscheidet der Katalogtest, ob sie DEFINER werden oder auf der Ausnahmeliste stehen (Ausnahme begründen).

**INVOKER bleiben (Guards):** `forbid_ledger_mutation`, `forbid_append_only_mutation`, `forbid_ledger_model_change`, `forbid_evidence_truncate`, `booking_evidence_counter_guard`, `forbid_delete_with_evidence`, `evidence_settings_guard`, `evidence_hall_before`, `socaz_maintenance_allowed` (bereits mit festem Suchpfad). **Reine Hilfsfunktionen** (`evidence_hash_of`, `hash2`, `ts`, `evidence_check_reason`, `evidence_clean_reason`, `evidence_session_key`, `evidence_setting`, `evidence_enforced`, `evidence_has_venue_access`): nicht DEFINER, aber aus den DEFINER-Körpern nur **mit Schema** aufgerufen.

## 4. Drei Migrationen im selben PR (ein Deploy; t2q-Entscheid "alles in EINEM PR" bleibt)
Nummern vorbehaltlich der dann freien (Annahme 0059 bis 0061). Jede mit Rückfall in `drizzle/down/`.
- **M1 Definer (verhaltensneutral, vorab ausrollbar):** Eigentum und `SECURITY DEFINER` für die Liste aus Abschnitt 3, fester Suchpfad, **alle Namen außer `pg_catalog` mit Schema** (Tabellen und Typen: `public.booking_evidence`, `public.booking_evidence_counter` samt `%ROWTYPE`, `public.settings`, `public.audit_log`, `public.match_hall_requests`, `public.matches`; Funktionen: `public.evidence_hash_of`/`hash2`/`ts`/`evidence_check_reason`/`evidence_clean_reason`/`evidence_session_key`/`evidence_setting`/`evidence_enforced`/`evidence_has_venue_access`/`evidence_emit`/`evidence_write`). **`CREATE OR REPLACE` nur mit identischer Signatur** (sonst entsteht eine Überladung mit den alten Rechten; Test). Körper sonst unverändert.
- **M2 Marker-Härtung (neutral nach M1):** `evidence_settings_guard`, `booking_evidence_counter_guard` und die Guards der Beweistabellen akzeptieren die Marker nur, wenn `NOT EXISTS (Rolle soccaz_owner)` (Zwischenzustand ohne Rollen, Muster 0055) **oder** `pg_has_role(current_user, 'soccaz_owner', 'member')` (Eigentümer im Definer-Kontext, `soccaz_migrate`, Superuser in CI/lokal). Die App-Rolle ist in keiner Rolle Mitglied: `SET ROLE soccaz_owner` ist für sie nicht möglich. Version der Härtung als `COMMENT ON FUNCTION` an der Guard-Funktion (Anzeige für den Start-Check, Abschnitt 7).
- **M3 Entzug (beim URL-Wechsel):** `A2_REVOKE` (`evidence_set_setting`/`evidence_late_attempt` von PUBLIC und `soccaz_app`), `EXECUTE` auf `evidence_emit`/`evidence_write` von PUBLIC/`soccaz_app`/`soccaz_ops`, `ALTER DEFAULT PRIVILEGES FOR ROLE soccaz_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`, und die **Direkt-Schreibrechte** der App-Rolle auf `booking_evidence`/`booking_evidence_counter` (Defense in Depth; trägt der Bau das nicht: Backlog-Zeile).
- **Rückfall in umgekehrter Reihenfolge M3, M2, M1.** `M1-down` vor `M2-down` bricht die App (Guards verlangen Marker aus dem Eigentümer-Kontext, Funktionen wieder INVOKER): das Down-Skript prüft das und bricht ab.
- **Rollen fehlen (dev/CI/Worker-DBs):** M1 ist **bedingt** (Muster 0055: Rolle `soccaz_owner` fehlt = Meldung, Funktionen bleiben INVOKER, kein `ALTER … OWNER`), M2 gilt dann den Zwischenzustand ("Rolle fehlt = altes Verhalten"). Entschieden gegen die Alternative "Guard prüft `pg_proc.proowner`" (je Funktion ein Katalogzugriff im heißen Pfad, schwerer zu testen).
- **Eigentum:** `db-owner.mjs` hat Vorrang; M1 **prüft** nur (`RAISE EXCEPTION` bei abweichendem Eigentümer) und ändert das Eigentum nicht still.

## 5. Kann "A2-pre" (M1 + M2) ohne Hoster-Spike gebaut werden?
**Ja für Bau und CI-Beleg, nein für die Anwendung in Produktion.** Die Rolle `soccaz_owner` gibt es in CI und in den Wegwerf-Datenbanken der Tests (Rollen-Skript), M1 und M2 sind dort vollständig testbar. M2 allein (ohne M1) bricht die App (Funktionen INVOKER, `current_user` = App-Rolle): deshalb immer M1 vor M2 im selben Fenster. Die Anwendung in Produktion wartet auf die Hoster-Antwort zu Eigentum und `SECURITY DEFINER`.

## 6. Deploy-Reihenfolge (aus w4 R-T361, Variante b; bindend)
1. `db-roles.mjs`, `db-owner.mjs`, Prüfskript.
2. **EIN Release/Wartungsfenster:** M1, M2, M3 VOR dem Start der neuen Instanz; neue Instanz mit `DATABASE_URL_OPS` und `DATABASE_URL` auf `soccaz_app`. Kurzes Fenster zwischen Migration und Start: Beweis-Schalter und `late_attempt` scheitern fail closed.
3. Prüfung: Katalog (Abschnitt 7), Ops-Aufruf ok, Hauptpool-Aufruf der Ops-Funktionen scheitert klar, Fachaktionen (Hallenanfrage, Job, Turnier) schreiben Beweiseinträge, Beweiskette gültig.
4. **Nie:** Variable vor M1, Entzug ohne Variable, Variable ohne A2 in Produktion (der Start-Check fängt die beiden letzten).

## 7. Start-Check Produktion (Backlog 228-2)
Zustand aus dem Katalog, kein neues Objekt: für **jede** DEFINER-Funktion der Liste `prosecdef`, `proowner = soccaz_owner`, `proconfig` enthält den festen `search_path`, und **kein** `EXECUTE` für PUBLIC und die `current_user` der Pools (nicht fest "soccaz_app": am Pooler kann der Benutzername abweichen). "Härtung aktiv" zeigt der Katalog nicht: Versions-`COMMENT` an der Guard-Funktion plus Verhaltensprobe in Staging (die App-Rolle setzt den Marker: wird abgewiesen). Fehlt etwas: klarer Start-Fehler, nur wenn die Rollen existieren; ein Lesefehler der Datenbank ist eine Warnung, kein Fehlstart.

## 8. Tests (vor dem Bau schreiben; Wegwerf-Datenbank mit Rollen wie `db-ops-pool.test.ts`)
1. **Positiv als `soccaz_app`:** nach M1 bis M3 FUNKTIONIEREN die Trigger-Pfade (Hallenanfrage, Job, Turnier, Beweiseintrag über `recordEvidence`); die Ops-Funktionen laufen als `soccaz_ops` ohne Tabellenrechte.
2. **Negativ als `soccaz_app`:** beide Ops-Funktionen und `evidence_emit`/`evidence_write` scheitern (42501); Marker selbst setzen und direkt in `booking_evidence`/`settings` schreiben scheitert; `SET ROLE soccaz_owner` scheitert.
3. **Katalogtests:** (a) jede Funktion, deren `prosrc` einen der Marker oder `evidence_write`/`evidence_emit` enthält, ist DEFINER (Liste aus Abschnitt 3, Ausnahmen begründet), rot wenn eine INVOKER ist (wie `maintenance-role.test.ts`); (b) alle Guards sind INVOKER; (c) jede DEFINER-Funktion hat `proconfig` mit `search_path` und kein `EXECUTE` für PUBLIC; (d) kein unqualifizierter Name in `prosrc` der DEFINER-Funktionen (Allowlist `pg_catalog`).
4. **Suchpfad-Angriff je Hilfsfunktion und Tabelle:** Gegenstück gleichen Namens in `pg_temp` bzw. einem Fremdschema der App-Rolle; der DEFINER-Aufruf nutzt es nicht.
5. **Rollen fehlen:** auf einer Datenbank ohne Rollen sind M1/M2 neutral (Funktionen INVOKER, Verhalten wie heute); Migration auf einem Dump mit Daten: Kopf-Hash der Kette vorher/nachher gleich.
6. **Rückfall:** `M1-down` vor `M2-down` wird abgewiesen; M3, M2, M1 in dieser Reihenfolge stellen den Zustand her.
7. **Mutationen:** Definer entfernt, Suchpfad entfernt, ein Name unqualifiziert, Guard als DEFINER, Härtung entfernt, Entzug entfernt: je ein Test rot.

## 9. Restrisiko (benannt)
`soccaz_owner` ist Eigentümer aller Tabellen, die DEFINER-Funktionen laufen mit vollen Tabellenrechten (Körper fest, Suchpfad fest). `SET ROLE soccaz_owner` können `soccaz_migrate` und der Hoster-Administrator; die Übernahme des Anwendungsprozesses oder der Eigentümer-Zugangsdaten bleibt außerhalb des Schutzes (Plan Abschnitt 9). Die Härtung selbst ist tragfähig: die App-Rolle ist in keiner Rolle Mitglied und kann die Marker nicht selbst wirksam setzen.

## 10. Offene Punkte
1. Hoster: Eigentum auf `soccaz_owner` übertragbar? `SECURITY DEFINER` mit Eigentümerrolle erlaubt? Pooler-Benutzer je Rolle, `sslmode` in beiden Adressen gleich (NEEDS-USER, FEHLT-NOCH).
2. Restore-Funktionen: DEFINER oder begründete Ausnahme (Bau, Katalogtest).
3. Direkt-Schreibrechte der App auf `booking_evidence`/`_counter` mit M3 entziehen oder als Backlog (Bau).

## 11. Aufwand für den Bau
Drei Migrationen mit Down ca. 2 Tage, Tests ca. 2 Tage, Review und Deploy-Probe auf Kopie 1 Tag. Ein PR mit Migration: zwei grüne CI-Läufe auf verschiedenen SHAs (Beweisprotokoll-Pfad), security-reviewer, Eintrag in GO-LIVE-AUDIT durch den Task Manager.
