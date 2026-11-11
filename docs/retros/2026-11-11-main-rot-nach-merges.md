## Retro main rot nach zwei Merges (PR 75 und PR 76) – 2026-11-11
Was lief gut: Der Fehler fiel in der CI von PR 78 (reiner Doku-PR) sofort auf, und der Hotfix T102 (worker-2) war klein.
Was ging schief:
- Symptom: PR 75 (012 M2a) und PR 76 (012 M1b-Oberfläche) waren einzeln grün und wurden nacheinander per Squash gemergt. Danach brach auf `main` `npm run typecheck`: `src/server/payments/card-status.ts(10,3): Type '{ [k: string]: CardStatus; }' is not assignable to type 'Record<string, CardStatus>'`. Die offenen PRs 77 (M2b-1) und 78 (Doku) wurden dadurch rot.
- Ursache: `card-status.ts` (aus PR 76) definierte lokal `CardStatus = none | card_ready`; das Schema (PR 75, `src/db/schema.ts`) erweiterte denselben Typ um `charge_pending`, `charged` und `failed`. Zwei PRs änderten dieselbe Typdefinition aus verschiedenen Richtungen (semantische Kollision, kein Textkonflikt). PR 76 war auf dem Stand vor PR 75 grün. Verstärkt wurde das durch drei Lücken: kein CI-Lauf „main nach Merge“, kein zwingender Branch-Update vor dem Merge (kein „Require branches to be up to date“) und eine doppelte Typdefinition (lokaler Typ statt Schema-Typ).
- Fix: Hotfix T102 importiert den Typ aus dem Schema.
Prävention (Vorschläge; Regeländerungen laufen gesammelt über den Orchestrator, Umsetzung teils als Ausnahme-PR beim Nutzer):
1. Branch Protection „Require branches to be up to date before merging“ bzw. Merge-Queue; in `docs/loop/BRANCH-PROTECTION.md` als Schritt vorgesehen (der Nutzer klickt selbst; ob aktiv, ist zu prüfen) → Ziel: Branch Protection (Nutzer)
2. CI-Job bei `push` nach `main` (typecheck, lint, Unit-Tests), damit ein roter `main` sofort auffällt → Ziel: `.github/` (Ausnahme-PR, NEEDS-USER)
3. Prozess ohne Regeländerung, gilt ab sofort: Nach jedem Merge `gh run list --branch main` prüfen und offene PRs mit `gh pr update-branch` aktualisieren, bevor der nächste gemergt wird → Ziel: Arbeitsweise des Task Managers
4. Code: Typen einer Domäne nur an einer Stelle definieren (Schema-Typ importieren, keine lokale Kopie); bei Statuswerten erschöpfende Switch-Absicherung (`satisfies never`) → Ziel: Code-Review
5. Regressionstest: nicht nötig. Der Typfehler wird vom Typecheck gefangen (er hat ihn gefangen), ein Laufzeittest brächte nichts.
Offener Punkt: Die CI baut nicht (`npm run build`); der Fehler auf `/hilfe` wurde deshalb erst in PR 70 gefunden. Der Build-Schritt kommt als Ausnahme-PR (`.github/`, NEEDS-USER).
