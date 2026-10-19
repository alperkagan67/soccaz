# Betrieb

Alles läuft mit Docker Compose: App, PostgreSQL, Caddy (HTTPS) und eine tägliche Sicherung. Kein Kubernetes.

## Erstinstallation (Server, z. B. Hetzner Cloud CX22)

1. Server mit Ubuntu 24.04, Docker und Docker Compose installieren, Domain per A-Record auf die Server-IP legen.
2. Repository klonen: `git clone https://github.com/alperkagan67/soccaz.git && cd soccaz`
3. Konfiguration anlegen: `cp .env.production.example .env` und alle Werte eintragen (Datenbankpasswort, Domain, `AUTH_SECRET`, Google, `JOB_SECRET`).
4. Starten: `docker compose up -d --build`
5. Prüfen: `https://deine-domain/api/health` liefert `{"status":"ok"}`.
6. Den ersten Admin festlegen (einmalig, nach der ersten Anmeldung):
   `docker compose exec db psql -U socaz -c "update users set role='admin' where email='deine@mail.de'"`

Die Migrationen laufen automatisch bei jedem Start (`migrate`-Dienst).

## Hallenliste

Die Datei `data/nrw-hallen-osm.json` enthält Soccer- und Fußballhallen in NRW aus OpenStreetMap (ODbL, ungeprüft). Einspielen (mehrfach ausführbar, überschreibt keine geprüften Hallen):

```
docker compose run --rm migrate node scripts/import-venues.mjs
```

Neu abrufen: `node scripts/fetch-venues-osm.mjs` (braucht Internet, dauert eine Minute). Im Admin-Bereich unter Hallen markierst du eine Halle als geprüft, sobald Buchbarkeit, Adresse und Preis stimmen. Geprüfte und Partnerhallen kommen im Veto zuerst.

## Überwachung

- **Fehler:** Sentry (`SENTRY_DSN` in der `.env`).
- **Erreichbarkeit:** Uptime Kuma als optionaler Dienst: `docker compose --profile monitoring up -d`. Er lauscht nur auf dem Server (Port 3001) und ist per SSH-Tunnel erreichbar: `ssh -L 3001:127.0.0.1:3001 <server>`. Beim ersten Öffnen Konto anlegen, dann einen HTTP-Monitor auf `https://<domain>/api/health` (Antwort `{"status":"ok"}`) und Benachrichtigung per E-Mail oder Telegram einrichten.
- **Geschäftszahlen** (Spiele, Umsatz, Guthaben, Auszahlungen) stehen im Admin-Bereich unter Finanzen. Prometheus und Grafana sind bewusst nicht dabei: Sie lohnen sich erst, wenn mehrere Server laufen.

## Betreiberangaben

Impressum und Datenschutzerklärung zeigen `OPERATOR_NAME`, `OPERATOR_ADDRESS` und `OPERATOR_EMAIL` aus der `.env`. Ohne diese Werte steht dort ein deutlicher Hinweis. Die Rechtstexte sind Entwürfe und müssen vor dem Start geprüft werden.

## Turniere und Veranstalter

Turniere dürfen nur freigeschaltete Veranstalter anlegen (Admin, Nutzer, „Als Turnier-Veranstalter freischalten“). Startgelder liegen bis zum Turnierende auf dem Konto `tournament`. Die Provision (Standard 10 Prozent) steht in der Tabelle `settings` unter `tournament_commission_percent`.

## Monatsjob

Am 1. jedes Monats schreibt `close-city-challenge` den Vormonat der Stadt-Challenge fest. Er ist mehrfach ausführbar und wirkt nur einmal. Alle Jobs: `src/server/jobs.ts`.

## Google-Anmeldung einrichten

Google Cloud Console, Projekt anlegen, APIs und Dienste, Anmeldedaten, OAuth-Client-ID (Webanwendung).
Autorisierte Weiterleitungs-URI: `https://deine-domain/api/auth/callback/google`. Client-ID und Geheimnis in `.env`.

## Update

```
git pull
docker compose up -d --build
```

Rückgängig: `git checkout <vorheriger-commit>` und erneut `docker compose up -d --build`. Datenbankänderungen sind nur vorwärts, deshalb vorher sichern.

## Sicherung und Wiederherstellung

- Täglich 03:30 UTC erzeugt der Dienst `backup` eine Sicherung in `./backups` (14 Tage Aufbewahrung).
- Sofort sichern: `docker compose exec backup sh /backup-loop.sh once`
- **Monatlich testen:** `sh scripts/restore-test.sh` stellt die neueste Sicherung in einer Wegwerf-Datenbank wieder her und zählt Tabellen und Nutzer. Eine Sicherung ohne diesen Test gilt nicht als Sicherung.
- Sicherungen zusätzlich außerhalb des Servers ablegen (z. B. Hetzner Storage Box per `rsync` oder `rclone`).
- Wiederherstellen in die echte Datenbank: `gunzip -c backups/socaz-….sql.gz | docker compose exec -T db psql -U socaz -d socaz`

## Überwachung

| Stufe | Werkzeug | Einrichtung |
|---|---|---|
| Sofort | Uptime Kuma | eigener Container, Monitor auf `/api/health`, Benachrichtigung aufs Handy |
| Sofort | Fehlerprotokoll | `SENTRY_DSN` in `.env` setzen; ohne Wert gehen Fehler nur ins Containerprotokoll (`docker compose logs app`) |
| Bei echten Nutzern | Plausible | datenschutzfreundliche Statistik |
| Vor dem Geld-System | Prometheus und Grafana | Serverwerte, Alarme |

Geschäftszahlen (Spiele, Umsatz, Erstattungen) stehen im Admin-Dashboard, nicht in Grafana.

## Zeitplaner

Im Betrieb startet die App den Zeitplaner (pg-boss) selbst: Benachrichtigungen, Erinnerungen, automatische Absage, automatische Ergebnisbestätigung, Aufräumen. Einen Job von Hand anstoßen:

```
curl -X POST -H "x-job-secret: $JOB_SECRET" https://deine-domain/api/jobs/send-reminders
```

## Umgebungen

- **Lokal:** `npm run dev` mit Postgres (siehe README).
- **Staging:** zweite Compose-Installation auf einem kleinen Server mit eigener Domain und Test-Zugangsdaten. Das Geld-System wird nie gegen die Produktion getestet.
- **Produktion:** wie oben.

## Zahlungen einschalten

1. Rechtliches klären (Gewerbe, Steuer, AGB, Widerruf, Guthaben-Regeln). Siehe PLAN.md. Erst danach echtes Geld annehmen.
2. Stripe-Konto anlegen, Zahlungsmethoden (Karte, PayPal, SEPA) aktivieren.
3. In `.env`: `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` eintragen, Webhook-Endpunkt `https://deine-domain/api/webhooks/stripe` mit den Ereignissen aus `.env.production.example` anlegen.
4. `docker compose up -d --build`, dann im Admin-Bereich unter **Einstellungen** den Zahlungsanbieter prüfen (muss "Stripe" zeigen) und **Zahlungen einschalten**.
5. Testen mit Stripe-Testschlüsseln (`sk_test_...`, Testkarte 4242 4242 4242 4242), bevor die Live-Schlüssel eingetragen werden.
6. Preise stehen unter **Hallen** (Standardpreise: 60 Minuten 80 Euro, 90 Minuten 110 Euro). Hallenkosten und Marge sind dort pro Regel einstellbar.

Hinweise: Das Buchungsjournal ist unveränderlich (Datenbank-Trigger). Korrekturen sind Gegenbuchungen. Die Zahlungsgebühr wird beim Verbuchen **geschätzt** (Einstellung oben); die echten Gebühren stehen im Stripe-Dashboard und sollten monatlich abgeglichen werden.

## Hallen-Buchung

Sobald ein bezahltes Spiel bestätigt ist, entsteht im Admin-Bereich unter **Buchungen** ein Auftrag. Es gibt noch keinen automatischen Buchungs-Agenten: Die Halle wird per Telefon, Mail oder Webseite gebucht und im Auftrag eingetragen. Für einen späteren Agenten gibt es die Schnittstelle `src/server/booking-agent.ts`.
