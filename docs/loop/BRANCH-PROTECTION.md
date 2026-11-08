# Branch Protection für `main` (Anleitung zum Selbst-Klicken)

Repository: `github.com/alperkagan67/soccaz` (öffentlich). Diese Anleitung ändert nichts automatisch: Du klickst die Einstellungen selbst in GitHub. Wir nutzen dafür keine Admin-API-Aufrufe.

## 1. Warum

Damit technisch nur Du per Pull Request nach `main` gelangst: kein direkter Push, kein Force-Push, kein Löschen von `main`, kein Merge ohne grüne CI. Das ist die letzte Schicht der Sicherheitsleitplanken (Spec Abschnitt 9, Punkt 4); Deny-Regeln und Hook schützen nur Claude-Sessions, GitHub schützt gegen alles.

## 2. Einstellungen

Du brauchst **eine** der beiden Varianten. Empfohlen: **Ruleset** (neuer, flexibler). Die klassische Regel tut dasselbe.

### Variante A (empfohlen): Ruleset
1. GitHub, Repository öffnen, **Settings > Rules > Rulesets > New ruleset > New branch ruleset**.
2. **Ruleset Name:** `main schützen`. **Enforcement status:** `Active`.
3. **Bypass list:** leer lassen (siehe Hinweis zu Administratoren unten).
4. **Target branches > Add target > Include by pattern:** `main` (oder "Include default branch").
5. Unter **Branch rules** diese Häkchen setzen:
   - **Restrict deletions** (main darf nicht gelöscht werden)
   - **Block force pushes**
   - **Require a pull request before merging** mit **Required approvals: 0** (Einzelentwickler: PR ist Pflicht, eine Freigabe durch eine zweite Person nicht). Optional: **Require conversation resolution before merging**.
   - **Require status checks to pass** mit **Require branches to be up to date before merging**. Unter **Add checks** beide Checks hinzufügen (Namen siehe unten).
6. **Create** klicken.

### Variante B: klassische Branch-Protection-Regel
1. **Settings > Branches > Add branch protection rule** (bzw. "Add classic branch protection rule").
2. **Branch name pattern:** `main`.
3. Häkchen:
   - **Require a pull request before merging** (Required approvals: 0)
   - **Require status checks to pass before merging** und **Require branches to be up to date before merging**; Checks hinzufügen (Namen siehe unten)
   - Optional: **Require conversation resolution before merging**
   - **Do not allow bypassing the above settings** (gilt dann auch für Administratoren)
   - Force-Pushes und Löschen bleiben **ausgeschaltet** (**Allow force pushes** und **Allow deletions** nicht anhaken).
4. **Create** bzw. **Save changes**.

### Pflicht-Checks (genaue Namen aus `.github/workflows/ci.yml`)
Der Workflow heißt `CI` und läuft bei `pull_request` und bei Push auf `main`. Es gibt zwei Jobs:

| Job-Schlüssel | Name in GitHub (genau so eintragen) | Inhalt |
|---|---|---|
| `check` | `Typen, Lint, Unit-Tests` | `npm run typecheck`, ESLint, `npm test` |
| `e2e` | `Browser-Tests` | Datenbank, `npm run test:integration`, Playwright |

**Empfehlung: beide als Pflicht eintragen.** Begründung: `Typen, Lint, Unit-Tests` fängt schnelle Fehler ab, `Browser-Tests` fängt die Fehler, die nur im echten Ablauf auftreten (Zahlung, Lobby, Turnier). Ohne `Browser-Tests` könnte ein kaputter Ablauf nach `main` kommen. Kosten: ein Merge wartet auf den langsameren Job (Zeitlimit 30 Minuten).
Hinweis: GitHub bietet einen Check erst zur Auswahl an, nachdem er in den letzten 7 Tagen mindestens einmal gelaufen ist. Falls die Namen in der Suche fehlen, zuerst einen PR öffnen, CI laufen lassen, dann die Regel anpassen.

### Optionen
- **Regeln auch für Administratoren:** Als Repository-Besitzer bist Du Administrator. Bypass-Liste leer lassen bzw. "Do not allow bypassing" anhaken, dann gilt alles auch für Dich. Konsequenz: Du musst die Checks abwarten, oder Du musst die Regel bewusst vorübergehend ändern (siehe Abschnitt 5).
- **Require signed commits:** Nicht empfohlen. Unsere Commits sind nicht signiert; die Regel würde jeden PR blockieren. Nur einschalten, wenn vorher Commit-Signierung eingerichtet ist.

## 3. Test (Spec 12, E2)

Der Test muss in **Deinem eigenen Terminal** laufen, nicht in einer Claude-Session. Der Guard-Hook (E1) blockiert Pushes auf `main` in Claude-Sessions absichtlich, und auch Deny-Regeln greifen dort. Der Test würde dort also schon lokal scheitern und nichts über GitHub aussagen. Nicht über ein "!"-Präfix in der Session ausführen; öffne ein normales Terminal im Projektordner.

Ungefährliche Variante (nichts landet auf `main`, wenn die Regel aktiv ist):

```
git switch -c test-branch-protection
git commit --allow-empty -m "test"
git push origin test-branch-protection:main
```

**Erwartung:** Der Push wird abgelehnt, mit einer Meldung wie `remote: error: GH013: Repository rule violations found` (Ruleset) bzw. `protected branch hook declined` (klassische Regel). Nur in diesem Fall ist der Test bestanden.

**Nicht verwenden:** `git push origin HEAD:main --dry-run` ist kein Test (ein Dry-Run fragt die Regeln nicht ab). Erzeuge den leeren Commit nicht auf `main` selbst.

**Aufräumen** (immer, auch wenn der Push abgelehnt wurde):
```
git switch -
git branch -D test-branch-protection
```
Falls der Push wider Erwarten durchging (Regel nicht aktiv), melde das sofort, damit der Test-Commit auf `main` mit einem Revert-PR zurückgenommen wird; keinen Force-Push nutzen.

## 4. Was sich danach ändert
- Nach `main` gelangt Code nur über einen Pull Request mit grünen Checks; Du bist der Einzige, der mergt.
- Force-Push auf `main` und Löschen von `main` sind unmöglich.
- Amend plus Force-Push auf Feature-Branches bleibt technisch möglich (die Regel schützt nur `main`). Für Claude ist es durch die Deny-Regel in `.claude/settings.json` gesperrt; es bleibt eine bewusste Handlung von Dir.
- PRs, die nicht auf dem neuesten `main` basieren, müssen vor dem Merge aktualisiert werden (Knopf "Update branch" im PR).

## 5. Rückgängig machen / Notausstieg
Regel ausschalten: **Settings > Rules > Rulesets > `main schützen` > Enforcement status: Disabled** (bzw. klassische Regel unter **Settings > Branches** bearbeiten oder löschen). Danach die Regel so schnell wie möglich wieder aktivieren.

## 6. Bestätigung

Bestätigung durch den Nutzer: [ ] Regel aktiv [ ] Test-Push abgelehnt
