# Frontend-Analyse M1, Gruppe Admin (`/admin`)

Stand: Basis `main` (034247c), Dev-Server Port 3102 mit `PAYMENTS_FAKE=1`, Seed `seed-frontend` plus Admin-Seed (`seed-admin`, Branch `feat/seed-admin`, eigener PR). Nur gelesen und gemessen, kein Quelltext geändert. Grundlage: Vertragsentwurf 013 (Richtung E Trikot bleibt, URLs und Test-IDs bleiben), Verträge 009 und 012.

## Kurzfassung (für den Nutzer)

**Status: Degradiert: ja.** (a) `critique`, `audit`, `distill`, `clarify`, `adapt` haben keinen Launcher-Befehl; sie liefen manuell nach vollständig gelesenen Reference-Dateien, ohne Overlay und ohne eigenen Assessment-Sub-Agent (Methode ok, ehrlich vermerkt). (b) `detect` per URL sieht keine Sitzung (Anmeldeseite) und ist für Seiten mit ID-URL ohne Sitzung nicht möglich (nur Quelltext); die 15 URL-Läufe liefen ohne Timeout; zusätzlich Lauf gegen den Quelltext aller Admin-Ordner (0 Funde). (c) Nicht prüfbar: echte Erstattung, "Saison beenden", "Jetzt auslosen", "Absagen", "Zusammenführen" (nur bis zur Rückfrage), native `confirm`/`prompt`-Dialoge (nur Text), Bildschirmtastatur/iOS, CSV-Download am Handy, Mail- und Push-Versand, Stripe-Echtzahlung. Das Hauptbuch ist im Seed bewusst leer (nur 2 Testzeilen aus Analyseläufen).

**Zähler:** angesehen **175 von 175** Screenshots: Admin Desktop 54 von 54 (16 Seiten + 38 Zusatz), Admin Handy 59 von 59 (16 + 43), Teilrollen und Zugriff 62 von 62 (50 Matrixzellen + 12 Zusatz). Je Seite, Rolle und Gerät die fünf Befehle einzeln.

**Funde (Rohzählung):** 1 P0, 69 P1, 77 P2 (Desktop 1 / 39 / 45, Handy 0 / 23 / 21, Rollen 0 / 7 / 11). Das Fundverzeichnis im Blatt Teilrollen ist ein Index (Wiederholung, IDs kommen zweimal vor) und zählt nicht zusätzlich.

**Die 10 schlimmsten Probleme:**
1. AD-HA-1 (P0): `/admin/hallen` "Betreiber zuweisen" ist in allen Karten zerquetscht (Label bricht auf etwa 60 px, E-Mail-Feld nur etwa 40 px), am Handy gleich.
2. AD-ALL-2 (P1): Das Rollenmodell passt nicht zu Vertrag 009/012: Es gibt nur `admin` (kein "Admin 1"), jeder Admin ändert Rollen, sperrt und bedient Finanzen und Einstellungen sofort und ohne Rückfrage; "Admin 2 schlägt Absage vor" gibt es nicht.
3. AD-SP-1 (P1): Keine Admin-Aktion an Spielen: weder Absagen, Lobby schließen noch Ergebnis korrigieren (Vertrag 009 AC-8/9, 012 AC-21).
4. AR-UE-1 (P1): Das Dashboard `/admin` ist für Moderation, Finanzen und Hallen-Buchung identisch mit dem des Admins; nur die Navigation passt zur Rolle.
5. AR-ZU-1, AR-GA-1 (P1): Fehlendes Recht führt still auf `/app` ohne Erklärung; Gäste verlieren die Unterseite (`next` ist immer `/admin`).
6. AR-BU-1 (P1): Sackgasse: fünfmal "Finanzen zu diesem Spiel" für die Rolle Hallen-Buchung endet per Klick auf `/app`.
7. AR-KM-1 (P1): Keine Rollenanzeige im Konto-Menü, der Eintrag heißt immer "Admin".
8. AR-HA-1, AR-HA-2 (P1): Der Hallenbetreiber kommt nur über den Fußzeilenlink nach `/halle`, Anfragen mit Frist sind auf `/app` unsichtbar.
9. AM-ALL-9 (P1, Klärung): Alle 14 Bereiche sind am Handy gleich angeboten, auch unbrauchbare; Vorschlag: am Handy nur Aufgaben der Übersicht, Moderation, Nutzer sperren, Protokoll lesen.
10. Die 14-Punkte-Navigation bricht am Handy um und gewichtet alles gleich (Seitenübergreifende Admin-Funde in den Blättern).

**MUSS WEG (nur Altmodell Guthaben/Aufladen/Wallet und Rabatt-/Promo-Codes):** die ganze Seite `/admin/codes` samt Nav-Punkt "Codes" (Rolle Finanzen); "Guthaben 0,00 €" im Konto-Menü; Guthaben-Kasten und Aufladungs-/Bonus-Kacheln auf `/app` (Umleitungsziel der Teilrollen); Einstellungs-Text "aus dem Guthaben"; Guthaben-Spalten und -Texte auf den Finanzseiten. Details je Seite im Abschnitt MUSS WEG (13 Fundstellen; weitere 7 Zeilen mit Stripe-, Hauptbuch- oder Geld-Bezug stehen in der Klärungstabelle). **Klärung:** Stripe, Hauptbuch für Provision und Gebühren und Erstattung auf die Karte sind Zielmodell (Vertrag 012) und stehen daher NICHT unter MUSS WEG (siehe AD-EI-1).

**Zugriff gemessen:** Moderation sieht 2 von 16 Seiten, Finanzen 5, Hallen-Buchung 3, Spieler und Hallenbetreiber 0, Gast 0; Desktop und Handy gleich; die Navigation zeigt nur erlaubte Punkte. Ausführlich in den Fundblättern (Zugriffsmatrix).

Aufbau des Rests: Matrix-Abdeckung, Methodik, MUSS WEG (zusammengeführt), drei Fundblätter (Admin Desktop, Admin Handy, Teilrollen und Zugriff) mit je Seite Beleg, Bewertung, fünf Durchgängen und Funden.

## Matrix-Abdeckung

16 Seiten unter `/admin`: Übersicht, Spiele, Nutzer, Teams, Ligen, Profi-Tag, Sponsoren, Moderation, Finanzen, Finanzen/Ausgaben, Finanzen/Spiel/[id], Buchungen, Hallen, Codes, Protokoll, Einstellungen (dazu die Route `/admin/finanzen/export`, keine Seite).

| Rolle | Desktop | Handy | Zellen mit Bild |
|---|---|---|---|
| Admin (`seed-admin`) | 16 Seiten | 16 Seiten | 32 (+ 81 Zusatzaufnahmen) |
| Moderation (`seed-moderator`) | Übersicht, Moderation, Nutzer (Umleitung) | gleich | 6 |
| Finanzen (`seed-finanz`) | Übersicht, Finanzen, Ausgaben, Spiel-Finanzen, Codes, Nutzer (Umleitung) | gleich | 12 |
| Hallen-Buchung (`seed-buchung`) | Übersicht, Buchungen, Hallen, Nutzer (Umleitung) | gleich | 8 |
| Gast, Spieler, Hallenbetreiber (`seed-halle`) | Übersicht, Nutzer, Finanzen, Moderation (Zugriffstest) | gleich | je 8 |

Für alle Rollen wurden zusätzlich Status und Zielpfad aller 16 Seiten gemessen (Zugriffsmatrix im Blatt "Teilrollen und Zugriff"). Der Hallenbetreiber hat die Rolle Spieler mit `manager_user_id` und nutzt `/halle` (nicht Teil dieser Analyse, nur kurz eingeordnet).

## Methodik

1. Dev-Server nur auf Port 3102, Dev-Login (nur Nicht-Produktion). Daten: Basis-Seed und Admin-Seed (`analyse-seed.md`, `analyse-seed-admin.md`): 7 offene und 3 bearbeitete Meldungen, Verwarnungen, Ligen, Profi-Tage, Sponsoren, Hallenanfragen, Ausgaben, Rabattcodes, 25 Protokolleinträge.
2. Playwright (Chromium), je Rolle und Gerät Ganzseiten-Screenshot (1,8 s Wartezeit) plus Messwerte; Screenshots nur lokal außerhalb des Repos. Ganzseitige Handy-Bilder zeigen die feste untere Navigation mitten im Bild (Aufnahme-Artefakt, kein Fund).
3. Impeccable nur über den Launcher (Engine 0.1.19): `context`, `detect --json --viewport` je Seite, zusätzlich gegen den Quelltext. Nie `hooks`, `install`, `update`.
4. Drei Sub-Agent-Durchläufe in Serie (Admin Desktop, Admin Handy, Teilrollen und Zugriff), je Seite die fünf Befehle einzeln nach vollständig gelesenen Reference-Dateien. Zusatzaufnahmen für die Hauptinteraktionen je Seite; gefährliche Aktionen nur bis zur Rückfrage.
5. Nichts doppelt zu Analyse X: seitenübergreifende Funde zu Kopfleiste, Fußzeile und Konto-Menü werden per X-Kennung referenziert.
6. Daten wurden von den Durchläufen verändert (Sperren, Rollenwechsel, Moderation, Sponsoren, Hallen, Ausgabe "Analyse-Test"); der Seed wurde zwischen den Durchläufen neu geladen (`seed-admin --clean`, Basis-Seed, Admin-Seed).


## MUSS WEG

Nur Altmodell (Guthaben, Aufladen, Wallet, Rabatt- und Promo-Codes, Guthaben-Texte und -Spalten). Zusammengeführt aus den drei Fundblättern, gleiche Zeilen nur einmal.

**Abgrenzung (nach Review R-T121):** In diese Tabelle gehören nur Guthaben-, Aufladungs-, Bonus- und Rabattcode-Teile (**13 Zeilen**). Alles, was Stripe, Hauptbuch (Provision, Gebühren), Erstattung auf die Karte, Preisregeln oder Marge betrifft, steht in der Klärungstabelle darunter (**7 Zeilen**) und ist nicht MUSS WEG (Vertrag 012).

| Seite | Rolle | Fundstelle | Beleg |
|---|---|---|---|
| alle Admin-Seiten | Admin | Kopfleiste: Link "0,00 EUR" (Guthaben, Test-ID `header-wallet`, X-05) | admin_desktop_uebersicht.png |
| /admin/codes | Admin | ganze Seite "Rabattcodes": Neuer Code, Prozent der Aufladung, Mindestaufladung, Hoechstbonus, Gesamtbudget, "Nur fuer die erste Aufladung", "Alle Codes", Menuepunkt "Codes", PromoToggle | admin_desktop_codes.png |
| /admin/finanzen | Admin | Kacheln "Aufladungen", "Offene Guthaben (Schuld an Spieler)", "Rabatt-Boni" (nur diese Guthaben-/Aufladungs-/Bonus-Kacheln) | admin_desktop_finanzen.png |
| /admin/finanzen/spiel/ID | Admin | nur die Buchungstypen "Aufladung" und "Bonus" (Guthaben-/Bonus-Buchungen) in der Liste der Buchungen | admin_desktop_finanzen-spiel-ID.png |
| /admin/protokoll | Admin | Eintrag `promo.create · promo_code` (Seed), Objekttypen "promo_code" im Verlauf (folgt mit /admin/codes) | admin_desktop_protokoll.png |
| Navigation | Admin | Menuepunkte "Finanzen" und "Codes" in `layout.tsx` (Rechte `finance`); Rolle `finance` ("Finanzen") im Rollen-Dropdown bleibt zu pruefen | admin_desktop_uebersicht.png |
| alle Admin-Seiten (Handy) | Admin | Konto-Menue (Tipp auf "Seed" in der Kopfleiste): Eintrag "Guthaben 0,00 EUR" (am Handy steht der Guthaben-Link nicht in der Kopfleiste, sondern im Menue; Desktop-Blatt nennt den Kopfleisten-Link) | admin_mobil_uebersicht_extra-konto-menue.png |
| /admin/einstellungen (Handy) | Admin | Text der Checkbox "Zahlungen einschalten": "...zahlt seinen Anteil aus dem Guthaben" und "Beim Bereitmachen wird dieser hoechste Anteil reserviert" bleiben auch am Handy sichtbar (inhaltlich identisch zu AD-EI-1; als Handy-Fundstelle nur genannt) | admin_mobil_einstellungen.png |
| alle Admin-Seiten (Navigation) | Finanzen | Navigationspunkt "Codes" (Rabattcodes) ist fuer die Rolle Finanzen ein eigener Menuepunkt; Rabatt-/Promo-Codes sind Altmodell, die Rolle Finanzen hat sonst nur "Uebersicht" und "Finanzen" | finanz_desktop_uebersicht.png, finanz_mobil_uebersicht.png |
| /admin/codes | Finanzen | Seite "Rabattcodes" als einzige Arbeitsseite neben Finanzen mit Feldern "Prozent der Aufladung", "Mindestaufladung", "Hoechstbonus", "Nur fuer die erste Aufladung" (Seite selbst im Admin-Blatt bekannt; neu: Teil der Rolle Finanzen) | finanz_desktop_codes.png, finanz_mobil_codes.png |
| Konto-Menue (alle Seiten) | Moderation, Finanzen, Hallen-Buchung, Spieler mit Halle | Eintrag "Guthaben 0,00 EUR" (Desktop belegt; fuer Admin nur am Handy im Admin-Blatt) | moderator_desktop_extra-kontomenue.png, halle_desktop_extra-kontomenue.png |
| /app (Umleitungsziel) | Moderation, Finanzen, Hallen-Buchung, Spieler mit Halle, Spieler | Kasten "Guthaben 0,00 EUR, Zahlungen sind noch nicht aktiv, Spiele sind kostenlos" auf der Startseite, zu der jede Umleitung fuehrt; Kopfleiste "0,00 EUR" (AD-ALL-6 nennt sie fuer Admin) | moderator_desktop_nutzer.png, spieler_desktop_uebersicht.png, halle_desktop_uebersicht.png |
| /admin/finanzen | Finanzen | Kacheln "Aufladungen", "Rabatt-Boni", "Offene Guthaben (Schuld an Spieler)" sind auch fuer die Rolle Finanzen sichtbar (Fundstelle im Admin-Blatt bekannt; hier nur die Rolle neu) | finanz_desktop_finanzen.png |

### Klärung: Stripe-, Hauptbuch- und Geld-Bezug (nicht MUSS WEG, Zielmodell Vertrag 012)

Diese Zeilen wurden von den Durchläufen als Altmodell vermutet oder nennen Altmodell und Zielmodell gemischt; Stripe, Hauptbuch für Provision und Gebühren, Erstattung auf die Karte, Preisregeln und Marge bleiben jedoch Zielmodell. Bitte im Umbauplan prüfen.

| Seite | Rolle | Fundstelle | Beleg |
|---|---|---|---|
| /admin/einstellungen | Admin | "Zahlungen einschalten ... zahlt seinen Anteil aus dem Guthaben", "Mindestzahl zahlender Spieler" (Anteil, Reservierung), "Zahlungsanbieter: Stripe (Karte, PayPal, SEPA)" (Klaerung noetig, Vertrag 012) | admin_desktop_einstellungen.png |
| /admin/finanzen | Admin | Kacheln "Zahlungsgebuehren", "Marge", "Einnahmen", "Hallenkosten", "Erstattungen"; Alarme "nicht im Ledger", "Haengende Zahlungen"; Abschnitt "Spiele im Monat" (Provision, Stripe-Gebuehren, Erstattung auf die Karte sind Zielmodell, Vertrag 012; Klaerung, nicht MUSS WEG) | admin_desktop_finanzen.png |
| /admin/finanzen/spiel/ID | Admin | Einnahmen, Spielerzahlungen "bezahlt/zurueck/netto", "Ausnahme-Erstattung buchen", Buchungen "(debit an credit)", Typen Gebuehr, Startgebuehr, Rueckbuchung (Hauptbuch, Erstattung: Zielmodell; Klaerung, nicht MUSS WEG) | admin_desktop_finanzen-spiel-ID.png |
| /admin/finanzen/ausgaben | Admin | Verweis auf Spiel-Finanzen in der Liste (Link "Seed Gruen gegen Seed Blau" zu `/admin/finanzen/spiel/...`); Ausgabenerfassung selbst bleibt unklar (Kartenmodell: Halle, Provision?), Rueckfrage noetig | admin_desktop_finanzen-ausgaben.png |
| /admin/finanzen/export | Admin | CSV "Datum;Buchungs-ID;Art;Soll;Haben;Betrag EUR;Spiel;Zahlungs-ID;Nutzer;Grund" (Hauptbuch-Export, Knopf "CSV fuer 2026-11") | admin_desktop_finanzen.png |
| /admin/buchungen | Admin | Einleitung "Bestaetigte und bezahlte Spiele ... Die Kosten buchst du unter Finanzen", "Spieler zahlen 80,00 EUR", "Halle kostet 70,00 EUR", Link "Finanzen zu diesem Spiel" | admin_desktop_buchungen.png |
| /admin/hallen | Admin | Abschnitt "Standardpreise", Preisregeln "Spieler zahlen (Euro)", "Halle kostet uns (Euro)", "Marge", Zeilen "Spieler 85,00 EUR · Kosten 65,00 EUR · Marge 20,00 EUR" (Geldmodell, Provision) | admin_desktop_hallen.png |

## Fundblätter

Je Seite: Beleg, Bewertung, die fünf Durchgänge (Befehl, angewandter Teil, Ergebnis) und die Funde. Kennungen: AD = Admin Desktop, AM = Admin Handy, AR = Rollen und Zugriff. Der Abschnitt MUSS WEG am Ende jedes Blatts steht oben zusammengeführt.

### Fundblatt Admin, Desktop

Stand: Dev-Server Port 3102, Konto `seed-admin@test.local`, Basis-Seed plus Admin-Seed. Nur gelesen, gemessen und bedient; kein Quelltext geaendert. Richtung E (Trikot), URLs und Test-IDs bleiben. Seitenuebergreifende Funde X-01 bis X-20 (Kopfleiste, Fusszeile, Konto-Menue, 720-px-Spalte) werden nur referenziert.

#### Methode und Grenzen

- Die fuenf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollstaendig gelesen. Sie haben keinen Launcher-Befehl und liefen manuell; je Durchgang steht der angewandte Teil in eckigen Klammern. `critique` bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher) lief einmal: PRODUCT.md geladen (web, Admin am Desktop, Kartenmodell Vertrag 012).
- `detect --json --viewport 1280x800 <URL>` lief fuer alle 15 Admin-URLs ohne Timeout (die 16. Seite, Spiel-Finanzen, hat eine ID-URL und wurde nur gegen den Quelltext geprueft). Per URL sieht der Detektor keine Sitzung, er misst die Weiterleitungsseite; Ergebnis je URL: genau ein Treffer `overused-font` (Plus Jakarta Sans), in DESIGN.md gesetzt, kein Fund. `detect --json` gegen den Quelltext (alle 14 Seitenordner und `layout.tsx` unter `src/app/admin`): je 0 Funde, Exit 0.
- Ganzseitige Bilder zeigen die feste Kopfleiste mitten im Bild und das runde N (Next-Overlay): Aufnahme-Artefakt, kein Fund. Das rote "1 Issue" im Bild `einstellungen_extra-mindestzahl-ungueltig` entstand durch das Abschalten des `min`-Attributs fuer den Test: kein Fund.
- Native Dialoge (`confirm`, `prompt`) sind in Playwright nicht fotografierbar; Text und Verhalten stehen im Protokoll (abgebrochen = nichts passiert).
- Nicht ausgeloest: echte Ausnahme-Erstattung (Seite `/admin/finanzen/spiel/<ID>` hat bei leerem Hauptbuch keinen Erstattungsknopf; Befund nur aus dem Quelltext), "Saison beenden", "Jetzt auslosen", "Absagen", "Zusammenfuehren" (alle nur bis zur Rueckfrage, dann abgebrochen), CSV-Download (nur per Request geprueft: Status 200, nur Kopfzeile).
- Rollenfrage (Vertrag 009/012): `user_role` im Schema kennt nur `player`, `admin`, `moderator`, `finance`, `booking`. Es gibt keine Rolle `owner` (Admin 1); ein `admin` darf alles, inklusive Rollen aendern. Einen Absagevorschlag von Admin 2 und eine Admin-Absage gibt es in der Oberflaeche nicht (siehe AD-ALL-2).

#### Geaenderte Daten (vorher / nachher)

| Aktion | Vorher | Nachher |
|---|---|---|
| Nutzer "Anton Testmann" sperren (Grund per Prompt "Analyse-Test Sperrgrund"), dann wieder entsperren | nicht gesperrt | nicht gesperrt (Protokoll hat zwei Eintraege) |
| Versehen: "Entsperren" traf zuerst den Seed-Nutzer "Sven Gesperrt" (Liste "nur gesperrte", erste Zeile) | gesperrt | per "Sperren" mit Grund "Seed-Sperre" wieder gesperrt; Sperrgrund jetzt "Seed-Sperre" statt Seed-Wert |
| Rolle von "Paulo Testmann" auf Finanzen, sofort zurueck | Spieler | Spieler (zwei `user.role`-Eintraege, ohne Rueckfrage) |
| Moderation: "Wieder anzeigen" (Rafael Testmann, 1 Meldung) | in der Warteschlange | Eintrag aus der Warteschlange entfernt (5 auf 4) |
| Moderation: "Entfernen und verwarnen" (Gerd Gewarnt, 1 Meldung) | 2 Verwarnungen, Kommentar offen | 3 Verwarnungen, Kommentar entfernt (4 auf 3) |
| Sponsor "Seed Altpartner KG" pausiert, dabei Versehen: danach "Seed Sport GmbH" pausiert | beide aktiv | beide wieder aktiv (Listenreihenfolge wechselt nach Umschalten, siehe AD-SN-2) |
| Halle "Seed-Halle West" deaktiviert, wieder aktiviert | aktiv | aktiv |
| Ausgabe "Analyse-Test" 12,50 Euro (Hallenmiete) im November gebucht | 4 Ausgaben, 192,50 Euro | 5 Ausgaben, 205,00 Euro (nicht loeschbar, AD-FA-1) |
| Buchungsauftrag "Seed Blau gegen Seed Gelb" unveraendert gespeichert; Einstellungen unveraendert gespeichert | - | gleiche Werte, je ein Protokolleintrag moeglich |
| Alle Fehlerformulare (Liga, Profi-Tag, Sponsor, Preisregel, Code, Ausgabe, Mindestzahl) | - | abgelehnt, nichts gespeichert |
Rueckgaengig nur per Seed-Neuaufruf; Ausnahmen: die Ausgabe (kein Loeschen) und die Protokolleintraege.

#### Zaehler

- Angesehen: 54 von 54 Screenshots (16 Seitenbilder + 38 Zusatzaufnahmen `admin_desktop_<seite>_extra-<name>.png`), je Bild einzeln mit Read geoeffnet; sehr lange Bilder (Nutzer 5139 px, Hallen 4053 px) wurden verkleinert gesehen, die Funde dort stuetzen sich zusaetzlich auf Messung und Quelltext.
- Durchgaenge: je Seite critique, audit, distill, clarify, adapt als eigene Zeilen (16 Seiten x 5), dazu `detect` je URL (15) und gegen den Quelltext (15 Laeufe, alle 14 Ordner plus Layout): alle gelaufen.
- Funde (Erstnennung): P0 1, P1 39, P2 45; gesamt 85.

#### Seitenuebergreifende Admin-Funde

Beleg-Dateien: alle `admin_desktop_*.png`; Messung: Navigation 14 Links, je 32 px hoch, 14 px Schrift, Farbe `#4a5a51` auf `#dde5e0` (Kontrast etwa 5,7:1, in Ordnung); 7 Tab-Stopps in der Kopfleiste vor dem Admin-Menue, kein Skip-Link; Fokusring (orange, 2 px) vorhanden (`admin_desktop_nutzer_extra-tastaturfokus-nav.png`).

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-ALL-1 | P1 | Admin-Navigation mit 14 Punkten bricht in zwei Zeilen um, ungruppiert (Betrieb, Inhalte, Geld, System gemischt), und die aktuelle Seite ist nicht markiert (kein `aria-current`, gleiche Farbe fuer alle). Man sieht nicht, wo man ist. | admin_desktop_spiele.png | critique [Heuristik 1, 6, Cognitive Load: 14 Optionen] |
| AD-ALL-2 | P1 | Rollenmodell passt nicht zu Vertrag 009/012: nur `admin` (kein `owner`/Admin 1); jeder Admin kann Rollen setzen, sperren, Finanzen und Einstellungen bedienen; Absage und Erstattung "nur Admin 1, Admin 2 schlaegt vor" gibt es in der Oberflaeche gar nicht (Spiele-Liste hat nur "Lobby" und "Spiel", keine Absage). | admin_desktop_spiele.png, admin_desktop_nutzer.png | critique [Heuristik 5] |
| AD-ALL-3 | P1 | Gefaehrliche Aktionen uneinheitlich geschuetzt: sofort ohne Rueckfrage und ohne Rueckgaengig: Rolle aendern, Entsperren, Team verifizieren, Ligateam entfernen, Sponsor pausieren, Halle (de)aktivieren, Moderation "Entfernen", "Entfernen und verwarnen", "Wieder anzeigen". Mit nativem `confirm`/`prompt` (unformatiert, nicht zum Design passend): Sperren, Zusammenfuehren, Saison beenden, Auslosen, Absagen. Ein Muster waere noetig (Dialog mit Benennung von Objekt und Folge, siehe clarify). | admin_desktop_nutzer_extra-rolle-geaendert-ohne-rueckfrage.png, admin_desktop_moderation_extra-nach-entfernen-und-verwarnen-ohne-rueckfrage.png | clarify [Destruktive Aktionen], critique [Heuristik 3, 5] |
| AD-ALL-4 | P1 | Desktop ist eine gestreckte Handyansicht (X-17): Listen sind Karten statt Tabellen, keine Spalten, keine waehlbare Sortierung, Filter nur teilweise, Paginierung nur Nutzer, Spiele, Teams, Protokoll. Ergebnis: Nutzer 5139 px, Hallen 4053 px, Buchungen 2632 px lang. | admin_desktop_nutzer.png, admin_desktop_hallen.png | adapt [Desktop Adaptation: Data tables], distill |
| AD-ALL-5 | P2 | Rueckmeldungen uneinheitlich: Erfolg als kleiner orangefarbener Text "Gespeichert." (Kontrast etwa 4,6:1, knapp), Fehler als schwarz umrandeter Kasten ohne Fehlerfarbe, kein Toast; nach Aktionen, die eine Zeile entfernen (Moderation), gibt es gar keine Rueckmeldung. | admin_desktop_finanzen-ausgaben_extra-ausgabe-gebucht.png, admin_desktop_ligen_extra-fehler-ende-vor-start.png | clarify [Errors, Success], audit [A11y] |
| AD-ALL-6 | P1 | Kopfleiste und Fusszeile sind die der Spieler (X-05, X-07, X-17): Admin sieht "0,00 EUR" Guthabenlink, "Offene Lobbys", 13-Link-Fusszeile; fuer die Arbeit am Desktop nutzlos. Guthabenlink siehe MUSS WEG. | admin_desktop_uebersicht.png | critique [Heuristik 8] |
| AD-ALL-7 | P2 | Datumsformat uneinheitlich: ISO ("2026-11-25 bis 2027-02-09" in Ligen, "ab 2026-11-06" in Hallen, "2026-11-11" in Ausgaben, "CSV fuer 2026-11") neben "Mi., 11.11., 16:25 Uhr" ohne Jahr (Spiele, Moderation, Protokoll). Euro-Format "80,00 EUR" ist durchgaengig richtig. | admin_desktop_ligen.png, admin_desktop_finanzen-ausgaben.png | clarify [Konsistenz] |
| AD-ALL-8 | P2 | Rohe interne Begriffe: `Status confirmed`, "Ledger", Objekt-IDs ("match 5eed0ad0"), Aktionscodes ("user.role", "comment.remove_and_warn"), "Zahlung(en)". | admin_desktop_finanzen-spiel-ID.png, admin_desktop_protokoll.png | clarify [Jargon] |
| AD-ALL-9 | P1 | Teams werden ueberall per Freitext-Slug eingetragen ("Team (Name aus der Adresse, z. B. rot-weiss-essen)"): Ligen "Team hinzufuegen", Profi-Tag "Profi-Team", Sponsoren "Team zuordnen". Erinnern statt Auswaehlen; Fehler erst nach Absenden. Geltung auch fuer AD-LI, AD-PT, AD-SN. | admin_desktop_ligen_extra-team-unbekannt.png | critique [Heuristik 6], clarify [Forms] |
| AD-ALL-10 | P2 | Zielgroessen: Aktionsknoepfe 36 px hoch, Navigation 32 px, "Als Turnier-Veranstalter freischalten" mit 12 px Schrift; viele 12-px-Texte (Nutzer: 27 Textknoten unter 13 px, Messung `metrics-desktop.json`: Nutzer 127 von 152 Zielen unter 44 px). Fuer Desktop ueber WCAG-AA-Minimum 24 px, aber eng gesetzt. | admin_desktop_nutzer.png | audit [Responsive: Touch targets] |
| AD-ALL-11 | P2 | Seitennamen uneinheitlich: Menue "Codes" / Titel "Rabattcodes"; "Buchungen" / "Hallen-Buchungen"; "Protokoll" / "Aenderungsprotokoll"; "Sponsoren" / "Sponsoren und Trikot-Partner"; Tab-Titel "Moderation" ohne "Admin:" wie alle anderen. | admin_desktop_codes.png, admin_desktop_moderation.png | clarify [Terminologie] |
| AD-ALL-12 | P1 | Admin-Seed-Daten ohne Seite: Hallenanfragen (11), Veto-Hallen (5), Verwarnungen und Zuverlaessigkeit/spaete Absagen pro Nutzer haben keinen Platz in der Navigation oder in der Nutzerzeile; Informationsarchitektur deckt die Admin-Aufgaben nicht ab. | admin_desktop_nutzer.png, admin_desktop_buchungen.png | critique [IA], distill |

#### Seiten

##### /admin (Admin, Desktop)
Beleg: admin_desktop_uebersicht.png (Messung: 689 Zeichen, 50 Ziele davon 26 klein, kein Ueberlauf, 0 Konsolenfehler), admin_desktop_uebersicht_extra-tastaturfokus.png
Bewertung: Sehr leere Startseite: zwei Aufgabenkarten und sechs Zahlenkacheln in der 720-px-Spalte. Ruhig und klar, aber sie zeigt nur zwei der Aufgaben, die der Admin hat; die Zahlen sind nicht anklickbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] Funde AD-UE-1, AD-UE-2, AD-UE-3, AD-UE-4; AD-ALL-1 |
| audit | [A11y, Responsive] Fokusring sichtbar; Kontrast in Ordnung; keine Funde ausser AD-ALL-10 |
| distill | [Remove redundancy] keine Funde (wenig Inhalt) |
| clarify | [Labels] "Unzugestellte Meldungen" unklar: AD-UE-2 |
| adapt | [Desktop] Kacheln 3 pro Zeile in 720 px: X-17 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin` (page.tsx, layout.tsx): 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-UE-1 | P1 | "Aufgaben" kennt nur Streitfaelle und Spiele ohne Ergebnis. Offene Moderationsmeldungen (5), offene Buchungsauftraege, offene Erstattungen und Hallenanfragen tauchen nicht auf; wer nur die Uebersicht ansieht, uebersieht sie. | admin_desktop_uebersicht.png | critique |
| AD-UE-2 | P2 | Sechs gleich gewichtete Kennzahlen ohne Link und ohne Vergleich; "Unzugestellte Meldungen" ist unklar (Push? Mail?). | admin_desktop_uebersicht.png | clarify |
| AD-UE-3 | P2 | Aufgabenkarten fuehren zur Spielerseite des Spiels; ob dort der Streitfall entschieden werden kann, wurde nicht geprueft (nicht belegt). Streitfall nur durch dunkleren Rahmen von "Ohne Ergebnis" unterschieden; Datum ohne Jahr. | admin_desktop_uebersicht.png | critique |
| AD-UE-4 | P2 | Seitentitel "Admin" sagt nichts; die Aufgaben-Plakette (Zahl 2) ist die einzige Hervorhebung. | admin_desktop_uebersicht.png | clarify |

##### /admin/spiele (Admin, Desktop)
Beleg: admin_desktop_spiele.png (2037 px, 60 von 85 Zielen klein), _extra-filter-strittig, _extra-leer, _extra-seite2
Bewertung: Brauchbare, chronologisch absteigende Liste mit Filter nach Team und Status; eine Zeile zeigt Teams, Zeit, Status, Halle. Es fehlen Admin-Eingriffe (Absage), Ergebnis und Sortierung.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 7; Persona Alex] Funde AD-SP-1 bis AD-SP-5 |
| audit | [A11y, Responsive] Platzhalter-Kontrast 4,1:1 (X-16): AD-SP-5 |
| distill | [Information architecture] zwei gleich starke Knoepfe je Zeile: AD-SP-3 |
| clarify | [Empty states] Leerzustand "Keine Spiele gefunden." ohne Zurueck: AD-SP-4 |
| adapt | [Desktop: Data tables] AD-ALL-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/spiele`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/spiele`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-SP-1 | P1 | Keine Admin-Aktion an Spielen: weder Absagen, Lobby schliessen noch Ergebnis korrigieren (Vertrag 009 AC-8/9, 012 AC-21); nur Links "Lobby" und "Spiel" zu den Spielerseiten. | admin_desktop_spiele.png | critique |
| AD-SP-2 | P1 | 17 Zeilen ohne Spielnummer, Ergebnis oder Sortierwahl; Status nur als grauer 14-px-Text (Strittig und Gespielt sehen gleich aus); Filter nur Team und Status (kein Zeitraum, keine Halle, keine Sichtbarkeit). | admin_desktop_spiele.png | distill, adapt |
| AD-SP-3 | P2 | Zwei gleich starke Knoepfe "Lobby" und "Spiel" je Zeile fuehren beide zu Spielerseiten; die Zeile selbst ist nicht klickbar. | admin_desktop_spiele.png | distill |
| AD-SP-4 | P2 | Seite 2 per URL zeigt "Keine Spiele gefunden." mit "Zurueck", ohne Hinweis, dass die Liste zu Ende ist. | admin_desktop_spiele_extra-seite2.png | clarify |
| AD-SP-5 | P2 | Filterkarte: Label "Team" und Platzhalter "Teamname" doppeln sich; Platzhalter 4,1:1 (X-16); Filtern-Knopf ueber volle Breite wie ein Hauptknopf der Seite. | admin_desktop_spiele_extra-leer.png | audit |

##### /admin/nutzer (Admin, Desktop)
Beleg: admin_desktop_nutzer.png (5139 px, 127 von 152 Zielen klein), _extra-suche, _extra-nur-gesperrt, _extra-leer, _extra-seite2, _extra-gesperrte-liste, _extra-sperren-prompt-abgebrochen, _extra-nach-sperre, _extra-nach-entsperren, _extra-rolle-geaendert-ohne-rueckfrage, _extra-tastaturfokus-nav
Bewertung: Wichtigste Admin-Seite, aber die schwaechste: jede Zeile hat vier gleichrangige Aktionen, die Seite ist 5139 px lang, und Rollenwechsel und Entsperren wirken sofort. Suche und Filter funktionieren, der Gesperrt-Hinweis ist gut erkennbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 5, 7, 9; Persona Alex, Sam, Riley] Funde AD-NU-1 bis AD-NU-7 |
| audit | [A11y, Responsive] Labels vorhanden (Rolle per `sr-only`), Fokus sichtbar; 27 Texte unter 13 px: AD-ALL-10 |
| distill | [Visual simplification, Interaction] Sperren-Knopf bei jedem Nutzer: AD-NU-3 |
| clarify | [Destruktive Aktionen, Forms] Prompt-Text, stiller Abbruch: AD-NU-2 |
| adapt | [Desktop: Tabellen, Master-Detail] AD-NU-4, AD-ALL-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/nutzer`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-NU-1 | P1 | Rollenauswahl (Spieler, Plattform-Admin, Moderation, Finanzen, Hallen-Buchung) schreibt beim Wechsel sofort, ohne Rueckfrage und ohne Rueckmeldung ausser der geaenderten Auswahl; eine versehentliche Auswahl macht jemanden zum Plattform-Admin. Das ist die Rechte-Vergabe der Plattform. | admin_desktop_nutzer_extra-rolle-geaendert-ohne-rueckfrage.png | clarify, critique |
| AD-NU-2 | P1 | Sperren fragt per `window.prompt` nach dem Grund; Abbrechen oder leere Eingabe tut still nichts; der Grund steht danach nirgends in der Zeile (nur im Protokoll). "Entsperren" wirkt sofort ohne Rueckfrage und Grund. Beim Test traf "Entsperren" in der gefilterten Liste die falsche Zeile leicht (zwei Zeilen mit gleichem Knopf). | admin_desktop_nutzer_extra-gesperrte-liste.png, admin_desktop_nutzer_extra-sperren-prompt-abgebrochen.png | clarify |
| AD-NU-3 | P1 | 25 Zeilen je rund 180 px mit Rolle, "Profi-Badge", "Sperren"/"Entsperren" und "Veranstalter" gleichrangig; "Sperren" (dunkel umrandet) steht bei jedem Nutzer und erzeugt Rauschen; der 12-px-Veranstalter-Knopf ist ein Satz lang. | admin_desktop_nutzer.png | distill |
| AD-NU-4 | P1 | Keine Nutzer-Detailansicht: Verwarnungen, Zuverlaessigkeit, spaete Absagen, Teams, Kommentare des Nutzers sind in der Zeile nicht sichtbar, obwohl der Seed sie hat; Verwarnungen erscheinen nur in der Moderation. | admin_desktop_nutzer.png | adapt, critique |
| AD-NU-5 | P2 | Reihenfolge nach Anlegedatum ohne zweite Sortierung: bei gleichem Zeitstempel springt eine Zeile (Anton wanderte nach dem Sperren ans Ende); keine waehlbare Sortierung. | admin_desktop_nutzer_extra-nach-sperre.png | adapt |
| AD-NU-6 | P2 | Begriffe: Rollenname "Plattform-Admin" statt "Admin", "Hallen-Buchung" in der Auswahl, "Hallen-Buchungen"/"Buchungen" im Menue (AD-ALL-11); Suchfeld ohne Platzhalter und ohne Hinweis, dass die E-Mail durchsucht wird. | admin_desktop_nutzer_extra-suche.png | clarify |
| AD-NU-7 | P2 | Seitenzaehler nur "Seite 1" / "Seite 2" mit "Weiter"; keine Gesamtzahl (die Uebersicht nennt 42 Nutzer), "seit Mi., 11.11., 16:25" mit Uhrzeit ist fuer die Registrierung ueberfluessig. | admin_desktop_nutzer_extra-seite2.png | distill |

##### /admin/teams (Admin, Desktop)
Beleg: admin_desktop_teams.png (1926 px), _extra-suche, _extra-leer, _extra-zusammenfuehren-bestaetigung-abgebrochen
Bewertung: Aufgeraeumte Liste mit Suche; Teamzeile mit Stadt und Mitgliederzahl. Die Aktion "Zusammenfuehren" ist die gefaehrlichste Aktion der Seite und die schwaechste in der Bedienung.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 5, 9] AD-TE-1, AD-TE-2 |
| audit | [A11y] Auswahl hat sr-only-Label; kein Fund ausser AD-ALL-10 |
| distill | [Interaction] AD-TE-3 |
| clarify | [Labels] "In anderes Team ueberfuehren..." gegen Knopf "Zusammenfuehren": AD-TE-1 |
| adapt | [Desktop] AD-TE-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/teams`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/teams`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-TE-1 | P1 | Zusammenfuehren: die Zielauswahl enthaelt nur die anderen Teams der aktuellen Seite/Suche (bei Suche "Rot" gibt es keins); Richtung unklar (Auswahl "In anderes Team ueberfuehren...", Knopf "Zusammenfuehren"); nur natives `confirm` ("... verschwindet danach"), nicht rueckholbar. | admin_desktop_teams_extra-suche.png, admin_desktop_teams_extra-zusammenfuehren-bestaetigung-abgebrochen.png | clarify, critique |
| AD-TE-2 | P1 | Zeile ohne Kontext zur Entscheidung: kein Captain, keine Spiele, kein Elo; "Seed Archiv" (im Protokoll `team.archive`) sieht aus wie ein aktives Team, es gibt keine Archiv-Kennzeichnung. | admin_desktop_teams.png | adapt |
| AD-TE-3 | P2 | "Verifizieren" und "Verifizierung entziehen" wirken sofort; das Verifiziert-Abzeichen ist ein kleines orangefarbenes Etikett (12 px). | admin_desktop_teams.png | distill |
| AD-TE-4 | P2 | Keine Sortierung und keine Seitenwahl sichtbar bei 10 Teams; Teamname ist der einzige Link (zur oeffentlichen Seite), ohne Hinweis. | admin_desktop_teams.png | adapt |
| AD-TE-5 | P2 | Leerzustand "Keine Teams gefunden." ohne Weg zurueck (Suche zuruecksetzen). | admin_desktop_teams_extra-leer.png | clarify |

##### /admin/ligen (Admin, Desktop)
Beleg: admin_desktop_ligen.png (1561 px), _extra-fehler-ende-vor-start, _extra-team-unbekannt, _extra-saison-beenden-bestaetigung-abgebrochen
Bewertung: Formular oben, drei Ligakarten darunter. Die Bestaetigung bei "Saison beenden" ist die beste im Admin (nennt Folge und Endgueltigkeit); die Karten zeigen aber weder Tabelle noch Spiele.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6, 9] AD-LI-1 bis AD-LI-4, AD-ALL-9 |
| audit | [Forms] Labels vorhanden, Fehlerbereich `role="alert"` im Quelltext |
| distill | [Visual: gleiche Primaerknoepfe] AD-LI-4 |
| clarify | [Errors] Anfuehrungszeichen im Fehlertext: AD-LI-3 |
| adapt | [Desktop] Ligakarte ohne Tabelle: AD-LI-1 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/ligen`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/ligen`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-LI-1 | P1 | Ligakarte zeigt nur Teamnamen: keine Punkte, Plaetze, Spielzahl, keine Spiele; die beendete Liga zeigt keinen Meister; es gibt keine Bearbeitung (Name, Ende, offener Beitritt). "Entfernen" eines Teams ohne Rueckfrage. | admin_desktop_ligen.png | adapt, critique |
| AD-LI-2 | P2 | Status ist falsch benannt: "Seed-Liga Winter" beginnt am 25.11.2026, steht aber als "laeuft" (heute 11.11.). Es fehlt der Zustand "geplant". | admin_desktop_ligen.png | clarify |
| AD-LI-3 | P2 | Fehlertext "Team „gibt-es-nicht" nicht gefunden..." mit gemischten Anfuehrungszeichen; Fehler steht unter dem Knopf in einem schwarzen Kasten und bleibt nach Korrektur stehen; Datum ISO (AD-ALL-7). | admin_desktop_ligen_extra-team-unbekannt.png | clarify |
| AD-LI-4 | P2 | Vier gleich grosse orangefarbene Hauptknoepfe ("Liga anlegen", 2x "Team hinzufuegen") dominieren die Seite; das Formular steht vor der Liste und schiebt sie unter den Bildschirm. | admin_desktop_ligen.png | distill |

##### /admin/profitag (Admin, Desktop)
Beleg: admin_desktop_profitag.png (1396 px), _extra-fehler-unbekanntes-team, _extra-bestaetigungen-abgebrochen
Bewertung: Ein langes Formular (neun Felder) vor vier Terminkarten. Aktionen "Jetzt auslosen" und "Absagen" tragen Rueckfragen, aber die Entscheidungsgrundlage fehlt.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 5] AD-PT-1, AD-PT-2 |
| audit | [Forms] Labels vorhanden; Pflichtfelder nur ueber `required` |
| distill | [Redundancy] AD-PT-2 |
| clarify | [Labels] "Beginn (deutsche Zeit)" gut; "Profi-Team (Name aus der Adresse...)" AD-ALL-9 |
| adapt | [Desktop] Formular einspaltig in 720 px: AD-PT-3 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/profitag`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/profitag`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-PT-1 | P1 | "Jetzt auslosen" (nicht rueckholbar, "Die Spiele werden sofort angelegt") ohne Bewerberzahl, Bewerberliste und Bewerbungsschluss in der Zeile; der Seed hat 8 Bewerbungen, die Seite zeigt keine. | admin_desktop_profitag.png | critique |
| AD-PT-2 | P2 | Titel enthaelt den Status ("Heute (laeuft)", "(ausgelost)", "(abgesagt)") und die Zeile wiederholt ihn ("ausgelost"): doppelt und teils widerspruechlich ("laeuft" gegen "ausgelost"). | admin_desktop_profitag.png | distill |
| AD-PT-3 | P2 | "Jetzt auslosen" (primaer orange) neben "Absagen" (danger) mit nativer Rueckfrage; die Rueckfrage "Profi-Tag absagen?" nennt weder Titel noch Folge fuer Bewerber. Formular 600 px vor der Liste. | admin_desktop_profitag_extra-bestaetigungen-abgebrochen.png | clarify |

##### /admin/sponsoren (Admin, Desktop)
Beleg: admin_desktop_sponsoren.png (1463 px), _extra-url-ungueltig, _extra-pausiert-ohne-rueckfrage
Bewertung: Uebersichtlich, kurze Karten. Zwei riesige Primaerknoepfe "Team zuordnen" wirken wichtiger als die eigentliche Aufgabe; das zugeordnete Team ist nicht sichtbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9] AD-SN-1, AD-SN-2 |
| audit | [A11y] kein Fund ausser AD-ALL-10 |
| distill | [Visual] AD-SN-1 |
| clarify | [Errors] AD-SN-4 |
| adapt | [Desktop] AD-SN-3 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/sponsoren`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/sponsoren`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-SN-1 | P1 | Trikot-Partner: das aktuell zugeordnete Team ist nicht zu sehen (nur leeres Slug-Feld, AD-ALL-9); "Team zuordnen" ist ein ganzbreiter Hauptknopf auf jeder Partnerkarte. | admin_desktop_sponsoren.png | critique, distill |
| AD-SN-2 | P1 | "Pausieren"/"Aktivieren" wirkt sofort; die Liste sortiert danach um (aktive zuerst), die Zeile wandert unter dem Mauszeiger weg; beim Test fuehrte genau das zu einem Fehlklick auf den falschen Sponsor. | admin_desktop_sponsoren_extra-pausiert-ohne-rueckfrage.png | critique |
| AD-SN-3 | P2 | Zeile zeigt Adresse, Kurztext und Laufzeit nicht; "42 Klicks" ohne Zeitraum; kein Bearbeiten, kein Loeschen. | admin_desktop_sponsoren.png | adapt |
| AD-SN-4 | P2 | Fehler "Die Adresse ist ungueltig." nennt nicht, was verlangt ist (`https://...`); Feld ist kein `type=url`. | admin_desktop_sponsoren_extra-url-ungueltig.png | clarify |

##### /admin/moderation (Admin, Desktop)
Beleg: admin_desktop_moderation.png (1329 px), _extra-nach-wieder-anzeigen, _extra-nach-entfernen-und-verwarnen-ohne-rueckfrage
Bewertung: Gut lesbar: Autor, Verwarnungen, Meldungsanzahl, Gruende und Kommentartext in einer Karte, drei Entscheidungen darunter. Die Entscheidungen sind unscharf benannt, ungeschuetzt und ohne Rueckmeldung.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 5; Persona Alex, Riley] AD-MO-1, AD-MO-2 |
| audit | [A11y] Fehlerbereich mit `role="alert"`; Link "Zur Seite" 12 px orange auf Hellgrau, etwa 4,6:1, knapp: AD-MO-3 |
| distill | [Interaction] drei Knoepfe gleicher Art: AD-MO-2 |
| clarify | [Aktionsnamen] AD-MO-1 |
| adapt | [Desktop] Warteschlange ohne Sortierung: AD-MO-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/moderation`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/moderation`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-MO-1 | P1 | "Wieder anzeigen" steht auch an sichtbaren Kommentaren und bedeutet dort in Wahrheit "Meldung abweisen"; ein Klick nahm den Eintrag kommentarlos aus der Warteschlange (5 auf 4), ohne Rueckmeldung und ohne Rueckgaengig. | admin_desktop_moderation_extra-nach-wieder-anzeigen.png | clarify |
| AD-MO-2 | P1 | "Entfernen" und "Entfernen und verwarnen" (zwei gleiche danger-Knoepfe nebeneinander) wirken sofort ohne Rueckfrage, ohne Begruendung (Vertrag 009 AC-8 verlangt eine Pflichtbegruendung bei Eingriffen); die Folge ist nur als Zahl in einer Nachbarkarte zu sehen (Verwarnungen 2 auf 3). | admin_desktop_moderation_extra-nach-entfernen-und-verwarnen-ohne-rueckfrage.png | clarify |
| AD-MO-3 | P2 | Kontext fehlt: unter welchem Objekt (Halle, Spieler, Team) der Kommentar steht, wer gemeldet hat; bei Team-Kommentaren fehlt "Zur Seite" (Quelltext: `TARGET_HREF` liefert null); Links im Kommentartext erscheinen als Klartext ohne Warnung. | admin_desktop_moderation.png | adapt |
| AD-MO-4 | P2 | Zustand (sichtbar/ausgeblendet) und Meldungszahl nur als 12-px-Grautext rechts oben; keine Sortierung nach Dringlichkeit; ausgeblendeter Kommentar mit 0 Meldungen ist unerklaert. | admin_desktop_moderation.png | critique |

##### /admin/finanzen (Admin, Desktop)
Beleg: admin_desktop_finanzen.png (1461 px), _extra-vormonat
Bewertung: Gesamte Seite gehoert zum Altmodell (Aufladungen, Guthaben, Rabatt-Boni, Zahlungsgebuehren, Hauptbuch). Bei leerem Hauptbuch steht dort nur "0,00 EUR" in acht Kacheln, ein Alarm-Block mit Rohtext und ein leerer Spiele-Block; das ist fuer die Entscheidung nutzlos.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 4, 8] AD-FI-1, AD-FI-2, AD-FI-3 |
| audit | [Theming] Marge 0,00 EUR in Warnorange (`text-accent-fg` bei nicht negativ): AD-FI-3 |
| distill | [Remove] ganze Kachelreihe Altmodell: AD-FI-1 |
| clarify | [Jargon] "Ledger", ID-Anzeige: AD-FI-2 |
| adapt | [Desktop] AD-FI-5 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/finanzen`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-FI-1 | P1 | MUSS WEG (ganze Seite, Altmodell): Kacheln "Einnahmen (netto nach Erstattungen)", "Hallenkosten", "Zahlungsgebuehren", "Rabatt-Boni", "Marge", "Aufladungen", "Erstattungen", "Offene Guthaben (Schuld an Spieler)", Alarme zu Hauptbuch und Zahlungen, "Spiele im Monat". | admin_desktop_finanzen.png | distill |
| AD-FI-2 | P1 | Alarme in Rohsprache: "Zahlung 5eed0ad0 ueber 30,00 EUR ist erfolgreich, aber nicht im Ledger", "Haengende Zahlungen: 1 Zahlung(en)"; die Alarme sind vom Monat unabhaengig (Oktober zeigt dieselben drei). | admin_desktop_finanzen_extra-vormonat.png | clarify |
| AD-FI-3 | P1 | Kennzahlen widersprechen einander: Ausgaben-Seite fuehrt 192,50 EUR, hier "Hallenkosten 0,00 EUR"; "Gespielte Spiele 1" (Oktober: 2) neben "Keine Spiele mit Buchungen in diesem Monat"; Marge 0,00 EUR erscheint orange wie eine Warnung. | admin_desktop_finanzen.png | critique, audit |
| AD-FI-4 | P2 | Monatswahl braucht Feld plus "Anzeigen" (kein Vor und Zurueck); CSV-Knopf "CSV fuer 2026-11" im ISO-Format. | admin_desktop_finanzen.png | adapt |
| AD-FI-5 | P2 | Neun Kacheln gleicher Gewichtung mit 12-px-Beschriftung; Beschriftung "Einnahmen (netto nach Erstattungen)" bricht den Kopf der Kachel. | admin_desktop_finanzen.png | distill |

##### /admin/finanzen/ausgaben (Admin, Desktop)
Beleg: admin_desktop_finanzen-ausgaben.png (1394 px), _extra-betrag-ungueltig, _extra-ausgabe-gebucht
Bewertung: Klares Formular und klare Liste mit Summe. Die Fehlermeldung ist gut ("Bitte einen Betrag in Euro angeben, z. B. 80,00."), aber eine Ausgabe laesst sich nie korrigieren. Ausgaben (Hallenmiete, Werbung) koennen fuer ein Kartenmodell bleiben; der Verweis auf Spiel-Finanzen gehoert zum Altmodell.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 9] AD-FA-1 |
| audit | [Forms, A11y] Labels vorhanden; Platzhalter-Kontrast 4,1:1 (X-16) |
| distill | [Redundancy] AD-FA-2 |
| clarify | [Success, Jargon] AD-FA-3, AD-FA-4 |
| adapt | [Desktop: Tabelle] Liste ohne Filter: AD-FA-3 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen/ausgaben`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/finanzen/ausgaben`: 0 Funde (Ordner finanzen als Ganzes: 0) |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-FA-1 | P1 | Fehlbuchungen sind nicht korrigierbar: kein Bearbeiten, Stornieren oder Loeschen; die Testausgabe "Analyse-Test 12,50 EUR" blieb dauerhaft in der Liste und in der Summe. | admin_desktop_finanzen-ausgaben_extra-ausgabe-gebucht.png | critique |
| AD-FA-2 | P2 | Art "Hallenmiete" ist vorbelegt, obwohl ohne Spielzuordnung; "Bezahlt am" leer (still heute); Beleg-Link ohne Pruefung; Datum in der Liste ISO. | admin_desktop_finanzen-ausgaben.png | clarify |
| AD-FA-3 | P2 | Erfolg lautet nur "Gespeichert." (orange, Kontrast knapp) statt "Ausgabe gebucht"; Liste ohne Filter nach Art oder Summe je Art. | admin_desktop_finanzen-ausgaben_extra-ausgabe-gebucht.png | clarify |
| AD-FA-4 | P2 | Buchhaltungsjargon "Ausgabe buchen" fuer eine einfache Erfassung; Text "Hallenmiete: Hallenmiete Seed-Halle Nord" doppelt in der Zeile. | admin_desktop_finanzen-ausgaben.png | clarify |

##### /admin/finanzen/spiel/ID (Admin, Desktop)
Beleg: admin_desktop_finanzen-spiel-ID.png (1120 px; Direktaufruf mit Seed-Spiel-ID, die Finanzseite verlinkt bei leerem Hauptbuch auf kein Spiel). Zusatzaufnahme `_extra-erste-spielseite` entfiel: keine Links vorhanden (0).
Bewertung: Altmodell-Seite (Einnahmen, Spielerzahlungen, Ausnahme-Erstattung, Buchungen) bei leerem Hauptbuch fast leer: "Niemand hat bezahlt.", leere Ueberschrift "Buchungen". Fuer das Kartenmodell zu entfernen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 5, 9] AD-FS-1 bis AD-FS-3 |
| audit | [Forms] Labels vorhanden; Erstattungsformular nur im Quelltext geprueft |
| distill | [Remove] AD-FS-1 |
| clarify | [Jargon] "Status confirmed", leere Ueberschrift: AD-FS-2 |
| adapt | [Desktop] AD-FS-4 |
| detect URL | nicht moeglich ohne Sitzung (ID-URL); `detect` per URL fuer die Eltern-Seite siehe /admin/finanzen |
| detect Quelltext | `detect --json "src/app/admin/finanzen/spiel/[id]"` (Teil des Ordners finanzen): 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-FS-1 | P1 | MUSS WEG: Kachel "Einnahmen/Hallenkosten/Marge", "Spieler: bezahlt ... zurueck ... netto", "Ausnahme-Erstattung buchen", "Buchungen" mit "(debit an credit)", Typen Aufladung, Gebuehr, Bonus, Startgebuehr, Rueckbuchung. | admin_desktop_finanzen-spiel-ID.png | distill |
| AD-FS-2 | P1 | Rohtext "Status confirmed" (englisch); Abschnitt "Buchungen" ohne Inhalt und ohne Leerzustand; "Hallenpreis 80,00 EUR, Kosten laut Regel 70,00 EUR, Anteil 8,00 EUR" ohne Erklaerung. | admin_desktop_finanzen-spiel-ID.png | clarify |
| AD-FS-3 | P1 | Quelltext: "Ausnahme-Erstattung buchen" erstattet beim Absenden sofort ("Erstattet."), Betrag mit dem vollen Nettobetrag vorbelegt, keine Bestaetigungsstufe; nicht ausgeloest, weil bei leerem Hauptbuch nicht angezeigt. Vertrag 009/012: Erstattung nur Admin 1. | admin_desktop_finanzen-spiel-ID.png | critique |
| AD-FS-4 | P2 | Seite von der Finanzuebersicht aus nicht erreichbar (keine Links bei leerem Hauptbuch); Ueberschrift ohne Spielnummer; Brotkrume "Finanzen / Spiel". | admin_desktop_finanzen-spiel-ID.png | adapt |

##### /admin/buchungen (Admin, Desktop)
Beleg: admin_desktop_buchungen.png (2632 px), _extra-speichern-unveraendert
Bewertung: Funktionierende Arbeitsliste, aber jede der fuenf Karten ist ein 420-px-Formular, es gibt keinen Ueberblick und keine Sortierung. Der Einleitungstext und die Zeilen gehoeren teilweise zum Altmodell.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 6, 7] AD-BU-1, AD-BU-2, AD-BU-5 |
| audit | [Forms] Labels vorhanden |
| distill | [Progressive disclosure] AD-BU-2 |
| clarify | [Jargon, Status] AD-BU-3, AD-BU-4 |
| adapt | [Desktop] AD-BU-2 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/buchungen`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/buchungen`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-BU-1 | P1 | Altmodell-Texte: "Bestaetigte und bezahlte Spiele brauchen eine Halle ...", "Die Kosten buchst du unter Finanzen", "Spieler zahlen 80,00 EUR", "Halle kostet 70,00 EUR", Link "Finanzen zu diesem Spiel" (siehe MUSS WEG). | admin_desktop_buchungen.png | clarify |
| AD-BU-2 | P1 | Jeder Auftrag mit vollem Formular (Status, Halle, Notiz, Nachweis, Speichern); keine Sortierung nach Anstoss, kein Filter nach Status, keine Zaehlung ("3 offen"), erledigte und offene vermischt; die Seite wird mit mehr Auftraegen unbenutzbar. | admin_desktop_buchungen.png | distill, adapt |
| AD-BU-3 | P2 | Statusauswahl zeigt nur erlaubte Uebergaenge (Zeile "In Arbeit": In Arbeit, Gebucht, Von der Halle bestaetigt), ohne Erklaerung, warum "Offen" fehlt; Zurueck nicht moeglich. | admin_desktop_buchungen.png | clarify |
| AD-BU-4 | P2 | Titel: Menue "Buchungen", Ueberschrift "Hallen-Buchungen", Tab "Admin: Buchungen"; Status-Etikett oben rechts 12 px grau; Erfolg "Gespeichert." orange. | admin_desktop_buchungen_extra-speichern-unveraendert.png | clarify |
| AD-BU-5 | P1 | Hallenanfragen (11) und Veto-Hallen (5) aus dem Seed haben im Admin keine Seite (siehe AD-ALL-12): Auftraege entstehen, aber die Anfragen, aus denen sie folgen, sind nicht einsehbar. | admin_desktop_buchungen.png | critique |

##### /admin/hallen (Admin, Desktop)
Beleg: admin_desktop_hallen.png (4053 px), _extra-preis-ungueltig, _extra-deaktiviert-ohne-rueckfrage
Bewertung: Die Seite ist am schwersten bedienbar: pro Halle vier Formulare, 3 ganzbreite Knoepfe und ein zerquetschtes Betreiber-Feld. Preisregeln mit "Spieler zahlen", "Halle kostet uns" und "Marge" gehoeren zum Altmodell.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 5, 8] AD-HA-1 bis AD-HA-3 |
| audit | [Responsive, Forms] Betreiber-Feld auf etwa 40 px: AD-HA-1 |
| distill | [Remove] AD-HA-4 |
| clarify | [Labels] "Halle kostet uns" Ich-Perspektive: AD-HA-2 |
| adapt | [Desktop] AD-HA-1, AD-HA-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/hallen`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/hallen`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-HA-1 | P0 | "Betreiber zuweisen/aendern" ist in allen fuenf Hallenkarten unbrauchbar gesetzt: das Label "Betreiber (E-Mail des Kontos)" bricht auf etwa 60 px Breite in vier Zeilen, das E-Mail-Feld ist nur etwa 40 px breit ("halle"), der Knopf nimmt den Rest (gleiches Muster wie X-01, flex-Zeile mit Knopf). Eine E-Mail ist so nicht lesbar oder pruefbar einzugeben. | admin_desktop_hallen.png | adapt, critique |
| AD-HA-2 | P1 | Altmodell (siehe MUSS WEG): Standardpreise und Preisregeln "Spieler zahlen (Euro)", "Halle kostet uns (Euro)", "Marge", Liste "Spieler 85,00 EUR, Kosten 65,00 EUR, Marge 20,00 EUR". | admin_desktop_hallen.png | clarify, distill |
| AD-HA-3 | P1 | "Deaktivieren" (ganzbreit, nur umrandet) wirkt sofort, ohne Rueckfrage; die Meldung "Gespeichert." steht am Kartenende, die Karte aendert sich kaum; "Aktivieren" ist ein orangefarbener Hauptknopf. Deaktivieren trifft laufende Buchungen. | admin_desktop_hallen_extra-deaktiviert-ohne-rueckfrage.png | clarify |
| AD-HA-4 | P2 | 330 px je Halle mit vier Formularen immer offen; fuenf Hallen ergeben 4053 px; kein Filter (Stadt, ungeprueft, inaktiv); Preisregel-Formular mit Platzhaltern 80,00 (Kontrast 4,1:1) in jeder Karte. | admin_desktop_hallen.png | distill |
| AD-HA-5 | P2 | Preisfehler "Preis und Kosten bitte in Euro angeben, z. B. 80,00." steht in einer Halbspalte neben dem Knopf; Regeldatum ISO ("ab 2026-11-06"). | admin_desktop_hallen_extra-preis-ungueltig.png | clarify |
| AD-HA-6 | P2 | Zustand ("aktiv", "Partnerhalle", "inaktiv", "Ungeprueft") als 12-px-Text in drei Farben, der Hinweis "Ungeprueft: Angaben stammen aus OpenStreetMap" 12 px. | admin_desktop_hallen.png | typeset |

##### /admin/codes (Admin, Desktop)
Beleg: admin_desktop_codes.png (1509 px), _extra-wert-ungueltig
Bewertung: Ganze Seite ist Altmodell und soll entfernt werden (Aufladung, Bonus, Budget); gut gebaut, aber ohne Nutzen. Befunde nur der Vollstaendigkeit halber.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4] AD-CO-1 |
| audit | [Forms] Labels vorhanden |
| distill | [Remove] ganze Seite: AD-CO-1 |
| clarify | [Terminologie] AD-CO-3 |
| adapt | [Desktop] keine Funde ausser AD-ALL-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/codes`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/codes`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-CO-1 | P1 | MUSS WEG: ganze Seite `/admin/codes` ("Rabattcodes", "Prozent der Aufladung", "Mindestaufladung", "Hoechstbonus", "Gesamtbudget", "Nur fuer die erste Aufladung", "Verbraucht ... von ...", PromoToggle); Vorgabe: keine Promo-Codes. | admin_desktop_codes.png | distill |
| AD-CO-2 | P2 | Code "SEEDNEU20" mit Ablauf 01.11. steht als "aktiv" (Ablauf ignoriert); "Deaktivieren" ohne Rueckfrage. | admin_desktop_codes.png | clarify |
| AD-CO-3 | P2 | Menue "Codes", Titel "Rabattcodes", Seed-Protokoll "promo.create": drei Namen fuer eine Sache; Fehler "Bitte einen gueltigen Wert eingeben." ohne Feldbezug. | admin_desktop_codes_extra-wert-ungueltig.png | clarify |

##### /admin/protokoll (Admin, Desktop)
Beleg: admin_desktop_protokoll.png (3208 px), _extra-filter-nutzer, _extra-vorher-nachher-offen, _extra-leer
Bewertung: Das Protokoll ist die Grundlage fuer Nachvollziehbarkeit, aber in Entwicklersprache: Aktionscodes, gekuerzte IDs, JSON. Ein Mensch kann daraus nicht schnell lesen, wer was warum gemacht hat.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 6, 10] AD-PR-1, AD-PR-2 |
| audit | [A11y] `details/summary` per Tastatur bedienbar; JSON in `pre` mit Scroll: kein Fund |
| distill | [Redundancy] AD-PR-2 |
| clarify | [Jargon] AD-PR-1, AD-PR-3, AD-PR-5 |
| adapt | [Desktop: Tabelle] AD-PR-4 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/protokoll`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/protokoll`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-PR-1 | P1 | Eintraege in Rohsprache: "comment.remove_and_warn", "setting.change · setting emergenc" (Schluessel abgeschnitten), "match 5eed0ad0"; keine Namen (Nutzer, Team, Halle), kein Link zum Objekt, kein Grund (Vertrag 009 AC-8: wer, wann, was, warum). | admin_desktop_protokoll.png | clarify |
| AD-PR-2 | P1 | "Vorher und nachher" zeigt zwei vollstaendige Datensaetze als JSON (rund 40 Zeilen je Eintrag); der Unterschied (zum Beispiel `active: false` auf `true`) ist nicht hervorgehoben. | admin_desktop_protokoll_extra-vorher-nachher-offen.png | distill |
| AD-PR-3 | P2 | Filter "Objekt" bietet nur user, team, match, match_request, im Protokoll stehen auch venue, sponsor, league, pro_event, comment, expense, setting; "Aktion beginnt mit" ist Freitext in Entwicklersprache. | admin_desktop_protokoll_extra-filter-nutzer.png | clarify |
| AD-PR-4 | P2 | Keine Datumsfilter, kein Export, "Seite 1 / Weiter" ohne Gesamtzahl; Zeit ohne Jahr; Akteur "System" unerklaert. | admin_desktop_protokoll_extra-vorher-nachher-offen.png | adapt |
| AD-PR-5 | P2 | Leerzustand "Keine Eintraege." ohne Weg zurueck; Menue "Protokoll", Titel "Aenderungsprotokoll". | admin_desktop_protokoll_extra-leer.png | clarify |

##### /admin/einstellungen (Admin, Desktop)
Beleg: admin_desktop_einstellungen.png (836 px), _extra-mindestzahl-ungueltig, _extra-gespeichert-unveraendert
Bewertung: Kurz und klar aufgebaut, aber zwei von drei Einstellungen und der Hinweis zum Zahlungsanbieter sind Altmodell (Guthaben, Anteil, Stripe-Block); nur die Notfallnummer bleibt.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 5, 9] AD-EI-1, AD-EI-3 |
| audit | [Forms] Labels vorhanden; Checkbox nur etwa 13 px sichtbar |
| distill | [Remove] AD-EI-1 |
| clarify | [Hilfetexte] AD-EI-2, AD-EI-5 |
| adapt | [Desktop] keine Funde ausser X-17 |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/admin/einstellungen`: nur overused-font (gesetzt), kein Fund |
| detect Quelltext | `detect --json src/app/admin/einstellungen`: 0 Funde |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AD-EI-1 | P1 | MUSS WEG: "Zahlungen einschalten ... zahlt seinen Anteil aus dem Guthaben", "Mindestzahl zahlender Spieler" (Anteil), "Zahlungsanbieter: Stripe (Karte, PayPal, SEPA)". Hinweis: Vertrag 012 legt Stripe als Zielmodell fest; dieser Fund folgt der Vorgabe des Auftrags und braucht eine Klaerung. | admin_desktop_einstellungen.png | distill |
| AD-EI-2 | P2 | Fuer Nicht-Stripe-Betrieb steht im Quelltext ein Betriebshinweis mit Schluesselnamen (`STRIPE_SECRET_KEY` ...) und Dokupfad in der Admin-Oberflaeche. | admin_desktop_einstellungen.png | clarify |
| AD-EI-3 | P1 | Der Schalter "Zahlungen einschalten" aendert das Plattformverhalten und liegt im selben Formular wie die Notfallnummer, ohne Rueckfrage und ohne Hinweis auf Auswirkung; die Checkbox ist visuell klein. | admin_desktop_einstellungen.png | critique |
| AD-EI-4 | P2 | Mindestzahl-Fehler ("liegt zwischen 2 und 12") ist klar, wird aber nur nach Absenden gezeigt (Browserpruefung per `min` vorhanden); Notfallnummer ohne Formatpruefung. | admin_desktop_einstellungen_extra-mindestzahl-ungueltig.png | clarify |
| AD-EI-5 | P2 | Hilfetexte 12 px (3 Absaetze), Erfolgsmeldung "Gespeichert." orange (AD-ALL-5). | admin_desktop_einstellungen_extra-gespeichert-unveraendert.png | typeset |



### Fundblatt Admin, Handy

Stand: Dev-Server Port 3102, Konto `seed-admin@test.local`, Basis-Seed plus Admin-Seed. Nur gelesen, gemessen und bedient; kein Quelltext geaendert. Richtung E (Trikot), URLs und Test-IDs bleiben. Funde des Desktop-Blatts (`AD-...`) und der Analyse X (`X-01` bis `X-20`) werden nur referenziert; handy-spezifisch neu bewertet steht als `AM-...`.

#### Methode und Grenzen

- Die fuenf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md`, `distill.md`, `clarify.md`, `adapt.md`) wurden zu Beginn vollstaendig gelesen. Sie haben keinen Launcher-Befehl und liefen manuell; je Durchgang steht der angewandte Teil in eckigen Klammern. `critique` bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher `.claude/skills/impeccable/scripts/impeccable context`) lief einmal: PRODUCT.md geladen (web, Admin arbeitet am Desktop, Kartenmodell Vertrag 012).
- `detect --json --viewport 390x844 <URL>` lief fuer alle 15 Admin-URLs ohne Timeout (Exit 2). Per URL ohne Sitzung sieht der Detektor die Anmeldeseite: genau zwei Treffer, `straggler` ("noetig." allein in der letzten Zeile, X-13) und `overused-font` (Plus Jakarta Sans, in DESIGN.md gesetzt); keine Admin-Funde. Die 16. Seite (Spiel-Finanzen) hat eine ID-URL: nicht per URL moeglich. `detect --json --viewport 390x844` gegen den Quelltext (`src/app/admin` als Ganzes und alle 14 Seitenordner): je Exit 0, `[]`.
- Gemessen (Playwright, Chromium, `isMobile` + `hasTouch`, 390x844, `metrics-mobil.json`, `m-measure.json`): horizontaler Ueberlauf auf allen 16 Seiten nein (`scrollWidth` 390), 0 Konsolenfehler. Admin-Navigation: 14 Links, je 32 px hoch, 66 bis 89 px breit, vier Zeilen (rund 150 px), ohne `aria-current`. Feste untere Navigation 57 px (y 787 bis 844) und sticky Kopfleiste auf jeder Seite.
- Nicht belegbar mit dieser Methode: echte Bildschirmtastatur (Emulation hat keine), Safari/iOS (nur Chromium), echte Daumenreichweite, Download der CSV am Handy. Native `confirm`/`prompt` sind nicht fotografierbar; Text steht im Protokoll (Abbrechen = nichts passiert).
- Ganzseitige Bilder zeigen die feste untere Navigation und die sticky Kopfleiste mitten im Bild und das runde N / "1 Issue" (Next-Overlay): Aufnahme-Artefakte, kein Fund. Das "1 Issue" im Bild `einstellungen_extra-mindestzahl-ungueltig` entstand durch das Entfernen des `min`-Attributs fuer den Test.
- Nicht ausgeloest: echte Ausnahme-Erstattung (kein Knopf bei leerem Hauptbuch), "Saison beenden", "Jetzt auslosen", "Absagen", "Zusammenfuehren" (nur bis zur Rueckfrage, abgebrochen), CSV-Download.
- Beobachtung (kein Fund): die Moderations-Warteschlange zeigt 5 Eintraege, der Seed nennt 7 offene Meldungen; Abweichung nicht geklaert (moeglich: Zaehlung nach Meldungen statt nach Kommentaren).

#### Geaenderte Daten (vorher / nachher)

| Aktion | Vorher | Nachher |
|---|---|---|
| Nutzer "Anton Testmann" sperren (Grund per Prompt "Analyse-Test Sperrgrund"), danach "Entsperren" in der Liste "nur gesperrte" traf zuerst "Sven Gesperrt"; danach Anton entsperrt und Sven mit Grund "Seed-Sperre" wieder gesperrt | Anton nicht gesperrt, Sven gesperrt (Seed-Grund) | Anton nicht gesperrt, Sven gesperrt, Sperrgrund jetzt "Seed-Sperre"; Protokoll hat mehrere `user.ban`/`user.unban`-Eintraege |
| Rolle "Paulo Testmann" auf Finanzen, sofort zurueck | Spieler | Spieler (zwei `user.role`-Eintraege) |
| Moderation: "Wieder anzeigen" (Rafael Testmann) | 5 Eintraege | 4 Eintraege (Eintrag aus Warteschlange) |
| Moderation: "Entfernen und verwarnen" (Gerd Gewarnt) | 4 Eintraege, Verwarnungen 3 | 3 Eintraege, Verwarnungen 4 |
| Sponsoren: erst "Seed Altpartner KG", dann (nach Umsortierung, Fehlklick) "Seed Sport GmbH" pausiert | beide aktiv | beide per Skript wieder aktiviert (Zustand geprueft: aktiv) |
| Halle "Seed-Halle West" deaktiviert, wieder aktiviert | aktiv | aktiv |
| Ausgabe "Analyse-Test" 12,50 Euro (Hallenmiete) gebucht | 5 Ausgaben (eine Analyse-Ausgabe aus dem Desktop-Durchlauf) | 6 Ausgaben, 217,50 Euro; im Hauptbuch steht jetzt ein Eintrag (`venue_cost`), der CSV-Export hat eine Zeile (nicht loeschbar, AD-FA-1) |
| Buchungsauftrag und Einstellungen unveraendert gespeichert | - | gleiche Werte, je ein moeglicher Protokolleintrag |
| Fehlerformulare (Liga, Profi-Tag, Sponsor, Preisregel, Code, Ausgabe, Mindestzahl) | - | abgelehnt, nichts gespeichert |
Rueckgaengig nur per Seed-Neuaufruf; Ausnahmen: die Ausgabe/Hauptbuch-Zeile und die Protokolleintraege.

#### Zaehler

- Angesehen: 59 von 59 Screenshots (16 Seitenbilder `admin_mobil_<seite>.png` + 43 Zusatzaufnahmen `admin_mobil_<seite>_extra-<name>.png`), je Bild einzeln mit Read geoeffnet. Sehr lange Bilder (Nutzer 7032 px, Hallen 4593 px, Protokoll 3460 px, Nutzer-Zusatzlisten 5100 bis 5300 px) wurden verkleinert gesehen; dort stuetzen sich die Funde zusaetzlich auf Ausschnitte (`nutzer_extra-anfang`, `nutzer_extra-mitte`, `hallen_extra-betreiber-ausschnitt`, `ligen_extra-datumsfelder-ausschnitt`), Messung und Quelltext. Der Zusatz `nutzer_extra-sperren-prompt` aus dem ersten Skriptlauf scheiterte (Suche ohne Treffer) und wurde im zweiten Lauf nachgeholt; `uebersicht_extra-aufgabe-geoeffnet` zeigt die Spielerseite des Streitfalls.
- Durchgaenge: je Seite critique, audit, distill, clarify, adapt als eigene Zeilen (16 Seiten x 5), dazu `detect` je URL (15) und gegen den Quelltext (alle 14 Ordner plus Gesamtordner): alle gelaufen.
- Funde (Erstnennung `AM-...`, ohne Verweise): P0 0, P1 23, P2 21, gesamt 44. Dazu eine Verweiszeile: AD-HA-1 (P0, Hallen Betreiber-Zeile) am Handy mit 61 px bestaetigt.

#### Admin am Handy: sinnvoll bedienbar?

Kurzurteil: lesbar und im Notfall bedienbar, aber nicht fuer die tägliche Arbeit gebaut. Ohne horizontalen Ueberlauf und mit klaren Karten stehen die Seiten sauber untereinander. Es kippen drei Dinge: die Hallen-Betreiberzeile (unlesbar, 61 px), abgeschnittene Datums- und Auswahlfelder, und alle schnellen Aktionen ohne Rueckfrage sitzen 8 px neben harmlosen Knoepfen. Sinnvoll am Handy waeren nur: Uebersicht-Aufgaben (Streitfall entscheiden), Moderation, Nutzer sperren, Protokoll lesen. Hallen, Preise, Ligen, Profi-Tage, Finanzen und Einstellungen sind Desktop-Arbeit (PRODUCT.md). Festlegung noetig: AM-ALL-9.

#### Seitenuebergreifende Admin-Funde (Handy)

Beleg-Dateien: alle `admin_mobil_*.png`; Messung: `m-measure.json`.

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-ALL-1 | P1 | 14-Punkte-Navigation bricht in vier Zeilen um (rund 150 px, 32 px hohe Ziele) und steht oberhalb der Ueberschrift; sie ist nicht fest, nach dem Scrollen (Nutzer 7032 px) fehlt jeder Weg zu anderen Admin-Bereichen ausser Hochscrollen; kein Punkt markiert (kein `aria-current`). Handy-neu gegenueber AD-ALL-1: Scrollverhalten und Zielgroesse. | admin_mobil_nutzer.png, admin_mobil_uebersicht.png | adapt [Navigation Strategy], critique [Heuristik 1, Cognitive Load] |
| AM-ALL-2 | P1 | Feste untere Spieler-Navigation (Teamspiel, Privatspiel, "Spiel suchen" gross orange, Turniere, Profil) steht auf jeder Admin-Seite, 57 px hoch; sie bietet nichts fuer Admin, der groesste Knopf der Seite ist "Spiel suchen". Sie deckt untere Bildkante ab (Meldungen und letzte Knoepfe liegen dahinter). Siehe X-06, X-17. | admin_mobil_spiele.png | critique [Heuristik 8], adapt |
| AM-ALL-3 | P1 | Spieler-Fusszeile (13 Links, vier Zeilen) beendet jede Admin-Seite (X-07, AD-ALL-6); am Handy rund 250 px; im Konto-Menue stehen "Guthaben 0,00 EUR" und "Mein Bereich" (MUSS WEG Guthaben). | admin_mobil_uebersicht_extra-konto-menue.png | critique, distill |
| AM-ALL-4 | P1 | Karten statt Tabellen sind am Handy richtig und laufen ohne Ueberlauf, aber ohne Verdichtung: Nutzer 7032 px (25 Zeilen, je rund 270 px), Hallen 4593 px, Spiele 3439 px, Protokoll 3460 px, Buchungen 3080 px; keine Gruppierung, keine Sprungmarken, Seitenwechsel nur am Listenende. Ergaenzt AD-ALL-4. | admin_mobil_nutzer.png, admin_mobil_hallen.png | adapt [Tables to cards, Progressive disclosure], distill |
| AM-ALL-5 | P1 | Zielgroessen am Handy gemessen: Ziele unter 44 px: Nutzer 115 von 118, Teams 44 von 46, Moderation 28 von 28, Protokoll 36 von 40, Spiele 48 von 51. Unter 24 px (WCAG 2.5.8 AA): Protokoll-Aufklapper "Vorher und nachher" 21x (16 px hoch), Moderation "Zur Seite" (15 px), Teams-Namenslinks (21 px), Finanzen "Ansehen" (18 px), Buchungen "Finanzen zu diesem Spiel" 5x (18 px), Ausgaben "Beleg" (15 px), Checkboxen 13 px (Ligen, Einstellungen) und 20 px (Hallen, Nutzer, Codes). Ergaenzt AD-ALL-10. | admin_mobil_protokoll.png, admin_mobil_moderation.png | audit [Responsive: Touch targets] |
| AM-ALL-6 | P1 | Gefaehrliche Aktionen sitzen mit 8 px Abstand neben harmlosen: Nutzer "Profi-Badge geben | Sperren", Moderation "Wieder anzeigen | Entfernen" und darunter "Entfernen und verwarnen", Hallen "Betreiber zuweisen" ueber "Deaktivieren"; mit dem Daumen leicht verfehlt; dazu kein Rueckgaengig (AD-ALL-3). | admin_mobil_nutzer_extra-anfang.png, admin_mobil_moderation.png | adapt [Interaction Strategy], clarify [Destruktive Aktionen] |
| AM-ALL-7 | P2 | Natives `prompt`/`confirm` am Handy (Sperrgrund, Zusammenfuehren, Saison beenden, Auslosen, Absagen): Systemdialog ohne Gestaltung, Grund muss ueber die Bildschirmtastatur getippt werden; Abbrechen tut still nichts (AD-NU-2, AD-ALL-3). Bildschirmtastatur nicht getestet. | admin_mobil_nutzer_extra-sperren-prompt-abgebrochen.png | clarify, adapt |
| AM-ALL-8 | P2 | Rueckmeldung steht unter dem Knopf am Formularende; bei langen Karten (Hallen, Buchungen) liegt sie ausserhalb des Sichtfensters, nach Zeilen entfernenden Aktionen (Moderation, Sponsoren pausieren) springt die Liste ohne Meldung (AD-ALL-5). Erfolg "Gespeichert." in Orange 12 bis 14 px. | admin_mobil_hallen_extra-deaktiviert-ohne-rueckfrage.png, admin_mobil_finanzen-ausgaben_extra-ausgabe-gebucht.png | clarify [Success, Errors] |
| AM-ALL-9 | P1 | Klaerung: Welche Admin-Aufgaben sollen am Handy gehen? Vorschlag: Aufgaben der Uebersicht (Streitfall), Moderation, Nutzer sperren, Protokoll lesen; alles andere Desktop. Heute sind alle 14 Bereiche gleich angeboten, darunter unbrauchbare (Hallen Betreiber, Ligen Datumsfelder). | admin_mobil_hallen.png | critique [Persona Casey], distill |
| AM-ALL-10 | P2 | Gemeinsames Formular-Raster: viele Zwei-Spalten-Felder (Ligen drei Spalten, Profi-Tag, Sponsoren, Hallen, Codes) ohne Breakpoint (`grid-cols-2/3`) kappen Werte von `select` und `date`; Muster im Quelltext (`grid grid-cols-3 gap-3` in `ligen/page.tsx`). Einzelfunde siehe AM-LI-1, AM-PT-1, AM-SN-2, AM-HA-4, AM-CO-1. | admin_mobil_ligen_extra-datumsfelder-ausschnitt.png | adapt [Layout Adaptation], audit [Responsive] |

#### Seiten

##### /admin (Admin, Handy)
Beleg: admin_mobil_uebersicht.png (1221 px, 22 von 50 Zielen klein, kein Ueberlauf, 0 Konsolenfehler), admin_mobil_uebersicht_extra-tastaturfokus.png, admin_mobil_uebersicht_extra-aufgabe-geoeffnet.png, admin_mobil_uebersicht_extra-konto-menue.png
Bewertung: Ruhig und gut lesbar, zwei Aufgabenkarten und vier sichtbare Kacheln in zwei Spalten; vor der Ueberschrift "Admin" liegen 150 px Navigation. Der Streitfall laesst sich am Handy bis zur "Plattform-Entscheidung" (Spielstand, Pflichtbegruendung, "Endgueltig entscheiden") durchklicken: die Aufgabenkarte funktioniert.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Casey, Alex] Funde AM-UE-1, AM-UE-2; AM-ALL-1, AM-ALL-2 |
| audit | [Responsive, A11y] Kein Ueberlauf, 14 von 16 Zielen unter 44 px: AM-ALL-5 |
| distill | [Remove redundancy] Zwei gleichwertige Aufgaben, sechs Kacheln: AM-UE-2 |
| clarify | [Labels] "Unzugestellte Meldungen" siehe AD-UE-2; Aufgabentext mit Uhrzeit und "seit ueber 6 Stunden" gut |
| adapt | [Mobile: Navigation, Layout] AM-ALL-1, AM-ALL-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite, straggler und overused-font (gesetzt), kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin` (page.tsx, layout.tsx): Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-UE-1 | P2 | Aufgabenkarte "Streitfall" fuehrt auf die Spielerseite; dort steht oben rechts rot "Live" an einem Spiel vom Vortag, und die Admin-Entscheidung beginnt erst nach rund 600 px (Ergebnisbild, Stream-Aufklapper, Hinweis). Der Weg zurueck zu "Admin" ist nur der Browser-Zurueck. Klaert AD-UE-3 (Entscheidung am Handy moeglich). | admin_mobil_uebersicht_extra-aufgabe-geoeffnet.png | critique [Heuristik 1, 3] |
| AM-UE-2 | P2 | Aufgabenkarten und Kacheln nicht als Links erkennbar (keine Pfeile); Kacheln "Nutzer 42", "Teams 9" ohne Link (AD-UE-2); 14 von 16 Zielen klein. Tastaturfokus im Bild `_extra-tastaturfokus` nicht erkennbar (nach sechs Tab-Schritten kein Ring im Sichtfeld; nicht belegt). | admin_mobil_uebersicht_extra-tastaturfokus.png | distill, audit |

##### /admin/spiele (Admin, Handy)
Beleg: admin_mobil_spiele.png (3439 px, 56 von 85 Zielen klein), _extra-filter-strittig, _extra-leer, _extra-seite2
Bewertung: Brauchbare Liste mit 17 Karten untereinander; Team und Status sind filterbar, die Zeile zeigt Zeit, Status und Halle als ein grauer Satz. Es fehlen Admin-Eingriffe, Ergebnis und Sortierung (AD-SP-1/2).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 6; Persona Casey] AM-SP-1 |
| audit | [Responsive] Platzhalter 4,1:1 (X-16), Ziele 48 von 51 unter 44: AM-ALL-5 |
| distill | [Information architecture] Zwei gleich starke Knoepfe je Zeile (AD-SP-3) |
| clarify | [Empty states] "Keine Spiele gefunden." ohne Zurueck zum Filter: AD-SP-4 |
| adapt | [Mobile: Tabellen zu Karten] AM-SP-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/spiele`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/spiele`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-SP-1 | P1 | Status steht nur als Wort im grauen Satz ("Strittig" sieht aus wie "Gespielt"), bricht mitten im Hallennamen um ("Seed-/Halle Nord"); eine Karte ist 112 px hoch, Knoepfe "Lobby" und "Spiel" 36 px mit 8 px Abstand. Ergaenzt AD-SP-2/3. | admin_mobil_spiele.png | critique, adapt |
| AM-SP-2 | P2 | Filterkarte (rund 230 px: Team, Status, ganzbreiter orange Knopf) belegt den ersten Bildschirm; Filterergebnis "Strittig" erscheint unter der Karte (Beleg), der Knopf "Filtern" ist der groesste der Seite. Seite 2 zeigt "Keine Spiele gefunden." mit "Zurueck" links und "Seite 2" in der Mitte (AD-SP-4). | admin_mobil_spiele_extra-filter-strittig.png | adapt, clarify |

##### /admin/nutzer (Admin, Handy)
Beleg: admin_mobil_nutzer.png (7032 px, 123 von 152 Zielen klein; verkleinert gesehen), _extra-anfang, _extra-mitte, _extra-suche, _extra-nur-gesperrt, _extra-leer, _extra-seite2, _extra-sperren-prompt-abgebrochen, _extra-nach-sperre, _extra-gesperrte-liste, _extra-nach-entsperren, _extra-rolle-geaendert-ohne-rueckfrage
Bewertung: Wichtigste und am Handy schwaechste Seite: 25 Karten mit Rolle, zwei bis drei Knoepfen und Veranstalter-Zeile, 7032 px lang. Suche, Rollenfilter und "Nur gesperrte" funktionieren gut und liegen oben; Gesperrt-Etikett ist klar. Alle Aktionen wirken sofort.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 5, 7; Persona Casey, Riley] AM-NU-1, AM-NU-2, AM-NU-3 |
| audit | [Responsive, A11y] 115 von 118 Zielen unter 44 px, 27 Texte mit 12 px (Veranstalter-Knopf): AM-ALL-5, AM-NU-1 |
| distill | [Interaction, Progressive disclosure] Detailansicht statt drei Knoepfe je Zeile: AM-NU-1 |
| clarify | [Destruktive Aktionen] Sperren per Prompt, Entsperren ohne Rueckfrage: AM-NU-3, AM-ALL-7 |
| adapt | [Mobile: Listen] Sprungmarke, Seitenwechsel: AM-NU-4 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/nutzer`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-NU-1 | P1 | Eine Nutzerkarte ist rund 270 px hoch: Name, E-Mail (zwei bis drei Zeilen), Rollen-Auswahl, "Profi-Badge", "Sperren", dritter Knopf "Als Turnier-Veranstalter freischalten" in 12 px; 115 von 118 Zielen unter 44 px, ein Checkbox-Ziel 20 px. Ergaenzt AD-NU-3 (Handy dreifache Laenge). | admin_mobil_nutzer_extra-anfang.png, admin_mobil_nutzer_extra-mitte.png | distill, adapt |
| AM-NU-2 | P1 | Die Rollen-Auswahl liegt direkt unter dem Namen im Scrollweg: auf dem Handy oeffnet ein Tipp das System-Auswahlfeld, und das Waehlen eines Eintrags schreibt sofort (onChange, keine Rueckfrage); beim Test wurde Paulo Testmann auf "Finanzen" gesetzt ohne Meldung. Handy-Verschaerfung von AD-NU-1. | admin_mobil_nutzer_extra-rolle-geaendert-ohne-rueckfrage.png | clarify, critique |
| AM-NU-3 | P1 | "Sperren" (dunkel umrandet) sitzt 8 px neben "Profi-Badge geben"; Sperrgrund per `prompt` und Bildschirmtastatur; "Entsperren" ohne Rueckfrage, in "Nur gesperrte" stehen zwei gleiche Knoepfe untereinander und der Tipp traf beim Test die erste (falsche) Zeile. Ergaenzt AD-NU-2, AM-ALL-6. | admin_mobil_nutzer_extra-gesperrte-liste.png, admin_mobil_nutzer_extra-sperren-prompt-abgebrochen.png | clarify |
| AM-NU-4 | P2 | Nach dem Sperren springt die Karte ans Listenende (Anton Testmann steht danach als letzte von 5300 px); auf dem Handy verliert man die Stelle und sieht das Ergebnis nicht (AD-NU-5); Seitenwechsel "Zurueck / Seite 2" erst am Ende nach rund 5000 px. | admin_mobil_nutzer_extra-nach-sperre.png, admin_mobil_nutzer_extra-seite2.png | adapt |

##### /admin/teams (Admin, Handy)
Beleg: admin_mobil_teams.png (2598 px, 52 von 80 Zielen klein), _extra-suche, _extra-leer, _extra-zusammenfuehren-bestaetigung-abgebrochen
Bewertung: Saubere, kurze Karten (rund 185 px) mit Suche oben, ohne Ueberlauf. Die gefaehrlichste Aktion, Zusammenfuehren, bedient sich am Handy ueber ein abgeschnittenes Auswahlfeld und eine native Rueckfrage.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 5, 9] AM-TE-1 |
| audit | [Responsive] Teamname-Link 21 px hoch (10 Ziele unter 24 px): AM-ALL-5, AM-TE-2 |
| distill | [Interaction] Zwei Steuerelemente je Karte, Verifizieren sofort (AD-TE-3) |
| clarify | [Labels] "In anderes Team ueberfuehren..." gegen "Zusammenfuehren" (AD-TE-1) |
| adapt | [Mobile: Karten] AM-TE-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/teams`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/teams`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-TE-1 | P1 | Zusammenfuehren: Auswahlfeld "In anderes Team ueberfuehren..." mit Ellipsis (abgeschnitten), nach Wahl erscheint erst ein zweiter Knopf "Zusammenfuehren" (die Karte waechst unter dem Daumen), dann natives `confirm` "Demo Alpha in Demo Bravo ueberfuehren? ... verschwindet danach"; bei Suche "Rot" gibt es kein Ziel (Auswahl nur mit Platzhalter). Ergaenzt AD-TE-1. | admin_mobil_teams_extra-zusammenfuehren-bestaetigung-abgebrochen.png, admin_mobil_teams_extra-suche.png | clarify, adapt |
| AM-TE-2 | P2 | Teamname ist als Link nur 21 px hoch ohne Hinweis, dass er auf die oeffentliche Seite fuehrt (10 Ziele unter 24 px); "Seed Archiv" wirkt wie ein aktives Team (AD-TE-2). | admin_mobil_teams.png | audit |

##### /admin/ligen (Admin, Handy)
Beleg: admin_mobil_ligen.png (1889 px, 32 von 68 Zielen klein), _extra-datumsfelder-ausschnitt, _extra-fehler-ende-vor-start, _extra-saison-beenden-bestaetigung-abgebrochen, _extra-team-unbekannt
Bewertung: Formular vor drei Ligakarten; die Dreierzeile Stadt, Start, Ende ist am Handy unbrauchbar eng. Die Rueckfrage bei "Saison beenden" ist die beste im Admin (Folge und Endgueltigkeit), die Karten zeigen aber nur Teamnamen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6, 9] AM-LI-1, AM-LI-2 |
| audit | [Forms, Responsive] Datums- und Auswahlwerte abgeschnitten (`scrollWidth` 98 bei `clientWidth` 98: Feld voll, Wert gekappt); Checkbox 13 px: AM-LI-1, AM-ALL-5 |
| distill | [Visual] Vier gleich grosse orange Hauptknoepfe (AD-LI-4) |
| clarify | [Errors] Fehlertexte unter dem Knopf: AM-LI-3 |
| adapt | [Mobile: Formulare] Spalten nur ab Tablet: AM-LI-1, AM-ALL-10 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/ligen`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/ligen`: Exit 0, `[]` (`grid grid-cols-3` ohne Breakpoint nur per Lesen) |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-LI-1 | P1 | Stadt, Start und Ende stehen in drei Spalten zu je 100 px (`grid-cols-3` ohne Breakpoint): Auswahl zeigt "Ganz N", das Datum "11.11.2(" mit Kalendersymbol, das leere Feld "dd.mn"; "01.12.2" und "01.11.2" im Fehlerbild; das Jahr ist nicht lesbar, Eingabe nur per Picker pruefbar. | admin_mobil_ligen_extra-datumsfelder-ausschnitt.png, admin_mobil_ligen_extra-fehler-ende-vor-start.png | adapt, audit |
| AM-LI-2 | P1 | "Saison beenden" bricht in 100 px in zwei Zeilen um und sitzt neben dem Titel; je Team ein "Entfernen" (36 px, 8 px Abstand, ohne Rueckfrage) in einer Viererreihe (AD-LI-1); Beleg zeigt beides am Rand. Gefahr: Entfernen statt Saison beenden mit dem Daumen. | admin_mobil_ligen.png | adapt, clarify |
| AM-LI-3 | P2 | Fehler ("Das Ende liegt vor dem Start.", "Team ... nicht gefunden") im schwarz umrandeten Kasten unter dem Knopf, bleibt stehen; Slug-Feld mit zweizeiliger Beschriftung "Team (Name aus der Adresse, z. B. rot-weiss-essen)" fordert auf dem Handy Tippen aus dem Kopf (AD-ALL-9, AD-LI-3). | admin_mobil_ligen_extra-team-unbekannt.png | clarify |

##### /admin/profitag (Admin, Handy)
Beleg: admin_mobil_profitag.png (1717 px, 27 von 63 Zielen klein), _extra-fehler-unbekanntes-team, _extra-bestaetigungen-abgebrochen
Bewertung: Ein langes Formular (neun Felder, rund 650 px) vor vier Terminkarten; "Jetzt auslosen" und "Absagen" tragen native Rueckfragen. Die Zeit-Eingaben sind am Handy abgeschnitten.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 5] AM-PT-1, AM-PT-2 |
| audit | [Forms] Zeitfelder gekappt; Terminlinks 21 px hoch (3 Ziele unter 24 px): AM-PT-1 |
| distill | [Redundancy] Status doppelt in Titel und Zeile (AD-PT-2) |
| clarify | [Labels, Destruktiv] Rueckfrage "Profi-Tag absagen?" ohne Titel: AM-PT-2 |
| adapt | [Mobile: Formular] AM-PT-3 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/profitag`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/profitag`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-PT-1 | P1 | "Beginn (deutsche Zeit)" und "Bewerbung bis" (Datum und Uhrzeit) stehen nebeneinander in je rund 150 px: Wert "05.12.2026 18" ist abgeschnitten, die Uhrzeit (Pflichtangabe "deutsche Zeit") ist nicht lesbar. | admin_mobil_profitag_extra-fehler-unbekanntes-team.png | adapt, audit |
| AM-PT-2 | P2 | "Jetzt auslosen" (orange) und "Absagen" (dunkel) nebeneinander, 8 px Abstand, beide nur 12 px Schrift im Knopf; Rueckfragen "Jetzt auslosen? Die Spiele werden sofort angelegt." und "Profi-Tag absagen?" nennen weder Titel noch Bewerberzahl (AD-PT-1/3). | admin_mobil_profitag_extra-bestaetigungen-abgebrochen.png | clarify |
| AM-PT-3 | P2 | Das Formular belegt erst 650 px, die Terminkarten beginnen nach rund 1000 px; Fehlertext "Team ... nicht gefunden" erscheint unter dem Knopf (AD-PT-3, AD-ALL-9). | admin_mobil_profitag.png | distill |

##### /admin/sponsoren (Admin, Handy)
Beleg: admin_mobil_sponsoren.png (1695 px, 26 von 63 Zielen klein), _extra-url-ungueltig, _extra-pausiert-ohne-rueckfrage
Bewertung: Kurze, uebersichtliche Karten. "Team zuordnen" als ganzbreiter Hauptknopf mit leerem Slug-Feld dominiert (AD-SN-1); Pausieren/Aktivieren sortiert die Liste um und verschiebt die Karte unter dem Daumen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 5] AM-SN-1 |
| audit | [Forms] Name-Feld rund 155 px, Auswahl "Sponsor (Start..." gekappt: AM-SN-2 |
| distill | [Visual] Drei ganzbreite orange Knoepfe (AD-SN-1) |
| clarify | [Errors] "Die Adresse ist ungueltig." ohne Format (AD-SN-4) |
| adapt | [Mobile: Karten] AM-SN-1 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/sponsoren`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/sponsoren`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-SN-1 | P1 | "Pausieren" (36 px, rechts am Rand) wirkt sofort; die Liste sortiert um (aktive zuerst), der Partner springt unter dem Daumen weg; im Test traf der zweite Tipp deshalb den falschen Sponsor (Sport GmbH statt Altpartner, am Handy ebenso wie am Desktop). Bestaetigt AD-SN-2 mit Handy-Messung. | admin_mobil_sponsoren_extra-pausiert-ohne-rueckfrage.png | critique |
| AM-SN-2 | P2 | Formular "Neu": Name-Feld und Art-Auswahl teilen sich die Zeile; "Analyse-Sponsor" ist abgeschnitten, die Art zeigt nur "Sponsor (Start", der Trikot-Partner-Eintrag ist nicht sichtbar. | admin_mobil_sponsoren_extra-url-ungueltig.png | adapt |

##### /admin/moderation (Admin, Handy)
Beleg: admin_mobil_moderation.png (2037 px, 45 von 71 Zielen klein), _extra-nach-wieder-anzeigen, _extra-nach-entfernen-und-verwarnen-ohne-rueckfrage
Bewertung: Gut lesbar: Autor, Verwarnungen, Zustand, Kommentartext und Gruende in einer Karte. Am Handy brechen die drei Entscheidungen in zwei Zeilen um; die gefaehrlichen liegen dicht und ohne Rueckfrage.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 5; Persona Casey, Riley] AM-MO-1, AM-MO-2 |
| audit | [Responsive] 28 von 28 Zielen unter 44 px, "Zur Seite" 50x15 px: AM-MO-3, AM-ALL-5 |
| distill | [Interaction] Drei Knoepfe gleicher Art (AD-MO-2) |
| clarify | [Aktionsnamen] "Wieder anzeigen" bedeutet auch "Meldung abweisen" (AD-MO-1) |
| adapt | [Mobile: Daumen] AM-MO-1, AM-MO-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/moderation`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/moderation`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-MO-1 | P1 | Drei Knoepfe brechen um: Zeile 1 "Wieder anzeigen | Entfernen", Zeile 2 "Entfernen und verwarnen" (zwei Danger-Knoepfe uebereinander, 8 px Abstand); "Entfernen" und "Entfernen und verwarnen" wirken sofort ohne Rueckfrage und ohne Begruendung (Gerd Gewarnt 3 auf 4 Verwarnungen, Karte verschwunden). Handy-Verschaerfung von AD-MO-2. | admin_mobil_moderation_extra-nach-entfernen-und-verwarnen-ohne-rueckfrage.png | clarify, adapt |
| AM-MO-2 | P1 | Nach einer Aktion verschwindet die Karte und die naechste rueckt an dieselbe Stelle (5 auf 4 auf 3): ein Doppeltipp trifft die naechste Meldung; kein Hinweis, kein Rueckgaengig (AD-MO-1). | admin_mobil_moderation_extra-nach-wieder-anzeigen.png | clarify |
| AM-MO-3 | P2 | "Zur Seite" (12 px, orange, 15 px hoch) liegt direkt ueber den Knoepfen und ist schwer zu treffen; Verwarnungszahl, "sichtbar/ausgeblendet" und Meldungszahl stehen in einer 12-px-Grauzeile (19 Texte unter 13 px). | admin_mobil_moderation.png | audit, typeset |

##### /admin/finanzen (Admin, Handy)
Beleg: admin_mobil_finanzen.png (1829 px, 26 von 54 Zielen klein), _extra-vormonat
Bewertung: Die Seite gehoert zum Altmodell (AD-FI-1, MUSS WEG). Am Handy stehen drei Alarmkarten ("Zahlung ohne Buchung") vor neun Nullkacheln in zwei Spalten; bei leerem Hauptbuch nutzlos.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 4, 8] AM-FI-1 |
| audit | [Responsive] "Ansehen" 58x18 px (2 Ziele unter 24 px): AM-FI-1 |
| distill | [Remove] Altmodell-Kachelreihe: AD-FI-1 (keine neuen Funde) |
| clarify | [Jargon] "Ledger", ID "5eed0ad0": AD-FI-2 |
| adapt | [Mobile: Kacheln] AM-FI-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/finanzen`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-FI-1 | P1 | Zwei Alarmkarten tragen denselben Text mit derselben ID "5eed0ad0" (30,00 und 50,00 EUR); "Ansehen" ist ein 18 px hoher Link und fuehrt, laut Desktop-Blatt, auf keine Spielseite (0 Links auf `/admin/finanzen/spiel/`); die Alarme sind vom Monat unabhaengig (Oktober zeigt dieselben drei). | admin_mobil_finanzen_extra-vormonat.png | critique, audit |
| AM-FI-2 | P2 | Kachel-Beschriftungen "Einnahmen (netto nach Erstattungen)" und "Offene Guthaben (Schuld an Spieler)" laufen in zwei Zeilen, Kacheln ungleich hoch; Monatswahl braucht Feld plus "Anzeigen" (AD-FI-4); CSV-Knopf "CSV fuer 2026-11" in ISO-Form neben "Ausgaben" (CSV-Download am Handy nicht getestet). | admin_mobil_finanzen.png | adapt, clarify |

##### /admin/finanzen/ausgaben (Admin, Handy)
Beleg: admin_mobil_finanzen-ausgaben.png (1686 px, 27 von 61 Zielen klein), _extra-betrag-ungueltig, _extra-ausgabe-gebucht
Bewertung: Klares Formular in einer Spalte und eine Liste mit Summe, am Handy gut lesbar; Fehler "Bitte einen Betrag in Euro angeben, z. B. 80,00." ist gut. Die Verknuepfungen in der Liste sind zu klein und abgeschnitten.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 9] AD-FA-1 (Ausgabe nicht korrigierbar), AM-FA-1 |
| audit | [Forms, Responsive] Betragsfeld ohne `inputMode` (Quelltext: `<input id="amount" ... placeholder="80,00">`), Links 15 px hoch: AM-FA-1, AM-FA-2 |
| distill | [Redundancy] Art und Notiz doppelt in der Zeile (AD-FA-4) |
| clarify | [Success] "Gespeichert." statt "Ausgabe gebucht" (AD-FA-3) |
| adapt | [Mobile: Listen] AM-FA-1 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen/ausgaben`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/finanzen/ausgaben` (Ordner finanzen gesamt Exit 0): Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-FA-1 | P1 | In der Liste stehen Spielverknuepfung und "Beleg" als Links mit 15 px Hoehe nebeneinander; der zweite Link ist abgeschnitten ("B..."), 6 Ellipsen auf der Seite; Spiel-Finanzen-Verweis ist Altmodell (siehe MUSS WEG-Tabelle des Desktop-Blatts). | admin_mobil_finanzen-ausgaben.png | adapt, audit |
| AM-FA-2 | P2 | Betrag-Feld oeffnet auf dem Handy die normale Buchstabentastatur (kein `inputMode="decimal"`); Datumsfeld "dd.mm.yyyy" ohne Vorgabe; nach dem Buchen liegt die Meldung "Gespeichert." unter dem Knopf, die neue Zeile erst darunter nach rund 700 px (Summe "6 Ausgaben, zusammen 217,50 EUR" ausserhalb des Sichtfelds). | admin_mobil_finanzen-ausgaben_extra-ausgabe-gebucht.png | clarify, adapt |

##### /admin/finanzen/spiel/ID (Admin, Handy)
Beleg: admin_mobil_finanzen-spiel-ID.png (1376 px, 23 von 55 Zielen klein; Direktaufruf mit Seed-Spiel-ID)
Bewertung: Altmodell-Seite (AD-FS-1) mit drei Kacheln in einer Reihe (Einnahmen, Hallenkosten, Marge) und "Niemand hat bezahlt." Auffaellig neu am Handy: ein Formular "Ausgabe zu diesem Spiel" steht mitten auf der Seite.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 5] AD-FS-3 (Erstattung, nur Quelltext); AM-FS-1 |
| audit | [Forms] Platzhalter 80,00 in 4,1:1 (X-16), Labels vorhanden |
| distill | [Remove] Altmodell (AD-FS-1) |
| clarify | [Jargon] "Status confirmed", leere Ueberschrift "Buchungen" (AD-FS-2) |
| adapt | [Mobile] Kacheln `grid-cols-3` (je 110 px) passen; Kopfzeile dreizeilig: AM-FS-1 |
| detect URL | nicht moeglich ohne Sitzung (ID-URL) |
| detect Quelltext | `detect --json --viewport 390x844 "src/app/admin/finanzen/spiel/[id]"` (Teil von finanzen): Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-FS-1 | P2 | Klaerung: "Ausgabe zu diesem Spiel" (Betrag, Notiz, Beleg, "Ausgabe buchen") steht als Formular in der Seite, im Desktop-Blatt nicht genannt; die Kopfzeile "Mi., 11.11., 06:25 Uhr · Status confirmed · Hallenpreis 80,00 EUR · Kosten laut Regel 70,00 EUR · Anteil 8,00 EUR" umbricht in drei Zeilen. Ob Hallenkosten pro Spiel im Kartenmodell bleiben (Provision im Hauptbuch), ist zu klaeren, daher kein MUSS WEG. | admin_mobil_finanzen-spiel-ID.png | clarify |

##### /admin/buchungen (Admin, Handy)
Beleg: admin_mobil_buchungen.png (3080 px, 27 von 78 Zielen klein; Aufnahme zeigt 5 Karten), _extra-speichern-unveraendert
Bewertung: Funktionierende Arbeitsliste: je Karte ein Formular aus Status, Halle, Notiz, Nachweis und Speichern (rund 390 px). Die Auswahlfelder zeigen am Handy nur Wortanfaenge.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 6] AM-BU-1 |
| audit | [Forms] Werte gekappt, Links 18 px: AM-BU-1, AM-ALL-5 |
| distill | [Progressive disclosure] Jeder Auftrag mit vollem Formular (AD-BU-2) |
| clarify | [Jargon, Status] Altmodell-Einleitung (AD-BU-1), Statusuebergaenge (AD-BU-3) |
| adapt | [Mobile: Formular] AM-BU-1, AM-BU-2 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/buchungen`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/buchungen`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-BU-1 | P1 | Status- und Hallenauswahl (je 155 px) zeigen abgeschnitten "Von der Halle b", "Halle nicht verf", "Seed-Halle Su"; vor dem Speichern ist der gewaehlte Status nicht lesbar; Nachweis-Adresse endet "...bestaetigung/a2". Status steht zusaetzlich als 12-px-Etikett oben rechts. | admin_mobil_buchungen.png | adapt, audit |
| AM-BU-2 | P2 | Jede Karte hat einen ganzbreiten orangen "Speichern" (5 bis 10 gleichrangige Hauptknoepfe), ein erneutes Speichern ohne Aenderung meldet "Gespeichert." (AD-BU-4); die Einleitung (Altmodell, vier Zeilen) steht vor dem ersten Auftrag, am Handy rund 100 px. | admin_mobil_buchungen_extra-speichern-unveraendert.png | distill |

##### /admin/hallen (Admin, Handy)
Beleg: admin_mobil_hallen.png (4593 px, 26 von 104 Zielen klein; verkleinert gesehen), _extra-betreiber-ausschnitt, _extra-preis-ungueltig, _extra-deaktiviert-ohne-rueckfrage
Bewertung: Die am schwersten bedienbare Seite: rund 700 px je Halle mit Preisregel-Formular und Betreiber-Zeile; "Betreiber zuweisen" ist am Handy unlesbar, ohne Verbesserung gegenueber dem Desktop (AD-HA-1).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4, 5, 8] AD-HA-1 (am Handy gemessen), AM-HA-2, AM-HA-3 |
| audit | [Responsive, Forms] Messung: Betreiber-Eingabefeld 61 px, Label 61x82 px, Knopf 255 px; Checkbox 20 px: AD-HA-1, AM-ALL-5 |
| distill | [Remove] Preisregeln (Altmodell, AD-HA-2) |
| clarify | [Labels] "Halle kostet uns" (AD-HA-2); Fehlerkasten schmal: AM-HA-2 |
| adapt | [Mobile: Formulare, Karten] AM-HA-3, AM-HA-4 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/hallen`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/hallen`: Exit 0, `[]` |

Verweis (kein neuer Fund): AD-HA-1 (P0) gilt am Handy unveraendert und ist gemessen: Quelltext `className="flex items-end gap-2"` auf der Betreiber-Form, Feld `flex-1`; Bild `_extra-betreiber-ausschnitt` zeigt "halle" im 61-px-Feld und Label in fuenf Zeilen.

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-HA-2 | P2 | "Preisregel hinzufuegen" ist ein halbbreiter oranger Knopf mit zwei Zeilen Text in jeder der fuenf Karten (Altmodell, AD-HA-2); der Fehlerkasten "Preis und Kosten bitte in Euro angeben, z. B. 80,00." quetscht sich in rund 130 px neben den Knopf und braucht fuenf Zeilen. | admin_mobil_hallen_extra-preis-ungueltig.png | adapt, clarify |
| AM-HA-3 | P1 | "Deaktivieren" (ganzbreit, 8 px unter "Betreiber zuweisen") wirkt sofort ohne Rueckfrage; die Meldung "Gespeichert." ist eine kleine Zeile am Kartenende, das Etikett "inaktiv" 12 px oben rechts; Deaktivieren trifft laufende Buchungen (AD-HA-3). Fehltipp-Gefahr am Handy. | admin_mobil_hallen_extra-deaktiviert-ohne-rueckfrage.png | clarify |
| AM-HA-4 | P2 | "Neue Halle": Stadt-Auswahl ("Gelsenkircher") und Boden-Platzhalter ("Kunstrasen, Parke...") gekappt, Checkboxen Duschen/Parkplaetze/Partnerhalle in einer Zeile mit 20-px-Zielen; Seitenlaenge 4593 px ohne Filter. | admin_mobil_hallen.png | adapt, distill |

##### /admin/codes (Admin, Handy)
Beleg: admin_mobil_codes.png (1830 px, 26 von 63 Zielen klein), _extra-wert-ungueltig
Bewertung: Ganze Seite ist Altmodell und soll entfallen (AD-CO-1). Am Handy nur der Vollstaendigkeit halber: Zwei-Spalten-Formular mit gekappter Art-Auswahl.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 4] AD-CO-1 (ganze Seite MUSS WEG), keine handy-eigenen Funde ausser AM-CO-1 |
| audit | [Forms] Checkbox 20 px, Labels vorhanden |
| distill | [Remove] ganze Seite: AD-CO-1 |
| clarify | [Terminologie] Menue "Codes" / Titel "Rabattcodes" (AD-CO-3) |
| adapt | [Mobile: Formular] AM-CO-1 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/codes`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/codes`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-CO-1 | P2 | Art-Auswahl "Prozent der Au..." gekappt; zweizeilige Beschriftungen ("Wert (Prozent oder Euro)", "Mindestaufladung (Euro)") schieben die Felder einer Reihe auf unterschiedliche Hoehe; "Deaktivieren" 36 px hoch sofort (AD-CO-2). Erledigt sich mit dem Entfernen der Seite. | admin_mobil_codes_extra-wert-ungueltig.png | adapt |

##### /admin/protokoll (Admin, Handy)
Beleg: admin_mobil_protokoll.png (3460 px, 22 von 52 Zielen klein; Messung 21 Ziele unter 24 px), _extra-filter-nutzer, _extra-vorher-nachher-offen, _extra-leer
Bewertung: Als Handy-Liste ordentlich gesetzt (eine Karte je Eintrag, Aktion fett, Zeit und Akteur darunter), aber in Entwicklersprache (AD-PR-1); das Aufklappen von "Vorher und nachher" macht die Seite am Handy unlesbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 6, 10] AD-PR-1 und AM-PR-1 |
| audit | [Responsive] `summary` 16 px hoch, `pre` mit horizontalem Scroll: AM-PR-1 |
| distill | [Redundancy] Ganzer Datensatz statt Unterschied (AD-PR-2) |
| clarify | [Jargon] Aktionscodes, gekuerzte IDs (AD-PR-1), Filter (AD-PR-3) |
| adapt | [Mobile: JSON-Block] AM-PR-1 |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/protokoll`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/protokoll`: Exit 0, `[]` |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AM-PR-1 | P1 | Ein geoeffneter Eintrag (`venue.update`) zeigt rund 40 Zeilen JSON in 12 px, Zeilen wie `"id": "3cd256f0-a4c4-..."` laufen aus dem Block (horizontales Scrollen im Block auf dem Handy, Wischen kollidiert mit Seiten-Scrollen); der Unterschied (`active`) ist nicht markiert; Aufklapper 324x16 px (21 Ziele unter 24 px). Ergaenzt AD-PR-2. | admin_mobil_protokoll_extra-vorher-nachher-offen.png | adapt, distill |
| AM-PR-2 | P2 | Aktion und Objekt-ID brechen mitten im Code ("comment.remove_and_warn · comment / 5eed0ad0"); Filterkarte (rund 230 px) steht vor der Liste, "Seite 1 / Weiter" erst nach rund 3200 px; Platzhalter "z. B. result." 4,1:1 (X-16). | admin_mobil_protokoll_extra-filter-nutzer.png | clarify |

##### /admin/einstellungen (Admin, Handy)
Beleg: admin_mobil_einstellungen.png (1160 px, 23 von 52 Zielen klein), _extra-mindestzahl-ungueltig, _extra-gespeichert-unveraendert
Bewertung: Kürzeste und am besten handytaugliche Admin-Seite (ein Formular, eine Spalte, Tastatur `type="tel"` fuer die Notfallnummer). Inhaltlich Altmodell-Anteile (AD-EI-1, Klaerung Stripe), die Checkbox ist ein 13-px-Kaestchen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 2, 5, 9] AD-EI-1, AD-EI-3 (keine neuen Funde) |
| audit | [Forms, Responsive] Checkbox 13x20 px (AM-ALL-5); Notfallnummer `type="tel"` gut |
| distill | [Remove] "Mindestzahl zahlender Spieler" (AD-EI-1, Klaerung) |
| clarify | [Hilfetexte] 12-px-Texte (AD-EI-5); Fehler "liegt zwischen 2 und 12" klar (AD-EI-4) |
| adapt | [Mobile] keine Funde |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/admin/einstellungen`: Anmeldeseite, straggler und overused-font, kein Admin-Fund |
| detect Quelltext | `detect --json --viewport 390x844 src/app/admin/einstellungen`: Exit 0, `[]` |

Keine neuen Funde (Referenzen: AD-EI-1 bis AD-EI-5; Checkbox-Zielgroesse in AM-ALL-5).



### Fundblatt Teilrollen und Zugriff

Stand: Dev-Server Port 3102, Basis-Seed plus Admin-Seed frisch; Konten `seed-moderator@test.local`, `seed-finanz@test.local`, `seed-buchung@test.local`, `seed-halle@test.local` (Rolle Spieler mit Hallenzuordnung), ein Spieler-Konto ("Anton") und Gast ohne Sitzung. Nur gelesen, gemessen und fotografiert; kein Quelltext geaendert. Funde des Admin-Blatts (`AD-...`, `AM-...`) und der Analyse X (`X-..`) werden nur referenziert; hier neu steht `AR-...`.

#### Zugriffsmatrix Rolle x Seite (gemessen)

Quelle: `metrics-desktop.json` und `metrics-mobil.json` (Status und Zielpfad je Seite). Alle Anfragen lieferten Status 200 (Umleitungen kommen im Seitenstrom). Die Matrix ist am Desktop und am Handy identisch (Zeile fuer Zeile verglichen). "erlaubt" = Seite bleibt auf der Adresse. Quelltext-Gegenprobe: `can()` in roles.ts und `requirePermission` je Seite: moderator = moderation + dashboard; finance = finance + dashboard; booking = booking + dashboard; admin = alles; player = nichts.

| Seite | Plattform-Admin | Moderation | Finanzen | Hallen-Buchung | Spieler mit Halle | Spieler | Gast |
|---|---|---|---|---|---|---|---|
| /admin | erlaubt | erlaubt | erlaubt | erlaubt | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/spiele | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/nutzer | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/teams | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/ligen | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/profitag | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/sponsoren | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/moderation | erlaubt | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/finanzen | erlaubt | -> /app | erlaubt | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/finanzen/ausgaben | erlaubt | -> /app | erlaubt | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/finanzen/spiel/ID | erlaubt | -> /app | erlaubt | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/buchungen | erlaubt | -> /app | -> /app | erlaubt | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/hallen | erlaubt | -> /app | -> /app | erlaubt | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/codes | erlaubt | -> /app | erlaubt | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/protokoll | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |
| /admin/einstellungen | erlaubt | -> /app | -> /app | -> /app | -> /app | -> /app | -> /anmelden?next=/admin |

Desktop und Handy gleich: ja (alle 112 Zellen). Zaehlung erlaubte Seiten: Plattform-Admin 16, Moderation 2 (Uebersicht, Moderation), Finanzen 5 (Uebersicht, Finanzen, Ausgaben, Spiel-Finanzen, Codes), Hallen-Buchung 3 (Uebersicht, Buchungen, Hallen), Spieler mit Halle 0, Spieler 0, Gast 0. Das deckt sich mit der Navigation je Rolle (Moderation: 2 Punkte, Finanzen: 3 Punkte plus Spiel-Finanzen nur ueber Link, Hallen-Buchung: 3 Punkte). **Die Navigation zeigt nur erlaubte Punkte (kein toter Navigationspunkt).** Eine tote Verlinkung gibt es trotzdem: AR-BU-1.

Weitere Zugriffs-Messungen (Playwright, `rollen-extras-log.json`, `gast-next.cjs`, `dead.cjs`): Gast auf /admin, /admin/nutzer, /admin/finanzen/spiel/ID: Zielpfad immer `/anmelden?next=%2Fadmin`; Gast auf /halle: `/anmelden?next=%2Fhalle`; Gast auf /app: `?next=%2Fapp`. Anmeldung mit `next=%2Fadmin%2Fbuchungen` als Hallen-Buchung: Landung /admin/buchungen; mit `next=%2Fhalle` als Betreiber: Landung /halle. Anmeldung ohne `next`: jede der vier Rollen landet auf /app.

#### Methode und Grenzen

- Die fuenf Reference-Dateien (`critique.md` 819 Zeilen, `audit.md` 139, `distill.md` 111, `clarify.md` 94, `adapt.md` 318) wurden zu Beginn vollstaendig gelesen. Sie haben keinen Launcher-Befehl und liefen manuell; je Durchgang steht der angewandte Teil in eckigen Klammern. `critique` bleibt degradiert (kein Overlay, kein getrennter Assessment-B-Sub-Agent; Assessment B = `detect`).
- `context` (Launcher) lief einmal: PRODUCT.md geladen (web, Admin/Betreiber/Finanzen/Moderation arbeiten am Desktop, Kartenmodell Vertrag 012).
- `detect --json --viewport <WxH> <URL>` lief je Viewport fuer alle 15 Admin-URLs (ohne die ID-URL) und /halle: keine Timeouts. Per URL ohne Sitzung sieht der Detektor die Anmeldeseite: Desktop nur `overused-font` (Plus Jakarta Sans, in DESIGN.md gesetzt, kein Fund), Handy zusaetzlich `straggler` (X-13); kein Rollen- oder Admin-Fund. Gegen den Quelltext (`src/app/admin/page.tsx`, `layout.tsx`, `src/app/halle`, `UserMenu.tsx`, beide Viewports): je Exit 0, `[]`. Die Rohdaten liegen in `detect-rollen/`.
- Messwerte "Ziele klein" stammen aus den Metrik-Dateien (Ziele unter 44 px). Bilder gleicher Zellen sind per MD5 belegt (8 Zeichen). Die Bilder derselben Rolle wurden zu unterschiedlichen Zeiten aufgenommen: Zeitangaben "16:25 Uhr" und "17:04 Uhr" sowie "Unzugestellte Meldungen 0 oder 2" zwischen Bildern stammen vom Neu-Laden des Seeds zwischen den Laeufen, kein Fund.
- Ganzseitige Handy-Bilder zeigen die feste untere Navigation und das runde N (Next-Overlay) mitten im Bild: Aufnahme-Artefakt, kein Fund. Der orange Fokusring am Konto-Knopf in `halle_*_extra-fusszeile-app.png` entstand durch Escape nach dem Menue: kein Fund.
- Nicht ausgeloest: "Halle ist frei/belegt" auf /halle (Aenderung am Seed), echte Rollenwechsel. Nicht belegbar: Benachrichtigung an Betreiber bei neuer Anfrage, Verhalten ohne JavaScript.

#### Geaenderte Daten

Keine. Der Lauf hat nur gelesen (Anmeldungen und Seitenaufrufe, ein Klick auf einen Link). Es wurde nichts gespeichert, kein Formular abgesendet.

#### Antwort auf die Kernfragen

- **Teilrollen auf /admin:** Alle drei sehen dieselbe Uebersicht wie der Plattform-Admin (AR-UE-1), mit passender, nur auf ihre Seiten gekuerzter Navigation. Die Navigation stimmt zur Rolle, die Kacheln und der Titel nicht.
- **Sackgassen:** Kacheln fuehren nirgends auf verbotene Seiten (sie sind keine Links); die Aufgabenkarten gehen auf /spiele/ID (oeffentlich). Echte Sackgasse: "Finanzen zu diesem Spiel" fuer Hallen-Buchung (AR-BU-1).
- **Zugriff ohne Recht:** Spieler, Betreiber und Teilrollen: stille Umleitung auf /app ohne Erklaerung (AR-ZU-1); Gast: Anmeldung, aber `next` verliert die Unterseite (AR-GA-1).
- **Betreiber:** Weg nach /halle nur ueber die Fusszeile (AR-HA-1); Fristen unsichtbar auf /app (AR-HA-2).
- **Rollenanzeige:** keine (AR-KM-1). "Admin 1/Admin 2" gibt es nicht (nur `admin`, siehe AD-ALL-2); Teilrollen sind keine Admin-2-Stufe, sie sehen und tun nur ihren Bereich.

#### Zellen

##### /admin (Moderation, Desktop)
Beleg: moderator_desktop_uebersicht.png (Messung: 800 px hoch, 14 von 38 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 ed9d3dde)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Moderation in einer Zeile (beim Admin zwei Zeilen, AD-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Moderation; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] Funde AR-UE-1, AR-UE-2, AR-UE-3, AR-UE-4; Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Desktop] Kacheln 3 je Zeile in der 720-px-Spalte (AD-ALL-4); Spieler-Kopfleiste und Fusszeile (AD-ALL-6) |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-UE-1 | P1 | Die Uebersicht ist fuer alle drei Teilrollen dieselbe Seite wie fuer den Plattform-Admin (nur die Navigationsleiste unterscheidet sich, Bilder bis auf die Nav gleich): sechs Kennzahlen zu Nutzern, Teams, Suchen und Spielen sowie die Aufgaben "Streitfall" und "Ohne Ergebnis". Keine Kachel gehoert zur Rolle: Moderation sieht nicht die 5 offenen Meldungen, Finanzen nicht die 3 Alarme der Finanzseite, Buchung nicht die offenen Buchungsauftraege. Die Startseite beantwortet "Was ist fuer mich zu tun?" nicht. | moderator_desktop_uebersicht.png, finanz_desktop_uebersicht.png, buchung_desktop_uebersicht.png | critique [Heuristik 2, 6; Persona Alex] |
| AR-UE-2 | P2 | Die beiden Aufgabenkarten (Streitfall, Ohne Ergebnis) fuehren jede Teilrolle auf die oeffentliche Spielseite /spiele/ID; keine der drei Teilrollen hat dort nachweislich eine passende Aktion (ob Entscheiden dort moeglich ist, bleibt wie in AD-UE-3 offen). Die Karte verspricht eine Aufgabe, die die Rolle nicht erledigen darf. | moderator_desktop_uebersicht.png | critique [Heuristik 1, 3] |
| AR-UE-3 | P2 | Seitentitel und Begruessung heissen fuer jede Teilrolle "Admin" (AD-UE-4); die Rolle (Moderation, Finanzen, Hallen-Buchung) steht nirgends im Titel oder der Begruessung. Wer sich im falschen Konto angemeldet hat, merkt es nicht. | finanz_desktop_uebersicht.png, buchung_mobil_uebersicht.png | clarify [Labels] |
| AR-UE-4 | P2 | Teilrollen sehen Gesamtzahlen "Nutzer 42" und "Teams 9", obwohl sie weder Nutzer- noch Teamliste oeffnen duerfen (Recht admin). Klaerung: Datensparsamkeit oder bewusst gewollte Orientierung. | finanz_desktop_uebersicht.png | critique [Heuristik 8] |

##### /admin (Finanzen, Desktop)
Beleg: finanz_desktop_uebersicht.png (Messung: 800 px hoch, 15 von 39 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 5285e927)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Finanzen, Codes in einer Zeile (beim Admin zwei Zeilen, AD-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Finanzen; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] gleicher Befund wie moderator_desktop_uebersicht: AR-UE-1, AR-UE-3 (Verweis); Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Desktop] Kacheln 3 je Zeile in der 720-px-Spalte (AD-ALL-4); Spieler-Kopfleiste und Fusszeile (AD-ALL-6) |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-UE-1, AR-UE-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Hallen-Buchung, Desktop)
Beleg: buchung_desktop_uebersicht.png (Messung: 800 px hoch, 15 von 39 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 c7377f8f)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Buchungen, Hallen in einer Zeile (beim Admin zwei Zeilen, AD-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Hallen-Buchung; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] gleicher Befund wie moderator_desktop_uebersicht: AR-UE-1, AR-UE-3 (Verweis); Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Desktop] Kacheln 3 je Zeile in der 720-px-Spalte (AD-ALL-4); Spieler-Kopfleiste und Fusszeile (AD-ALL-6) |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-UE-1, AR-UE-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Moderation, Handy)
Beleg: moderator_mobil_uebersicht.png (Messung: 1113 px hoch, 10 von 38 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 bc789fb5)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Moderation in einer Zeile (beim Admin vier Zeilen, AM-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Moderation; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] gleicher Befund wie moderator_mobil_uebersicht: AR-UE-1, AR-UE-3 (Verweis); Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Mobile] 2 Kachelspalten, untere Spielernavigation (Spiel suchen) verdeckt die Bildkante und bietet der Rolle nichts (AM-ALL-2); Nav einzeilig: besser als Admin |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-UE-1, AR-UE-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Finanzen, Handy)
Beleg: finanz_mobil_uebersicht.png (Messung: 1113 px hoch, 11 von 39 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 e417c93b)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Finanzen, Codes in einer Zeile (beim Admin vier Zeilen, AM-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Finanzen; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] gleicher Befund wie moderator_mobil_uebersicht: AR-UE-1, AR-UE-3 (Verweis); Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Mobile] 2 Kachelspalten, untere Spielernavigation (Spiel suchen) verdeckt die Bildkante und bietet der Rolle nichts (AM-ALL-2); Nav einzeilig: besser als Admin |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-UE-1, AR-UE-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Hallen-Buchung, Handy)
Beleg: buchung_mobil_uebersicht.png (Messung: 1113 px hoch, 11 von 39 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 d8d3db88)
Bewertung: Gleicher Inhalt wie beim Plattform-Admin (Aufgaben 2, sechs Kacheln), die Navigation zeigt nur Uebersicht, Buchungen, Hallen in einer Zeile (beim Admin vier Zeilen, AM-ALL-1). Passende, ruhige Navigation, aber nichts auf der Seite gehoert zur Rolle Hallen-Buchung; Titel "Admin".

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 2, 6; Persona Alex, Sam] gleicher Befund wie moderator_mobil_uebersicht: AR-UE-1, AR-UE-3 (Verweis); Navigation nur erlaubte Punkte: gut |
| audit | [A11y, Responsive] Fokus, Kontrast, Ziele wie Admin-Blatt (AD-UE, AM-ALL-5): keine neuen Funde |
| distill | [Information architecture] sechs gleich gewichtete Kacheln, keine rollenbezogene: AR-UE-1 |
| clarify | [Labels] Titel "Admin" statt Rollenname: AR-UE-3; "Unzugestellte Meldungen" (AD-UE-2) |
| adapt | [Mobile] 2 Kachelspalten, untere Spielernavigation (Spiel suchen) verdeckt die Bildkante und bietet der Rolle nichts (AM-ALL-2); Nav einzeilig: besser als Admin |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-UE-1, AR-UE-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Moderation, Desktop)
Beleg: moderator_desktop_moderation.png (Messung: 1293 px hoch, 37 von 59 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 f258af4d)
Bewertung: Moderation: Warteschlange mit 5 Eintraegen (Rafael, Gerd 2x, Sven, Quirin), je Eintrag drei Aktionen. Gleich zur Admin-Seite (AD-MO, AM-MO); die Rolle Moderation kann damit arbeiten, sieht aber keine Sperrkennzeichnung (AR-MO-1).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-MO-1; Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-MO-1 | P2 | Moderation: die Warteschlange zeigt Verwarnungen je Nutzer ("3 Verwarnungen" bei Sven Gesperrt), aber weder eine Sperrkennzeichnung noch eine Sperrmoeglichkeit; Sperren liegt bei der Rolle Plattform-Admin (Seite Nutzer, fuer Moderation nicht erlaubt). Die Rolle sieht, dass jemand mehrfach auffaellt, kann es aber nicht weitergeben (kein "An Admin melden"). | moderator_desktop_moderation.png | critique [Heuristik 7], distill |

##### /admin/finanzen (Finanzen, Desktop)
Beleg: finanz_desktop_finanzen.png (Messung: 1425 px hoch, 19 von 43 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 e03a6a0a)
Bewertung: Finanzen mit 3 Alarmen und 10 Kacheln, darunter Aufladungen, Rabatt-Boni und "Offene Guthaben (Schuld an Spieler)" (Altmodell, siehe MUSS WEG-Tabelle). Inhaltlich wie beim Admin (AD-FI), keine rollenspezifischen Abweichungen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/finanzen/ausgaben (Finanzen, Desktop)
Beleg: finanz_desktop_finanzen-ausgaben.png (Messung: 1358 px hoch, 20 von 50 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 4646beba)
Bewertung: Ausgabenseite mit Formular und 4 Ausgaben (192,50 EUR); gleiche Seite wie beim Admin (AD-FA). Rolle Finanzen kommt ueber den Knopf "Ausgaben" der Finanzseite hierher.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen/ausgaben`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/finanzen/spiel/ID (Finanzen, Desktop)
Beleg: finanz_desktop_finanzen-spiel-ID.png (Messung: 1084 px hoch, 16 von 44 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 4e8d4729)
Bewertung: Spiel-Finanzen "Seed Blau gegen Seed Gelb" mit Kacheln 0,00 EUR und "Niemand hat bezahlt", Ausgabeformular. Gleich zum Admin (AD-FS); erreichbar nur ueber Links aus Finanzen oder Ausgaben, nicht ueber die Navigation.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/codes (Finanzen, Desktop)
Beleg: finanz_desktop_codes.png (Messung: 1473 px hoch, 19 von 52 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 31fe960f)
Bewertung: Rabattcodes (3 Codes SEED10, SEEDFIX5, SEEDNEU20, Formular mit Aufladungs-Begriffen): komplettes Altmodell, in der Navigation der Rolle Finanzen als eigener Punkt "Codes" (siehe MUSS WEG-Tabelle). Sonst wie Admin (AD-CO).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/codes`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/buchungen (Hallen-Buchung, Desktop)
Beleg: buchung_desktop_buchungen.png (Messung: 2596 px hoch, 20 von 67 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 b896e093)
Bewertung: Hallen-Buchungen: 5 Auftraege als Karten mit Status, Halle, Notiz, Nachweis und Speichern; unter jedem der Link "Finanzen zu diesem Spiel", der fuer diese Rolle ins Leere fuehrt (AR-BU-1). Sonst wie Admin (AD-BU).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-BU-1; Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] Link "Finanzen zu diesem Spiel" verspricht eine Seite, die die Rolle nicht oeffnen darf: AR-BU-1 |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/buchungen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-BU-1 | P1 | Sackgasse mit stiller Umleitung: Auf /admin/buchungen steht unter jedem der 5 Auftraege "Finanzen zu diesem Spiel" (Link /admin/finanzen/spiel/<ID>); die Rolle Hallen-Buchung darf diese Seite nicht (Recht finance). Klick (Playwright) endet auf /app ohne Erklaerung. Ein sichtbarer Link der Rolle selbst fuehrt ins Leere. | buchung_desktop_buchungen.png, buchung_mobil_buchungen.png | critique [Heuristik 3, 4]; Playwright-Klick |

##### /admin/hallen (Hallen-Buchung, Desktop)
Beleg: buchung_desktop_hallen.png (Messung: 2760 px hoch, 19 von 63 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 5486aa3b)
Bewertung: Hallen und Preise: Standardpreise, Neue Halle, Alle Hallen (5) mit Betreiber-Zuweisung. Wie Admin (AD-HA), aber die Rolle sieht Kosten und Marge und kann Betreiber zuweisen (AR-BU-2); am Handy bleibt die Betreiberzeile unlesbar (AD-HA-1, 61 px).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-BU-2; Seitenfunde siehe Admin-Blatt (AD-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele unter 44 px wie AD-ALL-10; keine neuen Funde |
| distill | [Remove redundancy] Kosten/Marge und Betreiber-Zuweisung gehen ueber die Rolle hinaus: AR-BU-2 |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Desktop] wie AD-ALL-4 (gestreckte Handyansicht); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/hallen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-BU-2 | P2 | Hallen und Preise fuer Hallen-Buchung: die Rolle sieht Standardpreise, Kosten und Marge (Finanzzahlen; das Preisformular ist nur fuer Finanzen sichtbar, laut Quelltext canPrices) und darf Hallen anlegen, aktivieren und "Betreiber zuweisen". Letzteres vergibt Zugang zur Betreiberseite /halle (Rechtevergabe) und steht damit neben der Rollenvergabe der Nutzerliste. Klaerung, ob so gewollt (Vertrag 009). | buchung_desktop_hallen.png, buchung_mobil_hallen.png | critique [Heuristik 5] |

##### /admin/moderation (Moderation, Handy)
Beleg: moderator_mobil_moderation.png (Messung: 1929 px hoch, 33 von 59 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 e0eb1866)
Bewertung: Moderation: Warteschlange mit 5 Eintraegen (Rafael, Gerd 2x, Sven, Quirin), je Eintrag drei Aktionen. Gleich zur Admin-Seite (AD-MO, AM-MO); die Rolle Moderation kann damit arbeiten, sieht aber keine Sperrkennzeichnung (AR-MO-1).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-MO-1; Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-MO-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Finanzen, Handy)
Beleg: finanz_mobil_finanzen.png (Messung: 1721 px hoch, 15 von 43 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 597a95fc)
Bewertung: Finanzen mit 3 Alarmen und 10 Kacheln, darunter Aufladungen, Rabatt-Boni und "Offene Guthaben (Schuld an Spieler)" (Altmodell, siehe MUSS WEG-Tabelle). Inhaltlich wie beim Admin (AD-FI), keine rollenspezifischen Abweichungen.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/finanzen/ausgaben (Finanzen, Handy)
Beleg: finanz_mobil_finanzen-ausgaben.png (Messung: 1578 px hoch, 16 von 50 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 f82831d5)
Bewertung: Ausgabenseite mit Formular und 4 Ausgaben (192,50 EUR); gleiche Seite wie beim Admin (AD-FA). Rolle Finanzen kommt ueber den Knopf "Ausgaben" der Finanzseite hierher.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen/ausgaben`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/finanzen/spiel/ID (Finanzen, Handy)
Beleg: finanz_mobil_finanzen-spiel-ID.png (Messung: 1268 px hoch, 12 von 44 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 07d9ce71)
Bewertung: Spiel-Finanzen "Seed Blau gegen Seed Gelb" mit Kacheln 0,00 EUR und "Niemand hat bezahlt", Ausgabeformular. Gleich zum Admin (AD-FS); erreichbar nur ueber Links aus Finanzen oder Ausgaben, nicht ueber die Navigation.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/codes (Finanzen, Handy)
Beleg: finanz_mobil_codes.png (Messung: 1722 px hoch, 15 von 52 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 3c238860)
Bewertung: Rabattcodes (3 Codes SEED10, SEEDFIX5, SEEDNEU20, Formular mit Aufladungs-Begriffen): komplettes Altmodell, in der Navigation der Rolle Finanzen als eigener Punkt "Codes" (siehe MUSS WEG-Tabelle). Sonst wie Admin (AD-CO).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/codes`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Keine Funde.

##### /admin/buchungen (Hallen-Buchung, Handy)
Beleg: buchung_mobil_buchungen.png (Messung: 2972 px hoch, 16 von 67 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 efa18cc4)
Bewertung: Hallen-Buchungen: 5 Auftraege als Karten mit Status, Halle, Notiz, Nachweis und Speichern; unter jedem der Link "Finanzen zu diesem Spiel", der fuer diese Rolle ins Leere fuehrt (AR-BU-1). Sonst wie Admin (AD-BU).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-BU-1; Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] keine neuen Funde |
| clarify | [Labels, Fehler] Link "Finanzen zu diesem Spiel" verspricht eine Seite, die die Rolle nicht oeffnen darf: AR-BU-1 |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/buchungen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-BU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/hallen (Hallen-Buchung, Handy)
Beleg: buchung_mobil_hallen.png (Messung: 3192 px hoch, 15 von 63 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler; MD5 91d7418c)
Bewertung: Hallen und Preise: Standardpreise, Neue Halle, Alle Hallen (5) mit Betreiber-Zuweisung. Wie Admin (AD-HA), aber die Rolle sieht Kosten und Marge und kann Betreiber zuweisen (AR-BU-2); am Handy bleibt die Betreiberzeile unlesbar (AD-HA-1, 61 px).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 3, 4, 5; Persona Alex] Funde/Verweise AR-BU-2; Seitenfunde siehe Admin-Blatt (AM-Seitenkuerzel), nicht doppelt |
| audit | [A11y, Responsive] Ziele/Zielabstand wie AM-ALL-5; keine neuen Funde |
| distill | [Remove redundancy] Kosten/Marge und Betreiber-Zuweisung gehen ueber die Rolle hinaus: AR-BU-2 |
| clarify | [Labels, Fehler] keine neuen Funde (Seitenfunde im Admin-Blatt) |
| adapt | [Mobile] wie AM-ALL-4/-5 (Karten, untere Navigation); Navigation fuer die Rolle einzeilig |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/hallen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-BU-2 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Moderation, Desktop; Umleitung auf /app)
Beleg: moderator_desktop_nutzer.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen desktop (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 8f74937b)
Bewertung: Die Rolle Moderation darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Das ist der Kernfall der stillen Umleitung.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] Funde AR-ZU-1, AR-ZU-2, AR-KM-2 |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Desktop] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-ZU-1 | P1 | Zugriff ohne Recht endet still: Die Adresse springt auf /app, es erscheint die Spieler-Startseite ("Hey Seed", "So startest du", Team gruenden); keine Meldung wie "Dafuer fehlt dir die Berechtigung", kein Hinweis, welche Rolle noetig waere, kein Weg zurueck in den erlaubten Bereich. Gilt fuer Moderation (14 von 16 Seiten), Finanzen (11), Hallen-Buchung (13) sowie Spieler und Hallenbetreiber (16 von 16). Gemessen: Status 200, Zielpfad /app, kein role=alert. | moderator_desktop_nutzer.png, finanz_mobil_nutzer.png, buchung_desktop_nutzer.png | critique [Heuristik 1, 9], clarify [Fehler und Berechtigungen] |
| AR-ZU-2 | P2 | Die Weiterleitung geschieht serverseitig innerhalb der Seite; auch ein Spieler, der /admin nur aus Neugier oder durch einen alten Lesezeichenlink aufruft, bekommt dieselbe stille Antwort. Ein Lesezeichen auf eine Admin-Seite (z. B. nach Rollenentzug) wirkt wie eine kaputte Adresse. Bewusste Gestaltung einer Zugriffsseite (Erklaerung plus Link) fehlt. | spieler_desktop_nutzer.png | clarify [Fehler und Berechtigungen] |
| AR-KM-2 | P2 | Nach dem Anmelden landet jede Teilrolle auf /app (Spieler-Startseite "Hey Seed", Team gruenden), nicht auf /admin; der einzige Weg in den Arbeitsbereich ist Konto-Menue, dann "Admin" (achter von neun Eintraegen zwischen Hilfe und Abmelden). Fuer Mitarbeiter mit Teilrolle ist das ein Umweg bei jedem Arbeitsbeginn. | buchung_desktop_extra-kontomenue.png, buchung_desktop_nutzer.png | critique [Heuristik 7] |

##### /admin/nutzer (Finanzen, Desktop; Umleitung auf /app)
Beleg: finanz_desktop_nutzer.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen desktop (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 8f74937b)
Bewertung: Die Rolle Finanzen darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Identisch mit dem Befund der Zelle moderator_desktop_nutzer.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 (Verweis) |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Desktop] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Hallen-Buchung, Desktop; Umleitung auf /app)
Beleg: buchung_desktop_nutzer.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen desktop (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 8f74937b)
Bewertung: Die Rolle Hallen-Buchung darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Identisch mit dem Befund der Zelle moderator_desktop_nutzer.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 (Verweis) |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Desktop] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Moderation, Handy; Umleitung auf /app)
Beleg: moderator_mobil_nutzer.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen mobil (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 703206d7)
Bewertung: Die Rolle Moderation darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Identisch mit dem Befund der Zelle moderator_mobil_nutzer.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 (Verweis) |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Mobile] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Finanzen, Handy; Umleitung auf /app)
Beleg: finanz_mobil_nutzer.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen mobil (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 703206d7)
Bewertung: Die Rolle Finanzen darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Identisch mit dem Befund der Zelle moderator_mobil_nutzer.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 (Verweis) |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Mobile] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Hallen-Buchung, Handy; Umleitung auf /app)
Beleg: buchung_mobil_nutzer.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit allen Umleitungs-Zellen mobil (Moderation, Finanzen, Buchung, Spieler mit Halle: MD5 703206d7)
Bewertung: Die Rolle Hallen-Buchung darf /admin/nutzer nicht; sie landet ohne Meldung auf der Spieler-Startseite "Hey Seed" mit Onboarding. Identisch mit dem Befund der Zelle moderator_mobil_nutzer.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 (Verweis) |
| audit | [A11y] Seite ist die Spieler-Startseite (X-Befunde); kein role=alert, kein Fokus auf Hinweis: AR-ZU-1 |
| distill | [Remove redundancy] fuer die Umleitung nicht anwendbar; Spieler-Onboarding ("So startest du", Team gruenden) ist fuer Mitarbeiter ueberfluessig: Verweis AR-ZU-1 |
| clarify | [Fehler und Berechtigungen] keine Erklaerung, kein Rollenhinweis, kein Link zur erlaubten Seite: AR-ZU-1 |
| adapt | [Mobile] Zielseite siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Gast, Desktop; Weiterleitung auf Anmeldung)
Beleg: gast_desktop_uebersicht.png (MD5 9006f607, Zielpfad /anmelden?next=%2Fadmin, 1280x800); bildgleich mit den anderen drei Gast-Zellen desktop
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), was fuer /admin richtig ist. Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] Funde AR-GA-2 |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next korrekt (/admin) |
| adapt | [Desktop] schmale Spalte, ruhig; keine neuen Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-GA-2 | P2 | Die Anmeldeseite sagt dem Gast nicht, warum er hier ist (keine Zeile "Fuer den Admin-Bereich bitte anmelden"); sie ist fuer alle vier Zugriffsversuche (Uebersicht, Nutzer, Finanzen, Moderation) bildgleich (MD5 9006f607 desktop, 9839f78d Handy). Der Hinweis "AUTH_GOOGLE_ID fehlt" ist nur Dev (andere Blaetter). | gast_desktop_uebersicht.png, gast_mobil_uebersicht.png | clarify [Fehler und Berechtigungen] |

##### /admin/nutzer (Gast, Desktop; Weiterleitung auf Anmeldung)
Beleg: gast_desktop_nutzer.png (MD5 9006f607, Zielpfad /anmelden?next=%2Fadmin, 1280x800); bildgleich mit den anderen drei Gast-Zellen desktop
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/nutzer (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] Funde AR-GA-1, AR-GA-3 |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Desktop] schmale Spalte, ruhig; keine neuen Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-GA-1 | P1 | `next` verliert die Unterseite: Gast auf /admin/nutzer, /admin/finanzen/spiel/<ID> oder jeder anderen Admin-Unterseite wird auf /anmelden?next=%2Fadmin umgeleitet (immer /admin), weil der Admin-Rahmen (layout.tsx) requirePermission("dashboard") mit dem Standardwert "/admin" aufruft, bevor die Seite ihr eigenes Ziel nennen kann. Nach der Anmeldung geht es auf /admin, nicht zur gewuenschten Seite. Gegenprobe: /halle behaelt next=%2Fhalle; ein von Hand gesetztes next=%2Fadmin%2Fbuchungen wird nach der Anmeldung eingehalten (Landung /admin/buchungen). | gast_desktop_nutzer.png, gast_mobil_finanzen.png | critique [Heuristik 3, 7]; Messung Playwright (Gast-Lauf) |
| AR-GA-3 | P2 | Roh-Anfrage ohne Browser an /admin/nutzer lieferte Status 200 ohne Location-Kopf (Weiterleitung kommt im gestreamten Seitentext). Ob die Weiterleitung ohne JavaScript greift und was Suchmaschinen oder Tools sehen, wurde nicht geprueft. | gast_desktop_nutzer.png | Messung Playwright (ctx.request, maxRedirects 0) |

##### /admin/finanzen (Gast, Desktop; Weiterleitung auf Anmeldung)
Beleg: gast_desktop_finanzen.png (MD5 9006f607, Zielpfad /anmelden?next=%2Fadmin, 1280x800); bildgleich mit den anderen drei Gast-Zellen desktop
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/finanzen (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-1 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Desktop] schmale Spalte, ruhig; keine neuen Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-GA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Gast, Desktop; Weiterleitung auf Anmeldung)
Beleg: gast_desktop_moderation.png (MD5 9006f607, Zielpfad /anmelden?next=%2Fadmin, 1280x800); bildgleich mit den anderen drei Gast-Zellen desktop
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/moderation (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-1 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Desktop] schmale Spalte, ruhig; keine neuen Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-GA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Gast, Handy; Weiterleitung auf Anmeldung)
Beleg: gast_mobil_uebersicht.png (MD5 9839f78d, Zielpfad /anmelden?next=%2Fadmin, 390x955); bildgleich mit den anderen drei Gast-Zellen mobil
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), was fuer /admin richtig ist. Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-2 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next korrekt (/admin) |
| adapt | [Mobile] untere Spielernavigation fuer Gast, Kopfleiste mit "Anmelden"; keine neuen Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-GA-2 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Gast, Handy; Weiterleitung auf Anmeldung)
Beleg: gast_mobil_nutzer.png (MD5 9839f78d, Zielpfad /anmelden?next=%2Fadmin, 390x955); bildgleich mit den anderen drei Gast-Zellen mobil
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/nutzer (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-1 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Mobile] untere Spielernavigation fuer Gast, Kopfleiste mit "Anmelden"; keine neuen Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-GA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Gast, Handy; Weiterleitung auf Anmeldung)
Beleg: gast_mobil_finanzen.png (MD5 9839f78d, Zielpfad /anmelden?next=%2Fadmin, 390x955); bildgleich mit den anderen drei Gast-Zellen mobil
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/finanzen (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-1 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Mobile] untere Spielernavigation fuer Gast, Kopfleiste mit "Anmelden"; keine neuen Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-GA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Gast, Handy; Weiterleitung auf Anmeldung)
Beleg: gast_mobil_moderation.png (MD5 9839f78d, Zielpfad /anmelden?next=%2Fadmin, 390x955); bildgleich mit den anderen drei Gast-Zellen mobil
Bewertung: Der Gast landet auf der Anmeldeseite (Titel "Anmelden", Dev-Login), verliert aber die Zielseite /admin/moderation (next bleibt /admin). Sie nennt nicht, warum man hier ist; die Seite ist sauber und ohne Ueberlauf.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 3, 7; Persona Jordan] identischer Befund: AR-GA-1 (Verweis) |
| audit | [A11y, Responsive] Formular mit Labels, Fokus sichtbar (X-Blaetter); keine Funde |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] fehlender Anlass-Hinweis: AR-GA-2; next zu grob: AR-GA-1 |
| adapt | [Mobile] untere Spielernavigation fuer Gast, Kopfleiste mit "Anmelden"; keine neuen Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-GA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Spieler, Desktop; Umleitung auf /app)
Beleg: spieler_desktop_uebersicht.png (MD5 7bfa8cc4, Zielpfad /app, 2542 px hoch, 19 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen desktop
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Normaler Nutzer: Umleitung vertretbar, aber ohne Wort.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] Verweis AR-ZU-1, AR-ZU-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Spieler, Desktop; Umleitung auf /app)
Beleg: spieler_desktop_nutzer.png (MD5 7bfa8cc4, Zielpfad /app, 2542 px hoch, 19 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen desktop
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Spieler, Desktop; Umleitung auf /app)
Beleg: spieler_desktop_finanzen.png (MD5 7bfa8cc4, Zielpfad /app, 2542 px hoch, 19 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen desktop
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Spieler, Desktop; Umleitung auf /app)
Beleg: spieler_desktop_moderation.png (MD5 7bfa8cc4, Zielpfad /app, 2542 px hoch, 19 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen desktop
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Spieler, Handy; Umleitung auf /app)
Beleg: spieler_mobil_uebersicht.png (MD5 d3fb2d0a, Zielpfad /app, 3436 px hoch, 15 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen mobil
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Spieler, Handy; Umleitung auf /app)
Beleg: spieler_mobil_nutzer.png (MD5 d3fb2d0a, Zielpfad /app, 3436 px hoch, 15 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen mobil
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Spieler, Handy; Umleitung auf /app)
Beleg: spieler_mobil_finanzen.png (MD5 d3fb2d0a, Zielpfad /app, 3436 px hoch, 15 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen mobil
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Spieler, Handy; Umleitung auf /app)
Beleg: spieler_mobil_moderation.png (MD5 d3fb2d0a, Zielpfad /app, 3436 px hoch, 15 von 62 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler), bildgleich mit den anderen drei Spieler-Zellen mobil
Bewertung: Der Spieler "Anton" landet auf seiner vollen Startseite (aktuelle Spiele, Kacheln, Meine Teams); ohne Hinweis, dass /admin nicht fuer ihn ist. Identisch zur Zelle spieler_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] keine Funde |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Spieler mit Halle, Desktop; Umleitung auf /app)
Beleg: halle_desktop_uebersicht.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 8f74937b)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Kernfall fuer AR-HA-2.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] Funde AR-HA-2, AR-HA-4; Verweis AR-ZU-1 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-HA-2 | P1 | Offene Anfragen mit Frist bleiben auf /app unsichtbar: /halle zeigt 2 offene Spielanfragen (u. a. "Antwort bis Mi., 11.11., 14:04 Uhr, sonst gilt die Halle als belegt"), die Startseite des Betreibers nennt nichts davon (kein Zaehler, keine Karte; Text "Noch keine Spiele", "Du bist noch in keinem Team"). Ob Benachrichtigungen die Anfrage melden, wurde nicht belegt. Wer die Fusszeile nicht findet, verpasst die Frist. | halle_desktop_uebersicht.png, halle_desktop_extra-halle.png | critique [Heuristik 1] |
| AR-HA-4 | P2 | Der Betreiber ist fuer die Oberflaeche ein ganz normaler Spieler: Begruessung "Hey Seed", Profilzeile "Flexibel . Essen", Onboarding "Team gruenden". Die Rolle Betreiber (manager_user_id) erscheint in keinem Menue und keiner Anzeige; die Admin-Hallenliste zeigt nur "zugewiesen" ohne Name. | halle_desktop_uebersicht.png, halle_mobil_extra-kontomenue.png | critique [Heuristik 2] |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Spieler mit Halle, Desktop; Umleitung auf /app)
Beleg: halle_desktop_nutzer.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 8f74937b)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Spieler mit Halle, Desktop; Umleitung auf /app)
Beleg: halle_desktop_finanzen.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 8f74937b)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Spieler mit Halle, Desktop; Umleitung auf /app)
Beleg: halle_desktop_moderation.png (MD5 8f74937b, Zielpfad /app, 1396 px hoch, 13 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 8f74937b)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_desktop_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Desktop] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin (Spieler mit Halle, Handy; Umleitung auf /app)
Beleg: halle_mobil_uebersicht.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 703206d7)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/nutzer (Spieler mit Halle, Handy; Umleitung auf /app)
Beleg: halle_mobil_nutzer.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 703206d7)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/nutzer`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/finanzen (Spieler mit Halle, Handy; Umleitung auf /app)
Beleg: halle_mobil_finanzen.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 703206d7)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/finanzen`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /admin/moderation (Spieler mit Halle, Handy; Umleitung auf /app)
Beleg: halle_mobil_moderation.png (MD5 703206d7, Zielpfad /app, 2166 px hoch, 9 von 48 Zielen unter 44 px, kein Ueberlauf, 0 Konsolenfehler); bildgleich mit den Umleitungs-Zellen der Teilrollen (MD5 703206d7)
Bewertung: Der Hallenbetreiber landet auf der Neukunden-Startseite ("So startest du", "Team gruenden"); nichts zeigt seine zwei offenen Hallenanfragen. Identisch zur Zelle halle_mobil_uebersicht.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 9; Persona Jordan] identischer Befund (gleiches Bild): AR-ZU-1, AR-HA-2 |
| audit | [A11y] Spieler-Startseite (X-Blaetter), kein role=alert: AR-ZU-1 |
| distill | [Remove redundancy] Onboarding-Karte fuer einen Betreiber ueberfluessig: AR-HA-4 (Verweis) |
| clarify | [Fehler und Berechtigungen] keine Erklaerung: AR-ZU-1 |
| adapt | [Mobile] siehe X-Blaetter; kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin/moderation`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-ZU-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Moderation, Desktop)
Beleg: moderator_desktop_extra-kontomenue.png (MD5 20e3aa16; Menuetext per Playwright: "Seed Moderation | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Moderation steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] Funde AR-KM-1; neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Desktop] Menue ueber dem Seiteninhalt, 240 px breit, deckt die Aufgabenkarten; keine Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-KM-1 | P1 | Konto-Menue ohne Rollenanzeige: Kopfzeile nur "Seed Moderation" (Anzeigename), keine Zeile "Rolle: Moderation". Der Menuepunkt heisst fuer jede Teilrolle "Admin". Die Rolle ist nur ueber die Navigationsleiste erschliessbar; ROLE_LABEL (Moderation, Finanzen, Hallen-Buchung) existiert im Code, wird aber nur in der Nutzerliste benutzt. | moderator_desktop_extra-kontomenue.png, finanz_mobil_extra-kontomenue.png | clarify [Labels], critique [Heuristik 1] |

##### extra-kontomenue (Finanzen, Desktop)
Beleg: finanz_desktop_extra-kontomenue.png (MD5 01af2f5e; Menuetext per Playwright: "Seed Finanzen | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Finanzen steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] identischer Befund: AR-KM-1 (Verweis); neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Desktop] Menue ueber dem Seiteninhalt, 240 px breit, deckt die Aufgabenkarten; keine Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-KM-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Hallen-Buchung, Desktop)
Beleg: buchung_desktop_extra-kontomenue.png (MD5 0100ee01; Menuetext per Playwright: "Seed Buchung | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Hallen-Buchung steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] identischer Befund: AR-KM-1 (Verweis); neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Desktop] Menue ueber dem Seiteninhalt, 240 px breit, deckt die Aufgabenkarten; keine Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-KM-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Moderation, Handy)
Beleg: moderator_mobil_extra-kontomenue.png (MD5 8123d20b; Menuetext per Playwright: "Seed Moderation | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Moderation steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] identischer Befund: AR-KM-1 (Verweis); neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Mobile] Menue deckt die Haelfte der Aufgabenkarten, untere Navigation bleibt sichtbar; keine Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-KM-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Finanzen, Handy)
Beleg: finanz_mobil_extra-kontomenue.png (MD5 d6eb3562; Menuetext per Playwright: "Seed Finanzen | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Finanzen steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] identischer Befund: AR-KM-1 (Verweis); neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Mobile] Menue deckt die Haelfte der Aufgabenkarten, untere Navigation bleibt sichtbar; keine Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-KM-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Hallen-Buchung, Handy)
Beleg: buchung_mobil_extra-kontomenue.png (MD5 94da4a37; Menuetext per Playwright: "Seed Buchung | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Admin | Abmelden"; Link Admin -> /admin)
Bewertung: Menue mit neun Eintraegen; "Admin" fuehrt auf /admin (richtig). Die Rolle Hallen-Buchung steht nirgends, nur der Anzeigename. "Guthaben 0,00 EUR" ist Altmodell (siehe MUSS WEG).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 6; Persona Alex, Jordan] identischer Befund: AR-KM-1 (Verweis); neun Eintraege ueber der 4-Item-Grenze (Cognitive Load) |
| audit | [A11y] Menue mit role=menu und Escape-Schliessen (Quelltext UserMenu.tsx): in Ordnung |
| distill | [Remove redundancy] "Mein Bereich" und "Konto und Einstellungen" und "Mein Profil" nah beieinander; "Guthaben" Altmodell: keine neuen Funde ausser MUSS WEG |
| clarify | [Labels] "Admin" statt Rolle; "Konto und Einstellungen" gegen Startseitenknopf "Einstellungen": AR-KM-1 |
| adapt | [Mobile] Menue deckt die Haelfte der Aufgabenkarten, untere Navigation bleibt sichtbar; keine Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/admin`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-KM-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-kontomenue (Betreiber, Desktop)
Beleg: halle_desktop_extra-kontomenue.png (MD5 0048ae05; Menuetext: "Seed Hallenbetreiber | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Abmelden"; kein Admin-Eintrag, kein Link nach /halle)
Bewertung: Das Menue des Betreibers ist das eines normalen Spielers (acht Eintraege). Es gibt keinen Punkt "Hallenanfragen" oder "Meine Halle"; /halle ist von hier nicht erreichbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 6, 7; Persona Jordan] Funde AR-HA-1 |
| audit | [A11y] role=menu, Escape: in Ordnung |
| distill | [Remove redundancy] keine Funde (ausser MUSS WEG Guthaben) |
| clarify | [Labels] fehlender Betreiber-Eintrag: AR-HA-1 |
| adapt | [Desktop] Menue ueber Startseite; keine Funde |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-HA-1 | P1 | Kein Weg fuer den Hallenbetreiber von /app nach /halle ausser dem Fusszeilenlink "Fuer Hallenbetreiber" (13 px, gleichrangig mit Impressum und Spieler). Das Konto-Menue hat keinen Eintrag "Hallenanfragen" (Name "Seed Hallenbetreiber", sonst nur Profil, Bereich, Guthaben, Benachrichtigungen, Einstellungen, Hilfe), die Startseite keine Kachel. Der Betreiber (Spieler mit manager_user_id) wird nach der Anmeldung auf /app gestellt und muss die Fusszeile erkennen; der Link ist als Werbung fuer neue Betreiber formuliert, nicht als "meine Halle". | halle_desktop_extra-kontomenue.png, halle_desktop_extra-fusszeile-app.png, halle_mobil_extra-fusszeile-app.png | critique [Heuristik 6, 7], adapt [Navigation Strategy] |

##### extra-fusszeile-app (Betreiber, Desktop)
Beleg: halle_desktop_extra-fusszeile-app.png (MD5 23e609a2; Links mit "/halle" auf /app per Playwright: "Fuer Hallenbetreiber -> /halle" in der Fusszeile, "Hallen -> /hallen" in der Fusszeile; sonst keine)
Bewertung: Der einzige Weg zu /halle: ein 13-px-Link in der Fusszeile, neben Impressum, Spieler, Hallen und Mitspieler gesucht. Am Desktop erst nach Scrollen sichtbar (Fusszeile ganz unten).

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 6, 7, 8; Persona Jordan] Funde AR-HA-1 (Detail) |
| audit | [A11y, Responsive] Zielhoehe des Fusszeilenlinks klein (13 px Schrift), Kontrast mittel (X-Blaetter): kein neuer Fund |
| distill | [Remove redundancy] 13 Links in der Fusszeile (X-07): nur Verweis |
| clarify | [Labels] "Fuer Hallenbetreiber" liest sich wie Werbung fuer neue Betreiber, nicht wie "Meine Halle": AR-HA-1 |
| adapt | [Desktop] Fusszeile zwei Zeilen; kein neuer Fund |
| detect | `detect --json --viewport 1280x800 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt), kein Fund; Quelltext `detect --json src/app/admin/page.tsx layout.tsx`: 0 Funde, Exit 0 |

Verweise: AR-HA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /halle (Betreiber, Desktop)
Beleg: halle_desktop_extra-halle.png (MD5 50d757fb, Seitenhoehe 800 px; Text: "Spielanfragen fuer eure Halle" mit 2 Anfragen Seed-Halle Nord, Spiel #1375 und #1391)
Bewertung: Kurze, klare Seite: Titel, Erklaersatz, pro Anfrage Halle, Termin, Teams, Frist und drei Knoepfe ("Halle ist frei" primaer, "Halle ist belegt", "Lobby ansehen"). Gut fuer die Aufgabe; es fehlen Rueckfrage, Hallen-Unterscheidung und ein Weg zu den eigenen Hallendaten. 

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 5, 6; Persona Alex] Funde AR-HA-3; Hauptaktion klar |
| audit | [A11y, Responsive] Knoepfe 36 px hoch (!min-h-9, Quelltext), Frist 12-px-Text; sonst in Ordnung |
| distill | [Remove redundancy] Erklaersatz drei Zeilen; "Lobby ansehen" gleichrangig zu den Antworten: kein Fund |
| clarify | [Labels, Destruktive Aktionen] "Halle ist belegt" ohne Folge-Hinweis ("Teams wechseln"): AR-HA-3 |
| adapt | [Desktop] 672-px-Spalte ohne Mehrwert der Breite; kein neuer Fund |
| detect URL | `detect --json --viewport 1280x800 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), nur overused-font (gesetzt); Quelltext `detect --json src/app/halle`: 0 Funde, Exit 0 |

| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-HA-3 | P2 | /halle: klare Seite mit einer Hauptaktion ("Halle ist frei") und einer zweiten ("Halle ist belegt"), Frist als 12-px-Satz. Schwaechen: beide Knoepfe wirken laut Quelltext (ActionButton) sofort ohne Rueckfrage; die zwei Karten tragen denselben Hallennamen und unterscheiden sich nur durch den Termin; Datum ohne Jahr; Titel "eure Halle" im Singular obwohl mehrere Hallen moeglich; keine Kopfnavigation "Meine Hallen". Klick wurde nicht ausgeloest. | halle_desktop_extra-halle.png, halle_mobil_extra-halle.png | critique [Heuristik 5], clarify [Destruktive Aktionen] |

##### extra-kontomenue (Betreiber, Handy)
Beleg: halle_mobil_extra-kontomenue.png (MD5 d1f9d02e; Menuetext: "Seed Hallenbetreiber | Mein Profil | Mein Bereich | Guthaben 0,00 EUR | Benachrichtigungen | Konto und Einstellungen | Hilfe | Abmelden"; kein Admin-Eintrag, kein Link nach /halle)
Bewertung: Das Menue des Betreibers ist das eines normalen Spielers (acht Eintraege). Es gibt keinen Punkt "Hallenanfragen" oder "Meine Halle"; /halle ist von hier nicht erreichbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 6, 7; Persona Jordan] identischer Befund: AR-HA-1 (Verweis) |
| audit | [A11y] role=menu, Escape: in Ordnung |
| distill | [Remove redundancy] keine Funde (ausser MUSS WEG Guthaben) |
| clarify | [Labels] fehlender Betreiber-Eintrag: AR-HA-1 |
| adapt | [Mobile] Menue ueber Startseite, untere Spielernavigation; keine Funde |
| detect | `detect --json --viewport 390x844 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-HA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### extra-fusszeile-app (Betreiber, Handy)
Beleg: halle_mobil_extra-fusszeile-app.png (MD5 0f0fc400; Links mit "/halle" auf /app per Playwright: "Fuer Hallenbetreiber -> /halle" in der Fusszeile, "Hallen -> /hallen" in der Fusszeile; sonst keine)
Bewertung: Der einzige Weg zu /halle: ein 13-px-Link in der Fusszeile, neben Impressum, Spieler, Hallen und Mitspieler gesucht. Am Handy liegt er unter der fixen unteren Navigation, nach langem Scrollen erreichbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 6, 7, 8; Persona Jordan] identischer Befund: AR-HA-1 (Verweis) |
| audit | [A11y, Responsive] Zielhoehe des Fusszeilenlinks klein (13 px Schrift), Kontrast mittel (X-Blaetter): kein neuer Fund |
| distill | [Remove redundancy] 13 Links in der Fusszeile (X-07): nur Verweis |
| clarify | [Labels] "Fuer Hallenbetreiber" liest sich wie Werbung fuer neue Betreiber, nicht wie "Meine Halle": AR-HA-1 |
| adapt | [Mobile] Fusszeile am Handy vier Zeilen (AM-ALL-3); kein neuer Fund |
| detect | `detect --json --viewport 390x844 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), straggler (X-13) und overused-font (gesetzt), kein Rollenfund; Quelltext `detect --json --viewport 390x844 src/app/admin`-Dateien: 0 Funde, Exit 0 |

Verweise: AR-HA-1 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

##### /halle (Betreiber, Handy)
Beleg: halle_mobil_extra-halle.png (MD5 07d8f416, Seitenhoehe 1050 px; Text: "Spielanfragen fuer eure Halle" mit 2 Anfragen Seed-Halle Nord, Spiel #1375 und #1391)
Bewertung: Kurze, klare Seite: Titel, Erklaersatz, pro Anfrage Halle, Termin, Teams, Frist und drei Knoepfe ("Halle ist frei" primaer, "Halle ist belegt", "Lobby ansehen"). Gut fuer die Aufgabe; es fehlen Rueckfrage, Hallen-Unterscheidung und ein Weg zu den eigenen Hallendaten. Am Handy brechen die drei Knoepfe auf zwei Zeilen, bedienbar.

| Durchgang | Ergebnis |
|---|---|
| critique | [Heuristik 1, 5, 6; Persona Alex] identischer Befund: AR-HA-3 (Verweis); Hauptaktion klar |
| audit | [A11y, Responsive] Knoepfe 36 px hoch (!min-h-9, Quelltext), Frist 12-px-Text; sonst in Ordnung |
| distill | [Remove redundancy] Erklaersatz drei Zeilen; "Lobby ansehen" gleichrangig zu den Antworten: kein Fund |
| clarify | [Labels, Destruktive Aktionen] "Halle ist belegt" ohne Folge-Hinweis ("Teams wechseln"): AR-HA-3 |
| adapt | [Mobile] Knopfumbruch, untere Navigation deckt Fusszeile; kein neuer Fund |
| detect URL | `detect --json --viewport 390x844 http://localhost:3102/halle`: Anmeldeseite (ohne Sitzung), straggler und overused-font; Quelltext `detect --json src/app/halle`: 0 Funde, Exit 0 |

Verweise: AR-HA-3 (siehe Erstnennung). Keine neuen Funde in dieser Zelle.

#### Fundverzeichnis (Erstnennung)

Hinweis: Dieses Verzeichnis ist ein Index der Funde in den Zellen oben (Wiederholung, jede ID kommt zweimal vor) und zählt nicht zusätzlich.


| ID | Prio | Beschreibung | Beleg-Datei | Befehl |
|---|---|---|---|---|
| AR-UE-1 | P1 | Die Uebersicht ist fuer alle drei Teilrollen dieselbe Seite wie fuer den Plattform-Admin (nur die Navigationsleiste unterscheidet sich, Bilder bis auf die Nav gleich): sechs Kennzahlen zu Nutzern, Teams, Suchen und Spielen sowie die Aufgaben "Streitfall" und "Ohne Ergebnis". Keine Kachel gehoert zur Rolle: Moderation sieht nicht die 5 offenen Meldungen, Finanzen nicht die 3 Alarme der Finanzseite, Buchung nicht die offenen Buchungsauftraege. Die Startseite beantwortet "Was ist fuer mich zu tun?" nicht. | moderator_desktop_uebersicht.png, finanz_desktop_uebersicht.png, buchung_desktop_uebersicht.png | critique [Heuristik 2, 6; Persona Alex] |
| AR-UE-2 | P2 | Die beiden Aufgabenkarten (Streitfall, Ohne Ergebnis) fuehren jede Teilrolle auf die oeffentliche Spielseite /spiele/ID; keine der drei Teilrollen hat dort nachweislich eine passende Aktion (ob Entscheiden dort moeglich ist, bleibt wie in AD-UE-3 offen). Die Karte verspricht eine Aufgabe, die die Rolle nicht erledigen darf. | moderator_desktop_uebersicht.png | critique [Heuristik 1, 3] |
| AR-UE-3 | P2 | Seitentitel und Begruessung heissen fuer jede Teilrolle "Admin" (AD-UE-4); die Rolle (Moderation, Finanzen, Hallen-Buchung) steht nirgends im Titel oder der Begruessung. Wer sich im falschen Konto angemeldet hat, merkt es nicht. | finanz_desktop_uebersicht.png, buchung_mobil_uebersicht.png | clarify [Labels] |
| AR-UE-4 | P2 | Teilrollen sehen Gesamtzahlen "Nutzer 42" und "Teams 9", obwohl sie weder Nutzer- noch Teamliste oeffnen duerfen (Recht admin). Klaerung: Datensparsamkeit oder bewusst gewollte Orientierung. | finanz_desktop_uebersicht.png | critique [Heuristik 8] |
| AR-KM-1 | P1 | Konto-Menue ohne Rollenanzeige: Kopfzeile nur "Seed Moderation" (Anzeigename), keine Zeile "Rolle: Moderation". Der Menuepunkt heisst fuer jede Teilrolle "Admin". Die Rolle ist nur ueber die Navigationsleiste erschliessbar; ROLE_LABEL (Moderation, Finanzen, Hallen-Buchung) existiert im Code, wird aber nur in der Nutzerliste benutzt. | moderator_desktop_extra-kontomenue.png, finanz_mobil_extra-kontomenue.png | clarify [Labels], critique [Heuristik 1] |
| AR-KM-2 | P2 | Nach dem Anmelden landet jede Teilrolle auf /app (Spieler-Startseite "Hey Seed", Team gruenden), nicht auf /admin; der einzige Weg in den Arbeitsbereich ist Konto-Menue, dann "Admin" (achter von neun Eintraegen zwischen Hilfe und Abmelden). Fuer Mitarbeiter mit Teilrolle ist das ein Umweg bei jedem Arbeitsbeginn. | buchung_desktop_extra-kontomenue.png, buchung_desktop_nutzer.png | critique [Heuristik 7] |
| AR-ZU-1 | P1 | Zugriff ohne Recht endet still: Die Adresse springt auf /app, es erscheint die Spieler-Startseite ("Hey Seed", "So startest du", Team gruenden); keine Meldung wie "Dafuer fehlt dir die Berechtigung", kein Hinweis, welche Rolle noetig waere, kein Weg zurueck in den erlaubten Bereich. Gilt fuer Moderation (14 von 16 Seiten), Finanzen (11), Hallen-Buchung (13) sowie Spieler und Hallenbetreiber (16 von 16). Gemessen: Status 200, Zielpfad /app, kein role=alert. | moderator_desktop_nutzer.png, finanz_mobil_nutzer.png, buchung_desktop_nutzer.png | critique [Heuristik 1, 9], clarify [Fehler und Berechtigungen] |
| AR-ZU-2 | P2 | Die Weiterleitung geschieht serverseitig innerhalb der Seite; auch ein Spieler, der /admin nur aus Neugier oder durch einen alten Lesezeichenlink aufruft, bekommt dieselbe stille Antwort. Ein Lesezeichen auf eine Admin-Seite (z. B. nach Rollenentzug) wirkt wie eine kaputte Adresse. Bewusste Gestaltung einer Zugriffsseite (Erklaerung plus Link) fehlt. | spieler_desktop_nutzer.png | clarify [Fehler und Berechtigungen] |
| AR-GA-1 | P1 | `next` verliert die Unterseite: Gast auf /admin/nutzer, /admin/finanzen/spiel/<ID> oder jeder anderen Admin-Unterseite wird auf /anmelden?next=%2Fadmin umgeleitet (immer /admin), weil der Admin-Rahmen (layout.tsx) requirePermission("dashboard") mit dem Standardwert "/admin" aufruft, bevor die Seite ihr eigenes Ziel nennen kann. Nach der Anmeldung geht es auf /admin, nicht zur gewuenschten Seite. Gegenprobe: /halle behaelt next=%2Fhalle; ein von Hand gesetztes next=%2Fadmin%2Fbuchungen wird nach der Anmeldung eingehalten (Landung /admin/buchungen). | gast_desktop_nutzer.png, gast_mobil_finanzen.png | critique [Heuristik 3, 7]; Messung Playwright (Gast-Lauf) |
| AR-GA-2 | P2 | Die Anmeldeseite sagt dem Gast nicht, warum er hier ist (keine Zeile "Fuer den Admin-Bereich bitte anmelden"); sie ist fuer alle vier Zugriffsversuche (Uebersicht, Nutzer, Finanzen, Moderation) bildgleich (MD5 9006f607 desktop, 9839f78d Handy). Der Hinweis "AUTH_GOOGLE_ID fehlt" ist nur Dev (andere Blaetter). | gast_desktop_uebersicht.png, gast_mobil_uebersicht.png | clarify [Fehler und Berechtigungen] |
| AR-GA-3 | P2 | Roh-Anfrage ohne Browser an /admin/nutzer lieferte Status 200 ohne Location-Kopf (Weiterleitung kommt im gestreamten Seitentext). Ob die Weiterleitung ohne JavaScript greift und was Suchmaschinen oder Tools sehen, wurde nicht geprueft. | gast_desktop_nutzer.png | Messung Playwright (ctx.request, maxRedirects 0) |
| AR-MO-1 | P2 | Moderation: die Warteschlange zeigt Verwarnungen je Nutzer ("3 Verwarnungen" bei Sven Gesperrt), aber weder eine Sperrkennzeichnung noch eine Sperrmoeglichkeit; Sperren liegt bei der Rolle Plattform-Admin (Seite Nutzer, fuer Moderation nicht erlaubt). Die Rolle sieht, dass jemand mehrfach auffaellt, kann es aber nicht weitergeben (kein "An Admin melden"). | moderator_desktop_moderation.png | critique [Heuristik 7], distill |
| AR-BU-1 | P1 | Sackgasse mit stiller Umleitung: Auf /admin/buchungen steht unter jedem der 5 Auftraege "Finanzen zu diesem Spiel" (Link /admin/finanzen/spiel/<ID>); die Rolle Hallen-Buchung darf diese Seite nicht (Recht finance). Klick (Playwright) endet auf /app ohne Erklaerung. Ein sichtbarer Link der Rolle selbst fuehrt ins Leere. | buchung_desktop_buchungen.png, buchung_mobil_buchungen.png | critique [Heuristik 3, 4]; Playwright-Klick |
| AR-BU-2 | P2 | Hallen und Preise fuer Hallen-Buchung: die Rolle sieht Standardpreise, Kosten und Marge (Finanzzahlen; das Preisformular ist nur fuer Finanzen sichtbar, laut Quelltext canPrices) und darf Hallen anlegen, aktivieren und "Betreiber zuweisen". Letzteres vergibt Zugang zur Betreiberseite /halle (Rechtevergabe) und steht damit neben der Rollenvergabe der Nutzerliste. Klaerung, ob so gewollt (Vertrag 009). | buchung_desktop_hallen.png, buchung_mobil_hallen.png | critique [Heuristik 5] |
| AR-HA-1 | P1 | Kein Weg fuer den Hallenbetreiber von /app nach /halle ausser dem Fusszeilenlink "Fuer Hallenbetreiber" (13 px, gleichrangig mit Impressum und Spieler). Das Konto-Menue hat keinen Eintrag "Hallenanfragen" (Name "Seed Hallenbetreiber", sonst nur Profil, Bereich, Guthaben, Benachrichtigungen, Einstellungen, Hilfe), die Startseite keine Kachel. Der Betreiber (Spieler mit manager_user_id) wird nach der Anmeldung auf /app gestellt und muss die Fusszeile erkennen; der Link ist als Werbung fuer neue Betreiber formuliert, nicht als "meine Halle". | halle_desktop_extra-kontomenue.png, halle_desktop_extra-fusszeile-app.png, halle_mobil_extra-fusszeile-app.png | critique [Heuristik 6, 7], adapt [Navigation Strategy] |
| AR-HA-2 | P1 | Offene Anfragen mit Frist bleiben auf /app unsichtbar: /halle zeigt 2 offene Spielanfragen (u. a. "Antwort bis Mi., 11.11., 14:04 Uhr, sonst gilt die Halle als belegt"), die Startseite des Betreibers nennt nichts davon (kein Zaehler, keine Karte; Text "Noch keine Spiele", "Du bist noch in keinem Team"). Ob Benachrichtigungen die Anfrage melden, wurde nicht belegt. Wer die Fusszeile nicht findet, verpasst die Frist. | halle_desktop_uebersicht.png, halle_desktop_extra-halle.png | critique [Heuristik 1] |
| AR-HA-3 | P2 | /halle: klare Seite mit einer Hauptaktion ("Halle ist frei") und einer zweiten ("Halle ist belegt"), Frist als 12-px-Satz. Schwaechen: beide Knoepfe wirken laut Quelltext (ActionButton) sofort ohne Rueckfrage; die zwei Karten tragen denselben Hallennamen und unterscheiden sich nur durch den Termin; Datum ohne Jahr; Titel "eure Halle" im Singular obwohl mehrere Hallen moeglich; keine Kopfnavigation "Meine Hallen". Klick wurde nicht ausgeloest. | halle_desktop_extra-halle.png, halle_mobil_extra-halle.png | critique [Heuristik 5], clarify [Destruktive Aktionen] |
| AR-HA-4 | P2 | Der Betreiber ist fuer die Oberflaeche ein ganz normaler Spieler: Begruessung "Hey Seed", Profilzeile "Flexibel . Essen", Onboarding "Team gruenden". Die Rolle Betreiber (manager_user_id) erscheint in keinem Menue und keiner Anzeige; die Admin-Hallenliste zeigt nur "zugewiesen" ohne Name. | halle_desktop_uebersicht.png, halle_mobil_extra-kontomenue.png | critique [Heuristik 2] |

#### Zaehler

- Angesehen: 62 von 62 Screenshots (50 Zellen der Matrix: Moderation 6, Finanzen 12, Hallen-Buchung 8, Gast 8, Spieler 8, Spieler mit Halle 8; dazu 12 Zusatzaufnahmen: Konto-Menue Moderation/Finanzen/Buchung je 2, Betreiber Konto-Menue, Fusszeile und /halle je 2), je Bild einzeln mit Read geoeffnet; sehr lange Bilder (Buchungen 2596 px, Hallen 2760 px Desktop; Buchungen 2972 px, Hallen 3192 px, Spieler 3436 px Handy) wurden verkleinert gesehen.
- Durchgaenge: je Zelle critique, audit, distill, clarify, adapt als eigene Zeilen plus detect (URL und Quelltext); `context` einmal; alle gelaufen. Keine Timeouts.
- Neue Funde (Erstnennung): P0 0, P1 7, P2 11; gesamt 18.
