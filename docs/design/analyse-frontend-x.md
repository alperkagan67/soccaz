# Frontend-Analyse M1, Gruppe X (öffentliche Seiten, Spieler- und Captain-Bereich)

## Kurzfassung (für den Nutzer)

**Status: Degradiert: ja, X gilt noch nicht als fertig.** Grund:
- (a) `critique`, `audit`, `distill`, `clarify`, `adapt` haben keinen Launcher-Befehl; sie liefen manuell nach vollständig gelesenen Reference-Dateien (Methode in Ordnung, hier ehrlich vermerkt).
- (b) `detect` per URL läuft auf `/` und `/suche` in einen Timeout (Dauerverbindung per SSE); Ersatz sind Quelltext-Lauf und Playwright-Messung.
- (c) Mit dem Seed nachgeholt (Abschnitt "Nachlauf mit Seed", 203 von 203 Screenshots angesehen): Onboarding, abgelaufener Einladungslink, gefüllte Listen, Fehlerzustand, Formular-Absenden, Captain-Konto-Menü am Handy. Weiterhin Lücke: echter Google-Login (nicht automatisierbar, Dev-Login ersetzt ihn), Benachrichtigungen mit Einträgen und Guthaben-Verlauf, echtes Karten-Erneuern (kein Stripe), Versand von E-Mail und Push.

**Zähler:** angesehen 138 von 138 Screenshots (23 Seiten × Gast/Spieler/Captain × Handy 390 px/Desktop 1280 px), je Zelle die fünf Befehle einzeln.

**Funde (Rohzählung, viele Wiederholungen je Rolle und Gerät):** erste Runde 1 P0, 76 P1, 124 P2; Nachlauf mit Seed zusätzlich 2 P0, 60 P1, 44 P2 (P0 im Nachlauf: Suchbegriff unleserlich, bestätigt X-01; keine Benachrichtigung bei fehlgeschlagener Abbuchung, N4-FZ-2).

**Die 10 schlimmsten Probleme:**
1. X-01 (P0): Suchfeld auf `/spieler` und `/teams` am Handy auf etwa 48 px gequetscht, Platzhalter abgeschnitten.
2. Guthaben, Aufladen, Rabattcode und Altmodell-Texte stehen noch überall (siehe MUSS WEG).
3. X-06, SM-GL-1: untere Navigation falsch (falscher aktiver Reiter, Gäste sehen Reiter für Angemeldete).
4. GD-ALL-1: Kopfleiste am Desktop mit nur drei Links, die Fußzeile ist die einzige Gesamtnavigation.
5. SM-GL-6, SM-MA-1, SM-SN-1 (X-20): Spieler ohne Captain-Rolle sieht "Lobby aufmachen" als erste Handlung.
6. SM-EL-1: Einladungsseite erkennt ein bestehendes Mitglied nicht, der Klick endet still.
7. CD-ALL-3: `/app/suche/neu` hat keinen Einstieg ohne `?gegner=`; der Einladungslink liegt nur auf der Teamseite.
8. CM-MM-1: Lobby-Formular auf `/matchmaking` ganz unten, Datumsfeld abgeschnitten.
9. X-03, X-04: `/app` zeigt Kartenwand und Kachelraster vor "Meine Spiele".
10. Rechtsseiten: Platzhalter und Variablennamen (`OPERATOR_*`) auf `/impressum`, `/kontakt`, `/datenschutz` sichtbar.

**MUSS WEG: 128 Fundstellen** (je Seite, Rolle und Beleg im Abschnitt MUSS WEG). Die wichtigsten 8:
1. Kopfleiste: Betragslink "Guthaben" (`Header.tsx:53-55`, Test-ID `header-wallet`).
2. Konto-Menü: Eintrag "Guthaben" mit Betrag (`UserMenu.tsx:69-72`).
3. `/app`: Guthaben-Karte ("Zahlungen noch nicht aktiv, Spiele sind kostenlos").
4. `/app/guthaben` ganze Seite: Aufladen (20/50/100 Euro, Betragsfeld).
5. Rabattcode-Feld in `TopUpForm.tsx` (Vorgabe: keine Promo-Codes).
6. Startseite: "Kostenlos anmelden", "Du lädst dein Guthaben auf".
7. Hilfe: Abschnitt "Geld und Guthaben".
8. `/agb` (§1, §3, §4), `/datenschutz`, `/hausordnung`, `/kontakt`: Altmodell-Texte zu Guthaben und Zahlung.

Der Rest des Dokuments: Zusammenfassung, Matrix, Methodik, erste Fundliste X-01 bis X-20, MUSS WEG, sechs Fundblätter (je Rolle und Gerät, je Seite mit Befehl und Ergebnis).


Stand: Basis `main` (d129ad7), Dev-Server Port 3102 mit `PAYMENTS_FAKE=1`, Seed `seed-demo`. Nur gelesen und gemessen, kein Quelltext geändert. Grundlage: Vertragsentwurf 013 (Richtung E Trikot bleibt, URLs und Test-IDs bleiben).

**Degradiert: ja (Stand der Fortsetzung, ehrlich).** Erledigt: alle 138 Screenshots einzeln angesehen; je Seite, Rolle und Gerät die fünf Durchgänge critique, audit, distill, clarify, adapt als eigene Läufe (je Rolle und Gerät ein eigener Sub-Agent in Serie, ein Dev-Server, ein Browser) mit Befehl und Ergebnis je Seite in den Fundblättern unten; `detect` je Seite. Weiterhin degradiert: (1) `critique`, `audit`, `distill`, `clarify`, `adapt` sind Playbooks ohne Launcher-Befehl; sie laufen als manuelle Prüfung nach den vollständig gelesenen Reference-Dateien, ohne Overlay und ohne eigenen `critique`-Sub-Agent mit Browser-Assessment. (2) `detect` per URL läuft auf `/` und `/suche` in einen 30-Sekunden-Timeout (Dauerverbindung); dort Ersatz durch Quelltext-Lauf und Playwright-Messung. `detect` per URL sieht keine Sitzung; für `/app*` lief es zusätzlich gegen den Quelltext. (3) Nicht prüfbar: Onboarding-Formular, Zustand "Link abgelaufen", gefüllte Listen und Fehlerzustände (Seed ohne Spiele und Lobbys), Absenden der Formulare, Konto-Menü des Captains am Handy (Beleg Spieler, gleiche Komponente), echter Google-Login.

## Zusammenfassung

Angesehen: **138 von 138** Screenshots (23 Seiten x 3 Rollen x 2 Geräte), dazu rund 20 Zusatzaufnahmen (Konto-Menü, Zoom, Formulare). Durchgänge: 23 Seiten x 6 Rollen-Geräte-Zellen x 5 Befehle, Ergebnis je Durchgang in den Fundblättern.

| Priorität | X-Funde (erste Runde) | neue Funde der Fundblätter | Summe |
|---|---|---|---|
| P0 Bedienung kaputt | 1 | 0 | 1 |
| P1 verwirrend | 10 | 66 | 76 |
| P2 Optik | 9 | 115 | 124 |

Rohzählung: Viele Funde wiederholen sich je Rolle und Gerät und verweisen aufeinander (X-nn, GM-, GD-, SM-, SD-, CM-, CD-); die Zahl eigenständiger Probleme ist deutlich kleiner. Kennungen: GM = Gast Handy, GD = Gast Desktop, SM/SD = Spieler, CM/CD = Captain.

Die 10 schlimmsten Probleme (Auswahl nach Wirkung):
1. X-01: Suchfeld auf `/spieler` und `/teams` am Handy auf etwa 48 px gequetscht (P0).
2. Guthaben, Aufladen, Rabattcode und Altmodell-Texte stehen noch überall (Abschnitt MUSS WEG, X-05).
3. X-06 und SM-GL-1: untere Navigation falsch (falscher aktiver Reiter, Gäste sehen Reiter für Angemeldete).
4. GD-ALL-1: Kopfleiste am Desktop mit nur drei Links, die Fußzeile ist die einzige Gesamtnavigation.
5. SM-GL-6, SM-MA-1, SM-SN-1: Spieler ohne Captain-Rolle bekommt "Lobby aufmachen" als erste Handlung angeboten (X-20).
6. SM-EL-1: Einladungsseite erkennt ein bestehendes Mitglied nicht, der Klick endet still.
7. CD-ALL-3: `/app/suche/neu` hat im Quelltext keinen Einstieg ohne `?gegner=`, der Einladungslink liegt nur auf der Teamseite.
8. CM-MM-1: Das Lobby-Formular auf `/matchmaking` steht ganz unten, das Datumsfeld ist abgeschnitten.
9. X-03, X-04: `/app` zeigt Kartenwand und Kachelraster vor "Meine Spiele".
10. Rechtsseiten (GM-Funde): Platzhalter und Variablennamen (`OPERATOR_*`) auf `/impressum`, `/kontakt`, `/datenschutz` sichtbar.

## Matrix-Abdeckung

23 Seiten x 3 Rollen x 2 Geräte = 138 Zellen, alle angesehen. Rollen: Gast (keine Sitzung), Spieler (Mitglied von Demo Alpha, kein Captain), Captain (Team-Admin von Demo Alpha). Geräte: 390 x 844 und 1280 x 800.

Seiten: `/`, `/hilfe`, `/agb`, `/datenschutz`, `/impressum`, `/hausordnung`, `/kontakt`, `/unter-16`, `/anmelden`, `/willkommen`, `/suche`, `/spieler`, `/teams`, `/offline`, `/app`, `/app/suche/neu`, `/app/einstellungen`, `/app/benachrichtigungen`, `/app/guthaben` sowie die vom Orchestrator zugewiesenen `/matchmaking`, `/mitspieler`, `/einladung/[token]` (gültiger und ungültiger Token; der gültige Token liegt nur in der lokalen Worker-DB).

- Gast auf `/willkommen` und `/app*`: Weiterleitung zu `/anmelden` (Bilder byte-identisch, per MD5 belegt); Spieler und Captain auf `/anmelden` und `/willkommen`: Weiterleitung zu `/app`.
- Nicht Teil dieser Analyse: Gruppe Y (Rangliste, Ligen, Halle, Profitag, Overlay, Dev-Pay), Lobby, Spiel, Turnier, Privat, Team, Profil, Hallen und `/admin`.

## Methodik

1. Dev-Server nur auf Port 3102 (`PAYMENTS_FAKE=1`), Dev-Login nur in Nicht-Produktion, Seed `seed-demo`.
2. Playwright (Chromium), je Rolle und Gerät Ganzseiten-Screenshot mit 1,8 s Wartezeit (zuerst mit 0,3 s aufgenommen: Weiterleitungsseiten zeigten "Lädt…" und wurden neu aufgenommen) plus Messwerte (Überlauf, `h1`, Zielgrößen, Konsolenfehler, Höhe). Screenshots nur lokal außerhalb des Repos, Muster `rolle_gerät_seite.png`; ganzseitige Handy-Bilder zeigen die feste untere Navigation mitten im Bild (Aufnahme-Artefakt, kein Fund).
3. Impeccable nur über den Launcher (Engine 0.1.19): `context` je Durchlauf, `detect --json` je Seite mit `--viewport`. Nie `hooks`, `install`, `update`.
4. Sechs Sub-Agent-Durchläufe in Serie (Gast Handy, Gast Desktop, Spieler Handy, Spieler Desktop, Captain Handy, Captain Desktop). Jeder sah alle Screenshots seiner Zelle einzeln, las `critique.md`, `audit.md`, `distill.md`, `clarify.md`, `adapt.md` vollständig und führte die fünf Durchgänge je Seite einzeln aus; Ergebnis je Seite in den Fundblättern.
5. Zusätzlich Quelltext-Lektüre für Zustände, die der Seed nicht zeigt (ausdrücklich "aus Quelltext" markiert).

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

## MUSS WEG

Alles Folgende widerspricht dem Kartenmodell (Vertrag 012) oder der Vorgabe "keine Promo-Codes" und muss im Umbau entfernt oder umgeschrieben werden. Kurzliste; je Seite und Rolle steht es in der Tabelle darunter.

- Kopfleiste: Betragslink "Guthaben" mit Test-ID `header-wallet` (`Header.tsx:53-55`), nur am Desktop sichtbar.
- Konto-Menü: Eintrag "Guthaben" mit Betrag (`UserMenu.tsx:69-72`), am Handy der einzige Weg zum Guthaben.
- `/app`: Guthaben-Karte ("Zahlungen noch nicht aktiv, Spiele sind kostenlos").
- `/app/guthaben` als ganze Seite: Aufladen (20/50/100 Euro, Betragsfeld), Rabattcode (`TopUpForm.tsx`), Verlauf, Belege, Vier-Schritte-Text zum Guthaben.
- Startseite: "Kostenlos anmelden", "Du lädst dein Guthaben auf" (Preiskarte) und Ablauftexte mit Guthaben.
- Hilfe: Abschnitt "Geld und Guthaben" und weitere Antworten mit Guthaben oder Altmodell; `/agb` (§1, §3, §4), `/datenschutz`, `/hausordnung`, `/kontakt` mit Guthaben- oder Zahlungs-Altmodelltexten.
- Nur zu prüfen (kein sicherer Altmodelltext): `PrefsForm.tsx:27` und die Benachrichtigungsart "Zahlungen und Guthaben" (`notification-types.ts:43`).

Fundstellen je Seite, Rolle und Beleg, zusammengeführt aus den sechs Fundblättern (gleiche Zeilen nur einmal):

| Seite | Rolle | Fundstelle | Beleg |
|---|---|---|---|
| / | Gast | Text "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." (`lib/i18n.ts:59`, English `:127`) | gast_mobil_start.png |
| / | Gast | Karton "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`lib/i18n.ts:69`, English `:137`; gerendert in `components/HowItWorks.tsx:46-50`) | gast_mobil_start.png |
| /hilfe | Gast | Abschnitt "Geld und Guthaben" (`hilfe/page.tsx:75-96`) mit Fragen "Was kostet das?" (kostenlos), "Wie viel zahle ich genau?" (Reservierung, "aufs Guthaben"), "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?" ("aufs Guthaben"), "Kann ich mir Guthaben auszahlen lassen?" | gast_mobil_hilfe.png |
| /hilfe | Gast | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`hilfe/page.tsx:120`) | gast_mobil_hilfe.png |
| /hilfe | Gast | Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`hilfe/page.tsx:84`) | gast_mobil_hilfe.png |
| /agb | Gast | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab" (`agb/page.tsx:11`), §3 "Guthaben wird als Gutschrift geführt ... ausschließlich für Spiele" (`:19`), §4 "kostenlos abmelden ... sofort gutgeschrieben" (`:23`) | gast_mobil_agb.png |
| /datenschutz | Gast | "Zahlungen: Guthaben, Buchungen, Belege" (`datenschutz/page.tsx:23`) | gast_mobil_datenschutz.png |
| /hausordnung | Gast | "offenes Guthaben und Reservierungen" (`hausordnung/page.tsx:23`) | gast_mobil_hausordnung.png |
| /kontakt | Gast | Listenpunkt "Auszahlung deines Guthabens" (`kontakt/page.tsx:28`) | gast_mobil_kontakt.png |
| /app/guthaben | Gast (Weiterleitung) / Angemeldet | Ganze Seite und Kopfzeile "Guthaben", "So funktioniert dein Guthaben", "Aufladen", Hinweise "Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" und "Aufladen ist hier noch nicht eingerichtet" (`app/guthaben/page.tsx:15,52-85`) | gast_mobil_app-guthaben.png (Weiterleitung) |
| /app/guthaben | Angemeldet | Rabattcode-Feld "Rabattcode (optional)", Promo-Vorschau (`app/guthaben/TopUpForm.tsx:13-69`), Beschriftung "Bonus (Rabattcode)" (`app/guthaben/page.tsx:19`), Satz "Dein Guthaben verfällt nicht ..." (`TopUpForm.tsx:74`) | Quelltext (Gast sieht Weiterleitung) |
| /app | Angemeldet | Karte "Guthaben" mit "Aufladen, Verlauf und Belege" / "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" (`app/page.tsx:53-56`, Test-ID `wallet-card`) | Quelltext |
| alle Seiten | Angemeldet | Kopfleiste: Betragslink zum Guthaben (`components/Header.tsx:53-55`, Test-ID `header-wallet`, nur ab `sm`) | Quelltext |
| alle Seiten | Angemeldet | Konto-Menü: Eintrag "Guthaben" mit Betrag (`components/UserMenu.tsx:69-72`, Label `nav.wallet` in `lib/i18n.ts:33`, English "Balance" `:101`) | Quelltext |
| /lobby/[id] (Gruppe Y, nur Hinweis) | Angemeldet | "von deinem Guthaben ... reserviert" (`lobby/[id]/LobbyClient.tsx:87`), Button "Guthaben aufladen" (`:133-134`) | Quelltext |
| /turniere (Gruppe Y, nur Hinweis) | Gast | "Jeder Spieler zahlt seinen Eintritt selbst vom Guthaben." und "kostenlos" (`turniere/page.tsx:22,55`) | Quelltext |
| /app/privatspiel/neu, /app/turniere/neu (Gruppe Y, nur Hinweis) | Angemeldet | "Kostenlos (0 €)" (`PrivateGameForm.tsx:55`), "auf dein Guthaben aus" (`TournamentForm.tsx:64`) | Quelltext |
| /matchmaking | Gast | kein Treffer (Seitentext und QueueForm geprüft) | gast_mobil_matchmaking.png |
| /mitspieler | Gast | kein Treffer | gast_mobil_mitspieler.png |
| /einladung/[token] gültig | Gast | kein Treffer | gast_mobil_einladung-demoinvitex1.png |
| /einladung/[token] ungültig | Gast | kein Treffer | gast_mobil_einladung-ungueltig.png |
| / | Gast | Text "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." unter "So funktioniert Socaz" (`lib/i18n.ts:59`, English `:127`) | gast_desktop_start.png |
| / | Gast | Karte "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`lib/i18n.ts:69`, English `:137`; gerendert in `components/HowItWorks.tsx`) | gast_desktop_start.png |
| /hilfe | Gast | Gruppe "Geld und Guthaben" (`hilfe/page.tsx:76-96`) mit den fünf Fragen "Was kostet das?" (kostenlos), "Wie viel zahle ich genau?" (Reservierung, "aufs Guthaben"), "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?" ("aufs Guthaben"), "Kann ich mir Guthaben auszahlen lassen?" | gast_desktop_hilfe.png |
| /hilfe | Gast | Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`hilfe/page.tsx:84`) | gast_desktop_hilfe.png |
| /hilfe | Gast | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`hilfe/page.tsx:120`) | gast_desktop_hilfe.png |
| /agb | Gast | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab" (`agb/page.tsx:11`), §3 "ein zu viel reservierter Betrag wird gutgeschrieben. Guthaben wird als Gutschrift geführt ..." (`:19`), §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben" (`:23`) | gast_desktop_agb.png |
| /datenschutz | Gast | Listenpunkt "Zahlungen: Guthaben, Buchungen, Belege" (`datenschutz/page.tsx:23`) | gast_desktop_datenschutz.png |
| /hausordnung | Gast | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt." (`hausordnung/page.tsx:23`) | gast_desktop_hausordnung.png |
| /kontakt | Gast | Listenpunkt "Auszahlung deines Guthabens" (`kontakt/page.tsx:28`) | gast_desktop_kontakt.png |
| /app/guthaben | Gast (Weiterleitung) / Angemeldet | Ganze Seite: Titel "Guthaben", "So funktioniert dein Guthaben", Abschnitt "Aufladen", Hinweise "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" und "Aufladen ist hier noch nicht eingerichtet" (`app/guthaben/page.tsx:15,52-85`) | gast_desktop_app-guthaben.png (Weiterleitung) |
| alle Seiten (Desktop) | Angemeldet | Kopfleiste: Betragslink zum Guthaben, erscheint erst ab Breite `sm` (`components/Header.tsx:53-55`, Test-ID `header-wallet`); Gast sieht ihn in der Kopfleiste nicht (gast_desktop_start.png zeigt nur Offene Lobbys, Livescore, Rangliste, Anmelden) | Quelltext, gast_desktop_start.png |
| alle Seiten | Angemeldet | Konto-Menü: Eintrag "Guthaben" mit Betrag (`components/UserMenu.tsx:69-72`, Label `nav.wallet` in `lib/i18n.ts:33`, English "Balance") | Quelltext |
| /lobby/[id] (Gruppe Y, nur Hinweis) | Angemeldet | "von deinem Guthaben ... reserviert" (`lobby/[id]/LobbyClient.tsx:87`), Button "Guthaben aufladen" (`:133-134`); "Dieses Spiel ist kostenlos" (`lobby/[id]/page.tsx:255,273`) | Quelltext |
| /turniere (Gruppe Y, nur Hinweis) | Gast | "Jeder Spieler zahlt seinen Eintritt selbst vom Guthaben." und "kostenlos" (`turniere/page.tsx:22,55`); `turniere/[id]/page.tsx:72` "kostenlos" | Quelltext |
| /app/privatspiel/neu, /app/turniere/neu (Gruppe Y, nur Hinweis) | Angemeldet | "Kostenlos (0 €)" (`PrivateGameForm.tsx:55`), Auszahlung "auf dein Guthaben" (`TournamentForm.tsx:64`) | Quelltext |
| /matchmaking | Gast | kein Treffer (Seitentext und Formular geprüft) | gast_desktop_matchmaking.png |
| /mitspieler | Gast | kein Treffer | gast_desktop_mitspieler.png |
| /einladung/[token] gültig | Gast | kein Treffer | gast_desktop_einladung-demoinvitex1.png |
| /einladung/[token] ungültig | Gast | kein Treffer | gast_desktop_einladung-ungueltig.png |
| /suche, /spieler, /teams, /offline, /unter-16, /impressum, /anmelden | Gast | kein Treffer | gast_desktop_suche.png, gast_desktop_spieler.png, gast_desktop_teams.png, gast_desktop_offline.png, gast_desktop_unter-16.png, gast_desktop_impressum.png, gast_desktop_anmelden.png |
| alle Seiten | Spieler | Konto-Menü: Eintrag "Guthaben" mit Betrag "0,00 €" (`components/UserMenu.tsx:69-72`, Label `nav.wallet` in `lib/i18n.ts:33`, English "Balance" `:101`) | spieler_mobil_extra_kontomenue.png |
| alle Seiten (ab sm, Handy nicht sichtbar) | Spieler | Kopfleiste: Betragslink zum Guthaben mit Test-ID `header-wallet` (`components/Header.tsx:53-55`) und Abfrage `walletBalance` (`:17`) | Quelltext (am Handy `hidden`, nur Menü sichtbar) |
| /app | Spieler | Karte "Guthaben" mit Text "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" / "Aufladen, Verlauf und Belege" und Betrag (`app/app/page.tsx:53-59`, Test-ID `wallet-card`) | spieler_mobil_app.png |
| /app/guthaben | Spieler | Ganze Seite: Überschrift "Guthaben" mit Betrag (`app/app/guthaben/page.tsx:52-54`), "So funktioniert dein Guthaben" mit vier Schritten (`:56-66`), Satz "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" (`:64`), Link "Mehr zu Kosten und Erstattung" (`:65`) | spieler_mobil_app-guthaben.png |
| /app/guthaben | Spieler | Abschnitt "Aufladen" mit Schnellwahl 20/50/100 Euro, Feld "Betrag in Euro" (`app/app/guthaben/TopUpForm.tsx`, Seite `:79-86`) und Hinweis "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt) ... Stripe ... PayPal" (`:85`) | spieler_mobil_app-guthaben.png |
| /app/guthaben | Spieler | Rabattcode-Feld "Rabattcode (optional)" mit Promo-Vorschau (`TopUpForm.tsx:57`, Eingabe `promo`), Beschriftung "Bonus (Rabattcode)" (`guthaben/page.tsx:19`) | spieler_mobil_app-guthaben.png |
| /app/guthaben | Spieler | Satz "Dein Guthaben verfällt nicht und kann nur für Spiele auf Socaz verwendet werden" (`TopUpForm.tsx:74`) | spieler_mobil_app-guthaben.png |
| /app/guthaben | Spieler | Abschnitte "Verlauf" ("Noch keine Buchungen.") und "Belege" ("Noch keine Belege.") samt Buchungsarten "Startgebühr", "Hallenkosten" (`guthaben/page.tsx:17-26,88-134`) | spieler_mobil_app-guthaben.png |
| / | Spieler | Text "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." (`lib/i18n.ts:59`, English `:127`) | spieler_mobil_start.png |
| / | Spieler | Karton "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`lib/i18n.ts:69`, English `:137`; gerendert in `components/HowItWorks.tsx:46-50`) | spieler_mobil_start.png |
| /hilfe | Spieler | Abschnitt "Geld und Guthaben" (`hilfe/page.tsx:75-96`) mit "Was kostet das?" (kostenlos), "Wie viel zahle ich genau?", "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?", "Kann ich mir Guthaben auszahlen lassen?" | spieler_mobil_hilfe.png |
| /hilfe | Spieler | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`hilfe/page.tsx:120`) und Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`:84`) | spieler_mobil_hilfe.png |
| /agb | Spieler | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab" (`agb/page.tsx:11`), §3 "Guthaben wird als Gutschrift geführt ..." (`:19`), §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben" (`:23`) | spieler_mobil_agb.png |
| /datenschutz | Spieler | "Zahlungen: Guthaben, Buchungen, Belege" (`datenschutz/page.tsx:23`) | spieler_mobil_datenschutz.png |
| /hausordnung | Spieler | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (`hausordnung/page.tsx:23`) | spieler_mobil_hausordnung.png |
| /kontakt | Spieler | Listenpunkt "Auszahlung deines Guthabens" (`kontakt/page.tsx:28`) | spieler_mobil_kontakt.png |
| /app/einstellungen | Spieler | Hinweis "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (`app/app/einstellungen/PrefsForm.tsx:27`): nur Prüfen mit dem Kartenmodell, kein sicherer Altmodell-Text (SM-ES-2) | spieler_mobil_app-einstellungen.png |
| (Benachrichtigungsart) | Spieler | Art "Zahlungen und Guthaben" (`lib/notification-types.ts:43`, nicht abschaltbar, taucht als Titel in der Glocke auf, wenn ein Zahlungseintrag erzeugt wird): Bezeichnung prüfen | Quelltext |
| /matchmaking | Spieler | kein Treffer (Seitentext und QueueForm geprüft) | spieler_mobil_matchmaking.png |
| /mitspieler | Spieler | kein Treffer | spieler_mobil_mitspieler.png |
| /einladung/[token] gültig, ungültig | Spieler | kein Treffer | spieler_mobil_einladung-demoinvitex1.png |
| /suche, /spieler, /teams, /offline, /unter-16, /app/suche/neu, /app/benachrichtigungen | Spieler | kein Treffer (nur Fußzeile und Kopfleiste siehe oben) | spieler_mobil_suche.png |
| alle Seiten | Spieler | Kopfleiste: Betragslink "0,00 €" mit Test-ID `header-wallet`, Ziel `/app/guthaben`, `title` "Guthaben" (`Header.tsx:53-55`), dazu die Abfrage `walletBalance` bei jedem Seitenaufruf (`Header.tsx:17`) | spieler_desktop_start.png |
| alle Seiten | Spieler | Konto-Menü: Eintrag "Guthaben" mit Betrag "0,00 €" (`UserMenu.tsx:69-72`, Label `nav.wallet`, Prop `balanceText` in `Header.tsx:60`) | spieler_desktop_extra_kontomenue.png |
| /app | Spieler | Karte "Guthaben" mit "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" bzw. "Aufladen, Verlauf und Belege" und Betrag (`page.tsx (app):53-59`, Test-ID `wallet-card`, Abfrage `walletBalance`/`paymentsEnabled` `:13-14,22`) | spieler_desktop_app.png |
| /app/guthaben | Spieler | Ganze Seite: Überschrift "Guthaben" mit Betrag (`page.tsx (guthaben):52-54`), "So funktioniert dein Guthaben" mit vier Schritten (`:56-66`), Satz "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts, dein Guthaben bleibt aber erhalten." (`:64`), Link "Mehr zu Kosten und Erstattung" (`:65`) | spieler_desktop_app-guthaben.png |
| /app/guthaben | Spieler | Abschnitt "Aufladen" mit Schnellwahl 20/50/100 Euro, Feld "Betrag in Euro", Button "Jetzt bezahlen", Hinweis "Zwischen 5,00 und 200,00 Euro. Größere Beträge sparen Gebühren ..." (`TopUpForm.tsx:52`, Seite `:79-86`) und Betreibertext "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt) ..." (`:85`) | spieler_desktop_app-guthaben.png |
| /app/guthaben | Spieler | Rabattcode-Feld "Rabattcode (optional)" mit Promo-Vorschau (`TopUpForm.tsx`, Eingabe `promo`), Beschriftung "Bonus (Rabattcode)" (`page.tsx (guthaben):19`) | spieler_desktop_app-guthaben.png |
| /app/guthaben | Spieler | Satz "Du wirst zum Zahlungsanbieter weitergeleitet. Dein Guthaben verfällt nicht und kann nur für Spiele auf Socaz verwendet werden." (`TopUpForm.tsx:74`) | spieler_desktop_app-guthaben.png |
| /app/guthaben | Spieler | Abschnitte "Verlauf" ("Noch keine Buchungen.") und "Belege" ("Noch keine Belege.") samt Buchungsarten "Startgebühr", "Hallenkosten" (`page.tsx (guthaben):17-26,88-134`) | spieler_desktop_app-guthaben.png |
| / | Spieler | Text "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." (`i18n.ts:59`, English `:127`) | spieler_desktop_start.png |
| / | Spieler | Karte "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`i18n.ts:69`, English `:137`; gerendert in `HowItWorks.tsx`) | spieler_desktop_start.png |
| /hilfe | Spieler | Abschnitt "Geld und Guthaben" (`page.tsx (hilfe):75-96`) mit "Was kostet das?" (kostenlos), "Wie viel zahle ich genau?", "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?", "Kann ich mir Guthaben auszahlen lassen?" | spieler_desktop_hilfe.png |
| /hilfe | Spieler | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`page.tsx (hilfe):120`) und Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`:84`); widerspricht dem Löschformular (SD-ES-3) | spieler_desktop_hilfe.png |
| /agb | Spieler | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab" (`page.tsx (agb):11`), §3 "Guthaben wird als Gutschrift geführt ..." (`:19`), §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben" (`:23`) | spieler_desktop_agb.png |
| /datenschutz | Spieler | "Zahlungen: Guthaben, Buchungen, Belege" (`page.tsx (datenschutz):23`) | spieler_desktop_datenschutz.png |
| /hausordnung | Spieler | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (`page.tsx (hausordnung):23`) | spieler_desktop_hausordnung.png |
| /kontakt | Spieler | Listenpunkt "Auszahlung deines Guthabens" (`page.tsx (kontakt):28`) | spieler_desktop_kontakt.png |
| /app/einstellungen | Spieler | Hinweiszeile "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (`PrefsForm.tsx:27`): nur prüfen mit dem Kartenmodell, kein sicherer Altmodell-Text (SM-ES-2) | spieler_desktop_app-einstellungen.png |
| (Benachrichtigungsart) | Spieler | Art "Zahlungen und Guthaben" (`notification-types.ts:43`, nicht abschaltbar, erscheint als Titel in der Glocke): Bezeichnung prüfen | Quelltext |
| /matchmaking | Spieler | kein Treffer (Seitentext geprüft) | spieler_desktop_matchmaking.png |
| /mitspieler | Spieler | kein Treffer | spieler_desktop_mitspieler.png |
| /einladung/[token] gültig, ungültig | Spieler | kein Treffer | spieler_desktop_einladung-demoinvitex1.png |
| /suche, /spieler, /teams, /offline, /unter-16, /app/suche/neu, /app/benachrichtigungen | Spieler | kein Treffer im Seiteninhalt (nur Kopfleiste und Konto-Menü siehe oben) | spieler_desktop_suche.png |
| alle Seiten | Captain | Konto-Menü: Eintrag "Guthaben" mit Betrag "0,00 €" (`components/UserMenu.tsx:69-72`, Label `nav.wallet` in `lib/i18n.ts:33`); für den Captain nicht als Screenshot aufgenommen, aus Quelltext und gleiches Menü wie beim Spieler | spieler_mobil_extra_kontomenue.png (gleiche Komponente) |
| alle Seiten (ab sm, Handy nicht sichtbar) | Captain | Kopfleiste: Betragslink zum Guthaben, Test-ID `header-wallet` (`components/Header.tsx:53-55`), Abfrage `walletBalance` (`:17`) | Quelltext |
| /app | Captain | Karte "Guthaben" mit "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" / "Aufladen, Verlauf und Belege" und Betrag "0,00 €" (`app/app/page.tsx:53-59`, Test-ID `wallet-card`) | captain_mobil_app.png |
| /app/guthaben | Captain | Ganze Seite: Überschrift "Guthaben" mit Betrag, "So funktioniert dein Guthaben" mit vier Schritten, Satz "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts, dein Guthaben bleibt aber erhalten", Link "Mehr zu Kosten und Erstattung" (`app/app/guthaben/page.tsx:52-66`) | captain_mobil_app-guthaben.png |
| /app/guthaben | Captain | Abschnitt "Aufladen": Schnellwahl 20/50/100 €, Feld "Betrag in Euro" mit "Zwischen 5,00 und 200,00 Euro. Größere Beträge sparen Gebühren" (`TopUpForm.tsx`, Seite `:79-86`), Hinweis "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt)" (`:85`, nur ohne Anbieter) | captain_mobil_app-guthaben.png |
| /app/guthaben | Captain | Feld "Rabattcode (optional)" mit Promo-Vorschau (`TopUpForm.tsx:57`), Beschriftung "Bonus (Rabattcode)" (`guthaben/page.tsx:19`) | captain_mobil_app-guthaben.png |
| /app/guthaben | Captain | Satz "Du wirst zum Zahlungsanbieter weitergeleitet. Dein Guthaben verfällt nicht und kann nur für Spiele auf Socaz verwendet werden" (`TopUpForm.tsx:74`) | captain_mobil_app-guthaben.png |
| /app/guthaben | Captain | Abschnitte "Verlauf" ("Noch keine Buchungen.") und "Belege" ("Noch keine Belege.") samt Buchungsarten "Startgebühr", "Hallenkosten" (`guthaben/page.tsx:17-26,88-134`) | captain_mobil_app-guthaben.png |
| / | Captain | "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." (`lib/i18n.ts:59`) | captain_mobil_start.png |
| / | Captain | Karton "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`lib/i18n.ts:69`, gerendert in `components/HowItWorks.tsx:46-50`) | captain_mobil_start.png |
| /hilfe | Captain | Abschnitt "Geld und Guthaben" (`hilfe/page.tsx:75-96`): "Was kostet das?", "Wie viel zahle ich genau?", "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?", "Kann ich mir Guthaben auszahlen lassen?" | captain_mobil_hilfe.png |
| /hilfe | Captain | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`hilfe/page.tsx:120`), Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`:84`) | captain_mobil_hilfe.png |
| /agb | Captain | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab", §3 "Guthaben wird als Gutschrift geführt ...", §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben" (`agb/page.tsx:11,19,23`) | captain_mobil_agb.png |
| /datenschutz | Captain | "Zahlungen: Guthaben, Buchungen, Belege" (`datenschutz/page.tsx:23`) | captain_mobil_datenschutz.png |
| /hausordnung | Captain | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (`hausordnung/page.tsx:23`) | captain_mobil_hausordnung.png |
| /kontakt | Captain | Listenpunkt "Auszahlung deines Guthabens" (`kontakt/page.tsx:28`) | captain_mobil_kontakt.png |
| /app/einstellungen | Captain | Hinweis "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (`PrefsForm.tsx:27`): nur Prüfen mit dem Kartenmodell, kein sicherer Altmodell-Text | captain_mobil_app-einstellungen.png |
| (Benachrichtigungsart) | Captain | Art "Zahlungen und Guthaben" (`lib/notification-types.ts:43`): Bezeichnung prüfen | Quelltext |
| /matchmaking | Captain | kein Treffer (Seitentext und `QueueForm` geprüft) | captain_mobil_matchmaking.png |
| /app/suche/neu | Captain | kein Treffer (Formular geprüft; "Mindestens 24 Stunden im Voraus" ist Frist, kein Altmodell) | captain_mobil_app-suche-neu.png |
| /mitspieler | Captain | kein Treffer | captain_mobil_mitspieler.png |
| /einladung/[token] gültig, ungültig | Captain | kein Treffer | captain_mobil_einladung-demoinvitex1.png |
| /suche, /spieler, /teams, /offline, /unter-16, /impressum, /app/benachrichtigungen | Captain | kein Treffer (nur Fußzeile und Kopfleiste siehe oben) | captain_mobil_suche.png |
| alle Seiten | Captain | Kopfleiste: Betragslink "0,00 €" mit Test-ID `header-wallet`, Ziel `/app/guthaben`, `title` "Guthaben" (`Header.tsx:53-55`, 64 x 20 px gemessen), Abfrage `walletBalance` (`:17`) | captain_desktop_start.png |
| alle Seiten | Captain | Konto-Menü: Eintrag "Guthaben 0,00 €" (`UserMenu.tsx:69-72`, Label `nav.wallet`, Prop `balanceText`) | captain_desktop_extra_kontomenue.png |
| /app | Captain | Karte "Guthaben" mit "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" bzw. "Aufladen, Verlauf und Belege" und Betrag (`app/app/page.tsx:53-59`, Test-ID `wallet-card`, Abfragen `:13-14,22`) | captain_desktop_app.png |
| /app/guthaben | Captain | Ganze Seite: Überschrift "Guthaben" mit Betrag, "So funktioniert dein Guthaben" (vier Schritte), Satz "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts, dein Guthaben bleibt aber erhalten.", Link "Mehr zu Kosten und Erstattung" (`guthaben/page.tsx:52-66`) | captain_desktop_app-guthaben.png |
| /app/guthaben | Captain | Abschnitt "Aufladen": Schnellwahl 20/50/100 €, Feld "Betrag in Euro", Button "Jetzt bezahlen", Hinweis "Zwischen 5,00 und 200,00 Euro. Größere Beträge sparen Gebühren ..." (`TopUpForm.tsx`, Seite `:79-86`), Betreibertext "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt)" (`:85`) | captain_desktop_app-guthaben.png |
| /app/guthaben | Captain | Feld "Rabattcode (optional)" mit Promo-Vorschau (`TopUpForm.tsx`), Beschriftung "Bonus (Rabattcode)" (`guthaben/page.tsx:19`) | captain_desktop_app-guthaben.png |
| /app/guthaben | Captain | Satz "Du wirst zum Zahlungsanbieter weitergeleitet. Dein Guthaben verfällt nicht und kann nur für Spiele auf Socaz verwendet werden" (`TopUpForm.tsx:74`) | captain_desktop_app-guthaben.png |
| /app/guthaben | Captain | Abschnitte "Verlauf" ("Noch keine Buchungen.") und "Belege" ("Noch keine Belege.") samt Buchungsarten "Startgebühr", "Hallenkosten" (`guthaben/page.tsx:17-26,88-134`) | captain_desktop_app-guthaben.png |
| / | Captain | "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete." (`lib/i18n.ts:59`) | captain_desktop_start.png |
| / | Captain | Karte "Was kostet das?": "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir." (`lib/i18n.ts:69`, gerendert in `HowItWorks.tsx`) | captain_desktop_start.png |
| /hilfe | Captain | Abschnitt "Geld und Guthaben" (`hilfe/page.tsx:75-96`): "Was kostet das?", "Wie viel zahle ich genau?", "Wie lade ich Guthaben auf?" (Rabattcodes), "Wann bekomme ich mein Geld zurück?", "Kann ich mir Guthaben auszahlen lassen?" | captain_desktop_hilfe.png |
| /hilfe | Captain | "Wie lösche ich mein Konto?": "Vorher muss dein Guthaben auf null sein" (`hilfe/page.tsx:120`) und Verweis "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`:84`) | captain_desktop_hilfe.png |
| /agb | Captain | §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab", §3 "Guthaben wird als Gutschrift geführt ...", §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben" (`agb/page.tsx:11,19,23`) | captain_desktop_agb.png |
| /datenschutz | Captain | "Zahlungen: Guthaben, Buchungen, Belege" (`datenschutz/page.tsx:23`) | captain_desktop_datenschutz.png |
| /hausordnung | Captain | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (`hausordnung/page.tsx:23`) | captain_desktop_hausordnung.png |
| /kontakt | Captain | Listenpunkt "Auszahlung deines Guthabens" (`kontakt/page.tsx:28`) | captain_desktop_kontakt.png |
| /app/einstellungen | Captain | Hinweiszeile "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (`PrefsForm.tsx:27`): nur prüfen, kein sicherer Altmodell-Text | captain_desktop_app-einstellungen.png |
| (Benachrichtigungsart) | Captain | Art "Zahlungen und Guthaben" (`notification-types.ts:43`): Bezeichnung prüfen | Quelltext |
| /matchmaking, /app/suche/neu, /mitspieler, /einladung/[token] | Captain | kein Treffer (Seitentext und Formulare geprüft; "Mindestens 24 Stunden im Voraus" ist Frist, kein Altmodell) | captain_desktop_matchmaking.png |
| /suche, /spieler, /teams, /offline, /unter-16, /impressum, /app/benachrichtigungen | Captain | kein Treffer im Seiteninhalt (nur Kopfleiste und Konto-Menü, siehe oben) | captain_desktop_suche.png |

## Fundblätter

Je Seite: Beleg, Bewertung, die fünf Durchgänge (Befehl, angewandter Teil, Ergebnis) und die Funde. Sechs Blätter: Gast Handy, Gast Desktop, Spieler Handy, Spieler Desktop, Captain Handy, Captain Desktop. Der Abschnitt MUSS WEG am Ende jedes Blatts steht oben zusammengeführt.

### Fundblatt Gast, Handy

Rolle Gast (keine Sitzung), Gerät Handy mit Touch, Dev-Server Port 3102. Nur gelesen, kein Quelltext geändert.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl. Die fünf Reference-Dateien (`.claude/skills/impeccable/reference/<befehl>.md`) sind vollständig gelesen (critique.md in Abschnitten bis Zeile 820, die anderen komplett). Je Durchgang steht in eckigen Klammern, welcher Teil angewandt wurde. Die Prüfung ist manuell und läuft nicht als Sub-Agent; critique ist damit degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab. `detect` lief je Seite über den Launcher mit `--json --viewport 390x844`.

Aufnahme-Hinweise:
- Die neu aufgenommenen Gast-Screenshots (1,8 s Wartezeit) sind für `/willkommen`, `/app`, `/app/suche/neu`, `/app/einstellungen`, `/app/benachrichtigungen` und `/app/guthaben` alle byte-identisch (gleiche MD5-Summe) mit `gast_mobil_anmelden.png`: Endzustand ist immer dieselbe Anmeldeseite. Alle neu angesehen, die Abschnitte unten sind korrigiert. Der frühere Zwischenzustand "Lädt…" bleibt nur als kurzer Übergang (etwa 300 ms im Dev-Server, GM-WI-1).
- `detect` auf `/` und `/suche`: auch im zweiten Versuch (je einmal, `--viewport 390x844`) Timeout nach 30 s ("Navigation timeout"), vermutlich wegen der Dauerverbindung (EventSource/Stream). Ersatz: Zielgrößen per Playwright gemessen. Es bleibt bei den früheren `detect`-Funden X-13 (`/`) und X-10 (`/suche`).
- Der Screenshot-Stil ist hell (Mint), `detect` misst im Dunkelmodus (Kontrast #89958f auf #24362d); beide Modi existieren.
- Vier Zusatzseiten am Ende: `/matchmaking`, `/mitspieler`, `/einladung/demoinvitex1` (gültig), `/einladung/ungueltig`.

### Seitenübergreifende Funde (einmal beschrieben unter Start, von den Seiten referenziert)

Siehe GM-ST-4 (Zielgrößen Sprachwahl), GM-ST-5 (Gast-Navigation am Handy), GM-ST-6 (gemischte Sprache), GM-WI-1 (leere Weiterleitung). Vorhandene Funde X-06 (untere Navigation, aktiver Tab), X-07 (Fußzeile mit 14 statt 13 Links) und X-12 gelten auf allen Seiten.

---

#### /
Beleg: gast_mobil_start.png
Bewertung: Der erste Bildschirm ist ein Hallenfoto mit Überschrift und vier gleichrangigen Buttons; die untere Nav sitzt zusätzlich im Weg. Der Inhalt ist übersichtlich gestapelt, aber die Preis- und Guthabenaussagen (Kartenmodell fehlt) und die dreifach wiederholten Einstiege machen den Weg unklar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (reference/critique.md, manuell) | Funde: Zielhierarchie unklar (X-02, X-03), Wiederholung der Einstiege (GM-ST-2), Gast-Ziele ohne Anmeldehinweis (GM-ST-3), doppeltes Logo (GM-ST-7) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (reference/audit.md, manuell, metrics-gast.json: 8 von 42 Ziele < 44 px, kein Überlauf, 1 h1) | Funde: Sprachwahl 16 px hoch (GM-ST-4), Hero-Video läuft ohne Schutz (GM-ST-8), Text auf Foto (X-19) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (reference/distill.md, manuell) | Funde: vier Hero-Buttons + fünf Karten-Buttons (X-03), doppeltes Logo (GM-ST-7), Einstiege dreifach (GM-ST-2) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (reference/clarify.md, manuell) | Funde: "Kostenlos", "Du lädst dein Guthaben auf" (X-05, GM-ST-1), "Lobby aufmachen" ohne Hinweis auf Anmeldung (GM-ST-3) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (reference/adapt.md, manuell) | Funde: Livescore/Rangliste/Offene Lobbys in der Kopfleiste auf dem Handy ausgeblendet (GM-ST-5), Sprachwahl zu klein (GM-ST-4), Hero-Buttons ungleich breit (X-02) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Timeout nach 30 s (dreimal); keine neuen Daten. Früherer Lauf: Straggler X-13 |

Funde:
- X-02, X-03, X-13, X-19 (siehe Haupttabelle)
- X-05 | P1 | Altmodell-Texte, hier präzisiert in GM-ST-1
- GM-ST-1 | P1 | Zwei Aussagen stehen im Widerspruch zum Kartenmodell: "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete" (how.lead) und "Die Anmeldung und alle Funktionen sind kostenlos ... Du lädst dein Guthaben auf, den Rest erledigen wir" (how.price.text). Beide Texte stehen im Karton "Was kostet das?" kurz vor dem Seitenende. | gast_mobil_start.png | critique/clarify
- GM-ST-2 | P1 | "Offene Lobbys" und "Lobby aufmachen" erscheinen vier- bis fünffach: Hero-Button "Lobby aufmachen" und "Offene Lobbys ansehen", Karte Teamspiel mit denselben zwei Buttons, Abschnitt "Offene Lobbys", Fußzeile "Lobby aufmachen". Ein Gast kann nicht erkennen, was sich unterscheidet. | gast_mobil_start.png | distill
- GM-ST-3 | P1 | Als Gast führen "Privatspiel anlegen", "Turnier veranstalten", "Jetzt starten" und der Reiter "Privatspiel" (Schloss-Symbol) ohne jeden Hinweis auf die Anmeldung zur Anmeldeseite; "Lobby aufmachen" für Gäste landet auf `/matchmaking` (Ziel nicht Gruppe X). | gast_mobil_start.png | clarify
- GM-ST-4 | P1 | Zielgrößen: Sprachwahl "Deutsch" 49x16 px und "English" 41x16 px (Mindestgröße WCAG 2.5.8 ist 24x24), Link "Alles genau erklärt: Hilfe und Fragen" 234x18 px, Fußzeilen-Links nur 26 bis 40 px breit. Gilt auf jeder Seite. Ergänzt X-07. | gast_mobil_start.png, Messung html-gm/dump.cjs | audit
- GM-ST-5 | P1 | Kopfleiste am Handy zeigt dem Gast nur Logo und "Anmelden" (`Header.tsx:27-35`: Offene Lobbys, Livescore, Rangliste sind `hidden sm:inline`). Livescore und Rangliste sind am Handy nur in der Fußzeile erreichbar, die untere Nav hat dafür keinen Reiter. Ergänzt X-17 (nur Desktop beschrieben). | gast_mobil_start.png | adapt
- GM-ST-6 | P2 | Beim Umschalten auf English bleiben harte deutsche Texte: `GameModes.tsx` (alle Überschriften, Texte, Buttons), Zahlenkacheln "Teams/Spieler/Spiele" (`HowItWorks.tsx:23-25`), Fußzeile "Für Hallenbetreiber" (`Footer.tsx:23`), Installationshinweis. Datei `i18n.ts` kündigt Englisch für die Startseite an. | gast_mobil_start.png | clarify
- GM-ST-7 | P2 | Das Logo steht in der Kopfleiste und gleich noch einmal groß im Hero über der Überschrift. | gast_mobil_start.png | distill
- GM-ST-8 | P2 | Hero-Video (`autoPlay muted loop`, 60 % Deckkraft) hinter Text, ohne Pause für "weniger Bewegung" (CSS kann Video nicht anhalten) und ohne Hinweis auf mobile Datenmenge; Text liegt auf bewegtem Bild (vgl. X-19). | gast_mobil_start.png | audit
- GM-ST-9 | P2 | Zahlenkacheln zeigen "0 Spiele" (und kleine Werte 2 Teams, 10 Spieler) als erstes Vertrauenssignal; die Kacheln stehen vor den vier Schritten. Im Livebetrieb zu prüfen (Seed). | gast_mobil_start.png | critique

---

#### /hilfe
Beleg: gast_mobil_hilfe.png (Ende: gast_mobil_hilfe_ende-viewport.png)
Bewertung: Sauber gegliederte Aufklappliste mit 19 Fragen in fünf Gruppen, am Handy gut tippbar. Inhaltlich enthält die Seite den gesamten Altmodell-Block "Geld und Guthaben" und verweist auf Elemente, die am Handy nicht sichtbar sind.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Fachbegriffe mehrfach (GM-HI-3); sonst klare Gruppen und Reihenfolge |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 10 von 35 Ziele < 44 px, kein Überlauf) | Funde: gleiche Fußzeilenziele (X-07, GM-ST-4); Details/Summary tippbar, Fokus vorhanden |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | Funde: 19 Fragen ohne Suche oder Sprungmarken (GM-HI-4); sonst nichts zu streichen |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: Geld-Abschnitt Altmodell (GM-HI-1), "(oben)" verweist auf Unsichtbares (GM-HI-2), Begriffsmix (GM-HI-3) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: "oben in der Leiste" gilt nur am Desktop (GM-HI-2); Fließtext 14 px grau |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hilfe` | nur overused-font (gewollt, nicht gewertet); keine weiteren Funde |

Funde:
- GM-HI-1 | P1 | Ganzer Abschnitt "Geld und Guthaben" (`hilfe/page.tsx:75-96`) beschreibt das Altmodell: "Anmeldung und alle Funktionen sind kostenlos", Reservierung aufs Guthaben, "Wie lade ich Guthaben auf?" mit Rabattcodes, Rückerstattung "aufs Guthaben", "Kann ich mir Guthaben auszahlen lassen?". Auch `:120` (Konto löschen: "Guthaben auf null"). Siehe MUSS WEG. | gast_mobil_hilfe.png | clarify
- GM-HI-2 | P1 | "Unter „Offene Lobbys“ (oben)" (`:56`) und "Unter „Guthaben“ (oben in der Leiste oder in „Mein Bereich“)" (`:84`) verweisen auf Kopfleisten-Einträge, die am Handy gar nicht angezeigt werden (`hidden sm:inline`). | gast_mobil_hilfe.png | adapt
- GM-HI-3 | P1 | Mehrere Wörter für dasselbe: "Lobby", "Offene Lobbys", "Suche", "Spielsuche", "Gegnersuche" (Hilfe `:52-53`, Filter "Nur Gegnersuchen", Nav "Spiel suchen"). Ergänzt X-06. | gast_mobil_hilfe.png | clarify
- GM-HI-4 | P2 | 19 Fragen ohne Suchfeld, Inhaltsübersicht oder Sprungmarken (nur `#geld` existiert); alle zu, man muss jede einzeln öffnen. | gast_mobil_hilfe.png | distill
- X-07 | P1 | Fußzeile/Zielgrößen (siehe Haupttabelle)

---

#### /agb
Beleg: gast_mobil_agb.png
Bewertung: Lesbarer Rechtstext mit nummerierten Abschnitten, aber mit sichtbarem "Entwurf"-Kasten und Altmodell-Aussagen. Abschnitt 3 ist ein einzelner, dichter Absatz.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Entwurf-Hinweis öffentlich (GM-AG-1), dichter Absatz 3 (GM-AG-3) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 32 Ziele < 44 px) | Funde: Fließtext 14 px grau; Zielgrößen wie GM-ST-4 |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde (Text ist knapp) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: Altmodell-Sätze (GM-AG-2), "wickelt auf Wunsch die Bezahlung ab" |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Zeilenlänge am Handy gut; Fließtext 14 px (GM-AG-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/agb` | straggler "Betreiber." und "führen." (X-13); overused-font nicht gewertet |

Funde:
- X-13, X-14 (Straggler, Zeilenlänge)
- GM-AG-1 | P1 | Roter/umrandeter Kasten "Entwurf. Dieser Text wurde noch nicht rechtlich geprüft und gilt erst nach Freigabe" auf jeder Rechtsseite (`LegalPage.tsx:8-10`); vor dem Start zu entfernen, solange er steht, wirken AGB nicht verbindlich. Gilt auch für Datenschutz, Impressum, Hausordnung. | gast_mobil_agb.png | clarify
- GM-AG-2 | P1 | Altmodell: §1 "wickelt auf Wunsch die Bezahlung der Hallenmiete ab", §3 "Guthaben wird als Gutschrift geführt ... ausschließlich für Spiele", §4 "kostenlos abmelden; der Betrag wird sofort gutgeschrieben". Siehe MUSS WEG. | gast_mobil_agb.png | clarify
- GM-AG-3 | P2 | §3 ist ein Absatz mit etwa 9 Zeilen (Preis, Reservierung, Abrechnung, Guthaben, Brutto); als Liste oder mit Zwischenüberschriften besser überfliegbar. | gast_mobil_agb.png | distill

---

#### /datenschutz
Beleg: gast_mobil_datenschutz.png
Bewertung: Gut strukturiert, kein Überlauf, aber mit Platzhaltersatz beim Verantwortlichen, "Entwurf"-Kasten und Guthaben-Bezug.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Platzhalter beim Verantwortlichen (GM-DS-1), Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 8 von 33 Ziele < 44 px) | Funde: Link "Einstellungen" im Text verweist für Gast auf die Anmeldung (GM-DS-3) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: Guthaben (GM-DS-2), "Die Betreiberangaben werden vor dem Start eingetragen" |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: lange Seite (2084 px) ohne Sprungmarken, Fließtext 14 px (P2, GM-DS-4) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/datenschutz` | 4 straggler ("Betreiber.", "eingetragen.", "Cookie-Banner.", "erhalten."), siehe X-13; overused-font nicht gewertet |

Funde:
- X-13 (Straggler, vier Stellen)
- GM-DS-1 | P1 | Verantwortlicher steht als Platzhalter: "Die Betreiberangaben werden vor dem Start eingetragen." (`datenschutz/page.tsx:15`). | gast_mobil_datenschutz.png | clarify
- GM-DS-2 | P1 | "Zahlungen: Guthaben, Buchungen, Belege" (`:23`) passt nicht zum Kartenmodell. Siehe MUSS WEG. | gast_mobil_datenschutz.png | clarify
- GM-DS-3 | P2 | "Deine Daten kannst du jederzeit in den Einstellungen herunterladen" ist ein Link auf `/app/einstellungen`, der für Gäste zur Anmeldung führt. | gast_mobil_datenschutz.png | clarify
- GM-DS-4 | P2 | 14 Abschnitte ohne Inhaltsübersicht, am Handy 2084 px lang. | gast_mobil_datenschutz.png | adapt
- GM-AG-1 gilt auch hier.

---

#### /impressum
Beleg: gast_mobil_impressum.png
Bewertung: Kurz und lesbar, aber es zeigt der Öffentlichkeit Konfigurationsnamen und einen Entwurfshinweis. Als Pflichtseite im aktuellen Zustand nicht zeigbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Konfigurationsnamen im Text (GM-IM-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 32 Ziele < 44 px, Höhe 896 px) | keine neuen Funde (Fußzeile: X-07) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Die Betreiberangaben fehlen noch. Sie werden über OPERATOR_NAME, OPERATOR_ADDRESS und OPERATOR_EMAIL eingetragen." (GM-IM-1) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/impressum` | straggler "Betreiber." und "wieder." (X-13); overused-font nicht gewertet |

Funde:
- X-13
- GM-IM-1 | P1 | Für den Besucher sichtbarer Entwicklertext: Namen der Umgebungsvariablen (`impressum/page.tsx:22`). Auch auf `/kontakt` (GM-KO-1). Muss durch echte Angaben ersetzt werden oder darf nie ausgeliefert werden. | gast_mobil_impressum.png | clarify
- GM-AG-1 gilt auch hier.

---

#### /hausordnung
Beleg: gast_mobil_hausordnung.png
Bewertung: Kurz, gut gegliedert (Fair bleiben, Inhalte melden, Folgen). Ein Satz bezieht sich noch auf Guthaben.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | keine Funde (Entwurf-Hinweis: GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 32 Ziele < 44 px) | keine neuen Funde |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "offenes Guthaben" (GM-HO-1) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hausordnung` | straggler "Betreiber." und "abgewickelt." (X-13); overused-font nicht gewertet |

Funde:
- X-13
- GM-HO-1 | P1 | "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt." (`hausordnung/page.tsx:23`). Siehe MUSS WEG. | gast_mobil_hausordnung.png | clarify
- GM-AG-1 gilt auch hier.

---

#### /kontakt
Beleg: gast_mobil_kontakt.png
Bewertung: Übersichtlich, aber ohne gültige Kontaktadresse und mit einem Altmodell-Punkt in der Liste. Eine Kontaktaufnahme ist derzeit nicht möglich.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: kein Kontaktweg (GM-KO-1), Kopf: Text "Die Kontaktadresse wird noch eingetragen (Einstellung OPERATOR_EMAIL)." |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 8 von 33 Ziele < 44 px) | keine neuen Funde |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Auszahlung deines Guthabens" (GM-KO-2) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Nur E-Mail, kein Formular, am Handy öffnet das Mailprogramm (P2, GM-KO-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-KO-1 | P1 | Platzhalter sichtbar: "Die Kontaktadresse wird noch eingetragen (Einstellung OPERATOR_EMAIL)." (`kontakt/page.tsx:22`); Hilfe, Anmelde-Sperrhinweis und Fußzeile verweisen alle auf diese Seite. | gast_mobil_kontakt.png | clarify
- GM-KO-2 | P1 | "Auszahlung deines Guthabens" in der Liste "Dafür kannst du uns schreiben" (`:28`). Siehe MUSS WEG. | gast_mobil_kontakt.png | clarify
- GM-KO-3 | P2 | Kontakt nur als E-Mail-Link, kein Formular, keine Antwortzeit in Zahlen ("so schnell wir können"). | gast_mobil_kontakt.png | adapt

---

#### /unter-16
Beleg: gast_mobil_unter-16.png
Bewertung: Klare, ehrliche Kurzmeldung mit einem Weg zurück. Es fehlt der Hinweis, was als Nächstes möglich ist (Irrtum melden), und die Seite zeigt noch die Anmelde-Ziele.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Seite ist eine Sackgasse (GM-U16-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 33 Ziele < 44 px, Höhe 844) | keine neuen Funde |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Dein Konto wurde wieder gelöscht" ohne Folge, kein Weg bei Eingabefehler (GM-U16-1) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | keine Funde (Text zentriert, kurz) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/unter-16` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-U16-1 | P2 | Kein Hinweis, was jetzt geht (Nutzung als Zuschauer ohne Konto, Kontakt bei falsch eingegebenem Datum, ab wann wieder). Kopfleiste "Anmelden" und Reiter "Profil" bieten sofort wieder die Anmeldung an. | gast_mobil_unter-16.png | clarify

---

#### /anmelden
Beleg: gast_mobil_anmelden.png (Ende: gast_mobil_anmelden_ende-viewport.png)
Bewertung: Eine einzige Handlung, aber die Seite sagt nicht, warum man hier ist, und enthält am Handy Fußzeile und fünf Reiter neben dem einen Ziel. Lokal sind Entwicklerblöcke sichtbar (nicht gewertet).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Seitenziel klar, Umfeld laut (X-12), kein Anlass (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 39 Ziele < 44 px) | Funde: Pflichtangaben fehlen (GM-AN-2); Beschriftungen vorhanden |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | Funde: Kopfleiste "Anmelden" doppelt zum Seitenziel (GM-AN-3) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: kein Anlass (GM-AN-1), keine Hinweise auf AGB/Alter (GM-AN-2) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Daumenzone ok, aber untere Nav und Fußzeile konkurrieren (X-12) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/anmelden` | straggler "nötig." (X-13); overused-font nicht gewertet |

Funde:
- X-12, X-13
- GM-AN-1 | P1 | Kommt man über Reiter oder Link mit `?next=...`, steht nur "Anmelden – Mit deinem Google-Konto. Kein Passwort nötig." Kein Satz wie "Zum Spielanlegen musst du angemeldet sein". Ziel und Grund fehlen. Gilt für alle fünf `/app*`-Seiten. | gast_mobil_anmelden.png, gast_mobil_app_settled.png | clarify
- GM-AN-2 | P1 | Keine Hinweise am Anmelde-Button: Mindestalter 16, AGB, Datenschutz, was Google weitergibt; erst später (`/willkommen`) wird das Alter erfragt. | gast_mobil_anmelden.png | clarify
- GM-AN-3 | P2 | Kopfleiste zeigt weiter den Button "Anmelden", obwohl die Seite selbst die Anmeldung ist. | gast_mobil_anmelden.png | distill

---

#### /willkommen
Beleg: gast_mobil_willkommen.png (neu aufgenommen, zeigt die Anmeldeseite)
Bewertung: Als Gast ist `/willkommen` nur eine Weiterleitung auf `/anmelden` (ohne `next`); der neue Screenshot zeigt die Anmeldeseite ohne jeden Hinweis auf das Onboarding. Das eigentliche Onboardingformular war als Gast nicht prüfbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 1 Systemstatus und 3 Kontrolle, Persona Jordan] | Funde: Gast wird ohne Erklärung auf eine andere Seite gelegt (GM-AN-1); kurze leere Übergangsseite (GM-WI-1) |
| audit [Teil: Dimension 1 A11y (Landmarken, Überschrift), 4 Responsive] | Endseite: 1 h1, kein Überlauf, 7 von 39 Ziele < 44 px (GM-ST-4); Übergang "Lädt…" ohne Statusrolle (GM-WI-1) |
| distill [Teil: Information Architecture, Clear next action] | keine Funde (eine Handlung) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: kein Satz zum Grund der Weiterleitung (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Layout und Navigation] | keine neuen Funde (X-06 für die Reiter) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/willkommen` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- GM-WI-1 | P2 | Kurzer Übergang mit nur "Lädt…" ohne Kopfleiste, Navigation und Fußzeile (gemessen etwa 300 ms im Dev-Server, nicht mehr im neuen Screenshot), danach Weiterleitung. Gilt für `/willkommen` und alle `/app*`-Seiten; auf langsamer Mobilverbindung länger. Quelle `layout.tsx:55-58` (Suspense-Fallback). | gast_mobil_willkommen.png (alte Aufnahme) | critique/adapt
- GM-WI-2 | P2 | `/willkommen` leitet ohne `next` auf `/anmelden` (die `/app*`-Seiten behalten `next`). | metrics-gast.json | clarify
- GM-AN-1 (siehe `/anmelden`)
- Nicht prüfbar: das Onboardingformular (braucht Sitzung ohne `onboardedAt`).

#### /suche
Beleg: gast_mobil_suche.png (Ende: gast_mobil_suche_ende-viewport.png)
Bewertung: Die Filtermaske mit sechs Feldern beherrscht den ersten Bildschirm, die Liste ist im Seed leer. Die Überschrift "anderer Teams" und das rote "Live" passen nicht zu einem Gast.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Filter vor Inhalt (X-10), Überschrift "anderer Teams" (GM-SU-1), "Live" (GM-SU-2) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 8 von 40 Ziele < 44 px, kein Überlauf; Messung: "Lobby aufmachen" 177x36 px) | Funde: Button 36 px hoch (GM-SU-4), "Live"-Erklärung nur per `title` (nicht per Touch) (GM-SU-2) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | Funde: Satz "Jedes Spiel hat eine Nummer" ohne Nutzen, sechs Filter (X-10, GM-SU-3) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Stärke ab / bis" und "–" (GM-SU-5), leerer Zustand sagt "für dein Team" (GM-SU-6) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Auswahl "Art" abgeschnitten (X-10); Filter sollten einklappen |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Timeout nach 30 s (dreimal); früherer Lauf: unbalanced-heading (X-10) |

Funde:
- X-10
- GM-SU-1 | P1 | "Offene Lobbys anderer Teams": Ein Gast hat kein Team; auch Angemeldete mit Spiel in der Liste lesen "anderer" unklar. Titel im Tab dagegen "Offene Lobbys". | gast_mobil_suche.png | clarify
- GM-SU-2 | P1 | "Live" (rote, kleine Schrift, `LiveIndicator`) bedeutet nur "Verbindung steht", sieht aber aus wie "Live-Spiel läuft"; der Wechsel "○ Verbinde…" / "● Live" wird nur per `title` erklärt (am Handy nicht abrufbar). | gast_mobil_suche.png | clarify
- GM-SU-3 | P2 | Sechs Felder (Stadt, Datum, Dauer, Art, Stärke ab, bis) in zwei Spalten, davon "Datum" mit nativem "dd.mm.yyyy". Für den Gast ohne Filter reicht Stadt. | gast_mobil_suche.png | distill
- GM-SU-4 | P2 | "Lobby aufmachen" ist nur 36 px hoch (`!min-h-9`), kleiner als die anderen Hauptbuttons (X-10: ohne Anmeldehinweis). | gast_mobil_suche.png | audit
- GM-SU-5 | P2 | "Stärke ab" / "bis" mit "–" als Ausgangswert; Skala 1 bis 5 ohne Erklärung, "bis" steht ohne Substantiv. | gast_mobil_suche.png | clarify
- GM-SU-6 | P2 | Leerer Zustand "Mach eine Lobby für dein Team auf" richtet sich an Captains, nicht an Gäste oder gefilterte Suchen (kein Unterschied zwischen "nichts offen" und "nichts gefunden"). | gast_mobil_suche.png | clarify

---

#### /spieler
Beleg: gast_mobil_spieler.png
Bewertung: Zehn Spieler als einfache Karten, gut lesbar, aber die Suchzeile ist auf 48 px zusammengedrückt (X-01) und der Reiter "Profil" leuchtet für einen Gast. Nur Name, Stadt und Position öffentlich.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Suchfeld (X-01), aktiver Reiter "Profil" (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 45 Ziele < 44 px) | Funde: Platzhalter 4,1:1 (X-16) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | Funde: Jede Karte "0 Spiele · 0 Tore" (GM-SP-1) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Keine Angaben" vs. fehlende Zeile; Karten ohne Hinweis, dass Profile öffentlich sind (GM-SP-2) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Suchzeile bricht nicht um (X-01) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | low-contrast Platzhalter "Name suchen" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-06, X-16
- GM-SP-1 | P2 | Zahlen "0 Spiele · 0 Tore" rechts in jeder Karte als Rauschen; ohne Teamfarbe, Foto oder Avatar sind die Karten nicht unterscheidbar (vgl. X-18). | gast_mobil_spieler.png | distill
- GM-SP-2 | P2 | Gast sieht sofort alle Spielernamen (Datenschutzfolge: `profile_public` wird in `listPlayers` geprüft, nicht bestätigt) ohne Hinweis, dass nur öffentliche Profile erscheinen. | gast_mobil_spieler.png | clarify

---

#### /teams
Beleg: gast_mobil_teams.png
Bewertung: Zwei Teams, klare Zeilen. Suchzeile wie bei Spieler zu eng, Text lockt zu Aktionen, die der Gast nicht ausführen kann.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: Suchfeld (X-01), Reiter "Teamspiel" aktiv (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 37 Ziele < 44 px) | Funde: Platzhalter 4,1:1 (X-16) |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "fordere sie heraus" ohne Weg dorthin (GM-TE-1) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Suchfeld (X-01) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | low-contrast Platzhalter "Teamname" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-06, X-16
- GM-TE-1 | P2 | Der Satz "Schau dir Kader und Bilanz an und fordere sie heraus" ist für Gäste kein Ziel (Herausfordern nur mit Konto und Captain); in der Liste steht "noch ohne Spiel" statt Elo/Stärke. | gast_mobil_teams.png | clarify
- GM-TE-2 | P2 | Quelltext `teams/page.tsx:66`: `t.members === 1 ? "Spieler" : "Spieler"` (beide Zweige gleich, tote Fallunterscheidung); in der Anzeige "5 Spieler", unkritisch. | gast_mobil_teams.png | audit

---

#### /offline
Beleg: gast_mobil_offline.png
Bewertung: Kurze, ehrliche Meldung; aber die Seite zeigt volle Navigation, Fußzeile und Reiter, die ohne Netz alle ins Leere führen, und bietet keine Handlung.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam, Severity] (manuell) | Funde: keine Handlung (GM-OF-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance nur gestreift] (manuell, 7 von 32 Ziele < 44 px) | keine neuen Funde |
| distill [Teil: Assess Current State, Information Architecture, Content und Interaction Simplification] (manuell) | Funde: 14 Fußzeilenlinks und fünf Reiter ohne Netz sinnlos (GM-OF-2) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (manuell) | Funde: "Sobald du wieder online bist, geht es weiter" ohne Knopf (GM-OF-1) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch, Safe Areas] (manuell) | Funde: Ziel einer PWA, Handy; Wiederholen-Knopf in Daumenzone fehlt (GM-OF-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/offline` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-OF-1 | P1 | Kein Knopf "Erneut versuchen"; die Seite wartet auf eine Selbstheilung, die nicht sichtbar wird. | gast_mobil_offline.png | clarify/adapt
- GM-OF-2 | P2 | Auf der Offline-Seite stehen Kopfleiste mit "Anmelden", fünf Reiter und 14 Fußzeilen-Links; keiner funktioniert ohne Netz. | gast_mobil_offline.png | distill

---

#### /app
Beleg: gast_mobil_app.png (neu aufgenommen, byte-identisch mit gast_mobil_anmelden.png)
Bewertung: Gast landet auf der Anmeldeseite (`?next=%2Fapp`). Auf dem Bild steht nichts von "Mein Bereich"; wer "Profil" antippt, erfährt nicht, warum er hier ist.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1); Reiter ohne Aktiv-Zustand auf der Zielseite (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Endseite: 7 von 39 Ziele < 44 px, kein Überlauf, 1 h1 (GM-ST-4, X-07); Übergang GM-WI-1 |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde (Seite selbst nicht sichtbar) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Interaction und Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- GM-AN-1, GM-WI-1, X-06
- Altmodell-Texte der eigentlichen Seite (für Gast nicht sichtbar): `app/page.tsx:53-56`, siehe MUSS WEG und X-05.

#### /app/suche/neu
Beleg: gast_mobil_app-suche-neu.png (neu aufgenommen, byte-identisch mit gast_mobil_anmelden.png)
Bewertung: Weiterleitung auf die Anmeldeseite (`?next=%2Fapp%2Fsuche%2Fneu`); die Seite selbst ist als Gast nicht sichtbar (X-11 als Captain).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1); Reiter ohne Aktiv-Zustand auf der Zielseite (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Endseite: 7 von 39 Ziele < 44 px, kein Überlauf, 1 h1 (GM-ST-4, X-07); Übergang GM-WI-1 |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde  |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Interaction und Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- GM-AN-1, GM-WI-1, X-11 (als Captain)

#### /app/einstellungen
Beleg: gast_mobil_app-einstellungen.png (neu aufgenommen, byte-identisch mit gast_mobil_anmelden.png)
Bewertung: Weiterleitung auf die Anmeldeseite (`?next=%2Fapp%2Feinstellungen`). Der Link "Einstellungen" im Datenschutz führt Gäste hierher (GM-DS-3).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1); Reiter ohne Aktiv-Zustand auf der Zielseite (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Endseite: 7 von 39 Ziele < 44 px, kein Überlauf, 1 h1 (GM-ST-4, X-07); Übergang GM-WI-1 |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde (X-08 gilt für Spieler und Captain) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Interaction und Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- GM-AN-1, GM-WI-1, GM-DS-3, X-08 (als Spieler)

#### /app/benachrichtigungen
Beleg: gast_mobil_app-benachrichtigungen.png (neu aufgenommen, byte-identisch mit gast_mobil_anmelden.png)
Bewertung: Weiterleitung auf die Anmeldeseite (`?next=%2Fapp%2Fbenachrichtigungen`). Die Glocke steht nur Angemeldeten in der Kopfleiste zur Verfügung.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1); Reiter ohne Aktiv-Zustand auf der Zielseite (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Endseite: 7 von 39 Ziele < 44 px, kein Überlauf, 1 h1 (GM-ST-4, X-07); Übergang GM-WI-1 |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde  |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Interaction und Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- GM-AN-1, GM-WI-1, X-12

#### /app/guthaben
Beleg: gast_mobil_app-guthaben.png (neu aufgenommen, byte-identisch mit gast_mobil_anmelden.png)
Bewertung: Gast wird zur Anmeldung geleitet (`?next=%2Fapp%2Fguthaben`); die Seite selbst ist Altmodell und entfällt mit Vertrag 012 (X-05, X-09). Der Gast sieht sie nie, aber Hilfe und Datenschutz verweisen darauf.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1); Reiter ohne Aktiv-Zustand auf der Zielseite (X-06) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Endseite: 7 von 39 Ziele < 44 px, kein Überlauf, 1 h1 (GM-ST-4, X-07); Übergang GM-WI-1 |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde (gesamte Seite streichen, siehe MUSS WEG) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Mobile Adaptation Interaction und Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` | straggler "nötig." (Endseite, X-13); overused-font nicht gewertet |

Funde:
- X-05, X-09, GM-AN-1, GM-WI-1, GM-HI-2

---

### Zusatzseiten (Gast, Handy)

#### /matchmaking
Beleg: gast_mobil_matchmaking.png
Bewertung: Eine ehrliche Erklärseite mit vier Schritten und leerer Liste "Offene Suchen (0)". Die einzige Gast-Handlung "Anmelden und Lobby aufmachen" steht ganz am Ende (Position 789 px bei 1186 px Seitenhöhe, im ersten Bildschirm hinter der festen unteren Nav verdeckt). Der Gast liest zuerst über Captains und Hallen-Veto, bevor er erfährt, dass er sich anmelden muss.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste (Single focus, Visual hierarchy, Progressive disclosure), Heuristik 2 Sprache, 4 Konsistenz, 8 Minimalismus; Personas Jordan und Casey] | Funde: GM-MM-1 (CTA am Ende), GM-MM-2 (spricht Captains an), GM-MM-3 (Doppelung mit `/suche`), GM-MM-5 (Fachwörter) |
| audit [Teil: Dimension 1 A11y (Beschriftung, Fokus), 4 Responsive (Zielgrößen), 5 Integrität] | Gemessen: kein Überlauf, 1 h1, Filter-Selects und Button 36 px hoch (GM-MM-4), Sprachwahl 16 px (GM-ST-4) |
| distill [Teil: Information Architecture, Progressive disclosure, Content Simplification] | Funde: vier Schritte plus Einleitung vor der Liste (GM-MM-5); Liste und Filter für leere Liste (GM-MM-3) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] | Funde: "Du bist Captain" (GM-MM-2), "Offene Suchen" vs "Offene Lobbys" (GM-MM-3), leerer Zustand für Gast (GM-MM-6) |
| adapt [Teil: Mobile Adaptation Layout und Interaction, Thumb zone, Touch Adaptation] | Funde: CTA verdeckt (GM-MM-1), 36-px-Ziele (GM-MM-4), `grid-cols-3` im Formular (GM-MM-7, nur Quelltext) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | straggler "offen." (13 % der Zeile, wie X-13); overused-font nicht gewertet |

Funde:
- GM-MM-1 | P1 | Die einzige Gast-Handlung ("Anmelden und Lobby aufmachen", `matchmaking/page.tsx:95`) steht nach Einleitung, vier Schritten, Filterzeile und leerer Liste ganz unten; im ersten Bildschirm liegt sie hinter der festen Nav. | gast_mobil_matchmaking.png | adapt
- GM-MM-2 | P1 | Die Einleitung "Du bist Captain und willst mit deinem Team spielen?" setzt die Rolle voraus; Spieler ohne Captain-Rolle erfahren erst ganz unten ("Nur Team-Admins können nach Gegnern suchen"), dass sie nicht gemeint sind. Ergänzt X-20. | gast_mobil_matchmaking.png | clarify
- GM-MM-3 | P1 | Zwei Seiten zeigen offene Lobbys mit Stadtfilter unter verschiedenen Namen: `/suche` "Offene Lobbys anderer Teams" und hier "Offene Suchen (0)"; die Hilfe sagt "Offene Lobbys". Der Gast weiß nicht, welche Seite er braucht; die Liste hier ist leer und trägt den Filter davor. Ergänzt GM-HI-3, X-06. | gast_mobil_matchmaking.png | distill
- GM-MM-4 | P2 | Filterzeile: Selects und "Filtern" nur 36 px hoch (`!min-h-9`), "Alle Dauern" abgeschnitten ("Alle Dauer"), Überschrift und Filter teilen sich eine Zeile. | gast_mobil_matchmaking.png | adapt
- GM-MM-5 | P2 | Schritt 4 nennt "Hallen-Veto" und "bannt" ohne Erklärung, "Zeitfenster" wird erst im Formular erklärt, das der Gast nie sieht; sieben Zeilen Prozesstext vor allen Daten. | gast_mobil_matchmaking.png | distill
- GM-MM-6 | P2 | Leerer Zustand "Mach eine Lobby für dein Team auf, dann sehen es andere hier" richtet sich an Captains, nicht an den Gast (wie GM-SU-6). | gast_mobil_matchmaking.png | clarify
- GM-MM-7 | P2 | Formular (nur Quelltext, als Gast nicht sichtbar): Tag, Von, Bis stehen in `grid-cols-3` (`QueueForm.tsx:69`), je etwa 110 px breit; native Datums- und Zeitfelder passen dort kaum. Nicht visuell geprüft. | Quelltext | adapt
- X-06 (aktiver Reiter "Teamspiel" stimmt hier), X-13, X-07

---

#### /mitspieler
Beleg: gast_mobil_mitspieler.png
Bewertung: Kurze, leere Seite. Titel und Einleitung beschreiben die Seite aus Sicht eines Captains, die Eintragen-Handlung ist ein kleiner Textlink, und die leere Liste hat einen Filter davor.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 2 Sprache, 6 Wiedererkennung, 9 Fehlerbehebung; Personas Jordan und Casey] | Funde: GM-MS-1 (Gast-Handlung als Textlink), GM-MS-2 (leer), GM-MS-3 (Titelrichtung) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen)] | Gemessen: "Melde dich an" 91x18 px (GM-MS-1), Filtern 86x44, kein Überlauf; Quelltext: Buttons `!min-h-8` 32 px (GM-MS-4) |
| distill [Teil: Remove redundancy, Progressive disclosure] | Funde: Stadtfilter ohne Inhalt (GM-MS-2) |
| clarify [Teil: Audit the language, Empty states, Actions] | Funde: GM-MS-2, GM-MS-3 |
| adapt [Teil: Mobile Adaptation Interaction, Touch Adaptation] | Funde: kleine Ziele (GM-MS-1, GM-MS-4); sonst gut gestapelt |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-MS-1 | P1 | Die einzige Gast-Handlung ist der Satz "Melde dich an, um dich einzutragen." mit einem 91x18-px-Textlink statt eines Buttons (`mitspieler/page.tsx:30`), ohne Erklärung, was passiert. | gast_mobil_mitspieler.png | adapt
- GM-MS-2 | P1 | Leerer Zustand "Gerade hat sich niemand eingetragen." ohne nächste Handlung; davor steht ein Stadtfilter mit Button für eine leere Liste. | gast_mobil_mitspieler.png | clarify
- GM-MS-3 | P1 | Richtung unklar: Titel "Mitspieler gesucht" und "Fehlt dir jemand? Frag ihn an" sprechen Captains an, das Formular heißt "Ich suche ein Spiel" (Spieler), die Liste zeigt Spieler. Der Gast erkennt nicht, wer hier wen sucht. Erreichbar nur über die Fußzeile. | gast_mobil_mitspieler.png | clarify
- GM-MS-4 | P2 | Quelltext: "Anfragen" (`!min-h-8`, 32 px) und "Zurückziehen" (`text-xs`, Textlink) sind unter 44 px (`PostForm.tsx:45,67`); nur für Angemeldete sichtbar, nicht visuell geprüft. | Quelltext | audit
- X-07, GM-ST-4

---

#### /einladung/demoinvitex1 (gültiger Token)
Beleg: gast_mobil_einladung-demoinvitex1.png
Bewertung: Klarste Seite der Gruppe: Team, Stadt, Kadergröße und ein breiter Button "Anmelden und beitreten" im oberen Drittel. Gästen fehlen Vertrauenssignale vor der Google-Anmeldung, und der falsche Reiter "Privatspiel" leuchtet.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 1 Systemstatus (aktiver Reiter), 4 Konsistenz, 8 Minimalismus; Personas Jordan, Casey] | Funde: GM-EL-1 (falscher Reiter), GM-EL-2 (Vertrauen), GM-EL-3 (Umfeld laut) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Gemessen: kein Überlauf, 1 h1, Button 358x44 px; nur Fußzeile und Sprachwahl klein (GM-ST-4) |
| distill [Teil: Clear next action, Remove redundancy] | Funde: zweiter Button "Anmelden" in der Kopfleiste (GM-EL-4) |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: GM-EL-2 (Folgen des Beitritts, wer lädt ein) |
| adapt [Teil: Mobile Adaptation Navigation, Thumb zone] | Funde: Button im oberen Drittel, bei kurzer Seite akzeptabel; Nav und Fußzeile stören (GM-EL-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/demoinvitex1` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EL-1 | P1 | Der Reiter "Privatspiel" (Schloss) ist auf der Teameinladung hervorgehoben, weil `BottomNav.tsx:13` `/einladung` dem Privatspiel zuordnet; die Einladung führt aber in ein Team. Ergänzt X-06. | gast_mobil_einladung-demoinvitex1.png | critique
- GM-EL-2 | P1 | Vor der Google-Anmeldung steht nur "Demo Alpha · Gelsenkirchen · 5 Spieler im Kader": keine einladende Person, keine Stärke, kein Hinweis, was der Beitritt freigibt (Name und Profil im Team) und dass Mindestalter 16 gilt. | gast_mobil_einladung-demoinvitex1.png | clarify
- GM-EL-3 | P2 | Kopfleiste, 14 Fußzeilen-Links und fünf Reiter umgeben das einzige Ziel (wie X-12). | gast_mobil_einladung-demoinvitex1.png | distill
- GM-EL-4 | P2 | Zweimal "Anmelden": Kopfleiste und Seitenbutton "Anmelden und beitreten". | gast_mobil_einladung-demoinvitex1.png | distill
- GM-EL-5 | P2 | Quelltext `einladung/[token]/page.tsx:29`: `members === 1 ? "Spieler" : "Spieler"` (beide Zweige gleich, wie GM-TE-2). Nach der Anmeldung ohne Onboarding führt der Weg über `/willkommen?next=` (als Gast nicht prüfbar). | Quelltext | audit

---

#### /einladung/ungueltig (ungültiger Token)
Beleg: gast_mobil_einladung-ungueltig.png
Bewertung: Knappe, verständliche Fehlermeldung mit Weg zur Startseite. Es fehlen mögliche Gründe und ein sinnvoller nächster Schritt für jemanden, der sonst nichts auf Socaz kennt; der Reiter "Privatspiel" leuchtet auch hier.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 3 Kontrolle, 9 Fehlerbehebung, 10 Hilfe; Personas Jordan, Riley] | Funde: GM-EU-1 (nächster Schritt), GM-EU-2 (Reiter) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] | Gemessen: kein Überlauf, 1 h1, Button 141x44 px; GM-ST-4 für Sprachwahl |
| distill [Teil: Content Simplification] | keine Funde (Text kurz) |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] | Funde: Grund und Ausweg unvollständig (GM-EU-1) |
| adapt [Teil: Mobile Adaptation Content, Navigation] | Funde: Fußzeile und Reiter stören eine Fehlerseite (wie GM-EL-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/ungueltig` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EU-1 | P2 | "Diesen Einladungslink gibt es nicht. Bitte frag den Team-Admin nach einem neuen." nennt keinen Grund (Tippfehler, widerrufen; der abgelaufene Fall hat einen eigenen Text, `page.tsx:17-21`) und bietet nur "Zur Startseite"; kein Verweis auf Hilfe ("Wie lade ich Mitspieler ein?") oder Team gründen. | gast_mobil_einladung-ungueltig.png | clarify
- GM-EU-2 | P1 | Reiter "Privatspiel" ist auch auf der Fehlerseite aktiv (siehe GM-EL-1). | gast_mobil_einladung-ungueltig.png | critique
- Nicht geprüft: Zustand "Link abgelaufen" (kein Token im Seed).



### Fundblatt Gast, Desktop

Rolle Gast (keine Sitzung), Gerät Desktop 1280 x 800 mit Maus und Tastatur, Dev-Server Port 3102. Nur gelesen und gemessen, kein Quelltext geändert, kein Commit.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl. Die fünf Reference-Dateien (`critique.md` in zwei Abschnitten bis zum Ende inklusive Kognitive-Last-Checkliste, Heuristiken-Leitfaden und Personas, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) sind vollständig gelesen. Je Durchgang steht in eckigen Klammern, welcher Teil angewandt wurde. Die Prüfung ist manuell und läuft nicht als Sub-Agent: critique ist damit degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab (PRODUCT.md geladen). `detect` lief je Seite über den Launcher mit `--json --viewport 1280x800`. `polish` war nicht nötig (nichts wird geändert).

Aufnahme- und Messhinweise:
- Alle 23 Screenshots wurden einzeln angesehen. `/willkommen`, `/app`, `/app/suche/neu`, `/app/einstellungen`, `/app/benachrichtigungen`, `/app/guthaben` sind byte-identisch (gleiche MD5-Summe) mit `gast_desktop_anmelden.png`: Der Endzustand ist immer die Anmeldeseite; die Weiterleitung ist der Befund (GM-AN-1, GM-WI-1).
- `detect` auf `/` und `/suche`: viermal je Seite (zwei Läufe, davon ein serieller Wiederholungslauf) Timeout nach 30 s ("Navigation timeout", Dauerverbindung). Ersatz: Playwright-Messung (Tab-Reihenfolge, Hover, Positionen) und der frühere `detect`-Lauf 1280x800 aus der Haupt-Analyse (Funde X-14 Zeilenlänge Preiskarte, X-15 knapper Innenabstand am Ghost-Button).
- `detect` misst im Dunkelmodus (Platzhalter #89958f auf #24362d), der Screenshot-Stil ist hell (Mint); beide Modi existieren. `overused-font` (Plus Jakarta Sans) ist gewollt und nie gewertet.
- Zusätzliche Desktop-Messung per Playwright (`probe.cjs`, `probe2.cjs`, im selben Verzeichnis): Tab-Reihenfolge, Fokusring, Hover, Überschriftengrößen, Fußzeilenposition, Zeichen je Zeile.
- Dev-Overlay (runder "N"-Knopf), Hinweis "AUTH_GOOGLE_ID fehlt" und Dev-Login auf `/anmelden` sind nur lokal und nicht gewertet.
- Nur Gast geprüft: Seiten mit Sitzung (z. B. Kopfleiste mit Guthaben-Betrag) sind aus dem Quelltext abgeleitet, nicht gesehen.

### Seitenübergreifende Desktop-Funde (einmal beschrieben, von den Seiten referenziert)

Vorhandene Funde X-07 (Fußzeile), X-12 (Anmeldeseite mit Umfeld), X-14 (Zeilenlänge), X-17 (schmale Spalte, Kopfleiste) und GM-ST-1 bis GM-ST-9 gelten auch am Desktop. Der Handy-Fund X-06 (untere Navigation) und GM-ST-5 (Kopfleiste am Handy) entfallen am Desktop: dort gibt es keine untere Leiste, die Kopfleiste zeigt aber nur drei Links.

- GD-ALL-1 | P1 | Navigation am Desktop: Die Kopfleiste zeigt dem Gast nur "Offene Lobbys", "Livescore", "Rangliste" und "Anmelden" (`Header.tsx:25-31`, 1280 px Breite, Spalte 720 px, je 280 px leer). Teamspiel, Privatspiel, Turniere, Hilfe, Teams, Spieler und Hallen sind nur über die 14 Fußzeilenlinks (12 px) oder Karten erreichbar. Die Hilfe wird auf keiner Seite oben angeboten. Ergänzt X-17 um die Folge: Auf dem Desktop ist die Fußzeile die einzige vollständige Navigation. | gast_desktop_start.png, gast_desktop_hilfe.png | critique/adapt
- GD-ALL-2 | P2 | Tastatur: Vor dem Seiteninhalt liegen fünf Tab-Stopps (Logo, drei Links, "Anmelden"), es gibt keinen Sprunglink "Zum Inhalt" (`layout.tsx`, `Header.tsx`, keine Treffer). Auf `/matchmaking` und `/mitspieler` liegen vor der einzigen Gast-Handlung zusätzlich alle Filterfelder. Positiv: Alle geprüften Elemente (Links, Felder, Buttons, Zusammenfassungen) zeigen einen 2-px-Fokusring in der Akzentfarbe (globaler `:focus-visible`-Stil), Tab-Reihenfolge entspricht der Lesereihenfolge. | Messung probe.cjs (Seiten /, /hilfe, /suche, /spieler, /matchmaking, /anmelden) | audit
- GD-ALL-3 | P2 | Kurze Seiten: Die Fußzeile klebt direkt unter dem Inhalt, darunter bleibt bis zu 520 px leere Fläche (Fußzeile beginnt bei y=277 auf `/offline`, 285 bis 301 auf `/einladung/*`, 317 auf `/unter-16`, 343 auf `/mitspieler`, 410 auf `/teams`, 447 auf `/impressum`). Die Seiten wirken abgebrochen; `main` hat keine Mindesthöhe. | gast_desktop_offline.png, gast_desktop_einladung-ungueltig.png, gast_desktop_unter-16.png | adapt
- GD-ALL-4 | P2 | Fußzeile am Desktop: 14 Links in 12 px grauer Schrift (Breiten 26 bis 109 px, Höhe 44 px), die in drei lose Zeilen mit 48 px Zeilenabstand brechen (Mindesthöhe 44 px plus Abstand, `Footer.tsx:9-23`). Kategorien sind gemischt: "Lobby aufmachen", "Mitspieler gesucht" und "Für Hallenbetreiber" stehen in der Rechtsnavigation (`aria-label` Rechtliches). Am Desktop würde eine geordnete Spaltenliste in einer Höhe von etwa 120 px reichen. Ergänzt X-07. | gast_desktop_hilfe.png | distill/adapt
- GD-ALL-5 | P2 | Überschriften und Ausrichtung uneinheitlich: `h1` hat 30 px auf Hilfe, AGB, Datenschutz, Impressum, Kontakt, Teams, Spieler, Matchmaking, Mitspieler, aber 24 px auf Suche, Anmelden, Offline, Unter-16 und "Link ungültig". Die linke Kante des Inhalts liegt bei 280 px (Standard), 416 px (`/unter-16`, zentriert), 448 px (`/anmelden` als schmale Spalte von 384 px, `/offline`, `/einladung/*` zentriert). Auf `/anmelden` fluchtet die Überschrift weder mit dem Logo (x=280) noch mit der rechten Kante der Kopfleiste (x=1000). | gast_desktop_anmelden.png, gast_desktop_unter-16.png, gast_desktop_suche.png, gast_desktop_hilfe.png | critique/adapt
- GD-ALL-6 | P2 | Hover und Fokus: Kopf- und Fußzeilenlinks wechseln beim Hover nur von mittlerem Grau (#4a5a51) nach Tinte, ohne Unterstrich oder Hintergrund; Ghost-Buttons ändern nur die Randfarbe (von #b3c2b9 nach Akzent #c2410c), Primärbuttons hellen um 8 % auf. Die Rückmeldung ist vorhanden, aber schwach, besonders für die Kopfleiste auf 1280 px. Karten in Listen (Spieler, Teams) zeigen im Screenshot keinen Hinweis, dass sie anklickbar sind (kein Pfeil, kein Hover-Test an Listenzeilen durchgeführt). | Messung probe.cjs (Hover), gast_desktop_spieler.png | adapt
- GD-ALL-7 | P2 | Zeilenlänge bei Fließtext 14 px auf 686 bis 720 px Breite: etwa 90 bis 110 Zeichen je Zeile. Detect (Desktop): AGB 4 Absätze (106 bis 110 Zeichen), Datenschutz 8 Absätze (103 bis 109), Matchmaking (99), Start (Preiskarte, 104). Aufgeklappte Hilfe-Antworten: etwa 90 Zeichen (Messung). Ergänzt X-14. Korrektur zu X-14: Auf `/` ist es nicht der Hero-Absatz (448 px breit, unkritisch), sondern der Absatz in der Karte "Was kostet das?". | gast_desktop_agb.png, gast_desktop_datenschutz.png, gast_desktop_start.png | detect (line-length)
- GD-ALL-8 | P2 | Schmale Spalte: 720 px Inhalt auf 1280 px, 560 px freie Fläche in Summe. Listen (Spieler: 10 Zeilen à 77 px), Hilfe (19 Fragen à 66 px) und die Startseite (1896 px) werden dadurch sehr lang; Zweitinformationen (z. B. "0 Spiele · 0 Tore") liegen 600 px von Name entfernt am rechten Rand. Bestätigt und ergänzt X-17. | gast_desktop_spieler.png, gast_desktop_hilfe.png | adapt

---

#### /
Beleg: gast_desktop_start.png
Bewertung: Ein 720 px breites Hallenfoto mit großer Überschrift, vier gleich großen Buttons (Livescore rutscht allein in die zweite Reihe) und der rechten Bildhälfte ohne Inhalt. Darunter drei Spielart-Karten mit unausgerichteten Buttons, eine Schrittfolge und eine Preiskarte mit Altmodell-Text; die Seite ist 1896 px lang und liest sich wie ein gestrecktes Handylayout.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (8 Punkte), Heuristiken 1-10, Personas Jordan, Casey, Alex (Tastatur)] | Funde: Hero ohne eine klare erste Handlung, vier gleichrangige Buttons (X-02); drei Primärbuttons in drei Karten gleich laut, fünf Buttons vor der Erklärung (X-03); Einstiege viermal wiederholt (GM-ST-2); Logo doppelt, in Kopfleiste und im Hero (GM-ST-7); Preis- und Guthabenaussage (X-05, GM-ST-1); Nav-Lücke (GD-ALL-1) |
| audit [Teil: Dimension 1 A11y (Fokus, Tastatur, Kontrast), 4 Responsive (Zielgrößen, kein Überlauf), 5 Integrität; Hero-Video unter Performance/Motion gestreift] (metrics-gast.json: 11 von 42 Zielen < 44 px, kein Überlauf, 1 h1, Höhe 1896, keine Konsolenfehler) | Funde: Hero-Video läuft ohne Pause (`autoplay`, `loop`, ohne Steuerung, `paused=false`) hinter Text (GM-ST-8); grauer Absatz auf Foto, Kontrast nach Augenmaß (X-19); Fokusring vorhanden, 8 Tab-Stopps bis zur ersten Karte (GD-ALL-2) |
| distill [Teil: Assess Current State, Information Architecture (ein primäres Ziel, Redundanz), Layout Simplification (Spalte), Content Simplification] | Funde: Hero 4 Buttons + Karten 5 Buttons (X-03), Zahlenkacheln "2 / 10 / 0" vor den Schritten (GM-ST-9), doppeltes Logo (GM-ST-7), Fußzeilen-Dopplung (GD-ALL-4) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] | Funde: "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete" und "Du lädst dein Guthaben auf" (X-05, GM-ST-1, siehe MUSS WEG); "Lobby aufmachen" und "Privatspiel anlegen" ohne Anmeldehinweis (GM-ST-3); leerer Zustand "Mach eine Lobby für dein Team auf" (GM-SU-6) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content, Max-Width), Navigation] | Funde: Hero-Buttons brechen 3+1 (Livescore allein, Position 313,498), "Offene Lobbys ansehen" in der Teamspiel-Karte 198 x 50 px zweizeilig statt 44 px, Buttons der drei Karten ohne gemeinsame Grundlinie (Teamspiel y=798 und 850, Privatspiel y=856, Turnier y=804 und 856) (GD-ST-1, GD-ST-2); Spalte 720 px (X-17, GD-ALL-8); Hover nur Randfarbe (GD-ALL-6) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Timeout nach 30 s (viermal, ein serieller Wiederholungslauf); keine neuen Daten. Früherer Lauf 1280x800: cramped-padding am zweizeiligen Ghost-Button (X-15, Ursache: Umbruch GD-ST-2), line-length Preiskarte 104 Zeichen (GD-ALL-7) |

Funde:
- X-02, X-03, X-05, X-15, X-19 (Haupttabelle); GM-ST-1, GM-ST-2, GM-ST-3, GM-ST-7, GM-ST-8, GM-ST-9
- GD-ST-1 | P1 | Hero am Desktop: Vier Buttons ("Jetzt starten" 132 px, "Lobby aufmachen" 177, "Offene Lobbys ansehen" 221, "Livescore" 112) brechen 3+1, "Livescore" steht allein in der zweiten Reihe; der Absatz ist auf 448 px begrenzt, die rechte Hälfte des 720 x 502 px großen Heros zeigt nur Foto. Es gibt nur eine Primärfarbe ("Jetzt starten"), die drei anderen sind gleichrangig leise. Ergänzt X-02 um die Desktop-Messung. | gast_desktop_start.png | critique/adapt
- GD-ST-2 | P2 | Spielart-Karten: Die Buttons stehen nicht auf einer Grundlinie (Teamspiel y=798 und 850, Privatspiel y=856, Turnier y=804 und 856), weil die Karten eine ungleiche Zahl an Buttons und Textzeilen haben; "Offene Lobbys ansehen" bricht in der 198-px-Karte in zwei Zeilen (198 x 50 px) und ist deshalb höher als alle anderen. Die Textblöcke der Karten haben 4 bis 5 Zeilen in 14 px bei nur 198 px Breite (ca. 28 Zeichen je Zeile). | gast_desktop_start.png | adapt
- GD-ST-3 | P2 | Seitenaufbau am Desktop: Der erste Bildschirm (800 px) endet mitten in der Überschrift "Was möchtest du spielen?", "So funktioniert Socaz" beginnt bei y=965, "Offene Lobbys" erst bei y=1620 und zeigt dort nur den leeren Hinweis. Das einzige wirklich Dynamische der Seite (offene Lobbys) liegt am Ende. | gast_desktop_start.png | distill

---

#### /hilfe
Beleg: gast_desktop_hilfe.png
Bewertung: Sauber gegliederte Aufklappliste mit 19 Fragen in fünf Gruppen, am Desktop aber eine 1976 px lange Einspaltenliste mit 66 px hohen Zeilen und nur 6 Fragen im ersten Bildschirm. Der Block "Geld und Guthaben" beschreibt das Altmodell.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10 (besonders 10 Hilfe), Personas Jordan, Alex, Sam] | Funde: 19 Fragen ohne Suche oder Sprungmarken (GM-HI-4), mehrere Wörter für dasselbe (GM-HI-3); Gruppen und Reihenfolge klar |
| audit [Teil: Dimension 1 A11y (Zusammenfassungen per Tastatur, Fokus), 4 Responsive, 5 Integrität] (13 von 35 Zielen < 44 px, kein Überlauf, 1 h1, Höhe 1976) | Funde: 19 `summary`-Elemente tastaturbedienbar, Fokusring vorhanden (positiv); Fußzeilenziele (GD-ALL-4); aufgeklappter Text etwa 90 Zeichen je Zeile (GD-ALL-7) |
| distill [Teil: Assess Current State, Information Architecture (Progressive Disclosure), Layout Simplification] | Funde: Am Desktop reichen zwei Spalten oder eine Inhaltsübersicht links, statt 19 Zeilen untereinander (GD-HI-1) |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: Abschnitt "Geld und Guthaben" Altmodell (GM-HI-1, MUSS WEG); "oben in der Leiste" verweist auf einen Eintrag, den der Gast nicht sieht (GM-HI-2); Begriffsmix (GM-HI-3) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction: Tastatur, Content), Navigation] | Funde: Hilfe ist in der Kopfleiste nicht verlinkt (GD-ALL-1); keine Tastatur-/Suchhilfe für 19 Einträge (GD-HI-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hilfe` | nur overused-font (gewollt, nicht gewertet); keine weiteren Funde (Fragen zugeklappt, daher keine Zeilenlänge gemessen) |

Funde:
- GM-HI-1, GM-HI-2, GM-HI-3, GM-HI-4, GD-ALL-1, GD-ALL-4, GD-ALL-7
- GD-HI-1 | P2 | Die Liste ist am Desktop 1976 px lang, jede Frage braucht 66 px; im ersten Bildschirm sind 6 von 19 Fragen sichtbar, die Gruppe "Geld und Guthaben" beginnt erst bei y=873. Es gibt keine Inhaltsübersicht, keine Suche und keine zwei Spalten. | gast_desktop_hilfe.png | distill/adapt

---

#### /agb
Beleg: gast_desktop_agb.png
Bewertung: Lesbarer, nummerierter Rechtstext mit Entwurf-Kasten und Altmodell-Aussagen; die Absätze laufen über 686 px mit über 100 Zeichen je Zeile. Abschnitt 3 ist ein einziger dichter Absatz.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Sam] | Funde: öffentlicher Entwurfshinweis (GM-AG-1), dichter Absatz 3 (GM-AG-3) |
| audit [Teil: Dimension 1 A11y (Kontrast, Überschriftenfolge), 4 Responsive, 5 Integrität] (10 von 32 Zielen < 44 px, Höhe 1020) | Funde: line-length 106 bis 110 Zeichen in vier Absätzen (GD-ALL-7); Überschriftenfolge h1, h2 sauber |
| distill [Teil: Content Simplification, Layout Simplification] | Funde: Zeilenbreite auf 65ch begrenzen würde den Text auf etwa 560 px setzen und die Seite kürzer machen (GD-ALL-7); sonst keine Funde |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: Altmodell-Sätze in §1, §3, §4 (GM-AG-2, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content, Max-Width)] | Funde: Zeilenlänge (GD-ALL-7); sonst keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/agb` | 4 x line-length (106, 109, 110, 108 Zeichen), overused-font nicht gewertet (X-14) |

Funde:
- X-14, GM-AG-1, GM-AG-2, GM-AG-3, GD-ALL-7

---

#### /datenschutz
Beleg: gast_desktop_datenschutz.png
Bewertung: Neun gut gegliederte Abschnitte mit Entwurf-Kasten, Platzhalter beim Verantwortlichen und einem Guthaben-Bezug; am Desktop sind die Zeilen 103 bis 109 Zeichen lang, zwei Absätze enden in einem Einzelwort.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Sam] | Funde: Platzhalter beim Verantwortlichen (GM-DS-1); Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (11 von 33 Zielen < 44 px, Höhe 1404) | Funde: line-length (GD-ALL-7); Link "Einstellungen" für Gast führt zur Anmeldung (GM-DS-3) |
| distill [Teil: Content Simplification, Information Architecture] | Funde: neun Abschnitte ohne Inhaltsübersicht, am Desktop kurz genug (kein neuer Fund; GM-DS-4 gilt nur für Handy) |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: "Die Betreiberangaben werden vor dem Start eingetragen" (GM-DS-1); "Zahlungen: Guthaben, Buchungen, Belege" (GM-DS-2, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content, Max-Width)] | Funde: Zeilenlänge 103 bis 109 Zeichen (GD-ALL-7) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/datenschutz` | 6 x line-length (103 bis 109 Zeichen), 2 x straggler ("Bewertungen." 14 %, "Cookie-Banner." 7 %), overused-font nicht gewertet |

Funde:
- GM-DS-1, GM-DS-2, GM-DS-3, GM-AG-1, GD-ALL-7
- GD-DS-1 | P2 | Zwei Einzelwörter in der letzten Zeile: "Bewertungen." (Listenpunkt Spielbetrieb) und "Cookie-Banner." (Abschnitt Cookies), dazu die ungleichen Zeilenlängen von 100+ Zeichen. Desktop-Variante von X-13 (am Handy andere Wörter). | gast_desktop_datenschutz.png | detect (straggler)

---

#### /impressum
Beleg: gast_desktop_impressum.png
Bewertung: Kurz und lesbar, zeigt aber Konfigurationsnamen (OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_EMAIL) und den Entwurf-Kasten. Der Platzhaltersatz ist in Tinte und größer gesetzt als der restliche graue Text und fällt dadurch auf. Als Pflichtseite so nicht zeigbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Sam] | Funde: Konfigurationsnamen im Text (GM-IM-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (10 von 32 Zielen < 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: "Die Betreiberangaben fehlen noch. Sie werden über OPERATOR_NAME, OPERATOR_ADDRESS und OPERATOR_EMAIL eingetragen." (GM-IM-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: Fußzeile beginnt bei y=447, darunter 350 px leere Fläche (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/impressum` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-IM-1, GM-AG-1, GD-ALL-3

---

#### /hausordnung
Beleg: gast_desktop_hausordnung.png
Bewertung: Kurz und gegliedert (Fair bleiben, Inhalte melden, Folgen). Ein Satz bezieht sich auf Guthaben, zwei Listenpunkte enden in Einzelwörtern.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Sam] | keine Funde (Entwurf-Hinweis: GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (10 von 32 Zielen < 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: "offenes Guthaben und Reservierungen" (GM-HO-1, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: Zeilenumbruch (GD-HO-1); Fußzeile mit leerer Fläche darunter (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hausordnung` | 2 x straggler ("Bewertungen." 14 %, "aus." 4 %), overused-font nicht gewertet |

Funde:
- GM-HO-1, GM-AG-1
- GD-HO-1 | P2 | Zwei Listenpunkte enden in einem Einzelwort ("Bewertungen." und "aus."). Desktop-Variante von X-13. | gast_desktop_hausordnung.png | detect (straggler)

---

#### /kontakt
Beleg: gast_desktop_kontakt.png
Bewertung: Übersichtlich in zwei Karten, aber ohne gültige Kontaktadresse (Platzhaltertext mit Konfigurationsname, größer und dunkler als der restliche Text) und mit einem Altmodell-Punkt. Eine Kontaktaufnahme ist derzeit nicht möglich.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10 (besonders 9, 10), Personas Jordan, Sam] | Funde: kein Kontaktweg (GM-KO-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (11 von 33 Zielen < 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Actions] | Funde: "Die Kontaktadresse wird noch eingetragen (Einstellung OPERATOR_EMAIL)." (GM-KO-1); "Auszahlung deines Guthabens" (GM-KO-2, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: Mailto-Link statt Formular am Desktop ohne Mailprogramm oft folgenlos (GM-KO-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-KO-1, GM-KO-2, GM-KO-3

---

#### /unter-16
Beleg: gast_desktop_unter-16.png
Bewertung: Kurze, ehrliche Meldung mit einem Weg zurück, zentriert in einer 400 px breiten Spalte. Überschrift (24 px, zentriert) und Linkbasis wirken gegenüber den linksbündigen 30-px-Seiten wie eine andere Seitenart; unter dem Inhalt bleibt die Fläche leer.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Riley] | Funde: Sackgasse ohne nächsten Schritt (GM-U16-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (10 von 33 Zielen < 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy, Errors and permissions] | Funde: "Dein Konto wurde wieder gelöscht" ohne Folge und Ausweg (GM-U16-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: zentriert und 24 px, andere Kante (GD-ALL-5); Fußzeile y=317, 480 px leer darunter (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/unter-16` | straggler "gespeichert." (24 %), overused-font nicht gewertet |

Funde:
- GM-U16-1, GD-ALL-3, GD-ALL-5
- GD-U1-1 | P2 | Einzelwort "gespeichert." in der letzten Zeile des Absatzes (3 Zeilen). Desktop-Variante von X-13. | gast_desktop_unter-16.png | detect (straggler)

---

#### /anmelden
Beleg: gast_desktop_anmelden.png
Bewertung: Eine einzige Handlung in einer schmalen, mittig gesetzten Spalte, die weder mit dem Logo noch mit der rechten Kante der Kopfleiste fluchtet; links und rechts bleiben je 450 px leer. Die Seite sagt nicht, warum man hier ist, und enthält Kopfleiste und 14 Fußzeilenlinks neben dem einen Ziel.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Single focus), Heuristiken 1-10, Personas Jordan, Alex, Sam] | Funde: Zielhierarchie klar, Umfeld laut (X-12); kein Anlass der Anmeldung (GM-AN-1); Anmelden-Button in der Kopfleiste doppelt (GM-AN-3) |
| audit [Teil: Dimension 1 A11y (Beschriftungen, Tastatur, Fokus), 4 Responsive, 5 Integrität] (10 von 39 Zielen < 44 px, Höhe 800) | Funde: Felder haben Beschriftungen, Fokusring vorhanden (positiv); fünf Tab-Stopps vor dem ersten Feld (GD-ALL-2); Pflichtangaben zu AGB und Alter fehlen (GM-AN-2) |
| distill [Teil: Assess Current State, Information Architecture, Layout Simplification] | Funde: Kopfleiste "Anmelden" doppelt zum Seitenziel (GM-AN-3); Spalte nicht mit dem Raster ausgerichtet (GD-AN-1) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms] | Funde: kein Anlass (GM-AN-1), keine Hinweise zu AGB und Alter (GM-AN-2) |
| adapt [Teil: Desktop Adaptation (Layout, Content), Navigation] | Funde: schmale Spalte x=448 bis 832 statt linkem Raster x=280 (GD-AN-1); Überschrift 24 px statt 30 px (GD-ALL-5) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/anmelden` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- X-12, GM-AN-1, GM-AN-2, GM-AN-3, GD-ALL-2, GD-ALL-5
- GD-AN-1 | P2 | Die Anmeldespalte (`max-w-sm`, 384 px) steht mittig in der 720-px-Spalte: Überschrift und Karten beginnen bei x=448, Logo und Fußzeile bei x=280, der Button "Anmelden" der Kopfleiste endet bei x=1000. Drei verschiedene Kanten auf einer Seite. | gast_desktop_anmelden.png | adapt

---

#### /willkommen
Beleg: gast_desktop_willkommen.png (zeigt die Anmeldeseite, byte-identisch mit `gast_desktop_anmelden.png`)
Bewertung: Als Gast ist `/willkommen` nur eine Weiterleitung auf `/anmelden` (ohne `next`); der Bildschirm sagt nichts vom Onboarding. Das eigentliche Onboardingformular war als Gast nicht prüfbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 1 Systemstatus und 3 Kontrolle, Persona Jordan] | Funde: Gast wird ohne Erklärung umgeleitet (GM-AN-1); kurzer Zwischenzustand "Lädt…" (GM-WI-1) |
| audit [Teil: Dimension 1 A11y (Landmarken, Überschrift), 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, 1 h1, kein Überlauf) | keine neuen Funde (Übergang ohne Statusrolle: GM-WI-1) |
| distill [Teil: Information Architecture, Clear next action] | keine Funde (eine Handlung) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: kein Satz zum Grund der Weiterleitung (GM-AN-1); Weiterleitung ohne `next` (GM-WI-2) |
| adapt [Teil: Desktop Adaptation Layout und Navigation] | keine neuen Funde (GD-AN-1 gilt auch hier) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/willkommen` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-AN-1, GM-WI-1, GM-WI-2, GD-AN-1
- Nicht prüfbar: Onboardingformular (braucht Sitzung ohne `onboardedAt`).

---

#### /suche
Beleg: gast_desktop_suche.png
Bewertung: Am Desktop funktioniert die Filtermaske als 3x2-Raster in einem Bildschirm, davor stehen Titel, Satz und ein dritter Primärbutton ("Lobby aufmachen"), dazu der Filter-Button und die rote "Live"-Marke; darunter folgt nur ein leerer Hinweis. Titel (24 px) und kompakte Abstände weichen vom Rest der Seiten ab.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Chunking, Minimal choices: 6 Felder + 2 Buttons), Heuristiken 1-10, Personas Jordan, Alex, Riley] | Funde: Filter vor Inhalt (X-10); "anderer Teams" für Gast (GM-SU-1); "Live" mehrdeutig (GM-SU-2); zwei Primärbuttons ("Lobby aufmachen" und "Filtern") konkurrieren (GD-SU-1) |
| audit [Teil: Dimension 1 A11y (Tastatur, Fokus, Beschriftungen), 4 Responsive, 5 Integrität] (11 von 40 Zielen < 44 px, Höhe 800, kein Überlauf; Tab-Reihenfolge: Logo, 3 Links, Anmelden, Lobby aufmachen, Filterfelder) | Funde: "Lobby aufmachen" nur 36 px hoch (GM-SU-4); "Live"-Erklärung nur per `title` (GM-SU-2); alle Felder beschriftet, Fokusring vorhanden (positiv) |
| distill [Teil: Assess Current State, Information Architecture, Content Simplification] | Funde: Satz "Jedes Spiel hat eine Nummer" ohne Nutzen (GM-SU-3); sechs Filter bei leerer Liste (X-10) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] | Funde: "Stärke ab" und "bis" mit "–" (GM-SU-5); leerer Zustand "für dein Team" (GM-SU-6) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction: Tastatur, Content)] | Funde: Raster 3 x 2 passt am Desktop (X-10 gilt nur am Handy, Auswahl "Art" ist hier nicht abgeschnitten); Absatz endet in Einzelwort "Nummer." (nach Augenmaß); Überschrift 24 px und Abstand Titel/Text/Button gegenüber 30-px-Seiten gedrängt (GD-ALL-5, GD-SU-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Timeout nach 30 s (viermal); keine neuen Daten, Ersatz: Playwright-Messung und Screenshot |

Funde:
- X-10 (am Desktop nur "Filter vor Inhalt", nicht abgeschnitten), GM-SU-1 bis GM-SU-6, GD-ALL-5
- GD-SU-1 | P2 | Kopfbereich gedrängt: 24-px-Titel mit winziger roter "Live"-Marke (12 px), zwei Textzeilen und ein linksbündiger Primärbutton (177 x 36 px) liegen auf 100 px Höhe ohne Luft; direkt darunter beginnt eine Filterkarte mit einem zweiten vollbreiten Primärbutton "Filtern". Hierarchie unklar, welcher Button der Hauptweg ist. | gast_desktop_suche.png | critique

---

#### /spieler
Beleg: gast_desktop_spieler.png
Bewertung: Am Desktop funktioniert die Suchzeile (Feld, Stadt, Button auf einer Linie), zehn Zeilen mit Name, Stadt, Position und rechts "0 Spiele · 0 Tore". Die Liste ist lesbar, aber monoton: keine Avatare oder Teamfarben, die Statistik liegt 600 px vom Namen entfernt am rechten Rand.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Alex, Sam] | Funde: Zeilen ohne Unterscheidungsmerkmal (GM-SP-1); Gast sieht alle Spielernamen (GM-SP-2); X-01 entfällt am Desktop |
| audit [Teil: Dimension 1 A11y (Kontrast, Tastatur), 4 Responsive, 5 Integrität] (10 von 45 Zielen < 44 px, Höhe 1239) | Funde: Platzhalter "Name suchen" 4,1:1 (X-16, detect bestätigt); Tab-Reihenfolge Feld, Stadt, Button, danach Listenzeilen |
| distill [Teil: Information Architecture, Content Simplification] | Funde: "0 Spiele · 0 Tore" in jeder Zeile als Rauschen (GM-SP-1) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] | Funde: kein Hinweis, dass nur öffentliche Profile erscheinen (GM-SP-2); kein Hinweis zur Zeilenaktion (GD-ALL-6) |
| adapt [Teil: Desktop Adaptation (Layout: Tabelle statt Kartenzeilen, Interaction, Content)] | Funde: Suchzeile passt am Desktop (X-01 nur Handy); lange Einspaltenliste, 10 Zeilen à 77 px in 720 px, kein Raster/Tabellenkopf (GD-ALL-8) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | low-contrast Platzhalter "Name suchen" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-16, GM-SP-1, GM-SP-2, GD-ALL-6, GD-ALL-8

---

#### /teams
Beleg: gast_desktop_teams.png
Bewertung: Zwei Teams in klaren Zeilen, Suchzeile am Desktop in Ordnung. Die Seite ist fast leer (Fußzeile bei y=410), der Satz "fordere sie heraus" lockt zu einer Aktion, die der Gast nicht ausführen kann.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Sam] | Funde: "fordere sie heraus" ohne Weg dorthin (GM-TE-1); "noch ohne Spiel" statt Stärke (GM-TE-1) |
| audit [Teil: Dimension 1 A11y (Kontrast), 4 Responsive, 5 Integrität] (10 von 37 Zielen < 44 px, Höhe 800) | Funde: Platzhalter "Teamname" 4,1:1 (X-16); tote Fallunterscheidung im Quelltext (GM-TE-2) |
| distill [Teil: Content Simplification] | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: GM-TE-1 |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: Suchzeile passt (X-01 nur Handy); große leere Fläche unter der Liste (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | low-contrast Platzhalter "Teamname" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-16, GM-TE-1, GM-TE-2, GD-ALL-3

---

#### /offline
Beleg: gast_desktop_offline.png
Bewertung: Kurze, ehrliche Meldung, zentriert, aber ohne Handlung und mit voller Navigation und Fußzeile, die ohne Netz alle ins Leere führen. Die Seite endet bei y=420, darunter 380 px leere Fläche.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1 und 9, Personas Jordan, Riley] | Funde: keine Handlung (GM-OF-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (10 von 32 Zielen < 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Information Architecture, Content Simplification] | Funde: 14 Fußzeilenlinks und Kopfleiste ohne Netz sinnlos (GM-OF-2) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] | Funde: "Sobald du wieder online bist, geht es weiter" ohne Knopf (GM-OF-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] | Funde: kein "Erneut versuchen" auch mit Tastatur erreichbar (GM-OF-1); Überschrift 24 px, zentriert (GD-ALL-5); leere Fläche (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/offline` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-OF-1, GM-OF-2, GD-ALL-3, GD-ALL-5

---

#### /app
Beleg: gast_desktop_app.png (byte-identisch mit `gast_desktop_anmelden.png`; Endadresse `/anmelden?next=%2Fapp`)
Bewertung: Gast landet auf der Anmeldeseite; nichts auf dem Bild sagt, dass "Mein Bereich" gemeint war. Die eigentliche Seite (Altmodell-Karte "Guthaben", "Zahlungen noch nicht aktiv") ist für den Gast unsichtbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, kein Überlauf, 1 h1) | keine neuen Funde (Übergang GM-WI-1) |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Desktop Adaptation Navigation] | Funde: Kopfleiste bietet für den Gast keinen "Mein Bereich"-Einstieg (GD-ALL-1); Spalte (GD-AN-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-AN-1, GM-WI-1, GD-AN-1
- Altmodell-Texte der eigentlichen Seite (für Gast nicht sichtbar): `app/page.tsx:53-56`, siehe MUSS WEG und X-05.

---

#### /app/suche/neu
Beleg: gast_desktop_app-suche-neu.png (byte-identisch mit `gast_desktop_anmelden.png`; `?next=%2Fapp%2Fsuche%2Fneu`)
Bewertung: Weiterleitung auf die Anmeldeseite; die Seite selbst ist als Gast nicht sichtbar (X-11 als Captain).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, kein Überlauf, 1 h1) | keine neuen Funde |
| distill [Teil: Clear next action] | keine Funde |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Desktop Adaptation Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-AN-1, GM-WI-1, X-11 (als Captain)

---

#### /app/einstellungen
Beleg: gast_desktop_app-einstellungen.png (byte-identisch mit `gast_desktop_anmelden.png`; `?next=%2Fapp%2Feinstellungen`)
Bewertung: Weiterleitung auf die Anmeldeseite. Der Link "Einstellungen" im Datenschutztext führt Gäste hierher (GM-DS-3).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, kein Überlauf, 1 h1) | keine neuen Funde |
| distill [Teil: Clear next action] | keine Funde (X-08 gilt für Spieler und Captain) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Desktop Adaptation Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-AN-1, GM-WI-1, GM-DS-3, X-08 (als Spieler)

---

#### /app/benachrichtigungen
Beleg: gast_desktop_app-benachrichtigungen.png (byte-identisch mit `gast_desktop_anmelden.png`; `?next=%2Fapp%2Fbenachrichtigungen`)
Bewertung: Weiterleitung auf die Anmeldeseite. Die Glocke steht nur Angemeldeten in der Kopfleiste zur Verfügung.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, kein Überlauf, 1 h1) | keine neuen Funde |
| distill [Teil: Clear next action] | keine Funde |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Desktop Adaptation Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-AN-1, GM-WI-1, X-12

---

#### /app/guthaben
Beleg: gast_desktop_app-guthaben.png (byte-identisch mit `gast_desktop_anmelden.png`; `?next=%2Fapp%2Fguthaben`)
Bewertung: Gast wird zur Anmeldung geleitet; die Seite selbst ist Altmodell und entfällt mit Vertrag 012 (X-05, X-09). Der Gast sieht sie nie, aber Hilfe und Datenschutz verweisen darauf, und angemeldete Nutzer sehen am Desktop zusätzlich den Betrag in der Kopfleiste (siehe MUSS WEG).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus, 3 Kontrolle, 9 Fehlerbehebung; Persona Jordan] | Funde: Weiterleitung ohne Grund, Ziel nicht genannt (GM-AN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite: 10 von 39 Zielen < 44 px, kein Überlauf, 1 h1) | keine neuen Funde |
| distill [Teil: Clear next action, Remove redundancy] | keine Funde (gesamte Seite streichen, siehe MUSS WEG) |
| clarify [Teil: Audit the language, Errors and permissions] | Funde: Grund der Anmeldepflicht fehlt (GM-AN-1) |
| adapt [Teil: Desktop Adaptation Navigation] | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- X-05, X-09, GM-AN-1, GM-WI-1, GM-HI-2

---

### Zusatzseiten (Gast, Desktop)

#### /matchmaking
Beleg: gast_desktop_matchmaking.png
Bewertung: Am Desktop ist die Erklärseite gut lesbar: Einleitung, vier Schritte, Filterzeile, leere Liste und die einzige Gast-Handlung als vollbreiter Button, der ohne Scrollen sichtbar ist (y=587). Der Gast liest aber weiter zuerst über Captains und Hallen-Veto; die Seite ist 2 px höher als der Bildschirm (802 px) und erzeugt dadurch eine unnötige Scrollleiste.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste (Single focus, Progressive disclosure), Heuristik 2 Sprache, 4 Konsistenz, 8 Minimalismus; Personas Jordan, Alex] | Funde: spricht Captains an (GM-MM-2), Doppelung mit `/suche` (GM-MM-3), Fachwörter "Hallen-Veto" (GM-MM-5); GM-MM-1 (CTA verdeckt) entfällt am Desktop |
| audit [Teil: Dimension 1 A11y (Tastatur, Fokus), 4 Responsive (Zielgrößen), 5 Integrität] (13 von 36 Zielen < 44 px, Höhe 802, kein Überlauf, 1 h1) | Funde: Filterfelder und "Filtern" nur 36 px hoch (GM-MM-4); die einzige Gast-Handlung liegt in der Tab-Reihenfolge hinter dem Filter (GD-ALL-2); Seitenhöhe 802 px (GD-MM-1) |
| distill [Teil: Information Architecture, Progressive disclosure, Content Simplification] | Funde: vier Schritte plus Einleitung vor einer leeren Liste (GM-MM-5, GM-MM-3) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] | Funde: "Du bist Captain" (GM-MM-2), "Offene Suchen" vs "Offene Lobbys" (GM-MM-3), leerer Zustand für Gast (GM-MM-6) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content)] | Funde: Überschrift und Filter teilen sich eine Zeile, am Desktop passend; Einleitung 99 Zeichen je Zeile (GD-ALL-7); CTA ist ein 720-px-Balken (GD-MM-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | line-length (99 Zeichen), straggler "hier." (4 %), overused-font nicht gewertet |

Funde:
- GM-MM-2, GM-MM-3, GM-MM-4, GM-MM-5, GM-MM-6, GD-ALL-2, GD-ALL-7
- GD-MM-1 | P2 | Die Seite ist 802 px hoch (Fußzeile endet bei y=802), also 2 px höher als der 1280 x 800 Bildschirm; es erscheint eine Scrollleiste für 2 px. Der Gast-Button "Anmelden und Lobby aufmachen" ist ein 720 x 44 px breiter Balken und der einzige Primärbutton neben dem Filter; er steht erst nach Einleitung, Schritten, Filter und leerer Liste (GM-MM-1 gilt am Desktop nur als Reihenfolge, nicht als Verdeckung). | gast_desktop_matchmaking.png | adapt
- GD-MM-2 | P2 | Einzelwort "hier." in der letzten Zeile des Leertextes (desktop-spezifisch, Handy meldet "offen."). | gast_desktop_matchmaking.png | detect (straggler)

---

#### /mitspieler
Beleg: gast_desktop_mitspieler.png
Bewertung: Kurze, leere Seite. Titel und Einleitung beschreiben die Seite aus Sicht eines Captains, die Gast-Handlung ist ein kleiner Textlink im Kasten, die Stadtauswahl streckt sich über 626 px für einen einzigen Filter, darunter steht ein einzelner Satz.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 2 Sprache, 6 Wiedererkennung, 9 Fehlerbehebung; Personas Jordan, Alex] | Funde: Gast-Handlung als Textlink (GM-MS-1), leere Liste (GM-MS-2), Richtung des Titels (GM-MS-3) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen)] (11 von 35 Zielen < 44 px, Höhe 800) | Funde: "Melde dich an" 91 x 18 px (GM-MS-1, mit Maus noch bedienbar, Tastatur: eigener Tab-Stopp); Quelltext-Buttons `!min-h-8` (GM-MS-4) |
| distill [Teil: Remove redundancy, Progressive disclosure, Layout Simplification] | Funde: Stadtfilter mit Primärbutton "Filtern" ohne Inhalt (GM-MS-2); breiter Select (GD-MS-1) |
| clarify [Teil: Audit the language, Empty states, Actions] | Funde: GM-MS-2, GM-MS-3 |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content)] | Funde: Select auf 626 px gestreckt neben 86-px-Button (GD-MS-1); Fußzeile y=343, 450 px leer darunter (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-MS-1, GM-MS-2, GM-MS-3, GM-MS-4, GD-ALL-3
- GD-MS-1 | P2 | Die Stadtauswahl ist ein 626 px breites Feld mit nur einer sinnvollen Wahl ("Alle Städte"), daneben ein Primärbutton "Filtern" für eine leere Liste; ein Formularfeld in voller Spaltenbreite ist auf dem Desktop unnötig breit. | gast_desktop_mitspieler.png | distill

---

#### /einladung/demoinvitex1 (gültiger Token)
Beleg: gast_desktop_einladung-demoinvitex1.png
Bewertung: Klarste Seite der Gruppe: Team, Stadt, Kadergröße und ein 384 px breiter Button "Anmelden und beitreten" im oberen Drittel, ohne Scrollen sichtbar. Dem Gast fehlen Vertrauenssignale vor der Google-Anmeldung; der Handy-Fund mit dem falschen Reiter entfällt am Desktop.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 1 Systemstatus, 4 Konsistenz, 8 Minimalismus; Personas Jordan, Alex] | Funde: Vertrauen fehlt (GM-EL-2), Umfeld laut (GM-EL-3); GM-EL-1 (Reiter "Privatspiel") entfällt am Desktop |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (10 von 33 Zielen < 44 px, Höhe 800, Button 384 x 44 px) | keine neuen Funde (Fußzeile: GD-ALL-4) |
| distill [Teil: Clear next action, Remove redundancy] | Funde: zweiter Button "Anmelden" in der Kopfleiste (GM-EL-4) |
| clarify [Teil: Audit the language, Message hierarchy] | Funde: kein Hinweis auf einladende Person, Folgen des Beitritts, Mindestalter (GM-EL-2) |
| adapt [Teil: Desktop Adaptation (Layout, Content), Navigation] | Funde: zentrierter Block x=448 bis 832, Fußzeile y=301 und 500 px leere Fläche (GD-ALL-3); Tab-Stopps: fünf Kopfleisten-Stopps vor dem Beitrittsbutton (GD-ALL-2) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/demoinvitex1` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EL-2, GM-EL-3, GM-EL-4, GM-EL-5, GD-ALL-2, GD-ALL-3

---

#### /einladung/ungueltig (ungültiger Token)
Beleg: gast_desktop_einladung-ungueltig.png
Bewertung: Knappe, verständliche Fehlermeldung mit Weg zur Startseite. Es fehlen mögliche Gründe und ein sinnvoller nächster Schritt; die Seite ist nach 420 px zu Ende, 380 px bleiben leer.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 3 Kontrolle, 9 Fehlerbehebung, 10 Hilfe; Personas Jordan, Riley] | Funde: nächster Schritt fehlt (GM-EU-1); GM-EU-2 (Reiter) entfällt am Desktop |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (10 von 33 Zielen < 44 px, Button 141 x 44 px, Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] | keine Funde (Text kurz) |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] | Funde: Grund und Ausweg unvollständig (GM-EU-1) |
| adapt [Teil: Desktop Adaptation Layout, Content] | Funde: Überschrift 24 px, zentriert (GD-ALL-5); Fußzeile y=285, leere Fläche (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/ungueltig` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EU-1, GD-ALL-3, GD-ALL-5
- Nicht geprüft: Zustand "Link abgelaufen" (kein Token im Seed).

---

### Zusammenfassung der Funde (nur Desktop-Neufunde, ohne Verweise)

| Prio | IDs |
|---|---|
| P0 Bedienung kaputt | keine |
| P1 verwirrend | GD-ALL-1, GD-ST-1 (zählt als Ergänzung zu X-02/X-17) |
| P2 Optik | GD-ALL-2 bis GD-ALL-8, GD-ST-2, GD-ST-3, GD-HI-1, GD-DS-1, GD-HO-1, GD-U1-1, GD-AN-1, GD-SU-1, GD-MM-1, GD-MM-2, GD-MS-1 |

Nicht mehr gültig am Desktop (nur Handy): X-01 (Suchzeile), X-06 (untere Navigation), GM-ST-5 (Kopfleiste), GM-ST-4 (Zielgrößen, am Desktop nur für Mausbedienung unkritisch), GM-MM-1 (CTA verdeckt), GM-EL-1 und GM-EU-2 (Reiter), GM-DS-4 (lange Seite ohne Sprungmarken). Positiv am Desktop: Fokusring überall sichtbar, kein Überlauf, eine `h1` je Seite, Suchzeilen auf `/spieler` und `/teams` bedienbar, alle Seiten 200, keine Konsolenfehler.



### Fundblatt Spieler, Handy

Rolle Spieler (angemeldet als Mitglied von Demo Alpha, kein Captain/Team-Admin, Dev-Login), Gerät Handy mit Touch, Dev-Server Port 3102. Nur gelesen, kein Quelltext geändert. Eingeloggte Ansichten sind hier erstmals im Fokus; Aussagen, die der Screenshot nicht zeigt, sind mit "aus Quelltext" gekennzeichnet.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl. Die fünf Reference-Dateien (`.claude/skills/impeccable/reference/<befehl>.md`) sind vollständig gelesen (critique.md in Abschnitten bis Zeile 819). Je Durchgang steht in eckigen Klammern, welcher Teil angewandt wurde. Die Prüfung ist manuell und läuft nicht als Sub-Agent; critique ist damit degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab. `detect` lief je Seite über den Launcher.

Aufnahme- und Messhinweise:
- Alle 23 Screenshots `spieler_mobil_<seite>.png` sind einzeln angesehen. `/anmelden` und `/willkommen` sind byte-identisch (gleiche MD5-Summe) mit `/app`: der Befund ist die Weiterleitung auf `/app` (aktiver Zustand "angemeldet").
- Zusatzaufnahmen und Messungen (Playwright, Touch, 390x844): `spieler_mobil_extra_kontomenue.png` (Konto-Menü offen), `spieler_mobil_extra_matchmaking-ende.png` (Seitenende ohne Navigation darüber), `spieler_mobil_extra_einladung-nach-klick.png` (Klick auf "Team beitreten").
- Gemessen (alle 23 Seiten, metrics-spieler.json und metrics2-spieler.json): kein horizontaler Überlauf, je Seite genau eine `h1`, keine Konsolenfehler, alle 200. Ziele unter 44 px: 8 bis 12 je Seite, auf `/app/einstellungen` 30 von 69.
- `detect` gegen URLs sieht keine Sitzung: für `/anmelden`, `/willkommen` und alle `/app*`-Seiten zeigt es die Gast-Anmeldeseite (Straggler "nötig."), das ist kein Befund der Seite. Für diese Seiten lief zusätzlich `detect` gegen den Quelltext (Verzeichnisse `src/app/app`, `src/app/app/einstellungen`, `guthaben`, `benachrichtigungen`, `suche`, `matchmaking`, `einladung`, `mitspieler` sowie `Header.tsx`, `UserMenu.tsx`, `BottomNav.tsx`): jeweils `[]`, keine Funde. Die Kopfleiste zeigt der Detector bei URL-Läufen in der Gast-Variante.
- `detect` auf `/` und `/suche`: Timeout nach 30 s, auch im zweiten Versuch (Dauerverbindung, EventSource); vermerkt, keine neuen Daten. Ersatz: Zielgrößen per Playwright gemessen, Quelltext gelesen. Es bleibt bei den früheren Funden X-13 (`/`) und X-10 (`/suche`).
- Der Screenshot-Stil ist hell (Mint), `detect` misst im Dunkelmodus (Kontrast #89958f auf #24362d).
- Der "N"-Knopf (Next-Dev-Overlay) und die mitten im Bild stehende feste Navigation in ganzseitigen Bildern sind Aufnahme-Artefakte, kein Fund.

### Seitenübergreifende Funde (hier einmal beschrieben, von den Seiten referenziert)

Vorhandene Funde X-06, X-07, X-17 sowie GM-ST-4 (Zielgrößen Sprachwahl), GM-ST-5 (Kopfleiste am Handy ohne Offene Lobbys/Livescore/Rangliste) und GM-ST-6 (gemischte Sprache) gelten auch für den Spieler.

- SM-GL-1 | P1 | Aktiver Reiter der unteren Navigation stimmt nicht (gemessen per `aria-current`, Playwright): auf `/`, `/mitspieler`, `/hilfe`, `/rangliste`, `/spiele` ist kein Reiter aktiv; auf `/app/suche/neu` sind zwei Reiter zugleich aktiv ("Spiel suchen" und "Profil", `BottomNav.tsx:193` und `:219` überschneiden sich); auf `/einladung/*` leuchtet "Privatspiel" (`BottomNav.tsx:189`), auch bei Team-Einladung und ungültigem Link; auf `/spieler` (Spielerliste) leuchtet "Profil", auf `/teams` "Teamspiel". Der Reiter "Profil" führt auf `/app` (Seitentitel "Mein Bereich", nicht das eigene Profil `/spieler/<id>`). Ergänzt X-06. | spieler_mobil_einladung-demoinvitex1.png, spieler_mobil_spieler.png, spieler_mobil_start.png | critique/clarify
- SM-GL-2 | P1 | Guthaben-Eintrag im Konto-Menü auch am Handy: Die Kopfleiste blendet den Betrag unter `sm` aus (`Header.tsx:53`, `hidden ... sm:inline`), das Menü zeigt "Guthaben 0,00 €" immer (`UserMenu.tsx:69-72`). Siehe MUSS WEG. | spieler_mobil_extra_kontomenue.png | clarify
- SM-GL-3 | P2 | Konto-Menü: sieben Einträge (Mein Profil, Mein Bereich, Guthaben, Benachrichtigungen, Konto und Einstellungen, Hilfe, Abmelden), jeder 36 px hoch (unter 44), Menüknopf 95x36 px. "Benachrichtigungen" steht schon als Glocke daneben, "Hilfe" in der Fußzeile; "Mein Profil", "Mein Bereich", "Konto und Einstellungen" und der Reiter "Profil" benennen drei Ziele mit zwei Namen. Das Menü zeigt keine Rolle (Spieler/Team-Admin) und kein Team. | spieler_mobil_extra_kontomenue.png | audit/distill
- SM-GL-4 | P2 | Konto-Menü schließt nur mit `mousedown` und Escape (`UserMenu.tsx:112-115`), kein `touchstart`/`pointerdown`; auf Touch-Geräten greift das über emulierte Mausereignisse, am echten Gerät nicht geprüft. Aus Quelltext. | UserMenu.tsx (Quelltext) | audit
- SM-GL-5 | P1 | Rollenbegriffe uneinheitlich: Texte sagen "Captain" (`GameModes.tsx:94`, `matchmaking/page.tsx:31`, Hilfe "Der Captain gibt ... an"), andere "Team-Admin" (`app/page.tsx:114`, `suche/neu/page.tsx:136`, Hilfe `:45`, Hinweis "Nur Team-Admins können nach Gegnern suchen"). Ein Spieler erfährt nirgends, dass beides dieselbe Rolle ist, und sieht nur den Chip "Spieler" oder "Team-Admin" an der Teamzeile. Ergänzt GM-HI-3. | spieler_mobil_app.png, spieler_mobil_matchmaking.png | clarify
- SM-GL-6 | P1 | Angebotene, aber nicht ausführbare Handlungen für den Spieler (X-20 aus Quelltext bestätigt): "Lobby aufmachen" steht als erste (primäre) Handlung in der Karte Teamspiel (`GameModes.tsx:95`, auf `/` und `/app`), als Kachel im Schnellzugriff (`app/page.tsx:62`), in der Fußzeile (`Footer.tsx`), als Button auf `/suche` (`suche/page.tsx:173`) und als Reiter "Teamspiel" (`BottomNav.tsx:188`). Die Seite dahinter (`/matchmaking`) lässt den Spieler die Erklärung für Captains lesen und zeigt erst am Seitenende "Nur Team-Admins können nach Gegnern suchen. Team gründen". Siehe SM-MA-1. | spieler_mobil_app.png, spieler_mobil_extra_matchmaking-ende.png | critique/clarify

---

#### /
Beleg: spieler_mobil_start.png
Bewertung: Auch angemeldet zeigt die Startseite den Einsteiger-Hero mit "Team gründen" als erster Handlung und die Erklärung "So funktioniert Socaz"; ein Spieler mit Team sieht keine eigenen Spiele (leer) und muss über Menü oder Reiter nach `/app`. Kopfleiste (Glocke, Name "Alpha") ist klar, kein Reiter aktiv.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan/Casey/Sam (Spieler: Casey zentral), Severity] (reference/critique.md, manuell) | Funde: Gast-Hero für Angemeldete (SM-ST-1), Zielhierarchie X-02, X-03, Wiederholung der Einstiege GM-ST-2, Rollenproblem SM-GL-6 |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; Theming und Performance gestreift] (reference/audit.md, manuell, metrics: 9 von 44 Ziele unter 44 px, kein Überlauf, 1 h1) | Funde: Sprachwahl 16 px hoch (GM-ST-4), Hero-Video ohne Schutz (GM-ST-8), Text auf Foto (X-19), Reiter ohne Markierung (SM-GL-1) |
| distill [Teil: Assess Current State, Information Architecture, Interaction Simplification] (reference/distill.md, manuell) | Funde: Hero 4 Buttons + 5 Karten-Buttons (X-03), doppeltes Logo (GM-ST-7), Einstiegstexte für Angemeldete überflüssig (SM-ST-1) |
| clarify [Teil: Audit the language, Message hierarchy, Actions/Forms/Errors/Empty states] (reference/clarify.md, manuell) | Funde: "Kostenlos", "Du lädst dein Guthaben auf" (X-05, GM-ST-1), "Der Captain öffnet eine Lobby" (SM-GL-5) |
| adapt [Teil: Mobile Adaptation (Layout, Interaction, Content, Navigation), Touch] (reference/adapt.md, manuell) | Funde: Kopfleiste ohne Offene Lobbys/Livescore/Rangliste (GM-ST-5), Hero-Buttons ungleich breit (X-02) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Timeout nach 30 s (zweimal); keine neuen Daten. Früherer Lauf: Straggler X-13 |

Funde:
- X-02, X-03, X-05, X-13, X-19, GM-ST-1, GM-ST-2, GM-ST-4, GM-ST-5, GM-ST-6, GM-ST-7, GM-ST-8, GM-ST-9 (gelten unverändert)
- SM-ST-1 | P1 | Für Angemeldete bleibt die Startseite eine Gast-Seite: Hero mit "Team gründen" (`page.tsx:61-63`, `user ? createTeam`), obwohl der Spieler schon in Demo Alpha ist; darunter "So funktioniert Socaz" mit Schritt 1 "Melde dich mit Google an und gründe dein Team" und "Was kostet das?". Das Logo oben links führt auf diese Seite, nicht auf `/app` (`Header.tsx:22`). "Meine Spiele" erscheint nur, wenn Spiele existieren (`page.tsx:40`), sonst ist die Seite für den Spieler ohne eigenen Inhalt. | spieler_mobil_start.png | critique/distill
- SM-ST-2 | P1 | Rolle: Karte "Teamspiel" mit "Der Captain öffnet eine Lobby ..." und primärem "Lobby aufmachen" (SM-GL-6); "Turnier veranstalten" und "Privatspiel anlegen" sind für Spieler möglich (Quelltext `GameModes.tsx:101,107`, Berechtigung nicht geklickt). | spieler_mobil_start.png | clarify

---

#### /hilfe
Beleg: spieler_mobil_hilfe.png
Bewertung: Aufklappliste mit 19 Fragen in fünf Gruppen, gut tippbar. Für den Spieler ist sie überwiegend an Team-Admins gerichtet (Einladungslink, Lobby, Ergebnis erfassen) und enthält den Altmodell-Block "Geld und Guthaben".

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1-10 (Hilfe/Doku), Personas Jordan, Casey] (manuell) | Funde: Begriffsmix Captain/Team-Admin (SM-GL-5, GM-HI-3), Antworten adressieren Admin, nicht Spieler (SM-HI-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics: 11 von 37 Ziele unter 44 px, kein Überlauf] (manuell) | Funde: Fußzeilenziele (X-07, GM-ST-4); Details/Summary tippbar, Fokus vorhanden |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: 19 Fragen ohne Suche oder Sprungmarken (GM-HI-4) |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: Geld-Abschnitt Altmodell (GM-HI-1), "(oben)" (GM-HI-2), "Rolle: was darf ich?" fehlt (SM-HI-1) |
| adapt [Teil: Mobile Adaptation Content, Navigation] (manuell) | Funde: "oben in der Leiste" gilt nur am Desktop (GM-HI-2) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hilfe` (Gast-Sicht, Seite öffentlich) | nur overused-font (gewollt); keine weiteren Funde |

Funde:
- GM-HI-1, GM-HI-2, GM-HI-3, GM-HI-4, X-07 (gelten unverändert; Altmodell-Abschnitt siehe MUSS WEG)
- SM-HI-1 | P1 | Die Hilfe beantwortet nicht "Was darf ich als Spieler?". Antworten sind an Team-Admins gerichtet (`hilfe/page.tsx:45` "als Team-Admin einen Einladungslink", `:52` "Der Captain gibt ... an", `:71` "Ein Team-Admin erfasst Tore"), es fehlt eine Frage zu Rollen (Spieler, Team-Admin, Captain) und was jede Rolle darf. Aus Quelltext. | spieler_mobil_hilfe.png | clarify

---

#### /agb
Beleg: spieler_mobil_agb.png
Bewertung: Lesbarer Rechtstext, aber mit "Entwurf"-Kasten und Altmodell-Aussagen (Guthaben, kostenlos abmelden). Für Angemeldete verbindlich wirkend, daher Entwurfsvermerk störend.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan/Sam] (manuell) | Funde: Entwurf-Hinweis (GM-AG-1), dichter Absatz 3 (GM-AG-3) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px] (manuell) | Funde: Fließtext 14 px grau; Zielgrößen wie GM-ST-4 |
| distill [Teil: Content Simplification] (manuell) | keine neuen Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: Altmodell-Sätze (GM-AG-2) |
| adapt [Teil: Mobile Content] (manuell) | Funde: Zeilenlänge am Handy gut (X-14 nur Desktop) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/agb` | straggler "Betreiber." und "führen." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-AG-1, GM-AG-2, GM-AG-3 (gelten unverändert; Altmodell siehe MUSS WEG)

---

#### /datenschutz
Beleg: spieler_mobil_datenschutz.png
Bewertung: Gut gegliedert; mit Platzhalter beim Verantwortlichen und Guthaben-Bezug. Für Angemeldete funktioniert der Link "Einstellungen" (bei Gästen nicht, GM-DS-3).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan/Sam] (manuell) | Funde: Platzhalter Verantwortlicher (GM-DS-1), Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px, Höhe 2084 px] (manuell) | Funde: Link "Einstellungen" im Text trägt (Spieler: Ziel `/app/einstellungen` erreichbar), Ziele klein |
| distill [Teil: Information Architecture] (manuell) | Funde: 14 Abschnitte ohne Inhaltsübersicht (GM-DS-4) |
| clarify [Teil: Audit the language] (manuell) | Funde: Guthaben (GM-DS-2) |
| adapt [Teil: Mobile Content/Navigation] (manuell) | Funde: lange Seite ohne Sprungmarken (GM-DS-4) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/datenschutz` | 4 straggler ("Betreiber.", "eingetragen.", "Cookie-Banner.", "erhalten."), siehe X-13; overused-font nicht gewertet |

Funde:
- X-13, GM-DS-1, GM-DS-2, GM-DS-4, GM-AG-1 (gelten unverändert; GM-DS-3 gilt nur für Gäste)

---

#### /impressum
Beleg: spieler_mobil_impressum.png
Bewertung: Kurz und lesbar, aber mit Konfigurationsnamen (OPERATOR_NAME ...) im Text und Entwurfshinweis. Im aktuellen Zustand nicht zeigbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2 (Match zur Realität), 9] (manuell) | Funde: Konfigurationsnamen sichtbar (GM-IM-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px, Höhe 896 px] (manuell) | keine neuen Funde (X-07) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: GM-IM-1 |
| adapt [Teil: Mobile Content] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/impressum` | straggler "Betreiber." und "wieder." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-IM-1, GM-AG-1

---

#### /hausordnung
Beleg: spieler_mobil_hausordnung.png
Bewertung: Kurze, klare Regeln; Entwurfskasten und ein Satz zu "offenes Guthaben und Reservierungen" (Altmodell). Für Spieler inhaltlich relevant (Fehlen, Melden).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Persona Jordan] (manuell) | Funde: Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px] (manuell) | keine neuen Funde (X-07) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: Guthaben-Satz "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (siehe MUSS WEG) |
| adapt [Teil: Mobile Content] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hausordnung` | straggler "Betreiber." und "abgewickelt." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-AG-1
- SM-HO-1 | P2 | Altmodell-Satz im Abschnitt "Folgen" (`hausordnung/page.tsx:23`), siehe MUSS WEG. | spieler_mobil_hausordnung.png | clarify

---

#### /kontakt
Beleg: spieler_mobil_kontakt.png
Bewertung: Kurz; E-Mail-Zeile zeigt den Konfigurationsnamen OPERATOR_EMAIL; der Listenpunkt "Auszahlung deines Guthabens" ist Altmodell.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 9, 10] (manuell) | Funde: Konfigurationsname sichtbar (GM-KO-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px] (manuell) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: GM-KO-1, "Auszahlung deines Guthabens" (siehe MUSS WEG) |
| adapt [Teil: Mobile Content] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-KO-1 (gilt unverändert)
- SM-KO-1 | P2 | Altmodell-Listenpunkt (`kontakt/page.tsx:28`), siehe MUSS WEG. | spieler_mobil_kontakt.png | clarify

---

#### /unter-16
Beleg: spieler_mobil_unter-16.png
Bewertung: Kurze Hinweisseite, passend für Abgewiesene. Wird sie von einem angemeldeten Spieler geöffnet, widerspricht der Text dem Zustand (Kopfleiste zeigt "Alpha", der Text sagt "Dein Konto wurde wieder gelöscht").

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1 (Systemstatus), 9] (manuell) | Funde: Text unabhängig von Sitzung (SM-U1-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde (Fußzeile X-07) |
| distill [Teil: Interaction Simplification] (manuell) | Funde: Fußzeile und Reiterleiste auf einer Sackgasse unnötig (wie GM-EL-3) |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] (manuell) | Funde: Grund fehlt ("ab 16" steht im Titel), Weg weiter nur "Zur Startseite" |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: Reiter aktiv: keiner |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/unter-16` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- SM-U1-1 | P2 | Text "Du kannst noch kein Konto anlegen. Dein Konto wurde wieder gelöscht" ist unabhängig von der Sitzung; mit Sitzung (z. B. Zurück-Taste nach Abweisung) wirkt er falsch. Aus Quelltext (`unter-16/page.tsx:15`), Zustand "angemeldet und zugleich abgewiesen" ist im Normalbetrieb selten. | spieler_mobil_unter-16.png | clarify

---

#### /anmelden
Beleg: spieler_mobil_anmelden.png (identisch mit spieler_mobil_app.png)
Bewertung: Der Spieler wird auf `/app` weitergeleitet (Metrik: URL `/app`, Titel "Mein Bereich"); das ist richtig und ohne Zwischenbild. Die Seite selbst ist für ihn nicht sichtbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 3 (Kontrolle), 1] (manuell) | Funde: Weiterleitung ohne Hinweis "du bist schon angemeldet" (SM-AN-1) |
| audit [Teil: Dimension 4 Responsive; metrics 9 von 47 Ziele unter 44 px, Höhe 1820 px = /app] (manuell) | Funde: wie `/app` |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Message hierarchy] (manuell) | Funde: kein Text (reine Weiterleitung) |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: Reiter "Profil" aktiv (passt zu `/app`) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/anmelden` (Gast-Sicht, Seite ist für den Spieler eine Weiterleitung) | straggler "nötig." (X-13); overused-font nicht gewertet. Quelltext `src/app/app`: `[]` |

Funde:
- SM-AN-1 | P2 | Weiterleitung von `/anmelden` auf `/app` ohne Rückmeldung; Links "Anmelden" aus E-Mails oder Einladungen (`?next=`) landen sofort im Bereich. Gewollt, aber für Spieler mit `next` prüfen, ob das Ziel erreicht wird (nicht getestet). | spieler_mobil_anmelden.png | critique

---

#### /willkommen
Beleg: spieler_mobil_willkommen.png (identisch mit spieler_mobil_app.png)
Bewertung: Eingerichteter Spieler wird auf `/app` weitergeleitet, korrekt. Onboarding-Inhalt für neue Nutzer ist nicht prüfbar (Seed-Nutzer sind eingerichtet).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 1, 3] (manuell) | keine neuen Funde (Weiterleitung korrekt) |
| audit [Teil: Dimension 4 Responsive; metrics wie /app] (manuell) | Funde: wie `/app` |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Message hierarchy] (manuell) | keine Funde |
| adapt [Teil: Mobile Navigation] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/willkommen` (Gast-Sicht) | straggler "nötig." (X-13); overused-font nicht gewertet |

Funde:
- keine eigenen (Onboarding als neuer Nutzer: nicht geprüft)

---

#### /suche
Beleg: spieler_mobil_suche.png
Bewertung: Die Filtermaske mit sechs Feldern füllt den ersten Bildschirm, darunter die leere Liste; Überschrift "Offene Lobbys anderer Teams" mit rotem Punkt und "Live". Der primäre Button "Lobby aufmachen" steht dem Spieler zu, obwohl er sie nicht öffnen darf.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Casey/Jordan] (manuell) | Funde: Filtermaske vor Inhalt (X-10), "Lobby aufmachen" für Spieler (SM-GL-6, SM-SU-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 42 Ziele unter 44 px, Höhe 1023 px] (manuell) | Funde: Auswahlfeld "Art" abgeschnitten (X-10), kleiner Button 36 px hoch |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: sechs Filter gleichzeitig sichtbar (X-10), "Meine Spiele"/Herausforderungen nur bei Daten (Quelltext `suche/page.tsx:176-178`) |
| clarify [Teil: Audit the language, Empty states] (manuell) | Funde: leerer Zustand sagt "Mach eine Lobby für dein Team auf" (SM-SU-1), "Lobbys" und "Suchen" gemischt (GM-HI-3) |
| adapt [Teil: Mobile Adaptation Layout, Navigation, Touch] (manuell) | Funde: Reiter "Spiel suchen" aktiv (korrekt), Filter als Zwei-Spalten-Raster, Zielgrößen |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Timeout nach 30 s (zweimal, Dauerverbindung); keine Daten. Quelltext `src/app/app/suche` ohne Funde. Früherer Fund X-10 (unbalanced-heading) |

Funde:
- X-10 (gilt unverändert)
- SM-SU-1 | P1 | Spielerrolle: Der primäre Button "Lobby aufmachen" (`suche/page.tsx:173`) und der Leerzustand "Mach eine Lobby für dein Team auf" (`OpenSearches.tsx:24`) richten sich an Captains. Ein Spieler kann hier nur ansehen; Herausforderungen ("Ansehen und annehmen", `Challenges.tsx:23`) und "Annehmen" erscheinen nur für Team-Admins (aus Quelltext). Ein Hinweis "Lobbys öffnen und annehmen kann nur dein Team-Admin" fehlt. | spieler_mobil_suche.png | clarify

---

#### /spieler
Beleg: spieler_mobil_spieler.png
Bewertung: Spielerliste als Karten, gut lesbar, aber das Suchfeld ist auf etwa 48 px zusammengedrückt (X-01, Platzhalter "Na"). Die eigene Karte ("Alpha Spieler 1") ist nicht hervorgehoben.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 6, 7, Personas Casey/Jordan] (manuell) | Funde: Suchfeld unbrauchbar (X-01), eigene Karte nicht markiert (SM-SP-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 47 Ziele unter 44 px, Höhe 1399 px] (manuell) | Funde: Platzhalter-Kontrast 4,1:1 (X-16), Suchfeld-Breite (X-01) |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Empty states] (manuell) | Funde: "0 Spiele · 0 Tore" (Seed) als einzige Kennzahl; Leerzustand "Keine Spieler gefunden." ohne Weg (Quelltext `spieler/page.tsx:101`) |
| adapt [Teil: Mobile Adaptation Layout, Touch, Navigation] (manuell) | Funde: Suchzeile bricht nicht um (X-01); Reiter "Profil" aktiv statt kein Reiter (SM-GL-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | low-contrast Platzhalter "Name suchen" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-16, SM-GL-1
- SM-SP-1 | P2 | Die eigene Karte in der Spielerliste ist nicht markiert ("Du"); der Reiter "Profil" ist aktiv, ohne dass man auf dem eigenen Profil ist. | spieler_mobil_spieler.png | critique

---

#### /teams
Beleg: spieler_mobil_teams.png
Bewertung: Zwei Teamkarten, übersichtlich; Suchfeld zusammengedrückt (X-01, "Tea"). Das eigene Team (Demo Alpha) ist nicht markiert.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 4, Personas Casey] (manuell) | Funde: Suchfeld (X-01), eigenes Team nicht markiert (SM-TE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 39 Ziele unter 44 px] (manuell) | Funde: Platzhalter-Kontrast (X-16) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: "noch ohne Spiel" als Statuszeile ohne Erklärung |
| adapt [Teil: Mobile Adaptation Layout, Navigation] (manuell) | Funde: Reiter "Teamspiel" aktiv auf Teamverzeichnis (X-06) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | low-contrast Platzhalter "Teamname" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-06, X-16
- SM-TE-1 | P2 | Das eigene Team erscheint ohne Markierung ("Dein Team") und ohne Rolle in der Liste; der Spieler muss den Namen erkennen. | spieler_mobil_teams.png | critique

---

#### /offline
Beleg: spieler_mobil_offline.png
Bewertung: Kurze, klare Hinweisseite "Keine Verbindung"; die Kopfleiste zeigt angemeldeten Zustand. Es fehlt eine Handlung ("Erneut versuchen").

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 9] (manuell) | Funde: keine Handlung (SM-OF-1) |
| audit [Teil: Dimension 4 Responsive; metrics 8 von 34 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde |
| distill [Teil: Interaction Simplification] (manuell) | Funde: Fußzeile mit 14 Links und Reiterleiste auf einer Offline-Seite überflüssig (nicht erreichbar ohne Netz) |
| clarify [Teil: Errors and permissions] (manuell) | Funde: was/warum gut, wie weiter nur "wieder online" |
| adapt [Teil: Mobile Navigation; Offline/Connection aus adapt "slow connections"] (manuell) | Funde: Links in Fußzeile und Reiter führen ohne Netz ins Leere |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/offline` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- SM-OF-1 | P2 | Offline-Seite ohne Button "Erneut versuchen"; Fußzeile und untere Navigation führen ohne Netz nirgendwohin. | spieler_mobil_offline.png | clarify

---

#### /app
Beleg: spieler_mobil_app.png
Bewertung: Das ist der Spieler-Einstieg und trägt die meiste Rollenlast: Begrüßung, drei große Spielart-Karten mit Captain-Handlungen, dann Guthaben-Karte, fünf Kacheln, "Meine Spiele" und "Meine Teams" erst nach etwa 1200 px. Ein Spieler sieht "Lobby aufmachen" dreifach und "Team gründen" zweifach, ohne dass die für ihn relevanten Dinge (nächstes Spiel, Zu-/Absage) oben stehen.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Wall of Options, Visual Noise Floor), Heuristiken 1-10, Personas Casey/Jordan, Severity] (manuell) | Funde: Handlungen ohne Berechtigung (SM-GL-6, X-20), Reihenfolge (X-03, X-04), "Meine Teams" mit Rollenchip winzig (SM-AP-2) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; metrics 9 von 47 Ziele unter 44 px, Höhe 1820 px] (manuell, Playwright: Ziele unter 44 px: Menüknopf 95x36, "Team gründen" 146x36, Sprachwahl 49x16 und 41x16, Dev-Knopf 32) | Funde: kleine Ziele (SM-GL-3, GM-ST-4), schwarzer Punkt statt Teamfarbe (X-18) |
| distill [Teil: Assess Current State, Information Architecture, Interaction Simplification (ONE primary action)] (manuell) | Funde: drei Karten + fünf Kacheln + zwei "Team gründen" (X-03, X-04, SM-AP-1) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] (manuell) | Funde: "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" (X-05, MUSS WEG), Leerzustand "Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an" (SM-AP-3), "Spieler"-Chip |
| adapt [Teil: Mobile Adaptation Layout, Content (Progressive disclosure), Navigation, Touch] (manuell) | Funde: Schnellzugriff 5 Kacheln mit "Hilfe" allein (X-04); Reiter "Profil" aktiv, Titel "Mein Bereich" (SM-GL-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` (Gast-Sicht: zeigt Anmeldeseite) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]`, keine Funde |

Funde:
- X-03, X-04, X-05, X-18, X-20, SM-GL-1, SM-GL-5, SM-GL-6
- SM-AP-1 | P1 | "Meine Spiele" (`app/page.tsx:69-94`) und "Meine Teams" (`:96-120`) stehen am Ende; Spieler-relevantes (nächstes Spiel, "Bin ich dabei?") steht erst nach drei Karten, Guthaben-Karte und Kacheln. Die erste Spalte ist Werbung für Spielarten, die ein Spieler selten startet. Ergänzt X-03. | spieler_mobil_app.png | distill
- SM-AP-2 | P2 | In "Meine Teams" ist die Rolle ein 12-px-Chip "Spieler" rechts (`app/page.tsx:114`), ohne Erklärung, was ein Spieler im Team darf; "Team gründen" (Button 36 px hoch) steht neben der Überschrift und wiederholt den Button im Leerzustand "So startest du" (`:45`, nur bei 0 Teams/Spielen). | spieler_mobil_app.png | clarify
- SM-AP-3 | P2 | Leerzustand "Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an" (`app/page.tsx:72`) richtet sich an Captains; ein Spieler kann weder Gegner suchen noch eine Spielsuche annehmen. Aus Quelltext. | spieler_mobil_app.png | clarify
- SM-AP-4 | P2 | Aus Quelltext: "Meine Spiele" (`MyGames`) und "Herausforderungen" werden nur gerendert, wenn Daten da sind (`Challenges.tsx:7`); der Seed hat keine Spiele, daher ist der volle Zustand nicht angesehen. Fehlertext bei fehlgeschlagener Abfrage: keiner sichtbar (nur `error.tsx` global). | Quelltext | audit

---

#### /app/suche/neu
Beleg: spieler_mobil_app-suche-neu.png
Bewertung: Für den Spieler eine Sackgasse: Statt des Formulars steht "Du brauchst ein Team, bei dem du Team-Admin bist." mit dem Button "Team gründen", obwohl er in Demo Alpha ist. Der Weg "Admin fragen" fehlt.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 3, 5, 9, Persona Jordan] (manuell) | Funde: Sackgasse für Spieler (SM-SN-1), Reiter doppelt aktiv (SM-GL-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 36 Ziele unter 44 px, Höhe 844 px] (manuell) | Funde: Reiter mit zwei `aria-current="page"` (SM-GL-1), sonst keine |
| distill [Teil: Information Architecture] (manuell) | Funde: Seite hat zwei Zwecke ("festen Termin suchen" und Verweis auf Matchmaking) in einem Absatz |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] (manuell) | Funde: Grund ja, Weg falsch (SM-SN-1); Begriff "Matchmaking" vs "Offene Lobbys" (GM-HI-3) |
| adapt [Teil: Mobile Adaptation Content, Navigation] (manuell) | Funde: Reiterleiste "Spiel suchen" und "Profil" zugleich aktiv |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app/suche`: `[]`, keine Funde |

Funde:
- X-11 (Formular nur für Team-Admins sichtbar, hier nicht angesehen), SM-GL-1
- SM-SN-1 | P1 | Das Formular ist nur für Team-Admins da; der Spieler sieht "Du brauchst ein Team, bei dem du Team-Admin bist." und den primären Button "Team gründen" (`suche/neu/page.tsx:134-138`), obwohl er Teammitglied ist. Richtig wäre: "Das kann nur dein Team-Admin" (mit Name) und keine Aufforderung, ein zweites Team zu gründen. Die Seite hat zudem keinen Zurück-Weg und wird über einen Link angeboten, den der Spieler nicht nutzen darf (z. B. aus Hilfe/Kacheln). | spieler_mobil_app-suche-neu.png | clarify

---

#### /app/einstellungen
Beleg: spieler_mobil_app-einstellungen.png
Bewertung: 2179 px lange Seite mit drei getrennten Speichern-Gruppen; die elf Benachrichtigungs-Häkchen enthalten Einträge, die ein Spieler nie bekommt. Funktional vorhanden (Profilbild, Daten-Export, Konto löschen).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Chunking, Minimal choices), Heuristiken 1, 5, 9, Personas Casey/Sam] (manuell) | Funde: viele Häkchen (X-08), Admin-Benachrichtigungen für Spieler (SM-ES-1) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive (Zielgrößen), 5 Integrität; metrics 30 von 69 Ziele unter 44 px, Höhe 2179 px] (manuell) | Funde: 30 kleine Ziele (X-07, X-08), Spitzname-Placeholder abgeschnitten ("z. B. Der Hamm…"), Farbwahl 7 Punkte ohne Namen (Quelltext prüfen: Beschriftung der Farbknöpfe) |
| distill [Teil: Information Architecture, Interaction Simplification, Progressive disclosure] (manuell) | Funde: Profil, Spielerprofil, Benachrichtigungen, Daten auf einer Seite, mehrere Speichern-Buttons (X-08) |
| clarify [Teil: Audit the language, Forms, Errors, Success states] (manuell) | Funde: "Push ist auf diesem Server noch nicht eingerichtet" vor den Kanälen (X-08), "Gespeichert." nur bei Benachrichtigungen (Quelltext `PrefsForm.tsx:30`) |
| adapt [Teil: Mobile Adaptation Layout, Content, Touch] (manuell) | Funde: Reiter "Profil" aktiv (passt), Häkchen 20 px, Zeilen nicht tippbar über Label (Label umschließt, aber 24 px hoch) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app/einstellungen`: `[]`, keine Funde |

Funde:
- X-07, X-08
- SM-ES-1 | P1 | Die Liste "Das möchte ich erfahren" (`PrefsForm.tsx:21-26`) zeigt jedem Nutzer alle optionalen Arten, darunter "Neue Aufgabe für Admins" (geht nur an Plattform-/Buchungs-Admins, `booking.ts:46`), "Dein Team wurde herausgefordert" (`challenges.ts:57`, nur Team-Admins), "Neues Mitglied in deinem Team" (nur Admins, `teams.ts:131`), "Spieler tritt der Lobby bei" (`lobby.ts:397`, Team-Admins) und "Ersatzspieler wartet auf Zuweisung" (`lobby.ts:487`, Admins). Ein Spieler kann sie wählen, bekommt sie nie. | spieler_mobil_app-einstellungen.png | clarify
- SM-ES-2 | P2 | Die Zeile "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (`PrefsForm.tsx:27`) nennt Zahlungen; mit dem Kartenmodell prüfen, ob "Zahlungen" bleibt (Prüfen, kein MUSS WEG). | spieler_mobil_app-einstellungen.png | clarify
- SM-ES-3 | P2 | "Konto löschen" ist eine kleine Aufklappzeile (`einstellungen/page.tsx:52-57`, `<details>`); der Inhalt (DeleteAccountForm) ist im Screenshot zu, aus Quelltext nicht auf Guthaben-Bedingungen geprüft (Hilfe `:120` nennt "Guthaben auf null"). | spieler_mobil_app-einstellungen.png | clarify

---

#### /app/benachrichtigungen
Beleg: spieler_mobil_app-benachrichtigungen.png
Bewertung: Schlicht und klar: Überschrift, Link "Einstellungen", leerer Zustand "Noch keine Benachrichtigungen." Der leere Zustand erklärt nicht, was hier erscheinen wird.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 6] (manuell) | Funde: Leerzustand ohne Erklärung (SM-BE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | Funde: Link "Einstellungen" 14 px hoch (klein) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Empty states, Loading/success] (manuell) | Funde: SM-BE-1 |
| adapt [Teil: Mobile Content, Navigation] (manuell) | Funde: Reiter "Profil" aktiv, Glocke nicht als aktiv erkennbar |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app/benachrichtigungen`: `[]`, keine Funde |

Funde:
- SM-BE-1 | P2 | Leerzustand "Noch keine Benachrichtigungen." ohne Beispiel (Einladung, Spielzusage, Ergebnis) und ohne Verweis auf die Einstellungen ("Einstellungen" steht nur als kleiner Link oben rechts). Aus Quelltext: gelesene und ungelesene Einträge unterscheiden sich nur durch Rahmenfarbe (`benachrichtigungen/page.tsx:97`), kein Text. | spieler_mobil_app-benachrichtigungen.png | clarify

---

#### /app/guthaben
Beleg: spieler_mobil_app-guthaben.png
Bewertung: Die gesamte Seite beschreibt das Altmodell: Guthaben aufladen, Rabattcode-Feld, "Zahlungen noch nicht eingeschaltet". Mit dem Kartenmodell (012) fällt sie weg. Für den Spieler zusätzlich verwirrend: er soll "Geld aufladen", obwohl noch nichts zu zahlen ist.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 4, 10, Persona Jordan] (manuell) | Funde: Seitenzweck verschiebt sich (X-09), Altmodell (MUSS WEG) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 9 von 41 Ziele unter 44 px, Höhe 1519 px] (manuell, Playwright: Felder "Betrag in Euro" und "Rabattcode (optional)" haben Labels) | Funde: Betrag doppelt (Schnellwahl und Feld, X-09) |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: Vier-Schritte-Text vor dem Aufladen, leere Kästen "Verlauf" und "Belege" (X-09) |
| clarify [Teil: Audit the language, Message hierarchy, Forms, Empty states] (manuell) | Funde: "Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" und "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt)" (Entwicklertext für Spieler, Quelltext `guthaben/page.tsx:64,85`), Rabattcode ohne Erklärung (X-09) |
| adapt [Teil: Mobile Adaptation Layout, Touch] (manuell) | Funde: Reiter "Profil" aktiv; Schnellwahl drei Knöpfe breit (ok) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app/guthaben`: `[]`, keine Funde |

Funde:
- X-05, X-09
- SM-GU-1 | P1 | Für den Spieler (Quelltext `guthaben/page.tsx:85`): "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt). Sobald der Betreiber Stripe verbunden hat ..." ist Betreiber-Text, der bei fehlender Einrichtung dem Endnutzer gezeigt wird (im Screenshot nicht sichtbar, weil hier ein Anbieter aktiv ist). Siehe MUSS WEG. | Quelltext | clarify
- SM-GU-2 | P2 | Verlauf zeigt Arten "Startgebühr", "Bonus (Rabattcode)", "Hallenkosten" (`guthaben/page.tsx:17-26`); Begriffe passen nicht zum Kartenmodell (Quelltext). Siehe MUSS WEG. | Quelltext | clarify

---

#### /matchmaking
Beleg: spieler_mobil_matchmaking.png (Ende: spieler_mobil_extra_matchmaking-ende.png)
Bewertung: Die Seite spricht den Spieler als Captain an ("Du bist Captain und willst mit deinem Team spielen?"), erklärt vier Schritte und zeigt dann leere "Offene Suchen". Die Information, dass der Spieler selbst keine Lobby aufmachen kann, steht erst ganz unten im Seitenende ("Nur Team-Admins können nach Gegnern suchen. Team gründen"), im ganzseitigen Bild von der Navigation verdeckt.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 2, 5, 9, Personas Jordan/Casey] (manuell) | Funde: falsche Anrede für Spieler, Erklärung der Sperre am Ende (SM-MA-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 12 von 38 Ziele unter 44 px, Höhe 1216 px] (manuell) | Funde: Filter-Select "Alle Dauern" abgeschnitten ("Alle Dauer"), Filter-Knöpfe 36 px |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: vier Erklärungsschritte vor dem Inhalt (für Spieler irrelevant), zwei Filter und Button in einer Zeile |
| clarify [Teil: Errors and permissions, Empty states, Audit the language] (manuell) | Funde: Berechtigungs-Hinweis falsch platziert und mit falschem Weg (SM-MA-1); Leerzustand "Mach eine Lobby für dein Team auf" (SM-SU-1) |
| adapt [Teil: Mobile Adaptation Layout, Navigation, Touch] (manuell) | Funde: Reiter "Teamspiel" aktiv (passt); Filterzeile eng |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` (Gast-Sicht, Seite öffentlich) | straggler "offen." (kleiner Fund P2, Absatz "Eure Lobby ist offen"); Quelltext `src/app/matchmaking`: `[]` |

Funde:
- SM-GL-5, SM-GL-6
- SM-MA-1 | P1 | Spieler ohne Team-Admin-Recht: Überschrift und Einleitung ("Du bist Captain ...") passen nicht; der Hinweis "Nur Team-Admins können nach Gegnern suchen. Team gründen" erscheint erst unterhalb der Liste (`matchmaking/page.tsx:96-97`) und bietet "Team gründen" statt "Frag deinen Team-Admin" an, obwohl der Spieler schon Mitglied ist. Das Formular `QueueForm` wird nicht gezeigt. Gemessen: Karte "Nur Team-Admins ..." als letzte Karte (Playwright). | spieler_mobil_extra_matchmaking-ende.png | clarify
- SM-MA-2 | P2 | "Offene Suchen (0)" und "Filtern" sind Funktion für alle; der Spieler kann Lobbys ansehen, aber nicht annehmen. "Annehmen"-Knöpfe sind für Nicht-Admins nicht vorhanden (Quelltext `OpenSearches.tsx`, `mine`-Liste leer), ohne Erklärung. | spieler_mobil_matchmaking.png | clarify

---

#### /mitspieler
Beleg: spieler_mobil_mitspieler.png
Bewertung: Die für Spieler wichtigste Seite dieser Gruppe: Er kann sich selbst eintragen ("Ich suche ein Spiel"), das Formular ist kurz und klar. Der Einleitungssatz "Fehlt dir jemand? Frag ihn an." richtet sich aber an Captains, und die Seite hat keinen Reiter.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 4, 6, Personas Casey/Jordan] (manuell) | Funde: Einleitung für zwei Rollen in einem Satz (SM-MI-1), kein Reiter aktiv (SM-GL-1) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 8 von 40 Ziele unter 44 px, Höhe 921 px] (manuell) | Funde: native Datumsfeld "dd.mm.yyyy" ohne Vorgabe, Filter-Select und Button |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: Eintragen-Formular und Filter untereinander gleichwertig; Formular zuerst richtig |
| clarify [Teil: Audit the language, Forms, Empty states] (manuell) | Funde: "Gerade hat sich niemand eingetragen." ohne Hinweis, wer das sieht; Wirkung des Eintrags (wer sieht ihn, wie lange) nicht erklärt (SM-MI-2) |
| adapt [Teil: Mobile Adaptation Layout, Touch, Forms (Datum)] (manuell) | Funde: Datum/Stadt in Zwei-Spalten-Raster, Felder 44 px, ok |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | nur overused-font (nicht gewertet); Quelltext `src/app/mitspieler`: `[]` |

Funde:
- SM-GL-1
- SM-MI-1 | P2 | "Fehlt dir jemand? Frag ihn an." (`mitspieler/page.tsx:23`) wendet sich an Captains; bei Spielern ist der Button "Anfragen" nicht da (`:61-63`, nur bei Admin-Teams) und es fehlt ein Hinweis, warum. Aus Quelltext. | spieler_mobil_mitspieler.png | clarify
- SM-MI-2 | P2 | Beim Eintragen fehlt eine Aussage zur Sichtbarkeit und Dauer ("Dein Name, Position und Stadt sind für Team-Admins sichtbar"); der Eintrag ist per `ClosePostButton` schließbar (Quelltext). | spieler_mobil_mitspieler.png | clarify
- SM-MI-3 | P2 | `/mitspieler` ist für Spieler die einzige Handlung ohne Rollenbezug, aber weder im Reiter noch in `/app` verlinkt; nur Fußzeile "Mitspieler gesucht". | spieler_mobil_mitspieler.png | critique

---

#### /einladung/demoinvitex1
Beleg: spieler_mobil_einladung-demoinvitex1.png (Klick: spieler_mobil_extra_einladung-nach-klick.png)
Bewertung: Klar und kurz ("Du wurdest eingeladen zu Demo Alpha", Button "Team beitreten"). Für einen Spieler, der schon Mitglied ist, falsch: die Seite erkennt das nicht, und der Klick führt ohne Meldung zur Teamseite.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 5, 9, Persona Jordan] (manuell) | Funde: Mitgliedschaft nicht erkannt (SM-EL-1), Reiter "Privatspiel" aktiv (SM-GL-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell; Button 44 px hoch, bricht nicht um) | Funde: nach Klick "Bitte warten..." ohne Fortschritt (Dev-Server langsam, Playwright 2 s) |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde (eine Handlung) |
| clarify [Teil: Audit the language, Success/Loading] (manuell) | Funde: Text sagt nicht, was beim Beitritt passiert (wer sieht ihn, Admin wird benachrichtigt); "5 Spieler im Kader" ohne Maximum |
| adapt [Teil: Mobile Navigation, Touch] (manuell) | Funde: Reiter "Privatspiel" fälschlich aktiv (GM-EL-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/demoinvitex1` | nur overused-font (nicht gewertet); Quelltext `src/app/einladung`: `[]` |

Funde:
- GM-EL-1 (Reiter "Privatspiel" aktiv), SM-GL-1
- SM-EL-1 | P1 | Der Spieler ist schon in Demo Alpha, die Seite zeigt trotzdem "Du wurdest eingeladen zu Demo Alpha" mit "Team beitreten". `joinWithInvite` erkennt den Fall (`teams.ts:123`, `alreadyMember: true`), `joinTeamAction` wirft das Flag weg und leitet ohne Meldung auf die Teamseite (`actions.ts:93-102`). Gemessen: nach dem Klick zeigt der Button "Bitte warten ...". Richtig wäre: "Du bist schon im Team" mit Link zur Teamseite. | spieler_mobil_extra_einladung-nach-klick.png | clarify
- SM-EL-2 | P2 | Beim vollen Team ("Dieses Team ist voll.") und anderen Fehlern erscheint ein roter Text unter dem Button (`JoinForm.tsx:9`), aber keine Alternative (anderes Team, Admin fragen). Aus Quelltext. | Quelltext | clarify

---

#### /einladung/ungueltig
Beleg: spieler_mobil_einladung-ungueltig.png
Bewertung: Klar, kurze Meldung "Link ungültig" mit Weg "Zur Startseite". Der Reiter "Privatspiel" ist auch hier aktiv.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 9 (Fehler), Persona Jordan] (manuell) | Funde: Grund fehlt, Weg nur Startseite (GM-EU-1), Reiter aktiv falsch (GM-EU-2, SM-GL-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde (Button 141x44 px) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] (manuell) | Funde: GM-EU-1; für angemeldeten Spieler ließe sich "zu deinen Teams" anbieten (SM-EU-1) |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: Fußzeile und Reiter auf Fehlerseite (wie GM-EL-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/ungueltig` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EU-1, GM-EU-2, GM-EL-3
- SM-EU-1 | P2 | Für angemeldete Nutzer bietet die Fehlerseite nur "Zur Startseite" (Gast-Startseite, SM-ST-1) statt "Zu Mein Bereich" oder "Meine Teams". | spieler_mobil_einladung-ungueltig.png | clarify
- Nicht geprüft: Zustand "Link abgelaufen" (kein Token im Seed).



### Fundblatt Spieler, Desktop

Rolle Spieler (angemeldet als Mitglied von Demo Alpha, kein Captain/Team-Admin, Dev-Login), Gerät Desktop 1280 x 800 mit Maus und Tastatur, Dev-Server Port 3102. Nur gelesen und gemessen, kein Quelltext geändert, kein Commit. Aussagen, die der Screenshot nicht zeigt (Zustände, Fehlertexte, leere Zustände), sind mit "aus Quelltext" gekennzeichnet.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl. Die fünf Reference-Dateien (`critique.md` in drei Abschnitten bis Zeile 819, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) sind vollständig gelesen. Je Durchgang steht in eckigen Klammern, welcher Teil angewandt wurde. Die Prüfung ist manuell und läuft nicht als Sub-Agent: critique ist damit degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab (PRODUCT.md geladen). `detect` lief je Seite über den Launcher mit `--json --viewport 1280x800`. `polish` war nicht nötig (nichts wird geändert).

Aufnahme- und Messhinweise:
- Alle 23 Screenshots `spieler_desktop_<seite>.png` sind einzeln angesehen. `/anmelden` und `/willkommen` sind byte-identisch mit `/app` (gleiche MD5-Summe, 1280 x 1166): der Befund ist die Weiterleitung auf `/app` ("angemeldet").
- Zusatzaufnahmen und Messungen (Playwright, Maus und Tastatur, 1280 x 800): `spieler_desktop_extra_kontomenue.png` (Konto-Menü offen), `spieler_desktop_extra_kontomenue-hover.png` (Hover im Menü), `spieler_desktop_extra_kopfleiste-640.png` (Kopfleiste bei 640 px, entspricht 200 % Zoom), `spieler_desktop_extra_einstellungen-konto-loeschen.png` (Konto löschen aufgeklappt, nicht abgesendet), `spieler_desktop_extra_einstellungen-profilfarbe.png` (Ausschnitt Profilfarbe), `spieler_desktop_extra_einladung-nach-klick.png` (Klick auf "Team beitreten").
- Gemessen (alle 23 Seiten, metrics-spieler.json und metrics2-spieler.json, dazu eigene Läufe): kein horizontaler Überlauf (auch nicht bei 640, 700, 768, 1024 px Breite), je Seite genau eine `h1`, keine Konsolenfehler, alle 200. Fokusring: auf allen geprüften Elementen 2 px solid in Akzentfarbe (globales `:focus-visible`, `globals.css:142`).
- `detect` gegen URLs sieht keine Sitzung: für `/anmelden`, `/willkommen` und alle `/app*`-Seiten liefert es die Gast-Anmeldeseite (nur `overused-font`, gewollt und nie gewertet). Für diese Seiten und alle übrigen lief zusätzlich `detect` gegen den Quelltext (`app`, `matchmaking`, `mitspieler`, `einladung`, `suche`, `spieler`, `teams`, `offline`, `hilfe`, `agb`, `datenschutz`, `kontakt`, `impressum`, `hausordnung`, `unter-16`, `page.tsx`, `Header.tsx`, `UserMenu.tsx`, `Footer.tsx`, `GameModes.tsx`, `HowItWorks.tsx`): jeweils `[]`, keine Funde. Die Kopfleiste (mit Betrag und Konto-Menü) sieht der URL-Lauf nur in der Gast-Variante.
- `detect` auf `/` und `/suche`: Timeout nach 30 s ("Navigation timeout of 30000 ms exceeded", Dauerverbindung), im zweiten Versuch wieder (Exit 1, Ausgabe `[]`). Vermerkt, keine Daten. Ersatz: Quelltext-Lauf, Playwright-Messung. Die früheren Funde X-14, X-15 bleiben maßgeblich.
- `detect` misst im Dunkelmodus (Platzhalter #89958f auf #24362d); der Screenshot-Stil ist hell (Mint). Der runde "N"-Knopf (Next-Dev-Overlay) ist kein Fund.
- Gemessene Spaltenbreite: `main` 768 px (max-w-3xl) mit 24 px Innenabstand, Inhalt 720 px zwischen x=280 und x=1000, je 280 px leer. Kopfleiste: Logo x=280, Konto-Menüknopf endet x=1000.

### Seitenübergreifende Desktop-Funde (hier einmal beschrieben, von den Seiten referenziert)

Vorhandene Funde X-07, X-12, X-14, X-17, GD-ALL-1 bis GD-ALL-8 (Gast, Desktop), SM-GL-1 bis SM-GL-6 (Spieler, Handy) gelten auch hier. Der Handy-Fund X-06 (untere Navigation) entfällt am Desktop.

- SD-ALL-1 | P1 | Guthaben in der Kopfleiste und im Konto-Menü auf jeder Seite (gemessen): Betragslink "0,00 €" (`header-wallet`, Ziel `/app/guthaben`, 64 x 20 px, `Header.tsx:53-55`, Betrag aus `walletBalance`, `:17`), im Konto-Menü der Eintrag "Guthaben 0,00 €" (`UserMenu.tsx:69-72`) und auf `/app` die Karte "Guthaben" (`page.tsx (app):53-59`): dreimal derselbe Betrag auf einem Bildschirm. Der Link nennt nur die Zahl; "Guthaben" steht nur als `title` (`Header.tsx:53`), ein Screenreader liest "0,00 Euro" ohne Bezug. Siehe MUSS WEG. | spieler_desktop_start.png, spieler_desktop_extra_kontomenue.png | critique/clarify
- SD-ALL-2 | P2 | Konto-Menü, Klick-Zustand (gemessen): Klick öffnet ein 240 x 336 px großes Menü rechtsbündig unter dem Knopf (x=760 bis 1000, y=54 bis 390), das den Seiteninhalt überdeckt (Karte "Turnier" teilweise verdeckt). Der Knopf bekommt aria-expanded=true und einen Akzentrand. Menü hat `role="menu"` mit `role="menuitem"` (`UserMenu.tsx:61-89`), aber: ArrowDown/ArrowUp bewegen den Fokus nicht (Fokus bleibt auf "Mein Profil"), nach Tab öffnet sich nichts neu, nach Escape landet der Fokus auf `body` statt auf dem Knopf (Fokus verloren), `aria-controls` fehlt. Außenklick und Escape schließen. Einträge 36 px hoch, Hover nur Hintergrund #e3eae5. Wer ARIA-Menü verspricht, muss Pfeiltasten und Fokusrückgabe liefern; sonst besser als Link-Liste ohne `role="menu"`. | spieler_desktop_extra_kontomenue.png, spieler_desktop_extra_kontomenue-hover.png | audit/adapt
- SD-ALL-3 | P2 | Konto-Menü, Inhalt am Desktop: Kopfzeile des Menüs zeigt den vollen Namen ("Alpha Spieler 1"), der Knopf nur den Vornamen ("Alpha", gleich dem Teamnamensbestandteil "Demo Alpha"). Sieben Einträge, kein Eintrag nennt Rolle (Spieler) oder Team. "Mein Profil", "Mein Bereich", "Konto und Einstellungen" benennen drei Ziele mit zwei Namen (ergänzt SM-GL-3); "Benachrichtigungen" und "Hilfe" doppeln Glocke und Fußzeile. | spieler_desktop_extra_kontomenue.png | distill
- SD-ALL-4 | P2 | Hover: Alle `.card`-Links (Spieler- und Teamzeilen, Guthaben-Karte, Schnellzugriff-Kacheln, Teamzeile auf `/app`) haben keinen Hover-Zustand. Im Quelltext steht `hover:border-accent` (`page.tsx (app):53,62-66,80,109`), aber die nicht in einer Ebene liegende Regel `.card` (`globals.css:100`) überschreibt die Tailwind-Utility; gemessen: Rand (#b3c2b9), Hintergrund und Schatten vor und nach Hover identisch, nur der Cursor wird zum Zeiger. Primärbutton: `filter: brightness(1.08)` (vorhanden, kaum sichtbar); Ghost-Button: Rand wechselt auf Akzent (vorhanden); Kopfleisten-Links: Grau #4a5a51 nach Tinte #12201a ohne Unterstrich. Ergänzt GD-ALL-6 (dort "kein Hover-Test an Listenzeilen"): jetzt gemessen und bestätigt. | spieler_desktop_spieler.png, spieler_desktop_app.png | adapt
- SD-ALL-5 | P2 | Kopfleiste ohne Ortsanzeige: kein `aria-current`, keine Markierung des aktuellen Eintrags (auf allen 21 gemessenen Seiten leer; z. B. "Offene Lobbys" auf `/suche`, "Rangliste" auf `/rangliste`). Die Kopfleiste ist am Desktop die einzige Ortsangabe (keine untere Leiste); Pendant zu SM-GL-1 (Handy). | spieler_desktop_suche.png | clarify
- SD-ALL-6 | P2 | Kopfleiste bei 200 % Zoom (640 px Fensterbreite, gemessen): "Offene Lobbys" bricht in zwei Zeilen und klebt am Logo (Elemente 98 + 93 + 81 + 78 + 44 + 64 + 95 px plus Abstände passen nicht in 592 px), die Leiste bleibt 57 px hoch, kein Überlauf (scrollWidth 640). Ab 700 px passt alles. Kleine Textlinks der Kopfleiste ("Offene Lobbys", "Livescore", "Rangliste", Betrag) sind nur 20 px hoch (`Header.tsx:27-33,53`, kein `min-h`). | spieler_desktop_extra_kopfleiste-640.png | adapt
- SD-ALL-7 | P2 | Tastatur (gemessen, Tab-Folge `/app`, `/`, `/spieler`, `/app/einstellungen`): Sieben Tab-Stopps liegen vor dem Seiteninhalt (Logo, drei Links, Glocke, Betrag, Konto-Menü), kein Sprunglink "Zum Inhalt" (`main` ohne `id`). Der erste Inhalts-Stopp ist auf `/app` "Lobby aufmachen" (Handlung, die der Spieler nicht ausführen darf, SM-GL-6) und auf `/` "Team gründen" (obwohl er schon im Team ist, SM-ST-1). Ergänzt GD-ALL-2 für den Spieler. | spieler_desktop_app.png | audit
- SD-ALL-8 | P2 | Überschriftengrößen und Kanten im Spielerbereich uneinheitlich (gemessen): `h1` 48 px (`/`), 30 px (Hilfe, AGB, Datenschutz, Impressum, Kontakt, Spieler, Teams, Matchmaking, Mitspieler, Einladung gültig), 24 px (`/app`, `/suche`, `/app/einstellungen`, `/app/benachrichtigungen`, `/app/guthaben`, `/app/suche/neu`, `/unter-16`, `/offline`, `/einladung/ungueltig`). Linke Kante x=280 (Standard), 416 (`/app/suche/neu`, `/unter-16`), 448 (`/offline`, `/einladung/*`). Dazu Seitentitel und Überschrift verschieden: Tab "Mein Bereich", `h1` "Hey Alpha", Menü "Mein Bereich", Reiter "Profil" (SM-GL-1). Ergänzt GD-ALL-5 um die Spieler-Seiten. | spieler_desktop_app.png, spieler_desktop_app-suche-neu.png | critique
- SD-ALL-9 | P2 | Kurze Seiten (GD-ALL-3) auch für den Spieler, gemessene Fußzeilenposition: `/app/benachrichtigungen` y=203, `/offline` 277, `/einladung/ungueltig` 285, `/einladung/demoinvitex1` 301, `/unter-16` 317, `/app/suche/neu` 351, `/teams` 410, `/impressum` 447, `/kontakt` 501, `/hausordnung` 527, `/mitspieler` 568. Darunter bleiben bis 600 px leer, die Seite wirkt abgebrochen. | spieler_desktop_app-benachrichtigungen.png | adapt

---

#### /
Beleg: spieler_desktop_start.png
Bewertung: Auch angemeldet zeigt die Startseite den Einsteiger-Hero (Foto, Logo doppelt, "Team gründen" als einzige Primärhandlung) und die Erklärung "So funktioniert Socaz"; die 720-px-Spalte lässt rechts und links je 280 px leer, und der erste Bildschirm endet mitten in "Was möchtest du spielen?". Der Spieler sieht nichts Eigenes (keine Spiele, kein Team), dafür oben in der Kopfleiste Glocke, Betrag "0,00 €" und Namensknopf.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Jordan, Casey, Sam (Tastatur)] (manuell) | Funde: Einsteiger-Hero für Angemeldeten (SM-ST-1), vier Hero-Buttons plus fünf Karten-Buttons (X-02, X-03), Hero-Buttons brechen 3+1 mit "Livescore" allein (GD-ST-1), Einstiege mehrfach (GM-ST-2), Rolle: "Der Captain öffnet eine Lobby" (SM-ST-2) |
| audit [Teil: Dimension 1 A11y (Fokus, Tastatur, Kontrast), 4 Responsive (Zielgrößen, kein Überlauf), 5 Integrität; Hero-Video gestreift] (metrics: kein Überlauf, 1 h1, Höhe 1896) | Funde: Betragslink mit nur `title` (SD-ALL-1), 7 Tab-Stopps vor dem Inhalt (SD-ALL-7), Video ohne Pause (GM-ST-8), Text auf Foto (X-19), Fokusring vorhanden (positiv) |
| distill [Teil: Assess Current State, Information Architecture, Layout Simplification, Content Simplification] (manuell) | Funde: Karten und Hero doppeln dieselben Ziele (X-03), Logo doppelt (GM-ST-7), Zahlenkacheln "2 / 10 / 0" (GM-ST-9), Preiskarte mit 103 Zeichen je Zeile (GD-ALL-7) |
| clarify [Teil: Audit the language, Message hierarchy, Actions] (manuell) | Funde: "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete" und "Du lädst dein Guthaben auf" (X-05, GM-ST-1, MUSS WEG); für den Spieler "Team gründen" statt "Meine Spiele" (SM-ST-1) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content, Max-Width), Navigation] (manuell) | Funde: Spalte 720 px, Kopfleiste ohne Teamspiel/Privatspiel/Turniere/Hilfe (X-17, GD-ALL-1), Karten-Buttons ohne gemeinsame Grundlinie (GD-ST-2), Hover nur Randfarbe (SD-ALL-4) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Timeout nach 30 s (zweimal); Quelltext-Lauf `page.tsx`, `GameModes.tsx`, `HowItWorks.tsx`, `Header.tsx`: `[]`. Frühere Funde X-14, X-15 bleiben |

Funde:
- X-02, X-03, X-05, X-14, X-15, X-17, X-19, GM-ST-1, GM-ST-2, GM-ST-7, GM-ST-8, GM-ST-9, GD-ST-1, GD-ST-2, GD-ST-3, GD-ALL-1, SM-ST-1, SM-ST-2, SM-GL-6 (gelten unverändert)
- SD-ALL-1, SD-ALL-2, SD-ALL-3, SD-ALL-4, SD-ALL-7 (Kopfleiste und Menü, oben beschrieben)
- SD-ST-1 | P1 | Desktop-Beleg zu SM-ST-1: Hero (502 px hoch, 63 % des 800-px-Fensters) bietet dem Spieler als einzige farbige Handlung "Team gründen" (erster Inhalts-Tab-Stopp, y=446), obwohl er in Demo Alpha ist. Im selben Bildschirm fehlt jeder Hinweis auf eigene Spiele oder das eigene Team; "Offene Lobbys" (leer) liegt erst bei y=1620. Ein Link zu "Mein Bereich" erscheint nur im Konto-Menü. | spieler_desktop_start.png | critique/distill

---

#### /hilfe
Beleg: spieler_desktop_hilfe.png
Bewertung: Aufklappliste mit 19 Fragen in fünf Gruppen, sauber, aber als 1976 px lange Einspaltenliste (aufgeklappt 3524 px); im ersten Bildschirm stehen 6 Fragen. Für den Spieler sind die Antworten überwiegend an Team-Admins gerichtet, und der Block "Geld und Guthaben" beschreibt das Altmodell.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1-10 (besonders 10 Hilfe), Personas Jordan, Alex, Sam] (manuell) | Funde: Antworten sprechen Team-Admin/Captain an, keine Frage "Was darf ich als Spieler?" (SM-HI-1), Begriffsmix (GM-HI-3), keine Suche (GM-HI-4) |
| audit [Teil: Dimension 1 A11y (Zusammenfassungen per Tastatur, Fokus), 4 Responsive, 5 Integrität] (13 von 35 Zielen unter 44 px, kein Überlauf; aufgeklappt gemessen: 29 Absätze/Listenpunkte, bis 114 Zeichen je Zeile bei 14 px) | Funde: 19 `summary`-Elemente tastaturbedienbar, Fokusring vorhanden (positiv); Zeilenlänge aufgeklappt 114 Zeichen (SD-HI-1) |
| distill [Teil: Information Architecture (Progressive Disclosure), Layout Simplification] (manuell) | Funde: zwei Spalten oder Inhaltsübersicht links statt 19 Zeilen untereinander (GD-HI-1) |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: Abschnitt "Geld und Guthaben" Altmodell (GM-HI-1, MUSS WEG), "Unter Guthaben (oben in der Leiste ...)" (GM-HI-2: für den Spieler am Desktop zufällig richtig, weil die Leiste den Betrag zeigt; fällt mit SD-ALL-1 weg), Rollenbegriffe (SM-GL-5) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction: Tastatur, Content), Navigation] (manuell) | Funde: Hilfe in der Kopfleiste nicht verlinkt, nur im Konto-Menü und der Fußzeile (GD-ALL-1, SD-ALL-3); keine Suche für 19 Einträge (GD-HI-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hilfe` | nur overused-font (gewollt); Fragen zugeklappt, daher keine Zeilenlänge (gemessen siehe SD-HI-1) |

Funde:
- GM-HI-1, GM-HI-2, GM-HI-3, GM-HI-4, GD-HI-1, GD-ALL-7, SM-HI-1, SM-GL-5 (gelten unverändert; Altmodell siehe MUSS WEG)
- SD-HI-1 | P2 | Aufgeklappt (alle 19 offen, gemessen) wächst die Seite auf 3524 px; Antworttext 14 px grau auf 686 bis 720 px Breite mit bis zu 114 Zeichen je Zeile (Vorgabe unter 80). Die Hilfe-Antworten zu Einladung, Gegnersuche, Ersatzspieler, Ergebnis ("Ein Team-Admin erfasst Tore", `page.tsx (hilfe):71`) richten sich an Team-Admins; der Spieler findet nicht, was er selbst tun kann (z. B. Mitspieler-Eintrag, Anmeldung zum Spiel). Ergänzt GD-ALL-7 und SM-HI-1. | spieler_desktop_hilfe.png | distill/clarify

---

#### /agb
Beleg: spieler_desktop_agb.png
Bewertung: Lesbarer, nummerierter Rechtstext mit "Entwurf"-Kasten und Altmodell-Aussagen (Guthaben, kostenlos abmelden); die Absätze laufen über 720 px mit 103 bis 110 Zeichen je Zeile. Für einen angemeldeten Spieler, der den Text als verbindlich liest, wirkt der Entwurfsvermerk störend.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan, Sam] (manuell) | Funde: Entwurfshinweis (GM-AG-1), dichter §3 (GM-AG-3) |
| audit [Teil: Dimension 1 A11y (Kontrast, Überschriftenfolge), 4 Responsive, 5 Integrität] (metrics: kein Überlauf, 1 h1, Höhe 1020) | Funde: line-length 106 bis 110 Zeichen in vier Absätzen (X-14, GD-ALL-7); Überschriftenfolge h1, h2 sauber |
| distill [Teil: Content Simplification, Layout Simplification] (manuell) | Funde: Spalte auf etwa 65ch (ca. 560 px) begrenzen würde Zeilenlänge lösen (GD-ALL-7); sonst keine |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: Altmodell in §1, §3, §4 (GM-AG-2, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content, Max-Width)] (manuell) | Funde: Zeilenlänge (X-14); keine neuen |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/agb` | 4 x line-length (106, 109, 110, 108 Zeichen); overused-font nicht gewertet |

Funde:
- X-14, GM-AG-1, GM-AG-2, GM-AG-3, GD-ALL-7 (gelten unverändert)

---

#### /datenschutz
Beleg: spieler_desktop_datenschutz.png
Bewertung: Neun gut gegliederte Abschnitte mit Entwurfskasten, Platzhalter beim Verantwortlichen und Guthaben-Bezug; Zeilen 103 bis 109 Zeichen. Für den Spieler funktioniert der Link "Einstellungen" im Abschnitt "Deine Rechte" (Ziel `/app/einstellungen`).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan, Sam] (manuell) | Funde: Platzhalter Verantwortlicher (GM-DS-1), Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 1404, kein Überlauf) | Funde: line-length (GD-ALL-7), Einzelwörter (GD-DS-1); Link "Einstellungen" trägt für Angemeldete (positiv, GM-DS-3 gilt nur für Gäste) |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | keine neuen Funde (neun Abschnitte, am Desktop kurz genug) |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: "Die Betreiberangaben werden vor dem Start eingetragen" (GM-DS-1); "Zahlungen: Guthaben, Buchungen, Belege" (GM-DS-2, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content, Max-Width)] (manuell) | Funde: Zeilenlänge 103 bis 109 Zeichen (GD-ALL-7) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/datenschutz` | 6 x line-length (103 bis 109 Zeichen), 2 x straggler ("Bewertungen.", "Cookie-Banner."); overused-font nicht gewertet |

Funde:
- GM-DS-1, GM-DS-2, GD-DS-1, GD-ALL-7, GM-AG-1 (gelten unverändert)

---

#### /impressum
Beleg: spieler_desktop_impressum.png
Bewertung: Kurz und lesbar, zeigt aber Konfigurationsnamen (OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_EMAIL) in dunklerer, größerer Schrift als den Rest, dazu den Entwurfskasten. Als Pflichtseite so nicht zeigbar; die Fußzeile steht bei y=447, darunter 350 px leer.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 2 (Match zur Realität), Heuristik 9] (manuell) | Funde: Konfigurationsnamen sichtbar (GM-IM-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 800, kein Überlauf) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: GM-IM-1 |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: leere Fläche unter der Fußzeile (SD-ALL-9, GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/impressum` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-IM-1, GM-AG-1, GD-ALL-3, SD-ALL-9 (gelten unverändert)

---

#### /hausordnung
Beleg: spieler_desktop_hausordnung.png
Bewertung: Kurz und gegliedert (Fair bleiben, Inhalte melden, Folgen). Ein Satz bezieht sich auf Guthaben; für Spieler inhaltlich relevant (Fehlen, Melden, Sperre).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Persona Jordan] (manuell) | keine Funde (Entwurf: GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: "offenes Guthaben und Reservierungen" (GM-HO-1, SM-HO-1, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: Einzelwörter (GD-HO-1), leere Fläche unter Fußzeile (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hausordnung` | 2 x straggler ("Bewertungen." 14 %, "aus." 4 %); overused-font nicht gewertet |

Funde:
- GM-HO-1, SM-HO-1, GD-HO-1, GM-AG-1, GD-ALL-3 (gelten unverändert)

---

#### /kontakt
Beleg: spieler_desktop_kontakt.png
Bewertung: Zwei Karten, aber ohne gültige Kontaktadresse (Platzhaltertext mit Konfigurationsname, dunkler und größer als der Rest) und mit einem Altmodell-Punkt ("Auszahlung deines Guthabens"). Für den Spieler ist dies der einzige Weg bei Sperre oder Ergebnisstreit; er führt derzeit ins Leere.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 9, 10, Personas Jordan, Sam] (manuell) | Funde: kein Kontaktweg (GM-KO-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Actions] (manuell) | Funde: "Die Kontaktadresse wird noch eingetragen (Einstellung OPERATOR_EMAIL)." (GM-KO-1); "Auszahlung deines Guthabens" (GM-KO-2, SM-KO-1, MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: nur Mailto statt Formular (GM-KO-3), Fußzeile y=501, darunter leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-KO-1, GM-KO-2, GM-KO-3, SM-KO-1, SD-ALL-9 (gelten unverändert)

---

#### /unter-16
Beleg: spieler_desktop_unter-16.png
Bewertung: Kurze, zentrierte Meldung (400 px Spalte, `h1` 24 px) mit einem Weg zurück. Das Bild zeigt für den angemeldeten Spieler den Widerspruch: Die Kopfleiste zeigt "Alpha" angemeldet mit Betrag, der Text sagt "Du kannst noch kein Konto anlegen. Dein Konto wurde wieder gelöscht".

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1 (Systemstatus), 2, Persona Jordan, Riley] (manuell) | Funde: Text unabhängig von Sitzung, mit Sitzung widersprüchlich (SM-U1-1, SD-U1-1); Sackgasse (GM-U16-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 800) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors and permissions] (manuell) | Funde: "Dein Konto wurde wieder gelöscht" ohne Folge und Ausweg (GM-U16-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: zentriert und 24 px, andere Kante als 30-px-Seiten (SD-ALL-8, GD-ALL-5); Fußzeile y=317 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/unter-16` | straggler "gespeichert." (24 %); overused-font nicht gewertet |

Funde:
- GM-U16-1, SM-U1-1, GD-U1-1, GD-ALL-5, SD-ALL-8, SD-ALL-9 (gelten unverändert)
- SD-U1-1 | P2 | Beleg zu SM-U1-1 am Desktop: Die Seite ist ohne Sitzungsprüfung gebaut (aus Quelltext `page.tsx (unter-16):11`); mit Sitzung zeigt die Kopfleiste Name und Betrag über dem Satz "Dein Konto wurde wieder gelöscht". Praktisch nur über die Zurück-Taste erreichbar. | spieler_desktop_unter-16.png | clarify

---

#### /anmelden
Beleg: spieler_desktop_anmelden.png (zeigt `/app`, byte-identisch, Weiterleitung)
Bewertung: Für den angemeldeten Spieler ist `/anmelden` nur eine Weiterleitung auf "Mein Bereich", ohne Meldung. Gewollt, aber wer einen Link "Anmelden" (z. B. aus einer E-Mail) öffnet, landet ohne Erklärung im Bereich.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Kognitive-Last-Checkliste, Heuristik 1 Systemstatus und 3 Kontrolle, Persona Jordan] (manuell) | Funde: Weiterleitung ohne Rückmeldung (SM-AN-1) |
| audit [Teil: Dimension 1 A11y (Landmarken, Überschrift), 4 Responsive] (Endseite `/app`: kein Überlauf, 1 h1) | keine neuen Funde |
| distill [Teil: Information Architecture, Clear next action] (manuell) | keine Funde (eine Weiterleitung) |
| clarify [Teil: Audit the language, Errors and permissions] (manuell) | Funde: kein Satz zum Grund (SM-AN-1) |
| adapt [Teil: Desktop Adaptation Layout und Navigation] (manuell) | keine neuen Funde; Befunde der Zielseite siehe `/app` |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/anmelden` (Gast-Sicht) + Quelltext `anmelden` | nur overused-font; Quelltext `[]` |

Funde:
- SM-AN-1, X-12 (gelten unverändert; Zielseite siehe `/app`)

---

#### /willkommen
Beleg: spieler_desktop_willkommen.png (zeigt `/app`, byte-identisch, Weiterleitung)
Bewertung: Ein Spieler, der das Onboarding abgeschlossen hat, wird sofort auf `/app` geleitet; das Onboarding-Formular selbst war nicht prüfbar (braucht eine Sitzung ohne `onboardedAt`).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Heuristik 1 Systemstatus und 3 Kontrolle, Persona Jordan] (manuell) | keine Funde (Weiterleitung folgt dem Status) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (Endseite wie `/app`) | keine neuen Funde |
| distill [Teil: Information Architecture] (manuell) | keine Funde |
| clarify [Teil: Audit the language] (manuell) | keine Funde |
| adapt [Teil: Desktop Adaptation Layout] (manuell) | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/willkommen` (Gast-Sicht) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- keine neuen; Nicht prüfbar: Onboarding-Formular (Sitzung ohne `onboardedAt`)

---

#### /suche
Beleg: spieler_desktop_suche.png
Bewertung: Am Desktop passt die Filtermaske als 3 x 2-Raster in einen Bildschirm; davor stehen Titel (24 px) mit winziger roter "Live"-Marke, ein Satz und ein Primärbutton "Lobby aufmachen", darunter ein vollbreiter zweiter Primärbutton "Filtern". Der Spieler sieht "Lobby aufmachen" als erste Handlung, die er ohne Team-Admin-Recht nicht ausführen kann; die Liste ist im Seed leer.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (6 Felder, 2 Primärbuttons), Heuristiken 1-10, Personas Jordan, Alex, Riley] (manuell) | Funde: Filter vor Inhalt (X-10), zwei Primärbuttons konkurrieren (GD-SU-1), "anderer Teams" (GM-SU-1), "Live" mehrdeutig (GM-SU-2), Rolle: Button und Leerzustand für Captains (SM-SU-1) |
| audit [Teil: Dimension 1 A11y (Tastatur, Fokus, Beschriftungen), 4 Responsive, 5 Integrität] (metrics: kein Überlauf, Höhe 800) | Funde: "Lobby aufmachen" nur 36 px hoch (GM-SU-4); alle Felder beschriftet, Fokusring vorhanden (positiv); Datumsfeld nativ "dd.mm.yyyy" ohne Vorgabe |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: für den Spieler reichen Stadt und Datum, vier weitere Filter sind nachrangig (GM-SU-3) |
| clarify [Teil: Audit the language, Empty states, Actions] (manuell) | Funde: "Mach eine Lobby für dein Team auf" (GM-SU-6, SM-SU-1), "Stärke ab / bis" (GM-SU-5) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content), Navigation] (manuell) | Funde: Kopfleiste markiert "Offene Lobbys" nicht (SD-ALL-5), `h1` 24 px (SD-ALL-8), Fußzeile y=541 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Timeout nach 30 s (zweimal); Quelltext `suche`: `[]`. Frühere Funde (X-10) bleiben |

Funde:
- X-10, GM-SU-1 bis GM-SU-6, GD-SU-1, SM-SU-1, SD-ALL-5, SD-ALL-8 (gelten unverändert)

---

#### /spieler
Beleg: spieler_desktop_spieler.png
Bewertung: Am Desktop funktioniert die Suchzeile (Feld, Stadt, Button) und die Liste ist lesbar: zehn Zeilen à 78 px mit Name, Stadt, Position und rechts "0 Spiele · 0 Tore". Die Liste ist monoton (keine Avatare, keine Teamfarben), reagiert nicht auf Hover und markiert die eigene Karte ("Alpha Spieler 1") nicht.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 4, 6, Personas Jordan, Casey] (manuell) | Funde: eigene Karte nicht markiert (SM-SP-1, gemessen: kein "Du" im Text), Karten nicht unterscheidbar (GM-SP-1) |
| audit [Teil: Dimension 1 A11y (Kontrast, Tastatur), 4 Responsive] (metrics: kein Überlauf, 1 h1) | Funde: Platzhalter "Name suchen" 4,1:1 (X-16); jede Zeile ein Link (`/spieler/<id>`), Tab-Stopp je Zeile (gemessen), Fokusring vorhanden |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: "0 Spiele · 0 Tore" als Rauschen (GM-SP-1) |
| clarify [Teil: Audit the language] (manuell) | Funde: Datenschutz-Hinweis "nur öffentliche Profile" fehlt (GM-SP-2) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction: Hover, Content)] (manuell) | Funde: kein Hover-Zustand an den Zeilen (SD-ALL-4), Statistik 600 px vom Namen entfernt (GD-ALL-8), 10 Zeilen untereinander in einer Spalte |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | low-contrast: Platzhalter "Name suchen" 4,1:1 (#89958f auf #24362d, Dunkelmodus); Quelltext `spieler`: `[]` |

Funde:
- X-16, GM-SP-1, GM-SP-2, SM-SP-1, GD-ALL-6, GD-ALL-8, SD-ALL-4 (gelten unverändert)

---

#### /teams
Beleg: spieler_desktop_teams.png
Bewertung: Zwei Teams in klaren Zeilen, Suchzeile am Desktop in Ordnung, die Seite ist fast leer (Fußzeile y=410). Der Satz "Schau dir Kader und Bilanz an und fordere sie heraus" lockt zu einer Handlung, die ein Spieler ohne Captain-Rolle nicht ausführen darf; das eigene Team "Demo Alpha" ist unmarkiert.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 2, Personas Jordan, Casey] (manuell) | Funde: "fordere sie heraus" ohne Berechtigung (SD-TE-1), eigenes Team unmarkiert (SM-TE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (metrics: Höhe 800, kein Überlauf) | Funde: Platzhalter "Teamname" 4,1:1 (X-16); tote Fallunterscheidung `members === 1 ? "Spieler" : "Spieler"` (GM-TE-2, aus Quelltext) |
| distill [Teil: Content Simplification] (manuell) | keine neuen Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: "noch ohne Spiel" statt Stärke/Elo (GM-TE-1) |
| adapt [Teil: Desktop Adaptation (Layout, Hover, Content)] (manuell) | Funde: kein Hover an Zeilen (SD-ALL-4), Fußzeile y=410, darunter leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | low-contrast: Platzhalter "Teamname" 4,1:1; Quelltext `teams`: `[]` |

Funde:
- X-16, GM-TE-1, GM-TE-2, SM-TE-1, SD-ALL-4, SD-ALL-9 (gelten unverändert)
- SD-TE-1 | P2 | "Schau dir Kader und Bilanz an und fordere sie heraus" steht für alle gleich; herausfordern darf nur ein Team-Admin. Der Spieler sieht keinen Hinweis, wer das in seinem Team ist (die Rolle steht erst auf der Teamseite, bei "Demo Admin A"). Ergänzt GM-TE-1. | spieler_desktop_teams.png | clarify

---

#### /offline
Beleg: spieler_desktop_offline.png
Bewertung: Kurze, ehrliche Meldung, zentriert und ohne Handlung, mit voller Kopfleiste (inkl. Betrag und Konto-Menü) und Fußzeile, die ohne Netz alle ins Leere führen; die Seite endet bei y=420.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 9, Persona Riley] (manuell) | Funde: keine Handlung (SM-OF-1, GM-OF-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 800) | keine neuen Funde |
| distill [Teil: Information Architecture] (manuell) | Funde: volle Navigation ohne Netz (GM-OF-2) |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: Meldung gut, "geht es weiter" ohne Knopf (GM-OF-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: `h1` 24 px zentriert auf x=448 (SD-ALL-8), Fußzeile y=277, darunter 520 px leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/offline` | nur overused-font (nicht gewertet); Quelltext `offline`: `[]` |

Funde:
- GM-OF-1, GM-OF-2, SM-OF-1, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

#### /app
Beleg: spieler_desktop_app.png
Bewertung: Die Seite zeigt dem Spieler dieselben Karten wie dem Captain; die erste und dreifach vorhandene Handlung ist "Lobby aufmachen" (Karte, Kachel, Fußzeile), die er nicht ausführen darf, danach "Guthaben" mit "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos". "Meine Spiele" beginnt erst bei y=738 und "Meine Teams" bei y=865: im 800-px-Fenster ist vom Eigenen fast nichts sichtbar. Die Teamzeile zeigt die Rolle nur als graues 12-px-"Spieler" am rechten Rand.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Chunking, Minimal choices: vier Primärbuttons plus fünf Kacheln), Heuristiken 1-10, Personas Jordan, Casey, Alex] (manuell) | Funde: Rolle: Karte "Teamspiel" mit "Der Captain öffnet eine Lobby" und Primärbutton (X-20, SM-GL-6, SD-AP-1); Eigenes nach unten geschoben (SM-AP-1, SD-AP-2); vier Primärbuttons gleichzeitig (SD-AP-3); fünf gleich aussehende Kacheln (X-04) |
| audit [Teil: Dimension 1 A11y (Tastatur, Fokus, Zielgrößen), 4 Responsive, 5 Integrität] (metrics: kein Überlauf, Höhe 1166; Tab-Folge gemessen: erster Inhaltsstopp "Lobby aufmachen") | Funde: "Team gründen" 146 x 36 px, "Offene Lobbys ansehen" 198 x 50 px (zweizeilig statt 44 px, GD-ST-2); Test-ID `wallet-card` und `team-color-dot` vorhanden; Fokusring vorhanden |
| distill [Teil: Assess Current State, Information Architecture (ein primäres Ziel), Layout Simplification] (manuell) | Funde: Handlungen doppelt (Karten und Kacheln, X-04), Guthaben-Karte entfällt mit Vertrag 012 (X-05), Meine Spiele vor die Karten (SM-AP-1) |
| clarify [Teil: Audit the language, Empty states, Actions] (manuell) | Funde: "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" (X-05, MUSS WEG); Leerzustand "Suche einen Gegner oder nimm eine Spielsuche an" für Spieler nicht ausführbar (SM-AP-3, aus Quelltext `page.tsx (app):72`); "Team-Admin" und "Captain" (SM-GL-5) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content, Max-Width), Navigation] (manuell) | Funde: 3-Spalten-Raster mit Lücke 235 px in der zweiten Kachelreihe (X-04, SD-AP-4), Hover ohne Wirkung (SD-ALL-4), Spalte 720 px (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` (sieht Gast-Anmeldeseite) + Quelltext `app`, `GameModes.tsx` | nur overused-font; Quelltext `[]` |

Funde:
- X-04, X-05, X-17, X-18, X-20, SM-GL-5, SM-GL-6, SM-AP-1, SM-AP-2, SM-AP-3, SM-AP-4, SD-ALL-1, SD-ALL-4, SD-ALL-7, SD-ALL-8 (gelten unverändert)
- SD-AP-1 | P1 | Desktop-Beleg zu X-20/SM-GL-6 (gemessen): Erster Inhalts-Tab-Stopp nach der Kopfleiste ist der Primärbutton "Lobby aufmachen" (Karte, 198 x 44 px, y=344, Ziel `/matchmaking`); zusätzlich Kachel "Lobby aufmachen" (235 x 54 px) und Fußzeilenlink. Auf `/matchmaking` steht für den Spieler nur der Hinweis "Nur Team-Admins können nach Gegnern suchen" (SM-MA-1). Auch "Offene Lobbys ansehen" (die einzige Handlung, die ihm hier zusteht) ist nur ein Ghost-Button. | spieler_desktop_app.png | critique/clarify
- SD-AP-2 | P1 | Desktop-Beleg zu SM-AP-1: Im 1280 x 800-Fenster endet der sichtbare Bereich bei "Meine Spiele" (Überschrift y=738, Leerzustand y=766 bis 822); "Meine Teams" mit der eigenen Teamzeile liegt bei y=865 bis 973, also unter dem Falz. Auf dem Desktop ist die obere Hälfte (y=190 bis 700) Karten, Guthaben-Karte und Kacheln, die für den Spieler weder Neues noch Eigenes enthalten. Ein "Nächstes Spiel" gibt es nur, wenn Spiele existieren (aus Quelltext, `MyGames`, Seed leer, SM-AP-4). | spieler_desktop_app.png | distill
- SD-AP-3 | P2 | Vier Primärbuttons zugleich im ersten Bildschirm (Lobby aufmachen, Privatspiel anlegen, Turniere ansehen, Team gründen weiter unten) plus fünf Ghost-Kacheln; Primärfarbe verliert ihre Signalwirkung, keine Handlung ist als Hauptweg erkennbar. Ergänzt X-04 und GD-ST-2 (Buttons der drei Karten ohne gemeinsame Grundlinie: y=344/396, 402, 350/402). | spieler_desktop_app.png | distill
- SD-AP-4 | P2 | Schnellzugriff: 5 Kacheln in 3 Spalten ergeben eine zweite Reihe mit zwei Kacheln und 235 px Lücke rechts (x=765 bis 1000, y=647 bis 701); Kacheln 54 px hoch, nur Text, ohne Symbol, gleiche Gewichtung für "Hilfe" und "Mein Profil". Ergänzt X-04. | spieler_desktop_app.png | adapt
- SD-AP-5 | P2 | "Meine Teams": Primärbutton "Team gründen" (146 x 36 px, `page.tsx (app):99`) steht groß neben der Überschrift, die Teamzeile selbst zeigt vor dem Namen den schwarzen Punkt (X-18) und rechts 600 px entfernt das graue 12-px-Wort "Spieler". Dass ein Spieler im Team keine Lobby öffnen kann, steht nirgends an dieser Stelle. | spieler_desktop_app.png | clarify

---

#### /app/suche/neu
Beleg: spieler_desktop_app-suche-neu.png
Bewertung: Für den Spieler nur eine Sackgasse: "Du brauchst ein Team, bei dem du Team-Admin bist." mit einem Primärbutton "Team gründen", obwohl er Teammitglied ist. Der Block sitzt in einer 448-px-Spalte (x=416 bis 864), die weder mit dem Logo (x=280) noch mit der Fußzeile fluchtet.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 3 (Kontrolle), 9 (Fehler), Personas Jordan] (manuell) | Funde: Spieler wird zu "Team gründen" geleitet statt zum Team-Admin zu fragen (SM-SN-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (metrics: Höhe 800, kein Überlauf) | keine neuen Funde (Link "Matchmaking" im Text, Fokusring vorhanden) |
| distill [Teil: Information Architecture, Clear next action] (manuell) | Funde: ein Satz, ein Button; der eigentliche Formularzustand (sieben Felder, X-11) ist für den Spieler nie sichtbar |
| clarify [Teil: Audit the language, Errors and permissions] (manuell) | Funde: Berechtigungsfehler als Aufforderung zum Gründen formuliert (SM-SN-1); "Team-Admin" statt "Captain" (SM-GL-5) |
| adapt [Teil: Desktop Adaptation (Layout, Content, Max-Width)] (manuell) | Funde: Spaltenbreite 448 px, `h1` bei x=416 (SD-SN-1); Fußzeile y=351, darunter leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` (sieht Gast-Anmeldeseite) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- X-11, SM-SN-1, SM-GL-5, SD-ALL-8, SD-ALL-9 (gelten unverändert)
- SD-SN-1 | P2 | Dritte Spaltenbreite im Bereich: 448 px (`max-w-md`, zentriert), `h1` "Spiel mit festem Termin suchen" 24 px bei x=416, während `/app` und `/matchmaking` bei x=280 beginnen. Die Seite wirkt wie ein eingerückter Fremdkörper; beim Wechsel zwischen `/app` und dieser Seite springt die linke Kante um 136 px. | spieler_desktop_app-suche-neu.png | adapt

---

#### /app/einstellungen
Beleg: spieler_desktop_app-einstellungen.png
Bewertung: 1967 px lange Einspaltenseite mit zwei getrennten Formularen (Profil, Benachrichtigungen) und mehreren vollbreiten Buttons (686 bis 720 px). Fachlich vollständig (Profil, Kanäle, Datenexport, Konto löschen), am Desktop aber eine lange Handy-Spalte; der Spieler bekommt Admin-Benachrichtigungen angeboten, die ihn nicht betreffen.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Chunking, Working memory: 11 Checkboxen), Heuristiken 3, 5, 9, Personas Jordan, Sam] (manuell) | Funde: Admin-Benachrichtigung für Spieler (SM-ES-1), mehrere Speichern-Buttons (X-08), Profilfarbe kaum sichtbar (SD-ES-1) |
| audit [Teil: Dimension 1 A11y (Beschriftungen, Zielgrößen), 4 Responsive, 5 Integrität] (metrics: Höhe 1967, kein Überlauf; gemessen: Checkboxen 20 x 20 px, Label-Zeilen 686 x 24 bzw. 20 px, Profilfarb-Schalter 28 x 28 px mit Namen "Grün" usw. als Titel) | Funde: Beschriftungen vorhanden (positiv); Checkboxen 20 px (unter 24 px, Zeile aber ganz anklickbar, SD-ES-2); Tab-Folge beginnt mit "Profilbild ändern" |
| distill [Teil: Information Architecture (Progressive Disclosure), Layout Simplification, Interaction Simplification] (manuell) | Funde: elf Checkboxen in einer Reihe, drei Aktionsgruppen in einer Spalte (X-08, SD-ES-2); am Desktop zwei Spalten oder Reiter denkbar |
| clarify [Teil: Audit the language, Forms, Errors and permissions] (manuell) | Funde: "Push ist auf diesem Server noch nicht eingerichtet" (Betreibertext, X-08); Konto löschen ohne Hinweis zum Guthaben, Hilfe widerspricht (SD-ES-3); "Zahlungen" in der Hinweiszeile (SM-ES-2) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content, Max-Width)] (manuell) | Funde: vollbreite Buttons 686 px (SD-ES-4), `h1` 24 px (SD-ALL-8), zwei Spalten für Name/Stadt/Position gut genutzt (positiv) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` (sieht Gast-Anmeldeseite) + Quelltext `einstellungen` | nur overused-font; Quelltext `[]` |

Funde:
- X-08, SM-ES-1, SM-ES-2, SM-ES-3, SD-ALL-8 (gelten unverändert)
- SD-ES-1 | P2 | Profilfarbe: Die gewählte Farbe (vorgewählt Grün) ist nur an einem 2 px dünnen hellen Ring erkennbar (gemessen: Rahmen 2 px, kein Schatten, kein Haken, kein Text); auf dem hellen Panel kaum zu sehen, Farbe nicht allein als Zustand tragen (Sam). Schalter sind 28 x 28 px mit Namen im `title`. | spieler_desktop_extra_einstellungen-profilfarbe.png | audit
- SD-ES-2 | P2 | Checkboxen 20 x 20 px (Profil-öffentlich 13 x 13 px nativ) mit zeilenbreiten Labels (686 x 20 bis 24 px, Zeilenabstand 28 px): Treffsicherheit per Maus gut, aber die Zeilen kleben (Abstand 4 bis 8 px). Elf Arten in einer Reihe ohne Gruppen (Spiel, Team, Admin); "Neue Aufgabe für Admins" und "Ersatzspieler wartet auf Zuweisung" betreffen den Spieler nicht (SM-ES-1). | spieler_desktop_app-einstellungen.png | distill
- SD-ES-3 | P2 | Konto löschen (aufgeklappt, nicht abgesendet, aus Beleg): Text "Gespielte Spiele und Buchungen bleiben ohne deinen Namen erhalten", Eingabe "LÖSCHEN", Button "Konto endgültig löschen"; kein Wort zu Guthaben, die Hilfe sagt aber "Vorher muss dein Guthaben auf null sein" (`page.tsx (hilfe):120`). Widerspruch zwischen Hilfe und Formular; fällt mit dem Kartenmodell weg. Der Aufklapp-Auslöser ist ein 12-px-Textlink ("Konto löschen", 720 x 20 px). | spieler_desktop_extra_einstellungen-konto-loeschen.png | clarify
- SD-ES-4 | P2 | Am Desktop sind "Profil speichern", "Speichern", "Konto endgültig löschen" je 686 px und "Alle meine Daten herunterladen (JSON)" 720 px breit (44 px hoch): vier Balken in derselben Gewichtung, der Primärbutton für ein einzelnes Formular ist so breit wie die Seite. Primärfarbe auf "Profil speichern" und "Speichern" gleichrangig, ohne Hinweis, dass es zwei getrennte Formulare sind (X-08). | spieler_desktop_app-einstellungen.png | adapt

---

#### /app/benachrichtigungen
Beleg: spieler_desktop_app-benachrichtigungen.png
Bewertung: Leerer Zustand "Noch keine Benachrichtigungen." in einer Karte, oben rechts ein Textlink "Einstellungen". Die Seite endet bei y=203, darunter 600 px leer. Aus Quelltext (Seed hat keine Einträge): gefüllte Liste und Fehlerzustand nicht angesehen.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 10, Personas Jordan, Riley] (manuell) | Funde: Leerzustand ohne Beispiel und Hinweis auf Einstellungen (SM-BE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (metrics: Höhe 800, kein Überlauf) | Funde: Glocke in der Kopfleiste mit `aria-label` "Benachrichtigungen" (positiv, 44 x 44 px); Textlink "Einstellungen" 20 px hoch |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Empty states] (manuell) | Funde: SM-BE-1; Art "Zahlungen und Guthaben" in `notification-types.ts:43` prüfen (aus Quelltext, siehe MUSS WEG) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: Fußzeile y=203, 600 px leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` (sieht Gast-Anmeldeseite) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- SM-BE-1, SD-ALL-9 (gelten unverändert)

---

#### /app/guthaben
Beleg: spieler_desktop_app-guthaben.png
Bewertung: Die ganze Seite beschreibt das Altmodell (Guthaben, Aufladen, Rabattcode, Verlauf, Belege) und widerspricht sich auf dem Bild selbst: Die Erklärung sagt "Gerade sind Zahlungen noch nicht eingeschaltet", direkt darunter steht ein aktiver "Jetzt bezahlen"-Button mit Schnellwahl und Rabattcode-Feld. Gesamte Seite fällt mit Vertrag 012 weg.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Working memory: Betrag, Rabattcode, Vorschrift), Heuristiken 1, 2, 5, Personas Jordan, Casey] (manuell) | Funde: Widerspruch Text und Button (SD-GU-1), Vier-Schritte-Erklärung vor dem Aufladen (X-09), Betrag doppelt (X-09) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 1247, kein Überlauf) | Funde: Hinweistexte 12 px, 114 Zeichen je Zeile (SD-GU-2); `balance` mit `aria-label` (positiv) |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: Verlauf und Belege als leere Kästen (X-09), Rabattcode ohne Erklärung (X-09) |
| clarify [Teil: Audit the language, Forms, Errors, Empty states] (manuell) | Funde: Altmodell-Texte (X-05, MUSS WEG); Betreibertext "Aufladen ist hier noch nicht eingerichtet (Zahlungsanbieter fehlt) ..." bei fehlendem Anbieter (SM-GU-1, aus Quelltext `page.tsx (guthaben):85`) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content)] (manuell) | Funde: Eingabefeld 686 px für eine zweistellige Zahl neben drei Schnellwahl-Buttons à 223 px (SD-GU-2), `h1` 24 px mit 36-px-Betrag darunter |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` (sieht Gast-Anmeldeseite) + Quelltext `guthaben` | nur overused-font; Quelltext `[]` |

Funde:
- X-05, X-09, SM-GU-1, SM-GU-2, SD-ALL-1 (gelten unverändert; alles MUSS WEG)
- SD-GU-1 | P1 | Zwei getrennte Schalter erzeugen einen Widerspruch auf derselben Seite (aus Quelltext und Bild): `!payOn` zeigt "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" (`page.tsx (guthaben):64`), `provider` (hier der Dev-Fake-Anbieter) zeigt gleichzeitig das Aufladeformular mit "Jetzt bezahlen" (`:79-83`). Ein Spieler könnte echtes Geld aufladen, obwohl der Text "kostet nichts" sagt. Im Betrieb mit Stripe, aber `payOn=false` gleicher Zustand. | spieler_desktop_app-guthaben.png | clarify
- SD-GU-2 | P2 | Aufladeformular am Desktop: Schnellwahl 20/50/100 € (je 223 x 44 px) und darunter ein 686 px breites Feld, das denselben Wert nochmals zeigt ("20"); Hinweis "Zwischen 5,00 und 200,00 Euro. Größere Beträge sparen Gebühren, denn jede Zahlung kostet etwas." (12 px) und "Rabattcode (optional)" mit 686-px-Feld. Alle Kleintexte 12 px mit bis zu 114 Zeichen je Zeile. Ergänzt X-09. | spieler_desktop_app-guthaben.png | adapt

---

#### /matchmaking
Beleg: spieler_desktop_matchmaking.png
Bewertung: Die Seite heißt "Lobby aufmachen" und beginnt mit "Du bist Captain und willst mit deinem Team spielen?", bietet dem Spieler aber nur Lesen: Erklärung, Filter für offene Suchen und erst am Ende "Nur Team-Admins können nach Gegnern suchen. Team gründen". Am Desktop liegt dieser Hinweis ohne Scrollen im Bild (y=565), die Seite ist aber 812 px hoch (12 px Scrollleiste).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 3, 9, Personas Jordan, Casey, Riley] (manuell) | Funde: Titel und Einleitung für Captains, Hinweis zur Berechtigung am Ende (SM-MA-1, GM-MM-2); zwei Seiten für offene Lobbys (GM-MM-3) |
| audit [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] (metrics: Höhe 812, kein Überlauf) | Funde: Filter-Selects und "Filtern" 36 px hoch (GM-MM-4); Höhe 812 px erzeugt Scrollleiste für 12 px (GD-MM-1 hatte 802) |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: sieben Zeilen Prozesstext vor allen Daten (GM-MM-5) |
| clarify [Teil: Audit the language, Empty states, Errors and permissions] (manuell) | Funde: Leerzustand "Mach eine Lobby für dein Team auf" (GM-MM-6), "Hallen-Veto" unerklärt (GM-MM-5), Rollenbegriffe (SM-GL-5), Berechtigungshinweis zuletzt (SM-MA-1) |
| adapt [Teil: Desktop Adaptation (Layout, Interaction, Content), Navigation] (manuell) | Funde: Zeilenlänge 99 Zeichen (GD-ALL-7), Einzelwort "hier." (GD-MM-2), Hinweis im ersten Bildschirm sichtbar (positiv gegenüber Handy) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | line-length ~99 Zeichen; straggler "hier."; Quelltext `matchmaking`: `[]` |

Funde:
- GM-MM-2, GM-MM-3, GM-MM-4, GM-MM-5, GM-MM-6, GD-MM-1, GD-MM-2, GD-ALL-7, SM-MA-1, SM-MA-2, SM-GL-5, SM-GL-6 (gelten unverändert)
- SD-MM-1 | P1 | Desktop-Beleg zu SM-MA-1: Die Überschrift "Lobby aufmachen" (`page.tsx (matchmaking):29`, 30 px) verspricht dem Spieler eine Handlung, die die Seite ihm dann verweigert; der Hinweis "Nur Team-Admins können nach Gegnern suchen" steht als eigene Karte ganz unten (y=565 bis 619), das angebotene "Team gründen" ist ein Textlink statt einer Klärung ("Frag deinen Team-Admin"). Der Spieler kann hier ausschließlich Offene Suchen filtern. | spieler_desktop_matchmaking.png | clarify

---

#### /mitspieler
Beleg: spieler_desktop_mitspieler.png
Bewertung: Die einzige Seite dieser Gruppe, auf der ein Spieler ohne Captain-Rolle selbst handeln darf ("Ich suche ein Spiel": Tag, Stadt, Hinweis, Eintragen). Titel und Einleitung ("Fehlt dir jemand? Frag ihn an.") sprechen aber Captains an; darunter folgen ein Stadtfilter über 626 px mit zweitem Primärbutton und ein leerer Satz.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Single focus: zwei Primärbuttons), Heuristiken 2, 5, 6, Personas Jordan, Casey] (manuell) | Funde: Richtung unklar (GM-MS-3, SM-MI-1), zwei Primärbuttons "Eintragen" und "Filtern" (GD-MS-1) |
| audit [Teil: Dimension 1 A11y (Beschriftungen, Tastatur), 4 Responsive] (metrics: Höhe 800, kein Überlauf) | Funde: alle Felder beschriftet (positiv); "Anfragen" 32 px und "Zurückziehen" als Textlink nur bei vorhandenen Einträgen, aus Quelltext (GM-MS-4) |
| distill [Teil: Interaction Simplification, Layout Simplification] (manuell) | Funde: Stadtfilter 626 px für eine einzige Wahl (GD-MS-1) |
| clarify [Teil: Audit the language, Forms, Empty states] (manuell) | Funde: Sichtbarkeit und Dauer des Eintrags nicht gesagt (SM-MI-2), Leerzustand ohne nächste Handlung (GM-MS-2), Seite weder im Menü noch auf `/app` verlinkt (SM-MI-3) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: Formular nutzt zwei Spalten gut (positiv); Fußzeile y=568 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | nur overused-font (nicht gewertet); Quelltext `mitspieler`: `[]` |

Funde:
- GM-MS-2, GM-MS-3, GM-MS-4, GD-MS-1, SM-MI-1, SM-MI-2, SM-MI-3 (gelten unverändert)
- Nicht prüfbar (Seed leer): gefüllte Liste mit "Anfragen"/"Zurückziehen", Zustand nach "Eintragen" (nur aus Quelltext gelesen, nicht abgesendet, um keine Daten zu schreiben).

---

#### /einladung/demoinvitex1
Beleg: spieler_desktop_einladung-demoinvitex1.png (Klick: spieler_desktop_extra_einladung-nach-klick.png)
Bewertung: Klare, zentrierte Karte mit Team, Stadt, Kadergröße und einem 384 px breiten Button im oberen Drittel. Der Spieler ist aber schon Mitglied von Demo Alpha: die Seite erkennt das nicht, bietet "Team beitreten" an, und der Klick leitet ohne jede Meldung auf die Teamseite (gemessen: Ziel `/teams/demo-alpha`).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 5, 9, Persona Jordan] (manuell) | Funde: Mitgliedschaft nicht erkannt (SM-EL-1, SD-EL-1), keine Rückmeldung nach Klick |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (metrics: Höhe 800, kein Überlauf) | keine neuen Funde (Button 384 x 44 px, Fokusring vorhanden) |
| distill [Teil: Information Architecture] (manuell) | keine Funde (ein Ziel, ein Button) |
| clarify [Teil: Audit the language, Errors and permissions] (manuell) | Funde: Fehlerzustände "voll", "abgelaufen" nur aus Quelltext (SM-EL-2, `JoinForm.tsx:12`); "Du wurdest eingeladen" für Mitglied falsch (SM-EL-1) |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: Fußzeile y=301, darunter 500 px leer (SD-ALL-9); `h1` 30 px bei x=448 (SD-ALL-8) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/demoinvitex1` | nur overused-font (nicht gewertet); Quelltext `einladung`: `[]` |

Funde:
- SM-EL-1, SM-EL-2, GM-EL-3, GM-EL-5, SD-ALL-8, SD-ALL-9 (gelten unverändert)
- SD-EL-1 | P1 | Desktop-Beleg zu SM-EL-1 (gemessen, Klick ausgeführt): Nach "Team beitreten" für ein bestehendes Mitglied folgt eine stille Weiterleitung auf die Teamseite ohne Hinweis "Du bist schon im Team"; das Bild danach zeigt das Team mit Kader (Demo Admin A als "Team-Admin", Alpha Spieler 1 bis 3). Der Spieler weiß nicht, ob etwas passiert ist oder ob er doppelt beigetreten ist. | spieler_desktop_extra_einladung-nach-klick.png | clarify

---

#### /einladung/ungueltig
Beleg: spieler_desktop_einladung-ungueltig.png
Bewertung: Knappe, verständliche Fehlermeldung mit einem Weg zur Startseite; für angemeldete Nutzer führt der Weg auf die Gast-Startseite statt nach "Mein Bereich". Es fehlen mögliche Gründe; die Seite endet bei y=285.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 9 Fehlerbehebung, Persona Jordan] (manuell) | Funde: Grund und Weg fehlen (GM-EU-1), für Angemeldete nur "Zur Startseite" (SM-EU-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive] (metrics: Höhe 800, kein Überlauf) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: "Bitte frag den Team-Admin" für den Spieler brauchbar, GM-EU-1 |
| adapt [Teil: Desktop Adaptation (Layout, Content)] (manuell) | Funde: `h1` 24 px zentriert, Fußzeile y=285 (SD-ALL-8, SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/ungueltig` | nur overused-font (nicht gewertet); Quelltext `einladung`: `[]` |

Funde:
- GM-EU-1, SM-EU-1, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

### Zusammenfassung der Funde (nur Desktop-Neufunde, ohne Verweise)

| Priorität | Anzahl | IDs |
|---|---|---|
| P0 Bedienung kaputt | 0 | (X-01 betrifft nur das Handy) |
| P1 verwirrend | 7 | SD-ALL-1, SD-ST-1, SD-AP-1, SD-AP-2, SD-GU-1, SD-MM-1, SD-EL-1 |
| P2 Optik | 20 | SD-ALL-2 bis SD-ALL-9, SD-HI-1, SD-U1-1, SD-TE-1, SD-AP-3 bis SD-AP-5, SD-SN-1, SD-ES-1 bis SD-ES-4, SD-GU-2 |

Wichtigste neue Desktop-Erkenntnisse: Guthaben-Betrag steht dreifach in Kopfleiste, Menü und Karte (SD-ALL-1); `hover:border-accent` auf Karten wirkt wegen der unlayered `.card`-Regel nie (SD-ALL-4); Konto-Menü verspricht ARIA-Menü, liefert aber keine Pfeiltasten und verliert nach Escape den Fokus (SD-ALL-2); Kopfleiste bricht bei 200 % Zoom (SD-ALL-6); der Spieler wird auf `/app`, `/` und `/matchmaking` zur Captain-Handlung geführt (SD-AP-1, SD-ST-1, SD-MM-1); die Guthaben-Seite widerspricht sich selbst (SD-GU-1); Einladung für bestehendes Mitglied endet still (SD-EL-1).

---



### Fundblatt Captain, Handy

Rolle Captain (angemeldet als Team-Admin von Demo Alpha, Dev-Login), Gerät Handy mit Touch, Dev-Server Port 3102. Nur gelesen, kein Quelltext geändert. Aussagen, die der Screenshot nicht zeigt, sind mit "aus Quelltext" gekennzeichnet.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify` und `adapt` sind Playbooks ohne Launcher-Befehl. Die fünf Reference-Dateien sind vollständig gelesen (critique.md bis Zeile 819). Je Durchgang steht in eckigen Klammern, welcher Teil angewandt wurde. Die Prüfung ist manuell und läuft nicht als Sub-Agent; critique ist damit degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab. `detect` lief je Seite über den Launcher.

Aufnahme- und Messhinweise:
- Alle 23 Screenshots `captain_mobil_<seite>.png` sind einzeln angesehen. `/anmelden` und `/willkommen` zeigen identisch `/app` (Weiterleitung, Metrik: URL `/app`, Titel "Mein Bereich").
- Gemessen (metrics-captain.json, metrics2-captain.json): kein horizontaler Überlauf, je Seite genau eine `h1`, keine Konsolenfehler, alle 200. Ziele unter 44 px: 8 bis 12 je Seite, `/app/einstellungen` 30 von 69, `/matchmaking` 12 von 48.
- `detect` gegen URLs sieht keine Sitzung: für `/anmelden`, `/willkommen` und alle `/app*`-Seiten zeigt es die Gast-Anmeldeseite (Straggler "nötig."), das ist kein Befund der Seite. Für diese Seiten lief zusätzlich `detect` gegen den Quelltext (`src/app/app`, `src/app/matchmaking`, `src/app/mitspieler`, `src/app/einladung`, `Header.tsx`, `UserMenu.tsx`, `BottomNav.tsx`): jeweils `[]`.
- `detect` auf `/` und `/suche`: Timeout nach 30 s (Dauerverbindung), auch im zweiten Versuch; vermerkt. Ersatz: Zielgrößen per Playwright (Metrik), Quelltext. Es bleibt bei den früheren Funden X-13 und X-10.
- `detect` misst im Dunkelmodus (Kontrast #89958f auf #24362d), der Screenshot-Stil ist hell.
- Der "N"-Knopf und die mitten im Bild stehende feste Navigation sind Aufnahme-Artefakte, kein Fund.
- Nicht prüfbar mit dem Seed (0 Spiele, 0 offene Lobbys, keine Herausforderungen): volle Listen, eigene offene Lobby, Fehlermeldungen der Formulare, Absenden der Formulare (bewusst nicht geklickt, um keine Daten zu erzeugen).

### Seitenübergreifende Captain-Funde (hier einmal beschrieben, von den Seiten referenziert)

Gelten ebenso für den Captain: X-06, X-07, X-17, GM-ST-4, GM-ST-5, GM-ST-6, SM-GL-1, SM-GL-2, SM-GL-3, SM-GL-4, SM-GL-5.

- CM-GL-1 | P1 | Einladungslink nicht erreichbar, wo der Captain ihn sucht: Der Link entsteht nur auf der Teamseite (`InviteBox`, `teams/[slug]/page.tsx:158`, nur für Admins). Auf `/app` steht das Team als Zeile mit 12-px-Chip "Team-Admin", ohne Knopf "Mitspieler einladen"; Startseite, Kacheln und Reiter nennen ihn nicht. PRODUCT.md nennt das Teilen per WhatsApp einen Kernweg. Aus Quelltext (Teamseite ist Gruppe Y, nicht angesehen). | captain_mobil_app.png | critique/distill
- CM-GL-2 | P1 | Der Captain sieht dieselbe Oberfläche wie der Spieler; der Unterschied ist nur der Chip "Team-Admin" (`app/page.tsx:114`) und das Formular auf `/matchmaking` und `/app/suche/neu`. Seine Handlungen (Lobby aufmachen, Spielsuche mit festem Termin, Herausforderungen annehmen, Einladungslink, Ergebnis erfassen) haben keinen eigenen Platz oben auf `/app`; "Lobby aufmachen" steht als Karte, als Kachel und als Reiter (X-04), die anderen nirgends. Das Konto-Menü zeigt weder Rolle noch Team (SM-GL-3). Ergänzt X-04, X-20, SM-GL-6. | captain_mobil_app.png | distill/clarify
- CM-GL-3 | P1 | "Spiel mit festem Termin suchen" (`/app/suche/neu`) hat in Gruppe X keinen Einstieg: Kein Link auf `/app`, in der Reiterleiste, Fußzeile, Hilfe oder auf `/matchmaking` (Suche im Quelltext nach `app/suche/neu`: nur Revanche auf `spiele/[id]`, "Herausfordern" auf der Teamseite und `LobbyBoard.tsx:197`). Der Captain findet die Seite nur über Umwege, obwohl sie als gleichwertige zweite Art der Spielsuche gedacht ist. Aus Quelltext. | captain_mobil_app-suche-neu.png | clarify/distill
- CM-GL-4 | P1 | Drei Namen für eine Handlung: Karte/Button "Lobby aufmachen", Reiter "Teamspiel", Reiter "Spiel suchen", Seitentitel `/matchmaking` "Lobby aufmachen" (Tab-Titel) und Hilfe "Matchmaking"/"Spielsuche"/"Gegnersuche"; `/app/suche/neu` heißt "Spiel mit festem Termin suchen" und verweist auf "das Matchmaking" (`suche/neu/page.tsx:21`), die Hilfe sagt "Offene Lobbys". Der Captain kann nicht erkennen, dass "Lobby" (flexibles Zeitfenster, Teams treten an) und "Spielsuche" (fester Termin) zwei verschiedene Wege sind. Ergänzt GM-HI-3, GM-MM-3. | captain_mobil_app-suche-neu.png, captain_mobil_matchmaking.png | clarify
- CM-GL-5 | P2 | Zielgrößen der Captain-Handlungen: Reiterleiste und Hauptbuttons sind 44 px und mehr (gut), aber "Team gründen" in "Meine Teams" (36 px, `!min-h-9`, `app/page.tsx:99`), Filterzeile auf `/matchmaking` (Selects und "Filtern" 36 px, `!min-h-9`) und Menüknopf 95x36 px liegen darunter. Ergänzt X-07. | captain_mobil_app.png, captain_mobil_matchmaking.png | audit/adapt
- CM-GL-6 | P2 | Einstellungen und Benachrichtigungen zeigen dem Captain die Admin-Arten ("Dein Team wurde herausgefordert", "Neues Mitglied in deinem Team", "Spieler tritt der Lobby bei"), das ist für ihn richtig; "Neue Aufgabe für Admins" (`PrefsForm.tsx`) meint Plattform-Admins und ist für einen Team-Admin missverständlich (Begriff Admin für zwei Rollen). Aus Quelltext. | captain_mobil_app-einstellungen.png | clarify

---

#### /
Beleg: captain_mobil_start.png
Bewertung: Auch als Captain zeigt die Startseite den Gast-Hero mit "Team gründen" als erster Handlung, obwohl er schon ein Team verwaltet; "Lobby aufmachen" steht erst als zweiter Knopf, ein Einladungslink fehlt. Kopfleiste (Glocke, "Demo") ist klar; untere Navigation ohne aktiven Reiter.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Wall of Options), Heuristiken 1-10, Personas Jordan/Casey, Severity] (manuell) | Funde: Hero für Angemeldete falsch (SM-ST-1), vier Hero-Ziele (X-02), Einstiege vierfach (GM-ST-2), Captain-Aktion nicht erste (CM-ST-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; metrics 9 von 44 Ziele unter 44 px, kein Überlauf, 1 h1] (manuell) | Funde: Sprachwahl 16 px hoch (GM-ST-4), Hero-Video (GM-ST-8), Text auf Foto (X-19), kein aktiver Reiter (SM-GL-1) |
| distill [Teil: Assess Current State, Information Architecture, Interaction Simplification] (manuell) | Funde: Hero 4 Buttons plus 5 Karten-Buttons (X-03), doppeltes Logo (GM-ST-7), Einsteigerblock für Angemeldete überflüssig (SM-ST-1) |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete" und "Was kostet das?" mit "Du lädst dein Guthaben auf" (X-05, GM-ST-1, MUSS WEG), "Gründe dein Team" für Captain falsch |
| adapt [Teil: Mobile Adaptation Layout, Navigation, Touch] (manuell) | Funde: Hero-Buttons ungleich breit (X-02), Kopfleiste ohne Offene Lobbys/Livescore/Rangliste (GM-ST-5) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Timeout nach 30 s (zweimal); keine neuen Daten, früherer Fund X-13 |

Funde:
- X-02, X-03, X-05, X-13, X-19, GM-ST-1, GM-ST-2, GM-ST-4, GM-ST-5, GM-ST-6, GM-ST-7, GM-ST-8, GM-ST-9, SM-ST-1 (gelten unverändert)
- CM-ST-1 | P1 | Für den Captain ist die erste Hero-Handlung "Team gründen" (`page.tsx:61-63`), seine eigentliche Handlung "Lobby aufmachen" steht als zweiter, blasser Knopf darunter; "Meine Spiele" fehlt, Team und Rolle sind nicht zu sehen. Das Logo führt auf diese Seite, nicht auf `/app` (`Header.tsx:22`). | captain_mobil_start.png | critique/distill

---

#### /hilfe
Beleg: captain_mobil_hilfe.png
Bewertung: Aufklappliste mit 19 Fragen in fünf Gruppen; für den Captain die brauchbarste Rolle: "Wie lade ich meine Mitspieler ein?", "Wie finde ich einen Gegner?", "Was ist die Lobby?", "Wie wird das Ergebnis eingetragen?" stehen vorn. Enthält den Altmodell-Block "Geld und Guthaben" und Verweise auf Kopfleisten-Einträge, die am Handy fehlen.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 4, 10, Personas Jordan/Casey] (manuell) | Funde: Begriffsmix Lobby/Spielsuche/Matchmaking (CM-GL-4, GM-HI-3), Captain/Team-Admin (SM-GL-5) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 11 von 37 Ziele unter 44 px, kein Überlauf, Höhe 2280 px] (manuell) | Funde: Fußzeilenziele (X-07); Fragen 44 px hoch und tippbar, Fokus vorhanden |
| distill [Teil: Information Architecture, Content Simplification] (manuell) | Funde: 19 Fragen ohne Suche oder Sprungmarken (GM-HI-4); Captain-Fragen nicht gesondert gruppiert (CM-HI-1) |
| clarify [Teil: Audit the language, Message hierarchy] (manuell) | Funde: Altmodell-Abschnitt (GM-HI-1), "(oben)" (GM-HI-2); Frage zur festen Terminsuche (`/app/suche/neu`) fehlt (CM-GL-3) |
| adapt [Teil: Mobile Adaptation Content, Navigation] (manuell) | Funde: "oben in der Leiste" gilt nur am Desktop (GM-HI-2) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hilfe` (Seite öffentlich) | nur overused-font (gewollt); keine weiteren Funde |

Funde:
- GM-HI-1, GM-HI-2, GM-HI-3, GM-HI-4, X-07 (gelten unverändert; Altmodell siehe MUSS WEG)
- CM-HI-1 | P2 | Die Hilfe erklärt Captain-Wege (`hilfe/page.tsx:45` Einladungslink, `:52` Lobby, `:71` Ergebnis), aber es gibt keine Gruppe "Für Captains" und keine Frage "Wie suche ich einen festen Termin?". Der Captain muss alle 19 Fragen einzeln öffnen. Aus Quelltext. | captain_mobil_hilfe.png | distill

---

#### /agb
Beleg: captain_mobil_agb.png
Bewertung: Lesbarer Rechtstext, aber mit "Entwurf"-Kasten und Altmodell-Aussagen (Guthaben, kostenlos abmelden). Für den Captain, der Verträge mit Hallen und Teams abwickelt, wirkt der Entwurfsvermerk besonders störend.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan/Sam] (manuell) | Funde: Entwurf-Hinweis (GM-AG-1), dichter Absatz 3 (GM-AG-3) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px] (manuell) | Funde: Fließtext 14 px grau, Zielgrößen wie GM-ST-4 |
| distill [Teil: Content Simplification] (manuell) | keine neuen Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: Altmodell-Sätze (GM-AG-2); keine Aussage zu Pflichten des Team-Admins |
| adapt [Teil: Mobile Content] (manuell) | Funde: Zeilenlänge am Handy gut |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/agb` | straggler "Betreiber." und "führen." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-AG-1, GM-AG-2, GM-AG-3 (gelten unverändert; Altmodell siehe MUSS WEG)

---

#### /datenschutz
Beleg: captain_mobil_datenschutz.png
Bewertung: Gut gegliedert, aber mit Platzhalter beim Verantwortlichen und Zahlungs-/Guthaben-Bezug. Der Link "Einstellungen" im letzten Abschnitt funktioniert für den Angemeldeten.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Personas Jordan/Sam] (manuell) | Funde: Platzhalter Verantwortlicher (GM-DS-1), Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px, Höhe 2084 px] (manuell) | Funde: Ziele klein; Link "Einstellungen" erreicht `/app/einstellungen` |
| distill [Teil: Information Architecture] (manuell) | Funde: 14 Abschnitte ohne Übersicht (GM-DS-4) |
| clarify [Teil: Audit the language] (manuell) | Funde: "Zahlungen: Guthaben, Buchungen, Belege" (GM-DS-2); keine Aussage, was der Captain über Mitglieder sieht (CM-DS-1) |
| adapt [Teil: Mobile Content/Navigation] (manuell) | Funde: lange Seite ohne Sprungmarken (GM-DS-4) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/datenschutz` | 4 straggler ("Betreiber.", "eingetragen.", "Cookie-Banner.", "erhalten."), siehe X-13; overused-font nicht gewertet |

Funde:
- X-13, GM-DS-1, GM-DS-2, GM-DS-4, GM-AG-1 (gelten unverändert; GM-DS-3 gilt nur für Gäste)
- CM-DS-1 | P2 | Der Text sagt "deine Team-Admins" sehen die Zuverlässigkeit, nennt aber nicht, welche Daten ein Team-Admin über Mitglieder und Einladende einsehen kann (Name, Position, Mitspieler-Anfragen). Aus Quelltext/Text, rechtlich zu prüfen. | captain_mobil_datenschutz.png | clarify

---

#### /impressum
Beleg: captain_mobil_impressum.png
Bewertung: Kurz, aber mit sichtbaren Konfigurationsnamen (OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_EMAIL) und Entwurfskasten; im aktuellen Zustand nicht zeigbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 9] (manuell) | Funde: Konfigurationsnamen sichtbar (GM-IM-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px, Höhe 896 px] (manuell) | keine neuen Funde (X-07) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: GM-IM-1 |
| adapt [Teil: Mobile Content] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/impressum` | straggler "Betreiber." und "wieder." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-IM-1, GM-AG-1

---

#### /hausordnung
Beleg: captain_mobil_hausordnung.png
Bewertung: Kurze, klare Regeln; Entwurfskasten und ein Satz zu "offenes Guthaben und Reservierungen" (Altmodell). Für den Captain inhaltlich wichtig (Fehlen, Ergebnisse fälschen), aber ohne Verweis auf seine Verantwortung für den Kader.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken, Persona Jordan] (manuell) | Funde: Entwurf (GM-AG-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 34 Ziele unter 44 px] (manuell) | keine neuen Funde (X-07) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: Satz "Bei einer Sperre werden offenes Guthaben und Reservierungen ordnungsgemäß abgewickelt" (GM-HO-1, MUSS WEG) |
| adapt [Teil: Mobile Content] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/hausordnung` | straggler "Betreiber." und "abgewickelt." (X-13); overused-font nicht gewertet |

Funde:
- X-13, GM-AG-1, GM-HO-1, SM-HO-1

---

#### /kontakt
Beleg: captain_mobil_kontakt.png
Bewertung: Kurz und klar aufgebaut; die E-Mail-Zeile zeigt den Konfigurationsnamen OPERATOR_EMAIL, der Listenpunkt "Auszahlung deines Guthabens" ist Altmodell.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 9, 10] (manuell) | Funde: Konfigurationsname sichtbar (GM-KO-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px] (manuell) | keine neuen Funde |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Errors] (manuell) | Funde: GM-KO-1, "Auszahlung deines Guthabens" (GM-KO-2, MUSS WEG) |
| adapt [Teil: Mobile Content] (manuell) | keine Funde (GM-KO-3 gilt) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-KO-1, GM-KO-2, GM-KO-3, SM-KO-1

---

#### /unter-16
Beleg: captain_mobil_unter-16.png
Bewertung: Kurze Hinweisseite mit einem Weg ("Zur Startseite"). Mit Sitzung widerspricht der Text dem Zustand (Kopfleiste zeigt "Demo", Text sagt "Dein Konto wurde wieder gelöscht"); im Normalbetrieb selten. Im Bild lautet der Titel "Socaz ist ab 16".

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 9] (manuell) | Funde: Text unabhängig von der Sitzung (SM-U1-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde |
| distill [Teil: Interaction Simplification] (manuell) | Funde: Fußzeile und Reiterleiste auf einer Sackgasse unnötig (GM-EL-3) |
| clarify [Teil: Errors and permissions] (manuell) | Funde: GM-U16-1, SM-U1-1 |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: kein Reiter aktiv |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/unter-16` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-U16-1, SM-U1-1, GM-EL-3

---

#### /anmelden
Beleg: captain_mobil_anmelden.png (identisch mit captain_mobil_app.png)
Bewertung: Der angemeldete Captain wird sofort auf `/app` weitergeleitet (Metrik: URL `/app`); richtig, aber ohne Rückmeldung. Die Anmeldeseite selbst ist für ihn nicht sichtbar.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 3] (manuell) | Funde: Weiterleitung ohne Hinweis (SM-AN-1) |
| audit [Teil: Dimension 4 Responsive; metrics 9 von 47 Ziele unter 44 px, Höhe 1820 px = /app] (manuell) | Funde: wie `/app` |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Message hierarchy] (manuell) | keine Funde (reine Weiterleitung) |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: Reiter "Profil" aktiv, passt zu `/app` |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/anmelden` (Gast-Sicht, für den Captain Weiterleitung) | straggler "nötig." (X-13); overused-font nicht gewertet. Quelltext `src/app/app`: `[]` |

Funde:
- SM-AN-1

---

#### /willkommen
Beleg: captain_mobil_willkommen.png (identisch mit captain_mobil_app.png)
Bewertung: Eingerichteter Captain wird auf `/app` weitergeleitet, korrekt. Onboarding für neue Nutzer ist nicht prüfbar (Seed-Nutzer sind eingerichtet).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 3] (manuell) | keine neuen Funde |
| audit [Teil: Dimension 4 Responsive; metrics wie /app] (manuell) | Funde: wie `/app` |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Message hierarchy] (manuell) | keine Funde |
| adapt [Teil: Mobile Navigation] (manuell) | keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/willkommen` (Gast-Sicht) | straggler "nötig." (X-13); overused-font nicht gewertet |

Funde:
- keine eigenen (Onboarding als neuer Nutzer: nicht geprüft)

---

#### /suche
Beleg: captain_mobil_suche.png
Bewertung: Für den Captain die Ansicht "Offene Lobbys anderer Teams": der Button "Lobby aufmachen" steht oben und ist für ihn richtig, aber nur 36 px hoch; Filtermaske mit sechs Feldern füllt den Bildschirm, Liste im Seed leer. Zum Annehmen einer Lobby (Captain-Handlung) gibt es im Seed nichts zu sehen (aus Quelltext: "Annehmen" erscheint nur mit Admin-Team).

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste, Heuristiken 1-10, Personas Casey/Jordan] (manuell) | Funde: Filtermaske vor Inhalt (X-10), "Live" (GM-SU-2), "anderer Teams" (GM-SU-1), Captain-Handlung "Annehmen" im Leerzustand nicht erklärbar (CM-SU-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 42 Ziele unter 44 px, Höhe 1023 px] (manuell) | Funde: Auswahlfeld "Art" abgeschnitten ("Lobbys und Su"), Button 36 px (GM-SU-4) |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: sechs Filter gleichzeitig (GM-SU-3) |
| clarify [Teil: Audit the language, Empty states] (manuell) | Funde: Leerzustand "Mach eine Lobby für dein Team auf" passt hier zum Captain, aber ohne Knopf direkt darunter (GM-SU-6) |
| adapt [Teil: Mobile Adaptation Layout, Navigation, Touch] (manuell) | Funde: Reiter "Spiel suchen" aktiv; Filter im Zwei-Spalten-Raster, "Stärke ab/bis" ohne Erklärung (GM-SU-5) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Timeout nach 30 s (zweimal); keine Daten. Früherer Fund X-10 (unbalanced-heading) |

Funde:
- X-10, GM-SU-1, GM-SU-2, GM-SU-3, GM-SU-4, GM-SU-5, GM-SU-6
- CM-SU-1 | P2 | Der Leerzustand (`OpenSearches.tsx`) sagt "Mach eine Lobby für dein Team auf" und der Button "Lobby aufmachen" steht weit darüber über der Filtermaske; für den Captain ist der Weg richtig, aber zwei Bildschirmhöhen auseinander. Aus Quelltext: "Annehmen" erscheint nur für Teams, in denen er Admin ist; ob er das mit zwei Teams unterscheiden kann, ist nicht prüfbar (Seed: ein Admin-Team). | captain_mobil_suche.png | clarify

---

#### /spieler
Beleg: captain_mobil_spieler.png
Bewertung: Spielerliste als Karten, gut lesbar, aber das Suchfeld ist auf etwa 48 px zusammengedrückt (Platzhalter "Na", X-01). Für den Captain fehlt ein Weg "Spieler anfragen" aus der Liste.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 6, 7, Personas Casey/Jordan] (manuell) | Funde: Suchfeld unbrauchbar (X-01), eigene Karte ("Demo Admin A") nicht markiert (SM-SP-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 47 Ziele unter 44 px, Höhe 1399 px] (manuell) | Funde: Platzhalter-Kontrast 4,1:1 (X-16), Suchfeld-Breite (X-01) |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language, Empty states] (manuell) | Funde: "0 Spiele · 0 Tore" als einzige Kennzahl (GM-SP-1) |
| adapt [Teil: Mobile Adaptation Layout, Touch, Navigation] (manuell) | Funde: Suchzeile bricht nicht um (X-01); Reiter "Profil" aktiv statt keiner (SM-GL-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | low-contrast Platzhalter "Name suchen" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-16, SM-GL-1, SM-SP-1, GM-SP-1, GM-SP-2
- CM-SP-1 | P2 | Der Captain kann in der Liste nichts mit den Spielern tun (Karte führt nur zum Profil, aus Quelltext); die Mitspieler-Anfrage steckt auf `/mitspieler`, die Liste zeigt nicht, wer "ein Spiel sucht". | captain_mobil_spieler.png | distill

---

#### /teams
Beleg: captain_mobil_teams.png
Bewertung: Zwei Teamkarten, übersichtlich; Suchfeld zusammengedrückt ("Tea", X-01). Das eigene Team Demo Alpha ist nicht markiert, obwohl der Captain hier Gegner suchen will; der Reiter "Teamspiel" leuchtet, obwohl die Seite ein Verzeichnis ist.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 4, Personas Casey] (manuell) | Funde: Suchfeld (X-01), eigenes Team nicht markiert (SM-TE-1), Herausfordern nur über die Teamseite (CM-TE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 39 Ziele unter 44 px] (manuell) | Funde: Platzhalter-Kontrast (X-16) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Audit the language] (manuell) | Funde: "noch ohne Spiel" ohne Erklärung (GM-TE-1) |
| adapt [Teil: Mobile Adaptation Layout, Navigation] (manuell) | Funde: Reiter "Teamspiel" aktiv auf Teamverzeichnis (X-06) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | low-contrast Platzhalter "Teamname" 4,1:1 (X-16); overused-font nicht gewertet |

Funde:
- X-01, X-06, X-16, SM-TE-1, GM-TE-1, GM-TE-2
- CM-TE-1 | P1 | Die Einleitung verspricht "... und fordere sie heraus", die Karte ist aber nur ein Link auf die Teamseite ohne Knopf "Herausfordern" oder Hinweis, wo das geht (aus Quelltext: Link `/app/suche/neu?gegner=<slug>` steht auf der Teamseite, Gruppe Y). Das ist der einzige Einstieg zur festen Terminsuche (CM-GL-3). | captain_mobil_teams.png | clarify

---

#### /offline
Beleg: captain_mobil_offline.png
Bewertung: Kurze, klare Hinweisseite "Keine Verbindung"; Kopfleiste zeigt den angemeldeten Zustand. Es fehlt ein Knopf "Erneut versuchen"; Fußzeile und Reiter führen ohne Netz nirgendwohin.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 9] (manuell) | Funde: keine Handlung (SM-OF-1, GM-OF-1) |
| audit [Teil: Dimension 4 Responsive; metrics 8 von 34 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde |
| distill [Teil: Interaction Simplification] (manuell) | Funde: Fußzeile mit 14 Links und Reiterleiste überflüssig (GM-OF-2) |
| clarify [Teil: Errors and permissions] (manuell) | Funde: was/warum gut, Hinweis für den Spieltag (Lobby, Ergebnis erfassen am Spielfeldrand, PRODUCT.md: schlechtes Netz in Hallen) fehlt (CM-OF-1) |
| adapt [Teil: Mobile Navigation; Offline aus "slow connections"] (manuell) | Funde: Links ohne Netz ins Leere |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/offline` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- SM-OF-1, GM-OF-1, GM-OF-2
- CM-OF-1 | P2 | PRODUCT.md nennt schlechtes Netz in Hallen und die Ergebniserfassung am Spielfeldrand durch den Team-Admin; die Offline-Seite sagt nicht, ob eingegebene Daten erhalten bleiben oder was der Captain am Spieltag tun soll. | captain_mobil_offline.png | clarify

---

#### /app
Beleg: captain_mobil_app.png
Bewertung: Der Captain sieht dieselbe Seite wie der Spieler: Begrüßung, drei große Spielart-Karten (Teamspiel mit "Lobby aufmachen" primär), Guthaben-Karte, fünf Kacheln, "Meine Spiele" und "Meine Teams" erst nach rund 1000 bis 1200 px. Die Captain-Handlungen sind erreichbar ("Lobby aufmachen" gleich oben), aber Einladungslink und feste Terminsuche fehlen; Rolle nur als 12-px-Chip "Team-Admin".

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Wall of Options, Visual Noise Floor), Heuristiken 1-10, Personas Casey/Jordan, Severity] (manuell) | Funde: Reihenfolge (X-03, X-04), Captain-Handlungen fehlen oben (CM-GL-1, CM-GL-2, CM-GL-3), Rolle kaum sichtbar (CM-AP-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive (Zielgrößen), 5 Integrität; metrics 9 von 47 Ziele unter 44 px, Höhe 1820 px] (manuell) | Funde: "Team gründen" 36 px (CM-GL-5), Menüknopf 95x36 (SM-GL-3), Sprachwahl (GM-ST-4), schwarzer Punkt statt Teamfarbe (X-18) |
| distill [Teil: Assess Current State, Information Architecture, Interaction Simplification (ONE primary action)] (manuell) | Funde: drei Karten, fünf Kacheln, zwei "Team gründen" (X-03, X-04, SM-AP-1); für einen bestehenden Captain ist "Team gründen" eine Nebenhandlung, aber orange und prominent (CM-AP-2) |
| clarify [Teil: Audit the language, Message hierarchy, Empty states] (manuell) | Funde: "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" (X-05, MUSS WEG), "Der Captain öffnet eine Lobby" (SM-GL-5; Captain liest sich als Dritter angesprochen), Leerzustand "Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an" ohne Knopf (CM-AP-3) |
| adapt [Teil: Mobile Adaptation Layout, Content (Progressive disclosure), Navigation, Touch] (manuell) | Funde: Schnellzugriff mit "Hilfe" allein (X-04); Reiter "Profil" aktiv, Titel "Mein Bereich" (SM-GL-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` (Gast-Sicht: zeigt Anmeldeseite) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]` |

Funde:
- X-03, X-04, X-05, X-18, X-20 (nur Spieler), SM-GL-1, SM-GL-5, SM-AP-1, CM-GL-1, CM-GL-2, CM-GL-3, CM-GL-5
- CM-AP-1 | P2 | Die Rolle des Captains steht nur als 12-px-Text "Team-Admin" rechts in der Teamzeile (`app/page.tsx:114`); "Hey Demo" und die Unterzeile "Mittelfeld · Gelsenkirchen" zeigen Position statt Team und Rolle. Der Captain erkennt nicht auf einen Blick, für welches Team seine Handlungen gelten. | captain_mobil_app.png | clarify
- CM-AP-2 | P2 | Der orange Knopf "Team gründen" neben "Meine Teams" (`:99`) hat dieselbe Betonung wie die Hauptkarten; für einen Captain mit Team ist das eine seltene Handlung (zweites Team), der wichtigere Knopf "Mitspieler einladen" fehlt (CM-GL-1). | captain_mobil_app.png | distill
- CM-AP-3 | P2 | Leerzustand "Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an." (`:72`) nennt die richtigen Captain-Wege, bietet aber keinen Knopf; "Herausforderungen" erscheint nur mit Daten (aus Quelltext, im Seed nicht sichtbar). | captain_mobil_app.png | clarify

---

#### /app/suche/neu
Beleg: captain_mobil_app-suche-neu.png
Bewertung: Das Captain-Formular funktioniert und ist klar beschriftet (Team, Anstoß mit Hinweis "Mindestens 24 Stunden im Voraus", Dauer, Stadt, Stärke, Wiederholen, Sichtbarkeit, Notiz, "Spielsuche erstellen"); es ist lang (sieben Felder), das Datumsfeld hat keine Vorgabe, und die Seite hat keinen Einstieg (CM-GL-3). Abgesendet wurde nicht.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 3, 5, 6, 9, Persona Jordan/Casey] (manuell) | Funde: kein Zurück/Abbrechen (CM-SN-1), "Matchmaking" als Alternative unverständlich (CM-GL-4), Reiter "Spiel suchen" und "Profil" zugleich aktiv (SM-GL-1) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 9 von 44 Ziele unter 44 px, Höhe 1330 px] (manuell) | Funde: alle Felder haben sichtbare Labels, Fehler als `role="alert"` (aus Quelltext `RequestForm.tsx:96`); Reiter mit zwei `aria-current` (SM-GL-1) |
| distill [Teil: Information Architecture, Interaction Simplification, Progressive disclosure] (manuell) | Funde: sieben Felder untereinander (X-11); "Wiederholen" und "Sichtbarkeit" selten nötig und könnten eingeklappt sein (CM-SN-2) |
| clarify [Teil: Audit the language, Forms, Errors, Success states] (manuell) | Funde: "Anstoß (deutsche Zeit)" und "Gesuchte Spielstärke des Gegners" mit "3 – Gut eingespielt" gut; "Sichtbarkeit: Öffentlich (in der Liste)" ohne Folge-Erklärung; Erfolgsmeldung nach dem Absenden nicht gesehen (CM-SN-3) |
| adapt [Teil: Mobile Adaptation Layout, Forms (Datum), Touch] (manuell) | Funde: Datumsfeld nativ, `dd.mm.yyyy --:--` einspaltig und breit genug; Dauer/Stadt im Zwei-Spalten-Raster, Felder 44 px; Absenden-Knopf unten, außerhalb des ersten Bildschirms |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]` |

Funde:
- X-11, SM-GL-1, CM-GL-3, CM-GL-4
- CM-SN-1 | P2 | Die Seite hat keinen Zurück-/Abbrechen-Weg außer der Reiterleiste; mit der Reihenfolge Reiter "Spiel suchen" und "Profil" gleichzeitig aktiv ist unklar, wo man ist. | captain_mobil_app-suche-neu.png | critique
- CM-SN-2 | P2 | "Wiederholen" (mit Hilfstext "Legt für dieselbe Uhrzeit in den Folgewochen weitere Spielsuchen an") und "Sichtbarkeit" stehen gleichrangig zwischen den Pflichtfeldern; Pflicht- und optionale Felder sind nicht unterschieden (nur "Notiz" ist optional am Platzhalter erkennbar). | captain_mobil_app-suche-neu.png | distill
- CM-SN-3 | P2 | Aus Quelltext/Messung nicht geprüft: Zustand nach erfolgreichem Absenden und Fehlerfälle (z. B. Termin unter 24 Stunden, Team hat schon eine Suche); der Hinweis steht nur klein unter dem Feld, die Fehlermeldung erscheint nur, wenn es kein Feldfehler ist (`RequestForm.tsx:96`). | Quelltext | clarify

---

#### /app/einstellungen
Beleg: captain_mobil_app-einstellungen.png
Bewertung: 2179 px lange Seite mit drei Speichern-Gruppen (Profil, Benachrichtigungen, Daten). Für den Captain sind die Admin-Arten ("Dein Team wurde herausgefordert", "Neues Mitglied in deinem Team", "Spieler tritt der Lobby bei") wirklich relevant; Teamverwaltung (Name, Farbe, Einladungen) gehört nicht hierher und ist hier nicht zu finden.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (Chunking, Minimal choices), Heuristiken 1, 5, 9, Personas Casey/Sam] (manuell) | Funde: viele Häkchen (X-08), "Neue Aufgabe für Admins" missverständlich (CM-GL-6) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive (Zielgrößen), 5 Integrität; metrics 30 von 69 Ziele unter 44 px, Höhe 2179 px] (manuell) | Funde: 30 kleine Ziele (X-07, X-08), Spitzname-Platzhalter abgeschnitten ("z. B. Der Hamm"), Farbwahl 7 Punkte ohne sichtbare Namen |
| distill [Teil: Information Architecture, Interaction Simplification, Progressive disclosure] (manuell) | Funde: Profil, Spielerprofil, Benachrichtigungen, Daten auf einer Seite mit mehreren Speichern-Knöpfen (X-08) |
| clarify [Teil: Audit the language, Forms, Errors, Success states] (manuell) | Funde: "Push ist auf diesem Server noch nicht eingerichtet" vor den Kanälen (X-08); Hinweis "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (SM-ES-2, prüfen) |
| adapt [Teil: Mobile Adaptation Layout, Content, Touch] (manuell) | Funde: Häkchen 20 px, Zeilen 24 px hoch; Reiter "Profil" aktiv, passt |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]` |

Funde:
- X-07, X-08, SM-ES-2, SM-ES-3, CM-GL-6
- (SM-ES-1 gilt für den Captain nur teilweise: die Admin-Arten sind für ihn berechtigt)

---

#### /app/benachrichtigungen
Beleg: captain_mobil_app-benachrichtigungen.png
Bewertung: Schlicht und klar: Überschrift, Link "Einstellungen", leerer Zustand "Noch keine Benachrichtigungen." Für den Captain wichtige Ereignisse (Herausforderung, Mitspieler-Anfrage, Lobby-Beitritt) werden hier später erscheinen; der Leerzustand erklärt das nicht.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 6] (manuell) | Funde: Leerzustand ohne Erklärung (SM-BE-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 9 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | Funde: Link "Einstellungen" 14 px hoch (klein) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Empty states, Loading/success] (manuell) | Funde: SM-BE-1; aus Quelltext: gelesen/ungelesen nur über Rahmenfarbe |
| adapt [Teil: Mobile Content, Navigation] (manuell) | Funde: Reiter "Profil" aktiv, Glocke nicht als aktiv erkennbar |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]` |

Funde:
- SM-BE-1

---

#### /app/guthaben
Beleg: captain_mobil_app-guthaben.png
Bewertung: Die gesamte Seite beschreibt das Altmodell: Guthaben "0,00 €", Vier-Schritte-Erklärung, Aufladen mit Schnellwahl 20/50/100 Euro, Feld "Betrag", Rabattcode-Feld, "Verlauf" und "Belege". Mit dem Kartenmodell (012) fällt sie weg; für den Captain verwirrend, weil er "Geld aufladen" soll, obwohl "Zahlungen noch nicht eingeschaltet" gilt.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 2, 4, 10, Persona Jordan] (manuell) | Funde: Seitenzweck verschiebt sich (X-09), Altmodell (MUSS WEG) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 9 von 41 Ziele unter 44 px, Höhe 1519 px] (manuell) | Funde: Felder haben Labels; Betrag doppelt (Schnellwahl und Feld, X-09) |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: Vier-Schritte-Text vor dem Aufladen, leere Kästen "Verlauf" und "Belege" (X-09) |
| clarify [Teil: Audit the language, Message hierarchy, Forms, Empty states] (manuell) | Funde: "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" (MUSS WEG); Rabattcode ohne Erklärung; Betreibertext "Zahlungsanbieter fehlt" (SM-GU-1, aus Quelltext) |
| adapt [Teil: Mobile Adaptation Layout, Touch] (manuell) | Funde: Reiter "Profil" aktiv; Schnellwahl drei Knöpfe breit (ok) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` (Gast-Sicht) | straggler "nötig." (nicht dieser Seite); Quelltext `src/app/app`: `[]` |

Funde:
- X-05, X-09, SM-GU-1, SM-GU-2 (Altmodell siehe MUSS WEG)

---

#### /matchmaking
Beleg: captain_mobil_matchmaking.png
Bewertung: Das Captain-Formular "Neue Lobby für dein Team" (Team, Stadt, Dauer, Stärke von/bis, Hinweis, Zeitfenster) ist vollständig und die Erklärung der vier Schritte ist gut, aber das Formular steht ganz unten, nach Einleitung, Schritten, Filter und leerer Liste; der Primärknopf "Lobby aufmachen" liegt etwa 1450 px tief. Die Einleitung "Du bist Captain ..." trifft hier erstmals zu.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Kognitive-Last-Checkliste (One thing at a time, Visual hierarchy), Heuristiken 1, 2, 5, 9, Personas Jordan/Casey] (manuell) | Funde: Handlung ganz unten (CM-MM-1), zwei Seiten mit offenen Lobbys (GM-MM-3), Hallen-Veto unerklärt (GM-MM-5) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 12 von 48 Ziele unter 44 px, Höhe 1873 px] (manuell) | Funde: Filter-Select "Alle Dauern" abgeschnitten ("Alle Dauer"), Filter 36 px (GM-MM-4), Datumsfeld "Zeitfenster 1" abgeschnitten (CM-MM-2) |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: vier Erklärungsschritte plus Filterzeile plus Liste vor dem Formular (CM-MM-1); "Weiteres Zeitfenster" sinnvoll eingeklappt |
| clarify [Teil: Audit the language, Forms, Empty states, Errors and permissions] (manuell) | Funde: Zeitfenster-Erklärung gut ("kein Turnier"), "Stärke des Gegners von/bis" mit "egal" (CM-MM-3); Leerzustand "Mach eine Lobby für dein Team auf" passt (GM-MM-6); Formular ohne Begründung ausgeblendet, wenn Lobby offen ist (CM-MM-4, aus Quelltext) |
| adapt [Teil: Mobile Adaptation Layout, Forms (Datum, Zeit), Navigation, Touch] (manuell) | Funde: Tag/Von/Bis in drei Spalten (GM-MM-7 jetzt gesehen, CM-MM-2); Reiter "Teamspiel" aktiv (passt) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` (Seite öffentlich) | straggler "offen." (kleiner Fund P2); Quelltext `src/app/matchmaking`: `[]` |

Funde:
- GM-MM-3, GM-MM-4, GM-MM-5, GM-MM-6, GM-MM-7 (jetzt visuell bestätigt, s. CM-MM-2), SM-GL-5
- CM-MM-1 | P1 | Die eine Captain-Handlung steht am Seitenende (`QueueForm` nach Einleitung, Schritten, "Offene Suchen" und eigener Lobby, `matchmaking/page.tsx:99`); wer über den Knopf "Lobby aufmachen" kommt, landet auf Erklärung und leerer Liste und muss rund 1000 px scrollen (die feste Navigation überdeckt den Anfang des Formulars am Bildschirmrand). Besser: Formular oder Link "Zum Formular" zuerst, Erklärung eingeklappt. | captain_mobil_matchmaking.png | distill/adapt
- CM-MM-2 | P1 | Das Datumsfeld "Zeitfenster 1" im Dreierraster (`QueueForm.tsx:69`, `grid-cols-3`) ist etwa 100 px breit und zeigt nur "dd.mm" abgeschnitten; Von und Bis zeigen nur Uhrsymbol und "--:--". Das gewählte Datum ist nicht lesbar, das ist die Kernangabe der Lobby. | captain_mobil_matchmaking.png | adapt
- CM-MM-3 | P2 | "Gesuchte Stärke des Gegners von" bricht in zwei Zeilen, das Feld "bis" sitzt dadurch tiefer als "von" (Spalten nicht auf einer Linie); Platzhalter "Hinweis für andere Teams" ist abgeschnitten ("... Rev"). | captain_mobil_matchmaking.png | adapt
- CM-MM-4 | P2 | Aus Quelltext (`matchmaking/page.tsx:98-100`): Hat jedes Admin-Team schon eine offene Lobby, rendert die Seite nichts statt des Formulars; nur die Karte "Eure Lobby ist offen" mit "Suche abbrechen" erscheint. Ein Captain mit zwei Teams oder einer zweiten Lobby erfährt nicht, warum das Formular fehlt. Im Seed nicht sichtbar. | Quelltext | clarify
- CM-MM-5 | P2 | Der Tab-Titel und die Überschrift heißen "Lobby aufmachen", die Reiterleiste "Teamspiel", die Zwischenüberschrift "Offene Suchen (0)", die Formularüberschrift "Neue Lobby für dein Team" (CM-GL-4). | captain_mobil_matchmaking.png | clarify

---

#### /mitspieler
Beleg: captain_mobil_mitspieler.png
Bewertung: Der Captain sieht oben das Formular "Ich suche ein Spiel" (Spielerfunktion), obwohl er eher Mitspieler sucht; die Liste (im Seed leer: "Gerade hat sich niemand eingetragen.") ist die Captain-Funktion und steht darunter. Aus Quelltext: bei Einträgen erscheint "Anfragen" nur für ihn als Admin.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 4, 6, Personas Casey/Jordan] (manuell) | Funde: Richtung unklar (GM-MS-3, CM-MI-1), kein Reiter aktiv (SM-GL-1) |
| audit [Teil: Dimension 1 A11y (Labels), 4 Responsive; metrics 8 von 40 Ziele unter 44 px, Höhe 921 px] (manuell) | Funde: natives Datumsfeld ohne Vorgabe, Button "Anfragen" 32 px (GM-MS-4, aus Quelltext) |
| distill [Teil: Information Architecture, Interaction Simplification] (manuell) | Funde: Formular und Filter gleichwertig untereinander; für den Captain wäre die Liste zuerst |
| clarify [Teil: Audit the language, Forms, Empty states] (manuell) | Funde: Leerzustand ohne nächsten Schritt (GM-MS-2), "Frag ihn an" ohne Erklärung, was passiert (CM-MI-2) |
| adapt [Teil: Mobile Adaptation Layout, Touch, Forms] (manuell) | Funde: Datum/Stadt im Zwei-Spalten-Raster, Felder 44 px, ok |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | nur overused-font (nicht gewertet); Quelltext `src/app/mitspieler`: `[]` |

Funde:
- GM-MS-2, GM-MS-3, GM-MS-4, SM-GL-1, SM-MI-3
- CM-MI-1 | P1 | Für den Captain steht das falsche Formular zuerst: "Ich suche ein Spiel" (Spieler trägt sich ein) vor der Liste, aus der er Spieler anfragen kann (`mitspieler/page.tsx:25-35`, Liste `:46-70`); der Captain kann sich zwar selbst eintragen, aber seine Rolle (Mitspieler finden) hat keine eigene Überschrift. Titel "Mitspieler gesucht" meint beide Richtungen. | captain_mobil_mitspieler.png | clarify/distill
- CM-MI-2 | P2 | "Anfragen" (`RequestPlayerButton`) fragt im Namen eines Admin-Teams an und lässt bei mehreren Teams wählen; was die angefragte Person sieht und wie sie antwortet, steht nirgends (aus Quelltext, im Seed keine Einträge). | Quelltext | clarify

---

#### /einladung/demoinvitex1
Beleg: captain_mobil_einladung-demoinvitex1.png
Bewertung: Klar und kurz ("Du wurdest eingeladen zu Demo Alpha", "Team beitreten"). Für den Captain, der in diesem Team schon Admin ist, falsch: die Seite erkennt das nicht (gleicher Fund wie SM-EL-1); sie ist hier zugleich die Seite, die der Captain beim Testen seines eigenen Links sieht.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristiken 1, 5, 9, Persona Jordan] (manuell) | Funde: Mitgliedschaft nicht erkannt (SM-EL-1, hier Admin; CM-EL-1), Reiter "Privatspiel" aktiv (GM-EL-1) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell; Button 44 px hoch) | keine neuen Funde |
| distill [Teil: Interaction Simplification] (manuell) | keine Funde (eine Handlung) |
| clarify [Teil: Audit the language, Success/Loading] (manuell) | Funde: Text sagt nicht, was beim Beitritt passiert (GM-EL-2); "5 Spieler im Kader" ohne Maximum |
| adapt [Teil: Mobile Navigation, Touch] (manuell) | Funde: Reiter "Privatspiel" fälschlich aktiv |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/demoinvitex1` | nur overused-font (nicht gewertet); Quelltext `src/app/einladung`: `[]` |

Funde:
- GM-EL-1, GM-EL-2, GM-EL-3, GM-EL-5, SM-GL-1, SM-EL-1, SM-EL-2
- CM-EL-1 | P1 | Der Captain sieht denselben Text "Du wurdest eingeladen zu Demo Alpha" mit Knopf "Team beitreten", obwohl er Admin des Teams ist (Einladung des eigenen Teams); ein Klick wird laut SM-EL-1 ohne Meldung auf die Teamseite geleitet (hier nicht geklickt, aus Quelltext übernommen). Der Captain kann seinen Link nicht "so sehen wie der Eingeladene" und fühlt sich fehlgeleitet. | captain_mobil_einladung-demoinvitex1.png | clarify

---

#### /einladung/ungueltig
Beleg: captain_mobil_einladung-ungueltig.png
Bewertung: Klar: "Link ungültig", Hinweis "Bitte frag den Team-Admin nach einem neuen" und Weg "Zur Startseite". Für den Captain, der selbst Admin ist, ist dieser Text die Antwort an einen Dritten und nützt ihm nichts (kein Weg zu "Neuen Einladungslink erstellen"); Reiter "Privatspiel" fälschlich aktiv.

| Befehl | Ergebnis |
|---|---|
| critique [Teil: Assessment A, Heuristik 9 (Fehler), Persona Jordan] (manuell) | Funde: Grund fehlt (GM-EU-1), Reiter falsch (GM-EU-2) |
| audit [Teil: Dimension 1 A11y, 4 Responsive; metrics 8 von 35 Ziele unter 44 px, Höhe 844 px] (manuell) | keine neuen Funde (Button 141x44 px) |
| distill [Teil: Content Simplification] (manuell) | keine Funde |
| clarify [Teil: Errors and permissions (was, warum, wie weiter)] (manuell) | Funde: GM-EU-1; für den Captain fehlt "Neuen Link erstellen" (CM-EU-1) |
| adapt [Teil: Mobile Navigation] (manuell) | Funde: Fußzeile und Reiter auf Fehlerseite (GM-EL-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/ungueltig` | nur overused-font (nicht gewertet); keine weiteren Funde |

Funde:
- GM-EU-1, GM-EU-2, GM-EL-3, SM-EU-1
- CM-EU-1 | P2 | Ein Captain, der einen widerrufenen oder abgelaufenen Link (Gültigkeit 7 Tage, Hilfe `:45`) selbst prüft, bekommt "Zur Startseite" statt "Zur Teamseite / Neuen Link erstellen". Zustand "abgelaufen" nicht gesehen (kein Token im Seed). | captain_mobil_einladung-ungueltig.png | clarify

---

### Zusammenfassung der Captain-Funde

- P0: keine neuen (X-01 gilt weiter für `/spieler` und `/teams`).
- P1 neu (CM): CM-GL-1, CM-GL-2, CM-GL-3, CM-GL-4, CM-ST-1, CM-TE-1, CM-MM-1, CM-MM-2, CM-MI-1, CM-EL-1.
- P2 neu (CM): CM-GL-5, CM-GL-6, CM-HI-1, CM-DS-1, CM-SU-1, CM-SP-1, CM-OF-1, CM-AP-1, CM-AP-2, CM-AP-3, CM-SN-1, CM-SN-2, CM-SN-3, CM-MM-3, CM-MM-4, CM-MM-5, CM-MI-2, CM-EU-1.



### Fundblatt Captain, Desktop

Rolle Captain (Team-Admin von Demo Alpha, Dev-Login), Gerät Desktop 1280 x 800 mit Maus und Tastatur, Dev-Server Port 3102. Nur gelesen und gemessen, kein Quelltext geändert, kein Commit. Aussagen, die der Screenshot nicht zeigt, sind mit "aus Quelltext" gekennzeichnet.

Zu den Durchgängen: `critique`, `audit`, `distill`, `clarify`, `adapt` sind Playbooks ohne Launcher-Befehl. Die Reference-Dateien (`critique.md` bis Zeile 819, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) sind einmal zu Beginn vollständig gelesen. Je Durchgang steht in eckigen Klammern der angewandte Teil. Die Prüfung ist manuell, kein Sub-Agent: critique ist degradiert (Assessment B = `detect`-Zeile, kein Overlay, kein `critique-storage`, da nur lesend). `context` lief einmal vorab. `detect --json --viewport 1280x800` lief je Seite per URL. `polish` war nicht nötig.

Aufnahme- und Messhinweise:
- Alle 23 Screenshots `captain_desktop_<seite>.png` sind einzeln angesehen. `/anmelden` und `/willkommen` zeigen identisch `/app` (Weiterleitung, URL `/app`, Höhe 1166).
- Zusatzaufnahmen (Playwright): `captain_desktop_extra_kontomenue.png` (Konto-Menü offen), `captain_desktop_extra_kontomenue-hover.png`, `captain_desktop_extra_kopfleiste-640.png` (200 % Zoom), `captain_desktop_extra_matchmaking-formular.png` (Formular im Blick), `captain_desktop_extra_einstellungen-profilfarbe.png`, `captain_desktop_extra_teamseite.png` (Teamseite des Captains, Gruppe Y, nur als Beleg für den Einladungsweg).
- Gemessen (alle 23 Seiten, metrics-captain.json, metrics2-captain.json, eigener Lauf): kein horizontaler Überlauf, je Seite genau eine `h1`, keine Konsolenfehler, alle 200. Fokusring: 2 px solid in Akzentfarbe (rgb 194,65,12) auf Primärbuttons.
- Spalte: `main` 768 px (x=256 bis 1024), Inhalt 720 px (x=280 bis 1000), je 280 px leer; Kopfleiste Logo x=280, Konto-Knopf endet x=1000.
- `detect` per URL sieht keine Sitzung: für `/anmelden`, `/willkommen` und alle `/app*`-Seiten liefert es die Gast-Anmeldeseite (nur `overused-font`, gewollt, nie gewertet). Für alle Seiten lief zusätzlich `detect` gegen den Quelltext (`src/app/app`, `matchmaking`, `mitspieler`, `einladung`, `suche`, `spieler`, `teams`, `offline`, `hilfe`, `agb`, `datenschutz`, `kontakt`, `impressum`, `hausordnung`, `unter-16`, `page.tsx`, `Header.tsx`, `UserMenu.tsx`, `Footer.tsx`, `GameModes.tsx`, `HowItWorks.tsx`, `OpenSearches.tsx`): jeweils `[]`. Die Kopfleiste mit Betrag und Konto-Menü sieht der URL-Lauf nur in der Gast-Variante.
- `detect` auf `/` und `/suche`: Timeout nach 30 s ("Navigation timeout of 30000 ms exceeded"), im zweiten Versuch wieder, Ausgabe `[]`. Vermerkt, keine Daten. Ersatz: Quelltext-Lauf und Playwright-Messung.
- `detect` misst im Dunkelmodus; der Screenshot-Stil ist hell. Der runde "N"-Knopf ist kein Fund.
- Nicht prüfbar mit dem Seed (0 Spiele, 0 offene Lobbys, keine Herausforderungen): volle Listen, eigene offene Lobby, Absenden der Formulare (bewusst nicht gesendet), Fehlermeldungen, Klick auf "Team beitreten" als Captain.
- Handy-Lücke Konto-Menü: das Menü wurde nur am Desktop fotografiert. Auf dem Handy ist es dieselbe Komponente (aus Quelltext `UserMenu.tsx`: 240 px breit, rechtsbündig); der Betragslink der Kopfleiste ist dort ausgeblendet (`hidden sm:inline`), das Menü ist dort der einzige Weg zum Guthaben. Aufnahme am Handy bleibt offen.

### Seitenübergreifende Desktop-Funde Captain (hier einmal beschrieben, von den Seiten referenziert)

Es gelten für den Captain am Desktop unverändert: X-07, X-12, X-14, X-17, GD-ALL-1 bis GD-ALL-8, SD-ALL-1 bis SD-ALL-9 (gemessen auch mit Captain-Sitzung bestätigt: Betrag in Kopfleiste und Menü, Menü ohne Pfeiltasten, Hover nur Randfarbe, kein `aria-current`, 200 %-Zoom, 7 Tab-Stopps vor dem Inhalt, `h1`-Größen 30/24 px, kurze Seiten), CM-GL-1 bis CM-GL-6. Handy-Funde X-06 entfallen am Desktop.

- CD-ALL-1 | P1 | Konto-Menü Captain, Klick-Zustand (gemessen, Screenshot): Klick öffnet ein 240 px breites Menü rechtsbündig unter dem Knopf (x=760 bis 1000), es überdeckt die Karte "Turnier". Kopfzeile "Demo Admin A", sieben Einträge: Mein Profil, Mein Bereich, Guthaben 0,00 €, Benachrichtigungen, Konto und Einstellungen, Hilfe, Abmelden. Der Captain sieht darin weder Rolle noch Team noch eine Captain-Handlung (Mitspieler einladen, Lobby aufmachen, Team verwalten); drei Namen für den eigenen Bereich (Mein Profil, Mein Bereich, Konto und Einstellungen). Der Name erscheint dreifach verschieden: Knopf "Demo", Menü "Demo Admin A", Seite "Hey Demo". Der Eintrag "Guthaben" fällt mit Vertrag 012 weg (MUSS WEG). Ergänzt SD-ALL-3, CM-GL-2. | captain_desktop_extra_kontomenue.png | critique/distill
- CD-ALL-2 | P2 | Konto-Menü, Tastatur (gemessen, Captain): Nach dem Öffnen bleibt der Fokus auf dem Knopf, Tab führt in das Menü ("Mein Profil"), ArrowDown bewegt den Fokus nicht, Escape schließt, der Fokus landet auf `body` statt auf dem Knopf. `role="menu"` ohne Pfeiltasten und ohne Fokusrückgabe (`UserMenu.tsx:61`, kein `aria-controls`). Gleich wie SD-ALL-2; Einträge 36 px hoch, Hover nur Hintergrund. | captain_desktop_extra_kontomenue-hover.png | audit/adapt
- CD-ALL-3 | P1 | Erreichbarkeit der Captain-Handlungen am Desktop (gemessen und aus Quelltext): (a) Lobby aufmachen ist überall erreichbar (Karte, Kachel, Fußzeile, `/suche`, Teamseite, `/app` als erster Inhalts-Tab-Stopp). (b) Einladungslink: nur auf der Teamseite ("Einladungslink erstellen", 2 Schritte: Teamzeile auf `/app`, dann Button) und in der offenen Lobby; auf `/app`, im Konto-Menü, in der Kopfleiste nicht. Die Teamzeile hat keinen Hover und keinen Hinweis, dass dort die Verwaltung liegt (SD-ALL-4). (c) Spielsuche mit festem Termin (`/app/suche/neu`): im Quelltext gibt es keinen einzigen Link auf die Seite ohne `?gegner=`; die Links "Revanche anfragen" (`spiele/[id]/page.tsx:70`) und der Gast-Link auf der Teamseite hängen `?gegner=` an, und die Seite leitet dann auf die Teamseite um (`suche/neu/page.tsx:13`). Der Captain erreicht das Formular nur über die direkte Adresse. Bestätigt und verschärft CM-GL-3. (d) Team verwalten: Kader, Logo, Einladung liegen auf der Teamseite (Gruppe Y), ohne Eintrag in Kopfleiste oder Menü. | captain_desktop_app.png, captain_desktop_extra_teamseite.png | critique/clarify
- CD-ALL-4 | P2 | Tastatur Captain (gemessen, Tab-Folge): sieben Stopps vor jedem Inhalt (Logo, drei Links, Glocke, Betrag, Konto-Menü), kein "Zum Inhalt". Auf `/app` ist der erste Inhaltsstopp "Lobby aufmachen" (für den Captain richtig, positiv), danach fünf Karten-Buttons, `wallet-card`, Kachel "Lobby aufmachen". Auf `/matchmaking` stehen drei Filter-Stopps (Stadt, Dauer, Filtern) vor dem Formular (Stopp 11). Auf `/app/suche/neu` ist der erste Stopp der Textlink "Matchmaking" vor dem Formular. Ergänzt SD-ALL-7. | captain_desktop_matchmaking.png | audit
- CD-ALL-5 | P2 | Kopfleiste Captain: keine Captain-Ebene. Teamspiel, Privatspiel, Turniere, Team, Hilfe fehlen in der Leiste (X-17, GD-ALL-1); "Offene Lobbys" (`/suche`) steht oben, die Aktion "Lobby aufmachen" nicht. Kleine Links 20 px hoch; bei 200 % Zoom bricht "Offene Lobbys" in zwei Zeilen und klebt am Logo (gemessen: 640 px, kein Überlauf, Höhe 57 px). | captain_desktop_extra_kopfleiste-640.png | adapt

---

#### /
Beleg: captain_desktop_start.png
Bewertung: Auch als angemeldeter Captain zeigt die Startseite den Einsteiger-Hero (Foto, Logo doppelt) mit "Team gründen" als einziger Primärhandlung, obwohl er schon ein Team hat; seine eigene Handlung "Lobby aufmachen" ist nur ein blasser zweiter Knopf, "Livescore" bricht allein in die zweite Zeile. Die Kopfleiste zeigt Betrag "0,00 €", der untere Teil spricht vom Aufladen des Guthabens.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last-Checkliste (4 Hero-Buttons + 5 Karten-Buttons), Heuristiken 1-10, Personas Jordan, Casey, Sam] (manuell) | Funde: X-02, X-03, CM-ST-1, GD-ST-1 (Livescore allein), GM-ST-2; Hero 502 px = 63 % des Fensters |
| audit [Dimension 1 A11y (Fokus, Tastatur), 4 Responsive; metrics: kein Überlauf, 13 von 44 Zielen unter 44 px, Höhe 1896] | Funde: CD-ALL-4, SD-ALL-1 (Betragslink), X-19, GM-ST-8; Hero-Absatz 103 Zeichen je Zeile (X-14); "Offene Lobbys ansehen" 198 x 50 px zweizeilig |
| distill [Assess Current State, Information Architecture, Layout, Content] (manuell) | Funde: Hero und Karten doppeln Ziele (X-03), Zahlenkacheln "2/10/0" (GM-ST-9), Logo doppelt (GM-ST-7) |
| clarify [Audit the language, Message hierarchy, Actions] (manuell) | Funde: "Kostenlos anmelden, bezahlt wird nur deine Hallenmiete" und "Du lädst dein Guthaben auf" (X-05, MUSS WEG); "Team gründen" statt "Meine Spiele" (CM-ST-1) |
| adapt [Desktop Adaptation (Layout, Content, Max-Width), Navigation] (manuell) | Funde: Spalte 720 px (X-17), Karten-Buttons ohne gemeinsame Grundlinie (GD-ST-2), Hero-Buttons 3+1 (GD-ST-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Timeout 30 s (zweimal), Ausgabe `[]`; Quelltext `page.tsx`, `GameModes.tsx`, `HowItWorks.tsx`, `Header.tsx`: `[]`. Frühere Funde X-14, X-15 gelten |

Funde:
- X-02, X-03, X-05, X-14, X-15, X-17, X-19, CM-ST-1, GM-ST-1, GM-ST-2, GM-ST-7, GM-ST-8, GM-ST-9, GD-ST-1, GD-ST-2, GD-ST-3, SD-ALL-1, CD-ALL-1, CD-ALL-5 (gelten unverändert)

---

#### /hilfe
Beleg: captain_desktop_hilfe.png
Bewertung: Aufklappliste mit 19 Fragen in fünf Gruppen, sauber, aber 1976 px lange Einspaltenliste; die Captain-Wege (Einladungslink, Lobby, Ergebnis) stecken in einzelnen Antworten, eine Gruppe "Für Captains" fehlt. Der Block "Geld und Guthaben" beschreibt das Altmodell.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristik 10 Hilfe, Personas Jordan, Alex, Sam] (manuell) | Funde: CM-HI-1 (keine Captain-Gruppe, keine Frage zum festen Termin), GM-HI-3 (Begriffsmix), GM-HI-4 (keine Suche) |
| audit [A11y (Zusammenfassungen per Tastatur), 4 Responsive; 15 von 37 Zielen unter 44 px, Höhe 1976; aufgeklappt bis 114 Zeichen je Zeile bei 12-14 px] | Funde: SD-HI-1; 19 `summary` per Tastatur bedienbar, Fokusring vorhanden (positiv) |
| distill [Information Architecture (Progressive Disclosure), Layout Simplification] (manuell) | Funde: Inhaltsübersicht oder zwei Spalten statt 19 Zeilen (GD-HI-1) |
| clarify [Audit the language, Message hierarchy] (manuell) | Funde: Abschnitt "Geld und Guthaben" (GM-HI-1, MUSS WEG), "Unter Guthaben (oben in der Leiste ...)" (GM-HI-2), "Matchmaking/Spielsuche/Gegnersuche/Lobby" (CM-GL-4) |
| adapt [Desktop Adaptation (Layout, Interaction, Content), Navigation] (manuell) | Funde: Hilfe nicht in der Kopfleiste, nur im Menü und der Fußzeile (GD-ALL-1, CD-ALL-5) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hilfe` | nur overused-font (gewollt); Fragen zugeklappt, daher keine Zeilenlänge (gemessen siehe SD-HI-1) |

Funde:
- GM-HI-1, GM-HI-2, GM-HI-3, GM-HI-4, GD-HI-1, GD-ALL-7, SD-HI-1, CM-HI-1, CM-GL-4 (gelten unverändert)

---

#### /agb
Beleg: captain_desktop_agb.png
Bewertung: Lesbarer nummerierter Rechtstext mit "Entwurf"-Kasten; die Absätze laufen über 720 px mit 103 bis 110 Zeichen je Zeile. §1, §3, §4 beschreiben das Altmodell (Guthaben, kostenlos abmelden).

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken, Personas Jordan, Sam] (manuell) | Funde: Entwurfshinweis (GM-AG-1), dichter §3 (GM-AG-3) |
| audit [A11y (Kontrast, Überschriftenfolge), 4 Responsive; 12 von 34 Zielen klein, Höhe 1020] | Funde: line-length 106 bis 110 Zeichen (X-14, GD-ALL-7); h1, h2 sauber |
| distill [Content, Layout Simplification] (manuell) | Funde: Spalte auf etwa 65ch begrenzen (GD-ALL-7); sonst keine |
| clarify [Audit the language, Message hierarchy] (manuell) | Funde: Altmodell §1, §3, §4 (GM-AG-2, MUSS WEG) |
| adapt [Desktop Adaptation (Layout, Max-Width)] (manuell) | Funde: Zeilenlänge (X-14); keine neuen |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/agb` | 4 x line-length (106, 109, 110, 108 Zeichen); overused-font nicht gewertet |

Funde:
- X-14, GM-AG-1, GM-AG-2, GM-AG-3, GD-ALL-7 (gelten unverändert)

---

#### /datenschutz
Beleg: captain_desktop_datenschutz.png
Bewertung: Neun gegliederte Abschnitte mit Entwurfskasten und Platzhalter beim Verantwortlichen, Zeilen 103 bis 109 Zeichen. Für den Captain relevant: "deine Team-Admins" sehen die Zuverlässigkeit, ohne dass steht, was ein Admin sonst über Mitglieder sieht.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken, Personas Jordan, Sam] (manuell) | Funde: GM-DS-1 (Platzhalter), GM-AG-1; CM-DS-1 (Admin-Einsicht unklar, Text prüfen) |
| audit [A11y, 4 Responsive, 5 Integrität; Höhe 1404] | Funde: line-length (GD-ALL-7), Einzelwörter (GD-DS-1); Link "Einstellungen" trägt (positiv) |
| distill [Information Architecture, Content] (manuell) | keine neuen Funde |
| clarify [Audit the language, Message hierarchy] (manuell) | Funde: "Die Betreiberangaben werden vor dem Start eingetragen" (GM-DS-1); "Zahlungen: Guthaben, Buchungen, Belege" (GM-DS-2, MUSS WEG) |
| adapt [Desktop Adaptation (Layout, Max-Width)] (manuell) | Funde: 103 bis 109 Zeichen (GD-ALL-7) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/datenschutz` | 8 x line-length (103 bis 109), 2 x straggler ("Bewertungen.", "Cookie-Banner."); overused-font nicht gewertet |

Funde:
- GM-DS-1, GM-DS-2, GD-DS-1, GD-ALL-7, GM-AG-1, CM-DS-1 (gelten unverändert)

---

#### /impressum
Beleg: captain_desktop_impressum.png
Bewertung: Kurz und lesbar, zeigt aber die Konfigurationsnamen OPERATOR_NAME, OPERATOR_ADDRESS, OPERATOR_EMAIL in dunklerer, größerer Schrift als den Rest, dazu den Entwurfskasten. Als Pflichtseite so nicht zeigbar; Fußzeile bei y=447, darunter 350 px leer.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristik 2, 9] (manuell) | Funde: Konfigurationsnamen sichtbar (GM-IM-1) |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Errors] (manuell) | Funde: GM-IM-1 |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: leere Fläche unter der Fußzeile (GD-ALL-3, SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/impressum` | nur overused-font (nicht gewertet) |

Funde:
- GM-IM-1, GM-AG-1, GD-ALL-3, SD-ALL-9 (gelten unverändert)

---

#### /hausordnung
Beleg: captain_desktop_hausordnung.png
Bewertung: Kurz und gegliedert (Fair bleiben, Inhalte melden, Folgen). Ein Satz zur Sperre nennt "offenes Guthaben und Reservierungen".

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken, Persona Jordan] (manuell) | keine Funde (Entwurf: GM-AG-1) |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Message hierarchy] (manuell) | Funde: "offenes Guthaben und Reservierungen" (GM-HO-1, MUSS WEG) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: Einzelwörter (GD-HO-1), leere Fläche (GD-ALL-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/hausordnung` | 2 x straggler ("Bewertungen.", "aus."); overused-font nicht gewertet |

Funde:
- GM-HO-1, GD-HO-1, GM-AG-1, GD-ALL-3 (gelten unverändert)

---

#### /kontakt
Beleg: captain_desktop_kontakt.png
Bewertung: Zwei Karten, aber ohne gültige Kontaktadresse (Platzhalter "Einstellung OPERATOR_EMAIL") und mit dem Altmodell-Punkt "Auszahlung deines Guthabens". Für den Captain ist dies der einzige Weg bei Ergebnisstreit oder Sperre und führt ins Leere.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 9, 10, Personas Jordan, Sam] (manuell) | Funde: kein Kontaktweg (GM-KO-1) |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Actions] (manuell) | Funde: GM-KO-1; "Auszahlung deines Guthabens" (GM-KO-2, MUSS WEG) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: nur Mailto statt Formular (GM-KO-3), leere Fläche (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/kontakt` | nur overused-font (nicht gewertet) |

Funde:
- GM-KO-1, GM-KO-2, GM-KO-3, SD-ALL-9 (gelten unverändert)

---

#### /unter-16
Beleg: captain_desktop_unter-16.png
Bewertung: Kurze zentrierte Meldung (448 px Spalte, `h1` 24 px) mit einem Weg zurück. Mit Captain-Sitzung widerspricht sie der Kopfleiste ("Demo" angemeldet, Betrag), der Text sagt "Dein Konto wurde wieder gelöscht".

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristik 1, 2, Personas Jordan, Riley] (manuell) | Funde: Text unabhängig von der Sitzung (SD-U1-1, GD-U1-1), Sackgasse (GM-U16-1) |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Errors and permissions] (manuell) | Funde: "Konto wurde wieder gelöscht" ohne Folge (GM-U16-1) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: zentriert, linke Kante x=416 (SD-ALL-8, GD-ALL-5); Fußzeile y=317 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/unter-16` | straggler "gespeichert." (24 %); overused-font nicht gewertet |

Funde:
- GM-U16-1, SD-U1-1, GD-U1-1, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

#### /anmelden
Beleg: captain_desktop_anmelden.png (zeigt `/app`, Weiterleitung)
Bewertung: Für den angemeldeten Captain nur eine stille Weiterleitung auf "Mein Bereich"; das Bild ist die Zielseite, siehe `/app`.

| Befehl | Ergebnis |
|---|---|
| critique [Heuristik 1 Systemstatus, 3 Kontrolle, Persona Jordan] (manuell) | Funde: Weiterleitung ohne Rückmeldung (SM-AN-1) |
| audit [A11y (Landmarken), 4 Responsive; Endseite `/app`: kein Überlauf, 1 h1] | keine neuen Funde |
| distill [Information Architecture, Clear next action] (manuell) | keine Funde |
| clarify [Audit the language, Errors and permissions] (manuell) | Funde: kein Satz zum Grund (SM-AN-1) |
| adapt [Desktop Adaptation Navigation] (manuell) | keine neuen Funde; Zielseite siehe `/app` |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/anmelden` (Gast-Sicht) + Quelltext | nur overused-font; Quelltext `[]` |

Funde:
- SM-AN-1, X-12 (gelten unverändert)

---

#### /willkommen
Beleg: captain_desktop_willkommen.png (zeigt `/app`, Weiterleitung)
Bewertung: Ein eingerichteter Captain wird sofort auf `/app` geleitet; das Onboarding-Formular war nicht prüfbar (Sitzung ohne `onboardedAt` nötig).

| Befehl | Ergebnis |
|---|---|
| critique [Heuristik 1, 3, Persona Jordan] (manuell) | keine Funde |
| audit [A11y, 4 Responsive] (Endseite wie `/app`) | keine neuen Funde |
| distill [Information Architecture] (manuell) | keine Funde |
| clarify [Audit the language] (manuell) | keine Funde |
| adapt [Desktop Adaptation Layout] (manuell) | keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/willkommen` (Gast-Sicht) + Quelltext | nur overused-font; Quelltext `[]` |

Funde:
- keine neuen; nicht prüfbar: Onboarding-Formular

---

#### /suche
Beleg: captain_desktop_suche.png
Bewertung: Am Desktop passt die Filtermaske als 3 x 2-Raster in den Bildschirm; für den Captain steht "Lobby aufmachen" (177 x 36 px) richtig an erster Stelle, danach aber ein zweiter vollbreiter Primärbutton "Filtern" (686 x 44 px). Die Liste ist im Seed leer; der Leerzustand verweist auf dieselbe Handlung.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (6 Felder, 2 Primärbuttons), Heuristiken 1-10, Personas Jordan, Alex, Riley] (manuell) | Funde: X-10, GD-SU-1 (zwei Primärbuttons), GM-SU-1 ("anderer Teams"), GM-SU-2 ("Live"); Captain-Weg "Lobby aufmachen" klar (positiv, CM-SU-1) |
| audit [A11y (Tastatur, Fokus, Beschriftungen), 4 Responsive; 13 von 42 Zielen klein] | Funde: "Lobby aufmachen" 36 px hoch (GM-SU-4); `h1` enthält "Live"-Marke im Text ("Offene Lobbys anderer Teams ● Live"); Felder beschriftet, Fokusring vorhanden (positiv) |
| distill [Information Architecture, Interaction Simplification] (manuell) | Funde: vier der sechs Filter nachrangig (GM-SU-3) |
| clarify [Audit the language, Empty states, Actions] (manuell) | Funde: "Mach eine Lobby für dein Team auf" (GM-SU-6, für den Captain richtig), "Stärke ab / bis" (GM-SU-5); "Annehmen" für Captain nicht prüfbar (aus Quelltext nur für Admin-Teams, CM-SU-1) |
| adapt [Desktop Adaptation (Layout, Interaction, Content), Navigation] (manuell) | Funde: Kopfleiste markiert "Offene Lobbys" nicht (SD-ALL-5), `h1` 24 px (SD-ALL-8), Fußzeile y=541 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Timeout 30 s (zweimal), `[]`; Quelltext `suche`, `OpenSearches.tsx`: `[]`. X-10 gilt |

Funde:
- X-10, GM-SU-1 bis GM-SU-6, GD-SU-1, CM-SU-1, SD-ALL-5, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

#### /spieler
Beleg: captain_desktop_spieler.png
Bewertung: Suchzeile (Feld, Stadt, Button) funktioniert am Desktop, zehn Zeilen à 78 px mit Name, Stadt, Position und rechts "0 Spiele · 0 Tore". Die eigene Karte ("Demo Admin A") ist nicht markiert, der Captain kann in der Liste nichts mit den Spielern tun (kein "Anfragen", keine Markierung, wer ein Spiel sucht).

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 1, 4, 6, Personas Jordan, Casey] (manuell) | Funde: eigene Karte unmarkiert (SM-SP-1), Karten nicht unterscheidbar (GM-SP-1), CM-SP-1 |
| audit [A11y (Kontrast, Tastatur), 4 Responsive; 12 von 47 Zielen klein, Höhe 1239] | Funde: Platzhalter "Name suchen" 4,1:1 (X-16); je Zeile ein Tab-Stopp, Fokusring vorhanden |
| distill [Information Architecture, Content] (manuell) | Funde: "0 Spiele · 0 Tore" als Rauschen (GM-SP-1) |
| clarify [Audit the language] (manuell) | Funde: Hinweis "nur öffentliche Profile" fehlt (GM-SP-2) |
| adapt [Desktop Adaptation (Layout, Interaction: Hover, Content)] (manuell) | Funde: kein Hover an Zeilen (SD-ALL-4), Statistik 600 px vom Namen entfernt (GD-ALL-8) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | low-contrast Platzhalter "Name suchen" 4,1:1 (Dunkelmodus); Quelltext `spieler`: `[]` |

Funde:
- X-16, GM-SP-1, GM-SP-2, SM-SP-1, CM-SP-1, GD-ALL-6, GD-ALL-8, SD-ALL-4 (gelten unverändert)

---

#### /teams
Beleg: captain_desktop_teams.png
Bewertung: Zwei Teams in klaren Zeilen, Seite fast leer (Fußzeile y=410). Der Satz "Schau dir Kader und Bilanz an und fordere sie heraus" verspricht eine Handlung, die auf dieser Seite keinen Knopf hat; das eigene Team "Demo Alpha" ist unmarkiert. Für den Captain der wichtigste Einstieg zum Herausfordern, aber ohne Hinweis, dass es auf der Teamseite geschieht.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 1, 2, Personas Jordan, Casey] (manuell) | Funde: CM-TE-1 (kein "Herausfordern"), eigenes Team unmarkiert (SM-TE-1) |
| audit [A11y, 4 Responsive; Höhe 800] | Funde: Platzhalter "Teamname" 4,1:1 (X-16); tote Fallunterscheidung "Spieler"/"Spieler" (GM-TE-2, aus Quelltext) |
| distill [Content Simplification] (manuell) | keine neuen Funde |
| clarify [Audit the language] (manuell) | Funde: "noch ohne Spiel" statt Stärke (GM-TE-1) |
| adapt [Desktop Adaptation (Layout, Hover, Content)] (manuell) | Funde: kein Hover (SD-ALL-4), Fußzeile y=410 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | low-contrast Platzhalter "Teamname" 4,1:1; Quelltext `teams`: `[]` |

Funde:
- X-16, GM-TE-1, GM-TE-2, SM-TE-1, CM-TE-1, SD-ALL-4, SD-ALL-9 (gelten unverändert)

---

#### /offline
Beleg: captain_desktop_offline.png
Bewertung: Kurze ehrliche Meldung ohne Handlung, mit voller Kopfleiste und Fußzeile, die ohne Netz ins Leere führen; sagt dem Captain nicht, ob am Spielfeldrand erfasste Daten erhalten bleiben.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 1, 9, Persona Riley] (manuell) | Funde: keine Handlung (SM-OF-1, GM-OF-1), CM-OF-1 |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Information Architecture] (manuell) | Funde: volle Navigation ohne Netz (GM-OF-2) |
| clarify [Audit the language, Errors] (manuell) | Funde: "geht es weiter" ohne Knopf (GM-OF-1) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: `h1` 24 px bei x=448 (SD-ALL-8), Fußzeile y=277, darunter leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/offline` | nur overused-font; Quelltext `offline`: `[]` |

Funde:
- GM-OF-1, GM-OF-2, SM-OF-1, CM-OF-1, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

#### /app
Beleg: captain_desktop_app.png
Bewertung: Die Seite zeigt dem Captain dieselben Karten wie dem Spieler; für ihn ist die Reihenfolge fachlich richtig (erste Handlung "Lobby aufmachen", erster Tab-Stopp im Inhalt), aber sie ist dreifach vorhanden (Karte, Kachel, Fußzeile) und fünf Primärbuttons stehen gleichzeitig im Blick. "Meine Spiele" beginnt bei y=738, "Meine Teams" mit der eigenen Teamzeile (Rolle nur als 12-px-"Team-Admin") bei y=865 bis 973, also zur Hälfte unter dem 800-px-Fenster; ein Weg zum Einladungslink fehlt hier.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (5 Primärbuttons, 5 Kacheln), Heuristiken 1-10, Personas Jordan, Casey, Alex] (manuell) | Funde: X-04, CM-GL-2, CM-AP-1 (Rolle/Team nicht auf einen Blick), CM-AP-2 ("Team gründen" gleich laut wie Hauptkarten), CD-AP-1 |
| audit [A11y (Tastatur, Fokus, Zielgrößen), 4 Responsive, 5 Integrität; 13 von 47 Zielen klein, Höhe 1166; Tab-Folge gemessen] | Funde: "Team gründen" 146 x 36 px (CM-GL-5), "Offene Lobbys ansehen" 198 x 50 px zweizeilig (GD-ST-2), Test-IDs `wallet-card`, `team-color-dot` vorhanden; Fokusring vorhanden (positiv) |
| distill [Assess Current State, Information Architecture (ein primäres Ziel), Layout Simplification] (manuell) | Funde: Handlungen doppelt (X-04), Guthaben-Karte entfällt mit 012 (X-05), Meine Spiele und Teams vor die Karten (SM-AP-1, SD-AP-2), SD-AP-3, SD-AP-4 (Lücke 235 px in der Kachelreihe) |
| clarify [Audit the language, Empty states, Actions] (manuell) | Funde: "Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" (X-05, MUSS WEG); Leerzustand nennt Captain-Wege ohne Knopf (CM-AP-3); "Der Captain öffnet eine Lobby" (SM-ST-2) mit Captain-Perspektive richtig |
| adapt [Desktop Adaptation (Layout, Interaction, Content, Max-Width), Navigation] (manuell) | Funde: Spalte 720 px (X-17), Hover auf Teamzeile ohne Wirkung (gemessen: Rand, Hintergrund, Schatten identisch, SD-ALL-4); `h1` 24 px (SD-ALL-8) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` (Gast-Sicht) + Quelltext `app`, `GameModes.tsx` | nur overused-font; Quelltext `[]` |

Funde:
- X-04, X-05, X-17, X-18, CM-GL-1, CM-GL-2, CM-GL-5, CM-AP-1, CM-AP-2, CM-AP-3, SM-AP-1, SD-AP-2, SD-AP-3, SD-AP-4, SD-ALL-1, SD-ALL-4, SD-ALL-8, CD-ALL-3, CD-ALL-4 (gelten unverändert)
- CD-AP-1 | P1 | Der Captain-Alltag (Team, Rolle, Einladung, nächste Herausforderung) ist am Desktop nicht im ersten Bildschirm: Im 1280 x 800-Fenster belegen Titel, drei Karten (y=193 bis 462), Guthaben-Karte (y=487 bis 560) und Kacheln (y=585 bis 700) die obere Hälfte; Teamzeile y=895. Die Teamzeile selbst ist die Tür zu Kader, Einladungslink und Lobby (Beleg: Teamseite mit "Einladungslink erstellen"), sieht aber aus wie jede andere Karte, ohne Hover (SD-ALL-4) und ohne Beschriftung "verwalten". Ergänzt CM-GL-1, CM-AP-1. | captain_desktop_app.png, captain_desktop_extra_teamseite.png | distill/clarify

---

#### /app/suche/neu
Beleg: captain_desktop_app-suche-neu.png
Bewertung: Das Formular ist am Desktop gut bedienbar (Felder 414 px breit, Dauer und Stadt nebeneinander, Datum mit `min`-Vorgabe 24 h voraus, Primärbutton 414 x 44 px), sitzt aber in einer dritten Spaltenbreite von 448 px (x=416 bis 864) und endet knapp unter dem Fenster (Button y=900). Die Seite hat keinen Einstieg außer der direkten Adresse (CD-ALL-3), das Auswahlfeld "Team" zeigt bei nur einem Team ein volles Auswahlfeld.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (sieben Felder), Heuristiken 3, 5, 9, Personas Jordan, Sam, Riley] (manuell) | Funde: X-11, CM-SN-1 (kein Abbrechen/Zurück), CM-SN-2 (Pflicht/optional nicht unterschieden), CD-SN-1 |
| audit [A11y (Beschriftungen, Tastatur), 4 Responsive; 13 von 44 Zielen klein, Höhe 1154; Felder gemessen: `required` auf Team und Anstoß, `min`=morgen, alle beschriftet] | Funde: "Mindestens 24 Stunden im Voraus" nur 12 px grau (X-11); Tab-Folge beginnt mit Textlink "Matchmaking", Datumsfeld besteht aus 5 Tab-Stopps (nativ); Fokusring vorhanden |
| distill [Information Architecture, Interaction Simplification (Smart defaults)] (manuell) | Funde: Wiederholen und Sichtbarkeit gleichrangig zwischen Pflichtfeldern (CM-SN-2); Team-Auswahl bei einem Team überflüssig |
| clarify [Audit the language, Forms, Errors, Success states] (manuell) | Funde: "Matchmaking" im Satz vs. Seite "Lobby aufmachen" (CM-GL-4); "Privat (nur über Link)" ohne Hinweis, wo der Link entsteht (aus Quelltext `RequestForm.tsx:83`); Fehler/Erfolg nicht gesehen (CM-SN-3) |
| adapt [Desktop Adaptation (Layout, Interaction, Max-Width), Navigation] (manuell) | Funde: Spalte 448 px, `h1` bei x=416 statt x=280 (SD-SN-1), Fußzeile y=985 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` (Gast-Sicht) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- X-11, CM-GL-3, CM-GL-4, CM-SN-1, CM-SN-2, CM-SN-3, SD-SN-1, SD-ALL-8, CD-ALL-3 (gelten unverändert)
- CD-SN-1 | P2 | Desktop-Beleg zu X-11: Die Mindestvorlauf-Regel ist mit `min` im Feld (`2026-11-12T14:15`) technisch vorbereitet, der Hinweistext steht aber 12 px klein unter dem Feld und das native Feld zeigt "dd.mm.yyyy --:--" ohne Vorgabe; Schrittweite 15 Minuten (`step=900`) ist im Feld nicht erkennbar. Das Absenden-Ergebnis (Weiterleitung, Meldung) war nicht prüfbar (nicht abgesendet). | captain_desktop_app-suche-neu.png | clarify

---

#### /app/einstellungen
Beleg: captain_desktop_app-einstellungen.png
Bewertung: 1967 px lange Einspaltenseite mit zwei Formularen (Profil, Benachrichtigungen), vier vollbreiten Balken (686 bis 720 px) und kleinem Textauslöser "Konto löschen". Fachlich vollständig; für den Captain sind die Admin-Benachrichtigungen richtig, Teamverwaltung gehört nicht hierher und ist nicht zu finden.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (11 Checkboxen), Heuristiken 3, 5, 9, Personas Casey, Sam] (manuell) | Funde: X-08, CM-GL-6 ("Neue Aufgabe für Admins" meint Plattform-Admins) |
| audit [A11y (Beschriftungen, Zielgrößen), 4 Responsive, 5 Integrität; 34 von 69 Zielen klein, Höhe 1967] | Funde: Checkboxen 20 px (SD-ES-2); Profilfarbe CD-ES-1; Spitzname-Platzhalter "z. B. Der Hammer" und Rückennummer ohne Platzhalter; Beschriftungen vorhanden (positiv) |
| distill [Information Architecture (Progressive Disclosure), Interaction Simplification] (manuell) | Funde: drei Aktionsgruppen in einer Spalte, zwei Speichern-Buttons (X-08, SD-ES-4); am Desktop zwei Spalten oder Reiter denkbar |
| clarify [Audit the language, Forms, Errors] (manuell) | Funde: "Push ist auf diesem Server noch nicht eingerichtet" (X-08); Hinweiszeile "Absagen, Ergebnissen und Zahlungen" (SM-ES-2, prüfen); Konto löschen ohne Guthabenbezug, Hilfe widerspricht (SD-ES-3) |
| adapt [Desktop Adaptation (Layout, Interaction, Max-Width)] (manuell) | Funde: vollbreite Buttons (SD-ES-4), `h1` 24 px (SD-ALL-8); Name/Stadt/Position in zwei Spalten gut genutzt (positiv) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` (Gast-Sicht) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- X-08, SM-ES-1 (für Captain teilweise berechtigt), SM-ES-2, SM-ES-3, SD-ES-2, SD-ES-3, SD-ES-4, CM-GL-6, SD-ALL-8 (gelten unverändert)
- CD-ES-1 | P2 | Profilfarbe, Zustand "gewählt" (gemessen): Das gewählte Grün hat einen 2 px weißen Rand (`rgb(255,255,255)`), die übrigen sechs 2 px transparent, kein Schatten, kein Haken; auf dem hellen Panel (#f1f5f2) ist der weiße Ring im Screenshot praktisch unsichtbar, die Auswahl ist nicht erkennbar. Verschärft SD-ES-1 (dort als "hellgrauer Ring" beschrieben). Schalter 28 x 28 px mit `radiogroup` und Namen. | captain_desktop_extra_einstellungen-profilfarbe.png | audit

---

#### /app/benachrichtigungen
Beleg: captain_desktop_app-benachrichtigungen.png
Bewertung: Leerzustand "Noch keine Benachrichtigungen." in einer Karte, oben rechts ein Textlink "Einstellungen"; die Seite endet bei y=203, darunter 600 px leer. Aus Quelltext (Seed leer): gefüllte Liste, Herausforderungen und Beitrittsanfragen für den Captain nicht angesehen.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 1, 10, Personas Jordan, Riley] (manuell) | Funde: Leerzustand ohne Beispiel und Hinweis (SM-BE-1) |
| audit [A11y, 4 Responsive; Höhe 800] | Funde: Glocke mit `aria-label` (positiv, 44 x 44 px); Textlink "Einstellungen" 20 px hoch |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Empty states] (manuell) | Funde: SM-BE-1; Art "Zahlungen und Guthaben" in `notification-types.ts:43` (aus Quelltext, MUSS WEG prüfen) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: Fußzeile y=203, 600 px leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` (Gast-Sicht) + Quelltext `app` | nur overused-font; Quelltext `[]` |

Funde:
- SM-BE-1, SD-ALL-9 (gelten unverändert)

---

#### /app/guthaben
Beleg: captain_desktop_app-guthaben.png
Bewertung: Die ganze Seite beschreibt das Altmodell (Guthaben, Aufladen, Rabattcode, Verlauf, Belege) und widerspricht sich: "Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts" steht direkt über einem aktiven "Jetzt bezahlen"-Button mit Schnellwahl und Rabattcode-Feld. Gesamte Seite fällt mit Vertrag 012 weg.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (Betrag, Rabattcode, Vorschrift), Heuristiken 1, 2, 5, Personas Jordan, Casey] (manuell) | Funde: Widerspruch Text und Button (SD-GU-1), Vier-Schritte-Text vor dem Aufladen (X-09) |
| audit [A11y, 4 Responsive, 5 Integrität; 13 von 41 Zielen klein, Höhe 1247] | Funde: Hinweise 12 px mit 114 Zeichen je Zeile (SD-GU-2); Betrag doppelt (Schnellwahl und Feld, X-09) |
| distill [Information Architecture, Content Simplification] (manuell) | Funde: leere Kästen "Verlauf", "Belege", Rabattcode ohne Erklärung (X-09) |
| clarify [Audit the language, Forms, Errors, Empty states] (manuell) | Funde: Altmodell-Texte (X-05, MUSS WEG); Betreibertext bei fehlendem Anbieter (SM-GU-1, aus Quelltext `page.tsx:85`) |
| adapt [Desktop Adaptation (Layout, Interaction, Content)] (manuell) | Funde: Feld 686 px für zweistellige Zahl neben 223-px-Buttons (SD-GU-2), `h1` 24 px mit 36-px-Betrag |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` (Gast-Sicht) + Quelltext `guthaben` | nur overused-font; Quelltext `[]` |

Funde:
- X-05, X-09, SM-GU-1, SM-GU-2, SD-GU-1, SD-GU-2, SD-ALL-1 (gelten unverändert; alles MUSS WEG)

---

#### /matchmaking
Beleg: captain_desktop_matchmaking.png (Zusatz: captain_desktop_extra_matchmaking-formular.png)
Bewertung: Die Seite heißt "Lobby aufmachen" und spricht den Captain direkt an. Am Desktop ist das Formular gut lesbar (Datum, Von, Bis je 223 px nebeneinander, Stärke von/bis auf einer Linie, Button 686 x 44 px), aber es steht ganz unten: Überschrift "Neue Lobby für dein Team" bei y=565, die Datumsfelder bei y=1046, der Button bei y=1137. Davor liegen Einleitung, vier Schritte, Filter und leere Liste.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (Prozesstext vor Formular), Heuristiken 2, 3, 5, 9, Personas Jordan, Casey, Riley] (manuell) | Funde: CM-MM-1 (Formular zuletzt; am Desktop 560 px statt 1000 px bis dorthin), CM-MM-5 (Namen), GM-MM-3 (zwei Seiten für offene Lobbys), CM-MM-4 (Formular fehlt bei offener Lobby, aus Quelltext) |
| audit [A11y (Beschriftungen, Tastatur), 4 Responsive; 16 von 48 Zielen klein, Höhe 1391; Felder gemessen: Team, Stadt, Dauer, Stärke, Hinweis, Tag, Von, Bis, alle beschriftet, `required` auf Tag/Von/Bis] | Funde: Filter-Selects und "Filtern" 36 px (GM-MM-4, CM-GL-5); "+ Weiteres Zeitfenster" nur Textlink 20 px hoch; drei Filter-Stopps vor dem Formular (CD-ALL-4); Fokusring vorhanden |
| distill [Information Architecture (Progressive Disclosure), Layout Simplification] (manuell) | Funde: sieben Zeilen Prozesstext und "Hallen-Veto" ohne Erklärung vor den Daten (GM-MM-5); Team-Auswahl bei einem Team überflüssig |
| clarify [Audit the language, Empty states, Forms, Actions] (manuell) | Funde: "Mach eine Lobby für dein Team auf" (GM-MM-6); Zeitfenster-Erklärung gut (positiv), "Zeitfenster 1" ohne Erklärung der Reihenfolge; "Lobby" vs. "Spielsuche" (CM-GL-4) |
| adapt [Desktop Adaptation (Layout, Interaction, Content), Navigation] (manuell) | Funde: Zeilenlänge 99 bis 119 Zeichen (GD-ALL-7), Einzelwort "hier." (GD-MM-2); CM-MM-2 und CM-MM-3 treffen am Desktop nicht zu (Datum lesbar, Spalten gleich hoch, positiv) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | line-length ~99 Zeichen; straggler "hier."; Quelltext `matchmaking`: `[]` |

Funde:
- GM-MM-3, GM-MM-4, GM-MM-5, GM-MM-6, GD-MM-1, GD-MM-2, GD-ALL-7, CM-GL-4, CM-GL-5, CM-MM-1, CM-MM-4, CM-MM-5 (gelten unverändert; CM-MM-2 und CM-MM-3 nur Handy)
- CD-MM-1 | P2 | Desktop-Beleg zu CM-MM-1 (gemessen): Beim Laden endet das 800-px-Fenster mitten im Formular (Team, Stadt, Dauer, Stärke sichtbar ab y=643, Datumsfelder und Button darunter); der Captain muss etwa 340 px scrollen, um die Kernangabe (Tag und Zeitfenster) und den Button zu sehen. Ein Sprungziel (Link "Zum Formular", Anker) fehlt, `id="offen"` existiert nur für die Liste. | captain_desktop_extra_matchmaking-formular.png | adapt/distill

---

#### /mitspieler
Beleg: captain_desktop_mitspieler.png
Bewertung: Oben steht das Formular "Ich suche ein Spiel" (Spieler trägt sich ein), der Captain-Weg (Spieler anfragen) steckt in der leeren Liste darunter; zwei Primärbuttons "Eintragen" (686 px) und "Filtern" konkurrieren. Titel "Mitspieler gesucht" meint beide Richtungen, die Seite ist weder auf `/app` noch im Menü verlinkt (nur Fußzeile).

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Kognitive-Last (Single focus), Heuristiken 2, 5, 6, Personas Jordan, Casey] (manuell) | Funde: CM-MI-1 (falsche Richtung zuerst), zwei Primärbuttons (GD-MS-1), GM-MS-3 |
| audit [A11y (Beschriftungen, Tastatur), 4 Responsive; 12 von 40 Zielen klein, Höhe 800] | alle Felder beschriftet (positiv); "Anfragen" nur bei vorhandenen Einträgen (CM-MI-2, aus Quelltext) |
| distill [Interaction Simplification, Layout Simplification] (manuell) | Funde: Stadtfilter 626 px für eine Wahl (GD-MS-1) |
| clarify [Audit the language, Forms, Empty states] (manuell) | Funde: Sichtbarkeit und Dauer des Eintrags nicht gesagt (SM-MI-2), Leerzustand ohne nächste Handlung (GM-MS-2), kein Link auf `/app` (SM-MI-3) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: Formular nutzt zwei Spalten gut (positiv); Fußzeile y=568 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | nur overused-font; Quelltext `mitspieler`: `[]` |

Funde:
- GM-MS-2, GM-MS-3, GM-MS-4, GD-MS-1, SM-MI-2, SM-MI-3, CM-MI-1, CM-MI-2, SD-ALL-9 (gelten unverändert)
- Nicht prüfbar (Seed leer): gefüllte Liste mit "Anfragen", Zustand nach "Eintragen" (nicht abgesendet).

---

#### /einladung/demoinvitex1
Beleg: captain_desktop_einladung-demoinvitex1.png
Bewertung: Klare zentrierte Karte (Team, Stadt, Kadergröße, 384 px breiter Button), aber der Captain ist Admin des Teams: die Seite sagt "Du wurdest eingeladen zu Demo Alpha" mit "Team beitreten". Er kann seinen eigenen Link nicht als Prüfer ansehen. Klick nicht ausgeführt (aus Quelltext: `JoinForm` ruft `joinTeamAction`, Verhalten für Admin nicht geprüft; für den Spieler siehe SD-EL-1).

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristiken 1, 5, 9, Persona Jordan] (manuell) | Funde: CM-EL-1 (Mitgliedschaft nicht erkannt), keine Rückmeldung nach Klick (SD-EL-1) |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde (Button 384 x 44 px, Fokusring vorhanden) |
| distill [Information Architecture] (manuell) | keine Funde (ein Ziel, ein Button) |
| clarify [Audit the language, Errors and permissions] (manuell) | Funde: "voll", "abgelaufen" nur aus Quelltext (SM-EL-2); "Du wurdest eingeladen" für Mitglied falsch (CM-EL-1) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: `h1` 30 px bei x=448 (SD-ALL-8), Fußzeile y=301, darunter leer (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/demoinvitex1` | nur overused-font; Quelltext `einladung`: `[]` |

Funde:
- CM-EL-1, SD-EL-1, SM-EL-2, GM-EL-3, GM-EL-5, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

#### /einladung/ungueltig
Beleg: captain_desktop_einladung-ungueltig.png
Bewertung: Knappe, verständliche Meldung mit Weg zur Startseite; für den Captain, der einen eigenen widerrufenen Link prüft, führt der Weg auf die Gast-Startseite statt zur Teamseite mit "Neuen Link erstellen". Seite endet bei y=285.

| Befehl | Ergebnis |
|---|---|
| critique [Assessment A, Heuristik 9, Persona Jordan] (manuell) | Funde: Grund und Weg fehlen (GM-EU-1), CM-EU-1 |
| audit [A11y, 4 Responsive; Höhe 800] | keine neuen Funde |
| distill [Content Simplification] (manuell) | keine Funde |
| clarify [Audit the language, Errors] (manuell) | Funde: "Bitte frag den Team-Admin" ist für den Captain selbst irreführend (CM-EU-1); Zustand "abgelaufen" nicht gesehen (aus Quelltext `page.tsx:20`) |
| adapt [Desktop Adaptation (Layout, Content)] (manuell) | Funde: `h1` 24 px zentriert (SD-ALL-8), Fußzeile y=285 (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/ungueltig` | nur overused-font; Quelltext `einladung`: `[]` |

Funde:
- GM-EU-1, CM-EU-1, SD-ALL-8, SD-ALL-9 (gelten unverändert)

---

### Zusammenfassung der Funde (nur Desktop-Neufunde Captain)

| Priorität | Anzahl | IDs |
|---|---|---|
| P0 Bedienung kaputt | 0 | (X-01 betrifft nur das Handy) |
| P1 verwirrend | 3 | CD-ALL-1, CD-ALL-3, CD-AP-1 |
| P2 Optik | 7 | CD-ALL-2, CD-ALL-4, CD-ALL-5, CD-SN-1, CD-ES-1, CD-MM-1 (plus Verweise auf SD-/CM-Funde) |

Wichtigste Erkenntnisse: Das Konto-Menü des Captains nennt weder Rolle noch Team und enthält "Guthaben" (CD-ALL-1); die Spielsuche mit festem Termin hat im Quelltext keinen einzigen Link, der das Formular öffnet (CD-ALL-3, "Revanche"-Link leitet auf die Teamseite um); der Einladungslink liegt nur auf der Teamseite, die Teamzeile sieht aus wie jede Karte (CD-AP-1); das Lobby-Formular beginnt am Desktop erst bei y=565 und die Datumsfelder bei y=1046 (CD-MM-1); die gewählte Profilfarbe hat einen weißen Ring auf hellem Grund (CD-ES-1).

---



## Nachlauf mit Seed

Nach dem Seed (`scripts/seed-frontend.mts`, nur lokale Dev-DB `soccaz_w2`, Testkonten `@test.local`) wurden die vorher nicht prüfbaren Zellen nachgeholt: Onboarding, abgelaufener Einladungslink, gefüllte Listen, Fehlerzustand (Karte abgelehnt), Formular-Absenden, Konto-Menü des Captains am Handy. Gleiche Regeln wie oben: jeder Screenshot angesehen, je Zelle die fünf Befehle critique, audit, distill, clarify, adapt einzeln (vier Sub-Agents in Serie, ein Dev-Server, ein Browser), `detect` je Seite.

**Zähler: angesehen 203 von 203** Screenshots im Nachlauf (96 Raster-Zellen: Gast 16, Neuer Nutzer 6, Spieler mit Team 26, Spieler ohne Team 10, Captain Rot 26, Captain Grün 12; dazu 107 Zusatzaufnahmen: Onboarding-Schritte, Konto-Menüs, Formular-Zustände, Treffer und Leerzustände, Fehlerzustand mit Betroffenem und Dritten).

| Blatt | Rollen | Angesehen | Neue Funde (P0 / P1 / P2) |
|---|---|---|---|
| N1 | Gast, Neuer Nutzer (inkl. Onboarding) | 49 von 49 | 1 / 26 / 22 |
| N2 | Spieler mit Team, Spieler ohne Team | 64 von 64 | 0 / 12 / 8 |
| N3 | Captain Rot | 58 von 58 | 0 / 15 / 12 |
| N4 | Captain Grün (Fehlerzustand), Betroffener, Dritte | 32 von 32 | 1 / 7 / 2 |
| Summe | | 203 von 203 | 2 / 60 / 44 |

Wichtigste neue Funde aus dem Nachlauf:
- N4-FZ-2 (P0): Bei fehlgeschlagener Abbuchung entsteht keine Benachrichtigung (nur Audit-Eintrag), `/app/benachrichtigungen` bleibt leer, obwohl die Einstellungen "Zahlungen bekommst du immer" versprechen.
- N4-FZ-1, -3, -4 (P1): Der Fehlerzustand ist auf `/app`, im Konto-Menü, in den Einstellungen und auf der Guthaben-Seite unsichtbar; es gibt außerhalb der Lobby keinen Ort "Karte erneuern"; die Guthaben-Seiten sagen "Zahlungen noch nicht eingeschaltet, Spiele kostenlos", das Gegenteil des Zustands.
- N4-FZ-5, -6, -8 (Gruppe Y, nur Beleg, nicht bewertet): Die Lobby zeigt dem Captain nur ein kleines Wort "Abbuchung fehlgeschlagen" ohne Grund und ohne "Karte erneuern"; Dritte sehen den Fehlerzustand namentlich, entgegen 012 AC-12/AC-20; ohne den Schalter `card_payments_enabled` ist der Zustand in der Lobby unsichtbar. Weitergabe an die Gruppe Y.
- N1-SP-1 (P0): Suchbegriff nach dem Absenden unleserlich, 48-px-Feld (bestätigt X-01).
- N1: Startzähler "8 Teams" statt 6 sichtbarer (private Spiel-Teams zählen mit); Onboarding: Geburtsdatum unter 16 löscht das Konto ohne Rückfrage, Fehlermeldungen bleiben nach der Korrektur stehen, der Anzeigename wird ohne Hinweis öffentlich, die Einladung ist auf `/willkommen` nicht mehr sichtbar.
- N2-AP-1, -2, -6: Kasten "Meine aktuellen Spiele" dreifach auf `/`, `/suche`, `/app`; dasselbe Spiel heißt im Kasten "Bereit machen und bezahlen", in der Liste "Wartet auf Spieler"; ein neues Mitglied sieht Spiele, in denen es nicht steht. N2-BE-1: "Team beitreten" endet ohne Rückmeldung.
- N3-AP-5, -FM-2, -FM-3, -EA-1: eine per Formular erstellte Spielsuche erscheint auf `/app` nirgends; Zeitfenster-Fehler erst unter dem Knopf; nach dem Aufmachen einer Lobby verschwindet das Formular, die Lobby erscheint doppelt; bei abgelaufenem Link wird der Captain an "den Team-Admin" verwiesen, also an sich selbst.

Neue MUSS-WEG-Stellen aus dem Nachlauf (zusätzlich zur Tabelle oben): Guthaben-Link "0,00 €" in der Kopfleiste schon auf `/willkommen`; Guthabenkarte auf `/app` beim frischen Konto; Fristtext und "Jetzt bezahlen" auf `/app/guthaben`; Zahlungshinweis in den Einstellungen; auf der Lobbyseite "Bezahlen und Bereitmachen" und "bezahlt" sowie das Statuswort "Bereit machen und bezahlen" (Gruppe Y, nur Beleg); Guthaben-Satz neben fehlgeschlagener Abbuchung. Details in den Tabellen der Nachlauf-Blätter unten.

Weiterhin nicht prüfbar (bleibt Lücke): echter Google-Login (nicht automatisierbar, der Dev-Login ersetzt ihn), Benachrichtigungen mit Einträgen und Guthaben-Verlauf (Seed legt keine an; außer der Benachrichtigung an den Captain nach einem Beitritt), echtes Karten-Erneuern (kein Stripe), Nachzahl-Weg und "Anteil übernehmen" (M3 nicht gebaut), Versand von E-Mail und Push, mehr als 30 Spieler oder Teams, der Browser-Hinweis bei Pflichtfeldern (für Server-Fehler wurde die Browser-Prüfung abgeschaltet). `detect` per URL bleibt auf `/` und `/suche` im Timeout (Ersatz Quelltext + Playwright). Seed-Änderungen: `seed-neu@test.local` wurde durch den Onboarding-Test gelöscht und neu angelegt, `seed-neu-desktop@test.local` zusätzlich angelegt, Spieler 17 wurde Mitglied von Seed Rot; der Seed wurde danach neu geladen. Der Schalter `card_payments_enabled` steht in der lokalen DB auf `false` (Zeile vorhanden).

### Nachlauf: neue MUSS-WEG-Zeilen

| Seite | Rolle | Fundstelle | Beleg |
|---|---|---|---|
| /willkommen | Neuer Nutzer (Desktop) | Kopfleiste: Betragslink "0,00 €" (Guthaben) schon vor dem Abschluss des Onboardings, `Header.tsx:53-55`, Test-ID `header-wallet`; bisher nur für eingerichtete Konten belegt | neu_desktop_willkommen.png, neu_desktop_onboarding-01-formular.png |
| /einladung/seed-team-gueltig (Weiterleitung auf /willkommen) | Neuer Nutzer (Desktop) | wie oben, Guthaben-Link "0,00 €" in der Kopfleiste auf der Einladungs-Weiterleitung | neu_desktop_einladung-seed-team-gueltig.png |
| /app (frisches Konto nach Onboarding) | Neuer Nutzer (Handy und Desktop) | Karte "Guthaben 0,00 € / Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" und Kopfleistenlink "0,00 €" (Desktop) auf der ersten Seite eines neuen Kontos; die Rolle "Neuer Nutzer" ist im Dokument bisher nicht belegt (X-05 gilt für Spieler und Captain) | neu_mobil_onboarding-11-erfolg-app.png, neu_desktop_onboarding-11-erfolg-app-nochmal.png |
| /suche, /spieler, /teams, /matchmaking, /mitspieler, /einladung/* | Gast | keine neuen Fundstellen für Guthaben, Aufladen, Rabattcode oder Altmodelltexte; die Startseite ("Du lädst dein Guthaben auf") steht als GM-ST-1 schon im Dokument | gast_mobil_start.png |
| / (eingeloggt) | Spieler mit Team (Handy, Desktop) | "Was kostet das?" und "In vier Schritten ... Kostenlos anmelden, bezahlt wird nur deine Hallenmiete. Du lädst dein Guthaben auf" erscheint auch für angemeldete Nutzer mit Team (Altmodelltext, bisher nur für Gäste belegt, GM-ST-1) | spieler01_desktop_start.png, spieler01_mobil_start.png |
| /app/guthaben | Spieler mit Team (Handy, Desktop) | Vier-Schritte-Text "Du lädst Geld auf (ab 5 Euro) ... Meldest du dich bis 24 Stunden vorher ab, bekommst du alles sofort zurück" (Altmodell, neue Fundstelle mit Fristzusage; Frist-Entscheid siehe D8 Mindestvorlauf 24 h Team, 1 h Privat), Aktion "Jetzt bezahlen" und Rabattcode-Feld bei "Gerade sind Zahlungen noch nicht eingeschaltet" | spieler01_desktop_app-guthaben.png, spieler01_mobil_app-guthaben.png |
| Konto-Menü, Kopfleiste | Spieler mit Team (Handy: Menü; Desktop: Menü und Leiste) | Eintrag "Guthaben 0,00 €" im Menü und Betragslink "0,00 €" in der Leiste, jetzt per Zusatzbild belegt (Menü nur geöffnet, Zeilen 222 x 36 px); bisher nur aus Quelltext (SM-GL-2, SD-ALL-1) | spieler01_mobil_extra-kontomenue.png, spieler01_desktop_extra-kontomenue.png |
| /app (nach dem Beitritt) | Spieler ohne Team, dann Mitglied (Handy, Desktop) | Karte "Guthaben 0,00 € / Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" bleibt unverändert, auch als der Kasten "Bereit machen und bezahlen" auf Zahlung hinweist: zwei Aussagen auf einer Seite (neu belegt) | spieler17_mobil_extra-app-nachher.png, spieler17_desktop_extra-app-nachher.png |
| /app/einstellungen | Spieler mit Team (Handy, Desktop) | "Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer" (Prüfen, kein sicherer MUSS WEG, SM-ES-2), unverändert mit Seed | spieler01_desktop_app-einstellungen.png |
| /, /suche, /spieler, /teams, /matchmaking, /mitspieler, /einladung/*, /app/suche/neu, /app/benachrichtigungen | Spieler mit/ohne Team | keine weiteren neuen Fundstellen für Guthaben, Aufladen, Rabattcode oder Altmodelltexte (Kopfleisten-Betrag "0,00 €" steht schon in SD-ALL-1) | alle Grid-Bilder |
| /lobby/offen/<id> (Ergebnis von /matchmaking) | Captain | Satz „Bezahlen und Bereitmachen geht, sobald ein Gegner da ist und Uhrzeit und Halle feststehen. Nur wenn alle bezahlt haben, können alle auf Bereit drücken. Mindestens 4 Spieler brauchst du für ein Spiel.“ (Quelltext lobby/offen/[entryId]/page.tsx:86): Zahlung vor Bereit ist ein Altmodell zum Kartenmodell (Vertrag 012); nicht im Dokument, nicht in den Seed-Blättern | captainrot_mobil_extra-matchmaking-erfolg.png, captainrot_desktop_extra-matchmaking-erfolg.png |
| /lobby/offen/<id> | Captain | Statuswort „Bereit machen und bezahlen“ im Kasten auf /, /suche, /app für #1010 und #1018 (bei Captain mit Karte; Seed-Blatt 2 nennt es nur für Spieler, N2-AP-2/N2-AP-6): ist ein Zahlungsschritt, den die Abbuchung bei Bestätigung ersetzen soll | captainrot_desktop_app.png, captainrot_mobil_start.png |
| Konto-Menü (alle Seiten) | Captain | Eintrag „Guthaben 0,00 €“ mit Betrag (UserMenu.tsx): im Dokument als Spieler-Handy geführt, jetzt am Captain-Handy bestätigt (die offene Lücke); keine neue Stelle im Quelltext | captainrot_mobil_extra-kontomenue.png |
| /app/guthaben | Captain | Bezahlknopf „Jetzt bezahlen“ aktiv neben dem Satz „Gerade sind Zahlungen noch nicht eingeschaltet“: schon im Dokument (11 Treffer), hier nur bestätigt | captainrot_mobil_app-guthaben.png |
| /app/guthaben | Captain, Spieler | Satz „Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts, dein Guthaben bleibt aber erhalten.“ steht neben einer fehlgeschlagenen Karten-Abbuchung (Seite im Dokument, dieser Widerspruch neu) | captaingruen_mobil_app-guthaben.png, spieler09_mobil_app-guthaben.png |
| /lobby/<id> (Kartenmodus an) | Captain, Spieler | Fortschrittsleiste „3 Bezahlen“ (Schrittname des Guthabenmodells) neben „Jedes Team macht seine Spieler bereit (Karte hinterlegt).“; Gruppe Y, nur Beleg | captaingruen_desktop_extra-lobby1026-kartenmodus-ein.png |
| /lobby/<id> (Kartenmodus aus) | Captain | Satz „Jedes Team macht seine Spieler bereit und bezahlt.“ ohne Kartenstatus; Gruppe Y, nur Beleg | captaingruen_desktop_extra-lobby1026-kartenmodus-aus.png |
| /app | Captain, Spieler | Statuswort „Bereit machen und bezahlen“ (mygame.ts:60) für ein Spiel mit Kartenmodell und fehlgeschlagener Abbuchung; im Dokument für Spieler genannt, hier mit Fehlerzustand bestätigt | captaingruen_desktop_app.png |

### Nachlauf: Fundblätter

Je Zelle: Beleg, Bewertung, fünf Durchgänge (Befehl, angewandter Teil, Ergebnis) und Funde. Vier Blätter: N1 Gast und Neuer Nutzer, N2 Spieler, N3 Captain Rot, N4 Captain Grün (Fehlerzustand). Der Abschnitt MUSS WEG am Ende jedes Blatts steht oben zusammengeführt.

#### Nachlauf-Blatt N1 Gast, Neuer Nutzer (inkl. Onboarding)

Stand: Nachlauf der Gruppe-X-Analyse mit geladenem Seed (Teams Seed Rot/Blau/Grün/Gelb, vier Lobbys, Turniere, Einladungen `seed-team-gueltig` und `seed-team-abgelaufen`), Dev-Server Port 3102, Engine 0.1.19 über den Launcher. Nur gelesen und gemessen, kein Quelltext geändert. Gast = keine Sitzung, Neuer Nutzer = `seed-neu@test.local` ohne Profil. Kennungen: N1 = Nachlauf 1, Kürzel je Seite (ST Start, SU Suche, SP Spieler, TE Teams, MM Matchmaking, MI Mitspieler, EG Einladung gültig, EA Einladung abgelaufen, WK Willkommen, EI Einladung als Neuer, OB Onboarding-Schritte). Vorhandene Funde (X-nn, GM-, GD-) werden nur referenziert.

#### Methode und Grenzen

- Die fünf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollständig gelesen. critique/audit/distill/clarify/adapt haben keinen Launcher-Befehl: sie laufen manuell nach den Dateien, je Durchgang steht in eckigen Klammern der angewandte Teil. critique ist wie in der ersten Runde degradiert (kein Overlay, kein getrennter Sub-Agent für Assessment B; Assessment B = `detect`).
- `context` (Launcher) lief einmal: PRODUCT.md geladen (Plattform web, Zielgruppe Spieler und Captains am Handy, Kartenmodell nach Vertrag 012).
- `detect --json --viewport <WxH> <URL>` lief je Seite gegen die Gast-Sicht. Auf `/` und `/suche` Timeout nach 30 s, bei beiden Viewports auch im Wiederholungslauf (Dauerverbindung). Ersatz: Quelltext-Läufe (`src/app/page.tsx`, `src/app/suche`, `src/app/spieler`, `src/app/teams`, `src/app/matchmaking`, `src/app/mitspieler`, `LobbyBoard.tsx`, `Header.tsx`: je keine Funde) und Playwright-Messung. Für `/willkommen`, `/app`, `/einladung/[token]` (Sitzungsseiten) Lauf gegen den Quelltext: keine Funde.
- Ganzseitige Handy-Bilder zeigen die feste untere Navigation und den Kopfbalken mitten im Bild (Aufnahme-Artefakt) und das runde N (Next-Overlay): kein Fund.
- Onboarding: Der Dev-Login ersetzt Google. Die Strecke lief mit `seed-neu@test.local` (Handy) und `seed-neu-desktop@test.local` (Desktop, zweites Testkonto, weil der Schritt "unter 16" das Konto löscht und der Erfolgsschritt es einrichtet). Die Browser-Pflichtprüfung (`required`) wurde für die Serverfehler-Schritte per Skript abgeschaltet (`noValidate`), sonst erreicht ein Absenden den Server nicht. Das native Browser-Bubble sieht man nur im Schritt 02.
- Nicht prüfbar mit dem Seed: gefüllte Mitspielerliste (`/mitspieler` ohne Einträge), Zustand "mehr als 30 Spieler/Teams" (Pager nur an Seite 2 von `/spieler` angesehen, dort verdeckt die Navigation ihn im Ganzseitenbild), Konto-Menü der Neuen (nicht geöffnet), "Bitte warten…" des Absende-Knopfs (zu kurz), echter Google-Login.

#### Gast, Handy (390 x 844)

##### / (Gast, Handy)
Beleg: gast_mobil_start.png (390 x 5015, gesehen auf 200 x 2576 verkleinert, Texte per Quelltext gegengeprüft)
Bewertung: Mit gefüllten Daten wird die Startseite sehr lang (5015 px): nach Hero, Karten und Erklärung folgen vier Lobby-Karten mit je zehn Namen. Die Zahlenkacheln (8 Teams, 35 Spieler, 3 Spiele) passen nicht zu dem, was man darunter sieht.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Kognitive-Last-Checkliste, Persona Riley und Casey, Severity] Funde: Zählerkacheln gegen sichtbare Listen (N1-ST-1), bestätigte Lobby unter "Offene Lobbys" (N1-ST-3), öffentliche Klarnamen (N1-ST-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] Funde: Ampelpunkte haben sr-only-Label (gut, PlayerLight.tsx:28-30); Rot für "In der Lobby" liest sich als Fehler (N1-ST-6); Teilen-Link 32 x 16 px (N1-SU-3); 56 von 90 Zielen unter 44 px (Messung), kein Überlauf |
| distill (reference/distill.md, manuell) | [Teil: Assess Current State, Information Architecture, Remove Redundancy] Funde: dieselbe Lobby-Liste wie `/suche` auf der Startseite wiederholt, nur mit 4 Einträgen getestet (N1-ST-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Audit the language, Actions, Empty states] Funde: Zähler ohne Erklärung, Siegchance-Zeile (N1-ST-5); Altmodelltexte stehen schon in GM-ST-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Content Strategy, Touch] Funde: vier Karten je rund 330 px hoch, keine Kürzung mit "Alle ansehen" sichtbar (N1-ST-2); sonst GM-ST-2, GM-ST-5 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Navigation timeout nach 30 s, im Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf (src/app/page.tsx, src/components/LobbyBoard.tsx, Header.tsx): keine Funde, plus Playwright-Zielmessung (metrics-gast.json) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-ST-1 | P1 | Zählerkacheln "8 Teams, 35 Spieler, 3 Spiele" widersprechen der Seite: `/teams` listet 6 Teams, `/suche` zeigt 4 Lobbys. Ursache im Quelltext `HowItWorks.tsx:14`: Teams zählen ohne `kind = team` (zwei unsichtbare Spiel-Teams `seed-privat-a/b` zählen mit), Spieler zählen auch Admin-, Betreiber- und Demokonten. Vertrauensverlust beim ersten Blick. | gast_mobil_start.png, gast_mobil_teams.png | critique, clarify
- N1-ST-2 | P1 | Die Lobby-Liste steht ungekürzt am Seitenende (vier Karten von je rund 330 px, Seite 5015 px hoch). Bei vielen Lobbys wird die Startseite endlos; `BoardSection` hat eine `limit`-Option, auf der Startseite war keine Kürzung oder "Alle ansehen" zu sehen (nur mit 4 Einträgen getestet). | gast_mobil_start.png | distill, adapt
- N1-ST-3 | P1 | Lobby #1003 mit Status "Bestätigt" (5 von 5 bereit, grüne Punkte) steht unter "Offene Lobbys" mit "noch 1 Platz frei" und "Zur Lobby". Ein Gast erkennt nicht, ob er noch beitreten kann oder nur zusehen darf. | gast_mobil_start.png, gast_mobil_suche.png | critique
- N1-ST-4 | P1 | Klarnamen von Privatpersonen ("Anton Testmann" usw., je Lobby bis zu zehn) sind für Gäste ohne Anmeldung sichtbar, auch auf `/spieler`. Beim Onboarding gibt es keinen Hinweis darauf (siehe N1-OB-8). Datenschutzfrage mit Mindestalter 16: Produktentscheid nötig. | gast_mobil_start.png, gast_mobil_spieler.png | critique
- N1-ST-5 | P2 | "Siegchance nach Elo: Seed Grün 61 % · Seed Gelb 39 %" in etwa 11 px Schrift, darüber ein einzelner Balken in Akzentfarbe ohne Zuordnung zu Seite oder Teamfarbe. | gast_mobil_start.png | clarify, critique
- N1-ST-6 | P2 | "In der Lobby" und "noch nicht bereit" sind rote Punkte; Rot liest sich als Fehler oder Absage, der Normalzustand "wartet" wirkt alarmierend. | gast_mobil_suche.png | critique

##### /suche (Gast, Handy)
Beleg: gast_mobil_suche.png (390 x 3133)
Bewertung: Mit Daten zeigt sich, dass die Filtermaske den ersten Bildschirm füllt und die erste Lobby-Karte erst unter 640 px beginnt. Die Karten selbst sind gut lesbar (Nummer, Status, zwei Kader, Ampel).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristiken 1, 6, 8, Persona Casey] Funde: Filter vor Liste (bestätigt X-10), Lobby-Status-Mix (N1-ST-3), Klarnamen (N1-ST-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 4 Responsive, Zielgrößen] Funde: Link "Teilen" 32 x 16 px, vier Stück (N1-SU-3); 56 von 88 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Progressive disclosure] Funde: sechs Filterfelder vor vier Einträgen (X-10); Filter "Stärke ab/bis" bei vier Lobbys ohne Nutzen (N1-SU-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Actions] Funde: "Lobby aufmachen" für Gast ohne Anmeldehinweis (GM-ST-3); Titel "Offene Lobbys anderer Teams" (N1-SU-4); Begriffe Lobby/Suche (N1-SU-1) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Layout, Touch] Funde: Auswahlfeld "Art" abgeschnitten (X-10 bestätigt); Karte bis Karte ohne Anker zurück zu den Filtern |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Navigation timeout nach 30 s, im Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf src/app/suche: keine Funde, plus Playwright-Zielmessung (metrics-gast.json) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SU-1 | P1 | Dieselben vier Lobbys heißen hier "Offene Lobbys", auf `/matchmaking` steht dazu "Offene Suchen (0)" und "Gerade hat kein Team eine Lobby geöffnet". Zwei Begriffe (Lobby, Suche) für verwandte Dinge, die Zahlen widersprechen sich (siehe N1-MM-1). | gast_mobil_suche.png, gast_mobil_matchmaking.png | clarify
- N1-SU-2 | P1 | Erste Lobby-Karte beginnt erst bei etwa y = 640 von 844 sichtbaren Pixeln, davon verdeckt die untere Navigation einen Streifen. Filter nach Stärke ("ab/bis") braucht bei wenigen Lobbys niemand. Ergänzt X-10 mit Daten. | gast_mobil_suche.png | distill, adapt
- N1-SU-3 | P1 | "Teilen" ist ein Textlink von 32 x 16 px (Messung), je Karte einer, direkt neben "Zur Lobby"; am Handy kaum zu treffen. Teilen per WhatsApp ist laut PRODUCT.md ein Kernweg. | gast_mobil_suche.png | audit, adapt
- N1-SU-4 | P2 | Der Titel "Offene Lobbys anderer Teams" setzt voraus, dass man ein eigenes Team hat; für Gäste und Neue passt "Offene Lobbys" besser. | gast_mobil_suche.png | clarify

##### /spieler (Gast, Handy)
Beleg: gast_mobil_spieler.png (390 x 3175); Zusatz gast_mobil_extra_spieler-leer.png, gast_mobil_extra_spieler-suchbegriff-lang.png, gast_mobil_extra_spieler-seite2.png
Bewertung: Die gefüllte Liste (30 Zeilen, 3175 px) zeigt: jede Zeile ist gleich gebaut, die untere Hälfte besteht aus Konten mit "0 Spiele · 0 Tore". Das Suchfeld bleibt auf 48 px gequetscht, ein getippter Begriff ist danach nicht mehr lesbar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Riley (Randfälle), Heuristik 9] Funde: Suchbegriff unleserlich (N1-SP-1), Leerzustand ohne Weg (N1-SP-4), Konten ohne Spiele (N1-SP-2) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive] Funde: Platzhalter-Kontrast 4,1:1 (X-16 bestätigt per detect); Pager-Knopf "Weiter" 36 px hoch (N1-SP-5); 8 von 66 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Content Simplification, Remove Redundancy] Funde: 30 gleich aussehende Zeilen ohne Staffelung (N1-SP-3) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Forms, Errors] Funde: "Keine Spieler gefunden." nur Text (N1-SP-4); "Seite 1" ohne Gesamtzahl (N1-SP-3) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Layout, Touch] Funde: X-01 mit Daten bestätigt (Suchfeld 48 px); "Profil" leuchtet unten (X-06) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | Exit 2: Funde low-contrast (Platzhalter "Name suchen" 4,1:1, = X-16) und overused-font (Plus Jakarta Sans, 98 % des Textes; Schrift ist in DESIGN.md gesetzt, hier nur vermerkt) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-1 | P0 | Nach dem Absenden zeigt das Suchfeld nur drei Zeichen ("zzz", "Tes" bei einem langen Begriff); man sieht nicht, wonach gesucht wurde, und kann den Begriff nicht prüfen oder korrigieren. Verstärkt X-01 (dort Eintippen, hier Kontrolle). | gast_mobil_extra_spieler-leer.png, gast_mobil_extra_spieler-suchbegriff-lang.png | critique, adapt
- N1-SP-2 | P1 | Das Spielerverzeichnis führt Admin-, Hallenbetreiber-, Veranstalter- und Demokonten ("Seed Admin", "Seed Hallenbetreiber", "Demo Admin A", "Alpha Spieler 1") als Spieler mit "0 Spiele · 0 Tore"; 12 von 30 Zeilen der Seite 1 sind solche Konten. Betriebs- und Testkonten gehören nicht in die öffentliche Liste. | gast_mobil_spieler.png, gast_mobil_extra_spieler-seite2.png | critique
- N1-SP-3 | P2 | Alle Zeilen sehen gleich aus (Name, Stadt · Position, Spiele · Tore); kein Team, keine Elo, keine Teamfarbe, keine Gesamtzahl ("Seite 1" und "Weiter" ohne "von N"). | gast_mobil_spieler.png | distill, clarify
- N1-SP-4 | P1 | Leerer Treffer: "Keine Spieler gefunden." als nackter Satz, ohne Hinweis auf Schreibweise, ohne "Suche zurücksetzen" und ohne Alternative (Teams, Mitspieler gesucht). | gast_mobil_extra_spieler-leer.png | clarify
- N1-SP-5 | P2 | "Weiter" und "Zurück" im Pager sind 36 px hoch (`!min-h-9`), unter den 44 px für Touch. | gast_mobil_spieler.png | adapt

##### /teams (Gast, Handy)
Beleg: gast_mobil_teams.png (390 x 1107); Zusatz gast_mobil_extra_teams-leer.png
Bewertung: Sechs Teams ohne Teamfarbe in gleichen Karten; die Reihenfolge ist nach Spielen sortiert, die Elo daneben steigt nicht, es wirkt wie eine Rangliste und ist keine. Das Suchfeld ist wieder 48 px breit.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristiken 2, 4, 8] Funde: Sortierung nicht erkennbar (N1-TE-2), Zählung 6 gegen 8 Teams auf Start (N1-ST-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive] Funde: Platzhalter "Teamname" 4,1:1 (X-16); 7 von 41 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Visual Simplification] keine Funde (klare Liste, ein Gewicht je Zeile) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] Funde: "Keine Teams gefunden." ohne Weg (N1-TE-3) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 bestätigt; "Teamspiel" leuchtet unten (X-06) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | Exit 2: low-contrast (X-16) und overused-font; keine neuen Befunde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-TE-1 | P2 | Zeilen ohne Teamfarbe und ohne Wappen (Richtung E arbeitet mit Teamfarben, vgl. X-18): sechs Karten sehen gleich aus. | gast_mobil_teams.png | critique
- N1-TE-2 | P2 | Sortierung nach Anzahl Spiele, dann Name: Elo steht rechts als Zahl (Blau 1120, Gelb 960, Grün 1040, Rot 1180) und ist nicht geordnet; die Liste erweckt den Eindruck einer Rangliste. Teams "noch ohne Spiel" stehen am Ende. | gast_mobil_teams.png | clarify
- N1-TE-3 | P1 | Leerer Treffer: "Keine Teams gefunden." ohne "Suche zurücksetzen" und ohne "Team gründen" für Angemeldete. | gast_mobil_extra_teams-leer.png | clarify

##### /matchmaking (Gast, Handy)
Beleg: gast_mobil_matchmaking.png (390 x 1186); Zusatz gast_mobil_extra_matchmaking-ende-viewport.png
Bewertung: Der Gast liest eine Captain-Anleitung, danach "Offene Suchen (0)" und eine leere Liste; die einzige Handlung "Anmelden und Lobby aufmachen" steht ganz unten (Oberkante 789 px, Navigation ab 787 px), im ersten Bildschirm nur durch Scrollen erreichbar. Im Ganzseitenbild verdeckt die Navigation sie (Artefakt), im Zusatzbild am Seitenende ist sie sichtbar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Heuristik 1 und 2] Funde: Widerspruch "0 Suchen" gegen vier Lobbys (N1-MM-1), Gast als "Captain" angesprochen (N1-MM-2) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 4 Responsive] Funde: Auswahl "Alle Dauern" abgeschnitten (N1-MM-3); 10 von 36 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Information Architecture, Clear next action] Funde: erst vier Schritte Text, dann leere Liste, dann Knopf (N1-MM-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Actions] Funde: Leerzustand sagt "Mach eine Lobby auf", der Knopf darunter verlangt Anmeldung ohne Vorankündigung (N1-MM-2) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone] Funde: Hauptknopf unten hinter der festen Navigation; Filter über leerer Liste (N1-MM-4) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | Exit 2: straggler ("offen." allein in der zweiten Zeile, advisory) und overused-font; keine weiteren Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-MM-1 | P1 | "Offene Suchen (0)" und "Gerade hat kein Team eine Lobby geöffnet" stehen auf einer Seite, die man von `/suche` mit vier offenen Lobbys erreicht. Begriffe Suche und Lobby werden vermischt, die Zahl widerspricht dem Seed (Quelltext: `listOpenSearches` zählt Suchen, nicht Lobbys). | gast_mobil_matchmaking.png, gast_mobil_suche.png | clarify, critique
- N1-MM-2 | P1 | Die Seite spricht Gäste als Captain an ("Du bist Captain und willst ..."), die Handlung "Anmelden und Lobby aufmachen" steht erst nach vier Schritten Text und einer leeren Liste, am Handy unter der Falz. Ergänzt GM-ST-3 und CM-MM-1 für die Gast-Sicht. | gast_mobil_extra_matchmaking-ende-viewport.png | distill, clarify
- N1-MM-3 | P2 | Auswahl "Alle Dauern" ist abgeschnitten ("Alle Dauer"), obwohl nur zwei Auswahlfelder nebeneinander stehen. | gast_mobil_matchmaking.png | adapt
- N1-MM-4 | P2 | Filter (Stadt, Dauer, "Filtern") über einer leeren Liste: bei 0 Einträgen ohne Nutzen, bei vielen ohne Rückmeldung, welche Filter aktiv sind. | gast_mobil_matchmaking.png | distill

##### /mitspieler (Gast, Handy)
Beleg: gast_mobil_mitspieler.png (390 x 844)
Bewertung: Leerer Zustand: Anmeldehinweis, Stadtfilter, "Gerade hat sich niemand eingetragen." Die Seite endet nach 600 px; für einen Gast ist nichts zu tun außer Anmelden. Eine gefüllte Liste ist mit dem Seed nicht prüfbar (keine Einträge).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan] Funde: Zweck der Seite für Gast unklar, Leerzustand ohne Weg (N1-MI-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive] keine Funde (ein h1, Filter mit Label; 8 von 35 kleine Ziele sind die Fußzeile) |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] Funde: Filter über leerer Liste (N1-MI-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Audit the language, Empty states] Funde: "Fehlt dir jemand? Frag ihn an." erklärt nicht, wer wen anfragt (N1-MI-1) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] keine Funde (Einspalter, Filter nutzt volle Breite) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | Exit 2: nur overused-font; keine weiteren Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-MI-1 | P1 | Leerzustand "Gerade hat sich niemand eingetragen." ohne Handlung; die Erklärung "Spieler, die an einem Tag Lust auf ein Spiel haben. Fehlt dir jemand? Frag ihn an." sagt nicht, wie man jemanden anfragt. Für Gäste bleibt nur "Melde dich an". Gefüllter Zustand nicht prüfbar. | gast_mobil_mitspieler.png | clarify, critique
- N1-MI-2 | P2 | Stadtfilter mit auffälligem Akzent-Knopf "Filtern" steht gleichrangig neben dem Anmeldelink und über einer leeren Liste. | gast_mobil_mitspieler.png | distill

##### /einladung/seed-team-gueltig (Gast, Handy)
Beleg: gast_mobil_einladung-seed-team-gueltig.png (390 x 844)
Bewertung: Klar und kurz: Team, Stadt, Kadergröße, ein Knopf. Es fehlt, wer einlädt und was nach dem Klick folgt (Anmeldung, dann ggf. Onboarding). Unten leuchtet "Privatspiel" statt eines neutralen Zustands.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey] Funde: Einladender nicht genannt (N1-EG-1), Kontext geht beim Anmelden und Onboarding verloren (N1-EG-2) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] Funde: falscher aktiver Reiter "Privatspiel" (N1-EG-3); 7 von 33 Zielen unter 44 px (Fußzeile, X-07) |
| distill (reference/distill.md, manuell) | [Teil: Essence, Clear next action] keine Funde (ein Ziel, ein Knopf) |
| clarify (reference/clarify.md, manuell) | [Teil: Actions, Message hierarchy] Funde: "Anmelden und beitreten" gut; "gültig bis" fehlt (N1-EG-1) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone] keine Funde (Knopf volle Breite oberhalb der Navigation) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-gueltig` | Exit 2: nur overused-font; keine weiteren Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EG-1 | P1 | Die Einladung nennt Teamname, Stadt und "5 Spieler im Kader", aber nicht, wer eingeladen hat, kein Wappen, keine Teamfarbe, kein "gültig bis". Für einen Link aus WhatsApp fehlt dem Gast ein Vertrauenssignal. | gast_mobil_einladung-seed-team-gueltig.png | critique, clarify
- N1-EG-2 | P1 | Nach "Anmelden und beitreten" führt der Weg über `/anmelden` und, für neue Konten, über `/willkommen`; dort steht kein Wort mehr zur Einladung (siehe N1-EI-1). Der Beitritt gelingt am Ende (Knopf "Team beitreten", neu_mobil_onboarding-10-erfolg-ziel.png), aber der Weg ist für den Gast nicht angekündigt. | gast_mobil_einladung-seed-team-gueltig.png | clarify
- N1-EG-3 | P2 | Untere Navigation: "Privatspiel" ist aktiv, weil `BottomNav.tsx:13` jeden Pfad `/einladung` dem Privatspiel zuordnet; eine Team-Einladung gehört nicht dorthin. Gilt auch angemeldet (neu_mobil_onboarding-10). Ergänzt X-06. | gast_mobil_einladung-seed-team-gueltig.png | audit

##### /einladung/seed-team-abgelaufen (Gast, Handy)
Beleg: gast_mobil_einladung-seed-team-abgelaufen.png (390 x 844)
Bewertung: Klare Fehlerseite mit Grund und Folgeschritt, aber ein Sackgassen-Gefühl: Der einzige Knopf "Zur Startseite" hilft nicht, den Link zu erneuern, und der Admin wird nicht genannt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristik 9, Persona Jordan] Funde: kein Weg zur Erneuerung (N1-EA-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] Funde: falscher aktiver Reiter (N1-EG-3); sonst keine Funde (ein h1, Kontrast des Fließtexts ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde (Titel, Satz, Knopf) |
| clarify (reference/clarify.md, manuell) | [Teil: Errors: was, warum, wie weiter] Funde: Grund und Folge stehen, "Team-Admin" ohne Namen (N1-EA-1), Laufzeit fehlt (N1-EA-2) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] keine Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-abgelaufen` | Exit 2: nur overused-font; keine weiteren Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EA-1 | P1 | "Bitte den Team-Admin um einen neuen Link." ohne Namen des Admins, ohne Link zur Teamseite von Seed Rot, ohne Kontaktweg; der einzige Knopf ist "Zur Startseite" (ghost). Der Gast, der den Link per WhatsApp bekam, muss außerhalb der App weitermachen. | gast_mobil_einladung-seed-team-abgelaufen.png | clarify, critique
- N1-EA-2 | P2 | "Link abgelaufen" ohne Hinweis auf die Laufzeit (wie lange galt er?) und ohne visuelle Fehlerkennung; die Seite sieht aus wie eine normale Textseite. | gast_mobil_einladung-seed-team-abgelaufen.png | clarify

#### Gast, Desktop (1280 x 800)

##### / (Gast, Desktop)
Beleg: gast_desktop_start.png (1280 x 3218, gesehen auf 1025 x 2576 verkleinert)
Bewertung: Der Inhalt sitzt in 720 px Spalte (X-17); gefüllt zeigt sich die Lobby-Karte zweispaltig sehr gut lesbar. Die Zähler und die Lobby-Liste liegen weit unten, die Kopfleiste kennt nur drei Links.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Riley] Funde: Zähler gegen Daten (N1-ST-1), bestätigte Lobby unter offenen (N1-ST-3), Klarnamen (N1-ST-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4, 5] Funde: Hero-Beschriftung 3,5 px Innenabstand (X-15), Zeilenlänge (X-14); 59 von 90 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Information Architecture] Funde: Liste endlos, Kürzung nicht geprüft (N1-ST-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Audit the language] Funde: "Was kostet das?" mit Guthaben/Preis (GM-ST-1), Siegchance (N1-ST-5) |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Multi-column] Funde: zwei Kader nebeneinander gut genutzt; Spalte 720 px (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Navigation timeout nach 30 s, im Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf (src/app/page.tsx, src/components/LobbyBoard.tsx, Header.tsx): keine Funde, plus Playwright-Zielmessung (metrics-gast.json) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-ST-1 | siehe Handy-Zelle (Zähler 8/35/3 gegen 6 Teams und 4 Lobbys; Quelltext HowItWorks.tsx:14) | gast_desktop_start.png | critique
- N1-ST-2 bis N1-ST-6 | siehe Handy-Zelle; auf dem Desktop ist die Lobby-Karte mit Elo, Stärke und Balken lesbarer, N1-ST-5 (Balken ohne Zuordnung) bleibt | gast_desktop_start.png | distill

##### /suche (Gast, Desktop)
Beleg: gast_desktop_suche.png (1280 x 2032)
Bewertung: Die Maske in drei Spalten ist kompakter als am Handy, die Liste beginnt bei 490 px. Gute Lesbarkeit; offene Frage bleibt, was bei mehr als vier Einträgen passiert (Quelltext `lobby.ts:627` begrenzt eine Abfrage auf 30, ohne sichtbaren Pager).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristiken 4, 8] Funde: gemischte Status in einer Liste (N1-ST-3), Begriffe Lobby und Suche (N1-SU-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] Funde: "Teilen" klein (N1-SU-3 gilt auch hier; 59 von 88 Zielen unter 44 px) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification] Funde: Filter über der Liste, kein Zurücksetzen (N1-SU-5) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] keine neuen Funde |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] Funde: Spalte 720 px mit 280 px Leerraum je Seite (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Navigation timeout nach 30 s, im Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf src/app/suche: keine Funde, plus Playwright-Zielmessung (metrics-gast.json) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SU-5 | P2 | Kein sichtbarer Hinweis, welche Filter gesetzt sind, und kein "Zurücksetzen"; bei einer Obergrenze von 30 Einträgen im Quelltext (`server/lobby.ts:627`, nicht mit Daten geprüft) fehlt auch ein Pager. | gast_desktop_suche.png | clarify
- N1-SU-1, N1-SU-3, N1-ST-3, N1-ST-4 | siehe Handy-Zelle | gast_desktop_suche.png | clarify

##### /spieler (Gast, Desktop)
Beleg: gast_desktop_spieler.png (1280 x 3015, gesehen auf 1094 x 2576)
Bewertung: Lange, gleichförmige Liste in schmaler Spalte; am Desktop ist das Suchfeld breit genug (kein X-01). Zeilen ohne Statistik füllen die zweite Hälfte der Seite.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Riley] Funde: Konten ohne Spiele (N1-SP-2), Klarnamen (N1-ST-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] Funde: Platzhalter-Kontrast (X-16); Pager 36 px (N1-SP-5) |
| distill (reference/distill.md, manuell) | [Teil: Visual Simplification] Funde: 30 gleiche Zeilen, keine Gruppierung (N1-SP-3) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] Funde: wie Handy (N1-SP-4) |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Data tables] Funde: viel Leerraum zwischen Name und Zahlen (N1-SP-6) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | Exit 2: low-contrast (X-16) und overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-6 | P2 | Auf 1280 px nutzen die Zeilen nur zwei Informationen (Name/Stadt/Position links, Spiele/Tore rechts) in 614 px Breite; Desktop-Anpassung (mehr Spalten, Team, Elo) fehlt (zu X-17). | gast_desktop_spieler.png | adapt
- N1-SP-2, N1-SP-3, N1-SP-4, N1-SP-5 | siehe Handy-Zelle | gast_desktop_spieler.png | critique

##### /teams (Gast, Desktop)
Beleg: gast_desktop_teams.png (1280 x 923)
Bewertung: Sechs Teams, klare Karten; ohne Teamfarbe und ohne Pager. Mit 6 Einträgen funktioniert die Seite gut; Verhalten bei vielen Teams nicht prüfbar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A] Funde: N1-TE-1, N1-TE-2 (Sortierung, keine Farbe) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1] Funde: Platzhalter-Kontrast (X-16); 10 von 41 Zielen unter 44 px (Fußzeile) |
| distill (reference/distill.md, manuell) | [Teil: Visual Simplification] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] Funde: wie Handy (N1-TE-3) |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] Funde: Elo rechts weit vom Namen, Zeile 720 px (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | Exit 2: low-contrast (X-16) und overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-TE-1, N1-TE-2, N1-TE-3 | siehe Handy-Zelle | gast_desktop_teams.png | critique

##### /matchmaking (Gast, Desktop)
Beleg: gast_desktop_matchmaking.png (1280 x 802)
Bewertung: Auf dem Desktop ist die Handlung "Anmelden und Lobby aufmachen" sichtbar, sonst gilt dasselbe wie am Handy: Captain-Text für Gäste, "Offene Suchen (0)" neben vier offenen Lobbys.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A] Funde: N1-MM-1, N1-MM-2 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 4] Funde: Zeilenlänge etwa 99 Zeichen (detect); 13 von 36 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Teil: Information Architecture] Funde: Anleitung vor Liste (N1-MM-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] Funde: wie Handy |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] keine neuen Funde (Knopf volle Spaltenbreite) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | Exit 2: line-length (etwa 99 Zeichen auf 2 von 3 Zeilen), straggler ("hier."), overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-MM-5 | P2 | Fließtext auf `/matchmaking` hat etwa 99 Zeichen je Zeile (Vorgabe unter 80), Einleitung und Leerzustand haben einzelne Wörter in der letzten Zeile ("hier."). Ergänzt X-14. | gast_desktop_matchmaking.png | detect (line-length, straggler)
- N1-MM-1, N1-MM-2, N1-MM-4 | siehe Handy-Zelle | gast_desktop_matchmaking.png | clarify

##### /mitspieler (Gast, Desktop)
Beleg: gast_desktop_mitspieler.png (1280 x 800)
Bewertung: Sehr leer: Titel, Hinweisbox, Filter, ein Satz. Die untere Hälfte des Bildschirms bleibt ungenutzt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A] Funde: N1-MI-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] Funde: N1-MI-2 |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states] Funde: N1-MI-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | Exit 2: nur overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-MI-1, N1-MI-2 | siehe Handy-Zelle | gast_desktop_mitspieler.png | clarify

##### /einladung/seed-team-gueltig (Gast, Desktop)
Beleg: gast_desktop_einladung-seed-team-gueltig.png (1280 x 800)
Bewertung: Zentrierte, ruhige Einladung; Knopf 384 px breit. Gleiche Lücken wie am Handy (kein Einladender, kein Gültigkeitsdatum), aber ohne Navigationsfehler.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan] Funde: N1-EG-1, N1-EG-2 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Actions] Funde: N1-EG-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] keine Funde (zentriert, Maximalbreite) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-gueltig` | Exit 2: nur overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EG-1, N1-EG-2 | siehe Handy-Zelle | gast_desktop_einladung-seed-team-gueltig.png | critique

##### /einladung/seed-team-abgelaufen (Gast, Desktop)
Beleg: gast_desktop_einladung-seed-team-abgelaufen.png (1280 x 800)
Bewertung: Gleiche Sackgasse wie am Handy: Erklärung gut, aber kein Weg weiter außer Startseite.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristik 9] Funde: N1-EA-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Errors] Funde: N1-EA-1, N1-EA-2 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation] keine Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-abgelaufen` | Exit 2: nur overused-font |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EA-1, N1-EA-2 | siehe Handy-Zelle | gast_desktop_einladung-seed-team-abgelaufen.png | clarify

#### Neuer Nutzer (seed-neu@test.local), Handy und Desktop

##### /willkommen (Neuer Nutzer, Handy)
Beleg: neu_mobil_willkommen.png (390 x 1076)
Bewertung: Das Formular ist kurz und klar, Name vorbelegt. Kopfleiste (Glocke, Konto) und fünf Reiter der unteren Navigation sind schon aktiv, obwohl jeder andere Bereich zurück auf diese Seite leitet.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan und Casey, Onboarding-Fluss] Funde: Navigation führt ins Leere (N1-WK-1), Checkbox ohne Links (N1-WK-2), Anzeigename ohne Hinweis auf Öffentlichkeit (N1-OB-8) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] Funde: Fehlerfelder ohne aria-invalid/aria-describedby (Quelltext OnboardingForm.tsx, N1-OB-3); 9 von 41 Zielen unter 44 px (Fußzeile) |
| distill (reference/distill.md, manuell) | [Teil: Information Architecture, Interaction Simplification] Funde: Kopf- und Fußnavigation lenken ab (N1-WK-1); fünf Felder sind angemessen |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Audit the language] Funde: Position "Flexibel" ohne Erklärung, Stadtliste ohne "andere" (N1-WK-3), Hilfetext zum Geburtsdatum klein (N1-WK-4) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Forms, Thumb zone] Funde: natives Datumsfeld zeigt "dd.mm.yyyy" als Platzhalter (N1-WK-4); sonst Eingaben 44 px hoch, gut |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-WK-1 | P1 | Während des Onboardings sind Kopfleiste (Glocke, Konto-Menü) und die untere Navigation (Teamspiel, Privatspiel, Spiel suchen, Turniere, Profil) voll aktiv, aber jeder Klick in `/app*` führt zurück zu `/willkommen`. Der Neue erlebt tote Klicks. Besser: nur Logo und Abmelden. | neu_mobil_willkommen.png | critique, distill
- N1-WK-2 | P1 | Die Checkbox "Ich akzeptiere die Datenschutzerklärung und die Hausordnung." enthält keine Links (Quelltext OnboardingForm.tsx, nur Text); man stimmt Texten zu, die man hier nicht öffnen kann. | neu_mobil_willkommen.png | clarify
- N1-WK-3 | P2 | Stadtauswahl nur aus fester Liste (NRW-Städte, `CITIES`), keine Option "andere Stadt"; Position "Flexibel" ohne Erklärung. Wer nicht aus der Liste kommt, kann das Konto nicht einrichten. | neu_mobil_willkommen.png | clarify
- N1-WK-4 | P2 | Hilfetext "Socaz ist ab 16. Das Datum wird nur zur Prüfung verwendet und nicht gespeichert." in 12 px grau unter dem Feld; die Folge einer Eingabe unter 16 (Konto wird gelöscht) steht nicht dort (siehe N1-OB-6). | neu_mobil_willkommen.png | clarify

##### /willkommen (Neuer Nutzer, Desktop)
Beleg: neu_desktop_willkommen.png (1280 x 892)
Bewertung: Zentriertes Formular in 448 px Breite, ruhig. In der Kopfleiste stehen Glocke, "0,00 €" (Guthaben-Link) und Konto-Menü, obwohl das Konto noch nicht eingerichtet ist.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan und Casey, Onboarding-Fluss] Funde: Navigation führt ins Leere (N1-WK-1), Checkbox ohne Links (N1-WK-2), Anzeigename ohne Hinweis auf Öffentlichkeit (N1-OB-8) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y, 4 Responsive, 5 Integrität] Funde: Fehlerfelder ohne aria-invalid/aria-describedby (Quelltext OnboardingForm.tsx, N1-OB-3); 13 von 41 Zielen unter 44 px (Fußzeile) |
| distill (reference/distill.md, manuell) | [Teil: Information Architecture, Interaction Simplification] Funde: Kopf- und Fußnavigation lenken ab (N1-WK-1); fünf Felder sind angemessen |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Audit the language] Funde: Position "Flexibel" ohne Erklärung, Stadtliste ohne "andere" (N1-WK-3), Hilfetext zum Geburtsdatum klein (N1-WK-4) |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde (Formular zentriert, Breite begrenzt) |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-WK-1 | siehe Handy-Zelle; auf dem Desktop zusätzlich Guthaben-Link "0,00 €" in der Kopfleiste (MUSS WEG, Header.tsx:53-55) | neu_desktop_willkommen.png | critique
- N1-WK-2, N1-WK-3, N1-WK-4 | siehe Handy-Zelle | neu_desktop_willkommen.png | clarify

##### /app (Neuer Nutzer, Handy, leitet auf /willkommen)
Beleg: neu_mobil_app.png (390 x 1076, bildgleich zu /willkommen)
Bewertung: Die Weiterleitung führt sauber auf `/willkommen?next=%2Fapp`; das Bild ist gleich zum Formular. Nach dem Onboarding landet der Neue wieder auf `/app` (siehe N1-OB-11).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristik 3] keine Funde (Weiterleitung mit Rücksprungziel) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 5] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Message hierarchy] keine Funde (Überschrift und Satz "Noch ein paar Angaben" erklären den Halt) |
| adapt (reference/adapt.md, manuell) | [Teil: Navigation] Funde: wie N1-WK-1 |
| `impeccable detect --json src/app/app` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-WK-1 | siehe `/willkommen` | neu_mobil_app.png | critique

##### /app (Neuer Nutzer, Desktop, leitet auf /willkommen)
Beleg: neu_desktop_app.png (1280 x 892, bildgleich zu /willkommen)
Bewertung: Die Weiterleitung führt sauber auf `/willkommen?next=%2Fapp`; das Bild ist gleich zum Formular. Nach dem Onboarding landet der Neue wieder auf `/app` (siehe N1-OB-11).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Heuristik 3] keine Funde (Weiterleitung mit Rücksprungziel) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 5] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Message hierarchy] keine Funde (Überschrift und Satz "Noch ein paar Angaben" erklären den Halt) |
| adapt (reference/adapt.md, manuell) | [Teil: Navigation] Funde: wie N1-WK-1 |
| `impeccable detect --json src/app/app` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-WK-1 | siehe `/willkommen` | neu_desktop_app.png | critique

##### /einladung/seed-team-gueltig (Neuer Nutzer, Handy, leitet auf /willkommen)
Beleg: neu_mobil_einladung-seed-team-gueltig.png (390 x 1076)
Bewertung: Der Neue sieht das generische Onboarding-Formular; vom Team, zu dem er eingeladen wurde, ist nichts mehr zu lesen. Die Einladung ist nur im Rücksprungziel `next` gemerkt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Emotional journey, Persona Jordan] Funde: Einladungskontext geht verloren (N1-EI-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 5] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Message hierarchy, Forms] Funde: Überschrift "Willkommen bei Socaz" ohne Bezug zur Einladung (N1-EI-1) |
| adapt (reference/adapt.md, manuell) | [Teil: Navigation] Funde: wie N1-WK-1 |
| `impeccable detect --json src/app/einladung/[token]` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EI-1 | P1 | Wer per Einladungslink kommt und noch kein Profil hat, sieht auf `/willkommen` nichts mehr von "Seed Rot". Er weiß nicht, dass er danach dem Team beitritt (Quelltext `einladung/[token]/page.tsx`: Weiterleitung mit `next`). Ein Satz "Du wurdest zu Seed Rot eingeladen" auf dem Formular fehlt. Das Ziel wird nach dem Onboarding korrekt erreicht (Schritt 10). | neu_mobil_einladung-seed-team-gueltig.png | clarify, critique

##### /einladung/seed-team-gueltig (Neuer Nutzer, Desktop, leitet auf /willkommen)
Beleg: neu_desktop_einladung-seed-team-gueltig.png (1280 x 892)
Bewertung: Der Neue sieht das generische Onboarding-Formular; vom Team, zu dem er eingeladen wurde, ist nichts mehr zu lesen. Die Einladung ist nur im Rücksprungziel `next` gemerkt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Emotional journey, Persona Jordan] Funde: Einladungskontext geht verloren (N1-EI-1) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 5] keine Funde |
| distill (reference/distill.md, manuell) | [Teil: Essence] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Message hierarchy, Forms] Funde: Überschrift "Willkommen bei Socaz" ohne Bezug zur Einladung (N1-EI-1) |
| adapt (reference/adapt.md, manuell) | [Teil: Navigation] Funde: wie N1-WK-1 |
| `impeccable detect --json src/app/einladung/[token]` | Quelltext-Lauf (Sitzungsseite, der URL-Lauf sieht nur die Anmeldeseite): keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EI-1 | siehe Handy-Zelle | neu_desktop_einladung-seed-team-gueltig.png | clarify

#### Onboarding-Strecke (Neuer Nutzer), je Schritt und Gerät

Reihenfolge: 01 Formular, 02 Absenden ohne Auswahl (Browserprüfung), 03 Absenden leer (Serverfehler), 04 Pflichtfelder fehlen, 05 Name zu kurz, 06 unter 16 ausgefüllt, 07 unter 16 abgesendet, 08 neue Anmeldung, 09 gültig ausgefüllt mit 40-Zeichen-Namen, 10 Erfolg (Handy: Einladungsseite, Desktop: `/app`), 11 `/app` als frisches Konto.

#### Onboarding, Handy

##### Onboarding 01 formular (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-01-formular.png
Bewertung: Ausgangsform: Anzeigename vorbelegt, Stadt, Position, Geburtsdatum, Checkbox, "Los geht's". Sauber, aber ohne Fortschritt und ohne Links zu den Texten der Checkbox.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: nur Verweise (N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: nur Verweise (N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4) |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- Verweise (kein neuer Fund): N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4

##### Onboarding 02 leer-browserpruefung (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-02-leer-browserpruefung.png
Bewertung: Die Pflichtprüfung stammt vom Browser: ein Bubble am Feld "Stadt" mit englischem Text "Please select an item in the list." (Testbrowser englisch, echte Nutzer sehen ihre Browsersprache). Es meldet immer nur ein Feld, das Bubble verdeckt auf dem Handy die Beschriftung des nächsten Feldes.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-1 | P2 | Pflichtfehler kommen vom Browser (Meldung einzeln, Sprache und Stil nicht steuerbar, Bubble verdeckt das nächste Feld); die eigenen Meldungen der Seite ("Bitte wähle eine Stadt.") erscheinen nur, wenn der Server erreicht wird. Zwei Fehlerstile in einem Formular. | neu_mobil_onboarding-02-leer-browserpruefung.png | critique, clarify

##### Onboarding 03 leer-serverfehler (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-03-leer-serverfehler.png
Bewertung: Fünf Fehlermeldungen auf einmal, jede in einem Rahmen mit dicker dunkler Kontur unter dem Feld. Die Felder selbst sind nicht markiert, die Meldungen sind nicht rot (Vertrag 007), sie wirken wie Fokusrahmen. Am Handy liegen die ersten Meldungen oberhalb des Knopfs, kein Fokus und kein Scrollen auf die erste Meldung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-2, N1-OB-3 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: bis zu fünf Fehlerkästen statt einer Zusammenfassung (N1-OB-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-2, N1-OB-3 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] Funde: Fehlermeldungen oberhalb des Sichtfelds nach dem Absenden (N1-OB-2) |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-2 | P1 | Bei vielen Fehlern (Schritt 03) gibt es keine Zusammenfassung oben, keinen Fokus auf das erste Feld und kein automatisches Scrollen; am Handy sieht der Neue nach dem Tippen auf "Los geht's" zunächst nur den Knopf, die Meldungen liegen darüber. | neu_mobil_onboarding-03-leer-serverfehler.png | critique, clarify
- N1-OB-3 | P1 | Fehler als Rahmen mit dicker dunkler Kontur (`globals.css:140`, Vertrag 007 "keine eigene Farbe"): sie sehen wie Fokusrahmen oder Hinweiskästen aus, nicht wie Fehler. Felder tragen weder `aria-invalid` noch `aria-describedby` (Quelltext OnboardingForm.tsx), die Zuordnung geschieht nur durch Nähe; `role=alert` meldet sie dem Screenreader einzeln. | neu_mobil_onboarding-03-leer-serverfehler.png | critique, clarify

##### Onboarding 04 pflichtfelder-fehlen (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-04-pflichtfelder-fehlen.png
Bewertung: Name und Stadt sind gefüllt, Position, Datum und Zustimmung fehlen: drei Meldungen. Sie bleiben stehen, auch wenn das Feld danach gefüllt wird (siehe 06).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-3, N1-OB-4 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: bis zu fünf Fehlerkästen statt einer Zusammenfassung (N1-OB-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-3, N1-OB-4 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] Funde: Fehlermeldungen oberhalb des Sichtfelds nach dem Absenden (N1-OB-2) |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-3 | P1 | Fehler als Rahmen mit dicker dunkler Kontur (`globals.css:140`, Vertrag 007 "keine eigene Farbe"): sie sehen wie Fokusrahmen oder Hinweiskästen aus, nicht wie Fehler. Felder tragen weder `aria-invalid` noch `aria-describedby` (Quelltext OnboardingForm.tsx), die Zuordnung geschieht nur durch Nähe; `role=alert` meldet sie dem Screenreader einzeln. | neu_mobil_onboarding-04-pflichtfelder-fehlen.png | critique, clarify
- N1-OB-4 | P1 | Fehlermeldungen bleiben nach Korrektur stehen, bis erneut abgesendet wird (Schritt 06 zeigt "Bitte wähle eine Position." bei gewählter Position "Abwehr" und "Bitte gib einen Namen an" bei gefülltem Namen). Der Nutzer glaubt, es sei weiter falsch. Ursache: `useFormAction` behält den Zustand bis zum nächsten Absenden. | neu_mobil_onboarding-04-pflichtfelder-fehlen.png | critique, clarify

##### Onboarding 05 name-zu-kurz (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-05-name-zu-kurz.png
Bewertung: Name "A": "Bitte gib einen Namen an (mindestens 2 Zeichen)." Verständlich. Das Feld hat 40 Zeichen als Obergrenze ohne Zähler.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-5 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-5 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] Funde: Fehlermeldungen oberhalb des Sichtfelds nach dem Absenden (N1-OB-2) |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-5 | P2 | Name: `maxLength 40` schneidet beim Tippen ohne Zähler und ohne Meldung ab; am Handy ist das Feld nach "Bartholomäus Maximilian Alexander Mue" abgeschnitten (Schritt 09). | neu_mobil_onboarding-05-name-zu-kurz.png | critique, clarify

##### Onboarding 06 unter-16-ausgefuellt (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-06-unter-16-ausgefuellt.png
Bewertung: Alle Felder gefüllt, Datum 05.05.2015 (11 Jahre): Die Meldungen aus Schritt 05 stehen noch, obwohl Name und Position inzwischen stimmen ("Bitte wähle eine Position." bei gewählter Position "Abwehr"). Nichts warnt vor der Folge des Absendens.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-4, N1-OB-6 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-4, N1-OB-6 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] Funde: Fehlermeldungen oberhalb des Sichtfelds nach dem Absenden (N1-OB-2) |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-4 | P1 | Fehlermeldungen bleiben nach Korrektur stehen, bis erneut abgesendet wird (Schritt 06 zeigt "Bitte wähle eine Position." bei gewählter Position "Abwehr" und "Bitte gib einen Namen an" bei gefülltem Namen). Der Nutzer glaubt, es sei weiter falsch. Ursache: `useFormAction` behält den Zustand bis zum nächsten Absenden. | neu_mobil_onboarding-06-unter-16-ausgefuellt.png | critique, clarify
- N1-OB-6 | P1 | Ein Geburtsdatum unter 16 löscht das Konto sofort und unwiderruflich (Quelltext `actions.ts:33-38`), ohne Rückfrage und ohne Hinweis am Feld. Ein Tippfehler beim Jahr (2012 statt 1992) beendet das Konto. Ein Datum in der Zukunft löscht es ebenso (Prüfung nur über `max` im Datumsfeld). Besser: "Stimmt das Datum? Du wärst dann X Jahre" vor dem Löschen. | neu_mobil_onboarding-06-unter-16-ausgefuellt.png | critique, clarify

##### Onboarding 07 unter-16-ergebnis (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-07-unter-16-ergebnis.png
Bewertung: Seite "Socaz ist ab 16": klarer Text (Konto gelöscht, Geburtsdatum nie gespeichert), ein Knopf "Zur Startseite", oben der Knopf "Anmelden". Das Konto ist tatsächlich weg (neue Anmeldung legt ein neues Konto an).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 5 Fehlervermeidung] Funde: N1-OB-7 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-7 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-7 | P2 | Die Endseite "Socaz ist ab 16" zeigt oben den Knopf "Anmelden" und sagt nicht, ab wann man wiederkommen kann; nichts verhindert die sofortige Neuanmeldung mit anderem Datum (Produktfrage, keine Optik). | neu_mobil_onboarding-07-unter-16-ergebnis.png | critique, clarify

##### Onboarding 08 formular-nach-neuanmeldung (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-08-formular-nach-neuanmeldung.png
Bewertung: Nach erneuter Anmeldung: leeres Formular, Name wieder vorbelegt (aus dem Anmeldenamen). Kein Hinweis, dass der Name öffentlich wird.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-8 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-8 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-8 | P1 | "Anzeigename" ist mit dem Namen aus dem Anmeldedienst vorbelegt, ohne Hinweis, dass er öffentlich ist (Spielerliste, Lobbys, Kader, auch für Gäste, siehe N1-ST-4). Ein Satz am Feld fehlt. | neu_mobil_onboarding-08-formular-nach-neuanmeldung.png | critique, clarify

##### Onboarding 09 ausgefuellt-langer-name (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-09-ausgefuellt-langer-name.png
Bewertung: Gültig ausgefüllt, Name auf 40 Zeichen ("Bartholomäus Maximilian Alexander Muelle"). Am Handy schneidet das Feld mitten im Wort ab, am Desktop passt er. In Ordnung, nur ohne Hinweis auf die Sichtbarkeit des Namens.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-5, N1-OB-8 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-5, N1-OB-8 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-5 | P2 | Name: `maxLength 40` schneidet beim Tippen ohne Zähler und ohne Meldung ab; am Handy ist das Feld nach "Bartholomäus Maximilian Alexander Mue" abgeschnitten (Schritt 09). | neu_mobil_onboarding-09-ausgefuellt-langer-name.png | critique, clarify
- N1-OB-8 | P1 | "Anzeigename" ist mit dem Namen aus dem Anmeldedienst vorbelegt, ohne Hinweis, dass er öffentlich ist (Spielerliste, Lobbys, Kader, auch für Gäste, siehe N1-ST-4). Ein Satz am Feld fehlt. | neu_mobil_onboarding-09-ausgefuellt-langer-name.png | critique, clarify

##### Onboarding 10 erfolg-ziel (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-10-erfolg-ziel.png
Bewertung: Nach "Los geht's" ohne Bestätigung direkt am Ziel (Handy: Einladung mit Knopf "Team beitreten", Desktop: `/app`). Die Kopfleiste zeigt noch den alten Namen "Seed" statt "Bartholomäus" (erst nach Neuladen aktuell).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-9, N1-OB-10 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-9, N1-OB-10 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-9 | P2 | Nach dem Absenden zeigt die Kopfleiste noch den alten Namen ("Seed", neu_*_onboarding-10), nach Neuladen "Bartholomäus": die Kopfleiste ist nach der Änderung veraltet. | neu_mobil_onboarding-10-erfolg-ziel.png | critique, clarify
- N1-OB-10 | P2 | Keine Bestätigung nach dem Onboarding (kein "Willkommen, Name", keine Meldung), der Nutzer landet ohne Übergang auf einer anderen Seite; auf der Einladungsseite (Handy) fehlt "Du bist jetzt angemeldet". | neu_mobil_onboarding-10-erfolg-ziel.png | critique, clarify

##### Onboarding 11 erfolg-app (Neuer Nutzer, Handy)
Beleg: neu_mobil_onboarding-11-erfolg-app.png
Bewertung: Frisches Konto auf `/app`: "Hey Bartholomäus", Karte "So startest du" (gut), dann Kartenwand, Guthabenkarte, Kachelraster, "Meine Spiele" und "Meine Teams" nur mit Text. "Lobby aufmachen" dreifach, obwohl ein Konto ohne Team keine Lobby öffnen darf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-11, N1-OB-12 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: Kartenwand vor Inhalt, Kachelraster (X-03, X-04), Lobby dreifach (N1-OB-12) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-11, N1-OB-12 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation, Thumb zone, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-11 | P1 | Leerzustand "Meine Spiele": "Noch keine Spiele. Suche einen Gegner oder nimm eine Spielsuche an." als reiner Text ohne Knopf; "Meine Teams" hat den Knopf, "Meine Spiele" nicht. Der Weg von der Leere zur ersten Handlung führt nach oben. | neu_mobil_onboarding-11-erfolg-app.png | critique, clarify
- N1-OB-12 | P1 | Ein Konto ohne Team sieht "Lobby aufmachen" dreifach (Karte Teamspiel, Kachel, Reiter "Teamspiel" in der Navigation), tatsächlich dürfen nur Team-Admins eine Lobby öffnen (`matchmaking/page.tsx`: "Nur Team-Admins können nach Gegnern suchen"). Verstärkt X-20 für den Neuen: erste Handlung führt in eine Erklärung statt in eine Tat. "Team gründen" steht doppelt (Karte, Abschnitt). | neu_mobil_onboarding-11-erfolg-app.png | critique, clarify
- Verweise (kein neuer Fund): X-03, X-04, X-05, X-20

#### Onboarding, Desktop

##### Onboarding 01 formular (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-01-formular.png
Bewertung: Ausgangsform: Anzeigename vorbelegt, Stadt, Position, Geburtsdatum, Checkbox, "Los geht's". Sauber, aber ohne Fortschritt und ohne Links zu den Texten der Checkbox.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: nur Verweise (N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4) |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: nur Verweise (N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4) |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- Verweise (kein neuer Fund): N1-WK-1, N1-WK-2, N1-WK-3, N1-WK-4

##### Onboarding 02 leer-browserpruefung (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-02-leer-browserpruefung.png
Bewertung: Die Pflichtprüfung stammt vom Browser: ein Bubble am Feld "Stadt" mit englischem Text "Please select an item in the list." (Testbrowser englisch, echte Nutzer sehen ihre Browsersprache). Es meldet immer nur ein Feld, das Bubble verdeckt auf dem Handy die Beschriftung des nächsten Feldes.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-1 | siehe Handy-Zelle | neu_desktop_onboarding-02-leer-browserpruefung.png | critique, clarify

##### Onboarding 03 leer-serverfehler (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-03-leer-serverfehler.png
Bewertung: Fünf Fehlermeldungen auf einmal, jede in einem Rahmen mit dicker dunkler Kontur unter dem Feld. Die Felder selbst sind nicht markiert, die Meldungen sind nicht rot (Vertrag 007), sie wirken wie Fokusrahmen. Am Handy liegen die ersten Meldungen oberhalb des Knopfs, kein Fokus und kein Scrollen auf die erste Meldung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-2, N1-OB-3 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: bis zu fünf Fehlerkästen statt einer Zusammenfassung (N1-OB-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-2, N1-OB-3 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-2 | siehe Handy-Zelle | neu_desktop_onboarding-03-leer-serverfehler.png | critique, clarify
- N1-OB-3 | siehe Handy-Zelle | neu_desktop_onboarding-03-leer-serverfehler.png | critique, clarify

##### Onboarding 04 pflichtfelder-fehlen (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-04-pflichtfelder-fehlen.png
Bewertung: Name und Stadt sind gefüllt, Position, Datum und Zustimmung fehlen: drei Meldungen. Sie bleiben stehen, auch wenn das Feld danach gefüllt wird (siehe 06).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-3, N1-OB-4 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: bis zu fünf Fehlerkästen statt einer Zusammenfassung (N1-OB-2) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-3, N1-OB-4 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-3 | siehe Handy-Zelle | neu_desktop_onboarding-04-pflichtfelder-fehlen.png | critique, clarify
- N1-OB-4 | siehe Handy-Zelle | neu_desktop_onboarding-04-pflichtfelder-fehlen.png | critique, clarify

##### Onboarding 05 name-zu-kurz (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-05-name-zu-kurz.png
Bewertung: Name "A": "Bitte gib einen Namen an (mindestens 2 Zeichen)." Verständlich. Das Feld hat 40 Zeichen als Obergrenze ohne Zähler.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-5 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-5 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-5 | siehe Handy-Zelle | neu_desktop_onboarding-05-name-zu-kurz.png | critique, clarify

##### Onboarding 06 unter-16-ausgefuellt (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-06-unter-16-ausgefuellt.png
Bewertung: Alle Felder gefüllt, Datum 05.05.2015 (11 Jahre): Die Meldungen aus Schritt 05 stehen noch, obwohl Name und Position inzwischen stimmen ("Bitte wähle eine Position." bei gewählter Position "Abwehr"). Nichts warnt vor der Folge des Absendens.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 9 Fehlerbehebung] Funde: N1-OB-4, N1-OB-6 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] Funde: Fehler ohne aria-invalid (N1-OB-3), Fokus bleibt am Knopf |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-4, N1-OB-6 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-4 | siehe Handy-Zelle | neu_desktop_onboarding-06-unter-16-ausgefuellt.png | critique, clarify
- N1-OB-6 | siehe Handy-Zelle | neu_desktop_onboarding-06-unter-16-ausgefuellt.png | critique, clarify

##### Onboarding 07 unter-16-ergebnis (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-07-unter-16-ergebnis.png
Bewertung: Seite "Socaz ist ab 16": klarer Text (Konto gelöscht, Geburtsdatum nie gespeichert), ein Knopf "Zur Startseite", oben der Knopf "Anmelden". Das Konto ist tatsächlich weg (neue Anmeldung legt ein neues Konto an).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 5 Fehlervermeidung] Funde: N1-OB-7 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-7 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-7 | siehe Handy-Zelle | neu_desktop_onboarding-07-unter-16-ergebnis.png | critique, clarify

##### Onboarding 08 formular-nach-neuanmeldung (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-08-formular-nach-neuanmeldung.png
Bewertung: Nach erneuter Anmeldung: leeres Formular, Name wieder vorbelegt (aus dem Anmeldenamen). Kein Hinweis, dass der Name öffentlich wird.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-8 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-8 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-8 | siehe Handy-Zelle | neu_desktop_onboarding-08-formular-nach-neuanmeldung.png | critique, clarify

##### Onboarding 09 ausgefuellt-langer-name (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-09-ausgefuellt-langer-name.png
Bewertung: Gültig ausgefüllt, Name auf 40 Zeichen ("Bartholomäus Maximilian Alexander Muelle"). Am Handy schneidet das Feld mitten im Wort ab, am Desktop passt er. In Ordnung, nur ohne Hinweis auf die Sichtbarkeit des Namens.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-5, N1-OB-8 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-5, N1-OB-8 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-5 | siehe Handy-Zelle | neu_desktop_onboarding-09-ausgefuellt-langer-name.png | critique, clarify
- N1-OB-8 | siehe Handy-Zelle | neu_desktop_onboarding-09-ausgefuellt-langer-name.png | critique, clarify

##### Onboarding 10 erfolg-ziel (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-10-erfolg-ziel.png
Bewertung: Nach "Los geht's" ohne Bestätigung direkt am Ziel (Handy: Einladung mit Knopf "Team beitreten", Desktop: `/app`). Die Kopfleiste zeigt noch den alten Namen "Seed" statt "Bartholomäus" (erst nach Neuladen aktuell).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-9, N1-OB-10 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] keine Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-9, N1-OB-10 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-9 | siehe Handy-Zelle | neu_desktop_onboarding-10-erfolg-ziel.png | critique, clarify
- N1-OB-10 | siehe Handy-Zelle | neu_desktop_onboarding-10-erfolg-ziel.png | critique, clarify

##### Onboarding 11 erfolg-app (Neuer Nutzer, Desktop)
Beleg: neu_desktop_onboarding-11-erfolg-app-nochmal.png
Bewertung: Frisches Konto auf `/app`: "Hey Bartholomäus", Karte "So startest du" (gut), dann Kartenwand, Guthabenkarte, Kachelraster, "Meine Spiele" und "Meine Teams" nur mit Text. "Lobby aufmachen" dreifach, obwohl ein Konto ohne Team keine Lobby öffnen darf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Assessment A, Persona Jordan, Emotional journey, Heuristik 1 Systemstatus] Funde: N1-OB-11, N1-OB-12 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1 A11y (Formularfehler, Labels, Fokus), 4 Responsive] keine Funde (Labels vorhanden, Zielhöhen im Formular ausreichend) |
| distill (reference/distill.md, manuell) | [Teil: Interaction Simplification, Clear next action] Funde: Kartenwand vor Inhalt, Kachelraster (X-03, X-04), Lobby dreifach (N1-OB-12) |
| clarify (reference/clarify.md, manuell) | [Teil: Forms, Errors, Success states] Funde: N1-OB-11, N1-OB-12 |
| adapt (reference/adapt.md, manuell) | [Teil: Desktop Adaptation, Forms] keine Funde |
| `impeccable detect --json src/app/willkommen` | Quelltext-Lauf: keine Funde (der Zustand ist Laufzeit, im Quelltext nicht prüfbar) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-11 | siehe Handy-Zelle | neu_desktop_onboarding-11-erfolg-app-nochmal.png | critique, clarify
- N1-OB-12 | siehe Handy-Zelle | neu_desktop_onboarding-11-erfolg-app-nochmal.png | critique, clarify
- Verweise (kein neuer Fund): X-03, X-04, X-05, X-20

#### Zusatzaufnahmen (Gast, Handy), Fehler- und Leerzustände

##### /spieler?q=zzzz (Gast, Handy, Zusatz)
Beleg: gast_mobil_extra_spieler-leer.png
Bewertung: Leerer Treffer: nur der Satz "Keine Spieler gefunden.", das Suchfeld zeigt "zzz" (von vier Zeichen).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Persona Riley, Heuristik 9] Funde: N1-SP-1, N1-SP-4 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine neuen Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Errors] Funde: N1-SP-1, N1-SP-4 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 (Suchfeld 48 px) |
| `Zusatzaufnahme, kein eigener detect-Lauf (gleiche Seite wie in der Zelle oben)` | siehe Zelle der Seite |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-1 | siehe Zelle der Seite | gast_mobil_extra_spieler-leer.png | critique, clarify
- N1-SP-4 | siehe Zelle der Seite | gast_mobil_extra_spieler-leer.png | critique, clarify

##### /teams?q=zzzz (Gast, Handy, Zusatz)
Beleg: gast_mobil_extra_teams-leer.png
Bewertung: Leerer Treffer analog; "Keine Teams gefunden." ohne nächsten Schritt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Persona Riley, Heuristik 9] Funde: N1-TE-3, N1-SP-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine neuen Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Errors] Funde: N1-TE-3, N1-SP-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 (Suchfeld 48 px) |
| `Zusatzaufnahme, kein eigener detect-Lauf (gleiche Seite wie in der Zelle oben)` | siehe Zelle der Seite |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-TE-3 | siehe Zelle der Seite | gast_mobil_extra_teams-leer.png | critique, clarify
- N1-SP-1 | siehe Zelle der Seite | gast_mobil_extra_teams-leer.png | critique, clarify

##### /spieler?page=2 (Gast, Handy, Zusatz)
Beleg: gast_mobil_extra_spieler-seite2.png
Bewertung: Zweite Seite der Liste: Betriebskonten (Seed Admin, Hallenbetreiber, Veranstalter) erscheinen als Spieler. Der Pager liegt hinter der festen Navigation und ist im Ganzseitenbild nicht zu sehen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Persona Riley, Heuristik 9] Funde: N1-SP-2, N1-SP-5 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine neuen Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Errors] Funde: N1-SP-2, N1-SP-5 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 (Suchfeld 48 px) |
| `Zusatzaufnahme, kein eigener detect-Lauf (gleiche Seite wie in der Zelle oben)` | siehe Zelle der Seite |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-2 | siehe Zelle der Seite | gast_mobil_extra_spieler-seite2.png | critique, clarify
- N1-SP-5 | siehe Zelle der Seite | gast_mobil_extra_spieler-seite2.png | critique, clarify

##### /spieler?q=<langer Begriff> (Gast, Handy, Zusatz)
Beleg: gast_mobil_extra_spieler-suchbegriff-lang.png
Bewertung: Langer Suchbegriff: im Feld sichtbar nur "Tes".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Persona Riley, Heuristik 9] Funde: N1-SP-1 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine neuen Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Errors] Funde: N1-SP-1 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 (Suchfeld 48 px) |
| `Zusatzaufnahme, kein eigener detect-Lauf (gleiche Seite wie in der Zelle oben)` | siehe Zelle der Seite |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-1 | siehe Zelle der Seite | gast_mobil_extra_spieler-suchbegriff-lang.png | critique, clarify

##### /matchmaking, Seitenende (Gast, Handy, Zusatz)
Beleg: gast_mobil_extra_matchmaking-ende-viewport.png
Bewertung: Am Ende sichtbar: "Offene Suchen (0)", Leerzustand und der Knopf "Anmelden und Lobby aufmachen"; belegt, dass die Handlung erst nach dem Scrollen erreichbar ist.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Teil: Persona Riley, Heuristik 9] Funde: N1-MM-1, N1-MM-2 |
| audit (reference/audit.md, manuell) | [Teil: Dimension 1, 4] keine neuen Funde |
| distill (reference/distill.md, manuell) | [Teil: Clear next action] keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Teil: Empty states, Errors] Funde: N1-MM-1, N1-MM-2 |
| adapt (reference/adapt.md, manuell) | [Teil: Mobile Adaptation] Funde: X-01 (Suchfeld 48 px) |
| `Zusatzaufnahme, kein eigener detect-Lauf (gleiche Seite wie in der Zelle oben)` | siehe Zelle der Seite |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-MM-1 | siehe Zelle der Seite | gast_mobil_extra_matchmaking-ende-viewport.png | critique, clarify
- N1-MM-2 | siehe Zelle der Seite | gast_mobil_extra_matchmaking-ende-viewport.png | critique, clarify



#### Nachlauf-Blatt N2 Spieler mit Team, Spieler ohne Team

Stand: Nachlauf der Gruppe-X-Analyse, Teil 2. Dev-Server Port 3102, Engine 0.1.19 über den Launcher, Seed Seed-Beschreibung (analyse-seed.md). Nur gelesen und gemessen, kein Quelltext geändert. Rollen: Spieler mit Team = `seed-spieler-01@test.local` (Anton Testmann, Mitglied Seed Rot, kein Captain); Spieler ohne Team = `seed-spieler-17@test.local` (Quirin Testmann). Kennungen: N2 = Nachlauf 2. Vorhandene Funde (X-nn, SM-, SD-, N1-) werden nur referenziert. Die Doku-Bezeichnung "Spieler" im ersten Fundblatt (SM-/SD-) bezog sich auf Demo Alpha; hier gelten dieselben Muster mit Seed-Daten.

#### Methode und Grenzen

- Die fünf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollständig gelesen. critique/audit/distill/clarify/adapt haben keinen Launcher-Befehl: sie liefen manuell nach den Dateien, je Durchgang steht in eckigen Klammern der angewandte Teil. critique bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher) lief einmal: PRODUCT.md geladen (Plattform web, Kartenmodell nach Vertrag 012).
- `detect --json --viewport <WxH> <URL>` lief je Seite und Viewport (26 Läufe, plus Wiederholung für `/` und `/suche`: erneut Navigation timeout nach 30 s, Dauerverbindung, Ersatz Quelltext-Lauf: keine Funde). `detect` per URL hat keine Sitzung: für `/app*` und `/einladung` wurde die Weiterleitung auf die Anmeldeseite bzw. die Seite ohne Sitzung gemessen; deshalb zusätzlich Quelltext-Läufe (Seitenordner app, einladung, suche, spieler, teams, matchmaking, mitspieler sowie UserMenu.tsx und Header.tsx): je keine Funde. Der Fund `overused-font` (Plus Jakarta Sans, 92 bis 98 %) erscheint auf allen Seiten und ist in DESIGN.md gesetzt: kein Fund.
- Ganzseitige Handy-Bilder zeigen die feste untere Navigation mitten im Bild und das runde N (Next-Overlay): Aufnahme-Artefakt, kein Fund.
- Zusatzaufnahmen per Playwright (Dev-Login). Für den Fehlerzustand "leerer Name" wurde die Browser-Pflichtprüfung (`required`) abgeschaltet, sonst erreicht das Absenden den Server.
- Nicht prüfbar mit dem Seed: gefüllte Benachrichtigungen (Spieler 01 hat keine; die Glocke ohne Zähler ist daher nicht beurteilbar; erst durch den Beitritt von Spieler 17 entsteht eine Meldung für Rot Captain, nicht für 01), Guthaben-Verlauf mit Buchungen (Seed legt kein Hauptbuch an), Zustand "mehr als 30 Spieler/Teams", "Bitte warten…" des Absende-Knopfs, echter Google-Login, `required`-Sprechblase.

#### Geänderte Daten durch die Analyse

- **Beitritt (Zusatz c):** Vorher: `seed-spieler-17@test.local` ohne Team (`spieler17_*_app.png`: "Du bist noch in keinem Team"; Seed Rot mit 5 Spielern im Kader). Aktion: Klick "Team beitreten" auf `/einladung/seed-team-gueltig` (Handy). Nachher: Spieler 17 ist Mitglied von Seed Rot (Rolle Spieler, Kader 6), `/app` zeigt "Meine Teams: Seed Rot"; der Dienst legt einen Audit-Eintrag an und benachrichtigt die Team-Admins (Rot Captain). Der Desktop-Lauf traf Spieler 17 schon als Mitglied an. Rückgängig nur per Seed-Neuaufruf oder durch "Team verlassen" im Konto von 17 (nicht ausgeführt); der Seed löscht Teammitglieder nicht ausdrücklich.
- Profil speichern und Benachrichtigungen Speichern (Spieler 01) schrieben unveränderte Werte; der Fehlerlauf (leerer Name) speichert nichts. Der Dev-Login legte für beide Konten Sitzungen an.


#### Spieler mit Team (Seed Rot, kein Captain)

##### / (Spieler mit Team, Handy)
Beleg: spieler01_mobil_start.png (Messung 60 von 95 Zielen unter 44 px, Seitenhöhe 5559 px, kein Überlauf)
Bewertung: Eingeloggt öffnet die Startseite mit dem Kasten "Meine aktuellen Spiele" und schiebt das Hallenfoto darunter; danach noch einmal Karten, Erklärung, Zähler und vier Lobbys: 5559 px. Für ein Mitglied bleibt "Team gründen" die farbige erste Handlung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Kognitive Last (Wand der Optionen), Persona Casey] Funde: dreifacher Kasten (N2-AP-1), eigene Lobbys unmarkiert (N2-SU-3); "Team gründen" im Hero für Mitglied (SM-ST-1), Zähler 8/35/3 (N1-ST-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, Zielgrößen] Funde: 60 von 95 Zielen unter 44 px (Teilen-Link 32 x 16, N1-SU-3); kein Überlauf; Kasten-Knöpfe 44 px (gut) |
| distill (reference/distill.md, manuell) | [Information Architecture, Remove Redundancy] Funde: Kasten + Liste + "Meine Spiele"-Wiederholung (N2-AP-1); Lobby-Liste ungekürzt (N1-ST-2) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: Altmodelltext "Du lädst dein Guthaben auf" erscheint auch für Angemeldete (MUSS WEG-Tabelle); "VS." gegen "gegen" (N2-AP-5) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation, Content Strategy] Funde: Hero unterhalb von rund 480 px Kasten, Primärknöpfe 3 + 5 (N2-AP-1); sonst N1-ST-2 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Navigation timeout nach 30 s, Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite und Header.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-1 | P1 | Der Kasten "Meine aktuellen Spiele" (drei Karten mit je eigenem Primärknopf "Zur Lobby") steht auf `/app`, auf `/` (über dem Hero) und auf `/suche` (vor Filtern und Liste). Er wiederholt dieselben drei Spiele, die weiter unten in "Meine Spiele" und in der Lobby-Liste nochmals stehen: dreifache Wiederholung, auf dem Handy rund 480 px Höhe und drei Primärknöpfe vor jedem eigentlichen Inhalt; auf `/suche` rutscht die Filtermaske unter die Bildschirmmitte. | spieler01_mobil_start.png, spieler01_mobil_suche.png, spieler01_mobil_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-AP-5 | P2 | Schreibweise uneinheitlich: Kasten "Seed Rot VS. Seed Blau" (Großbuchstaben, Punkt), Liste "Seed Rot gegen Seed Blau"; das Privatspiel zeigt die internen Teamnamen "Seed Privat A VS. Seed Privat B" und bricht am Handy mitten im Namen um ("B" allein in der Zeile). | spieler01_mobil_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-SU-3 | P1 | Die eigenen Lobbys (#1003, #1001 mit "Anton Testmann" im Kader) stehen ungekennzeichnet in der Liste unter dem Titel "Offene Lobbys anderer Teams"; der Titel ist für den Spieler falsch, es fehlt "Dein Team" oder "Du bist dabei". Der rote Punkt neben dem eigenen Namen (#1001 "In der Lobby") steht neben dem grünen (#1003) ohne Hinweis, welche Handlung nötig ist. | spieler01_desktop_suche.png, spieler01_mobil_suche.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- SM-ST-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_start.png | siehe Durchgangstabelle
- N1-ST-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_start.png | siehe Durchgangstabelle
- N1-ST-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_start.png | siehe Durchgangstabelle

##### / (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_start.png (Messung 64 von 95 Zielen unter 44 px, Seitenhöhe 3606 px, kein Überlauf)
Bewertung: Am Desktop steht der Kasten sauber im Raster über dem Hero; die Lobby-Karten sind zweispaltig lesbar, die eigenen Lobbys (#1003, #1001) sind nicht als eigene erkennbar. Hero zeigt weiter "Team gründen" als Primärknopf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4 Konsistenz, 8 Minimalismus] Funde: Kasten vor Hero (N2-AP-1), eigene Lobbys unmarkiert (N2-SU-3), SM-ST-1/SD-ST-1 |
| audit (reference/audit.md, manuell) | [Dimension 1 A11y, 4 Responsive] Funde: Ampelpunkte mit Textlabel (gut); 64 von 95 Zielen unter 44 px; kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Wiederholung Kasten/Liste (N2-AP-1); Zählerkacheln gegen Liste (N1-ST-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: "Was kostet das?": "Du lädst dein Guthaben auf" (MUSS WEG, neu für Rolle Spieler); "Kostenlos anmelden" bei Angemeldeten sinnlos (siehe MUSS WEG) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation, Layout] Funde: 720-px-Spalte wie X-17; Lobby-Karten gut zweispaltig (kein Fund) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Navigation timeout nach 30 s, Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite und Header.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_start.png | wiederholt
- N2-SU-3 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_start.png | wiederholt
- SM-ST-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_start.png | siehe Durchgangstabelle
- N1-ST-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_start.png | siehe Durchgangstabelle

##### /suche (Spieler mit Team, Handy)
Beleg: spieler01_mobil_suche.png (Messung 60 von 93 Zielen unter 44 px, Seitenhöhe 3661 px, kein Überlauf)
Bewertung: Auf `/suche` verdrängt der Kasten die Filter nach unten; die erste Lobby-Karte beginnt weit unter dem Bildschirm. Die eigenen Lobbys erscheinen als "Offene Lobbys anderer Teams".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 2, 6] Funde: Titel "anderer Teams" falsch, eigene Lobbys unmarkiert (N2-SU-3); Kasten verdrängt Filter (N2-AP-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] Funde: 60 von 93 Zielen unter 44 px; "Teilen" 32 x 16 (N1-SU-3); Art-Auswahl abgeschnitten (X-10) |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: sechs Filter vor vier Einträgen (N1-SU-2, X-10) |
| clarify (reference/clarify.md, manuell) | [Actions, Empty states] Funde: "Lobby aufmachen" als Spieler (SM-SU-1); Kader gegen Plätze (N2-SU-4) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Karte bis Karte ohne Anker zurück (N1-SU-2) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Navigation timeout nach 30 s, Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-3 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_suche.png | wiederholt
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_suche.png | wiederholt
- N2-SU-4 | P2 | Zahlen in der Lobby-Karte widersprechen sich auf den ersten Blick: "Stärke 4/5 · 5 im Kader" und "0 von 3 bereit · noch 3 Plätze frei" (Kader 5, dennoch 3 Plätze frei); nach dem Beitritt von Spieler 17 steht "6 im Kader" bei unveränderten "3 Plätzen" (spieler01_desktop_extra-suche-filter-koeln.png). Kader und Lobby-Plätze sind zwei Größen ohne Erklärung. | spieler01_desktop_extra-suche-filter-koeln.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- SM-SU-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_suche.png | siehe Durchgangstabelle
- N1-SU-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_suche.png | siehe Durchgangstabelle
- N1-SU-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_suche.png | siehe Durchgangstabelle

##### /suche (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_suche.png (Messung 64 von 93 Zielen unter 44 px, Seitenhöhe 2404 px, kein Überlauf)
Bewertung: Am Desktop liest sich die Seite gut (Filterraster 3 x 2, zweispaltige Lobbys), aber die eigenen Lobbys stehen unter "anderer Teams", und der Kasten steht noch vor der Filtermaske.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 4] Funde: N2-SU-3, N2-AP-1; Schwäche "Lobby aufmachen" für Spieler (SM-SU-1) |
| audit (reference/audit.md, manuell) | [Dimension 1 A11y, 4] Funde: 64 von 93 Zielen unter 44 px; Ampel mit sr-only-Label (gut) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: dieselbe Liste wie auf `/` (N1-ST-2); sonst N2-AP-1 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: Kader/Plätze (N2-SU-4) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Navigation timeout nach 30 s, Wiederholungslauf wieder (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-3 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_suche.png | wiederholt
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_suche.png | wiederholt
- N2-SU-4 | siehe /suche (Spieler mit Team, Handy) | spieler01_desktop_suche.png | wiederholt
- SM-SU-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_suche.png | siehe Durchgangstabelle

##### /spieler (Spieler mit Team, Handy)
Beleg: spieler01_mobil_spieler.png (Messung 9 von 68 Zielen unter 44 px, Seitenhöhe 3175 px, kein Überlauf)
Bewertung: 30 gefüllte Zeilen lesen sich ruhig; das Suchfeld ist weiter auf rund 48 px gequetscht (Platzhalter "Na"). Die eigene Zeile (Anton Testmann) ist nicht markiert, Demo- und Admin-Konten stehen mit 0 Spielen in der Liste.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 6 Erkennen, Persona Casey] Funde: Suchfeld (X-01/N1-SP-1), eigene Zeile unmarkiert (SM-SP-1), Konten ohne Spiele (N1-SP-2) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] Funde: nur 9 von 68 Zielen unter 44 px, Pager 36 px (N1-SP-5); kein Überlauf |
| distill (reference/distill.md, manuell) | [Information Architecture] Funde: keine Teamzugehörigkeit, keine Elo in den Zeilen (N1-SP-3) |
| clarify (reference/clarify.md, manuell) | [Empty states] Funde: kein Fund in diesem Zustand; Leerzustand siehe extra-spieler-leer |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation, Touch] Funde: Suchfeld zu schmal (X-01) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | 2 Funde: low-contrast (Platzhalter "Name suchen" 4,1:1, = X-16), overused-font (Plus Jakarta Sans 98 %, in DESIGN.md gesetzt, kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_spieler.png | siehe Durchgangstabelle
- SM-SP-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_spieler.png | siehe Durchgangstabelle
- N1-SP-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_spieler.png | siehe Durchgangstabelle
- N1-SP-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_spieler.png | siehe Durchgangstabelle
- N1-SP-5 | bereits vorhanden, hier bestätigt | spieler01_mobil_spieler.png | siehe Durchgangstabelle

##### /spieler (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_spieler.png (Messung 13 von 68 Zielen unter 44 px, Seitenhöhe 3015 px, kein Überlauf)
Bewertung: Am Desktop ist das Suchfeld breit genug; die Liste ist weiter eine 614-px-Spalte mit zwei Informationen je Zeile. Eigener Eintrag nicht markiert.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 6] Funde: SM-SP-1, N1-SP-2 |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 13 von 68 Zielen unter 44 px; Platzhalter-Kontrast 4,1:1 (X-16) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: keine Funde |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: N1-SP-6 (zwei Infos je Zeile) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | 2 Funde: low-contrast (= X-16), overused-font (kein Fund, DESIGN.md); Quelltext: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-SP-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_spieler.png | siehe Durchgangstabelle
- N1-SP-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_spieler.png | siehe Durchgangstabelle
- N1-SP-6 | bereits vorhanden, hier bestätigt | spieler01_desktop_spieler.png | siehe Durchgangstabelle
- X-16 | bereits vorhanden, hier bestätigt | spieler01_desktop_spieler.png | siehe Durchgangstabelle

##### /teams (Spieler mit Team, Handy)
Beleg: spieler01_mobil_teams.png (Messung 8 von 43 Zielen unter 44 px, Seitenhöhe 1107 px, kein Überlauf)
Bewertung: Sechs Teamkarten, das eigene Team (Seed Rot, 4. Zeile) ohne Markierung; Elo ungeordnet; das Suchfeld ist wieder auf 48 px gequetscht.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 6] Funde: eigenes Team unmarkiert (SM-TE-1), Suchfeld (X-01), Elo ungeordnet (N1-TE-2), keine Teamfarbe (N1-TE-1) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 43 Zielen unter 44 px; Platzhalter-Kontrast (X-16) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: "fordere sie heraus" für Nicht-Admins (SD-TE-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: X-01 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | 2 Funde: low-contrast (Platzhalter "Teamname" 4,1:1, = X-16), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-TE-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_teams.png | siehe Durchgangstabelle
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_teams.png | siehe Durchgangstabelle
- N1-TE-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_teams.png | siehe Durchgangstabelle
- N1-TE-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_teams.png | siehe Durchgangstabelle
- SD-TE-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_teams.png | siehe Durchgangstabelle

##### /teams (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_teams.png (Messung 12 von 43 Zielen unter 44 px, Seitenhöhe 923 px, kein Überlauf)
Bewertung: Sechs Karten in einer Spalte, das eigene Team ist nicht hervorgehoben; Demo Alpha/Bravo zeigen "noch ohne Spiel" statt einer Elo-Zahl, was die Reihenfolge der Spalte bricht.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4] Funde: SM-TE-1; "noch ohne Spiel" statt Elo (N1-TE-2) |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 12 von 43 Zielen unter 44 px; X-16 |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SD-TE-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: gestreckte Spalte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | 2 Funde: low-contrast (Platzhalter "Teamname" 4,1:1, = X-16), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-TE-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_teams.png | siehe Durchgangstabelle
- N1-TE-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_teams.png | siehe Durchgangstabelle
- X-17 | bereits vorhanden, hier bestätigt | spieler01_desktop_teams.png | siehe Durchgangstabelle

##### /matchmaking (Spieler mit Team, Handy)
Beleg: spieler01_mobil_matchmaking.png (Messung 12 von 38 Zielen unter 44 px, Seitenhöhe 1216 px, kein Überlauf)
Bewertung: Überschrift und Einleitung ("Du bist Captain...") passen nicht zum Spieler; der Hinweis "Nur Team-Admins..." liegt unter der Navigation. "Offene Suchen (0)" widerspricht den vier Lobbys auf `/suche`.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 4] Funde: SM-MA-1, N1-MM-1 (0 Suchen gegen 4 Lobbys), N2-MM-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 38 Zielen unter 44 px; "Alle Dauer" abgeschnitten (N1-MM-3) |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: Filter über leerer Liste (N1-MM-4) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Empty states] Funde: "Team gründen" für Mitglied (N2-MM-1); straggler "offen." (N1-MM-5) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Formular/Hinweis am Seitenende (SM-MA-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | 2 Funde: straggler ("offen." allein in der letzten Zeile, = N1-MM-5), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-MM-1 | P1 | Spieler01 ist Mitglied von Seed Rot. Der Hinweis unter der Liste lautet trotzdem "Nur Team-Admins können nach Gegnern suchen. Team gründen": für ein bestehendes Mitglied falsch; richtig wäre "Frag Rot Captain (dein Team-Admin)". Die Seite weiß, in welchem Team er ist (Kasten auf `/app`), nutzt es aber nicht. Ergänzt SM-MA-1. | spieler01_desktop_matchmaking.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- SM-MA-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-4 | bereits vorhanden, hier bestätigt | spieler01_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-5 | bereits vorhanden, hier bestätigt | spieler01_mobil_matchmaking.png | siehe Durchgangstabelle

##### /matchmaking (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_matchmaking.png (Messung 16 von 38 Zielen unter 44 px, Seitenhöhe 812 px, kein Überlauf)
Bewertung: Der Hinweis "Nur Team-Admins können nach Gegnern suchen. Team gründen" steht unter der Liste; für Anton, der in Seed Rot spielt, ist er falsch.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 9] Funde: N2-MM-1, SD-MM-1 |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 16 von 38 Zielen unter 44 px; Zeilenlänge 99 Zeichen (N1-MM-5) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Erklärkasten + Absatz + Hinweis dreimal Captain-Aufgabe (SD-MM-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-MM-1; Begriff Lobby/Suche (N1-MM-1) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | 3 Funde: line-length (~99 Zeichen, = N1-MM-5), straggler ("hier."), overused-font (kein Fund); Quelltext: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-MM-1 | siehe /matchmaking (Spieler mit Team, Handy) | spieler01_desktop_matchmaking.png | wiederholt
- SD-MM-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_matchmaking.png | siehe Durchgangstabelle
- N1-MM-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_matchmaking.png | siehe Durchgangstabelle
- N1-MM-5 | bereits vorhanden, hier bestätigt | spieler01_desktop_matchmaking.png | siehe Durchgangstabelle

##### /mitspieler (Spieler mit Team, Handy)
Beleg: spieler01_mobil_mitspieler.png (Messung 8 von 40 Zielen unter 44 px, Seitenhöhe 921 px, kein Überlauf)
Bewertung: Die Seite ist leer (niemand eingetragen), das Eintragsformular ist schlicht. Stadt ist aus dem Profil vorbelegt, der Filter darunter nicht.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 5 Fehlervermeidung] Funde: N2-MI-1, Leerzustand (N1-MI-1), Sichtbarkeit unklar (SM-MI-2) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 40 Zielen unter 44 px; natives Datumsfeld ohne Vorgabe |
| distill (reference/distill.md, manuell) | [Information Architecture] Funde: Seite nicht verlinkt (SM-MI-3) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Empty states] Funde: N1-MI-1; "Frag ihn an" (SM-MI-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | 1 Fund: overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-MI-1 | P2 | Im Formular "Ich suche ein Spiel" ist die Stadt aus dem Profil vorbelegt (Köln, gut), der Filter darunter steht auf "Alle Städte": zwei Stadtfelder mit verschiedenen Vorgaben auf derselben Seite, ohne Erklärung, dass die Liste nicht nach Köln gefiltert ist. | spieler01_mobil_mitspieler.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N1-MI-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_mitspieler.png | siehe Durchgangstabelle
- SM-MI-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_mitspieler.png | siehe Durchgangstabelle
- SM-MI-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_mitspieler.png | siehe Durchgangstabelle
- SM-MI-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_mitspieler.png | siehe Durchgangstabelle

##### /mitspieler (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_mitspieler.png (Messung 12 von 40 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy: Formular oben, leere Liste. Zwei gleich starke Knöpfe ("Eintragen", "Filtern").

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4] Funde: N2-MI-1, N1-MI-2 |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 12 von 40 Zielen unter 44 px; kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N1-MI-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | 1 Fund: overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-MI-1 | siehe /mitspieler (Spieler mit Team, Handy) | spieler01_desktop_mitspieler.png | wiederholt
- N1-MI-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_mitspieler.png | siehe Durchgangstabelle
- N1-MI-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_mitspieler.png | siehe Durchgangstabelle

##### /einladung/seed-team-gueltig (Spieler mit Team, Handy)
Beleg: spieler01_mobil_einladung-seed-team-gueltig.png (Messung 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: Ein bestehendes Mitglied von Seed Rot sieht "Du wurdest eingeladen zu Seed Rot" und "Team beitreten" (bestätigt SM-EL-1 mit echten Daten). Der Reiter "Privatspiel" ist aktiv.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 5] Funde: SM-EL-1, N1-EG-1 (kein Einladender), N1-EG-3 (Reiter) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 35 Zielen unter 44 px; Knopf 44 px (gut) |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: kein "Du bist schon Mitglied" (SM-EL-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-gueltig` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-EL-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- N1-EG-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- N1-EG-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-gueltig.png | siehe Durchgangstabelle

##### /einladung/seed-team-gueltig (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_einladung-seed-team-gueltig.png (Messung 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Zentrierter Block mit Teamname und Knopf; für ein Mitglied irreführend (SM-EL-1).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1] Funde: SM-EL-1, SD-EL-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-EL-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: 800-px-Seite, Fußzeile direkt unter dem Block (SD-ALL-9) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-gueltig` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-EL-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- SD-EL-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler01_desktop_einladung-seed-team-gueltig.png | siehe Durchgangstabelle

##### /einladung/seed-team-abgelaufen (Spieler mit Team, Handy)
Beleg: spieler01_mobil_einladung-seed-team-abgelaufen.png (Messung 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: "Link abgelaufen" mit dem Satz "Bitte den Team-Admin um einen neuen Link." Für ein Mitglied sinnlos, kein Name des Admins.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9 Fehlerbehebung] Funde: N2-EA-1, N1-EA-1, N1-EA-2 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: einziger Knopf "Zur Startseite" (SM-EU-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-EA-1 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-abgelaufen` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-EA-1 | P2 | Für ein bestehendes Mitglied von Seed Rot ist "Link abgelaufen. Bitte den Team-Admin um einen neuen Link" sinnlos: Die Seite sagt nicht "Du bist schon im Team" und nennt nicht Rot Captain; der Reiter "Privatspiel" ist aktiv (N1-EG-3). Gilt unverändert nach dem Beitritt von Spieler 17. | spieler01_mobil_einladung-seed-team-abgelaufen.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N1-EA-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-abgelaufen.png | siehe Durchgangstabelle
- N1-EA-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-abgelaufen.png | siehe Durchgangstabelle
- SM-EU-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_einladung-seed-team-abgelaufen.png | siehe Durchgangstabelle

##### /einladung/seed-team-abgelaufen (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_einladung-seed-team-abgelaufen.png (Messung 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy, kurze Seite, Fußzeile direkt unter dem Block.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9] Funde: N2-EA-1, N1-EA-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-EA-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-ALL-9 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-abgelaufen` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-EA-1 | siehe /einladung/seed-team-abgelaufen (Spieler mit Team, Handy) | spieler01_desktop_einladung-seed-team-abgelaufen.png | wiederholt
- N1-EA-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_einladung-seed-team-abgelaufen.png | siehe Durchgangstabelle
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler01_desktop_einladung-seed-team-abgelaufen.png | siehe Durchgangstabelle

##### /app (Spieler mit Team, Handy)
Beleg: spieler01_mobil_app.png (Messung 12 von 55 Zielen unter 44 px, Seitenhöhe 2696 px, kein Überlauf)
Bewertung: Gefülltes `/app`: Kasten oben, dann drei Spielkarten, Guthaben-Karte, Kacheln, "Meine Spiele" (5 Zeilen) und "Meine Teams" mit Seed Rot. Die Spielinformation ist da, aber dreifach und widersprüchlich beschriftet; Halle und eigener Status fehlen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Kognitive Last, Persona Casey, Emotionale Reise] Funde: N2-AP-1, N2-AP-2, N2-AP-4, N2-AP-5; Kartenwand vor Spielen (X-03, SM-AP-1) |
| audit (reference/audit.md, manuell) | [Dimension 1 A11y, 4 Responsive] Funde: 12 von 55 Zielen unter 44 px; Status nur als Text, kein Symbol (N2-AP-2); kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy, Visual Simplification] Funde: Kasten + Liste (N2-AP-1); Schnellzugriff 5 Kacheln (X-04); Guthaben-Karte (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: "Bereit machen und bezahlen" gegen "Wartet auf Spieler" (N2-AP-2); "Lobby aufmachen" dreifach (X-20) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation, Content Strategy] Funde: Liste hart bei 5 (N2-AP-3); "Meine Teams" mit Button "Team gründen" neben Rolle "Spieler" (SM-AP-2) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_app.png | wiederholt
- N2-AP-2 | P1 | Widersprüchliche Statuswörter für dasselbe Spiel: #1001 (Rot gegen Blau, Di. 17.11.) heißt im Kasten "Bereit machen und bezahlen", in der Liste darunter "Wartet auf Spieler". Die Liste "Meine Spiele" ist nicht nach Datum sortiert (17.11., 15.11., 14.11., 12.11., 04.11.) und mischt Zukunft, Absage und Vergangenes in einer Spalte; Status nur als graues oder orangefarbenes 12-px-Wort rechts, ohne Form oder Symbol. | spieler01_desktop_app.png, spieler01_mobil_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-AP-3 | P2 | "Meine Spiele" bricht hart bei fünf Einträgen ab (Seed hat 9 Spiele, davon 3 vergangene Spiele 7/14/21 Tage zurück; sichtbar ist nur eines, "Mi., 04.11. Beendet") ohne "Alle ansehen" und ohne Ergebnis (5:3 steht erst auf der Teamseite). Die Spielhistorie ist von hier nicht erreichbar. | spieler01_desktop_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-AP-4 | P1 | Das bestätigte Spiel #1003 ("Bestätigt: Das Spiel steht") nennt weder Halle noch Treffpunkt noch den eigenen Status (bin ich bereit, zahle ich?). Für einen Spieler am Handy ist "wo und wann?" die erste Frage; Halle (Seed-Halle Nord) steht nur in der Lobby-Liste auf `/suche`, nicht im Kasten oder in "Meine Spiele". | spieler01_mobil_app.png, spieler01_desktop_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-AP-5 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_app.png | wiederholt
- X-03 | bereits vorhanden, hier bestätigt | spieler01_mobil_app.png | siehe Durchgangstabelle
- X-04 | bereits vorhanden, hier bestätigt | spieler01_mobil_app.png | siehe Durchgangstabelle
- X-20 | bereits vorhanden, hier bestätigt | spieler01_mobil_app.png | siehe Durchgangstabelle
- SM-AP-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_app.png | siehe Durchgangstabelle

##### /app (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_app.png (Messung 16 von 55 Zielen unter 44 px, Seitenhöhe 1910 px, kein Überlauf)
Bewertung: Am Desktop liest sich der gefüllte Zustand klarer (Kasten mit Knopf rechts), die Doppelung von Kasten und Liste bleibt; "Beendet" steht ohne Ergebnis, die Liste hat keine Datumsordnung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4, 8] Funde: N2-AP-1, N2-AP-2, N2-AP-3, N2-AP-4 |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 16 von 55 Zielen unter 44 px; Hover fehlt (SD-ALL-4) |
| distill (reference/distill.md, manuell) | [Information Architecture] Funde: Schnellzugriff 2. Reihe mit Lücke (SD-AP-4); Liste (N2-AP-3) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-AP-2; Guthaben-Karte (MUSS WEG) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: 720-px-Spalte (X-17); vier Primärknöpfe im ersten Bildschirm (SD-AP-3) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_app.png | wiederholt
- N2-AP-2 | siehe /app (Spieler mit Team, Handy) | spieler01_desktop_app.png | wiederholt
- N2-AP-3 | siehe /app (Spieler mit Team, Handy) | spieler01_desktop_app.png | wiederholt
- N2-AP-4 | siehe /app (Spieler mit Team, Handy) | spieler01_desktop_app.png | wiederholt
- SD-AP-3 | bereits vorhanden, hier bestätigt | spieler01_desktop_app.png | siehe Durchgangstabelle
- SD-AP-4 | bereits vorhanden, hier bestätigt | spieler01_desktop_app.png | siehe Durchgangstabelle
- X-17 | bereits vorhanden, hier bestätigt | spieler01_desktop_app.png | siehe Durchgangstabelle

##### /app/suche/neu (Spieler mit Team, Handy)
Beleg: spieler01_mobil_app-suche-neu.png (Messung 9 von 36 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: Ein Mitglied von Seed Rot liest "Du brauchst ein Team, bei dem du Team-Admin bist" und bekommt "Team gründen": falsche Handlung (SM-SN-1). Reiter "Profil" aktiv statt "Spiel suchen".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 3] Funde: SM-SN-1, SM-GL-1 (Reiter) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 9 von 36 Zielen unter 44 px; Seite endet nach 844 px |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-SN-1, Rollenbegriffe (SM-GL-5) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-SN-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-suche-neu.png | siehe Durchgangstabelle
- SM-GL-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-suche-neu.png | siehe Durchgangstabelle
- SM-GL-5 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-suche-neu.png | siehe Durchgangstabelle

##### /app/suche/neu (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_app-suche-neu.png (Messung 13 von 36 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy; schmale 448-px-Spalte (SD-SN-1), die Aussage passt nicht zu einem Mitglied.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2] Funde: SM-SN-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 13 von 36 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-SN-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-SN-1 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-SN-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-suche-neu.png | siehe Durchgangstabelle
- SD-SN-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-suche-neu.png | siehe Durchgangstabelle

##### /app/einstellungen (Spieler mit Team, Handy)
Beleg: spieler01_mobil_app-einstellungen.png (Messung 30 von 69 Zielen unter 44 px, Seitenhöhe 2179 px, kein Überlauf)
Bewertung: Gefülltes Profil (Name, Köln, Abwehr), Profilfarbe ohne sichtbare Auswahl, elf Haken für Benachrichtigungen, darunter "Neue Aufgabe für Admins" für einen Spieler. Seite 2179 px lang.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 7, 10] Funde: Admin-Art für Spieler (SM-ES-1), Profilfarbe (SD-ES-1), Länge (X-08) |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 30 von 69 Zielen unter 44 px (Checkbox-Zeilen); kein Überlauf |
| distill (reference/distill.md, manuell) | [Progressive disclosure] Funde: elf Haken ohne Gruppierung (X-08) |
| clarify (reference/clarify.md, manuell) | [Forms, Success] Funde: Erfolg/Fehler siehe extra-Zellen (N2-ES-1 bis N2-ES-3) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Zwei Speichern-Knöpfe 44 px (gut) aber Abstand zur Navigation |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-ES-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-einstellungen.png | siehe Durchgangstabelle
- SD-ES-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-einstellungen.png | siehe Durchgangstabelle
- X-08 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-einstellungen.png | siehe Durchgangstabelle

##### /app/einstellungen (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_app-einstellungen.png (Messung 34 von 69 Zielen unter 44 px, Seitenhöhe 1967 px, kein Überlauf)
Bewertung: Der volle Zustand zeigt drei Blöcke mit vier Balken in gleicher Gewichtung ("Profil speichern", "Speichern", "Alle meine Daten..."); Push meldet "noch nicht eingerichtet".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 8] Funde: SD-ES-1, SD-ES-4, SM-ES-1 |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: 34 von 69 Zielen unter 44 px; Checkboxen 20 px (SD-ES-2) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: SD-ES-3 (Konto löschen ohne Guthabenhinweis) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: "Zahlungen bekommst du immer" (SM-ES-2) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SD-ES-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle
- SD-ES-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle
- SD-ES-3 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle
- SD-ES-4 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle
- SM-ES-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle
- SM-ES-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-einstellungen.png | siehe Durchgangstabelle

##### /app/benachrichtigungen (Spieler mit Team, Handy)
Beleg: spieler01_mobil_app-benachrichtigungen.png (Messung 9 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: Der Seed erzeugt keine Benachrichtigungen für Spieler 01: Leerzustand "Noch keine Benachrichtigungen." Gefüllte Einträge sind mit dem Seed nicht prüfbar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1] Funde: Leerzustand ohne Beispiel (SM-BE-1); gefüllter Zustand nicht prüfbar |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 9 von 35 Zielen unter 44 px; "Einstellungen" kleiner Link |
| distill (reference/distill.md, manuell) | [Information Architecture] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-BE-1 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: SD-ALL-9 (kurze Seite) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-BE-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-benachrichtigungen.png | siehe Durchgangstabelle
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-benachrichtigungen.png | siehe Durchgangstabelle

##### /app/benachrichtigungen (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_app-benachrichtigungen.png (Messung 13 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy, kurze Seite, Leerzustand; Seed ohne Benachrichtigung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1] Funde: SM-BE-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 13 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-BE-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-ALL-9 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-BE-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-benachrichtigungen.png | siehe Durchgangstabelle
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-benachrichtigungen.png | siehe Durchgangstabelle

##### /app/guthaben (Spieler mit Team, Handy)
Beleg: spieler01_mobil_app-guthaben.png (Messung 9 von 41 Zielen unter 44 px, Seitenhöhe 1519 px, kein Überlauf)
Bewertung: Mit dem Seed ändert sich nichts: 0,00 Euro, "Noch keine Buchungen/Belege"; ein Verlauf mit Einträgen ist nicht prüfbar (Seed legt kein Hauptbuch an). Aufladen, Rabattcode und Fristtext stehen noch.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SM-GU-1, X-09, X-05 (alles MUSS WEG, schon im Dokument) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 9 von 41 Zielen unter 44 px; "Jetzt bezahlen" unter der Navigation verdeckt (Artefakt) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: X-09 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: Fristtext "bis 24 Stunden vorher ab" (siehe MUSS WEG-Tabelle) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: X-09 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-GU-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-guthaben.png | siehe Durchgangstabelle
- X-09 | bereits vorhanden, hier bestätigt | spieler01_mobil_app-guthaben.png | siehe Durchgangstabelle

##### /app/guthaben (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_app-guthaben.png (Messung 13 von 41 Zielen unter 44 px, Seitenhöhe 1247 px, kein Überlauf)
Bewertung: Unverändert gegenüber SD-GU-1/2: Aufladeformular und Erklärung, Leerzustände ohne Daten.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SD-GU-1, SD-GU-2 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 13 von 41 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: SD-GU-2 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: siehe MUSS WEG |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SD-GU-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-guthaben.png | siehe Durchgangstabelle
- SD-GU-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_app-guthaben.png | siehe Durchgangstabelle

#### Spieler mit Team: Zusatzaufnahmen

##### Konto-Menü (geöffnet, auf /app) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-kontomenue.png
Bewertung: Das Menü legt sich über die Spielkarten; sieben Einträge, darunter "Guthaben 0,00 €" (MUSS WEG), ohne Hintergrunddämpfung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 3 Kontrolle] Funde: N2-KM-1; Eintrag "Guthaben" (SM-GL-2) |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: sieben Einträge je 222 x 36 px (Messung); Escape schließt (geprüft) |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: Doppelung Mein Bereich/Mein Profil/Konto und Einstellungen |
| clarify (reference/clarify.md, manuell) | [Actions] Funde: "Konto und Einstellungen" gegen Seitentitel "Einstellungen" |
| adapt (reference/adapt.md, manuell) | [Mobile, Touch] Funde: 36 px hohe Einträge (N2-KM-1, SM-GL-3) |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-KM-1 | P2 | Konto-Menü am Handy (240 x 336 px, rechtsbündig unter dem Knopf): legt sich über Kasten und Spielkarten, ohne Abdunklung des Hintergrunds und ohne Schließen-Schaltfläche; der geöffnete Menüknopf bekommt einen roten Rahmen, der mit der Akzentfarbe der Primärknöpfe verwechselt wird. Sieben Einträge je 36 px hoch (Messung), ergänzt SM-GL-3. | spieler01_mobil_extra-kontomenue.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- SM-GL-2 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-kontomenue.png | siehe Durchgangstabelle
- SM-GL-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-kontomenue.png | siehe Durchgangstabelle

##### Konto-Menü (geöffnet, auf /app) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-kontomenue.png
Bewertung: Am Desktop sauber unter dem Knopf, verdeckt aber den Kasten; "Guthaben 0,00 €" bleibt, die Kopfleiste zeigt zusätzlich den Betrag.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SD-ALL-2, SD-ALL-3; Guthaben doppelt (Leiste und Menü) |
| audit (reference/audit.md, manuell) | [Dimension 1, 4] Funde: Einträge 222 x 36 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Betrag in Leiste und Menü (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Actions] Funde: keine neuen Funde |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SD-ALL-2 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-kontomenue.png | siehe Durchgangstabelle
- SD-ALL-3 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-kontomenue.png | siehe Durchgangstabelle
- SD-ALL-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-kontomenue.png | siehe Durchgangstabelle

##### /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-einstellungen-profil-erfolg.png
Bewertung: Nach dem Klick erscheint kleines "Gespeichert." in roter Akzentfarbe unter dem Knopf; es sieht aus wie eine Fehlermeldung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1 Status] Funde: N2-ES-1, N2-ES-3 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: Meldung als Status-Region ausgeliefert (gut, aria-live gemessen); Farbe Akzent auf Hellgrund |
| distill (reference/distill.md, manuell) | [Feedback] Funde: keine Funde über N2-ES-1 |
| clarify (reference/clarify.md, manuell) | [Success states] Funde: N2-ES-3 (kein Objekt, bleibt stehen) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-1 | P1 | Farbsemantik vertauscht: "Gespeichert." erscheint als kleiner Text in der roten Akzentfarbe (wirkt wie ein Fehler), der Fehler "Der Name braucht 2 bis 60 Zeichen." dagegen in einem schwarz umrandeten Kasten (wirkt wie ein Hinweisfeld). Beides ohne Symbol und ohne Erfolgsgrün/Fehlerfarbe; ergänzt N1-OB-3 um den Erfolgsfall. | spieler01_mobil_extra-einstellungen-profil-erfolg.png, spieler01_mobil_extra-einstellungen-profil-leer.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-ES-3 | P2 | "Gespeichert." nennt kein Objekt: Es gibt zwei Formulare mit den Knöpfen "Profil speichern" und "Speichern" auf einer Seite, nach dem zweiten steht nur "Gespeichert." (Benachrichtigungen? alles?). Die Meldung bleibt dauerhaft stehen, auch wenn man danach etwas ändert (ungespeicherter Zustand wird nicht angezeigt). Ergänzt X-08. | spieler01_mobil_extra-einstellungen-prefs-erfolg.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)

##### /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-einstellungen-profil-erfolg.png
Bewertung: Wie am Handy: "Gespeichert." klein und rot unter dem Knopf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-ES-1 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: Status-Region vorhanden (gemessen) |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-ES-3 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-1 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_desktop_extra-einstellungen-profil-erfolg.png | wiederholt
- N2-ES-3 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_desktop_extra-einstellungen-profil-erfolg.png | wiederholt

##### /app/einstellungen, Profil speichern (leerer Name) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-einstellungen-profil-leer.png
Bewertung: Fehler "Der Name braucht 2 bis 60 Zeichen." in schwarz umrandetem Kasten unter dem Knopf; Namensfeld liegt außerhalb des Bildes und ist nicht markiert.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9] Funde: N2-ES-2, N2-ES-1 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: Status-Region (alert) vorhanden; Feld ohne Markierung |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify, Errors] Funde: Meldung benennt Problem und Regel (gut), aber nicht das Feld (N2-ES-2) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: Abstand Feld-Meldung rund 700 px |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-2 | P1 | Fehlermeldung steht unter dem Speichern-Knopf, etwa 700 px unter dem Namensfeld (Handy), ohne Markierung des Feldes, ohne Fokus auf das Feld und ohne Hinweis im sichtbaren Bereich, wenn der Knopf nicht in der Nähe ist. (Hinweis: die Browser-Pflichtprüfung wurde für den Lauf abgeschaltet, damit der Serverfehler erscheint; ein echter Nutzer sieht zuerst die Browser-Sprechblase, siehe N1-OB-1.) | spieler01_mobil_extra-einstellungen-profil-leer.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-ES-1 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_mobil_extra-einstellungen-profil-leer.png | wiederholt

##### /app/einstellungen, Profil speichern (leerer Name) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-einstellungen-profil-leer.png
Bewertung: Der Fehlerkasten steht direkt unter dem Knopf, das Namensfeld liegt außerhalb des Bildes.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-ES-2, N2-ES-1 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-ES-2 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-2 | siehe /app/einstellungen, Profil speichern (leerer Name) (Spieler mit Team, Handy) | spieler01_desktop_extra-einstellungen-profil-leer.png | wiederholt
- N2-ES-1 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_desktop_extra-einstellungen-profil-leer.png | wiederholt

##### /app/einstellungen, Speichern (Benachrichtigungen, Erfolg) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-einstellungen-prefs-erfolg.png
Bewertung: Nach "Speichern" steht "Gespeichert." klein und rot unter dem Knopf; kein Hinweis, was gespeichert wurde.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1] Funde: N2-ES-3, N2-ES-1 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: Status-Region vorhanden |
| distill (reference/distill.md, manuell) | [Distill] Funde: elf Haken (X-08) |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-ES-3; Admin-Art (SM-ES-1) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: Knopf 44 px (gut) |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-3 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_mobil_extra-einstellungen-prefs-erfolg.png | wiederholt
- N2-ES-1 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_mobil_extra-einstellungen-prefs-erfolg.png | wiederholt
- SM-ES-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-einstellungen-prefs-erfolg.png | siehe Durchgangstabelle

##### /app/einstellungen, Speichern (Benachrichtigungen, Erfolg) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-einstellungen-prefs-erfolg.png
Bewertung: Wie am Handy; elf Haken, Meldung klein und rot.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-ES-3 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine neuen Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-ES-3 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-3 | siehe /app/einstellungen, Profil speichern (Erfolg) (Spieler mit Team, Handy) | spieler01_desktop_extra-einstellungen-prefs-erfolg.png | wiederholt

##### /spieler?q=Dario (ein Treffer) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-spieler-treffer.png
Bewertung: Ein Treffer, Suchfeld zeigt nur "Da" (zwei von fünf Zeichen); kein Treffer-Zähler, kein Zurücksetzen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 3] Funde: N1-SP-1, N1-SP-3 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: Feld 48 px (X-01) |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: kein "1 Spieler gefunden" (N1-SP-3) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: X-01 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-treffer.png | siehe Durchgangstabelle
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-treffer.png | siehe Durchgangstabelle
- N1-SP-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-treffer.png | siehe Durchgangstabelle

##### /spieler?q=Dario (ein Treffer) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-spieler-treffer.png
Bewertung: Sauber: Suchfeld, ein Treffer, kein Zähler.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N1-SP-3 |
| audit (reference/audit.md, manuell) | [Dimension 1] Funde: X-16 (Platzhalter) |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N1-SP-3 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-3 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-spieler-treffer.png | siehe Durchgangstabelle
- X-16 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-spieler-treffer.png | siehe Durchgangstabelle

##### /spieler?q=zzzz (kein Treffer) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-spieler-leer.png
Bewertung: "Keine Spieler gefunden." nackt, Suchfeld zeigt nur "zzz".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9] Funde: N1-SP-1, N1-SP-4 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: X-01 |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify, Empty states] Funde: N1-SP-4 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: X-01 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-leer.png | siehe Durchgangstabelle
- N1-SP-4 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-leer.png | siehe Durchgangstabelle
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-spieler-leer.png | siehe Durchgangstabelle

##### /spieler?q=zzzz (kein Treffer) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-spieler-leer.png
Bewertung: "Keine Spieler gefunden." ohne Hilfe, Fußzeile direkt darunter.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N1-SP-4 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N1-SP-4 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: SD-ALL-9 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-SP-4 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-spieler-leer.png | siehe Durchgangstabelle
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-spieler-leer.png | siehe Durchgangstabelle

##### /teams?q=Rot (ein Treffer) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-teams-treffer.png
Bewertung: Seed Rot allein in der Liste, ohne Hinweis "Dein Team"; Feld zeigt "Ro".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SM-TE-1, X-01 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: X-01 |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: SM-TE-1 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: X-01 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-TE-1 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-teams-treffer.png | siehe Durchgangstabelle
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-teams-treffer.png | siehe Durchgangstabelle

##### /teams?q=Rot (ein Treffer) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-teams-treffer.png
Bewertung: Ein Treffer ohne Markierung des eigenen Teams.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SM-TE-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: SM-TE-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-TE-1 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-teams-treffer.png | siehe Durchgangstabelle

##### /teams?q=zzzz (kein Treffer) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-teams-leer.png
Bewertung: "Keine Teams gefunden." nackt, Feld "zzz", Reiter "Teamspiel" aktiv.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N1-TE-3, X-01 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: X-01 |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N1-TE-3 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: X-01 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-TE-3 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-teams-leer.png | siehe Durchgangstabelle
- X-01 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-teams-leer.png | siehe Durchgangstabelle

##### /teams?q=zzzz (kein Treffer) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-teams-leer.png
Bewertung: "Keine Teams gefunden." ohne Hilfe.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N1-TE-3 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N1-TE-3 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-TE-3 | bereits vorhanden, hier bestätigt | spieler01_desktop_extra-teams-leer.png | siehe Durchgangstabelle

##### /suche?city=Köln (Filter mit Treffern) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-suche-filter-koeln.png
Bewertung: Filter Köln: Kasten, Filtermaske mit neuem Knopf "Zurücksetzen" (gut), zwei Lobbys von Rot und Blau. Der Spieler sieht seine Lobbys wieder als "anderer Teams".

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 3, 6] Funde: N2-SU-3, N2-AP-1; "Zurücksetzen" gut (keine Fund) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: Filter bleiben gesetzt (gut); Auswahl "Lobbys und Su…" abgeschnitten (X-10) |
| distill (reference/distill.md, manuell) | [Distill] Funde: N2-AP-1 |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: keine Anzeige, welche Filter aktiv sind (nur im Feld sichtbar) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: Karten ab y=1180 (N2-AP-1) |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-3 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_extra-suche-filter-koeln.png | wiederholt
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler01_mobil_extra-suche-filter-koeln.png | wiederholt
- N2-SU-4 | siehe /suche (Spieler mit Team, Handy) | spieler01_mobil_extra-suche-filter-koeln.png | wiederholt
- X-10 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-suche-filter-koeln.png | siehe Durchgangstabelle

##### /suche?city=Köln (Filter mit Treffern) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-suche-filter-koeln.png
Bewertung: Filter wirkt, "Zurücksetzen" erscheint; Karten zeigen jetzt "6 im Kader" bei Seed Rot (Folge des Beitritts von Spieler 17).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-SU-4, N2-SU-3 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: N2-AP-1 |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-SU-4 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-4 | siehe /suche (Spieler mit Team, Handy) | spieler01_desktop_extra-suche-filter-koeln.png | wiederholt
- N2-SU-3 | siehe / (Spieler mit Team, Handy) | spieler01_desktop_extra-suche-filter-koeln.png | wiederholt

##### /suche?art=suche (Filter ohne Treffer) (Spieler mit Team, Handy)
Beleg: spieler01_mobil_extra-suche-filter-leer.png
Bewertung: Leerzustand "Gerade ist keine Lobby offen..." bei aktivem Filter; Kasten und Filter bleiben stehen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9] Funde: N2-SU-1, N2-AP-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: Meldung unter dem Filter, 100 px hoch; Auswahl "Nur Gegnersuc…" abgeschnitten (X-10) |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify, Empty states] Funde: N2-SU-1 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-1 | P1 | Leerzustand mit aktivem Filter (Art = "Nur Gegnersuchen"): "Gerade ist keine Lobby offen. Mach eine Lobby für dein Team auf, dann erscheint sie hier für alle." Der Satz nennt den Filter nicht, behauptet etwas Falsches (vier Lobbys sind offen, nur nicht in dieser Art) und fordert den Spieler zu einer Handlung auf, die er nicht ausführen darf (SM-SU-1). "Zurücksetzen" ist als zweiter Knopf vorhanden (gut), aber ohne Bezug zur Meldung. | spieler01_desktop_extra-suche-filter-leer.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- X-10 | bereits vorhanden, hier bestätigt | spieler01_mobil_extra-suche-filter-leer.png | siehe Durchgangstabelle

##### /suche?art=suche (Filter ohne Treffer) (Spieler mit Team, Desktop)
Beleg: spieler01_desktop_extra-suche-filter-leer.png
Bewertung: Wie am Handy; Satz ignoriert den Filter und fordert zur Lobby auf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-SU-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-SU-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-SU-1 | siehe /suche?art=suche (Filter ohne Treffer) (Spieler mit Team, Handy) | spieler01_desktop_extra-suche-filter-leer.png | wiederholt

#### Spieler ohne Team

##### /app (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_app.png (Messung 9 von 48 Zielen unter 44 px, Seitenhöhe 2166 px, kein Überlauf)
Bewertung: Ein Spieler ohne Team bekommt oben die Box "So startest du" (gut), aber dann dieselben drei Karten, Guthaben-Karte und Kacheln wie ein Captain; "Lobby aufmachen" steht viermal.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan] Funde: N2-A17-1, N1-OB-12 (Lobby viermal), X-20 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 9 von 48 Zielen unter 44 px; kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: "Team gründen" dreimal (Box, Meine Teams, Text); Guthaben-Karte (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: "nimm eine Spielsuche an" (SM-AP-3, N1-OB-11) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Box gut, danach lange Kartenwand (X-03) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-A17-1 | P1 | "Meine Teams" ohne Team: "Gründe eins oder öffne einen Einladungslink, den dir ein Team-Admin schickt." Kein Weg zur Teamliste (`/teams`), zu "Mitspieler gesucht" (`/mitspieler`, damit ein Team dich findet) oder zum Einladungslink-Eingeben; wer den Link nicht mehr hat, steht an. Die Box "So startest du" nennt dieselben zwei Wege, aber auch "Lobby aufmachen" als Schritt 3, den ein Spieler ohne Team nicht kann. Ergänzt N1-OB-11/12. | spieler17_mobil_app.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N1-OB-12 | bereits vorhanden, hier bestätigt | spieler17_mobil_app.png | siehe Durchgangstabelle
- N1-OB-11 | bereits vorhanden, hier bestätigt | spieler17_mobil_app.png | siehe Durchgangstabelle
- X-20 | bereits vorhanden, hier bestätigt | spieler17_mobil_app.png | siehe Durchgangstabelle
- X-03 | bereits vorhanden, hier bestätigt | spieler17_mobil_app.png | siehe Durchgangstabelle

##### /app (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_app.png (Messung 13 von 48 Zielen unter 44 px, Seitenhöhe 1396 px, kein Überlauf)
Bewertung: Am Desktop steht die Box "So startest du" über den Spielkarten; die Seite bleibt rollen-blind für einen Spieler ohne Team.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-A17-1, X-20 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 13 von 48 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: dreimal "Team gründen" (N2-A17-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N1-OB-11 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-AP-3/SD-AP-4 gelten |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-A17-1 | siehe /app (Spieler ohne Team, Handy) | spieler17_desktop_app.png | wiederholt
- X-20 | bereits vorhanden, hier bestätigt | spieler17_desktop_app.png | siehe Durchgangstabelle
- N1-OB-11 | bereits vorhanden, hier bestätigt | spieler17_desktop_app.png | siehe Durchgangstabelle

##### /teams (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_teams.png (Messung 8 von 43 Zielen unter 44 px, Seitenhöhe 1107 px, kein Überlauf)
Bewertung: Dieselbe Liste wie für alle; nichts verbindet sie mit dem Wunsch, einem Team beizutreten.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan] Funde: N2-T17-1, X-01, N1-TE-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 43 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-T17-1 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: X-01 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | 2 Funde: low-contrast (Platzhalter "Teamname" 4,1:1, = X-16), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-T17-1 | P1 | `/teams` für Spieler ohne Team: der Satz "Schau dir Kader und Bilanz an und fordere sie heraus" richtet sich an Captains; es gibt keinen Weg "Diesem Team beitreten" oder "Anfragen", die Zeilen sind nicht als anklickbar erkennbar, und das eigene Fehlen eines Teams wird nicht erwähnt. Ergänzt SD-TE-1. | spieler17_mobil_teams.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- X-01 | bereits vorhanden, hier bestätigt | spieler17_mobil_teams.png | siehe Durchgangstabelle
- N1-TE-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_teams.png | siehe Durchgangstabelle

##### /teams (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_teams.png (Messung 12 von 43 Zielen unter 44 px, Seitenhöhe 923 px, kein Überlauf)
Bewertung: Wie am Handy; keine Handlung für Spieler ohne Team.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-T17-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 43 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-T17-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: X-17 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | 2 Funde: low-contrast (Platzhalter "Teamname" 4,1:1, = X-16), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-T17-1 | siehe /teams (Spieler ohne Team, Handy) | spieler17_desktop_teams.png | wiederholt
- X-17 | bereits vorhanden, hier bestätigt | spieler17_desktop_teams.png | siehe Durchgangstabelle

##### /matchmaking (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_matchmaking.png (Messung 12 von 38 Zielen unter 44 px, Seitenhöhe 1216 px, kein Überlauf)
Bewertung: "Du bist Captain..." für einen Spieler ohne Team; der Hinweis "Team gründen" ist hier immerhin passend, steht aber unter der Navigation.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2] Funde: SM-MA-1, N1-MM-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 38 Zielen unter 44 px; N1-MM-3 |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: N1-MM-4 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-MA-1, N1-MM-5 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | 2 Funde: straggler ("offen." allein in der letzten Zeile, = N1-MM-5), overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-MA-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-3 | bereits vorhanden, hier bestätigt | spieler17_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-4 | bereits vorhanden, hier bestätigt | spieler17_mobil_matchmaking.png | siehe Durchgangstabelle
- N1-MM-5 | bereits vorhanden, hier bestätigt | spieler17_mobil_matchmaking.png | siehe Durchgangstabelle

##### /matchmaking (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_matchmaking.png (Messung 16 von 38 Zielen unter 44 px, Seitenhöhe 812 px, kein Überlauf)
Bewertung: Wie bei Spieler 01; der Hinweis "Team gründen" passt hier.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SD-MM-1, N1-MM-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 16 von 38 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: SD-MM-1 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-MA-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | 3 Funde: line-length (~99 Zeichen, = N1-MM-5), straggler ("hier."), overused-font (kein Fund); Quelltext: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SD-MM-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_matchmaking.png | siehe Durchgangstabelle
- N1-MM-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_matchmaking.png | siehe Durchgangstabelle
- SM-MA-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_matchmaking.png | siehe Durchgangstabelle

##### /einladung/seed-team-gueltig (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_einladung-seed-team-gueltig.png (Messung 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: Hier stimmt die Einladung: ein Spieler ohne Team sieht Teamname, Stadt, Kader und "Team beitreten". Es fehlen Einladender, Rolle und Frist (N1-EG-1).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 5] Funde: N1-EG-1, N1-EG-3; Ziel gut erreichbar (Knopf 44 px) |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 8 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: keine Funde (ein Ziel, gut) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: Folge des Beitritts nicht genannt (N2-BE-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-gueltig` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EG-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- N1-EG-3 | bereits vorhanden, hier bestätigt | spieler17_mobil_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- N2-BE-1 | P1 | "Team beitreten" (Spieler 17, gültiger Link) führt ohne Meldung auf die Teamseite `/teams/seed-rot`: kein "Du bist jetzt im Team Seed Rot", keine Erklärung zur Rolle (Spieler, nicht Captain), kein Hinweis, dass der Team-Admin benachrichtigt wurde, keine nächste Handlung. Das Konto ist ab da permanent Mitglied (siehe Änderung der Seed-Daten). Ein zweiter Klick (Desktop, schon Mitglied) endet gleich still (SD-EL-1). | spieler17_mobil_extra-beitreten-nachher.png, spieler17_desktop_extra-beitreten-nachher.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)

##### /einladung/seed-team-gueltig (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_einladung-seed-team-gueltig.png (Messung 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy; der Knopf ist der klare einzige Ziel.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N1-EG-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 12 von 35 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: N2-BE-1 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-ALL-9 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-gueltig` | 1 Fund: overused-font (kein Fund); Seite per URL ohne Sitzung gemessen; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-EG-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_einladung-seed-team-gueltig.png | siehe Durchgangstabelle
- N2-BE-1 | siehe /einladung/seed-team-gueltig (Spieler ohne Team, Handy) | spieler17_desktop_einladung-seed-team-gueltig.png | wiederholt
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler17_desktop_einladung-seed-team-gueltig.png | siehe Durchgangstabelle

##### /app/suche/neu (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_app-suche-neu.png (Messung 9 von 36 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf)
Bewertung: "Du brauchst ein Team..." mit "Team gründen": für einen Spieler ohne Team die richtige Antwort, aber ohne zweiten Weg (Einladungslink, Mitspieler gesucht). Reiter "Profil" aktiv.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 3] Funde: N2-A17-1, SM-GL-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 9 von 36 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Interaction Simplification] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: SM-GL-5 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): straggler ("nötig.", gehört zu `/anmelden`, = X-13), overused-font; Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-A17-1 | siehe /app (Spieler ohne Team, Handy) | spieler17_mobil_app-suche-neu.png | wiederholt
- SM-GL-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_app-suche-neu.png | siehe Durchgangstabelle

##### /app/suche/neu (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_app-suche-neu.png (Messung 13 von 36 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf)
Bewertung: Wie am Handy, in der 448-px-Spalte.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-A17-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 13 von 36 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: keine Funde |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: SD-SN-1 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` | per URL ohne Sitzung wurde die Anmeldeseite gemessen (Weiterleitung): overused-font (kein Fund); Quelltext der Seite: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-A17-1 | siehe /app (Spieler ohne Team, Handy) | spieler17_desktop_app-suche-neu.png | wiederholt
- SD-SN-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_app-suche-neu.png | siehe Durchgangstabelle

#### Spieler ohne Team: Zusatzaufnahmen (Beitritt, danach)

##### /einladung/seed-team-gueltig, nach "Team beitreten" (Ziel /teams/seed-rot) (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_extra-beitreten-nachher.png
Bewertung: Nach dem Klick landet er ohne Meldung auf der Teamseite von Seed Rot (Kader 6, "Team verlassen", Kommentare). Zustand vorher: kein Team (spieler17_mobil_app.png, Kader 5); nachher: Mitglied, Rolle Spieler.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 9] Funde: N2-BE-1, N2-BE-3 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: Teamseite 2090 px; "Team verlassen" rund 34 px hoch (N2-BE-3) |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify, Success states] Funde: keine Bestätigung (N2-BE-1) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: Reiter "Teamspiel" aktiv (stimmt hier) |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-BE-1 | siehe /einladung/seed-team-gueltig (Spieler ohne Team, Handy) | spieler17_mobil_extra-beitreten-nachher.png | wiederholt
- N2-BE-3 | P2 | Auf der Teamseite nach dem Beitritt steht "Team verlassen" als kleiner Knopf (Bildmaß rund 114 x 34 px, Handy) direkt unter dem Kader, ohne Erklärung der Folgen; dazu der Kopf mit Badge "S" ohne Erklärung. (Teamseite gehört nicht zur Gruppe X, nur als Folgezustand gesehen.) | spieler17_mobil_extra-beitreten-nachher.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)

##### /einladung/seed-team-gueltig, Klick als schon Mitglied (Ziel /teams/seed-rot) (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_extra-beitreten-nachher.png
Bewertung: Der Desktop-Lauf lief nach dem Handy-Lauf, Spieler 17 war schon Mitglied: der zweite Klick führt wieder still auf die Teamseite (belegt SD-EL-1). Zustand vorher für Desktop: spieler17_desktop_einladung-seed-team-gueltig.png.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-BE-1, SD-EL-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-BE-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-BE-1 | siehe /einladung/seed-team-gueltig (Spieler ohne Team, Handy) | spieler17_desktop_extra-beitreten-nachher.png | wiederholt
- SD-EL-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_extra-beitreten-nachher.png | siehe Durchgangstabelle

##### /app nach dem Beitritt (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_extra-app-nachher.png
Bewertung: Aus "So startest du" wurde ein Kasten mit zwei Spielen, dazu "Meine Spiele" mit vier Einträgen und "Meine Teams: Seed Rot, Spieler". Aber auch Spiele, die vor seinem Beitritt waren.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 2] Funde: N2-AP-6, N2-AP-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: 2696 px lang, kein Überlauf |
| distill (reference/distill.md, manuell) | [Distill] Funde: Guthaben-Karte (MUSS WEG), Kachelraster (X-04) |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: "Bereit machen und bezahlen" für ein Spiel, in dem er nicht steht (N2-AP-6) |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-6 | P1 | Nach dem Beitritt sieht das neue Mitglied sofort die Spiele des Teams als "Meine Spiele", auch ein bereits beendetes (04.11.) und ein abgesagtes, sowie im Kasten #1001 mit "Bereit machen und bezahlen", obwohl er in der Lobby #1001 gar nicht als Teilnehmer steht (Lobby-Liste: Anton, Berk, Rot Captain). Wer ist dabei, wer zahlt? Das Kartenmodell (Vertrag 012) bleibt dadurch unklar. | spieler17_mobil_extra-app-nachher.png | critique, audit, distill, clarify, adapt (siehe Durchgangstabelle)
- N2-AP-1 | siehe / (Spieler mit Team, Handy) | spieler17_mobil_extra-app-nachher.png | wiederholt
- N2-AP-2 | siehe /app (Spieler mit Team, Handy) | spieler17_mobil_extra-app-nachher.png | wiederholt
- X-04 | bereits vorhanden, hier bestätigt | spieler17_mobil_extra-app-nachher.png | siehe Durchgangstabelle

##### /app nach dem Beitritt (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_extra-app-nachher.png
Bewertung: Wie am Handy; "Meine Teams" zeigt Seed Rot, die Spiele des Teams erscheinen ohne Vorgeschichte.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-AP-6, N2-AP-2 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: N2-AP-1 |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-AP-6 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-AP-6 | siehe /app nach dem Beitritt (Spieler ohne Team, Handy) | spieler17_desktop_extra-app-nachher.png | wiederholt
- N2-AP-2 | siehe /app (Spieler mit Team, Handy) | spieler17_desktop_extra-app-nachher.png | wiederholt

##### /einladung/seed-team-gueltig, nachdem er Mitglied ist (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_extra-einladung-gueltig-als-mitglied.png
Bewertung: Nach dem Beitritt zeigt der Link weiter "Team beitreten" mit "6 Spieler im Kader": bestätigt SM-EL-1 auch für das frische Mitglied.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SM-EL-1, N2-BE-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: SM-EL-1 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-EL-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_extra-einladung-gueltig-als-mitglied.png | siehe Durchgangstabelle
- N2-BE-1 | siehe /einladung/seed-team-gueltig (Spieler ohne Team, Handy) | spieler17_mobil_extra-einladung-gueltig-als-mitglied.png | wiederholt

##### /einladung/seed-team-gueltig, nachdem er Mitglied ist (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_extra-einladung-gueltig-als-mitglied.png
Bewertung: Gleiches Bild: "Team beitreten" bei bestehender Mitgliedschaft.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: SM-EL-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: SM-EL-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: keine neuen Funde |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- SM-EL-1 | bereits vorhanden, hier bestätigt | spieler17_desktop_extra-einladung-gueltig-als-mitglied.png | siehe Durchgangstabelle

##### /einladung/seed-team-abgelaufen (nach dem Beitritt) (Spieler ohne Team, Handy)
Beleg: spieler17_mobil_extra-einladung-abgelaufen.png
Bewertung: "Link abgelaufen" mit Verweis auf den Team-Admin; er ist nun Mitglied und weiß nichts davon.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-EA-1, N1-EA-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-EA-1 |
| adapt (reference/adapt.md, manuell) | [Mobile] Funde: Reiter "Privatspiel" aktiv (N1-EG-3) |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-EA-1 | siehe /einladung/seed-team-abgelaufen (Spieler mit Team, Handy) | spieler17_mobil_extra-einladung-abgelaufen.png | wiederholt
- N1-EA-1 | bereits vorhanden, hier bestätigt | spieler17_mobil_extra-einladung-abgelaufen.png | siehe Durchgangstabelle
- N1-EG-3 | bereits vorhanden, hier bestätigt | spieler17_mobil_extra-einladung-abgelaufen.png | siehe Durchgangstabelle

##### /einladung/seed-team-abgelaufen (nach dem Beitritt) (Spieler ohne Team, Desktop)
Beleg: spieler17_desktop_extra-einladung-abgelaufen.png
Bewertung: Wie am Handy.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A] Funde: N2-EA-1 |
| audit (reference/audit.md, manuell) | [Dimension 4] Funde: keine neuen Funde |
| distill (reference/distill.md, manuell) | [Distill] Funde: keine Funde |
| clarify (reference/clarify.md, manuell) | [Clarify] Funde: N2-EA-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] Funde: SD-ALL-9 |
| kein eigener detect-Lauf (gleiche Seite wie in der Grundzelle); Zustand nur per Playwright aufgenommen |  |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-EA-1 | siehe /einladung/seed-team-abgelaufen (Spieler mit Team, Handy) | spieler17_desktop_extra-einladung-abgelaufen.png | wiederholt
- SD-ALL-9 | bereits vorhanden, hier bestätigt | spieler17_desktop_extra-einladung-abgelaufen.png | siehe Durchgangstabelle



#### Nachlauf-Blatt N3 Captain Rot

Stand: Nachlauf der Gruppe-X-Analyse, Teil 3. Dev-Server Port 3102, Engine 0.1.19 über den Launcher, Seed laut analyse-seed.md (frisch geladen). Nur gelesen, gemessen und Formulare benutzt; kein Quelltext geändert. Rolle: Captain Rot = `seed-captain-rot@test.local` (Rot Captain, Team-Admin von Seed Rot, hat Karte, Veranstalter des Privatspiels #1018). Kennungen: N3 = Nachlauf 3. Vorhandene Funde (X-nn, GM-, GD-, SM-, SD-, CM-, CD-, N1-, N2-) werden nur referenziert.

#### Methode und Grenzen

- Die fünf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollständig gelesen. critique/audit/distill/clarify/adapt haben keinen Launcher-Befehl: sie liefen manuell nach den Dateien, je Durchgang steht in eckigen Klammern der angewandte Teil. critique bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher) lief einmal: PRODUCT.md geladen (Plattform web, Kartenmodell nach Vertrag 012). `detect --json --viewport <WxH> <URL>` lief je Seite und Viewport (26 Läufe); `/` und `/suche` liefen bei beiden Viewports wieder in den Timeout nach 30 s (Dauerverbindung), die Wiederholung brachte dasselbe: Ersatz = Quelltext-Lauf (Startseite, Seitenordner suche, spieler, teams, matchmaking, mitspieler, einladung, app sowie UserMenu.tsx, Header.tsx, BottomNav.tsx: je keine Funde). `detect` per URL hat keine Sitzung: für `/app*` und `/einladung*` wurde die Weiterleitung auf die Anmeldeseite bzw. die Seite ohne Sitzung gemessen (daher dort der Hinweis „nötig.“ als straggler der Anmeldeseite, nicht des Captain-Bildes). `overused-font` (Plus Jakarta Sans) ist in DESIGN.md gesetzt: kein Fund.
- Ganzseitige Handy-Bilder zeigen die feste untere Navigation und die feste Kopfleiste mitten im Bild und das runde N (Next-Overlay): Aufnahme-Artefakt, kein Fund. Das gilt auch für alle Zusatzaufnahmen mit fullPage.
- Die Browser-Pflichtmeldungen (Chromium, englisch: „Please fill out this field.“) sind Browsertext und stehen im deutschen Browser deutsch; bewertet wird nur, dass die Seite selbst nichts erklärt. Für Server-Fehlerzustände wurden `min`, `required` und `minlength` im DOM abgeschaltet, sonst erreicht das Absenden den Server.
- Zusatzaufnahmen per Playwright (Dev-Login), Muster `captainrot_<geraet>_extra-<name>.png`. Nicht prüfbar: Teilen-/Kopieren-Knopf des Einladungslinks (nicht angeklickt), Rückfrage bei „Spielsuche zurückziehen“ und „Lobby schließen“ (nicht angeklickt), Push (Server nicht eingerichtet), „Bitte warten…“ des Absende-Knopfs (zu kurz), echter Google-Login.

#### Geänderte Seed-Daten durch die Analyse (vorher/nachher)

| Aktion (Captain Rot) | Vorher | Nachher |
|---|---|---|
| Spielsuche (fester Termin) per `/app/suche/neu`, Handy: Mo. 23.11., 19:00, Hinweis „Analyse-Test mobil“ | keine eigene Spielsuche | 1 offene Spielsuche von Seed Rot (öffentlich) |
| Spielsuche per `/app/suche/neu`, Desktop: Di. 24.11., 19:00, Hinweis „Analyse-Test desktop“ | siehe oben | zweite offene Spielsuche von Seed Rot |
| Lobby aufmachen per `/matchmaking`, Handy: Di. 24.11., 19:00 bis 21:00 (Spiel #1020) | keine offene Lobby von Seed Rot außer #1010 | #1020 offen |
| „Suche abbrechen“ (Desktop, auf #1020) | #1020 offen | #1020 abgebrochen |
| Lobby aufmachen, Desktop: Sa. 21.11., 19:00 bis 21:00 (Spiel #1022) | – | #1022 offen (bleibt bestehen) |
| Versuch Desktop mit Sa. 25.11. (zu weit weg) | – | abgelehnt: „höchstens 14 Tage“, nichts gespeichert |
| Profil speichern, Benachrichtigungen speichern (unveränderte Werte), Name leer (abgelehnt) | Name „Rot Captain“ | unverändert |
| Benachrichtigungen geöffnet | 1 ungelesen (Quirin Testmann ist Seed Rot beigetreten, aus Teil 2) | 0 ungelesen (gelesen markiert) |
Rückgängig nur per Seed-Neuaufruf (löscht und erzeugt Spiele neu) oder per „Suche abbrechen“/„Spielsuche zurückziehen“ im Konto des Captains (nicht ausgeführt). Zusätzlich liegen weiterhin die Änderungen aus Teil 2 (Quirin Testmann Mitglied von Seed Rot).

#### Zähler

- Angesehen: 26 Grid-Bilder + 32 Zusatzaufnahmen = 58 von 58 Bildern (je Bild einzeln mit Read geöffnet; der Lauf der Zusatzaufnahmen wurde für drei Zustände wiederholt: Anstoß-Raster, Desktop-Lobby gültig und /app nach Erfolg, beide Fassungen angesehen).
- Durchgänge: je Zelle critique, audit, distill, clarify, adapt als eigene Zeilen (Grid 26 Zellen, Zusatz 32 Zellen = 58 Abschnitte), plus detect je Seite und Viewport (26 Läufe, 4 davon Timeout mit Quelltext-Ersatz).
- Neue Funde (Erstnennung): P0 0, P1 15, P2 12; gesamt 27.

#### Grid-Zellen (13 Seiten x 2 Geräte)

##### / (Captain Rot, Handy)
Beleg: captainrot_mobil_start.png (Messung 60 von 95 Zielen unter 44 px, Seitenhöhe 5535 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Eingeloggt öffnet die Startseite mit dem Kasten „Meine aktuellen Spiele“ (drei Karten, drei Primärknöpfe, rund 480 px) und schiebt das Hallenfoto darunter; die Seite hat 5535 px, die Lobbyliste (vier Karten) füllt das untere Drittel. Der Hero-Knopf ist „Team gründen“, obwohl der Captain ein Team hat.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Kognitive Last (Wand der Optionen), Persona Casey] Funde: Kasten + Hero + Karten + Liste, bis zu elf sichtbare Optionen vor dem ersten Scroll (N2-AP-1); N3-ST-1, N3-ST-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 60 von 95 Zielen unter 44 px, Seitenhöhe 5535 px, kein Überlauf, 0 Konsolenfehler; Teilen-Link klein (N1-SU-3) |
| distill (reference/distill.md, manuell) | [Information Architecture, Remove Redundancy] Funde: Kasten/Liste/„Meine Spiele“ dreimal dieselben Spiele (N2-AP-1); Lobby-Liste ungekürzt (N1-ST-2) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: „Du lädst dein Guthaben auf“ und „Kostenlos anmelden“ für Eingeloggte (MUSS WEG, bekannt); „VS.“ gegen „gegen“ (N2-AP-5); „Bereit machen und bezahlen“ (N2-AP-2); N3-ST-2 |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation, Content Strategy] Funde: Hero unterhalb von etwa 480 px Kasten, Primärknöpfe 3 + 5 (N2-AP-1); sonst N1-ST-2 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/` | Navigation timeout nach 30 s, Wiederholung wieder Timeout (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite, Header.tsx, UserMenu.tsx, BottomNav.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-ST-1 | P1 | Der Hero zeigt dem Captain von Seed Rot (Team-Admin, drei laufende Spiele) als einzigen gefüllten Knopf „Team gründen“. Captain-Beleg zu SM-ST-1: die erste Handlung passt nicht zur Rolle; „Lobby aufmachen“ ist grau, „Zur Lobby“ steht im Kasten darüber. | captainrot_mobil_start.png | critique, clarify
- N3-ST-2 | P2 | Im Kasten „Meine aktuellen Spiele“ steht das selbst angelegte Privatspiel #1018 mit den internen Teamnamen „Seed Privat A VS. Seed Privat B“ und dem Status „Bereit machen und bezahlen“, ohne Hinweis „Privatspiel“ oder „du bist Veranstalter“ und ohne Teilen-Knopf für den Einladungslink (N2-AP-5 für die Rolle Veranstalter). | captainrot_mobil_start.png | critique, clarify

##### / (Captain Rot, Desktop)
Beleg: captainrot_desktop_start.png (Messung 64 von 95 Zielen unter 44 px, Seitenhöhe 3606 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Am Desktop sitzt der Kasten sauber im Raster über dem Hero, die vier Lobbykarten stehen einspaltig in 720 px Breite. Primärknopf des Hero ist wieder „Team gründen“; die Kopfleiste zeigt „0,00 €“ (Guthaben, MUSS WEG).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4 Konsistenz, 8 Minimalismus, Persona Alex] Funde: Kasten vor Hero (N2-AP-1); N3-ST-1, N3-ST-2; Zähler 8/36/3 (N1-ST-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 64 von 95 Zielen unter 44 px, Seitenhöhe 3606 px, kein Überlauf, 0 Konsolenfehler; Teilen-Link klein (N1-SU-3) |
| distill (reference/distill.md, manuell) | [Information Architecture, Remove Redundancy] Funde: Kasten/Liste/„Meine Spiele“ dreimal dieselben Spiele (N2-AP-1); Lobby-Liste ungekürzt (N1-ST-2) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: „Du lädst dein Guthaben auf“ und „Kostenlos anmelden“ für Eingeloggte (MUSS WEG, bekannt); „VS.“ gegen „gegen“ (N2-AP-5); „Bereit machen und bezahlen“ (N2-AP-2); N3-ST-2 |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation, Layout] Funde: 720-px-Spalte (X-17), Lobbykarten könnten zweispaltig stehen; Kopfleiste nur drei Links (GD-ALL-1) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/` | Navigation timeout nach 30 s, Wiederholung wieder Timeout (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite, Header.tsx, UserMenu.tsx, BottomNav.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-ST-1 | siehe erste Nennung | captainrot_desktop_start.png | wiederholt
- N3-ST-2 | siehe erste Nennung | captainrot_desktop_start.png | wiederholt

##### /suche (Captain Rot, Handy)
Beleg: captainrot_mobil_suche.png (Messung 60 von 93 Zielen unter 44 px, Seitenhöhe 3637 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Der Kasten mit drei Spielen und drei Primärknöpfen schiebt die Filtermaske unter die Bildschirmmitte, die erste Lobbykarte beginnt bei etwa y = 1040 von 3637 px. Die Liste ist gefüllt, aber Eigenes (#1012 bestätigt, #1010) und Fremdes sehen gleich aus.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 6 Wiedererkennung, 8 Minimalismus, Persona Alex] Funde: eigene Lobbys unmarkiert (N2-SU-3), Titel „anderer Teams“ (N1-SU-4), N3-SU-1 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 60 von 93 Zielen unter 44 px, Seitenhöhe 3637 px, kein Überlauf, 0 Konsolenfehler; Ampelpunkte mit Textlabel (gut), Teilen 32 x 16 px (N1-SU-3) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Kasten gegen Liste (N2-AP-1); Siegchance-Balken je Karte (N1-ST-5) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Empty states] Funde: „Offene Lobbys“ gegen „Offene Suchen“ (N1-SU-1); N3-SU-1; kein Fund zu „Bestätigt“ unter „Offene Lobbys“ (N1-ST-3) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Filter vor Liste (X-10, N1-SU-2) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/suche` | Navigation timeout nach 30 s, Wiederholung wieder Timeout (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite, Header.tsx, UserMenu.tsx, BottomNav.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-SU-1 | P2 | Alle vier Karten zeigen schon zwei feststehende Teams (Grün/Gelb, Rot/Blau). Der Captain findet keine Karte, bei der ein Team einen Gegner sucht; die Seite sagt nicht, dass Gegnersuchen auf /matchmaking (dort 0) und /app/suche/neu stehen (CD-ALL-3, N1-MM-1, N1-SU-1). | captainrot_mobil_suche.png | critique, distill
- N2-SU-3 | bestätigt für Captain (zwei eigene Lobbys unmarkiert) | wiederholt

##### /suche (Captain Rot, Desktop)
Beleg: captainrot_desktop_suche.png (Messung 64 von 93 Zielen unter 44 px, Seitenhöhe 2404 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Am Desktop liegen Titel, „Lobby aufmachen“, Kasten, sechs Filterfelder und vier Lobbykarten in einer 720-px-Spalte; die Filtermaske wirkt neben dem Kasten schwer. Kartenaufbau ist klar lesbar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 6 Wiedererkennung, 8 Minimalismus, Persona Alex] Funde: eigene Lobbys unmarkiert (N2-SU-3), Titel „anderer Teams“ (N1-SU-4), N3-SU-1 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 64 von 93 Zielen unter 44 px, Seitenhöhe 2404 px, kein Überlauf, 0 Konsolenfehler; Ampelpunkte mit Textlabel (gut), Teilen 32 x 16 px (N1-SU-3) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Kasten gegen Liste (N2-AP-1); Siegchance-Balken je Karte (N1-ST-5) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Empty states] Funde: „Offene Lobbys“ gegen „Offene Suchen“ (N1-SU-1); N3-SU-1; kein Fund zu „Bestätigt“ unter „Offene Lobbys“ (N1-ST-3) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: einspaltige Karten auf 720 px (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/suche` | Navigation timeout nach 30 s, Wiederholung wieder Timeout (Dauerverbindung); Ersatz: Quelltext-Lauf der Seite, Header.tsx, UserMenu.tsx, BottomNav.tsx: keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-SU-1 | siehe erste Nennung | captainrot_desktop_suche.png | wiederholt
- N2-SU-3 | bestätigt für Captain (zwei eigene Lobbys unmarkiert) | wiederholt

##### /spieler (Captain Rot, Handy)
Beleg: captainrot_mobil_spieler.png (Messung 9 von 68 Zielen unter 44 px, Seitenhöhe 3199 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Liste mit 30 Spielern und „Weiter“, Suchfeld wieder auf etwa 48 px gequetscht („Na“, X-01). Der Captain sieht seine eigenen Kadermitglieder (Anton, Berk, Caner, Dario, Quirin) und Demo-Reste („Alpha Spieler 1“, „Bartholomäus Maximilian Alexander Mue…“) ungekennzeichnet.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 7 Effizienz, 6 Wiedererkennung] Funde: N3-SP-1; Verzeichnis führt Demo-/Admin-Konten (N1-SP-2) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 9 von 68 Zielen unter 44 px, Seitenhöhe 3199 px, kein Überlauf, 0 Konsolenfehler; Pager „Weiter“ 36 px (N1-SP-5); Platzhalter-Kontrast 4,1:1 (detect) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine zusätzlichen; Zeilen sind schlank |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Seite 1“ ohne „von N“ (N1-SP-3) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Suchfeld gequetscht (X-01, N1-SP-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/spieler` | low-contrast (placeholder "Name suchen" 4.1:1 (need 4.5:1) — text #89958f on #24362d); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-SP-1 | P2 | Die eigenen Kadermitglieder (Anton, Berk, Caner, Dario, Quirin) stehen ungekennzeichnet in der Liste; kein Filter „ohne Team“ und keine Einladeaktion, obwohl der Captain hier Verstärkung suchen würde. Ergänzt N1-SP-2 und N1-SP-3. | captainrot_mobil_spieler.png | critique, distill

##### /spieler (Captain Rot, Desktop)
Beleg: captainrot_desktop_spieler.png (Messung 13 von 68 Zielen unter 44 px, Seitenhöhe 3015 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Suchfeld jetzt in voller Breite lesbar („Name suchen“), 30 Zeilen mit Name, Stadt, Position und Spiele/Tore; die Zeilen nutzen nur zwei Informationen (N1-SP-6). Kader-Kennzeichnung für den Captain fehlt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 7 Effizienz, 6 Wiedererkennung] Funde: N3-SP-1; Verzeichnis führt Demo-/Admin-Konten (N1-SP-2) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 13 von 68 Zielen unter 44 px, Seitenhöhe 3015 px, kein Überlauf, 0 Konsolenfehler; Pager „Weiter“ 36 px (N1-SP-5); Platzhalter-Kontrast 4,1:1 (detect) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine zusätzlichen; Zeilen sind schlank |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Seite 1“ ohne „von N“ (N1-SP-3) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: wenig Spalten (N1-SP-6) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/spieler` | low-contrast (placeholder "Name suchen" 4.1:1 (need 4.5:1) — text #89958f on #24362d); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-SP-1 | siehe erste Nennung | captainrot_desktop_spieler.png | wiederholt

##### /teams (Captain Rot, Handy)
Beleg: captainrot_mobil_teams.png (Messung 8 von 43 Zielen unter 44 px, Seitenhöhe 1107 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Sechs Teams (vier Seed-Teams, zwei Demo-Reste „noch ohne Spiel“), Suchfeld wieder auf 48 px („Tea“, X-01). Seed Rot (6 Spieler, Elo 1180) steht ohne Hinweis „Euer Team“ zwischen den anderen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4 Konsistenz, 6] Funde: N3-TE-1, Sortierung/Elo (N1-TE-2), keine Teamfarbe (N1-TE-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 8 von 43 Zielen unter 44 px, Seitenhöhe 1107 px, kein Überlauf, 0 Konsolenfehler; Platzhalter-Kontrast 4,1:1 |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „noch ohne Spiel“ rechts statt Elo (Demo-Reste, kein Produktfund) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Suchfeld gequetscht (X-01) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/teams` | low-contrast (placeholder "Teamname" 4.1:1 (need 4.5:1) — text #89958f on #24362d); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-TE-1 | P2 | Das eigene Team Seed Rot ist nicht als „Euer Team“ markiert (auf /matchmaking steht dieses Label), und die Zeile bietet keine Handlung (Herausfordern nur auf der Teamseite). Elo ist die einzige Kennzahl rechts (N1-TE-1, N1-TE-2). | captainrot_mobil_teams.png | critique, clarify

##### /teams (Captain Rot, Desktop)
Beleg: captainrot_desktop_teams.png (Messung 12 von 43 Zielen unter 44 px, Seitenhöhe 923 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Sechs gleich aussehende Zeilen in 720 px, Suchfeld lesbar; Seed Rot ist nicht markiert, die Sortierung (Spiele, dann Name) wirkt zufällig neben der Elo-Spalte.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4 Konsistenz, 6] Funde: N3-TE-1, Sortierung/Elo (N1-TE-2), keine Teamfarbe (N1-TE-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 43 Zielen unter 44 px, Seitenhöhe 923 px, kein Überlauf, 0 Konsolenfehler; Platzhalter-Kontrast 4,1:1 |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „noch ohne Spiel“ rechts statt Elo (Demo-Reste, kein Produktfund) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: einspaltig (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/teams` | low-contrast (placeholder "Teamname" 4.1:1 (need 4.5:1) — text #89958f on #24362d); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-TE-1 | siehe erste Nennung | captainrot_desktop_teams.png | wiederholt

##### /matchmaking (Captain Rot, Handy)
Beleg: captainrot_mobil_matchmaking.png (Messung 12 von 48 Zielen unter 44 px, Seitenhöhe 1873 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Titel, Erklärung, Vier-Schritte-Kasten, „Offene Suchen (0)“ mit Leerzustand, dann erst das Formular (Team, Stadt, Dauer, Stärke, Hinweis, Zeitfenster) ab etwa y = 760 von 1873 px; Datumsfeld abgeschnitten („dd.mm“, CM-MM-1). Für einen Captain mit offenen Lobbys steht „Gerade hat kein Team eine Lobby geöffnet“.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan/Casey, Heuristik 1 Systemstatus] Funde: N3-MM-1; Formular am Ende (CM-MM-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 48 Zielen unter 44 px, Seitenhöhe 1873 px, kein Überlauf, 0 Konsolenfehler; Auswahl „Alle Dauern“ abgeschnitten (N1-MM-3, nur Handy); straggler/line-length (detect, N1-MM-5) |
| distill (reference/distill.md, manuell) | [Remove Redundancy, Progressive Disclosure] Funde: Vier-Schritte-Kasten plus Einleitung sagen dasselbe (N1-MM-2); Filter über leerer Liste (N1-MM-4) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Offene Suchen“ gegen „Offene Lobbys“ (N1-MM-1, N1-SU-1); „Hallen-Veto“ ohne Erklärung |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Formular unterhalb der Falz, Datumsfeld zu schmal (CM-MM-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | straggler ("offen." alone on the last of 2 lines (13% of the measure)); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-MM-1 | P1 | Der Captain hat #1010 (Lobby offen) und #1012 (bestätigt), die Seite meldet aber „Offene Suchen (0)“ und „Gerade hat kein Team eine Lobby geöffnet“. Mit eigenen Lobbys im Seed ist der Widerspruch für den Captain direkt sichtbar (N1-MM-1 hatte ihn ohne Daten nur vermutet). | captainrot_mobil_matchmaking.png | critique, clarify

##### /matchmaking (Captain Rot, Desktop)
Beleg: captainrot_desktop_matchmaking.png (Messung 16 von 48 Zielen unter 44 px, Seitenhöhe 1391 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Das Formular steht im Desktop-Bild vollständig in der Seitenmitte, Erklärung und Leerzustand davor; Felder sind sauber zweispaltig. Der Widerspruch „0 offene Suchen“ gegen die eigenen Lobbys fällt auf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan/Casey, Heuristik 1 Systemstatus] Funde: N3-MM-1; Formular am Ende (CM-MM-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 16 von 48 Zielen unter 44 px, Seitenhöhe 1391 px, kein Überlauf, 0 Konsolenfehler; Auswahl „Alle Dauern“ abgeschnitten (N1-MM-3, nur Handy); straggler/line-length (detect, N1-MM-5) |
| distill (reference/distill.md, manuell) | [Remove Redundancy, Progressive Disclosure] Funde: Vier-Schritte-Kasten plus Einleitung sagen dasselbe (N1-MM-2); Filter über leerer Liste (N1-MM-4) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Offene Suchen“ gegen „Offene Lobbys“ (N1-MM-1, N1-SU-1); „Hallen-Veto“ ohne Erklärung |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: Zeilenlänge etwa 99 Zeichen (detect line-length) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | line-length (~99 chars on 2 of 3 rendered lines (aim for <80)); straggler ("hier." alone on the last of 2 lines (4% of the measure)); plus overused-font (kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-MM-1 | siehe erste Nennung | captainrot_desktop_matchmaking.png | wiederholt

##### /mitspieler (Captain Rot, Handy)
Beleg: captainrot_mobil_mitspieler.png (Messung 8 von 40 Zielen unter 44 px, Seitenhöhe 921 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Kurze Seite: Formular „Ich suche ein Spiel“ (Tag, Stadt Essen vorbelegt, Hinweis), Filter, leere Liste. Für den Captain passt weder Titel noch Formular zur Aufgabe „Mitspieler finden“.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan, Heuristik 2 Realwelt] Funde: N3-MI-1; Leerzustand ohne Handlung (N1-MI-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 8 von 40 Zielen unter 44 px, Seitenhöhe 921 px, kein Überlauf, 0 Konsolenfehler; Datum nativ |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: zwei Stadtfelder (N2-MI-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: Titel „Mitspieler gesucht“ gegen Formular „Ich suche ein Spiel“ (N3-MI-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/mitspieler` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-MI-1 | P1 | Für den Captain steht oben „Ich suche ein Spiel“ (Spieler-Sicht); „Wir suchen Mitspieler“ für sein Team fehlt. Leere Liste „Gerade hat sich niemand eingetragen.“ ohne Handlung; „Fehlt dir jemand? Frag ihn an.“ sagt nicht wo (N1-MI-1, N2-MI-1). | captainrot_mobil_mitspieler.png | critique, clarify

##### /mitspieler (Captain Rot, Desktop)
Beleg: captainrot_desktop_mitspieler.png (Messung 12 von 40 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Dieselbe Seite in einer 720-px-Spalte, Formular breiter, Leerzustand ein Satz; unterhalb viel leere Fläche.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Persona Jordan, Heuristik 2 Realwelt] Funde: N3-MI-1; Leerzustand ohne Handlung (N1-MI-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 40 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler; Datum nativ |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: zwei Stadtfelder (N2-MI-1) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: Titel „Mitspieler gesucht“ gegen Formular „Ich suche ein Spiel“ (N3-MI-1) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: leere Fläche unten, keine |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/mitspieler` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-MI-1 | siehe erste Nennung | captainrot_desktop_mitspieler.png | wiederholt

##### /einladung/seed-team-gueltig (Captain Rot, Handy)
Beleg: captainrot_mobil_einladung-seed-team-gueltig.png (Messung 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: „Du wurdest eingeladen zu Seed Rot“, „Essen · 6 Spieler im Kader“, ein Primärknopf „Team beitreten“. Der Betrachter ist Team-Admin dieses Teams. Untere Navigation hebt „Privatspiel“ hervor (N1-EG-3).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 9 Fehlervermeidung, Persona Jordan] Funde: N3-EG-1; kein Einladender (N1-EG-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler; Primärknopf 44+ px (gut) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine; knapp und klar |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: „Team beitreten“ für ein Mitglied unpassend (N3-EG-1, SM-EL-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Navigation „Privatspiel“ aktiv (N1-EG-3) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-gueltig` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-EG-1 | P1 | Der Captain öffnet den Einladungslink seines eigenen Teams: „Du wurdest eingeladen zu Seed Rot“ mit „Team beitreten“, obwohl er Team-Admin ist (Captain-Beleg zu SM-EL-1). Nicht geklickt: ob der Beitritt seine Admin-Rolle berührt. Captain-Funktionen (Link kopieren, Gültigkeit, neu erzeugen) fehlen auf der Seite. | captainrot_mobil_einladung-seed-team-gueltig.png | critique, clarify

##### /einladung/seed-team-gueltig (Captain Rot, Desktop)
Beleg: captainrot_desktop_einladung-seed-team-gueltig.png (Messung 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Zentrierter Block mit Teamname und Primärknopf in einer 720-px-Spalte; sehr aufgeräumt, aber ohne Einladenden, Teamfarbe oder Wappen (N1-EG-1).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 2, 9 Fehlervermeidung, Persona Jordan] Funde: N3-EG-1; kein Einladender (N1-EG-1) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler; Primärknopf 44+ px (gut) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine; knapp und klar |
| clarify (reference/clarify.md, manuell) | [Audit the language, Actions] Funde: „Team beitreten“ für ein Mitglied unpassend (N3-EG-1, SM-EL-1) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-gueltig` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-EG-1 | siehe erste Nennung | captainrot_desktop_einladung-seed-team-gueltig.png | wiederholt

##### /einladung/seed-team-abgelaufen (Captain Rot, Handy)
Beleg: captainrot_mobil_einladung-seed-team-abgelaufen.png (Messung 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Überschrift „Link abgelaufen“, zwei Sätze, ghost-Knopf „Zur Startseite“; sonst leer. Der Captain wird an sich selbst verwiesen („den Team-Admin“).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9 Fehlerbehebung] Funde: N3-EA-1; N1-EA-1, N1-EA-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 8 von 35 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine |
| clarify (reference/clarify.md, manuell) | [Audit the language, Errors] Funde: Rolle des Lesers ungeklärt (N3-EA-1); keine Laufzeitangabe (N1-EA-2) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/einladung/seed-team-abgelaufen` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-EA-1 | P1 | „Bitte den Team-Admin um einen neuen Link“: der Captain ist der Team-Admin von Seed Rot und findet keinen Knopf „Neuen Link erstellen“; einziger Knopf ist „Zur Startseite“ (N1-EA-1, N2-EA-1 für die Rolle Captain). | captainrot_mobil_einladung-seed-team-abgelaufen.png | critique, clarify

##### /einladung/seed-team-abgelaufen (Captain Rot, Desktop)
Beleg: captainrot_desktop_einladung-seed-team-abgelaufen.png (Messung 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Gleiche Seite, zentriert in 720 px, viel Leerfläche; nichts weist als Fehler (N1-EA-2).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 9 Fehlerbehebung] Funde: N3-EA-1; N1-EA-1, N1-EA-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 35 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: keine |
| clarify (reference/clarify.md, manuell) | [Audit the language, Errors] Funde: Rolle des Lesers ungeklärt (N3-EA-1); keine Laufzeitangabe (N1-EA-2) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: keine |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/einladung/seed-team-abgelaufen` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-EA-1 | siehe erste Nennung | captainrot_desktop_einladung-seed-team-abgelaufen.png | wiederholt

##### /app (Captain Rot, Handy)
Beleg: captainrot_mobil_app.png (Messung 12 von 55 Zielen unter 44 px, Seitenhöhe 2672 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Gefüllte Startseite des Captains: Kasten mit drei Spielen (480 px), drei große Karten, Guthaben-Karte, fünf Kacheln, dann „Meine Spiele“ (fünf Zeilen) und „Meine Teams“. Seite 2672 px; die Reihenfolge ist dieselbe wie für den Spieler, die Rolle Captain zeigt nur das Wort „Team-Admin“ ganz unten.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Kognitive Last, Persona Casey/Alex] Funde: sieben Primär-/Sekundärknöpfe vor „Meine Spiele“ (X-03, X-04); N3-AP-1, N3-AP-2, N3-AP-3; N2-AP-1, N2-AP-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 12 von 55 Zielen unter 44 px, Seitenhöhe 2672 px, kein Überlauf, 0 Konsolenfehler; Privatspiel-Zeile bricht mitten im Namen um („Seed…“) (N2-AP-5) |
| distill (reference/distill.md, manuell) | [Information Architecture, Remove Redundancy] Funde: Kasten + Liste + Kacheln wiederholen Handlungen (N2-AP-1, X-04); Guthaben-Karte (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Bereit machen und bezahlen“ gegen „Wartet auf Spieler“ (N2-AP-2); Abgesagt ohne Grund (N3-AP-2); Begriffe (N3-FE-2); Guthaben-Karte (MUSS WEG) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: Kasten und Karten verdrängen die Spiele (X-03) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | straggler ("nötig." alone on the last of 2 lines (14% of the measure)); plus overused-font (kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-AP-1 | P1 | „Meine Spiele“ ist absteigend nach Datum sortiert (17.11., 15.11., 14.11., 12.11., 04.11.), der Kasten darüber aufsteigend (14.11., 15.11., 17.11.). Das nächste Spiel (#1012, Sa. 14.11., bestätigt) steht in der Liste an dritter Stelle, Abgesagt und Beendet ohne Trenner dazwischen (N2-AP-2/N2-AP-3 nannten die Sortierung nur am Rande). | captainrot_mobil_app.png | critique, distill
- N3-AP-2 | P2 | Das abgesagte Spiel (Rot gegen Grün, Do. 12.11.) steht nur mit dem Wort „Abgesagt“ in der Liste: kein Grund, kein Hinweis, wer abgesagt hat, keine Folge (erstatten, neu ansetzen). Für den Captain ist das die wichtigste Zeile der Liste. | captainrot_mobil_app.png | critique, clarify
- N3-AP-3 | P2 | Die Rolle Captain ist auf /app vor den Spielen nirgends erkennbar: „Team-Admin“ steht nur rechts in „Meine Teams“; der Kasten nennt nicht, wo der Captain etwas tun muss (z. B. #1010: 0 von 3 bereit). Begriffe wechseln (N3-FE-2). | captainrot_mobil_app.png | critique, clarify
- X-03, X-04, X-05, X-18 | bestätigt (Teamfarbe als Punkt vorhanden, „0 Spiele“ nicht mehr) | wiederholt

##### /app (Captain Rot, Desktop)
Beleg: captainrot_desktop_app.png (Messung 16 von 55 Zielen unter 44 px, Seitenhöhe 1910 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Dieselben Blöcke in 720 px; Karten dreispaltig, Kacheln drei plus zwei, „Meine Spiele“ als fünf breite Zeilen mit Status rechts. Gut lesbar, aber ohne Gewichtung: Kasten, Karten, Kacheln, Liste, Teams.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Kognitive Last, Persona Casey/Alex] Funde: sieben Primär-/Sekundärknöpfe vor „Meine Spiele“ (X-03, X-04); N3-AP-1, N3-AP-2, N3-AP-3; N2-AP-1, N2-AP-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 16 von 55 Zielen unter 44 px, Seitenhöhe 1910 px, kein Überlauf, 0 Konsolenfehler; Privatspiel-Zeile bricht mitten im Namen um („Seed…“) (N2-AP-5) |
| distill (reference/distill.md, manuell) | [Information Architecture, Remove Redundancy] Funde: Kasten + Liste + Kacheln wiederholen Handlungen (N2-AP-1, X-04); Guthaben-Karte (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Bereit machen und bezahlen“ gegen „Wartet auf Spieler“ (N2-AP-2); Abgesagt ohne Grund (N3-AP-2); Begriffe (N3-FE-2); Guthaben-Karte (MUSS WEG) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: 720-px-Spalte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-AP-1 | siehe erste Nennung | captainrot_desktop_app.png | wiederholt
- N3-AP-2 | siehe erste Nennung | captainrot_desktop_app.png | wiederholt
- N3-AP-3 | siehe erste Nennung | captainrot_desktop_app.png | wiederholt
- X-03, X-04, X-05, X-18 | bestätigt (Teamfarbe als Punkt vorhanden, „0 Spiele“ nicht mehr) | wiederholt

##### /app/suche/neu (Captain Rot, Handy)
Beleg: captainrot_mobil_app-suche-neu.png (Messung 9 von 44 Zielen unter 44 px, Seitenhöhe 1330 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Sieben Felder in einer Spalte, Team „Seed Rot“, Datum leer, Stärke „4 – Sehr stark“ vorbelegt, Wiederholen, Sichtbarkeit, Hinweis, ein Knopf „Spielsuche erstellen“. Der Absatz oben erklärt nur den Unterschied zum Matchmaking.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 5 Fehlervermeidung, Persona Jordan] Funde: N3-FS-1, N3-FS-4; Länge (X-11) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 9 von 44 Zielen unter 44 px, Seitenhöhe 1330 px, kein Überlauf, 0 Konsolenfehler; Labels vorhanden, Datum nativ |
| distill (reference/distill.md, manuell) | [Progressive Disclosure] Funde: „Wiederholen“ und „Sichtbarkeit“ für seltene Fälle gleichrangig (X-11) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Forms] Funde: Regel „24 Stunden“ klein unter dem Feld (X-11), Raster fehlt (N3-FS-1) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: native Datumsauswahl am Handy gut; lang (X-11) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` | straggler ("nötig." alone on the last of 2 lines (14% of the measure)); plus overused-font (kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-1 | P1 | Der Anstoß hat ein 15-Minuten-Raster (step 900). Wer 20:13 tippt, bekommt nur die Browsermeldung mit zwei Nachbarwerten; der Hinweis unter dem Feld nennt nur „Mindestens 24 Stunden im Voraus“. Das Raster steht nirgends im Formular. | captainrot_mobil_app-suche-neu.png | critique, clarify
- N3-FS-4 | P2 | Die gesuchte Stärke ist mit der eigenen Stärke (4 „Sehr stark“) vorbelegt, ohne „egal“; /matchmaking bietet „von/bis“ mit „egal“. Der Captain schränkt die Gegnersuche ohne Absicht ein, und die zwei Formulare verhalten sich verschieden. | captainrot_mobil_app-suche-neu.png | critique, distill

##### /app/suche/neu (Captain Rot, Desktop)
Beleg: captainrot_desktop_app-suche-neu.png (Messung 13 von 44 Zielen unter 44 px, Seitenhöhe 1154 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Formular in einer schmaleren Spalte (448 px) mittig, links und rechts viel Fläche; Aufbau gleich. Gut lesbar, aber sieben Felder ohne Gruppierung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 5 Fehlervermeidung, Persona Jordan] Funde: N3-FS-1, N3-FS-4; Länge (X-11) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 13 von 44 Zielen unter 44 px, Seitenhöhe 1154 px, kein Überlauf, 0 Konsolenfehler; Labels vorhanden, Datum nativ |
| distill (reference/distill.md, manuell) | [Progressive Disclosure] Funde: „Wiederholen“ und „Sichtbarkeit“ für seltene Fälle gleichrangig (X-11) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Forms] Funde: Regel „24 Stunden“ klein unter dem Feld (X-11), Raster fehlt (N3-FS-1) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: schmale Mitte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-1 | siehe erste Nennung | captainrot_desktop_app-suche-neu.png | wiederholt
- N3-FS-4 | siehe erste Nennung | captainrot_desktop_app-suche-neu.png | wiederholt

##### /app/einstellungen (Captain Rot, Handy)
Beleg: captainrot_mobil_app-einstellungen.png (Messung 30 von 69 Zielen unter 44 px, Seitenhöhe 2179 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Profil (Name „Rot Captain“, Stadt, Position, Spielerprofil mit sieben Farbpunkten), Benachrichtigungen mit elf angehakten Kästchen, Deine Daten, „Konto löschen“ als kleine Aufklappzeile; 2179 px, drei Absende-Knöpfe. Der Name lautet „Rot Captain“, die Kopfleiste zeigt „Rot“.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1 Systemstatus, 10 Hilfe] Funde: X-08, N2-ES-1..3 für den Captain bestätigt; N3-FE-1, N3-FE-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 30 von 69 Zielen unter 44 px, Seitenhöhe 2179 px, kein Überlauf, 0 Konsolenfehler; Profilfarbe nur über sieben Farbpunkte ohne sichtbare Beschriftung wählbar |
| distill (reference/distill.md, manuell) | [Progressive Disclosure] Funde: elf Kästchen in einer Reihe, „Deine Daten“ am Ende (X-08) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Forms] Funde: „Neue Aufgabe für Admins“ (N3-FE-2); Push-Hinweis vor den Kanälen (X-08) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: 2179 px, drei Speichern (X-08); 30 von 69 Zielen unter 44 px |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` | straggler ("nötig." alone on the last of 2 lines (14% of the measure)); plus overused-font (kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FE-1 | P1 | „Konto löschen“ (aufgeklappt) nennt weder Team noch laufende Spiele: der Captain ist einziger Team-Admin von Seed Rot mit bestätigtem Spiel #1012 und offener Lobby, der Text sagt nur „Gespielte Spiele und Buchungen bleiben ohne deinen Namen erhalten“. Positiv: Tippwort LÖSCHEN und Folgetext. | captainrot_mobil_app-einstellungen.png | critique, clarify
- N3-FE-2 | P2 | Begriffe für dieselbe Rolle: „Captain“ (Texte, Lobbyseite), „Team-Admin“ (/app, /einladung), „Admin“ (Kader „Flexibel · Admin“, Benachrichtigung „Neue Aufgabe für Admins“ ohne Erklärung der Aufgabe). | captainrot_mobil_app-einstellungen.png | clarify

##### /app/einstellungen (Captain Rot, Desktop)
Beleg: captainrot_desktop_app-einstellungen.png (Messung 34 von 69 Zielen unter 44 px, Seitenhöhe 1967 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Dieselben drei Blöcke untereinander in 720 px; die Kästchenliste ist hier kompakter, Hinweis „Push ist auf diesem Server noch nicht eingerichtet.“ steht vor den Kanälen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1 Systemstatus, 10 Hilfe] Funde: X-08, N2-ES-1..3 für den Captain bestätigt; N3-FE-1, N3-FE-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 34 von 69 Zielen unter 44 px, Seitenhöhe 1967 px, kein Überlauf, 0 Konsolenfehler; Profilfarbe nur über sieben Farbpunkte ohne sichtbare Beschriftung wählbar |
| distill (reference/distill.md, manuell) | [Progressive Disclosure] Funde: elf Kästchen in einer Reihe, „Deine Daten“ am Ende (X-08) |
| clarify (reference/clarify.md, manuell) | [Audit the language, Forms] Funde: „Neue Aufgabe für Admins“ (N3-FE-2); Push-Hinweis vor den Kanälen (X-08) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: 720-px-Spalte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FE-1 | siehe erste Nennung | captainrot_desktop_app-einstellungen.png | wiederholt
- N3-FE-2 | siehe erste Nennung | captainrot_desktop_app-einstellungen.png | wiederholt

##### /app/benachrichtigungen (Captain Rot, Handy)
Beleg: captainrot_mobil_app-benachrichtigungen.png (Messung 9 von 36 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Ein Eintrag „Neues Teammitglied: Quirin Testmann ist Seed Rot beigetreten.“ (aus Teil 2), Link „Einstellungen“ oben rechts; die Glocke zeigt „1“ obwohl die Seite gerade geöffnet ist. Sonst leer.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1 Systemstatus] Funde: N3-BE-1, N3-BE-2 |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 9 von 36 Zielen unter 44 px, Seitenhöhe 844 px, kein Überlauf, 0 Konsolenfehler; Glocke als Symbol (Zähler nur als Zahl) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Link „Einstellungen“ neben dem Titel ist sinnvoll; keine |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Neues Teammitglied“ ohne Verweis auf das Team im Titel; Datum ohne Jahr (N3-BE-2) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` | straggler ("nötig." alone on the last of 2 lines (14% of the measure)); plus overused-font (kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-BE-1 | P2 | Die Glocke zeigt am Handy „1“ auch auf der Seite Benachrichtigungen selbst (Grid-Aufnahme); die Folgeaufnahme derselben Seite zeigt keine Zahl: der Besuch markiert als gelesen, die Kopfleiste ist im selben Aufruf veraltet (vgl. N1-OB-9). | captainrot_mobil_app-benachrichtigungen.png | audit, clarify
- N3-BE-2 | P2 | Der einzige Eintrag („Neues Teammitglied“) unterscheidet gelesen/ungelesen nur durch die Rahmenfarbe (Quelltext: border-accent), nicht durch Text, Punkt oder Fettung; kein „Alle als gelesen“, Datum ohne Jahr, kein Hinweis, was der Captain tun kann (Rolle vergeben, in die Lobby holen). | captainrot_mobil_app-benachrichtigungen.png | critique, clarify

##### /app/benachrichtigungen (Captain Rot, Desktop)
Beleg: captainrot_desktop_app-benachrichtigungen.png (Messung 13 von 36 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Derselbe Eintrag, die Glocke zeigt keine Zahl mehr (gelesen markiert). Viel leere Fläche unter dem Eintrag, keine Gruppierung nach Zeit.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1] Funde: N3-BE-2; Glocke ohne Zahl (Status gelesen) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 13 von 36 Zielen unter 44 px, Seitenhöhe 800 px, kein Überlauf, 0 Konsolenfehler; Glocke als Symbol (Zähler nur als Zahl) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Link „Einstellungen“ neben dem Titel ist sinnvoll; keine |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: „Neues Teammitglied“ ohne Verweis auf das Team im Titel; Datum ohne Jahr (N3-BE-2) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: leere Fläche |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-BE-1 | siehe erste Nennung | captainrot_desktop_app-benachrichtigungen.png | wiederholt
- N3-BE-2 | siehe erste Nennung | captainrot_desktop_app-benachrichtigungen.png | wiederholt

##### /app/guthaben (Captain Rot, Handy)
Beleg: captainrot_mobil_app-guthaben.png (Messung 9 von 41 Zielen unter 44 px, Seitenhöhe 1519 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Altmodell-Seite: „0,00 €“, Vier-Schritte-Erklärung, Aufladen (20/50/100, Betragsfeld, Rabattcode), „Jetzt bezahlen“, Verlauf und Belege leer. Der Satz „Gerade sind Zahlungen noch nicht eingeschaltet“ steht unmittelbar neben einem aktiven Bezahlknopf.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4/2] Funde: X-05, X-09, SM-GU-1 (MUSS WEG, im Dokument) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 9 von 41 Zielen unter 44 px, Seitenhöhe 1519 px, kein Überlauf, 0 Konsolenfehler; „Jetzt bezahlen“ unter der Navigation verdeckt (Artefakt) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Betrag doppelt (Schnellwahl/Feld, X-09); ganze Seite entfällt mit 012 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: nur Altmodell, nichts Neues; Widerspruch „Zahlungen nicht eingeschaltet“ gegen „Jetzt bezahlen“ liegt in der Tabelle MUSS WEG des Dokuments (11 Treffer „noch nicht eingeschaltet“) |
| adapt (reference/adapt.md, manuell) | [Mobile Adaptation] Funde: keine neuen |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` | straggler ("nötig." alone on the last of 2 lines (14% of the measure)); plus overused-font (kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- Keine neuen Funde: der Seite gelten X-05, X-09, SM-GU-1 und die Zeilen der Tabelle MUSS WEG (dort schon mit Rolle Captain geführt).

##### /app/guthaben (Captain Rot, Desktop)
Beleg: captainrot_desktop_app-guthaben.png (Messung 13 von 41 Zielen unter 44 px, Seitenhöhe 1247 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Dieselbe Seite in 720 px; Aufladen, Rabattcode und leere Kästen „Noch keine Buchungen./Belege.“ (kein Verlauf im Seed, Hauptbuch nicht angelegt).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 4/2] Funde: X-05, X-09, SM-GU-1 (MUSS WEG, im Dokument) |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive] 13 von 41 Zielen unter 44 px, Seitenhöhe 1247 px, kein Überlauf, 0 Konsolenfehler; „Jetzt bezahlen“ unter der Navigation verdeckt (Artefakt) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Funde: Betrag doppelt (Schnellwahl/Feld, X-09); ganze Seite entfällt mit 012 |
| clarify (reference/clarify.md, manuell) | [Audit the language] Funde: nur Altmodell, nichts Neues; Widerspruch „Zahlungen nicht eingeschaltet“ gegen „Jetzt bezahlen“ liegt in der Tabelle MUSS WEG des Dokuments (11 Treffer „noch nicht eingeschaltet“) |
| adapt (reference/adapt.md, manuell) | [Desktop Adaptation] Funde: 720-px-Spalte |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` | nur overused-font (Plus Jakarta Sans, in DESIGN.md gesetzt: kein Fund) (ohne Sitzung gemessen: Anmeldeseite bzw. Seite ohne Sitzung; Quelltext-Lauf der Seitenordner zusätzlich: keine Funde) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- Keine neuen Funde: der Seite gelten X-05, X-09, SM-GU-1 und die Zeilen der Tabelle MUSS WEG (dort schon mit Rolle Captain geführt).

#### Zusatzaufnahmen (Konto-Menü, Formulare absenden)

Je Aufnahme ein Abschnitt; die Messwerte stammen aus dem Playwright-Lauf (Menü 240 x 336 px, sieben Einträge je 222 x 36 px). Durchgänge sind je Aufnahme einzeln und knapp, der angewandte Teil steht in den eckigen Klammern. Bei den Formular-Zuständen bedeutet „detect“: Quelltext-Lauf der betroffenen Seitenordner, keine Funde (ein URL-Lauf sieht den Absendezustand nicht).

##### Konto-Menü geöffnet (/app) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-kontomenue.png
Bewertung: Menü rechtsbündig (240 x 336 px) über dem Kasten, Name „Rot Captain“, sieben Einträge, „Guthaben 0,00 €“ (MUSS WEG) an dritter Stelle, „Abmelden“ abgesetzt. Hintergrund nicht gedimmt, Knopf „Rot“ mit Rahmen als Zustand (gut).

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Assessment A, Heuristik 4/6, Persona Casey] Funde: N3-KM-1, N3-KM-2; Guthaben-Eintrag (MUSS WEG, Captain-Handy bestätigt: die offene Lücke) |
| audit (manuell) | [Dimension 1 A11y, 4] Einträge 222 x 36 px (unter 44), aria-haspopup/expanded vorhanden, Escape schließt (gut) |
| distill (manuell) | [Remove Redundancy] „Mein Profil“ und „Mein Bereich“ nah beieinander; keine Zusätze nötig |
| clarify (manuell) | [Audit the language] „Konto und Einstellungen“ gegen Seitentitel „Einstellungen“ (N3-KM-2) |
| adapt (manuell) | [Mobile Adaptation, Bottom sheets] Menü als Dropdown statt Bottom-Sheet (N2-KM-1); Einträge zu niedrig |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-KM-1 | P2 | Alle sieben Menüeinträge sind 222 x 36 px hoch (Messung), unter 44 px Touchziel; am Handy legt sich das Menü über den Kasten ohne Dimmung (N2-KM-1 für die Rolle Captain bestätigt). | captainrot_mobil_extra-kontomenue.png | audit, adapt
- N3-KM-2 | P2 | Das Konto-Menü kennt keine Captain-Einträge (Mein Team, Lobby aufmachen, Einladungslink). „Konto und Einstellungen“ heißt auf der Seite „Einstellungen“; „Mein Bereich“ heißt auf der Seite „Hey Rot“: Menütext und Seitentitel weichen ab. | captainrot_mobil_extra-kontomenue.png | clarify, distill

##### Konto-Menü geöffnet (/app) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-kontomenue.png
Bewertung: Menü hängt unter dem Knopf rechts, deckt die „Zur Lobby“-Knöpfe der ersten beiden Kastenzeilen; Kopfleiste zeigt zusätzlich „0,00 €“ (MUSS WEG, doppelt mit dem Menüeintrag).

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Assessment A, Heuristik 4] Funde: Betrag in Leiste und Menü (GD-, MUSS WEG), N3-KM-2 |
| audit (manuell) | [Dimension 4] Einträge 36 px (Maus ok, Tastatur nutzbar) |
| distill (manuell) | [Remove Redundancy] Funde: Guthaben doppelt (MUSS WEG) |
| clarify (manuell) | [Audit the language] Funde: wie Handy |
| adapt (manuell) | [Desktop Adaptation, Hover] Hover-Zustand sichtbar im Bild; kein Fund |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-KM-1 | siehe erste Nennung | captainrot_desktop_extra-kontomenue.png | wiederholt
- N3-KM-2 | siehe erste Nennung | captainrot_desktop_extra-kontomenue.png | wiederholt

##### Formular /app/suche/neu: leer absenden (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-suchneu-leer-nativ.png
Bewertung: Der Browser springt zum Anstoß-Feld mit roter Kontur und Sprechblase „Please fill out this field.“ über der festen Kopfleiste; die Seite selbst zeigt keine Fehlermeldung. Hinweis „Mindestens 24 Stunden“ unverändert.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: Browserblase nicht steuerbar (N1-OB-1) |
| audit (manuell) | [Dimension 1] Fokus auf das Feld (gut); Bubble verdeckt Label (Aufnahme-Artefakt) |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] Pflichtfelder nicht als „Pflicht“ gekennzeichnet, nur Browser |
| adapt (manuell) | [Mobile] Bubble liegt unter der festen Kopfleiste (Artefakt der Aufnahme) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-1 | bestätigt für das Captain-Formular | wiederholt

##### Formular /app/suche/neu: leer absenden (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-suchneu-leer-nativ.png
Bewertung: Wie am Handy: Sprechblase am Anstoß-Feld, sonst keine Rückmeldung; die Spalte ist schmal (448 px).

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] wie Handy |
| audit (manuell) | [Dimension 1] Fokus gut |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] wie Handy |
| adapt (manuell) | [Desktop] schmale Mitte (X-17) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-1 | bestätigt | wiederholt

##### Formular /app/suche/neu: 20:13 (Raster) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-suchneu-zu-frueh.png
Bewertung: Der Browser lehnt 11.11.2026 20:13 mit „Please enter a valid value. The two nearest valid values are … 20:00 and … 20:15“ ab; der Hinweis der Seite nennt das Raster nicht.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 5, 9] Funde: N3-FS-1 |
| audit (manuell) | [Dimension 1] Meldung nennt gültige Werte (gut) |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] Raster nicht vorab genannt (N3-FS-1) |
| adapt (manuell) | [Mobile] natives Feld; auf dem Handy öffnet das Zeitrad nur volle Viertelstunden (nicht geprüft) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-1 | siehe erste Nennung | captainrot_mobil_extra-suchneu-zu-frueh.png | wiederholt

##### Formular /app/suche/neu: 20:13 (Raster) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-suchneu-zu-frueh.png
Bewertung: Gleiche Browsermeldung als breiter Kasten über zwei Zeilen („The two nearest valid values are 11.11.2026 20:00 and … 20:15“); Datumsformat in der Meldung weicht von der deutschen Eingabe ab.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 5] Funde: N3-FS-1 |
| audit (manuell) | [Dimension 1] ok |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] wie Handy |
| adapt (manuell) | [Desktop] Bubble verdeckt das Feld (Artefakt der Aufnahme) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-1 | siehe erste Nennung | captainrot_desktop_extra-suchneu-zu-frueh.png | wiederholt

##### Formular /app/suche/neu: Anstoß unter 24 Stunden (Server-Fehler) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-suchneu-zu-frueh-server.png
Bewertung: Eingabe 11.11. 20:00 bleibt stehen, direkt unter dem Feld steht im schwarz umrandeten Kasten „Das Spiel muss mindestens 24 Stunden in der Zukunft liegen.“; das Feld selbst ist nicht markiert. Gut, dass die Meldung am Feld steht, schwach, dass sie dem Hinweis darüber gleicht.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: N3-FS-2; N1-OB-3 (Kastenstil) |
| audit (manuell) | [Dimension 1] Meldung im Kastenstil, Farbe nicht Fehlerfarbe |
| distill (manuell) | [Remove Redundancy] Hinweis und Fehler sagen dasselbe (N3-FS-2) |
| clarify (manuell) | [Errors] Was, warum, wie: Regel genannt, aber kein Vorschlag (z. B. frühester Termin) |
| adapt (manuell) | [Mobile] Kasten sichtbar ohne Scrollen (gut) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-2 | P1 | Zu früher Termin (Server-Fehler): „Das Spiel muss mindestens 24 Stunden in der Zukunft liegen.“ steht direkt unter dem Feld (gut) und die Eingabe bleibt erhalten (gut), aber im dunkel umrandeten Kasten ohne Fehlerfarbe, ohne Markierung des Feldes und ohne Fokus; Hinweis und Fehler wiederholen dieselbe Regel (N1-OB-3). | captainrot_mobil_extra-suchneu-zu-frueh-server.png | critique, clarify

##### Formular /app/suche/neu: Anstoß unter 24 Stunden (Server-Fehler) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-suchneu-zu-frueh-server.png
Bewertung: Gleicher Fehlertext im Kasten unter dem Feld, Eingabe bleibt; der Knopf „Spielsuche erstellen“ liegt weiter unten ohne Hinweis auf den Fehler.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: N3-FS-2 |
| audit (manuell) | [Dimension 1] wie Handy |
| distill (manuell) | [Remove Redundancy] wie Handy |
| clarify (manuell) | [Errors] kein frühester Termin genannt |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-2 | siehe erste Nennung | captainrot_desktop_extra-suchneu-zu-frueh-server.png | wiederholt

##### Formular /app/suche/neu: Erfolg (Mo. 23.11., 19:00) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-suchneu-erfolg.png
Bewertung: Weiterleitung auf „Öffentliche Spielsuche · Seed Rot sucht einen Gegner“: Anstoß, Dauer, Stadt, gesuchte Stärke, Hinweis, Kader mit Elo, ein Knopf „Spielsuche zurückziehen“ in voller Breite. Keine Bestätigung, kein Teilen-Link.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1 Systemstatus] Funde: N3-FS-3 |
| audit (manuell) | [Dimension 4] Knopf 44+ px (gut); Fußzeile 13 Links (X-07) |
| distill (manuell) | [Remove Redundancy] Kader mit sechs Zeilen und Elo nützlich für Gegner, für den Ersteller redundant |
| clarify (manuell) | [Success states] fehlender Bestätigungssatz (N3-FS-3) |
| adapt (manuell) | [Mobile] Rückzug ohne Rückfrage nahe am Daumen (Rückfrage nicht geprüft) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-3 | P1 | Erfolg: Weiterleitung auf „Seed Rot sucht einen Gegner“ ohne Bestätigungssatz („Spielsuche erstellt“), ohne Teilen-Link, ohne Weg zurück zu „Meine Spiele“. Der einzige Knopf in voller Breite ist „Spielsuche zurückziehen“ (nicht angeklickt, ob eine Rückfrage kommt). | captainrot_mobil_extra-suchneu-erfolg.png | critique, clarify
- N3-AP-5 | P1 | Zwei im Formular erstellte Spielsuchen (fester Termin) tauchen auf /app weder im Kasten noch in „Meine Spiele“ auf; es erscheinen nur die Lobby (#1020 bzw. #1022) und dieselben fünf Zeilen. Der Captain findet seine Spielsuche nur über die Weiterleitung (Liste auf fünf gekappt, N2-AP-3; Kasten kennt nur Lobbys). | captainrot_mobil_extra-suchneu-erfolg.png | critique, distill

##### Formular /app/suche/neu: Erfolg (Di. 24.11., 19:00) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-suchneu-erfolg.png
Bewertung: Dieselbe Spielseite in einer schmalen Spalte; der Ersteller sieht die Seite wie ein Fremder (öffentliche Ansicht), „Spielsuche zurückziehen“ dominiert als einziger Knopf.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1, 3] Funde: N3-FS-3 |
| audit (manuell) | [Dimension 4] ok |
| distill (manuell) | [Remove Redundancy] Kader/Details wie Handy |
| clarify (manuell) | [Success states] wie Handy |
| adapt (manuell) | [Desktop] schmale Spalte (X-17) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FS-3 | siehe erste Nennung | captainrot_desktop_extra-suchneu-erfolg.png | wiederholt
- N3-AP-5 | siehe erste Nennung | captainrot_desktop_extra-suchneu-erfolg.png | wiederholt

##### Formular /matchmaking: leer absenden (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-matchmaking-leer-nativ.png
Bewertung: Browserblase „Please fill out this field.“ am Datumsfeld, das nur „dd.mm“ zeigt (zu schmal, CM-MM-1); sonst keine Rückmeldung der Seite.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] N1-OB-1 |
| audit (manuell) | [Dimension 1] Fokus auf Feld (gut); Datum abgeschnitten |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] drei Pflichtfelder (Datum, von, bis) ohne Pflichtkennzeichnung |
| adapt (manuell) | [Mobile] drei Felder in einer Zeile zu schmal (CM-MM-1) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- CM-MM-1, N1-OB-1 | bestätigt | wiederholt

##### Formular /matchmaking: leer absenden (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-leer-nativ.png
Bewertung: Sprechblase am Datumsfeld, die Seite scrollt das Formular in die Mitte; sonst keine Rückmeldung.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] N1-OB-1 |
| audit (manuell) | [Dimension 1] ok |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Forms] wie Handy |
| adapt (manuell) | [Desktop] Felder breit genug |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N1-OB-1 | bestätigt | wiederholt

##### Formular /matchmaking: von später als bis (Server-Fehler) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-matchmaking-ungueltig.png
Bewertung: Am Ende des Formulars unter „Lobby aufmachen“ steht im Kasten „Ein Zeitfenster endet vor seinem Beginn.“, am Handy kaum im Blick (Seite rund 1900 px hoch); Felder behalten Werte, sind aber nicht markiert.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: N3-FM-2; Kastenstil N1-OB-3 |
| audit (manuell) | [Dimension 1] Meldung role=alert (ActionForm); Fokus bleibt am Knopf |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Errors] nennt Fehler, aber nicht welches Zeitfenster/welcher Wert (bei mehreren Fenstern wichtig) |
| adapt (manuell) | [Mobile] Meldung unter dem Daumen nach dem Tippen, Felder darüber |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-2 | P1 | Drei Fehler („Ein Zeitfenster endet vor seinem Beginn.“, „Kein Zeitfenster passt: … mindestens 60 Minuten lang … 24 Stunden in der Zukunft enden.“, „Zeitfenster dürfen höchstens 14 Tage in der Zukunft liegen.“) stehen unter dem Absendeknopf, am Handy außerhalb des Bildschirms, ohne Feldmarkierung. Die Regeln (24 h, 14 Tage, mind. 60 Min) stehen vorab nicht am Formular, das Datumsfeld hat kein Maximum. „Kein Zeitfenster passt“ für ein Datum in der Vergangenheit ist irreführend. | captainrot_mobil_extra-matchmaking-ungueltig.png | critique, clarify

##### Formular /matchmaking: von später als bis (Server-Fehler) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-ungueltig.png
Bewertung: Gleiche Meldung unter dem Knopf, Zeitfenster-Felder oberhalb zeigen 21:00 bis 19:00 ohne Markierung.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: N3-FM-2 |
| audit (manuell) | [Dimension 1] wie Handy |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Errors] wie Handy |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-2 | siehe erste Nennung | captainrot_desktop_extra-matchmaking-ungueltig.png | wiederholt

##### Formular /matchmaking: Datum in der Vergangenheit (Server-Fehler) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-ungueltig-vergangen.png
Bewertung: Eingabe 08.11.2026, 19:00 bis 21:00: „Kein Zeitfenster passt: Es muss mindestens 60 Minuten lang sein und mindestens 24 Stunden in der Zukunft enden.“ Die Meldung nennt zwei Regeln auf einmal; welche verletzt ist, ergibt sich nur durch Nachrechnen.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] Funde: N3-FM-2 |
| audit (manuell) | [Dimension 1] ok |
| distill (manuell) | [Remove Redundancy] zwei Regeln in einem Satz |
| clarify (manuell) | [Errors] ein Datum in der Vergangenheit bekommt „Kein Zeitfenster passt“ (irreführend) |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-2 | siehe erste Nennung | captainrot_desktop_extra-matchmaking-ungueltig-vergangen.png | wiederholt

##### Formular /matchmaking: Erfolg (#1020) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-matchmaking-erfolg.png
Bewertung: Weiterleitung auf die Lobbyseite „Spiel #1020 · Lobby“: Kasten „Mein Team: Seed Rot, 1 von 6 Plätzen“, der Captain mit rotem Punkt „Lobby beigetreten“, fünf freie Plätze, fünf Teammitglieder „im Team, aber noch nicht in der Lobby“, „Lobby verlassen“, Hinweis zu Bezahlen und Bereitmachen, „Spieler einladen“, „Gegner“, „Alle offenen Lobbys“ groß neben dem kleinen „Lobby schließen“.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1, 3, Persona Casey] Funde: N3-FM-1 |
| audit (manuell) | [Dimension 4] „Spieler einladen“ erst nach dem Falz; Randknöpfe unter 44 px (Lobby verlassen/schließen) |
| distill (manuell) | [Remove Redundancy] Platzhalterzeilen „Wartet auf Spieler 2..6“ fünfmal |
| clarify (manuell) | [Success states, Language] kein Bestätigungssatz; „Bezahlen und Bereitmachen geht, sobald ein Gegner da ist … Nur wenn alle bezahlt haben“ (Altmodell/zu prüfen, siehe MUSS WEG) |
| adapt (manuell) | [Mobile] Primäraktion „Einladungslink erstellen“ unter dem Falz |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-1 | P1 | Erfolg: Weiterleitung auf die Lobbyseite „Spiel #1020 · Lobby“ ohne Bestätigung. Der Captain steht mit rotem Punkt „Lobby beigetreten“ (Rot = Fehler, N1-ST-6); „Lobby verlassen“ und „Lobby schließen“ sind kleine Randknöpfe, „Alle offenen Lobbys“ ist groß: Hierarchie vertauscht. „Spieler einladen“ liegt am Handy unter dem Bildschirmrand, fünf Teammitglieder stehen ohne Aktion unter „Im Team, aber noch nicht in der Lobby“. | captainrot_mobil_extra-matchmaking-erfolg.png | critique, distill

##### Formular /matchmaking: Erfolg (#1022) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-erfolg.png
Bewertung: Lobbyseite am Desktop: gleicher Aufbau, die Kachel „Spieler einladen“ mit breitem Primärknopf „Einladungslink erstellen“ ist gut sichtbar; „Lobby verlassen“ und „Lobby schließen“ klein, „Alle offenen Lobbys“ groß.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1, 3] Funde: N3-FM-1 |
| audit (manuell) | [Dimension 4] Randknöpfe klein |
| distill (manuell) | [Remove Redundancy] fünf Platzhalterzeilen |
| clarify (manuell) | [Language] wie Handy (Bezahlen und Bereitmachen) |
| adapt (manuell) | [Desktop] schmale Spalte (X-17) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-1 | siehe erste Nennung | captainrot_desktop_extra-matchmaking-erfolg.png | wiederholt

##### /matchmaking nach dem Aufmachen (Handy) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-matchmaking-nach-erfolg.png
Bewertung: Das Formular ist verschwunden; „Gerade warten: Essen 1 Team.“, „Offene Suchen (1)“ mit großer Karte „Seed Rot · Euer Team · Elo 1180“, darunter ein zweiter Kasten „Eure Lobby ist offen: wartet auf einen Gegner“ mit „Suche abbrechen“.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-FM-3 (Doppelung, Formular weg) |
| audit (manuell) | [Dimension 4] Abbrechen-Knopf 38 px (Bild) |
| distill (manuell) | [Remove Redundancy] Doppelung Karte/Kasten (N3-FM-3) |
| clarify (manuell) | [Language] „Suchen“, „Lobby“, „Spiel“ gemischt (N1-SU-1) |
| adapt (manuell) | [Mobile] Karte 400 px hoch ohne Kernaktion |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-3 | P1 | Nach dem Aufmachen verschwindet das Formular ohne Erklärung (eine offene Lobby je Team). „Offene Suchen (1)“ zeigt dieselbe Lobby doppelt (große Karte „Euer Team“ und Kasten „Eure Lobby ist offen“). „Suche abbrechen“ schließt ohne Rückfrage und ohne Meldung, das Formular steht sofort wieder da. | captainrot_mobil_extra-matchmaking-nach-erfolg.png | critique, distill

##### /matchmaking mit offener Lobby (Desktop, #1020 vom Handy) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-nach-erfolg.png
Bewertung: Gleiche Doppelung am Desktop: große Karte mit Stärke, Kader, Zeitfenster, Hinweis „Analyse-Test mobil“ und darunter der Kasten mit „Suche abbrechen“.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-FM-3 |
| audit (manuell) | [Dimension 4] ok |
| distill (manuell) | [Remove Redundancy] Doppelung |
| clarify (manuell) | [Language] „Spielstärke (Selbsteinschätzung)“ ok |
| adapt (manuell) | [Desktop] viel Information in 720 px, gut lesbar |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-3 | siehe erste Nennung | captainrot_desktop_extra-matchmaking-nach-erfolg.png | wiederholt

##### /matchmaking nach „Suche abbrechen“ (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-matchmaking-nach-abbruch.png
Bewertung: Nach dem Abbruch steht die Seite wieder als leere Seite („Offene Suchen (0)“) mit Formular; es gibt keine Meldung, dass die Lobby geschlossen ist.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-FM-3 |
| audit (manuell) | [Dimension 1] kein role=status |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Success states] fehlende Bestätigung (N3-FM-3) |
| adapt (manuell) | [Desktop] Kopfleiste im Bild mitten (Artefakt) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FM-3 | siehe erste Nennung | captainrot_desktop_extra-matchmaking-nach-abbruch.png | wiederholt

##### /app nach dem Aufmachen einer Lobby (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-app-nach-erfolg.png
Bewertung: Der Kasten zeigt jetzt vier Karten (#1020 oben ergänzt), 600 px hoch; die Spielsuche vom Handy fehlt, „Meine Spiele“ zeigt dieselben fünf Zeilen.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-AP-4, N3-AP-5 |
| audit (manuell) | [Dimension 4] Seite 2832 px |
| distill (manuell) | [Remove Redundancy] Kasten wächst mit jeder Lobby (N2-AP-1) |
| clarify (manuell) | [Language] „Eure Lobby ist offen und wartet auf einen Gegner“ (gut, klar) |
| adapt (manuell) | [Mobile] vier Primärknöpfe vor den Karten |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-AP-4 | P1 | Nach dem Aufmachen einer Lobby bietet /app „Lobby aufmachen“ weiter dreifach an (Karte, Kachel, Reiter) und „Team gründen“ als orangen Knopf, obwohl das Team schon eine offene Lobby hat und das Formular nicht mehr erscheint (N3-FM-3, N1-OB-12, SM-ST-1). | captainrot_mobil_extra-app-nach-erfolg.png | critique, distill
- N3-AP-5 | siehe erste Nennung | captainrot_mobil_extra-app-nach-erfolg.png | wiederholt

##### /app nach dem Aufmachen einer Lobby (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-app-nach-erfolg.png
Bewertung: Vier Zeilen im Kasten (#1022 neu), darunter weiter drei Karten, Guthaben, Kacheln und fünf Zeilen „Meine Spiele“ ohne die beiden Spielsuchen.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-AP-4, N3-AP-5 |
| audit (manuell) | [Dimension 4] ok |
| distill (manuell) | [Remove Redundancy] wie Handy |
| clarify (manuell) | [Language] „Lobby aufmachen“ weiter dreifach |
| adapt (manuell) | [Desktop] 720 px |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-AP-4 | siehe erste Nennung | captainrot_desktop_extra-app-nach-erfolg.png | wiederholt
- N3-AP-5 | siehe erste Nennung | captainrot_desktop_extra-app-nach-erfolg.png | wiederholt

##### Einstellungen: Profil speichern (Erfolg) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-einstellungen-profil-gespeichert.png
Bewertung: Nach „Profil speichern“ steht „Gespeichert.“ in roter Akzentfarbe unter dem Knopf (kleiner Text); weiter unten steht das zweite Formular, das Feedback ist von dort nicht zu sehen.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] N2-ES-1, N2-ES-3 für den Captain bestätigt |
| audit (manuell) | [Dimension 1] Rolle der Meldung im Quelltext nicht geprüft |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Success states] „Gespeichert.“ ohne Objekt (N2-ES-3), Farbe wie Fehler (N2-ES-1) |
| adapt (manuell) | [Mobile] Meldung unter dem Knopf, außerhalb der Mitte |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-1, N2-ES-3 | bestätigt für Captain | wiederholt

##### Einstellungen: Profil speichern (Erfolg) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-einstellungen-profil-gespeichert.png
Bewertung: Wie am Handy: „Gespeichert.“ rot unter dem Knopf; am Desktop sichtbar zusammen mit der Notification-Sektion.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] N2-ES-1 |
| audit (manuell) | [Dimension 1] wie Handy |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Success states] wie Handy |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-1 | bestätigt | wiederholt

##### Einstellungen: Name leer (Server-Fehler) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-einstellungen-name-leer.png
Bewertung: Der Name ist leer, unter „Profil speichern“ steht im schwarz umrandeten Kasten „Der Name braucht 2 bis 60 Zeichen.“; das Feld ist nicht markiert und liegt 700 px darüber.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] N2-ES-2 für den Captain bestätigt; N1-OB-3 |
| audit (manuell) | [Dimension 1] Meldung role=alert |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Errors] Regel genannt, Feld nicht genannt (N2-ES-2) |
| adapt (manuell) | [Mobile] Name oben, Meldung unten, dazwischen das ganze Profil |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-2 | bestätigt | wiederholt

##### Einstellungen: Name leer (Server-Fehler) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-einstellungen-name-leer.png
Bewertung: Am Desktop liegt Feld und Meldung nur 600 px auseinander, Meldung weiter ohne Fokus oder Markierung.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 9] N2-ES-2 |
| audit (manuell) | [Dimension 1] wie Handy |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Errors] wie Handy |
| adapt (manuell) | [Desktop] besser sichtbar |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-2 | bestätigt | wiederholt

##### Einstellungen: Benachrichtigungen speichern (Erfolg) (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-einstellungen-prefs-gespeichert.png
Bewertung: „Gespeichert.“ steht rot unter dem Knopf „Speichern“, ohne Hinweis, was gespeichert wurde (elf Kästchen, zwei Kanäle).

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] N2-ES-3 |
| audit (manuell) | [Dimension 1] role=status (Quelltext PrefsForm) |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Success states] Objekt fehlt (N2-ES-3) |
| adapt (manuell) | [Mobile] Kästchenzeilen etwa 28 px hoch (Bildmaß, unter 44, X-07) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-3, N3-FE-2 | bestätigt | wiederholt

##### Einstellungen: Benachrichtigungen speichern (Erfolg) (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-einstellungen-prefs-gespeichert.png
Bewertung: Wie am Handy: rotes „Gespeichert.“ unter „Speichern“.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] N2-ES-3 |
| audit (manuell) | [Dimension 1] wie Handy |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Success states] wie Handy |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N2-ES-3 | bestätigt | wiederholt

##### Einstellungen: „Konto löschen“ aufgeklappt (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-einstellungen-konto-loeschen.png
Bewertung: Der Block nennt die Folgen und verlangt das Tippen von LÖSCHEN; „Konto endgültig löschen“ ist ein Rahmenknopf. Der Captain wird nicht auf Team, Spiele und seine Admin-Rolle hingewiesen.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 5 Fehlervermeidung, Persona Riley] Funde: N3-FE-1 |
| audit (manuell) | [Dimension 1] Tippwort-Schutz (gut) |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Destructive actions] Folgetext vorhanden, Rollenfolgen fehlen (N3-FE-1) |
| adapt (manuell) | [Mobile] Knopf 44 px (gut) |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FE-1 | siehe erste Nennung | captainrot_mobil_extra-einstellungen-konto-loeschen.png | wiederholt

##### Einstellungen: „Konto löschen“ aufgeklappt (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-einstellungen-konto-loeschen.png
Bewertung: Wie am Handy: zwei Sätze Folgetext, Tippfeld, Rahmenknopf; kein Hinweis auf Team-Admin-Rolle, offene Lobbys oder bestätigtes Spiel.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 5] Funde: N3-FE-1 |
| audit (manuell) | [Dimension 1] gut |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Destructive actions] wie Handy |
| adapt (manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-FE-1 | siehe erste Nennung | captainrot_desktop_extra-einstellungen-konto-loeschen.png | wiederholt

##### /app/benachrichtigungen nach dem Besuch (Captain Rot, Handy)
Beleg: captainrot_mobil_extra-benachrichtigungen-nach.png
Bewertung: Die Kopfleiste zeigt jetzt keine Zahl mehr; der Eintrag sieht unverändert aus (kein Unterschied gelesen/ungelesen).

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-BE-1, N3-BE-2 |
| audit (manuell) | [Dimension 1] Zähler weg (gut) |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Language] „Neues Teammitglied“ ok |
| adapt (manuell) | [Mobile] keine |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-BE-1 | siehe erste Nennung | captainrot_mobil_extra-benachrichtigungen-nach.png | wiederholt
- N3-BE-2 | siehe erste Nennung | captainrot_mobil_extra-benachrichtigungen-nach.png | wiederholt

##### /app/benachrichtigungen nach dem Besuch (Captain Rot, Desktop)
Beleg: captainrot_desktop_extra-benachrichtigungen-nach.png
Bewertung: Gleiche Seite am Desktop; ohne Zähler an der Glocke, Eintrag unverändert; keine neue Meldung durch das Aufmachen von Lobby und Spielsuche.

| Befehl | Ergebnis |
|---|---|
| critique (manuell) | [Heuristik 1] Funde: N3-BE-2 |
| audit (manuell) | [Dimension 1] ok |
| distill (manuell) | [Remove Redundancy] keine |
| clarify (manuell) | [Language] wie Handy |
| adapt (manuell) | [Desktop] leere Fläche |
| `impeccable detect` (Quelltext der Seite/Komponente) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N3-BE-2 | siehe erste Nennung | captainrot_desktop_extra-benachrichtigungen-nach.png | wiederholt



#### Nachlauf-Blatt N4 Captain Grün (Fehlerzustand)

Stand: Nachlauf der Gruppe-X-Analyse, Teil 4. Dev-Server Port 3102, Engine 0.1.19 über den Launcher, Seed laut analyse-seed.md (frisch geladen). Nur gelesen, gemessen und Seiten geöffnet; kein Quelltext geändert. Rolle: Captain Grün = `seed-captain-gruen@test.local` (Grün Captain, Team-Admin Seed Grün, `card_status = failed`, Abbuchung `failed`/`card_declined`). Vergleich: `seed-spieler-09@test.local` (Ilias Testmann, `charge_pending`) als Betroffener, `seed-captain-gelb@test.local` als Dritter. Kennung N4 = Nachlauf 4. Vorhandene Funde (X-nn, GM-, GD-, SM-, SD-, CM-, CD-, N1-, N2-, N3-) werden nur referenziert.

#### Methode und Grenzen

- Die fünf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollständig gelesen. critique/audit/distill/clarify/adapt haben keinen Launcher-Befehl: sie liefen manuell, je Durchgang steht in eckigen Klammern der angewandte Teil. critique bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher) lief einmal (PRODUCT.md geladen, Plattform web). `detect --json --viewport <WxH> <URL>` lief für alle sechs Seiten und beide Viewports (12 Läufe, kein Timeout; /app-Seiten leiten ohne Sitzung auf die Anmeldeseite weiter, /matchmaking ist öffentlich und wurde echt gemessen). Der Hinweis „nötig.“ (Straggler) gehört der Anmeldeseite, nicht dem Captain-Bild. `overused-font` (Plus Jakarta Sans) ist in DESIGN.md gesetzt: kein Fund. Zusätzlich Quelltext-Läufe für die Seitenordner unter app, matchmaking, lobby/[id] (Gruppe Y) und PlayerLight.tsx: alle ohne Funde außer PlayerLight.tsx (2 advisory design-system-color, Altampel).
- Ganzseitige Handy-Bilder zeigen die feste untere Navigation mitten im Bild und das runde N (Next-Overlay): Aufnahme-Artefakt, kein Fund.
- Methodischer Befund: Der Kartenstatus je Platz erscheint nur in der Lobby (Gruppe Y) und nur bei eingeschaltetem Schalter `card_payments_enabled`. Die 12 Grid-Bilder entstanden ohne Schalter; für die Lobby-Belege wurde er in der lokalen Dev-DB kurz gesetzt und danach zurückgesetzt (siehe unten). Seiten der Gruppe Y sind als „Gruppe Y, nur Beleg“ gekennzeichnet und nicht bewertet.
- Quelltext-Belege (nur gelesen): card-view.ts, payments/charge.ts:101-103 und 170, payments/charge-run.ts:151-153, server/mygame.ts:60, lobby/[id]/page.tsx.
- Nicht prüfbar: echtes Karten-Erneuern (Stripe nicht eingerichtet, nur „Testkarte hinterlegen“), Nachzahl-Weg und „Anteil übernehmen“ (M3, nicht gebaut), Push, E-Mail bei Fehlschlag (im Code kein Aufruf), echter Google-Login.

#### Geänderte Seed-/Dev-Daten durch die Analyse (vorher/nachher)

| Aktion | Vorher | Nachher |
|---|---|---|
| Einstellung `card_payments_enabled` in der lokalen Dev-DB (soccaz_w2), per kleinem Skript außerhalb des Repos (nur localhost:5433, Worker-DB) | keine Zeile (AUS) | kurz `true` für die Lobby-Belege, danach `false` (Zeile mit `false` bleibt, wirkt wie AUS) |
| Dev-Logins als Captain Grün, Spieler 09, Captain Gelb | – | Sitzungen angelegt; keine Formulare abgesendet |
Seed-Daten (Spiele, Teilnehmer, Abbuchungen, Teams) blieben unverändert; kein Seed-Neuaufruf nötig.

#### Zähler

- Angesehen: 12 Grid-Bilder + 20 Zusatzaufnahmen (Captain Grün: Konto-Menü 2, Lobby Schalter aus 2, Lobby Schalter an 2; Spieler 09: 4 Seiten x 2, Konto-Menü 2, Lobby 2; Captain Gelb Lobby 2) = 32 von 32 Bildern, je Bild einzeln mit Read geöffnet.
- Durchgänge: je Zelle critique, audit, distill, clarify, adapt als eigene Zeilen (32 Abschnitte), plus detect je Seite und Viewport (12 URL-Läufe, 8 Quelltext-Läufe).
- Neue Funde (Erstnennung): P0 1, P1 7, P2 2; gesamt 10.

#### Neue Funde (Erstnennung)

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| N4-FZ-1 | P1 | Der Fehlerzustand ist auf /app nirgends sichtbar: kein Banner, keine Ampel, kein Kartenhinweis. Der Kasten „Meine aktuellen Spiele“ sagt für #1026 (Abbuchung fehlgeschlagen, Anstoß in zwei Tagen) „Bereit machen und bezahlen“, „Meine Spiele“ sagt „Wartet auf Spieler“. Weder Captain noch Betroffener erfahren hier, dass etwas zu tun ist (Statuswort aus mygame.ts:60 kennt weder Kartenmodell noch Kartenstatus; /app liest card_status nirgends). | captaingruen_desktop_app.png | critique, clarify |
| N4-FZ-2 | P0 | Bei fehlgeschlagener Abbuchung entsteht keine Benachrichtigung: charge.ts:101-103 und charge-run.ts:151-153 setzen nur card_status=failed und schreiben ein Audit; notifyUsers (Art „payment“) gibt es nur bei Erfolg (charge.ts:170). /app/benachrichtigungen bleibt leer („Noch keine Benachrichtigungen.“), die Glocke zeigt keine Zahl, obwohl Einstellungen versprechen „Wichtige Hinweise zu Absagen, Ergebnissen und Zahlungen bekommst du immer.“ Der Captain erfährt das Problem nur, wenn er die Lobby (Gruppe Y) von sich aus öffnet. Quelltext-Beleg, im Browser bestätigt (leere Liste bei Captain und Betroffenem). | captaingruen_mobil_app-benachrichtigungen.png | critique, clarify |
| N4-FZ-3 | P1 | Es gibt außerhalb der Lobby keinen Ort „Karte verwalten/erneuern“: /app/einstellungen (Profil, Benachrichtigungen, Daten, Konto löschen), /app/guthaben (nur Aufladen), Konto-Menü und Kopfleiste enthalten nichts zur hinterlegten Karte (Marke, letzte vier Ziffern, Status). Die einzige Handlung „Karte hinterlegen“ steckt im Kartenfeld der Lobby (Gruppe Y). | captaingruen_mobil_app-einstellungen.png | critique, distill |
| N4-FZ-4 | P1 | Widerspruch zwischen Seiten: /app/guthaben („Gerade sind Zahlungen noch nicht eingeschaltet. Spiele kosten daher nichts“, „Noch keine Buchungen“, „Noch keine Belege“) und die /app-Karte „Zahlungen sind noch nicht aktiv, Spiele sind kostenlos“ stehen neben einer fehlgeschlagenen Abbuchung über 11,43 € in der Lobby. Die Abbuchungszeile (payment_charges) taucht in Verlauf und Belegen nirgends auf. Wer die Karte abgelehnt bekam, liest „kostenlos“ und handelt nicht (zusätzlich MUSS WEG, Guthabenmodell). | captaingruen_mobil_app-guthaben.png | critique, clarify |
| N4-FZ-5 | P1 | Gruppe Y, nur Beleg: Der Captain mit abgelehnter Karte sieht in der Lobby nur ein kleines Wort „Abbuchung fehlgeschlagen“ neben seinem Namen; das Kartenfeld darüber sagt weiter „Schritt 1: Karte hinterlegen. Dein Anteil von 11,43 € wird zur Frist abgebucht“ mit Zustimmungsfeld und „Testkarte hinterlegen“, wie bei jemandem, der nie eine Karte hatte. Kein Satz „Deine Karte wurde abgelehnt“, kein Hinweis auf Frist/Folge, kein Knopf „Karte erneuern“, kein Nachzahl-Weg (012 AC-20 verlangt ihn, in diesem Stand nicht gebaut). | captaingruen_desktop_extra-lobby1026-kartenmodus-ein.png | critique, clarify |
| N4-FZ-6 | P1 | Gruppe Y, nur Beleg, Datenschutz: Dritte sehen den Grund namentlich. Captain Gelb und der Spieler Ilias sehen neben „Grün Captain“ die Ampel „Abbuchung fehlgeschlagen“ und neben Kerem „Keine Karte“; die Legende nennt „Abbuchung fehlgeschlagen“ jedem. Vertrag 012 AC-12/AC-20 verlangt für alle außer Betroffenem und Captain/Veranstalter die neutrale rote Ampel „Zahlung ausstehend“ ohne Grund. Die Beschriftung „Zahlung ausstehend“ kommt in card-view.ts nicht vor. | captaingelb_desktop_extra-lobby1026-dritter.png | critique, audit |
| N4-FZ-7 | P2 | Gruppe Y, nur Beleg, Tonfall: Der Betroffene mit Status „Abbuchung läuft“ liest „Deine Karte ist hinterlegt. Dein Anteil wird zur Frist abgebucht.“ in Warnrot, während seine eigene Zeile „Abbuchung läuft“ zeigt: Erfolgsmeldung in Fehlerfarbe, Text passt nicht zum Zustand. | spieler09_desktop_extra-lobby1026.png | critique, clarify |
| N4-FZ-8 | P1 | Gruppe Y, nur Beleg: Ohne den Schalter card_payments_enabled (Seed setzt ihn nicht) ist der Fehlerzustand überall unsichtbar: Die Lobby zeigt alle vier Grün-Spieler gleich orange „Bereit“, Text „Jedes Team macht seine Spieler bereit und bezahlt.“, keinen Kartenstatus. Wer den Seed ohne Schalter prüft, sieht den Fehlerzustand nie (Prüfhinweis für M1). | captaingruen_desktop_extra-lobby1026-kartenmodus-aus.png | critique |
| N4-FZ-9 | P1 | Der Captain mit abgelehnter Karte wird bei Folgehandlungen weder gebremst noch gewarnt: /matchmaking („Lobby aufmachen“, „Gegen Seed Rot antreten“) und /app/suche/neu („Spielsuche erstellen“) laufen ohne Hinweis auf die offene Zahlung; in der Lobby steht „Ja, mein Team ist komplett: Spiel bestätigen“ ohne Bezug zur eigenen Karte. | captaingruen_desktop_matchmaking.png | critique, distill |
| N4-FZ-10 | P2 | Konto-Menü und Kopfleiste kennen den Zustand nicht: kein Punkt am Avatar, kein Menüpunkt „Karte“, dafür „Guthaben 0,00 €“ (MUSS WEG bekannt). Betroffener (Ilias) und Captain haben identische Menüs und identische /app-Seite. | captaingruen_desktop_extra-kontomenue.png | critique, distill |

#### Zellen

##### /app (Captain Grün, Handy)
Beleg: captaingruen_mobil_app.png (Messung 11 von 54 Zielen unter 44 px, Höhe 2532 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Der Captain mit abgelehnter Karte sieht eine Seite, die von einer ohne Problem nicht zu unterscheiden ist: Kasten „Meine aktuellen Spiele“ mit zwei Karten „Bereit machen und bezahlen“, Kachelwand, Guthaben-Karte „Zahlungen noch nicht aktiv“, Meine Spiele „Wartet auf Spieler“. Nichts zeigt, dass die Abbuchung für das Spiel in zwei Tagen fehlgeschlagen ist.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1 Systemzustand, 9 Fehlererkennung, Persona Casey/Jordan] Funde: N4-FZ-1, N4-FZ-4; Wand der Optionen (N2-AP-1) bekannt |
| audit (reference/audit.md, manuell) | [Dimension 4 Responsive, 1 A11y] 11 von 54 Zielen unter 44 px, Höhe 2532 px, kein Überlauf, 0 Konsolenfehler; Fehlerzustand hat keine Textform (nie nur Farbe: hier gar nichts): N4-FZ-1 |
| distill (reference/distill.md, manuell) | [Remove Redundancy, Clear next action] Kasten, Meine Spiele und Kacheln dreimal dasselbe Spiel (N2-AP-1); keine eine nächste Handlung „Karte klären“: N4-FZ-1 |
| clarify (reference/clarify.md, manuell) | [Errors, Actions] „Bereit machen und bezahlen“ passt weder zum Kartenmodell noch zum Fehler; „Zahlungen noch nicht aktiv, Spiele sind kostenlos“ widerspricht: N4-FZ-1, N4-FZ-4; „VS.“ gegen „gegen“ (N2-AP-5) |
| adapt (reference/adapt.md, manuell) | [Mobile, Content Strategy] Eine Statuszeile oben wäre daumengerecht, fehlt: N4-FZ-1; sonst N1-ST-2, N2-AP-1 |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | Exit 2: Straggler „nötig.“ (Anmeldeseite nach Weiterleitung, kein Fund dieses Bildes) und overused-font (in DESIGN.md gesetzt, kein Fund); Quelltext `impeccable detect --json src/app/app/page.tsx`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-1 | siehe erste Nennung | captaingruen_mobil_app.png | critique, clarify
- N4-FZ-4 | siehe erste Nennung | captaingruen_mobil_app.png | critique, clarify

##### /app (Captain Grün, Desktop)
Beleg: captaingruen_desktop_app.png (15 von 54 Zielen unter 44 px, Höhe 1814 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Am Desktop ist der Fehlerzustand genauso unsichtbar; die Kopfleiste zeigt „0,00 €“ (MUSS WEG), die Kartenwand schiebt „Meine Spiele“ nach unten. Ein Captain würde hier kein Problem vermuten.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Assessment A, Heuristik 1, 9, Persona Alex] Funde: N4-FZ-1, N4-FZ-4, N4-FZ-10 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] 15 von 54 Zielen unter 44 px, kein Überlauf, 0 Konsolenfehler; N4-FZ-1 |
| distill (reference/distill.md, manuell) | [Information Architecture] drei Karten, fünf Kacheln, Guthaben-Karte vor Meine Spiele (X-03/X-04); kein Platz für eine Statuszeile: N4-FZ-1 |
| clarify (reference/clarify.md, manuell) | [Language] wie Handy: N4-FZ-1, N4-FZ-4 |
| adapt (reference/adapt.md, manuell) | [Desktop] Platz für eine Hinweisleiste über dem Kasten vorhanden, ungenutzt; sonst X-17 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | Exit 2: nur overused-font (gesetzt, kein Fund); Quelltext `impeccable detect --json src/app/app/page.tsx`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-1 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_desktop_app.png | critique, clarify
- N4-FZ-4 | siehe erste Nennung | captaingruen_desktop_app.png | critique, clarify
- N4-FZ-10 | siehe erste Nennung | captaingruen_desktop_app.png | critique, distill

##### /app/guthaben (Captain Grün, Handy)
Beleg: captaingruen_mobil_app-guthaben.png (9 von 41 Zielen unter 44 px, Höhe 1519 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Die Seite erklärt das Guthabenmodell in vier Schritten, bietet Aufladen mit Rabattcode an und sagt „Verlauf: Noch keine Buchungen“; von der fehlgeschlagenen Karten-Abbuchung und der Karte selbst steht nichts. Im Fehlerfall ist die Seite irreführend, nicht nur veraltet.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 2 Realitätsbezug, 9] Funde: N4-FZ-4, N4-FZ-3; MUSS-WEG-Seite (Dokument) |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] 9 von 41 Zielen unter 44 px, Höhe 1519 px, 0 Konsolenfehler; Betragsfeld und Rabattcode beschriftet (gut, aber MUSS WEG) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] vier Schritte, Aufladen, Verlauf, Belege für ein Modell, das entfällt; durch „Karte und Abbuchungen“ ersetzbar: N4-FZ-3 |
| clarify (reference/clarify.md, manuell) | [Errors, Language] „Zahlungen noch nicht eingeschaltet“ neben Abbuchung: N4-FZ-4; Guthaben/Aufladen/Rabattcode MUSS WEG (Dokument) |
| adapt (reference/adapt.md, manuell) | [Mobile] Navigationsleiste mitten im Bild = Artefakt; keine neuen Funde |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/guthaben`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-4 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_mobil_app-guthaben.png | critique, clarify
- N4-FZ-3 | siehe erste Nennung | captaingruen_mobil_app-guthaben.png | critique, distill

##### /app/guthaben (Captain Grün, Desktop)
Beleg: captaingruen_desktop_app-guthaben.png (13 von 41 Zielen unter 44 px, Höhe 1247 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Wie am Handy: vollständiges Guthabenmodell mit „Jetzt bezahlen“, kein Wort zur Karte oder zur fehlgeschlagenen Abbuchung. Die Betragsanzeige „0,00 €“ steht in Seitenkopf und Kopfleiste doppelt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 2, 9] Funde: N4-FZ-4, N4-FZ-3 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] 13 von 41 Zielen unter 44 px, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Betrag doppelt, Altmodell: N4-FZ-3 |
| clarify (reference/clarify.md, manuell) | [Errors] N4-FZ-4; MUSS WEG bekannt |
| adapt (reference/adapt.md, manuell) | [Desktop] schmale 720-px-Spalte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/guthaben`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-4 | siehe erste Nennung | captaingruen_desktop_app-guthaben.png | critique, clarify
- N4-FZ-3 | siehe erste Nennung | captaingruen_desktop_app-guthaben.png | critique, distill

##### /app/benachrichtigungen (Captain Grün, Handy)
Beleg: captaingruen_mobil_app-benachrichtigungen.png (9 von 35 Zielen unter 44 px, Höhe 844 px, 0 Konsolenfehler)
Bewertung: Leer: „Noch keine Benachrichtigungen.“ Der Captain mit abgelehnter Karte bekommt keine Meldung, obwohl Einstellungen „Zahlungen bekommst du immer“ versprechen. Der Leerzustand ist ehrlich, im Fehlerfall aber falsch beruhigend und bietet keine nächste Handlung.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] Funde: N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 1] 9 von 35 Zielen unter 44 px, 0 Konsolenfehler; leere Fläche unten |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Empty states: first use vs failure] Leerzustand ohne Hinweis auf Zahlungsmeldungen: N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Mobile] keine |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/benachrichtigungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-2 | P0 | Erstnennung, Text in der Tabelle oben | captaingruen_mobil_app-benachrichtigungen.png | critique, clarify

##### /app/benachrichtigungen (Captain Grün, Desktop)
Beleg: captaingruen_desktop_app-benachrichtigungen.png (13 von 35 Zielen unter 44 px, Höhe 800 px, 0 Konsolenfehler)
Bewertung: Gleich leer, drei Viertel der Fläche ungenutzt; keine Spur der Abbuchung, kein Verweis auf Karte oder Zahlungen.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9] Funde: N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 1] 13 von 35 Zielen unter 44 px, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Empty state] N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Desktop] leere Fläche |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/benachrichtigungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-2 | siehe erste Nennung | captaingruen_desktop_app-benachrichtigungen.png | critique, clarify

##### /matchmaking (Captain Grün, Handy)
Beleg: captaingruen_mobil_matchmaking.png (13 von 50 Zielen unter 44 px, Höhe 2254 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Das Lobby-Formular steht ganz unten (CM-MM-1); der Captain kann „Gegen Seed Rot antreten“ und „Lobby aufmachen“ ohne Hinweis auf die offene Zahlung. Dieselbe Seite wie beim gesunden Captain.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 5 Fehlervermeidung] Funde: N4-FZ-9; CM-MM-1 bekannt |
| audit (reference/audit.md, manuell) | [Dimension 4] 13 von 50 Zielen unter 44 px, Höhe 2254 px, kein Überlauf |
| distill (reference/distill.md, manuell) | [Progressive disclosure] Erklärkasten, Liste, Formular (bekannt) |
| clarify (reference/clarify.md, manuell) | [Actions] „Gegen Seed Rot antreten“ klar; Hinweis auf Zahlung fehlt: N4-FZ-9 |
| adapt (reference/adapt.md, manuell) | [Mobile] Formular unten (CM-MM-1) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/matchmaking` | Exit 2: zwei Straggler („offen.“, „bist.“, advisory) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/matchmaking`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-9 | siehe erste Nennung | captaingruen_mobil_matchmaking.png | critique, distill

##### /matchmaking (Captain Grün, Desktop)
Beleg: captaingruen_desktop_matchmaking.png (17 von 50 Zielen unter 44 px, Höhe 1696 px, 0 Konsolenfehler)
Bewertung: Einspaltig, übersichtlich: Karte „Seed Rot“ mit Primärknopf, darunter das Formular. Keine Warnung wegen der offenen Zahlung; „Seed Grün: Elo 1040, 140 Punkte schwächer“ ist klar.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 5] Funde: N4-FZ-9 |
| audit (reference/audit.md, manuell) | [Dimension 4] 17 von 50 Zielen unter 44 px, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine neuen |
| clarify (reference/clarify.md, manuell) | [Actions] wie Handy: N4-FZ-9 |
| adapt (reference/adapt.md, manuell) | [Desktop] Formular unter der Liste statt daneben (CD-MM) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/matchmaking` | Exit 2: line-length (~99 Zeichen im Kopftext) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/matchmaking`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-9 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_desktop_matchmaking.png | critique, distill

##### /app/suche/neu (Captain Grün, Handy)
Beleg: captaingruen_mobil_app-suche-neu.png (9 von 44 Zielen unter 44 px, Höhe 1330 px, 0 Konsolenfehler)
Bewertung: Das Formular „Spiel mit festem Termin suchen“ läuft ohne Rücksicht auf die offene Zahlung; „Mindestens 24 Stunden im Voraus“ ist klar. Der Fehlerzustand beeinflusst nichts.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 5] Funde: N4-FZ-9; CD-ALL-3 bekannt |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] 9 von 44 Zielen unter 44 px, 0 Konsolenfehler |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Forms] gut beschriftet; N4-FZ-9 |
| adapt (reference/adapt.md, manuell) | [Mobile] Navigationsleiste verdeckt Feld im Vollbild (Artefakt) |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/suche/neu` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/suche`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-9 | siehe erste Nennung | captaingruen_mobil_app-suche-neu.png | critique, distill

##### /app/suche/neu (Captain Grün, Desktop)
Beleg: captaingruen_desktop_app-suche-neu.png (13 von 44 Zielen unter 44 px, Höhe 1154 px, 0 Konsolenfehler)
Bewertung: Schmale Formularspalte mittig, sauber; keine Beziehung zum Fehlerzustand.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 5] Funde: N4-FZ-9 |
| audit (reference/audit.md, manuell) | [Dimension 4] 13 von 44 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Forms] wie Handy |
| adapt (reference/adapt.md, manuell) | [Desktop] schmale Spalte (X-17) |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/suche/neu` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/suche`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-9 | siehe erste Nennung | captaingruen_desktop_app-suche-neu.png | critique, distill

##### /app/einstellungen (Captain Grün, Handy)
Beleg: captaingruen_mobil_app-einstellungen.png (30 von 69 Zielen unter 44 px, Höhe 2179 px, kein Überlauf, 0 Konsolenfehler)
Bewertung: Profil, Benachrichtigungen, Daten, Konto löschen: nichts zu Karte oder Zahlung außer dem Satz „Zahlungen bekommst du immer“. Wer die Karte erneuern will, sucht hier vergeblich. 30 kleine Ziele (Farbpunkte, Kästchen).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 6 Wiedererkennen, 10 Hilfe] Funde: N4-FZ-3, N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 4] 30 von 69 Zielen unter 44 px (Profilfarben, Kästchen), Höhe 2179 px |
| distill (reference/distill.md, manuell) | [Progressive disclosure] zehn Kästchen in einer Reihe (SM-EI) |
| clarify (reference/clarify.md, manuell) | [Help text] Satz zu Zahlungen verspricht eine Meldung, die nicht entsteht: N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Mobile] kleine Ziele |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/einstellungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-3 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_mobil_app-einstellungen.png | critique, distill
- N4-FZ-2 | siehe erste Nennung | captaingruen_mobil_app-einstellungen.png | critique, clarify

##### /app/einstellungen (Captain Grün, Desktop)
Beleg: captaingruen_desktop_app-einstellungen.png (34 von 69 Zielen unter 44 px, Höhe 1967 px, 0 Konsolenfehler)
Bewertung: Gleicher Inhalt, kein Kartenbereich. Zwischen „Benachrichtigungen“ und „Deine Daten“ wäre der natürliche Ort für „Zahlungsmittel“.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 6, 10] Funde: N4-FZ-3, N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 4] 34 von 69 Zielen unter 44 px |
| distill (reference/distill.md, manuell) | [Remove Redundancy] zehn Kästchen |
| clarify (reference/clarify.md, manuell) | [Help text] N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Desktop] Kästchen einspaltig, könnten zweispaltig stehen |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/einstellungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-3 | siehe erste Nennung | captaingruen_desktop_app-einstellungen.png | critique, distill
- N4-FZ-2 | siehe erste Nennung | captaingruen_desktop_app-einstellungen.png | critique, clarify

##### Konto-Menü geöffnet (/app) (Captain Grün, Handy)
Beleg: captaingruen_mobil_extra-kontomenue.png
Bewertung: Menü: Mein Profil, Mein Bereich, Guthaben 0,00 €, Benachrichtigungen, Konto und Einstellungen, Hilfe, Abmelden. Kein Hinweis, kein Eintrag zur Karte; „Mein Bereich“ führt auf die Seite, auf der man schon ist.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 6] Funde: N4-FZ-10 |
| audit (reference/audit.md, manuell) | [Dimension 1] Menüpunkte etwa 40 px hoch; Escape/Klick daneben schließt (gut) |
| distill (reference/distill.md, manuell) | [Remove Redundancy] „Mein Bereich“ auf /app |
| clarify (reference/clarify.md, manuell) | [Actions] „Guthaben“ MUSS WEG (bekannt) |
| adapt (reference/adapt.md, manuell) | [Mobile] Popover oben rechts (ein Bottom Sheet läge besser im Daumenbereich) |
| `impeccable detect` (Quelltext UserMenu.tsx, Header.tsx) | keine Funde (Komponenten wie /app) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-10 | siehe erste Nennung | captaingruen_mobil_extra-kontomenue.png | critique, distill

##### Konto-Menü geöffnet (/app) (Captain Grün, Desktop)
Beleg: captaingruen_desktop_extra-kontomenue.png
Bewertung: Gleiches Menü unter dem Avatar; kein Zustand sichtbar, „Guthaben 0,00 €“ doppelt zur Kopfleiste (MUSS WEG).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1] N4-FZ-10 |
| audit (reference/audit.md, manuell) | [Dimension 1] ok |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Betrag doppelt |
| clarify (reference/clarify.md, manuell) | [Actions] wie Handy |
| adapt (reference/adapt.md, manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext UserMenu.tsx, Header.tsx) | keine Funde (Komponenten wie /app) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-10 | P2 | Erstnennung, Text in der Tabelle oben | captaingruen_desktop_extra-kontomenue.png | critique, distill

##### /lobby/#1026 Kartenmodus aus (Captain Grün, Handy) [Gruppe Y, nur Beleg]
Beleg: captaingruen_mobil_extra-lobby1026-kartenmodus-aus.png
Bewertung: Alle vier Grün-Spieler stehen orange „Bereit“; der Fehlerzustand ist unsichtbar, Altmodell-Text „bereit und bezahlt“. Nicht bewertet (Gruppe Y); Beleg für N4-FZ-8.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-8 |
| audit (reference/audit.md, manuell) | Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | Gruppe Y, nur Beleg: „bezahlt“ (MUSS WEG) |
| adapt (reference/adapt.md, manuell) | Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-8 | siehe erste Nennung | captaingruen_mobil_extra-lobby1026-kartenmodus-aus.png | critique

##### /lobby/#1026 Kartenmodus aus (Captain Grün, Desktop) [Gruppe Y, nur Beleg]
Beleg: captaingruen_desktop_extra-lobby1026-kartenmodus-aus.png
Bewertung: Wie Handy; Legende „In der Lobby/Bereit/Bestätigt“. Nicht bewertet; Beleg für N4-FZ-8.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-8 |
| audit (reference/audit.md, manuell) | Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | Gruppe Y, nur Beleg |
| adapt (reference/adapt.md, manuell) | Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-8 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_desktop_extra-lobby1026-kartenmodus-aus.png | critique

##### /lobby/#1026 Kartenmodus an (Captain Grün, Handy) [Gruppe Y, nur Beleg]
Beleg: captaingruen_mobil_extra-lobby1026-kartenmodus-ein.png
Bewertung: Der Fehlerzustand erscheint erst hier: Zeile „Abbuchung fehlgeschlagen“ neben dem eigenen Namen, aber das Kartenfeld verlangt „Schritt 1: Karte hinterlegen“ wie beim Erstkontakt, ohne Grund und ohne „Karte erneuern“. Beleg für N4-FZ-5, -6, -9; nicht bewertet.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-5, N4-FZ-6 |
| audit (reference/audit.md, manuell) | Gruppe Y, nur Beleg: Kartenampel hat Form und Wort (gut, AC-12) |
| distill (reference/distill.md, manuell) | Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-5 |
| adapt (reference/adapt.md, manuell) | Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id], PlayerLight.tsx) | lobby/[id]: keine Funde; PlayerLight.tsx: 2 advisory design-system-color (#ef4444, #f59e0b, Altampel) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-5 | siehe erste Nennung | captaingruen_mobil_extra-lobby1026-kartenmodus-ein.png | critique, clarify
- N4-FZ-6 | siehe erste Nennung | captaingruen_mobil_extra-lobby1026-kartenmodus-ein.png | critique, audit
- N4-FZ-9 | siehe erste Nennung | captaingruen_mobil_extra-lobby1026-kartenmodus-ein.png | critique, distill

##### /lobby/#1026 Kartenmodus an (Captain Grün, Desktop) [Gruppe Y, nur Beleg]
Beleg: captaingruen_desktop_extra-lobby1026-kartenmodus-ein.png
Bewertung: Zweispaltige Teamlisten; „Abbuchung fehlgeschlagen“ in der eigenen Zeile und in der Legende; Kartenfeld ohne Fehlererklärung. Nicht bewertet; Beleg für N4-FZ-5/6.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-5, N4-FZ-6 |
| audit (reference/audit.md, manuell) | Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | Gruppe Y, nur Beleg: N4-FZ-5 |
| adapt (reference/adapt.md, manuell) | Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-5 | P1 | Erstnennung, Text in der Tabelle oben | captaingruen_desktop_extra-lobby1026-kartenmodus-ein.png | critique, clarify
- N4-FZ-6 | siehe erste Nennung | captaingruen_desktop_extra-lobby1026-kartenmodus-ein.png | critique, audit

##### /app (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_app.png (Seite identisch zum Captain bis auf die Rolle „Spieler“)
Bewertung: Ilias hat den Status „Abbuchung läuft“ (charge_pending) und sieht dieselbe Seite wie der Captain: „Bereit machen und bezahlen“, keine Zahlungs-Ampel. Dazu „Lobby aufmachen“ als erste Handlung ohne Captain-Rolle (X-20).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] N4-FZ-1; X-20 bekannt |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] Messung wie Captain, kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Kasten/Liste/Kacheln doppelt (N2-AP-1) |
| clarify (reference/clarify.md, manuell) | [Language] „Bereit machen und bezahlen“: N4-FZ-1 |
| adapt (reference/adapt.md, manuell) | [Mobile] wie Captain |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app` | Exit 2: Straggler „nötig.“ (Anmeldeseite nach Weiterleitung, kein Fund dieses Bildes) und overused-font (in DESIGN.md gesetzt, kein Fund); Quelltext `impeccable detect --json src/app/app/page.tsx`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-1 | siehe erste Nennung | spieler09_mobil_app.png | critique, clarify

##### /app (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_app.png
Bewertung: Wie der Captain: Betroffener und Dritte sehen /app ohne jeden Zahlungshinweis; „Team gründen“ trotz Team (SM-ST-1).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] N4-FZ-1 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] kein Überlauf |
| distill (reference/distill.md, manuell) | [Remove Redundancy] N2-AP-1 |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-1 |
| adapt (reference/adapt.md, manuell) | [Desktop] X-17 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app` | Exit 2: nur overused-font (gesetzt, kein Fund); Quelltext `impeccable detect --json src/app/app/page.tsx`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-1 | siehe erste Nennung | spieler09_desktop_app.png | critique, clarify

##### /app/guthaben (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_app-guthaben.png
Bewertung: Identisch zum Captain: Guthabenmodell, „Noch keine Buchungen“. Auch der Betroffene (laufende Abbuchung) erfährt hier nichts.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] N4-FZ-4 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Altmodell (MUSS WEG) |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-4 |
| adapt (reference/adapt.md, manuell) | [Mobile] wie Captain |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/guthaben` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/guthaben`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-4 | siehe erste Nennung | spieler09_mobil_app-guthaben.png | critique, clarify

##### /app/guthaben (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_app-guthaben.png
Bewertung: Wie Captain, keine Abweichung durch Rolle oder Zustand.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] N4-FZ-4 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Altmodell |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-4 |
| adapt (reference/adapt.md, manuell) | [Desktop] X-17 |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/guthaben` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/guthaben`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-4 | siehe erste Nennung | spieler09_desktop_app-guthaben.png | critique, clarify

##### /app/benachrichtigungen (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_app-benachrichtigungen.png
Bewertung: Leer. Auch bei „Abbuchung läuft“ keine Meldung (die Erfolgsmeldung „Abrechnung“ käme erst nach der Abbuchung).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Language] Leerzustand: N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Mobile] keine |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/benachrichtigungen` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/benachrichtigungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-2 | siehe erste Nennung | spieler09_mobil_app-benachrichtigungen.png | critique, clarify

##### /app/benachrichtigungen (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_app-benachrichtigungen.png
Bewertung: Gleich leer, Fläche ungenutzt.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] N4-FZ-2 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] keine |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Desktop] leere Fläche |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/benachrichtigungen` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/benachrichtigungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-2 | siehe erste Nennung | spieler09_desktop_app-benachrichtigungen.png | critique, clarify

##### /app/einstellungen (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_app-einstellungen.png
Bewertung: Identisch zum Captain, kein Kartenbereich (Stadt „Köln“ trotz Team in Dortmund ist Seed-Eigenart, kein Fund).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] N4-FZ-3 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain, 30 kleine Ziele |
| distill (reference/distill.md, manuell) | [Remove Redundancy] zehn Kästchen |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-2 (Zusage Zahlungen) |
| adapt (reference/adapt.md, manuell) | [Mobile] kleine Ziele |
| `impeccable detect --json --viewport 390x844 http://localhost:3102/app/einstellungen` | Exit 2: Straggler „nötig.“ (Anmeldeseite) und overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/einstellungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-3 | siehe erste Nennung | spieler09_mobil_app-einstellungen.png | critique, distill

##### /app/einstellungen (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_app-einstellungen.png
Bewertung: Wie Captain, kein Kartenbereich.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] N4-FZ-3 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] zehn Kästchen |
| clarify (reference/clarify.md, manuell) | [Language] N4-FZ-2 |
| adapt (reference/adapt.md, manuell) | [Desktop] einspaltig |
| `impeccable detect --json --viewport 1280x800 http://localhost:3102/app/einstellungen` | Exit 2: nur overused-font (gesetzt); Quelltext `impeccable detect --json src/app/app/einstellungen`: keine Funde (Exit 0) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-3 | siehe erste Nennung | spieler09_desktop_app-einstellungen.png | critique, distill

##### Konto-Menü (/app) (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_extra-kontomenue.png
Bewertung: Menü identisch zum Captain, „Guthaben 0,00 €“ (MUSS WEG).

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] N4-FZ-10 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Mein Bereich auf /app |
| clarify (reference/clarify.md, manuell) | [Language] Guthaben MUSS WEG |
| adapt (reference/adapt.md, manuell) | [Mobile] Popover oben |
| `impeccable detect` (Quelltext UserMenu.tsx, Header.tsx) | keine Funde (Komponenten wie /app) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-10 | siehe erste Nennung | spieler09_mobil_extra-kontomenue.png | critique, distill

##### Konto-Menü (/app) (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_extra-kontomenue.png
Bewertung: Wie Captain.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] N4-FZ-10 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] wie Captain |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Betrag doppelt |
| clarify (reference/clarify.md, manuell) | [Language] wie Captain |
| adapt (reference/adapt.md, manuell) | [Desktop] ok |
| `impeccable detect` (Quelltext UserMenu.tsx, Header.tsx) | keine Funde (Komponenten wie /app) |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-10 | siehe erste Nennung | spieler09_desktop_extra-kontomenue.png | critique, distill

##### /lobby/#1026 [Gruppe Y, nur Beleg] (Spieler 09 / Ilias, Handy)
Beleg: spieler09_mobil_extra-lobby1026.png
Bewertung: Der Betroffene (Abbuchung läuft) liest „Deine Karte ist hinterlegt. Dein Anteil wird zur Frist abgebucht.“ in Warnrot und sieht namentlich den fehlgeschlagenen Zustand des Captains und „Keine Karte“ von Kerem. Beleg für N4-FZ-6, N4-FZ-7; nicht bewertet.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] Gruppe Y, nur Beleg: N4-FZ-6, N4-FZ-7 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | [Language] Gruppe Y, nur Beleg |
| adapt (reference/adapt.md, manuell) | [Mobile] Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-6 | siehe erste Nennung | spieler09_mobil_extra-lobby1026.png | critique, audit
- N4-FZ-7 | siehe erste Nennung | spieler09_mobil_extra-lobby1026.png | critique, clarify

##### /lobby/#1026 [Gruppe Y, nur Beleg] (Spieler 09 / Ilias, Desktop)
Beleg: spieler09_desktop_extra-lobby1026.png
Bewertung: Wie Handy; die Legende mit „Abbuchung fehlgeschlagen“ steht auch für den unbeteiligten Spieler da.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] Gruppe Y, nur Beleg: N4-FZ-6, N4-FZ-7 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | [Language] Gruppe Y, nur Beleg |
| adapt (reference/adapt.md, manuell) | [Desktop] Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-6 | siehe erste Nennung | spieler09_desktop_extra-lobby1026.png | critique, audit
- N4-FZ-7 | P2 | Erstnennung, Text in der Tabelle oben | spieler09_desktop_extra-lobby1026.png | critique, clarify

##### /lobby/#1026 als Dritter, Captain Gelb [Gruppe Y, nur Beleg] (Spieler 09 / Ilias, Handy)
Beleg: captaingelb_mobil_extra-lobby1026-dritter.png
Bewertung: Der gegnerische Captain, ein Dritter ohne Zahlungsbeziehung, sieht „Abbuchung fehlgeschlagen“ bei „Grün Captain“ und „Keine Karte“ bei Kerem. Das widerspricht 012 AC-12/AC-20 (neutral „Zahlung ausstehend“, kein Grund). Nicht bewertet, Beleg für N4-FZ-6.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Casey] Gruppe Y, nur Beleg: N4-FZ-6 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | [Language] Gruppe Y, nur Beleg |
| adapt (reference/adapt.md, manuell) | [Mobile] Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-6 | siehe erste Nennung | captaingelb_mobil_extra-lobby1026-dritter.png | critique, audit

##### /lobby/#1026 als Dritter, Captain Gelb [Gruppe Y, nur Beleg] (Spieler 09 / Ilias, Desktop)
Beleg: captaingelb_desktop_extra-lobby1026-dritter.png
Bewertung: Der gegnerische Captain, ein Dritter ohne Zahlungsbeziehung, sieht „Abbuchung fehlgeschlagen“ bei „Grün Captain“ und „Keine Karte“ bei Kerem. Das widerspricht 012 AC-12/AC-20 (neutral „Zahlung ausstehend“, kein Grund). Nicht bewertet, Beleg für N4-FZ-6.

| Befehl | Ergebnis |
|---|---|
| critique (reference/critique.md, manuell) | [Heuristik 1, 9, Persona Jordan] Gruppe Y, nur Beleg: N4-FZ-6 |
| audit (reference/audit.md, manuell) | [Dimension 4, 1] Gruppe Y, nur Beleg |
| distill (reference/distill.md, manuell) | [Remove Redundancy] Gruppe Y, nur Beleg |
| clarify (reference/clarify.md, manuell) | [Language] Gruppe Y, nur Beleg |
| adapt (reference/adapt.md, manuell) | [Desktop] Gruppe Y, nur Beleg |
| `impeccable detect` (Quelltext lobby/[id]) | keine Funde |

Funde (ID | Prio | Beschreibung | Beleg-Datei | Befehl):
- N4-FZ-6 | P1 | Erstnennung, Text in der Tabelle oben | captaingelb_desktop_extra-lobby1026-dritter.png | critique, audit


