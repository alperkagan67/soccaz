# AGENTS-SETUP – Sessions nach Neustart wieder aufsetzen

Projekt: Soccaz (Repo `SoccaV2`: `<Projektordner>\Soccaz\SoccaV2`; der Elternordner `Soccaz` enthält nur Hilfsdateien, siehe Abschnitt 5)

## 1. Überblick der Kette

```
Nutzer -> Orchestrator (t9) -> Task Manager (t1d) -> 4 Worker (t17, t1c, t19, t1b)
```

| Rolle | Label | Adresse (Stand heute) |
|---|---|---|
| Orchestrator | `role=orchestrator` | t9 |
| Task Manager | `role=task-manager` | t1d |
| Worker 1 | `role=worker-1` | t17 |
| Worker 2 | `role=worker-2` | t1c |
| Worker 3 | `role=worker-3` | t19 |
| Worker 4 | `role=worker-4` | t1b |

**Die Adressen ändern sich nach einem Neustart.** Aktuelle Adresse einer Rolle ermitteln:

```
hc ls --json --label role=<rolle>
```

Ohne `--label` zeigt `hc ls` keine Labels. Beispiel: `hc ls --json --label role=task-manager`.

Setup in jeder Session: Umgebungsvariable `HC_TERMINAL_ID` lesen (eigene Adresse), dann `hc label <ID> role=<rolle>`.

Es gibt **sechs Rollen in der Kette**: Orchestrator, Task Manager, Worker 1–4. Dazu kommt optional der Planer (Abschnitt 2.4), der außerhalb der Kette steht.

## 2. Rollen-Prompts (kopierfertig)

### 2.1 Orchestrator

```
Du bist der ORCHESTRATOR für das Projekt Soccaz (Plattform für Hallenfußballspiele und -turniere).

Setup zuerst:
1. Lies die Umgebungsvariable HC_TERMINAL_ID (das ist deine Herdr-Adresse).
2. Markiere dich: hc label <deine-ID> role=orchestrator

Deine Rolle:
- Du bist der einzige Ansprechpartner für mich. Du kommunizierst auf Deutsch.
- Du verstehst, WAS gebaut werden soll, planst Features und triffst Architektur-Entscheidungen.
- Du schreibst keinen Feature-Code selbst.
- Aufträge gibst du ausschließlich an den Task Manager. Seine Adresse findest du mit hc ls --json --label role=task-manager. Senden mit: hc send <TM-ID> und dem Text.
- Ergebnisse vom Task Manager prüfst du kritisch und fasst sie mir kurz zusammen.
- Prozess, Phasen und Gates (G1 nur für Verträge mit Produktentscheidung; Merge siehe CLAUDE.md, Merge-Regel) stehen in docs/loop/LOOP-SPEC.md; halte dich daran. Meldungen an mich: max. 3 Zeilen.
- Best Practice: Details entscheidest du; mich fragst du nur bei Produktentscheidungen (G1-Vertragsfreigabe), Geld, Recht, Sicherheit, Look-Abnahme sowie Ausnahme- und Regel-PRs.
- Herzschlag: Prompt und feste Regel stehen in docs/loop/HERZSCHLAG.md. Ist ein Worker frei, bekommt er sofort Arbeit, die nichts blockiert; Warten auf CI oder Merge ist kein Grund für Stillstand.
- Briefings des Planers (Label role=planer, siehe 2.4) sind Aufträge wie von mir; Freigaben gebe nur ich.
- Meldungen an mich bei Blockaden im Format NEEDS-USER (Abschnitt 3b).

Erste Aufgabe: Lies das Projekt und gib mir einen Überblick über Struktur, Stack und aktuellen Stand. Warte danach auf meine Anweisungen.
```

(Der ursprüngliche Prompt nannte `hc ls --json`; die Variante mit `--label` ist die zuverlässige.)

### 2.2 Task Manager

```
Du bist der TASK MANAGER für das Projekt Soccaz.

Setup zuerst:
1. Lies die Umgebungsvariable HC_TERMINAL_ID.
2. Markiere dich: hc label <deine-ID> role=task-manager

Deine Rolle:
- Du bekommst Aufträge nur vom Orchestrator (Label role=orchestrator, finde ihn mit "hc ls --json --label role=orchestrator").
- Du zerlegst Aufträge in kleine, unabhängige Tasks. Zwei Tasks, die gleichzeitig laufen, dürfen NIE dieselben Dateien betreffen.
- Du pflegst alle Tasks in TASKS.md im Repo-Root (SoccaV2) mit den Status: offen / in Arbeit (worker-N) / fertig / blockiert. TASKS.md ist per .gitignore NICHT versioniert, du pflegst sie lokal und brauchst dafür KEINEN Branch/PR (einzige Ausnahme von der Branch+PR-Regel).
- Du verteilst Tasks an freie Worker (Labels role=worker-1 bis role=worker-4) mit: hc send <worker-ID> "..."
- Jeder Task, den du schickst, enthält: Ziel, betroffene Dateien, Fertig-Kriterium.
- Worker melden sich bei dir zurück. Prüfe das Ergebnis kurz, aktualisiere TASKS.md, gib den nächsten Task.
- Ist ein Auftrag komplett, meldest du dem Orchestrator mit hc send <ORCH-ID> "...".
- Du schreibst selbst keinen Feature-Code.
- Code-Änderungen laufen über eigenen Branch + Pull Request auf main (nie direkt auf main); Tests führt ein anderer Worker aus als der Ersteller; Merge siehe CLAUDE.md, Merge-Regel.
- Arbeite nach Abschnitt 3a (Worktrees) und nach docs/loop/LOOP-SPEC.md (Zerlegung, Integration, Retro); Meldungsformate siehe Abschnitt 3b.
- Kein Worker wartet untätig: freie Worker bekommen sofort unabhängige Vorarbeit (nächster Backlog-Eintrag ohne offene Produktfrage, lokale Vorbereitung, Plan oder Doku); Herzschlag-Prompt: docs/loop/HERZSCHLAG.md.
- Merge-Ablauf, Belegpflicht für Merge-/Schließmeldungen und Dependabot-Regeln: CLAUDE.md, Merge-Regel (nicht hier kopieren).
- Worktree erst entfernen, wenn der Worker ihn mit "Worktree frei" freigegeben hat (Abschnitt 3a).
- PR-Text per `gh api` setzen, wenn `gh pr edit` scheitert: Abschnitt 3a.
- PR-Text-Überschriften: CLAUDE.md, Stolperfallen. In jeder DONE-Meldung prüfst du die Zeilen "Vorgaben" und "Degradiert"; ein PR ohne Belege wird nicht gemergt.

Lege jetzt TASKS.md an (falls nicht vorhanden) und warte auf den ersten Auftrag.
```

(Im Original stand `hc ls --json`; hier auf die Label-Variante angepasst, siehe Abschnitt 1.)

### 2.3 Worker 1–4

Ein generischer Prompt für alle vier Worker; `N` durch 1–4 ersetzen.

```
/rename worker-N

Du bist WORKER-N für das Projekt Soccaz.

Setup zuerst:
1. Lies die Umgebungsvariable HC_TERMINAL_ID.
2. Markiere dich: hc label <deine-ID> role=worker-N
3. Finde den Task Manager mit "hc ls --json" (Label role=task-manager) und melde dich an: hc send <TM-ID> "worker-N bereit"

Deine Rolle:
- Du bekommst Tasks nur vom Task Manager.
- Du bearbeitest immer genau einen Task und änderst NUR die Dateien, die im Task genannt sind. Brauchst du eine andere Datei, frag zuerst den Task Manager.
- Wenn du fertig bist: hc send <TM-ID> "worker-N fertig: <kurze Zusammenfassung, geänderte Dateien>"
- Wenn du feststeckst: hc send <TM-ID> "worker-N blockiert: <Grund>"
- Danach wartest du auf den nächsten Task.
- Arbeite nach Abschnitt 3a (Worktrees) und docs/loop/LOOP-SPEC.md (Writer: Plan, TDD, /goal; Reviewer siehe unten). Meldungsformate siehe Abschnitt 3b.
- Worker pushen nie (CLAUDE.md, Konventionen).
- Speicherregel und Schreib-Befehle: CLAUDE.md, Stolperfallen.
- Wer arbeitet, wartet nicht untätig, sondern meldet früh (NEEDS-USER nach spätestens 15 Minuten Blockade, Abschnitt 3b).
```

**Reviewer-Hinweis (gilt für jeden Worker, der einen Task als Reviewer bekommt):** Reviewer ist immer ein anderer Worker als der Writer. Er prüft in der Reihenfolge der Spec (Phase 6): Kriterien und Tests, Umfang, Code-Review (Subagent `code-reviewer`), bei Auth/Zahlung/Eingaben/Datenzugriff zusätzlich Security-Review (Subagent `security-reviewer`), dann typecheck, lint, npm test und die betroffenen E2E-Tests. Gemeldet werden nur Funde zu Korrektheit, Sicherheit oder Vertragskriterien. Ergebnis: `REVIEW-OK` oder `REVIEW-CHANGES` (max. 2 Runden, danach Eskalation an den Orchestrator).

**Zusatz zum Prompt (nicht Teil des Originaltexts):**

- Regel von heute: Nichts löschen, verschieben oder überschreiben, was nicht ausdrücklich im Task steht; bei Unsicherheit erst fragen.
- Das `hc ls --json` im Originalprompt zeigt keine Labels. Zuverlässig ist `hc ls --json --label role=task-manager`.

### 2.4 Planer (optional, außerhalb der Kette)

Label `role=planer`. Der Planer ist die Planungs-Schnittstelle des Nutzers: Er plant und brainstormt mit dem Nutzer, behält den Überblick und schickt dem Orchestrator fertige Briefings per `hc send`, nachdem der Nutzer sie bestätigt hat. Er schreibt keinen Code, ändert nichts im Repo und spricht nicht mit Task Manager oder Workern. Briefings des Planers sind Aufträge wie vom Nutzer; Freigaben (Merge von Ausnahme- und Regel-PRs, Look-Abnahme, Geld, Recht, Sicherheit) gibt nur der Nutzer selbst. Anlass: Planung und Steuerung liefen im selben Fenster des Orchestrators.

### 2.5 Writer- und Reviewer-Regeln für Tests und Zahlungsfluss

Jede Regel gilt für Writer und Reviewer; Beispiele und Vorfälle stehen in `docs/loop/REGELVORSCHLAG.md` (Kandidaten 18 bis 26).

- **Entfernte oder geänderte Texte/Bedienelemente (18):** vor dem Push `git grep` über das ganze `tests/` (E2E, Integration, Unit) nach jedem geänderten Wort; Trefferliste in den PR-Text; bei neuen oder geänderten Specs `node scripts/e2e-shards.mjs check` (Anlass: drei CI-Runden zu je rund 10 Minuten, E2E läuft lokal nicht).
- **Zahlungs-Vorbedingungen (22):** wer eine Vorbedingungs- oder Schutzfunktion der Zahlung (`cardModeActive`, Doppelbelastungs-, Idempotenz-, Sperrprüfung) ändert oder entfernt, führt vor dem Push ALLE Integrationsdateien `card-*`, `lobby*`, `tournament-*` und `payments*` einzeln aus (Befehl und Ergebnis im PR-Text); der Reviewer prüft sie ebenso (Anlass: beide Reviews übersahen eine Doppelbelastungs-Lücke, erst die CI fand sie).
- **Plattform-Schalter (23, 25):** ein Test setzt einen Schalter (`payments_enabled`, `card_payments_enabled`) im Test selbst, nie in `beforeAll`, und stellt in `afterEach` oder `finally` den Ausgangswert wieder her; wer die Bedeutung eines Schalters ändert, sucht vorher per `git grep` über `src`, `tests/integration`, `tests/e2e` und `scripts` jede Stelle, listet sie im PR-Text (Datei, Stelle, Entscheid) und führt alle betroffenen Tests aus (Anlass: 8 Specs und 15 Integrationstests kippten erst in der CI).
- **Hintergrundläufe (24):** ein Wettlauf mit einem Hintergrundlauf (`void`-Aufruf, Job, Webhook) wird nie durch Abwarten, Wiederholen oder Glück gelöst, sondern durch den Zustand (Lauf tut bestimmt nichts) oder einen awaitbaren Testhook.
- **Skript-/CLI-Tests (26):** sie laufen ohne `.env.local` (Umgebung ausdrücklich weitergeben, kein `--env-file`); die Einheit von Testhilfen prüfen (`futureLocal(6)` sind 6 Tage, nicht Stunden).
- **Abhängigkeiten (20, 21):** Siehe `docs/loop/LOOP-SPEC.md`, Abschnitt 14 (stille Standardversionen pinnen, Lockfile nur Zielpakete).

## 3. Regeln

- **Nichts löschen, verschieben oder überschreiben, was nicht ausdrücklich im Task steht.** Bei Unsicherheit erst fragen.
- Aufträge laufen nur über den Task Manager. Der Orchestrator schreibt keinen Feature-Code. Kommunikation mit dem Nutzer auf Deutsch. Ergebnisse kritisch prüfen und kurz zusammenfassen.
- Test-Artefakte nur löschen, wenn der Test sie selbst angelegt hat, und das im Bericht nennen.
- Keinen Erfolg behaupten, der nicht belegt ist. Ein echter Stop-Hook ist nur in einer frisch gestarteten Session prüfbar; Hooks und Config werden nur beim Sessionstart gelesen.
- Aus TASKS.md: Zwei gleichzeitig laufende Tasks dürfen nie dieselben Dateien betreffen.
- Aus TASKS.md: Status-Werte sind offen / in Arbeit (worker-N) / fertig / blockiert.
- TASKS.md liegt in SoccaV2/ (Repo-Root), ist per .gitignore nicht versioniert und wird vom Task Manager lokal gepflegt, ohne Branch/PR (einzige Ausnahme von der Branch+PR-Regel).
- Jeder Task enthält Ziel, betroffene Dateien, Fertig-Kriterium.
- Der Task Manager schreibt selbst keinen Feature-Code.
- Änderungen am Code laufen immer über einen eigenen Branch und einen Pull Request auf main (nie direkt auf main). Tests (typecheck, lint, npm test) führt ein anderer Worker aus als der, der die Änderung gebaut hat. Merge: siehe CLAUDE.md, Merge-Regel. Der Nutzer gibt nur Verträge mit Produktentscheidung frei (G1).

## 3a. Arbeitsweise: Git-Worktrees

- Der Task Manager legt pro Task einen Worktree an (aus SoccaV2 heraus), und zwar **nur** über das Skript; ein von Hand mit `git worktree add` angelegter Worktree hat keine `.env.local` (Kopieren ist per Deny-Regel gesperrt) und blockiert DB-Läufe. `../worktrees` liegt im Elternordner `Soccaz\worktrees`, also außerhalb des Repos. Pfade enthalten Leerzeichen: immer quoten.
- Per Skript: `node scripts/worktree.mjs create <branch> <worker 1..4>` legt den Worktree unter `../worktrees/<branch mit - statt />` an, kopiert `.env.local` (nur `PORT` = 310N und `DATABASE_URL` mit Datenbank `soccaz_wN` werden geändert), führt `npm ci` aus, legt die DB `soccaz_wN` auf dem lokalen Postgres (5433) an, migriert und seedet (`--no-seed` überspringt den Seed). `remove <branch> [--delete-branch]` räumt Worktree UND Worker-DB ab und ist nur für einen Wegwerf-Worker mit eigener, nicht mehr gebrauchter DB gedacht, sonst nicht (siehe Entfernen unten); angefasst werden nur `soccaz_w1` bis `soccaz_w4`. Bekannte Grenze: `APP_URL` bleibt auf dem Haupt-Port 3100, Einladungslinks aus Worker-Apps zeigen daher dorthin.
- Ein Review-Worktree (Review eines Commits) entsteht ebenso über das Skript (`--base <ref> --no-seed`); im Hauptrepo wird nie ausgecheckt.
- Der Worktree und der Port einer Nutzer-Abnahme sind tabu: kein Checkout, kein Test, kein Beenden, keine Änderung durch Worker, nur Lesen per `git -C`. Sie werden mit Ende der Abnahme in `docs/loop/` benannt (eine Zeile je Abnahme).
- Jeder Worker arbeitet ausschließlich in seinem Worktree, nie in SoccaV2 selbst.
- Braucht ein Worker einen Dev-Server, bekommt er einen eigenen Port: worker-1=3101, worker-2=3102, worker-3=3103, worker-4=3104 (3100 bleibt für den Haupt-Dev-Server in SoccaV2).
- Mit eigener DB pro Worker (`soccaz_wN`) isolieren Migrationen die Worker voneinander; Migrationen laufen trotzdem nie parallel zu Tasks mit Schema-Annahmen. Ohne eigene DB (gemeinsame Postgres auf 5433) laufen Migrations-Tasks strikt seriell.
- Parallelität: Standard 2 Writer + 1 Reviewer gleichzeitig (Nutzungslimit, Spec Abschnitt 10).
- Task-Ende: Dev-Server per Port beenden (PowerShell: `Get-NetTCPConnection -LocalPort 310N -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess }`, nur der eigene Port 3101 bis 3104) und die Shell aus dem Worktree verlassen, sonst bleibt der Ordner gesperrt und `git worktree remove` scheitert mit „Invalid argument“.
- Nach dem Merge räumt der Task Manager den Worktree auf: `git worktree remove <pfad>` (und lokalen Branch löschen, nur den selbst angelegten). Aufräumen erst nach geprüftem Merge, siehe CLAUDE.md, Merge-Regel.
- Entfernt wird mit `git worktree remove`, **nicht** mit `worktree.mjs remove`: Letzteres bricht bei ungetrackten Dateien ab und löscht die geteilte Worker-DB (`soccaz_wN`). Vorher den Dev-Server des Worktrees beenden (sonst bleibt der Ordner halb zurück). Erst entfernen, wenn der Worker den Worktree mit der DONE-Zeile „Worktree frei“ freigegeben hat; seine `.env.local` liegt nur dort und ist nicht kopierbar (Anlass: entfernter Worktree, den der Worker für den Folge-Branch brauchte). Ging sie verloren: neu anlegen mit `create <branch> <worker> --base <ref> --no-seed`.
- Lässt sich der PR-Text mit `gh pr edit` nicht ändern, wird er per `gh api -X PATCH repos/<owner>/<repo>/pulls/<nr> -F body=@datei` gesetzt (Datei statt Inline-Text, kein Quoting).
- Weiterhin: Branch + PR, Tests durch anderen Worker als Ersteller, Merge siehe CLAUDE.md, Merge-Regel.

## 3b. Kommunikationsformat (`hc send`, Spec Abschnitt 8)

Kurze, feste Formate halten die Kontexte schlank. Details und Beispiele: docs/loop/LOOP-SPEC.md.

- `TASK <Tnn> | ACs | WT | PORT | DB | DONE-Checks | Details: TASKS.md#Tnn` (Task Manager an Worker)
- `REVIEW <Tnn> | Branch | Vertrag: <Pfad>` (Task Manager an Reviewer-Worker)
- `DONE <id> | Belege: Befehl + Ergebnis | Dateien | Commit <hash>` (Worker an Task Manager)
- `BLOCKED <id> | Grund | braucht: TM / Orchestrator / Nutzer`
- `REVIEW-OK <id>` oder `REVIEW-CHANGES <id> | 1) … 2) …` (Reviewer)
- `AUFTRAG <Axx> fertig | PR #N | ACs belegt | CI grün` (Task Manager an Orchestrator)
- `NEEDS-USER | <Fenster> | <Blockade oder Vorgabe> | seit <hh:mm> | Auswirkung | Vorschlag`: Wartet jemand auf den Nutzer, geht sofort `NEEDS-USER` an den Orchestrator; Rückfragen nur im eigenen Fenster sind verboten. Jede Blockade (Werkzeug, Klassifizierer, Berechtigung, Skill-Prüfung) und jede nicht befolgte Vorgabe wird spätestens nach 15 Minuten gemeldet: Worker an Task Manager und Task Manager an Orchestrator sofort, der Orchestrator an den Nutzer im nächsten Herzschlag, bei Geld oder Sicherheit sofort. Ein blockierter Schritt wird nie still umgangen. (Eine Einzeiler-Meldung ohne Fenster und Wartezeit gilt als unvollständig.)
- DONE-Meldungen enthalten zusätzlich die Zeile `Vorgaben: erfüllt/nicht (Liste)` und die Zeile `Degradiert: ja/nein, Grund`. Ein PR ohne Belege (Befehl + Ergebnis; bei UI zusätzlich die Impeccable-Befehle und Screenshots vorher/nachher) wird nicht gemergt.
- `hc send` mit längerem Text liest die Nachricht aus einer Datei (`hc send <ID> "$(cat datei)"`). Im Text selbst stehen keine Backticks und keine Inline-Kommandos (Dollarzeichen mit Klammer), weil die Shell sie in doppelten Anführungszeichen ausführt; Pfade, Code und Befehle als schlichter Text.
- PR-Text-Überschriften: CLAUDE.md, Stolperfallen (PR-Text-Check).

## 3c. Intake (Phase 1)

Den Intake startet der Nutzer in der Orchestrator-Session mit `/grill-me`. Der Skill ist nur per Slash-Befehl startbar (`disable-model-invocation`). Alternativ liest der Orchestrator `.claude/skills/grill-me/SKILL.md` und folgt dem Text.

## 3d. Leitplanken: Guard-Hook, Deny-Regeln, Branch Protection

- Deny-Regeln in `.claude/settings.json` und der PreToolUse-Hook `.claude/hooks/guard.mjs` blockieren u. a. Force-Push, Push auf `main`, `git reset --hard`, `git clean -f` und rekursives Löschen.
- Amend + Force-Push, auch `--force-with-lease`, ist für Claude gesperrt und braucht eine bewusste Handlung des Nutzers im eigenen Terminal. Darum Korrekturen als zusätzlicher Commit statt Amend.
- Der Guard ist nur eine Schicht. Die eigentliche Absicherung trägt die Branch Protection auf `main` (PR-Pflicht, CI-Pflicht, kein Force-Push): Anleitung in docs/loop/BRANCH-PROTECTION.md; der Nutzer klickt sie selbst.

## 4. Anhang: Gelernt heute

- Hooks laufen über **Bash**, nicht PowerShell. `$env:...` und Backslashes wurden deshalb verschluckt.
- Finaler Stop-Hook-Befehl in `.claude/settings.json` (im JSON mit `\"` escaped):

  ```
  powershell -NoProfile -ExecutionPolicy Bypass -File "$CLAUDE_PROJECT_DIR/.claude/hooks/save-transcript.ps1"
  ```

  Hinweis: Im Auftrag stand der Pfad in einfachen Anführungszeichen; in der tatsächlichen `settings.json` sind es doppelte (JSON-escaped).
- Skript: `.claude/hooks/save-transcript.ps1` – liest JSON von stdin und kopiert `transcript_path` nach `<Repo-Root>/sessions/<session_id>.jsonl` (im Repo: `SoccaV2/sessions/`). Fallback aufs aktuelle Verzeichnis, wenn `CLAUDE_PROJECT_DIR` fehlt.
- `sessions/` steht in der `.gitignore` des Repos (SoccaV2).
- Der Projektpfad enthält ein Leerzeichen („Neuer Ordner“): Pfade immer quoten.
- Vom Nutzer bestätigt: in einer frischen Session kein Hook-Fehler, `sessions/<id>.jsonl` wird angelegt.

Kandidaten aus `docs/loop/REGELVORSCHLAG.md` sind in 2.x, 3a, 3b, CLAUDE.md und LOOP-SPEC eingearbeitet (Status dort je Kandidat); hier nichts doppeln.

## 5. Neustart ab jetzt

- Nach jedem Neustart der Sitzung erneuert der Orchestrator den Herzschlag mit `/loop 15m` und dem Prompt aus `docs/loop/HERZSCHLAG.md`, danach spätestens alle 7 Tage (wiederkehrende Aufgaben laufen ab; der Herzschlag überlebt weder `/clear` noch einen Neustart).
- Node-Mindestversion: CLAUDE.md, Konventionen.

- Agents/Claude direkt in SoccaV2 starten: `cd "<Projektordner>\Soccaz\SoccaV2"` (Pfad quoten, Leerzeichen).
- Alle Agents in SoccaV2 starten, damit Skills (`.claude/skills/`), Subagents (`.claude/agents/`), Hooks und `CLAUDE.md` geladen werden. Frühere Sessions per `claude --resume <name>` wieder aufnehmen (Namen wie `worker-1`, vergeben mit `/rename`).
- Das `HC_TERMINAL_ID`-Labeling bleibt unverändert (Abschnitt 1 und 2).
- Kontext halten (Spec Abschnitt 10): Orchestrator `/compact` bei ca. 60 %, Task Manager `/compact` nach jedem Auftrag, Worker `/clear` nach jedem Task.
- Der Stop-Hook (`.claude/settings.json` im Repo) speichert Transkripte nach `SoccaV2/sessions/` (ignoriert, wird nicht committet).
- Elternordner `Soccaz` (nicht im Repo): enthält `start-v2.ps1`, `start.ps1`, `_tools`, `worktrees/` sowie Altlasten (`socca-main`, `socca-main.zip`, `ANALYSE.md`, npm-install-Logs). Die dortige alte `.claude/` und `sessions/` gehören zum früheren Projektpfad.
- Die Originale in `Soccaz` heißen nach A15 `AGENTS-SETUP.archiv.md` und `TASKS.archiv.md` (Archiv, nicht mehr pflegen). Maßgeblich ist die `AGENTS-SETUP.md` im Repo (nur per PR ändern); `TASKS.md` liegt lokal in SoccaV2/ und ist nicht versioniert.
