# Socaz (SoccaV2)

Matchmaking für Hobby-Hallenfußball. Team gründen, Spieler per Link einladen, Gegner finden, Lobby mit „Bereit“, Ergebnis, Statistik und Ranglisten, Bezahlung der Halle, Ligen und Turniere. Start: NRW.

## Stand

Alle geplanten Phasen sind gebaut und getestet. Was noch fehlt, kann nur der Betreiber liefern (Konten, Schlüssel, Server, Rechtsprüfung), siehe [Offene Punkte](#offene-punkte).

| Phase | Inhalt | Stand |
|---|---|---|
| 1 Fundament | Google-Login, Onboarding (ab 16), Teams, Einladungslinks, Spielsuche (auch als Serie und Herausforderung), Lobby mit Echtzeit, Ergebnis mit Bestätigung und Streitfall, Livescore, Admin, PWA, Benachrichtigungen, Zeitplaner | fertig |
| 2 Geld und Halle | Unveränderliches Buchungsjournal, Guthaben, Stripe-Checkout mit Webhook, Rabattcodes, Anteil pro Spieler, Erstattungsregeln, Belege (PDF), Buchungsaufträge, Finanzbereich mit Ausgaben und CSV | fertig |
| 3 Community | Statistik, Elo (Teams und Spieler), Abzeichen, Zuverlässigkeit (privat), Spieler des Spiels, Profile, Teamseiten, Ranglisten, Kommentare und Hallenbewertungen mit Meldung und Moderation, Bilder, Mitspieler-Börse, Revanche, Spielbericht-Karten, Konto löschen und Datenexport, Rechtstexte | fertig |
| 4 Wettbewerbe | Ligen mit Live-Tabelle, Stadt-Challenge, Profi-Tag mit Losverfahren, Turniere mit Startgeld und Treuhandkonto (Liga, K.-o., Gruppen mit K.-o.), Sponsoren und Trikot-Partner | fertig |
| 5 Reichweite | Stream-Einbettung (Twitch, YouTube, Kick, erst nach Klick), OBS-Overlay und JSON, Deutsch und Englisch für die Kernseiten, Capacitor-Konfiguration für die App | fertig, außer Store-Bau |
| Betrieb | Docker Compose mit Caddy, Sicherung und Wiederherstellungstest, CI, Sentry, Health-Check | fertig |

## Technik

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind 4, PostgreSQL 18, Drizzle ORM, Auth.js 5 (Google), Zod, pg-boss (Zeitplaner), Stripe, Sharp, `@react-pdf/renderer`, Vitest, Playwright. Echtzeit über Server-Sent Events und Postgres LISTEN/NOTIFY, kein zusätzlicher Dienst nötig.

## Lokal starten

Voraussetzungen: Node 22, PostgreSQL 16 oder neuer.

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run db:migrate
npm run dev
```

Ohne Google-Zugangsdaten gibt es lokal einen Dev-Login (in Produktion abgeschaltet). Ohne Stripe-Schlüssel läuft ein Test-Zahlungsanbieter, es fließt kein Geld.

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `AUTH_SECRET` | Schlüssel für Sitzungen (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google-OAuth. Redirect-URI: `<Adresse>/api/auth/callback/google` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Zahlungen. Ohne Schlüssel: Test-Anbieter |
| `PAYMENT_FEE_PERCENT`, `PAYMENT_FEE_FIXED_CENTS` | geschätzte Zahlungsgebühren für die Finanzauswertung |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-Mails. Ohne Schlüssel wird nur protokolliert |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web-Push |
| `APP_URL`, `JOB_SECRET`, `ENABLE_SCHEDULER` | Betrieb: Adresse, Schutz der Job-Schnittstelle, Zeitplaner (in Produktion standardmäßig an) |
| `SENTRY_DSN` | Fehlerberichte (leer = aus) |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | Betreiberangaben für Impressum und Datenschutz |

Einstellungen, die im Admin-Bereich geändert werden (Tabelle `settings`): Zahlungen an/aus, Mindestzahl zahlender Spieler, Turnier-Provision in Prozent (Standard 10).

## Tests

```bash
npm run typecheck
npm run lint
npm test                    # Unit-Tests (reine Logik: Elo, Turnierplan, Geld, Zeit, Regeln)
npm run test:integration    # gegen die echte lokale Datenbank (Buchungsjournal, Zahlungen, Statistik, Turniere ...)
npx playwright test         # Browser-Tests, Dev-Server auf Port 3100 muss laufen
```

Wichtig: Integrationstests und Browser-Tests nie gleichzeitig laufen lassen. Beide räumen alle `@test.local`-Daten auf.

## Betrieb

Docker Compose mit App, Datenbank, Caddy (HTTPS), täglicher Sicherung. Anleitung und Wiederherstellung: [docs/BETRIEB.md](docs/BETRIEB.md). App für Android und iPhone: [mobile/README.md](mobile/README.md).

## Offene Punkte

Nur der Betreiber kann diese Dinge erledigen:

- **Google-OAuth-Zugangsdaten** anlegen (Issue #8), sonst ist nur der Dev-Login möglich.
- **Stripe-Konto** und Schlüssel (Karte, PayPal über Stripe). Der Webhook ist gegen simulierte Aufrufe getestet, nicht gegen die echte Stripe-Schnittstelle.
- **Server, Domain, Zugangsdaten** für Docker Compose (Hetzner o. ä.).
- **Rechtsprüfung** von Impressum, Datenschutz, AGB und Hausordnung (Issue #14). Die Texte sind Entwürfe und auf jeder Seite so gekennzeichnet.
- **Store-Konten** und Bau der App (Apple, Google), siehe `mobile/README.md`.

Bewusste Grenzen:

- Hallenbuchung ist ein Auftragssystem mit Schnittstelle für einen späteren Agenten (`BookingAgent`). Es bucht noch niemand automatisch.
- Zahlungsgebühren in der Finanzauswertung sind Schätzwerte.
- Englisch deckt Navigation, Start, Anmeldung und Fußzeile ab; die übrigen Seiten sind deutsch.
- Fehler im Browser werden noch nicht an Sentry gemeldet (nur Serverfehler).
- Push auf dem iPhone braucht die installierte App oder PWA und APNs-Schlüssel (nur für die Store-App).

## Dokumentation

- [PLAN.md](PLAN.md): Vision, Rollen, Phasen, Entscheidungen
- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) und [docs/ARCHITEKTUR-DETAIL.md](docs/ARCHITEKTUR-DETAIL.md): Plan als Diagramme
- [docs/ARCHITEKTUR-GEBAUT.md](docs/ARCHITEKTUR-GEBAUT.md): so ist es tatsächlich gebaut
- [docs/architektur.html](docs/architektur.html): alle Diagramme im Browser (Datei herunterladen und öffnen)
