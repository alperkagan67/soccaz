# Design-Richtungen für Navigation, Meine Spiele und Lobby-Karte

Grundlage: `PRODUCT.md` und `DESIGN.md` im Repo-Wurzelverzeichnis (aus dem Bestand abgeleitet, vom Projektinhaber noch zu bestätigen). Die Prototypen sind statische HTML-Dateien mit Inline-CSS und Inline-SVG, ohne Netzwerkzugriff, ohne Skript. Einfach im Browser öffnen (Handybreite 390 px, drei Bildschirme nebeneinander). Es sind Skizzen mit Beispieldaten, kein Eintrag in `src/`.

Grenzen:
- Schriften sind installierte Systemschriften als Platzhalter (kein Netzwerk, keine Font-Dateien im Repo). Die echte Schriftwahl ist offen und gehört in die Entscheidung für eine Richtung.
- Nicht in einem Browser geprüft (keine Screenshots, kein Kontrastmessung per Werkzeug). Farbpaare sind nach Augenmaß gewählt und bei Umsetzung zu messen.
- Die Ampel ist in allen drei Richtungen zusätzlich über Form und Wort codiert (DESIGN.md: Text-neben-Farbe-Regel). Bei der Umsetzung bleibt die Test-ID-Logik (`data-light`, `data-testid`) unberührt.

| Datei | Richtung | Kern |
|---|---|---|
| `richtung-a-hallenanzeige.html` | A: Hallenanzeige, geschärft | Bestehende dunkle Welt, aufgeräumt: nur ein Signalgrün, weiße Anzeigetafel-Ziffer als Spielnummer, aktive Navigation als gefüllte Kapsel. Geringster Umbau. |
| `richtung-b-spielbericht.html` | B: Spielbericht (Papier) | Hell und gedruckt: Warmweiß, Tinte, Stempelrot. Eintrittskarte mit Abriss für „Meine Spiele“, Spielbericht-Bogen mit Tabelle für die Lobby, Reiter statt Symbole. Lesbar im Sonnenlicht. Größter Bruch mit dem Bestand. |
| `richtung-c-hallenboden.html` | C: Hallenboden (Spielfeld) | Blaugrau mit weißen Feldlinien und Ballorange. Lobby als Spielfeld mit Spielerpunkten (Ring, Halbfläche, Haken), Weg bis zum Anstoß in vier Stationen, Dock mit großem „Spiel suchen“ in der Mitte. Mittlerer bis großer Umbau. |

## Kurzvergleich

- **A** ändert Tokens und Komponentenstile, kein neues Layout: schnell umsetzbar, Risiko: wirkt weiter wie ein „dunkles Sport-Dashboard“.
- **B** setzt auf Einzigartigkeit und Lesbarkeit draußen, verlangt neue Schrift, helle Tokens und ein Konzept für den Dark-Mode-Wunsch der Spieler (offene Produktfrage).
- **C** gibt der Lobby ein eigenes Bild (Feld), das auch das Teilen unterstützt, kostet aber SVG-Aufwand pro Kaderstärke (5er bis 8er Felder) und ein anderes Navigationsmodell (Mittelknopf).

Offene Fragen an den Projektinhaber: Hell, dunkel oder beides? Bleibt das Logo (`public/brand/socca-logo.jpeg`) unverändert? Soll „Spiel suchen“ die zentrale Handlung der Navigation sein?
