# Bau-Plan A2 (G25-009 Rechtewechsel), Stand: Plan, kein Code

Stand: 2026-11-23 · Verfasser: worker-2 · Status: Plan, Bau erst nach den Voraussetzungen unten.
Plan: `docs/design/g25-009-db-rollenmodell.md` (v5); Rollenskripte: `scripts/db-roles.sql`, `scripts/db-roles.mjs`, `scripts/db-owner.mjs`; Betrieb: `docs/BETRIEB.md`. Entscheide: `docs/loop/A2-ENTSCHEID.md`; Spike: `docs/loop/A2-ANBIETER-SPIKE.md`.

Stand: main = 541ba97 (A1 #180 gemergt, Journal endet bei 0055). **Nummern-Regel:** 0056 ist von 012 M6b belegt; A2 nimmt beim Bau die dann naechste freie Nummer (Journal auf origin/main pruefen, main vor dem Generieren mergen, strikt seriell, nie vorab reservieren).

Basis: Plan v5 (docs/design/g25-009-db-rollenmodell.md, Abschnitte 3, 4, 5, 8, 10), Funde 4/5 aus dem Code-Plan soccaz_ops (Plan-Review R-T272). Main: Journal endet bei 0055 (A1). A2 braucht **eine** Migration (Nummer siehe Nummern-Regel; im Plan `NNNN_...`).

## Voraussetzungen (Gate vor Bau)
1. Plan-OK + Anbieter-Spike (Nutzer): geht `CREATE ROLE`, `ALTER OWNER`, `GRANT soccaz_owner TO soccaz_migrate`, `SET ROLE` auf dem gewaehlten Hoster? Ergebnis steuert db-owner-Pfad (kein REASSIGN OWNED).
2. Fund 4 (Whitelist-Abgleich) und Fund 5 (Rollback-Beleg) als Bauabnahme festgelegt (siehe Tests).
3. Security-Review (Agent) auf diesen Plan UND auf die Umsetzung (Pflicht).
4. B (soccaz_ops) nicht Teil von A2; bis B bleiben `evidence_set_setting`/`evidence_late_attempt` fuer soccaz_app ausfuehrbar (dokumentiertes Restrisiko, Option 2).

## Dateiliste
| Datei | Aenderung |
|---|---|
| drizzle/NNNN_<name>.sql + down/NNNN_down.sql | Funktionskoerper: Definer-Umstellung, Marker entfernen, harte `socaz_maintenance_allowed()`, neue Definer-Funktionen, Rechte/Whitelist (Rechteteil ohne EXCEPTION-Verschlucken) |
| drizzle/meta/_journal.json, NNNN_snapshot | nur Journal (kein Schema-Diff; `db:generate` muss "No schema changes" melden) |
| scripts/migrate.mjs | `SET ROLE soccaz_owner` je Verbindung (pool.on connect, max 1, Fehlerpfad: Verbindung verwerfen, Abbruch wenn current_user <> soccaz_owner); Rolle fehlt/nicht setzbar => klarer Abbruch (ab A2 hart) |
| package.json | `db:migrate` -> `node scripts/migrate.mjs` |
| scripts/db-roles.sql / db-roles.mjs | Phase 1 Rechte: Whitelist GRANT/REVOKE, Default-ACLs fuer soccaz_owner, REVOKE CREATE on public, TEMP; Datenbankteil (CONNECT, CREATE ON DATABASE fuer owner); `--phase 0` = Rueckfall; doppeltes dbUrlAllowed durch scripts/lib/db-url-guard.mjs ersetzen (Mini-Nachzug) |
| scripts/db-owner.mjs | wie gebaut; Einsatz auf Bestands-DBs vor der Migration (Plan-Datei + sha256) |
| scripts/verify-db-roles.mjs (neu) | Katalog-Positivpruefung (proowner/relowner/typowner = soccaz_owner, prosecdef + proconfig search_path, relacl, pg_default_acl, pg_parameter_acl, Mitgliedschaften, datdba-Soll aus 8.2 d) + negative Faelle aus Abschnitt 7 + **Klassen-Abgleich (Fund 4)**: jede Tabelle/Sequenz/Funktion in public in genau einer Klasse (app-DML, geschuetzt, ops, intern/Trigger, keiner), unklassifiziert = rot. Klassenliste als Datei scripts/db-roles.classes.json |
| src/server/evidence-head.ts, account.ts | Aufrufe auf Definer-Funktionen `evidence_clear_orphans()`, `evidence_sweep_reason_text()`, `evidence_erase_actor(user)` umstellen (keine Direkt-DML auf geschuetzte Tabellen mehr) |
| src/db/evidence-write.ts (falls betroffen) | Marker-`set_config` entfernen |
| tests/integration/db-rollen.test.ts (neu) | Verbindung als soccaz_app (DATABASE_URL_APP): alle Negativfaelle Abschnitt 7 muessen scheitern |
| tests/integration/maintenance-role.test.ts | auf harte Fassung anpassen (Rolle fehlt => false statt Wert) |
| tests/integration/db-roles.test.ts | Phase-1-Rechte, Rueckfall --phase 0 |
| scripts/mutation-evidence.mjs | Mutationen A2 (Definer entfernt, search_path entfernt, Marker wieder zugelassen, REVOKE fehlt, harte Rolle -> weich, Whitelist-Eintrag zu viel); stmtOf liest weiter die letzte Definition |
| scripts/verify-evidence-migration.mjs, migrate-check.mjs, worktree.mjs | frische DB: Migration als soccaz_owner (SET ROLE) |
| .github/workflows/ci.yml | **eigener NEEDS-USER-PR**: Schritte db-roles --apply Phase 1, verify-db-roles, Smoke als soccaz_app, Nicht-Superuser-Migration auf frischer Zweit-DB |
| docs/BETRIEB.md, GO-LIVE-AUDIT.md, design/g25-009 | Funktion|A1|A2-Tabelle (Fund 3), Rollout, Rueckfall; G25-009 erst nach A2 + URL-Wechsel geschlossen |

## PR-Schnitt (Empfehlung)
- **A2a (Code+Migration, ohne ci.yml):** Migration NNNN, migrate.mjs, db-roles Phase 1, verify-db-roles, evidence-head/account-Umstellung, Tests, Mutationen, Doku.
- **A2b (ci.yml, NEEDS-USER):** CI-Schritte. Reihenfolge: A2b-Schritte duerfen erst nach A2a-Merge aktiv sein (sonst rot) -> A2b nach A2a, oder in einem NEEDS-USER-PR zusammen, wenn Nutzer das will.

## Reihenfolge im Bau
1. Klassenliste + verify-db-roles (Test-first, rot auf heutigem Stand).
2. db-roles Phase 1 + Tests (Rechte, Rueckfall).
3. Migration NNNN + down; Generator-Skript wie bei A1 (Funktionskoerper aus letzter Definition, Tabelle Fund 3 pruefbar: nach A2 steht weder `evidence_insert` noch `evidence_setting_write` noch Rohwert irgendwo in prosrc).
4. migrate.mjs + db:migrate-Umstellung + Skripte (worktree, verify-evidence-migration, migrate-check).
5. Aufrufer umstellen (evidence-head, account), Definer-Tests.
6. Mutationen, Gesamtlauf, Security-Review, Doku.

## Tests und Belege
- Unit: migrate.mjs-Rollenlogik (Fehlerpfad, Abbruch), Klassenliste-Format.
- Integration: db-rollen.test.ts (soccaz_app scheitert in allen Faellen Abschnitt 7: Wert setzen + UPDATE ledger, DELETE/TRUNCATE booking_evidence, direkter Insert, ALTER/CREATE/GRANT, SET ROLE/SESSION AUTHORIZATION/session_replication_role, COPY, evidence_write/emit direkt, evidence_set_setting bleibt bis B ausfuehrbar = bewusst dokumentiert); Definer-Pfade laufen als soccaz_app (Hall/Job/Turnier-Event, evidence_erase_actor, Sweep, Orphans); Chain-Verify bleibt gueltig.
- **Fund 4:** einmaliger Lauf **aller** Integrationsdateien als soccaz_app (Datei fuer Datei, Worker-DB, "Lauf frei" abwarten, `--testTimeout=60000`); CI-Smoke 8 bis 12 Kernsuiten (halls, ledger, card-charge, card-refund, tournament-charge, account, beweisprotokoll, jobs).
- **Fund 5 (Rollback-Beleg):** Test auf Scratch-DB im A2-Zustand: soccaz_app scheitert, `--phase 0` + db-owner --reverse + Journal-Eintrag entfernen, danach laeuft App wieder; als Skript/Test eingecheckt.
- Mutationen: alle neuen rot; 1-58 weiter rot (A1-Mutationen die Marker/Rohwert betreffen, werden auf den A2-Text umgeschrieben).
- Gate-Kette: typecheck, eslint, unit, e2e-shards check, db:generate "No schema changes", Integrationsdateien einzeln (Kern + Beweisprotokoll + maintenance-role + db-roles + db-rollen).
- Smoke als soccaz_app lokal nur auf Worker-DB soccaz_w2 mit Testrollen; kein Dev-Server, kein E2E (E2E im Staging durch Nutzer/Abnahme).

## Risiken / Bestandsuebergang
- Bestands-DBs (soccav2, soccaz_w1..w4): zuerst db-owner (Eigentum), dann Migration; sonst "must be owner". Lokal clusterweite Rollenwirkung (A1-Hinweis) bleibt.
- Superuser-Tests (`postgres`) bleiben gruen (implizite Mitgliedschaft); tests/cleanup.ts unveraendert.
- Produktion: Wartungsfenster, URL-Wechsel zuletzt, Rueckfall = alte URL; verify-db-roles gegen Produktion nach Wechsel.
- Offen/ausserhalb: users.role/is_owner (Abschnitt 9), HMAC/Anker (C), B (ops-Pool).

## Aufwand
Gross (ca. 2 bis 3 Bauetappen, Security-Review auf Plan und Umsetzung, Nachfunde einplanen wie bei A1).
