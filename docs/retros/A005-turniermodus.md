## Retro A005 Turniermodus – 2026-11-09
Was lief gut: 9 Tasks seriell, jeder mit `REVIEW-OK`; der Security-Review fand eine Redirect-Lücke und eine Testlücke, die Mutationsprüfung der Reviewer hat sich bewährt.
Was ging schief: Test- und Dev-Server-Locks sowie Aufräum-Ketten (Symptom: blockierte Ordner und Ports; Ursache: laufende Prozesse im Worktree; Fix: bereits in AGENTS-SETUP.md geregelt). Außerdem lagen Reviewer-Befunde teils außerhalb des Task-Umfangs (Symptom: Scope-Streit im laufenden PR; Ursache: kein Ablageort dafür; Fix: Backlog).
Prävention:
1. Mutationsprüfung ist Standard für Sicherheits- und Geld-Tests (Regel entfernen, Test muss rot werden) → Ziel: AGENTS-SETUP.md
2. Befunde außerhalb des Task-Umfangs kommen als Eintrag in `docs/loop/BACKLOG.md`, nicht in den laufenden PR → Ziel: CLAUDE.md
3. Nach jedem Auftrag `/clear` (Worker) bzw. `/compact` (Orchestrator, Task Manager) → Ziel: CLAUDE.md
