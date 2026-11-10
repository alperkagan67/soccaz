# 007 – Oberfläche trennen: Teamspiel, Privatspiel, Turniere
Status: Entwurf (2026-11-10)
Version: 1

## Ziel
Die drei Spielarten sind in Navigation, "Meine Spiele" und Begriffen klar getrennt: Teamspiel (Gegner suchen, offene Lobbys), Privatspiel (Freundesgruppe, Einladungslink), Turniere. Das Erscheinungsbild folgt der gewählten Richtung C "Hallenboden" (docs/design/richtung-c-hallenboden.html, PRODUCT.md, DESIGN.md): Blaugrau, weiße Feldlinien, ein Ballorange als Signalfarbe, Lobby als Spielfeld mit Spielerpunkten, "Spiel suchen" als Mittelknopf der unteren Leiste. Gäste sehen auf Spielseiten nur Initialen (Vertrag-Entscheidung Q1, Umsetzung in Backlog-Eintrag 3).

## Nutzer und Rollen
Gast, Spieler, Captain, Veranstalter. Keine Rechteänderung.

## Entscheidungen (vom Nutzer, 2026-11-10)
- Navigation: Bereiche Teamspiel, Privatspiel, Turniere (Q6).
- "Meine Spiele" nach Modus gruppiert, plus eigene Turnierliste (Q7).
- Begriffe: "Offene Lobbys" und "Spiel mit festem Termin suchen" (Q8).
- Gestaltung: Richtung C, vom Orchestrator gewählt (Nutzer kann stoppen).

## Annahmen
- Begründung C: Eigenes Bild statt "dunkles Sport-Dashboard" (A), weniger Bruch und Schriftrisiko als B; das Spielfeld macht Kaderstand und Ampel (in Lobby, bereit, bezahlt, bestätigt) auf einen Blick lesbar und unterstützt Teilen per WhatsApp.
- Hell/Dunkel: Blaugrau-Basis hell mit dunklem Modus über Tokens; Kontrast bei Umsetzung messen (WCAG AA).
- Logo bleibt unverändert; Schriften Outfit und Plus Jakarta Sans bleiben, bis eine Alternative gemessen besser ist.
- Test-IDs (`data-light`, `data-testid`) und Pfade/URLs bleiben unverändert.
- Ampel bleibt zusätzlich über Form und Wort codiert.
- Umsetzung in Stufen: erst Tokens/Navigation/Begriffe, dann "Meine Spiele", dann Lobby-Feld.

## Nicht-Ziele
- Geldmodell (Vertrag 008), Privatsphäre-Härtung (Backlog 3).
- Admin-Bereich (/admin), Overlay, Logo, neue Funktionen.
- Neue Sprachen; vorhandene Übersetzungen (`getT()`) werden mitgepflegt.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Handy, eingeloggt | Untere Leiste | Einträge Teamspiel, Privatspiel, Turniere, Profil; "Spiel suchen" als Mittelknopf; aktive Seite markiert | tests/e2e/basics.spec.ts |
| AC-2 | Gast | Leiste | Mittelknopf führt zur Suche, Profil zur Anmeldung | tests/e2e/basics.spec.ts |
| AC-3 | Nutzer mit Team-, Privatspiel und Turnier | "Meine Spiele" | Gruppen Teamspiele, Privatspiele, Turniere; Turnierliste zeigt Status | tests/e2e/phase4.spec.ts |
| AC-4 | Alle Oberflächentexte | Prüfung | "Offene Lobbys" und "Spiel mit festem Termin suchen" statt alter Begriffe, in allen Sprachdateien | tests/unit/i18n.test.ts |
| AC-5 | Lobby-Seite | Aufruf | Spielfeld mit Spielerpunkten (Ring/Halbfläche/Haken = in Lobby/bereit/bezahlt), Wort neben Farbe, Weg bis Anstoß in 4 Stationen | tests/e2e/lobby-feld.spec.ts |
| AC-6 | Alle Seiten | Bestehende Tests laufen | Keine URL und keine Test-ID geändert, alle bisherigen E2E grün | tests/e2e/* |
| AC-7 | Farbpaare Text/Hintergrund | Messung | Kontrast ≥ 4,5:1 (Text), ≥ 3:1 (Zeichen); Touch-Ziele ≥ 44 px | tests/unit/contrast.test.ts |
| AC-8 | Handy 390 px und Desktop | Anzeige | Kein horizontales Scrollen, Leiste ab `sm` als Kopfleiste | tests/e2e/basics.spec.ts |

## Meilensteine (seriell, gemeinsame Dateien `globals.css`, `BottomNav.tsx`, `MyGames.tsx`)
- M1: Tokens, Navigation, Begriffe (AC-1, 2, 4, 7, 8); als erstes Detail: Kontrastmessung der Farbpaare von Richtung C (`docs/design/richtung-c-hallenboden.html`, WCAG AA) vor der Token-Umsetzung
- M2: Meine Spiele (AC-3)
- M3: Lobby-Feld (AC-5), Regression (AC-6)

## Betroffene Bereiche
`src/app/globals.css`, `src/components/BottomNav.tsx`, `Header.tsx`, `MyGames.tsx`, `LobbyBoard.tsx`, `PlayerLight.tsx`, `src/app/lobby/[id]`, `src/app/app/page.tsx`, `src/app/turniere`, Sprachdateien. Keine Datenbank.

## Risiken und Randfälle
- Lobby-Feld braucht SVG je Kaderstärke (5er bis 8er, bei Privatspiel bis 22 → Listenansicht ab Schwelle).
- Mittelknopf und Safe-Area auf iOS; PWA-Standalone prüfen.
- Dunkler Modus + Kontrast; Farbenblindheit (Ampel nie nur Farbe).
- Gäste-Initialen und Feld dürfen keine Namen leaken.

## Datenschutz / Sicherheit
Keine neuen Daten. Review: Gäste sehen im Feld nur Initialen.

## Offene Fragen
- Hell, dunkel oder beides als Standard? Annahme: System folgt, Standard hell.

## End-to-End-Nachweis
`tests/e2e/basics.spec.ts`, `phase4.spec.ts`, `lobby-feld.spec.ts`: Navigation, Meine Spiele gruppiert, Lobby-Feld auf 390 px mit Screenshot-Prüfung.
