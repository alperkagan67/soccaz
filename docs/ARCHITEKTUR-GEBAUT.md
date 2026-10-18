# Architektur: so ist es gebaut

Die ersten beiden Dokumente (`ARCHITEKTUR.md`, `ARCHITEKTUR-DETAIL.md`) beschreiben den Plan. Dieses hier zeigt den umgesetzten Stand. Alle Diagramme sind auch in `architektur.html` (Ebene 3) zu sehen.

## Datenmodell (gebaut)

Alle Tabellen, die es tatsächlich gibt: Spielbetrieb, Geld, Statistik, Inhalte, Wettbewerbe.

```mermaid
erDiagram
  users ||--o{ team_members : "ist Mitglied"
  teams ||--o{ team_members : hat
  teams ||--o{ invites : erzeugt
  teams ||--o{ match_requests : sucht
  match_requests }o--o| teams : "fordert heraus (target_team_id)"
  match_requests ||--o| matches : "wird zu"
  teams ||--o{ matches : "Heim/Gast"
  matches ||--o{ match_participants : Lobby
  users ||--o{ match_participants : nimmt_teil
  matches ||--o{ match_events : "Tore/Karten"
  matches ||--o| match_results : Ergebnis
  matches ||--o| match_finalizations : "genau einmal ausgewertet"
  users ||--o{ notifications : erhaelt
  users ||--o| notification_prefs : stellt_ein
  users ||--o{ push_subscriptions : Geraete

  users ||--o{ ledger_entries : "Guthaben (Soll/Haben)"
  payments ||--o{ ledger_entries : bucht
  matches ||--o{ ledger_entries : Anteil
  tournaments ||--o{ ledger_entries : Startgeld
  users ||--o{ payments : zahlt
  users ||--o{ receipts : bekommt
  promo_codes ||--o{ promo_redemptions : eingeloest
  venues ||--o{ price_rules : Preise
  matches ||--o{ booking_jobs : Buchung
  matches ||--o{ expenses : Ausgaben

  teams ||--o| team_stats : "Elo, Bilanz"
  users ||--o| player_stats : "Tore, Elo, Serien"
  users ||--o{ user_badges : Abzeichen
  users ||--o| user_reliability : "privat"
  matches ||--o{ mvp_votes : "Spieler des Spiels"
  teams ||--o{ rating_history : Elo_Verlauf

  users ||--o{ comments : schreibt
  comments ||--o{ comment_reports : gemeldet
  users ||--o{ user_warnings : verwarnt
  users ||--o{ media : "Bilder"
  users ||--o{ free_player_posts : "Ich suche ein Spiel"

  leagues ||--o{ league_teams : Teilnehmer
  teams ||--o{ league_teams : spielt_in
  pro_events ||--o{ pro_applications : Bewerbungen
  teams ||--o{ pro_applications : bewirbt_sich
  tournaments ||--o{ tournament_teams : Anmeldungen
  tournaments ||--o{ tournament_matches : Spielplan
  sponsors ||--o{ team_sponsors : Trikotpartner
  teams ||--o{ team_sponsors : traegt
  city_challenge_results {
    text month
    text city
    int wins
    int rank
  }
  ledger_entries {
    uuid id
    enum debit_account
    enum credit_account
    int amount_cents
    enum kind
    text idempotency_key "eindeutig"
  }
  tournaments {
    uuid id
    text format "round_robin | knockout | groups_ko"
    int entry_fee_cents
    text status
  }
  matches {
    uuid id
    enum status
    int price_cents
    text stream_url
    uuid mvp_user_id
  }
```

## Auswertung nach dem Spiel (gebaut)

Eine Transaktion, genau einmal pro Spiel: Bilanz, Elo, Statistik, Zuverlässigkeit, Abzeichen; danach die Abstimmung zum Spieler des Spiels.

```mermaid
sequenceDiagram
  autonumber
  actor A as Team-Admin
  participant R as results.ts
  participant T as Transaktion (eine!)
  participant F as Finalizer-Register
  participant S as Statistik (stats.ts)
  participant N as Benachrichtigungen
  participant J as Job close-mvp (stuendlich)
  A->>R: Ergebnis melden / Gegner bestaetigt / 48 h ohne Widerspruch / Admin entscheidet
  R->>T: Spiel auf "gespielt" setzen
  T->>F: onMatchPlayed(Spiel)
  F->>T: Marker match_finalizations einfuegen
  alt Marker existiert schon
    T-->>F: nichts tun (genau einmal pro Spiel)
  else neu
    F->>S: applyMatchStats
    S->>S: Team-Bilanz und Elo (Torunterschied gedeckelt)
    S->>S: Spielerstatistik, Serien, Karten, Elo
    S->>S: Zuverlaessigkeit: Teilnahme zaehlen
    S->>S: Abzeichen pruefen (Debuet, Hattrick, 10 Spiele ...)
    S->>N: "Neues Abzeichen" an den Spieler
  end
  T-->>R: Commit (alles oder nichts)
  Note over R,N: Spaeter: Nicht-erschienen markieren (7 Tage), Abstimmung Spieler des Spiels (24 h)
  J->>S: closeMvpVoting
  S->>S: eindeutiger Sieger? Titel + mvp_1 / mvp_5, bei Gleichstand keiner
  S->>N: "Spieler des Spiels"
```

## Turnier mit Startgeld (gebaut)

Anmeldung mit Treuhandkonto, Spielplan je Format, Ergebnisse, Abrechnung, Absage.

```mermaid
flowchart TD
  classDef money fill:#fff3cd,stroke:#b8860b,color:#000
  classDef state fill:#e3f2fd,stroke:#1d5fa8,color:#000
  classDef rule fill:#f3e5f5,stroke:#7a3fa8,color:#000

  A([Admin schaltet Veranstalter frei]):::rule --> B[Veranstalter legt Turnier an<br/>Format, max. Teams 2-32, Startgeld 0-500 EUR]
  B --> C{{Status: Anmeldung}}:::state
  C --> D[Team-Admin meldet Team an]
  D --> E{Platz frei und<br/>Guthaben reicht?}
  E -- nein --> D1[Fehlermeldung / Aufladen]
  E -- ja --> F[Startgeld: Guthaben -> Konto Turnier<br/>Zeilensperre, Schluessel pro Team]:::money
  F --> C
  C --> G[Team meldet sich ab]
  G --> H[Rueckerstattung: Konto Turnier -> Guthaben<br/>genau einmal]:::money
  H --> C
  C --> I[Veranstalter startet]
  I --> J{Format}
  J -- jeder gegen jeden --> K1[Kreisverfahren: n x n-1 / 2 Spiele]
  J -- K.o. --> K2[Baum mit Freilosen: immer n-1 Spiele]
  J -- Gruppen + K.o. --> K3[Gruppen in Schlangenlinie,<br/>je Gruppe jeder gegen jeden]
  K1 --> L{{Status: laeuft}}:::state
  K2 --> L
  K3 --> L
  L --> M[Veranstalter traegt Ergebnis ein]
  M --> N{K.o.-Spiel?}
  N -- ja, unentschieden --> O[Sieger im Siebenmeterschiessen waehlen]
  N -- ja --> P[Sieger rueckt in das Folgespiel]
  O --> P
  N -- nein --> Q{Gruppenphase komplett?}
  Q -- ja --> R[K.o.-Runde aus Tabellen:<br/>A1-B2, B1-A2 ...]
  P --> S{Alle Spiele gespielt?}
  R --> L
  Q -- nein --> L
  S -- nein --> L
  S -- ja --> T{{Status: beendet, Sieger steht fest}}:::state
  T --> U[Abrechnung genau einmal]:::money
  U --> V[Auszahlung an Veranstalter:<br/>Startgelder minus Provision]:::money
  U --> W[Provision -> Umsatz, abgerundet]:::money
  C --> X[Veranstalter sagt ab]
  L --> X
  X --> Y{Schon Ergebnisse?}
  Y -- ja --> Z[Nicht moeglich, Plattform muss helfen]
  Y -- nein --> AA[Alle Startgelder zurueck, Spielplan geloescht]:::money
  AA --> AB{{Status: abgesagt}}:::state
```

## Alle Seiten und Schnittstellen (gebaut)

Öffentlich, angemeldet, Admin und API, wie sie im Code stehen.

```mermaid
flowchart LR
  classDef pub fill:#e8f5e9,stroke:#1f7a3a,color:#000
  classDef usr fill:#e3f2fd,stroke:#1d5fa8,color:#000
  classDef adm fill:#fce4ec,stroke:#a83f3f,color:#000
  classDef api fill:#fff8e1,stroke:#b8860b,color:#000

  subgraph Oeffentlich
    H["/ Start"]:::pub
    S["/suche, /suche/[id]"]:::pub
    L["/spiele, /spiele/[id]<br/>Livescore, Verlauf, Stream, Fotos, Abstimmung"]:::pub
    T["/teams/[slug]<br/>Bilanz, Elo, Ligen, Kader, Kommentare"]:::pub
    P["/spieler, /spieler/[id]"]:::pub
    RK["/rangliste<br/>Monat, Elo, Torjaeger, Stadt-Challenge"]:::pub
    LI["/ligen, /ligen/[id]"]:::pub
    TU["/turniere, /turniere/[id]"]:::pub
    PT["/profitag, /profitag/[id]"]:::pub
    HA["/hallen, /hallen/[id]<br/>Bewertungen"]:::pub
    MS["/mitspieler"]:::pub
    RE["/impressum, /datenschutz, /agb, /hausordnung"]:::pub
    OV["/overlay/[id] fuer OBS"]:::pub
  end
  subgraph Angemeldet
    AP["/app Meine Spiele"]:::usr
    TN["/app/teams/neu"]:::usr
    SN["/app/suche/neu<br/>Wiederholen, Herausfordern"]:::usr
    LB["/lobby/[id] live"]:::usr
    GU["/app/guthaben"]:::usr
    BN["/app/benachrichtigungen"]:::usr
    ES["/app/einstellungen<br/>Profil, Bild, Export, Konto loeschen"]:::usr
    TT["/app/turniere/neu"]:::usr
    EI["/einladung/[token]"]:::usr
  end
  subgraph Admin
    A0["/admin Aufgaben"]:::adm
    A1["/admin/spiele, nutzer, teams"]:::adm
    A2["/admin/finanzen, buchungen, hallen, codes"]:::adm
    A3["/admin/moderation"]:::adm
    A4["/admin/ligen, profitag, sponsoren"]:::adm
    A5["/admin/protokoll, einstellungen"]:::adm
  end
  subgraph Schnittstellen
    X1["/api/auth"]:::api
    X2["/api/lobby/[id]/events, /api/spiele/.../events (SSE)"]:::api
    X3["/api/spiele/[id]/live (JSON)"]:::api
    X4["/api/webhooks/stripe"]:::api
    X5["/api/jobs/[name]"]:::api
    X6["/api/media, /api/karte, /api/belege, /api/mein-konto/export"]:::api
    X7["/api/sponsor/[id], /api/health"]:::api
  end
  H --> S --> L
  H --> RK
  T --> SN
  AP --> LB
  LB --> GU
```

## Matchmaking und gemeinsame Terminwahl (gebaut)

Teams stellen sich mit Zeitfenstern in die Warteschlange. Alle 60 Sekunden und bei jedem Beitritt werden passende Teams gepaart. Danach wählen beide Teams Termin und Ort aus Vorschlägen; stimmen beide für dieselbe Option, steht das Spiel.

```mermaid
flowchart TD
  A[Team-Admin: Stadt, Dauer, bis zu 3 Zeitfenster] --> B{{Warteschlange: wartet}}
  B --> C[Matcher: bei Beitritt und jede Minute]
  C --> D{gleiche Stadt und Dauer?<br/>Elo-Abstand im Bereich?<br/>gemeinsame Zeit?}
  D -- nein --> B
  D -- ja --> E[Spiel anlegen, Terminwahl offen<br/>Vorschlaege aus der Ueberschneidung x Hallen]
  E --> F[Beide Teams sehen Kader und Elo]
  F --> G{Beide Teams stimmen fuer dieselbe Option?}
  G -- nein --> H[Eigene Vorschlaege, Stimme aendern]
  H --> G
  G -- ja --> I[Termin, Ort und Preis stehen fest, Lobby: Bereit]
  F --> J{Frist 24 h abgelaufen?}
  J -- ja --> K[Spiel abgesagt, beide informiert]
  B --> L{48 h ohne Gegner?}
  L -- ja --> M[Eintrag abgelaufen]
```

Elo-Bereich: 100 am Anfang, alle 5 Minuten Wartezeit +50, höchstens 600. Es zählt der größere der beiden Bereiche.
