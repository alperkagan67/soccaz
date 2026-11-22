# Pilot-Technik (Ergänzung zum Pilot-Plan, Vertrag 013 AC-8)
Stand: 2026-11-12 · Code-Stand `origin/main` 4333148 (M3c-1 #107, Build-Schlüssel Backlog 71 und Konto-Menü #106 gemergt; M3c-1c, M3c-2 #109, M3c-3a/3b noch offen) · Fassung 2 (Aktualisierung von Fassung 1) · Verfasser: worker-4 (Doku, kein Code) · Status: Entwurf, Review durch unabhängigen Reviewer offen

Zweck: Die technische Seite des Pilot-Abends als Checkliste: welche Umgebung, welche Schlüssel (nur Namen), wie Webhooks ankommen, wie Testkonten entstehen, was vorher, während und nachher zu tun ist und was gemessen wird. Den Ablauf des Abends, die Rollen, die Fälle und die Abbruchkriterien beschreibt `docs/design/pilot-plan.md` (Vorab-Spiele A/B bei T-3/T-2 dort, Abschnitte 4.3 und 6). Dieses Dokument enthält **keine Werte, keine Schlüssel, keine Domain, kein Rechtsrat**; offene Punkte stehen als Fragen (Abschnitt 8).

Quellen: `docs/BETRIEB.md` (Erstinstallation, Umgebungen, Sicherung, Zeitplaner, Kartenzahlung), `docker-compose.yml`, `src/server/jobs.ts`, `src/auth.ts`, `src/instrumentation.ts`, `scripts/lib/seed-guard.ts`, `tests/e2e/helpers-db.ts`, `docs/loop/GO-LIVE-AUDIT.md` (G8-012 bis G11-012).

## 1. Drei Umgebungen, drei Zwecke
| Umgebung | Aufruf | Zweck | Grenzen |
|---|---|---|---|
| **A: lokaler Trockenlauf** | `npm run dev -- -p <Port>` im Worker-Worktree (Dev-Modus) | Karten- und Webhook-Ablauf mit echten Stripe-TESTschlüsseln ausprobieren, Dev-Login für Konten | Dev-Modus (`NODE_ENV` nicht `production`): Dev-Login vorhanden (`src/auth.ts`), Zeitplaner standardmäßig aus (`instrumentation.ts`: nur mit `ENABLE_SCHEDULER=1`), kein Caddy/HTTPS. Nicht „wie Staging“ |
| **B: staging-ähnlich lokal** | `docker compose -p <Projektname> up -d --build` mit eigener `.env` und eigenen Ports | Produktions-Build, Zeitplaner (`ENABLE_SCHEDULER=1` setzt `docker-compose.yml`), Migrationen beim Start, Sicherung, Wiederherstellung üben | Produktions-Build: **kein Dev-Login**, Anmeldung nur über Google (`AUTH_GOOGLE_ID`); kein öffentliches HTTPS (lokal `SITE_ADDRESS=:80`) |
| **C: Staging auf dem Server** | zweite Compose-Installation mit eigener Domain (`docs/BETRIEB.md`, Umgebungen) | der Pilot-Abend selbst | Das Geld-System wird nie gegen die Produktion getestet; Testmodus von Stripe |

Zu B: `docker-compose.yml` hat den festen Namen `socaz`; eine zweite Installation auf demselben Rechner braucht `-p <anderer Name>` (eigene Container und eigene Volumes) sowie andere Ports (`HTTP_PORT`, `HTTPS_PORT`). `APP_URL` muss zur tatsächlichen Adresse passen (`AUTH_URL` wird daraus gebaut).

## 2. Schlüssel und Einstellungen (nur Namen)
Alle Werte stehen nur in der `.env` der jeweiligen Installation bzw. in der `.env.local` des Worktrees; Agenten lesen und geben `.env*` nie aus.
| Name | Wofür | Hinweis |
|---|---|---|
| `POSTGRES_PASSWORD` | Datenbank der Compose-Installation | Pflicht (`docker-compose.yml`) |
| `APP_URL`, `SITE_ADDRESS`, `HTTP_PORT`, `HTTPS_PORT` | Adresse, Caddy, Ports | `APP_URL` Pflicht |
| `AUTH_SECRET` | Sitzungen | eigener Wert je Umgebung |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google-Anmeldung (Produktions-Build) | Weiterleitungs-URI der Umgebung im Google-Projekt eintragen |
| `JOB_SECRET` | manueller Job-Aufruf `/api/jobs/<Name>` | ohne Wert lehnt die Schnittstelle in Produktion jeden Aufruf mit 403 ab |
| `STRIPE_SECRET_KEY` | Stripe, **Testmodus** (`sk_test_…`) | nie Live; ein Live-Schlüssel bricht den Pilot ab (Abbruchkriterium) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Karteneingabe im Browser, Testmodus (`pk_test_…`) | **wird beim BUILD in den Client-Code eingebettet** (`CardForm.tsx:12-14`: ohne Schlüssel gibt es kein Formular). **Erledigt (Backlog 71, auf `main`):** Das `Dockerfile` nimmt den Schlüssel als `ARG`/`ENV` im Build-Schritt (nur dort, nicht im Laufzeit-Image), `docker-compose.yml` reicht ihn als `build.args` aus der `.env` weiter (Standard leer = kein Formular); `env_file` allein würde nur zur Laufzeit wirken. Deshalb: den Wert VOR dem Bauen in die `.env` der Installation eintragen und nach **jeder** Änderung neu bauen (`docker compose up -d --build`). `pk_` und `sk_` müssen aus demselben Modus stammen (Test: `pk_test_`/`sk_test_`); Staging nie mit Live-Schlüsseln bauen. Fehlt der Wert im Build, fehlt das Kartenformular (Prüfpunkt in 5.1) |
| `STRIPE_CARD_WEBHOOK_SECRET` | Signaturgeheimnis des Webhook-Endpunkts `/api/stripe/webhook` | je Endpunkt eigenes Geheimnis; das von `stripe listen` gilt nur lokal |
| `STRIPE_WEBHOOK_SECRET` | alte Route `/api/webhooks/stripe` (Guthaben) | für den Pilot nicht nötig, nie dasselbe Geheimnis wie oben |
| `SENTRY_DSN` | Fehlerprotokoll (optional) | ohne Wert nur `docker compose logs app` |

**`PAYMENTS_FAKE` wird in Umgebung B und C nie gesetzt** (G10-012; `provider.ts` verweigert es bei `NODE_ENV=production`). In Umgebung A bleibt es ebenfalls aus, sobald `STRIPE_SECRET_KEY` gesetzt ist (dann wählt der Code Stripe statt des Fake-Anbieters).

## 3. Webhooks: stripe listen und Dashboard
- **Umgebung A/B (lokal):** `stripe listen --forward-to localhost:<Port>/api/stripe/webhook` (Port des Dev-Servers bzw. `HTTP_PORT` der Compose-Installation). Das Signaturgeheimnis aus der Ausgabe von `stripe listen` kommt als `STRIPE_CARD_WEBHOOK_SECRET` in die `.env`/`.env.local` **dieser** Installation; danach die App neu starten.
- **Umgebung C (Staging):** im Stripe-Dashboard (Testmodus) den Endpunkt `https://<Staging-Domain>/api/stripe/webhook` anlegen mit den Ereignissen aus G9-012: `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `charge.updated`. Dessen Geheimnis in `STRIPE_CARD_WEBHOOK_SECRET`.
- **Webhook-Test (vorher):** In Stripe unter den Zustellversuchen des Endpunkts prüfen, dass Ereignisse mit 200 beantwortet werden. 503 heißt „nicht konfiguriert“ (Geheimnis oder Schlüssel fehlt), 400 „Signatur ungültig“ (falsches Geheimnis oder zwei Endpunkte vermischt), 413 „Body zu groß“ (`route.ts:6`), 500 „Fehler beim Verarbeiten“ (Stripe wiederholt die Zustellung; nichts wurde festgeschrieben). Danach eine Testkarte hinterlegen (Karte `4242…`, siehe `pilot-plan.md` Abschnitt 5, vorher gegen die Stripe-Dokumentation prüfen) und im Lobby-Bildschirm „Karte hinterlegt“ sehen.

## 4. Testkonten
- **Der Seed ist für Staging NICHT nutzbar.** `scripts/lib/seed-guard.ts` erlaubt nur `localhost`/`127.0.0.1`, Port 5433 und die Datenbanken `soccav2`, `soccaz_w1` bis `soccaz_w4`; gegen die Compose-Datenbank bricht der Seed ab. Das ist gewollt und bleibt so.
- **Dev-Login gibt es nur im Dev-Modus** (`src/auth.ts`, `NODE_ENV !== "production"`). Umgebung A: Konten per Dev-Login anlegen (beliebige erfundene E-Mail-Adresse, kein Passwort). Umgebung B/C: Anmeldung über Google.
- **Admin:** nach der ersten Anmeldung `docker compose exec db psql -U socaz -c "update users set role='admin' where email='<Adresse>'"` (Rolle `admin`; „Admin 1“/`owner` gibt es im Schema noch nicht, die Absage nach der ersten Abbuchung entscheidet heute der Admin).
- **Hallen:** echte oder als Test angelegte Halle mit Preis (Admin, Hallen); die Seed-Hallen (`seed-venue-%`) gibt es auf Staging nicht.
- **Offen** (Frage F1, F2): wie die Freunde sich anmelden (eigene Google-Konten oder eigens angelegte Testkonten) und ob ein eigenes Staging-Seed-Konzept gebaut wird (neues Skript mit eigener Freigabeliste und Review, nicht der bestehende Seed).

## 5. Checkliste
Zeitpunkte T-7 … T+1 wie `pilot-plan.md` Abschnitt 12 (T = Pilot-Abend).

### 5.1 Vorher
- [ ] **T-7** Installation aufgesetzt (Abschnitt 1, B zur Probe, C für den Abend): `docker compose up -d --build`, `https://<Domain>/api/health` liefert `{"status":"ok"}`, Migrationen liefen (Dienst `migrate`).
- [ ] Schlüssel (Abschnitt 2) nur als Namen abgehakt: Testmodus, `PAYMENTS_FAKE` nicht gesetzt (`docker compose exec app printenv PAYMENTS_FAKE` liefert nichts), kein Live-Schlüssel.
- [ ] Webhook-Test (Abschnitt 3) mit Antwort 200 im Dashboard.
- [ ] Sicherung und Wiederherstellung: `docker compose exec backup sh /backup-loop.sh once`, dann `sh scripts/restore-test.sh` (Wegwerf-Datenbank, zählt Tabellen und Nutzer); die Sicherung unmittelbar VOR dem Pilot (T-1) merken.
- [ ] **Schalter** `card_payments_enabled` setzen, **nur auf Staging und nur ohne offene bezahlte Spiele** (G8-012), und erst, wenn M3c-1 (auf `main`), M3c-1c und M3c-2 (noch offen, #109) gemergt und auf Staging deployt sind (G8-012):
  `docker compose exec db psql -U socaz -c "insert into settings (key, value) values ('card_payments_enabled','true'::jsonb) on conflict (key) do update set value = excluded.value"`
  (derselbe Einfügebefehl wie `setPlatformSetting` in `tests/e2e/helpers-db.ts`). Prüfen: Lobby zeigt Kartenablauf, nirgends Guthaben.
- [ ] **Vorab-Spiele** bei T-3 anlegen (Spiel A: Karten hinterlegt, beide Captains bereit; Spiel B: Fall mit abgelehnter Karte/Warteliste, damit „Fenster abgelaufen“ und „Nachrücker“ am Abend sichtbar sind), Beschreibung in `pilot-plan.md` 4.3. Bei T-2 die Frist-Abbuchung ansehen (Abschnitt 5.3).
- [ ] **Fristlauf-Trockenlauf:** Jobs einmal von Hand anstoßen und im Protokoll prüfen (Befehle unten). Reihenfolge: `card-charges`, `card-refunds`, `lobby-deadlines`, `send-reminders`, `deliver-notifications`.
  `curl -X POST -H "x-job-secret: $JOB_SECRET" https://<Domain>/api/jobs/<Name>` (Jobnamen: `src/server/jobs.ts`; der Zeitplaner ruft `card-charges`/`card-refunds` alle 5 Minuten auf).
- [ ] **Migrationen auf Staging:** `docker compose logs migrate` zeigt alle Migrationen bis zum erwarteten Stand angewendet (0039 Nachzahlfenster auf `main`; 0040 Nachrücker mit M3c-2; 0041 Anteil übernehmen mit M3c-3a). Rein additive Migrationen; Rollback-Statements stehen, soweit vorhanden, in `docs/BETRIEB.md` (je Migration; für 0040 und 0041 mit den jeweiligen PRs), die Sicherung VOR dem Deploy ist der eigentliche Rückweg. Hinweis: Eine Installation, die eine ältere Fassung von 0041 angewendet hat (nur Entwicklungs-Datenbanken, nie Staging), ändert sich beim erneuten Migrieren nicht und meldet keinen Fehler.
- [ ] **Wiederholen nur nach neuer Karte:** Nach abgelehnter Abbuchung im Nachzahlfenster gibt es einen weiteren Versuch erst, nachdem der Spieler eine andere Karte hinterlegt hat (kein Dauerbeschuss derselben Karte); beim übernommenen Anteil gilt die Karte des Zahlers. Im Pilot mit Testkarte „abgelehnt“ und anschließend `4242…` durchspielen und in `payment_charge_attempts` die Versuche zählen.
- [ ] **Freigabe (3-D-Secure, M3c-1c):** Testkarte mit Freigabepflicht: der Betroffene sieht „Zahlung freigeben“, Dritte und Gäste nichts; nach der Freigabe kommt die Zahlung nur über den Webhook an (nie über die Browser-Antwort).
- [ ] **Anzeige „Gedeckt“ (nur wenn M3c-3b mit deployt wird):** Dritte sehen bei einem übernommenen Platz neutral „Gedeckt“ ohne Namen und Grund, der Betroffene „Dein Anteil wird übernommen“, Captain/Veranstalter das Paar. Der Mandatszusatz ist ein **Entwurf** (Anwalt, G2-012): Frage F6.
- [ ] **Nachrücker nur für eingerichtete Konten:** Wartelistenspieler müssen Onboarding und Altersbestätigung (`onboarded_at`, `age_confirmed_at`, Mindestalter 16) haben, sonst rückt niemand nach; Testkonten also immer vollständig einrichten (Name, Stadt, Geburtsdatum).
- [ ] **Auto-Absage:** Findet sich nach Fensterende kein Nachrücker (leere Warteliste oder drei gescheiterte Nachrücker je Platz), sagt der Job `card-charges` das Spiel automatisch ab und erstattet alle bereits Abgebuchten voll auf die Karte (Spiel B in 4.3 des Pilot-Plans; danach Erstattung in Stripe und im Admin prüfen, Stripe-Gebühr bleibt bei Soccaz). Spät eingehende Zahlungen eines ersetzten Platzes werden gebucht und sofort voll erstattet (Admin-Alarm).
- [ ] **Karteneingabe-Formular erscheint auf der Staging-Lobby (Produktions-Build):** in der Lobby eines Spiels (Spieler ohne Karte) ist das Stripe-Formular sichtbar, nicht nur der Hinweis „Kartenzahlung nicht verfügbar“. Fehlt es, ist `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` nicht im Build (Abschnitt 2: Wert in der `.env` eintragen, neu bauen): Pilot-Gate nicht erreicht.
- [ ] Überwachung: Uptime Kuma läuft nur mit Profil, nicht mit `up -d --build`: `docker compose --profile monitoring up -d` (`docs/BETRIEB.md`, Überwachung); Monitor auf `/api/health`. `docker compose logs -f app` offen.

### 5.2 Während
- [ ] Stripe-Dashboard (Testmodus) offen: Zahlungen, Ereignisse, Zustellversuche; `docker compose logs -f app` im zweiten Fenster.
- [ ] Protokollperson führt die Liste (`pilot-plan.md` Abschnitt 7); Technik greift nicht in den Ablauf ein, außer bei Abbruch.
- [ ] Bei Abbruch (`pilot-plan.md` Abschnitt 8): Schalter zurücksetzen (5.3), Webhook-Zustellung im Dashboard pausieren, Uhrzeit notieren.

### 5.3 Nachher / Zurücksetzen
- [ ] **Schalter zurück:** gleicher Befehl wie oben mit `'false'::jsonb`, **erst wenn keine Abbuchung mehr läuft** (offene Spiele zuerst beenden oder absagen; Konto-Löschung bei laufender Abbuchung nur über den Support, `docs/BETRIEB.md`).
- [ ] Sicherung nach dem Abend (`backup-loop.sh once`), Staging auf den Stand VOR dem Pilot zurücksetzen oder löschen (Restore-Befehl: `docs/BETRIEB.md`, Sicherung und Wiederherstellung).
- [ ] Schlüssel rotieren, falls sie in einem Chat gelandet sein könnten; Testkunden in Stripe (Testmodus) bei Bedarf löschen.
- [ ] Auswertung: Messpunkte (Abschnitt 6) sichern, ohne Namen und ohne Mail-Adressen; Funde als Backlog-Einträge.

## 6. Messpunkte
Nur Lesen; Abfragen laufen mit `docker compose exec db psql -U socaz -c "…"`. Namen von Tabellen und Spalten wie im Schema (`src/db/schema.ts`); bei Abweichung gilt das Schema.
| Messpunkt | Wo | Wie | Sollwert / Frage |
|---|---|---|---|
| Karte hinterlegen → „Karte hinterlegt“ | Stripe-Dashboard, Lobby | Zeit vom Bestätigen bis zur Anzeige notieren | wenige Sekunden; Ausreißer + Webhook-Zustellung prüfen |
| Webhook-Erfolg | Stripe-Dashboard, Zustellversuche | Anteil 200 gegen Fehler | 100 %; jeder Fehler wird erklärt |
| Frist → Abbuchung | Spiel A (T-2/T-3), Protokoll des Jobs `card-charges` | Zeit zwischen Frist und Abbuchung | höchstens ein Zeitplanerlauf (5 Minuten) nach der Frist |
| Abbuchungen je Status | Datenbank | `select status, count(*) from payment_charges group by status;` | nur erwartete Zustände; `failed`/`requires_action` nur in den dafür vorbereiteten Fällen |
| Doppelbuchung | Datenbank/Hauptbuch | je Spieler und Spiel genau eine Abbuchung (Admin, Finanzen; Stripe: eine Zahlung je Spieler) | 0 Doppelbuchungen (Abbruchkriterium S1) |
| Erstattung | Stripe, Admin | Dauer von Absage bis Erstattung auf der Karte | nachvollziehbar, Betrag je Spieler = gezahlter Betrag |
| Fehlerbilder | `docker compose logs app` | Anzahl Fehler/Warnungen je Block des Abends | Liste, keine unerklärten Fehler |
| Erreichbarkeit | Uptime Kuma | `/api/health` | keine Ausfälle während des Abends |
| Bedienbarkeit | Protokoll | Aussagen der Teilnehmer je Seite/Rolle/Gerät (Schwere S1 bis S4) | Gate G in `pilot-plan.md` Abschnitt 14 |

## 7. Abhängigkeiten
- M2 → M2b → 012 M3b bis M5 → 012 M6a → 013 M3 → **Pilot** (Backlog 63, `pilot-plan.md` Abschnitt 1). Der Schalter wird erst gesetzt, wenn M3c-1, M3c-1c und M3c-2 gemergt UND deployt sind (G8-012). **Stand 2026-11-12:** M3c-1 ist auf `main`; M3c-1c (3-D-Secure-Freigabe), M3c-2 (Nachrücker, Auto-Absage, später Erfolg; PR #109) und M3c-3a/3b (Anteil übernehmen) sind noch offen.
- **Build-Schlüssel (erledigt, Backlog 71):** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` kommt über `ARG`/`build.args` ins Image. Voraussetzung bleibt: Wert vor dem Bauen in der `.env`, nach jeder Änderung neu bauen (5.1).
- Die Kurzfassung „Lokale Entwicklung mit Stripe-Testmodus“ steht in `docs/BETRIEB.md`.

## 8. Offene Fragen (nicht von Agenten zu beantworten)
- **F1:** Anmeldung der Teilnehmenden: eigene Google-Konten (echte Namen auf Staging) oder eigens angelegte Testkonten? (Datenschutz-/Rechtsfrage für den Nutzer, hier nicht entschieden.)
- **F2:** Soll es ein eigenes **Staging-Seed-Konzept** geben (neues Skript, eigene Freigabeliste statt `seed-guard.ts`, Review durch `security-reviewer`), oder werden Teams, Halle und Spiele von Hand angelegt?
- **F3:** Welche Umgebung ist der Pilot: Staging auf dem Server (C) oder eine Installation auf dem Rechner mit Tunnel? Domain, Server und Google-Weiterleitungs-URI beschafft der Nutzer.
- **F4:** Reicht der lokale Trockenlauf in Umgebung A (Dev-Modus) als Probe, oder soll B (Produktions-Build lokal) Pflicht sein? A kann den Zeitplaner nur mit `ENABLE_SCHEDULER=1` und hat kein Dev-Login in B.
- **F5:** Wer ist am Abend „Admin 1“ (Absage nach der ersten Abbuchung)?
- **F6:** Soll der Pilot „Anteil übernehmen“ (M3c-3a/3b) mit dem **Entwurfstext** des Mandatszusatzes überhaupt enthalten, oder bleibt die Funktion bis zur anwaltlichen Fassung (G2-012) aus dem Pilot-Umfang? (Rechtsfrage, nicht von Agenten zu beantworten.)
