# Design-Richtungen für Navigation, Meine Spiele und Lobby-Karte

Grundlage: `PRODUCT.md` und `DESIGN.md` im Repo-Wurzelverzeichnis (aus dem Bestand abgeleitet, vom Projektinhaber noch zu bestätigen). Die Prototypen sind statische HTML-Dateien mit Inline-CSS und Inline-SVG, ohne Netzwerkzugriff, ohne Skript. Einfach im Browser öffnen (Handybreite 390 px, drei Bildschirme nebeneinander). Es sind Skizzen mit Beispieldaten, kein Eintrag in `src/`.

Grenzen:
- Schriften sind installierte Systemschriften als Platzhalter (kein Netzwerk, keine Font-Dateien im Repo). Die echte Schriftwahl ist offen und gehört in die Entscheidung für eine Richtung.
- Nicht in einem Browser geprüft (keine Screenshots, kein Kontrastmessung per Werkzeug). Für A bis C sind die Farbpaare nach Augenmaß gewählt. Für D und E sind alle Text- und Handlungsfarbenpaare rechnerisch geprüft (Abschnitt Teamfarben), die Wiedergabe im Browser ist aber auch dort nicht angesehen.
- Die Ampel ist in allen drei Richtungen zusätzlich über Form und Wort codiert (DESIGN.md: Text-neben-Farbe-Regel). Bei der Umsetzung bleibt die Test-ID-Logik (`data-light`, `data-testid`) unberührt.

| Datei | Richtung | Kern |
|---|---|---|
| `richtung-a-hallenanzeige.html` | A: Hallenanzeige, geschärft | Bestehende dunkle Welt, aufgeräumt: nur ein Signalgrün, weiße Anzeigetafel-Ziffer als Spielnummer, aktive Navigation als gefüllte Kapsel. Geringster Umbau. |
| `richtung-b-spielbericht.html` | B: Spielbericht (Papier), **verworfen** (Datei bleibt als Referenz) | Hell und gedruckt: Warmweiß, Tinte, Stempelrot. Eintrittskarte mit Abriss für „Meine Spiele“, Spielbericht-Bogen mit Tabelle für die Lobby, Reiter statt Symbole. Lesbar im Sonnenlicht. Größter Bruch mit dem Bestand. |
| `richtung-c-hallenboden.html` | C: Hallenboden (Spielfeld) | Blaugrau mit weißen Feldlinien und Ballorange. Lobby als Spielfeld mit Spielerpunkten (Ring, Halbfläche, Haken), Weg bis zum Anstoß in vier Stationen, Dock mit großem „Spiel suchen“ in der Mitte. Mittlerer bis großer Umbau. |
| `richtung-d-flutlicht.html` | D: Flutlicht (C + A) | Spielfeld-Lobby und Weg bis zum Anstoß (4 Stationen) aus C, ruhige dunkelgrüne Fläche und Anzeigetafel-Spielnummer aus A. Orange ist die einzige Handlungsfarbe, alles andere neutral. Ampel über Form und Wort. Je eine dunkle und eine helle Variante. |
| `richtung-e-trikot.html` | E: Trikot (D + Teamfarben) | Wie D, aber jedes Team wählt eine Trikotfarbe (12 Farben). Die Feldhälften stehen in den Teamfarben auf neutraler Fläche mit Rahmen. Text je Farbe automatisch hell oder dunkel. Dunkle Variante Rot gegen Himmelblau, helle Variante Gelb gegen Violett. |

## Teamfarben und Lesbarkeit (Richtung E)

Rechnung: WCAG-2.x-Kontrastverhältnis (relative Leuchtdichte nach sRGB). Zur Auswahl standen Weiß `#ffffff` und Fast-Schwarz `#0b1118`; gewählt wird die Textfarbe mit dem größeren Verhältnis. Schwelle für Text: mindestens 4,5:1. Alle zwölf Farben erreichen sie, es musste keine gestrichen oder angepasst werden. Das Rechenskript liegt nur lokal und ist nicht Teil des Repos.

| Farbe | Hex | Textfarbe | Text auf Farbe | Farbe auf dunkler Fläche `#1b2a23` | Farbe auf heller Fläche `#f1f5f2` |
|---|---|---|---|---|---|
| Rot | `#c8102e` | Weiß `#ffffff` | 5.88:1 | 2.55:1 | 5.35:1 |
| Bordeaux | `#7a1f3d` | Weiß `#ffffff` | 10.04:1 | 1.49:1 | 9.13:1 |
| Pink | `#e9498c` | Fast-Schwarz `#0b1118` | 5.23:1 | 4.13:1 | 3.29:1 |
| Violett | `#6a3fb5` | Weiß `#ffffff` | 7.02:1 | 2.13:1 | 6.38:1 |
| Marine | `#14284b` | Weiß `#ffffff` | 14.64:1 | 1.02:1 | 13.30:1 |
| Blau | `#1f4fd1` | Weiß `#ffffff` | 6.78:1 | 2.21:1 | 6.16:1 |
| Himmelblau | `#4fb3e8` | Fast-Schwarz `#0b1118` | 8.08:1 | 6.38:1 | 2.13:1 |
| Türkis | `#0fb5a6` | Fast-Schwarz `#0b1118` | 7.39:1 | 5.83:1 | 2.33:1 |
| Grün | `#1e9e4a` | Fast-Schwarz `#0b1118` | 5.46:1 | 4.31:1 | 3.16:1 |
| Gelb | `#f2c200` | Fast-Schwarz `#0b1118` | 11.28:1 | 8.91:1 | 1.53:1 |
| Weiß | `#f4f4f2` | Fast-Schwarz `#0b1118` | 17.22:1 | 13.60:1 | 1.00:1 |
| Schwarz | `#15181c` | Weiß `#ffffff` | 17.81:1 | 1.19:1 | 16.18:1 |

Hinweise:
- Die letzten beiden Spalten sind nur Information: Eine Teamfarbe unter 3:1 zur Fläche (zum Beispiel Marine auf Dunkel, Gelb auf Hell) bleibt als Fläche trotzdem erkennbar, weil jede Hälfte einen neutralen Rahmen in Feldlinienfarbe trägt. Der Teamname steht zusätzlich als Text auf der Teamfarbe.
- Spieler auf der Feldhälfte sind in der Textfarbe der jeweiligen Teamfarbe gezeichnet, also ebenfalls mindestens 4,5:1. Ihr Zustand steht in Form (Ring, Halbfläche, Haken, gestrichelt) und in der Legende als Wort.
- Orange ist als Teamfarbe ausgeschlossen, damit die Handlungsfarbe einmalig bleibt. Orange selbst: dunkle Variante `#ff6a1f` mit Text `#1d0a00` 6,69:1 (Fläche 5,23:1); helle Variante `#c2410c` mit Weiß 5,18:1 (Fläche 4,71:1).
- Neutrale Texte: dunkel Haupttext 13,43:1 und gedämpft 6,96:1 auf der Fläche; hell Haupttext 15,30:1 und gedämpft 6,64:1.
- Offen: Zwei Teams mit fast gleicher Farbe in einem Spiel (zum Beispiel Rot gegen Bordeaux). Vorschlag: bei der Wahl die gleiche Farbe im selben Spiel sperren oder dem Gast die Alternativfarbe anbieten.


## Kurzvergleich

- **A** ändert Tokens und Komponentenstile, kein neues Layout: schnell umsetzbar, Risiko: wirkt weiter wie ein „dunkles Sport-Dashboard“.
- **B** setzt auf Einzigartigkeit und Lesbarkeit draußen, verlangt neue Schrift, helle Tokens und ein Konzept für den Dark-Mode-Wunsch der Spieler (offene Produktfrage).
- **C** gibt der Lobby ein eigenes Bild (Feld), das auch das Teilen unterstützt, kostet aber SVG-Aufwand pro Kaderstärke (5er bis 8er Felder) und ein anderes Navigationsmodell (Mittelknopf).

Offene Fragen an den Projektinhaber: Hell, dunkel oder beides? Bleibt das Logo (`public/brand/socca-logo.jpeg`) unverändert? Soll „Spiel suchen“ die zentrale Handlung der Navigation sein?
