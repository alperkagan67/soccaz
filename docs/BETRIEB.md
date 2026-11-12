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

### Kartenzahlung (Vertrag 012, Stripe)

- Eigener Webhook-Endpunkt `https://deine-domain/api/stripe/webhook` im Stripe-Dashboard, **getrennt** vom alten `/api/webhooks/stripe`. Stripe vergibt je Endpunkt ein eigenes Signaturgeheimnis (`whsec_...`): das der alten Route steht in `STRIPE_WEBHOOK_SECRET`, das der neuen in `STRIPE_CARD_WEBHOOK_SECRET`. Nie dasselbe Geheimnis für beide eintragen. Ereignisse der neuen Route: `setup_intent.succeeded`, `setup_intent.setup_failed` (Karte hinterlegen) sowie `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action` und `charge.updated` (Abbuchung, M2; beim Ausrollen von 012 M2a im Dashboard zusätzlich anmelden, sonst kommen keine Abbuchungsergebnisse an); später `charge.dispute.*`. Verspätete oder doppelte Ereignisse sind unkritisch (Idempotenz über `stripe_events`). Die alte Route `/api/webhooks/stripe` (Guthaben) entfällt mit 012 M6.
- Weitere Variablen: `STRIPE_SECRET_KEY` (gemeinsam) und `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` wird beim BAUEN in den Browser-Code eingebettet** (Dockerfile `ARG`, `docker-compose.yml` `build.args`, Wert aus der `.env`); `env_file` allein reicht nicht. Nach jeder Änderung des Werts neu bauen: `docker compose up -d --build`. Ohne Wert zeigt die Lobby kein Kartenformular. `pk_` und `sk_` müssen aus demselben Modus stammen (Test: `pk_test_`/`sk_test_`; Live: `pk_live_`/`sk_live_`); Staging nie mit Live-Schlüsseln bauen.
- **Worktrees und Stripe-Testschlüssel:** Der Nutzer trägt `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` und `STRIPE_CARD_WEBHOOK_SECRET` in `.env.local` ein (Testschlüssel, nie Live). `worktree.mjs` kopiert `.env.local` nur beim ANLEGEN eines Worktrees: Bestehende Worktrees bekommen neue Schlüssel nicht automatisch (Worktree neu anlegen oder `.env.local` selbst abgleichen). Worker-Apps brauchen `stripe listen --forward-to localhost:<Port>/api/stripe/webhook` (Port des Workers 3101-3104) mit eigenem Webhook-Secret (`whsec_...`, aus der Ausgabe von `stripe listen`, nur in der eigenen `.env.local`). Agenten lesen und geben `.env*` nie aus.
- **Kartenmodell einschalten (Go-live-Schritt):** `card_payments_enabled` nur ohne offene bezahlte Spiele umlegen; bezahlte Spiele bleiben im Guthaben-Modell bis zum Ende. Technisch gilt das Kartenmodell nur für Spiele der Frist-Regel, in denen kein Platz `paid_cents > 0` hat; Erstattung bei Austritt, Neuberechnung und Fixieren laufen für Spiele mit bezahlten Plätzen unverändert über das Guthaben. Altspiele und Turniere bleiben beim Guthaben.
- **Abbuchung (M2):** Die Ereignisse stehen im ersten Punkt. Abgebucht wird je Spieler der fixierte Anteil, mindestens 0,50 EUR (Überschuss bleibt in revenue); kostenlose Spiele werden nicht abgebucht. **`card_payments_enabled` darf in Produktion erst nach M3 (Nachzahlfenster, Nachrücker, Erstattung) und M4 (Dispute, DSGVO, E2E im Testmodus) eingeschaltet werden, und zwar erst, wenn M3c-1 (Fenster und Wiederabbuchen), M3c-1c (3-D-Secure-Freigabe) UND M3c-2 (Nachrücker, automatische Absage) gemergt UND deployt sind:** bis dahin bleibt ein Spiel mit fehlgeschlagener Abbuchung unabgerechnet, es hängt nach dem Ende des Fensters, `requires_action` bleibt eine Sackgasse, und es gibt keine Rückerstattung (siehe GO-LIVE-AUDIT G8-012/G9-012).
- **Absage mit Erstattung (M3a):** Hat ein Spiel Abbuchungszeilen, sagt nur **Admin 1** ab (`adminCancelMatch` / `adminCancelMatchAction`; der Captain nur vor der ersten Abbuchung). Die Absage wird angefordert (`matches.cancel_requested_at`), ab dann wird nichts mehr abgebucht oder abgerechnet; jede erfolgreiche Abbuchung wird voll auf die Karte erstattet (Tabelle `payment_refunds`, eine Zeile je Abbuchung, fester Schlüssel `refund:<Zeile>`, Hauptbuch Soll `revenue`, Haben `clearing`; **die Stripe-Gebühr der Abbuchung bleibt bei Soccaz und wird nicht zurückgebucht**). Erst wenn alle Erstattungen erfolgreich und keine Abbuchung mehr offen ist, wird das Spiel `cancelled`. Gelingt eine Abbuchung erst nach der Anforderung, wird sie sofort erstattet. Abbuchungen mit unbekanntem Ausgang werden vor dem Abschluss per Stripe-Suche (Metadaten) gesucht; ein Treffer wird verbucht und erstattet, kein Treffer (nach 5 Minuten) bleibt Audit `charge.search_empty` + Alarm, das Spiel bleibt "Absage angefordert". Job `card-refunds` (alle 5 Minuten) bringt angeforderte Absagen weiter. Webhook-Ereignisse zusätzlich anmelden: `refund.created`, `refund.updated`, `refund.failed` (und `charge.refund.updated`, `charge.refunded` werden nur vermerkt). **Alarm für Admin 1** (`getRefundAlerts` in `finance.ts`): fehlgeschlagene Erstattungen (z. B. `charge_disputed`: manuell über Stripe klären), Erstattungen mit unbekanntem Ausgang, Absagen länger als 1 Stunde offen, Abbuchungen mit unbekanntem Ausgang. Eine fehlgeschlagene Erstattung wird nie automatisch wiederholt.
- **Auslöser (M2b-2):** Der Job `card-charges` (alle 5 Minuten, unabhängig von `payments_enabled`) bucht Kartenspiele ab, sobald beide Captains bereit sind und die Frist erreicht ist (48 Stunden vor Anstoß, ggf. mit Karenz); bei weniger als 48 Stunden Vorlauf sofort nach dem zweiten Bereit (zusätzlich ohne Wartezeit aus `finalConfirm`, fehlgeschlagen holt der Job nach). Er bucht auch fehlende Stripe-Gebühren nach. Sobald Abbuchungszeilen existieren, sind Beitritt, Austritt, Rauswurf, Einteilung und **jede Absage (auch durch Admin oder Job) gesperrt** (Meldung: Abbuchung begonnen, bitte Support kontaktieren; einen Admin-Pfad gibt es bis M3 nicht), ebenso Bereit ändern, Ort ändern, Teams zusammenführen und Konto löschen: Erstattung auf die Karte gibt es erst mit M3. **Betriebsrisiko:** Nach dem Anstoß verarbeitet der Job die Zeilen nicht mehr; offene Zeilen (`pending`/`requires_action`) werden je Zeile einmal mit Audit `charge.after_start` markiert (nie erneut gesendet); `failure_code` wird dabei nur gesetzt, wenn er leer ist (ein vorhandener Code wie `authentication_required` bleibt und steht im Audit-Detail `previousCode`). Dann ist die Halle gebucht, aber nicht (voll) eingezogen, und es gibt noch keine Admin-Sicht oder Auflösung (M3/009): Audit und Zeilen manuell prüfen (GO-LIVE-Betriebsrisiko). Zeilen mit unbekanntem Ausgang (`failure_code = unknown_outcome`, Status `pending`, Audit `charge.unknown_outcome`) werden nie erneut gesendet und nie automatisch auf `failed` gesetzt; sie sind manuell bzw. per M3 über die Stripe-Suche aufzulösen. Ein Idempotenz-Konflikt (`idempotency_mismatch`) setzt die Zeile auf `failed`.
- **Konto-Löschung bei laufender Abbuchung (DSGVO Art. 17):** Hat ein offenes Spiel (`lobby`/`confirmed`) des Nutzers Abbuchungszeilen, lehnt `deleteAccount` ab ("Bitte wende dich an den Support; die Löschung wird nach Klärung der Abbuchung durchgeführt"). Die Zeilen bleiben bis M3 offen, das Spiel wird nie automatisch abgesagt; die Löschung läuft deshalb **manuell über den Support**, sobald die Abbuchung geklärt ist (Zeilen terminal oder erstattet). Zahlungsnachweise (Belege, Hauptbuch, Abbuchungszeilen) bleiben nach Handels- und Steuerrecht aufbewahrt, die Löschung anonymisiert nur personenbezogene Angaben (Frist: unverzüglich nach Klärung, spätestens innerhalb eines Monats). Nur relevant, solange `card_payments_enabled` AN ist; der Schalter geht in Produktion erst nach M3/M4 an.
- **Bekannter Rest-Zyklus (sehr eng):** `mergeTeams` sperrt Team -> Spiele, `deleteAccount` Spiel -> Team (archiviert das Team, wenn der Löschende dessen einziger Admin ohne Mitglieder ist). Treffen beide im selben Moment dasselbe Team, bricht Postgres eine der Transaktionen ab (Deadlock-Erkennung); nichts wird beschädigt, die Aktion lässt sich wiederholen.
- `PAYMENTS_FAKE` darf in Staging und Produktion nie gesetzt sein (nur Tests/CI). In Produktion mit `PAYMENTS_FAKE=1` bricht die Kartenzahlung mit einem harten Fehler ab. Ohne Stripe-Schlüssel und ohne `PAYMENTS_FAKE` ist die Kartenzahlung ausgeschaltet (Webhook antwortet 503).

Hinweise: Das Buchungsjournal ist unveränderlich (Datenbank-Trigger). Korrekturen sind Gegenbuchungen. Die Zahlungsgebühr wird beim Verbuchen **geschätzt** (Einstellung oben); die echten Gebühren stehen im Stripe-Dashboard und sollten monatlich abgeglichen werden.

### Lokale Entwicklung mit Stripe-Testmodus (Kurzfassung)

Die Einzelheiten stehen oben; hier die Reihenfolge für Worker-Worktrees. Nur Namen, nie Werte.

1. **Schlüssel (Testmodus, nie Live):** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` und `STRIPE_CARD_WEBHOOK_SECRET` stehen in der `.env.local` des Nutzers. Testschlüssel beginnen mit `sk_test_` bzw. `pk_test_`; ein Live-Schlüssel gehört in keine `.env.local`.
2. **Worktrees:** `scripts/worktree.mjs create` kopiert die `.env.local` aus SoccaV2 nur beim Anlegen und ändert dabei nur `DATABASE_URL` und `PORT`. Änderungen an der Haupt-`.env.local` (z. B. neue Stripe-Schlüssel) kommen in bestehende Worktrees nicht an: dort selbst nachtragen oder den Worktree neu anlegen. Agenten lesen und geben `.env*` nie aus.
3. **Webhook lokal:** `stripe listen --forward-to localhost:<Port>/api/stripe/webhook` mit dem Port des Servers (Worker 3101 bis 3104, Haupt-Instanz 3100). Das Signaturgeheimnis (`whsec_...`) aus der Ausgabe von `stripe listen` ist das Test-Webhook-Secret und kommt als `STRIPE_CARD_WEBHOOK_SECRET` in die `.env.local` des jeweiligen Worktrees, nicht in andere.
4. **`PAYMENTS_FAKE=1`** nur für Tests und CI (Fake-Anbieter ohne Stripe). In Produktion und Staging nie setzen: Staging läuft mit `NODE_ENV=production`; der Code verweigert `PAYMENTS_FAKE=1` nur bei `NODE_ENV=production` (`src/server/payments/provider.ts` wirft einen harten Fehler), die Regel für Staging ist also eine Betriebsregel und zugleich durch den Produktions-Build abgesichert. Ist `STRIPE_SECRET_KEY` gesetzt, wählt der Code Stripe statt des Fake-Anbieters; die Integrationstests brauchen den Fake-Anbieter und werden deshalb mit leerem Schlüssel gestartet (`STRIPE_SECRET_KEY= npm run test:integration`; die `.env.local` überschreibt eine schon gesetzte, auch leere Variable nicht). `STRIPE_WEBHOOK_SECRET` setzt die CI für die Tests auf einen Testwert (`.github/workflows/ci.yml`); lokal ist dafür nichts zu tun, die Tests, die ein Webhook-Geheimnis brauchen, setzen es selbst (z. B. `tests/integration/card-setup.test.ts`).
5. **`card_payments_enabled` umlegen:** nur ohne offene bezahlte Spiele (GO-LIVE G8-012; die Konto-Löschung bei laufender Abbuchung läuft nur über den Support), und in Produktion erst, wenn M3c-1 (Fenster und Wiederabbuchen), M3c-1c (3-D-Secure-Freigabe) UND M3c-2 (Nachrücker, automatische Absage) gemergt und deployt sind (GO-LIVE G8-012, G9-012).

## Hallen-Buchung

Sobald ein bezahltes Spiel bestätigt ist, entsteht im Admin-Bereich unter **Buchungen** ein Auftrag. Es gibt noch keinen automatischen Buchungs-Agenten: Die Halle wird per Telefon, Mail oder Webseite gebucht und im Auftrag eingetragen. Für einen späteren Agenten gibt es die Schnittstelle `src/server/booking-agent.ts`.
