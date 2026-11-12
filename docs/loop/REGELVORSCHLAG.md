# Regelvorschlag (Sammelliste, kein Beschluss)

Diese Datei sammelt Kandidaten für neue oder geänderte Regeln. **Sie ändert keine Regel.** Jede Übernahme in `CLAUDE.md`, `AGENTS-SETUP.md` oder `docs/loop/LOOP-SPEC.md` ist ein eigener Regel-PR und damit `NEEDS-USER` (der Nutzer mergt selbst, siehe Merge-Regel in `CLAUDE.md`).

Stand: 2026-11-12. Quelle der Kandidaten 1 bis 7: Nutzer und t9 (Auftrag des Task Managers); Wortlaute sind Vorschläge des Autors, nicht abgestimmt. Kandidaten 8 bis 12 stammen aus den Erfahrungen der Worker und sind nur Kandidaten.

Aufbau je Kandidat: Wortlaut-Vorschlag, Zieldatei, Begründung, betroffene Rollen. Wo ein Wortlaut aus einer bestehenden Datei stammt, steht die Fundstelle dabei; wo nur ein Stichwort vorlag (Kandidaten 4, 5, 7), ist der Wortlaut ein **Entwurf, der vor der Übernahme von t1d/t9 bestätigt werden muss**.

## Übersicht

| Nr | Kandidat | Zieldatei | Rollen |
|---|---|---|---|
| 1 | Schutzdateien (CI-Gate, DB-Guard) sind NEEDS-USER | CLAUDE.md (Ausnahmeliste) | alle |
| 2 | Herzschlag-Regel: freie Worker bekommen sofort Arbeit | AGENTS-SETUP (2.1, 2.2) / LOOP-SPEC | Orchestrator, Task Manager |
| 3 | Merge-Ablauf: update-branch, main-CI, Ein-Lauf-Regel | CLAUDE.md (Merge-Regel) | Task Manager |
| 4 | Planer-Rolle | AGENTS-SETUP (2.x neu) | Planer, Orchestrator |
| 5 | NEEDS-USER-Format, 15-Minuten-Grenze, Zeile „Degradiert“ | AGENTS-SETUP 3b / LOOP-SPEC 8 | alle |
| 6 | Herzschlag nach Neustart erneuern | AGENTS-SETUP (5) | Orchestrator |
| 7 | DONE-Zeile mit „Vorgaben: erfüllt/nicht“ | AGENTS-SETUP 3b / LOOP-SPEC 8 | Worker, Task Manager |
| 8 | Worker pushen nie | CLAUDE.md / AGENTS-SETUP 2.3 | Worker |
| 9 | Hauptrepo nie auschecken | CLAUDE.md (Konventionen) | alle |
| 10 | Review-Worktrees mit `git worktree remove` entfernen | AGENTS-SETUP 3a | Worker, Reviewer |
| 11 | `hc`-Nachrichten ohne Backticks und Sonderzeichen | AGENTS-SETUP 3b | alle |
| 12 | PR-Text per `gh api`, wenn `gh pr edit` scheitert | AGENTS-SETUP 3a | Task Manager |

---

## 1. Schutzdateien sind NEEDS-USER

**Wortlaut-Vorschlag** (Ergänzung der Ausnahmeliste in der Merge-Regel): „Ausnahme (`NEEDS-USER`, der Nutzer mergt selbst): … sowie Änderungen an den Schutzdateien `scripts/ci-gate.mjs`, `tests/integration/db-guard.ts`, `tests/e2e/helpers.ts` und `tests/e2e/global-teardown.ts` (Prüfung `dbUrlAllowed`). Agenten lockern ihre eigenen Schutzregeln nicht.“

**Zieldatei:** `CLAUDE.md`, Abschnitt „Merge-Regel“, Ausnahmeliste (und die Ausnahmeliste in `AGENTS-SETUP.md`/`LOOP-SPEC.md`, falls dort wiederholt).

**Begründung:** `scripts/ci-gate.mjs` entscheidet über den Pflicht-Check „Browser-Tests“ (Doku-PRs überspringen, Aggregator). `tests/integration/db-guard.ts` schützt vor fremden Datenbanken; `dbUrlAllowed` wird auch von `tests/e2e/helpers.ts` und dem `global-teardown` benutzt. Wer diese Dateien ändert, ändert, was als „grün“ oder „sicher“ gilt. Das darf kein Agent allein entscheiden.

**Rollen:** Alle Writer (Änderung nur als PR mit `NEEDS-USER`), Task Manager (mergt diese PRs nie), Reviewer (prüft besonders auf gelockerte Prüfungen).

## 2. Herzschlag-Regel

**Wortlaut-Vorschlag:** der Text aus `docs/loop/HERZSCHLAG.md` (Abschnitt „FESTE REGEL“): „Ist ein Worker frei, bekommt er sofort Arbeit, die nichts blockiert (nächster Backlog-Eintrag ohne offene Produktfrage, lokale Vorbereitung auf dem Branch des offenen PRs, Plan oder Doku); Warten auf CI oder Merge ist kein Grund für Stillstand (lokal weiterarbeiten, Push später nach der 30-Minuten-Regel, höchstens ein Browser-Test-Lauf pro 30 Minuten). Code-Writer max. 2 gleichzeitig, Plan und Doku zählen nicht dazu; Writer ≠ Reviewer, der Reviewer wird pro PR neu bestimmt. Antwort „nichts zu tun“ gilt nur, wenn ALLE Worker beschäftigt sind oder das Backlog nur noch Nutzer- oder G1-Punkte enthält. Keine Umsetzung von Verträgen ohne G1.“

**Zieldatei:** `AGENTS-SETUP.md` (Rollen-Prompts Orchestrator 2.1 und Task Manager 2.2) und ein Satz in `docs/loop/LOOP-SPEC.md`; `docs/loop/HERZSCHLAG.md` bleibt die Quelle des Prompts.

**Begründung:** Ohne die Regel stehen freie Worker still, solange CI oder Merge läuft. `docs/loop/HERZSCHLAG.md` kommt mit dem Doku-Sammel-PR (sammel/doku-1) nach `main`; in den Rollen-Prompts fehlt die Regel.

**Rollen:** Orchestrator und Task Manager (verteilen Arbeit), Worker (arbeiten lokal weiter).

## 3. Merge-Ablauf

**Wortlaut-Vorschlag** (Ergänzung der Merge-Regel):
- „Vor dem Merge `gh pr update-branch <nr>`, dann CI auf dem aktuellen `main`-Stand abwarten (gilt, solange ‚Require branches to be up to date‘ aktiv ist).“
- „Nach einer Merge-Serie die CI von `main` prüfen (`gh run list --branch main`), bevor der nächste Auftrag startet.“
- „Ein-Lauf-Regel: pro PR höchstens ein Browser-Test-Lauf in Folge; weitere Pushes erst nach dem Ergebnis des laufenden Laufs.“

**Zieldatei:** `CLAUDE.md`, Abschnitt „Merge-Regel“ (dort steht bereits: einzeln, nie mit `&&`, Prüfen und Mergen getrennt).

**Begründung:** Der Hinweis zu `update-branch` steht bisher nur in `docs/loop/HERZSCHLAG.md` (Doku-Sammel-PR), nicht in `CLAUDE.md`, `AGENTS-SETUP.md` oder `LOOP-SPEC.md`. Ein Merge auf veraltetem Stand kann `main` rot machen, obwohl der PR grün war; die Prüfung nach einer Serie findet das früh.

**Rollen:** Task Manager (mergt), Worker (halten sich an die Ein-Lauf-Regel beim Pushen).

## 4. Planer-Rolle

**Wortlaut-Vorschlag (Entwurf, vor Übernahme zu bestätigen):** „Planer (ein Worker pro Auftrag, nur lesend und Doku): zerlegt einen freigegebenen Vertrag in Meilensteine und Tasks mit Dateiliste, Reihenfolge und Abhängigkeiten, nennt Risiken und offene Produktfragen und schreibt das Ergebnis als Plan in `docs/design/`. Er schreibt keinen Produktcode. Der Plan geht als Doku-PR; Umsetzung erst nach `REVIEW-OK` auf den Plan und G1.“

**Zieldatei:** `AGENTS-SETUP.md`, neuer Abschnitt unter 2 (Rollen-Prompts).

**Begründung:** Pläne (z. B. `docs/design/m3-plan.md`, `m2b-und-m2-5-plan.md`) werden schon so erstellt und reviewt, die Rolle steht aber in keinem Rollen-Prompt.

**Rollen:** Planer (neu), Orchestrator (vergibt die Rolle), Reviewer (prüft Pläne).

## 5. NEEDS-USER: Format, 15-Minuten-Grenze, Zeile „Degradiert“

**Wortlaut-Vorschlag (Entwurf, vor Übernahme zu bestätigen):**
- Format: `NEEDS-USER | <PR/Task> | <was genau der Nutzer tun muss, ein Satz> | <wartet seit hh:mm>`.
- 15-Minuten-Grenze: „Wartet ein Task oder PR länger als 15 Minuten auf den Nutzer, arbeitet der Orchestrator am nächsten Backlog-Eintrag ohne Nutzerbezug weiter und meldet den Wartenden einmal pro Herzschlag erneut, ohne zu drängen.“
- Zeile „Degradiert“: „Ist ein Check, Hook oder Dienst ausgefallen und es wird ohne ihn weitergearbeitet, steht im nächsten Bericht eine Zeile `Degradiert: <was fehlt> | <Folge> | <seit wann>`.“

**Zieldatei:** `AGENTS-SETUP.md` Abschnitt 3b (Kommunikationsformat) und `docs/loop/LOOP-SPEC.md` Abschnitt 8 (dort steht `NEEDS-USER` bisher als einzeilige Meldung).

**Begründung:** Die heutige Meldung nennt weder das Ziel noch die Wartezeit; ohne Grenze blockiert ein Nutzerpunkt entweder alles oder geht unter. „Degradiert“ macht ausgefallene Schutzschichten sichtbar, statt sie still zu übergehen.

**Rollen:** Alle (senden), Orchestrator (bündelt für den Nutzer).

## 6. Herzschlag nach Neustart erneuern

**Wortlaut-Vorschlag:** „Nach jedem Neustart der Sitzung erneuert der Orchestrator den Herzschlag mit `/loop 15m` und dem Prompt aus `docs/loop/HERZSCHLAG.md`, und danach spätestens alle 7 Tage, weil wiederkehrende Aufgaben ablaufen.“

**Zieldatei:** `AGENTS-SETUP.md`, Abschnitt 5 „Neustart ab jetzt“.

**Begründung:** Der Herzschlag überlebt weder `/clear` noch einen Neustart; ohne Erneuerung steht die Kette still, ohne dass es jemand merkt.

**Rollen:** Orchestrator.

## 7. DONE-Zeile mit „Vorgaben“

**Wortlaut-Vorschlag (Entwurf, vor Übernahme zu bestätigen):** Das DONE-Format wird um ein Feld erweitert: `DONE <id> | Belege: Befehl + Ergebnis | Dateien | Commit <hash> | Vorgaben: erfüllt` oder `Vorgaben: nicht (<welche, warum>)`. „Vorgaben“ sind die ausdrücklichen Auflagen des Tasks (z. B. „nur diese Dateien“, „nicht pushen“, genannte Mutationen oder Tests).

**Zieldatei:** `AGENTS-SETUP.md` Abschnitt 3b und `docs/loop/LOOP-SPEC.md` Abschnitt 8.

**Begründung:** Abweichungen von Auflagen sollen nicht im Fließtext untergehen; der Task Manager sieht in einer Zeile, ob er nachfragen muss.

**Rollen:** Worker (schreiben), Task Manager und Reviewer (lesen).

---

## Kandidaten aus unseren Erfahrungen (kein Beschluss)

## 8. Worker pushen nie

**Wortlaut-Vorschlag:** „Worker pushen nie. Gepusht wird nur der PR-Branch, und nur durch den dafür bestimmten Task Manager; Worker-Branches bleiben lokal.“ (vorhandene Grundlage: `CLAUDE.md`, Merge-Regel, „Nur der PR-Branch wird gepusht“, und die Aufträge „nur lesen, nichts pushen“.)

**Zieldatei:** `AGENTS-SETUP.md` 2.3 (Worker) und `CLAUDE.md` Konventionen.

**Begründung:** Heute steht das je Task im Auftrag; als Grundregel entfällt der Zusatz und ein vergessener Zusatz wird kein Risiko. Der Guard-Hook sperrt Push auf `main` und Force-Push, nicht jeden Push.

**Rollen:** Worker.

## 9. Hauptrepo nie auschecken

**Wortlaut-Vorschlag:** „Im Hauptrepo (`SoccaV2`) wird nie ein Branch oder Commit ausgecheckt und nie gebaut; dafür gibt es Worktrees. Ein Review eines Commits läuft in einem Review-Worktree.“

**Zieldatei:** `CLAUDE.md`, Konventionen (ergänzt „Gearbeitet wird im eigenen Worktree, nicht in SoccaV2 selbst“).

**Begründung:** Vorfall: ein Checkout im Hauptrepo führte zu einem detached HEAD, den danach andere Rollen vorfanden.

**Rollen:** Alle.

## 10. Review-Worktrees mit `git worktree remove` entfernen

**Wortlaut-Vorschlag:** „Review-Worktrees werden mit `git worktree remove <pfad>` entfernt, nicht mit `node scripts/worktree.mjs remove`. Letzteres löscht auch die Worker-Datenbank (DB-Drop). Vorher den Dev-Server des Worktrees beenden, sonst scheitert das Entfernen an gehaltenen Dateien.“

**Zieldatei:** `AGENTS-SETUP.md` Abschnitt 3a (Git-Worktrees).

**Begründung:** Die Worker-Datenbanken `soccaz_w1` bis `soccaz_w4` sind geteilt; ein DB-Drop beim Entfernen eines Review-Worktrees trifft die nächste Arbeit. Beobachtet: Ein laufender Dev-Server ließ das Entfernen scheitern und den Ordner halb zurück.

**Rollen:** Worker, Reviewer.

## 11. `hc`-Nachrichten ohne Backticks und Sonderzeichen

**Wortlaut-Vorschlag:** „In `hc send`-Texten keine Backticks, kein `$(...)` und keine unmaskierten Anführungszeichen verwenden; die Shell expandiert sie. Pfade, Code und Befehle als schlichten Text schreiben.“

**Zieldatei:** `AGENTS-SETUP.md` Abschnitt 3b.

**Begründung:** Backticks in einer doppelt gequoteten Nachricht werden als Befehl ausgeführt, die Nachricht kommt verstümmelt an.

**Rollen:** Alle.

## 12. PR-Text per `gh api`, wenn `gh pr edit` scheitert

**Wortlaut-Vorschlag:** „Scheitert `gh pr edit` beim Ändern des PR-Texts, wird der Text per `gh api -X PATCH repos/<owner>/<repo>/pulls/<nr> -F body=@datei` gesetzt (Datei statt Inline-Text).“

**Zieldatei:** `AGENTS-SETUP.md` Abschnitt 3a oder Rollen-Prompt Task Manager (2.2).

**Begründung:** Beobachteter Ausweg bei einem Fehler von `gh pr edit`; mit der Datei entfällt das Quoting.

**Rollen:** Task Manager.

---

## Nicht Teil dieser Datei

Keine Rechtsfragen, keine Produktentscheidungen, keine Änderung an `.claude/` oder `.github/`. Reihenfolge und Zuschnitt der Regel-PRs entscheidet der Orchestrator mit dem Nutzer.
