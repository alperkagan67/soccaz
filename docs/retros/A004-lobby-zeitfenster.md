## Retro A004 (Lobby-Zeitfenster, Vertrag 004) – 2026-11-09

Was lief gut: Der Loop trug den Pilot: 4 Tasks (T20 bis T23), 4x `REVIEW-OK`, CI grün, und die Race Condition bei der Doppel-Herausforderung wurde reproduziert und behoben.

Was ging schief:
- Symptom: Worktree-Ordner (`feat-lz-t20`, `-t20-review`, `-t21`, `-t21-review`) ließen sich nicht entfernen, `git worktree remove` meldete „Invalid argument“. Ursache: laufende Dev-Server und Shells hielten die Ordner gesperrt. Fix: Server und Shells beenden, dann aufräumen.
- Symptom: Das Beenden der Dev-Server per `taskkill` mit Prozessfilter griff nicht. Ursache: Die Ausgabe auf deutschem Windows ist anders (Filter passte nicht). Fix: Server über den Port beenden.

Prävention:
1. Dev-Server am Task-Ende per Port beenden (`npx kill-port 310N`) und die Shell aus dem Worktree verlassen → AGENTS-SETUP.md (Abschnitt 3a).
2. Standard sind nur 2 Writer + 1 Reviewer wegen des Nutzungslimits → AGENTS-SETUP.md (Abschnitt 3a, gekürzt, Verweis auf Spec Abschnitt 10).
3. Offener Punkt (nicht in diesem PR): Worktree-Ordner per `permissions.additionalDirectories` in `.claude/settings.json` freigeben. `.claude/` ist ein Ausnahme-PR und wird vom Nutzer gemergt.

Zusätzlich beschlossen: neue Merge-Regel (Team mergt normale PRs per `gh pr merge --squash`, der Nutzer mergt Ausnahme-PRs), eingearbeitet in CLAUDE.md, AGENTS-SETUP.md und LOOP-SPEC.md.

Kandidaten für später (kein Teil dieser Retro):
- „Eure Lobby“-Texte für Fremde auf `/lobby/offen`
- anonymer E2E-Kontext wird nicht geschlossen
- Kader-Namen auf `/teams/{slug}` sind für alle sichtbar
- `mergeTeams` ohne feste ID-Sperrreihenfolge
- `convertLegacyChallenges` ohne Team-Lock
- `FOR NO KEY UPDATE` statt `FOR UPDATE`
- Zusammenlegung der zwei Suchwege
- einheitliche Begriffe „Lobby“ und „Suche“
