# 006 – Privatspiel: Miete teilen, Fristen, Einladungslink
Status: Freigegeben (2026-11-09)
Version: 1

## Ziel
Eine Person organisiert ein Spiel für ihre Freundesgruppe (Standard 10 Spieler), das nicht öffentlich ist und nur per Einladungslink (z. B. WhatsApp) erreichbar. Das Privatspiel funktioniert im Code weitgehend (Erstellen, Link, Beitritt auch für neu Registrierte, Einteilung manuell/zufällig, keine Rangliste). Dieser Vertrag legt das Geldmodell fest und schließt die Lücken: Jeder zahlt Miete ÷ Spielerzahl, das Spiel wird per "Bereit" beider Captains fixiert, Austritt ist bis 48 Stunden vor Anstoß mit Erstattung möglich, und deckt die Zahlung 24 Stunden vor Anstoß die volle Miete nicht, fällt das Spiel aus und alle bekommen ihr Geld zurück. Der Veranstalter trägt nie einen Fehlbetrag. Das Modell ist zugleich Vorbild für das Teamspiel (eigener Backlog-Eintrag).

## Nutzer und Rollen
- Veranstalter: legt das Spiel an, ist Team-Admin (Captain) beider Spiel-Teams, teilt ein, wirft Spieler raus, zieht den Link zurück oder erzeugt ihn neu, zahlt selbst seinen Anteil.
- Captain: Team-Admin eines Spiel-Teams (im Privatspiel standardmäßig der Veranstalter für beide Teams).
- Spieler: tritt per Link bei, zahlt seinen Anteil, kann bis 48 h vor Anstoß austreten.
- Neuer Nutzer: registriert sich über den Link und landet im Spiel.
- Platform-Admin: nicht betroffen (Fallback bei Absage).

## Entscheidungen (vom Nutzer, 2026-11-09)
- Alles oder nichts: Ist die volle Hallenmiete 24 h vor Anstoß nicht zusammen, fällt das Spiel aus, jeder bekommt seinen Anteil als Guthaben zurück. Die Plattform zahlt die Halle; der Veranstalter trägt nie einen Fehlbetrag.
- Miete wird durch die tatsächliche Spielerzahl geteilt, in allen Modi. Für Teamspiel und Turnier gibt es einen eigenen Backlog-Eintrag; 006 führt das gemeinsame Rechenmodul beim Privatspiel ein.
- Der Veranstalter kann den Einladungslink zurückziehen und neu erzeugen.
- Miete ist Pflicht (Betrag oder ausdrücklich "kostenlos" = 0 €); kein stiller Plattformpreis.
- Ablauf: Jeder zahlt seinen Anteil. Hat ein Team vollständig bezahlt, drückt dessen Captain "Bereit". Haben beide Captains "Bereit" gedrückt, bucht das System automatisch, und der Preis steht fest.
- Bis 48 h vor Anstoß kann ein Spieler austreten oder sein Captain ihn rauswerfen; er bekommt seinen Anteil als Guthaben zurück, der Captain holt Ersatz, der selbst zahlt.
- In den letzten 48 h kann niemand mehr austreten, es gibt keine Erstattung ("bezahlt ist bezahlt"); fällt jemand aus, sorgt der Captain selbst für Ersatz.
- Oberfläche (Teamspiel / Privatspiel / Turnier getrennt) ist Vertrag 007.

## Annahmen (Orchestrator-Vorschlag, vom Nutzer am 2026-11-09 bestätigt; Neuberechnung vom Nutzer korrigiert)
- Spielerzahl = Anzahl der Teilnehmer, die einem Spiel-Team zugeteilt sind (mindestens 4, höchstens 22, gerade Zahl wie heute). Der Anteil ist Miete ÷ Spielerzahl, aufgerundet; der Überschuss (weniger als die Spielerzahl in Cent) bleibt bei der Plattform.
- Neu gerechnet wird nur vor der Buchung (Nutzer-Korrektur): Bis zum zweiten "Bereit" ist der Anteil Miete ÷ aktuelle Spielerzahl. Ändert sich die Zahl, wird neu gerechnet: zu viel Gezahltes geht sofort als Guthaben zurück, zu wenig wird nachgefordert, und "Bereit" beider Teams wird zurückgesetzt.
- Mit dem zweiten "Bereit" wird die Spielerzahl festgeschrieben und der Preis ist fest. Danach läuft ein Austausch eins zu eins: Der Ersatz zahlt denselben Anteil, und erst dann bekommt der Abgesprungene sein Geld als Guthaben zurück (nur bis 48 h vor Anstoß). Spielerzahl, Anteil und "Bereit" bleiben dabei unverändert.
- "Automatisch buchen" heißt: Beim zweiten "Bereit" wird der Preis fixiert und die Anteile werden verbindlich verbucht (über die vorhandenen Konten in `wallet.ts`/`ledger.ts`); genau einmal, auch bei parallelen Aufrufen.
- Ab 48 h vor Anstoß ist die Teilnehmerliste gesperrt (kein Austritt, kein Rauswurf, kein neuer Beitritt); Zahlen und "Bereit" bleiben möglich. Ersatz in dieser Zeit regeln die Spieler außerhalb der Plattform.
- Der Check "Miete gedeckt?" läuft als Job 24 h vor Anstoß; gedeckt heißt: Summe der bezahlten Anteile ≥ Miete.

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
| AC-4 | Beide Captains haben "Bereit" gedrückt | Das zweite "Bereit" kommt an (auch parallel) | Preis steht fest, Verbuchung erfolgt genau einmal, Hauptbuch ausgeglichen | tests/integration/privategame.test.ts |
| AC-5 | Vor dem zweiten "Bereit", Spieler hat bezahlt | Er tritt aus, sein Captain wirft ihn raus oder jemand tritt bei | Anteil wird neu gerechnet: zu viel Gezahltes geht als Guthaben zurück, zu wenig wird nachgefordert; "Bereit" beider Teams wird zurückgesetzt | tests/integration/privategame.test.ts |
| AC-6 | Nutzer ist weder Captain des Teams noch Veranstalter | Er versucht einen Spieler rauszuwerfen oder einzuteilen | Abgelehnt; Rauswurf und Entfernen sind für bereite oder bezahlte Spieler nur durch den Captain mit Erstattung möglich | tests/integration/privategame.test.ts |
| AC-7 | Nach dem zweiten "Bereit" (Preis fest), mehr als 48 h bis Anstoß, ein Spieler will aussteigen | Ersatzspieler tritt ein und zahlt denselben Anteil | Erst dann bekommt der Abgesprungene sein Geld als Guthaben zurück; Spielerzahl, Anteil und "Bereit" bleiben unverändert; ohne Ersatz keine Erstattung | tests/integration/privategame.test.ts |
| AC-8 | Weniger als 48 h bis Anstoß | Spieler tritt aus oder Captain wirft raus (Server-Aktion) | Abgelehnt, keine Erstattung | tests/integration/privategame.test.ts |
| AC-9 | 24 h vor Anstoß, Miete nicht gedeckt | Der Job läuft | Spiel wird abgesagt, alle bekommen ihren Anteil als Guthaben zurück, Veranstalter trägt keine Differenz; ist die Miete gedeckt, bleibt das Spiel bestätigt | tests/integration/privategame.test.ts |
| AC-10 | Veranstalter hat einen Einladungslink | Er zieht ihn zurück oder erzeugt einen neuen | Alter Link zeigt "ungültig", neuer Link funktioniert, bereits Beigetretene bleiben im Spiel; Nicht-Veranstalter wird abgelehnt | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-11 | Neuer, nicht eingeloggter Nutzer öffnet den Link | Er registriert sich | Er landet im Spiel (Regression) | tests/e2e/privatspiel.spec.ts |
| AC-12 | Nicht beteiligter oder anonymer Nutzer | Er ruft `/spiele/{id}`, die Live-API oder das Overlay eines Privatspiels auf | Kein Zugriff (Fehlerseite bzw. 404/403); das Privatspiel erscheint nicht in Listen und nicht in Rangliste/Statistik | tests/integration/privategame.test.ts, tests/e2e/privatspiel.spec.ts |
| AC-13 | Zufällige Einteilung | Veranstalter startet sie; Nicht-Veranstalter versucht es | Teams ausgeglichen; Nicht-Veranstalter abgelehnt; Rückgängig-Sperre bei bereit/bezahlt | tests/integration/privategame.test.ts |
| AC-14 | Veranstalter sieht den Einladungslink | Er klickt auf Teilen per WhatsApp | Der Teilen-Link enthält den Einladungslink | tests/e2e/privatspiel.spec.ts |
| AC-15 | Gesamtablauf | Anlegen, Link teilen, 10 Spieler treten bei (einer neu registriert), alle zahlen, beide Captains "Bereit", Preis fix | Spiel ist bestätigt, nicht öffentlich, nicht in der Rangliste | tests/e2e/privatspiel.spec.ts |

## Meilensteine
Reihenfolge seriell (gemeinsame Dateien: `wallet.ts`, `lobby.ts`, `privategame.ts`).
- M1: Rechenmodul, Pflicht-Miete, Bereit/Buchung (AC-1, AC-2, AC-3, AC-4)
- M2: Austritt, Rauswurf, Fristen und Absage (AC-5, AC-6, AC-7, AC-8, AC-9)
- M3: Link, Sichtbarkeit, Rechte, Teilen (AC-10, AC-11, AC-12, AC-13, AC-14, AC-15)

## Betroffene Bereiche
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/privategame.ts`, `src/server/privategame-actions.ts`, `src/server/scheduled.ts` bzw. Jobs (24-h-Prüfung)
- `src/app/app/privatspiel/neu/*`, `src/app/spiel/[token]/page.tsx`, `src/app/lobby/[id]/page.tsx`, `src/components/ShareLink.tsx`
- `src/app/spiele/[id]/page.tsx`, `src/app/api/spiele/[id]/live/route.ts`, `src/app/overlay/[id]`
- Datenbank: Migration nur, wenn für Bereit-Stufe oder Link-Widerruf nötig (`game_invites`); wenn ja, additiv, in `docs/loop/GO-LIVE-AUDIT.md` eintragen.
- Tests: `tests/integration/privategame.test.ts`, `tests/unit/money.test.ts`, `tests/e2e/privatspiel.spec.ts`

## Risiken und Randfälle
- Rundung: Aufrunden erzeugt Überschuss unter n Cent; er darf nie zum Fehlbetrag führen.
- Nichtzahler zählen im Divisor mit: Die Miete ist nur gedeckt, wenn alle zahlen oder der Captain sie vorher entfernt.
- Parallele Zahlungen, Austritte und zweites "Bereit": Zeilensperren und idempotente Buchungsschlüssel (`ledger.post`).
- Veranstalter ist Captain beider Teams: Ein Mensch drückt beide "Bereit" (zulässig, aber beide Teams müssen vollständig bezahlt sein).
- Spiel in weniger als 48 h angelegt: Fristen greifen sofort (Austritt gesperrt, 24-h-Prüfung kann bei Anlage schon überschritten sein); Mindestvorlauf des Anstoßes (heute 1 h) prüfen.
- Absage wegen fehlender Miete nach teilweiser Verbuchung: Gegenbuchungen über `reverseEntry`, Hauptbuch bleibt ausgeglichen.
- Link-Widerruf während jemand die Beitrittsseite offen hat: Beitritt mit altem Token schlägt kontrolliert fehl.

## Datenschutz / Sicherheit
- Zahlungen und Erstattungen: Idempotenz, Hauptbuch, Rechte (nur Captain/Veranstalter); Security-Review Pflicht.
- Sichtbarkeit: Privatspiel darf über `/spiele/{id}`, Live-API, Overlay und Listen nicht an Unbeteiligte gelangen (AC-12).
- Einladungslink ist ein Geheimnis: nur Veranstalter sieht ihn; Widerruf macht ihn unbrauchbar.
- Keine neuen personenbezogenen Daten.

## Offene Fragen
- (vor Freigabe leer; Annahmen siehe oben, werden dem Nutzer gebündelt vorgelegt)

## End-to-End-Nachweis
`tests/e2e/privatspiel.spec.ts`: Veranstalter legt ein Privatspiel mit Miete an, teilt den Link, 10 Spieler treten bei (einer neu registriert), alle zahlen ihren Anteil, beide Captains drücken "Bereit", der Preis steht fest, das Spiel ist weder öffentlich noch in der Rangliste sichtbar; ein zweiter Lauf prüft, dass ein Spiel ohne volle Miete 24 h vor Anstoß ausfällt und alle erstattet werden.
