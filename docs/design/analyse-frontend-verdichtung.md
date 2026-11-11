# Frontend-Analyse M1, Verdichtung (X, Y1, Y2, Admin)

## Kurzfassung (für den Nutzer)

Dieses Dokument verdichtet die vier Analysen (Gruppe X, Y1, Y2, Admin) zu Querschnitts-Clustern, den 30 wichtigsten Einzelfunden, einer Seitenliste und den offenen Produktfragen. Es enthält keine neuen Funde: Alle Zahlen und Fund-IDs stammen aus den Quell-Dokumenten und sind per Skript aus ihnen gezählt (Summenbeleg unten). Nur gelesen, kein Quelltext geändert.

**Summe über alle Gruppen: 983 eindeutige Funde, 4 P0, 512 P1, 466 P2, 1 P3** (X 3/156/200, Y1 0/254/114, Y2 0/33/75/1, Admin 1/69/77; Rohzählung der Quellen, viele Wiederholungen je Rolle und Gerät).

**Cluster (17, überlappend; ein Fund kann in mehreren stehen):** 8 mit Schwere hoch, 8 mittel, 1 niedrig. Die größten: Navigation und Orientierung (192), Leer-, Fehler- und Endzustände ohne nächste Handlung (153), Formulare, Rückfragen und Bestätigungen (143), Altmodell, Guthaben, Aufladen (103), Unklare Begriffe und Texte (96). 248 Funde passen in keinen der 17 Cluster (Einzelfälle, siehe Anhang).

**Die drei größten Hebel (je eine zentrale Lösung):**
1. **Altmodell entfernen** (Cluster K07, 103 Funde, MUSS WEG laut Quellen: X 128 Fundstellen, Y1 90, Y2 28 Zeilen davon 25 echte, Admin eigene Liste): ein Aufräumplan nach Vertrag 012 M6 statt Seite-für-Seite-Texte.
2. **Ein Zustands- und Statusmuster** (K08 Leer-/Fehlerzustände 153, K10 Ampel 24, K09 Orange 38): `StateMessage` und `StatusBadge` mit Symbol, Wort und Farbe, Status-Tokens getrennt vom Akzent.
3. **Eine Navigation und ein Seitenkopf** (K11 192, K06 Falz 58): `AppNav` für beide Geräte und `PageHeader` mit genau einer Hauptaktion.

**Entschieden (keine Frage mehr):** Admin-Rollenmodell nach Vertrag 009 (`owner`/`admin`, Teilrollen entfallen); Ausbau von `/halle` nach Vertrag 011. **Offen:** Ligen, Profitag und Stadt-Challenge behalten? Admin am Handy. Dazu fünf weitere aus den Quellen (Abschnitt Produktfragen).

**Degradiert: ja.** Grund: (a) Die Cluster-Zuordnung ist eine Schlüsselwort-Zuordnung auf dem Fundtext (Regeln im Anhang), kein Lesen jedes einzelnen Fundes; die ID-Listen machen jede Zuordnung prüfbar, einzelne Fehlzuordnungen und Funde ohne Cluster sind möglich. (b) Die Seitenzuordnung folgt der Seitenspalte bzw. der Abschnittsüberschrift der Quelle; ein Fund mit mehreren Seiten zählt unter der zuerst genannten, 121 Funde sind seitenübergreifend. (c) Die Lösungsvorschläge und Empfehlungen sind Vorschläge des Verfassers zur Entscheidung im Vertrag 013, keine Ergebnisse der Analysen. (d) Der Cluster Kontrast (K01) ist mit nur 21 Funden „niedrig“, weil Kontraste in den Quellen nur nach Augenmaß geprüft wurden, nicht weil das Thema unwichtig wäre; ein gemessener Kontrastlauf kann die Zahl erhöhen. (e) Alle Einschränkungen der Quellen gelten weiter (kein Launcher-Befehl für die fünf Impeccable-Befehle, Kontraste nach Augenmaß, `detect` nicht je Seite und Rolle, Seed-Lücken).

## Summenbeleg (Skript-Zählung)

Die Zählung liest alle Fund-Zeilen der vier Quell-Dokumente (Tabellenzeilen und Aufzählungen der Form `ID | Prio | Text`), nimmt je ID die erste Nennung und zählt nach Priorität. Das Ergebnis stimmt in jeder Gruppe mit den in den Quellen genannten Summen überein (das Skript bricht sonst ab).

| Gruppe | Quelle (Branch, Stand) | P0 | P1 | P2 | P3 | Funde |
|---|---|---|---|---|---|---|
| X | `docs/analyse-frontend-x` (PR 90), `analyse-frontend-x.md` | 3 | 156 | 200 | 0 | 359 |
| Y1 | `docs/analyse-frontend-y1` (PR 94), Commit 00ffbc4 | 0 | 254 | 114 | 0 | 368 |
| Y2 | `docs/analyse-frontend-y2`, Commit 190f2bc | 0 | 33 | 75 | 1 | 109 |
| Admin | `docs/analyse-frontend-admin`, Commit 3ad339e | 1 | 69 | 77 | 0 | 147 |
| **Summe** | | **4** | **512** | **466** | **1** | **983** |

Die Quell-Zahlen (Kurzfassungen): X erste Runde 1/76/124, Nachlauf mit Seed +2/60/44, Zusatzabschnitt (Lobby offen, Spielsuche, Benachrichtigungen) +0/20/32 = 3/156/200; Y1 0/254/114; Y2 0/33/75 und 1 P3; Admin 1/69/77 (Fundverzeichnis im Blatt Teilrollen ist ein Index und zählt nicht doppelt). MUSS-WEG-Tabellenzeilen in den Quellen (Skript-Zählung): X 154, Y1 96, Y2 28, Admin 20, zusammen 298. Die Quellen nennen eigene Zahlen (X: 128 Fundstellen, Y1: 90, Y2: 28 Zeilen davon 25 echte); die Skript-Zählung zählt alle Tabellenzeilen unter Überschriften mit „MUSS WEG“ (auch Nachlauf, Zusatz und Verweiszeilen) und weicht deshalb ab. Maßgeblich bleiben die Tabellen der Quellen.

## 1. Querschnitts-Cluster

Je Cluster: Anzahl eindeutiger Funde (mit Aufteilung nach Priorität und Gruppe), betroffene Seiten (die zehn mit den meisten Funden, dazu die Gesamtzahl), Schwere (hoch: mindestens ein P0 oder mindestens 40 P1; mittel: mindestens 15 P1; sonst niedrig) und eine vorgeschlagene zentrale Lösung. Die vollständigen Fund-IDs je Cluster stehen im Anhang A.

| ID | Cluster | Funde | P0 / P1 / P2 | X / Y1 / Y2 / Admin | Schwere | Zentrale Lösung (eine) | Art |
|---|---|---|---|---|---|---|---|
| K01 | Kontrast und Lesbarkeit | **21** | 0 / 2 / 19 | 3 / 7 / 6 / 5 | niedrig | Farb-Tokens mit geprüften Text-auf-Fläche-Paaren (Text mindestens 4,5:1, Zeichen mindestens 3:1) in `DESIGN.md` und `globals.css`; Platzhalter- und Zusatztext bekommen ein eigenes Token; der Kontrasttest (`tests/unit/contrast.test.ts`) prüft jedes Paar. | Token |
| K02 | Touch-Ziele unter 44 px | **69** | 0 / 32 / 37 | 18 / 29 / 15 / 7 | mittel | Eine Basiskomponente `Button`/`LinkButton`/`IconButton` mit Mindestgröße 44 px als Standard (Variante „klein“ nur mit größerer Tippfläche); `ActionButton` und Kaderknöpfe nutzen sie; `tests/e2e/ui-regeln.spec.ts` misst Zielgrößen. | Komponente |
| K03 | Schrift unter 12 px | **33** | 0 / 20 / 13 | 3 / 20 / 3 / 7 | mittel | Eine Typo-Skala als Token mit 12 px als kleinster Stufe; `text-[Npx]` unter 12 px per Lint-Regel verboten; Kleinstufe nur für Zusatztext, nie für Bedienelemente. | Token |
| K04 | Fokus, Tastatur, Screenreader | **38** | 0 / 18 / 20 | 17 / 12 / 3 / 6 | mittel | Eine Fokus-Ring-Regel (`:focus-visible`-Token) in `globals.css`, ein Skip-Link im Layout und eine `PageTitle`-Komponente, die genau eine `h1` je Seite erzwingt; Status nie nur als `sr-only`. | Muster |
| K05 | Unklare Begriffe und Texte | **96** | 1 / 50 / 45 | 28 / 48 / 12 / 8 | hoch | Ein Begriffsverzeichnis (`docs/design/begriffe.md`) und alle sichtbaren Wörter nur über die i18n-Schlüssel; je Begriff eine Bedeutung (Lobby, Spiel, Bereit, Bezahlen, Entfernen, Abmelden). | Muster |
| K06 | Hauptaktion unter dem Falz oder weit unten | **58** | 0 / 43 / 15 | 23 / 30 / 1 / 4 | hoch | Ein Muster „Hauptaktion zuerst“: `PageHeader` mit genau einer Hauptaktion (Handy: feste Aktionsleiste unten, Desktop: Seitenkopf rechts) und ein Block „Dein Stand“ ganz oben auf Lobby, Spiel und Turnier. | Muster |
| K07 | Altmodell, Guthaben, Aufladen | **103** | 0 / 74 / 29 | 37 / 43 / 2 / 21 | hoch | Altmodell entfernen statt ändern: Guthaben-Link im Header, Guthaben im Konto-Menü, `/app/guthaben`, Codes und alle Guthaben-Texte in einem Aufräum-Plan nach Vertrag 012 M6; Lobby nur noch im Kartenmodell; Texte nur über i18n. | Aufräumplan |
| K08 | Leer-, Fehler- und Endzustände ohne nächste Handlung | **153** | 1 / 84 / 68 | 54 / 56 / 25 / 18 | hoch | Eine Komponente `StateMessage` für Leer-, Fehler- und Endzustände (Titel, Grund in einem Satz, genau eine nächste Handlung als Knopf) und gestaltete `not-found`/`error`-Seiten mit Weg zurück; Overlay liefert für nicht öffentliche Spiele eine leere transparente Antwort. | Komponente |
| K09 | Orange als Text, Status oder Warnfarbe | **38** | 0 / 28 / 10 | 2 / 33 / 0 / 3 | mittel | Tokens trennen: `--accent` (Orange) nur für Marke und Hauptaktion, eigene Status-Tokens (`--ok`, `--warn`, `--danger`, `--info`); Orange nie als Fließtext, Statuswort oder Warnfarbe. | Token |
| K10 | Ampel und Status nur durch Farbe | **24** | 0 / 17 / 7 | 3 / 21 / 0 / 0 | mittel | Eine Komponente `StatusBadge` mit Symbol, Wort und Farbe (Form und Wort, nie nur Farbe); die Legende „In der Lobby / Bereit / Bestätigt“ entfällt; Dritte sehen die neutrale Variante (012 AC-12). | Komponente |
| K11 | Navigation und Orientierung | **192** | 0 / 93 / 99 | 88 / 53 / 28 / 23 | hoch | Eine Informationsarchitektur für beide Geräte: eine `AppNav` (Handy unten, Desktop oben mit denselben Zielen, aktiver Eintrag per `aria-current`), Fußzeile nur für Rechtliches, Rollenbereiche (Hallenbetreiber, Admin) im Konto-Menü. | Muster |
| K12 | Sichtbarkeit und Datenschutz | **34** | 0 / 20 / 14 | 17 / 14 / 3 / 0 | mittel | Eine Sichtbarkeitsmatrix (Rolle × Datenfeld) in Vertrag 007/012 und ein serverseitiger Helfer `canSee(feld, betrachter)`; Anzeige-Komponenten bekommen nur freigegebene Daten (Zahlstatus Dritter bleibt neutral, 012 AC-12/AC-20). | Regel + Helfer |
| K13 | Desktop-Breite und Layout | **35** | 0 / 16 / 19 | 9 / 23 / 2 / 1 | mittel | Ein `PageShell` mit drei Breiten (schmal 720, Standard 1040, voll 1280) und einem zweispaltigen Muster (Inhalt + Seitenleiste) für Detailseiten auf dem Desktop. | Komponente |
| K14 | Rollen, Rechte und Berechtigungsanzeige | **88** | 0 / 60 / 28 | 47 / 13 / 10 / 18 | hoch | Zentrale Guards (`requireRole`) mit einer gestalteten Sperrseite („Dafür brauchst du die Rolle X, so bekommst du sie“) statt stiller Umleitung; die Rolle steht im Konto-Menü (Admin-Rollen nach Vertrag 009). | Muster |
| K15 | Formulare, Rückfragen und Bestätigungen | **143** | 1 / 83 / 59 | 53 / 44 / 9 / 37 | hoch | Ein `Form`-Muster (Feldgruppen, Fehler am Feld, Pflichtmarke, eine Speichern-Handlung je Formular), ein `ConfirmDialog` für unumkehrbare Aktionen und eine `DateTimeField`-Komponente, die nicht abgeschnitten wird. | Komponente |
| K16 | Entwickler-, Platzhalter- und Rechtstexte sichtbar | **32** | 1 / 15 / 16 | 9 / 15 / 1 / 7 | hoch | Ein Build-/Testschutz, der Platzhalter (`OPERATOR_*`), Entwurfskästen und Dev-Texte in Produktion verbietet; Betreiberangaben als Pflichtfelder vor Go-live (siehe `docs/loop/FEHLT-NOCH.md`). | Test |
| K17 | Zahlen, Zähler und Formate widersprüchlich | **30** | 0 / 19 / 11 | 8 / 15 / 5 / 2 | mittel | Zentrale Formatierer in `src/lib/format.ts` (Datum auf Deutsch, Plural, Euro) und je Seite eine Quelle für Zähler (serverseitig berechnet, einmal angezeigt). | Helfer |

### Betroffene Seiten je Cluster

- **K01 Kontrast und Lesbarkeit** (21 Funde auf 12 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (4), /lobby/[id] (3), /overlay/[id] (3), / (2), /spiele/[id] (2), /spieler (1), /spieler/[id] (1), /hallen/[id] (1), /admin/spiele (1), /admin/finanzen/ausgaben (1), …
- **K02 Touch-Ziele unter 44 px** (69 Funde auf 26 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (20), /lobby/[id] (7), /turniere/[id] (5), /rangliste (5), /app (3), /spiele/[id] (3), /teams/[slug] (3), /hallen/[id] (3), /app/privatspiel/neu (2), /ligen (2), …
- **K03 Schrift unter 12 px** (33 Funde auf 18 Seiten bzw. Seitengruppen): /turniere/[id] (7), /lobby/[id] (4), alle Seiten (seitenübergreifend) (4), /turniere (3), / (2), /app/einstellungen (1), /teams/[slug] (1), /app/turniere/neu (1), /app/privatspiel/neu (1), /hallen/[id] (1), …
- **K04 Fokus, Tastatur, Screenreader** (38 Funde auf 13 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (16), /spiele/[id] (7), /willkommen (2), /app/benachrichtigungen (2), /lobby/[id] (2), /overlay/[id] (2), /app/einstellungen (1), /app/suche/neu (1), /lobby/offen/[id] (1), /hallen/[id] (1), …
- **K05 Unklare Begriffe und Texte** (96 Funde auf 30 Seiten bzw. Seitengruppen): /lobby/[id] (21), /teams/[slug] (11), alle Seiten (seitenübergreifend) (10), /turniere/[id] (9), /app (6), /matchmaking (4), /suche (3), /halle (3), /admin/finanzen (3), /app/guthaben (2), …
- **K06 Hauptaktion unter dem Falz oder weit unten** (58 Funde auf 14 Seiten bzw. Seitengruppen): /lobby/[id] (15), /turniere/[id] (8), /matchmaking (7), alle Seiten (seitenübergreifend) (6), / (5), /app (5), /spieler/[id] (3), /teams/[slug] (3), /hilfe (1), /suche (1), …
- **K07 Altmodell, Guthaben, Aufladen** (103 Funde auf 24 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (25), /lobby/[id] (18), /turniere/[id] (10), /app/guthaben (6), /app/privatspiel/neu (6), /admin/finanzen (5), /app (4), /hilfe (3), / (2), /agb (2), …
- **K08 Leer-, Fehler- und Endzustände ohne nächste Handlung** (153 Funde auf 48 Seiten bzw. Seitengruppen): /lobby/[id] (16), /spiel/[token] (9), alle Seiten (seitenübergreifend) (8), /app (7), /spiele/[id] (7), /einladung/[token] (6), /app/benachrichtigungen (6), /halle (6), /lobby/offen/[id] (5), /spieler/[id] (5), …
- **K09 Orange als Text, Status oder Warnfarbe** (38 Funde auf 10 Seiten bzw. Seitengruppen): /turniere/[id] (13), /lobby/[id] (12), /spiele/[id] (4), alle Seiten (seitenübergreifend) (2), /teams/[slug] (2), /app (1), /spieler/[id] (1), /admin/finanzen (1), /admin/spiele (1), /admin/hallen (1)
- **K10 Ampel und Status nur durch Farbe** (24 Funde auf 6 Seiten bzw. Seitengruppen): /turniere/[id] (10), /lobby/[id] (10), / (1), /app (1), alle Seiten (seitenübergreifend) (1), /lobby/[id]/uebersicht (1)
- **K11 Navigation und Orientierung** (192 Funde auf 44 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (81), /lobby/[id] (12), /app (9), / (9), /willkommen (6), /einladung/[token] (6), /halle (6), /anmelden (4), /app/benachrichtigungen (4), /spieler/[id] (4), …
- **K12 Sichtbarkeit und Datenschutz** (34 Funde auf 17 Seiten bzw. Seitengruppen): /datenschutz (6), alle Seiten (seitenübergreifend) (6), /lobby/[id] (6), /willkommen (2), /teams/[slug] (2), /agb (1), /anmelden (1), /spieler (1), / (1), /app (1), …
- **K13 Desktop-Breite und Layout** (35 Funde auf 14 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (13), /lobby/[id] (5), /turniere (3), /spiele/[id] (2), /spiel/[token] (2), /spieler/[id] (2), /hilfe (1), /app/einstellungen (1), /spiele (1), /app/privatspiel/neu (1), …
- **K14 Rollen, Rechte und Berechtigungsanzeige** (88 Funde auf 32 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (17), /admin/nutzer (9), /einladung/[token] (7), /app (6), /matchmaking (4), /spieler/[id] (4), /teams/[slug] (4), /halle (4), / (3), /app/einstellungen (3), …
- **K15 Formulare, Rückfragen und Bestätigungen** (143 Funde auf 40 Seiten bzw. Seitengruppen): alle Seiten (seitenübergreifend) (15), /matchmaking (14), /turniere/[id] (9), /lobby/[id] (9), /willkommen (7), /app/privatspiel/neu (7), /app/suche/neu (6), /app/einstellungen (5), /app/turniere/neu (5), /hallen/[id] (5), …
- **K16 Entwickler-, Platzhalter- und Rechtstexte sichtbar** (32 Funde auf 21 Seiten bzw. Seitengruppen): /lobby/[id] (4), /turniere/[id] (3), /app/teams/neu (3), /spieler (2), alle Seiten (seitenübergreifend) (2), /app/privatspiel/neu (2), /admin/hallen (2), /anmelden (1), /agb (1), /datenschutz (1), …
- **K17 Zahlen, Zähler und Formate widersprüchlich** (30 Funde auf 14 Seiten bzw. Seitengruppen): /lobby/[id] (6), /turniere/[id] (5), /ligen (3), / (2), /app/benachrichtigungen (2), /spiel/[token] (2), alle Seiten (seitenübergreifend) (2), /rangliste (2), /suche (1), /spieler (1), …

Anmerkung: Die Funde zu K07 (Altmodell) und zu den Rechtstexten (K16) laufen größtenteils in den Abschnitt MUSS WEG der Quellen; die Fundstellen dort sind genauer als die Cluster-Zuordnung.

## 2. Die 30 wichtigsten Einzelfunde

Auswahl: alle 4 P0 (X-01, N1-SP-1, N4-FZ-2, AD-HA-1) und 26 P1 mit Bedienungsfolge (Weg blockiert, Zustand unsichtbar, Handlung versteckt, Sperre unklar), mit Blick auf Vertrag 012/013. Die Auswahl ist ein Urteil des Verfassers. Quelle = Quell-Dokument und Zeilennummer des Fundes (`git show` auf den Branch der Gruppe). Datei:Zeile steht nur dort, wo der Fund eine Quelltext-Stelle nennt.

| Nr | ID | Prio | Seite | Rolle | Gerät | Folge | Datei:Zeile (laut Fund) | Quelle |
|---|---|---|---|---|---|---|---|---|
| 1 | X-01 | P0 | /spieler | alle | Handy | Handy: Suchfeld nach dem Absenden unlesbar; macht die Suche auf `/spieler` und `/teams` unbrauchbar. | im Fund nicht genannt | analyse-frontend-x.md Z. 88 |
| 2 | N1-SP-1 | P0 | /spieler | Gast / neuer Nutzer | Handy | Handy: derselbe Fehler nach dem Absenden (bestätigt X-01). | im Fund nicht genannt | analyse-frontend-x.md Z. 3230 |
| 3 | N4-FZ-2 | P0 | /app/benachrichtigungen | Captain Grün (Betroffener, Dritte) | Handy | Bei fehlgeschlagener Abbuchung kommt keine Benachrichtigung; der Betroffene erfährt es nur, wenn er die Lobby öffnet. | `charge.ts:101-103`, `charge-run.ts:151-153`, `charge.ts:170` | analyse-frontend-x.md Z. 6233 |
| 4 | AD-HA-1 | P0 | /admin/hallen | Admin | Desktop | Admin: „Betreiber zuweisen“ ist in allen Hallenkarten zerquetscht, der Weg ist praktisch nicht bedienbar. | im Fund nicht genannt | analyse-frontend-admin.md Z. 426 |
| 5 | Y1-XM-01 | P1 | /lobby/[id] | Sonderrollen (Captain Grün, Veranstalter, Neuling) | Handy | Fehlerzustand: der Betroffene sieht nur das Wort „Abbuchung fehlgeschlagen“, ohne Grund, Frist und Nachzahl-Weg (012 AC-20). | im Fund nicht genannt | analyse-frontend-y1.md Z. 408 |
| 6 | Y1-XM-06 | P1 | /lobby/[id] | Sonderrollen (Captain Grün, Veranstalter, Neuling) | Handy | „Zahlung ausstehend“ (neutral für Dritte, 012 AC-12/AC-20) kommt im Quelltext nicht vor; `PlayerLight` zeigt allen den Fehler. | `PlayerLight.tsx:49-63`, `page.tsx:348`, `lobby/[id]/page.tsx:348` | analyse-frontend-y1.md Z. 413 |
| 7 | N4-FZ-1 | P1 | /app | Captain Grün (Betroffener, Dritte) | Desktop | Der Fehlerzustand ist auf `/app` nirgends sichtbar (kein Banner, keine Ampel, kein Hinweis). | `mygame.ts:60` | analyse-frontend-x.md Z. 6232 |
| 8 | Y1-GM-07 | P1 | /lobby/[id] | Gast | Handy | Gast sieht den Zahlstatus namentlich genannter Spieler; widerspricht dem entschiedenen Sichtbarkeitsmodell (012 AC-12/AC-20). | im Fund nicht genannt | analyse-frontend-y1.md Z. 96 |
| 9 | Y1-CM-01 | P1 | /lobby/[id] | Captain | Handy | Captain-Handlungen liegen am Handy über etwa 2100 px verteilt; „Spiel bestätigen“ ist die letzte und wirkt aktiv. | im Fund nicht genannt | analyse-frontend-y1.md Z. 290 |
| 10 | Y1-CD-01 | P1 | /lobby/[id] | Captain | Desktop | Dasselbe am Desktop: keine Captain-Handlung im ersten Bildschirm, Spalte nur 720 von 1280 px breit. | im Fund nicht genannt | analyse-frontend-y1.md Z. 339 |
| 11 | Y1-SD-01 | P1 | /lobby/[id] | Spieler | Desktop | Kartenmodus: „Ich bin bereit“ liegt unter dem Falz (Altmodus: im ersten Bildschirm). | im Fund nicht genannt | analyse-frontend-y1.md Z. 236 |
| 12 | Y1-SD-02 | P1 | /lobby/[id] | Spieler | Desktop | In der bestätigten Lobby sieht der Spieler seinen eigenen Stand nicht (Punkte ohne Wort, kein „(du)“). | im Fund nicht genannt | analyse-frontend-y1.md Z. 237 |
| 13 | Y1-GM-21 | P1 | /turniere/[id] | Gast | Handy | Turnierseite zeigt „Anmelden und mitmachen“ in allen Phasen, auch bei laufendem und beendetem Turnier. | im Fund nicht genannt | analyse-frontend-y1.md Z. 110 |
| 14 | Y1-GD-26 | P1 | alle Seiten (seitenübergreifend) | Gast | Desktop | Die Navigation kennt kein „Turniere“ (Kopfleiste und Fußzeile); nur per Direktlink erreichbar. | `Header.tsx:26-35`, `Footer.tsx:10-23` | analyse-frontend-y1.md Z. 158 |
| 15 | Y1-XM-35 | P1 | /spiel/[token] | Sonderrollen (Captain Grün, Veranstalter, Neuling) | Handy | Alle Einladungslinks (gültig, abgelaufen, unbekannt) enden für den Neuling auf derselben „Willkommen“-Seite ohne Hinweis auf die Einladung. | `spiel/[token]/page.tsx:15` | analyse-frontend-y1.md Z. 450 |
| 16 | Y1-XM-38 | P1 | /willkommen | Sonderrollen (Captain Grün, Veranstalter, Neuling) | Handy | Neuling wird auf `/lobby/[id]` nicht zum Onboarding geführt. | im Fund nicht genannt | analyse-frontend-y1.md Z. 453 |
| 17 | Y1-GM-16 | P1 | /spiele/[id] | Gast | Handy | Spielseite ohne `h1`, Status „Verbinde…“ bei beendetem Spiel. | im Fund nicht genannt | analyse-frontend-y1.md Z. 105 |
| 18 | Y1-SM-29 | P1 | /turniere/[id] | Spieler | Handy | Turnier-Bezahlphase: der eigene Zahlstatus steht erst nach vier Teamlisten ganz unten. | im Fund nicht genannt | analyse-frontend-y1.md Z. 207 |
| 19 | Y2-H-01 | P1 | /halle | Hallenbetreiber | Handy und Desktop | `/halle` ist nur eine Anfragenliste; gegenüber Vertrag 011 fehlen Buchungen, Auszahlungen, Rechnungen, Sperrzeiten, Bewertungsantworten. | im Fund nicht genannt | analyse-frontend-y2.md Z. 178 |
| 20 | Y2-H-02 | P1 | /halle | Hallenbetreiber | Handy und Desktop | Ablehnen einer Anfrage ohne Pflicht-Begründung (011 AC-3). | im Fund nicht genannt | analyse-frontend-y2.md Z. 179 |
| 21 | Y2-S-01 | P1 | /halle | Spieler | Handy und Desktop | Spieler und Captain sehen die Betreiberseite `/halle` ohne Rollensperre. | im Fund nicht genannt | analyse-frontend-y2.md Z. 118 |
| 22 | SM-EL-1 | P1 | /einladung/[token] | Spieler | Handy | Einladungsseite erkennt ein bestehendes Mitglied nicht; der Klick endet still. | `teams.ts:123`, `actions.ts:93-102` | analyse-frontend-x.md Z. 1668 |
| 23 | Y2-O-01 | P1 | /overlay/[id] | Streamer | Handy und Desktop | Overlay: ein Privatspiel liefert die volle App-Fehlerseite statt einer leeren Einblendung; würde in OBS das Spielbild abdecken. | im Fund nicht genannt | analyse-frontend-y2.md Z. 207 |
| 24 | CD-ALL-3 | P1 | alle Seiten (seitenübergreifend) | Captain | Desktop | Am Desktop gibt es keinen Einstieg zu `/app/suche/neu` ohne `?gegner=`; der Einladungslink liegt nur auf der Teamseite. | `spiele/[id]/page.tsx:70`, `suche/neu/page.tsx:13` | analyse-frontend-x.md Z. 2668 |
| 25 | AD-ALL-2 | P1 | alle Seiten (seitenübergreifend) | Admin | Desktop | Rollenmodell passt nicht zu Vertrag 009/012 (nur `admin`, jeder Admin ändert sofort und ohne Rückfrage); entschieden: Vertrag 009. | im Fund nicht genannt | analyse-frontend-admin.md Z. 138 |
| 26 | AD-SP-1 | P1 | /admin/spiele | Admin | Desktop | Keine Admin-Aktion an Spielen (Absagen, Lobby schließen, Ergebnis korrigieren; 009 AC-8/9, 012 AC-21). | im Fund nicht genannt | analyse-frontend-admin.md Z. 189 |
| 27 | AR-BU-1 | P1 | /admin/buchungen | Admin | Teilrollen | Teilrolle Hallen-Buchung: fünfmal „Finanzen zu diesem Spiel“ endet per Klick still auf `/app` (Sackgasse). | im Fund nicht genannt | analyse-frontend-admin.md Z. 1108 |
| 28 | AR-ZU-1 | P1 | /admin/nutzer | Admin | Teilrollen | Fehlendes Recht führt still auf `/app` ohne Erklärung. | im Fund nicht genannt | analyse-frontend-admin.md Z. 1247 |
| 29 | X-06 | P1 | alle Seiten (seitenübergreifend) | alle | Handy | Untere Navigation am Handy: falscher aktiver Reiter, Gäste sehen die Reiter für Angemeldete. | im Fund nicht genannt | analyse-frontend-x.md Z. 93 |
| 30 | X-05 | P1 | / | alle | Desktop | Start, `/app` und `/app/guthaben` beschreiben das Altmodell (Guthaben aufladen) statt des Kartenmodells. | im Fund nicht genannt | analyse-frontend-x.md Z. 92 |

## 3. Seitenliste

Seite → Gruppe → Anzahl P0/P1/P2/P3 → „muss weg“. Die Seite folgt der Seitenspalte bzw. Abschnittsüberschrift der Quelle (ein Fund mit mehreren Seiten zählt unter der zuerst genannten; Seiten-Slugs der Y-Gruppen sind auf URL-Muster abgebildet). „muss weg“: **ja (ganze Seite)** nur dort, wo eine Quelle die ganze Seite nennt (`/app/guthaben`, `/dev/pay/[id]`, `/admin/codes`); **Produktfrage** für Ligen und Profitag samt Admin-Bereichen (Entscheid beim Nutzer); **teilweise** heißt: in den MUSS-WEG-Tabellen der Quellen stehen Textstellen dieser Seite; sonst **nein**. Die Summe der Spalte „Funde“ ist 983 und gleich der Gesamtsumme (geprüft).

| Seite | Gruppe | P0 | P1 | P2 | P3 | Funde | muss weg |
|---|---|---|---|---|---|---|---|
| /lobby/[id] | Y1 | 0 | 106 | 34 | 0 | 140 | teilweise (40 Textstellen) |
| alle Seiten (seitenübergreifend) | X, Y1, Y2, Admin | 0 | 58 | 63 | 0 | 121 | teilweise (42 Textstellen) |
| /turniere/[id] | Y1 | 0 | 46 | 8 | 0 | 54 | teilweise (25 Textstellen) |
| / | X | 0 | 20 | 13 | 0 | 33 | teilweise (15 Textstellen) |
| /app | X, Y1 | 0 | 16 | 17 | 0 | 33 | teilweise (11 Textstellen) |
| /matchmaking | X | 0 | 15 | 14 | 0 | 29 | teilweise (9 Textstellen) |
| /app/benachrichtigungen | X | 1 | 5 | 21 | 0 | 27 | teilweise (9 Textstellen) |
| /spiele/[id] | Y1 | 0 | 21 | 6 | 0 | 27 | teilweise (1 Textstellen) |
| /teams/[slug] | Y1 | 0 | 17 | 9 | 0 | 26 | nein |
| /einladung/[token] | X | 0 | 13 | 11 | 0 | 24 | teilweise (9 Textstellen) |
| /willkommen | X, Y1 | 0 | 10 | 11 | 0 | 21 | teilweise (2 Textstellen) |
| /suche | X | 0 | 8 | 10 | 0 | 18 | teilweise (7 Textstellen) |
| /halle | Y2, Admin | 0 | 11 | 6 | 0 | 17 | teilweise (5 Textstellen) |
| /spieler/[id] | Y1 | 0 | 8 | 9 | 0 | 17 | nein |
| /admin/nutzer | Admin | 0 | 9 | 7 | 0 | 16 | nein |
| /app/einstellungen | X | 0 | 5 | 9 | 0 | 14 | teilweise (5 Textstellen) |
| /lobby/offen/[id] | X | 0 | 7 | 7 | 0 | 14 | teilweise (2 Textstellen) |
| /mitspieler | X | 0 | 6 | 8 | 0 | 14 | teilweise (8 Textstellen) |
| /spiel/[token] | Y1 | 0 | 8 | 6 | 0 | 14 | teilweise (2 Textstellen) |
| /turniere | Y1 | 0 | 10 | 4 | 0 | 14 | teilweise (10 Textstellen) |
| /admin | Admin | 0 | 3 | 10 | 0 | 13 | nein |
| /hallen/[id] | Y2 | 0 | 2 | 11 | 0 | 13 | teilweise (1 Textstellen) |
| /overlay/[id] | Y2 | 0 | 3 | 9 | 1 | 13 | nein |
| /rangliste | Y2 | 0 | 2 | 11 | 0 | 13 | teilweise (1 Textstellen) |
| /spieler | X | 2 | 2 | 9 | 0 | 13 | teilweise (7 Textstellen) |
| /app/suche/neu | X | 0 | 5 | 7 | 0 | 12 | teilweise (5 Textstellen) |
| /suche/[id] | X | 0 | 6 | 6 | 0 | 12 | teilweise (2 Textstellen) |
| /app/privatspiel/neu | Y1 | 0 | 7 | 4 | 0 | 11 | teilweise (7 Textstellen) |
| /admin/hallen | Admin | 1 | 3 | 6 | 0 | 10 | teilweise (1 Textstellen) |
| /ligen | Y2 | 0 | 3 | 7 | 0 | 10 | Produktfrage (Entscheid beim Nutzer) |
| /teams | X | 0 | 3 | 7 | 0 | 10 | teilweise (7 Textstellen) |
| /app/turniere/neu | Y1 | 0 | 5 | 4 | 0 | 9 | teilweise (4 Textstellen) |
| /ligen/[id] | Y2 | 0 | 3 | 6 | 0 | 9 | Produktfrage (Entscheid beim Nutzer) |
| /admin/buchungen | Admin | 0 | 5 | 3 | 0 | 8 | teilweise (1 Textstellen) |
| /admin/moderation | Admin | 0 | 4 | 4 | 0 | 8 | nein |
| /hilfe | X | 0 | 4 | 4 | 0 | 8 | teilweise (14 Textstellen) |
| /admin/finanzen | Admin | 0 | 4 | 3 | 0 | 7 | teilweise (3 Textstellen) |
| /admin/ligen | Admin | 0 | 3 | 4 | 0 | 7 | Produktfrage (Entscheid beim Nutzer) |
| /admin/protokoll | Admin | 0 | 3 | 4 | 0 | 7 | teilweise (1 Textstellen) |
| /admin/spiele | Admin | 0 | 3 | 4 | 0 | 7 | nein |
| /admin/teams | Admin | 0 | 3 | 4 | 0 | 7 | nein |
| /profitag/[id] | Y2 | 0 | 4 | 3 | 0 | 7 | Produktfrage (Entscheid beim Nutzer) |
| /spiele | Y1 | 0 | 3 | 4 | 0 | 7 | nein |
| /admin/finanzen/ausgaben | Admin | 0 | 2 | 4 | 0 | 6 | teilweise (1 Textstellen) |
| /admin/profitag | Admin | 0 | 2 | 4 | 0 | 6 | Produktfrage (Entscheid beim Nutzer) |
| /admin/sponsoren | Admin | 0 | 3 | 3 | 0 | 6 | nein |
| /anmelden | X | 0 | 2 | 4 | 0 | 6 | teilweise (3 Textstellen) |
| /app/guthaben | X | 0 | 4 | 2 | 0 | 6 | ja (ganze Seite) |
| /datenschutz | X | 0 | 2 | 4 | 0 | 6 | teilweise (6 Textstellen) |
| /admin/einstellungen | Admin | 0 | 2 | 3 | 0 | 5 | teilweise (2 Textstellen) |
| /admin/finanzen/spiel/[id] | Admin | 0 | 3 | 2 | 0 | 5 | teilweise (2 Textstellen) |
| /dev/pay/[id] | Y2 | 0 | 0 | 5 | 0 | 5 | ja (ganze Seite) |
| /admin/codes | Admin | 0 | 1 | 3 | 0 | 4 | ja (ganze Seite) |
| /agb | X | 0 | 2 | 2 | 0 | 4 | teilweise (6 Textstellen) |
| /app/teams/neu | Y1 | 0 | 1 | 3 | 0 | 4 | nein |
| /kontakt | X | 0 | 2 | 2 | 0 | 4 | teilweise (6 Textstellen) |
| /offline | X | 0 | 1 | 3 | 0 | 4 | teilweise (5 Textstellen) |
| /profitag | Y2 | 0 | 0 | 4 | 0 | 4 | Produktfrage (Entscheid beim Nutzer) |
| /unter-16 | X | 0 | 0 | 4 | 0 | 4 | teilweise (5 Textstellen) |
| /hallen | Y2 | 0 | 0 | 3 | 0 | 3 | nein |
| /hausordnung | X | 0 | 1 | 2 | 0 | 3 | teilweise (6 Textstellen) |
| /lobby/[id]/uebersicht | Y1 | 0 | 1 | 2 | 0 | 3 | teilweise (2 Textstellen) |
| /impressum | X | 0 | 1 | 0 | 0 | 1 | teilweise (3 Textstellen) |
| **Summe (63 Zeilen)** | | **4** | **512** | **466** | **1** | **983** | |

Hinweis: Ein Teil der Zeilen sind Seitengruppen oder Abschnitte (zum Beispiel `alle Seiten (seitenübergreifend)`); einzelne Seiten erscheinen unter mehreren Schreibweisen der Quellen nur, wenn die Quelle sie so benennt.

## 4. Offene Produktfragen (ohne Duplikate)

**Entschieden, nicht mehr als Frage geführt:**
- Admin-Rollenmodell = Vertrag 009 (`owner` = Admin 1, `admin` = Admin 2; Teilrollen Moderation, Finanzen, Hallen-Buchung entfallen). Betrifft AD-ALL-2, AR-UE-1, AR-ZU-1, AR-GA-1, AR-KM-1 und die Rollenfunde der Gruppe Admin.
- Ausbau von `/halle` = Vertrag 011 (Buchungen, Auszahlungen, Rechnungen, Sperrzeiten, Bewertungsantworten, Begründung beim Ablehnen). Betrifft Y2-H-01 bis -07, Y2-S-01, Y2-C-01 und den Fußzeilenlink „Für Hallenbetreiber“ (Einstieg des Betreibers wird dort geregelt).
- Sichtbarkeit des Zahlstatus (neutral für Dritte): schon entschieden in 012 AC-12/AC-20 und Backlog 45; die Abweichungen im Code (Y1-GM-07, Y1-GM-08, Y1-SM-16, Y1-XM-06, N4-FZ-5) sind Funde, keine Frage.

| Nr | Frage | Quellen (Fund-IDs) | Empfehlung |
|---|---|---|---|
| 1 | **Ligen, Profitag und Stadt-Challenge behalten?** (offen) | Y2-G-01, Y2-C-04, Y2-S-03/04, Y2-H-20, Y2-G-13, Y2-C-06; Admin: AD-LI-1 und Profitag-Bereich | Nicht umbauen, bis entschieden ist: aus der Hauptnavigation und von der Startseite zurückstellen (nicht verlinken), Stadt-Challenge-Block auf `/rangliste` ausblenden; Entscheid nach dem Pilot-Test (013 AC-8) vor M6. Bleiben sie, brauchen sie einen eigenen Vertrag; entfallen sie, entfernt ein PR Seiten und Admin-Bereiche. |
| 2 | **Admin am Handy?** (offen) | Admin: AM-ALL-9 und Fundblatt Admin, Handy | Am Handy nur Aufgaben der Übersicht, Moderation, Nutzer sperren und Protokoll lesen; alle übrigen Bereiche Desktop-only mit Hinweis (so die Quelle selbst vorgeschlagen). Umsetzung in M7 (Admin zuletzt). |
| 3 | **Einheitliche Sichtbarkeit von Namen, Elo und Kader für Gäste und Fremde** | Y1-GM-08, Y1-GD-08, Y1-SM-15; X: ZA-SU-2 (Spielsuche zeigt Gästen den vollen Kader, die offene Lobby nur Zahlen, AC-5) | Eine Regel: Gäste und Fremde sehen Zahlen (wie AC-5), Namen, Elo und Position nur angemeldete Nutzer; in einer Sichtbarkeitsmatrix (Rolle × Datenfeld) festhalten (Cluster K12). |
| 4 | **Unter-16 und Minderjährige** | X: N1-OB-7 (Endseite sagt nicht, wann man wiederkommen kann; sofortige Neuanmeldung mit anderem Datum möglich), N1-OB-6 (Geburtsdatum unter 16 löscht das Konto sofort und unwiderruflich), N1-WK-4 | Vor dem Löschen eine Rückfrage; Endseite mit Hinweis; Regelung der Wiederanmeldung ist eine **Rechtsfrage (Anwalt, Jugendschutz/DSGVO)**: kein Agent entscheidet, ins GO-LIVE-AUDIT. |
| 5 | **Hallenbewertungen: Betreiber, Antworten, Moderation** | Y2-H-07, Y2-H-11, Y2-S-12; Y2-Hinweise zu Moderation und Formular | Betreiber bewertet die eigene Halle nicht und kann antworten (011 AC-6); Meldungen und Moderation bleiben beim Admin. |
| 6 | **Overlay für nicht öffentliche oder unbekannte Spiele und Anleitung für Streamer** | Y2-O-01, Y2-O-02, Y2-O-03 | Leere transparente Antwort statt App-Fehlerseite; die Overlay-URL mit kurzer Anleitung dort zeigen, wo der Veranstalter das Spiel verwaltet (heute nur im eingeklappten Bereich „Live-Stream eintragen“). |
| 7 | **Wann gilt ein Spiel als bestätigt?** (zwei Regeln auf einer Seite) | Y1-CD-03 („bestätigt, sobald in beiden Teams mindestens 4 bereit sind“ gegen „der Captain bestätigt zum Schluss“) | Maßgeblich ist die tatsächliche Regel im Code (Captain-Bestätigung, `home_final_at`/`away_final_at`); den Text daran anpassen und die Mindestzahl 4 gegen Vertrag 008 prüfen (Altmodell-Rest, MUSS WEG). Der Verfasser hat die Regel nicht im Code verifiziert. |

## 5. Grenzen und Ehrlichkeit

- Die Zahlen (983 Funde, Prioritäten, Gruppen, Cluster, Seiten) kommen aus der Skript-Zählung über die vier Quell-Dokumente; die Cluster sind Schlüsselwort-Zuordnungen (Anhang B) und können einzelne Funde falsch oder gar nicht zuordnen (248 Funde ohne Cluster).
- Nicht eingeflossen: Texte der Quellen außerhalb der Fund-Zeilen (Bewertungen je Seite, Durchgangstabellen); Funde ohne ID-Zeile der Form `ID | Prio | …` wären nicht gezählt, die Gesamtsumme stimmt aber in jeder Gruppe mit der Quelle überein.
- Die vier Quell-Dokumente liegen in noch nicht gemergten Branches (X PR 90, Y1 PR 94, Y2 und Admin lokal); die Zeilenangaben der Spalte „Quelle“ beziehen sich auf diese Stände.
- Keine neuen Funde, keine Rückfrage an den Nutzer, kein Quelltext geändert.

## Anhang A: Fund-IDs je Cluster

### K01 Kontrast und Lesbarkeit (21)

X-16, X-19, CM-ST-1, Y1-GM-20, Y1-GM-32, Y1-GD-20, Y1-GD-34, Y1-SD-39, Y1-CD-60, Y1-XD-22, Y2-G-23, Y2-S-21, Y2-H-08, Y2-O-01, Y2-O-05, Y2-O-10, AD-ALL-5, AD-SP-5, AD-FA-3, AD-HA-4, AM-PR-2

### K02 Touch-Ziele unter 44 px (69)

X-07, GM-ST-4, GM-SU-4, GM-MM-4, GM-MS-4, SM-GL-3, SM-GL-4, SM-AP-2, SD-ALL-2, SD-ALL-6, CM-GL-5, CD-ALL-2, CD-ALL-5, N1-SP-5, N2-KM-1, N3-KM-1, ZA-LO-9, ZB-S1M-4, Y1-GM-33, Y1-GM-36, Y1-GD-34, Y1-SM-21, Y1-SM-30, Y1-SM-34, Y1-SM-38, Y1-SM-43, Y1-SM-46, Y1-SD-07, Y1-SD-24, Y1-SD-40, Y1-CM-04, Y1-CM-15, Y1-CM-20, Y1-CM-28, Y1-CM-37, Y1-CD-05, Y1-CD-36, Y1-CD-51, Y1-CD-58, Y1-CD-62, Y1-XM-10, Y1-XM-15, Y1-XM-20, Y1-XM-26, Y1-XM-33, Y1-XD-22, Y1-XD-42, Y2-G-06, Y2-G-11, Y2-G-20, Y2-S-09, Y2-S-12, Y2-C-05, Y2-C-10, Y2-C-12, Y2-C-13, Y2-C-14, Y2-H-11, Y2-H-13, Y2-H-14, Y2-H-23, Y2-O-11, AD-ALL-10, AM-ALL-1, AM-ALL-5, AM-NU-1, AM-TE-2, AM-CO-1, AM-PR-1

### K03 Schrift unter 12 px (33)

X-15, SD-ES-2, N1-ST-5, Y1-CD-02, Y1-CD-10, Y1-CD-33, Y1-CD-34, Y1-CD-35, Y1-CD-47, Y1-XM-26, Y1-XD-04, Y1-XD-10, Y1-XD-14, Y1-XD-24, Y1-XD-27, Y1-XD-30, Y1-XD-36, Y1-XD-37, Y1-XD-38, Y1-XD-41, Y1-XD-42, Y1-XD-47, Y1-XD-50, Y2-H-08, Y2-H-12, Y2-H-14, AM-ALL-6, AM-SP-1, AM-NU-3, AM-LI-2, AM-PT-2, AM-MO-1, AM-HA-3

### K04 Fokus, Tastatur, Screenreader (38)

GD-ALL-2, GD-ALL-4, GD-ALL-6, SM-GL-1, SD-ALL-1, SD-ALL-2, SD-ALL-5, SD-ALL-7, CD-ALL-2, CD-ALL-4, N1-OB-2, N1-OB-3, N2-ES-2, N3-FS-2, ZA-LO-8, ZB-GRM-3, ZB-S1D-2, Y1-GM-16, Y1-GD-16, Y1-GD-38, Y1-SM-21, Y1-SD-16, Y1-SD-43, Y1-CM-38, Y1-CM-39, Y1-CD-30, Y1-CD-61, Y1-XD-16, Y1-XD-45, Y2-C-17, Y2-O-03, Y2-O-11, AD-ALL-1, AM-ALL-1, AM-ALL-7, AM-UE-2, AM-NU-3, AM-FA-2

### K05 Unklare Begriffe und Texte (96)

X-09, X-15, X-20, GM-SU-5, GM-MM-5, GM-MS-1, SM-GL-5, SM-AP-2, SM-GU-2, SM-MA-2, CM-GL-6, CD-AP-1, N1-ST-1, N1-SU-1, N1-SP-1, N1-MM-1, N1-WK-3, N2-SU-4, N2-MI-1, N2-AP-2, N2-BE-3, N3-AP-3, N3-FE-2, N3-FM-3, N4-FZ-6, ZA-LO-4, ZA-SU-14, ZA-SU-6, Y1-GM-04, Y1-GM-07, Y1-GM-12, Y1-GM-23, Y1-GM-29, Y1-GM-34, Y1-GD-04, Y1-GD-07, Y1-GD-12, Y1-GD-22, Y1-GD-23, Y1-GD-24, Y1-GD-29, Y1-GD-30, Y1-GD-32, Y1-SM-07, Y1-SM-08, Y1-SM-18, Y1-SM-28, Y1-SM-32, Y1-SM-38, Y1-SM-39, Y1-SD-03, Y1-SD-08, Y1-SD-26, Y1-SD-33, Y1-SD-34, Y1-SD-39, Y1-CM-02, Y1-CM-07, Y1-CM-19, Y1-CM-22, Y1-CD-03, Y1-CD-22, Y1-CD-31, Y1-CD-48, Y1-CD-49, Y1-XM-02, Y1-XM-03, Y1-XM-18, Y1-XM-27, Y1-XM-41, Y1-XD-02, Y1-XD-04, Y1-XD-21, Y1-XD-24, Y1-XD-31, Y1-XD-48, Y2-G-04, Y2-G-08, Y2-G-15, Y2-G-21, Y2-S-04, Y2-S-05, Y2-S-09, Y2-S-11, Y2-C-08, Y2-C-25, Y2-H-06, Y2-O-05, AD-ALL-8, AD-NU-6, AD-FI-3, AD-FI-5, AD-FA-4, AM-LI-3, AM-FI-2, AM-CO-1

### K06 Hauptaktion unter dem Falz oder weit unten (58)

X-03, X-07, GM-MM-1, GM-MM-2, GD-ALL-3, GD-ST-2, GD-ST-3, GD-HI-1, GD-MM-1, SM-GL-6, SD-ALL-9, SD-ST-1, SD-AP-1, SD-AP-2, SD-AP-3, SD-AP-4, SD-MM-1, CM-MM-1, CD-AP-1, CD-MM-1, N1-ST-2, N1-SU-2, N1-MM-2, Y1-GD-03, Y1-GD-22, Y1-SM-29, Y1-SM-43, Y1-SD-01, Y1-SD-10, Y1-SD-20, Y1-SD-22, Y1-SD-31, Y1-SD-32, Y1-SD-36, Y1-CM-01, Y1-CM-10, Y1-CM-25, Y1-CD-01, Y1-CD-03, Y1-CD-08, Y1-CD-11, Y1-CD-24, Y1-CD-33, Y1-CD-35, Y1-CD-47, Y1-CD-55, Y1-XM-04, Y1-XM-23, Y1-XD-01, Y1-XD-02, Y1-XD-05, Y1-XD-06, Y1-XD-22, Y2-H-04, AM-ALL-1, AM-UE-1, AM-NU-4, AM-PR-2

### K07 Altmodell, Guthaben, Aufladen (103)

X-05, X-06, X-09, GM-ST-1, GM-HI-1, GM-HI-2, GM-AG-2, GM-AG-3, GM-DS-2, GM-HO-1, GM-KO-2, GD-HI-1, SM-GL-2, SM-GL-3, SM-HO-1, SM-KO-1, SM-AP-1, SM-ES-3, SM-GU-1, SM-GU-2, SD-ALL-1, SD-ALL-4, SD-ALL-8, SD-AP-2, SD-ES-3, SD-GU-1, SD-GU-2, CD-ALL-1, CD-ALL-4, CD-AP-1, N4-FZ-3, N4-FZ-4, N4-FZ-5, N4-FZ-10, ZA-LO-3, ZA-SU-16, ZB-S09M-1, Y1-GM-22, Y1-GD-22, Y1-GD-39, Y1-SM-05, Y1-SM-15, Y1-SM-28, Y1-SM-32, Y1-SM-34, Y1-SD-01, Y1-SD-03, Y1-SD-07, Y1-SD-09, Y1-SD-26, Y1-SD-27, Y1-SD-28, Y1-CM-02, Y1-CM-14, Y1-CM-27, Y1-CD-15, Y1-CD-20, Y1-CD-22, Y1-CD-25, Y1-CD-26, Y1-CD-35, Y1-CD-40, Y1-CD-43, Y1-CD-63, Y1-XM-02, Y1-XM-10, Y1-XM-19, Y1-XM-27, Y1-XM-33, Y1-XD-02, Y1-XD-05, Y1-XD-06, Y1-XD-07, Y1-XD-09, Y1-XD-20, Y1-XD-31, Y1-XD-38, Y1-XD-41, Y1-XD-45, Y1-XD-50, Y2-S-05, Y2-H-09, AD-ALL-6, AD-ALL-7, AD-ALL-11, AD-FI-1, AD-FI-2, AD-FI-3, AD-FS-2, AD-BU-1, AD-HA-2, AD-CO-1, AD-CO-3, AD-EI-1, AD-EI-4, AM-ALL-3, AM-FI-1, AM-FI-2, AM-FA-1, AM-FS-1, AM-BU-2, AM-HA-2, AR-HA-1

### K08 Leer-, Fehler- und Endzustände ohne nächste Handlung (153)

X-10, GM-ST-8, GM-U16-1, GM-SP-2, GM-MS-2, GM-EL-2, GM-EU-2, GD-MS-1, SM-AN-1, SM-SU-1, SM-AP-2, SM-AP-3, SM-BE-1, SM-EU-1, SD-AP-2, SD-AP-3, SD-ES-4, SD-EL-1, CM-SU-1, CM-AP-3, CM-SN-3, N1-SP-4, N1-MM-4, N1-MI-1, N1-EA-2, N1-MM-5, N1-OB-4, N1-OB-6, N1-OB-8, N1-OB-11, N2-SU-3, N2-ES-2, N2-SU-1, N2-BE-1, N3-ST-2, N3-TE-1, N3-MI-1, N3-AP-2, N3-BE-2, N4-FZ-2, N4-FZ-5, N4-FZ-6, N4-FZ-9, ZA-LO-2, ZA-LO-15, ZA-LO-11, ZA-LO-6, ZA-LO-7, ZA-SU-3, ZA-SU-8, ZA-SU-16, ZB-S1M-2, ZB-GRM-1, ZB-ROM-1, Y1-GM-05, Y1-GM-18, Y1-GM-25, Y1-GM-27, Y1-GM-34, Y1-GD-05, Y1-GD-18, Y1-GD-28, Y1-SM-01, Y1-SM-08, Y1-SM-13, Y1-SM-15, Y1-SM-20, Y1-SM-24, Y1-SM-34, Y1-SM-36, Y1-SM-37, Y1-SM-38, Y1-SM-42, Y1-SM-45, Y1-SD-01, Y1-SD-09, Y1-SD-16, Y1-SD-17, Y1-SD-29, Y1-SD-30, Y1-SD-34, Y1-SD-37, Y1-CM-09, Y1-CM-13, Y1-CM-15, Y1-CM-16, Y1-CM-31, Y1-CM-33, Y1-CM-34, Y1-CM-35, Y1-CD-12, Y1-CD-17, Y1-CD-29, Y1-CD-30, Y1-CD-32, Y1-CD-41, Y1-CD-44, Y1-CD-45, Y1-CD-53, Y1-CD-56, Y1-XM-01, Y1-XM-05, Y1-XM-12, Y1-XM-16, Y1-XM-34, Y1-XM-37, Y1-XD-02, Y1-XD-13, Y1-XD-19, Y1-XD-23, Y2-G-03, Y2-G-13, Y2-G-15, Y2-G-17, Y2-G-18, Y2-G-22, Y2-S-01, Y2-S-02, Y2-S-04, Y2-S-14, Y2-S-17, Y2-S-18, Y2-S-20, Y2-C-11, Y2-C-18, Y2-C-20, Y2-C-22, Y2-H-01, Y2-H-02, Y2-H-03, Y2-H-18, Y2-H-20, Y2-H-21, Y2-O-01, Y2-O-03, AD-ALL-5, AD-SP-4, AD-NU-1, AD-NU-6, AD-TE-2, AD-TE-4, AD-TE-5, AD-LI-3, AD-MO-1, AD-FS-2, AD-PR-5, AD-EI-3, AM-TE-2, AM-LI-3, AM-PT-3, AM-MO-2, AR-BU-1, AR-ZU-1

### K09 Orange als Text, Status oder Warnfarbe (38)

N2-AP-2, N4-FZ-8, Y1-GM-34, Y1-GD-10, Y1-GD-17, Y1-GD-39, Y1-SM-09, Y1-SM-12, Y1-SM-22, Y1-SM-23, Y1-SM-30, Y1-SD-20, Y1-SD-22, Y1-SD-23, Y1-SD-41, Y1-SD-46, Y1-CM-17, Y1-CM-25, Y1-CM-26, Y1-CM-28, Y1-CM-33, Y1-CD-02, Y1-CD-33, Y1-CD-37, Y1-CD-47, Y1-CD-59, Y1-CD-63, Y1-XM-09, Y1-XM-25, Y1-XD-09, Y1-XD-10, Y1-XD-16, Y1-XD-28, Y1-XD-30, Y1-XD-34, AD-FI-3, AM-SP-2, AM-HA-2

### K10 Ampel und Status nur durch Farbe (24)

N1-ST-3, N4-FZ-1, N4-FZ-6, Y1-GM-24, Y1-GD-24, Y1-GD-39, Y1-SM-09, Y1-SM-10, Y1-SM-30, Y1-SD-02, Y1-SD-23, Y1-SD-46, Y1-CM-14, Y1-CM-28, Y1-CD-14, Y1-CD-15, Y1-CD-37, Y1-CD-63, Y1-XM-07, Y1-XM-12, Y1-XM-25, Y1-XM-29, Y1-XD-28, Y1-XD-34

### K11 Navigation und Orientierung (192)

X-04, X-06, X-07, X-12, X-17, GM-ST-2, GM-ST-3, GM-ST-4, GM-ST-5, GM-ST-6, GM-ST-7, GM-HI-2, GM-KO-1, GM-U16-1, GM-AN-1, GM-AN-3, GM-WI-1, GM-OF-2, GM-MS-3, GM-EL-1, GM-EL-3, GM-EL-4, GM-EU-2, GD-ALL-1, GD-ALL-2, GD-ALL-3, GD-ALL-4, GD-ALL-5, GD-ALL-6, GD-AN-1, GD-MM-1, SM-GL-1, SM-GL-2, SM-GL-3, SM-GL-4, SM-GL-6, SM-ST-1, SM-SP-1, SM-OF-1, SM-MI-3, SD-ALL-1, SD-ALL-2, SD-ALL-3, SD-ALL-4, SD-ALL-5, SD-ALL-6, SD-ALL-7, SD-ALL-8, SD-ALL-9, SD-ST-1, SD-U1-1, SD-AP-1, CM-GL-1, CM-GL-2, CM-GL-3, CM-GL-4, CM-GL-5, CM-ST-1, CM-TE-1, CM-SN-1, CM-MM-1, CM-MM-5, CD-ALL-1, CD-ALL-2, CD-ALL-3, CD-ALL-4, CD-ALL-5, N1-SU-2, N1-EG-3, N1-WK-1, N1-OB-9, N1-OB-12, N2-EA-1, N2-AP-3, N2-KM-1, N3-BE-1, N3-KM-1, N3-KM-2, N3-AP-4, N4-FZ-3, N4-FZ-10, ZA-LO-10, ZA-LO-11, ZA-SU-4, ZA-SU-8, ZB-GRM-2, ZB-ROM-3, ZB-S1D-2, Y1-GM-28, Y1-GM-31, Y1-GM-33, Y1-GM-34, Y1-GM-36, Y1-GD-01, Y1-GD-14, Y1-GD-26, Y1-GD-33, Y1-GD-34, Y1-GD-35, Y1-GD-37, Y1-SM-10, Y1-SM-30, Y1-SM-43, Y1-SM-46, Y1-SM-47, Y1-SD-03, Y1-SD-11, Y1-SD-12, Y1-SD-27, Y1-SD-30, Y1-SD-40, Y1-SD-45, Y1-CM-12, Y1-CM-33, Y1-CM-34, Y1-CM-35, Y1-CM-36, Y1-CM-37, Y1-CD-17, Y1-CD-24, Y1-CD-25, Y1-CD-26, Y1-CD-42, Y1-CD-56, Y1-CD-58, Y1-CD-62, Y1-XM-09, Y1-XM-19, Y1-XM-20, Y1-XM-38, Y1-XM-40, Y1-XD-06, Y1-XD-16, Y1-XD-20, Y1-XD-21, Y1-XD-22, Y1-XD-25, Y1-XD-33, Y1-XD-42, Y1-XD-45, Y1-XD-50, Y2-G-01, Y2-G-02, Y2-G-12, Y2-G-14, Y2-G-20, Y2-G-21, Y2-G-22, Y2-S-01, Y2-S-02, Y2-S-05, Y2-S-06, Y2-S-07, Y2-S-10, Y2-S-13, Y2-S-18, Y2-S-19, Y2-S-22, Y2-C-01, Y2-C-04, Y2-C-23, Y2-C-24, Y2-C-25, Y2-H-04, Y2-H-09, Y2-H-10, Y2-H-18, Y2-O-01, Y2-O-12, AD-ALL-1, AD-ALL-6, AD-ALL-10, AD-ALL-11, AD-ALL-12, AD-NU-6, AD-SN-1, AD-FS-4, AD-BU-4, AD-CO-3, AD-PR-5, AM-ALL-1, AM-ALL-2, AM-ALL-3, AM-SP-2, AM-HA-2, AR-UE-1, AR-KM-2, AR-HA-2, AR-HA-4, AR-KM-1, AR-HA-1, AR-HA-3

### K12 Sichtbarkeit und Datenschutz (34)

GM-AG-1, GM-DS-1, GM-DS-2, GM-DS-3, GM-DS-4, GM-AN-2, GM-SP-2, GD-ALL-5, GD-ALL-7, GD-DS-1, SD-ALL-8, CM-DS-1, N1-ST-4, N1-WK-2, N2-AP-3, N4-FZ-6, ZA-LO-1, Y1-GM-07, Y1-GM-08, Y1-GD-07, Y1-GD-08, Y1-SM-40, Y1-SD-34, Y1-CM-16, Y1-CM-27, Y1-XM-06, Y1-XM-20, Y1-XM-36, Y1-XM-39, Y1-XD-03, Y1-XD-46, Y2-G-04, Y2-C-22, Y2-O-09

### K13 Desktop-Breite und Layout (35)

X-17, GD-ALL-1, GD-ALL-3, GD-ALL-5, GD-ALL-7, GD-ALL-8, SD-ALL-9, SD-HI-1, SD-ES-4, Y1-GD-20, Y1-GD-35, Y1-GD-36, Y1-SD-02, Y1-SD-14, Y1-SD-17, Y1-SD-27, Y1-SD-30, Y1-SD-36, Y1-CD-01, Y1-CD-12, Y1-CD-14, Y1-CD-25, Y1-CD-32, Y1-CD-42, Y1-CD-45, Y1-CD-46, Y1-CD-55, Y1-XD-06, Y1-XD-20, Y1-XD-24, Y1-XD-45, Y1-XD-50, Y2-G-07, Y2-G-14, AD-ALL-4

### K14 Rollen, Rechte und Berechtigungsanzeige (88)

X-04, GM-HO-1, GM-MM-2, GM-EU-1, GD-ALL-5, GD-ALL-8, GD-ST-1, SM-GL-3, SM-GL-5, SM-GL-6, SM-ST-2, SM-HI-1, SM-SU-1, SM-TE-1, SM-SN-1, SM-ES-1, SM-MA-1, SM-MI-2, SM-MI-3, SD-ALL-4, SD-HI-1, SD-TE-1, SD-AP-1, SD-AP-4, SD-MM-1, SD-EL-1, CM-GL-1, CM-GL-2, CM-GL-6, CM-DS-1, CM-OF-1, CM-AP-1, N1-EA-1, N1-OB-12, N2-MM-1, N2-EA-1, N2-A17-1, N2-BE-1, N3-ST-1, N3-EG-1, N3-EA-1, N3-AP-3, N3-FE-1, N3-FE-2, ZA-SU-1, ZA-SU-5, ZA-SU-8, Y1-SM-03, Y1-SM-24, Y1-SM-43, Y1-SD-36, Y1-CM-18, Y1-CM-19, Y1-CM-32, Y1-CD-33, Y1-CD-41, Y1-CD-46, Y1-CD-48, Y1-CD-54, Y1-XM-13, Y2-G-03, Y2-S-01, Y2-S-03, Y2-S-04, Y2-C-01, Y2-C-04, Y2-C-20, Y2-H-03, Y2-H-07, Y2-H-20, AD-ALL-2, AD-ALL-3, AD-NU-1, AD-NU-2, AD-NU-3, AD-NU-5, AM-ALL-6, AM-ALL-7, AM-ALL-9, AM-NU-1, AM-NU-3, AM-NU-4, AR-MO-1, AR-BU-2, AR-ZU-1, AR-ZU-2, AR-GA-2, AR-KM-1

### K15 Formulare, Rückfragen und Bestätigungen (143)

X-01, X-07, X-08, X-09, X-10, GM-KO-3, GM-MM-4, GM-MM-5, GM-MM-7, GM-MS-3, GD-MS-1, SM-SN-1, SM-MA-1, SD-ES-3, SD-ES-4, SD-GU-1, SD-GU-2, CM-GL-2, CM-SN-2, CM-MM-1, CM-MM-2, CM-MM-3, CM-MM-4, CM-MM-5, CM-MI-1, CD-ALL-3, CD-ALL-4, CD-MM-1, N1-MM-3, N1-EI-1, N1-OB-1, N1-OB-4, N1-OB-5, N1-OB-6, N1-OB-8, N2-MI-1, N2-ES-3, N2-ES-2, N3-FS-1, N3-FS-4, N3-FS-3, N3-AP-5, N3-FM-2, N3-FM-1, N3-FM-3, N3-AP-4, ZA-LO-9, ZA-LO-10, ZA-LO-11, ZA-SU-7, ZA-SU-9, ZA-SU-8, ZB-S1M-8, Y1-GM-15, Y1-GD-15, Y1-GD-37, Y1-SM-30, Y1-SM-33, Y1-SM-34, Y1-SM-35, Y1-SM-38, Y1-SM-41, Y1-SM-44, Y1-SD-21, Y1-SD-27, Y1-SD-28, Y1-CM-05, Y1-CM-08, Y1-CM-10, Y1-CM-11, Y1-CM-13, Y1-CM-25, Y1-CM-27, Y1-CD-11, Y1-CD-12, Y1-CD-17, Y1-CD-34, Y1-CD-35, Y1-CD-42, Y1-CD-43, Y1-XM-19, Y1-XM-24, Y1-XM-26, Y1-XM-31, Y1-XM-32, Y1-XM-33, Y1-XM-36, Y1-XM-38, Y1-XM-39, Y1-XD-02, Y1-XD-34, Y1-XD-39, Y1-XD-40, Y1-XD-42, Y1-XD-45, Y1-XD-47, Y1-XD-50, Y2-G-04, Y2-G-09, Y2-S-12, Y2-S-14, Y2-C-02, Y2-C-16, Y2-H-02, Y2-H-07, Y2-H-11, AD-ALL-3, AD-NU-1, AD-NU-2, AD-LI-1, AD-LI-4, AD-PT-3, AD-SN-2, AD-MO-2, AD-BU-2, AD-BU-4, AD-HA-3, AD-HA-4, AD-CO-2, AD-PR-1, AD-EI-3, AM-ALL-8, AM-ALL-9, AM-ALL-10, AM-NU-2, AM-NU-3, AM-TE-1, AM-LI-1, AM-LI-2, AM-PT-1, AM-PT-2, AM-PT-3, AM-SN-1, AM-SN-2, AM-MO-1, AM-FA-1, AM-FA-2, AM-FS-1, AM-BU-1, AM-BU-2, AM-HA-3, AR-BU-2, AR-HA-3

### K16 Entwickler-, Platzhalter- und Rechtstexte sichtbar (32)

X-01, X-12, X-16, GM-AG-1, GM-DS-1, GM-IM-1, GM-KO-1, CM-SN-2, CM-MM-3, Y1-GM-15, Y1-GD-15, Y1-SM-11, Y1-SM-27, Y1-SM-42, Y1-SD-28, Y1-SD-35, Y1-SD-44, Y1-CM-12, Y1-CD-16, Y1-CD-53, Y1-XM-24, Y1-XM-33, Y1-XD-36, Y1-XD-40, Y2-G-04, AD-SP-5, AD-NU-6, AD-HA-4, AM-TE-1, AM-HA-4, AM-PR-2, AR-GA-2

### K17 Zahlen, Zähler und Formate widersprüchlich (30)

N1-ST-1, N1-SU-1, N1-SP-4, N1-OB-5, N2-AP-5, ZA-LO-9, ZB-S1M-2, ZB-GRM-3, Y1-GM-23, Y1-GM-26, Y1-GD-22, Y1-GD-23, Y1-GD-27, Y1-GD-32, Y1-SD-26, Y1-CM-02, Y1-CM-03, Y1-CM-35, Y1-CD-04, Y1-CD-20, Y1-XM-08, Y1-XD-04, Y1-XD-31, Y2-G-08, Y2-G-10, Y2-S-09, Y2-S-20, Y2-H-16, AD-ALL-7, AD-FI-3

### Ohne Cluster (248)

X-02, X-11, X-13, X-14, X-18, GM-ST-9, GM-HI-3, GM-HI-4, GM-WI-2, GM-SU-1, GM-SU-2, GM-SU-3, GM-SU-6, GM-SP-1, GM-TE-1, GM-TE-2, GM-OF-1, GM-MM-3, GM-MM-6, GM-EL-5, GD-HO-1, GD-U1-1, GD-SU-1, GD-MM-2, SM-U1-1, SM-AP-4, SM-ES-2, SM-MI-1, SM-EL-1, SM-EL-2, SD-AP-5, SD-SN-1, SD-ES-1, CM-HI-1, CM-SP-1, CM-AP-2, CM-MI-2, CM-EL-1, CM-EU-1, CD-SN-1, CD-ES-1, N1-ST-6, N1-SU-3, N1-SU-4, N1-SP-2, N1-SP-3, N1-TE-1, N1-TE-2, N1-TE-3, N1-MI-2, N1-EG-1, N1-EG-2, N1-SU-5, N1-SP-6, N1-WK-4, N1-OB-7, N1-OB-10, N2-AP-1, N2-AP-4, N2-ES-1, N2-T17-1, N2-AP-6, N3-SU-1, N3-SP-1, N3-MM-1, N3-AP-1, N4-FZ-7, ZA-LO-12, ZA-LO-13, ZA-LO-5, ZA-SU-2, ZA-SU-11, ZA-SU-12, ZA-SU-13, ZA-SU-10, ZB-S1M-1, ZB-S1M-3, ZB-S1M-5, ZB-S1D-1, ZB-GEM-1, ZB-GEM-2, ZB-GED-1, ZB-S17M-1, ZB-GEM-3, ZB-ROM-2, ZB-S13M-1, ZB-S1M-6, ZB-S1M-7, Y1-GM-01, Y1-GM-02, Y1-GM-03, Y1-GM-06, Y1-GM-09, Y1-GM-10, Y1-GM-11, Y1-GM-13, Y1-GM-14, Y1-GM-17, Y1-GM-19, Y1-GM-21, Y1-GM-30, Y1-GM-35, Y1-GD-02, Y1-GD-06, Y1-GD-09, Y1-GD-11, Y1-GD-13, Y1-GD-19, Y1-GD-21, Y1-GD-25, Y1-GD-31, Y1-SM-02, Y1-SM-04, Y1-SM-06, Y1-SM-14, Y1-SM-16, Y1-SM-17, Y1-SM-19, Y1-SM-25, Y1-SM-26, Y1-SM-31, Y1-SM-48, Y1-SM-49, Y1-SM-50, Y1-SD-04, Y1-SD-05, Y1-SD-06, Y1-SD-13, Y1-SD-15, Y1-SD-18, Y1-SD-19, Y1-SD-25, Y1-SD-38, Y1-SD-42, Y1-SD-47, Y1-CM-06, Y1-CM-21, Y1-CM-23, Y1-CM-24, Y1-CM-29, Y1-CM-30, Y1-CM-40, Y1-CM-41, Y1-CM-42, Y1-CD-06, Y1-CD-07, Y1-CD-09, Y1-CD-13, Y1-CD-18, Y1-CD-19, Y1-CD-21, Y1-CD-23, Y1-CD-27, Y1-CD-28, Y1-CD-38, Y1-CD-39, Y1-CD-50, Y1-CD-52, Y1-CD-57, Y1-XM-11, Y1-XM-14, Y1-XM-17, Y1-XM-21, Y1-XM-22, Y1-XM-28, Y1-XM-30, Y1-XM-35, Y1-XD-08, Y1-XD-11, Y1-XD-12, Y1-XD-15, Y1-XD-17, Y1-XD-18, Y1-XD-26, Y1-XD-29, Y1-XD-32, Y1-XD-35, Y1-XD-43, Y1-XD-44, Y1-XD-49, Y2-G-05, Y2-G-16, Y2-G-19, Y2-G-24, Y2-S-08, Y2-S-15, Y2-S-16, Y2-C-03, Y2-C-06, Y2-C-07, Y2-C-09, Y2-C-15, Y2-C-19, Y2-C-21, Y2-C-26, Y2-H-05, Y2-H-15, Y2-H-17, Y2-H-19, Y2-H-22, Y2-H-24, Y2-O-02, Y2-O-04, Y2-O-06, Y2-O-07, Y2-O-08, Y2-O-13, AD-ALL-9, AD-UE-1, AD-UE-2, AD-UE-3, AD-UE-4, AD-SP-1, AD-SP-2, AD-SP-3, AD-NU-4, AD-NU-7, AD-TE-1, AD-TE-3, AD-LI-2, AD-PT-1, AD-PT-2, AD-SN-3, AD-SN-4, AD-MO-3, AD-MO-4, AD-FI-4, AD-FA-1, AD-FA-2, AD-FS-1, AD-FS-3, AD-BU-3, AD-BU-5, AD-HA-1, AD-HA-5, AD-HA-6, AD-PR-2, AD-PR-3, AD-PR-4, AD-EI-2, AD-EI-5, AM-ALL-4, AM-MO-3, AR-UE-2, AR-UE-3, AR-UE-4, AR-GA-1, AR-GA-3

## Anhang B: Zuordnungsregeln der Cluster (Schlüsselwörter, ohne Beachtung der Groß-/Kleinschreibung)

Ein Fund gehört zu einem Cluster, wenn sein Text (Beschreibung, Beleg und Befehl der Quellzeile) den regulären Ausdruck trifft.

- K01 Kontrast und Lesbarkeit: `kontrast\|contrast\|\d,\d:1\|unleserlich\|schwer lesbar\|kaum lesbar\|blass\|schwach(er)? (farb\|kontrast)\|graue? schrift`
- K02 Touch-Ziele unter 44 px: `touch\|zielgr\|tippfl\|unter 44\|< ?44\|kleine ziele\|ziele unter\|\b(2\d\|3\d\|40\|41\|42) ?px (hoch\|hohe\|klein)\|\bmin-h-(8\|9\|10)\b\|zu klein(e\|er\|es)? (knöpfe\|knopf\|ziele\|link\|tipp)`
- K03 Schrift unter 12 px: `\b(8\|9\|10\|11) ?px\|1[01]-px\|\bschrift\b.*\b(winzig\|sehr klein)\|text-\[(9\|10\|11)px\]\|sehr kleine schrift`
- K04 Fokus, Tastatur, Screenreader: `fokus\|focus\|tastatur\|keyboard\|screenreader\|sr-only\|aria-\|tab-reihenfolge\|tabreihenfolge\|alt-text\|ohne `?h1\|kein `?h1\|h1 fehlt`
- K05 Unklare Begriffe und Texte: `begriff\|fachwort\|unerklärt\|ohne erklärung\|jargon\|wortwahl\|unklar(e\|er\|es)? (text\|beschriftung\|wort\|bezeichnung)\|verwirrend(e\|er)? (text\|wort\|beschriftung)\|widerspr(icht\|echen\|üchlich)\|doppeldeutig\|mehrdeutig\|beschriftung`
- K06 Hauptaktion unter dem Falz oder weit unten: `falz\|ganz unten\|weit unten\|erst nach .{0,12}px\|px verteilt\|unter dem ersten bildschirm\|y ?= ?\d{3,4}\|nach .{0,10}scrollen\|muss .{0,20}scrollen\|erst am ende\|am seitenende`
- K07 Altmodell, Guthaben, Aufladen: `guthaben\|aufladen\|wallet\|rabatt\|promo\|altmodell\|altmodus\|reservierung\|mindestzahl\|0,00 ?(€\|eur)\|testkarte\|kostenlos`
- K08 Leer-, Fehler- und Endzustände ohne nächste Handlung: `sackgasse\|leerzustand\|leere? (liste\|seite\|zeile\|text)\|ohne n(ä\|ae)chste\|keine n(ä\|ae)chste\|kein n(ä\|ae)chster\|endet still\|still auf\|ohne r(ü\|ue)ckmeldung\|keine r(ü\|ue)ckmeldung\|404\|nicht gefunden\|fehlerseite\|fehlermeldung\|ohne handlung\|keine handlung\|ohne hinweis\|kein hinweis\|ohne grund\|ohne kontext`
- K09 Orange als Text, Status oder Warnfarbe: `orange[nr]?\b.{0,40}(text\|status\|schrift\|punkt\|warn\|ampel\|link\|fehler)\|(text\|status\|schrift\|punkt\|warn\|ampel\|link\|fehler).{0,40}\borange\|akzentfarbe.{0,30}(status\|text)\|rot(e\|er\|es)? (und\|oder) orange`
- K10 Ampel und Status nur durch Farbe: `ampel\|punkte? ohne wort\|ohne wort\|nur (durch )?farbe\|farbpunkt\|nur farbe\|statuspunkt\|nur ein punkt\|nur punkte\|grüne punkte`
- K11 Navigation und Orientierung: `navigation\|kopfleiste\|fußzeile\|fusszeile\|menü\|menu\|nicht auffindbar\|nicht erreichbar\|standort\|aktiv(er\|e\|es)? (reiter\|eintrag\|punkt\|tab)\|brotkrumen\|breadcrumb\|zurück-link\|einstieg\|verlinkt\|reiter\|footer\|header`
- K12 Sichtbarkeit und Datenschutz: `datenschutz\|namentlich\|sichtbar(keit)? (für\|ist)\|sieht .{0,30}namen\|volle? namen\|öffentlich sichtbar\|bloß\|minderjährig`
- K13 Desktop-Breite und Layout: `720 ?px\|schmale spalte\|ungenutzt\|gestreckte\|mehrspaltig\|\d{3} ?px (frei\|leer)\|breite ausnutz\|auf desktop.{0,30}(leer\|schmal)`
- K14 Rollen, Rechte und Berechtigungsanzeige: `rollensperre\|rollenprüfung\|berechtigung\|ohne rolle\|team-admin\|nur für admin\|rechte\|rollenmodell\|rollenanzeige\|zugriff\|sperre`
- K15 Formulare, Rückfragen und Bestätigungen: `rückfrage\|rueckfrage\|bestätigungsdialog\|ohne bestätigung\|formular\|pflichtfeld\|validier\|speichern\|abgeschnitten\|datumsfeld\|eingabefeld`
- K16 Entwickler-, Platzhalter- und Rechtstexte sichtbar: `platzhalter\|operator_\|entwurf\|dev-login\|auth_google\|entwicklertext\|entwickler-text\|localhost\|nicht rechtlich geprüft\|variablenname`
- K17 Zahlen, Zähler und Formate widersprüchlich: `zähler\|zahlen widersprechen\|iso(-\| )datum\|datumsformat\|plural\|schreibweise\|\d von \d.{0,30}(aber\|obwohl\|neben)\|widersprüchliche zahlen`
