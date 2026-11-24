# G25-009 A2: Definer-Umstellung, Entzug und URL-Wechsel (ENTWURF, nicht anwenden)

Status: **PLAN/ENTWURF** (worker-1, 2026-11-24). Keine Migration unter `drizzle/`, nichts angewendet. Bau erst nach Review (security-reviewer Pflicht, w3) und nach den Hoster-Antworten (FEHLT-NOCH: Rollenrechte, Eigentum). Bezug: `g25-009-db-rollenmodell.md` Abschnitte 5, 8, 10; Backlog 228 (1) und (2); GO-LIVE-AUDIT G25-009 und G25-009-B.

## 1. Ist (gelesen aus dem Repo)
- `evidence_set_setting(text,text,uuid,text)` und `evidence_late_attempt(uuid,uuid,uuid)` (Migration 0054) sind `LANGUAGE plpgsql`, **SECURITY INVOKER**, ohne festen `search_path`; sie laufen mit den Rechten des Aufrufers.
- Migration 0058 gab nur `EXECUTE` und `USAGE ON SCHEMA public` an `soccaz_ops`; **kein Entzug**. `soccaz_app` und PUBLIC dürfen beide Funktionen noch ausführen (Zwischenzustand, benanntes Restrisiko).
- `src/db/ops.ts` (Ops-Pool, `DATABASE_URL_OPS`) ruft beide Funktionen; ohne Variable Rückfall auf den Hauptpool.
- Die Entzugs-Anweisungen stehen heute nur als `A2_REVOKE` in `tests/integration/db-ops-pool.test.ts` (4 Stück: je Funktion von PUBLIC und `soccaz_app`).
- Wartungsausnahme (0055): `socaz_maintenance_allowed()` bindet `socaz.ledger_maintenance` an Mitgliedschaft in `soccaz_maintenance` (`session_user`).

## 2. Ziel
Nach A2 kann **nur `soccaz_ops`** die beiden Funktionen aufrufen; die Funktionen schreiben als **Eigentümer** (`soccaz_owner`), nicht mit den Rechten des Aufrufers. `soccaz_ops` braucht dadurch **keine Tabellenrechte** (heute hat sie keine, Funktionen im Zwischenzustand scheitern dort mit 42501: deshalb die Reihenfolge unten).

## 3. Inhalt der A2-Migration (Vorschlag, Nummer 0059 vorbehaltlich der dann freien Nummer; Rückfall `drizzle/down/0059_down.sql`)
Reihenfolge innerhalb EINER Migration (Transaktion):
1. **Eigentum:** `ALTER FUNCTION … OWNER TO soccaz_owner` für beide Funktionen (setzt voraus: `db-owner.mjs` angewendet oder Anweisung hier; Hoster-Frage `REASSIGN OWNED`/Eigentumswechsel offen).
2. **Definer + fester Suchpfad:** `CREATE OR REPLACE FUNCTION … SECURITY DEFINER SET search_path = pg_catalog, pg_temp` und **alle Objekte im Funktionskörper mit Schema** (`public.settings`, `public.audit_log`, `public.booking_evidence`, `public.match_hall_requests`, `public.matches`, und die Hilfsfunktionen `public.evidence_setting`, `public.evidence_has_venue_access`, `public.evidence_enforced`, `public.evidence_emit`). Der Körper sonst **unverändert** (Verhalten gleich, nur Namensauflösung).
3. **Hilfsfunktionen:** `evidence_emit`/`evidence_write` (freie Parameter) nur von Triggern/Definer-Funktionen: `REVOKE EXECUTE … FROM PUBLIC, soccaz_app, soccaz_ops` (Plan Abschnitt 5; Definer-Aufruf läuft als Eigentümer, bleibt erlaubt).
4. **Entzug (A2_REVOKE):** `REVOKE EXECUTE ON FUNCTION evidence_set_setting/evidence_late_attempt FROM PUBLIC` und `FROM soccaz_app`; `GRANT` an `soccaz_ops` bleibt aus 0058.
5. **Marker-Härtung (ENTSCHIEDEN, Abschnitt 6 Punkt 1; zweite Migration im selben PR):** `socaz.evidence_setting_write` und `socaz.evidence_insert` sind heute freie Sitzungswerte. Vorschlag: die Guards akzeptieren sie nur, wenn `current_user = 'soccaz_owner'` (also im Definer-Kontext), sonst nur die Wartungsausnahme. Sonst kann `soccaz_app` den Marker selbst setzen und die Funktionen umgehen.
6. **Zustandsmarker für den Start-Check (Backlog 228-2): kein neues Objekt.** Zustand = Katalog: `pg_proc.prosecdef = true` für `evidence_set_setting` UND `has_function_privilege('soccaz_app', 'public.evidence_set_setting(text,text,uuid,text)', 'EXECUTE') = false`. Ein Marker-Objekt (Zeile/Funktion) könnte von der App-Rolle nicht gefälscht, aber vergessen werden; der Katalog ist die Wahrheit. Der Start-Check (PR B, nach diesem Entwurf) liest genau das.

## 4. Deploy-Reihenfolge (aus w4 R-T361, Variante b; bindend)
1. `db-roles.mjs` (Rollen, Passwörter nur aus Umgebungsvariablen), `db-owner.mjs` (Eigentum), Prüfskript.
2. **EIN Release/Wartungsfenster:** Migration A2 (Schritt 1) VOR dem Start der neuen Instanz; neue Instanz startet mit `DATABASE_URL_OPS` und `DATABASE_URL` auf `soccaz_app` (URL-Wechsel). Kurzes Fenster zwischen Migration und Start: Beweis-Schalter und `late_attempt` scheitern fail closed.
3. Prüfung: `has_function_privilege('soccaz_app', …) = false`, Ops-Aufruf ok, Hauptpool-Aufruf scheitert klar, `evidence_enforcement` unverändert, Beweiskette gültig (`verifyEvidenceChain`).
4. **Nie:** Variable vor Definer-Umstellung, Entzug ohne Variable, Variable ohne A2 in Produktion (Start-Check PR B fängt die letzten beiden).
Rückfall: `0059_down` (`SECURITY INVOKER`, `GRANT` zurück an PUBLIC/`soccaz_app`, Guard-Änderung zurück) plus alte URLs aus dem Tresor.

## 5. Tests (vor dem Bau schreiben; als `soccaz_app`/`soccaz_ops` in einer Wegwerf-Datenbank wie `db-ops-pool.test.ts`)
- `soccaz_app`: beide Funktionen **scheitern** (42501); direkter `insert` in `settings`-Schlüssel `evidence_*` und `set_config('socaz.evidence_setting_write','on',…)` + Insert **scheitern** (Marker-Härtung, Punkt 5).
- `soccaz_ops`: beide Funktionen **laufen** (Definer), ohne Tabellenrechte; Audit-Eintrag entsteht; unbekannter Schlüssel, `clock_source`-Regeln und Akteur-Pflicht unverändert (bestehende Tests als Ops).
- **Suchpfad-Angriff:** als `soccaz_app` ein Objekt gleichen Namens in `pg_temp` bzw. einem eigenen Schema anlegen, Funktion über Ops aufrufen: es wird nicht benutzt (kein `CREATE` in `public` für die App, Test belegt es).
- `evidence_write`/`evidence_emit` direkt aufrufen: als App und Ops **Fehler**.
- Migration auf Dump mit Daten: Kopf-Hash der Kette vorher/nachher gleich; Rückfall-Migration stellt `prosecdef = false` und die Rechte wieder her.
- Mutationen: Definer entfernt, `search_path` entfernt, Entzug von PUBLIC entfernt, Marker-Härtung entfernt: je ein Test rot.

## 6. Offene Entscheide (vor dem Bau)
1. **Marker-Härtung (Punkt 5): ENTSCHIEDEN (t2q, 2026-11-24): Option 1, in A2 mitnehmen** (die Guards akzeptieren `socaz.evidence_setting_write`/`socaz.evidence_insert` nur bei `current_user = soccaz_owner`; sonst gilt nur die Wartungsausnahme). Der security-reviewer darf am Entwurf auf **zwei Migrationen im selben PR** schneiden (Definer-Umstellung und Entzug; Guard-Härtung), damit jede für sich zurückgerollt werden kann. Verworfene Alternative: Härtung als eigene Etappe (Restrisiko: die App-Rolle setzt den Marker selbst, Plan Abschnitt 9). Berührt die Guards aller Schutztabellen: eigenes Review.

   **Kann die Härtung SEPARAT als "A2-pre" gebaut werden, ohne Eigentumswechsel und ohne Hoster? NEIN, nicht sinnvoll; testbar ja.** Begründung: (a) Die Prüfung `current_user = soccaz_owner` braucht den Anbieter-Spike nicht, die Rolle `soccaz_owner` existiert lokal/CI (die CI legt die Rollen an, `db-ops-pool.test.ts` legt sie in der Wegwerf-Datenbank an): als Test und als Migration ist sie ohne Hoster baubar und prüfbar. (b) **Wirkung ohne Definer:** die Marker setzen heute `evidence_write` (0052/0054/0055), `evidence_set_setting` (0054) und die Restore-Funktionen (0055), alle **SECURITY INVOKER**: dort ist `current_user` der AUFRUFER (die App-Rolle), nicht `soccaz_owner`. Mit der Härtung allein würde also **jeder Beweisprotokoll-Eintrag der App scheitern** (`recordEvidence` → `evidence_write` → Guard lehnt ab), nicht nur der Ops-Pfad: die App bricht in Produktion, sobald die Rolle existiert, bis die Definer-Umstellung (A2) da ist. Der Zwischenzustand "Rolle fehlt = altes Verhalten" (Muster 0055) schützt nur Datenbanken OHNE Rollen, in Produktion existieren sie nach `db-roles`. (c) Daraus folgt: die Härtung gehört in dasselbe Release wie die Definer-Umstellung **aller** marker-setzenden Funktionen (nicht nur der zwei Ops-Funktionen: auch `evidence_write`/`evidence_emit` und die Restore-Funktionen, im Entwurf Punkt 2 und 3 entsprechend zu lesen), also zwei Migrationen im selben PR und selben Deploy. (d) **Deploy-Reihenfolge** unverändert (Abschnitt 4): Rollen, dann EIN Release mit beiden Migrationen vor dem Start der neuen Instanz, URL-Wechsel, Prüfung; die Migration "Definer" läuft vor der Migration "Härtung". (e) **Was ohne den Spike schon geht:** vollständige Entwicklung und CI-Beleg beider Migrationen (Rolle in CI vorhanden); nur die ANWENDUNG in Produktion wartet auf Eigentum/`SECURITY DEFINER`-Antwort des Anbieters (NEEDS-USER).
2. Hoster: Eigentum auf `soccaz_owner` übertragbar? (`REASSIGN OWNED`, `SECURITY DEFINER` mit Eigentümerrolle erlaubt?) (FEHLT-NOCH, Nutzer/Anbieter).
3. Pooler: Benutzername je Rolle am Pooler (`soccaz_ops` als eigener Pool-Benutzer), `sslmode` in beiden Adressen gleich.
4. Mit Entwurf in der CI: Rollen sind dort angelegt (Job „Integrationstests“); A2 testbar ohne Hoster.

## 7. Aufwand für den späteren Bau
Migration + Down ca. 1 Tag, Tests ca. 1 bis 1,5 Tage, Review und Deploy-Probe auf Kopie 0,5 Tag. Ein PR mit Migration: zwei grüne CI-Läufe auf verschiedenen SHAs (Beweisprotokoll-Pfad), security-reviewer, Eintrag in GO-LIVE-AUDIT durch den Task Manager.
