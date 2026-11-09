# CLAUDE.md – Soccaz (SoccaV2)

Plattform für Hallenfußballspiele und -turniere (Next.js, Postgres, Drizzle).
Next.js-Regeln: AGENTS.md (nicht überschreiben, nicht ändern).

## Befehle (alle aus package.json)

- `npm run dev` – Dev-Server (Haupt-Instanz: `npm run dev -- -p 3100`)
- `npm run build` / `npm run start` – Produktions-Build / -Start
- `npm run lint` – ESLint
- `npm run typecheck` – `next typegen` + `tsc --noEmit`
- `npm test` – Unit-Tests (vitest)
- `npm run test:integration` – Integrationstests (brauchen die lokale DB)
- `npm run test:e2e` – Playwright
- `npm run db:generate` – Drizzle-Migration erzeugen
- `npm run db:migrate` – Migrationen anwenden (nutzt `.env.local`)

## Ports und Datenbanken

- 3100 = Haupt-Dev-Server in SoccaV2; Worker-Apps: 3101 bis 3104 (worker-1 bis worker-4).
- Postgres lokal auf Port 5433; Haupt-DB `soccav2`, pro Worker eine eigene DB `soccaz_w1` bis `soccaz_w4`.
- Worktree + `.env.local` + Port + DB anlegen/entfernen: `node scripts/worktree.mjs create <branch> <worker>` bzw. `remove <branch>`.
- Bekannte Grenze: `APP_URL` bleibt in Worker-Apps auf 3100 (Einladungslinks zeigen dorthin).

## Konventionen

- Änderungen nur über eigenen Branch + Pull Request, nie direkt auf `main`. Merge siehe Abschnitt „Merge-Regel“.
- Tests führt ein anderer Worker aus als der Ersteller (Writer ≠ Reviewer).
- Commit-Autor ist die GitHub-noreply-Adresse (`user.email` repo-lokal, auch in jedem Worktree prüfen).
- Jeder Commit endet mit `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Pro Task nur die genannten Dateien ändern; nichts löschen, verschieben oder überschreiben, was nicht im Task steht.
- Kein Task ohne maschinellen Check (Test, Typecheck, Lint); Belege = Befehl + Ergebnis.
- Gearbeitet wird im eigenen Worktree, nicht in SoccaV2 selbst.

## Merge-Regel

- Der Task Manager mergt jeden PR selbst (auch mit DB-Migrationen, Zahlungen, Auth, `package.json`/Lockfile), sobald `REVIEW-OK`, `security-reviewer` ohne offene Funde, Abschlussprüfung und grüne CI vorliegen. Nie `--admin`. Der Orchestrator mergt nie.
- Der Befehl läuft immer einzeln, nie mit `&&` verkettet: `gh pr merge <nr> --auto --squash --delete-branch` (ist der PR sofort clean: ohne `--auto`).
- Prüfen (`gh pr view`, `gh pr checks`) und Mergen sind getrennte Schritte. Aufräumen (Worktrees, lokale Branches, nach Squash `git branch -D`) folgt als eigener Schritt, erst nachdem `gh pr view` den PR als MERGED zeigt.
- PRs mit Migration, Zahlungen oder Auth trägt der Task Manager in `docs/loop/GO-LIVE-AUDIT.md` ein (PR, Datum, Was, Risiko).
- Ausnahme (`NEEDS-USER`, der Nutzer mergt selbst): nur Änderungen an `.claude/` und `.github/` sowie der jeweilige Regel-PR. Ein `NEEDS-USER` übergeht kein Agent.
- Branches: Nur der PR-Branch wird gepusht. Task-Branches bleiben lokal und werden lokal zu einem Sammel-Branch zusammengeführt. GitHub löscht den PR-Branch beim Merge; Remote-Reste erst löschen, nachdem geprüft ist, dass ihr Inhalt in `main` steht.

## Autonomie und Backlog

- Das Backlog steht in `docs/loop/BACKLOG.md`; der nächste Auftrag startet ohne Rückfrage.
- G1 (Vertragsfreigabe) nur für Verträge mit echten Produktentscheidungen. Fixes und Härtungen bekommen kurze ACs direkt im Task.
- Produktfragen sammeln und an den Orchestrator geben; unterdessen läuft der nächste Eintrag ohne offene Fragen.
- Retro-Lehren stehen nur in `docs/retros/`; Regeländerungen gehen gesammelt an den Orchestrator.
- Angehalten wird nur bei Änderungen an `.claude/` oder `.github/`, bei echter Blockade oder wenn das Backlog nur noch offene Produktfragen enthält.
- Orchestrator und Task Manager machen nach jedem Auftrag `/compact`; Worker machen nach jedem Task `/clear` und lesen danach ihre Rolle aus `AGENTS-SETUP.md` neu. Maximal 2 Writer + 1 Reviewer.

## Stolperfallen

- Diese Next.js-Version hat Breaking Changes: vor Code die Doku in `node_modules/next/dist/docs/` lesen (siehe AGENTS.md).
- Cache Components: `new Date()` o. Ä. in Seiten braucht `await connection()` (Muster: `src/app/teams/page.tsx`).
- Öffentliches Repo: keine Secrets, keine lokalen Pfade, keine privaten E-Mail-Adressen committen.
- `.env*` nicht lesen und nicht ausgeben (Deny-Regeln `Read(./.env*)` und `Read(**/.env.local)` in `.claude/settings.json`). `TASKS.md` ist lokal und nicht versioniert.
- Pfade enthalten ein Leerzeichen („Neuer Ordner“): immer quoten.
- Der Hook-Guard (`.claude/hooks/guard.mjs`) und die Deny-Regeln (`.claude/settings.json`) blockieren u. a. Force-Push (auch `--force-with-lease`), Push auf `main`, `rm -rf`, `git reset --hard`. Amend + Force-Push braucht eine bewusste Handlung des Nutzers im eigenen Terminal.
- Migrationen laufen nie parallel zu anderen Tasks mit Schema-Annahmen.

## Verweise

- Prozess: `docs/loop/LOOP-SPEC.md`; Team-Ablauf und Rollen-Prompts: `AGENTS-SETUP.md`
- Verträge: `docs/contracts/` · Entscheidungen (ADR): `docs/decisions/` · Retros: `docs/retros/`
- Ist-Analyse: `docs/analysis/ist-analyse.md` (liegt im Branch `docs/ist-analyse`, folgt nach dessen Merge)
- Branch Protection (Nutzer klickt selbst): `docs/loop/BRANCH-PROTECTION.md` · Backlog und Go-Live-Audit: `docs/loop/BACKLOG.md`, `docs/loop/GO-LIVE-AUDIT.md`
- Architektur und Betrieb: `docs/ARCHITEKTUR.md`, `docs/BETRIEB.md`
