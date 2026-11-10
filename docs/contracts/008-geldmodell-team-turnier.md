# 008 – Geldmodell Teamspiel und Turnier: Miete ÷ tatsächliche Spielerzahl
Status: Freigegeben (2026-11-10)
Version: 4 (v4 2026-11-10: Zusage der Halle ist Buchungsbedingung, falls die Halle Zugang hat (Vertrag 011); davor v3 plus Nachtrag 1-h-Abbruch 2026-11-10; v3 2026-11-10: kein Mindestvorlauf von 48 h, sofortige Buchung bei kurzem Vorlauf, Captain-Tausch als Folgeauftrag; davor v2 plus Review-Nachbesserung: Frist-Regel 48 h für alle Modi, Geld bleibt in der Lobby geparkt; ersetzt 24-h-Absage und die Ausnahme für das Turnier)

## Ziel
Teamspiel und Turnier rechnen wie das Privatspiel (Vertrag 006): Jeder zahlt Miete ÷ tatsächliche Spielerzahl (aufgerundet), ohne Mindestzahl 8, ohne Deckel 12 und ohne Reservierung mit späterer Rückbuchung. Im Teamspiel wird die Spielerzahl mit dem zweiten "Bereit" festgeschrieben. Es gibt nur noch eine Frist, 48 h vor Anstoß (Turnier: vor Turnierstart): Bis dahin ist die Lobby offen, das Geld bleibt geparkt und geht erst bei der Buchung an den Veranstalter; zur Frist schließt die Lobby, und sind nicht alle bezahlt oder nicht alle Captains "Bereit", fällt das Spiel aus und alle werden erstattet. Danach gibt es keine Absage und keine Erstattung. Spiele und Turniere mit weniger als 48 h Vorlauf sind erlaubt (Mindestvorlauf bleibt 1 h): Dort gibt es keine Frist außer dem 1-h-Abbruch; es wird sofort gebucht, sobald alle bezahlt haben und beide Captains "Bereit" sind (Turnier: alle Teams voll bezahlt und bereit). Das Turnier nutzt `shareCents` und dieselbe Frist-Regel.

## Nutzer und Rollen
- Captain (Team-Admin), Spieler, Platform-Admin (kein Fallback bei Absage: abgesagt wird nur durch den Schließ-Job); im Turnier zusätzlich Turnier-Manager. Rollen wie heute.

## Entscheidungen (vom Nutzer, 2026-11-10; v2 am 2026-11-10, G1 erteilt)
- Teamspiel: Anteil = aufgerundet Miete ÷ tatsächliche Spielerzahl (4 bis 22, gerade); `min_paid_players` und Deckel 12 entfallen für diese Berechnung.
- Spielerzahl wird im Teamspiel wie in 006 mit dem zweiten "Bereit" fixiert; Neuberechnung nur davor.
- Turnier nutzt nur `shareCents`; keine Reservierung nach `MIN_PLAYERS_PER_TEAM`.
- v2, Frist-Regel für alle Modi (Privat, Team, Turnier): Keine 24-h-Regel und kein 24-h-Job mehr. Die einzige Frist ist 48 h vor Anstoß (Turnier: 48 h vor dem Start des ersten Spiels, bestätigt).
- v2, bis dahin ist die Lobby offen: Spieler zahlen, Captains drücken "Bereit". Das Geld bleibt in der Lobby geparkt (nicht an Veranstalter oder Halle gebucht) und geht erst bei der Buchung an den Veranstalter.
- v2, zur 48-h-Frist schließt die Lobby automatisch: nicht alle bezahlt ODER nicht alle Captains "Bereit" → Spiel fällt aus, alle bekommen Guthaben zurück. Sonst wird gebucht.
- v2, danach keine Absage und keine Erstattung. Fällt jemand aus, gilt der Folgeauftrag: Captain tauscht gegen Ersatz (der Ersatz ist ein registrierter Soccaz-Nutzer; die Zahlung zwischen beiden läuft außerhalb von Soccaz) (siehe Abschnitt Folgeauftrag).

## Annahmen (Orchestrator-Vorschlag, bitte prüfen)
- v2 Annahme (bestätigt): Austritt oder Rauswurf vor der Frist bedeutet sofortige Erstattung (das Geld ist geparkt); die Festschreibung der Spielerzahl wird dabei aufgehoben, "Bereit" beider Teams zurückgesetzt. Der alte Austausch 1:1 mit Erstattung erst bei Ersatzzahlung entfällt.
- v2 Annahme (bestätigt): Gebucht wird zur 48-h-Frist, nicht beim zweiten "Bereit". Beim zweiten "Bereit" wird nur der Preis fixiert.
- v2 Annahme (bestätigt): Turnier mit mindestens 48 h Vorlauf: Die Frist liegt 48 h vor dem Start des ersten Spiels. Die Anmeldefrist (`registrationDeadline`) muss mindestens 48 h davor liegen; die Validierung beim Anlegen und Ändern lehnt sonst mit einem Fehler ab (heute nur "vor Turnierbeginn").
- v2 Annahme (bestätigt): Turnier "alle Captains Bereit" heißt: alle angemeldeten Teams haben ihren Kader vollständig bezahlt und "Bereit" gedrückt (`paid_ready_at`). Die Teilnehmerzahl (Teams) bleibt wie im Bestand.
- Nutzerentscheid v3 (Variante 2), Mindestvorlauf: Es gibt keinen 48-h-Mindestvorlauf. Spiele und Turniere mit weniger als 48 h Vorlauf sind erlaubt; der bisherige Mindestvorlauf von 1 Stunde bleibt, für alle Modi (auch Teamspiel).
- Nutzerentscheid v3, Vorlauf unter 48 h: Es wird sofort gebucht, sobald alle bezahlt haben UND beide Captains "Bereit" sind (Turnier: alle Teams voll bezahlt + ready). Kein Austritt und kein Rauswurf mit Erstattung, keine Frist außer dem 1-h-Abbruch.
- Annahme (bestätigt) zu Vorlauf unter 48 h: Die Liste ist für Austritt und Rauswurf von Anfang an gesperrt; Beitritt und Zahlung bleiben bis zur Buchung möglich.
- Nutzerentscheid v3, 1-h-Abbruch (bestätigt): Bei Anlage unter 48 h bleibt die Lobby offen (Beitritt und Zahlung, kein Austritt) bis 1 Stunde vor Anstoß (Turnier: vor dem Start des ersten Spiels). Ist dann nicht alles bezahlt ODER haben nicht beide Captains "Bereit" gedrückt (Turnier: nicht alle Teams voll bezahlt und ready), wird abgesagt und alle bekommen ihr geparktes Geld zurück. Sind vorher alle bezahlt und bereit, wird sofort gebucht.
- Annahme (bestätigt): Zwei Buchungszeitpunkte. Ab 48 h Vorlauf wird zur 48-h-Frist gebucht, unter 48 h sofort (jeweils nur mit Zusage der Halle, falls die Halle Zugang hat).
- Nutzerentscheid v4: Die Zusage der Halle ist IMMER Buchungsbedingung, falls die Halle Zugang hat (Vertrag 011). Buchung = alle bezahlt + beide Captains "Bereit" + Zusage, auch bei Sofortbuchung unter 48 h. Antwortfrist der Halle = das Minimum aus 12 Stunden und der Zeit bis 1 Stunde vor Anstoß. Ab 48 h Vorlauf ohne Zusage: Absage und Erstattung an alle zur 48-h-Frist. Unter 48 h ohne Zusage: Absage und Erstattung an alle 1 Stunde vor Anstoß. Hat die Halle keinen Zugang, entfällt die Bedingung. Beim Turnier gilt "1 Stunde vor Anstoß" als 1 Stunde vor dem Start des ersten Spiels.
- Annahme (bestätigt): Turnier unter 48 h bis zum Start: Der Anmeldeschluss muss nur vor dem Start liegen, wie heute.
- Annahme (Altspiele, bestätigt): Der alte 24-h-Pfad (Prüfung 24 h und 1 h vor Anstoß) bleibt ausschließlich für Altspiele, die vor der Umstellung angelegt wurden, und nur bis zu ihrem Anstoß. Neuspiele: mit mindestens 48 h Vorlauf bei Anlage gilt die 48-h-Frist, mit weniger als 48 h Sofortbuchung bzw. 1-h-Abbruch.
- Die Vorschau im Turnier zeigt eine Spanne aus `shareCents` für minimale/maximale Spielerzahl; der Preis wird erst bei Fixierung verbindlich.
- Laufende, bereits reservierte Spiele werden nach altem Modell abgerechnet; neues Modell gilt für Spiele, die nach dem Deploy angelegt werden (Flag am Spiel oder Stichtag).
- Teamspiel hat zwei Captains: "Bereit" beider Teams wird wie in 006 behandelt.

## Nicht-Ziele
- Oberfläche/Navigation (Vertrag 007).
- Wertung bei Nichterscheinen: `recordLateCancel` mit 24-h-Grenze entfällt mit der 24-h-Regel; eine Nachfolge-Wertung ist ein eigener Backlog-Eintrag (Nr. 10).
- Echte Auszahlung an Veranstalter oder Halle (braucht einen Zahlungsdienstleister, siehe `docs/loop/GO-LIVE-AUDIT.md`).
- Änderung von Plattform-Gebühren, Aufladung, Hallenpreisen.
- Zahlung für andere Spieler.

## Folgeauftrag nach der Frist-Regel
- Captain-Tausch nach der 48-h-Frist: Ein Captain tauscht einen Spieler gegen einen Ersatz, der registrierter Soccaz-Nutzer ist, ohne Zahlung über Soccaz (Nutzerentscheid 2026-11-10: Ja). Eigener Vertrag mit ACs folgt kurz (Backlog 9); Produktfragen gehen an den Orchestrator. In diesem Vertrag nicht umgesetzt.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Teamspiel, Miete M, n Spieler | Anteil berechnet | ceil(M ÷ n) für n 4 bis 22, ohne Deckel 12 und ohne Minimum 8 | tests/unit/money.test.ts |
| AC-2 | Teamspiel, noch nicht beide "Bereit" | Spielerzahl ändert sich | Anteil neu gerechnet, Überzahlung als Guthaben zurück, Nachforderung, "Bereit" beider Teams zurückgesetzt | tests/integration/lobby-ready.test.ts |
| AC-3 | Teamspiel, beide Captains "Bereit" (auch parallel) | Zweites "Bereit" | Spielerzahl und Preis fest, das Geld bleibt geparkt, nichts an den Veranstalter gebucht, Hauptbuch ausgeglichen | tests/integration/lobby-ready.test.ts |
| AC-4 | Spiel mit mindestens 48 h Vorlauf bei Anlage; nach Fixierung, mehr als 48 h bis Anstoß | Spieler steigt aus oder wird entfernt | Sofortige Erstattung des geparkten Anteils, Festschreibung aufgehoben, "Bereit" zurückgesetzt | tests/integration/wallet.test.ts |
| AC-5 | Spiel mit mindestens 48 h Vorlauf bei Anlage, jetzt weniger als 48 h bis Anstoß (Frist vorbei, Lobby geschlossen) | Austritt, Rauswurf oder Beitritt (Server-Aktion) | Abgelehnt, keine Erstattung; Captain-Tausch gegen Ersatz ist Folgeauftrag, Zahlung außerhalb von Soccaz | tests/integration/wallet.test.ts |
| AC-6 | 48 h vor Anstoß (einzige Frist), Teamspiel | Schließ-Job läuft | Nicht alle bezahlt, nicht beide Captains "Bereit" oder keine Zusage der Halle (falls Halle mit Zugang): Spiel abgesagt, alle erstattet; sonst Buchung genau einmal, Spiel bleibt bestätigt; kein 24-h-Job, keine 1-h-Absage für Spiele mit mindestens 48 h Vorlauf bei Anlage; danach keine Absage und keine Erstattung | tests/integration/wallet.test.ts |
| AC-7 | Turnier mit Gesamtpreis T, n tatsächliche Spieler | Preis fixiert (`maybeFixPrice`) | Anteil = ceil(T ÷ n), keine Reservierung davor; Vorschau aus `shareCents`; Geld bleibt geparkt | tests/unit/tournament.test.ts, tests/integration/tournament.test.ts |
| AC-8 | Turnier, Spielerzahl ändert sich vor Fixierung | Kader wird geändert | Preis neu gerechnet, bestehende Zahlungen verrechnet bzw. erstattet | tests/integration/tournament.test.ts |
| AC-9 | Altes Spiel, das vor der Umstellung angelegt und reserviert wurde (Annahme bestätigt: Altspiele-Pfad) | Abrechnung und Prüfung bis zu seinem Anstoß | Altes Modell und alter 24-h-Pfad unverändert, Hauptbuch ausgeglichen; Neuspiele: mindestens 48 h Vorlauf = 48-h-Frist, weniger als 48 h = Sofortbuchung bzw. 1-h-Abbruch | tests/integration/payments.test.ts |
| AC-10 | Gesamtablauf Teamspiel und Turnier | Zahlen, Fixieren, Austritt mit Erstattung vor der Frist, Liste gesperrt nach der Frist | Betrag je Spieler entspricht Miete ÷ Spielerzahl, nirgends 8/12, Frist 48 h (ab 48 h Vorlauf) | tests/e2e/payments.spec.ts, tests/e2e/turnier-ablauf.spec.ts |
| AC-11 | Turnier, 48 h vor dem Start des ersten Spiels | Schließ-Job läuft | Nicht alle bezahlt, nicht alle Captains "Bereit" oder keine Zusage der Halle (falls Halle mit Zugang): Turnier fällt aus, alle erstattet; sonst Buchung genau einmal; danach keine Absage und keine Erstattung | tests/integration/tournament.test.ts |
| AC-12 | Turnier mit mindestens 48 h bis zum Start des ersten Spiels wird angelegt oder geändert | Anmeldefrist liegt weniger als 48 h vor dem Start des ersten Spiels | Fehler, nicht gespeichert; bei weniger als 48 h Vorlauf bis zum Start gilt diese Regel nicht (siehe AC-14); Mindestvorlauf überall nur 1 h | tests/integration/tournament.test.ts |
| AC-13 | Teamspiel mit weniger als 48 h Vorlauf (mehr als 1 h), alle haben bezahlt, Zusage der Halle liegt vor (falls Halle mit Zugang) | Beide Captains "Bereit" (auch parallel) | Sofort gebucht, genau einmal, Spiel bestätigt, Liste ganz gesperrt; vorher keine Buchung; Austritt und Rauswurf abgelehnt, keine Erstattung; Anlage unter 1 h abgelehnt; fehlt die Zusage (falls Halle mit Zugang), keine Buchung | tests/integration/lobby-ready.test.ts |
| AC-14 | Turnier mit weniger als 48 h bis zum Start des ersten Spiels (Anmeldeschluss nur vor dem Start, wie heute; bestätigt) | Alle Teams voll bezahlt und "Bereit", Zusage der Halle liegt vor (falls Halle mit Zugang) | Sofort gebucht, genau einmal; keine Frist außer dem 1-h-Abbruch (AC-16), kein Austritt mit Erstattung | tests/integration/tournament.test.ts |
| AC-15 | Teamspiel mit weniger als 48 h Vorlauf, 1 Stunde vor Anstoß | Nicht alle bezahlt, nicht beide Captains "Bereit" oder keine Zusage der Halle (falls Halle mit Zugang); der 1-h-Job läuft | Spiel abgesagt, alle erstattet, Hauptbuch ausgeglichen, Lauf genau einmal; bereits gebuchte Spiele werden nicht abgesagt | tests/integration/wallet.test.ts |
| AC-16 | Turnier mit weniger als 48 h Vorlauf, 1 Stunde vor dem Start des ersten Spiels | Nicht alle Teams voll bezahlt und ready oder keine Zusage der Halle (falls Halle mit Zugang); der 1-h-Job läuft | Turnier abgesagt, alle erstattet, Hauptbuch ausgeglichen, Lauf genau einmal; sind alle bezahlt und ready und (falls Halle mit Zugang) die Zusage da, ist längst gebucht | tests/integration/tournament.test.ts |

## Meilensteine (seriell, gemeinsame Dateien `wallet.ts`, `lobby.ts`, `tournaments.ts`)
- M1: Rechenmodul für Team/Turnier, Reservierung entfällt (AC-1, AC-7, AC-9)
- M2: Fixierung, Neuberechnung, Austritt mit Erstattung (AC-2, AC-3, AC-4, AC-8)
- M3: 48-h-Frist, Schließen und Absage (AC-5, AC-6, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16), E2E (AC-10); die Bedingung "Zusage der Halle" in AC-6, AC-11 und AC-13 bis AC-16 wird zusammen mit Vertrag 011 (M4) umgesetzt und geprüft

## Betroffene Bereiche
- Zusage der Halle als Buchungsbedingung und Antwortfrist: Schnittstelle zu Vertrag 011, `src/server/wallet.ts`, `src/server/tournaments.ts`, `src/server/scheduled.ts` (Frist-Jobs berücksichtigen die Zusage)
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`, `src/lib/tournament.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/tournaments.ts`, `src/server/scheduled.ts` (48-h-Schließ-Job), `src/server/settings.ts` (`min_paid_players`)
- Datenbank: Migration nur für Fixierungsmarke am Spiel/Stichtag; additiv, Eintrag in `docs/loop/GO-LIVE-AUDIT.md`.
- Tests siehe Tabelle.

## Risiken und Randfälle
- Rundung: Überschuss (< n Cent) bleibt bei der Plattform, nie Fehlbetrag.
- Nichtzahler zählen im Divisor; Miete gedeckt nur, wenn alle zahlen oder der Captain sie entfernt.
- Umstellung mitten im Betrieb: Altspiele nicht neu rechnen; der alte 24-h-Pfad läuft für sie nur bis zu ihrem Anstoß (AC-9, bestätigt).
- Vorlauf unter 48 h: Lobby offen (Beitritt, Zahlung, kein Austritt) bis 1 h vor Anstoß, dann Absage mit Erstattung oder sofortige Buchung (AC-13 bis AC-16). Der 1-h-Job muss nachholbar sein und gebuchte Spiele nie absagen.
- Parallele Zahlungen/Austritte: Zeilensperren und idempotente `ledger.post`-Schlüssel.
- Geparktes Geld: bis zur Buchung internes Konto der Lobby; Absage und Austritt buchen nur zurück.
- Fällt der Schließ-Job aus, bliebe die Lobby offen: Der Job muss nachholbar sein.
- Zwei Captains im Teamspiel: "Bereit"-Reset bei jeder Zahlenänderung.
- `settleMatch` Endabrechnung muss mit Fixpreis konsistent bleiben (keine zweite Differenz).

## Datenschutz / Sicherheit
- Zahlungen/Erstattungen: Idempotenz, Hauptbuch, Rechte; Security-Review Pflicht. Keine neuen personenbezogenen Daten.

## Offene Fragen
- Zusage der Halle: Wortlaut und Umsetzung der Antwortfrist stehen in Vertrag 011 (AC-9, AC-10, AC-13, AC-14).
- Keine offenen Fragen zum Geldmodell. Bestätigt: v2-Annahmen, v3-Entscheide (kein 48-h-Mindestvorlauf, sofortige Buchung unter 48 h, 1-h-Abbruch, Altspiele-Regel, Turnier-Anmeldeschluss unter 48 h wie heute).
- Backlog: Captain-Tausch nach der Frist (Folgeauftrag, Nr. 9), Wertung bei Nichterscheinen (Nr. 10).
- Die Auszahlung an Veranstalter braucht vor Go-live einen Zahlungsdienstleister (siehe `docs/loop/GO-LIVE-AUDIT.md`).

## End-to-End-Nachweis
`tests/e2e/payments.spec.ts` und `tests/e2e/turnier-ablauf.spec.ts`: Teamspiel mit 10 Spielern zahlt Miete ÷ 10, beide "Bereit", Preis fix; Austritt mit Erstattung vor der Frist, Liste gesperrt nach der Frist; zweiter Lauf: zur 48-h-Frist nicht alle bezahlt oder nicht beide "Bereit" → Absage und Erstattung; dritter Lauf: Teamspiel mit 30 h Vorlauf bucht sofort nach allen Zahlungen und beiden "Bereit", vierter Lauf: bei fehlender Zahlung oder fehlendem "Bereit" wird 1 h vor Anstoß abgesagt und erstattet; Turnier mit 3 Teams zahlt ceil(Preis ÷ tatsächliche Spieler) und folgt derselben 48-h-Frist; fünfter Lauf (Halle mit Zugang): ohne Zusage Absage und Erstattung zur 48-h-Frist bzw. 1 h vor Anstoß, mit Zusage Buchung.
