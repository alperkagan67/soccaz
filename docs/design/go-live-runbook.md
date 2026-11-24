# Go-live-Runbook (Einseiter für den Betreiber): Soccaz auf einem eigenen Server

Stand: 2026-11-24 · Verfasser: worker-2 · Status: **Entwurf**, wird bei der Staging-Generalprobe (30.11. bis 2.12.) Schritt für Schritt belegt · Grundlage: `docs/BETRIEB.md`, `docs/design/pilot-staging-checkliste.md`, `docs/design/anbieter-vorlage.md`, `docs/design/google-anmeldung-anleitung.md` · **Werte (Passwörter, Schlüssel) stehen nie hier, nie im Chat, nie im Repository; nur die Namen der Einstellungen.**

Plan: Code-Freeze Fr 27.11., Generalprobe auf Staging 30.11. bis 2.12., Go-live Do 3.12./Fr 4.12. (Puffer 5.12.), Turnier Sa 12.12. Zahlungen sind in Produktion **aus**; Anmeldung mit **Google und Apple** (Apple hinter `APPLE_LOGIN_ENABLED=1`; ohne den Schalter nur Google).

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
cp .env.example .env && chmod 600 .env && nano .env
```
Erwartet: letzte Zeile ist der **abgestimmte Stand** (Nummer nennt der Task Manager). **Hinweis:** Eine eigene Produktionsvorlage (`.env.production.example`, wie sie `BETRIEB.md` nennt) liegt **nicht** im Repository; `.env.example` ist die einzige Vorlage und enthält Entwicklungswerte. Ersetzen Sie **jeden** Wert durch einen Produktionswert und ergänzen Sie fehlende Namen aus der Tabelle als Zeile `NAME=Wert`; Zeilen, die Sie nicht einordnen können, vor dem Start melden (nicht stehen lassen). In `.env` nur auf dem Server eintragen (Namen):
| Name | Wert |
|---|---|
| `POSTGRES_PASSWORD` | langes Zufallspasswort |
| `APP_URL` | `https://socaz.de` |
| `SITE_ADDRESS` | `socaz.de` (ohne `https://`) |
| `AUTH_SECRET` | `openssl rand -base64 32` (je Umgebung ein eigener) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | aus der Google-Anleitung |
| `APPLE_LOGIN_ENABLED` | `1` nur, wenn die Apple-Anmeldung eingerichtet ist (Nutzerentscheid: **Google und Apple**); sonst nicht setzen, dann gilt **nur Google** (Rückfall) |
| `JOB_SECRET` | Zufallswert |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | Impressum (Rechtstexte sind Entwürfe, Anwaltsprüfung) |
| **`TURNIER_ONLY`** | **`1` (Pflicht in Produktion):** nur Turniere; die übrigen Bereiche (Spiele, Suche, Hallen, Rangliste, Ligen u. a.) zeigen „Kommt bald“, ihre Live-Kanäle antworten 403. `0` = ausdrücklich alles offen. **Ohne die Variable** bleibt alles offen und die App schreibt beim Start diese Warnung ins Log: `[start] WARNUNG: TURNIER_ONLY ist in Produktion nicht gesetzt (1 = nur Turniere, 0 = alles offen). Pflichtvariable im Betriebsablauf.` Plattform-Admins sehen immer alles (Betrieb, Prüfung). |
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

## 3a. Umgebungsmarke (NUR Staging, einmalig)
Nur auf dem **Staging**-Server, nach dem ersten Start (Schritt 4), **einmal** (der Staging-Seed in Schritt 10 läuft ohne diese Marke nie):
```
sh scripts/staging-compose.sh exec -T db psql -U socaz -d socaz -c "insert into settings (key, value) values ('environment', '\"staging\"'::jsonb) on conflict (key) do update set value = excluded.value"
sh scripts/staging-compose.sh exec -T db psql -U socaz -d socaz -c "select key, value from settings where key = 'environment'"
```
Erwartet: `INSERT 0 1`, dann eine Zeile `environment | "staging"`. **Auf Produktion wird diese Marke nie gesetzt**; dort muss die zweite Abfrage **0 Zeilen** liefern (Prüfpunkt im Go-live).

## 4. Starten und Migration
```
docker compose up -d --build        # Staging: sh scripts/staging-compose.sh up -d --build
docker compose ps
docker compose logs migrate | tail -5
```
Danach die **Startwarnung** prüfen:
```
docker compose logs app | grep -c "TURNIER_ONLY ist in Produktion nicht gesetzt"
```
Erwartet: `0` (Variable ist gesetzt). `1` oder mehr = `TURNIER_ONLY` in der `.env` fehlt: eintragen, neu starten.

Erwartet: `db`, `app`, `caddy`, `backup` laufen (`uptime` nur, wenn Sie die optionale Überwachung mit `--profile monitoring` gestartet haben); `migrate` ist beendet (`Exited (0)`). **Die Datenbank-Migrationen laufen automatisch bei jedem Start.** Die Log-Warnung „soccaz_ops existiert nicht“ ist vor dem Rollenmodell (A2, nach dem 12.12.) normal. Keine neuen Migrationen bis zum Turnier (0061 bleibt frei).

## 4a. Betriebsregel Produktion: BEIDE Zahlungsschalter AUS
Für das Turnier (12.12.) und bis ausdrücklich anders entschieden gilt: **`payments_enabled` AUS und `card_payments_enabled` AUS.** Beide stehen im Admin-Bereich auf **einer** Seite, `https://socaz.de/admin/einstellungen` (nur Admin): das Häkchen **„Zahlungen einschalten“** (muss leer sein) und der Kasten **„Notabschaltung Kartenzahlung“** (muss „Die Kartenzahlung ist **AUS**“ zeigen). Grund: Ist nur der erste aus und der Kartenschalter an, richten Teile des Kartenwegs weiter Karten ein (Backlog 257); kein Geld fließt, aber die Oberfläche wäre irreführend. Beide Schalter sind ab Werk AUS.

Prüfung auf dem Server (zeigt nur Schlüssel und Wahrheitswert):
```
docker compose exec -T db psql -U socaz -d socaz -c "select key, value from settings where key in ('payments_enabled','card_payments_enabled')"
```
Erwartet: **keine Zeilen** (Standard AUS) oder beide mit `false`. Steht dort `true`: **STOPP**, im Admin-Bereich ausschalten und melden. Einschalten nur nach ausdrücklicher Entscheidung nach dem 12.12.

## 5. Smoke-Test (Gesundheit und Hauptseiten)
```
node scripts/smoke.mjs https://socaz.de --turnier-only --zahlungen-aus
```
Erwartet: jede Zeile `OK`, am Ende `Alle Prüfungen bestanden`, Ende-Code 0.

**`--zahlungen-aus`** (Produktion, beide Zahlungsschalter AUS, Schritt 4a): prüft zusätzlich die öffentlich sichtbare Folge: Turnierliste, Hilfe und die erste Turnierseite enthalten **kein Zahlungswort** (Wortliste wie `src/lib/zahlungen-aus.ts`), Liste und Hilfe nennen den Hinweissatz „Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.“. Ein Turnier **mit** Preis (Altbestand) zeigt Zahlungswörter und löst hier einen Befund aus: prüfen, nicht ignorieren. Die Schalter selbst sind nicht öffentlich prüfbar (nur Schritt 4a). Gilt ab dem Merge der Seitenänderung „Zahlungen AUS“ (PR A); davor schlägt die Prüfung der Hilfe fehl.

**Zweiter Aufruf (Sperrpfade der Betriebsart, nur Produktion mit `TURNIER_ONLY=1`):**
```
node scripts/smoke-turnier-only.mjs https://socaz.de
```
Erwartet: jede Zeile `PASS`, am Ende `ERGEBNIS: BESTANDEN`, Ende-Code 0. Er prüft ohne Anmeldung: die gesperrten Seiten (`/spiele`, `/matchmaking`, `/suche`, `/hallen`, `/rangliste`, `/mitspieler`, `/ligen`) antworten 200 mit „Kommt bald“ und `noindex` (kein 404), der Live-Kanal `/api/spiele/stream` antwortet 403, `/turniere`, `/hilfe`, `/impressum`, `/teams` bleiben offen. **Nicht für Staging mit Zugangsschutz:** dieses Skript kennt kein Passwort (alle Zeilen `FAIL`, Status 401); dort nur `smoke.mjs` mit `SMOKE_BASIC_AUTH` und die Sperrpfade einmal von Hand im Browser öffnen. **Gilt ab dem Merge von `feat/turnier-only`:** `TURNIER_ONLY` und die „kommt bald“-Seite unter `/spiele` gibt es erst danach; **bis dahin den Smoke-Test ohne `--turnier-only` aufrufen** und die Variable in der `.env` noch nicht verlangen. (Prüft `/api/health`, Anmeldeseite, `/turniere`, `/impressum`, `/robots.txt` und mit `--turnier-only` die „kommt bald“-Seite unter `/spiele`.) Zusätzlich prüft es, dass `/anmelden` **keinen Dev-Login** zeigt (in Produktion und Staging darf es ihn nie geben). Ist die Apple-Anmeldung eingeschaltet (`APPLE_LOGIN_ENABLED=1`), rufen Sie mit `--apple` auf: dann **muss** der Apple-Knopf da sein, sonst darf er **nicht** da sein. Das Skript braucht nur Node 22 (`node -v`); es nutzt keine Schlüssel.

## 6. Admin 1 festlegen (einmalig)
1. **Einmal mit Google anmelden** (Admin 1 ist eine Google-Adresse) (`https://socaz.de/anmelden`), damit das Konto existiert.
2. Konto zum Admin machen (Adresse nur als Wert am Server eintragen):
```
docker compose exec db psql -U socaz -c "update users set role='admin' where email='<ihre-google-adresse>'"
read -r -s OWNER_EMAIL; export OWNER_EMAIL     # Adresse verdeckt eingeben, Eingabe mit Enter beenden
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs --yes
unset OWNER_EMAIL; history -c
```
Erwartet: der Trockenlauf nennt nur Host und Datenbankname, `--yes` meldet Erfolg. (Der Aufruf über den `migrate`-Dienst ist eine **Annahme**: bei der Generalprobe belegen; sonst `BETRIEB.md`, „Admin 1 festlegen“. Die Adresse steht dank verdeckter Eingabe nur einmal im SQL-Befehl; deshalb danach `history -c`.)

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

## 10a. Staging-Seed für die Generalprobe (Teams 3 bis 6, nur Staging)
Für das Gratis-Turnier mit 6 Teams sind Teams 1 und 2 **echte** Konten; Teams 3 bis 6 legt `scripts/staging-seed.mjs` mit **erfundenen** Konten an (`probe-t3-s1@staging.invalid` …, Namen „Probe Konto T3-1“, Teams „Probe-Team 3“ bis „Probe-Team 6“; `.invalid` ist nie zustellbar, es wird nie Post verschickt). Das Skript hat eine **eigene Sperre** und verweigert ohne Umgebungsmarke (Schritt 3a), bei `APP_URL` = `socaz.de` oder `www.socaz.de` und ohne ausdrückliche Bestätigung. Ein Staging unter einer Unteradresse (z. B. `staging.socaz.de`) ist erlaubt.
```
sh scripts/staging-compose.sh run --rm -e APP_URL=https://<staging-adresse> -e STAGING_SEED_CONFIRM=ja-staging-seed migrate node scripts/staging-seed.mjs --turnier <turnier-id>
```
Erwartet: je Team eine Zeile „… 5 Konten, im Turnier angemeldet und bereit“ und am Ende „Fertig: 20 erfundene Konten (@staging.invalid, nie zustellbar), 4 Teams.“. Ohne `--turnier` entstehen nur Konten und Teams. `--turnier` verlangt ein **Gratis-Turnier** (Hallenkosten **genau 0**; ein Altturnier ohne Preisangabe zählt nicht) in der Anmeldung mit mindestens vier freien Plätzen. **REIHENFOLGE (wichtig):** erst die Teams anmelden lassen, **dann seeden, DANACH** melden die echten Teams 1 und 2 „vollzählig“: das **letzte** „vollzählig“ löst den Preisschritt und damit das Bracket aus. Der Seed setzt „vollzählig“ direkt in der Datenbank und ruft die Turnierlogik nicht auf; sind echte Teams schon vollzählig, **verweigert** das Skript (Meldung „erst den Seed laufen lassen“): ein echter Captain nimmt „vollzählig“ zurück (aus und wieder an), dann seeden. Sonst startet das Bracket nie von selbst und „Anmeldung schließen“ meldet, dass alle Plätze belegt sind. Die vier Teams stehen dann auf „vollzählig“ und „Bereit“ (**Annahme**, bei der Generalprobe belegen: der Ablauf der echten Captains danach bis zum Bracket). Aufräumen nach der Probe: dasselbe mit `--clean` statt `--turnier`; **sobald mit den Probe-Teams Turnierspiele gespielt wurden, scheitert `--clean`** (Datenbank-Verweise, nichts geht verloren): dann die gesamte Staging-Datenbank zurücksetzen oder den Server nach der Generalprobe löschen. Eine Staging-Sicherung darf **nie** in Produktion eingespielt werden (sie enthält die Marke). **Mail:** Die erfundenen Konten (`@staging.invalid`) bekommen In-App-Benachrichtigungen; auf **Staging darf kein Mailanbieter konfiguriert sein** (keine Zugangsdaten eines Mailanbieters in die Staging-`.env`), sonst gäbe es Fehlzustellungen und eine schlechtere Reputation des Absenders. Gibt es später einen Mailversand (Backlog 211), muss er auf Staging aus sein oder `.invalid`-Adressen verwerfen, ohne zu senden. Verweigert das Skript („Staging-Seed verweigert: …“), **nichts umgehen**: Marke, Adresse oder Bestätigung prüfen und melden.

## 10. Staging ist anders
Staging nur mit `sh scripts/staging-compose.sh …` starten (Zugangsschutz, Banner, noindex); nur Stripe-Testschlüssel; nie auf dem Produktionsserver. Vollständiger Ablauf: `pilot-staging-checkliste.md`.
