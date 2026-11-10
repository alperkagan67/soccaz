# Go-Live-Audit

PRs mit DB-Migration, Zahlungen oder Auth, die der Task Manager selbst gemergt hat (Regel: CLAUDE.md, Merge-Regel). Vor dem Go-Live geht der Nutzer diese Liste durch.

| PR | Datum | Merge-Commit | Was | Risiko |
|----|-------|--------------|-----|--------|
| #36 | 2026-11-09 | `d8d87cd` | Turniermodus: Migration 0033 `paid_ready_at` (nullable `ADD COLUMN`), Zahlungsfluss (Bereit nur nach voller Zahlung, Zahlung füreinander, Erstattung an den Zahler), Rechte (Organisator trägt Ergebnisse ein und entscheidet Streit) | Geldbewegungen und Idempotenz; Restrisiko: Veranstalter, der zugleich Spieler ist |
| #37 | 2026-11-09 | `2e5b1da` | Auth/Redirect: `safeInternalPath` gegen Open-Redirect nach Login und Onboarding | niedrig; weitere Redirect-Stellen waren offen (mit #39 geschlossen, Reste im `docs/loop/BACKLOG.md`) |
| #39 | 2026-11-09 | `5fe51b3` | Redirect-Härtung im Zahlungs- und Inhaltsbereich (`payments.ts` `safeReturnPath`, `guthaben` `safeBack`, `content-actions`, `internalReturnPath` nutzen `safeInternalPath`) | niedrig; Zahlungsbereich berührt, Rücksprungadressen werden nur noch als interne Pfade gespeichert und ausgegeben |
| #40 | 2026-11-09 | `ba2acec` | Veranstalter-Rechte (kein endgültiges Eintragen oder Entscheiden für Veranstalter, die Mitglied oder Spieler eines beteiligten Teams sind) und Fehlerisolation der Anmeldeschluss-Meldung | niedrig/mittel (Rechte); ausgetretene Mitglieder ohne Kader-Eintrag gelten als unbeteiligt |
| #46 | 2026-11-10 | a27999f | Privatspiel (A006, Vertrag 006): Pflicht-Miete mit Kostenlos-Option, Miete teilen (`shareCents`, aufgerundet, der Rest bleibt bei der Plattform), Zahlungen (Anteil pro Spieler, Fixieren beim zweiten Bereit, Neuberechnung vor dem Fixieren mit sofortiger Rückerstattung, Austausch eins zu eins mit Erstattung erst bei Ersatzzahlung, Absage 24 h und 1 h vor Anstoß bei ungedeckter Miete mit Erstattung an alle (durch Vertrag 006 v2 ersetzt: einzige Frist 48 h, keine 24-h- und 1-h-Absage mehr; ausgeliefert ist bis zur Umsetzung weiter der alte Stand), 48-h-Listensperre ohne Austritt und Rauswurf, Idempotenzschlüssel inklusive `createdAt`; der Schlüsselwechsel in `settlePendingRefunds` (`pending:<match>:<user>:<createdAt>`) gilt auch für Teamspiele und ist eine Fehlerkorrektur: eine zweite Erstattung wurde bisher verschluckt), Einladungslink (Widerruf und Neu-Erzeugen), Datenschutz (Privatspiel für Unbeteiligte nicht sichtbar, Leck in der Monatsrangliste behoben); keine Migration | Geldbewegungen und Idempotenz; die Plattform trägt eine Unterdeckung, wenn der Prüf-Job ausfällt; Abweichung `BLOCK_PRIVATE_JOIN_BEFORE_FIX` (Beitrittssperre, Nutzerentscheid offen) |

## Prüfpunkte vor Go-Live

| Nr. | Was | Risiko |
|-----|-----|--------|
| E2 | `BLOCK_PRIVATE_JOIN_BEFORE_FIX=false` in `src/server/wallet.ts`: Der Beitritt zu einem Privatspiel vor dem Fixieren ist immer erlaubt. Vertrag 006 v2 kennt die Sperre nicht mehr: Der Beitritt ist bis zur 48-h-Frist offen, der Schalter entfällt mit der Umsetzung von v2. Bis dahin bleibt der Stand `false`; vor dem Go-Live prüfen, dass der Schalter entfernt ist. | niedrig; Abweichung ist durch v2 entschieden, Zahlungsfluss im Privatspiel |
| E3 | Geld parken in der Lobby braucht vor Go-live einen Zahlungsdienstleister (z. B. Stripe Connect). Bis dahin gibt es nur internes Guthaben und das Hauptbuch, keinen Auszahlungsweg an Veranstalter oder Halle (Verträge 006 v2 und 008 v2). | hoch; ohne Dienstleister darf kein echtes Geld geparkt oder ausgezahlt werden |
