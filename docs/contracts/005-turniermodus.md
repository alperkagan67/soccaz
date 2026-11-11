# 005 – Turniermodus
Status: Freigegeben (2026-11-09)
Version: 2 (AC-8 präzisiert, 2026-11-09)
Entwurf v-neu, wartet auf 012: Zahlungsstellen auf Karte umgeschrieben, Turnier-Anteil an der Hallenmiete, Geld direkt an die Halle, Veranstalter ohne Geld; gilt erst mit G1 von Vertrag 012 (dort M5 Turnier); Versionsnummer bleibt 2.

## Ziel
Der Turniermodus existiert im Code weitgehend (Anlegen, Anmelden, Kader, Preis, Zahlung, K.-o.-Bracket, Aufrücken, Absage). Dieser Vertrag schließt die Lücken zwischen Brief und Ist-Zustand, damit ein Organisator (z. B. Moscheen verschiedener Städte im Ramadan) ein privates K.-o.-Turnier sicher durchführen kann: Captains drücken erst nach vollständiger Zahlung ihres Teams auf "Bereit", Spieler können füreinander zahlen, das Bracket entsteht genau einmal und zufällig gelost, und der Organisator kann Ergebnisse eintragen und Streit entscheiden.

Grundlage: `docs/briefs/turnier-privatspiel.md`, `docs/analysis/ist-analyse.md` (Abschnitte 9, 10).

## Nutzer und Rollen
- Organisator: legt Turnier an, ersetzt Teams, entscheidet Streit, trägt Ergebnisse ein, sagt ab.
- Captain (ein Team-Admin je Turnierteam): meldet Kader, drückt "Bereit", zahlt optional für sein Team.
- Spieler: zahlt für sich und für Mitspieler seines Teams.
- Zuschauer / neuer Nutzer: erreicht das Turnier nur per Einladungslink (`?t=`), sieht kein Bracket vor der Erzeugung.
- Platform-Admin: Fallback bei Streit.

## Entscheidungen (mit dem Nutzer geklärt: "du bist der Boss", Orchestrator-Empfehlung übernommen)
- Eintritt bleibt berechnet: Anteil = aufgerundet Hallenmiete des Turniers ÷ tatsächliche Spielerzahl (`shareCents`), fixiert bei vollständigem Kader (kein frei gesetzter Eintritt; `entryFeeCents` als Einsatz entfällt mit 012 M5).
- Ablauf: Kader vollzählig → Preis fixiert → Karte hinterlegen → Captain "Bereit" (nur wenn bei allen Teamspielern eine Karte hinterlegt ist; abgebucht wird erst beim Fixieren, siehe Vertrag 012) → Bracket, wenn alle Teams bereit sind.
- Geld: wird beim Fixieren von der Karte abgebucht (Vertrag 012); das Geld geht direkt an die Halle abzüglich Halle-Provision (Vertrag 009). Der Veranstalter organisiert nur und bekommt kein Geld, es gibt keine Preisgelder aus Einsätzen. Veranstalter-Auszahlung (`tournaments.ts:558-559`), Konto `tournament`, globale Turnier-Kommission und `splitEntryFees` entfallen mit 012 M5 (bis dahin gilt der Ist-Stand); bei Absage Vollerstattung per Stripe-Refund auf die Karte.
- Spieler zahlen füreinander nur innerhalb des eigenen Teams; "Anteil übernehmen" (Zahlung füreinander) belastet beim Fixieren; Erstattung per Stripe-Refund auf die Karte des Zahlers (`paidBy`).
- Nach der Zahlung kein Selbst-Rückzug; Ausstieg über Organisator (Kader wieder öffnen oder Team ersetzen), volle Erstattung auf die Karte des Zahlers (Stripe-Refund).
- Bracket wird einmalig zufällig gelost (statt Anmeldereihenfolge).
- Organisator darf im Turnier Ergebnisse eintragen und Streit entscheiden; Plattform-Admin bleibt Fallback; 48-h-Auto-Bestätigung bleibt unverändert.
- Nach Anmeldeschluss mit zu wenigen Teams: Organisator wählt Weitermachen (mindestens 4 Teams, Freilose) oder Absage mit Vollerstattung; am Anmeldeschluss bekommt er eine Benachrichtigung.
- Nutzer ohne Team sieht im Turnier einen Hinweis mit Link "Team gründen" (vorhandene Teamfunktion), danach Rückkehr.

## Nicht-Ziele
- Privatspiel (Vertrag 006).
- Trennung der Oberfläche in Teamspiel / Privatspiel / Turnier und Navigation (006); Turniere bleiben nicht in Header/BottomNav.
- Andere Formate als K.-o. (Gruppen, Rundenturnier); Teamzahl bleibt 4 bis 32 mit Freilosen.
- Frei vom Organisator gesetzter Eintritt pro Spieler.
- Änderung von Provision, Zeitplan (2 Plätze, Spaßspiel), Board/LIVE-Anzeige.
- Zahlung für Spieler fremder Teams; Selbst-Rückzug nach Zahlung.
- Setzung nach Stärke; eigenes Team-Formular im Turnier; neue Registrierungsmethoden.
- Gespeicherter Losungs-Seed (die Auslosung steht in den Spielplan-Zeilen).

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Turnier in Phase `payment`, Team hat Spieler ohne Karte | Captain ruft "Bereit" auf (Server-Aktion, nicht nur UI) | Fehler; sobald bei allen Teamspielern eine Karte hinterlegt ist (oder ein anderer den Anteil übernommen hat), gelingt "Bereit"; Gebühr für Spieler: keine | tests/integration/tournament.test.ts |
| AC-2 | Team ist "Bereit" | Kader ändert sich, eine Karte oder Übernahme entfällt oder der Organisator öffnet Kader wieder | "Bereit" wird zurückgesetzt | tests/integration/tournament.test.ts |
| AC-3 | Nicht alle Teams angemeldet, vollständig mit hinterlegter Karte und bereit | Seite oder Serverfunktion liefert das Turnier | Keine Spielplan-Zeilen und kein Bracket in der Antwort; nach Erfüllung aller Bedingungen entsteht genau ein Bracket, auch bei parallelen Aufrufen | tests/integration/tournament.test.ts |
| AC-4 | Spieler A und B im selben Team, B hat keine Karte hinterlegt | A übernimmt den Anteil von B | B gilt als gedeckt, A wird beim Fixieren belastet (nicht sofort), `paidBy` = A; zweite (parallele) Zahlung für B wird abgewiesen | tests/integration/tournament.test.ts |
| AC-5 | A ist in Team X, B in Team Y | A übernimmt den Anteil von B | Abgelehnt (nur eigenes Team) | tests/integration/tournament.test.ts |
| AC-6 | Übernahme von A für B, Kader wird wieder geöffnet oder Turnier abgesagt | Erstattung läuft | Stripe-Refund auf die Karte von A (Zahler), nicht an B | tests/integration/tournament.test.ts |
| AC-7 | Captain zahlt für einzelne oder alle (bestehendes Verhalten) | Wie bisher | Verhalten unverändert (Regression) | tests/integration/tournament.test.ts |
| AC-8 | Phase `payment` oder später | Spieler versucht auszutreten oder Team abzumelden | Abgelehnt; nur der Organisator kann den Kader öffnen und danach ein Team ersetzen (Reihenfolge: Kader öffnen, dann ersetzen), mit voller Erstattung auf die Karte des Zahlers | tests/integration/tournament.test.ts |
| AC-9 | Alle Bedingungen erfüllt | Bracket wird erzeugt | Reihenfolge der Teams ist zufällig (nicht Anmeldereihenfolge, Test mit injizierter Zufallsquelle), Freilose korrekt, genau ein Bracket | tests/unit/tournament.test.ts, tests/integration/tournament.test.ts |
| AC-10 | Turnierspiel, Organisator ist weder Team-Admin noch Plattform-Admin | Organisator trägt Ergebnis ein oder entscheidet Streit | Erlaubt; Sieger rückt automatisch auf. Ein fremder Nutzer wird abgewiesen | tests/integration/tournament.test.ts |
| AC-11 | Anmeldeschluss erreicht, weniger Teams als `maxTeams` | Organisator wählt "Weitermachen" (≥ 4 Teams) oder "Absagen" | Weitermachen: Bracket mit Freilosen; Absage: Vollerstattung; unter 4 Teams ist nur Absage möglich; Organisator erhält am Anmeldeschluss eine Benachrichtigung | tests/integration/tournament.test.ts |
| AC-12 | Eingeloggter Nutzer ohne Team öffnet das Turnier per Link | Seite rendert | Hinweis mit Link "Team gründen"; nach Gründung Rückkehr zum Turnier | tests/e2e/turnier-ablauf.spec.ts |
| AC-13 | Neuer, nicht eingeloggter Nutzer öffnet `/turniere/{id}?t=…` | Er meldet sich an bzw. registriert sich | Er landet wieder im Turnier mit Einladung | tests/e2e/turnier-ablauf.spec.ts |
| AC-14 | Gesamtablauf | Organisator legt an, 4 Teams treten bei, alle hinterlegen eine Karte, Captains "Bereit", Fixieren mit Abbuchung, Ergebnisse, Finale | Genau ein Bracket erst am Ende, Sieger rücken auf (angepasster Test ersetzt "Bereit nur nach Zahlung" aus `phase4.spec.ts:123`) | tests/e2e/phase4.spec.ts |

## Meilensteine
Reihenfolge strikt seriell: alle Meilensteine ändern `src/server/tournaments.ts`; M1 enthält eine Migration.
- M1: Bereit-Stufe nach Zahlung (Migration, AC-1, AC-2, AC-3, AC-14)
- M2: Zahlung füreinander und Rückzug (AC-4, AC-5, AC-6, AC-7, AC-8)
- M3: Zufällige Auslosung und Ergebnisse (AC-9, AC-10)
- M4: Randfälle und Zugang (AC-11, AC-12, AC-13)

## Betroffene Bereiche
- `src/server/tournaments.ts`, `src/server/tournament-actions.ts`, `src/lib/tournament.ts`
- `src/server/results.ts` (nur Turnierfall), `src/server/finalizers.ts` (nur lesend)
- `src/app/turniere/[id]/page.tsx` (+ `RegisterForm.tsx`, Zahlungs-/Bereit-Knöpfe)
- `src/server/scheduled.ts` bzw. Jobs (Benachrichtigung am Anmeldeschluss)
- **Datenbank:** eine additive Migration: nullable Spalte `tournament_teams.paid_ready_at` (Bereit nach Zahlung). `ready_at` behält die Bedeutung "Kader vollzählig".
- API-Routen: keine neuen.
- Tests: `tests/integration/tournament.test.ts`, `tests/unit/tournament.test.ts`, `tests/e2e/phase4.spec.ts`, neu `tests/e2e/turnier-ablauf.spec.ts`

## Risiken und Randfälle
- Migration läuft nie parallel zu anderen Tasks mit Schema-Annahmen; PR mit Migration ist ein Ausnahme-PR (Nutzer merged selbst, NEEDS-USER).
- Doppelzahlung bei Zahlung von zwei Spielern für denselben Spieler: Buchungsschlüssel ist zahlerunabhängig, Zeilensperre bleibt; Rückgabewert der Abbuchung (Idempotenz) muss ausgewertet werden (Muster in Vertrag 012).
- Erstattung an den Zahler, wenn der Zahler später nicht mehr im Turnier ist: Erstattung geht trotzdem per Stripe-Refund auf seine Karte.
- Captain-Wechsel gibt es nicht (kein `captainId`-Update); unverändert.
- Ungerade Teamzahlen: Freilose, Aufrücken ohne Gegner prüfen.
- Alte Turniere ohne `paid_ready_at`: Migration muss bestehende laufende Turniere unverändert lassen (Spalte NULL; Bracket nur für Turniere in Phase `payment` neu prüfen).
- Organisator ist selbst Spieler oder Captain: Rechte dürfen sich nicht überlagern.
- Zufall muss testbar sein (injizierte Zufallsquelle), sonst flackernde Tests.
- Schreibende Aktionen laufen als Server Actions; Rechteprüfung serverseitig, nicht nur im Frontend.

## Datenschutz / Sicherheit
- Zahlungen: Abbuchung per Karte, Idempotenz und Erstattungsziel (Karte des Zahlers); Security-Review Pflicht.
- Rechte: Organisator-Rechte für Ergebnisse nur im eigenen Turnier; Zahlung nur im eigenen Team.
- Private Turniere: Kader, Zahlungsstand und Einladungslink bleiben für Nicht-Beteiligte verborgen (Regression); Bracket vor Erzeugung auch serverseitig nicht ausgeliefert.
- Keine neuen personenbezogenen Daten.

## Offene Fragen
- (vor Freigabe leer)

Notiert für spätere Verträge: Navigation und Oberfläche (006), Setzung nach Stärke, andere Turnierformate, frei gesetzter Eintritt, Captain-Wechsel.

## End-to-End-Nachweis
`tests/e2e/phase4.spec.ts` (angepasst) und `tests/e2e/turnier-ablauf.spec.ts`: Organisator legt ein privates Turnier an, Teams treten per Einladungslink bei (auch ein neuer Nutzer), alle hinterlegen eine Karte (auch Spieler füreinander per "Anteil übernehmen"), Captains drücken "Bereit", das Bracket erscheint erst dann, Ergebnisse tragen die Sieger bis ins Finale.
