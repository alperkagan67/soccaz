# 004 – Lobby-Zeitfenster
Status: Freigegeben (2026-11-08)
Version: 1

## Ziel
Teams verstehen im Lobby-Formular (`/matchmaking`), dass "Tag des Spiels / Alternativer Tag 1 / 2" Zeitfenster für die Terminfindung sind und kein Turnier. Außerdem ist belegt und, wo nötig repariert, dass der normale Teamspiel-Ablauf vollständig funktioniert: Team öffnet Lobby, sie erscheint unter "Offene Lobbys und Suchen", ein anderes Team fordert heraus bzw. tritt an. Das Verhalten des Ablaufs bleibt sonst unverändert (Pilot für den Loop).

## Nutzer und Rollen
- Team-Admin (Captain): öffnet Lobby, fordert heraus, nimmt an.
- Teammitglied / Spieler: sieht die eigene offene Lobby samt Kader.
- Zuschauer / nicht eingeloggt: sieht offene Lobbys ohne Spielernamen.
- Platform-Admin: nicht betroffen.

## Nicht-Ziele
- Trennung der Oberfläche in Teamspiel / Privatspiel / Turnier (kommt in 005/006).
- Zusammenlegung der zwei Suchwege `match_requests` (`/app/suche/neu`, `/suche/[id]`) und `matchmaking_queue` (`/matchmaking`).
- Änderungen am Turnier- oder Privatspielmodus.
- Datenmodell: keine Migration, keine Umbenennung von `windows`, `day1..3`, `time_windows`; keine Änderung der Matching-Logik.
- Herausforderung mit Zeit-, Dauer- oder Stadtangabe (heute fest 60 Min, vorläufiger Termin +14 Tage); wird als offener Punkt für einen späteren Vertrag geführt.
- Änderung am Zahlungsverhalten.
- Neue Zusatzfunktionen für den Teamspiel-Ablauf. Gefundene Lücken außer AC-4 bis AC-8 kommen als Liste in einen späteren Vertrag.

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | Team-Admin ist auf `/matchmaking` und sieht das Formular "Lobby aufmachen" | Er öffnet das Formular | Die Felder heißen "Zeitfenster 1", "Zeitfenster 2 (optional)", "Zeitfenster 3 (optional)"; der Hinweistext nennt sie ausdrücklich Zeitfenster für die Terminfindung; "Tag des Spiels" und "Alternativer Tag" kommen nicht mehr vor | tests/e2e/matchmaking.spec.ts |
| AC-2 | Die bestehenden E2E-Tests nutzten `getByLabel("Tag des Spiels")` | Die Beschriftung ist geändert | Die Tests nutzen die neuen Labels und laufen grün | tests/e2e/matchmaking.spec.ts |
| AC-3 | Zahlungen aus, zwei Teams A und B mit je einem Admin | A öffnet eine Lobby, B findet sie unter "Offene Lobbys" (`/suche` bzw. `/matchmaking`) und tritt an oder fordert A heraus | Es entsteht genau ein Spiel; beide Teams sehen es unter `/lobby/{id}`; die Herausforderung kann angenommen werden | tests/e2e/teamspiel-ablauf.spec.ts |
| AC-4 | Zahlungen an, Spieler hat seinen Anteil nicht bezahlt | Er ruft `setReady` auf | Fehler "Bitte zahle zuerst deinen Anteil"; nach Zahlung klappt "Bereit" | tests/integration/lobby-ready.test.ts |
| AC-5 | Offene Lobby `/lobby/offen/{id}` | Nicht eingeloggter Nutzer oder Nicht-Mitglied ruft sie auf | Sichtbar: Team, Stadt, Zeitfenster, Anzahl Spieler; keine Spielernamen. Teammitglieder sehen Namen weiterhin | tests/integration/matchmaking.test.ts, tests/e2e/matchmaking.spec.ts |
| AC-6 | Team A und B, A-Admin | Zwei parallele `challengeTeam`-Aufrufe (auch in Gegenrichtung) | Genau ein Spiel entsteht, der zweite Aufruf liefert "Zwischen euch läuft schon eine Herausforderung." (Sperre im Server, ohne Migration) | tests/integration/challenge.test.ts |
| AC-7 | Ein Team hat 5 offene Herausforderungen oder ist archiviert | Es fordert erneut heraus | Das 6. wird abgelehnt; archiviertes Team wird abgelehnt (Regressionstests für bestehendes Verhalten) | tests/integration/challenge.test.ts |
| AC-8 | Lobby wird verlassen oder geschlossen (`leaveQueue`) | Aktion läuft | `/suche` und `/lobby/offen` werden revalidiert; `QueueForm` nutzt `MAX_WINDOWS` statt hartkodierter 3; toter `successText` ist entfernt | tests/unit/matchmaking.test.ts (MAX_WINDOWS), tests/e2e/matchmaking.spec.ts |
| AC-9 | Panel `ChallengePanel` | Zielteam, Herausforderer und Dritte öffnen das Spiel | Zielteam sieht annehmen/ablehnen, Herausforderer sieht zurückziehen, Dritte sehen den Hinweis | tests/e2e/teamspiel-ablauf.spec.ts |

## Meilensteine
- M1: AC-1, AC-2, AC-8 (Beschriftung und kleine Mängel)
- M2: AC-3, AC-4, AC-9 (Ablauf belegt)
- M3: AC-5, AC-6, AC-7 (Fehler beheben, Regressionstests)

## Betroffene Bereiche
- `src/app/matchmaking/QueueForm.tsx`, `src/app/matchmaking/page.tsx`
- `src/server/matchmaking-actions.ts` (`leaveQueueAction`), `src/server/matchmaking.ts` (`getOpenLobby`)
- `src/app/lobby/offen/[entryId]/page.tsx`
- `src/server/challenges.ts` (`challengeTeam`)
- `src/lib/matchmaking.ts` (`MAX_WINDOWS`, nur lesend)
- Tests: `tests/e2e/matchmaking.spec.ts`, neu `tests/e2e/teamspiel-ablauf.spec.ts`, `tests/integration/challenge.test.ts`, `tests/integration/matchmaking.test.ts`, neu `tests/integration/lobby-ready.test.ts`, `tests/unit/matchmaking.test.ts`
- Datenbank: keine Änderung. API-Routen: keine.

## Risiken und Randfälle
- Die Umbenennung bricht E2E-Tests mit `getByLabel("Tag des Spiels")` (`matchmaking.spec.ts:37`, `:209`); sie werden im selben Task angepasst.
- Zeilensperre bei `challengeTeam` kann Deadlocks erzeugen, wenn beide Richtungen parallel laufen; Sperren in fester Reihenfolge (z. B. nach Team-ID) nehmen.
- Lobby-Seite ohne Namen darf den Beitritt von Teammitgliedern nicht stören (Eingeloggt-Prüfung).
- Randfälle im Testumfang: eigenes Team fordert sich selbst heraus (bereits getestet), abgelaufene Suche ("nicht mehr offen"), Wettlauf beim Annehmen (bereits getestet).
- Zwei Suchwege bleiben nebeneinander; uneinheitliche Begriffe "Lobby" und "Suche" bleiben bis 005/006.

## Datenschutz / Sicherheit
- Personenbezogene Daten: Spielernamen auf `/lobby/offen/{id}` werden für Nicht-Mitglieder und nicht eingeloggte Nutzer entfernt (AC-5).
- Rechte: Team-Admin-Prüfungen bleiben unverändert. Zahlungen werden nicht geändert (AC-4 sichert nur das Bestehende).
- Security-Review ist Pflicht (Datenzugriff in AC-5, Rechte in AC-6).

## Offene Fragen
- (vor Freigabe leer)

Notiert für spätere Verträge (kein Teil von 004): Herausforderung mit Dauer/Zeit/Stadt; Zusammenlegung der zwei Suchwege; einheitliche Begriffe "Lobby" und "Suche"; Unique-Index gegen Doppel-Herausforderung.

## End-to-End-Nachweis
`tests/e2e/teamspiel-ablauf.spec.ts`: Team A öffnet eine Lobby mit Zeitfenstern, Team B findet sie unter den offenen Lobbys und fordert heraus bzw. tritt an, A bzw. B nimmt an, das Spiel erscheint in beiden Teams unter `/lobby/{id}`.
