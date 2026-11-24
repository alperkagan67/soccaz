# Plan: Demo-Funde Turnier (K.-o.-Unentschieden, Spielplan 15+5, Abpfiff, Helfer, Spaßspiel)

Stand: Freitag 27.11.2026 · Verfasser: worker-2 · Auftrag t2q/Nutzer (nur **Plan, kein Code**) · gelesen am Stand `origin/main` (`af28d4f`): `src/lib/tournament.ts`, `src/server/tournaments.ts`, `src/server/results.ts`, `src/app/spiele/[id]/MatchClient.tsx`, `src/app/turniere/[id]/{BracketView,BoardClock,BoardInfo,page}.tsx`, `src/db/schema-league.ts`. Zeiten sind **Arbeitstage eines Workers** (Schätzung, nicht gemessen); Kalendertage stehen im Abschnitt 8.

## 1. Kurzfassung
| # | Paket | PRs | Tage | Migration | Risiko |
|---|---|---|---|---|---|
| 0 | **Eine** gemeinsame Migration `0062` (`decided_by`, `gap_minutes`) | 1 | 0,5 + 2 CI-Läufe | **0062** | niedrig (additiv) |
| 1 | K.-o.-Unentschieden: 2 Min Golden Goal, danach Neunmeter | 2 (Server, Oberfläche) | 2,5 | (0062) | mittel (Ablauf des Turniertags) |
| 2 | Spielplan 15 + 5 Minuten (Befund M2: 87 statt 15) | 1 | 1,5 | (0062) | mittel (ändert bestehende Tests) |
| 3 | Abpfiff-Knopf: Lücken schließen | im Paket 1 | 0,5 | – | niedrig |
| 4 | Helfer/Schiedsrichter: **Variante B** (Empfehlung) oder A | 1 | B: 2,0 · A: 3,5 | **0063** (nach 0062) | **hoch** (Rechtefläche), security-reviewer |
| 5 | Spaßspiel (Platz 3): nur Anzeige und Text | in Paket 1/2 | 0,25 | – | niedrig |
| | **Summe** (0, 1, 2, 3, 4B, 5) | 6 PRs | **ca. 7,3** | 0062, 0063 | |

**Empfehlung vorab (Abschnitt 9):** Den Freeze heute Abend **nicht** mit (1), (2) und (4) halten. Das ist in einem Tag nicht ehrlich zu schaffen (Migrationen brauchen zwei grüne CI-Läufe auf verschiedenen Ständen). Freeze für alles andere, ein **Fenster Mo 30.11. bis Mi 2.12.** für diese Pakete, Generalprobe auf Staging dann mit diesem Stand.

## 2. Befund zu „bei 0:0 rückt ein Team einfach weiter“
Nach dem Code **nicht reproduzierbar**: `advanceFromMatch` (`tournaments.ts`) schreibt den Stand und ruft `koWinner`; bei Gleichstand ist der Sieger `null`, das Spiel bleibt offen und der Veranstalter bekommt die Mitteilung „Siebenmeterschießen eintragen“. Es gibt **kein** stilles Weiterrücken. Der Pfad zum Entscheiden ist `decideShootout` (nur `canManage`, nur bei `scoreA === scoreB`, setzt `tournament_matches.shootout_winner`, Audit `tournament.shootout`); die Oberfläche ist die zweite Schaltfläche im Bracket. Was den Eindruck der Demo erklären kann: der Veranstalter muss die Entscheidung **hinterher von Hand** finden (Mitteilung/Bracket), im Abpfiff-Dialog steht nur ein Hinweistext, und es gibt weder Golden Goal noch eine Neunmeter-Erfassung. **Bitte den Demo-Beleg** (Spiel, Schritte) nennen: ohne ihn bleibt es bei dieser Lesart.

## 3. Paket 0: Migration 0062 (Voraussetzung für 1 und 2)
`tournament_matches.decided_by text null check (decided_by in ('gg','9m'))` und `tournaments.gap_minutes integer not null default 5 check (gap_minutes between 0 and 30)`; beides additiv, Down-Skript in `drizzle/down`, ein Integrationstest („Altzeilen unverändert“). **Serielle Regel:** nie parallel zu einer anderen Schema-Aufgabe; Zahlungs-/Migrations-PR-Regel: **zwei grüne Läufe auf verschiedenen SHAs**. Höchste Nummer auf `main`: `0061_apple_id.sql`. Dateien: `drizzle/0062_*.sql`, `drizzle/down/…`, `src/db/schema-league.ts`, `tests/integration/migration-0062.test.ts`. Reviewer: w1 (Schema), w3.

## 4. Paket 1: K.-o.-Unentschieden
**Regel (Entscheid t2q):** Spielzeit endet unentschieden → **2 Minuten Golden Goal** (aus dem 5-Minuten-Puffer) → wenn kein Tor: **Neunmeter im direkten Wechsel**, bis einer verschießt. Gilt nur für **K.-o.-Spiele** (`stage ko:*`), **nicht** in der Gruppenphase und nicht im Spaßspiel.
- **Server (PR 1a, 1,0 Tag):** `decideShootout` wird zu `decideTie(userId, tournamentId, tournamentMatchId, kind: 'gg' | '9m', winnerTeamId)`: Rechte wie heute (später `canScore`, Paket 4), nur bei offenem Gleichstand; `gg`: Spielstand des Siegers im **Turnierplan** +1 (z. B. 2:2 → 3:2), `decided_by = 'gg'`; `9m`: Stand bleibt, `shootout_winner` gesetzt, `decided_by = '9m'`; danach `completeKo` wie bisher. **Entscheid nötig (Q1):** das GG-Tor nur im Turnierplan (`tournament_matches`) oder auch im Spielergebnis (`matches`/`match_results`)? **Empfehlung: nur im Turnierplan** (Abschluss, Elo, Statistik und `finishMatch` bleiben unberührt; das Spiel selbst bleibt 2:2). `koWinner` bekommt `decidedBy`-Prüfung; Audit `tournament.tiebreak` mit `kind`. Alte Zeilen ohne `decided_by` bleiben gültig (`null` = regulär oder Altwert).
- **Oberfläche (PR 1b, 1,0 Tag):** Veranstalter-Dialog bei Gleichstand mit **Pflichtauswahl** „Golden Goal für A“ / „Golden Goal für B“ / „Neunmeter, Sieger A“ / „Neunmeter, Sieger B“ (eine Hauptaktion, 44 px, große Bestätigung „A 2 : 2 B → GG für A“); Einstieg an drei Stellen: Bracket, Spielseite nach Abpfiff (bei Gleichstand statt des Hinweistexts), Mitteilung „Entscheidung eintragen“. Anzeige „n. GG“ / „n. 9m“ im Bracket, auf der Turnierseite und auf der Spielkarte. Regeln-Text im Kasten „Ablauf des Turniers“ (kurz, gratis-fest ohne Zahlungswort).
- **Dateien:** `src/lib/tournament.ts`, `src/server/tournaments.ts`, `src/server/tournament-actions.ts`, `src/app/turniere/[id]/{BracketView,page}.tsx`, `src/app/spiele/[id]/{MatchClient,page}.tsx`, `src/server/results.ts` (nur Hinweis), Tests.
- **Tests:** `koWinner` (Gleichstand, `gg`, `9m`, falscher Sieger), `decideTie` (Rechte, nicht unentschieden, bereits entschieden, Gruppenphase abgewiesen, Weiterrücken ins Folgespiel, Finale beendet das Turnier), **Mutation** (Gleichstandsprüfung entfernt, `decided_by` nicht gesetzt), E2E-Zelle in der PR-D-Skizze/`turnier-tag.spec`. Reviewer: w3 (results), w4 (Oberfläche/Texte).

## 5. Paket 2: Spielplan 15 + 5 (Befund M2)
Heute: `planSchedule` (`src/lib/tournament.ts`) berechnet `slotMinutes = (Hallenzeit − Pausen) / Blöcke` (Beispiel 87 Minuten); das Formularfeld „Spielzeit pro Spiel“ (`matchMinutes`, Standard 15) wird für den Plan **ignoriert**. Neu (Entscheid t2q): **Slot = Spielzeit (Standard 15) + Puffer (Standard 5) = 20**; die Hallenzeit ist nur noch ein **Fenster**: ist der Plan länger, erscheint eine **Warnung** (kein Abbruch).
- **Umbau (1,5 Tage, 1 PR):** `planSchedule(rounds, startsAt, matchMinutes, gapMinutes, courts)` (Hallenzeit nur für `fitsWindow`), `scheduleFromRows`, `scheduleOf`/`createGames` (`tournaments.ts`: `minutes = matchMinutes`), `BoardClock`/`BoardInfo`/Turnierseite (Anzeige „Spiel 15 Min, Puffer 5 Min, Spielende 14:15, nächstes 14:20“), `TournamentForm` (Felder „Spielzeit pro Spiel“ und „Puffer“ mit Hinweis „Im Puffer läuft bei Gleichstand das Golden Goal, danach Neunmeter“; Live-Hinweis „Plan dauert X Min, Hallenzeit Y Min“). Puffer nach Paket 0 (`gap_minutes`), Standard 5.
- **Betroffene Tests (7 Dateien, Erwartungswerte ändern sich):** `tests/unit/{tournament,tournament-freilose}.test.ts`, `tests/integration/{league,tournament-card-flow,tournament-ergebnis-veranstalter}.test.ts`, `tests/e2e/{turnier-tag.spec.ts,turnier-tag-helpers.ts}`. **Mutation:** Slot wieder aus der Hallenzeit gerechnet → Test rot; Fenster-Warnung bei zu langem Plan.
- **Konflikte:** `page.tsx`, `TournamentForm.tsx` (w1: PR 2 Layout/PR 3 Token #397): Paket 2 **nach** #397 rebasen. Reviewer: w4 (Anzeige), w1 (Plan-Logik).

## 6. Paket 3: Abpfiff-Knopf (#387): Lücken
Gelesen: `EndMatchPanel` beendet mit dem Stand **aus den erfassten Toren** (nur Veranstalter/Admin ohne Team; Team-Admin meldet), mit Bestätigung und großer Anzeige. Lücken:
1. **Gleichstand:** nur ein Hinweistext, kein Dialog → Paket 1 (Dialog direkt nach dem Abpfiff). 
2. **Die Uhr stoppt nicht:** `BoardClock` läuft nach der Wanduhr des Plans, nicht nach dem Abpfiff; ein früh beendetes Spiel zeigt weiter „Läuft gerade“ → Anzeige „beendet um hh:mm“ am Block, wenn alle Spiele des Blocks beendet sind (klein, 0,25 Tag).
3. **Nachspielzeit gibt es im Code nicht** (keine Anzeige): nicht bauen, im Regeltext nicht erwähnen.
4. **Abpfiff ohne erfasste Tore** = 0:0 (große Bestätigung zeigt es; Hinweis „Keine Tore erfasst“ ergänzen, 0,25 Tag).
5. **Kein Zurück** nach „Endgültig beenden“ (Runbook 11.1); echte Korrektur Backlog 262 (nach dem 12.12.).
6. **Beleg Sofort-Endgültig:** Ergebnis des Veranstalters/Admins ist ohne Gegnerbestätigung und ohne 48 Stunden endgültig seit #387 (`submitResultIn` → `upsertFinal`; Test `tests/integration/tournament-ergebnis-veranstalter.test.ts`).

## 7. Paket 4: Helfer des Veranstalters (Schiedsrichter)
**Heute:** `loadAdminContext` (`results.ts`) setzt `organizer = !side && isTournamentOrganizer(...)`; Turnier-Eingriffe (`decideShootout`, Kampflos, Schließen, Absagen) prüfen `canManage`/`organizerId` in `tournaments.ts`. **Rechte der Helfer (nur dieses Turnier):** Ergebnis eintragen/entscheiden, Abpfiff, Kampflos, Tie-Break (Paket 1); **nicht:** Teams verwalten, Anmeldung schließen, Absage, Halle, Einladungslink, Geld. Zentral: neue Prüfung `canScore(tx, userId, t)` = `canManage` **oder** Helfer; `canManage` bleibt unverändert für alles andere. Ein Helfer, der im Spiel selbst Team-Admin ist, handelt wie ein Team (wie der Veranstalter heute).
- **Variante B (Empfehlung, 2,0 Tage + security 0,5):** Tabelle `tournament_helpers (tournament_id, user_id, created_by, created_at, PK)` (**Migration 0063**, nach 0062); der Veranstalter wählt Helfer **nur aus Mitgliedern angemeldeter Teams** (Liste „Vorname I.“, Häkchen „Schiedsrichter“); **kein Einladungslink, kein neuer Anmeldeweg, keine E-Mail-Suche**. Die Helfer sehen das Turnier ohnehin (Mitglied eines angemeldeten Teams, PR 3 #397).
- **Variante A (3,5 Tage):** beliebiges Konto per Helfer-Link (eigener Token, Einlöse-Seite, Widerruf), plus Sichtrechte für Nicht-Mitglieder bei privaten Turnieren: größere Angriffsfläche; **nach dem 12.12.**.
- **Sicherheit (beide):** security-reviewer Pflicht; Test je Recht (Helfer darf: Ergebnis, Abpfiff, Kampflos, Tie-Break; darf **nicht**: Absage, Schließen, Teams entfernen, andere Turniere, fremde Turniere, nach Entzug), **Mutation** (Prüfung auf `canManage` statt `canScore` vertauscht; Helfer-Eintrag eines anderen Turniers), Audit je Ernennung/Entzug (`tournament.helper_add/remove`, nur IDs). Reviewer: w1 (Rechte), security-reviewer, w4 (Oberfläche).
- **NICHT:** der Helfer bekommt keinen Veranstalter-Zugang, keine Einladungslinks, keine Geldfunktionen.

## 8. Paket 5, Reihenfolge, CI-Slots, Reviewer
**Spaßspiel (Platz 3):** bleibt eine **Anzeige ohne Ergebnis**; im K.-o.-Modus nur Text („Spaßspiel der Halbfinal-Verlierer, ohne Wertung, ohne Golden Goal“) in `BoardInfo`/Regeltext (0,25 Tag, in Paket 1/2 mit).
**Reihenfolge (max. 2 PRs gleichzeitig in der CI, Migrationen seriell):**
1. **PR 0** Migration 0062 (Tag 1, danach zwei grüne Läufe) → danach parallel
2. **PR 2** Spielplan (w2) und **PR 1a** Server Tie-Break (w3)
3. **PR 1b** Oberfläche (w4, nach 1a und #397)
4. **PR 4B** Helfer (Migration **0063 erst nach dem Merge von 0062**), danach Paket 3-Kleinteile und 5.
**Abhängigkeiten:** #396 gemergt; #397 (w1, Token) vor PR 1b und PR 2; Staging-Generalprobe 30.11. bis 2.12. läuft mit dem jeweils gemergten Stand.
**Kalender (3 Worker parallel, Annahme):** PR 0 Fr/Sa (Läufe), PR 2 und 1a Mo/Di, 1b Di/Mi, 4B Mi/Do: **Merge-Ende Mi 2.12. (ohne 4B), Do 3.12. (mit 4B)**: das kollidiert mit dem Go-live-Fenster (3./4.12., Puffer 5.12.).

## 9. Empfehlung
1. **Freeze heute nicht mit (1)+(2)+(4) halten**, Verschiebung bis **Mo 30.11. (bis Mi 2.12.)** akzeptieren, Generalprobe mit diesem Stand.
2. **Priorität:** zuerst **(2) Spielplan** (sichtbarster Fehler, kein Datenrisiko), dann **(1) Tie-Break**, dann **(4B)**; **(3)** und **(5)** laufen mit. Fällt die Zeit knapp: **(4B) streichen** (Veranstalter und Admin können alles; Runbook-Hinweis „Admin 1 als Zweitgerät“) und **(1)** nur als Server+Dialog ohne Spielkarten-Anzeige.
3. **Ohne diese Pakete** funktioniert der Turniertag über den **heutigen Pfad** (Gleichstand → Veranstalter trägt den Sieger des Siebenmeterschießens ein; Spielplan über die Hallenzeit): Runbook 5a/11 beschreibt das. Der Spielplan zeigt dabei lange Slots (Befund M2): **vorläufiger Ausweg:** Hallenzeit = Spielzeit×Blöcke wählen oder den Plan ignorieren.

## 10. Offene Fragen (Produkt)
1. **Q1** GG-Tor nur im Turnierplan oder auch im Spielergebnis? (Empfehlung: nur Turnierplan.)
2. **Q2** Neunmeter-Ablauf: im Spiel erfassen (Schussfolge) oder nur der Sieger? (Plan: nur Sieger.)
3. **Q3** Puffer als **Feld** (Spalte `gap_minutes`) oder fest 5? (Plan: Feld, Standard 5.)
4. **Q4** Helfer: Variante B jetzt, A nach dem 12.12.?
5. **Q5** Wer baut was (Worker-Zuteilung): Vorschlag w2: 0 + 2, w3: 1a + 4B, w4: 1b + Texte, w1: #397 und Reviews.
