# Frontend-Analyse M1, Gruppe X (öffentliche Seiten, Spieler- und Captain-Bereich)

Stand: Basis `main` (d129ad7), Dev-Server Port 3102 mit `PAYMENTS_FAKE=1`, Seed `seed-demo`. Nur gelesen und gemessen, kein Quelltext geändert. Grundlage: Vertragsentwurf 013 (Richtung E Trikot bleibt, URLs und Test-IDs bleiben).

**Degradiert: ja.** Vom Impeccable-Launcher liefen `context` und `detect` (Engine 0.1.19). `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl; sie liefen nicht als eigene Sub-Agents, sondern als manuelle Prüfung nach ihren Kriterien anhand der Screenshots und Messwerte (Grund: Zeitfenster, ein Browser gleichzeitig). In der Spalte "Impeccable" steht deshalb `detect` (maschinell) oder `critique (manuell)`. Ein Lauf der Playbooks als Sub-Agent kann nachgeholt werden.

## Zusammenfassung

| Priorität | Anzahl |
|---|---|
| P0 Bedienung kaputt | 1 |
| P1 verwirrend | 10 |
| P2 Optik | 9 |

Die 10 schlimmsten Probleme: X-01, X-02, X-03, X-04, X-05, X-06, X-07, X-08, X-09, X-10.

Gemessen über alle geprüften Zellen: kein horizontaler Überlauf, keine Konsolenfehler, jede Seite genau eine `h1`, alle Seiten liefern 200. Handy: 7 bis 11 von 32 bis 47 bedienbaren Elementen sind kleiner als 44 px, auf `/app/einstellungen` 30 von 69.

## Matrix-Abdeckung

19 Seiten x 3 Rollen x 2 Geräte = 114 Zellen, alle mit Screenshot und Messwerten. Rollen: Gast (keine Sitzung), Spieler (Mitglied von Demo Alpha), Captain (Team-Admin von Demo Alpha). Geräte: 390 x 844 (Handy), 1280 x 800 (Desktop).

Geprüfte Seiten: `/`, `/hilfe`, `/agb`, `/datenschutz`, `/impressum`, `/hausordnung`, `/kontakt`, `/unter-16`, `/anmelden`, `/willkommen`, `/suche`, `/spieler`, `/teams`, `/offline`, `/app`, `/app/suche/neu`, `/app/einstellungen`, `/app/benachrichtigungen`, `/app/guthaben`.

- Gast auf `/app*`: Weiterleitung zu `/anmelden?next=...` (5 Seiten x 2 Geräte; geprüft als Redirect, nicht als eigener Inhalt).
- Spieler/Captain auf `/anmelden` und `/willkommen`: Weiterleitung zu `/app`.
- Visuell angesehen (Screenshot gelesen): Start (Gast Handy und Desktop), `/app` (Captain Handy und Desktop), Einstellungen, Guthaben, `/app/suche/neu`, `/anmelden`, `/suche`, `/spieler`, `/teams`, Hilfe-Ende. Die übrigen Zellen sind nur über die Messwerte (Überlauf, Zielgrößen, Fehler, Seitenhöhe) und `detect` abgedeckt, nicht Bild für Bild angesehen.
- Nicht abgedeckt: Onboarding eines neuen Nutzers (Seed-Nutzer sind schon eingerichtet), echter Google-Login (lokal nicht eingerichtet), Seiten mit Fehlerzuständen und volle Listen (Seed hat 0 Spiele, 0 offene Lobbys), Seite `/app/suche/neu` als Spieler nur gemessen (Höhe 844 px, vermutlich Hinweis "nur Captain"), nicht angesehen.
- Zuordnung unklar, nicht angefasst (bitte entscheiden): `/rangliste`, `/ligen`, `/halle`, `/profitag`, `/matchmaking`, `/mitspieler`, `/suche/[id]`, `/einladung/[token]`, `/overlay/[id]`, `/dev/pay/[id]`. Per Namen Gruppe Y und deshalb nicht angefasst: `/lobby*`, `/spiele*`, `/spiel/[token]`, `/turniere*`, `/app/privatspiel/neu`, `/app/teams/neu`, `/app/turniere/neu`, `/teams/[slug]`, `/spieler/[id]`, `/hallen*`. Alle `/admin`-Seiten ausgelassen.

## Methodik

1. Dev-Server nur auf Port 3102, Anmeldung über den Dev-Login (nur in Nicht-Produktion).
2. Playwright (Chromium) je Rolle und Gerät: Screenshot ganze Seite, dazu Messwerte (Überlauf, `h1`, kleine Zielgrößen unter 44 px, Konsolenfehler, Seitenhöhe, Weiterleitung). Handy mit Touch-Emulation.
3. Impeccable-Launcher `context` einmal, danach `detect --json` gegen URLs (Gast, 390 x 844 und 1280 x 800, acht Seiten) und gegen den Quelltext der Gruppe (ohne Befund). Nie `hooks`, `install` oder `update`.
4. Manuelle Prüfung nach `critique`/`audit`/`distill`/`clarify`/`adapt` (siehe Degradiert).
5. Screenshots liegen nur lokal außerhalb des Repos; die Dateinamen in der Beleg-Spalte folgen dem Muster `rolle_gerät_seite.png`. Hinweis: In ganzseitigen Handy-Screenshots erscheint die feste untere Navigation mitten im Bild; das ist ein Artefakt der Aufnahme. Am Seitenende überdeckt sie nichts (geprüft, Beleg `gast_mobil_hilfe_ende-viewport.png`).

## Funde

| ID | Prio | Seite | Rolle | Gerät | Beschreibung | Beleg | Impeccable |
|---|---|---|---|---|---|---|---|
| X-01 | P0 | `/spieler`, `/teams` | alle | Handy | Das Suchfeld ist auf etwa 48 px zusammengedrückt, der Platzhalter ist abgeschnitten ("Na", "Tea"). Neben dem Feld stehen Stadt-Auswahl und Button. Name oder Teamname lässt sich kaum eintippen oder lesen. | `captain_mobil_spieler.png`, `captain_mobil_teams.png` | critique (manuell), adapt |
| X-02 | P1 | `/` | Gast | Handy, Desktop | Hero mit vier gleichrangigen Zielen ("Jetzt starten", "Lobby aufmachen", "Offene Lobbys ansehen", "Livescore") in unterschiedlicher Breite und linksbündig, dazu "Anmelden" oben. Es gibt keine eine klare erste Handlung. Auf dem Handy rutschen die Buttons untereinander mit ungleichen Breiten. | `gast_mobil_start.png`, `gast_desktop_start.png` | critique (manuell), distill |
| X-03 | P1 | `/`, `/app` | Gast, Spieler, Captain | Handy | Drei große Karten mit fünf Buttons (Teamspiel, Privatspiel, Turnier) stehen vor dem eigentlichen Inhalt. Auf `/app` beginnt "Meine Spiele" erst nach rund 1000 px; wer ein Spiel sucht, das schon läuft, muss scrollen. Auf der Startseite stehen die Karten vor der Erklärung "So funktioniert Socaz". | `captain_mobil_app.png`, `gast_mobil_start.png` | critique (manuell), distill |
| X-04 | P1 | `/app` | Spieler, Captain | Handy, Desktop | Schnellzugriff aus fünf gleich aussehenden Kacheln (Lobby aufmachen, Mein Profil, Rangliste, Einstellungen, Hilfe), auf dem Handy bleibt "Hilfe" einzeln übrig, auf dem Desktop fehlt eine Kachel in der zweiten Reihe. "Lobby aufmachen" gibt es dreifach (Karte, Kachel, Navigation). Ziele mit sehr unterschiedlichem Gewicht sehen gleich aus. | `captain_mobil_app.png`, `captain_desktop_app.png` | critique (manuell), distill |
| X-05 | P1 | `/`, `/app`, `/app/guthaben` | alle | Handy, Desktop | Texte passen nicht zum geplanten Kartenmodell (Vertrag 012): Start "Du lädst dein Guthaben auf", `/app` "Zahlungen noch nicht aktiv, Spiele sind kostenlos", `/app/guthaben` erklärt ein Guthaben mit Aufladen und einem Rabattcode-Feld (Vorgabe: keine Promo-Codes). Das Guthaben steht auch in der Kopfzeile auf dem Desktop. Ändert sich mit 012 ohnehin; die Frontend-Überarbeitung muss die Texte mitführen. | `gast_desktop_start.png`, `captain_mobil_app-guthaben.png`, `captain_desktop_app.png` | clarify (manuell) |
| X-06 | P1 | alle Seiten | alle | Handy | Untere Navigation: Gäste sehen dieselben fünf Tabs wie Angemeldete (Teamspiel, Privatspiel mit Schloss, Spiel suchen, Turniere, Profil), die auf die Anmeldung führen. "Teamspiel" und "Spiel suchen" überschneiden sich im Sinn. Der aktive Tab stimmt nicht: auf `/teams` leuchtet "Teamspiel", auf `/spieler`, `/app/guthaben`, `/app/suche/neu` und `/app/einstellungen` leuchtet "Profil". | `gast_mobil_anmelden.png`, `captain_mobil_teams.png`, `captain_mobil_spieler.png`, `captain_mobil_app-guthaben.png` | critique (manuell), clarify |
| X-07 | P1 | alle Seiten | alle | Handy, Desktop | Fußzeile mit 13 Links in sehr kleiner Schrift (14 Links unter 14 px), auf dem Handy vier Zeilen, auf jeder Seite auch in Formularen und auf `/anmelden`. Die Tippflächen sind klein; die Sprachwahl ("Deutsch/English") steht ganz unten. Ziele unter 44 px: 7 bis 11 je Seite (Gast), 30 von 69 auf `/app/einstellungen`. | `gast_mobil_hilfe_ende-viewport.png`, `captain_mobil_app-einstellungen.png` | audit (manuell) |
| X-08 | P1 | `/app/einstellungen` | Spieler, Captain | Handy | 2179 px lange Seite mit drei getrennten Formularen und mehreren Speichern-Buttons ("Profil speichern", "Speichern"), elf Checkboxen für Benachrichtigungen in einer Reihe, dazu "Konto löschen" als kleine Aufklappzeile. Der Hinweis "Push ist auf diesem Server noch nicht eingerichtet" steht vor den Kanälen. Es ist unklar, was zusammen gespeichert wird. | `captain_mobil_app-einstellungen.png` | critique (manuell), distill |
| X-09 | P1 | `/app/guthaben` | Spieler, Captain | Handy | Vier-Schritte-Erklärung steht über dem Aufladen, das Eingabefeld "Betrag" und die Schnellwahl (20, 50, 100 Euro) zeigen denselben Wert doppelt, Rabattcode-Feld ohne Erklärung, "Verlauf" und "Belege" als leere Kästen. Der Seitenzweck verschiebt sich mit 012 (Karte statt Guthaben). | `captain_mobil_app-guthaben.png` | clarify (manuell) |
| X-10 | P1 | `/suche` | Gast, Spieler, Captain | Handy | Die Filtermaske mit sechs Feldern und einem Button "Filtern" füllt den ersten Bildschirm, die Liste kommt darunter (im Seed leer). Auswahlfeld "Art" ist abgeschnitten ("Lobbys und Su…"). Überschrift "Offene Lobbys anderer Teams" mit Punkt, daneben "Live" in rot. Der Button "Lobby aufmachen" steht für einen Gast ohne Hinweis auf die Anmeldung. | `gast_mobil_suche.png` | critique (manuell), detect (unbalanced-heading) |
| X-11 | P2 | `/app/suche/neu` | Captain | Handy | Sieben Felder in einer Spalte, Datum und Uhrzeit als natives Feld ohne Vorgabe, Freitext zuletzt. Der Hinweis "Mindestens 24 Stunden im Voraus" steht klein unter dem Feld. Brauchbar, aber lang. | `captain_mobil_app-suche-neu.png` | distill (manuell) |
| X-12 | P2 | `/anmelden` | Gast | Handy | Vor dem Login Fußzeile mit 13 Links und untere Navigation; die Seite hat nur ein Ziel. Der Hinweis zu fehlendem Google-Schlüssel und der Dev-Login erscheinen nur lokal, den echten Google-Button konnte ich nicht prüfen. | `gast_mobil_anmelden.png` | critique (manuell) |
| X-13 | P2 | `/`, `/anmelden`, `/agb` | Gast | Handy | Einzelne Wörter in der letzten Zeile ("heraus.", "nötig.", "Betreiber.", "führen."). | `gast_mobil_start.png` | detect (straggler) |
| X-14 | P2 | `/agb`, `/` | Gast | Desktop | Zeilenlänge etwa 104 bis 110 Zeichen (Vorgabe unter 80); auf `/` Hero-Absatz, auf `/agb` Fließtext. | `gast_desktop_agb.png` | detect (line-length) |
| X-15 | P2 | `/` | Gast | Desktop | Beschriftung mit zu wenig Innenabstand: 3,5 px oben und unten bei 16 px Schrift (Vorgabe mindestens 4,8 px). | `gast_desktop_start.png` | detect (cramped-padding) |
| X-16 | P2 | `/spieler`, `/teams` | alle | Handy, Desktop | Platzhalter "Name suchen" und "Teamname" haben nur 4,1:1 Kontrast (Vorgabe 4,5:1). | `captain_desktop_spieler.png` | detect (low-contrast) |
| X-17 | P2 | alle Seiten | alle | Desktop | Der Inhalt sitzt in einer schmalen Spalte von 720 px, rechts und links bleiben je 280 px frei; die Desktop-Ansicht ist eine gestreckte Handyansicht. Die obere Leiste zeigt nur "Offene Lobbys", "Livescore", "Rangliste"; Teamspiel, Privatspiel, Turniere und Hilfe sind nur über Karten oder die Fußzeile erreichbar. | `gast_desktop_start.png`, `captain_desktop_app.png` | critique (manuell), adapt |
| X-18 | P2 | `/app` | Spieler, Captain | Handy, Desktop | In "Meine Teams" steht vor dem Teamnamen ein schwarzer Punkt statt der Teamfarbe; Richtung E arbeitet mit Teamfarben. Statistikkacheln der Startseite zeigen im Seed "0 Spiele". | `captain_mobil_app.png` | critique (manuell) |
| X-19 | P2 | `/` | Gast | Handy | Hero-Absatz in grauer Schrift auf dem Hallenfoto, Kontrast nur nach Augenmaß beurteilt (nicht gemessen). | `gast_mobil_start.png` | audit (manuell) |
| X-20 | P1 | `/app` | Spieler | Handy, Desktop | Hinweis auf die Rollen: Die Seite zeigt Spieler und Captain dieselben Karten ("Der Captain öffnet eine Lobby"). Ein Spieler ohne Captain-Rolle sieht "Lobby aufmachen" als erste Handlung, obwohl er sie nicht ausführen darf (nicht geklickt, nur an der Beschriftung abgeleitet). Prüfen und im Umbau verifizieren. | `spieler_mobil_app.png` | critique (manuell) |


## Nicht als Fund gewertet

- Overuse-Hinweis der Schrift (Plus Jakarta Sans, `detect` overused-font): gewollte Markenschrift aus DESIGN.md.
- Runder "N"-Knopf unten links: Entwicklungs-Overlay von Next.js, nur im Dev-Server.
- Hinweis zum fehlenden Google-Schlüssel auf `/anmelden`: nur in Nicht-Produktion.
