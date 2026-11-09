# Go-Live-Audit

PRs mit DB-Migration, Zahlungen oder Auth, die der Task Manager selbst gemergt hat (Regel: CLAUDE.md, Merge-Regel). Vor dem Go-Live geht der Nutzer diese Liste durch.

| PR | Datum | Merge-Commit | Was | Risiko |
|----|-------|--------------|-----|--------|
| #36 | 2026-11-09 | `d8d87cd` | Turniermodus: Migration 0033 `paid_ready_at` (nullable `ADD COLUMN`), Zahlungsfluss (Bereit nur nach voller Zahlung, Zahlung füreinander, Erstattung an den Zahler), Rechte (Organisator trägt Ergebnisse ein und entscheidet Streit) | Geldbewegungen und Idempotenz; Restrisiko: Veranstalter, der zugleich Spieler ist |
| #37 | 2026-11-09 | `2e5b1da` | Auth/Redirect: `safeInternalPath` gegen Open-Redirect nach Login und Onboarding | niedrig; weitere Redirect-Stellen waren offen (mit #39 geschlossen, Reste im `docs/loop/BACKLOG.md`) |
| #39 | 2026-11-09 | `5fe51b3` | Redirect-Härtung im Zahlungs- und Inhaltsbereich (`payments.ts` `safeReturnPath`, `guthaben` `safeBack`, `content-actions`, `internalReturnPath` nutzen `safeInternalPath`) | niedrig; Zahlungsbereich berührt, Rücksprungadressen werden nur noch als interne Pfade gespeichert und ausgegeben |
| #40 | 2026-11-09 | `ba2acec` | Veranstalter-Rechte (kein endgültiges Eintragen oder Entscheiden für Veranstalter, die Mitglied oder Spieler eines beteiligten Teams sind) und Fehlerisolation der Anmeldeschluss-Meldung | niedrig/mittel (Rechte); ausgetretene Mitglieder ohne Kader-Eintrag gelten als unbeteiligt |
