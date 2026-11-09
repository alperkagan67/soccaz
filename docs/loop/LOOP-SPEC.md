# Soccaz Development Loop – Spezifikation v1

> **Für das Agenten-Team (Orchestrator, Task Manager, Worker 1–4).**
> Diese Datei beschreibt, WIE wir an Soccaz arbeiten. Sie ist die Vorlage für Auftrag A16.
> Ablageort im Repo: `SoccaV2/docs/loop/LOOP-SPEC.md`
> Änderungen an dieser Datei nur per Branch + PR; Merge siehe CLAUDE.md, Merge-Regel.

---

## 0. Leitprinzipien (Best Practice, mit Begründung)

| # | Prinzip | Warum |
|---|---|---|
| P1 | **Kontext ist die knappste Ressource.** | Die Leistung eines Modells sinkt, je voller sein Kontextfenster ist. Ein Orchestrator, der wochenlang laufen soll, darf nicht jeden Bericht im Detail lesen. |
| P2 | **Kein Task ohne maschinellen Check.** | Ohne Pass/Fail-Signal (Test, Build, Lint, Screenshot) wird der Nutzer zur Prüfschleife. Mit Check schließt sich die Schleife von selbst. |
| P3 | **Erst verstehen, dann planen, dann bauen.** | Agents, die sofort coden, lösen oft das falsche Problem. |
| P4 | **Spec vor Code.** | Akzeptanzkriterien sind die Quelle der Wahrheit. Ist das Ergebnis falsch, wird zuerst geprüft, ob die Spec falsch war. |
| P5 | **Wer schreibt, prüft nicht.** | Ein Reviewer mit frischem Kontext ist nicht von der eigenen Lösung voreingenommen. |
| P6 | **Regeln, die immer gelten müssen, sind Hooks/Permissions, nicht Prompts.** | Texte in CLAUDE.md sind Empfehlungen, Hooks und Deny-Regeln greifen deterministisch. |
| P7 | **Jede Einheit Arbeit macht die nächste leichter.** | Nach jedem Auftrag werden Lehren festgehalten (Compounding). |
| P8 | **Pragmatisch vor perfekt.** | Endlosschleifen aus „noch ein Fund, noch ein Fix" sind der häufigste Kostentreiber. |
| P9 | **Wenige menschliche Pflicht-Gates.** | Der Nutzer gibt nur Verträge mit echten Produktentscheidungen frei (G1); Merge siehe CLAUDE.md, Merge-Regel. Alles andere läuft autonom, Eskalation nur bei Blockaden. |

---

## 1. Rollen

### 1.1 Orchestrator (`role=orchestrator`)
**Zweck:** Langlebige Hauptsession, einziger Ansprechpartner des Nutzers, Architekt.

**Macht:**
- Klärt Anforderungen mit dem Nutzer (grill-me, Phase 1)
- Schreibt den Vertrag (Phase 2) und holt Gate G1 ein
- Startet bei Bedarf einen Council (Phase 3)
- Übergibt den freigegebenen Vertrag an den Task Manager
- Meldet dem Nutzer Status in **max. 3 Zeilen**

**Macht NICHT:**
- Keinen Feature-Code
- Keine Detailprüfung von Worker-Berichten (das macht der Task Manager)
- Keine Diffs, Logs oder Testausgaben lesen, außer bei Eskalation

**Kontext-Regeln:**
- Liest pro Auftrag nur: Vertrag, ADRs, Abschlussmeldung des Task Managers
- Bei ~60 % Kontextauslastung: `/compact Behalte: offene Aufträge, freigegebene Verträge, Entscheidungen, Nutzerpräferenzen`
- Recherche im Code nur über Subagents („Nutze einen Subagent, um X zu untersuchen")

### 1.2 Task Manager (`role=task-manager`)
**Zweck:** Projektleitung und Qualitätssicherung. Hält den Orchestrator frei.

**Macht:**
- Zerlegt den Vertrag in Tasks (Phase 4), pflegt `TASKS.md`
- Legt Worktrees an und räumt sie auf
- Verteilt Tasks, prüft Berichte gegen die Akzeptanzkriterien
- Überwacht Git: Branches, Commits, Konflikte, CI-Status
- Erstellt PRs (Phase 7)
- Meldet dem Orchestrator kurz: fertig / blockiert / braucht Nutzer

**Macht NICHT:** Keinen Feature-Code; Merges nur nach der Merge-Regel (Phase 8), nie mit `--admin`.

### 1.3 Worker 1–4 (`role=worker-N`)
**Zweck:** Umsetzung (Writer) oder Prüfung (Reviewer), je nach Task.

**Macht:**
- Genau einen Task, nur im eigenen Worktree, nur die genannten Dateien
- Als Writer: Plan → TDD → `/goal` bis alle Checks grün
- Als Reviewer: Review gegen Vertrag, Security-Review, alle Tests

**Macht NICHT:** Nichts löschen/verschieben/überschreiben außerhalb des Tasks. Nicht in `SoccaV2` selbst arbeiten. Kein Push auf `main`.

**Kontext-Regeln:** Nach jedem abgeschlossenen Task `/clear`, damit der nächste Task mit frischem Kontext startet.

### 1.4 Nutzer
- **G1:** Vertrag mit echten Produktentscheidungen freigeben
- Beantwortet Eskalationen

---

## 2. Der Loop

```
 PHASE 1  Intake        Orchestrator ↔ Nutzer (grill-me)
 PHASE 2  Vertrag       docs/contracts/<id>-<name>.md          ◄── G1 Nutzer
 PHASE 3  Council       nur bei teuren Entscheidungen → docs/decisions/
 PHASE 4  Zerlegung     Task Manager: Tasks, Dateizuordnung, Worktrees
 PHASE 5  Umsetzung     Writer-Worker: Plan → TDD → /goal
 PHASE 6  Review        anderer Worker: Vertrag, Code, Security, Tests
 PHASE 7  Integration   Task Manager: Rebase, CI grün, PR mit Belegen
 PHASE 8  Merge         siehe CLAUDE.md, Merge-Regel
 PHASE 9  Retro         Lehren → CLAUDE.md / AGENTS-SETUP.md / Tests
```

### Phase 1 – Intake
- **Wer:** Orchestrator
- **Wie:** Skill `grill-me`. Eine Frage nach der anderen, jeweils mit Antwortvorschlag. Fakten aus dem Code holt er selbst (per Subagent), den Nutzer fragt er nur nach echten Entscheidungen.
- **Fokus:** Wer nutzt das Feature? Was ist danach besser? Was ist ausdrücklich NICHT Teil davon? Randfälle (z. B. ungerade Teamanzahl, Absage, Zahlung fehlgeschlagen)? Datenschutz/DSGVO-Bezug?
- **Fertig, wenn:** Der Orchestrator alle Punkte des Vertrags-Templates füllen kann.

### Phase 2 – Vertrag
- **Wer:** Orchestrator
- **Artefakt:** `docs/contracts/<NNN>-<kurzname>.md` nach Template (Abschnitt 7.1)
- **Regeln für Akzeptanzkriterien:**
  - Jedes Kriterium hat eine ID (`AC-1`, `AC-2`, …)
  - Format **Gegeben / Wenn / Dann** (Given/When/Then)
  - Jedes Kriterium nennt seinen **Check**: welcher Test (Unit/Integration/E2E) es beweist
  - Messbar statt vage: nicht „funktioniert gut", sondern „liefert HTTP 200 und zeigt X"
  - Ein Abschnitt **Nicht-Ziele** ist Pflicht
  - Meilensteine: je 1–4 Kriterien, jeweils einzeln auslieferbar
- **Gate G1:** Nutzer liest den Vertrag und antwortet „freigegeben" oder mit Änderungen. Ohne G1 startet kein Auftrag mit Produktentscheidungen; Fixes und Härtungen brauchen kein G1.

### Phase 3 – Council (optional)
- **Wann:** Nur bei Entscheidungen, die teuer oder schwer umkehrbar sind (Datenmodell, neue Abhängigkeit, Zahlungsfluss, Auth, Datenschutz). Nicht für Implementierungsdetails.
- **Wie:** Skill `council` (Abschnitt 5)
- **Artefakt:** ADR `docs/decisions/<NNNN>-<titel>.md` (Template 7.2)
- **Eskalation:** Ist die Entscheidung irreversibel oder bleibt der Council uneinig → Nutzer entscheidet.

### Phase 4 – Zerlegung
- **Wer:** Task Manager
- **Regeln:**
  - Ein Task deckt **genau einen Meilenstein oder 1–3 Kriterien** ab
  - **Dateizuordnung:** Zwei gleichzeitig laufende Tasks dürfen nie dieselbe Datei ändern. Konflikte → nacheinander.
  - **DB-Migrationen** laufen nie parallel zu anderen Tasks, die Schema-Annahmen haben
  - Reihenfolge nach Abhängigkeiten (z. B. Datenmodell → API → UI)
  - Standard: **max. 2 Writer gleichzeitig** (Kostenrahmen Claude Pro), bis zu 4 nur bei kleinen, unabhängigen Tasks
- **Artefakt:** Einträge in `TASKS.md` (lokal, nicht versioniert) + Worktree pro Task

### Phase 5 – Umsetzung
- **Wer:** Writer-Worker
- **Ablauf:**
  1. Worktree prüfen (Abschnitt 6), `.env.local` vorhanden, `npm ci` gelaufen, eigener Port
  2. Kurzen Plan schreiben (Superpowers `writing-plans`), Plan im Task-Bericht referenzieren
  3. **TDD:** Zuerst Test(s) für die Kriterien schreiben → rot → implementieren → grün
  4. `/goal` setzen (Bedingung nach Abschnitt 4)
  5. Commit(s) auf dem Task-Branch, Push des Branches
  6. Bericht an Task Manager im Protokollformat (Abschnitt 8), **mit Belegen**: Befehl + Ergebnis
- **Superpowers-Abgrenzung:** Worker nutzen `writing-plans`, `test-driven-development`, `verification-before-completion`, `systematic-debugging`. Sie nutzen **nicht** `brainstorming` (der Vertrag existiert schon), **nicht** `using-git-worktrees` (Worktrees verwaltet der Task Manager) und **nicht** `subagent-driven-development` (Parallelisierung macht Herdr). Die genauen Skill-Namen nach der Installation per `/skills` prüfen und hier korrigieren. Superpowers lädt sich beim Sessionstart automatisch; der Worker-Prompt muss die Abgrenzung deshalb ausdrücklich nennen.

### Phase 6 – Review
- **Wer:** Ein **anderer** Worker als der Writer (frischer Kontext)
- **Prüft in dieser Reihenfolge:**
  1. Jedes Kriterium des Tasks: Gibt es einen Test, und ist er grün?
  2. Nichts außerhalb des Task-Umfangs geändert?
  3. Code-Review per Subagent (`/code-review` oder Subagent `code-reviewer`)
  4. `/security-review` (Pflicht bei Auth, Zahlung, Eingaben, Datenzugriff)
  5. `npm run typecheck`, `npm run lint`, `npm test`, betroffene E2E-Tests
- **Wichtig:** Nur Funde melden, die Korrektheit, Sicherheit oder Vertragskriterien betreffen. Stilfragen sind optional. Sonst entsteht Über-Engineering.
- **Ergebnis:** `REVIEW-OK` oder `REVIEW-CHANGES` mit konkreter Liste → zurück an Writer (max. 2 Runden, danach Eskalation an Orchestrator)

### Phase 7 – Integration
- **Wer:** Task Manager
- Branch auf aktuellen `main` rebasen, Konflikte lösen lassen
- PR öffnen mit: Link zum Vertrag, Kriterien-Checkliste (welcher Test belegt welches AC), Review-Ergebnis, Testausgabe
- Warten, bis die CI grün ist
- Orchestrator melden: `PR bereit: <Link>, alle ACs belegt, CI grün`

### Phase 8 – Merge
- **Merge-Regel:** siehe CLAUDE.md, Merge-Regel (wer mergt, Voraussetzungen, Ausnahmen, Aufräumen).

### Phase 9 – Retro (Compounding)
- **Wer:** Task Manager entwirft, Orchestrator kürzt, Nutzer sieht es im PR
- **Wie:** Skill `retro` (Abschnitt 7.4)
- **Regeln:**
  - Max. **2–3 Zeilen** neue Regeln pro Auftrag, keine Romane
  - Jeder gefundene Bug wird zu einem Regressionstest
  - Ziel der Lehren: `CLAUDE.md` (Projektkonventionen) oder `AGENTS-SETUP.md` (Team-Ablauf)
  - Alle 5 Aufträge: Aufräumen. Regeln, die Claude ohnehin befolgt, werden gelöscht oder in Hooks umgewandelt.

---

## 3. Definition of Ready / Definition of Done

**Ready (Task darf starten):**
- [ ] Vertrag freigegeben (G1)
- [ ] Task nennt: Ziel, ACs, Dateien, Check-Befehle, Worktree, Port
- [ ] Keine Dateiüberschneidung mit laufenden Tasks

**Done (Task ist fertig):**
- [ ] Alle ACs des Tasks durch grüne Tests belegt
- [ ] `typecheck`, `lint`, `test` grün, Belege im Bericht
- [ ] Review durch anderen Worker: `REVIEW-OK`
- [ ] Keine Änderungen außerhalb des Umfangs
- [ ] Bei Bugfix: Regressionstest vorhanden

**Auftrag fertig:** Alle Tasks Done, PR gemergt, Retro gemacht, Worktrees aufgeräumt.

---

## 4. `/goal`-Regeln

`/goal` hält eine Session am Laufen, bis ein separates Bewertungsmodell die Bedingung als erfüllt sieht. Dieses Modell liest **nur das Transkript**, es führt selbst nichts aus. Daraus folgt:

1. **Die Bedingung muss durch Ausgaben im Transkript beweisbar sein.** Der Worker muss die Tests ausführen, damit das Ergebnis sichtbar ist.
2. **Vier Bestandteile:**
   - messbarer Endzustand
   - genannter Check (wie bewiesen wird)
   - Einschränkungen (was sich nicht ändern darf)
   - Obergrenze (Runden/Zeit)
3. **Ein Goal pro Meilenstein/Task**, nie ein ganzes Feature.
4. Nur zusammen mit Auto-Mode, sonst bleibt der Loop bei jeder Rückfrage stehen.

**Gute Beispiele für Soccaz:**
```
/goal Alle Tests in tests/tournament/ laufen mit `npm test -- tests/tournament` grün (Exit 0),
`npm run typecheck` und `npm run lint` melden 0 Fehler. Keine Dateien außerhalb von
src/server/tournament/ und tests/tournament/ geändert. Höchstens 25 Runden.
```
```
/goal `npx playwright test tests/e2e/tournament.spec.ts` besteht vollständig.
AC-3 und AC-4 aus docs/contracts/004-turniermodus.md sind durch diese Tests abgedeckt.
Keine bestehenden Tests deaktiviert oder gelöscht. Höchstens 30 Runden.
```

**Schlechte Beispiele:** „Turniermodus ist fertig", „Code ist sauber", „App ist produktionsreif" (nicht messbar → Token-Verbrennung oder falscher Erfolg).

**Verboten:** Tests löschen, überspringen oder abschwächen, um ein Goal zu erreichen. Das muss in jeder Bedingung als Einschränkung stehen.

---

## 5. Council-Skill

**Ehrliche Einordnung:** Mehrere Rollen auf demselben Modell teilen dieselben blinden Flecken. Studien zeigen, dass solche Persona-Runden zu Konformität neigen. Der Council ist deshalb ein **strukturiertes Abwägungswerkzeug**, kein Ersatz für Fakten oder für den Nutzer.

**Ablauf:**
1. Orchestrator formuliert die Frage als konkrete Wahl („Datenmodell für Turnierbäume: A, B oder C?"), plus Randbedingungen
2. Drei Subagents, **getrennt und ohne die Antworten der anderen zu sehen**:
   - **Architekt:** beste langfristige Lösung, Wartbarkeit, Passung zum bestehenden Code
   - **Skeptiker:** sucht Risiken, Fehlerfälle, Sicherheit, Datenschutz, Kosten
   - **Pareto-Engineer:** kleinste Lösung, die die Vertragskriterien erfüllt; benennt, was man weglassen kann
3. **Beweispflicht:** Jede Rolle muss Aussagen mit Code-Fundstellen, Dokumentation oder Messungen belegen
4. **Anonymisierte Synthese:** Der Orchestrator vergleicht die Antworten, ohne Rollennamen zu gewichten
5. **Entscheidungsregel:** Bei Einigkeit → ADR. Bei Uneinigkeit gewinnt die Pareto-Lösung, **außer** der Skeptiker belegt ein Sicherheits-/Datenrisiko → dann Nutzer fragen
6. ADR schreiben (Template 7.2)

**Ausbau später (optional):** Echte Vielfalt durch ein zweites Modell, z. B. den Skeptiker per `hc run` mit Codex oder Gemini laufen lassen.

---

## 6. Worktree- und Laufzeit-Betrieb

Worktrees isolieren nur Dateien, nicht Laufzeit. Pro Worktree:

| Ressource | Regel |
|---|---|
| Pfad | `../worktrees/<branch>` (außerhalb des Repos), Pfade immer quoten |
| `node_modules` | eigenes `npm ci` pro Worktree, kein Symlink |
| `.env.local` | aus `SoccaV2` kopieren, `PORT` anpassen |
| Port | worker-1=3101, worker-2=3102, worker-3=3103, worker-4=3104; 3100 bleibt für `SoccaV2` |
| Datenbank | **Empfehlung:** eigene DB pro Worker auf dem lokalen Postgres (5433), z. B. `soccaz_w1` … `soccaz_w4`, mit Migrationen + Seed. Dann dürfen auch Migrations-Tasks parallel laufen. **Fallback:** gemeinsame DB, dann Migrationen strikt seriell |
| Lebensdauer | anlegen → arbeiten → mergen → `git worktree remove` + `git worktree prune` |

**Skript:** `scripts/worktree.mjs` (Node, plattformunabhängig, kein `jq` nötig) mit `create <branch> <worker>` und `remove <branch>`. Erledigt: `git worktree add`, `.env.local` kopieren, Port/DB setzen, `npm ci`, ggf. DB anlegen und migrieren.

---

## 7. Vorlagen

### 7.1 Vertrag `docs/contracts/_TEMPLATE.md`
```markdown
# <NNN> – <Feature-Name>
Status: Entwurf | Freigegeben (Datum) | Umgesetzt
Version: 1

## Ziel
Ein Absatz: Was ist für wen danach besser?

## Nutzer und Rollen
Zuschauer / Spieler / Team-Admin / Platform-Admin: wer ist betroffen?

## Nicht-Ziele
- Was ausdrücklich NICHT gebaut wird

## Akzeptanzkriterien
| ID | Gegeben | Wenn | Dann | Check (Testdatei) |
|---|---|---|---|---|
| AC-1 | … | … | … | tests/…/x.test.ts |

## Meilensteine
- M1: AC-1, AC-2
- M2: AC-3

## Betroffene Bereiche
Dateien/Module, Datenbanktabellen, API-Routen

## Risiken und Randfälle
- …

## Datenschutz / Sicherheit
Personenbezogene Daten? Zahlungen? Rechte?

## Offene Fragen
- (vor Freigabe leer)

## End-to-End-Nachweis
Welcher E2E-Test beweist das Feature als Ganzes?
```

### 7.2 Entscheidung (ADR, MADR-light) `docs/decisions/_TEMPLATE.md`
```markdown
# <NNNN> – <Entscheidung als konkrete Wahl>
Status: vorgeschlagen | akzeptiert | ersetzt durch <NNNN>
Datum: YYYY-MM-DD

## Kontext und Problem
## Betrachtete Optionen
- A …  - B …  - C …
## Entscheidung
Gewählt: …, weil …
## Konsequenzen
Gut: …  Schlecht: …  Wann neu prüfen: …
## Council-Stimmen (kurz)
Architekt: …  Skeptiker: …  Pareto: …
```

### 7.3 Task-Eintrag (in `TASKS.md`)
```markdown
## T<NN> – <Titel>   [offen | in Arbeit (worker-N) | Review (worker-M) | fertig | blockiert]
Vertrag: docs/contracts/<NNN>.md   ACs: AC-1, AC-2
Branch/Worktree: feat/<…>  →  ../worktrees/feat-<…>   Port: 310N   DB: soccaz_wN
Dateien: …
Done wenn: <Check-Befehle>
```

### 7.4 Retro-Eintrag (Skill `retro`)
```markdown
## Retro <Auftrag> – <Datum>
Was lief gut: (1 Zeile)
Was ging schief: Symptom / Ursache / Fix
Prävention: (max. 2–3 Regeln) → Ziel: CLAUDE.md | AGENTS-SETUP.md | Hook | Test
```

---

## 8. Kommunikationsprotokoll (`hc send`)

Kurze, feste Formate halten alle Kontexte schlank.

| Von → An | Format |
|---|---|
| TM → Worker | `TASK T12 | ACs: AC-1,AC-2 | WT: ../worktrees/feat-x | PORT 3101 | DB soccaz_w1 | DONE: <checks> | Details: TASKS.md#T12` |
| Worker → TM | `DONE T12 | Belege: npm test (42/42), typecheck 0, lint 0 | Dateien: a.ts, b.test.ts | Commit abc123` |
| Worker → TM | `BLOCKED T12 | Grund: … | braucht: TM / Orchestrator / Nutzer` |
| TM → Worker | `REVIEW T12 | Branch feat-x | Vertrag: docs/contracts/004.md` |
| Worker → TM | `REVIEW-OK T12` oder `REVIEW-CHANGES T12 | 1) … 2) …` |
| TM → Orch. | `AUFTRAG A17 fertig | PR #31 | ACs belegt | CI grün` |
| TM → Orch. | `NEEDS-USER | <eine Zeile, was der Nutzer tun muss>` |
| Orch. → Nutzer | max. 3 Zeilen |

**Regel:** Wartet irgendwer auf den Nutzer, geht sofort `NEEDS-USER` an den Orchestrator. Rückfragen nur im eigenen Fenster sind verboten.

---

## 9. Sicherheitsleitplanken (ohne Bypass)

Mehrere Schichten, weil jede einzelne Lücken hat:

1. **Auto-Mode bleibt an.** Kein „Bypass Permissions".
2. **Deny-Regeln** in `SoccaV2/.claude/settings.json`, u. a.:
   `Bash(git push --force*)`, `Bash(git push -f*)`, `Bash(git push * --force*)`, `Bash(git push origin main*)`, `Bash(git reset --hard*)`, `Bash(git clean -f*)`, `Bash(rm -rf*)`, `Read(./.env*)`, `Read(**/.env.local)`
   Hinweis: Deny-Regeln vergleichen Text, Umwege wie `bash -c "…"` werden nicht erkannt. Darum zusätzlich:
3. **PreToolUse-Hook „guard-light"** (`.claude/hooks/guard.mjs`, Node): blockiert destruktive Muster (rekursives Löschen, `DROP`/`TRUNCATE` außerhalb von Migrationen, Force-Push, Push auf `main`, `prisma/drizzle push` gegen fremde DBs). Blockieren nur mit **Exit-Code 2** (Exit 1 blockiert nicht!). Mit Tests für erlaubte und verbotene Beispiele.
   Windows-Hinweis: Hooks laufen über Git Bash, Pfade deshalb als `"$CLAUDE_PROJECT_DIR/.claude/hooks/guard.mjs"` mit `node` aufrufen.
4. **GitHub Branch Protection auf `main`:** PR Pflicht, CI-Checks Pflicht, kein Force-Push, keine Löschung. Damit kann technisch niemand außer dem Nutzer nach `main` gelangen.
5. **Git-Identität:** `user.email` = noreply-Adresse (repo-lokal), auch in jedem Worktree prüfen.
6. **Öffentliches Repo:** Vor jedem Commit Geheimnis-Check (keine Tokens, Passwörter, E-Mails, lokalen Pfade).

---

## 10. Kontext- und Kostenbudget

| Maßnahme | Regel |
|---|---|
| Orchestrator | `/compact` mit Anweisung bei ~60 %, Recherche nur per Subagent |
| Task Manager | `/compact` nach jedem abgeschlossenen Auftrag |
| Worker | `/clear` nach jedem Task |
| Parallelität | Standard 2 Writer + 1 Reviewer gleichzeitig |
| Goals | immer mit Rundenobergrenze |
| Reviews | nur korrektheitsrelevante Funde |
| Neustart | Rollen-Prompts aus `AGENTS-SETUP.md`, Sitzungen per `claude --resume` nach Namen |

---

## 11. Ordner- und Dateistruktur (Ziel)

```
SoccaV2/
├─ CLAUDE.md                     kurz: Befehle, Konventionen, Stolperfallen
├─ AGENTS-SETUP.md               Rollen-Prompts, Team-Regeln, Neustart
├─ TASKS.md                      lokal, in .gitignore
├─ docs/
│  ├─ loop/LOOP-SPEC.md          diese Datei
│  ├─ contracts/_TEMPLATE.md
│  ├─ decisions/_TEMPLATE.md
│  └─ retros/                    Retro-Einträge
├─ scripts/worktree.mjs
└─ .claude/
   ├─ settings.json              Hooks + Deny-Regeln
   ├─ hooks/save-transcript.ps1  (besteht)
   ├─ hooks/guard.mjs            neu
   ├─ skills/grill-me/           (mattpocock/skills)
   ├─ skills/contract/           Vertrag schreiben nach Template
   ├─ skills/council/            Abschnitt 5
   ├─ skills/retro/              Abschnitt 7.4
   └─ agents/
      ├─ code-reviewer.md        nur lesend (Read, Grep, Glob, Bash)
      ├─ security-reviewer.md    nur lesend
      ├─ council-architekt.md
      ├─ council-skeptiker.md
      └─ council-pareto.md
```
Superpowers wird als **Plugin** auf Benutzerebene installiert, nicht ins Repo.

---

## 12. Umsetzungsplan für A16 (selbst nach diesem Loop!)

Jede Etappe = eigener Task mit eigenem Check. Writer und Reviewer verschieden.

| Etappe | Inhalt | Done wenn |
|---|---|---|
| E1 | Leitplanken: Deny-Regeln, `guard.mjs` + Tests, Git-Identität prüfen | Hook-Tests: verbotene Beispiele → Exit 2, erlaubte → Exit 0; `/permissions` zeigt Deny-Regeln |
| E2 | Anleitung Branch Protection für den Nutzer (er klickt selbst) | Nutzer bestätigt; Test-Push auf `main` wird abgelehnt |
| E3 | Skills: grill-me installieren, `contract`, `council`, `retro` schreiben; Subagents anlegen | Dateien vorhanden, Frontmatter gültig, Reviewer-Agents ohne Schreibrechte |
| E4 | Vorlagen + Ordner `docs/contracts`, `docs/decisions`, `docs/retros`, `docs/loop` | Templates vollständig nach Abschnitt 7 |
| E5 | `scripts/worktree.mjs` inkl. DB pro Worker | Skript legt Test-Worktree an, App startet auf 3101 mit `soccaz_w1`, Remove räumt alles ab |
| E6 | `AGENTS-SETUP.md` + `CLAUDE.md` aktualisieren (kurz halten!) | Rollen-Prompts verweisen auf diese Spec, CLAUDE.md < 80 Zeilen |
| E7 | Superpowers-Installation: per CLI versuchen, sonst exakte Anleitung an Nutzer | `/plugin` zeigt Superpowers als aktiv |

**Danach:** nach dem Merge (siehe CLAUDE.md, Merge-Regel) alle 6 Agents frisch starten (in `SoccaV2`, damit neue Skills/Hooks geladen werden), dann **Pilot mit einem kleinen Feature** (nicht gleich der Turniermodus), um den Loop zu testen. Retro nach dem Pilot, dann Turniermodus.

---

## 13. Anti-Patterns (nicht tun)

- Orchestrator liest Diffs und Logs selbst → Kontext läuft voll
- Ein Goal für ein ganzes Feature → Endlosschleife oder falscher Erfolg
- Writer reviewt sich selbst
- Reviewer meldet jede Stilkleinigkeit → Über-Engineering
- Rückfrage nur im eigenen Fenster statt `NEEDS-USER`
- Tests löschen/überspringen, damit es grün wird
- CLAUDE.md wächst unbegrenzt → Regeln gehen unter
- Vier Writer auf überlappenden Dateien
- Melden, bevor etwas wirklich erledigt ist (gilt auch für den Nutzer 😉)

---

## 14. Quellen

- Anthropic: Best practices for Claude Code – https://code.claude.com/docs/en/best-practices
- Anthropic: /goal – https://code.claude.com/docs/en/goal
- Anthropic Engineering: How we built our multi-agent research system – https://www.anthropic.com/engineering/multi-agent-research-system
- obra/superpowers – https://github.com/obra/superpowers
- mattpocock/skills (grill-me) – https://github.com/mattpocock/skills
- Karpathy: llm-council – https://github.com/karpathy/llm-council
- Every: Compound Engineering – https://every.to/guides/compound-engineering
- Spec-driven development (Überblick) – https://www.qodo.ai/glossary/what-is-spec-driven-development/
- MADR (Architecture Decision Records) – https://adr.github.io
- Persona-Councils vs. Modellvielfalt – https://hexisteme.github.io/notes/personas-vs-model-families-multi-agent-council-diversity.html
- Git Worktrees für parallele Agents – https://blog.openreplay.com/git-worktrees-ai-agents/
- Claude Code Hooks: Blockieren mit Exit-Code 2 – https://dev.to/tyson_cung/how-to-block-dangerous-commands-with-claude-code-hooks-g5o
- Deny-Regeln für Force-Push – https://dev.to/aicoding-guide/block-git-push-force-in-claude-code-with-a-deny-rule-48ep
