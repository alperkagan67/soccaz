# SoccaV2 – Plan

## Vision
Matchmaking-Plattform für Hobby-Hallenfußball (Start: NRW). Teams und Einzelspieler finden Gegner, treffen sich in einer Lobby, zahlen ihren Anteil an der Halle, spielen, tragen das Ergebnis ein und bauen Profil und Statistik auf.
Später: Ligen, Turniere, Livestreams, International, Profis als Zugpferde.

Vorbild für das Gefühl: FACEIT / Steam-Profil, aber für echte Hallenspiele.
Das Sample von Michael (`socca-main`) bleibt unverändert als Referenz. SoccaV2 wird komplett neu geschrieben.

## Rollen
| Rolle | Rechte |
|---|---|
| Zuschauer | Livescore, Tabellen, Profile lesen (kein Login nötig) |
| Spieler | Profil, Team beitreten, öffentliche Lobbys beitreten (auch als Ersatz), bezahlen |
| Team-Admin | Team verwalten, Mitglieder per Link einladen, Gegner suchen/annehmen, Lobby leiten |
| Platform-Admin | Alles sehen und ändern (mit Änderungsprotokoll), Hallen/Preise/Ligen/Codes verwalten, Sperren, Buchungsaufträge |

## Kernablauf (Phase 1)
1. Login mit Google.
2. Spielerprofil (Name, Position, Foto, Stadt).
3. Team gründen, Spieler per Einladungslink holen.
4. Team-Admin erstellt eine **Spielsuche**: Stadt, Datum, Uhrzeit, Dauer (60/90), Spielstärke, öffentlich oder privat.
5. Anderes Team nimmt an → **Lobby**: Termin, Ort/Halle, Spielerliste, "Bereit". Fehlen Spieler, kann ein Fremder aus der öffentlichen Lobby auffüllen.
6. Anstoß, danach Ergebnis (Tore, Torschützen). Beide Teams bestätigen, Admin kann jederzeit eingreifen.
7. Team- und Spielerstatistik wird aus den Spielen berechnet.

Phase 1 ohne Geld, Hallenabsprache im Freitext.

## Phasen
1. **Fundament:** Auth, Profile, Teams, Einladungen, Spielsuche, Lobby, Ergebnis, Admin-Dashboard.
2. **Geld und Halle:** Hallen und Preise (60 Min 80 €, 90 Min 110 €), Anteil pro Spieler, Guthaben (Ledger), Aufladung, PayPal, Rabattcodes, Stornoregeln, Buchungsaufträge (erst manuell, später Agent).
3. **Profile und Community:** Statistiken, Historie, moderierte Kommentare unter Spielen/Teams, Meldefunktion.
4. **Ligen und Turniere:** NRW-Ligen (Gelsenkirchen, Essen, NRW), Turniermodus, Tabellen.
5. **Reichweite:** Stream-Einbettung (Twitch/Kick/YouTube), OBS-Overlay-Daten, International.

## Technik
- Next.js (App Router) + TypeScript, Tailwind, shadcn/ui
- PostgreSQL + Drizzle ORM (Migrationen)
- Auth.js mit Google; Rollen in der DB
- Echtzeit-Lobby: SSE (später ggf. WebSocket)
- Zahlungen später: Stripe (Karte/PayPal) + eigenes Ledger
- Docker Compose (App + Postgres), Vitest + Playwright, GitHub Actions
- PWA für Handy

## Datenmodell (Phase 1, Auszug)
- `users` (id, google_id, name, email, role, city, position, avatar, banned_at)
- `teams` (id, name, city, strength, created_by)
- `team_members` (team_id, user_id, role: admin|player)
- `invites` (token, team_id, created_by, expires_at)
- `match_requests` (id, team_id, city, starts_at, duration_min, strength, visibility, status)
- `matches` (id, home_team_id, away_team_id, starts_at, duration_min, venue_text, status)
- `match_participants` (match_id, user_id, team_id|null, is_substitute, ready_at)
- `match_events` (id, match_id, type: goal|card, user_id, minute) – für spätere Statistiken
- `match_results` (match_id, home_score, away_score, confirmed_home, confirmed_away, disputed)
- `audit_log` (actor_id, action, entity, entity_id, before, after, at)

Phase 2 ergänzt: `venues`, `venue_slots`, `price_rules`, `ledger_entries`, `payments`, `promo_codes`, `booking_jobs`.

## Leitlinien
- Jede Änderung durch Admins landet im `audit_log`.
- Geld nur als Ledger-Einträge, nie als einzelnes Saldo-Feld.
- Spielerprofile zeigen Fakten (Tore, Spiele, Titel), keine Bewertungen von Personen.
- 16+ Plattform, bis das Jugendschutz-Thema geklärt ist.
- Rechtliches (Guthaben, Steuer, AGB, Versicherung) vor der ersten echten Zahlung klären.

## Ergänzungen (nach Review)

### Übernommene Ideen
Lobby-Moment (Countdown, Push, WhatsApp-Vorschau), freie Spieler mit Spielwunsch, Mindestanzahl + Auto-Absage mit Erstattung, Zuverlässigkeits-Wert (nur Admins sichtbar), Elo aus Ergebnissen, Foto/Clip-Upload, Abzeichen, Hallenseiten mit Bewertung, Profi-Badge, Saisonranglisten pro Stadt, Geodaten, UTC + i18n von Anfang an, Sentry/Analytics, aufgabenorientiertes Admin-Dashboard.

### Admin-Finanzbereich (je Spiel)
- Pro Spiel: Einnahmen (Spieleranteile, Codes/Rabatte abgezogen), Ausgaben (Hallenmiete, Zahlungsgebühren, Erstattungen), Marge.
- Pro Spieler im Spiel: bezahlt / offen / erstattet, Zahlart (Guthaben, PayPal), Zeitpunkt, Grund der Erstattung.
- Filter nach Zeitraum, Stadt, Halle; Export als CSV (für Steuerberater).
- Ausgaben manuell erfassbar (Halle bezahlt am ..., Beleg-Upload).
- Alle Zahlen kommen aus dem Ledger, nie aus Zusatzfeldern; jede Korrektur ist ein Gegenbuchungs-Eintrag.

### Weitere Entscheidungen
- Geld in Cent als Integer, Währung pro Eintrag gespeichert.
- Rechnungs-/Belegnummern fortlaufend ab Phase 2.
- Idempotente Zahlungs-Webhooks (doppelte Events dürfen nichts doppelt buchen).

### Entschieden: zusätzlich im Umfang (Phase 3–5)
- Öffentliche Teamseite (Logo, Bilanz, nächste Spiele, Fotos, "Herausfordern")
- Stadt-Challenge (Monatswertung, z. B. Gelsenkirchen vs. Essen)
- Profi-Tag (monatliches Event mit verlostem Hobbyteam)
- Spielbericht-Karte (automatisch generiertes teilbares Bild)
- Trikot-Partner (Vermittlung gegen Provision), Sponsoren pro Halle/Stadt
- Eigene Turniere gegen Gebühr (Vereine, Firmen)

### Bewusst NICHT im Umfang
Spielerkarte mit Werten, Saison-Pass, Tippspiel, Gästebuch, Highlight-Clips, Sprachbefehl, Premium-Abo, Empfehlungsprogramm bleibt offen für später.

## Entscheidungen (Stand Review 2)
- Spielform 5 gegen 5, pro Team 1 Ersatzspieler: 6 Plätze pro Team, 12 pro Lobby.
- Ergebnis gilt automatisch, wenn der Gegner nicht innerhalb von 48 Stunden widerspricht.
- Kostenlos kündigen bis 24 Stunden vor dem Spiel. Danach keine Erstattung, außer ein Ersatz rückt nach (Admin kann Ausnahme buchen).
- Mindestalter 16, kein Konto darunter. Geburtsjahr nur zur Prüfung, bei unter 16 nicht gespeichert.
- Vorschlag (noch nicht bestätigt): Anteil pro Spieler = Hallenpreis / tatsächliche Spielerzahl zur 24-Stunden-Frist, Differenz bei Nachrückern als Gutschrift.

## Technologie-Stack
Installiert: Next.js 16, React 19, TypeScript, Tailwind 4, PostgreSQL 18, Drizzle ORM, Auth.js 5 (Google), Zod.
Geplant: shadcn/ui, react-hook-form, Serwist (PWA) und Web-Push, SSE mit Postgres LISTEN/NOTIFY, pg-boss (Jobs), Stripe, Resend, sharp und next/og, S3-kompatibler Speicher, @react-pdf/renderer, Leaflet/OSM, next-intl, Vitest, Playwright, GitHub Actions, Docker, Sentry, Plausible.
Hosting-Empfehlung: Hetzner mit Docker (noch offen). Später: Buchungs-Agent mit Anthropic-SDK und Playwright.
Bewusst nicht: Redis, Kubernetes, Microservices, GraphQL.

## Plattformen und Betrieb (Stand Review 3)
- Website mobile-first (eine Adresse), PWA ab Phase 1 (Manifest, Service Worker, Web-Push, Installationshinweis für iOS), Capacitor-Store-App ab Phase 2/3 nach Klärung der Guthaben-Regeln der Stores. Keine native Neuentwicklung. Admin-Dashboard bleibt Web.
- Betrieb: Docker Compose, kein Kubernetes. Monitoring in Stufen: Sentry und Uptime Kuma sofort, Plausible bei echten Nutzern, Prometheus/Grafana vor Phase 2. Geschäftszahlen im eigenen Admin-Dashboard, nicht in Grafana.
- CI mit GitHub Actions, Umgebungen lokal/Staging/Produktion, Caddy als Reverse Proxy, Coolify oder Dokploy auf Hetzner, tägliche Sicherung mit monatlichem Wiederherstellungstest.
