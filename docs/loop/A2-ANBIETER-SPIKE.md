# Anbieter-Spike G25-009 (Datenbank-Rollenmodell): Prüfliste für den Nutzer

Stand: 2026-11-23 · Verfasser: worker-2 (Unterlage für Etappe A2) · Status: Entwurf, Ergebnis liegt beim Nutzer.
Plan: `docs/design/g25-009-db-rollenmodell.md` (v5); Rollenskripte: `scripts/db-roles.sql`, `scripts/db-roles.mjs`, `scripts/db-owner.mjs`; Betrieb: `docs/BETRIEB.md`.

**Platzhalter:** `<PASSWORT-PLATZHALTER>` steht für ein Wegwerf-Passwort, das nur für diesen Test gilt und danach mit der Rolle gelöscht wird; echte Passwörter, Host-Namen und Verbindungs-URLs nie in dieses Dokument oder in eine Rückmeldung schreiben.

Zweck: klaeren, ob der gewaehlte Postgres-Anbieter das Rollenmodell (soccaz_owner, soccaz_migrate, soccaz_app, soccaz_ops, soccaz_maintenance, soccaz_backup) zulaesst. **Alles auf einer leeren Test-Datenbank beim Anbieter ausfuehren, nie auf Produktivdaten.** Verbindung als der Admin-Benutzer, den der Anbieter vergibt (`psql "<Verbindungs-URL>"` oder SQL-Konsole des Anbieters). Ergebnisse als Text zurueckmelden (keine Passwoerter, keine Host-Namen). Nur die Zeilen mit "schreibt" legen Testobjekte an; sie raeumen am Ende der Liste auf.

Ablauf: Teil A (nur lesend) komplett, dann Teil B (Testobjekte, mit Aufraeumen), dann Teil C (Konsole/Vertrag, ohne SQL).

## Teil A: nur lesend

| # | Frage | Befehl | Erwartet | Risiko/Hinweis |
|---|---|---|---|---|
| A1 | Postgres-Version (PG 16+ hat pg_parameter_acl) | `select version(), current_setting('server_version_num');` | Version >= 16 (160000) | Aelter: kein SET-Recht-Katalog, Plan-Abschnitt 7(5) greift nur teilweise |
| A2 | Wer bin ich, bin ich Superuser, darf ich Rollen anlegen? | `select current_user, rolsuper, rolcreaterole, rolcreatedb, rolinherit, rolbypassrls from pg_roles where rolname = current_user;` | `rolcreaterole = true` (Superuser meist `false` bei Anbietern) | Fehlt `rolcreaterole`: Rollen nur ueber die Anbieter-Oberflaeche, Skript `db-roles` muss dann dort ausgefuehrt werden |
| A3 | Welche Rollen gibt es schon (Anbieter-Rollen, Admin-Rolle)? | `select rolname, rolsuper, rolcreaterole, rolcanlogin from pg_roles where rolname !~ '^pg_' order by 1;` | Liste; Anbieter-Superuser (z. B. eine Admin-Rolle) erkennbar | Dieser Anbieter-Superuser steht ausserhalb des Schutzes (Plan Abschnitt 9) |
| A4 | Wer besitzt die Datenbank? | `select d.datname, r.rolname as owner from pg_database d join pg_roles r on r.oid = d.datdba where d.datname = current_database();` | Besitzer = Admin-Rolle des Anbieters | Der Plan fordert nur: Besitzer ist keine Rolle, die soccaz_app/ops/migrate erreichen |
| A5 | Mitgliedschaften des Admins (Rechte zum Weitergeben) | `select r.rolname, m.admin_option from pg_auth_members m join pg_roles r on r.oid = m.roleid where m.member = (select oid from pg_roles where rolname = current_user);` | Zeigt, was der Admin vergeben darf | PG 16: ohne `admin_option` kann der Admin Rollen evtl. nicht an andere vergeben |
| A6 | Verbindung ueber Pooler? Pooler-Modus | `show server_version; select inet_server_port(); show transaction_isolation;` plus Anbieter-Konsole: Pooler-Modus (session / transaction / keiner) | Direkter Port ohne Pooler fuer Wartung/Migration vorhanden | **Transaktions-Pooler:** Sitzungswerte (`socaz.ledger_maintenance`, SET ROLE) koennen auf fremde Sitzungen durchschlagen; Migration/Wartung nie ueber ihn |
| A7 | Verfuegbare Extensions (Plan braucht nur pgcrypto/Standard) | `select name, installed_version from pg_available_extensions where name in ('pgcrypto','pg_stat_statements','pgaudit') order by 1;` | pgcrypto verfuegbar; pgaudit ist ein Plus (Zugriffsprotokoll) | Fehlt pgcrypto: pruefen, ob die App sie braucht (`gen_random_uuid` ist ab PG 13 eingebaut) |
| A8 | Session-Parameter, die ein Angreifer mit soccaz_app aendern koennte | `select name, setting from pg_settings where name in ('session_replication_role','row_security','default_transaction_read_only');` | `session_replication_role = origin` | Setzbar nur fuer Superuser bzw. (PG 16+) per `pg_parameter_acl`-Grant: darf fuer soccaz_app nicht freigegeben sein |
| A9 | Parameter-Rechte vorhanden (PG 16+) | `select * from pg_parameter_acl;` | leer oder nur Anbieter-Eintraege | Eintraege fuer unsere Rollen duerfen nie entstehen |
| A10 | Standard-Rechte auf Schema public (PG 15+ ohne CREATE fuer PUBLIC) | `select nspname, nspowner::regrole, nspacl from pg_namespace where nspname = 'public';` | kein `=UC/...` fuer PUBLIC | Sonst REVOKE im Skript noetig (ist vorgesehen) |
| A11 | Wer ausser mir sieht/aendert Daten (Anbieter-Zugriff) | Anbieter-Konsole/Vertrag: gibt es Support-Zugriff, Superuser-Login des Anbieters, Zugriffsprotokoll? | schriftliche Antwort | Rechtlich/DSGVO relevant (Auftragsverarbeitung); nicht per SQL pruefbar |
| A12 | Verbindungen/TLS | `select ssl, version from pg_stat_ssl where pid = pg_backend_pid();` | `ssl = true`, TLS 1.2+ | Ohne TLS keine Produktion |
| A13 | Verbindungslimit | `show max_connections; select rolconnlimit from pg_roles where rolname = current_user;` | genug fuer 2 Pools (app, ops) + Migration + Wartung | Kleines Limit: Ops-Pool max 2 einplanen |

## Teil B: schreibt Testobjekte (leere Test-Datenbank, am Ende aufraeumen)

Fuer B1 bis B7 jeweils im selben Admin-Zugang. Passwoerter nur als Platzhalter, nach dem Test sind alle Rollen wieder weg.

| # | Frage | Befehl | Erwartet | Risiko/Hinweis |
|---|---|---|---|---|
| B1 | CREATE ROLE ohne Superuser | `create role spk_owner nologin; create role spk_migrate login password '<PASSWORT-PLATZHALTER>'; create role spk_app login password '<PASSWORT-PLATZHALTER>';` | alle drei ohne Fehler | Fehler `permission denied to create role`: Rollen nur ueber Oberflaeche anlegen |
| B2 | Mitgliedschaft vergeben, ohne Superuser | `grant spk_owner to spk_migrate;` | ok | PG 16: ggf. `with admin option`/`inherit`-Syntax noetig; Ergebnis melden |
| B3 | SET ROLE als Migrationsrolle | `set session authorization spk_migrate; set role spk_owner; select current_user, session_user; reset role; reset session authorization;` | `current_user = spk_owner`, `session_user = spk_migrate` | Ohne Erfolg: migrate.mjs-Konzept (`SET ROLE soccaz_owner`) nicht tragfaehig |
| B4 | Eigentuemer-Wechsel von Objekten | `create table spk_t(id int); create function spk_f() returns int language sql as 'select 1'; alter table spk_t owner to spk_owner; alter function spk_f() owner to spk_owner;` | ok (der Admin muss Mitglied von spk_owner sein oder die Rolle haben) | Faellt aus: db-owner.mjs (ALTER OWNER je Objekt) laeuft so nicht; kein `REASSIGN OWNED` voraussetzen |
| B5 | Datenbank-Besitzer bleibt Anbieter; owner darf Schema anlegen | `grant create on database <testdb> to spk_owner;` (Name der Testdatenbank einsetzen) | ok | Sonst kann `create schema drizzle` (Migrationsjournal) nicht als Eigentuemer laufen |
| B6 | Rechte-Whitelist moeglich (REVOKE/GRANT/Default-Rechte) | `revoke execute on function spk_f() from public; alter default privileges for role spk_owner in schema public revoke execute on functions from public; revoke create on schema public from public;` | ok | Fehler hier = Whitelist-Konzept (Plan Abschnitt 3.3) nicht umsetzbar |
| B7 | App-Rolle darf keine Sitzungs-/Rollenspruenge | als spk_app: `set role spk_owner;` und `set session authorization spk_owner;` und `set session_replication_role = replica;` | alle drei: `permission denied`/`must be member` | Erfolg waere ein Showstopper (dann Mitgliedschaft/Parameterrecht pruefen) |
| B8 | Logischer Restore-Test (dump und einspielen) | `pg_dump --no-owner --format=custom -f spike.dump "<URL>"` dann `pg_restore --no-owner -d "<URL-Zweit-Datenbank>" spike.dump` | ohne Fehler | Beweisprotokoll-Tabellen nur im Wartungsmodus (A1) einspielbar; hier nur die Maschinerie testen |
| B9 | Aufraeumen | `drop table spk_t; drop function spk_f(); revoke create on database <testdb> from spk_owner; drop role spk_app; drop role spk_migrate; drop role spk_owner;` | ok | Rest-Rollen sind clusterweit sichtbar: danach A3 wiederholen |

## Teil C: Konsole und Vertrag (keine SQL-Befehle)

| # | Frage | Wo | Erwartet | Hinweis |
|---|---|---|---|---|
| C1 | Backup/PITR: physisch (Basebackup/WAL, Wiederherstellung auf Zeitpunkt) vorhanden? Aufbewahrungsdauer, Region, Verschluesselung | Anbieter-Konsole/Vertrag | ja, mind. 7 Tage, EU-Region | Physischer Restore hat identische Kette (Regelfall, Plan 6a); logischer nur im Wartungsmodus |
| C2 | Restore-Test durch uns moeglich (Wiederherstellung in neue Instanz ohne Eingriff in Produktion)? | Konsole | ja | GO-LIVE-Pruefpunkt: einmal vor Live durchspielen, Kopf-Hash vergleichen |
| C3 | Zweiter Verbindungsstring/zweiter Benutzer je Rolle und Rotation der Passwoerter ohne Ausfall | Konsole | ja | Fuer soccaz_app, soccaz_ops, soccaz_migrate getrennt |
| C4 | Anbieter-Superuser: wer darf sich so verbinden, Protokollierung des Zugriffs, Zugang abschaltbar? | Vertrag/Konsole | dokumentiert | Bleibt ausserhalb des Schutzes; Tresor und Zugriffsprotokoll |
| C5 | pg_hba/IP-Freigabe: Zugang nur von der App-Umgebung? Passwort-Verfahren SCRAM? | Konsole | IP-Beschraenkung moeglich, `scram-sha-256` | Im Test: `show password_encryption;` erwartet `scram-sha-256` |
| C6 | Wartungsfenster/Failover: Verbindungsabbruch und neue Verbindung auf der Rolle (SET ROLE je Verbindung) | Konsole | dokumentiert | migrate.mjs setzt die Rolle je Verbindung neu |
| C7 | Support/Auftragsverarbeitung (AVV) und Datenstandort | Vertrag | AVV vorhanden, EU | Rechtlich: nur melden, nicht von mir zu entscheiden |

## Auswertung (Ampel)
- **Gruen:** A2 `rolcreaterole`, B1 bis B7 ohne Fehler, A6 direkter Port vorhanden, C1/C2 ja: Plan A2 ohne Aenderung baubar.
- **Gelb:** B4 oder B5 scheitern: Eigentumswechsel nur ueber Anbieter-Oberflaeche oder Anbieter-Admin; Plan A2 bekommt "Eigentum per Anbieter-Schritt" (Staging-Probe noetig).
- **Rot:** B3 oder B7 scheitern bzw. Pooler nur im Transaktionsmodus ohne direkten Port, oder kein physisches Backup: Modell nicht tragfaehig, anderen Anbieter/Betriebsweg waehlen.
