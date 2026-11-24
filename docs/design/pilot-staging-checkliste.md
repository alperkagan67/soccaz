# Pilot-Testumgebung (Staging): Checkliste zum Aufbauen

Stand: 2026-11-24 · Code-Stand `origin/main` 18d082e · Verfasser: worker-4 · Auftrag: t2q/t2s · Status: Entwurf, Review offen · Quellen: `docs/BETRIEB.md` (Erstinstallation, Umgebungen, Kartenzahlung, Sicherung), `docker-compose.yml`, `Caddyfile`, `pilot-plan.md` 4.1, `pilot-technik.md`, `pilot-vorprobe.md` (Teil A, B, G), `pilot-daten-plan.md`, `g25-009-a2-definer-entwurf.md`

**Was das ist:** Staging ist eine **zweite, getrennte Kopie** von Soccaz auf einem eigenen Server mit eigener Internet-Adresse. Dort laufen nur Stripe-**Testkarten**, nie echtes Geld (`BETRIEB.md`, Umgebungen). Diese Seite führt Schritt für Schritt durch den Aufbau; jeder Schritt hat einen Befehl und „Erwartet“. Alle Werte (Passwörter, Schlüssel, Adresse) trägst **du selbst nur auf dem Server** ein; sie gehören nie ins Repository, nie in einen Chat und nie in eine Notiz. Hier stehen nur die **Namen**.

**Begriffe:** *Server* = der gemietete Rechner. *Compose* = das Programm, das alle Teile (App, Datenbank, Webserver, Sicherung) zusammen startet. *Webhook* = die Rückmeldung von Stripe an unsere Seite („Zahlung ging durch“). *Caddy* = der Webserver, der das HTTPS-Schloss (verschlüsselte Verbindung) besorgt. Befehle tippst du auf dem Server (per SSH) im Ordner der Installation.

**Geltungsbereich (Abgleich mit dem Go-live-Runbook, 2026-11-24):** Diese Checkliste beschreibt den **Pilot mit Stripe-Testkarten** (Zahlungen AN). Für die **Turnier-Generalprobe 30.11. bis 2.12.** (Zahlungen **AUS**, `TURNIER_ONLY=1`, kein Stripe) gilt `go-live-runbook.md` zusammen mit `staging-generalprobe-plan.md`; die Schritte **S3 (Stripe-Schlüssel), S9, S10 und S11 entfallen dort** (siehe Abschnitt „Abgleich mit dem Go-live-Runbook“ am Ende). Der Aufbau bis S8 und S12 ist in beiden Dokumenten derselbe und wird nur im **Runbook** weitergepflegt; Abweichungen stehen unten.

## Vorher bereithalten (Nutzer)
- [ ] Ein kleiner Server (Ubuntu 24.04, Docker und Docker Compose installiert), **nur für Staging**. Ein zweiter Mieter auf dem Produktionsserver ist nicht vorgesehen; läuft Staging doch auf demselben Rechner, braucht es einen anderen Projektnamen (`docker compose -p …`) und andere Ports (siehe Lücke 7).
- [ ] Eine eigene Adresse (z. B. `staging.<deine-domain>`), per A-Eintrag auf die Server-Nummer gelegt.
- [ ] Stripe-Konto im **Testmodus**: Schlüssel `sk_test_…` und `pk_test_…` (Stripe-Dashboard, Entwickler, API-Schlüssel).
- [ ] Anmeldung: **Google und Apple** (Nutzerentscheid; Apple hinter `APPLE_LOGIN_ENABLED=1`, ohne den Schalter nur Google). Apple-Zugangsdaten nur, wenn Apple auf Staging getestet werden soll.
- [ ] Google-Anmeldedaten (OAuth-Client) mit der Weiterleitungs-Adresse `https://<staging-adresse>/api/auth/callback/google` **oder** die Entscheidung für Testkonten (`pilot-plan.md` Frage 2).
- [ ] Wer **Admin 1** ist (eine Google-E-Mail-Adresse).

## Aufbau in 12 Schritten
Jeder Schritt: Befehl, danach **Erwartet**. Stimmt es nicht, **stoppen** und melden.

**S1 Code holen**
```
git clone <Adresse des Repositorys> soccaz-staging && cd soccaz-staging
git log --oneline -1
```
Erwartet: letzte Zeile ist der abgestimmte Stand von `main` (Nummer vom Task Manager vorgegeben).

**S2 Einstellungen anlegen** (Namen siehe Runbook Schritt 3; Werte nur auf dem Server). Eine Produktionsvorlage `.env.production.example` gibt es **nicht**; `.env.example` ist die einzige Vorlage und enthält **Entwicklungswerte**: jeden Wert ersetzen, fehlende Namen ergänzen, unbekannte Zeilen melden.
```
cp .env.example .env
chmod 600 .env
nano .env
```
Eintragen: `POSTGRES_PASSWORD`, `APP_URL` (`https://<staging-adresse>`), `SITE_ADDRESS` (nur die Adresse, ohne `https://`), `AUTH_SECRET` (zufällig, z. B. `openssl rand -base64 32`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `JOB_SECRET` (zufällig), `STRIPE_SECRET_KEY` (`sk_test_`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_`), `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` (Pflicht für Impressum, sonst Hinweis auf der Seite), dazu für den Zugangsschutz `STAGING_BASIC_AUTH_USER` und `STAGING_BASIC_AUTH_HASH` (bcrypt-Hash, **in einfachen Anführungszeichen**; Erzeugung: `docker run --rm -it caddy:2-alpine caddy hash-password`, das Passwort wird verdeckt abgefragt und landet nicht im Verlauf). **Optional/aus:** `OPERATOR_TAX_ID`, `RESEND_API_KEY`, `EMAIL_FROM` (der Mail-Dienst steht noch in `FEHLT-NOCH.md`). **Nicht** eintragen: `PAYMENTS_FAKE`, `STRIPE_WEBHOOK_SECRET` (alter Pfad, entfällt), `SOCAZ_REQUIRE_A2` (vor A2), `DATABASE_URL_OPS` (vor A2), `MATCH_PHOTOS_ENABLED` (Standard aus), keinen Live-Schlüssel (`sk_live_`).
Erwartet: Datei gespeichert, `chmod 600 .env` gesetzt.

**S3 Schlüssel prüfen, ohne sie zu zeigen** (Vorprobe A4, A6; **nur Pilot mit Karten**: in der Turnier-Generalprobe sind die Stripe-Namen leer, geprüft wird stattdessen Runbook 3: `TURNIER_ONLY=1`, kein `PAYMENTS_FAKE`)
```
grep -c "^PAYMENTS_FAKE=" .env
grep -o "^STRIPE_SECRET_KEY=.\{8\}" .env
```
Erwartet: erste Ausgabe `0`; zweite `STRIPE_SECRET_KEY=sk_test_` (nur das Präfix, nie der Rest). `sk_live_` oder leer = **Abbruch**.

**S4 Bauen und starten** (der öffentliche Stripe-Schlüssel wird dabei fest eingebaut: nach jeder Änderung neu bauen)
```
docker compose -f docker-compose.yml -f docker-compose.staging.yml config > /dev/null
docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
docker compose ps
```
**ACHTUNG: Staging nur mit dem Staging-Override starten.** Ein einfaches `docker compose up` startet **ohne** Zugangsschutz, Banner und noindex. Am sichersten: `sh scripts/staging-compose.sh up -d --build` (setzt den Override immer).
(Der erste Befehl prüft ohne Start: fehlt der Zugangsschutz in der `.env`, bricht er mit „… fehlt“ ab. Ab hier jeden `docker compose`-Befehl auf Staging mit `-f docker-compose.yml -f docker-compose.staging.yml` geben, oder einmal `export COMPOSE_FILE=docker-compose.yml:docker-compose.staging.yml` setzen.)
Erwartet: `config` ohne Fehler; `db`, `app`, `caddy`, `backup` laufen; `migrate` ist beendet mit `Exited (0)`.

**S5 Datenbank-Änderungen geprüft** (Vorprobe A3)
```
docker compose logs migrate | grep -i -c "WARNING\|ERROR"
```
Erwartet: `0`. Eine Zeile `WARNING: soccaz_ops existiert nicht` ist **vor A2 normal** (nur Hinweis, `BETRIEB.md` Ops-Pool); alles andere melden.

**S6 Erreichbarkeit und HTTPS** (Vorprobe A1)
```
curl -s https://<staging-adresse>/api/health
```
Erwartet: `{"status":"ok"}` und kein Zertifikatsfehler (Caddy holt das Schloss selbst; Ports 80 und 443 müssen offen sein, Adresse muss auf den Server zeigen).

**S7 Zugangsschutz prüfen und erster Login** (Vorprobe A10; Basic-Auth im Caddy, siehe `BETRIEB.md`, Staging)
```
curl -s -o /dev/null -w "%{http_code}
" https://<staging-adresse>/
curl -s -o /dev/null -w "%{http_code}
" -u <Benutzer> https://<staging-adresse>/
curl -s -o /dev/null -w "%{http_code}
" -X POST https://<staging-adresse>/api/stripe/webhook
curl -s https://<staging-adresse>/robots.txt -u <Benutzer>
```
Erwartet: erster Befehl **401** (ohne Zugang gesperrt); zweiter **200** (`curl` fragt das Passwort ab, es steht nicht im Verlauf); dritter **400** (Webhook ist ohne Zugang erreichbar und wird erst von der Signaturprüfung abgewiesen, **nicht** 401); vierter zeigt `Disallow: /`.
**Erster Staging-Login (belegt eine ANNAHME):** im Browser die Adresse öffnen, Benutzer und Passwort eingeben, dann „Mit Google anmelden“. Erwartet: Google fragt nach dem Konto und die Rückleitung landet **angemeldet** auf der Seite, ohne zweite Passwortabfrage und ohne 401. Misslingt es (401 bei der Rückleitung), **stoppen und melden**: **Fallback** ist eine Ausnahme für `/api/auth/*` im `Caddyfile.staging`. Das ist das größte Funktionsrisiko des Zugangsschutzes: bitte in Chrome **und** Safari **und** Firefox (iPhone/Android) je einmal anmelden. Kosmetisch: der Abruf der App-Beschreibung (`manifest`) vor der Passwortabfrage kann 401 liefern; das ist gewollt und stört nicht.

**S8 Erstes Admin-Konto** (Vorprobe C9/C10; einmalige, benannte Ausnahme laut `BETRIEB.md`)
1. Admin 1 öffnet `https://<staging-adresse>/anmelden` und meldet sich einmal an.
2. Dann auf dem Server:
```
docker compose exec db psql -U socaz -c "update users set role='admin' where email='<Admin-1-Adresse>'"
read -r -s OWNER_EMAIL; export OWNER_EMAIL
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs
docker compose run --rm -e OWNER_EMAIL migrate node scripts/set-owner.mjs --yes
```
(Die Adresse wird verdeckt eingegeben und exportiert, damit sie nicht in der Befehlszeile und im Verlauf steht; im SQL-Befehl darüber steht sie einmal, danach den Verlauf löschen: `history -c`.) Erwartet: erster Aufruf zeigt nur Host und Datenbankname (Trockenlauf), zweiter meldet Erfolg; `/admin` ist für Admin 1 erreichbar, für andere Konten nicht. (`set-owner` läuft im Hilfsdienst `migrate`, dort steht die Datenbank-Adresse schon; der Wert wird nie ausgegeben. `BETRIEB.md` beschreibt nur den Aufruf ohne Compose, siehe Lücke 11.)

**S9 Stripe-Webhook einrichten** (Vorprobe B1; **nur Pilot mit Karten**, entfällt bei Zahlungen AUS)
Stripe-Dashboard, **Testmodus**, Entwickler, Webhooks, „Endpunkt hinzufügen“: Adresse `https://<staging-adresse>/api/stripe/webhook`; Ereignisse: `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `charge.updated` sowie für Erstattungen `refund.created`, `refund.updated`, `refund.failed`, `charge.refund.updated`, `charge.refunded` (ohne sie bleiben asynchrone Erstattungen auf „angefordert“ stehen: Absage nach Abbuchung, Spiel B, Nachrücker-Absage) und für Zahlungsstreit `charge.dispute.created`, `.updated`, `.funds_withdrawn`, `.funds_reinstated`, `.closed`. Das angezeigte Signaturgeheimnis (`whsec_…`) kommt als `STRIPE_CARD_WEBHOOK_SECRET` in die `.env`, dann:
```
docker compose up -d --build app
```
Erwartet: Endpunkt „Aktiv“; **der alte Endpunkt `/api/webhooks/stripe` ist nicht angelegt** (sonst doppelte Meldungen).

**S10 Webhook testen** (Vorprobe B2 bis B5; **nur Pilot mit Karten**, entfällt bei Zahlungen AUS)
```
stripe trigger setup_intent.succeeded
curl -s -o /dev/null -w "%{http_code}" -X POST -H "stripe-signature: t=1,v1=00" -d "{}" https://<staging-adresse>/api/stripe/webhook
```
Erwartet: im Dashboard unter dem Endpunkt ein Zustellversuch mit **200**; der zweite Befehl (falsche Signatur) gibt **400**.

**S11 Schalter für Karten** (**nur Pilot mit Karten**; bei der Turnier-Generalprobe bleiben **beide** Schalter AUS, Runbook 4a) (`pilot-daten-plan.md` Schritt 12, Vorprobe A8): als Admin 1 `/admin/einstellungen`: `payments_enabled` **AN** und `card_payments_enabled` **AN** (nur ohne offene bezahlte Spiele). Nicht „Zahlungen AUS“ (dann sind alle Spiele gratis).
Erwartet: beide AN; in einer Lobby erscheint das Karten-Formular (Vorprobe B7).

**S12 Sicherung und Probe** (Vorprobe G1, G2)
```
docker compose exec backup sh /backup-loop.sh once
ls backups | tail -3
```
Erwartet: eine Datei `socaz-<zeit>.sql.gz` und das Manifest `socaz-<zeit>.manifest.json`. Die **Restore-Probe** läuft auf einem **lokalen Rechner mit Postgres** (nicht im Staging-Container): `RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs backups/socaz-<zeit>.sql.gz --head-hash <hash> --count <n>`; erwartet: kein FAIL, Beweiskette PASS. Kopie der Sicherung **außerhalb des Servers** ablegen (`BETRIEB.md`).

Danach: Zeitplaner prüfen (Vorprobe A9), Daten anlegen nach `pilot-daten-plan.md`, Vorprobe (T-1).

## Lücken: was in `BETRIEB.md` und Compose für Staging fehlt
| # | Lücke | Wirkung | Vorschlag (Besitzer) |
|---|---|---|---|
| 1 | **Kein Zugangsschutz im `Caddyfile`** (kein Passwort, kein `X-Robots-Tag`), und `robots.txt` erlaubt `/` | Staging ist für Fremde und Suchmaschinen offen (Plan Frage 7) | **Behoben im Staging-Schutz-PR** (`Caddyfile.staging`, `docker-compose.staging.yml`, Banner, `robots`); Schutz am Hoster oder DNS bleibt zusätzlich ein Nutzerpunkt |
| 2 | **`BETRIEB.md` nennt keine Staging-Werteliste**: welche Namen in die `.env` gehören und welche **nicht** (`PAYMENTS_FAKE`, `SOCAZ_REQUIRE_A2`, `DATABASE_URL_OPS`, Live-Schlüssel); die Beispieldatei ist für Produktion geschrieben | Fehlkonfiguration (Fake-Zahlung, Live-Schlüssel) | Abschnitt „Staging“ in `BETRIEB.md` mit dieser Liste (Doku-PR) |
| 3 | **Erster Admin per SQL** (`update users set role='admin'`) steht in `BETRIEB.md`, widerspricht dem Grundsatz „keine SQL-Schreibzugriffe“ des Pilot-Daten-Plans | unklare Regel | als **einzige benannte Ausnahme** in `pilot-daten-plan.md` Abschnitt 2 (R-T400 Punkt 1, Schritt 0) |
| 4 | **Webhook-Ereignisse** sind über `BETRIEB.md` verstreut (Karte, Zahlung, Streit) | Ereignis fehlt → Karte „hängt“ | diese Liste (S9) in `BETRIEB.md` zusammenführen |
| 5 | **A2 (G25-009) noch nicht gebaut**: `DATABASE_URL_OPS`, `SOCAZ_REQUIRE_A2`, Datenbank-Rollen (`scripts/db-roles.mjs`) greifen erst mit A2. Für Staging gilt: **vor A2 nichts davon setzen**; **nach A2** muss Staging ausdrücklich `SOCAZ_REQUIRE_A2=0` setzen (Entwurf `g25-009-a2-definer-entwurf.md`, Release-Hinweis (c)) oder die Rollen wie Produktion anlegen | nach A2 startet Staging sonst nicht (Startprüfung) | Satz in `BETRIEB.md` und in S2/S5 nachtragen, sobald A2 steht (Technik) |
| 6 | **Sicherung nur auf dem Server selbst** (`./backups`, 14 Tage); kein Ziel außerhalb im Compose | Server weg = Sicherung weg | für den Pilot reicht manuelle Kopie (S12); dauerhaft Ziel außerhalb (Nutzer, `FEHLT-NOCH.md`) |
| 7 | **Zweite Installation auf demselben Rechner** nicht beschrieben: Compose-Name ist fest `socaz`, Ports 80/443 sind belegt | Konflikt mit Produktion | `-p <Name>`, `HTTP_PORT`/`HTTPS_PORT` (Compose kennt sie); Empfehlung bleibt: eigener Server |
| 8 | **Kein Staging-Merkmal in der App** (z. B. Banner „TESTUMGEBUNG“); Nutzer könnten Staging mit Produktion verwechseln | Verwechslung bei Bedienung | optional, nach dem Pilot (w3, UI) |
| 9 | **Hallenliste** (`import-venues.mjs`, OSM-Hallen) steht unter Erstinstallation, ist für Staging **nicht** erwünscht (`pilot-daten-plan.md` Abschnitt 2) | Fremde Hallen im Pilot | Hinweis „nur Produktion“ in `BETRIEB.md` |
| 11 | **`set-owner` im Compose-Betrieb** nicht beschrieben (`BETRIEB.md` zeigt nur `OWNER_EMAIL=… node scripts/set-owner.mjs`; auf dem Server fehlt `DATABASE_URL` außerhalb der Container) | Admin 1 lässt sich nicht festlegen | Aufruf über `docker compose run --rm -e OWNER_EMAIL=… migrate node scripts/set-owner.mjs` in `BETRIEB.md` ergänzen (Vorschlag; auf Staging beim ersten Lauf bestätigen) |
| 10 | **Überwachung** (Uptime Kuma, Sentry) nur optional beschrieben | Fehler am Abend bleiben unbemerkt | für den Pilot mindestens `docker compose logs -f app` (Plan 6) und Monitor auf `/api/health` |

## Abstimmung mit den Schwesterdokumenten
- **Vorprobe Teil A** (`pilot-vorprobe.md`): A1 = S6, A2 = S4, A3 = S5, A4/A6 = S3, A8 = S11, A9 = nach S12, A10 = S7. **Teil B**: B1 = S9, B2 bis B5 = S10, B7 = S11. **Teil G**: G1/G2 = S12.
- **Pilot-Daten-Plan**: nach S12 (Schritt 0 Admin = S8, Schritt 12 Schalter = S11, danach Halle, Konten, Teams, Spiele A und B).
- Die Reihenfolge ist also: **S1 bis S12 → Daten → Vorprobe (T-1) → Pilot**. Stichtage: Stripe-Update bis T-14, Staging bis T-7 (`pilot-plan.md` 12).

## Abgleich mit dem Go-live-Runbook (Dopplungen und Widersprüche, 2026-11-24)
Wo beide Dokumente dasselbe beschreiben, gilt das **Runbook**; die Checkliste bleibt die Pilot-Fassung mit Karten.
| # | Fund | Auflösung |
|---|---|---|
| 1 | **Widerspruch Zahlungen:** S11 schaltet `payments_enabled` und `card_payments_enabled` **AN**, das Runbook (4a) und der Generalprobe-Plan verlangen beide **AUS** | S11 gilt nur für den Pilot mit Karten; Turnier-Generalprobe: AUS (oben markiert) |
| 2 | **Widerspruch Schlüssel:** S2/S3 verlangen `sk_test_`/`pk_test_`, das Runbook sagt „`STRIPE_*` leer lassen“ | Pilot: Testschlüssel; Turnier: leer (oben markiert) |
| 3 | **Fehlt hier:** `TURNIER_ONLY=1`, Startwarnung, Umgebungsmarke (Runbook 3a), Staging-Seed (Runbook 10a), Smoke-Skript (`smoke.mjs`, `smoke-turnier-only.mjs`), beide-Schalter-Prüfung (4a) | nur im Runbook; für die Generalprobe gilt dessen Reihenfolge |
| 4 | **Dopplung Admin 1:** S8 und Runbook 6 beschreiben dasselbe; S8 gibt die Adresse **verdeckt** ein (`read -r -s`), das Runbook schrieb sie in die Befehlszeile | Runbook 6 ist auf die verdeckte Eingabe angeglichen; Einzelheiten weiter hier in S8 |
| 5 | **Dopplung Erreichbarkeit:** S6 (`curl …/api/health`) und Runbook 5 (Smoke-Skript) | Smoke-Skript ersetzt S6 vollständig; Staging mit Zugangsschutz: `SMOKE_BASIC_AUTH` (nur `smoke.mjs`; `smoke-turnier-only.mjs` kennt kein Passwort) |
| 6 | **Dopplung Sicherung:** S12 und Runbook 7 | beide gleich; Restore-Probe nur einmal pflegen: Runbook 7 |
| 7 | **Anmeldung:** Checkliste „Google **oder** Testkonten“ | Nutzerentscheid: Google **und** Apple (Vorbereiten, oben angepasst); ohne Dev-Login (Smoke prüft es) |
| 8 | **Vorlage `.env.production.example`** wurde in BETRIEB, Compose-Kopf und S2 genannt, existiert aber nicht (Backlog 260) | auf `.env.example` umgestellt, mit Hinweis auf die Entwicklungswerte; Lücke 2 unten bleibt als Begründung |
