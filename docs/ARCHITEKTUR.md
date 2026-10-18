# SoccaV2 – Architektur in Diagrammen

Legende der Phasen in allen Diagrammen:
**P1** Fundament (Auth, Teams, Spielsuche, Lobby, Ergebnis) · **P2** Geld und Halle · **P3** Profile und Community · **P4** Ligen, Turniere, Events · **P5** Reichweite (Streaming, International)

---

## 1. Gesamtübersicht (Akteure, Oberflächen, Dienste, Daten, Externe)

```mermaid
flowchart TB
  classDef p1 fill:#1f7a3a,stroke:#0d3d1c,color:#fff
  classDef p2 fill:#b8860b,stroke:#5c4305,color:#fff
  classDef p3 fill:#1d5fa8,stroke:#0c2f55,color:#fff
  classDef p4 fill:#7a3fa8,stroke:#3b1d55,color:#fff
  classDef p5 fill:#a83f3f,stroke:#551d1d,color:#fff
  classDef ext fill:#444,stroke:#111,color:#fff
  classDef db fill:#222,stroke:#000,color:#9fe

  subgraph AKT["1. Akteure"]
    direction LR
    Z["Zuschauer"]
    S["Spieler"]
    FS["Freier Spieler"]
    TA["Team-Admin"]
    PRO["Profi"]
    PA["Platform-Admin"]
    FIN["Finanzen"]
    MOD["Moderator"]
    SPO["Sponsor"]
    VER["Turnier-Veranstalter"]
  end

  subgraph FE["2. Frontend: Next.js PWA"]
    direction LR
    PUB["Öffentlich: Spielsuchen, Teamseiten, Livescore, Ranglisten"]:::p1
    TEAMUI["Teams, Einladungen, Aufstellung"]:::p1
    LOBBYUI["Spielsuche, Lobby, Ergebnis"]:::p1
    ADMUI["Admin-Dashboard"]:::p1
    WALLETUI["Guthaben, Aufladen, Codes, Belege"]:::p2
    PROFILEUI["Profile, Abzeichen, Kommentare, Spielbericht-Karte"]:::p3
    LEAGUEUI["Ligen, Challenge, Turniere, Events"]:::p4
    STREAMUI["Stream-Einbettung"]:::p5
  end

  subgraph BE["3. Backend-Services"]
    direction TB
    subgraph B1["Phase 1: Kern"]
      direction LR
      AUTHSVC["Auth, Rollen, Sperren"]:::p1
      TEAMSVC["Team, Einladungs-Token"]:::p1
      REQSVC["Spielsuche, Annehmen"]:::p1
      LOBSVC["Lobby, Bereit, Mindestanzahl"]:::p1
      RESSVC["Ergebnis, Streitfall"]:::p1
      EVT["Ereignisse: Tore, Karten"]:::p1
      RT["Echtzeit SSE"]:::p1
      NOTIF["Benachrichtigungen"]:::p1
      AUD["Audit-Protokoll"]:::p1
    end
    subgraph B2["Phase 2: Geld und Halle"]
      direction LR
      LEDGER["Ledger"]:::p2
      PAY["Zahlungen, Webhooks"]:::p2
      PRICE["Preise und Anteil"]:::p2
      REFUND["Erstattung, Auto-Absage"]:::p2
      PROMO["Rabattcodes"]:::p2
      BOOK["Buchungsaufträge"]:::p2
      INV["Belege PDF"]:::p2
      FINREP["Finanz-Reporting, Alarme"]:::p2
    end
    subgraph B3["Phase 3: Profile"]
      direction LR
      ELO["Elo"]:::p3
      STAT["Statistik, Zuverlässigkeit"]:::p3
      BADGE["Abzeichen"]:::p3
      CARD["Spielbericht-Karte"]:::p3
      MODSVC["Moderation"]:::p3
      MEDIA["Medien"]:::p3
    end
    subgraph B4["Phase 4 und 5"]
      direction LR
      LEAGUE["Ligen, Saisons"]:::p4
      TOUR["Turniere"]:::p4
      CHAL["Stadt-Challenge"]:::p4
      PROEVT["Profi-Tag"]:::p4
      SPONSOR["Sponsoren"]:::p4
      OVERLAY["OBS-Overlay"]:::p5
      I18N["Sprachen, Zeitzonen"]:::p5
    end
  end

  subgraph DATA["4. Daten"]
    direction LR
    PG[("PostgreSQL")]:::db
    FILES[("Datei-Speicher")]:::db
    CACHE[("Pub-Sub für SSE")]:::db
  end

  subgraph EXT["5. Externe Dienste"]
    direction LR
    GOOGLE["Google OAuth"]:::ext
    STRIPE["Stripe, PayPal"]:::ext
    MAIL["E-Mail, Web-Push"]:::ext
    HALLS["Partnerhallen, Agent"]:::ext
    TWITCH["Twitch, Kick, YouTube, OBS"]:::ext
    TAX["Steuerberater CSV"]:::ext
    JERSEY["Trikot-Partner"]:::ext
    SENTRY["Sentry"]:::ext
  end

  AKT --> FE
  FE --> BE
  BE --> DATA
  BE -.-> EXT

```

---

## 2. Seitenstruktur (alle Routen nach Rolle)

```mermaid
flowchart TD
  classDef pub fill:#1f7a3a,color:#fff
  classDef usr fill:#1d5fa8,color:#fff
  classDef adm fill:#a83f3f,color:#fff

  ROOT["/ Startseite: Hero, offene Spielsuchen, Top-Teams, Stadt-Challenge, nächster Profi-Tag"]:::pub

  ROOT --> SUCHEN["/suche Spielsuchen filtern nach Stadt, Datum, Stärke, Dauer"]:::pub
  SUCHEN --> SUCHEN_ID["/suche/id Details, Herausfordern, Annehmen"]:::pub

  ROOT --> TEAMS["/teams Teamverzeichnis"]:::pub
  TEAMS --> TEAM["/teams/slug Teamseite: Logo, Bilanz, nächste Spiele, Fotos, Herausfordern"]:::pub
  ROOT --> SPIELER["/spieler Spielerverzeichnis"]:::pub
  SPIELER --> SPIELER_ID["/spieler/id Profil: Fakten, Abzeichen, Historie, Verifiziert-Badge"]:::pub
  ROOT --> SPIELE["/spiele Livescore und Ergebnisse"]:::pub
  SPIELE --> SPIEL["/spiele/id Spielseite: Stand, Ereignisse, Aufstellung, Kommentare, Stream"]:::pub
  SPIEL --> BERICHT["/spiele/id/bericht Spielbericht-Karte teilen"]:::pub
  ROOT --> RANG["/rangliste Elo und Saison pro Stadt"]:::pub
  ROOT --> LIGEN["/ligen Ligen NRW, Gelsenkirchen, Essen"]:::pub
  LIGEN --> LIGA["/ligen/slug Tabelle und Spielplan"]:::pub
  ROOT --> CHALL["/challenge Stadt gegen Stadt"]:::pub
  ROOT --> EVENT["/events Profi-Tag und Sonderevents"]:::pub
  ROOT --> TURNIERE["/turniere Turniere gegen Gebühr"]:::pub
  TURNIERE --> TURNIER["/turniere/id Anmeldung, Spielplan, Tabelle"]:::pub
  ROOT --> HALLEN["/hallen Hallenseiten mit Bewertung"]:::pub
  ROOT --> RECHT["/impressum /datenschutz /agb /hausordnung"]:::pub

  ROOT --> LOGIN["/anmelden Google Login"]:::pub
  LOGIN --> ONB["/willkommen Onboarding: Name, Stadt, Position, Alter 16+"]:::usr

  ONB --> HOME["/app Mein Bereich"]:::usr
  HOME --> PROF_EDIT["/app/profil bearbeiten"]:::usr
  HOME --> EINST["/app/einstellungen Benachrichtigungen, Datenexport, Konto löschen"]:::usr
  HOME --> MEINETEAMS["/app/teams meine Teams"]:::usr
  MEINETEAMS --> TEAM_NEU["/app/teams/neu Team gründen"]:::usr
  MEINETEAMS --> TEAM_VERW["/app/teams/id Mitglieder, Aufstellung, Logo, Einladung"]:::usr
  TEAM_VERW --> INV_LINK["/einladung/token Beitritt über Link mit Vorschau"]:::pub
  HOME --> SUCHE_NEU["/app/suche/neu Spielsuche erstellen"]:::usr
  HOME --> FREI["/app/ich-suche-spiel Freier-Spieler-Wunsch"]:::usr
  HOME --> MEINESPIELE["/app/spiele meine Spiele"]:::usr
  MEINESPIELE --> LOBBY["/app/lobby/id Lobby, Countdown, Bereit, Zahlungsstatus"]:::usr
  LOBBY --> ERG["/app/lobby/id/ergebnis Ergebnis und Torschützen eintragen"]:::usr
  LOBBY --> REVANCHE["Revanche-Button"]:::usr
  MEINESPIELE --> WIEDER["Wiederkehrende Spiele jeden Donnerstag 20 Uhr"]:::usr
  HOME --> WALLET["/app/guthaben Saldo, Aufladen, PayPal, Codes, Verlauf, Belege"]:::usr
  HOME --> MELDEN["Melden Dialog auf Profil, Team, Kommentar"]:::usr

  ROOT --> ADM["/admin"]:::adm
  ADM --> A_TASKS["/admin/aufgaben: offene Buchungen, strittige Ergebnisse, Meldungen"]:::adm
  ADM --> A_SPIELE["/admin/spiele alle Spiele ändern, Ersatz eintragen, absagen"]:::adm
  ADM --> A_USER["/admin/nutzer Sperren, Rollen, Profi-Badge, Zuverlässigkeit"]:::adm
  ADM --> A_TEAMS["/admin/teams verifizieren, zusammenführen"]:::adm
  ADM --> A_HALLEN["/admin/hallen Partnerhallen, Slots, Preise"]:::adm
  ADM --> A_BUCH["/admin/buchungen Buchungsaufträge, Agent-Status"]:::adm
  ADM --> A_FIN["/admin/finanzen"]:::adm
  A_FIN --> A_FIN1["Je Spiel: Einnahmen, Ausgaben, Marge"]:::adm
  A_FIN --> A_FIN2["Je Spieler: bezahlt, offen, erstattet, Grund"]:::adm
  A_FIN --> A_FIN3["Guthaben-Gesamtschuld"]:::adm
  A_FIN --> A_FIN4["Ausgaben erfassen mit Beleg"]:::adm
  A_FIN --> A_FIN5["Monatsabschluss und CSV-Export"]:::adm
  A_FIN --> A_FIN6["Alarme"]:::adm
  ADM --> A_CODES["/admin/codes Rabattcodes, Budget, Gültigkeit"]:::adm
  ADM --> A_MOD["/admin/moderation Meldungen, Kommentare, Verwarnungen"]:::adm
  ADM --> A_LIGEN["/admin/ligen Ligen, Saisons, Challenge, Profi-Tag"]:::adm
  ADM --> A_TURN["/admin/turniere Veranstalter-Turniere"]:::adm
  ADM --> A_SPON["/admin/sponsoren Platzierungen, Trikot-Partner"]:::adm
  ADM --> A_AUDIT["/admin/protokoll Änderungsprotokoll durchsuchen"]:::adm
  ADM --> A_ROLLEN["/admin/rollen Finanzen, Moderation, Hallen-Buchung"]:::adm
```

---

## 3. Lebenszyklus: Spielsuche und Spiel (Zustände)

```mermaid
stateDiagram-v2
  [*] --> SUCHE_OFFEN: Team-Admin erstellt Spielsuche
  SUCHE_OFFEN --> SUCHE_ABGELAUFEN: Startzeit verstrichen ohne Gegner
  SUCHE_OFFEN --> SUCHE_ABGEBROCHEN: Team-Admin zieht zurück
  SUCHE_OFFEN --> SUCHE_GEMATCHT: Gegner nimmt an oder Herausforderung angenommen

  SUCHE_GEMATCHT --> LOBBY: Spiel und Lobby werden angelegt
  state LOBBY {
    [*] --> ORT_UND_ZEIT_ABSTIMMEN
    ORT_UND_ZEIT_ABSTIMMEN --> TEILNEHMER_SAMMELN: beide Team-Admins einig
    TEILNEHMER_SAMMELN --> TEILNEHMER_SAMMELN: Spieler treten bei, Ersatz aus öffentlicher Lobby
    TEILNEHMER_SAMMELN --> BEZAHLEN: Phase 2 Anteil pro Spieler fällig
    BEZAHLEN --> BEREIT_PRUEFUNG: Spieler bezahlt und Bereit
    TEILNEHMER_SAMMELN --> BEREIT_PRUEFUNG: Phase 1 ohne Geld
  }

  LOBBY --> BESTAETIGT: Mindestanzahl erreicht und beide Teams Bereit
  LOBBY --> ABGESAGT_AUTO: Mindestanzahl 24 Stunden vorher nicht erreicht
  LOBBY --> ABGESAGT_MANUELL: Team-Admin oder Platform-Admin sagt ab

  ABGESAGT_AUTO --> ERSTATTUNG: Phase 2 alle Zahlungen zurück aufs Guthaben
  ABGESAGT_MANUELL --> ERSTATTUNG_REGEL: Stornoregel nach Frist
  ERSTATTUNG --> [*]
  ERSTATTUNG_REGEL --> [*]

  BESTAETIGT --> BUCHUNG_OFFEN: Phase 2 Buchungsauftrag entsteht
  BUCHUNG_OFFEN --> BUCHUNG_IN_ARBEIT: Admin oder Agent bearbeitet
  BUCHUNG_IN_ARBEIT --> BUCHUNG_GEBUCHT: Halle reserviert
  BUCHUNG_IN_ARBEIT --> BUCHUNG_FEHLGESCHLAGEN: Halle nicht verfügbar
  BUCHUNG_FEHLGESCHLAGEN --> ERSATZ_HALLE_ODER_ABSAGE
  BUCHUNG_GEBUCHT --> BUCHUNG_BESTAETIGT: Halle bestätigt per Beleg
  BESTAETIGT --> ANSTOSS: Zeit erreicht

  ANSTOSS --> GESPIELT: Spiel läuft, Ereignisse werden erfasst
  GESPIELT --> ERGEBNIS_GEMELDET: ein Team trägt Ergebnis ein
  ERGEBNIS_GEMELDET --> ERGEBNIS_BESTAETIGT: anderes Team bestätigt
  ERGEBNIS_GEMELDET --> STREITFALL: anderes Team widerspricht
  STREITFALL --> ERGEBNIS_BESTAETIGT: Platform-Admin entscheidet und protokolliert
  ERGEBNIS_BESTAETIGT --> AUSWERTUNG: Elo, Statistik, Abzeichen, Spielbericht-Karte
  AUSWERTUNG --> REVANCHE_ANGEBOT
  REVANCHE_ANGEBOT --> [*]
```

---

## 4. Ablauf aus Nutzersicht (Sequenz: von der Anmeldung bis zum Ergebnis)

```mermaid
sequenceDiagram
  autonumber
  actor A as Team-Admin A
  actor B as Team-Admin B
  actor P as Spieler
  actor F as Fremder Ersatzspieler
  participant UI as Frontend PWA
  participant SV as Backend
  participant DB as PostgreSQL
  participant RT as Echtzeit SSE
  participant PUSH as Push und Mail
  participant PA as Platform-Admin

  A->>UI: Google Login
  UI->>SV: Auth Callback
  SV->>DB: Nutzer anlegen oder laden
  A->>UI: Team gründen
  UI->>SV: createTeam
  SV->>DB: teams, team_members mit Rolle admin
  A->>UI: Einladungslink erzeugen
  SV->>DB: invites mit Token und Ablauf
  A-->>P: Link per WhatsApp mit Vorschau
  P->>UI: Link öffnen, Google Login
  UI->>SV: joinTeam Token
  SV->>DB: team_members, Token prüfen
  A->>UI: Spielsuche erstellen Stadt Zeit Dauer Stärke öffentlich
  SV->>DB: match_requests status offen
  B->>UI: Suchen filtern, Spielsuche annehmen
  UI->>SV: acceptRequest
  SV->>DB: Transaktion: request matched, match lobby, audit_log
  SV->>PUSH: Benachrichtigung an Team A und B
  SV->>RT: Lobby-Kanal geöffnet
  A->>UI: Lobby öffnen, Ort als Text
  B->>UI: Ort bestätigen
  P->>UI: Beitreten und Bereit
  UI->>SV: setReady
  SV->>DB: match_participants.ready_at
  SV->>RT: Teilnehmerliste an alle
  F->>UI: Öffentliche Lobby, als Ersatz beitreten
  SV->>DB: participants mit is_substitute und team_id null
  SV->>RT: Teilnehmerliste aktualisiert
  Note over SV,DB: Prüfung läuft laufend: Mindestanzahl, Frist 24 Stunden
  SV->>DB: Status confirmed wenn Mindestanzahl und beide Teams Bereit
  SV->>PUSH: Countdown-Erinnerungen
  Note over A,B: Anstoß
  A->>UI: Tore erfassen mit Torschütze und Minute
  UI->>SV: addEvent
  SV->>DB: match_events
  SV->>RT: Livescore für Zuschauer
  A->>UI: Endergebnis melden
  SV->>DB: match_results confirmed_home
  B->>UI: Bestätigen oder widersprechen
  alt bestätigt
    SV->>DB: confirmed_away, Status played
    SV->>SV: Elo, Statistik, Abzeichen, Bericht-Karte
    SV->>PUSH: Ergebnis und Revanche-Angebot
  else widersprochen
    SV->>DB: disputed true
    SV->>PA: Aufgabe Streitfall
    PA->>SV: Entscheidung
    SV->>DB: Ergebnis gesetzt, audit_log
  end
```

---

## 5. Datenmodell (ER, Phase 1 bis 4)

```mermaid
erDiagram
  USERS ||--o{ TEAM_MEMBERS : "ist Mitglied"
  TEAMS ||--o{ TEAM_MEMBERS : "hat"
  TEAMS ||--o{ INVITES : "erzeugt"
  USERS ||--o{ INVITES : "erstellt"
  TEAMS ||--o{ MATCH_REQUESTS : "sucht"
  MATCH_REQUESTS ||--o| MATCHES : "wird zu"
  TEAMS ||--o{ MATCHES : "Heim"
  TEAMS ||--o{ MATCHES : "Gast"
  MATCHES ||--o{ MATCH_PARTICIPANTS : "Teilnehmer"
  USERS ||--o{ MATCH_PARTICIPANTS : "spielt"
  MATCHES ||--o{ MATCH_EVENTS : "Ereignisse"
  MATCHES ||--o| MATCH_RESULTS : "Ergebnis"
  USERS ||--o{ AUDIT_LOG : "Akteur"
  USERS ||--o{ WALLET_ACCOUNTS : "besitzt"
  WALLET_ACCOUNTS ||--o{ LEDGER_ENTRIES : "Buchungen"
  MATCHES ||--o{ LEDGER_ENTRIES : "bezogen auf"
  USERS ||--o{ PAYMENTS : "zahlt"
  PAYMENTS ||--o{ LEDGER_ENTRIES : "erzeugt"
  PROMO_CODES ||--o{ PROMO_REDEMPTIONS : "eingelöst"
  USERS ||--o{ PROMO_REDEMPTIONS : "löst ein"
  VENUES ||--o{ VENUE_SLOTS : "Zeitfenster"
  VENUES ||--o{ PRICE_RULES : "Preise"
  MATCHES ||--o| BOOKING_JOBS : "Buchungsauftrag"
  VENUES ||--o{ BOOKING_JOBS : "Halle"
  MATCHES ||--o{ EXPENSES : "Ausgaben"
  VENUES ||--o{ VENUE_REVIEWS : "bewertet"
  USERS ||--o{ VENUE_REVIEWS : "schreibt"
  USERS ||--o{ REPORTS : "meldet"
  USERS ||--o{ COMMENTS : "schreibt"
  MATCHES ||--o{ COMMENTS : "unter Spiel"
  TEAMS ||--o{ COMMENTS : "unter Team"
  USERS ||--o{ BADGES_AWARDED : "erhält"
  BADGES ||--o{ BADGES_AWARDED : "Typ"
  USERS ||--o{ RELIABILITY_STATS : "Zuverlässigkeit"
  TEAMS ||--o{ RATINGS : "Elo-Verlauf"
  USERS ||--o{ RATINGS : "Elo-Verlauf"
  LEAGUES ||--o{ SEASONS : "Saisons"
  SEASONS ||--o{ STANDINGS : "Tabelle"
  TEAMS ||--o{ STANDINGS : "Platz"
  SEASONS ||--o{ MATCHES : "gehört zu"
  CITY_CHALLENGES ||--o{ CHALLENGE_SCORES : "Wertung"
  TOURNAMENTS ||--o{ TOURNAMENT_ENTRIES : "Anmeldungen"
  TEAMS ||--o{ TOURNAMENT_ENTRIES : "meldet an"
  TOURNAMENTS ||--o{ MATCHES : "Turnierspiele"
  PRO_EVENTS ||--o{ PRO_EVENT_ENTRIES : "Teilnahme"
  TEAMS ||--o{ PRO_EVENT_ENTRIES : "Verlosung"
  USERS ||--o{ PRO_EVENTS : "Profi"
  SPONSORS ||--o{ SPONSOR_PLACEMENTS : "Platzierung"
  VENUES ||--o{ SPONSOR_PLACEMENTS : "in Halle"
  USERS ||--o{ NOTIFICATION_PREFS : "Einstellungen"
  USERS ||--o{ MEDIA : "lädt hoch"
  MATCHES ||--o{ MEDIA : "Fotos"
  USERS ||--o{ FREE_PLAYER_WISHES : "Spielwunsch"

  USERS {
    uuid id PK
    text google_id
    text email
    text name
    text avatar_url
    text role
    text city
    text position
    bool is_verified_pro
    timestamp banned_at
    date birth_year
    text locale
    timestamp created_at
  }
  TEAMS {
    uuid id PK
    text name
    text slug
    text city
    text logo_url
    int strength
    bool is_verified
    uuid created_by FK
    float lat
    float lng
  }
  TEAM_MEMBERS {
    uuid team_id FK
    uuid user_id FK
    text role
    timestamp joined_at
  }
  INVITES {
    text token PK
    uuid team_id FK
    uuid created_by FK
    timestamp expires_at
  }
  MATCH_REQUESTS {
    uuid id PK
    uuid team_id FK
    text city
    timestamp starts_at
    int duration_min
    int strength
    text visibility
    text status
    text recurrence
    uuid target_team_id FK
    text note
  }
  MATCHES {
    uuid id PK
    uuid request_id FK
    uuid home_team_id FK
    uuid away_team_id FK
    uuid season_id FK
    uuid tournament_id FK
    uuid venue_id FK
    timestamp starts_at
    int duration_min
    text venue_text
    text visibility
    int min_players
    text status
    text stream_url
  }
  MATCH_PARTICIPANTS {
    uuid match_id FK
    uuid user_id FK
    uuid team_id FK
    bool is_substitute
    timestamp ready_at
    bool attended
  }
  MATCH_EVENTS {
    uuid id PK
    uuid match_id FK
    text type
    uuid user_id FK
    uuid team_id FK
    int minute
  }
  MATCH_RESULTS {
    uuid match_id PK
    int home_score
    int away_score
    bool confirmed_home
    bool confirmed_away
    bool disputed
  }
  AUDIT_LOG {
    uuid id PK
    uuid actor_id FK
    text action
    text entity
    text entity_id
    jsonb before
    jsonb after
    timestamp at
  }
  WALLET_ACCOUNTS {
    uuid id PK
    uuid user_id FK
    text currency
  }
  LEDGER_ENTRIES {
    uuid id PK
    uuid account_id FK
    uuid match_id FK
    uuid payment_id FK
    text kind
    int amount_cents
    text currency
    uuid reverses_entry_id FK
    text reason
    text idempotency_key
    timestamp at
  }
  PAYMENTS {
    uuid id PK
    uuid user_id FK
    text provider
    text provider_ref
    int amount_cents
    int fee_cents
    text status
    text idempotency_key
  }
  PROMO_CODES {
    uuid id PK
    text code
    text kind
    int value
    int budget_cents
    int used_cents
    timestamp valid_until
    bool new_users_only
    int max_per_user
  }
  PROMO_REDEMPTIONS {
    uuid code_id FK
    uuid user_id FK
    int amount_cents
    timestamp at
  }
  VENUES {
    uuid id PK
    text name
    text city
    text address
    float lat
    float lng
    text contact
    text surface
    bool has_showers
    bool has_parking
    bool partner
  }
  VENUE_SLOTS {
    uuid id PK
    uuid venue_id FK
    timestamp starts_at
    int duration_min
    text status
  }
  PRICE_RULES {
    uuid id PK
    uuid venue_id FK
    int duration_min
    int price_cents
    int cost_cents
    text valid_from
  }
  BOOKING_JOBS {
    uuid id PK
    uuid match_id FK
    uuid venue_id FK
    text status
    text assignee
    text proof_url
    text note
  }
  EXPENSES {
    uuid id PK
    uuid match_id FK
    text kind
    int amount_cents
    text receipt_url
    timestamp paid_at
  }
  VENUE_REVIEWS {
    uuid id PK
    uuid venue_id FK
    uuid user_id FK
    int rating
    text text
  }
  REPORTS {
    uuid id PK
    uuid reporter_id FK
    text target_type
    text target_id
    text reason
    text status
    uuid handled_by FK
  }
  COMMENTS {
    uuid id PK
    uuid user_id FK
    uuid match_id FK
    uuid team_id FK
    text body
    timestamp hidden_at
  }
  BADGES {
    uuid id PK
    text code
    text name
    text rule
  }
  BADGES_AWARDED {
    uuid badge_id FK
    uuid user_id FK
    timestamp at
  }
  RELIABILITY_STATS {
    uuid user_id FK
    int promised
    int attended
  }
  RATINGS {
    uuid id PK
    uuid team_id FK
    uuid user_id FK
    uuid match_id FK
    int elo
  }
  LEAGUES {
    uuid id PK
    text name
    text region
  }
  SEASONS {
    uuid id PK
    uuid league_id FK
    date starts_on
    date ends_on
  }
  STANDINGS {
    uuid season_id FK
    uuid team_id FK
    int played
    int wins
    int draws
    int losses
    int goals_for
    int goals_against
    int points
  }
  CITY_CHALLENGES {
    uuid id PK
    text month
    text city_a
    text city_b
  }
  CHALLENGE_SCORES {
    uuid challenge_id FK
    text city
    int wins
  }
  TOURNAMENTS {
    uuid id PK
    uuid organizer_id FK
    text name
    int fee_cents
    int max_teams
    text mode
    text status
  }
  TOURNAMENT_ENTRIES {
    uuid tournament_id FK
    uuid team_id FK
    text payment_status
    text status
  }
  PRO_EVENTS {
    uuid id PK
    uuid pro_user_id FK
    timestamp starts_at
    text status
  }
  PRO_EVENT_ENTRIES {
    uuid event_id FK
    uuid team_id FK
    bool drawn
  }
  SPONSORS {
    uuid id PK
    text name
    text logo_url
  }
  SPONSOR_PLACEMENTS {
    uuid sponsor_id FK
    uuid venue_id FK
    text city
    text position
    timestamp valid_until
  }
  NOTIFICATION_PREFS {
    uuid user_id FK
    bool push
    bool email
    text quiet_hours
  }
  MEDIA {
    uuid id PK
    uuid user_id FK
    uuid match_id FK
    text url
    text kind
  }
  FREE_PLAYER_WISHES {
    uuid id PK
    uuid user_id FK
    text city
    timestamp wish_date
    text status
  }
```

---

## 6. Geldfluss (Phase 2)

```mermaid
flowchart TD
  classDef money fill:#b8860b,color:#fff
  classDef sys fill:#1d5fa8,color:#fff
  classDef adm fill:#a83f3f,color:#fff
  classDef ext fill:#444,color:#fff

  START(["Spiel bestätigt, Anteil pro Spieler fällig"]):::sys
  START --> CALC["Preis: 60 Min 80 EUR oder 90 Min 110 EUR geteilt durch Spielerzahl"]:::sys
  CALC --> PAYCHK{"Genug Guthaben?"}

  PAYCHK -- ja --> DEBIT["Ledger: Abbuchung vom Guthaben"]:::money
  PAYCHK -- nein --> CHOICE{"Wie bezahlen?"}
  CHOICE -- Aufladen --> TOPUP["Guthaben aufladen: größere Beträge, weniger Gebühren"]:::money
  CHOICE -- PayPal direkt --> PAYPAL["PayPal Zahlung pro Spiel, Gebühr beachten"]:::ext
  TOPUP --> PROMOQ{"Rabattcode?"}
  PROMOQ -- ja --> PROMOCHK["Regeln prüfen: gültig, einmal pro Nutzer, Budget"]:::sys
  PROMOCHK --> CREDIT
  PROMOQ -- nein --> CREDIT["Stripe oder PayPal Zahlung"]:::ext
  CREDIT --> WEBHOOK["Webhook idempotent verarbeitet"]:::sys
  WEBHOOK --> LEDGER_IN["Ledger: Gutschrift Guthaben, Gebühr als Ausgabe"]:::money
  LEDGER_IN --> DEBIT
  PAYPAL --> WEBHOOK2["Webhook idempotent"]:::sys
  WEBHOOK2 --> LEDGER_DIRECT["Ledger: Einnahme Spiel direkt"]:::money

  DEBIT --> PAID["Spielerstatus bezahlt"]:::money
  LEDGER_DIRECT --> PAID
  PAID --> ENOUGH{"Mindestanzahl bezahlt bis 24 Stunden vorher?"}
  ENOUGH -- nein --> AUTOCANCEL["Auto-Absage"]:::sys
  AUTOCANCEL --> REFUNDALL["Ledger: Gegenbuchung aller Zahlungen aufs Guthaben"]:::money
  ENOUGH -- ja --> JOB["Buchungsauftrag erzeugt"]:::adm

  JOB --> BOOKING["Admin oder Agent bucht Halle"]:::adm
  BOOKING --> HALLPAY["Ausgabe erfasst: Hallenmiete mit Beleg"]:::adm
  HALLPAY --> PLAY(["Spiel findet statt"]):::sys

  PLAY --> CANCELPLAYER{"Spieler sagt ab?"}
  CANCELPLAYER -- bis 48 Stunden vorher --> FULLREF["100 Prozent zurück aufs Guthaben"]:::money
  CANCELPLAYER -- danach --> PARTREF["50 Prozent zurück, oder voll wenn Ersatz gefunden"]:::money
  CANCELPLAYER -- am Spieltag --> NOREF["Keine Erstattung, Admin kann Ausnahme buchen"]:::adm
  FULLREF --> LEDGER_REF["Ledger: Gegenbuchung mit Grund"]:::money
  PARTREF --> LEDGER_REF
  NOREF --> LEDGER_REF

  LEDGER_REF --> REPORT
  PLAY --> REPORT["Finanz-Reporting"]:::sys
  REPORT --> PERGAME["Je Spiel: Einnahmen minus Hallenkosten, Gebühren, Erstattungen gleich Marge"]:::adm
  REPORT --> PERPLAYER["Je Spieler: bezahlt, offen, erstattet, Zahlart, Zeitpunkt, Grund"]:::adm
  REPORT --> DEBT["Offene Guthaben als Schuld gegenüber Spielern"]:::adm
  REPORT --> MONTH["Monatsabschluss"]:::adm
  MONTH --> CSV["CSV-Export für Steuerberater"]:::ext
  REPORT --> ALARM{"Auffälligkeit?"}
  ALARM -- ja --> NOTIFYADM["Alarm im Dashboard: Verlustspiel, viele Erstattungen, Zahlung ohne Buchung"]:::adm
  PAID --> RECEIPT["Beleg mit fortlaufender Nummer als PDF"]:::sys
```

---

## 7. Rollen und Rechte

```mermaid
flowchart LR
  classDef r fill:#1d5fa8,color:#fff
  classDef p fill:#222,color:#9fe

  ZU["Zuschauer"]:::r --> ZUP["Lesen: Spiele, Teams, Profile, Ranglisten, Ligen, Hallen"]:::p
  SP["Spieler"]:::r --> SPP["Profil bearbeiten, Team beitreten, öffentliche Lobby beitreten, bezahlen, Ersatz sein, Spiel-Bewertung, melden, kommentieren"]:::p
  SP --> ZU
  TAD["Team-Admin"]:::r --> TADP["Team verwalten, einladen, Spielsuche, annehmen, Lobby leiten, Ergebnis melden und bestätigen, Aufstellung, Spiele absagen"]:::p
  TAD --> SP
  PROR["Profi"]:::r --> PROP["Verifiziert-Badge, Teilnahme am Profi-Tag"]:::p
  PROR --> SP
  MODR["Moderator"]:::r --> MODP["Meldungen bearbeiten, Kommentare ausblenden, verwarnen"]:::p
  FINR["Finanzen"]:::r --> FINP["Finanzen lesen, Ausgaben erfassen, Erstattungen buchen, Export"]:::p
  BUCHR["Hallen-Buchung"]:::r --> BUCHP["Buchungsaufträge bearbeiten, Hallen und Slots pflegen"]:::p
  ADMR["Platform-Admin"]:::r --> ADMP["Alles sehen und ändern, Sperren, Rollen vergeben, Ligen, Codes, Sponsoren, Profi-Badge, Protokoll"]:::p
  ADMR --> MODR
  ADMR --> FINR
  ADMR --> BUCHR
  ADMR --> TAD
  VERR["Veranstalter Verein oder Firma"]:::r --> VERP["Eigene Turniere anlegen und verwalten"]:::p
  AUD["Jede Admin-Änderung"] --> AUDP["audit_log mit vorher und nachher"]:::p
  ADMR --> AUD
  FINR --> AUD
  MODR --> AUD
```

---

## 8. Admin-Dashboard im Überblick

```mermaid
mindmap
  root((Admin-Dashboard))
    Aufgaben
      Offene Buchungsaufträge
      Strittige Ergebnisse
      Neue Meldungen
      Auto-Absagen heute
      Profi-Badge Anfragen
    Spiele
      Alle Spiele ändern
      Ersatzspieler eintragen
      Ergebnis überschreiben mit Protokoll
      Absagen mit Erstattung
    Nutzer und Teams
      Sperren und Entsperren
      Rollen vergeben
      Zuverlässigkeits-Wert sehen
      Teams verifizieren
      Teams zusammenführen
    Hallen und Buchungen
      Partnerhallen
      Preise und Kosten je Dauer
      Slots reservieren
      Buchungsstatus Agent oder manuell
    Finanzen
      Je Spiel Einnahmen Ausgaben Marge
      Je Spieler bezahlt offen erstattet
      Erstattungen mit Grund
      Guthaben-Gesamtschuld
      Ausgaben mit Beleg
      Monatsabschluss
      CSV Export
      Alarme
    Codes und Marketing
      Rabattcodes mit Budget
      Profi-Tag planen und verlosen
      Stadt-Challenge
      Sponsoren und Trikot-Partner
    Moderation
      Meldungen
      Kommentare ausblenden
      Verwarnung und Sperre
    Ligen und Turniere
      Ligen NRW Gelsenkirchen Essen
      Saisons
      Veranstalter-Turniere
    System
      Änderungsprotokoll
      Rollen und Rechte
      Fehler und Nutzung
      Testdaten
```

---

## 9. Phasen und Abhängigkeiten

```mermaid
flowchart LR
  classDef p1 fill:#1f7a3a,color:#fff
  classDef p2 fill:#b8860b,color:#fff
  classDef p3 fill:#1d5fa8,color:#fff
  classDef p4 fill:#7a3fa8,color:#fff
  classDef p5 fill:#a83f3f,color:#fff

  subgraph PH1["Phase 1: Fundament, ohne Geld"]
    direction TB
    a1["Google Login und Onboarding 16+"]:::p1
    a2["Profile"]:::p1
    a3["Teams und Einladungslinks mit Vorschau"]:::p1
    a4["Spielsuche und freie Spieler"]:::p1
    a5["Lobby mit Echtzeit, Bereit, Ersatz, Countdown"]:::p1
    a6["Ergebnis, Torschützen, Bestätigung, Streitfall"]:::p1
    a7["Wiederkehrende Spiele und Revanche"]:::p1
    a8["Benachrichtigungen"]:::p1
    a9["Admin: Aufgaben, Spiele, Nutzer, Protokoll"]:::p1
    a10["Testdaten, Sentry, i18n, UTC"]:::p1
    a1 --> a2 --> a3 --> a4 --> a5 --> a6 --> a7
    a1 --> a8
    a6 --> a9
  end

  subgraph PH2["Phase 2: Geld und Halle"]
    direction TB
    b1["Ledger"]:::p2
    b2["Preise und Anteil pro Spieler"]:::p2
    b3["Guthaben aufladen und PayPal"]:::p2
    b4["Rabattcodes"]:::p2
    b5["Stornoregeln und Auto-Absage"]:::p2
    b6["Hallen, Slots, Buchungsaufträge"]:::p2
    b7["Belege PDF"]:::p2
    b8["Finanz-Dashboard, Monatsabschluss, Alarme"]:::p2
    b9["Buchungs-Agent später"]:::p2
    b1 --> b2 --> b3 --> b4
    b3 --> b5 --> b6 --> b9
    b1 --> b7 --> b8
  end

  subgraph PH3["Phase 3: Profile und Community"]
    direction TB
    c1["Statistik und Elo"]:::p3
    c2["Teamseite als Visitenkarte"]:::p3
    c3["Spielbericht-Karte"]:::p3
    c4["Abzeichen und Zuverlässigkeit"]:::p3
    c5["Fotos und Hallenbewertung"]:::p3
    c6["Kommentare moderiert und Meldesystem"]:::p3
    c7["Rangliste je Stadt und Saison"]:::p3
    c1 --> c2 --> c3
    c1 --> c4
    c1 --> c7
    c5 --> c6
  end

  subgraph PH4["Phase 4: Ligen, Turniere, Events"]
    direction TB
    d1["Ligen und Saisons"]:::p4
    d2["Stadt-Challenge"]:::p4
    d3["Profi-Tag"]:::p4
    d4["Turniere gegen Gebühr"]:::p4
    d5["Sponsoren und Trikot-Partner"]:::p4
    d1 --> d2
    d1 --> d4
    d3
    d5
  end

  subgraph PH5["Phase 5: Reichweite"]
    direction TB
    e1["Stream-Einbettung pro Spiel"]:::p5
    e2["OBS-Overlay-Daten"]:::p5
    e3["International"]:::p5
    e1 --> e2
  end

  PH1 --> PH2
  PH1 --> PH3
  PH2 --> PH4
  PH3 --> PH4
  PH4 --> PH5
```

---

## 10. Technischer Aufbau und Betrieb

```mermaid
flowchart TB
  classDef n fill:#1d5fa8,color:#fff
  classDef d fill:#222,color:#9fe
  classDef o fill:#444,color:#fff

  U["Browser und PWA auf Handy"]:::n
  U -->|HTTPS| CDN["Edge / Reverse Proxy"]:::o
  CDN --> NEXT["Next.js App: Server Components, Server Actions, Route Handlers"]:::n
  NEXT --> AUTHJS["Auth.js: Google, JWT-Session"]:::n
  NEXT --> DRIZZLE["Drizzle ORM und Migrationen"]:::n
  DRIZZLE --> PGDB[("PostgreSQL")]:::d
  NEXT --> SSE["SSE-Endpunkte für Lobby und Livescore"]:::n
  SSE --> PUBSUB[("Postgres LISTEN/NOTIFY oder Redis")]:::d
  NEXT --> JOBS["Hintergrundjobs: Auto-Absage, Erinnerungen, Elo, Monatsabschluss"]:::n
  JOBS --> PGDB
  NEXT --> STORAGE[("Objekt-Speicher: Bilder, Belege, Karten")]:::d
  NEXT --> STRIPE2["Stripe API und Webhooks"]:::o
  NEXT --> MAIL2["E-Mail Anbieter"]:::o
  NEXT --> WEBPUSH["Web-Push"]:::o
  NEXT --> SENTRY2["Sentry"]:::o

  subgraph QS["Qualität"]
    T1["Vitest: Logik, Ledger, Preisregeln"]:::o
    T2["Playwright: Lobby, Zahlung, Ergebnis"]:::o
    T3["GitHub Actions: Lint, Typen, Tests, Build"]:::o
    T4["Seed-Skript: 50 Teams, 200 Spiele"]:::o
  end
  QS -.-> NEXT

  subgraph LOCAL["Lokale Entwicklung heute"]
    L1["start-v2.ps1: Postgres 5433 und Dev-Server 3100"]:::o
  end
```
