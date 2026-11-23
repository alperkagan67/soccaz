# AC-27 Kontrast: Baseline-Auswertung (erster CI-Lauf, 2026-11-23)

Quelle: CI-Lauf zu PR #253 (Kontrastmessung im Browser, Report-Modus), Commit `8730e6a`, Jobs „Browser-Tests Teil 1/5“ (390 px) und „Teil 3/5“ (1280 px); das Protokoll steht im Job-Log (`::group::Kontrast-Messprotokoll`). Umfang `baseline` (Gast und Spieler, sechs Kernseiten, dunkel und hell). Grenzen (WCAG 2.2): Text 4,5:1, großer Text 3:1, Zeichen und Fokusring 3:1. **Das ist die Ausgangslage für M2c und M3 (Richtung E, Bestand), keine Abnahme.** Ein Messpunkt ist ein Textelement, ein Bedienelement (Rand oder Fläche) oder ein Fokusring.

## 1. Zahlen und Laufzeit
| Messung | Messpunkte | bestanden | durchgefallen | unlesbar | Messfehler |
|---|---|---|---|---|---|
| 390 px (Shard 1) | 1274 | 1225 | 49 | 0 | 0 |
| 1280 px (Shard 3) | 1092 | 1060 | 32 | 0 | 0 |

- **Laufzeit der Specs:** je ca. 2,3 Minuten (Gast dunkel 1,2 Minuten und hell 1,0 Minuten, davon der größte Teil die erste Übersetzung der Seiten im Dev-Server; Spieler je 4 bis 7 Sekunden; Protokoll-Test unter 20 ms). Das Ziel von ca. 3 Minuten ist eingehalten.
- **Jobdauer der Browser-Shards** (inkl. Setup): Teil 1 8 min 03 s, Teil 2 10 min 40 s, Teil 3 9 min 41 s, Teil 4 8 min 02 s, Teil 5 10 min 39 s. Ziel je Shard höchstens ca. 10 Minuten: Teil 2 und Teil 5 liegen knapp darüber (nicht durch die Kontrastspecs, die in 1 und 3 laufen).
- Es gab keinen unlesbaren Messpunkt und keinen Messfehler: die Browserschicht (Grundfarbe `Canvas`, Deckkraft, Farbräume, Pixel) liest alles, was die Seiten rendern.

## 2. Echte Befunde (für M2c und M3)
27 eindeutige Muster; die folgenden sind nach Prüfung der Werte glaubwürdig (Token gegen Token nachrechenbar).

| # | Muster | Wert | Grenze | Wo | Ursache / Richtung |
|---|---|---|---|---|---|
| 1 | Rand von `btn-ghost` (Links/Knöpfe), `select.field`, `input.field`, `button.btn.w-full`: Randfarbe `--line` gegen die Fläche | dunkel 1,72 bis 2,06 (#3a5043 auf #1b2a23 bzw. #0f1914), hell 1,44 bis 1,68 (#b3c2b9 auf #f1f5f2 bzw. #dde5e0) | 3:1 | Start, Hallenliste, `/app`, Lobby, Spiel | der „feine Linie“-Token ist als Rand eines Bedienelements zu schwach; das ist AC-28 (Rand ruhiger Knöpfe stärker, >= 3:1): Rand von Bedienelementen auf `--rim` oder einen eigenen Token mit >= 3:1 heben, `--line` bleibt für Trennlinien |
| 2 | Platzhaltertext im Eingabefeld (`input#venue`) | dunkel 4,12 (#89958e auf #24362d), hell 3,13 (#7a857f auf #e3eae5) | 4,5:1 | Lobby (Hallenfeld) | Platzhalterfarbe ist ein eigener, zu schwacher Ton: auf `--muted` (>= 4,5:1) anheben |
| 3 | Akzentfarbe als Text auf ihrer eigenen Tönung (`span.mr-1`, die Zahl im Zähler) | dunkel 4,36 (#ff6a1f auf #3b3322) | 4,5:1 | Lobby | Leuchtfarbe als Schrift auf `accent-soft`: Schriftton `accent-fg` verwenden oder die Tönung schwächen |
| 4 | Akzentschrift auf getönter Fläche (Überschrift „Mein aktuelles Spiel“) | hell 3,98 (#b23a0a auf #dad1c7) | 4,5:1 | `/app` | `accent-fg` auf getönter Fläche: Tönung heller oder Schrift dunkler |
| 5 | Hero: Überschriftzeile „Gegner finden. Spielen.“ (große Schrift) und die Einleitung über dem Bild | hell 2,41 (390 px) und 2,69 (1280 px) gegen 3:1; Einleitung (`text-muted`) 4,09 gegen 4,5:1 | 3:1 bzw. 4,5:1 | Start, hell | bekanntes Risiko „Lesbarkeit auf Glow/Bild“ (Vertrag, Abschnitt Risiken): Scrim im Hellmodus deckender, oder die Zeile in `ink` statt `accent-fg` |

## 3. Wahrscheinliche Messartefakte (nicht als Befund führen, Messgenauigkeit verbessern)
Die Pixelmessung nimmt das Rechteck des **Elements**, nicht das des Textes. Bei Elementen, die weit größer als ihr Text sind (ganze Kartenlinks, Zeilen mit mehreren Kindern), fließen fremde Flächen in das 5. Perzentil ein. Hinweise darauf, dass die folgenden Werte kein echter Verstoß sind (die Token gegeneinander ergeben jeweils mehr als die Grenze):
- `a.-mt-4.flex` „Spiel suchen“: dunkel 1,07 (Schrift #1d0a00 auf Orange; Token-Verhältnis ca. 6,7:1) und hell 1,28 (weiß auf #c2410c; Token-Verhältnis 5,2:1);
- `p.flex-1.text-sm` (Einleitungstext der Kacheln): 1,33 und 1,41 (Token-Verhältnis `--muted` auf Grund: dunkel ca. 8,3:1, hell ca. 5,7:1);
- `a.relative.flex` „Teamspiel“ (Kartenlink): 1,20 bis 1,66 (Token-Verhältnis mindestens 5,7:1);
- `summary.cursor-pointer` „Nicht erschienen markieren“: 2,57 und 3,25 (Token-Verhältnis `--ink` auf Grund über 13:1).
**Maßnahme (PR 3, Messgenauigkeit):** das Rechteck aus dem Textbereich bilden (Range über den Textknoten, `getClientRects()`), nur Pixel innerhalb der Glyphbereiche sammeln und Elemente mit Kindern, die selbst Text tragen, nicht doppelt messen; danach den Lauf wiederholen und diese Muster neu bewerten.

## 4. Grenzen der Baseline
- Nur Richtung E (Bestand) und nur Gast und Spieler, sechs Seiten; Admin, Hallenbetreiber, Teamfarben-Karten (Cards C3a) und die neuen Seiten aus M2c/M3 fehlen (`UMFANG = "voll"` und weitere Einträge in `tests/e2e/kontrast/seiten.ts`).
- Der Modus ist `report`: die Verstöße erscheinen als `::warning`, der Test bleibt grün. Verbindlich (`enforce`) erst nach M2c.
- Nicht gemessen: Videoframes, Text in Bildern, `::before/::after`-Inhalt, Hover-Zustände, Fokus über `box-shadow` (wird als „kein Fokusring“ gemeldet; in diesem Lauf kein solcher Fall).

## 5. Nächste Schritte
1. **PR 3 (Messgenauigkeit):** Text-Range statt Elementrechteck, danach Baseline erneut auswerten (Backlog 215).
2. **M2c (neuer Look):** die Befunde 1 bis 5 in den Tokens und Komponenten beheben (Rand von Bedienelementen, Platzhalter, Akzent auf Tönung, Hero-Scrim), `UMFANG = "voll"`, danach `AUDIT_MODE = "enforce"`.
3. **M3:** AC-27 verbindlich bestanden (alle Seiten, alle Rollen) vor dem Start von M3.
