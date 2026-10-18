# SoccaV2 – Detail-Ebene

Ergänzt [ARCHITEKTUR.md](ARCHITEKTUR.md). Jedes Diagramm geht in einen Bereich hinein: jede Verzweigung, jede Prüfung, jeder Randfall.
Mit **OFFEN** markierte Knoten sind Entscheidungen, die noch nicht getroffen wurden.

---

## D1. Login, Onboarding, Sperren

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef open fill:#b8860b,color:#fff
  classDef step fill:#1d5fa8,color:#fff

  A["Nutzer klickt Mit Google anmelden"]:::step
  A --> B["Weiterleitung zu Google OAuth"]
  B --> C{"Google bestätigt?"}
  C -- "nein oder abgebrochen" --> C1["Zurück zur Startseite mit Hinweis"]:::bad
  C -- ja --> D["Callback mit E-Mail, Name, Foto, Google-ID"]
  D --> E{"E-Mail verifiziert bei Google?"}
  E -- nein --> E1["Anmeldung abgelehnt"]:::bad
  E -- ja --> F{"Nutzer in DB vorhanden?"}
  F -- nein --> G["users anlegen: Rolle player, Locale aus Browser"]:::ok
  F -- ja --> H{"banned_at gesetzt?"}
  H -- ja --> H1["Sperrseite mit Grund und Kontakt"]:::bad
  H -- nein --> I["Session als JWT mit uid, Rolle"]:::ok
  G --> I
  I --> J{"Onboarding abgeschlossen?"}
  J -- ja --> K["Weiter zu Zielseite oder /app"]:::ok
  J -- nein --> L["/willkommen Schritt 1: Anzeigename"]:::step
  L --> M["Schritt 2: Stadt aus NRW-Liste, später freie Orte"]:::step
  M --> N["Schritt 3: Position und Spielstärke Selbsteinschätzung 1 bis 5"]:::step
  N --> O["Schritt 4: Geburtsjahr für Mindestalter 16"]:::step
  O --> P{"Alter mindestens 16?"}
  P -- nein --> P1["Konto wird nicht angelegt, Geburtsjahr wird nicht gespeichert, Hinweis auf Mindestalter 16"]:::bad
  P -- ja --> Q["Schritt 5: Datenschutz und Hausordnung akzeptieren, Zeitpunkt speichern"]:::step
  Q --> R["Schritt 6: Benachrichtigungen Push, E-Mail wählen"]:::step
  R --> S["Onboarding fertig, optional: Team gründen oder Link beitreten"]:::ok
  S --> K

  K --> T{"Jede Anfrage: Session gültig und nicht gesperrt?"}
  T -- nein --> T1["Abmelden und Hinweis"]:::bad
  T -- ja --> U["Aktion erlaubt nach Rollenprüfung"]:::ok
```

---

## D2. Team: gründen, einladen, verwalten

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef step fill:#1d5fa8,color:#fff
  classDef open fill:#b8860b,color:#fff

  N1["Team gründen: Name, Stadt, Logo optional, Stärke"]:::step
  N1 --> N2{"Name frei und gültig 3 bis 40 Zeichen?"}
  N2 -- nein --> N2a["Fehler: vergeben oder ungültig"]:::bad
  N2 -- ja --> N3["slug erzeugen, eindeutig"]
  N3 --> N4["teams und team_members mit Rolle admin anlegen, audit_log"]:::ok

  N4 --> V1["Einladung erzeugen"]:::step
  V1 --> V2["Token zufällig 128 Bit, Ablauf 7 Tage"]
  V2 --> V3["Link mit Vorschaubild: Teamname, Logo, Spieleranzahl"]
  V3 --> V4["Teilen über WhatsApp und Kopieren"]

  V4 --> J1["Eingeladener öffnet /einladung/token"]
  J1 --> J2{"Token gültig und nicht abgelaufen?"}
  J2 -- nein --> J2a["Hinweis: Link abgelaufen, Team-Admin um neuen Link bitten"]:::bad
  J2 -- ja --> J3{"Eingeloggt?"}
  J3 -- nein --> J3a["Erst Google Login, danach zurück zum Link"]:::step
  J3a --> J4
  J3 -- ja --> J4{"Schon Mitglied?"}
  J4 -- ja --> J4a["Weiter zur Teamseite"]:::ok
  J4 -- nein --> J5{"Team voll? OFFEN: maximale Kadergröße"}
  J5 -- ja --> J5a["Hinweis Team voll"]:::open
  J5 -- nein --> J6["Beitritt: team_members Rolle player"]:::ok
  J6 --> J7["Team-Admin erhält Benachrichtigung"]

  N4 --> M1["Verwaltung im Team-Bereich"]:::step
  M1 --> M2["Mitglied entfernen"]
  M1 --> M3["Admin-Rolle übertragen oder zweiten Admin ernennen"]
  M1 --> M4["Aufstellung festlegen: Stamm, Wechsel"]
  M1 --> M5["Logo, Name, Stadt ändern, audit_log"]
  M1 --> M6["Einladung widerrufen oder neu erzeugen"]
  M1 --> M7["Team verlassen"]
  M7 --> M7a{"Letzter Admin?"}
  M7a -- ja --> M7b["Erst Admin übertragen oder Team auflösen"]:::bad
  M7a -- nein --> M7c["Austritt, Spielteilnahmen in offenen Lobbys werden entfernt"]:::ok
  M1 --> M8["Team auflösen"]
  M8 --> M8a{"Offene Spiele?"}
  M8a -- ja --> M8b["Erst absagen, Erstattung nach Regel"]:::bad
  M8a -- nein --> M8c["Team archivieren, Historie bleibt sichtbar"]:::ok

  PA1["Platform-Admin"]:::step --> PA2["Team verifizieren"]
  PA1 --> PA3["Teams zusammenführen bei Duplikaten, Historie wird umgehängt, audit_log"]
  PA1 --> PA4["Team sperren"]
```

---

## D3. Spielsuche: erstellen, finden, annehmen

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef step fill:#1d5fa8,color:#fff
  classDef open fill:#b8860b,color:#fff

  C1["Team-Admin erstellt Spielsuche"]:::step
  C1 --> C2["Felder: Team, Stadt, Datum, Uhrzeit, Dauer 60 oder 90, Spielstärke, öffentlich oder privat, Notiz"]
  C2 --> C3{"Team-Admin dieses Teams?"}
  C3 -- nein --> C3a["Verboten"]:::bad
  C3 -- ja --> C4{"Startzeit in der Zukunft, mindestens 24 Stunden?"}
  C4 -- nein --> C4a["Fehler OFFEN: Mindestvorlauf festlegen"]:::open
  C4 -- ja --> C5{"Überschneidet sich mit anderem Spiel des Teams?"}
  C5 -- ja --> C5a["Warnung, Bestätigung nötig"]:::open
  C5 -- nein --> C6{"Ziel festgelegt?"}
  C6 -- "offen für alle" --> C7["status offen, öffentlich in der Liste"]:::ok
  C6 -- "bestimmtes Team herausfordern" --> C8["target_team_id gesetzt, nur dieses Team sieht Annahme"]:::ok
  C6 -- "wiederkehrend" --> C9["Serie: jede Woche gleicher Tag, Folgesuchen werden vorab erzeugt"]:::ok
  C7 --> L
  C8 --> L["Benachrichtigung an Zielteam oder passende Teams"]
  C9 --> L

  F1["Gegner sucht in der Liste"]:::step
  F1 --> F2["Filter: Stadt, Umkreis, Datum, Dauer, Stärke von bis"]
  F2 --> F3["Sortierung: Datum, Nähe, Zuverlässigkeit"]
  F3 --> F4["Details: Team, Bilanz, Elo, Zuverlässigkeit, Notiz"]
  F4 --> A1["Annehmen klicken durch Team-Admin eines anderen Teams"]

  A1 --> A2{"Eigenes Team ungleich Suchteam?"}
  A2 -- nein --> A2a["Verboten"]:::bad
  A2 -- ja --> A3{"Zeitüberschneidung beim Gegner-Team?"}
  A3 -- ja --> A3a["Warnung"]:::open
  A3 -- nein --> A4["Transaktion starten, Suche sperren"]
  A4 --> A5{"status noch offen?"}
  A5 -- nein --> A5a["Fehler: gerade vergeben, Liste neu laden"]:::bad
  A5 -- ja --> A6["match_requests status matched"]:::ok
  A6 --> A7["matches mit Status lobby anlegen, Heim gleich Suchteam"]:::ok
  A7 --> A8["Beide Team-Admins werden Teilnehmer, audit_log"]
  A8 --> A9["Benachrichtigung an beide Teams, Lobby-Link"]

  X1["Zeit verstrichen ohne Annahme"] --> X2["status expired durch Hintergrundjob"]:::bad
  X3["Team-Admin zieht zurück"] --> X4["status cancelled"]:::bad
```

---

## D4. Lobby: Regeln für Teilnehmer, Bereit, Ersatz

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef step fill:#1d5fa8,color:#fff
  classDef open fill:#b8860b,color:#fff

  L0["Lobby geöffnet nach Annahme"]:::step
  L0 --> V1["Ort und Zeit abstimmen: Ort als Text, später Halle aus Liste"]
  V1 --> V2{"Beide Team-Admins einverstanden?"}
  V2 -- nein --> V2a["Gegenvorschlag, Verlauf sichtbar"]:::open
  V2a --> V1
  V2 -- ja --> V3["Termin fest, Teilnahme öffnet"]:::ok

  V3 --> T1["Teammitglied tritt bei"]
  T1 --> T2{"Mitglied eines der beiden Teams?"}
  T2 -- ja --> T3{"Plätze des Teams frei? 5 Startspieler plus 1 Ersatz, also 6"}
  T3 -- nein --> T3a["Lobby-Teilnahme für dieses Team voll, Hinweis"]:::bad
  T3 -- ja --> T4["Teilnehmer mit team_id"]:::ok
  T2 -- nein --> S1{"Lobby öffentlich?"}
  S1 -- nein --> S1a["Verboten"]:::bad
  S1 -- ja --> S2{"Ersatz gesucht? Team hat Lücke und Admin hat Ersatzplätze freigegeben"}
  S2 -- nein --> S2a["Nur zuschauen"]:::bad
  S2 -- ja --> S3["Fremder tritt bei: is_substitute wahr, team_id leer bis Team-Admin zuweist"]:::ok
  S3 --> S4["Team-Admin kann annehmen oder entfernen"]

  T4 --> R1["Bereit drücken"]
  S4 --> R1
  R1 --> R2{"Phase 2: Anteil bezahlt?"}
  R2 -- nein --> R2a["Erst zahlen"]:::open
  R2 -- ja --> R3["ready_at gesetzt"]:::ok
  R3 --> R4["Echtzeit-Update an alle in der Lobby"]

  R4 --> M1{"Beide Teams Bereit und Mindestanzahl erreicht?"}
  M1 -- ja --> M2["Status confirmed, Buchungsauftrag Phase 2"]:::ok
  M1 -- nein --> M3{"24 Stunden vor Anstoß und Mindestanzahl nicht erreicht?"}
  M3 -- ja --> M4["Auto-Absage, Erstattung Phase 2"]:::bad
  M3 -- nein --> R4

  A1["Team-Admin Aktionen"]:::step --> A2["Spieler entfernen"]
  A1 --> A3["Mindestanzahl ändern bis Frist"]
  A1 --> A4["Ersatzplätze freigeben"]
  A1 --> A5["Lobby absagen mit Grund"]
  A5 --> A6["Benachrichtigung an alle, Erstattung Phase 2 nach Stornoregel"]:::bad
  PA["Platform-Admin"]:::step --> PA1["Alle obigen Aktionen für jedes Spiel, audit_log"]
  U1["Teilnehmer meldet sich ab"]:::step --> U2["Abmeldung, Zuverlässigkeits-Wert wird je nach Frist beeinflusst"]
  U2 --> U3["Freier Platz, Ersatz kann nachrücken"]
```

---

## D5. Spieltag: Live-Eingabe, Ergebnis, Auswertung

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef step fill:#1d5fa8,color:#fff
  classDef open fill:#b8860b,color:#fff

  S0["Anstoßzeit erreicht"]:::step
  S0 --> S1["Spiel wechselt auf live, Livescore sichtbar"]
  S1 --> E1["Erfasser: Team-Admin beider Teams oder Platform-Admin"]
  E1 --> E2["Große Knöpfe für Handy: Tor Heim, Tor Gast, Karte"]
  E2 --> E3["Tor: Team wählen, Torschütze aus Teilnehmerliste, Minute automatisch aus Uhr oder manuell"]
  E3 --> E4["match_events anlegen, Zwischenstand neu berechnen"]
  E4 --> E5["Echtzeit-Update an Zuschauer, Spielseite, Overlay"]
  E2 --> E6["Rückgängig der letzten Aktion, audit_log"]
  E2 --> E7["Karte: gelb oder rot mit Spieler"]

  E5 --> F1["Spielende: Endergebnis melden"]
  F1 --> F2{"Endstand gleich Summe der Tore?"}
  F2 -- nein --> F2a["Hinweis: Torschützen fehlen, trotzdem möglich"]:::open
  F2 -- ja --> F3
  F2a --> F3["match_results: confirmed für meldendes Team"]
  F3 --> F4["Gegner-Team-Admin wird benachrichtigt"]
  F4 --> F5{"Gegner bestätigt innerhalb von 48 Stunden?"}
  F5 -- bestätigt --> G1["confirmed beide, Status played"]:::ok
  F5 -- widerspricht --> D1["disputed wahr, Status disputed"]:::bad
  F5 -- "keine Antwort nach 48 Stunden" --> D2["Erinnerung nach 24 Stunden, nach 48 Stunden gilt das Ergebnis automatisch"]:::ok
  D2 --> G1
  D1 --> D3["Aufgabe an Platform-Admin"]
  D3 --> D4["Admin prüft Meldungen, Fotos, fragt nach"]
  D4 --> D5["Admin setzt Ergebnis, Begründung Pflicht, audit_log"]:::ok
  D5 --> G1

  G1 --> P1["Auswertungs-Pipeline"]:::step
  P1 --> P2["Elo Teams und Spieler aktualisieren"]
  P1 --> P3["Statistiken: Spiele, Tore, Siege je Spieler und Team"]
  P1 --> P4["Zuverlässigkeit: erschienen oder nicht, attended"]
  P1 --> P5["Abzeichen prüfen: 10 Spiele, Hattrick, Fairplay"]
  P1 --> P6["Liga- und Turniertabelle aktualisieren"]
  P1 --> P7["Stadt-Challenge Wertung aktualisieren"]
  P1 --> P8["Spielbericht-Karte als Bild erzeugen"]
  P1 --> P9["Benachrichtigung mit Ergebnis, Karte und Revanche-Angebot"]
  P1 --> P10["Spielerwahl Spieler des Spiels öffnet für 24 Stunden"]
```

---

## D6. Zahlung und Webhook (Sequenz, Phase 2)

```mermaid
sequenceDiagram
  autonumber
  actor U as Spieler
  participant UI as Frontend
  participant SV as Backend
  participant ST as Stripe oder PayPal
  participant DB as PostgreSQL

  U->>UI: Guthaben aufladen, Betrag und optional Code
  UI->>SV: createTopUp betrag, code
  SV->>DB: Code prüfen: gültig, nicht eingelöst, Budget frei, Neukunde falls nötig
  SV->>DB: payments anlegen status pending mit idempotency_key
  SV->>ST: Checkout-Sitzung erstellen
  ST-->>SV: Checkout-URL
  SV-->>UI: Weiterleitung
  U->>ST: Bezahlt
  ST-->>U: Weiterleitung zurück zur Seite
  ST->>SV: Webhook payment succeeded mit Signatur
  SV->>SV: Signatur und Zeitstempel prüfen
  alt Event schon verarbeitet
    SV-->>ST: 200 OK ohne Änderung
  else neues Event
    SV->>DB: Transaktion: payments status succeeded
    SV->>DB: ledger Eintrag Gutschrift Guthaben
    SV->>DB: ledger Eintrag Zahlungsgebühr als Kosten
    SV->>DB: Rabatt als eigener ledger Eintrag mit Budget-Abzug
    SV-->>ST: 200 OK
  end
  UI->>SV: Status abfragen oder per Echtzeit
  SV-->>UI: Neuer Saldo
  Note over SV,DB: Fehlgeschlagene oder abgelaufene Zahlung: status failed, kein ledger Eintrag
  Note over SV,DB: Rückbuchung vom Anbieter: Gegenbuchung, Konto kann negativ werden, Admin-Alarm
```

---

## D7. Ledger: Konten und Buchungsarten

```mermaid
flowchart LR
  classDef acc fill:#1d5fa8,color:#fff
  classDef ev fill:#b8860b,color:#fff

  subgraph KONTEN["Konten"]
    K1["Spieler-Guthaben pro Nutzer: Schuld der Plattform"]:::acc
    K2["Plattform-Einnahmen Spiel"]:::acc
    K3["Hallen-Kosten"]:::acc
    K4["Zahlungs-Gebühren"]:::acc
    K5["Rabatt-Aufwand"]:::acc
    K6["Erstattungs-Aufwand"]:::acc
    K7["Zahlungsanbieter-Bestand"]:::acc
  end

  subgraph BUCHUNGEN["Buchungsarten, jede unveränderlich"]
    B1["TOPUP: Aufladung"]:::ev
    B2["MATCH_SHARE: Spielanteil abgebucht"]:::ev
    B3["PROMO_CREDIT: Rabatt gutgeschrieben"]:::ev
    B4["REFUND: Erstattung aufs Guthaben"]:::ev
    B5["VENUE_COST: Hallenmiete bezahlt"]:::ev
    B6["FEE: Zahlungsgebühr"]:::ev
    B7["ADJUSTMENT: Admin-Korrektur mit Grund"]:::ev
    B8["REVERSAL: Gegenbuchung einer Buchung"]:::ev
    B9["CHARGEBACK: Rückbuchung durch Anbieter"]:::ev
  end

  B1 -->|"Soll Anbieter-Bestand, Haben Spieler-Guthaben"| K1
  B1 --> K7
  B2 -->|"Soll Spieler-Guthaben, Haben Einnahmen"| K1
  B2 --> K2
  B3 -->|"Soll Rabatt-Aufwand, Haben Spieler-Guthaben"| K5
  B3 --> K1
  B4 -->|"Soll Einnahmen oder Erstattungs-Aufwand, Haben Spieler-Guthaben"| K6
  B4 --> K1
  B5 -->|"Soll Hallen-Kosten"| K3
  B6 -->|"Soll Gebühren"| K4
  B7 --> K1
  B8 -->|"verweist mit reverses_entry_id auf Original"| K1
  B9 --> K1
  B9 --> K7
```

Regeln:
- Jede Buchung hat `idempotency_key`, `reason`, `at`, `actor_id` und bei Spielbezug `match_id`.
- Salden werden aus Buchungen berechnet (mit Zwischensummen nur als Cache).
- Korrekturen sind nur Gegenbuchungen, nie Änderung oder Löschen.
- Offene Guthaben aller Spieler = Schuld der Plattform und erscheint im Monatsabschluss.

---

## D8. Buchungsauftrag (Halle)

```mermaid
stateDiagram-v2
  [*] --> OFFEN: Spiel bestätigt und bezahlt
  OFFEN --> IN_ARBEIT: Admin oder Agent übernimmt
  IN_ARBEIT --> GEBUCHT: Halle reserviert, Nachweis hochgeladen
  IN_ARBEIT --> NICHT_VERFUEGBAR: Halle zur Zeit belegt
  NICHT_VERFUEGBAR --> IN_ARBEIT: Alternative Halle oder Zeit versuchen
  NICHT_VERFUEGBAR --> TEAMS_FRAGEN: Teams um neuen Termin bitten
  TEAMS_FRAGEN --> OFFEN: Neuer Termin einvernehmlich
  TEAMS_FRAGEN --> ABGESAGT: Kein Termin gefunden
  GEBUCHT --> BESTAETIGT: Halle bestätigt schriftlich
  GEBUCHT --> ZURUECKGEZOGEN: Spiel wird abgesagt
  BESTAETIGT --> ERLEDIGT: Spiel hat stattgefunden, Hallenkosten gebucht
  BESTAETIGT --> ZURUECKGEZOGEN: Spiel wird abgesagt
  ZURUECKGEZOGEN --> STORNO_HALLE: Storno bei Halle, Kosten prüfen
  ABGESAGT --> ERSTATTUNG
  STORNO_HALLE --> ERSTATTUNG
  ERSTATTUNG --> [*]
  ERLEDIGT --> [*]
```

---

## D9. Erstattungs-Entscheidung

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef open fill:#b8860b,color:#fff

  R0["Anlass: Absage oder Abmeldung"]
  R0 --> R1{"Wer löst aus?"}
  R1 -- "Plattform: Auto-Absage, Halle nicht verfügbar, Admin-Absage" --> R2["100 Prozent aller Anteile zurück aufs Guthaben"]:::ok
  R1 -- "Gegnerisches Team sagt ab" --> R3["100 Prozent für alle, Zuverlässigkeit des absagenden Teams sinkt"]:::ok
  R1 -- "Einzelner Spieler meldet sich ab" --> R4{"Zeitpunkt bis Anstoß"}
  R4 -- "mindestens 24 Stunden vor Anstoß" --> R5["100 Prozent zurück"]:::ok
  R4 -- "weniger als 24 Stunden" --> R6{"Ersatz gefunden?"}
  R6 -- ja --> R7["100 Prozent zurück, Ersatz zahlt seinen Anteil"]:::ok
  R6 -- nein --> R10["keine Erstattung, Admin kann Ausnahme buchen"]:::bad
  R1 -- "Spieler erscheint nicht" --> R11["keine Erstattung, Zuverlässigkeit sinkt"]:::bad
  R1 -- "Höhere Gewalt, Verletzung, Halle gesperrt" --> R12["Admin entscheidet, Grund Pflicht"]:::open

  R2 --> L["Ledger: REFUND je Spieler mit Verweis auf MATCH_SHARE"]
  R3 --> L
  R5 --> L
  R7 --> L
  R12 --> L
  L --> N["Benachrichtigung an Spieler, Beleg als Gutschrift"]
  L --> F["Finanz-Dashboard: Erstattung mit Grund pro Spieler und Spiel"]
```

---

## D10. Benachrichtigungen (Auslöser, Empfänger, Kanal)

```mermaid
flowchart LR
  classDef ev fill:#1d5fa8,color:#fff
  classDef who fill:#1f7a3a,color:#fff
  classDef ch fill:#444,color:#fff

  subgraph EREIGNISSE["Auslöser"]
    E1["Spielsuche passt zu Teamprofil"]:::ev
    E2["Herausforderung erhalten"]:::ev
    E3["Suche angenommen, Lobby offen"]:::ev
    E4["Spieler tritt Team oder Lobby bei"]:::ev
    E5["Ersatzspieler meldet sich"]:::ev
    E6["Zahlung fällig und Frist"]:::ev
    E7["Zahlung eingegangen"]:::ev
    E8["Spiel bestätigt und Halle gebucht"]:::ev
    E9["Erinnerung 24 Stunden, 2 Stunden, 30 Minuten"]:::ev
    E10["Auto-Absage oder Absage"]:::ev
    E11["Erstattung gebucht"]:::ev
    E12["Ergebnis gemeldet, bitte bestätigen"]:::ev
    E13["Streitfall eröffnet oder entschieden"]:::ev
    E14["Auswertung fertig, Karte, Revanche"]:::ev
    E15["Meldung eingegangen"]:::ev
    E16["Verwarnung oder Sperre"]:::ev
    E17["Neues Abzeichen"]:::ev
    E18["Buchungsauftrag offen"]:::ev
    E19["Alarm: Verlustspiel, auffällige Erstattungen"]:::ev
  end

  subgraph EMPFAENGER["Empfänger"]
    W1["Team-Admins"]:::who
    W2["Teilnehmer der Lobby"]:::who
    W3["Betroffener Spieler"]:::who
    W4["Gegner-Team-Admin"]:::who
    W5["Platform-Admin und Rollen"]:::who
    W6["Zuschauer mit Folge-Funktion OFFEN"]:::who
  end

  subgraph KANAL["Kanäle, je Nutzer einstellbar"]
    C1["In-App Glocke"]:::ch
    C2["Web-Push"]:::ch
    C3["E-Mail"]:::ch
    C4["WhatsApp-Link zum Teilen"]:::ch
  end

  E1 --> W1
  E2 --> W1
  E3 --> W1
  E3 --> W2
  E4 --> W1
  E5 --> W1
  E6 --> W3
  E7 --> W3
  E8 --> W2
  E9 --> W2
  E10 --> W2
  E11 --> W3
  E12 --> W4
  E13 --> W1
  E13 --> W5
  E14 --> W2
  E15 --> W5
  E16 --> W3
  E17 --> W3
  E18 --> W5
  E19 --> W5

  W1 --> C1
  W2 --> C1
  W3 --> C1
  W4 --> C1
  W5 --> C1
  W1 --> C2
  W2 --> C2
  W3 --> C2
  W4 --> C2
  W5 --> C3
  W3 --> C3
  W2 --> C4
```

Regeln: Ruhezeiten pro Nutzer, Zusammenfassung statt Einzelnachrichten bei vielen Ereignissen, jede Art einzeln abschaltbar außer Sicherheits- und Zahlungsnachrichten.

---

## D11. Meldungen und Moderation

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef bad fill:#a83f3f,color:#fff
  classDef step fill:#1d5fa8,color:#fff

  M1["Nutzer meldet Profil, Team, Kommentar, Spiel oder Foto"]:::step
  M1 --> M2["Grund wählen: Beleidigung, Fake-Profil, Nichterscheinen, Betrug, Sonstiges, Freitext"]
  M2 --> M3["reports anlegen mit Verweis auf Objekt und Spiel"]
  M3 --> M4{"Mehrere Meldungen zum selben Objekt?"}
  M4 -- "ab 3 OFFEN" --> M5["Objekt wird automatisch ausgeblendet bis zur Prüfung"]:::bad
  M4 -- nein --> M6["Aufgabe an Moderator"]
  M5 --> M6
  M6 --> M7{"Entscheidung"}
  M7 -- unbegründet --> M8["Meldung abgelehnt, Melder informiert"]:::ok
  M7 -- begründet --> M9["Inhalt entfernen"]:::bad
  M9 --> M10{"Maßnahme gegen Verursacher"}
  M10 -- leicht --> M11["Verwarnung gespeichert"]
  M10 -- wiederholt --> M12["Zeitweise Sperre"]:::bad
  M10 -- schwer --> M13["Dauerhafte Sperre, Guthaben bleibt erstattbar"]:::bad
  M11 --> M14["Benachrichtigung an Betroffenen mit Begründung"]
  M12 --> M14
  M13 --> M14
  M8 --> A["audit_log"]
  M14 --> A
  A --> Z["Einspruch möglich per Kontaktformular, Admin entscheidet"]
```

---

## D12. Inhalte der Seiten (was steht wo)

```mermaid
mindmap
  root((Seiteninhalte))
    Startseite
      Hero mit Video und Foto aus dem Sample
      Offene Spielsuchen nächste 7 Tage
      Top-Teams der Stadt
      Stadt-Challenge Stand
      Nächster Profi-Tag
      Jetzt Team gründen
    Spielerprofil
      Foto Name Stadt Position
      Verifiziert-Badge bei Profis
      Teams aktuell und früher
      Fakten Spiele Tore Siege
      Abzeichen
      Letzte Spiele
      Nicht öffentlich Zuverlässigkeit
      Melden
    Teamseite
      Logo Name Stadt
      Bilanz Siege Remis Niederlagen
      Elo und Rang in der Stadt
      Kader mit Positionen
      Nächste Spiele
      Letzte Ergebnisse
      Foto-Galerie
      Herausfordern
      Kommentare moderiert
    Spielseite
      Teams und Stand live
      Ereignisse mit Minute und Torschütze
      Aufstellung
      Ort Zeit Dauer
      Stream-Einbettung
      Spielbericht-Karte teilen
      Kommentare moderiert
      Spieler des Spiels
    Lobby
      Countdown
      Teilnehmerliste mit Bereit-Status
      Zahlungsstatus pro Spieler
      Ort und Zeit Vorschlag
      Ersatzplätze
      Absagen und Abmelden
      Wiederholen und Revanche
    Hallenseite
      Adresse Karte Anfahrt
      Preise 60 und 90 Minuten
      Ausstattung Boden Duschen Parken
      Bewertungen der Halle
      Sponsor der Halle
    Ranglisten
      Elo Teams
      Elo Spieler OFFEN
      Saison pro Stadt
      Stadt gegen Stadt
    Meine Guthaben
      Saldo
      Aufladen
      Code einlösen
      Verlauf mit Spielbezug
      Belege PDF
```

---

## D13. Ligen, Turniere, Stadt-Challenge, Profi-Tag

```mermaid
flowchart TD
  classDef ok fill:#1f7a3a,color:#fff
  classDef step fill:#1d5fa8,color:#fff
  classDef open fill:#b8860b,color:#fff

  subgraph LIGA["Liga und Saison"]
    L1["Admin legt Liga an: NRW, Gelsenkirchen, Essen"]:::step
    L1 --> L2["Saison mit Start und Ende"]
    L2 --> L3["Spiele werden der Saison zugeordnet: automatisch nach Stadt oder manuell"]:::open
    L3 --> L4["Tabelle: Punkte 3 für Sieg 1 für Remis, Tordifferenz, Tore, direkter Vergleich"]
    L4 --> L5["Saisonende: Meister, Archiv, Rangliste setzt zurück"]:::ok
  end

  subgraph CHALLENGE["Stadt-Challenge"]
    C1["Monatliche Paarung zweier Städte"]:::step
    C1 --> C2["Jedes bestätigte Spiel zählt für die Stadt des Teams"]
    C2 --> C3["Wertung: Siege pro Stadt, OFFEN: Normierung nach Teamanzahl"]:::open
    C3 --> C4["Monatsende: Sieger-Stadt, Abzeichen, Social-Karte"]:::ok
  end

  subgraph TURNIER["Turniere gegen Gebühr"]
    T1["Veranstalter legt Turnier an: Datum, Ort, Gebühr, max Teams, Modus"]:::step
    T1 --> T2["Teams melden an und zahlen Gebühr, Warteliste bei voll"]
    T2 --> T3["Anmeldeschluss, Admin prüft"]
    T3 --> T4["Spielplan-Generator: Gruppen und K.o. oder Liga-Modus"]
    T4 --> T5["Spiele laufen wie normale Spiele mit Live-Eingabe"]
    T5 --> T6["Tabelle, Finale, Siegerehrung, Auszahlung abzüglich Gebühr OFFEN"]:::open
  end

  subgraph PROTAG["Profi-Tag"]
    P1["Admin legt Event an mit Profi, Datum, Ort"]:::step
    P1 --> P2["Teams bewerben sich"]
    P2 --> P3["Verlosung: Zufall mit Kriterien Zuverlässigkeit und Stadt"]:::open
    P3 --> P4["Gewinnerteam wird informiert, Lobby mit Profi als Teilnehmer"]
    P4 --> P5["Spiel, Fotos, Spielbericht-Karte mit Profi"]:::ok
  end
```

---

## D14. Service-Schnittstellen (Funktionen und Rechte)

```mermaid
classDiagram
  class AuthService {
    +signInWithGoogle() Session
    +completeOnboarding(profile) User
    +requireUser() User
    +requireRole(role) User
    +banUser(userId, reason) void
  }
  class TeamService {
    +createTeam(name, city, logo) Team
    +updateTeam(teamId, patch) Team
    +createInvite(teamId) Invite
    +revokeInvite(token) void
    +joinWithInvite(token) Member
    +removeMember(teamId, userId) void
    +transferAdmin(teamId, userId) void
    +leaveTeam(teamId) void
    +archiveTeam(teamId) void
    +verifyTeam(teamId) void
    +mergeTeams(fromId, toId) void
  }
  class RequestService {
    +createRequest(teamId, input) Request
    +challengeTeam(teamId, targetTeamId, input) Request
    +listOpen(filter) Request[]
    +acceptRequest(requestId, teamId) Match
    +cancelRequest(requestId) void
    +createRecurring(teamId, input) Request[]
    +expireOld() number
  }
  class LobbyService {
    +joinLobby(matchId) Participant
    +joinAsSubstitute(matchId) Participant
    +assignSubstitute(matchId, userId, teamId) void
    +leaveLobby(matchId) void
    +setReady(matchId) void
    +setVenue(matchId, venue) void
    +setMinPlayers(matchId, n) void
    +cancelMatch(matchId, reason) void
    +evaluateConfirmation(matchId) Status
  }
  class ResultService {
    +addEvent(matchId, event) Event
    +undoLastEvent(matchId) void
    +submitResult(matchId, home, away) Result
    +confirmResult(matchId) Result
    +disputeResult(matchId, reason) Result
    +adminSetResult(matchId, home, away, reason) Result
  }
  class RealtimeService {
    +subscribe(channel) Stream
    +publish(channel, payload) void
  }
  class NotificationService {
    +notify(userIds, type, payload) void
    +setPreferences(prefs) void
    +digest(userId) void
  }
  class LedgerService {
    +post(entry) Entry
    +reverse(entryId, reason) Entry
    +balance(userId) Money
    +statement(userId, range) Entry[]
  }
  class PaymentService {
    +createTopUp(amount, code) Checkout
    +handleWebhook(event, signature) void
    +chargeMatchShare(matchId, userId) Entry
  }
  class RefundService {
    +decide(matchId, userId, trigger) Decision
    +refund(matchId, userId, amount, reason) Entry
    +cancelAndRefundAll(matchId) void
  }
  class PromoService {
    +validate(code, userId) Promo
    +redeem(code, userId) Entry
    +create(rule) Promo
  }
  class BookingService {
    +createJob(matchId) Job
    +assign(jobId, assignee) void
    +markBooked(jobId, proof) void
    +markFailed(jobId, note) void
  }
  class FinanceReportService {
    +perMatch(matchId) Report
    +perPlayer(matchId) Row[]
    +monthly(month) Report
    +liabilities() Money
    +exportCsv(range) File
    +alerts() Alert[]
  }
  class RatingService {
    +updateAfterMatch(matchId) void
    +leaderboard(city, season) Row[]
  }
  class StatsService {
    +playerStats(userId) Stats
    +teamStats(teamId) Stats
    +reliability(userId) Score
  }
  class BadgeService {
    +evaluate(userId) Badge[]
  }
  class ModerationService {
    +report(target, reason) Report
    +decide(reportId, action) void
    +hide(target) void
    +warn(userId, text) void
  }
  class CardService {
    +renderMatchCard(matchId) Image
  }
  class LeagueService {
    +createLeague(input) League
    +createSeason(leagueId, range) Season
    +standings(seasonId) Row[]
  }
  class TournamentService {
    +create(input) Tournament
    +register(tournamentId, teamId) Entry
    +generateSchedule(tournamentId) Match[]
  }
  class AuditService {
    +record(actor, action, entity, before, after) void
    +search(filter) Entry[]
  }

  LobbyService --> NotificationService
  LobbyService --> RealtimeService
  LobbyService --> RefundService
  LobbyService --> BookingService
  RequestService --> LobbyService
  RequestService --> NotificationService
  ResultService --> RealtimeService
  ResultService --> RatingService
  ResultService --> StatsService
  ResultService --> BadgeService
  ResultService --> CardService
  ResultService --> LeagueService
  PaymentService --> LedgerService
  RefundService --> LedgerService
  PromoService --> LedgerService
  FinanceReportService --> LedgerService
  TournamentService --> PaymentService
  TeamService --> AuditService
  LobbyService --> AuditService
  ResultService --> AuditService
  ModerationService --> AuditService
  LedgerService --> AuditService
```

---

## D15. Hintergrundjobs und Zeitsteuerung

```mermaid
flowchart TD
  classDef job fill:#1d5fa8,color:#fff
  classDef eff fill:#1f7a3a,color:#fff

  T1["Jede Minute"]:::job
  T1 --> T1a["Lobbys auf Mindestanzahl und 24-Stunden-Frist prüfen"]:::eff
  T1 --> T1b["Spiele zur Anstoßzeit auf live setzen"]:::eff
  T1 --> T1c["Erinnerungen versenden: 24 h, 2 h, 30 min vor Anstoß"]:::eff

  T2["Alle 5 Minuten"]:::job
  T2 --> T2a["Abgelaufene Spielsuchen auf expired"]:::eff
  T2 --> T2b["Nicht bestätigte Zahlungen abgleichen mit Anbieter"]:::eff
  T2 --> T2c["Ergebnis ohne Antwort nach 24 und 48 Stunden erinnern oder eskalieren"]:::eff

  T3["Stündlich"]:::job
  T3 --> T3a["Wiederkehrende Spiele: nächste Woche vorab anlegen"]:::eff
  T3 --> T3b["Offene Buchungsaufträge älter als 12 Stunden an Admin melden"]:::eff
  T3 --> T3c["Einladungs-Token abgelaufen löschen"]:::eff
  T3 --> T3d["Spieler des Spiels Wahl nach 24 Stunden schließen"]:::eff

  T4["Täglich"]:::job
  T4 --> T4a["Alarme: Verlustspiele, auffällige Erstattungen, Zahlung ohne Buchung"]:::eff
  T4 --> T4b["Ledger-Prüfung: Summen stimmen mit Zahlungsanbieter überein"]:::eff
  T4 --> T4c["Datenbank-Sicherung"]:::eff
  T4 --> T4d["Zuverlässigkeits-Werte neu berechnen"]:::eff

  T5["Wöchentlich und monatlich"]:::job
  T5 --> T5a["Wöchentlich: Rangliste je Stadt"]:::eff
  T5 --> T5b["Monatlich: Monatsabschluss, Stadt-Challenge schließen, Saisonwechsel prüfen"]:::eff
  T5 --> T5c["Monatlich: Guthaben-Schuld Bericht"]:::eff
```

---

## D16. Sicherheit und Integrität

```mermaid
mindmap
  root((Sicherheit))
    Zugang
      Google OAuth only
      Mindestalter 16
      Sperren prüfen bei jeder Anfrage
      Rollen serverseitig prüfen nie nur im Frontend
    Missbrauch
      Rate-Limit für Login Einladung Meldung Erstellung
      Maximale Spielsuchen pro Team
      Einladungs-Token 128 Bit mit Ablauf
      Duplikat-Erkennung Teams
    Daten
      Eingaben mit Zod prüfen
      SQL nur parametrisiert über Drizzle
      Ausgabe escapen
      Uploads Typ und Größe begrenzen
      Bilder neu enkodieren
    Geld
      Beträge als Cent Integer
      Ledger unveränderlich
      Webhooks mit Signatur und Idempotenz
      Admin-Korrekturen nur als Gegenbuchung
      Tägliche Abstimmung mit Anbieter
    Nachvollziehbarkeit
      audit_log für jede Admin-Aktion
      Vorher und Nachher gespeichert
      Ergebnisse zweistufig bestätigt
      Streitfall mit Begründung Pflicht
    Datenschutz
      Datenexport pro Nutzer
      Konto löschen mit Anonymisierung
      Nur Fakten in Profilen
      Zuverlässigkeit nur für Admins sichtbar
      Einwilligungen mit Zeitstempel
    Betrieb
      Secrets nur in Umgebungsvariablen
      Sicherungen getestet
      Fehler in Sentry
      Abhängigkeiten regelmäßig aktualisieren
```

---

## D17. Offene Entscheidungen

```mermaid
mindmap
  root((Offen))
    Entschieden
      5 gegen 5 plus 1 Ersatz pro Team
      Ergebnis gilt nach 48 Stunden automatisch
      Kostenlos kündigen bis 24 Stunden vorher
      Mindestalter 16 ohne Konto darunter
    Spiel
      Maximale Kadergröße des Teams
      Mindestvorlauf einer Spielsuche
      Ersatzplätze wer gibt frei
      Mindestanzahl Spieler pro Lobby Vorschlag 8
    Geld
      Anteil nach tatsächlicher Spielerzahl bestätigen
      Ablauf von Guthaben ja oder nein
      Auszahlung ausgeschlossen bestätigen
      Gebührenmodell Aufschlag oder Marge
      Turnier-Auszahlung an Veranstalter
    Nutzer
      Elo für Spieler oder nur für Teams
      Folgen-Funktion für Zuschauer
      Meldeschwelle für automatisches Ausblenden
    Wettbewerb
      Zuordnung Spiele zu Liga automatisch
      Normierung Stadt-Challenge
      Verlosungskriterien Profi-Tag
      Tiebreaker in Tabellen
    Recht
      Gewerbeform und Steuer
      AGB Widerruf Hausordnung
      Haftung und Versicherung Halle
      Datenschutz Verträge mit Dienstleistern
    Technik
      Echtzeit nur SSE oder auch WebSocket
      Hosting und Region
      Objekt-Speicher Anbieter
      Agent-Anbindung an Hallen
```
