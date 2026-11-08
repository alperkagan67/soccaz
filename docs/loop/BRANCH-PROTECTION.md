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

**Optional vorher (nur Lesen):** Prüfe im Terminal, ob die Regel greift. Das ändert nichts:
```
gh api repos/alperkagan67/soccaz/rules/branches/main
gh api repos/alperkagan67/soccaz/branches/main/protection
```
Die erste Zeile zeigt Ruleset-Regeln, die auf `main` wirken; die zweite die klassische Regel (bei Ruleset-Variante kann sie "Branch not protected" melden, das ist dann normal). Den Ruleset-Modus "Evaluate" bitte nicht zum Testen nutzen (nur für Organisationen/Enterprise).

Test-Push, so sicher wie möglich. Der Testbranch muss von `origin/main` abzweigen, **nicht** vom aktuellen Stand (sonst würden bei inaktiver Regel alle Commits Deines aktuellen Branches auf `main` landen):

```
git fetch origin
git switch -c test-branch-protection origin/main
git commit --allow-empty -m "Test Branch Protection"
git log --oneline origin/main..HEAD
```
Der letzte Befehl muss **genau 1 Zeile** zeigen. Zeigt er mehr oder weniger: **abbrechen und NICHT pushen** (zuerst aufräumen, siehe unten). Nur bei genau 1 Zeile:

```
git push origin test-branch-protection:main
```

**Bestanden** ist der Test nur bei einer dieser Ablehnungen:
- `GH013` ("Repository rule violations found"), wenn Du ein Ruleset benutzt
- `GH006` bzw. "protected branch hook declined", wenn Du die klassische Regel benutzt

**Ungültig, nicht bestanden:** Meldungen wie `non-fast-forward` oder `fetch first` (Dein Testbranch war nicht auf dem neuesten `main`; wiederhole ab `git fetch origin`). Geht der Push **durch**, ist die Regel nicht aktiv; der schlimmste Fall ist dann ein einzelner leerer Commit auf `main`.

**Nicht verwenden:** `git push origin HEAD:main --dry-run` ist kein Test (ein Dry-Run fragt die Regeln nicht ab). Erzeuge den leeren Commit nicht auf `main` selbst und zweige den Testbranch nicht von einem Feature-Branch ab.

**Aufräumen** (immer, auch wenn der Push abgelehnt wurde): zurück auf den vorherigen Branch und den lokalen Testbranch löschen. `git branch -D` ist hier ausnahmsweise in Ordnung, weil es Dein eigener Testbranch im eigenen Terminal ist.
```
git switch -
git branch -D test-branch-protection
```
Auf `origin` entsteht kein Branch (gepusht wird nur nach `main`), ein `git push origin --delete` ist deshalb nicht nötig.

Falls der Push durchging (Regel nicht aktiv): Der einzelne leere Commit auf `main` ist harmlos und bleibt liegen; ein Revert oder Force-Push ist nicht nötig (ein Revert eines leeren Commits bricht lokal ohnehin ab). Aktiviere die Regel und wiederhole den Test. Nur wenn aus Versehen echte Commits auf `main` gelandet sind: per Revert-PR zurücknehmen, nie per Force-Push, und melde es sofort.

## 4. Was sich danach ändert
- Nach `main` gelangt Code nur über einen Pull Request mit grünen Checks; Du bist der Einzige, der mergt.
- Force-Push auf `main` und Löschen von `main` sind unmöglich.
- Amend plus Force-Push auf Feature-Branches bleibt technisch möglich (die Regel schützt nur `main`). Für Claude ist es durch die Deny-Regel in `.claude/settings.json` gesperrt; es bleibt eine bewusste Handlung von Dir.
- PRs, die nicht auf dem neuesten `main` basieren, müssen vor dem Merge aktualisiert werden (Knopf "Update branch" im PR).

## 5. Rückgängig machen / Notausstieg
Regel ausschalten: **Settings > Rules > Rulesets > `main schützen` > Enforcement status: Disabled** (bzw. klassische Regel unter **Settings > Branches** bearbeiten oder löschen). Danach die Regel so schnell wie möglich wieder aktivieren.

## 6. Bestätigung

Bestätigung durch den Nutzer: [ ] Regel aktiv [ ] Test-Push abgelehnt
