# Backlog

Reihenfolge von oben nach unten. Der nächste Eintrag ohne offene Produktfragen startet ohne Rückfrage (siehe CLAUDE.md, Autonomie und Backlog).

| # | Eintrag | Status |
|---|---------|--------|
| 1 | Härtung: `safeInternalPath` in `guthaben/page.tsx`, `payments.ts` (`safeReturnPath`), `content-actions.ts` (`safePath`) und `actions.ts` (`internalReturnPath`) (#39) | fertig |
| 1 | Härtung: keine Schiedsrichterrechte (Ergebnis eintragen, Streit entscheiden) für Veranstalter, die Mitglied oder Turnierspieler eines beteiligten Teams sind (#40) | fertig |
| 1 | Härtung: `try/catch` je Turnier bei der Anmeldeschluss-Meldung (#40) | fertig |
| 2 | `lobby.ts:441`: Fisher-Yates statt `sort(Math.random() - 0.5)` (#42) | fertig |
| 2 | Locks in `mergeTeams` und `convertLegacyChallenges` (#44, c411eae) | fertig |
| 3 | Übrige Retro-Kandidaten ohne Produktentscheidung: anonymer E2E-Kontext, Kader-Namen unter `/teams/{slug}`, „Eure Lobby“-Texte für Fremde (gehört zusammen mit Eintrag 5; der anonyme E2E-Kontext wird dort als Prüfung mit abgedeckt) | offen |
| 3 | Aus dem T42-Review: `guthaben/page.tsx:75-76` ohne Fallback auf `back` bei ungültigem Altwert | offen |
| 3 | Aus dem T42-Review: `teams/neu/page.tsx:11` Vorab-Muster lässt Tab und Zeilenumbruch durch | offen |
| 3 | Aus dem T42-Review: `notifyUsers`-URLs (`benachrichtigungen/page.tsx:40`, `admin/finanzen/page.tsx:57`) auf Validierung prüfen | offen |
| 3 | Aus dem T42-Review: Zähler `sent` in `notifyRegistrationDeadlines` ist bei Rollback zu hoch | offen |
| 3 | Aus dem Review des Regel-PRs: `docs/loop/BRANCH-PROTECTION.md:7` sagt noch „technisch nur Du per Pull Request nach main“ (veraltet durch die Autonomie-Regel) | offen |
| 3 | Aus Reviews: `mergeTeams` verschiebt `matchRequests.targetTeamId` nicht (der FK mit Cascade löscht offene Herausforderungen still) | offen |
| 3 | Aus Reviews: `matches.vetoTurnTeamId` hat keinen FK und wird beim Zusammenführen von Teams nicht umgeschrieben | offen |
| 3 | Aus Reviews: `convertLegacyChallenges` prüft `archivedAt` nicht | offen |
| 3 | Aus Reviews: In `convertLegacyChallenges` (`src/server/challenges.ts`) fängt der `catch`-Block pro Anfrage nach der Transaktion einen `DomainError` und überspringt die Anfrage ohne Log | offen |
| 3 | Aus Reviews: `ORDER BY asc(userId)` im Pool-SELECT von `randomSplit` (`lobby.ts`) und im zugehörigen Test (stabile Reihenfolge) | offen |
| 3 | Aus Reviews: `shareCents` (`src/lib/money.ts`) hat keine Obergrenze und keine `Number.isSafeInteger`-Prüfung für die Miete; heute prüft der Aufrufer die Mieten | offen |
| 4 | Vertrag 006 Privatspiel (Orchestrator, Produktentscheidungen) | in Arbeit (A006, Vertrag gemergt #43) |
| 5 | B-b Privatsphäre: Lobby-Seite für Fremde neutral („Offene Lobby von {Team}“); `/teams/{slug}`: Kader-Namen nur für Mitglieder und eingeloggte Nutzer, Gäste sehen Teamname, Stadt und Spielerzahl; verbindet den Retro-Kandidaten in Eintrag 3 (anonymer E2E-Kontext, Kader-Namen, „Eure Lobby“-Texte) | offen |
| 6 | B-a Miete ÷ tatsächliche Spielerzahl für das Teamspiel (ersetzt `min_paid_players = 8` und die Reservierung; gleiche Alles-oder-nichts-Regel mit 24 h; gemeinsames Rechenmodul `shareCents` aus Vertrag 006) und das Turnier (dort nur das Modul nutzen) | offen |
| 7 | B-c Vertrag 007: Oberfläche trennen in Teamspiel, Privatspiel und Turnier, dazu Navigation (Orchestrator schreibt den Vertrag nach 006) | offen |

Status: offen / in Arbeit / fertig.
