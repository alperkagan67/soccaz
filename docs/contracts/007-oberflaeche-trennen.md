# 007 – Oberfläche trennen: Teamspiel, Privatspiel, Turniere
Status: Freigegeben (2026-11-10)
Version: 2 (Richtung E „Trikot“ statt C „Hallenboden“; Zusätze 2026-11-10: Teamfarben im Privatspiel, Teilen-Karte, bestätigte Annahmen)

## Ziel
Die drei Spielarten sind in Navigation, "Meine Spiele" und Begriffen klar getrennt: Teamspiel (Gegner suchen, offene Lobbys), Privatspiel (Freundesgruppe, Einladungslink), Turniere. Das Erscheinungsbild folgt der gewählten Richtung E "Trikot" (docs/design/richtung-e-trikot.html, DESIGN.md Abschnitt "Verbindliche Richtung: E", PRODUCT.md): ruhige dunkelgrüne beziehungsweise helle Fläche, Anzeigetafel-Spielnummer, **Orange als einzige Akzentfarbe**, Lobby als Spielfeld, dessen Hälften in den **Trikotfarben der beiden Teams** auf neutraler Grundfläche stehen, "Spiel suchen" als Mittelknopf der unteren Leiste. Gäste sehen auf Spielseiten nur Initialen (Vertrag-Entscheidung Q1, Umsetzung in Backlog-Eintrag 3).

## Nutzer und Rollen
Gast, Spieler, Captain, Veranstalter. Keine Rechteänderung. Neu: Die Teamfarbe ändert nur, wer im Team Admin ist (bestehende Rolle `admin`, wie beim Bearbeiten des Teams).

## Entscheidungen (vom Nutzer, 2026-11-10)
- Navigation: Bereiche Teamspiel, Privatspiel, Turniere (Q6).
- "Meine Spiele" nach Modus gruppiert, plus eigene Turnierliste (Q7).
- Begriffe: "Offene Lobbys" und "Spiel mit festem Termin suchen" (Q8).
- Gestaltung: Richtung E "Trikot" verbindlich (G1 erteilt, 2026-11-10). Richtung B ist verworfen, C ist durch D/E abgelöst.
- Hell/Dunkel folgt der Systemeinstellung. Ähnliche Teamfarben im selben Spiel sind gesperrt. Orange ist die einzige Akzentfarbe, auch als Stationsmarker.
- Privatspiel (Nutzerentscheid 2026-11-10): Der Veranstalter wählt beide Teamfarben aus der Palette; Standard sind Rot (Heim) und Himmelblau (Gast).
- Teilen-Karte des Privatspiels: mit den Teamfarben, wenn beide Farben gesetzt (gespeichert) sind, sonst neutral ohne Teamfarben.
- Bestätigt (2026-11-10): Fehler und Gefahr bekommen keine eigene Akzentfarbe (Symbol, Wort und kräftiger Rahmen in Tinte). "Gesperrt" heißt: die nächste Farbe für den Gast, nur zur Anzeige, keine Blockade.

## Annahmen
- Begründung E: Eigenes Bild statt "dunkles Sport-Dashboard"; das Spielfeld macht Kaderstand und Ampel (in Lobby, bereit, bezahlt, bestätigt) auf einen Blick lesbar, und die Teamfarben geben jedem Team Identität, ohne eine zweite Akzentfarbe zu brauchen.
- Teamfarbe: feste 12er-Palette (Rot, Bordeaux, Pink, Violett, Marine, Blau, Himmelblau, Türkis, Grün, Gelb, Weiß, Schwarz; Hex-Werte in DESIGN.md). Keine freie Farbwahl, kein Orange.
- Textfarbe auf der Teamfarbe: Weiß `#ffffff` oder Fast-Schwarz `#0b1118`, je nach größerem WCAG-Verhältnis; bereits gerechnet, alle zwölf ≥ 4,5:1 (Tabelle in docs/design/README.md).
- **Farbabstand-Metrik: CIEDE2000 (ΔE00) in CIELAB (D65), Schwelle 20.** Gerechnet über alle 66 Paare der Palette: kleinster Abstand 11,8 (Violett/Blau); unter 20 liegen genau vier Paare: Violett/Blau 11,8, Marine/Schwarz 14,4, Rot/Bordeaux 19,1, Türkis/Grün 19,9. Das nächste erlaubte Paar ist Marine/Blau mit 20,8. 20 ist damit der engste Wert, der diese vier unterscheidbar trennt und keine weiteren Paare sperrt. Die Rechenfunktion wird gegen den Referenzwert aus Sharma et al. geprüft (50,0/2,6772/−79,7751 gegen 50,0/0/−82,7485 ergibt 2,0425).
- **"Gesperrt" heißt: nicht im selben Spiel darstellbar.** Haben Heim und Gast eine Farbe mit ΔE00 < 20, behält das Heimteam seine Farbe, und die Gastfarbe wird **nur für die Anzeige in diesem Spiel** durch die Palettenfarbe ersetzt, die der gewählten Gastfarbe am nächsten liegt und zu Heim ΔE00 ≥ 20 hat. Das ist rein berechnet und deterministisch, wird nicht gespeichert und blockiert weder Suche noch Annahme noch Lobby. (Alternative: Annehmen sperren. Verworfen, weil bei 12 Farben und vielen Teams sonst Spiele an der Farbe scheitern.)
- Teams ohne gewählte Farbe (alle Bestandsteams, `color` leer) bekommen eine **Standardfarbe aus dem Slug** (stabiler Hash auf die Palette) und können sie ändern. Das Spiel-Team eines Privatspiels (`kind = 'private'`) ist unsichtbar; seine Farbe wählt der Veranstalter (Standard Rot für Heim und Himmelblau für Gast, solange er nichts wählt). Der Veranstalter ist Admin beider Spiel-Teams und damit schreibberechtigt; bei Farbkonflikt gilt die Ersatzfarbe der Anzeige (AC-9).
- Orange: dunkel `#ff6a1f` mit Schrift `#1d0a00`, hell `#c2410c` mit Weiß; Rest der Tokens in DESIGN.md.
- Hell/Dunkel: `prefers-color-scheme`, kein Umschalter in der Oberfläche.
- Logo bleibt unverändert; Schriften Outfit und Plus Jakarta Sans bleiben, bis eine Alternative gemessen besser ist.
- Test-IDs (`data-light`, `data-testid`) und Pfade/URLs bleiben unverändert.
- Ampel bleibt zusätzlich über Form und Wort codiert (Ring, Halbfläche, Haken, gestrichelt für freien Platz).
- Fehler und Gefahr bekommen keine eigene Akzentfarbe: Symbol, Wort und kräftiger Rahmen in Tinte (siehe Offene Fragen).
- Umsetzung in Stufen: erst Tokens/Navigation/Begriffe, dann Teamfarbe (Migration), dann "Meine Spiele", dann Lobby-Feld.

## Datenbank: Migration ja
Bestandsschema gelesen (`src/db/schema.ts`, Tabelle `teams`): Es gibt **keine** Spalte für eine Farbe (vorhanden: name, slug, city, logoUrl, bio, strength, isVerified, kind, archivedAt, createdBy, createdAt). Daher **eine additive Migration**: `teams.color` als `text`, nullable, ohne Backfill (leer = Standardfarbe aus dem Slug), Wertebereich per Check-Constraint auf die zwölf Palettenschlüssel begrenzt (`red`, `burgundy`, `pink`, `violet`, `navy`, `blue`, `skyblue`, `teal`, `green`, `yellow`, `white`, `black`). Keine Änderung an bestehenden Spalten, rückwärtskompatibel, kein Datenumbau. Weitere Tabellen brauchen nichts: Die Ersatzfarbe im Spiel wird berechnet, nicht gespeichert.

Folgen:
- **Task Manager:** Der Migrations-PR kommt in `docs/loop/GO-LIVE-AUDIT.md` (PR, Datum, Was, Risiko; Risiko niedrig, additiv). Migrationen laufen nie parallel zu Tasks mit Schema-Annahmen (Meilenstein M2 serial, Reihenfolge einhalten).
- **security-reviewer ist Pflicht** für den PR mit Farbwahl: neue Eingabe (Palettenschlüssel serverseitig validieren, nie freien Text oder Hex annehmen, kein Einschleusen in Style-Attribute), neuer Schreibpfad (nur Team-Admin, nicht Mitglied oder Gast, kein IDOR über Team-ID), Datenzugriff (Farbe ist öffentliche Teamangabe und darf bei `kind = 'private'` nicht über Verzeichnis oder Listen sichtbar werden).
- Rolle der Farbe im Spiel-Feed: die Ersatzfarbe darf nichts über Teams preisgeben, die der Betrachter nicht sehen darf (Gäste-Initialen, Privatspiel-Sichtbarkeit).

## Nicht-Ziele
- Geldmodell (Vertrag 008), Privatsphäre-Härtung (Backlog 3).
- Admin-Bereich (/admin), Overlay, Logo, neue Funktionen.
- Freie Farbwahl, Teamfarbe als Teil von Logo oder Opengraph-Bild (Ausnahme: die Teilen-Karte des Privatspiels, AC-16), Sponsorenfarben.
- Neue Sprachen; vorhandene Übersetzungen (`getT()`) werden mitgepflegt.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Handy, eingeloggt | Untere Leiste | Einträge Teamspiel, Privatspiel, Turniere, Profil; "Spiel suchen" als Mittelknopf; aktive Seite markiert (Orange-Strich) | tests/e2e/basics.spec.ts |
| AC-2 | Gast | Leiste | Mittelknopf führt zur Suche, Profil zur Anmeldung | tests/e2e/basics.spec.ts |
| AC-3 | Nutzer mit Team-, Privatspiel und Turnier | "Meine Spiele" | Gruppen Teamspiele, Privatspiele, Turniere; Turnierliste zeigt Status; Weg bis Anstoß in 4 Stationen, jetzige Station orange, Teamfarben als kleine Marken | tests/e2e/phase4.spec.ts |
| AC-4 | Alle Oberflächentexte | Prüfung | "Offene Lobbys" und "Spiel mit festem Termin suchen" statt alter Begriffe, in allen Sprachdateien | tests/unit/i18n.test.ts |
| AC-5 | Lobby-Seite mit Heim und Gast | Aufruf | Spielfeld: Heimhälfte und Gasthälfte in den Teamfarben (bei Konflikt mit Ersatzfarbe nach AC-9) auf neutraler Grundfläche, Rahmen in Feldlinienfarbe, Spielerzeichen (Ring/Halbfläche/Haken/gestrichelt = in Lobby/bereit und bezahlt/bestätigt/Platz frei) in der Textfarbe der Hälfte, Wort in der Legende, Weg bis Anstoß in 4 Stationen | tests/e2e/lobby-feld.spec.ts |
| AC-6 | Alle Seiten | Bestehende Tests laufen | Keine URL und keine Test-ID geändert, alle bisherigen E2E grün | tests/e2e/* |
| AC-7 | **Alle 12 Teamfarben** und die Neutral-/Orange-Paare in hell und dunkel | Messung (WCAG 2.x) | Textfarbe wird je Farbe automatisch gewählt und erreicht ≥ 4,5:1; Spielerzeichen (= Textfarbe auf Teamfarbe) ≥ 4,5:1; neutrale Texte auf Fläche ≥ 4,5:1; Orange gegen Fläche ≥ 3:1 und Schrift auf Orange ≥ 4,5:1; Touch-Ziele ≥ 44 px. Erwartete Werte: Tabelle in docs/design/README.md | tests/unit/contrast.test.ts |
| AC-8 | Handy 390 px und Desktop, hell und dunkel | Anzeige | Kein horizontales Scrollen, Leiste ab `sm` als Kopfleiste; Wechsel der Systemeinstellung wechselt das Thema ohne Neuladen | tests/e2e/basics.spec.ts |
| AC-9 | Zwei Teams in einem Spiel | Farbabstand ΔE00 (CIEDE2000, CIELAB D65) zwischen Heim- und Gastfarbe < 20 | Gastfarbe wird für die Anzeige durch die nächstliegende Palettenfarbe mit ΔE00 ≥ 20 zu Heim ersetzt; Ergebnis deterministisch und in der Palette; bei ΔE00 ≥ 20 bleibt die Gastfarbe. Die vier gesperrten Paare der Palette sind Violett/Blau, Marine/Schwarz, Rot/Bordeaux, Türkis/Grün (alle anderen 62 Paare erlaubt). Funktion symmetrisch im Abstand, Selbsttest gegen Referenz 2,0425 | tests/unit/team-color.test.ts |
| AC-10 | Team-Admin | Teamfarbe in den Teameinstellungen wählt | Es werden genau die 12 Palettenfarben angeboten (kein Orange, keine freie Eingabe); Auswahl wird gespeichert und in Feld, "Meine Spiele" und Teamseite gezeigt | tests/e2e/team-color.spec.ts |
| AC-11 | Mitglied ohne Admin-Rolle, Gast, fremder Nutzer | Farbe ändern (UI und direkter Aufruf der Aktion) | Abgelehnt; ungültiger Schlüssel (nicht in der Palette, Hex, Skript-Text) abgelehnt; Privatspiel-Team nicht über Verzeichnis oder Listen auffindbar | tests/integration/team-color.test.ts |
| AC-12 | Team ohne gewählte Farbe (Bestandsteam) | Anzeige | Standardfarbe aus dem Slug, stabil über Aufrufe, immer aus der Palette; nach Wahl gilt die gewählte | tests/unit/team-color.test.ts |
| AC-13 | Migration | `npm run db:migrate` auf bestehender DB | Spalte `teams.color` nullable, bestehende Zeilen unverändert (null), Check-Constraint lehnt Werte außerhalb der 12 Schlüssel ab | tests/integration/team-color.test.ts |
| AC-14 | Alle Oberflächen | Prüfung der Stile | Orange ist die einzige Akzentfarbe: keine Verwendung der alten Tokens `green`, `lime`, `cyan`, `sky`, `violet`, `pink`, `coral`, `yellow`, `red` für Zustände oder Handlungen außerhalb der Palette; Stationsmarker (jetzige Station) orange, erledigte neutral | tests/unit/accent.test.ts |
| AC-15 | Veranstalter eines Privatspiels | Er wählt die beiden Teamfarben (Heim, Gast) | Genau die 12 Palettenfarben wählbar; ohne Wahl gelten Rot und Himmelblau im Lobby-Feld; gespeichert wird nur, was er wählt; Nicht-Veranstalter abgelehnt; ungültiger Schlüssel abgelehnt; Farbe des unsichtbaren Teams erscheint nicht in Verzeichnis oder Listen | tests/e2e/team-color.spec.ts, tests/integration/team-color.test.ts |
| AC-16 | Veranstalter öffnet die Teilen-Karte seines Privatspiels | Beide Teamfarben gesetzt, bzw. nicht beide gesetzt | Mit beiden Farben zeigt die Karte sie; sonst neutral ohne Teamfarben; kein Name und keine ID für Fremde in der Karte | tests/e2e/privatspiel.spec.ts |

## Meilensteine (seriell, gemeinsame Dateien `globals.css`, `BottomNav.tsx`, `MyGames.tsx`)
- M1: Tokens, Navigation, Begriffe, Thema nach Systemeinstellung (AC-1, 2, 4, 7, 8, 14); als erstes Detail: Kontrastmessung aller Farbpaare von Richtung E (`docs/design/richtung-e-trikot.html`, Tabelle in `docs/design/README.md`, WCAG) vor der Token-Umsetzung, einschließlich der 12 Teamfarben und der Orange-Paare in hell und dunkel. Dazu die Paletten- und Kontrastfunktionen als reine Bibliothek (`src/lib`).
- M2: Teamfarbe: Migration `teams.color`, Palette und Farbabstand-Funktion (AC-9), Auswahl in den Teameinstellungen, Standardfarbe (AC-10, 11, 12, 13). Serieller Meilenstein, keine parallelen Tasks mit Schema-Annahmen; `security-reviewer` und GO-LIVE-AUDIT-Eintrag.
- M3: Meine Spiele (AC-3)
- M4: Lobby-Feld (AC-5), Regression (AC-6)

## Betroffene Bereiche
`src/app/globals.css`, `src/components/BottomNav.tsx`, `Header.tsx`, `MyGames.tsx`, `LobbyBoard.tsx`, `PlayerLight.tsx`, `src/app/lobby/[id]`, `src/app/app/page.tsx`, `src/app/turniere`, `src/app/app/privatspiel/neu`, `src/components/ShareLink.tsx`, `src/app/teams/[slug]` (Teameinstellungen), `src/db/schema.ts` mit neuer Migration, neue Bibliotheksdatei für Palette und Farbabstand in `src/lib`, Sprachdateien. **Datenbank: eine additive Migration (siehe oben).**

## Risiken und Randfälle
- Lobby-Feld braucht SVG je Kaderstärke (5er bis 8er, bei Privatspiel bis 22 → Listenansicht ab Schwelle).
- Mittelknopf und Safe-Area auf iOS; PWA-Standalone prüfen.
- Dunkler Modus und Kontrast; Farbenblindheit: Ampel nie nur Farbe, Teamfarbe nie allein als Unterscheidung (Teamname steht als Text). Zwei Palettenfarben können für Farbenblinde ähnlich wirken, auch wenn ΔE00 ≥ 20; die Hälften sind zusätzlich links/rechts und per Name getrennt.
- Teamfarbe unter 3:1 zur Fläche (Marine auf Dunkel, Gelb auf Hell, Weiß auf Hell): Rahmen in Feldlinienfarbe ist Pflicht, sonst verschwindet die Hälfte.
- Wechselt ein Team die Farbe, ändert sich die Darstellung laufender Spiele sofort (nicht gespeichert pro Spiel). Akzeptiert.
- Gäste-Initialen und Feld dürfen keine Namen leaken.
- Reihenfolge der Meilensteine einhalten: Migration vor Auswahl, Auswahl vor Lobby-Feld.

## Datenschutz / Sicherheit
Neue Daten: eine Farbangabe pro Team (öffentliche Teamangabe, kein Personenbezug). Review: Gäste sehen im Feld nur Initialen; Eingabe nur als Palettenschlüssel, serverseitig validiert; nur Team-Admin darf schreiben; `kind = 'private'`-Teams bleiben unsichtbar.

## Offene Fragen
- Keine offenen Produktfragen. Beantwortet am 2026-11-10: Fehler und Gefahr ohne eigene Akzentfarbe (bestätigt); Teamfarbe in der Teilen-Karte des Privatspiels ja (nur dort, nicht im Opengraph-Bild; bestätigt: die Teilen-Karte ist die In-App-/WhatsApp-Karte, kein OG-Bild); Privatspiel-Farben wählbar, Standard Rot und Himmelblau.

## End-to-End-Nachweis
`tests/e2e/basics.spec.ts`, `phase4.spec.ts`, `lobby-feld.spec.ts`, `team-color.spec.ts`: Navigation, Meine Spiele gruppiert, Teamfarbe wählen, Lobby-Feld in Teamfarben auf 390 px in hell und dunkel mit Screenshot-Prüfung.
