# 010 – Spieler-Funktionen: Hallenbewertung, Hallenkarte, Nochmal spielen
Status: Freigegeben (2026-11-11)
Version: 1

## Ziel
Spieler bewerten nach dem Spiel die Halle (nur wer dort gespielt hat), finden Partnerhallen auf einer Karte und können ein Spiel mit denselben Teams und derselben Halle wiederholen: Nach Spielende werden beide Captains gefragt "Nochmal spielen?"; sagen beide ja, öffnet sich eine neue Lobby mit denselben Teams und derselben Halle, nur der Termin wird gewählt.

## Nutzer und Rollen
Spieler (bewerten), Captain (Nochmal spielen), Gast (liest), Admin 2 (prüft gemeldete Texte), Hallenbetreiber (antwortet, Vertrag 011).

## Entscheidungen (vom Nutzer, 2026-11-10)
- Bewertung: Kategorien Boden, Umkleiden, Sauberkeit, Duschen, Parken (1 bis 5) plus Freitext, einmal pro Spiel und Spieler, nur für Spieler, die in der Halle gespielt haben. Gäste sehen nur Durchschnittswerte; Texte nur Eingeloggte. Bestehende Kommentare bleiben. "Melden"-Knopf für Texte; Admin 2 prüft.
- Karte: Leaflet mit OpenStreetMap-Kacheln, Kacheln erst nach Einwilligung; ohne Einwilligung bleibt die Liste nach Stadt.
- Nochmal spielen: nach Spielende werden beide Captains gefragt; nur bei zweimal ja wird eine neue Lobby (gleiche Teams, gleiche Halle, Termin wird gewählt) eröffnet.

## Annahmen (Orchestrator-Vorschlag)
- "Gespielt" = Teilnehmer eines abgeschlossenen, bestätigten Spiels dieser Halle (Team, Turnier, Privatspiel); Bewertungsfrist 7 Tage nach Spielende, eine Erinnerung (Push) am nächsten Tag, wenn noch nicht bewertet.
- Privatspiele: bewertbar (Halle), aber ohne Rangliste/Namen für Gäste; Nochmal spielen fragt den Veranstalter (Captain beider Teams), eine Antwort genügt.
- Neue Lobby nutzt die Regeln aus 006/008 (48-h-Frist, geparktes Geld); die Halle wird nicht automatisch gebucht, die Halle-Zusage läuft wie heute. Fragt nur, wenn die Halle noch aktiv und Partner ist.
- Die Frage "Nochmal spielen?" wird als Benachrichtigung/Push und in "Meine Spiele" gestellt; Frist 2 Stunden nach Spielende, danach verfällt sie.
- Karte nutzt vorhandene `lat/lng`; Hallen ohne Koordinaten erscheinen nur in der Liste. Umgebung "in der Nähe": Standort nur auf Nutzerwunsch, nie gespeichert.

## Nicht-Ziele
- Antwort der Hallenbetreiber auf Bewertungen (011).
- Bewertung von Spielern/Teams, Treue- oder Belohnungssystem.
- Automatisches Buchen der Halle.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Spieler hat in der Halle gespielt (abgeschlossenes Spiel) | Bewertet (5 Kategorien + Text) | Gespeichert, einmal pro Spiel; zweite Bewertung abgelehnt | tests/integration/hallenbewertung.test.ts |
| AC-2 | Nutzer hat dort nicht gespielt / Gast | Versucht zu bewerten | Abgelehnt (Server-Aktion) | tests/integration/hallenbewertung.test.ts |
| AC-3 | Halle mit Bewertungen | Gast öffnet die Hallenseite | Durchschnittswerte je Kategorie; Texte nur für Eingeloggte | tests/e2e/hallen.spec.ts |
| AC-4 | Eingeloggter sieht Bewertungstext | Klickt "Melden" | Meldung erscheint bei Admin 2; Admin 2 kann Text ausblenden (protokolliert) | tests/integration/hallenbewertung.test.ts |
| AC-5 | Karte | Nutzer willigt in Kacheln ein | Partnerhallen mit Marker, Klick führt zur Hallenseite; ohne Einwilligung keine Kachel-Anfrage, Liste bleibt | tests/e2e/hallen.spec.ts |
| AC-6 | Spiel endet | Beide Captains sagen ja | Neue Lobby, gleiche Teams, gleiche Halle, Termin offen; bei einem Nein/Verfall keine Lobby | tests/integration/rematch.test.ts |
| AC-7 | Nur ein Captain sagt ja, oder 2 Stunden nach Spielende ist abgelaufen | Frist läuft ab | Kein Spiel, Frage verfällt, Hinweis an beide | tests/integration/rematch.test.ts |
| AC-8 | Halle nicht mehr aktiv/Partner | Spiel endet | Frage erscheint nicht | tests/integration/rematch.test.ts |
| AC-9 | Spieler hat 1 Tag nach Spielende nicht bewertet | Erinnerung | Genau eine Push-Erinnerung; nach 7 Tagen keine Bewertung mehr möglich | tests/integration/hallenbewertung.test.ts |

## Meilensteine
- M1: Bewertung mit Kategorien, Melden (AC-1 bis 4)
- M2: Karte (AC-5)
- M3: Nochmal spielen (AC-6 bis 8)

## Betroffene Bereiche
`src/app/hallen/*`, neue Tabelle für Bewertungen (Migration additiv), `src/server/*` (Bewertung, Rematch), Benachrichtigungen, `MyGames.tsx`, Moderation (Admin 2). Karte: Leaflet-Abhängigkeit (`package.json`, Audit).

## Risiken und Randfälle
- Mehrfachbewertung durch parallele Aufrufe (eindeutiger Schlüssel).
- Beleidigende Texte: Melden + Ausblenden; Löschung Konto anonymisiert Bewertung.
- Kacheln = Weitergabe der IP an den Kartenserver; nur nach Einwilligung, Datenschutzseite ergänzen.
- Rematch bei aufgelöstem Team oder gesperrtem Spieler: Frage entfällt.

## Datenschutz / Sicherheit
Bewertungen personenbezogen: Gäste ohne Namen (Initialen-Regel); Standort nie speichern; Security-Review (Rechteprüfung "hat dort gespielt").

## Offene Fragen
- (keine; Fristen vom Nutzer entschieden: Nochmal spielen nur 2 Stunden nach Spielende, Bewertung 7 Tage mit einer Erinnerung am nächsten Tag)

## End-to-End-Nachweis
`tests/e2e/hallen.spec.ts`: Spieler bewertet nach Spielende, Gast sieht Durchschnitt, Karte nach Einwilligung; Captains sagen ja und eine neue Lobby entsteht.
