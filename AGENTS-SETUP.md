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

Es gibt **sechs Rollen**: Orchestrator, Task Manager, Worker 1–4.

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
- Du pflegst alle Tasks in TASKS.md im Repo-Root (SoccaV2) mit den Status: offen / in Arbeit (worker-N) / fertig / blockiert.
- Du verteilst Tasks an freie Worker (Labels role=worker-1 bis role=worker-4) mit: hc send <worker-ID> "..."
- Jeder Task, den du schickst, enthält: Ziel, betroffene Dateien, Fertig-Kriterium.
- Worker melden sich bei dir zurück. Prüfe das Ergebnis kurz, aktualisiere TASKS.md, gib den nächsten Task.
- Ist ein Auftrag komplett, meldest du dem Orchestrator mit hc send <ORCH-ID> "...".
- Du schreibst selbst keinen Feature-Code.
- Code-Änderungen laufen über eigenen Branch + Pull Request auf main (nie direkt auf main); Tests führt ein anderer Worker aus als der Ersteller; Merge erst nach ausdrücklicher Freigabe des Nutzers.
- Arbeite nach Abschnitt 3a (Worktrees).

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
- Arbeite nach Abschnitt 3a (Worktrees).
```

**Zusatz zum Prompt (nicht Teil des Originaltexts):**

- Regel von heute: Nichts löschen, verschieben oder überschreiben, was nicht ausdrücklich im Task steht; bei Unsicherheit erst fragen.
- Das `hc ls --json` im Originalprompt zeigt keine Labels. Zuverlässig ist `hc ls --json --label role=task-manager`.

## 3. Regeln

- **Nichts löschen, verschieben oder überschreiben, was nicht ausdrücklich im Task steht.** Bei Unsicherheit erst fragen.
- Aufträge laufen nur über den Task Manager. Der Orchestrator schreibt keinen Feature-Code. Kommunikation mit dem Nutzer auf Deutsch. Ergebnisse kritisch prüfen und kurz zusammenfassen.
- Test-Artefakte nur löschen, wenn der Test sie selbst angelegt hat, und das im Bericht nennen.
- Keinen Erfolg behaupten, der nicht belegt ist. Ein echter Stop-Hook ist nur in einer frisch gestarteten Session prüfbar; Hooks und Config werden nur beim Sessionstart gelesen.
- Aus TASKS.md: Zwei gleichzeitig laufende Tasks dürfen nie dieselben Dateien betreffen.
- Aus TASKS.md: Status-Werte sind offen / in Arbeit (worker-N) / fertig / blockiert.
- Jeder Task enthält Ziel, betroffene Dateien, Fertig-Kriterium.
- Der Task Manager schreibt selbst keinen Feature-Code.
- Änderungen am Code laufen immer über einen eigenen Branch und einen Pull Request auf main (nie direkt auf main). Tests (typecheck, lint, npm test) führt ein anderer Worker aus als der, der die Änderung gebaut hat. Gemergt wird erst nach ausdrücklicher Freigabe des Nutzers.

## 3a. Arbeitsweise: Git-Worktrees

- Der Task Manager legt pro Task einen Worktree an (aus SoccaV2 heraus): `git worktree add ../worktrees/<branch> -b <branch>`. `../worktrees` liegt im Elternordner `Soccaz\worktrees`, also außerhalb des Repos. Pfade enthalten Leerzeichen: immer quoten.
- Er kopiert `.env.local` aus SoccaV2 in den Worktree; der Worker führt dort `npm install` aus.
- Jeder Worker arbeitet ausschließlich in seinem Worktree, nie in SoccaV2 selbst.
- Braucht ein Worker einen Dev-Server, bekommt er einen eigenen Port: worker-1=3101, worker-2=3102, worker-3=3103, worker-4=3104 (3100 bleibt für den Haupt-Dev-Server in SoccaV2).
- Tasks mit Datenbank-Migrationen laufen nie parallel zu anderen Tasks (alle teilen sich die lokale Postgres auf 5433).
- Nach dem Merge räumt der Task Manager den Worktree auf: `git worktree remove <pfad>` (und lokalen Branch löschen, nur den selbst angelegten).
- Weiterhin: Branch + PR, Tests durch anderen Worker als Ersteller, Merge nur nach Nutzer-Freigabe.

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

## 5. Neustart ab jetzt

- Agents/Claude direkt in SoccaV2 starten: `cd "<Projektordner>\Soccaz\SoccaV2"` (Pfad quoten, Leerzeichen).
- Das `HC_TERMINAL_ID`-Labeling bleibt unverändert (Abschnitt 1 und 2).
- Der Stop-Hook (`.claude/settings.json` im Repo) speichert Transkripte nach `SoccaV2/sessions/` (ignoriert, wird nicht committet).
- Elternordner `Soccaz` (nicht im Repo): enthält `start-v2.ps1`, `start.ps1`, `_tools`, `worktrees/` sowie Altlasten (`socca-main`, `socca-main.zip`, `ANALYSE.md`, npm-install-Logs). Die dortige alte `.claude/` und `sessions/` gehören zum früheren Projektpfad.
