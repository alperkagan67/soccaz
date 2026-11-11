# Seed für die Frontend-Analyse

Testdaten, damit alle Seiten und Zustände der Analyse (Vertrag 013, M1) gefüllt sind. Nur Testdaten (erfundene Namen, Mails `@test.local`), nur lokale Dev-Datenbank, kein Produktivcode.

## Aufruf

```
npx tsx --env-file=.env.local scripts/seed-frontend.mts
```

- Nach `npm run db:migrate` (alle Migrationen müssen angewendet sein).
- Zweiter Aufruf ist erlaubt und ändert keine Zahlen: Nutzer, Teams und Hallen werden per Upsert gehalten (IDs bleiben stabil, Dev-Login-Sitzungen bleiben gültig); Spiele, Teilnehmer, Abbuchungszeilen, Einladungen, Turniere und Hallenbewertungen werden gelöscht und neu angelegt.
- Zeiten sind relativ zum Lauf (Spiele z. B. in 1 bis 6 Tagen, vergangene Spiele 7 bis 21 Tage zurück). Vor einer Analyse neu aufrufen, damit nichts „abgelaufen“ ist, was es nicht sein soll.
- Ausgabe: Anzahl je Datensatztyp (Beleg gegen `soccaz_w3`: 26 Nutzer, 6 Teams, 3 Hallen, 12 Bewertungen, 9 Spiele, 4 Turniere).

## Grenzen (hart)

- Bricht ab bei `NODE_ENV=production`.
- Bricht ab bei jeder Query oder jedem Fragment in `DATABASE_URL` (pg würde `?host=`, `?port=`, `?database=` mit Vorrang übernehmen) und bei einem anderen Schema als `postgres:`/`postgresql:`.
- Bricht ab, wenn `DATABASE_URL` nicht auf `localhost` oder `127.0.0.1`, Port `5433` und eine der Datenbanken `soccav2`, `soccaz_w1` bis `soccaz_w4` zeigt. Dann wird nichts angefasst; die Meldung nennt nie Zugangsdaten.
- `DATABASE_URL` kommt nur aus der Prozessumgebung (`--env-file`); das Skript liest keine `.env*`-Datei selbst und gibt keine aus.
- Gelöscht wird nur, was zu den festen Seed-Konten gehört (exakte E-Mails `seed-*@test.local`): deren Teams `seed-*`, Einladungen `seed-*` dieser Nutzer, Hallen mit `osm_id` `seed-venue-*`, Einladungen `seed-*`, Turniere der Seed-Veranstalterin bzw. des Seed-Veranstalters. Fremde Daten bleiben unberührt.
- Kein Stripe-Aufruf, kein Hauptbuch, keine Zahlungsbuchung: Kartenzustände sind reine DB-Zeilen (erfundene IDs `cus_seed_*`, `pm_seed_*`). `PAYMENTS_FAKE` ist nicht nötig.
- Der Seed setzt den Schalter `card_payments_enabled` NICHT. Für Seiten mit Kartenmodell den Schalter selbst setzen (Einstellung `card_payments_enabled` = `true`, siehe `docs/BETRIEB.md`); ohne ihn gelten die Seed-Zeilen trotzdem als Anzeigedaten.
- Die Integrationstests räumen alle Nutzer `@test.local` auf (`tests/cleanup.ts`). Nach `npm run test:integration` auf derselben DB den Seed neu aufrufen.
- `cancel_requested_at` (PR 83) gibt es in diesem Stand noch nicht: „Absage“ ist hier ein Spiel mit Status `cancelled`.

## Konten (Dev-Login)

Anmeldung unter `/anmelden` mit „Dev-Login“: E-Mail eintragen, Name egal, kein Passwort (nur außerhalb der Produktion). Die Rolle `admin` steht schon in der Datenbank.

| E-Mail | Rolle / Zustand |
|---|---|
| `seed-admin@test.local` | Plattform-Admin (`admin`) |
| `seed-neu@test.local` | neuer Nutzer ohne Profil (Onboarding offen, keine Zustimmungen) |
| `seed-captain-rot@test.local` | Captain Seed Rot (hat Karte); Veranstalter des Privatspiels |
| `seed-captain-blau@test.local` | Captain Seed Blau (hat Karte) |
| `seed-captain-gruen@test.local` | Captain Seed Grün (Karte abgelehnt in „Fehlerzustände“) |
| `seed-captain-gelb@test.local` | Captain Seed Gelb |
| `seed-veranstalter@test.local` | Veranstalter (`is_organizer`), Turniere |
| `seed-halle@test.local` | Hallenbetreiber von „Seed-Halle Nord“ (`manager_user_id`) |
| `seed-spieler-01@test.local` bis `-18` | Spieler; 01 bis 16 sind Teammitglieder, 17 und 18 haben kein Team |

Hinweis: Die Rolle „Admin 1 (`owner`)“ aus Vertrag 009 gibt es im Schema noch nicht; es gibt nur `admin`.

## Teams, Hallen

- Teams: Seed Rot (Essen), Seed Blau (Köln), Seed Grün (Dortmund), Seed Gelb (Gelsenkirchen), je Captain plus 4 Spieler, mit Team- und Spielerstatistik (Rangliste gefüllt).
- Hallen: Seed-Halle Nord (Essen, Partner, mit Betreiber), Seed-Halle Süd (Köln), Seed-Halle West (Dortmund), je mehrere Bewertungen mit Sternen.
- Zwei unsichtbare Spiel-Teams (`seed-privat-a`, `seed-privat-b`, Art `private`) für das Privatspiel.

## Zustands-Matrix

| Zustand | Datensatz | Seite / Zelle |
|---|---|---|
| Lobby offen (wenig Teilnehmer, niemand bereit) | Spiel Rot gegen Blau in 6 Tagen, Status `lobby` | Lobby-Liste, Lobby-Seite (leer/halbvoll) |
| Lobby voll (10 Teilnehmer, einige bereit, einige ohne Karte) | Spiel Grün gegen Gelb in 5 Tagen, Status `lobby` | Lobby-Seite, Ampel Karte grün/rot |
| Lobby bereit (beide Captains bestätigt, alle mit Karte) | Spiel Rot gegen Blau in 3 Tagen, Status `confirmed` | Meine Spiele, bestätigtes Spiel |
| Karte abgelehnt | Spiel Grün gegen Gelb in 2 Tagen: `capC` mit `card_status = failed` und `payment_charges` `failed` (`card_declined`) | Lobby (Captain/Betroffener sieht „Abbuchung fehlgeschlagen“, Dritte neutrale Ampel, 012 AC-20) |
| Zahlung ausstehend | selbes Spiel: `p09` `charge_pending` mit Abbuchungszeile `pending` | Lobby, neutrale rote Ampel „Zahlung ausstehend“ |
| Karte hinterlegt / fehlt | selbes Spiel: `p10` `card_ready`, `p11` `none`; dazu Lobby offen und voll | Ampel grün/rot, Karten-Knopf |
| Absage | Spiel Rot gegen Grün in 1 Tag, Status `cancelled` | Spielseite „abgesagt“, Meine Spiele |
| Vergangene Spiele | drei Spiele 7, 14, 21 Tage zurück, Status `played`, bestätigtes Ergebnis | Spielhistorie, Profil, Team-Seite |
| Privatspiel mit gültigem Link | Spiel Seed Privat A gegen B in 4 Tagen, versteckt; Token `seed-link-gueltig` | `/spiel/seed-link-gueltig` |
| Privatspiel, Link abgelaufen | Token `seed-link-abgelaufen` | `/spiel/seed-link-abgelaufen`, Fehlerseite „Link abgelaufen“ |
| Link widerrufen | Token `seed-link-widerrufen` bewusst NICHT vorhanden (ein widerrufener Link wird gelöscht und verhält sich wie ein unbekannter Token) | `/spiel/seed-link-widerrufen`, Fehlerseite „Link ungültig“ |
| Team-Einladung gültig / abgelaufen | Tokens `seed-team-gueltig`, `seed-team-abgelaufen` für Seed Rot | `/einladung/seed-team-gueltig` bzw. `/einladung/seed-team-abgelaufen` |
| Turnier in Anmeldung | „Seed-Turnier Anmeldung“, 2 Teams, Kader nicht vollzählig | Turnierliste, Turnierseite (Anmeldung) |
| Turnier in Bezahlung | „Seed-Turnier Bezahlung“, 4 Teams vollzählig, Preis 5,00 EUR, je Team 2 von 5 gezahlt | Zahlungsphase, Captain-Ansicht |
| Turnier läuft | „Seed-Turnier Laufend“, 6 Spiele Jeder-gegen-jeden, erste Runde mit Ergebnis | Spielplan/Tabelle |
| Turnier beendet | „Seed-Turnier Beendet“, alle 6 Spiele gewertet, Sieger Seed Rot | Ergebnisse, Sieger |
| Rangliste mit Spielern | `team_stats` und `player_stats` für 4 Teams und 18 Spieler (verschiedene Elo) | Ranglisten |
| Hallen mit Bewertungen | 3 Hallen, je 4 Bewertungen (2 bis 5 Sterne) | Hallenliste, Hallenseite |
| Onboarding | `seed-neu@test.local` | Onboarding-Strecke nach Anmeldung |
| Hallenbetreiber | `seed-halle@test.local` | Halle-Dashboard (011) |
| Admin | `seed-admin@test.local` | Admin-Bereich (`/admin`) |
| Veranstalter | `seed-veranstalter@test.local` | Turnier-Verwaltung |

## Zurücksetzen

- Zurück auf den Ausgangsstand: Seed erneut aufrufen (löscht und erzeugt die abhängigen Daten neu).
- Alles Testdaten weg (alle `@test.local`, auch die der Integrationstests): `npm run test:integration` räumt am Ende auf, oder eine Worker-DB mit `node scripts/worktree.mjs` neu anlegen.
- Die Skripte `seed-demo.mjs`, `seed-lobby.mts` und `seed-tournament.mts` bleiben unverändert und arbeiten mit `@soccav2.local`; sie können zusätzlich benutzt werden.
