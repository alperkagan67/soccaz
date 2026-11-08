# TASKS – Soccaz

Status: offen / in Arbeit (worker-N) / fertig / blockiert
Regel: Gleichzeitig laufende Tasks dürfen nie dieselben Dateien betreffen.
Regel (ab Auftrag 2, gilt für alle inkl. Task Manager): Nichts löschen, verschieben oder überschreiben, was nicht ausdrücklich im Task steht. Bei Unsicherheit erst fragen.

## Auftrag A1 (Orchestrator t9): Stop-Hook unter Windows reparieren

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T1 | Stop-Hook auslagern, settings.json ohne $, .gitignore | .claude/hooks/save-transcript.ps1, .claude/settings.json, .gitignore | fertig | settings.json valides JSON ohne $; Skript mit Test-JSON auf stdin erzeugt sessions/<id>.jsonl; keine Parser-Fehler |

## Auftrag A2 (Orchestrator t9): Hook-Pfad via CLAUDE_PROJECT_DIR

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T2 | Hook-Befehl auf $env:CLAUDE_PROJECT_DIR\.claude\hooks\save-transcript.ps1 umstellen + Test aus Unterordner | .claude/settings.json | fertig | gültiges JSON; Test aus Unterordner legt Transkript in <Projektroot>/sessions/<id>.jsonl ab, keine Parser-Fehler |

Regel-Bestätigung (Teil A): gesendet an t17, t1c, t19, t1b – von allen vier bestätigt.

## Auftrag A3 (Orchestrator t9): Hook-Befehl in Bash-Syntax

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T3 | command auf Bash-Syntax ($CLAUDE_PROJECT_DIR/.claude/hooks/save-transcript.ps1, Forward-Slashes) + Test unter bash -c + echter Stop | .claude/settings.json | fertig (Test 2 offen) | gültiges JSON, Befehl exakt; bash-Test Exit 0, Transkript in <Root>/sessions/, nichts im Unterordner; echter Stop geprüft oder ausdrücklich als nicht prüfbar gemeldet |

## Auftrag A4 (Orchestrator t9): AGENTS-SETUP.md

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T4 | AGENTS-SETUP.md (Neustart-Anleitung, Rollen-Prompts, Regeln, Anhang) | AGENTS-SETUP.md | fertig | Datei vollständig, Worker-Prompt nachgetragen |

## Auftrag A5 (Orchestrator t9): Testpush SoccaV2 -> GitHub

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T5 | Branch test/push-check anlegen, PUSHTEST.txt committen, pushen, prüfen, Remote+lokalen Branch wieder löschen | SoccaV2/PUSHTEST.txt (neu), nur Git-Branch test/push-check | fertig | Bericht mit Hashes (lokal == ls-remote, main = ecb3539) und Bestätigung Aufräumen; git status sauber, ls-remote nur main |

## Auftrag A6 (Orchestrator t9): SoccaV2 lokal zum Laufen bringen

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T6 | start-v2.ps1 ausführen, Ports 5433/3100, URLs (/, /spiele, /teams, /rangliste) und Logs prüfen; bei Bedarf db:migrate / npm install | keine Quellcode-Änderung; schreibt nur _tools\pg.log, _tools\next-dev.log/.err (+ ggf. node_modules, DB-Migrationen) | fertig (Warnung /rangliste offen) | Bericht mit Statuscodes, Ports, Logauszug bei Fehlern; Server läuft im Hintergrund |

## Auftrag A7 (Orchestrator t9): Warnung "unstable value new Date()" auf /rangliste beheben

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T7 | connection()/Suspense-Fix für new Date() in /rangliste (kleinste Änderung; Next-Doku in node_modules/next/dist/docs vorher lesen; andere Aufrufer von berlinMonthRange per Grep prüfen) | SoccaV2/src/app/rangliste/page.tsx (ggf. SoccaV2/src/lib/time.ts) | fertig (nicht committed) | Warnung nach frischem Aufruf nicht mehr in _tools/next-dev.err; 200 für /, /rangliste, /spiele, /teams; typecheck + lint ohne neue Fehler; npm test grün oder Fehlschläge als vorbestehend belegt; kein commit/push |

## Auftrag A8 (Orchestrator t9, Nutzer-Freigabe): Fix aus A7 über Branch + Pull Request (nicht direkt auf main)

Fix-Bauer von A7 war worker-3 (t19) -> darf A8 nicht ausführen/testen. Zuordnung: X = worker-1 (T8a, T8c), Y = worker-2 (T8b), Z = worker-4 (T8d).

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T8a | Branch fix/rangliste-prerender von main, NUR page.tsx stagen, committen, pushen (kein main, kein force) | SoccaV2/src/app/rangliste/page.tsx (Git: Branch fix/rangliste-prerender) | fertig (88b2f49) | Commit-Hash, Push ok, Commit-Text wie vorgegeben inkl. Co-Authored-By |
| T8b | typecheck, lint, npm test auf dem Branch (unabhängiger Worker, keine Dateiänderung) | keine | fertig (worker-2: typecheck 0 Fehler, lint 0, test 17/17 Files, 133/133 Tests) | exakte Ergebnisse (Fehler, Tests/Files) |
| T8c | Pull Request auf main erstellen, NICHT mergen | keine Dateien (GitHub PR) | fertig (PR #24 offen, nicht gemergt) | PR-Link; nichts gemergt |
| T8d | Regel in AGENTS-SETUP.md Abschnitt 3 + kurzer Zusatz Task-Manager-Beschreibung ergänzen | AGENTS-SETUP.md (nicht im Git) | fertig | Regel ergänzt, bestehender Text unverändert |

Nach T8b: Checkout zurück auf main (durch X), Dev-Server 3100 weiterlaufen lassen.

## Auftrag A9 (Orchestrator t9, Nutzer-Freigabe): Arbeitsweise Git-Worktrees dokumentieren (gilt ab dem nächsten Code-Auftrag; PR #24 bleibt wie sie ist)

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T9 | Abschnitt '3a. Arbeitsweise: Git-Worktrees' nach Abschnitt 3 einfügen + je 1 Zusatz-Bullet in 2.2 (Task Manager) und 2.3 (Worker) | AGENTS-SETUP.md (nicht im Git) | fertig | Diff zeigt nur Ergänzungen; 3a vollständig; bestehender Text unverändert |

## Auftrag A10 (Orchestrator t9): Abschluss nach Merge von PR #24
PR #24 wurde vom Nutzer selbst gemergt (Merge-Commit 192dfa2, mergedAt 2026-11-07T23:10:55Z). Offen: lokales main aktualisieren, Aufräumen.

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T10 | SoccaV2: main per ff-only auf origin/main (192dfa2), eigenen Branch fix/rangliste-prerender lokal + remote löschen, prune, kontrollieren | keine Dateien (nur Git) | fertig | main lokal == origin (192dfa2), keine Branch-Reste, git status sauber, /rangliste 200 |

## Auftrag A11 (Orchestrator t9): Projekt-Steuerdateien ins Repo SoccaV2 (Nutzer mergt den PR selbst, NICHT mergen)
Reihenfolge: erst T10, dann Worktree durch Task Manager (git worktree add ../worktrees/chore-project-files -b chore/project-files). Bauer worker-1, unabhängige Prüfung worker-2.

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T11a | Dateien kopieren (AGENTS-SETUP.md, TASKS.md, .claude/settings.json, .claude/hooks/save-transcript.ps1), .gitignore + sessions/, Geheimnis-Check, Hook-Test, Pfade in AGENTS-SETUP.md anpassen + Abschnitt 5, Commit, Push | nur Worktree ../worktrees/chore-project-files | fertig (edaff7a) | Commit auf chore/project-files gepusht, Originale in Soccaz unverändert |
| T11b | Unabhängige Prüfung (Hook-Test, JSON-Validität, git ls-files, kein sessions/ im Commit) | keine | fertig | Prüfbericht |
| T11c | PR gegen main erstellen, NICHT mergen | keine | fertig (PR #25 offen, nicht gemergt; wird durch A12 nachgebessert) | PR-Link |

## Auftrag A12 (Orchestrator t9, Nutzer-Freigabe): PR #25 nachbessern (Privatsphäre: Autor-E-Mail, Windows-Username; TASKS.md aktualisieren)
Ausdrücklich freigegeben (Nutzer, 2026-11-08): git commit --amend + git push --force-with-lease NUR auf chore/project-files (nie --force, nie main, nie andere Branches). Worktree Soccaz\worktrees\chore-project-files wird wiederverwendet. Bauer worker-1 (T12a-c), Prüfer worker-2 (T12d). Nutzer mergt selbst.

| ID | Titel | Dateien | Status | Fertig-Kriterium |
|----|-------|---------|--------|------------------|
| T12a | git config user.email (repo-lokal) auf GitHub-noreply; Commit per amend --reset-author neu (nach T12b/c) | Repo-Config SoccaV2 (lokal), Commit auf chore/project-files | Prüfung offen | Autor UND Committer = noreply-Adresse; Co-Authored-By bleibt |
| T12b | Windows-Username/absolute Pfade in den 5 Dateien durch Platzhalter ersetzen | Worktree: AGENTS-SETUP.md, TASKS.md (+ die anderen 3 prüfen) | Prüfung offen | 0 Treffer für Windows-Username, Laufwerks-Userpfad und Mail-Domain (Grep) |
| T12c | Repo-TASKS.md auf aktuellen Stand (A1-A12) bringen, ohne Username/absolute Pfade | Worktree: TASKS.md | Prüfung offen | A10-A12 enthalten; Status A12 'Prüfung offen' |
| T12d | Unabhängige Prüfung auf Remote-Branch (Autor/Committer, Grep, 5 Dateien, JSON+Hook-Test, main unverändert, TASKS A10-A12) + gh pr edit 25 (Body ergänzen) | keine Dateien | offen (wartet auf T12a-c) | Prüfbericht, PR-Body aktualisiert, nicht gemergt |
