# 006 – Privatspiel: Miete teilen, Fristen, Einladungslink
Status: Freigegeben (2026-11-10)
Version: 5 (v5 2026-11-12: Zahlung durch Vertrag 012: Karte hinterlegen, Abbuchung zur Frist (Buchung), Erstattung per Stripe-Refund, kein Guthaben und kein Parken; Frist-, Zusage- und Tausch-Regeln unverändert; davor v4 (letzte inhaltliche Änderung 2026-11-11; v4 2026-11-10: Zusage der Halle ist Buchungsbedingung, falls die Halle Zugang hat (Vertrag 011); davor v3 plus Nachtrag 1-h-Abbruch 2026-11-10; v3 2026-11-10: kein Mindestvorlauf von 48 h, sofortige Buchung bei kurzem Vorlauf, Captain-Tausch als Folgeauftrag; davor v2 plus Review-Nachbesserung: neue Frist-Regel 48 h für alle Modi, Geld bleibt in der Lobby geparkt; ersetzt die 24-h-Regel aus Version 1)

## Ziel
Eine Person organisiert ein Spiel für ihre Freundesgruppe (Standard 10 Spieler), das nicht öffentlich ist und nur per Einladungslink (z. B. WhatsApp) erreichbar. Das Privatspiel funktioniert im Code weitgehend (Erstellen, Link, Beitritt auch für neu Registrierte, Einteilung manuell/zufällig, keine Rangliste). Dieser Vertrag legt das Geldmodell fest und schließt die Lücken: Jeder hinterlegt eine Karte und trägt Miete ÷ Spielerzahl; abgebucht wird erst zur Frist (Buchung) (Vertrag 012), und das Spiel wird per "Bereit" beider Captains fixiert. Die einzige Frist ist 48 Stunden vor Anstoß: Bis dahin ist die Lobby offen (Karte hinterlegen, Bereit, Austritt ohne Geldbewegung). Zur Frist schließt die Lobby automatisch: Hat nicht jeder eine Karte hinterlegt oder haben nicht alle Captains "Bereit" gedrückt, fällt das Spiel aus (bereits Abgebuchte bekommen per Stripe-Refund auf die Karte ihr Geld zurück); sonst wird abgebucht, gebucht und das Geld geht an den Veranstalter. Danach gibt es keine Absage und keine Erstattung. Spiele mit weniger als 48 Stunden Vorlauf sind erlaubt (Mindestvorlauf bleibt 1 Stunde): Dort gibt es keine Frist außer dem 1-h-Abbruch, es wird sofort abgebucht und gebucht, sobald bei allen eine Karte hinterlegt ist und beide Captains "Bereit" gedrückt haben. Hat die Halle einen Zugang nach Vertrag 011, ist ihre Zusage zusätzlich Bedingung der Buchung (auch bei Sofortbuchung unter 48 h); ohne Zusage fällt das Spiel zur 48-h-Frist bzw. 1 Stunde vor Anstoß aus und Abgebuchte bekommen ihr Geld auf die Karte zurück. Der Veranstalter trägt nie einen Fehlbetrag. Das Modell ist zugleich Vorbild für das Teamspiel (eigener Backlog-Eintrag).

## Nutzer und Rollen
- Veranstalter: legt das Spiel an, ist Team-Admin (Captain) beider Spiel-Teams, teilt ein, wirft Spieler raus, zieht den Link zurück oder erzeugt ihn neu, hinterlegt selbst eine Karte und trägt seinen Anteil.
- Captain: Team-Admin eines Spiel-Teams (im Privatspiel standardmäßig der Veranstalter für beide Teams).
- Spieler: tritt per Link bei, hinterlegt eine Karte, kann bis 48 h vor Anstoß austreten (ohne Geldbewegung, es wurde noch nichts abgebucht).
- Neuer Nutzer: registriert sich über den Link und landet im Spiel.
- Platform-Admin: nicht betroffen; eine Absage geschieht nur durch den Schließ-Job zur 48-h-Frist, es gibt keine manuelle Absage und keinen Admin-Fallback.

## Entscheidungen (vom Nutzer, 2026-11-09; v2 am 2026-11-10, G1 erteilt)
- Miete wird durch die tatsächliche Spielerzahl geteilt, in allen Modi. Für Teamspiel und Turnier gilt Vertrag 008; 006 führt das gemeinsame Rechenmodul beim Privatspiel ein.
- Der Veranstalter kann den Einladungslink zurückziehen und neu erzeugen.
- Miete ist Pflicht (Betrag oder ausdrücklich "kostenlos" = 0 €); kein stiller Plattformpreis.
- Ablauf: Jeder hinterlegt eine Karte (Vertrag 012). Hat bei einem Team jeder eine Karte hinterlegt, drückt dessen Captain "Bereit". Haben beide Captains "Bereit" gedrückt, steht der Preis fest.
- v2, Frist-Regel für alle Modi (Privat, Team, Turnier): Es gibt keine 24-h-Frist und keinen 24-h-Job mehr (der 24-h-Mindestvorlauf im Teamspiel ist keine Frist). Die einzige Frist ist 48 Stunden vor Anstoß.
- v2, bis zur Frist ist die Lobby offen: Spieler hinterlegen Karten, Captains drücken "Bereit". Es wird nichts abgebucht; abgebucht wird einmal zur Frist (Buchung) (Vertrag 012), und das Geld geht erst bei der Buchung an den Veranstalter.
- v2, zur 48-h-Frist schließt die Lobby automatisch. Hat nicht jeder eine Karte hinterlegt oder haben nicht alle Captains "Bereit" gedrückt, fällt das Spiel aus (Erstattung bereits Abgebuchter auf die Karte per Stripe-Refund). Sonst wird abgebucht und gebucht.
- v2, nach der Frist gibt es keine Absage und keine Erstattung. Fällt jemand aus, gilt der Folgeauftrag: Captain tauscht gegen Ersatz (der Ersatz ist ein registrierter Soccaz-Nutzer; die Zahlung zwischen beiden läuft außerhalb von Soccaz) (siehe Abschnitt Folgeauftrag).
- Oberfläche (Teamspiel / Privatspiel / Turnier getrennt) ist Vertrag 007.

## Annahmen (Orchestrator-Vorschlag, vom Nutzer am 2026-11-09 bestätigt; Neuberechnung vom Nutzer korrigiert; v2-Annahmen am 2026-11-10 vom Orchestrator bestätigt)
- Spielerzahl = Anzahl der Teilnehmer, die einem Spiel-Team zugeteilt sind (mindestens 4, höchstens 22, gerade Zahl wie heute). Der Anteil ist Miete ÷ Spielerzahl, aufgerundet; der Überschuss (weniger als die Spielerzahl in Cent) bleibt bei der Plattform.
- Neu gerechnet wird nur vor dem zweiten "Bereit": Bis dahin ist der Anteil Miete ÷ aktuelle Spielerzahl. Ändert sich die Zahl, wird der Anteil neu angezeigt (keine Geldbewegung bis zur Frist (Buchung)), und "Bereit" beider Teams wird zurückgesetzt.
- Mit dem zweiten "Bereit" wird die Spielerzahl festgeschrieben und der Preis ist fest. Abgebucht wird erst zur Frist (v2, Vertrag 012); die Verbuchung an den Veranstalter folgt danach.
- v2 Annahme (bestätigt), nur bei Anlage mit mindestens 48 h Vorlauf: Austritt oder Rauswurf bis 48 h vor Anstoß bedeutet Wegfall des Platzes ohne Geldbewegung (es wurde noch nichts abgebucht). Der Austritt hebt die Festschreibung auf: Spielerzahl wieder offen, Neuberechnung beim nächsten Beitritt oder Austritt, "Bereit" beider Teams zurückgesetzt. Der alte Austausch eins zu eins mit Erstattung erst bei Ersatzzahlung entfällt vor der Frist.
- v2 Annahme (bestätigt): Abbuchung und Buchung ("automatisch buchen") passieren zur 48-h-Frist, nicht mehr beim zweiten "Bereit"; genau einmal (Zeilensperre, idempotenter Schlüssel). Beim zweiten "Bereit" wird nur der Preis fixiert.
- v2 Annahme (bestätigt), gilt nur für Spiele mit mindestens 48 h Vorlauf bei Anlage: Ab 48 h vor Anstoß ist die Teilnehmerliste gesperrt (kein Austritt, kein Rauswurf, kein neuer Beitritt) und es gibt keine Erstattung; bis zur Frist sind Austritt und Rauswurf mit Erstattung möglich und der Beitritt ist offen. Bei Anlage unter 48 h gilt das nicht: Beitritt und Kartenhinterlegung sind bis zur Buchung oder zum 1-h-Abbruch offen, Austritt und Rauswurf von Anfang an gesperrt (siehe unten); der Schalter `BLOCK_PRIVATE_JOIN_BEFORE_FIX` entfällt mit der Umsetzung. Der Captain-Tausch nach der Frist ist Folgeauftrag (siehe Abschnitt Folgeauftrag).
- Nutzerentscheid v3 (Variante 2), Mindestvorlauf: Es gibt keinen 48-h-Mindestvorlauf. Spiele mit weniger als 48 h Vorlauf sind erlaubt; für das Privatspiel bleibt der Mindestvorlauf bei 1 Stunde; Teamspiel und Matchmaking behalten 24 Stunden (Vertrag 008).
- Annahme (Altspiele, bestätigt): Alle vor der Migration 0034 angelegten Spiele (auch Privatspiele) bleiben bis zum Anstoß im alten Modell (`legacy_share_model = true`); die Frist-Regel dieses Vertrags gilt für Neuspiele.
- Nutzerentscheid v3, Spiele unter 48 h Vorlauf: Es wird sofort abgebucht und gebucht, sobald bei allen eine Karte hinterlegt ist (bei "kostenlos" entfällt das) UND beide Captains "Bereit" gedrückt haben. Es gibt dort keinen Austritt und keinen Rauswurf mit Erstattung und keine Frist außer dem 1-h-Abbruch (siehe nächster Punkt).
- Annahme (bestätigt) zu Spielen unter 48 h: Die Liste ist für Austritt und Rauswurf von Anfang an gesperrt; Beitritt und Kartenhinterlegung bleiben bis zur Buchung möglich, danach ist die Liste ganz gesperrt.
- Nutzerentscheid v3, 1-h-Abbruch (bestätigt): Bei Anlage unter 48 h bleibt die Lobby offen (Beitritt und Kartenhinterlegung, kein Austritt) bis 1 Stunde vor Anstoß. Fehlt dann bei jemandem die Karte ODER haben nicht beide Captains "Bereit" gedrückt, wird das Spiel abgesagt (Abgebuchte bekommen eine Erstattung auf die Karte). Sind vorher alle Karten hinterlegt und beide "Bereit", wird sofort abgebucht und gebucht. Das ist der einzige Abbruchzeitpunkt unter 48 h; ein Spiel mit genau 1 h Vorlauf wird bei der Anlage sofort geprüft.
- Wechsel von Halle oder Termin vor der Buchung hebt die Fixierung auf; der Anteil wird wie bei einer Änderung der Spielerzahl neu angezeigt (keine Geldbewegung bis zur Frist (Buchung), "Bereit" zurückgesetzt; Vertrag 011 AC-15).
- Beim Privatspiel beträgt der Mindestvorlauf bei Hallen mit Zugang 2 Stunden (Vertrag 011 AC-16), sonst bleibt es bei 1 Stunde. "Halle mit Zugang" heißt: Zuordnung aus Vertrag 011 M1; bis dahin gelten alle Hallen als ohne Zugang.
- Annahme (bestätigt): Zwei Buchungszeitpunkte. Ab 48 h Vorlauf wird zur 48-h-Frist gebucht, unter 48 h sofort, sobald bei allen eine Karte hinterlegt ist und beide Captains "Bereit" sind (und, falls die Halle Zugang hat, die Halle zugesagt hat).
- Nutzerentscheid v4: Die Zusage der Halle ist IMMER Buchungsbedingung, falls die Halle Zugang hat (Vertrag 011). Buchung = alle Karten hinterlegt + beide Captains "Bereit" + Zusage, auch bei Sofortbuchung unter 48 h. Antwortfrist der Halle = das Minimum aus 12 Stunden und der Zeit bis 1 Stunde vor Anstoß. Ab 48 h Vorlauf ohne Zusage: Absage zur 48-h-Frist (nichts abgebucht, daher keine Geldbewegung). Unter 48 h ohne Zusage: Absage 1 Stunde vor Anstoß (Abgebuchte per Stripe-Refund auf die Karte). Hat die Halle keinen Zugang, entfällt die Bedingung.
- Bei "kostenlos" (0 €) entfällt Karte und Abbuchung; "Bereit" beider Captains bleibt Voraussetzung, sonst fällt das Spiel zur Frist aus.
- "Gedeckt" heißt: alle Teilnehmer haben eine Karte hinterlegt ("Karte hinterlegt" = Bereit-Voraussetzung; Gebühr für Spieler: keine).

## Nicht-Ziele
- Teamspiel- und Turnier-Umstellung auf das gemeinsame Rechenmodul (eigener Backlog-Eintrag).
- Trennung der Oberfläche und Navigation (007).
- Privatsphäre-Härtung der öffentlichen Team- und Lobby-Seiten (Backlog-Eintrag 3).
- Zahlung für andere Spieler (Captain/Spieler zahlen für Mitspieler) im Privatspiel.
- Wertung bei Nichterscheinen: `recordLateCancel` mit 24-h-Grenze entfällt mit der 24-h-Regel; eine Nachfolge-Wertung ist ein eigener Backlog-Eintrag (Nr. 10).
- Rangliste oder Statistik für Privatspiele; weiterhin ausgeschlossen.
- Mehr als zwei Teams, eigene Hallenwahl oder Hallenbuchung durch Spieler.
- Änderung der Plattform-Gebühren (die Aufladung entfällt durch Vertrag 012).

## Folgeauftrag nach der Frist-Regel
- Captain-Tausch nach der 48-h-Frist: Ein Captain tauscht einen Spieler gegen einen Ersatz, der registrierter Soccaz-Nutzer ist, ohne Zahlung über Soccaz (Nutzerentscheid 2026-11-10: Ja, Soccaz bekommt die Funktion). Eigener Vertrag mit ACs folgt kurz (Backlog 9); Produktfragen gehen an den Orchestrator. In diesem Vertrag ist er nicht umgesetzt.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Veranstalter legt ein Privatspiel an | Er gibt keine Miete an | Fehler; gültig sind ein Betrag (0 bis 1000 €) oder ausdrücklich "kostenlos" (0 €); Standard 10 Spieler, gerade 4 bis 22; bei kostenlos gibt es keine Zahlung | tests/integration/privategame.test.ts |
| AC-2 | Miete 12000 Cent, n Teilnehmer | Der Anteil wird berechnet | Anteil = aufgerundet Miete ÷ n für jedes n von 4 bis 22, ohne Deckel bei 12 und ohne Mindestwert 8 | tests/unit/money.test.ts |
| AC-3 | Privatspiel, Zahlungen an, Team mit Spielern ohne Karte | Captain ruft "Bereit" auf (Server-Aktion) | Abgelehnt; sobald bei allen Teamspielern eine Karte hinterlegt ist, gelingt "Bereit" ("Bereit" = Karte hinterlegt, nicht bezahlt; Gebühr für Spieler: keine) | tests/integration/privategame.test.ts |
| AC-4 | Beide Captains haben "Bereit" gedrückt | Das zweite "Bereit" kommt an (auch parallel) | Preis steht fest, nichts abgebucht (erst zur Frist), nichts an den Veranstalter gebucht, Hauptbuch ausgeglichen | tests/integration/privategame.test.ts |
| AC-5 | Vor dem zweiten "Bereit", Spieler hat eine Karte hinterlegt (Austritt und Rauswurf nur bei Anlage mit mindestens 48 h Vorlauf; bei Anlage unter 48 h gibt es keinen Austritt und keinen Rauswurf, nur Beitritt) | Er tritt aus, sein Captain wirft ihn raus oder jemand tritt bei | Anteil neu angezeigt, keine Geldbewegung bis zur Frist (Buchung); "Bereit" beider Teams wird zurückgesetzt | tests/integration/privategame.test.ts |
| AC-6 | Nutzer ist weder Captain des Teams noch Veranstalter | Er versucht einen Spieler rauszuwerfen oder einzuteilen | Abgelehnt; Rauswurf und Entfernen sind für bereite Spieler (Karte hinterlegt) nur durch den Captain möglich (ohne Geldbewegung), und nur bei Anlage mit mindestens 48 h Vorlauf und vor der Frist (bei Anlage unter 48 h von Anfang an gesperrt) | tests/integration/privategame.test.ts |
| AC-7 | Spiel mit mindestens 48 h Vorlauf bei Anlage; nach dem zweiten "Bereit" (Preis fest), mehr als 48 h bis Anstoß | Ein Spieler tritt aus oder wird vom Captain entfernt | Keine Geldbewegung (nichts abgebucht), Festschreibung aufgehoben, "Bereit" beider Teams zurückgesetzt; ein Ersatz hinterlegt eine Karte und trägt den dann gültigen Anteil | tests/integration/privategame.test.ts |
| AC-8 | Spiel mit mindestens 48 h Vorlauf bei Anlage, jetzt weniger als 48 h bis Anstoß (Frist vorbei, Lobby geschlossen) | Spieler tritt aus, Captain wirft raus oder jemand tritt bei (Server-Aktion) | Abgelehnt; der Captain-Tausch gegen Ersatz ist Folgeauftrag, Zahlung außerhalb von Soccaz | tests/integration/privategame.test.ts |
| AC-9 | 48 h vor Anstoß (einzige Frist), nicht überall eine Karte hinterlegt (bei kostenlos entfällt das) oder nicht beide Captains "Bereit" oder keine Zusage der Halle (falls Halle mit Zugang) | Der Schließ-Job läuft (auch bei "kostenlos": dann zählt nur "Bereit") | Spiel fällt aus, nichts wird abgebucht, Veranstalter trägt keine Differenz; sind alle Karten hinterlegt, beide Captains "Bereit" und (falls Halle mit Zugang) die Halle hat zugesagt: Abbuchung und Buchung genau einmal (Vertrag 012), Geld an den Veranstalter, Spiel bleibt bestätigt; kein 24-h-Job, keine 1-h-Absage für Spiele mit mindestens 48 h Vorlauf bei Anlage | tests/integration/privategame.test.ts |
| AC-10 | Veranstalter hat einen Einladungslink | Er zieht ihn zurück oder erzeugt einen neuen | Alter Link zeigt "ungültig", neuer Link funktioniert, bereits Beigetretene bleiben im Spiel; Nicht-Veranstalter wird abgelehnt | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-11 | Neuer, nicht eingeloggter Nutzer öffnet den Link | Er registriert sich | Er landet im Spiel (Regression) | tests/e2e/privatspiel.spec.ts |
| AC-12 | Nicht beteiligter oder anonymer Nutzer | Er ruft `/spiele/{id}`, die Live-API oder das Overlay eines Privatspiels auf | Kein Zugriff (Fehlerseite bzw. 404/403); das Privatspiel erscheint nicht in Listen und nicht in Rangliste/Statistik | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-13 | Zufällige Einteilung | Veranstalter startet sie; Nicht-Veranstalter versucht es | Teams ausgeglichen; Nicht-Veranstalter abgelehnt; Rückgängig-Sperre bei bereit/Karte hinterlegt | tests/integration/privategame.test.ts |
| AC-14 | Veranstalter sieht den Einladungslink | Er klickt auf Teilen per WhatsApp | Der Teilen-Link enthält den Einladungslink | tests/e2e/privatspiel.spec.ts |
| AC-15 | Gesamtablauf | Anlegen, Link teilen, 10 Spieler treten bei (einer neu registriert), alle hinterlegen eine Karte, beide Captains "Bereit", Preis fix, 48-h-Frist erreicht | Spiel ist abgebucht, bestätigt und gebucht, nicht öffentlich, nicht in der Rangliste | tests/e2e/privatspiel.spec.ts |
| AC-16 | Nach der 48-h-Frist | Jemand versucht Absage oder Erstattung (Server-Aktion, Job) | Abgelehnt bzw. kein Lauf; keine Erstattung | tests/integration/privategame.test.ts |
| AC-17 | Veranstalter legt ein Spiel mit Anstoß in 30 Stunden an (weniger als 48 h, mehr als 1 h) | Anlage; danach Austritt oder Rauswurf versucht | Anlage gelingt (Mindestvorlauf nur 1 h; Anstoß in unter 1 h wird abgelehnt); Austritt und Rauswurf abgelehnt; Beitritt und Kartenhinterlegung bis zur Buchung oder zum 1-h-Abbruch möglich | tests/integration/privategame.test.ts |
| AC-18 | Spiel mit weniger als 48 h Vorlauf, bei allen ist eine Karte hinterlegt (bei "kostenlos" entfällt das), Zusage der Halle liegt vor (falls Halle mit Zugang) | Beide Captains haben "Bereit" gedrückt (auch parallel) | Sofort abgebucht und gebucht, genau einmal, Geld an den Veranstalter, Spiel bestätigt, Liste ganz gesperrt; vorher keine Buchung; fehlt die Zusage der Halle (falls Halle mit Zugang), keine Buchung | tests/integration/privategame.test.ts |
| AC-19 | Spiel mit weniger als 48 h Vorlauf (Anlage unter 48 h), 1 Stunde vor Anstoß | Nicht überall eine Karte hinterlegt (bei "kostenlos" entfällt das) oder nicht beide Captains "Bereit" oder keine Zusage der Halle (falls Halle mit Zugang); der 1-h-Job läuft | Spiel abgesagt, nichts abgebucht (bereits Abgebuchte per Stripe-Refund auf die Karte), Veranstalter trägt keine Differenz, Hauptbuch ausgeglichen, Lauf genau einmal; waren vorher alle Karten hinterlegt, beide "Bereit" und (falls Halle mit Zugang) die Zusage da, ist es längst gebucht und wird nicht abgesagt | tests/integration/privategame.test.ts |

## Meilensteine
Reihenfolge seriell (gemeinsame Dateien: `wallet.ts`, `lobby.ts`, `privategame.ts`).
- M1: Rechenmodul, Pflicht-Miete, Bereit/Buchung (AC-1, AC-2, AC-3, AC-4)
- M2: Austritt, Rauswurf, 48-h-Frist, Schließen und Absage (AC-5, AC-6, AC-7, AC-8, AC-9, AC-17, AC-18, AC-19); die Bedingung "Zusage der Halle" in AC-9, AC-18 und AC-19 wird zusammen mit Vertrag 011 (M4) umgesetzt und geprüft; AC-16 (keine Absage nach der Frist) gehört zu M3
- M3: Link, Sichtbarkeit, Rechte, Teilen (AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16)

## Betroffene Bereiche
- Zusage der Halle als Buchungsbedingung und Antwortfrist: Schnittstelle zu Vertrag 011 (`src/server/hallen-dashboard` o. ä.), `src/server/wallet.ts`, `src/server/scheduled.ts` (Frist-Jobs berücksichtigen die Zusage)
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/privategame.ts`, `src/server/privategame-actions.ts`, `src/server/scheduled.ts` bzw. Jobs (48-h-Schließ-Job statt 24-h-Prüfung; 1-h-Absage entfällt für Spiele mit mindestens 48 h Vorlauf bei Anlage; zusätzlich 1-h-Job für Spiele mit weniger als 48 h Vorlauf, AC-19)
- `src/app/app/privatspiel/neu/*`, `src/app/spiel/[token]/page.tsx`, `src/app/lobby/[id]/page.tsx`, `src/components/ShareLink.tsx`
- `src/app/spiele/[id]/page.tsx`, `src/app/api/spiele/[id]/live/route.ts`, `src/app/overlay/[id]`
- Datenbank: Migration nur, wenn für Bereit-Stufe oder Link-Widerruf nötig (`game_invites`); wenn ja, additiv, in `docs/loop/GO-LIVE-AUDIT.md` eintragen.
- Tests: `tests/integration/privategame.test.ts`, `tests/unit/money.test.ts`, `tests/e2e/privatspiel.spec.ts`

## Risiken und Randfälle
- Rundung: Aufrunden erzeugt Überschuss unter n Cent; er darf nie zum Fehlbetrag führen.
- Nichtzahler zählen im Divisor mit: Die Miete ist nur gedeckt, wenn alle zahlen oder der Captain sie vorher entfernt.
- Parallele Abbuchungen, Austritte und zweites "Bereit": Zeilensperren und idempotente Buchungsschlüssel (`ledger.post`).
- Veranstalter ist Captain beider Teams: Ein Mensch drückt beide "Bereit" (zulässig, aber bei beiden Teams muss bei allen eine Karte hinterlegt sein).
- Spiel in weniger als 48 h angelegt: Lobby offen (Beitritt, Karte hinterlegen, kein Austritt) bis 1 h vor Anstoß, dann Absage (Erstattung auf die Karte, falls schon abgebucht) oder sofortige Abbuchung und Buchung (AC-17 bis AC-19). Der Abbruch-Job muss nachholbar sein und gebuchte Spiele nie absagen. Mindestvorlauf bleibt 1 h.
- Kein geparktes Geld mehr: Bis zur Frist (Buchung) wird nichts abgebucht (Vertrag 012); danach liegt das Geld in der Lobby (Hauptbuch), nicht beim Veranstalter. Absage erstattet per Stripe-Refund auf die Karte; Hauptbuch bleibt ausgeglichen.
- Fällt der Schließ-Job aus, bliebe die Lobby offen: Der Job muss nachholbar sein und nur noch nicht gebuchte Spiele anfassen.
- Link-Widerruf während jemand die Beitrittsseite offen hat: Beitritt mit altem Token schlägt kontrolliert fehl.

## Datenschutz / Sicherheit
- Abbuchungen und Erstattungen (Stripe, Vertrag 012): Idempotenz, Hauptbuch, Rechte (nur Captain/Veranstalter); Security-Review Pflicht.
- Sichtbarkeit: Privatspiel darf über `/spiele/{id}`, Live-API, Overlay und Listen nicht an Unbeteiligte gelangen (AC-12).
- Einladungslink ist ein Geheimnis: nur Veranstalter sieht ihn; Widerruf macht ihn unbrauchbar.
- Keine neuen personenbezogenen Daten.

## Offene Fragen
- Zusage der Halle: Wortlaut und Umsetzung der Antwortfrist stehen in Vertrag 011 (AC-9, AC-10, AC-13, AC-14).
- Keine offenen Fragen zum Geldmodell. Bestätigt: v2-Annahmen (Austritt = Erstattung mit Aufhebung der Festschreibung, Buchung erst zur Frist ab 48 h), v3-Entscheide (kein 48-h-Mindestvorlauf, sofortige Buchung unter 48 h, 1-h-Abbruch). Folgeaufträge als Backlog: Captain-Tausch nach der Frist (Nr. 9) und Wertung bei Nichterscheinen (Nr. 10).
- Die Auszahlung an den Veranstalter braucht vor Go-live einen Zahlungsdienstleister (siehe `docs/loop/GO-LIVE-AUDIT.md`); bis dahin nur Hauptbuch (Karte/Stripe-Testmodus, Vertrag 012); Spielerguthaben gibt es nicht mehr.

## End-to-End-Nachweis
`tests/e2e/privatspiel.spec.ts`: Veranstalter legt ein Privatspiel mit Miete an, teilt den Link, 10 Spieler treten bei (einer neu registriert), alle hinterlegen eine Karte, beide Captains drücken "Bereit", der Preis steht fest, zur 48-h-Frist wird abgebucht und gebucht, das Spiel ist weder öffentlich noch in der Rangliste sichtbar; ein dritter Lauf legt ein Spiel mit 30 h Vorlauf an und prüft die sofortige Abbuchung und Buchung nach allen hinterlegten Karten und beiden "Bereit", ein vierter Lauf mit 30 h Vorlauf prüft, dass 1 h vor Anstoß bei fehlender Karte oder fehlendem "Bereit" abgesagt (und Abgebuchte erstattet) wird; ein zweiter Lauf prüft, dass ein Spiel, bei dem zur 48-h-Frist nicht überall eine Karte hinterlegt ist oder nicht beide "Bereit" gedrückt haben, ausfällt (ohne Abbuchung); ein fünfter Lauf (Halle mit Zugang) prüft, dass ohne Zusage zur 48-h-Frist bzw. 1 h vor Anstoß abgesagt (und Abgebuchte erstattet) wird und mit Zusage gebucht wird.
