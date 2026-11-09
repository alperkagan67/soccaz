# Go-Live-Audit

PRs mit DB-Migration, Zahlungen oder Auth, die der Task Manager selbst gemergt hat (Regel: CLAUDE.md, Merge-Regel). Vor dem Go-Live geht der Nutzer diese Liste durch.

| PR | Datum | Was | Risiko |
|----|-------|-----|--------|
| #36 | 2026-11-09 | Turniermodus: Migration 0033 `paid_ready_at` (nullable `ADD COLUMN`), Zahlungsfluss (Bereit nur nach voller Zahlung, Zahlung füreinander, Erstattung an den Zahler), Rechte (Organisator trägt Ergebnisse ein und entscheidet Streit) | Geldbewegungen und Idempotenz; Restrisiko: Veranstalter, der zugleich Spieler ist |
| #37 | 2026-11-09 | Auth/Redirect: `safeInternalPath` gegen Open-Redirect nach Login und Onboarding | niedrig; weitere Redirect-Stellen sind offen (siehe `docs/loop/BACKLOG.md`) |
