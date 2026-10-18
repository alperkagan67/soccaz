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
