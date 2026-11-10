# 006 – Privatspiel: Miete teilen, Fristen, Einladungslink
Status: Freigegeben (2026-11-10)
Version: 2 (v2: neue Frist-Regel 48 h für alle Modi, Geld bleibt in der Lobby geparkt; ersetzt die 24-h-Regel aus Version 1)

## Ziel
Eine Person organisiert ein Spiel für ihre Freundesgruppe (Standard 10 Spieler), das nicht öffentlich ist und nur per Einladungslink (z. B. WhatsApp) erreichbar. Das Privatspiel funktioniert im Code weitgehend (Erstellen, Link, Beitritt auch für neu Registrierte, Einteilung manuell/zufällig, keine Rangliste). Dieser Vertrag legt das Geldmodell fest und schließt die Lücken: Jeder zahlt Miete ÷ Spielerzahl, das Geld bleibt in der Lobby geparkt, und das Spiel wird per "Bereit" beider Captains fixiert. Die einzige Frist ist 48 Stunden vor Anstoß: Bis dahin ist die Lobby offen (Zahlen, Bereit, Austritt mit Erstattung). Zur Frist schließt die Lobby automatisch: Haben nicht alle bezahlt oder nicht alle Captains "Bereit" gedrückt, fällt das Spiel aus und alle bekommen ihr Geld zurück; sonst wird gebucht und das Geld geht an den Veranstalter. Danach gibt es keine Absage und keine Erstattung. Der Veranstalter trägt nie einen Fehlbetrag. Das Modell ist zugleich Vorbild für das Teamspiel (eigener Backlog-Eintrag).

## Nutzer und Rollen
- Veranstalter: legt das Spiel an, ist Team-Admin (Captain) beider Spiel-Teams, teilt ein, wirft Spieler raus, zieht den Link zurück oder erzeugt ihn neu, zahlt selbst seinen Anteil.
- Captain: Team-Admin eines Spiel-Teams (im Privatspiel standardmäßig der Veranstalter für beide Teams).
- Spieler: tritt per Link bei, zahlt seinen Anteil, kann bis 48 h vor Anstoß austreten (mit Erstattung).
- Neuer Nutzer: registriert sich über den Link und landet im Spiel.
- Platform-Admin: nicht betroffen (Fallback bei Absage).

## Entscheidungen (vom Nutzer, 2026-11-09; v2 am 2026-11-10, G1 erteilt)
- Miete wird durch die tatsächliche Spielerzahl geteilt, in allen Modi. Für Teamspiel und Turnier gilt Vertrag 008; 006 führt das gemeinsame Rechenmodul beim Privatspiel ein.
- Der Veranstalter kann den Einladungslink zurückziehen und neu erzeugen.
- Miete ist Pflicht (Betrag oder ausdrücklich "kostenlos" = 0 €); kein stiller Plattformpreis.
- Ablauf: Jeder zahlt seinen Anteil. Hat ein Team vollständig bezahlt, drückt dessen Captain "Bereit". Haben beide Captains "Bereit" gedrückt, steht der Preis fest.
- v2, Frist-Regel für alle Modi (Privat, Team, Turnier): Es gibt keine 24-h-Regel und keinen 24-h-Job mehr. Die einzige Frist ist 48 Stunden vor Anstoß.
- v2, bis zur Frist ist die Lobby offen: Spieler zahlen, Captains drücken "Bereit". Das Geld bleibt in der Lobby geparkt (nicht an Veranstalter oder Halle gebucht) und geht erst bei der Buchung an den Veranstalter.
- v2, zur 48-h-Frist schließt die Lobby automatisch. Haben nicht alle bezahlt oder nicht alle Captains "Bereit" gedrückt, fällt das Spiel aus und alle bekommen ihr Guthaben zurück. Sonst wird gebucht.
- v2, nach der Frist gibt es keine Absage und keine Erstattung. Fällt jemand aus, tauscht der Captain den Spieler gegen Ersatz; die Zahlung zwischen beiden läuft außerhalb von Soccaz.
- Oberfläche (Teamspiel / Privatspiel / Turnier getrennt) ist Vertrag 007.

## Annahmen (Orchestrator-Vorschlag, vom Nutzer am 2026-11-09 bestätigt; Neuberechnung vom Nutzer korrigiert; v2-Annahmen mit "v2 ANNAHME" markiert)
- Spielerzahl = Anzahl der Teilnehmer, die einem Spiel-Team zugeteilt sind (mindestens 4, höchstens 22, gerade Zahl wie heute). Der Anteil ist Miete ÷ Spielerzahl, aufgerundet; der Überschuss (weniger als die Spielerzahl in Cent) bleibt bei der Plattform.
- Neu gerechnet wird nur vor dem zweiten "Bereit": Bis dahin ist der Anteil Miete ÷ aktuelle Spielerzahl. Ändert sich die Zahl, wird neu gerechnet: zu viel Gezahltes geht sofort als Guthaben zurück, zu wenig wird nachgefordert, und "Bereit" beider Teams wird zurückgesetzt.
- Mit dem zweiten "Bereit" wird die Spielerzahl festgeschrieben und der Preis ist fest. Das Geld bleibt dabei geparkt; die Verbuchung an den Veranstalter folgt erst zur Frist (v2).
- v2 ANNAHME: Austritt oder Rauswurf bis 48 h vor Anstoß bedeutet sofortige Erstattung (das Geld ist geparkt). Die Erstattung hebt die Festschreibung auf: Spielerzahl wieder offen, Neuberechnung beim nächsten Beitritt oder Austritt, "Bereit" beider Teams zurückgesetzt. Der alte Austausch eins zu eins mit Erstattung erst bei Ersatzzahlung entfällt vor der Frist.
- v2 ANNAHME: Die Buchung ("automatisch buchen") passiert zur 48-h-Frist, nicht mehr beim zweiten "Bereit"; genau einmal (Zeilensperre, idempotenter Schlüssel). Beim zweiten "Bereit" wird nur der Preis fixiert.
- v2 ANNAHME: Ab 48 h vor Anstoß ist die Teilnehmerliste gesperrt (kein Austritt, kein Rauswurf, kein neuer Beitritt). Der Captain tauscht Spieler nur gegen Ersatz; die Zahlung des Ersatzes läuft außerhalb von Soccaz, es gibt keine Erstattung.
- v2 ANNAHME: Spiel, das weniger als 48 h vor Anstoß angelegt wird: Die Frist ist bei Anlage schon überschritten. Die Lobby schließt dann sofort; da noch niemand bezahlt hat, fiele das Spiel aus. Deshalb Mindestvorlauf des Anstoßes 48 h statt heute 1 h, im Task bestätigen.
- "Gedeckt" heißt: alle Teilnehmer haben ihren Anteil bezahlt (Summe der bezahlten Anteile ≥ Miete).

## Nicht-Ziele
- Teamspiel- und Turnier-Umstellung auf das gemeinsame Rechenmodul (eigener Backlog-Eintrag).
- Trennung der Oberfläche und Navigation (007).
- Privatsphäre-Härtung der öffentlichen Team- und Lobby-Seiten (Backlog-Eintrag 3).
- Zahlung für andere Spieler (Captain/Spieler zahlen für Mitspieler) im Privatspiel.
- Rangliste oder Statistik für Privatspiele; weiterhin ausgeschlossen.
- Mehr als zwei Teams, eigene Hallenwahl oder Hallenbuchung durch Spieler.
- Änderung der Plattform-Gebühren oder der Aufladung.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Veranstalter legt ein Privatspiel an | Er gibt keine Miete an | Fehler; gültig sind ein Betrag (0 bis 1000 €) oder ausdrücklich "kostenlos" (0 €); Standard 10 Spieler, gerade 4 bis 22; bei kostenlos gibt es keine Zahlung | tests/integration/privategame.test.ts |
| AC-2 | Miete 12000 Cent, n Teilnehmer | Der Anteil wird berechnet | Anteil = aufgerundet Miete ÷ n für jedes n von 4 bis 22, ohne Deckel bei 12 und ohne Mindestwert 8 | tests/unit/money.test.ts |
| AC-3 | Privatspiel, Zahlungen an, Team mit unbezahlten Spielern | Captain ruft "Bereit" auf (Server-Aktion) | Abgelehnt; nach Zahlung aller Teamspieler gelingt "Bereit" | tests/integration/privategame.test.ts |
| AC-4 | Beide Captains haben "Bereit" gedrückt | Das zweite "Bereit" kommt an (auch parallel) | Preis steht fest, das Geld bleibt geparkt, nichts wird an den Veranstalter gebucht, Hauptbuch ausgeglichen | tests/integration/privategame.test.ts |
| AC-5 | Vor dem zweiten "Bereit", Spieler hat bezahlt | Er tritt aus, sein Captain wirft ihn raus oder jemand tritt bei | Anteil wird neu gerechnet: zu viel Gezahltes geht als Guthaben zurück, zu wenig wird nachgefordert; "Bereit" beider Teams wird zurückgesetzt | tests/integration/privategame.test.ts |
| AC-6 | Nutzer ist weder Captain des Teams noch Veranstalter | Er versucht einen Spieler rauszuwerfen oder einzuteilen | Abgelehnt; Rauswurf und Entfernen sind für bereite oder bezahlte Spieler nur durch den Captain mit Erstattung möglich | tests/integration/privategame.test.ts |
| AC-7 | Nach dem zweiten "Bereit" (Preis fest), mehr als 48 h bis Anstoß | Ein Spieler tritt aus oder wird vom Captain entfernt | Sofortige Erstattung des geparkten Anteils, Festschreibung aufgehoben, "Bereit" beider Teams zurückgesetzt; ein Ersatz zahlt den dann gültigen Anteil | tests/integration/privategame.test.ts |
| AC-8 | Weniger als 48 h bis Anstoß, Lobby geschlossen | Spieler tritt aus, Captain wirft raus oder jemand tritt bei (Server-Aktion) | Abgelehnt, keine Erstattung; der Captain tauscht Spieler nur gegen Ersatz, Zahlung außerhalb von Soccaz | tests/integration/privategame.test.ts |
| AC-9 | 48 h vor Anstoß (einzige Frist), nicht alle bezahlt oder nicht beide Captains "Bereit" | Der Schließ-Job läuft | Spiel fällt aus, alle bekommen ihren Anteil als Guthaben zurück, Veranstalter trägt keine Differenz; sind alle bezahlt und beide Captains "Bereit": Buchung genau einmal, Geld an den Veranstalter, Spiel bleibt bestätigt; kein 24-h-Job, keine 1-h-Absage | tests/integration/privategame.test.ts |
| AC-16 | Nach der 48-h-Frist | Jemand versucht Absage oder Erstattung (Server-Aktion, Job) | Abgelehnt bzw. kein Lauf; keine Erstattung | tests/integration/privategame.test.ts |
| AC-10 | Veranstalter hat einen Einladungslink | Er zieht ihn zurück oder erzeugt einen neuen | Alter Link zeigt "ungültig", neuer Link funktioniert, bereits Beigetretene bleiben im Spiel; Nicht-Veranstalter wird abgelehnt | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-11 | Neuer, nicht eingeloggter Nutzer öffnet den Link | Er registriert sich | Er landet im Spiel (Regression) | tests/e2e/privatspiel.spec.ts |
| AC-12 | Nicht beteiligter oder anonymer Nutzer | Er ruft `/spiele/{id}`, die Live-API oder das Overlay eines Privatspiels auf | Kein Zugriff (Fehlerseite bzw. 404/403); das Privatspiel erscheint nicht in Listen und nicht in Rangliste/Statistik | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-13 | Zufällige Einteilung | Veranstalter startet sie; Nicht-Veranstalter versucht es | Teams ausgeglichen; Nicht-Veranstalter abgelehnt; Rückgängig-Sperre bei bereit/bezahlt | tests/integration/privategame.test.ts |
| AC-14 | Veranstalter sieht den Einladungslink | Er klickt auf Teilen per WhatsApp | Der Teilen-Link enthält den Einladungslink | tests/e2e/privatspiel.spec.ts |
| AC-15 | Gesamtablauf | Anlegen, Link teilen, 10 Spieler treten bei (einer neu registriert), alle zahlen, beide Captains "Bereit", Preis fix, 48-h-Frist erreicht | Spiel ist bestätigt und gebucht, nicht öffentlich, nicht in der Rangliste | tests/e2e/privatspiel.spec.ts |

## Meilensteine
Reihenfolge seriell (gemeinsame Dateien: `wallet.ts`, `lobby.ts`, `privategame.ts`).
- M1: Rechenmodul, Pflicht-Miete, Bereit/Buchung (AC-1, AC-2, AC-3, AC-4)
- M2: Austritt, Rauswurf, 48-h-Frist, Schließen und Absage (AC-5, AC-6, AC-7, AC-8, AC-9, AC-16)
- M3: Link, Sichtbarkeit, Rechte, Teilen (AC-10, AC-11, AC-12, AC-13, AC-14, AC-15)

## Betroffene Bereiche
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/privategame.ts`, `src/server/privategame-actions.ts`, `src/server/scheduled.ts` bzw. Jobs (48-h-Schließ-Job statt 24-h-Prüfung und 1-h-Absage)
- `src/app/app/privatspiel/neu/*`, `src/app/spiel/[token]/page.tsx`, `src/app/lobby/[id]/page.tsx`, `src/components/ShareLink.tsx`
- `src/app/spiele/[id]/page.tsx`, `src/app/api/spiele/[id]/live/route.ts`, `src/app/overlay/[id]`
- Datenbank: Migration nur, wenn für Bereit-Stufe oder Link-Widerruf nötig (`game_invites`); wenn ja, additiv, in `docs/loop/GO-LIVE-AUDIT.md` eintragen.
- Tests: `tests/integration/privategame.test.ts`, `tests/unit/money.test.ts`, `tests/e2e/privatspiel.spec.ts`

## Risiken und Randfälle
- Rundung: Aufrunden erzeugt Überschuss unter n Cent; er darf nie zum Fehlbetrag führen.
- Nichtzahler zählen im Divisor mit: Die Miete ist nur gedeckt, wenn alle zahlen oder der Captain sie vorher entfernt.
- Parallele Zahlungen, Austritte und zweites "Bereit": Zeilensperren und idempotente Buchungsschlüssel (`ledger.post`).
- Veranstalter ist Captain beider Teams: Ein Mensch drückt beide "Bereit" (zulässig, aber beide Teams müssen vollständig bezahlt sein).
- Spiel in weniger als 48 h angelegt: Die Frist greift sofort (siehe Annahme); Mindestvorlauf des Anstoßes (heute 1 h) prüfen.
- Geparktes Geld: Bis zur Buchung liegt es in der Lobby (internes Konto), nicht beim Veranstalter. Absage und Austritt buchen nur zurück; Hauptbuch bleibt ausgeglichen.
- Fällt der Schließ-Job aus, bliebe die Lobby offen: Der Job muss nachholbar sein und nur noch nicht gebuchte Spiele anfassen.
- Link-Widerruf während jemand die Beitrittsseite offen hat: Beitritt mit altem Token schlägt kontrolliert fehl.

## Datenschutz / Sicherheit
- Zahlungen und Erstattungen: Idempotenz, Hauptbuch, Rechte (nur Captain/Veranstalter); Security-Review Pflicht.
- Sichtbarkeit: Privatspiel darf über `/spiele/{id}`, Live-API, Overlay und Listen nicht an Unbeteiligte gelangen (AC-12).
- Einladungslink ist ein Geheimnis: nur Veranstalter sieht ihn; Widerruf macht ihn unbrauchbar.
- Keine neuen personenbezogenen Daten.

## Offene Fragen
- Die mit v2 ANNAHME markierten Punkte (Austritt = Erstattung mit Aufhebung der Festschreibung, Buchung erst zur Frist, Anlage in weniger als 48 h) sind vor der Umsetzung zu bestätigen.
- Die Auszahlung an den Veranstalter braucht vor Go-live einen Zahlungsdienstleister (siehe `docs/loop/GO-LIVE-AUDIT.md`); bis dahin nur internes Guthaben und Hauptbuch.

## End-to-End-Nachweis
`tests/e2e/privatspiel.spec.ts`: Veranstalter legt ein Privatspiel mit Miete an, teilt den Link, 10 Spieler treten bei (einer neu registriert), alle zahlen ihren Anteil, beide Captains drücken "Bereit", der Preis steht fest, das Geld bleibt geparkt, zur 48-h-Frist wird gebucht, das Spiel ist weder öffentlich noch in der Rangliste sichtbar; ein zweiter Lauf prüft, dass ein Spiel, bei dem zur 48-h-Frist nicht alle bezahlt haben oder nicht beide "Bereit" gedrückt haben, ausfällt und alle erstattet werden.
