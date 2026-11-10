# 008 – Geldmodell Teamspiel und Turnier: Miete ÷ tatsächliche Spielerzahl
Status: Entwurf (2026-11-10)
Version: 1

## Ziel
Teamspiel und Turnier rechnen wie das Privatspiel (Vertrag 006): Jeder zahlt Miete ÷ tatsächliche Spielerzahl (aufgerundet), ohne Mindestzahl 8, ohne Deckel 12 und ohne Reservierung mit späterer Rückbuchung. Im Teamspiel wird die Spielerzahl mit dem zweiten "Bereit" festgeschrieben, danach gilt Austausch 1:1; Austritt ist bis 48 h vor Anstoß möglich; ist die Miete 24 h vor Anstoß nicht gedeckt, fällt das Spiel aus und alle werden erstattet. Das Turnier nutzt nur noch `shareCents`.

## Nutzer und Rollen
- Captain (Team-Admin), Spieler, Platform-Admin (Fallback bei Absage); im Turnier zusätzlich Turnier-Manager. Rollen wie heute.

## Entscheidungen (vom Nutzer, 2026-11-10)
- Teamspiel: Anteil = aufgerundet Miete ÷ tatsächliche Spielerzahl (4 bis 22, gerade); `min_paid_players` und Deckel 12 entfallen für diese Berechnung.
- Spielerzahl wird im Teamspiel wie in 006 mit dem zweiten "Bereit" fixiert; Neuberechnung nur davor, danach Austausch 1:1.
- Alles oder nichts auch im Teamspiel: 24 h vor Anstoß nicht gedeckt → Absage, volle Erstattung, Plattform trägt die Differenz nie auf Spieler.
- Austritt/Rauswurf im Teamspiel bis 48 h vor Anstoß (ersetzt die 24-h-Regel), danach Liste gesperrt, keine Erstattung.
- Turnier nutzt nur `shareCents`; keine Reservierung nach `MIN_PLAYERS_PER_TEAM`.

## Annahmen (Orchestrator-Vorschlag, bitte prüfen)
- Das Turnier behält seine eigene Fixierung (`maybeFixPrice`) und Anmeldefrist (`registrationDeadline`); die 48-h-Sperre und der 24-h-Job gelten dort nicht, Turnier-Absage bleibt manuell oder per Anmeldefrist. Nur die Formel wird vereinheitlicht.
- Die Vorschau im Turnier zeigt Spanne aus `shareCents` für minimale/maximale Spielerzahl; Preis wird erst bei Fixierung verbindlich.
- Laufende, bereits reservierte Spiele werden nach altem Modell abgerechnet; neues Modell gilt für Spiele, die nach dem Deploy angelegt werden (Flag am Spiel oder Stichtag).
- Teamspiel hat zwei Captains: "Bereit" beider Teams wird wie in 006 behandelt.

## Nicht-Ziele
- Oberfläche/Navigation (Vertrag 007).
- 48-h-Sperre und 24-h-Absage im Turnier.
- Änderung von Plattform-Gebühren, Aufladung, Hallenpreisen.
- Zahlung für andere Spieler.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Teamspiel, Miete M, n Spieler | Anteil berechnet | ceil(M ÷ n) für n 4 bis 22, ohne Deckel 12 und ohne Minimum 8 | tests/unit/money.test.ts |
| AC-2 | Teamspiel, noch nicht beide "Bereit" | Spielerzahl ändert sich | Anteil neu gerechnet, Überzahlung als Guthaben zurück, Nachforderung, "Bereit" beider Teams zurückgesetzt | tests/integration/lobby-ready.test.ts |
| AC-3 | Teamspiel, beide Captains "Bereit" (auch parallel) | Zweites "Bereit" | Spielerzahl und Preis fest, Verbuchung genau einmal, Hauptbuch ausgeglichen | tests/integration/lobby-ready.test.ts |
| AC-4 | Nach Fixierung, mehr als 48 h bis Anstoß | Spieler steigt aus, Ersatz zahlt denselben Anteil | Erst dann Erstattung an den Abgesprungenen; Zahl, Anteil, "Bereit" unverändert | tests/integration/wallet.test.ts |
| AC-5 | Weniger als 48 h bis Anstoß | Austritt oder Rauswurf (Server-Aktion) | Abgelehnt, keine Erstattung | tests/integration/wallet.test.ts |
| AC-6 | 24 h vor Anstoß, Miete nicht gedeckt | Job läuft | Teamspiel abgesagt, alle erstattet; gedeckt: bleibt bestätigt | tests/integration/wallet.test.ts |
| AC-7 | Turnier mit Gesamtpreis T, n tatsächliche Spieler | Preis fixiert (`maybeFixPrice`) | Anteil = ceil(T ÷ n), keine Reservierung davor; Vorschau aus `shareCents` | tests/unit/tournament.test.ts, tests/integration/tournament.test.ts |
| AC-8 | Turnier, Spielerzahl ändert sich vor Fixierung | Kader wird geändert | Preis neu gerechnet, bestehende Zahlungen verrechnet bzw. erstattet | tests/integration/tournament.test.ts |
| AC-9 | Altes, bereits reserviertes Spiel | Abrechnung | Altes Modell unverändert, Hauptbuch ausgeglichen | tests/integration/payments.test.ts |
| AC-10 | Gesamtablauf Teamspiel und Turnier | Zahlen, Fixieren, Austausch | Betrag je Spieler entspricht Miete ÷ Spielerzahl, nirgends 8/12 | tests/e2e/payments.spec.ts, tests/e2e/turnier-ablauf.spec.ts |

## Meilensteine (seriell, gemeinsame Dateien `wallet.ts`, `lobby.ts`, `tournaments.ts`)
- M1: Rechenmodul für Team/Turnier, Reservierung entfällt (AC-1, AC-7, AC-9)
- M2: Fixierung, Neuberechnung, Austausch (AC-2, AC-3, AC-4, AC-8)
- M3: Fristen und Absage (AC-5, AC-6), E2E (AC-10)

## Betroffene Bereiche
- `src/lib/money.ts`, `src/lib/lobby-rules.ts`, `src/lib/tournament.ts`
- `src/server/wallet.ts`, `src/server/lobby.ts`, `src/server/tournaments.ts`, `src/server/scheduled.ts`, `src/server/settings.ts` (`min_paid_players`)
- Datenbank: Migration nur für Fixierungsmarke am Spiel/Stichtag; additiv, Eintrag in `docs/loop/GO-LIVE-AUDIT.md`.
- Tests siehe Tabelle.

## Risiken und Randfälle
- Rundung: Überschuss (< n Cent) bleibt bei der Plattform, nie Fehlbetrag.
- Nichtzahler zählen im Divisor; Miete gedeckt nur, wenn alle zahlen oder der Captain sie entfernt.
- Umstellung mitten im Betrieb: Altspiele nicht neu rechnen (AC-9).
- Parallele Zahlungen/Austritte: Zeilensperren und idempotente `ledger.post`-Schlüssel.
- Zwei Captains im Teamspiel: "Bereit"-Reset bei jeder Zahlenänderung.
- `settleMatch` Endabrechnung muss mit Fixpreis konsistent bleiben (keine zweite Differenz).

## Datenschutz / Sicherheit
- Zahlungen/Erstattungen: Idempotenz, Hauptbuch, Rechte; Security-Review Pflicht. Keine neuen personenbezogenen Daten.

## Offene Fragen
- Gilt die 48-h-Sperre auch für das Turnier? Annahme: nein (eigene Anmeldefrist).

## End-to-End-Nachweis
`tests/e2e/payments.spec.ts` und `tests/e2e/turnier-ablauf.spec.ts`: Teamspiel mit 10 Spielern zahlt Miete ÷ 10, beide "Bereit", Preis fix; Austausch 1:1; zweiter Lauf: nicht gedeckt 24 h vor Anstoß → Absage und Erstattung; Turnier mit 3 Teams zahlt ceil(Preis ÷ tatsächliche Spieler).
