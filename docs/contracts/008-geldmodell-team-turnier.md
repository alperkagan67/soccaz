# 008 – Geldmodell Teamspiel und Turnier: Miete ÷ tatsächliche Spielerzahl
Status: Freigegeben (2026-11-10)
Version: 2 (v2 plus Review-Nachbesserung 2026-11-10: Frist-Regel 48 h für alle Modi, Geld bleibt in der Lobby geparkt; ersetzt 24-h-Absage und die Ausnahme für das Turnier)

## Ziel
Teamspiel und Turnier rechnen wie das Privatspiel (Vertrag 006): Jeder zahlt Miete ÷ tatsächliche Spielerzahl (aufgerundet), ohne Mindestzahl 8, ohne Deckel 12 und ohne Reservierung mit späterer Rückbuchung. Im Teamspiel wird die Spielerzahl mit dem zweiten "Bereit" festgeschrieben. Es gibt nur noch eine Frist, 48 h vor Anstoß (Turnier: vor Turnierstart): Bis dahin ist die Lobby offen, das Geld bleibt geparkt und geht erst bei der Buchung an den Veranstalter; zur Frist schließt die Lobby, und sind nicht alle bezahlt oder nicht alle Captains "Bereit", fällt das Spiel aus und alle werden erstattet. Danach gibt es keine Absage und keine Erstattung. Das Turnier nutzt `shareCents` und dieselbe Frist-Regel.

## Nutzer und Rollen
- Captain (Team-Admin), Spieler, Platform-Admin (kein Fallback bei Absage: abgesagt wird nur durch den Schließ-Job); im Turnier zusätzlich Turnier-Manager. Rollen wie heute.

## Entscheidungen (vom Nutzer, 2026-11-10; v2 am 2026-11-10, G1 erteilt)
- Teamspiel: Anteil = aufgerundet Miete ÷ tatsächliche Spielerzahl (4 bis 22, gerade); `min_paid_players` und Deckel 12 entfallen für diese Berechnung.
- Spielerzahl wird im Teamspiel wie in 006 mit dem zweiten "Bereit" fixiert; Neuberechnung nur davor.
- Turnier nutzt nur `shareCents`; keine Reservierung nach `MIN_PLAYERS_PER_TEAM`.
- v2, Frist-Regel für alle Modi (Privat, Team, Turnier): Keine 24-h-Regel und kein 24-h-Job mehr. Die einzige Frist ist 48 h vor Anstoß (Turnier: 48 h vor dem Start des ersten Spiels, bestätigt).
- v2, bis dahin ist die Lobby offen: Spieler zahlen, Captains drücken "Bereit". Das Geld bleibt in der Lobby geparkt (nicht an Veranstalter oder Halle gebucht) und geht erst bei der Buchung an den Veranstalter.
- v2, zur 48-h-Frist schließt die Lobby automatisch: nicht alle bezahlt ODER nicht alle Captains "Bereit" → Spiel fällt aus, alle bekommen Guthaben zurück. Sonst wird gebucht.
- v2, danach keine Absage und keine Erstattung. Der Captain tauscht Spieler gegen Ersatz; die Zahlung läuft außerhalb von Soccaz.

## Annahmen (Orchestrator-Vorschlag, bitte prüfen)
- v2 Annahme (bestätigt): Austritt oder Rauswurf vor der Frist bedeutet sofortige Erstattung (das Geld ist geparkt); die Festschreibung der Spielerzahl wird dabei aufgehoben, "Bereit" beider Teams zurückgesetzt. Der alte Austausch 1:1 mit Erstattung erst bei Ersatzzahlung entfällt.
- v2 Annahme (bestätigt): Gebucht wird zur 48-h-Frist, nicht beim zweiten "Bereit". Beim zweiten "Bereit" wird nur der Preis fixiert.
- v2 Annahme (bestätigt): Turnier: Die Frist liegt 48 h vor dem Start des ersten Spiels. Die Anmeldefrist (`registrationDeadline`) muss mindestens 48 h davor liegen; die Validierung beim Anlegen und Ändern lehnt sonst mit einem Fehler ab (heute nur "vor Turnierbeginn").
- v2 Annahme (bestätigt): Turnier "alle Captains Bereit" heißt: alle angemeldeten Teams haben ihren Kader vollständig bezahlt und "Bereit" gedrückt (`paid_ready_at`). Die Teilnehmerzahl (Teams) bleibt wie im Bestand.
- Entscheidung des Orchestrators: Mindestvorlauf des Anstoßes bei Anlage ist 48 h für alle Modi, auch für das Teamspiel (heute 1 h).
- ANNAHME (Altspiele): Der alte 24-h-Pfad (Prüfung 24 h und 1 h vor Anstoß) bleibt ausschließlich für Altspiele, die vor der Umstellung angelegt wurden, und nur bis zu ihrem Anstoß. Neuspiele kennen nur die 48-h-Frist.
- Die Vorschau im Turnier zeigt eine Spanne aus `shareCents` für minimale/maximale Spielerzahl; der Preis wird erst bei Fixierung verbindlich.
- Laufende, bereits reservierte Spiele werden nach altem Modell abgerechnet; neues Modell gilt für Spiele, die nach dem Deploy angelegt werden (Flag am Spiel oder Stichtag).
- Teamspiel hat zwei Captains: "Bereit" beider Teams wird wie in 006 behandelt.

## Nicht-Ziele
- Oberfläche/Navigation (Vertrag 007).
- Captain-Tausch von Spielern nach der Frist (Produktfrage, eigener Backlog-Eintrag).
- Wertung bei Nichterscheinen: `recordLateCancel` mit 24-h-Grenze entfällt mit der 24-h-Regel; eine Nachfolge-Wertung ist ein eigener Backlog-Eintrag.
- Echte Auszahlung an Veranstalter oder Halle (braucht einen Zahlungsdienstleister, siehe `docs/loop/GO-LIVE-AUDIT.md`).
- Änderung von Plattform-Gebühren, Aufladung, Hallenpreisen.
- Zahlung für andere Spieler.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Teamspiel, Miete M, n Spieler | Anteil berechnet | ceil(M ÷ n) für n 4 bis 22, ohne Deckel 12 und ohne Minimum 8 | tests/unit/money.test.ts |
| AC-2 | Teamspiel, noch nicht beide "Bereit" | Spielerzahl ändert sich | Anteil neu gerechnet, Überzahlung als Guthaben zurück, Nachforderung, "Bereit" beider Teams zurückgesetzt | tests/integration/lobby-ready.test.ts |
| AC-3 | Teamspiel, beide Captains "Bereit" (auch parallel) | Zweites "Bereit" | Spielerzahl und Preis fest, das Geld bleibt geparkt, nichts an den Veranstalter gebucht, Hauptbuch ausgeglichen | tests/integration/lobby-ready.test.ts |
| AC-4 | Nach Fixierung, mehr als 48 h bis Anstoß | Spieler steigt aus oder wird entfernt | Sofortige Erstattung des geparkten Anteils, Festschreibung aufgehoben, "Bereit" zurückgesetzt | tests/integration/wallet.test.ts |
| AC-5 | Weniger als 48 h bis Anstoß, Lobby geschlossen | Austritt, Rauswurf oder Beitritt (Server-Aktion) | Abgelehnt, keine Erstattung; Captain tauscht nur gegen Ersatz, Zahlung außerhalb von Soccaz | tests/integration/wallet.test.ts |
| AC-6 | 48 h vor Anstoß (einzige Frist), Teamspiel | Schließ-Job läuft | Nicht alle bezahlt oder nicht beide Captains "Bereit": Spiel abgesagt, alle erstattet; sonst Buchung genau einmal, Spiel bleibt bestätigt; kein 24-h-Job, keine 1-h-Absage; danach keine Absage und keine Erstattung | tests/integration/wallet.test.ts |
| AC-7 | Turnier mit Gesamtpreis T, n tatsächliche Spieler | Preis fixiert (`maybeFixPrice`) | Anteil = ceil(T ÷ n), keine Reservierung davor; Vorschau aus `shareCents`; Geld bleibt geparkt | tests/unit/tournament.test.ts, tests/integration/tournament.test.ts |
| AC-8 | Turnier, Spielerzahl ändert sich vor Fixierung | Kader wird geändert | Preis neu gerechnet, bestehende Zahlungen verrechnet bzw. erstattet | tests/integration/tournament.test.ts |
| AC-9 | Altes Spiel, das vor der Umstellung angelegt und reserviert wurde (ANNAHME: Altspiele-Pfad) | Abrechnung und Prüfung bis zu seinem Anstoß | Altes Modell und alter 24-h-Pfad unverändert, Hauptbuch ausgeglichen; Neuspiele nur mit 48-h-Frist | tests/integration/payments.test.ts |
| AC-10 | Gesamtablauf Teamspiel und Turnier | Zahlen, Fixieren, Austritt mit Erstattung vor der Frist, Liste gesperrt nach der Frist | Betrag je Spieler entspricht Miete ÷ Spielerzahl, nirgends 8/12, Frist nur 48 h | tests/e2e/payments.spec.ts, tests/e2e/turnier-ablauf.spec.ts |
| AC-11 | Turnier, 48 h vor dem Start des ersten Spiels | Schließ-Job läuft | Nicht alle bezahlt oder nicht alle Captains "Bereit": Turnier fällt aus, alle erstattet; sonst Buchung genau einmal; danach keine Absage und keine Erstattung | tests/integration/tournament.test.ts |
| AC-12 | Turnier wird angelegt oder geändert | Anmeldefrist liegt weniger als 48 h vor dem Start des ersten Spiels | Fehler, nicht gespeichert; Anlage mit weniger als 48 h Vorlauf (alle Modi) ebenfalls abgelehnt | tests/integration/tournament.test.ts |

## Meilensteine (seriell, gemeinsame Dateien `wallet.ts`, `lobby.ts`, `tournaments.ts`)
- M1: Rechenmodul für Team/Turnier, Reservierung entfällt (AC-1, AC-7, AC-9)
- M2: Fixierung, Neuberechnung, Austritt mit Erstattung (AC-2, AC-3, AC-4, AC-8)
- M3: 48-h-Frist, Schließen und Absage (AC-5, AC-6, AC-11, AC-12), E2E (AC-10)

## Betroffene Bereiche
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`, `src/lib/tournament.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/tournaments.ts`, `src/server/scheduled.ts` (48-h-Schließ-Job), `src/server/settings.ts` (`min_paid_players`)
- Datenbank: Migration nur für Fixierungsmarke am Spiel/Stichtag; additiv, Eintrag in `docs/loop/GO-LIVE-AUDIT.md`.
- Tests siehe Tabelle.

## Risiken und Randfälle
- Rundung: Überschuss (< n Cent) bleibt bei der Plattform, nie Fehlbetrag.
- Nichtzahler zählen im Divisor; Miete gedeckt nur, wenn alle zahlen oder der Captain sie entfernt.
- Umstellung mitten im Betrieb: Altspiele nicht neu rechnen; der alte 24-h-Pfad läuft für sie nur bis zu ihrem Anstoß (AC-9, ANNAHME).
- Parallele Zahlungen/Austritte: Zeilensperren und idempotente `ledger.post`-Schlüssel.
- Geparktes Geld: bis zur Buchung internes Konto der Lobby; Absage und Austritt buchen nur zurück.
- Fällt der Schließ-Job aus, bliebe die Lobby offen: Der Job muss nachholbar sein.
- Zwei Captains im Teamspiel: "Bereit"-Reset bei jeder Zahlenänderung.
- `settleMatch` Endabrechnung muss mit Fixpreis konsistent bleiben (keine zweite Differenz).

## Datenschutz / Sicherheit
- Zahlungen/Erstattungen: Idempotenz, Hauptbuch, Rechte; Security-Review Pflicht. Keine neuen personenbezogenen Daten.

## Offene Fragen
- Die v2-Annahmen (Turnier-Zeitpunkt, Austritt = Erstattung, Buchung zur Frist) sind vom Orchestrator bestätigt; nur die Altspiele-Regel (AC-9) bleibt Annahme.
- Produktfragen im Backlog: Captain-Tausch nach der Frist, Wertung bei Nichterscheinen.
- Die Auszahlung an Veranstalter braucht vor Go-live einen Zahlungsdienstleister (siehe `docs/loop/GO-LIVE-AUDIT.md`).

## End-to-End-Nachweis
`tests/e2e/payments.spec.ts` und `tests/e2e/turnier-ablauf.spec.ts`: Teamspiel mit 10 Spielern zahlt Miete ÷ 10, beide "Bereit", Preis fix; Austritt mit Erstattung vor der Frist, Liste gesperrt nach der Frist; zweiter Lauf: zur 48-h-Frist nicht alle bezahlt oder nicht beide "Bereit" → Absage und Erstattung; Turnier mit 3 Teams zahlt ceil(Preis ÷ tatsächliche Spieler) und folgt derselben 48-h-Frist.
