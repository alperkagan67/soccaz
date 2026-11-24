# Go-live-Runbook (Einseiter für den Betreiber): Soccaz auf einem eigenen Server

Stand: 2026-11-24 · Verfasser: worker-2 · Status: **Entwurf**, wird bei der Staging-Generalprobe (30.11. bis 2.12.) Schritt für Schritt belegt · Grundlage: `docs/BETRIEB.md`, `docs/design/pilot-staging-checkliste.md`, `docs/design/anbieter-vorlage.md`, `docs/design/google-anmeldung-anleitung.md` · **Werte (Passwörter, Schlüssel) stehen nie hier, nie im Chat, nie im Repository; nur die Namen der Einstellungen.**

Plan: Code-Freeze Fr 27.11., Generalprobe auf Staging 30.11. bis 2.12., Go-live Do 3.12./Fr 4.12. (Puffer 5.12.), Turnier Sa 12.12. Zahlungen sind in Produktion **aus**; Anmeldung nur mit Google.

Jeder Schritt: **Befehl**, dann **Erwartet**. Stimmt es nicht: **stoppen und melden**, nicht weitermachen.

## 1. Server einrichten (ca. 1 Std.)
Server bestellen (Anbieter siehe Anbieter-Vorlage), Ubuntu 24.04, SSH-Schlüssel hinterlegen. Dann per SSH:
```
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
docker compose version
```
Erwartet: eine Versionszeile (Compose 2.x). Firewall: nur Ports 22, 80, 443 offen.

## 2. Domain und HTTPS (TLS)
Bei Ihrem Domain-Anbieter einen **A-Eintrag** `socaz.de` (und `www`, falls gewünscht) auf die Server-IP setzen; Staging bekommt eine eigene Adresse (z. B. `staging.socaz.de`). Caddy holt das HTTPS-Zertifikat **selbst**, sobald die Domain auf den Server zeigt.
```
nslookup socaz.de
```
Erwartet: die Server-IP. (Warten Sie bei Abweichung, DNS braucht Minuten bis Stunden; zu früh starten erzeugt nur Zertifikatsfehler, kein Schaden.)

## 3. Code holen und Einstellungen anlegen
```
git clone https://github.com/alperkagan67/soccaz.git && cd soccaz
git log --oneline -1
cp .env.production.example .env && chmod 600 .env && nano .env
```
Erwartet: letzte Zeile ist der **abgestimmte Stand** (Nummer nennt der Task Manager). In `.env` nur auf dem Server eintragen (Namen):
| Name | Wert |
|---|---|
| `POSTGRES_PASSWORD` | langes Zufallspasswort |
| `APP_URL` | `https://socaz.de` |
| `SITE_ADDRESS` | `socaz.de` (ohne `https://`) |
| `AUTH_SECRET` | `openssl rand -base64 32` (je Umgebung ein eigener) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | aus der Google-Anleitung |
| `JOB_SECRET` | Zufallswert |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | Impressum (Rechtstexte sind Entwürfe, Anwaltsprüfung) |
| **`TURNIER_ONLY`** | **`1` (Pflicht in Produktion).** Standard ist AUS; ohne die Variable startet die App mit einer **Warnung im Server-Log**. Sie schaltet die Turnier-Fassung ein (Spielseiten zeigen „kommt bald“). |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **leer lassen**: Zahlungen sind aus. Kein `PAYMENTS_FAKE`. |
Prüfen, ohne Werte zu zeigen:
```
grep -c "^TURNIER_ONLY=1" .env
grep -c "^PAYMENTS_FAKE=" .env
```
Erwartet: `1` und `0`. (`.env` nie ausgeben oder verschicken.)

**PAUSE-Prüfpunkt: `PAYMENTS_FAKE` ist nicht gesetzt** (Pflicht vor jedem Start und nach jedem Update; Treffer = **STOPP**, nicht starten). Zusätzlich zur `.env` auch die Umgebung des **laufenden** Containers prüfen (nach dem Start, Schritt 4):
```
docker compose exec -T app sh -c 'test -z "$PAYMENTS_FAKE" && echo OK || echo STOPP'
```
Erwartet: `OK`. `STOPP` = Variable aus `.env` und aus Compose-Dateien entfernen, neu starten, erneut prüfen. Die Anwendung selbst **startet in Produktion nicht**, wenn `PAYMENTS_FAKE=1` gesetzt ist (Startsperre; Meldung im Log `PAYMENTS_FAKE=1 ist in Produktion verboten`). Das gilt auch für Staging.

## 4. Starten und Migration
```
docker compose up -d --build        # Staging: sh scripts/staging-compose.sh up -d --build
docker compose ps
docker compose logs migrate | tail -5
```
Erwartet: `db`, `app`, `caddy`, `backup` laufen; `migrate` ist beendet (`Exited (0)`). **Die Datenbank-Migrationen laufen automatisch bei jedem Start.** Die Log-Warnung „soccaz_ops existiert nicht“ ist vor dem Rollenmodell (A2, nach dem 12.12.) normal. Keine neuen Migrationen bis zum Turnier (0061 bleibt frei).

## 5. Smoke-Test (Gesundheit und Hauptseiten)
```
node scripts/smoke.mjs https://socaz.de --turnier-only
```
Erwartet: jede Zeile `OK`, am Ende `Alle Prüfungen bestanden`, Ende-Code 0. (Prüft `/api/health`, Anmeldeseite, `/turniere`, `/impressum`, `/robots.txt` und mit `--turnier-only` die „kommt bald“-Seite unter `/spiele`.) Zusätzlich prüft es, dass `/anmelden` **keinen Dev-Login** zeigt (in Produktion und Staging darf es ihn nie geben). Ist die Apple-Anmeldung eingeschaltet (`APPLE_LOGIN_ENABLED=1`), rufen Sie mit `--apple` auf: dann **muss** der Apple-Knopf da sein, sonst darf er **nicht** da sein. Das Skript braucht nur Node 22 (`node -v`); es nutzt keine Schlüssel.

## 6. Admin 1 festlegen (einmalig)
1. **Einmal mit Google anmelden** (`https://socaz.de/anmelden`), damit das Konto existiert.
2. Konto zum Admin machen (Adresse nur als Wert am Server eintragen):
```
docker compose exec db psql -U socaz -c "update users set role='admin' where email='<ihre-google-adresse>'"
docker compose run --rm -e OWNER_EMAIL=<ihre-google-adresse> migrate node scripts/set-owner.mjs
docker compose run --rm -e OWNER_EMAIL=<ihre-google-adresse> migrate node scripts/set-owner.mjs --yes
```
Erwartet: der Trockenlauf nennt nur Host und Datenbankname, `--yes` meldet Erfolg. (Der Aufruf über den `migrate`-Dienst ist eine **Annahme**: bei der Generalprobe belegen; sonst `BETRIEB.md`, „Admin 1 festlegen“.)

## 6a. Apple-Anmeldung (nur falls eingeschaltet: `APPLE_LOGIN_ENABLED=1`)
Das **Apple-Client-Secret läuft ab** (Apple erlaubt höchstens 6 Monate). **Erneuerung spätestens alle 5 Monate.** Tragen Sie das **Ablaufdatum** in der Betriebsdoku ein (`docs/BETRIEB.md`, Abschnitt „Apple-Anmeldung“, Zeile „Client-Secret gültig bis: <Datum>“) und legen Sie sich **zwei Kalendereinträge** an: 4 Wochen vor Ablauf und am Tag vor Ablauf. Läuft das Secret ab, schlägt die Apple-Anmeldung still fehl (Google bleibt unberührt). Prüfung nach der Erneuerung: Smoke-Test mit `--apple` und eine echte Anmeldung.

## 7. Sicherung (Backup) und Wiederherstellungsprobe
- Läuft automatisch: täglich 03:30 UTC, 14 Tage in `./backups`. Sofort: `docker compose exec backup sh /backup-loop.sh once`; Erwartet: neue Datei `backups/socaz-…sql.gz`.
- **Vor dem Go-live einmal** die Wiederherstellung testen: `sh scripts/restore-test.sh`; Erwartet: Zahlen für Tabellen und Nutzer, kein Fehler.
- Zusätzlich Sicherungen **außerhalb** des Servers ablegen und die Server-Backups des Anbieters einschalten.

## 8. Rollback (zurück auf den vorigen Stand)
```
git checkout <vorheriger-commit>
docker compose up -d --build
```
Erwartet: Smoke-Test (Schritt 5) wieder grün. **Datenbankänderungen gehen nur vorwärts:** vor jedem Update eine Sicherung ziehen (Schritt 7). Notfall Datenbank: Sicherung zurückspielen (`BETRIEB.md`, „Sicherung und Wiederherstellung“).

## 9. Update im Betrieb
`git pull && docker compose up -d --build`, danach Smoke-Test. Nach Code-Freeze nur Fehlerbehebungen, jede mit Sicherung davor.

## 10. Staging ist anders
Staging nur mit `sh scripts/staging-compose.sh …` starten (Zugangsschutz, Banner, noindex); nur Stripe-Testschlüssel; nie auf dem Produktionsserver. Vollständiger Ablauf: `pilot-staging-checkliste.md`.
