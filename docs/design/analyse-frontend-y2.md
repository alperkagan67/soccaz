# Frontend-Analyse M1, Gruppe Y2 (Rangliste, Ligen, Halle, Profitag, Overlay, Dev-Pay)

## Kurzfassung (für den Nutzer)

**Status: Degradiert: ja, Y2 gilt noch nicht als fertig.** Grund:
- (a) `critique`, `audit`, `distill`, `clarify`, `adapt` haben keinen Launcher-Befehl; sie liefen je Seite einzeln und manuell nach den Reference-Dateien. Beim Hallenbetreiber hatte der erste Lauf die Reference-Dateien nur angelesen; das wurde bemängelt, die Dateien wurden danach vollständig gelesen und der Durchgang wiederholt (siehe Fundblatt Y2-H). Beim Overlay wurde die erste Aufnahme der Hintergrund-Variante (`_obs`) wiederholt, weil das Overlay seinen eigenen Hintergrund erzwingt; die acht `_obs`-Bilder wurden neu angesehen, die acht normalen Overlay-Bilder stammen aus der ersten Ansicht (Aufnahme wiederholt, Inhalt unverändert).
- (b) Tatsächlicher Ablauf: Der Analyse-Leiter (nicht die Zell-Agenten) hat alle Bilder mit Playwright aufgenommen (ein Dev-Server, ein Browser, in Serie) und `detect` einmalig über den Launcher gestartet: auf Quelltext (0 Treffer) und auf fünf URLs je Handy und Desktop, ohne Anmeldung (nur Gast-Sicht), ohne Timeout. Es gab KEINEN `detect`-Lauf je Seite, Rolle und Gerät. Die fünf Zell-Agenten haben weder Browser noch Server noch `detect` genutzt, nur Bilder, Messwerte und Quelltext gelesen und keine weiteren Unter-Agents gestartet; `critique` lief deshalb ohne zwei isolierte Assessments (A und B). Kontraste nur nach Augenmaß.
- (c) Nicht prüfbar: der echte Zahlungsbildschirm `/dev/pay/[id]` (liefert in dieser Umgebung 404, nur aus dem Quelltext bekannt), Liga-Beitritt und Profitag-Bewerbungsformular (nur für Team-Admins, nur aus Quelltext), Leerzustände von Ligen und Profitag, Dunkelmodus.
- (d) Seed-Lücke: Der Seed enthält keine Ligen, Profitag-Ereignisse und Zahlungen. Für die Aufnahme wurden in der lokalen Worker-DB einzelne Testdatensätze ergänzt (zwei Ligen, ein Profitag-Ereignis mit drei Bewerbungen, eine ausstehende Test-Zahlung); sie gehören nicht zum Seed und gehen beim nächsten Aufräumen verloren.

**Zähler:** angesehen 96 von 96 Screenshots (Gast, Spieler, Captain, Hallenbetreiber je 20 = 10 Seiten × Handy und Desktop; Overlay 16 = 4 Spiele × 2 Größen × normal und mit simuliertem Spielhintergrund), jede Zelle durch einen eigenen Sub-Agenten, die fünf Zell-Agenten nacheinander in Serie (Aufnahme durch den Analyse-Leiter mit einem Browser und einem Dev-Server).

**Funde (Rohzählung):** 0 P0, 33 P1, 75 P2, 1 P3 (nur Vermerk), Summe 109. **MUSS WEG:** 28 Zeilen, davon 25 echte Fundstellen (je Zelle; im Overlay sind die 3 Zeilen ein Negativbefund und zwei Hinweise auf Nachbarstellen, 0 echte); Ligen, Profitag und Stadt-Challenge als Produktfrage vorgemerkt, Entscheid beim Nutzer.

**Die 10 schlimmsten Probleme:**
1. **Hallen-Dashboard `/halle`** (Y2-H-01 bis -04, -23): nur eine Anfragenliste; gegenüber Vertrag 011 fehlen Buchungen, Auszahlungen, Rechnungen, Sperrzeiten, Antworten auf Bewertungen. Ablehnen ohne Begründung (011 AC-3 verlangt sie; aus Quelltext). Der Betreiber findet die Seite nicht (kein Eintrag in Navigation oder Menü), Hauptknöpfe nur 36 px hoch.
2. **`/halle` ohne Rollensperre** (Y2-S-01, Y2-C-01): Spieler und Captain sehen eine leere Betreiberseite mit Systemtext; der Fußzeilen-Link „Für Hallenbetreiber“ steht für jede Rolle da.
3. **Navigation** (Y2-G-01/02, Y2-C-04): Ligen, Profitag, Hallen und Rangliste fehlen in der Navigation, Ligen und Profitag auch in Kopfleiste und Fußzeile; nur per URL oder Chips auf der Teamseite erreichbar; Standort nirgends markiert.
4. **Gast auf `/halle`** (Y2-G-03/04): Weiterleitung auf `/anmelden` ohne Kontext; dort Entwicklertexte („AUTH_GOOGLE_ID fehlt“, „Dev-Login (nur lokal)“).
5. **Overlay für Privatspiele** (Y2-O-01): zeigt die volle App-Fehlerseite mit Kopf, Fuß und deckendem Grund; in OBS würde sie das Spielbild abdecken.
6. **Overlay ohne Anleitung und ohne Statusanzeige** (Y2-O-02/03): Die URL steht nur im eingeklappten Bereich „Live-Stream eintragen“ auf `/spiele/[id]` und nur für Verwaltungsrechte; „Live“ und „Verbinde…“ sind unsichtbar, ein Verbindungsabbruch bleibt unbemerkt.
7. **Rangliste** (Y2-G-05/06): fünf gleich gewichtete Blöcke, 3839 px lang am Handy, 49 bis 52 Ziele unter 44 px, Mini-Tabelle mit etwa 24 px Zeilenhöhe.
8. **Ligen und Profitag für Nicht-Admins** (Y2-S-03/04, Y2-C-02, Y2-H-20): „Nur Team-Admins können sich bewerben“ ohne nächsten Schritt; „Team-Admin“ ist kein Produktbegriff; der Captain sieht im Profitag-Ereignis kein Formular und keinen Grund.
9. **Beendete Liga** (Y2-C-06): Kopf nennt „Meister: Seed Rot“, die Tabelle führt jedoch Seed Blau mit lauter Nullen (möglicherweise Seed-Artefakt).
10. **Guthaben im Kopf** (Y2-S-05, Y2-H-09): „0,00 €“ (Altmodell) ohne Erklärung in der Desktop-Kopfleiste, im Nutzermenü und auf den Y2-Seiten.

**MUSS WEG (vormerken, nicht umbauen), die wichtigsten:**
1. Kopfleiste und Nutzermenü: Guthaben („0,00 €“, „Wallet“).
2. `/dev/pay/[id]` (simulierter Zahlungsbildschirm, nur lokal).
3. Anmeldeseite: Entwicklertexte und Dev-Login-Karte.
4. `/halle`: Veto-Text und „Halle ist frei/belegt“ (Altfluss, ersetzt durch Vertrag 011), Link „Für Hallenbetreiber“ für alle Rollen.
5. Ligen (`/ligen`, `/ligen/[id]`): Produktfrage, Entscheid beim Nutzer.
6. Profitag (`/profitag`, `/profitag/[id]`) und Stadt-Challenge: Produktfrage, Entscheid beim Nutzer.
7. Begriffe „Lobby aufmachen“ und „Offene Lobbys“ in der Navigation (Begriffsfrage aus 007).
8. Overlay: keine MUSS-WEG-Stelle im Overlay selbst (kein Guthaben-, Altmodell- oder Dev-Text).

Hinweis zur Zuordnung: `/hallen` und `/hallen/[id]` (Hallenverzeichnis mit Bewertungen) stehen weder in der Liste von X noch in Y1 oder im Auftrag Y2; sie sind hier mit aufgenommen (Gast, Spieler, Captain, Hallenbetreiber).

Der Rest des Dokuments: Zusammenfassung, Matrix, Methodik, Detect, Funde je Zelle, MUSS WEG je Zelle, Lücken, Fundblätter (Durchgänge je Seite mit den fünf Befehlen, Messwerte).

Stand: Basis `main` (034247c), Dev-Server Port 3103 mit `PAYMENTS_FAKE=1`, Seed `seed-frontend` (PR 91) plus ergänzte lokale Testdaten (siehe oben). Nur gelesen und gemessen, kein Quelltext geändert. Grundlage: Vertragsentwurf 013 (Richtung E Trikot bleibt, URLs und Test-IDs bleiben).

## Zusammenfassung

| Zelle | Rolle | Geräte | Bilder | Funde | P0 | P1 | P2 | P3 | MUSS-WEG-Zeilen |
|---|---|---|---|---|---|---|---|---|---|
| Y2-G | Gast | Handy 390 x 844 und Desktop 1280 x 800 | 20 | 24 | 0 | 6 | 18 | 0 | 6 |
| Y2-S | Spieler | Handy und Desktop | 20 | 22 | 0 | 7 | 15 | 0 | 6 |
| Y2-C | Captain (Team-Admin) | Handy und Desktop | 20 | 26 | 0 | 8 | 18 | 0 | 7 |
| Y2-H | Hallenbetreiber | Handy und Desktop | 20 | 24 | 0 | 9 | 15 | 0 | 6 |
| Y2-O | Streamer (Overlay, ohne Login) | 1280 x 800 und OBS 1920 x 1080 | 16 | 13 | 0 | 3 | 9 | 1 | 3 (0 echte) |
| **Summe** | | | **96** | **109** | **0** | **33** | **75** | **1** | **28** (25 echte) |

MUSS-WEG-Zeilen: 28 Zeilen, davon 25 echte Fundstellen; die 3 Overlay-Zeilen sind ein Negativbefund („keine Fundstelle“) und zwei Hinweise auf Nachbarstellen (Kopf mit Guthaben, Stream-Formular), also 0 echte Overlay-Stellen.

Priorität: P0 Bedienung kaputt, P1 verwirrend, P2 Optik. Kennungen: G = Gast, S = Spieler, C = Captain, H = Hallenbetreiber, O = Streamer (Overlay). Viele Funde wiederholen sich je Rolle und Gerät und verweisen aufeinander.

## Matrix-Abdeckung

10 Seiten × Gast, Spieler, Captain, Hallenbetreiber × Handy (390 x 844) und Desktop (1280 x 800) = 80 Zellen. Overlay: 4 Spiele × 2 Größen (1280 x 800 und OBS-Größe 1920 x 1080) × normal und mit simuliertem Spielhintergrund = 16 Bilder (Rolle Streamer, technisch Gast, Handy irrelevant). Summe 96 Bilder, alle einzeln angesehen.

Seiten: `rangliste` = `/rangliste`; `ligen` = `/ligen`; `liga_aktiv`, `liga_beendet` = `/ligen/[id]`; `halle` = `/halle` (Bereich für Hallenbetreiber); `hallen` = `/hallen` (Hallenverzeichnis); `halle_detail` = `/hallen/[id]`; `profitag` = `/profitag`; `profitag_event` = `/profitag/[id]`; `dev_pay` = `/dev/pay/[id]`; `overlay_gespielt/bestaetigt/lobby/privat` = `/overlay/[id]` (Privatspiel ist nicht öffentlich und liefert 404).

Nicht Teil von Y2: Gruppe X, Y1 und alle `/admin`-Seiten. Nicht prüfbar: siehe Kurzfassung (c).

## Methodik

1. Seed `seed-frontend` plus lokal ergänzte Testdaten für Ligen, Profitag und Dev-Pay. Dev-Server nur auf Port 3103 (`PAYMENTS_FAKE=1`), Dev-Login nur in Nicht-Produktion.
2. Playwright (Chromium), je Rolle und Gerät Ganzseiten-Screenshot mit 1,8 s Wartezeit plus Messwerte (Überlauf, `h1`, Zielgrößen unter 44 px, Konsolenfehler, Höhe). Overlay als Viewport-Bild, zusätzlich mit simuliertem Spielhintergrund (Verlauf). Screenshots nur lokal außerhalb des Repos.
3. Impeccable nur über den Launcher: `detect` (vom Analyse-Leiter, siehe Abschnitt Detect); `context` wurde nicht ausgeführt. Nie `hooks`, `install`, `update`.
4. Fünf Sub-Agent-Durchläufe in Serie (je Zelle einer; die Zell-Agenten starteten keine weiteren Agents und nutzten weder Browser noch `detect`). Je Zelle: alle Bilder einzeln, fünf Durchgänge je Seite einzeln, Quelltext für Erklärungen und Zustände, die das Bild nicht zeigt (als „aus Quelltext“ markiert). Y2 wird nur geprüft und auf MUSS WEG vorgemerkt, nicht umgebaut.

## Detect (Launcher, nur lesend)

- Quelltext `src/app/rangliste`, `ligen`, `halle`, `hallen`, `profitag`, `overlay`, `dev`: 0 Treffer.
- URL: `/rangliste` Handy `straggler` und `overused-font`, Desktop `overused-font`; `/ligen`, `/ligen/[id]`, `/profitag`: `overused-font`; `/hallen` (Handy und Desktop): `low-contrast` und `overused-font`.
- Ausgeführt vom Analyse-Leiter (nicht von den Zell-Agenten); nur Quelltext und URLs ohne Anmeldung (Gast-Sicht), kein Lauf je Rolle und Gerät. Kein Timeout. `/halle`, `/overlay` und `/dev/pay` nicht per URL gescannt (Anmeldung nötig bzw. Overlay ohne App-Rahmen); dort Quelltext und Bildprüfung.

## Funde je Zelle

Spalten: `ID | Prio | Seite | Beschreibung | Beleg (lokale Datei) | Impeccable-Befehl`.

### Zelle Y2-G: Gast, Handy 390 x 844 und Desktop 1280 x 800

| ID | Prio | Seite | Beschreibung | Beleg (Datei) | Befehl |
|---|---|---|---|---|---|
| Y2-G-01 | P1 | alle (Handy) | Ligen, Hallen, Rangliste, Profi-Tag haben keinen Platz in der unteren Navigation (Teamspiel, Privatspiel, Spiel suchen, Turniere, Profil). Es ist nirgends markiert, wo man ist; der orange Mittelknopf "Spiel suchen" bleibt auf jeder Seite gleich hervorgehoben, auch auf Rangliste und Ligen. Hidden Navigation, Standort unklar. | gast_mobil_ligen.png, gast_mobil_rangliste.png, gast_mobil_hallen.png | critique |
| Y2-G-02 | P1 | ligen, liga_*, profitag, profitag_event | Ligen und Profi-Tag sind weder in Kopfleiste (Offene Lobbys, Livescore, Rangliste) noch in der Fußzeile (Hilfe, Kontakt, Livescore, Rangliste, Teams, ... Hallen, Mitspieler gesucht) verlinkt: für einen Gast nur per URL erreichbar. Entweder tote Funktion oder fehlender Einstieg. | gast_desktop_ligen.png, gast_desktop_profitag.png | critique |
| Y2-G-03 | P1 | halle (Gast) | Gast wird still nach /anmelden geleitet. Die Seite zeigt nur "Anmelden" ohne Hinweis, dass "Bereich für Hallenbetreiber" angefragt war und ohne Rückbezug; wer aus dem Fußlink "Für Hallenbetreiber" kommt, erfährt nicht, ob sein Konto Betreiber-Rechte braucht. | gast_mobil_halle.png, gast_desktop_halle.png (Quelltext: `src/app/halle/page.tsx` Zeile 13 `requireUser("/halle")`) | clarify |
| Y2-G-04 | P1 | halle (Anmeldeseite) | Entwickler-Text sichtbar für Gast: "Google-Login ist noch nicht eingerichtet (AUTH_GOOGLE_ID fehlt). Lokal kannst du den Dev-Login nutzen." plus Formular "Dev-Login (nur lokal)" mit vorbefülltem Konto. Variablenname und lokaler Login in der Gast-Oberfläche. Nur lokal, aber Jargon ohne Bedeutung für Nutzer. | gast_mobil_halle.png, gast_desktop_halle.png (Quelltext: `src/app/anmelden/page.tsx` Zeilen 17, 42, 59) | clarify |
| Y2-G-05 | P1 | rangliste | Sehr lange Seite (Handy 3839 px, Desktop 3595 px): fünf gleich gewichtete Blöcke (Stadt-Challenge, Teams im Monat, Stärkste Teams, Torjäger, Beste Spieler) mit je 18 Zeilen, keine Sprungmarken, kein Einklappen, keine Begrenzung auf eine Top-Liste. Zuerst kommt die erklärungsbedürftige "Stadt-Challenge" statt der Teams-Tabelle. Hohe kognitive Last (5 Blöcke, 8+ Einträge je Entscheidung). | gast_mobil_rangliste.png, gast_desktop_rangliste.png | distill |
| Y2-G-06 | P1 | rangliste | Messwert: 49 (Handy) bzw. 52 (Desktop) Ziele unter 44 px. Zeilen der Spieler- und Teamlisten sind ca. 44 px hoch, die Mini-Tabelle "Teams im November 2026" hat Zeilen von ca. 24 px mit Teamname und Ort in zwei Mikrozeilen. Zielgröße 44 px verfehlt (PRODUCT.md: mindestens 44 px). | gast_mobil_rangliste.png, gast_desktop_rangliste.png, messwerte_gast_mobil.json | audit |
| Y2-G-07 | P2 | rangliste | Zwei Optiken für Ranglisten: Karten-Zeilen (Teams, Torjäger, Spieler) und eine enge Tabelle (Teams im Monat) mit viel kleinerer Schrift (xs). Auf dem Desktop ist die Tabelle über 720 px gespreizt, "Pkt" weit rechts, Auge kommt schlecht von Team zu Zahl. Einheitsoptik fehlt. | gast_desktop_rangliste.png | critique |
| Y2-G-08 | P2 | rangliste | Texte: "1 Siege in 1 Spielen" (Pluralfehler, Stadt-Challenge), "S-U-N" und "Sp" unerklärt, "Stärkste Teams (Elo)" und "Beste Spieler (Elo)" ohne Erklärung, was Elo bedeutet (nur Zeile "Ab 5 gespielten Spielen..." bei Teams). Fachwort ohne Erklärung (Vertrag 013 AC-7). | gast_mobil_rangliste.png | clarify |
| Y2-G-09 | P2 | rangliste | Filter "Ganz NRW" + Monatsfeld + Knopf "Anzeigen": man muss nach jeder Änderung bestätigen; das native Monatsfeld zeigt Kalendersymbol und wirkt wie ein Datumsfeld. Orange Knopf konkurriert mit dem orangen "Anmelden" oben. | gast_mobil_rangliste.png | adapt |
| Y2-G-10 | P2 | ligen, liga_aktiv, liga_beendet | Datumsformat ISO ("2026-10-12 bis 2027-01-10") statt deutsch (12.10.2026), steht in Liste und Detail. Stadt "Essen" und Daten mit Mittelpunkt in einer Zeile. | gast_mobil_ligen.png, gast_desktop_liga_aktiv.png (Quelltext: `src/app/ligen/[id]/page.tsx` Zeile 32) | clarify |
| Y2-G-11 | P2 | ligen | Der Umschalter "Auch beendete Ligen zeigen" ist ein unterstrichener Textlink in kleiner Schrift (ca. 20 px hoch), Ziel unter 44 px; er wirkt wie Fließtext, nicht wie ein Filter. Auf dem Handy steht er allein mit viel leerer Fläche darunter. | gast_mobil_ligen.png, gast_desktop_ligen.png (Quelltext: `src/app/ligen/page.tsx` Zeile 39) | adapt |
| Y2-G-12 | P2 | liga_aktiv | Teamnamen in der Tabelle sind im Bild nicht als Link erkennbar (kein Unterstrich, keine Farbe), anders als "Meister: Seed Rot" auf der beendeten Liga. Ob verlinkt wird, ist aus dem Bild nicht zu entscheiden (aus Quelltext nicht geprüft). Zahlen in "S-U-N" und "Tore" ohne Legende. | gast_desktop_liga_aktiv.png | clarify |
| Y2-G-13 | P2 | liga_beendet | Testdaten-Widerspruch: "Meister: Seed Rot", Tabelle zeigt alle Teams mit 0 Spielen und Rot auf Platz 3. Nicht Produktfehler (Seed), aber zeigt, dass die Tabelle ohne Spiele nicht erklärt, warum ein Meister gesetzt ist. Leere/0-Zustand ohne Hinweis. | gast_mobil_liga_beendet.png | clarify |
| Y2-G-14 | P2 | ligen, liga_* , profitag | Auf dem Desktop bleibt der Inhalt in 720 px Breite zentriert, darunter ca. 300 bis 400 px leerer Fläche; Kopfleiste und Fußzeile sind sparsam, Ligentabelle ohne Zusatzinformation (Spielplan, Ergebnisse). Das Desktop-Layout nutzt die Breite nicht, wirkt wie vergrößerte Handy-Seite. | gast_desktop_ligen.png, gast_desktop_liga_aktiv.png, gast_desktop_profitag.png | adapt |
| Y2-G-15 | P2 | hallen | Listenkarten ohne Handlung: kein Filter nach Boden/Preis, Stadtauswahl braucht "Anzeigen"-Knopf, "Partner"-Marke (Tag) unerklärt, Bewertungsangabe "4 Bewertungen" klein und grau rechts. Hinweistext zu OpenStreetMap ist xs und lang (3 Zeilen auf dem Handy). | gast_mobil_hallen.png, gast_desktop_hallen.png | clarify |
| Y2-G-16 | P2 | halle_detail | Handy: Name bricht in zwei Zeilen ("Elias / Testmann"), das lange Datum "Mittwoch, 11. November 2026" bricht rechts daneben in zwei Zeilen und drückt die Karte. Auf dem Desktop passt es. Sterne sind Zeichen (★★★☆☆), Barrierefreiheit der Wertung aus Quelltext zu prüfen. | gast_mobil_halle_detail.png, gast_desktop_halle_detail.png | adapt |
| Y2-G-17 | P2 | halle_detail | Keine nächste Handlung für Gast außer "Anmelden, um zu bewerten" (kleiner Textlink am Listenende). Kein Weg "Hier ein Spiel suchen", keine Adresse als Karte/Link, keine Preise oder Kontaktdaten. Prinzip 1 (nächster Schritt zuerst) nicht erfüllt. | gast_desktop_halle_detail.png | critique |
| Y2-G-18 | P2 | profitag | Erklärtext "Ein verifiziertes Profi-Team spielt gegen Amateur-Teams. Bewirb dich mit deinem Team, wir losen die Gegner aus." ist gut, aber: Status "Bewerbung offen" bricht auf dem Handy in zwei Zeilen, grau und klein; kein Hinweis, wer "Profi-Team" ist; ein Gast ohne Team versteht nicht, ob er teilnehmen kann. | gast_mobil_profitag.png | clarify |
| Y2-G-19 | P2 | profitag_event | Hauptknopf "Anmelden und bewerben" ist voll breit orange (richtig), aber der Gast erfährt vorher nicht, dass ein Team nötig ist; Bewerbungsliste zeigt nur Teamnamen als leere Karten mit viel Fläche (3 Karten ohne weitere Daten). "Bewerben bis" Datum bricht auf dem Handy in drei Zeilen. | gast_mobil_profitag_event.png, gast_desktop_profitag_event.png | clarify |
| Y2-G-20 | P2 | alle (Handy) | Fußzeile: Links in ca. 12 px Schrift mit ca. 48 px Zeilenabstand, Liste wirkt als Linkwolke (11 bis 14 Einträge in 4 Zeilen), Trefferfläche je Link nur Texthöhe. Messwert kleine Ziele 7 bis 12 je Seite stammt zum großen Teil daher. | gast_mobil_ligen.png, messwerte_gast_mobil.json | audit |
| Y2-G-21 | P2 | alle (Desktop) | Kopfleiste ohne Standortmarkierung: "Offene Lobbys, Livescore, Rangliste" sind auf der Seite Rangliste nicht hervorgehoben. Beschriftung weicht vom Handy ab ("Offene Lobbys" gegen "Spiel suchen"). Gleiches Ziel, zwei Namen. | gast_desktop_rangliste.png, gast_mobil_rangliste.png | clarify |
| Y2-G-22 | P2 | dev_pay | Gast erhält 404 ("Seite nicht gefunden / Diese Seite gibt es nicht oder nicht mehr. Zur Startseite"). Das ist hier das erwartete Ergebnis (nicht Dev-Zahlung aktiv oder nicht angemeldet; Quelltext prüft `activeProvider() !== "dev"` vor der Anmeldung). Messwert meldet Status 200 trotz Fehlerseite (Streaming mit Cache Components, `notFound()` nach Header-Aufbau) und wird als Messeffekt notiert. Die 404-Seite selbst ist klar und sauber. | gast_mobil_dev_pay.png, gast_desktop_dev_pay.png (Quelltext: `src/app/dev/pay/[id]/page.tsx` Zeilen 13 und 15) | audit |
| Y2-G-23 | P2 | alle | Einheitsoptik: jede Seite besteht aus weißer abgerundeter Karte auf blassgrünem Grund mit gleicher Überschrift; Richtung E (Trikot, Teamfarbe, Anzeigetafel-Chip, Orange nur als Handlung) ist nicht sichtbar: keine Teamfarbe bei Teamnamen in Rangliste/Liga, keine Spielnummer-Chips. Wirkt wie die Vorlage (Nutzerbefund). | gast_desktop_rangliste.png, gast_desktop_liga_aktiv.png | critique |
| Y2-G-24 | P2 | rangliste, liga_* | Tabellen: Spalte "#" und Ziffern in Spalten erscheinen im Bild leicht farbig (Blau/Braun) statt neutral; mögliches Rendering oder Linkfarbe, Ursache aus dem Bild nicht sicher (nicht verifiziert). Spaltenköpfe in 12 px grau. | gast_desktop_liga_aktiv.png | audit |

Zählung: P0 0, P1 6 (01 bis 06), P2 18.

### Zelle Y2-S: Spieler, Handy und Desktop

| ID | Prio | Seite | Beschreibung | Beleg (Datei) | Befehl |
|---|---|---|---|---|---|
| Y2-S-01 | P1 | halle | Ein normaler Spieler gelangt über die Fußzeile "Für Hallenbetreiber" auf eine Betreiberseite ohne Berechtigungsprüfung: Überschrift "Spielanfragen für eure Halle" und Leere-Text "Keine offenen Anfragen. ... Ist hier nichts zu sehen, ist für dieses Konto noch keine Halle hinterlegt." Der Spieler hat keine Halle ("eure"), erfährt nicht, was ein Betreiber-Zugang ist oder wie er ihn bekommt; der Text rät, statt zu sagen. Kein Weg weiter (kein Link zu Kontakt/Hilfe, kein Hinweis "Bereich nur für Hallenbetreiber"). Aus Quelltext: `requireUser("/halle")`, dann `pendingHallInquiries(user.id)`, keine Rollenprüfung (src/app/halle/page.tsx Zeilen 13 bis 20). | spieler_mobil_halle.png, spieler_desktop_halle.png | clarify |
| Y2-S-02 | P1 | halle (Handy) | Die Seite ist für einen Nicht-Betreiber eine Sackgasse in der Fußzeile: 200 OK, Inhalt nur eine leere Karte; der Fußlink "Für Hallenbetreiber" (kleiner Text, 4. Zeile) steht gleichwertig neben Impressum und Hilfe und lädt jeden Spieler ein, hineinzulaufen. Die Funktion ist für eine kleine Rolle (011) und gehört nicht in die Spieler-Navigation (Prinzip 1: nächster Schritt zuerst). | spieler_mobil_halle.png | distill |
| Y2-S-03 | P1 | liga_aktiv, ligen | Spieler (nicht Captain) sieht keinen Hinweis, wie sein Team in die Liga kommt: der Kasten "Dein Team" mit "Anmelden" erscheint nur für Team-Admins (aus Quelltext: `joinable` aus `myAdminTeams`, src/app/ligen/[id]/page.tsx Zeilen 22 bis 25, 74 bis 80). Im Bild: Tabelle, sonst nichts. Seed Rot steht in der Tabelle, ist aber nicht markiert; "Dein Team" wird nicht erkannt. Der Beitritt zur Liga ist für den Spieler unsichtbar, ohne Satz "Frag deinen Captain". | spieler_mobil_liga_aktiv.png, spieler_desktop_liga_aktiv.png | clarify |
| Y2-S-04 | P1 | profitag_event | Spieler (Mitglied, kein Admin) sieht nur den grauen Satz "Nur Team-Admins können sich bewerben." Er erklärt nicht, wer Team-Admin ist, nennt keine Handlung ("Sprich deinen Captain an") und der Begriff "Team-Admin" kommt sonst im Produkt nicht vor (Captain ist der Begriff). Die Seite zeigt außerdem Seed Rot (das eigene Team) als Profi-Team: der Spieler kann sich mit seinem eigenen Team nicht bewerben, was nicht gesagt wird (Testdaten-Effekt, Text deckt den Fall nicht ab). Aus Quelltext: src/app/profitag/[id]/page.tsx Zeile 42 (`open && user && mine.length === 0`). | spieler_mobil_profitag_event.png, spieler_desktop_profitag_event.png | clarify |
| Y2-S-05 | P1 | alle (Desktop) | Die Kopfleiste zeigt "0,00 €" als Link (Guthaben) zwischen Glocke und Nutzermenü; Handy-Kopf zeigt es nicht (nur Glocke und "Anton"). Guthaben ist Altmodell (MUSS WEG) und erzeugt für den Spieler eine Frage ("0,00 € wovon? aufladen?") ohne Antwort auf der Seite. Beschriftung ist nur eine Zahl, keine Wortbeschriftung. Quelltext: src/components/Header.tsx Zeilen 17, 53, 54; Betrag steckt zusätzlich im Nutzermenü (`balanceText`, UserMenu.tsx Zeile 71, Menü selbst nicht abgebildet). | spieler_desktop_rangliste.png, spieler_desktop_ligen.png, spieler_desktop_hallen.png | critique |
| Y2-S-06 | P1 | alle (Handy) | Wie Y2-G-01: Ligen, Hallen, Rangliste, Profi-Tag haben keinen Platz in der unteren Leiste, der orange Mittelknopf "Spiel suchen" ist auf jeder Seite gleich hervorgehoben, auch in Rangliste/Ligen; kein Standort. Für den Spieler kommt hinzu: das Nutzermenü (Name rechts oben) zeigt keinen Hinweis auf "Meine Spiele" oder das eigene Team. | spieler_mobil_ligen.png, spieler_mobil_hallen.png | critique |
| Y2-S-07 | P1 | ligen, profitag | Wie Y2-G-02: Ligen und Profi-Tag sind für den angemeldeten Spieler weder in Kopf noch Fußzeile (Quelltext: src/components/Footer.tsx enthält keine /ligen- oder /profitag-Links, Prüfung per Suche) verlinkt; Einstieg nur per URL oder Mitteilung. Eine Spielerseite, die er nicht findet, ist tot oder fehlender Einstieg. | spieler_desktop_ligen.png, spieler_desktop_profitag.png | critique |
| Y2-S-08 | P2 | rangliste | Der eigene Eintrag und das eigene Team sind nicht erkennbar: Spieler steht in "Beste Spieler (Elo)" auf Platz 1 (Name "Anton Testmann", 1094) und im Torjäger-Block auf Platz 9, ohne Markierung; Seed Rot steht in Teams-Tabelle und Elo-Liste gleich wie alle. Bei 18 Zeilen je Block muss der Spieler seinen Namen suchen. | spieler_mobil_rangliste.png, spieler_desktop_rangliste.png | critique |
| Y2-S-09 | P2 | rangliste, liga_aktiv | Gleiche Mängel wie Gast: 5 Blöcke ohne Hierarchie, ca. 3800 px Handy-Länge, Pluralfehler "1 Siege in 1 Spielen", S-U-N unerklärt, Filter mit "Anzeigen"-Zwang, Mini-Tabelle mit 24 px Zeilenhöhe. Messwert 50 (Handy) und 54 (Desktop) kleine Ziele. Siehe Y2-G-05 bis 09. | spieler_mobil_rangliste.png, messwerte_spieler_mobil.json | audit |
| Y2-S-10 | P2 | halle (Desktop) | Layoutversatz: Überschrift und Karte der Betreiberseite beginnen bei x = 304 px, Kopfleiste, Fußzeile und Trennlinie bei x = 280 px (Seitenbreite `max-w-2xl` gegen 720-px-Spalte). Alle anderen Seiten richten links bündig an der Spalte aus; diese Seite ist 24 px eingerückt und wirkt schief. Quelltext: src/app/halle/page.tsx Zeile 16 (`mx-auto max-w-2xl`). | spieler_desktop_halle.png | adapt |
| Y2-S-11 | P2 | halle | Die Leere-Karte hat eine sehr große Schrift (ca. 18 px, größer als der Erklärtext darüber) und zeigt 3 Sätze ineinander (Zustand, Benachrichtigung, Bedingung). Der Erklärtext darüber ("Zwei Teams haben sich auf einen Termin geeinigt...") ist für Spieler Betreiberjargon ("Veto"). Hierarchie vertauscht: Nebensache größer als Haupttext. | spieler_mobil_halle.png | clarify |
| Y2-S-12 | P2 | halle_detail | Der Spieler hat schon eine Bewertung ("Anton Testmann, 5 Sterne, mit Löschen"), das Formular "Sterne / Deine Bewertung / Senden" bleibt trotzdem unverändert darunter stehen. Unklar, ob "Senden" die vorhandene ersetzt, ergänzt oder abgewiesen wird (Fehlerprävention). Außerdem: "Melden" und "Löschen" sind unterstrichene Mikrotexte (ca. 12 px, Höhe ca. 16 px) weit unter 44 px; "Löschen" einer eigenen Bewertung ohne sichtbare Bestätigung (aus Quelltext nicht geprüft). | spieler_desktop_halle_detail.png, spieler_mobil_halle_detail.png | audit |
| Y2-S-13 | P2 | halle_detail (Handy) | Wie Y2-G-16: Name bricht ("Elias / Testmann"), das Datum "Mittwoch, 11. November 2026" bricht in zwei Zeilen und drückt die Karte; Datum gehört in Kurzform. Die eigene Bewertung (4. Karte) ist im Bild von der Navigation überdeckt (Aufnahmeeffekt, kein Fund). | spieler_mobil_halle_detail.png | adapt |
| Y2-S-14 | P2 | halle_detail | Die Halle bietet dem Spieler keine nächste Handlung außer dem Bewertungsformular: kein "Hier ein Spiel suchen", keine Karte oder Adresse als Link ("Teststraße 1, Essen" ist nur Text), keine Preise. Die Bewertung ist die einzige Handlung, ein Spieler, der eine Halle sucht, hat keine. Siehe Y2-G-17. | spieler_desktop_halle_detail.png | critique |
| Y2-S-15 | P2 | profitag | Wie Y2-G-18, mit Zusatz für den Spieler: Listenkarte zeigt "Seed Rot · Essen" als Profi-Team (= eigenes Team, Testdaten) und "Bewerbung offen / 2 Plätze"; der Status bricht auf dem Handy in zwei Zeilen und ist grau/klein. Für den Spieler fehlt die Aussage, ob sein Team teilnehmen darf (nur Captain) auf der Übersicht. | spieler_mobil_profitag.png | clarify |
| Y2-S-16 | P2 | profitag_event | Bewerbungsliste: drei Karten mit nur einem Teamnamen, keine Verlinkung erkennbar (im Quelltext Links, im Bild kein Unterstrich/keine Farbe), keine Zahl "3 von 2 Plätzen", keine Frist-Hinweise. Bei 2 Plätzen und 3 Bewerbungen sagt die Seite nicht, wie gelost wird oder wann. "Bewerben bis" bricht auf dem Handy in drei Zeilen. | spieler_mobil_profitag_event.png, spieler_desktop_profitag_event.png | clarify |
| Y2-S-17 | P2 | dev_pay | Spieler erhält 404 ("Seite nicht gefunden / Diese Seite gibt es nicht oder nicht mehr. / Zur Startseite"), obwohl angemeldet und mit Testzahlung im Datenbestand. Ursache nicht aus dem Bild; aus Quelltext: 404, wenn die Zahlung nicht dem angemeldeten Konto gehört oder nicht vom Anbieter "dev" ist (src/app/dev/pay/[id]/page.tsx Zeilen 13 bis 16). Damit ist der eigentliche Zahlungsbildschirm in dieser Zelle nicht gesehen (siehe Abschnitt 5). Die 404-Seite selbst ist klar. Messwert meldet Status 200 trotz Fehlerseite (Streaming, Messeffekt). | spieler_mobil_dev_pay.png, spieler_desktop_dev_pay.png | audit |
| Y2-S-18 | P2 | dev_pay | Aus Quelltext (Seite im Bild nicht sichtbar): Entwickler-Rahmen "Test-Zahlung: Hier fließt kein Geld. Das ist der Platz für Stripe.", Knöpfe "Zahlung erfolgreich" / "Abbrechen", bei abgeschlossener Zahlung roher Enum-Text "({payment.status})" (z. B. pending/succeeded, englisch) für den Nutzer; Seitenbreite `max-w-sm`, kein Zurück-Link. Nur lokal, aber der Rohtext zeigt, dass die Seite nie als Nutzerfläche gedacht war. | spieler_desktop_dev_pay.png (nur 404 sichtbar) | clarify |
| Y2-S-19 | P2 | alle (Handy) | Fußzeile wie Y2-G-20: 12-px-Links mit ca. 48 px Zeilenabstand, 14 Einträge in 4 Zeilen, Trefferfläche nur Texthöhe (Quelltext setzt `min-h-11`, im Bild sind die Zeilen wegen des Abstands weit, die Links aber klein). Auf Seiten mit wenig Inhalt (Ligen, Profi-Tag) füllt die Fußzeile mehr als die Hälfte des Bildschirms. | spieler_mobil_ligen.png, spieler_mobil_profitag.png | audit |
| Y2-S-20 | P2 | ligen, liga_* | ISO-Datum "2026-10-12 bis 2027-01-10" wie Y2-G-10; zusätzlich zeigt die beendete Liga "Meister: Seed Rot" (eigenes Team) über einer Tabelle mit Nullen (Seed-Effekt, Y2-G-13), ohne Hinweis, was "Sp 0" bei beendeter Liga bedeutet. Der Link "Auch beendete Ligen zeigen" bleibt kleiner Textlink (Y2-G-11). | spieler_mobil_liga_beendet.png, spieler_mobil_ligen.png | clarify |
| Y2-S-21 | P2 | alle | Einheitsoptik wie Y2-G-23: gleiche weiße Karte auf blassgrünem Grund auf jeder Seite, Orange nur an Knöpfen; Teamfarbe, Spielnummer-Chip, Richtung E nicht sichtbar. Für den Spieler fehlt zusätzlich jeder Persönlichkeitsbezug (eigenes Team, eigene Position). Kopfzeile und Karten sind mit der Vorlage identisch. | spieler_desktop_rangliste.png, spieler_desktop_liga_aktiv.png | critique |
| Y2-S-22 | P2 | alle (Desktop) | Kopfleiste ("Offene Lobbys, Livescore, Rangliste") ohne Standortmarkierung und mit anderem Wortschatz als die Handy-Leiste (Teamspiel, Privatspiel, Spiel suchen, Turniere, Profil); der angemeldete Spieler findet am Desktop weder Teamspiel noch Turniere im Kopf. Siehe Y2-G-21. | spieler_desktop_hallen.png | clarify |

Zählung: P0 0, P1 7 (01 bis 07), P2 15 (08 bis 22).

### Zelle Y2-C: Captain (Team-Admin), Handy und Desktop

| ID | Prio | Seite | Beschreibung | Beleg (Datei) | Befehl |
|---|---|---|---|---|---|
| Y2-C-01 | P1 | halle | Captain sieht den Hallenbetreiber-Bereich "Spielanfragen für eure Halle" voll, ohne Sperre oder Hinweis auf die Rolle. Die Leerzeile "Ist hier nichts zu sehen, ist für dieses Konto noch keine Halle hinterlegt" erklärt Systemzustand statt dem Captain, dass die Seite nicht für ihn ist. Nur ein Login-Check (halle/page.tsx:106), keine Rollenprüfung. Der Footer-Link "Für Hallenbetreiber" (Footer.tsx:23) steht für jede Rolle da. | captain_mobil_halle.png, captain_desktop_halle.png | critique |
| Y2-C-02 | P1 | profitag_event | Captain von Seed Rot (hier zugleich Profi-Team des Ereignisses) sieht weder Bewerbungsformular noch einen Hinweis, warum es fehlt: `eligible` ist leer (profitag/[id]/page.tsx:162), Zeile 186 rendert nichts, Zeile 187 greift nur ohne Team. Seite endet mit Liste "Bewerbungen (3)" und keiner Handlung. Das Formular mit "Mit diesem Team bewerben" (ApplyForm.tsx:18) ist im Bild nicht zu sehen: aus Quelltext. | captain_mobil_profitag_event.png, captain_desktop_profitag_event.png | clarify |
| Y2-C-03 | P1 | profitag_event | Bewerbungsliste zeigt nur Teamnamen als Karten: kein Status (offen, gelost), keine Stadt, keine Stärke, kein Zeitpunkt. Der Captain sieht nicht, ob "Seed Blau" gute Chancen hat oder wann gelost wird; nur "Bewerben bis" in der Kopfkarte. Karten sehen anklickbar aus (Teamlink, Zeile 197), tragen aber keine Affordanz. | captain_desktop_profitag_event.png | clarify |
| Y2-C-04 | P1 | ligen, profitag, halle (alle) | Liga, Profi-Tag und Halle sind weder in der unteren Navigation noch in der Kopfleiste noch im Footer verlinkt (Header.tsx:27-34, Footer.tsx:10-23). Erreichbar nur über Chips auf der Teamseite (teams/[slug]/page.tsx:122) oder direkte URL. Der Team-Admin findet "Liga anmelden" und "Profi-Tag bewerben", die ihm das Konto zusätzlich gibt, nicht. Produktfrage, vormerken. | captain_mobil_ligen.png, captain_mobil_profitag.png, captain_desktop_ligen.png | critique |
| Y2-C-05 | P1 | liga_aktiv | Block "Dein Team" zeigt nur den Teamnamen und den kleinen Knopf "Abmelden". Fehlt: Satz "Seed Rot ist in dieser Liga angemeldet". "Anmelden/Abmelden" lesen sich wie Konto-Login, gemeint ist Liga-Beitritt ("Beitreten/Verlassen"). Der Beitrittsknopf "Anmelden" (liga/[id]/page.tsx:80) ist im Bild nicht sichtbar, weil Seed Rot schon drin ist: aus Quelltext. Beide Knöpfe `!min-h-9` = 36 px, unter 44 px (Zeilen 80, 86 mit ActionButton-Standard). | captain_mobil_liga_aktiv.png, captain_desktop_liga_aktiv.png | clarify |
| Y2-C-06 | P1 | liga_beendet | Widerspruch: Kopf nennt "Meister: Seed Rot", die Tabelle darunter führt Seed Blau auf Platz 1 und alle Teams mit 0 Spielen, 0 Punkten. Der Meister kommt aus einem anderen Wert als die Tabelle (liga/[id]/page.tsx:34 `champion` gegen `table`). Im Seed vermutlich Testdaten-Artefakt, die Seite prüft die Übereinstimmung aber nicht. Beende Liga zeigt keine Abschlussbilanz. | captain_mobil_liga_beendet.png, captain_desktop_liga_beendet.png | critique |
| Y2-C-07 | P2 | ligen, liga_aktiv, liga_beendet | Datum als "2026-10-12 bis 2027-01-10" (ISO), sonst überall deutsch ("Mi., 25.11."). Quelle: Rohwert `startsOn` (liga/[id]/page.tsx:32, ligen/page.tsx:27). | captain_mobil_ligen.png, captain_desktop_liga_aktiv.png | clarify |
| Y2-C-08 | P2 | liga_aktiv | Eigenes Team (Seed Rot, Platz 2) ist in der Tabelle nicht hervorgehoben; keine Teamfarbe (Richtung E: Teamfarbe als Identität) und keine Markierung "ihr". Spaltenköpfe "Sp", "S-U-N" ohne Erklärung. Teamnamen sind Links, sehen aber nur nach hover aus (Zeile 61). Die Rangzahlen in Spalte "#" erscheinen farblich uneinheitlich (blau/braun) gegenüber den übrigen Zellen: nur im Bild beobachtet, Ursache ungeklärt. | captain_desktop_liga_aktiv.png | critique |
| Y2-C-09 | P2 | liga_beendet | Beendete Liga hat Kopf wie laufende ("beendet" nur als Wort im Untertitel); keine Abschlusskarte, kein Datum "beendet am", Champion-Link ist der einzige Hinweis. Tabelle mit lauter Nullen wirkt kaputt. | captain_mobil_liga_beendet.png | distill |
| Y2-C-10 | P2 | ligen | Liste und Übersicht wirken leer: eine Karte, danach der Textlink "Auch beendete Ligen zeigen" (ca. 20 px hoch, Messwert kleineZiele 9 mobil, 13 desktop). Zeile 38. Kein "Wie komme ich in eine Liga?" Hinweis für Captains. | captain_mobil_ligen.png | clarify |
| Y2-C-11 | P2 | rangliste | Sehr lange Seite (3839 px mobil, 3595 px desktop): fünf Listen (Stadt-Challenge, Teams im Monat, Stärkste Teams, Torjäger, Beste Spieler) untereinander ohne Sprungmarken, 18 Spieler je Liste. Alles gleich gewichtet, kein Hinweis, wo das eigene Team steht (Seed Rot ist Platz 1 und nicht markiert). | captain_mobil_rangliste.png, captain_desktop_rangliste.png | distill |
| Y2-C-12 | P2 | rangliste | Tabelle "Teams im November 2026": Zeilen auf Desktop nur ca. 26 px hoch, Teamname und Stadt (zweizeilig) gequetscht; Spalten Sp, S-U-N, Tore, Pkt in Fließtextgröße. Anders als die 44-px-Kartenzeilen darunter, also Bruch der Einheitsoptik. | captain_desktop_rangliste.png, captain_mobil_rangliste.png | audit |
| Y2-C-13 | P2 | rangliste | Filterzeile: Auswahl "Ganz NRW", Monatsfeld und "Anzeigen" brechen mobil in zwei Zeilen um; Monatsfeld ist das native Feld mit Kalenderzeichen; Knopf nötig statt sofortiger Wirkung. Messwert 50 (mobil) und 54 (desktop) kleine Ziele, darunter vermutlich die Kartenzeilen mit Teamlinks. | captain_mobil_rangliste.png | adapt |
| Y2-C-14 | P1 | halle_detail | "Melden"-Link je Bewertung nur ca. 12 px Text, unterstrichen, Ziel weit unter 44 px und direkt unter dem Text; Messwert 16 kleine Ziele mobil. | captain_mobil_halle_detail.png, captain_desktop_halle_detail.png | audit |
| Y2-C-15 | P2 | halle_detail | Mobil brechen Bewertungskarten unschön: Vor- und Nachname trennen ("Elias / Testmann"), Datum als zweizeiliger Block rechts daneben. Auf Desktop sauber. Sterne als Zeichen ohne Text ("★★★☆☆" ohne "3 von 5"). | captain_mobil_halle_detail.png | adapt |
| Y2-C-16 | P2 | halle_detail | Bewertungsformular unten ohne eigene Überschrift ("Deine Bewertung" nur als Feldlabel), allgemeines "Senden" als Knopf. Nicht erkennbar, ob nur Spieler, die dort gespielt haben, bewerten dürfen (Missbrauchs- und Fairnessfrage); ein Captain sieht dasselbe Formular wie jeder. | captain_desktop_halle_detail.png | clarify |
| Y2-C-17 | P2 | halle_detail | "Partner" steht als kleine Plakette im h1 (hallen/[id]/page.tsx:22): Screenreader liest "Seed-Halle NordPartner" (Messwert h1). Bedeutung von "Partner" nirgends erklärt. | captain_mobil_halle_detail.png | audit |
| Y2-C-18 | P2 | hallen | Stadtfilter braucht den Knopf "Anzeigen"; OSM-Quellenzeile in ca. 12 px, langer Absatz im Fuß der Liste ("nicht geprüft", Abschnitt klingt nach Haftungshinweis). Keine Handlung "Halle für Spiel wählen"; Liste führt nur zu Bewertungen. | captain_mobil_hallen.png | distill |
| Y2-C-19 | P2 | halle | Desktop: Inhalt sitzt um 24 px eingerückt (Überschrift bei x=304, alle anderen Seiten bei x=280) wegen `mx-auto max-w-2xl` (halle/page.tsx:109); Bruch der Spaltenachse. Mobil unauffällig. | captain_desktop_halle.png | adapt |
| Y2-C-20 | P2 | profitag | Rechte Statusspalte "Bewerbung offen / 2 Plätze" bricht mobil in drei Zeilen. Karte nennt "Seed Rot · Essen" als Veranstalter, ohne Rolle (Profi-Team oder nicht). Keine Handlungsaufforderung "Bewirb dich" an der Karte selbst. | captain_mobil_profitag.png | adapt |
| Y2-C-21 | P2 | profitag_event | Kopfkarte "Bewerben bis Mi., 18.11., 16:08" bricht mobil auf drei Zeilen; "Plätze 2" und "60 Min" ohne Einheit-Erklärung (Plätze für wen). | captain_mobil_profitag_event.png | adapt |
| Y2-C-22 | P2 | dev_pay | Captain landet auf "Seite nicht gefunden" mit Knopf "Zur Startseite" (Zahlung gehört einem anderen Konto oder Anbieter nicht "dev"; dev/pay/[id]/page.tsx:250-253). Als 404 korrekt und datenschutzfreundlich, die Seite selbst ist reiner Entwicklerbildschirm (siehe MUSS WEG). | captain_mobil_dev_pay.png, captain_desktop_dev_pay.png | critique |
| Y2-C-23 | P1 | Kopfleiste (alle Seiten) | Navigation weicht je Gerät ab: Desktop "Offene Lobbys, Livescore, Rangliste" (Header.tsx:27-34), Handy "Teamspiel, Privatspiel, Spiel suchen, Turniere, Profil". Desktop hat kein Profil, kein Turniere, kein Privatspiel in der Leiste; Handy kein Livescore und keine Rangliste. Auf Ligen, Hallen, Profi-Tag und Halle ist am Handy kein Navigationspunkt aktiv: Standort unklar. | captain_mobil_ligen.png, captain_desktop_ligen.png | adapt |
| Y2-C-24 | P2 | alle | Der Captain-Status ist nirgends sichtbar: Nutzermenü zeigt nur "R Rot"; keine Teamfarbe, kein Team- oder Rollenzeichen. Richtung E sieht Teamfarbe als Identität vor, hier alles neutral-orange. | captain_mobil_rangliste.png, captain_desktop_ligen.png | critique |
| Y2-C-25 | P2 | alle (Handy) | Footer mit 14 Textlinks in ca. 12-13 px, vier Zeilen mit großem Zeilenabstand; auf jeder Seite, auf kurzen Seiten (Ligen, Profi-Tag) die Hälfte des Bildschirms. Begriffe uneinheitlich: "Lobby aufmachen" (Footer, i18n.ts:40) gegenüber "Offene Lobbys" (Kopf) und "Spiel suchen" (Mitte). | captain_mobil_ligen.png, captain_mobil_profitag.png | distill |
| Y2-C-26 | P2 | alle | Alle Karten, Listen und Tabellen identisch (gleiche Fläche, gleicher Rahmen, gleiche Schrift); es gibt kein Spielnummer-Chip, keine Teamfarbe, keinen Trikot-Bezug: "noch fast wie die Vorlage" (Vertrag 013) trifft hier zu. | captain_desktop_hallen.png, captain_desktop_ligen.png | critique |

### Zelle Y2-H: Hallenbetreiber, Handy und Desktop

| ID | Prio | Seite | Beschreibung | Beleg (Datei) | Befehl |
|---|---|---|---|---|---|
| Y2-H-01 | P1 | /halle | Gegenüber Vertrag 011 ist fast alles nicht vorhanden: nur Liste offener Anfragen. Kein Bereich für Buchungen, Auszahlungen, Provisionsrechnungen (AC-5), keine Sperrzeiten (AC-12), keine Antworten auf Bewertungen (AC-6), keine Nennung der Halle. Die Seite ist ein Leerzustand statt Dashboard. Vertrag-Meilensteine M1 bis M5 sind offenbar noch nicht gebaut, daher P1 (Lücke) statt P0. | halle_mobil_halle.png, halle_desktop_halle.png | critique |
| Y2-H-02 | P1 | /halle | Ablehnen ohne Begründung: Knopf "Halle ist belegt" ohne Pflichtfeld (011 AC-3 verlangt Pflicht-Begründung). Nur aus Quelltext (src/app/halle/page.tsx Z. 32-33), das Bild zeigt den Leerzustand. | halle_desktop_halle.png (nur Leerzustand) | audit |
| Y2-H-03 | P1 | /halle | Leerzustand mischt zwei Fälle: "Keine offenen Anfragen ... Ist hier nichts zu sehen, ist für dieses Konto noch keine Halle hinterlegt." Der Betreiber kann "nichts los" und "Konto nicht zugeordnet" nicht unterscheiden; die Halle wird nirgends genannt. Clarify verlangt: Leerzustand unterscheidet Erstnutzung/Berechtigung und gibt den nächsten Schritt. | halle_mobil_halle.png, halle_desktop_halle.png | clarify |
| Y2-H-04 | P1 | /halle, alle | Weg zu /halle nicht sichtbar: untere Navigation (Teamspiel, Privatspiel, Spiel suchen, Turniere, Profil) und Kopf (Offene Lobbys, Livescore, Rangliste) sind reine Spieler-Navigation; /halle nur über Fußlink "Für Hallenbetreiber" (ganz unten, klein). BottomNav.tsx Z. 12-17 und UserMenu.tsx Z. 63-84 ohne Halle-Eintrag. Betreiber wird nicht als Rolle erkannt. | halle_mobil_halle.png, halle_desktop_halle.png | clarify |
| Y2-H-05 | P2 | /halle | Auf Desktop bleiben ca. 60 Prozent der Fläche leer; unter drei Absätzen folgt sofort der Fußbereich. Keine Kennzahlen (offene Anfragen, nächste Spiele). Adapt: Desktop soll mehr Information zeigen, nicht weniger. | halle_desktop_halle.png | adapt |
| Y2-H-06 | P1 | /halle | Texte: "geeinigt", "Veto", "frei/belegt" ohne Erklärung; Vertrag 011 spricht von Zusage/Ablehnung. Die Antwortfrist (Quelltext Z. 29) ist text-xs, obwohl Zeitdruck die wichtigste Information ist (clarify: Fakt zuerst, Konsequenz nennen); die Folge "gilt als belegt" bleibt unscharf gegenüber 011 ("abgelehnt", Captains werden benachrichtigt). Erklärtext (3 Zeilen) wiederholt, was die Überschrift schon sagt. | halle_mobil_halle.png, halle_desktop_halle.png | clarify |
| Y2-H-07 | P1 | /hallen/[id] | Aus Betreibersicht: Bewertungen nur lesbar, mit "Melden"; keine Antwortmöglichkeit (011 AC-6 fehlt). Stattdessen sieht der Betreiber das Formular "Deine Bewertung" (Sterne, Text, Senden) auch für die eigene Halle ohne Rollenhinweis (Comments.tsx Z. 44). | halle_desktop_halle_detail.png, halle_mobil_halle_detail.png | critique |
| Y2-H-08 | P2 | /hallen/[id] | Keine Verbindung zum Betreiber-Bereich (kein Link "Zu den Anfragen"). Badge "Partner" klein (ca. 11 px), orangefarben auf Rosa, Kontrast knapp. | halle_desktop_halle_detail.png | clarify |
| Y2-H-09 | P1 | Kopfzeile (Desktop, alle Seiten) | "0,00 EUR" (Guthaben-Link) im Kopf; Handy zeigt es nicht (hidden sm:inline). Header.tsx Z. 53-55. Für Betreiber sinnlos, im Zielbild (Karte statt Guthaben, Vertrag 012) MUSS WEG. | halle_desktop_halle.png, halle_desktop_hallen.png | distill |
| Y2-H-10 | P2 | /hallen/[id] Handy | Bewertungskarten: Name bricht in zwei Zeilen ("Elias" / "Testmann"), Datum "Mittwoch, 11. November 2026" ebenfalls; ungleiche Kopfzeile. Desktop einzeilig. (Navigationsüberdeckung ist Aufnahmeeffekt.) | halle_mobil_halle_detail.png | adapt |
| Y2-H-11 | P2 | /hallen/[id] | Bewertungsformular mit nativer Auswahl "Sterne" und leerem Textfeld ohne Hilfe; "Melden" kleiner Textlink (unter 44 px, WCAG 2.5.8 mit 24 px Abstand wohl erfüllt). Standardoptik. | halle_desktop_halle_detail.png | audit |
| Y2-H-12 | P2 | /hallen | Liste klar; Sternewert und "4 Bewertungen" rechts ca. 11 px; Filter braucht Knopf "Anzeigen"; OSM-Hinweis lang und klein. | halle_mobil_hallen.png, halle_desktop_hallen.png | audit |
| Y2-H-13 | P2 | alle Seiten | Fußbereich: 13 Textlinks klein, mit großem Zeilenabstand, Ziele unter 44 px; 8+ Optionen auf einmal (Cognitive Load: Wall of Options). Doppelung mit fund_gast/fund_spieler (Verweis). | halle_mobil_halle.png, halle_desktop_halle.png | distill |
| Y2-H-14 | P2 | /rangliste | Für Betreiber irrelevant lang (3839 px Handy, 3595 px Desktop, 18 Torjäger, 18 Spieler); Handy-Tabelle "Teams im November" mit 6 Spalten und ca. 10 px Schrift; 50 bzw. 54 kleine Ziele. | halle_mobil_rangliste.png, halle_desktop_rangliste.png | adapt |
| Y2-H-15 | P2 | /rangliste | "Sp", "S-U-N", "Pkt", "Elo", "Stadt-Challenge" ohne Legende. Verweis fund_gast. | halle_desktop_rangliste.png | clarify |
| Y2-H-16 | P2 | /ligen | Datumsformat roh "2026-10-12 bis 2027-01-10" statt deutscher Schreibweise; "Auch beendete Ligen zeigen" nur kleiner Textlink. | halle_mobil_ligen.png, halle_desktop_ligen.png | clarify |
| Y2-H-17 | P2 | /ligen/[id] beendet | Alle Teams 0 Spiele, 0:0, 0 Punkte, aber "Meister: Seed Rot" (Testdaten-Artefakt, aber sichtbarer Widerspruch). | halle_mobil_liga_beendet.png, halle_desktop_liga_beendet.png | audit |
| Y2-H-18 | P2 | /ligen/[id] | Aktive Liga: Tabelle sauber, kein Überlauf auf 390 px. Rangzahlen blau/violett getönt, im Gegensatz zu den neutralen Teamnamen und zu DESIGN.md (Orange einzige Akzentfarbe, Rest neutral); Teamnamen nicht verlinkt, Meister dagegen schon; keine nächste Handlung. | halle_mobil_liga_aktiv.png, halle_desktop_liga_aktiv.png | critique |
| Y2-H-19 | P2 | /profitag | Status "Bewerbung offen / 2 Plätze" auf Handy dreizeilig und schmal; keine Halle genannt. | halle_mobil_profitag.png, halle_desktop_profitag.png | adapt |
| Y2-H-20 | P1 | /profitag/[id] | Sackgasse: "Nur Team-Admins können sich bewerben." ohne nächsten Schritt; die drei Bewerbungen sind reine Namenskarten ohne Status/Link. Clarify: Berechtigungs-Zustand braucht Alternative. | halle_mobil_profitag_event.png, halle_desktop_profitag_event.png | clarify |
| Y2-H-21 | P2 | /dev/pay/[id] | Betreiber sieht "Seite nicht gefunden"; Messwert Status 200 statt 404 bei diesem Inhalt (Quelltext dev/pay/[id]/page.tsx Z. 13-16 ruft notFound(); Status der Messung nicht erklärt). Text selbst verständlich, "Zur Startseite" führt weg. | halle_mobil_dev_pay.png, halle_desktop_dev_pay.png | audit |
| Y2-H-22 | P2 | alle | Richtung "Trikot" kaum erkennbar: flaches Graugrün, überall gleiche Karten mit Rand und Rundung, kein eigenes Zeichen (kein Spielnummer-Chip, kein Teamfarben-Element); Seiten sehen untereinander gleich aus (Design-Specificity: austauschbar). Positiv: Orange nur als Hauptknopf, Hell-Variante konsistent. | halle_desktop_halle.png, halle_desktop_hallen.png | critique |
| Y2-H-23 | P1 | /halle | Die Hauptaktionen der Seite ("Halle ist frei", "Halle ist belegt", "Lobby ansehen") haben `!min-h-9` = 36 px (Quelltext Z. 32-34), unter der Projektregel 44 px (PRODUCT.md, Vertrag 013 AC-3); Handy: Hallenbetreiber in der Halle, einhändig. Nur aus Quelltext, im Bild ist kein Knopf. Zusätzlich zwei gleichrangige Knöpfe ohne klare Hauptaktion und Bestätigung. | halle_mobil_halle.png (kein Knopf sichtbar) | audit |
| Y2-H-24 | P2 | /halle | Layout-Abweichung: Inhalt auf /halle ist mit max-w-2xl enger und rückt ein (Überschrift x=304 gegenüber Logo/Fußbereich x=280); Überschrift kleiner (text-2xl) als auf /hallen. Uneinheitliche Seitenköpfe. | halle_desktop_halle.png, halle_desktop_hallen.png | adapt |

### Zelle Y2-O: Streamer (Overlay, ohne Login), 1280 x 800 und OBS 1920 x 1080

| ID | Prio | Seite | Beschreibung | Beleg (Datei) | Befehl |
|---|---|---|---|---|---|
| Y2-O-01 | P1 | overlay_privat | Privatspiel (und unbekannte ID) liefert nicht ein leeres/transparentes Overlay, sondern die volle App-Fehlerseite „Seite nicht gefunden“ mit Kopfleiste, Anmelden-Knopf, Fußzeile und deckendem hellem Grund. Über dem Spielhintergrund (Bildbeleg `_obs`) ist die Fehlerseite zudem teils unleserlich: Fließtext „Diese Seite gibt es nicht oder nicht mehr“ und Fußzeilenlinks verschwinden fast im Grün, nur der halbdurchsichtige helle Kopfstreifen und der orange Knopf „Zur Startseite“ bleiben lesbar. In OBS würde sie große Teile des Streams mit Seitenrahmen überdecken, statt dass nichts oder eine kleine Meldung erscheint. Streamer erfährt nicht, WARUM (nicht öffentlich?). Quelltext: `notFound()` in page.tsx Z. 13, Layout-Rahmen aus `layout.tsx`, `not-found.tsx` | gast_obs1920_overlay_privat_obs.png, gast_d1280_overlay_privat_obs.png, gast_obs1920_overlay_privat.png | critique |
| Y2-O-02 | P1 | alle 4 | Keine Anleitung für den Streamer am Overlay selbst: Die URL steht nur auf `/spiele/[id]` im eingeklappten Bereich „Live-Stream eintragen“, nur für Nutzer mit Verwaltungsrecht (`canManage`), als `text-xs` gedämpft; Text „Adresse dieser Seite plus /overlay/…“ verlangt manuelles Zusammensetzen, kein Kopierknopf, keine Angabe der Größe (1920 x 1080), keine Nennung, dass „Privat“ nicht geht. Ein Streamer ohne Verwaltungsrecht (z. B. Zuschauer/Moderator) bekommt die URL gar nicht (aus Quelltext StreamForm.tsx, page.tsx Z. 81) | gast_obs1920_overlay_gespielt.png (zeigt nur den Balken, keine Hilfe) | clarify |
| Y2-O-03 | P1 | alle 4 | Verbindungsstatus ist für den Streamer unsichtbar: `LiveIndicator` steckt in `sr-only`, „● Live“ / „○ Verbinde…“ erscheinen nie. Bricht die SSE-Verbindung ab, bleibt der Spielstand stehen (nur 30-s-Ersatzabfrage per `router.refresh()`), ohne Hinweis. Für Live-Betrieb im Stream ist das Anzeigefehler-Risiko (falscher Stand unbemerkt). Aus Quelltext (LiveIndicator.tsx, page.tsx Z. 28), Bild zeigt: kein Statuszeichen | gast_obs1920_overlay_gespielt.png | clarify |
| Y2-O-04 | P2 | bestaetigt, lobby | Zustände Lobby, Bestätigt und Geplant sind im Overlay nicht unterscheidbar: beide zeigen „0 : 0“ mit „Geplant“. Das Overlay zeigt für ein noch nicht begonnenes Spiel einen Spielstand 0:0, was wie ein laufendes Spiel mit null Toren wirkt. Phase kommt nur aus `PHASE_LABEL` (Geplant/Läuft/Ergebnis wartet…/Beendet/strittig/abgesagt) | gast_d1280_overlay_bestaetigt.png, gast_d1280_overlay_lobby.png, gast_obs1920_overlay_lobby.png | clarify |
| Y2-O-05 | P2 | alle 3 sichtbaren | Phase-Beschriftung rechts ist `text-xs` (12 px) in gedämpfter Farbe: bei 1920 x 1080 im Stream (oft verkleinert/komprimiert) kaum lesbar; Kontrast gegen die Fläche rechnerisch gut (gedämpft ca. 7:1), aber Größe zu klein für Zuschauer. Teamnamen 18 px, Stand 30 px | gast_obs1920_overlay_gespielt.png | adapt |
| Y2-O-06 | P2 | alle 3 sichtbaren | Größe und Position bei 1920 x 1080: Balken ca. 488 x 46 px (rund 25 % der Breite, 4 % der Höhe) oben links bei 16 px Rand, immer gleich groß, nicht skalierbar. Oben links ist in Spiel-Streams oft von der Spielanzeige oder dem Kamerabild belegt; Position nicht wählbar (nur fest `left-4 top-4`). Sichtbare Größe entspricht 1280 px und 1920 px identisch (kein Skalieren), also 1080p-Streamer müssen in OBS selbst skalieren | gast_obs1920_overlay_gespielt.png, gast_d1280_overlay_gespielt.png | adapt |
| Y2-O-07 | P2 | alle 3 sichtbaren | Lange Teamnamen: Namensfelder haben `min-w-40` (160 px), aber keine Obergrenze und kein Abschneiden (`truncate`/`max-w`). Ein langer Teamname oder die lange Phase „Ergebnis wartet auf Bestätigung“ vergrößert den Balken beliebig und kann über den Rand (viewport) hinausreichen. Bild zeigt nur kurze Seed-Namen (Seed Blau, Seed Grün); Überlauf aus Quelltext (page.tsx Z. 20, 26, 27) | gast_d1280_overlay_gespielt.png | adapt |
| Y2-O-08 | P2 | alle 3 sichtbaren | Leere linke Hälfte im Heim-Feld: Heimname ist rechtsbündig (`justify-end`) in 160 px breitem Feld, links bleibt bei kurzen Namen ein dunkler Leerraum (ca. 55 px) – Balken wirkt links unausgewogen, Namen sitzen nicht gleich weit vom Stand | gast_d1280_overlay_gespielt.png | critique |
| Y2-O-09 | P2 | alle 3 sichtbaren | Teamfarbe fehlt: Richtung E sieht Teamfarbe als Identität vor (Namens-Chip, Farbmarke); das Overlay ist rein neutral dunkel mit orangem Stand. Zwei Teams lassen sich nur am Namen, nicht an Farbe unterscheiden. Produktentscheid, kein Fehler | gast_obs1920_overlay_bestaetigt.png | critique |
| Y2-O-10 | P2 | alle 3 sichtbaren | Lesbarkeit über Spielhintergrund (Bildbeleg): Auf dem grünen Verlauf sind Teamnamen (weiß, 18 px), Stand (schwarz auf Orange, 30 px, ca. 6:1) und „Beendet/Geplant“ (hellgrau, 12 px) gut lesbar, weil die Fläche fast deckend dunkel ist (`.force-dark`, fest dunkel, unabhängig von der Systemeinstellung). Aber die Fläche hebt sich vom dunkelgrünen Bereich oben links nur schwach ab (ca. 1,5:1), Rahmen `border-accent/40` und Schatten sind dort kaum zu sehen; der Balken wirkt wie ein dunkler Streifen ohne klare Kante, nur der orange Stand trägt die Einblendung. Gegenüber dem 1920-Bild ist der Balken klein (ca. 25 % Breite, 4 % Höhe). Hellen Grund zeigt das Bild an der Balkenstelle nicht | gast_obs1920_overlay_gespielt_obs.png, gast_d1280_overlay_gespielt_obs.png, gast_obs1920_overlay_lobby_obs.png | audit |
| Y2-O-11 | P2 | alle 4 | Texte fest deutsch, nicht über `getT()`: `aria-label` „Spielstand X zu Y“ und Seitentitel „Overlay“ sind eingebaut; `PHASE_LABEL` ebenfalls einsprachig. Für englischsprachige Streamer bleibt Deutsch. Gering, da Zielgruppe NRW | Quelltext page.tsx Z. 7, 21 | audit |
| Y2-O-12 | P2 | alle 4 | Fragile Ausblendung des App-Rahmens: Kopf, Fuß und Navigation werden per CSS-Selektor (`body > header, body > footer, body > nav`, `main > :not(.overlay-root)`) versteckt, nicht per eigenem Layout. Funktioniert im Bild (kein App-Rahmen sichtbar), bricht aber, sobald Header/Footer in Wrapper gepackt werden (z. B. beim Umbau M2/M3). Überdies lädt die Seite Header/Footer/BottomNav/PwaRegister im Hintergrund trotzdem (Datenabfragen für ein Overlay unnötig) | gast_obs1920_overlay_gespielt.png (Rahmen aktuell weg); Quelltext page.tsx Z. 19, layout.tsx | distill |
| Y2-O-13 | P3 | alle (Bild) | Schwarzer runder „N“-Knopf unten links ist die Next-Dev-Anzeige: Aufnahmeeffekt, kein Fund. Nur vermerkt, damit er nicht gezählt wird | alle Bilder | audit |

## MUSS WEG

Guthaben-Texte, Dev-Pay-Seite und Dev-Links, Altmodell-Texte, Seiten und Funktionen, die im Zielbild (Vertrag 012/013) vermutlich entfallen. Nur vorgemerkt, nicht umgebaut; Produktfragen (Ligen, Profitag, Stadt-Challenge, Hallenbewertungen) entscheidet der Nutzer.

### MUSS WEG Y2-G: Gast

Vormerken, nicht umbauen. Entscheid beim Nutzer, wo "Produktfrage" steht.

| Seite | Wortlaut/Stelle | Beleg | Quelltext | Begründung |
|---|---|---|---|---|
| halle (Anmeldeseite) | "Google-Login ist noch nicht eingerichtet (AUTH_GOOGLE_ID fehlt). Lokal kannst du den Dev-Login nutzen." | gast_mobil_halle.png, gast_desktop_halle.png | `src/app/anmelden/page.tsx` Zeilen 17, 42 | Nur lokal sinnvoll, Entwicklertext mit Variablenname, im Zielbild nicht für Nutzer. |
| halle (Anmeldeseite) | Karte "Dev-Login (nur lokal)", Felder E-Mail, Name, Knopf "Als Dev-Nutzer anmelden" | gast_mobil_halle.png, gast_desktop_halle.png | `src/app/anmelden/page.tsx` Zeile 59 | Dev-Link, nur lokal; muss in Produktion nie erscheinen. |
| dev_pay | Ganze Seite `/dev/pay/[id]` ("Test-Zahlung: Hier fließt kein Geld. Das ist der Platz für Stripe", Knöpfe "Zahlung erfolgreich", "Abbrechen") | gast_mobil_dev_pay.png, gast_desktop_dev_pay.png (Gast sieht 404; Inhalt aus Quelltext) | `src/app/dev/pay/[id]/page.tsx` Zeilen 11 bis 38 | Dev-Pay-Seite, nur lokal, entfällt mit Stripe; Betrag/"bezahlen" gehört zum Zahlungsfluss. |
| ligen, liga_aktiv, liga_beendet | Ganze Seitengruppe Ligen ("Alle gespielten Spiele zwischen den Teams einer Liga zählen automatisch für die Tabelle", Meister) | gast_mobil_ligen.png, gast_desktop_liga_aktiv.png, gast_desktop_liga_beendet.png | `src/app/ligen/page.tsx`, `src/app/ligen/[id]/page.tsx` | Im Zielbild (Vertrag 013 Richtung E, 012 Kartenmodell) vermutlich nicht vorgesehen, in keiner Navigation verlinkt. Produktfrage: vormerken, Entscheid beim Nutzer. |
| profitag, profitag_event | Ganze Seitengruppe Profi-Tag ("Anmelden und bewerben", "Bewerbungen (3)") | gast_mobil_profitag.png, gast_desktop_profitag_event.png | `src/app/profitag/page.tsx`, `src/app/profitag/[id]/page.tsx`, `ApplyForm.tsx` | Nebenrolle laut PRODUCT.md, in keiner Navigation verlinkt, im Zielbild vermutlich entfallend. Produktfrage: vormerken, Entscheid beim Nutzer. |
| rangliste | Block "Stadt-Challenge im November 2026" ("Siege von Teams einer Stadt gegen Teams anderer Städte...") | gast_mobil_rangliste.png, gast_desktop_rangliste.png | `src/app/rangliste/page.tsx` Zeile 35 | Randfunktion, steht ganz oben, nicht im Kartenmodell erkennbar. Produktfrage: vormerken, Entscheid beim Nutzer. |

Keine Guthaben-, Aufladen-, Rabattcode- oder Altmodus-Texte auf den Gast-Seiten dieser Zelle sichtbar.

### MUSS WEG Y2-S: Spieler

Nur vormerken, kein Umbau. Produktfragen sind als "vormerken, Entscheid beim Nutzer" gekennzeichnet.

| Seite | Wortlaut/Stelle | Beleg | Quelltext | Begründung |
|---|---|---|---|---|
| alle (Desktop), Kopfleiste | "0,00 €" (Guthaben-Link zu /app/guthaben, test-id header-wallet) | spieler_desktop_rangliste.png, spieler_desktop_ligen.png | src/components/Header.tsx Zeilen 17, 53, 54 | Guthaben ist Altmodell. Zahl ohne Wort, ohne Handlung. Auch `balanceText` im Nutzermenü (src/components/UserMenu.tsx Zeile 71, nicht abgebildet, aus Quelltext). |
| dev_pay | ganze Seite `/dev/pay/[id]`: "Test-Zahlung: Hier fließt kein Geld. Das ist der Platz für Stripe.", "Zahlung erfolgreich", "Abbrechen", "({status})" | spieler_mobil_dev_pay.png, spieler_desktop_dev_pay.png (nur 404 sichtbar) | src/app/dev/pay/[id]/page.tsx Zeilen 9 bis 32; `devPayAction` in src/server/wallet-actions.ts | Dev-Pay-Seite, nur lokal; mit Stripe überflüssig. Zugehörig: Dev-Links, die auf diese Seite führen. Vormerken. |
| halle | ganze Seite `/halle` für Nicht-Betreiber; Fußlink "Für Hallenbetreiber" in Spieler-Oberfläche | spieler_mobil_halle.png, spieler_desktop_halle.png, spieler_mobil_ligen.png (Fußlink) | src/app/halle/page.tsx Zeilen 12 bis 20; src/components/Footer.tsx Zeile 23 | Zeigt für Spieler eine leere Betreiberseite; im Zielbild gehört sie ins Betreiber-Dashboard (011/013 M6). Produktfrage (Einstieg Betreiber): vormerken, Entscheid beim Nutzer. |
| profitag, profitag_event | Seiten `/profitag` und `/profitag/[id]` mit "Nur Team-Admins können sich bewerben." und Bewerberliste | spieler_mobil_profitag.png, spieler_mobil_profitag_event.png | src/app/profitag/page.tsx; src/app/profitag/[id]/page.tsx Zeilen 42, 52 bis 72; ApplyForm.tsx | Nicht im Navigationsgerüst verlinkt, Randfunktion, im Kartenmodell (012) nicht vorgesehen. Produktfrage Profitag: vormerken, Entscheid beim Nutzer. |
| ligen, liga_aktiv, liga_beendet | Seiten `/ligen` und `/ligen/[id]`, Beitrittskasten "Dein Team / Anmelden" | spieler_mobil_ligen.png, spieler_mobil_liga_aktiv.png, spieler_mobil_liga_beendet.png | src/app/ligen/page.tsx; src/app/ligen/[id]/page.tsx Zeilen 74 bis 98 | Nicht verlinkt (Fußzeile ohne Ligen), im Zielbild nicht beschrieben. Produktfrage Ligen: vormerken, Entscheid beim Nutzer. |
| halle_detail | Bewertungs-/Kommentarbereich mit "Melden" und eigenem "Löschen" | spieler_desktop_halle_detail.png | src/components/Comments.tsx Zeilen 34, 37 | Nur Prüfhinweis, kein sicherer Fall: Funktion (Hallenbewertungen) bleibt vermutlich; Moderation und Formular sind Produktfrage. Nicht als MUSS WEG gewertet, nur zur Kenntnis (vormerken, Entscheid beim Nutzer). |

### MUSS WEG Y2-C: Captain (Team-Admin)

(Nur vormerken, nicht umbauen; Entscheid beim Nutzer.)

| Seite | Wortlaut/Stelle | Beleg | Quelltext | Begründung |
|---|---|---|---|---|
| alle (Desktop) | Guthaben "0,00 €" in der Kopfleiste, Link "Guthaben" | captain_desktop_rangliste.png, captain_desktop_ligen.png, captain_desktop_halle_detail.png (jede Desktop-Aufnahme) | Header.tsx:17, 53-55 | Altmodell (Guthaben/Aufladen), im Zielbild entfällt das Konto-Guthaben; Vormerken. |
| alle (Menü, Handy und Desktop) | Menüpunkt "Guthaben" mit Betrag im Nutzermenü | im Bild nur zu erkennen: Menü geschlossen; aus Quelltext | UserMenu.tsx:70-71, Header.tsx:60 | wie oben; im Bild nicht sichtbar, aus Quelltext. |
| dev_pay | "Test-Zahlung: Hier fließt kein Geld. Das ist der Platz für Stripe", Knöpfe "Zahlung erfolgreich", "Abbrechen" | captain_mobil_dev_pay.png, captain_desktop_dev_pay.png (zeigt nur 404; Seite selbst aus Quelltext) | dev/pay/[id]/page.tsx:247-271 | Dev-Pay-Seite, nur lokal; Entwicklerbildschirm für Altmodell, entfällt mit Stripe. |
| halle | Seite "Spielanfragen für eure Halle" für Captain sichtbar; Footer-Link "Für Hallenbetreiber" für alle Rollen | captain_mobil_halle.png, captain_desktop_halle.png | halle/page.tsx:106-113, Footer.tsx:23 | Betreiberfunktion; Platz im Zielbild vermutlich Halle-Dashboard (011). Vormerken: Produktfrage, Entscheid beim Nutzer. |
| ligen, liga_aktiv, liga_beendet | Ganze Liga-Seiten (Tabelle, "Anmelden/Abmelden") | captain_mobil_ligen.png, captain_mobil_liga_aktiv.png, captain_mobil_liga_beendet.png | ligen/page.tsx, ligen/[id]/page.tsx:74-90 | Im Zielbild (Vertrag 012/013) nirgends vorgesehen, nicht verlinkt (Y2-C-04). Vormerken: Produktfrage (Ligen), Entscheid beim Nutzer. |
| profitag, profitag_event | Ganze Profi-Tag-Seiten, "Mit diesem Team bewerben" | captain_mobil_profitag.png, captain_mobil_profitag_event.png | profitag/page.tsx, profitag/[id]/page.tsx:186-187, ApplyForm.tsx:18 | Nebenrolle, im Zielbild nicht vorgesehen, nicht verlinkt. Vormerken: Produktfrage (Profitag), Entscheid beim Nutzer. |
| alle (Footer) | "Lobby aufmachen", Kopf "Offene Lobbys" | captain_mobil_ligen.png, captain_desktop_ligen.png | Footer.tsx:21 (`footer.matchmaking`), i18n.ts:40, Header.tsx:27 | Begriff gehört zum Lobby-Altmodus; im Zielbild "Spiel suchen". Vormerken, Wortwahl mit Nutzer klären. |

### MUSS WEG Y2-H: Hallenbetreiber

| Seite | Wortlaut/Stelle | Beleg | Quelltext | Begründung |
|---|---|---|---|---|
| Kopf (alle, Desktop) | "0,00 EUR" Guthaben-Link | halle_desktop_halle.png | src/components/Header.tsx Z. 53-55 | Altmodell Guthaben; Vertrag 012: Karte statt Guthaben |
| Benutzermenü | Eintrag Guthaben mit Betrag | (Menü nicht im Bild; aus Quelltext) | src/components/UserMenu.tsx Z. 69-71 | Altmodell Guthaben |
| /dev/pay/[id] | gesamte Seite (hier nur "Seite nicht gefunden") | halle_mobil_dev_pay.png | src/app/dev/pay/[id]/page.tsx Z. 13-16 | Dev-Pay, nur lokal |
| /ligen, /ligen/[id] | Ligen, Meister, Tabellen | halle_mobil_ligen.png, halle_mobil_liga_beendet.png | src/app/ligen/page.tsx Z. 31; src/app/ligen/[id]/page.tsx Z. 36 | Im Zielbild vermutlich entfallen; vormerken, Entscheid beim Nutzer |
| /profitag, /profitag/[id] | "Profi-Tag", "Bewerbung offen", "Nur Team-Admins können sich bewerben." | halle_mobil_profitag.png, halle_mobil_profitag_event.png | src/app/profitag/[id]/page.tsx Z. 52 | Im Zielbild vermutlich entfallen; vormerken, Entscheid beim Nutzer |
| /halle | "Halle ist frei" / "Halle ist belegt", Veto-Text ("Die Teams wählen danach unter allen freien Hallen per Veto") | halle_desktop_halle.png | src/app/halle/page.tsx Z. 18, 32-33 | Altmodell (Veto); Vertrag 011 verlangt Zusage/Ablehnung mit Begründung; vormerken, Entscheid beim Nutzer |

### MUSS WEG Y2-O: Streamer (Overlay, ohne Login)

| Seite | Wortlaut/Stelle | Beleg | Quelltext | Begründung |
|---|---|---|---|---|
| overlay (alle) | **keine Fundstelle**: Das Overlay enthält weder Guthaben-, Aufladen-, Rabatt-/Promo- noch Altmodell-Texte, weder Dev-Links noch Altmodus. Sichtbar sind nur Teamnamen, Stand und Phase. | alle 16 Bilder | `src/app/overlay/[id]/page.tsx` (ganze Datei, 33 Zeilen), `LiveIndicator.tsx` | Suche nach Guthaben/Aufladen/Wallet im Overlay-Ordner ohne Treffer. |
| (Nachbarstelle, nicht Overlay) | Der unsichtbare App-Rahmen (Header mit Guthaben, `nav.wallet` „Guthaben“) wird per CSS versteckt, aber mitgeladen. Beim Umbau des Rahmens darf Guthaben im Kopf nicht ins Overlay durchscheinen. | gast_obs1920_overlay_gespielt.png (Kopf nicht sichtbar) | `src/lib/i18n.ts` Z. 33 (`nav.wallet`), page.tsx Z. 19 | Nur Hinweis: Für Gast ist Guthaben im Kopf ohnehin nicht sichtbar. Guthaben-Texte gehören zur MUSS-WEG-Liste anderer Zellen, kein Eintrag für das Overlay selbst. Vormerken, Entscheid beim Nutzer. |
| Seite `/spiele/[id]` (Nebenstelle des Overlays) | „Für OBS: Füge eine Browser-Quelle … /overlay/{id} …“ und „Daten als JSON: /api/spiele/{id}/live“ | nicht in Y2-O-Bildern | `src/app/spiele/[id]/StreamForm.tsx` Z. 17 bis 19 | Kein Altmodell, das Overlay bleibt im Zielbild gebraucht (Streamer als Nebenrolle in PRODUCT.md). Nur als Hinweis: JSON-Adresse im Nutzertext ist Entwicklerwissen, könnte aus dem Streamer-Text. Produktfrage, vormerken, Entscheid beim Nutzer. |

Ergebnis: **0 echte MUSS-WEG-Stellen im Overlay** (2 Hinweiszeilen zu Nachbarstellen).

## Nicht prüfbar und Lücken

### Lücken Y2-G

- Zustände ohne Daten (leere Liga-Liste, "Noch keine Bewerbung", Halle ohne Bewertungen, leere Rangliste): nicht im Bild, nur teilweise aus Quelltext bekannt (`Noch keine Bewerbung.` in `profitag/[id]/page.tsx` Zeile 57).
- /halle für Gast zeigt die Anmeldeseite; wie die Seite für Betreiber, Spieler, Captain aussieht, ist nicht Teil dieser Zelle.
- /dev/pay: Der eigentliche Zahlungsbildschirm ist für Gast nicht sichtbar (404); Inhalt nur aus Quelltext.
- Fokus, Tastatur, Hover, Bildschirmleser, Dunkelmodus: keine Bilder; nicht geprüft. Kontrastwerte nur nach Augenmaß (gedämpfte Schrift auf Hellgrün sieht in 12-px-Fußzeile grenzwertig aus, aber nicht gemessen).
- Kein eigener `detect`-Lauf der Zelle (der Analyse-Leiter hat `detect` auf Quelltext und fünf URLs ausgeführt, siehe Detect); keine isolierten Assessments A und B.
- Das Overlay (`gast_d1280_*`, `gast_obs1920_*`) gehört nicht zu dieser Zelle.

### Lücken Y2-S

- Zahlungsbildschirm `/dev/pay/[id]` (eigene Zahlung): Der Spieler erhielt 404. Die Testzahlung gehört offenbar einem anderen Konto oder die Aufnahme nutzte eine nicht passende ID. Layout, Knöpfe und Texte sind nur aus Quelltext bekannt (S-18). Ebenso nicht gesehen: Bildschirm bei "bereits abgeschlossen".
- Bewerbungsformular auf `/profitag/[id]` (ApplyForm: "Mit diesem Team bewerben", Erfolgsmeldung "Bewerbung abgeschickt. Viel Glück!"): wird nur für Team-Admins gezeigt, nur aus Quelltext. Ebenso Zustände "ausgelost", "abgesagt", "Gewonnen / Nicht gelost" und "Zurückziehen".
- Ligabeitritt ("Dein Team", "Anmelden", "Abmelden", Bestätigungsdialog): für Spieler unsichtbar, nur aus Quelltext (S-03).
- Leere Zustände ohne Daten ("Gerade läuft keine Liga.", "Noch keine Teams in dieser Liga.", "Noch keine Bewerbung."): aus Quelltext, nicht im Bild.
- Nutzermenü (aufgeklappt) und Glocke: nicht aufgenommen, daher nicht bewertet; Guthaben dort nur aus Quelltext.
- Kontrastwerte sind geschätzt, nicht gemessen; Hover, Fokus, Tastatur und Reduced Motion nicht prüfbar (Standbilder).
- Hell/Dunkel: nur das helle Thema aufgenommen.
- Löschen einer eigenen Bewertung: Bestätigungsdialog aus Bild nicht prüfbar.

### Lücken Y2-C

- Captain-Zustände ohne Bild: Liga-Beitritt "Anmelden" (Seed Rot ist schon in der Liga), Profitag-Bewerbungsformular und "Zurückziehen" (Seed Rot ist selbst Profi-Team des Ereignisses), beendete/abgesagte Profi-Tage, Leere-Zustände "Gerade läuft keine Liga", "Noch keine Bewerbung", "Noch keine Teams in dieser Liga": alle aus Quelltext (ligen/page.tsx:18, profitag/[id]/page.tsx:192, ligen/[id]/page.tsx:42).
- Dev-Pay: im Bild nur 404; der echte Bildschirm ist nicht aufgenommen.
- `/halle` mit Anfragen (Betreiber-Sicht) nicht aufgenommen.
- Hell-/Dunkelmodus: nur der helle Modus ist abgebildet; Kontrast dunkel nicht prüfbar.
- Keine Detector-, Fokus-, Tastatur- oder Touch-Gestenprüfung (Degradiert).
- Ob Meister "Seed Rot" in Y2-C-06 ein reines Seed-Artefakt ist, ist nicht belegbar.

### Lücken Y2-H

- /halle mit echten Anfragen (Karten, Fristanzeige, Knöpfe, Rückmeldung nach Klick): nur aus Quelltext.
- Mehrere Hallen je Betreiber, Zustand "keine Halle zugeordnet", Ladezustand: nicht sichtbar.
- UserMenu offen, Benachrichtigungen, dunkle Variante, Tastatur, Fokus: nicht aufgenommen; Kontrast nur nach Augenmaß, nicht gemessen.
- Betreiber-Antworten, Kalender, Buchungen, Rechnungen: nicht vorhanden, nur als Lücke.
- Kein eigener Detector-Lauf der Zelle (siehe Detect), keine Messung echter Zielgrößen jenseits der Messwertdatei.
- Leere-Zustände von Ligen/Profitag: nicht geprüft.

### Lücken Y2-O

- Keine Blockade mehr: Die zuvor fehlerhaften `_obs`-Aufnahmen (Hintergrund fehlte) wurden neu aufgenommen und erneut einzeln ausgewertet.
- Der Balken sitzt fest oben links, also nur im dunklen Bereich des Verlaufs; wie er auf hellem Spielbild (Verlauf rechts unten) wirkt, ist nicht abgebildet (aus Quelltext: Fläche 90 % deckend dunkel, daher Text wohl lesbar).
- Zustände nicht aufgenommen (aus Quelltext): laufendes Spiel mit Live-Stand, „Ergebnis wartet auf Bestätigung“, „Ergebnis strittig“, „Abgesagt“, abgebrochene SSE-Verbindung, sehr lange Teamnamen.
- Selbstaktualisierung (SSE `/api/spiele/[id]/events`, `router.refresh()` bei „update“, zusätzlich alle 30 s) nicht am Bild prüfbar; Konsole leer (Messwert).
- Echte OBS-Umgebung (CEF, Hintergrund wirklich transparent, `html, body { background: transparent !important }`) nicht prüfbar; im Bild ist Weiß der Seitengrund, der Grund ist ohne OBS nicht erkennbar transparent. Ob im Overlay auf dem Weiß etwas überstrahlt, nicht erkennbar.
- Status 200 für Privat: Messwert sagt 200; echter HTTP-Statuscode einer 404-Seite unter Streaming nicht belegt.
- Hell/Dunkel des Overlays: kein Systemmodus-Wechsel aufgenommen; `.force-dark` macht es unabhängig (aus Quelltext).

## Fundblätter

Je Zelle: Kopf (Zähler, Bildliste, Degradiert-Vermerk), Durchgänge je Seite mit den fünf Befehlen und Auffälligkeiten der Messwerte.

### Fundblatt Y2-G: Gast, Handy 390 x 844 und Desktop 1280 x 800

#### Kopf

- Zelle: Y2-G, Rolle Gast (nicht angemeldet), Geräte Handy und Desktop.
- Zähler: angesehen 20 von 20.
- Dateien: gast_mobil_rangliste.png, gast_mobil_ligen.png, gast_mobil_liga_aktiv.png, gast_mobil_liga_beendet.png, gast_mobil_halle.png, gast_mobil_hallen.png, gast_mobil_halle_detail.png, gast_mobil_profitag.png, gast_mobil_profitag_event.png, gast_mobil_dev_pay.png, gast_desktop_rangliste.png, gast_desktop_ligen.png, gast_desktop_liga_aktiv.png, gast_desktop_liga_beendet.png, gast_desktop_halle.png, gast_desktop_hallen.png, gast_desktop_halle_detail.png, gast_desktop_profitag.png, gast_desktop_profitag_event.png, gast_desktop_dev_pay.png. Keines fehlte, keines leer oder kaputt.
- Degradiert: ja (manuell nach Reference). Die fünf Befehle critique, audit, distill, clarify, adapt wurden einzeln nach den Reference-Dateien durchlaufen, aber ohne weitere Unter-Agents (Assessment A und B nicht isoliert; die Zelle war selbst ein Sub-Agent), ohne eigenen `detect`-Lauf und ohne eigenen Browser (Aufnahme und `detect` siehe Methodik und Detect, durch den Analyse-Leiter) (Auftrag: kein Server, kein Browser). Audit stützt sich auf Bilder, Messwerte und Quelltext, Kontrastwerte sind geschätzt (Augenmaß), nicht gemessen. Gelesen: critique, audit, distill, clarify, adapt, PRODUCT.md, DESIGN.md, Vertrag 013.
- Hinweis: Testdaten (Name "Testmann", Seed-Teams, gleiche Bewertungsdaten) sind Seed, kein Fund. Ein Nutzer-Befund "Standardoptik" gilt dem Look: Hell-Theme mit Orange passt zu Richtung E, die Seiten wirken aber wie ein generisches Karten-Listen-Muster (eine Kartenform für alles).

#### Durchgänge

Alle Durchgänge: Degradiert: ja (manuell nach Reference). Ein Eintrag gilt für Handy und Desktop, Unterschiede sind genannt.

| Seite | critique | audit | distill | clarify | adapt |
|---|---|---|---|---|---|
| rangliste | Fünf gleichgewichtige Blöcke, keine Hierarchie, Elo-Karten ohne Eigenart (G-05, G-07, G-23) | 49/52 kleine Ziele, Mini-Tabelle 24 px Zeilen, kein Overflow, keine Konsolenfehler (G-06) | Nur Top 5 bis 10 je Block, Stadt-Challenge nachrangig oder eigene Seite; Dopplung Teams (Monat und Elo) prüfen (G-05) | "1 Siege in 1 Spielen", S-U-N, Elo ohne Erklärung (G-08) | Handy 3839 px lang ohne Sprungmarken, Desktop 720-px-Spalte leer daneben; Filter mit Anzeigen-Knopf (G-09) |
| ligen | Keine Navigation dorthin, Orientierung fehlt (G-01, G-02) | 8/11 kleine Ziele, Toggle-Link klein (G-11) | Liste schlank, nichts zu entfernen; Seite hat nur 1 Eintrag | ISO-Datum (G-10) | Handy viel Leere, Desktop 720 px schmal (G-14) |
| liga_aktiv | Klare Tabelle, aber isoliert, ohne Spielplan (G-14) | 11/14 kleine Ziele (Fuß); Spaltenköpfe 12 px (G-24) | Tabelle ist das Wesentliche, ok | Legende für Sp/S-U-N/Tore fehlt, Teamlinks unklar (G-12), ISO-Datum | Tabelle passt auf 390 px ohne Überlauf (positiv); Desktop leer darunter |
| liga_beendet | Meister-Zeile gut sichtbar, Tabelle widerspricht (Seed-Effekt) (G-13) | wie liga_aktiv | keine Funde | 0-Tabelle ohne Erklärung (G-13), ISO-Datum | Titel bricht auf Handy in zwei Zeilen, akzeptabel |
| halle | Gast sieht Anmeldeformular statt Betreiberbereich ohne Kontext (G-03) | 7/10 kleine Ziele; Entwicklerformular mit vorbefüllter Adresse sichtbar (G-04) | Dev-Login und Hinweiskasten komplett entbehrlich (siehe MUSS WEG) | AUTH_GOOGLE_ID-Text, "Dev-User" (G-04) | Formular passt auf 390 px, Knopf "Als Dev-Nutzer anmelden" in Ghost-Stil statt Hauptknopf |
| hallen | Saubere Liste, aber ohne Handlung und Filter (G-15) | 8/11 kleine Ziele, Stadtauswahl 44 px ok | Hinweistext OSM kürzen | "Partner" unerklärt, "Anzeigen"-Zwang (G-15) | Handy: Karten gut; Desktop: 720 px schmal |
| halle_detail | Keine nächste Handlung für Gast (G-17) | 12/15 kleine Ziele; Sterne als Zeichen (G-16) | Dreispalten-Kasten Boden/Duschen/Parkplatz ok; Bewertungskarten wiederholen gleiche Daten | "Anmelden, um zu bewerten" klein am Ende (G-17) | Handy: Name und Datum brechen (G-16); Desktop sauber |
| profitag | Gute Einführung, aber Seite ist Randfunktion ohne Zugang (G-02) | 7/10 kleine Ziele | Produktfrage Profitag (siehe MUSS WEG) | Wer ist Profi, ob Team nötig (G-18) | Status bricht auf Handy (G-18) |
| profitag_event | Hauptknopf klar; Bewerberliste nackt (G-19) | 11/14 kleine Ziele; Hauptknopf 44 px ok | Bewerbungsliste für Gast entbehrlich (nur Zahl) | Voraussetzung Team nicht vor dem Knopf genannt (G-19) | Datumsfeld bricht auf 3 Zeilen (Handy) |
| dev_pay | 404 für Gast erwartet, klar, mit Hauptknopf (G-22) | Status 200 trotz Fehlerseite im Messwert (G-22) | Seite ist reine Entwicklerfunktion (MUSS WEG) | 404-Text gut, nennt aber nicht "Anmeldung nötig" (nicht unterscheidbar, Datenschutz-Absicht) | Mobil und Desktop gleich |

#### Messwerte

- Kein horizontaler Überlauf (alle 20), keine Konsolenfehler, je Seite genau ein h1.
- /halle endet bei Gast auf /anmelden (erwartet); /dev/pay liefert 404-Inhalt, aber `status: 200` im Messwert.
- Kleine Ziele: Rangliste 49 (Handy) und 52 (Desktop), alle anderen Seiten 7 bis 15; ein Großteil der Basiszahl 7 bis 10 entspricht der Fußzeile und Kopfleiste (auf jeder Seite gleich).
- Seitenhöhen: Rangliste 3839 px (Handy) gegen 3595 px (Desktop): der Desktop spart kaum Länge, weil die Spalte 720 px breit bleibt.

angesehen 20 von 20

### Fundblatt Y2-S: Spieler, Handy und Desktop

#### Kopf

- Zelle: Y2-S, Rolle Spieler, Geräte Handy und Desktop.
- Zähler: angesehen 20 von 20.
- Dateien: spieler_mobil_rangliste.png, spieler_mobil_ligen.png, spieler_mobil_liga_aktiv.png, spieler_mobil_liga_beendet.png, spieler_mobil_halle.png, spieler_mobil_hallen.png, spieler_mobil_halle_detail.png, spieler_mobil_profitag.png, spieler_mobil_profitag_event.png, spieler_mobil_dev_pay.png, spieler_desktop_rangliste.png, spieler_desktop_ligen.png, spieler_desktop_liga_aktiv.png, spieler_desktop_liga_beendet.png, spieler_desktop_halle.png, spieler_desktop_hallen.png, spieler_desktop_halle_detail.png, spieler_desktop_profitag.png, spieler_desktop_profitag_event.png, spieler_desktop_dev_pay.png. Keines fehlte, keines leer oder kaputt.
- Degradiert: ja (manuell nach Reference). Die fünf Befehle wurden je Seite einzeln nach den Reference-Dateien durchlaufen, aber ohne weitere Unter-Agents (Assessment A und B nicht isoliert; die Zelle war selbst ein Sub-Agent), ohne eigenen `detect`-Lauf und ohne eigenen Browser (Aufnahme und `detect` siehe Methodik und Detect, durch den Analyse-Leiter) (Auftrag: nur lesen, kein Server). Audit stützt sich auf Bilder, Messwerte und Quelltext; Kontrast nur nach Augenmaß. Gelesen: critique, audit, distill, clarify, adapt, PRODUCT.md, DESIGN.md, Vertrag 013.
- Doppelungen mit dem Gast (Fußzeile, Navigation, ISO-Datum, Rangliste-Länge, Einheitsoptik, Hallenliste) sind mit Verweis auf `fund_gast.md` (Y2-G-NN) gehalten; eigene Funde stehen nur dort, wo mein Bild etwas Eigenes zeigt. Testdaten (Name "Testmann", Seed-Teams) sind kein Fund.
- Was sich gegenüber dem Gast ändert: Kopfleiste mit Glocke, "0,00 €" (nur Desktop) und Nutzermenü "Anton"; `/halle` zeigt statt Anmeldung eine Betreiberseite (leer); `/dev/pay/[id]` zeigt 404 statt Anmeldung; Profitag-Event zeigt "Nur Team-Admins können sich bewerben"; Halle-Detail zeigt Bewertungsformular und eigene Bewertung mit "Löschen"; Liga zeigt keinen Beitrittskasten.

#### Durchgänge

Alle Durchgänge: Degradiert: ja (manuell nach Reference). Ein Eintrag gilt für Handy und Desktop, Unterschiede sind genannt.

| Seite | critique | audit | distill | clarify | adapt |
|---|---|---|---|---|---|
| rangliste | Eigener Eintrag nicht erkennbar (S-08), Guthaben im Kopf (Desktop, S-05), fünf gleichgewichtige Blöcke wie Gast | 50 (Handy) / 54 (Desktop) kleine Ziele, kein Überlauf, keine Konsolenfehler (S-09) | Top-Listen kürzen, Stadt-Challenge nachrangig (siehe Y2-G-05) | Pluralfehler, S-U-N, Elo (siehe Y2-G-08) | Handy 3839 px ohne Sprungmarken; Desktop 720-px-Spalte (siehe Y2-G-09/14) |
| ligen | Seite nur per URL erreichbar (S-07), "0,00 €" im Kopf (S-05) | 9 (Handy) / 13 (Desktop) kleine Ziele, Toggle-Link klein (S-20) | nichts Entbehrliches außer der Frage, ob Ligen im Zielbild bleiben (MUSS WEG, Produktfrage) | ISO-Datum (S-20) | Handy viel Leere, Fußzeile füllt die Hälfte (S-19) |
| liga_aktiv | Eigenes Team (Seed Rot) nicht markiert, kein Beitrittshinweis (S-03) | 12 (Handy) / 16 (Desktop) kleine Ziele, Tabelle ohne Überlauf auf 390 px (positiv) | Tabelle ist das Wesentliche, ok | Beitritt für Nicht-Captain unsichtbar (S-03); S-U-N ohne Legende | Desktop 720 px, leere Fläche darunter |
| liga_beendet | Meister-Zeile klar, Tabelle widerspricht (Seed) | wie liga_aktiv | keine Funde | 0-Tabelle ohne Hinweis, ISO-Datum (S-20) | Titel bricht auf Handy in zwei Zeilen, akzeptabel |
| halle | Betreiberseite für Spieler, leere Sackgasse (S-01), vertauschte Hierarchie (S-11) | 8 (Handy) / 12 (Desktop) kleine Ziele; keine Rollenprüfung (Quelltext, S-01) | Eintrag aus Spieler-Fußzeile entbehrlich (S-02, Produktfrage) | "eure Halle", "Veto", Raten statt Aussage (S-01, S-11) | Desktop 24 px Versatz gegen Spalte (S-10), Handy ok |
| hallen | Saubere Liste, wie Gast (Y2-G-15); Guthaben im Kopf (S-05) | 9 / 13 kleine Ziele, Stadtauswahl 44 px | OSM-Hinweis kürzen (Y2-G-15) | "Partner" unerklärt (Y2-G-15) | Handy gut, Desktop 720 px |
| halle_detail | Keine nächste Handlung außer Bewertung (S-14) | 16 / 20 kleine Ziele, "Melden/Löschen" winzig, Formular trotz eigener Bewertung (S-12); Sterne mit aria-label (positiv, Quelltext) | Bewertungskarten wiederholen Datum und Name groß, Datum kürzen | Doppelte Bewertung: Was passiert bei "Senden"? (S-12) | Handy: Name/Datum brechen (S-13), Desktop sauber |
| profitag | Randfunktion ohne Zugang (S-07), Frage, ob im Zielbild (MUSS WEG, Produktfrage) | 8 / 12 kleine Ziele | Produktfrage Profitag | Teilnahmebedingung fehlt auf der Übersicht (S-15) | Status bricht auf Handy (S-15) |
| profitag_event | Spieler ohne Handlung, nur Absage-Satz (S-04) | 12 / 16 kleine Ziele | Bewerberliste nur Namen, Zahl genügt (S-16) | "Team-Admin" statt Captain, kein nächster Schritt (S-04, S-16) | "Bewerben bis" bricht auf drei Zeilen (S-16) |
| dev_pay | 404 für angemeldeten Spieler, Bildschirm nicht gesehen (S-17) | Status 200 bei Fehlerseite (Messeffekt, S-17); 8 / 12 kleine Ziele | Seite reine Entwicklerfunktion (MUSS WEG) | Quelltext: Roh-Enum und Entwicklertext (S-18) | Mobil und Desktop gleich |

#### Messwerte

- dev_pay meldet Status 200 und h1 "Seite nicht gefunden" auf Handy und Desktop: das echte 404 kommt durch Streaming erst nach dem Header (Messeffekt, wie beim Gast).
- Kleine Ziele (unter 44 px) je Seite: Rangliste 50 (Handy) / 54 (Desktop), Halle-Detail 16 / 20, Liga 12 / 16, Profitag-Event 12 / 16, übrige 8 bis 13. Gegenüber dem Gast (49/52) leicht höher wegen Kopfleisten-Elementen (Glocke, Nutzermenü, Guthaben). Der Hauptteil stammt aus Fußzeile, Tabellenzeilen und "Melden/Löschen".
- Kein Überlauf (overflowX false) und keine Konsolenfehler auf allen 20 Aufnahmen.
- Handyhöhen: Rangliste 3839 px, Halle-Detail 1512 px, Hallen 880 px (Nav überlagert Fußzeile), übrige 844 px (eine Bildschirmhöhe, Fußzeile füllt den Rest).

### Fundblatt Y2-C: Captain (Team-Admin), Handy und Desktop

#### Kopf

- Zelle: Y2-C, Rolle Captain, Geräte Handy und Desktop.
- Zähler: **angesehen 20 von 20**.
- Dateien Handy: captain_mobil_rangliste.png, captain_mobil_ligen.png, captain_mobil_liga_aktiv.png, captain_mobil_liga_beendet.png, captain_mobil_halle.png, captain_mobil_hallen.png, captain_mobil_halle_detail.png, captain_mobil_profitag.png, captain_mobil_profitag_event.png, captain_mobil_dev_pay.png.
- Dateien Desktop: captain_desktop_rangliste.png, captain_desktop_ligen.png, captain_desktop_liga_aktiv.png, captain_desktop_liga_beendet.png, captain_desktop_halle.png, captain_desktop_hallen.png, captain_desktop_halle_detail.png, captain_desktop_profitag.png, captain_desktop_profitag_event.png, captain_desktop_dev_pay.png.
- Gelesen: critique.md, audit.md, distill.md, clarify.md, adapt.md, PRODUCT.md, DESIGN.md, Vertrag 013; Messwerte beider Geräte; Quelltext der Seiten (Zeilen siehe Funde).
- **Degradiert: ja (manuell nach Reference).** Grund: kein eigener Browser und kein eigener Detector-Lauf der Zelle (siehe Detect, durch den Analyse-Leiter), keine zwei isolierten Assessments für critique (A und B); Bewertung nur aus Bildern, Messwerten und Quelltext. Kein `detect` in der Zelle ausgeführt (Analyse-Leiter: siehe Detect).
- Gesamteindruck: Alle Seiten sind einheitliche flache Karten auf grauem Grund mit einem orangen Knopf. Das ist ruhig, aber ohne Teamfarbe, ohne Trikot-Charakter (Richtung E) und ohne erkennbare Captain-Funktion. Was sich gegenüber Gast und Spieler ändert, ist fast unsichtbar: Der Team-Admin bekommt nur bei Liga (Abmelden) und Profi-Tag (Bewerbungsformular, hier nicht sichtbar) ein Extra, und beides ist nirgends verlinkt.

#### Durchgänge

Degradiert: ja (manuell nach Reference), für alle Zeilen.

| Seite | critique | audit | distill | clarify | adapt |
|---|---|---|---|---|---|
| rangliste | Kein Eigenbezug des Captains (Y2-C-11); fünf gleichgewichtige Listen | Tabelle mit kleinen Zeilen, 50/54 kleine Ziele (Y2-C-12); h1 vorhanden, kein Überlauf | Auf eine Hauptliste plus Auswahl kürzen (Y2-C-11) | Spaltenköpfe "Sp", "S-U-N", "Pkt" unerklärt (Y2-C-08) | Filter bricht um, Knopf nötig (Y2-C-13) |
| ligen | Liga nicht auffindbar (Y2-C-04), Seite wirkt leer | Link "beendete Ligen" klein (Y2-C-10) | Seite im Zielbild fraglich: Produktfrage, siehe MUSS WEG | ISO-Datum, kein Beitrittshinweis (Y2-C-07, Y2-C-10) | Handy und Desktop gleich, ok; kein aktiver Navipunkt (Y2-C-23) |
| liga_aktiv | Eigenes Team nicht markiert (Y2-C-08) | Knöpfe 36 px (Y2-C-05) | keine Funde über Y2-C-08 hinaus | "Anmelden/Abmelden" missverständlich, kein Satz (Y2-C-05); ISO-Datum | Tabelle passt auf 390 px ohne Überlauf; keine weiteren Funde |
| liga_beendet | Meister gegen Tabelle widersprüchlich (Y2-C-06) | keine eigenen Funde | Nullzeilen und fehlende Abschlusssicht (Y2-C-09) | "beendet" nur im Untertitel (Y2-C-09) | keine Funde |
| halle | Betreiberseite für Captain ohne Sperre (Y2-C-01) | nur Login-Prüfung (aus Quelltext, Y2-C-01) | Fraglich im Zielbild (011 Hallen-Dashboard), MUSS WEG vormerken | Leertext ist Systemsprache (Y2-C-01) | Desktop um 24 px eingerückt (Y2-C-19) |
| hallen | Nur Bewertungsliste, keine Handlung | 9/13 kleine Ziele (Textlinks, Filter) | OSM-Absatz kürzen (Y2-C-18) | Filterknopf nötig (Y2-C-18) | Handy ok, kein Überlauf |
| halle_detail | Formular ohne Überschrift (Y2-C-16) | "Melden" zu klein, h1 enthält Plakette (Y2-C-14, Y2-C-17) | keine Funde | "Partner" unerklärt, "Senden" generisch (Y2-C-16, Y2-C-17) | Kartenumbruch mobil (Y2-C-15) |
| profitag | Nicht auffindbar (Y2-C-04) | 8/12 kleine Ziele (Messwert), Karte selbst ok | Seite im Zielbild fraglich: Produktfrage | Karte ohne Handlungsaufforderung (Y2-C-20) | Statusspalte dreizeilig (Y2-C-20) |
| profitag_event | Captain ohne Bewerbungsweg, kein Grund genannt (Y2-C-02, Y2-C-03) | keine zusätzlichen Funde | Bewerbungsliste ohne Inhalt, bloße Namenskarten (Y2-C-03) | "Plätze", Auslosung unerklärt (Y2-C-21) | Kopfkarte bricht mobil (Y2-C-21) |
| dev_pay | Als 404 für Fremde korrekt (Y2-C-22) | keine Funde | Seite nur lokal: MUSS WEG | 404-Text allgemein, ok | keine Funde |

#### Messwerte

- Kein horizontaler Überlauf, keine Konsolenfehler, alle Status 200, Endpfad immer gleich der Anfrage (auch `/halle` und `/dev/pay/:id`: also keine Weiterleitung, die Betreiberseite lädt, dev_pay liefert 404-Inhalt mit Status 200 laut Messwert).
- `kleineZiele`: rangliste 50 (Handy), 54 (Desktop); sonst 8 bis 20. Die Grundlast von 8 bis 12 auf jeder Seite entspricht dem Footer und Kopf (z. B. captain_mobil_profitag.png mit 8) und ist daher nicht seitenspezifisch; Footerlinks tragen laut Quelltext `min-h-11`, die Zählung ist also teils kein Fund.
- Seitenhöhen: Handy-Rangliste 3839 px; Ligen, Liga, Halle, Profi-Tag exakt 844 px (Seite kürzer als Bildschirm, Footer hängt in der Mitte).
- h1 von dev_pay ist "Seite nicht gefunden" (404-Seite), von halle_detail "Seed-Halle NordPartner" (Plakette im h1, Y2-C-17).

### Fundblatt Y2-H: Hallenbetreiber, Handy und Desktop

#### Kopf

- Zelle: Y2-H, Rolle Hallenbetreiber (Betreiber von "Seed-Halle Nord"), Geräte Handy und Desktop.
- Zähler: angesehen 20 von 20.
- Dateien (alle einzeln mit Read angesehen, keine leer/kaputt): halle_mobil_rangliste, halle_mobil_ligen, halle_mobil_liga_aktiv, halle_mobil_liga_beendet, halle_mobil_halle, halle_mobil_hallen, halle_mobil_halle_detail, halle_mobil_profitag, halle_mobil_profitag_event, halle_mobil_dev_pay, dieselben zehn mit Präfix halle_desktop_ (je .png).
- Degradiert: ja (manuell nach Reference). Grund: kein eigener Browser, kein eigener Detector-Lauf der Zelle, keine weiteren Unter-Agents (die Zelle war selbst ein Sub-Agent), die fünf Durchgänge je Seite nacheinander im Kontext dieser Zelle; die Befehle wurden je Seite einzeln und von Hand nach den Reference-Dateien durchlaufen.
- Nachgeholt (Korrektur zur ersten Fassung): Die erste Fassung entstand, nachdem ich die Reference-Dateien nur in den ersten ca. 6000 Zeichen gelesen hatte. Jetzt vollständig gelesen: critique.md (820 Zeilen), audit.md, distill.md, clarify.md, adapt.md, PRODUCT.md, DESIGN.md; die Durchgänge wurden danach neu bewertet. Änderungen: Schweregrade nach der Definition (P0 = verhindert Aufgabe, P1 = WCAG-AA-Verstoß/erhebliche Verwirrung) neu vergeben (die zwei P0 sind P1 geworden, weil der Kern-Weg Anfrage bestätigen mit den Bildern/Quelltext nicht kaputt, sondern unvollständig ist); neue Funde -23 und -24; Heuristik-Werte, Personen-Warnungen und Positives ergänzt (Abschnitt 3); Vertrag-011-Lücken in eigener Tabelle (Abschnitt 3b).
- Wichtig: Im Bild zeigt /halle den LEEREN Zustand. Der Anfragen-Zustand (Karten mit "Halle ist frei"/"Halle ist belegt") ist nur "aus Quelltext" prüfbar (src/app/halle/page.tsx).

#### Durchgänge

(Heuristik-Werte 0-4 sind meine Einschätzung je Seite, Degradiert.)

| Seite | critique | audit | distill | clarify | adapt |
|---|---|---|---|---|---|
| /halle | Heuristiken: Status 2, Realwelt 2, Kontrolle 2, Konsistenz 3, Fehlervermeidung 1 (Ablehnen ohne Grund), Wiedererkennung 2, Effizienz 1, Minimalismus 3, Fehlerbehebung 2, Hilfe 2 = 20/40 (Akzeptabel). Persönlichkeiten: Jordan (Leerzustand unklar), Casey (kleine Ziele). Funde -01, -22 | Score: Zugänglichkeit 2, Performance n/a, Theming 3, Responsive 2, Integrität 2; Funde -02, -23. Positiv: lesbarer Kontrast, h1 vorhanden | -05 | -03, -04, -06 | -05, -24; Handy lesbar, Desktop leer |
| /hallen | Klar, gute Liste; 3 Karten ohne Verwirrung. Heuristiken ca. 28/40 | -12 | Filter-Knopf überflüssig | OSM-Hinweis lang | Handy 390 px sauber |
| /hallen/[id] | Bewertungen nur lesbar (-07); Hallendaten klar (Boden, Duschen, Parkplatz) | -11 | Eigene Halle bewerten ist sinnlos (-07) | -08 | -10 |
| /rangliste | Für Betreiber ohne Wert, sauber gebaut (kein Überlauf) | 50/54 kleine Ziele (-14) | Länge, Betreiber braucht fast nichts (-14) | -15 | -14 |
| /ligen | Einfach, ein Eintrag | -16 | Im Zielbild fraglich (MUSS WEG) | -16 | Handy ok |
| /ligen/[id] aktiv | Tabelle klar (-18) | Zahlenfarbe uneinheitlich (-18) | keine Funde | keine nächste Handlung (-18) | Handy ohne Überlauf |
| /ligen/[id] beendet | Widerspruch Meister gegen 0 Spiele (-17) | -17 | wie oben | wie oben | Handy ok |
| /profitag | Kachel klar | keine Funde | Im Zielbild fraglich | keine Funde | -19 |
| /profitag/[id] | Sackgasse (-20) | keine Funde | Bewerbungsliste ohne Funktion | -20 | Handy ok |
| /dev/pay/[id] | Nur 404 | -21 | MUSS WEG (nur lokal) | 404-Text verständlich | Handy ok |
| Kopf/Fuß (global) | Guthaben im Kopf (-09) | -13 | -13 | -04 | Handy: Kopf ohne Guthaben, Desktop mit |

##### 3b. Lücken gegenüber Vertrag 011 (aus dem Bild und Quelltext)
| 011-Punkt | Stand |
|---|---|
| AC-1 eigener Bereich nur eigene Hallen | /halle sichtbar; Halle nicht benannt (nicht prüfbar, ob andere Hallen geschützt) |
| AC-2 Anfrage bestätigen | Knöpfe vorhanden (nur aus Quelltext), Beweisprotokoll nicht prüfbar |
| AC-3 Ablehnung mit Begründung | fehlt (-02) |
| AC-5 Buchungen, Auszahlungen, Rechnungen | fehlt (-01) |
| AC-6 Antwort auf Bewertung | fehlt (-07) |
| AC-9/14 Antwortfrist | nur Kleintext "Antwort bis" (Quelltext Z. 29), Folge anders formuliert (-06) |
| AC-11 Push und Mail | nicht prüfbar |
| AC-12 Kalender, Sperrzeiten | fehlt (-01) |

#### Messwerte

- Kleine Ziele: /rangliste 50 (Handy) und 54 (Desktop); /halle 8 bzw. 12 (Leerzustand: Kopf, Navigation, Fußlinks); /hallen/[id] 16 bzw. 20 (davon vier "Melden"); sonst 8 bis 16.
- Überlauf nirgends (overflowX false), keine Konsolenfehler.
- /dev/pay/[id]: Status 200, Inhalt "Seite nicht gefunden".
- h1 auf /hallen/[id] lautet "Seed-Halle NordPartner" (Badge im h1 ohne Trennung, Screenreader liest zusammen).

### Fundblatt Y2-O: Streamer (Overlay, ohne Login), 1280 x 800 und OBS 1920 x 1080

#### Kopf

- Zelle: Y2-O, Rolle Streamer (ohne Login, technisch Gast), Seiten `/overlay/[id]` in vier Zuständen (gespielt, bestaetigt, lobby, privat), Größen 1280 x 800 und 1920 x 1080. Handy nicht relevant.
- Zähler: **angesehen 16 von 16** (jedes Bild einzeln mit Read geöffnet; nach der Neuaufnahme alle 8 `_obs`-Bilder erneut einzeln angesehen, die 8 normalen Bilder sind laut Prüfsumme unverändert und wurden im ersten Durchgang einzeln angesehen).
- Dateien: gast_d1280_overlay_gespielt.png, gast_d1280_overlay_gespielt_obs.png, gast_d1280_overlay_bestaetigt.png, gast_d1280_overlay_bestaetigt_obs.png, gast_d1280_overlay_lobby.png, gast_d1280_overlay_lobby_obs.png, gast_d1280_overlay_privat.png, gast_d1280_overlay_privat_obs.png, gast_obs1920_overlay_gespielt.png, gast_obs1920_overlay_gespielt_obs.png, gast_obs1920_overlay_bestaetigt.png, gast_obs1920_overlay_bestaetigt_obs.png, gast_obs1920_overlay_lobby.png, gast_obs1920_overlay_lobby_obs.png, gast_obs1920_overlay_privat.png, gast_obs1920_overlay_privat_obs.png.
- Gelesen bis Dateiende: critique.md (819 Zeilen), audit.md, distill.md, clarify.md, adapt.md, PRODUCT.md, DESIGN.md, Vertrag 013; dazu Quelltext `src/app/overlay/[id]/page.tsx`, `LiveIndicator.tsx`, `globals.css` (`.force-dark`), `layout.tsx`, `not-found.tsx`, `StreamForm.tsx`.
- **Degradiert: ja (manuell nach Reference)**. Grund: keine zwei isolierten Assessments (die Zelle startete keine weiteren Agents), kein eigener Detector-Lauf, kein eigener Browser (Auftrag verbietet Server/Browser; Aufnahme und `detect` durch den Analyse-Leiter). Alle fünf Befehle manuell nach Reference-Datei, nur anhand Bilder, Messwerte und Quelltext.
- Nachgeholt: Die `_obs`-Bilder wurden neu aufgenommen und zeigen jetzt den simulierten Spielhintergrund (grüner Verlauf, links oben dunkel, rechts unten hell); die Lesbarkeit über dem Hintergrund ist am Bild belegt (Fund -10).

#### Durchgänge

| Seite | critique | audit | distill | clarify | adapt |
|---|---|---|---|---|---|
| overlay_gespielt (1280 und 1920) | Klarer, kompakter Balken: Heim, orange Stand „1 : 4“, Gast, „Beendet“. Einheitsoptik mit Orange als Akzent passt zu Richtung E. Funde -08, -09. Stärken: Stand sofort lesbar, hohe Kontraste, Zahlen tabellarisch (`tabular-nums`). Anzeigeziel erfüllt. | Kontrast Stand und Namen gut; Phase 12 px klein (-05); Rahmen/Schatten schwach (-10); kein Zugangsproblem, kein Tastaturbedarf (reines Anzeigeelement). `aria-label` auf dem Stand vorhanden. Kleine Ziele: 0 (Messwert). Fund -11, -12. | Kein überflüssiges Element im sichtbaren Balken; nichts zu streichen. Verbindungsanzeige ist bereits versteckt (-03 verlangt das Gegenteil, nur als Fehlerzustand). | Texte „Beendet“ klar. Fehlender Verbindungsstatus (-03), fehlende Anleitung (-02). | Feste Größe, keine Skalierung (-06), lange Namen (-07). Kein Handy-Bedarf. |
| overlay_bestaetigt (1280 und 1920) | Zeigt „0 : 0 Geplant“: „bestätigt“ nicht erkennbar (-04). Sonst wie oben. | wie oben; Phase „Geplant“ in gedämpft 12 px. | Kein Entfall. | „0 : 0“ vor Spielbeginn irreführend (-04): besser nur Namen und Uhrzeit/„Geplant“ ohne Stand. | wie oben (-06, -07). |
| overlay_lobby (1280 und 1920) | Identisch zu „bestätigt“ in Aufbau: Lobby-Zustand (Spieleranzahl, offener Platz) ist im Overlay nicht dargestellt (-04). Für ein öffentliches Lobby-Spiel zeigt das Overlay einen Spielstand, den es noch nicht gibt. | wie oben | Überlegen, ob das Overlay vor Anpfiff überhaupt etwas zeigen soll (Produktfrage, vormerken, Entscheid beim Nutzer). | wie oben (-04). | wie oben. |
| overlay_privat (1280 und 1920) | 404 mit vollem App-Rahmen und deckendem Grund (-01): Für ein Overlay falsches Verhalten; das Datenschutzziel (Privatspiel nicht preisgeben) ist erfüllt, da die Seite exakt wie „nicht vorhanden“ aussieht (stimmt mit PRODUCT.md, Sichtbarkeit). Messwert meldet Status 200 (vermutlich Soft-404 durch Streaming, nicht belegt), h1 „Seite nicht gefunden“. | 10 kleine Ziele laut Messwert (Fußzeilenlinks, Navigation) gehören zur App-Fehlerseite, nicht zum Overlay; Lesbarkeit der Fehlerseite hell, ok. Hell/Dunkel: Fehlerseite folgt Systemeinstellung (hier hell), Overlay selbst bleibt dunkel (uneinheitlich). | Fehlerseite mit Kopf, Fuß, Sprachumschalter für ein Overlay ist Überfluss; alles was das Overlay stört, müsste weg (Entscheid beim Nutzer). | Text „Diese Seite gibt es nicht oder nicht mehr.“ nennt nicht, dass das Overlay nur für öffentliche Spiele geht (-01, -02). Absichtlich neutral wegen Datenschutz; Konflikt zwischen Datenschutz und Hilfe, Entscheid beim Nutzer. | Im Stream (1920) deckt die Fehlerseite alles ab (-01). |

Hinweis zu den `_obs`-Bildern: neu aufgenommen mit grünem Verlauf als Spielhintergrund; Bewertung der Lesbarkeit siehe Fund -10 (Stand und Namen gut lesbar, Balkenkante oben links schwach, Fehlerseite bei Privat teils unleserlich).

#### Messwerte

- Alle 12 sichtbaren Overlay-Aufnahmen: kein Überlauf (`overflowX false`), keine kleinen Ziele (0), keine Überschrift `h1` (Overlay hat keine, korrekt für ein Einblendungselement), Konsole leer.
- Privat: `h1 = „Seite nicht gefunden“`, `kleineZiele = 10` (Navigation und Fußzeilenlinks der App-Fehlerseite), Status 200 trotz `notFound()`.
- Höhe 800 und 1080 entspricht dem Viewport, wie im Auftrag.

