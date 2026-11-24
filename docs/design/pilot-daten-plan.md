# Pilot-Daten-Plan: Daten auf Staging OHNE Seed

Stand: 2026-11-24 · Code-Stand `origin/main` 8529178 · Verfasser: worker-1 · Auftrag: t2q/t2s · Status: Entwurf, Review offen · Gehört zu `pilot-plan.md` (Abschnitte 4.2, 4.3) und `pilot-vorprobe.md` (Teil D)

Zweck: Wie die Pilot-Daten auf der Testumgebung (Staging) entstehen, ohne den lokalen Seed (`scripts/seed-frontend.mts`; er läuft absichtlich nur gegen lokale Entwicklungsdatenbanken) und ohne Skripte, die in Geld- oder Beweistabellen schreiben. **Alles geht über die Oberfläche** (Admin 1, Captains, Spieler), so wie es später echte Nutzer tun; die Anlage ist damit zugleich ein Test. Alle Werte (Adressen, Schlüssel, Domain) stehen nur als Platzhalter in `<…>`; keine Namen echter Personen im Repo.

**Ehrliche Grenze:** Die Klickfolgen sind aus `BETRIEB.md`, dem Quelltext der Admin-Seiten und den Plänen abgeleitet, **nicht** auf einer Testumgebung durchgespielt; die erste Anlage auf Staging (T-7) ist zugleich der Probelauf, abweichende Beschriftungen sind kein Fehler dieses Plans, sondern werden hier nachgetragen.

## 1. Grundsätze
1. **Nur Oberfläche, nur Testkonten oder eigene Konten** (Entscheid des Nutzers, `pilot-plan.md` Frage 2). Keine direkten SQL-Schreibzugriffe auf Staging.
2. **Reihenfolge**: Halle → Betreiber-Zugang → Konten → Teams → Spiele (Abschnitt 3). Jeder Schritt hat eine Prüfung (Abschnitt 3, Spalte „Prüfung“); die Teile D1 bis D5 der Vorprobe prüfen das Ergebnis noch einmal.
3. **Wer macht was:** Admin 1 (Halle, Zugang, Schalter), Captains und Spieler (Teams, Spiele), Technik (nur lesen und prüfen).
4. **Zeitpunkte:** Halle und Konten ab T-7, Teams T-7 bis T-4, Spiel A und Spiel B **T-3** (`pilot-plan.md` 4.3), Prüfung der Frist-Abbuchung T-2, Vorprobe T-1.

## 2. Was ein Vorbereitungs-Skript NICHT tun darf
Ein Skript darf höchstens **lesen und prüfen** (reine `SELECT`-Abfragen, Ausgabe nur Zahlen und Zustände). Es darf **nicht**:
- den Seed-Pfad benutzen (`seed-frontend.mts`, `scripts/import-venues.mjs` mit OSM-Hallen, jede Datei mit `seed` im Namen) oder dessen Schutz umgehen,
- in `ledger_entries`, `payment_*`, `booking_evidence*`, `audit_log`, `invoices` oder `settings` (`evidence_*`) schreiben, Trigger abschalten (`session_replication_role`, `DISABLE TRIGGER`) oder `socaz.ledger_maintenance` setzen,
- Zustände von Spielen, Karten oder Abbuchungen direkt setzen (Kartenstatus, `ready_at`, Frist, `settled_at`): nur über die Oberfläche und die echten Jobs,
- Produktivdaten lesen oder kopieren (Staging bekommt keine Sicherung der Produktion, keine echten Namen oder E-Mail-Adressen),
- Schlüssel, Webhook-Geheimnisse, Passwörter oder Verbindungsadressen lesen, ausgeben, loggen oder in Dateien schreiben (`.env*` liest kein Agent),
- gegen Produktion oder gegen Stripe im Live-Modus laufen,
- `PAYMENTS_FAKE` setzen oder den Fake-Pfad der lokalen Tests benutzen.
Erlaubt sind außerdem keine „Abkürzungen“ wie das Setzen eines Spiels auf „bestätigt“: wenn ein Schritt in der Oberfläche nicht geht, ist das ein Fund für den Pilot (S2) und wird gemeldet, nicht umgangen.

## 3. Schritte (Klickfolge, Prüfung)
Rollen: **A** = Admin 1, **C1/C2** = Captain Team 1/2, **S** = Spieler, **B** = Betreiber-Person, **T** = Technik (nur lesen).

| # | Schritt | Wer | Klickfolge | Prüfung |
|---|---|---|---|---|
| 1 | Halle anlegen | A | `/admin/hallen` → „Neue Halle“: Name (z. B. „Pilot-Halle“), Stadt, Boden, Adresse, Kontakt → „Halle anlegen“. Bei Bedarf „Partnerhalle“ nicht ankreuzen (Standard-Provision). | Halle steht unter „Alle Hallen“; in „Spiel suchen“ als Halle sichtbar (Vorprobe D1) |
| 2 | Preis der Halle | A | `/admin/hallen`, Halle öffnen → „Preisregel hinzufügen“ (Dauer 60 oder 90 Minuten, Preis) oder die Standardpreise gelten (80 Euro für 60 Minuten, 110 für 90) | Preis erscheint in der Lobby (Hallenpreis > 0; ein Spiel mit Preis, sonst ist es gratis und prüft die Karte nicht) |
| 3 | Halle als „geprüft“ markieren | A | in der Hallenliste „geprüft“ setzen (Buchbarkeit, Adresse und Preis stimmen) | Halle kommt im Veto zuerst (Reihenfolge Geprüft vor ungeprüft) |
| 4 | Betreiber-Zugang vergeben (nur wenn die Halle „Zugang“ haben soll, Plan Frage 3) | A | `/admin/hallen`, Halle → Betreiber einladen: Google-E-Mail der Betreiber-Person, Grund eintragen → senden (keine Mail wird verschickt) | Betreiber meldet sich mit genau dieser Google-Adresse an; Zugang wird beim ersten Login aktiv (BETRIEB, Hallenbetreiber), Einladung gilt 14 Tage; die Person ist **nicht** im Spiel |
| 5 | Konten für die Pilotgruppe | S, C1, C2, B, Gast | jede Person öffnet `https://<Staging>/anmelden` und meldet sich mit dem vereinbarten Konto an (Google oder Testkonto, Entscheid Plan Frage 2); danach Onboarding `/willkommen` bis `/app` | je Konto: „Meine Spiele“ sichtbar, **kein Dev-Login** auf `/anmelden` (Vorprobe C1, C6); der Gast hat KEIN Konto |
| 6 | Admin 1 festlegen | Nutzer | `scripts/set-owner.mjs` mit der Umgebungsvariable `OWNER_EMAIL` (nur der NAME, BETRIEB „Admin 1 festlegen“) | `/admin` für Admin 1 erreichbar, für Spieler nicht (Vorprobe C9, C10) |
| 7 | Team 1 gründen | C1 | `/app/teams/neu`: Name, Stadt → Team anlegen; danach Einladungslink in „Mein Team“ kopieren | Team in `/teams`, C1 ist Captain (Team-Admin) |
| 8 | Team 1 füllen (4 Mitglieder) | S (3 Personen) | Einladungslink von C1 im Browser öffnen, anmelden → „Beitreten“ | Mitgliederzahl 4 auf der Teamseite (Vorprobe D2) |
| 9 | Team 2 gründen und füllen | C2, S | wie Schritt 7 und 8 mit eigenem Team | zwei Teams mit je 4 Mitgliedern, ein Captain je Team |
| 10 | Spiel A (Frist-Abbuchung, **T-3**) | C1, C2 | C1 öffnet `/suche` → Team herausfordern (oder „Lobby aufmachen“), C2 nimmt an; beide Captains wählen **dieselbe** Uhrzeit (Anstoß am Pilotabend, mindestens 48 Stunden nach Anlage); Hallenanfrage und Veto abwarten; alle Spieler hinterlegen die Testkarte `4242…` und machen „Bereit“; beide Captains „Preis bestätigen“ | „Dein Stand“ zeigt „Preis steht fest“; zur Frist (T-2) bucht der Job jeden Spieler **einmal** ab (Vorprobe E5, Stripe-Dashboard Testmodus: je Spieler eine Zahlung) |
| 11 | Spiel B (abgelehnte Karte, Warteliste, **T-3**) | C1, C2, S | wie Schritt 10 mit anderem Anstoß am Pilotabend; ein Spieler hinterlegt die **abgelehnte** Testkarte `4000 0000 0000 0002`, eine weitere Person steht als Ersatz auf der Warteliste | zur Frist schlägt die Abbuchung fehl, das Nachzahlfenster (`min(2 h, Anstoß minus 1 h)`) läuft ab, danach rückt die Ersatzperson nach bzw. das Spiel wird abgesagt und erstattet; **am Abend wird dieses Ergebnis nur angesehen** (`pilot-plan.md` 4.3, 6b) |
| 12 | Schalter | A | `/admin/einstellungen`: `payments_enabled` und `card_payments_enabled` AN (ohne offene bezahlte Spiele umlegen, G8-012) | beide AN (Vorprobe A8); `PAYMENTS_FAKE` nicht gesetzt (Vorprobe A4) |
| 13 | Spiele für den Abend | C1, C2 | **am Abend selbst** anlegen (Anstoß unter 48 Stunden = Sofortbuchung, AC-5; Mindestvorlauf 24 h Teamspiel, 1 h Privatspiel): Spiel C live mit gültiger Karte, Spiel D live mit Fehlerfall (`3-D-Secure` und `nicht gedeckt`, Nachzahlfenster läuft) | Fälle aus Plan 6b „live“ |

Reihenfolge-Abhängigkeit: Schritt 10 und 11 brauchen Schritt 1 bis 9 und 12; Schritt 12 vor 10 (sonst sind die Spiele gratis, keine Karte). Wird ein Schritt nicht rechtzeitig fertig, verschiebt sich der Termin nicht automatisch: die Frist-Abbuchung (T-2) hängt an Spiel A (Anstoß mindestens 48 Stunden vor dem Abbuchungszeitpunkt).

## 4. Rollen am Abend aus diesen Daten
| Rolle | Konto | Muss vorhanden sein |
|---|---|---|
| Gast | kein Konto, zweites Gerät | nur Adressen der Seiten und die Einladung |
| Spieler | Konto aus Schritt 5, Mitglied in Team 1 oder 2 | Karte in einem Teil der Fälle bewusst **nicht** hinterlegt (Fall „Karte fehlt“) |
| Captain | C1, C2 aus Schritt 7 und 9 | je Team ein Team-Admin |
| Betreiber | B aus Schritt 4 und 5, **nicht** im Spiel | Zugang zur Pilot-Halle |
| Admin 1 | Schritt 6 | Zugang zu `/admin`, Notabschaltung geübt |

## 5. Prüfung am Ende (T-1, Teil D der Vorprobe, nur lesen)
- D1: Halle mit Preis in „Spiel suchen“ sichtbar; D2: zwei Teams mit je 4 Mitgliedern; D3: Termin steht nach gleicher Wahl; D4: Spiel unter 48 Stunden verlangt eine Karte; D5: keine Seed-Hallen (`select count(*) from venues where osm_id like 'seed-venue-%'` gleich 0).
- Zusätzlich (lesend): keine Personennamen echter Personen in den Konten außer den vereinbarten; keine Zahlungs- oder Ledger-Zeile, die nicht aus einem Stripe-Testmodus-Ereignis oder einem Job stammt (Stichprobe: Hauptbuch ausgeglichen, jede Zahlung hat eine Stripe-Kennung `pi_…` aus dem Testmodus).

## 6. Offen für Nutzer und Admin 1
- Termin, Halle mit oder ohne Zugang, Konten-Weg (`pilot-plan.md` Fragen 1 bis 3).
- Wer ist Admin 1 am Abend; wer legt Teams und Spiele an (empfohlen: die Captains selbst, damit der Weg mitgetestet wird).
- **Bau-Entscheid Technik:** wie Spiel B zeitlich entsteht, damit Fehler und Nachzahlfenster VOR dem Abend ablaufen (Anstoß am Abend, Abbuchung 48 Stunden vorher; kein Zeitsprung, keine Handeingriffe in Jobs).
- Ein lesender Prüfhelfer (`SELECT`-Abfragen aus Abschnitt 5 als Skript) wäre ein eigener kleiner Task; er schreibt nichts.
