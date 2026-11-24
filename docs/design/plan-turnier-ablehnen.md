# Plan: Turnier-Ablehnen mit Begründung (Backlog 161, Vertrag 011 AC-3)
Stand: 2026-11-24 · Code-Stand `origin/main` 78170a4 · Verfasser: worker-4 · Status: **Plan, kein Bau** (Bau erst nach OK des Task Managers und nach den Pilot-Prioritäten) · Entscheid t2q: Grund-Kategorie plus Wege, keine automatische Absage; **Entscheide (a) bis (c) vom 2026-11-24 eingearbeitet**: erster Schnitt = zwei Wege (andere Halle, absagen), Termin ändern später

## 1. Ausgangslage (aus dem Code)
- Die Halle **mit Zugang** sagt ein fixiertes Turnier zu (`confirmTournamentVenue`, `src/server/tournament-confirm.ts`); ohne Zusage ist es nie abbuchbar (`hallZusageOk`) und wird zur Frist abgesagt, Erinnerung 24 h und 6 h vorher. Ein „Ablehnen“ gibt es bewusst nicht (Entscheid 7b, Backlog 161).
- Beweisprotokoll: `booking_evidence` kennt für Turniere nur die Art `accepted` (CHECK `booking_evidence_tournament_kind_check`, ausdrücklich per DROP/ADD erweiterbar, Plan 009 16d.8); der Eintrag entsteht durch den DEFERRABLE-Trigger `evidence_tournament_event` auf dem Übergang `venue_confirmed_at` NULL → Wert (Migration 0054). `reason_code` ist schon da (`belegt | wartung | veranstaltung | sonstiges`), Freitext nur als Hash plus Nebentabelle.
- Wege zurück: `setTournamentVenue` (Halle wählen, nur Status `registration`), `reopenRosters` (zurück zu `registration`, erstattet gezahlte Anteile, **verweigert** ab der ersten Abbuchungszeile), `cancelTournament` (nach der ersten Abbuchung nur Admin 1, Erstattung), Frist `chargeDueAt` (aus Anstoß, nicht aus der Halle). Einen Weg, **Termin** eines angelegten Turniers zu ändern, gibt es heute **nicht** (`resetVenueConfirmationIfTermsChanged` wartet auf ihn).

## 2. Datenmodell und Migration: ja, eine kleine additive Migration
1. `tournaments.venue_declined_at timestamptz`, `venue_declined_by uuid`, `venue_decline_code text` (CHECK auf die vier Codes plus `''`). Zusage und Ablehnung schließen sich aus (CHECK: nicht beide gesetzt). Ein neues `venue_confirmed_at`, ein Hallenwechsel oder eine Terminänderung setzt die Ablehnung zurück (wie heute die Zusage, `resetVenueConfirmationIfTermsChanged`).
2. `booking_evidence_tournament_kind_check` erweitern auf `kind in ('accepted','declined')`; zweiter DEFERRABLE-Trigger (Muster `evidence_tournament_event`) auf NULL → Wert von `venue_declined_at`, schreibt `declined` mit `reason_code` und Freitext-Hash. Der Hash (Version 2) bleibt unverändert, nur neue Art; Rollback = Trigger und Spalten droppen (kein Umschreiben von Altzeilen). **Migration nie parallel zu Tasks mit Schema-Annahmen** (CLAUDE.md).
3. Freitext optional, höchstens 300 Zeichen (bestehender CHECK `booking_evidence_reason_len`), Klartext nur in `booking_evidence_reason_text`; **nie** in Mitteilungen an Teams.

## 3. Zustandsmatrix (Turnier × Halle)
| Turnier-Stand | Halle ohne Zugang | Halle mit Zugang, keine Zusage | Zusage erteilt | Abgelehnt (neu) |
|---|---|---|---|---|
| `registration` | nichts | nichts (Preis steht nicht fest) | – | – |
| `payment`, vor Frist, **keine Abbuchungszeile** | nichts | Betreiber: **Zusagen** oder **Ablehnen mit Grund** | Betreiber kann nicht mehr ablehnen (Zusage gilt) | Veranstalter sieht die Grund-Kategorie und die zwei Wege; Frist läuft; Abbuchung gesperrt (`hallZusageOk` bleibt false) |
| `payment`, nach Frist ohne Zusage | – | wie heute: Absage zur Frist (Job) | – | **bleibt**: keine eigene Absage durch die Ablehnung; die Frist-Absage greift wie heute |
| ab der ersten Abbuchung | – | Zusage nötig (Snapshot), Ablehnen **nicht mehr möglich** (neutrale Meldung wie `NOT_POSSIBLE`) | – | – |
| Bracket steht, abgesagt, beendet | nichts | nichts | – | – |
Gleiche Berechtigung wie die Zusage: aktiver Zugang zur Halle **des** Turniers, jeder Mangel gibt dieselbe neutrale Antwort, Turniersperre erst nach der Berechtigung (Muster R-T244, N1).

## 4. Die zwei Wege des Veranstalters im ersten Schnitt (nur ohne Abbuchungszeile)
- **Andere Halle wählen:** Liste = alle **freien** Partnerhallen (`listPartnerVenueOptions`) außer der ablehnenden (die Ablehnung gilt je Halle und Turnier). Technik: der Pfad `reopenRosters` (Kader öffnen, erstattet bereits gezahlte Anteile, Preis wird neu gerechnet) und danach `setTournamentVenue`. Die Ablehnung wird dabei zurückgesetzt, die neue Halle braucht ihre eigene Zusage. Die **Abbuchungsfrist bleibt** (sie hängt am Anstoß, nicht an der Halle).
- **Termin ändern: nicht im ersten Schnitt** (Entscheid t2q (a): berührt Frist, Hallenbuchung und Zustimmung der Teams). Die Ablehn-Meldung nennt nur die zwei Wege. Eigener späterer Task mit Produktentscheid, als Backlog-Zeile einzutragen (mit dem Bau-PR).
- **Turnier absagen:** `cancelTournament` mit Hinweis „volle Erstattung, keine Abbuchung“; vor der ersten Abbuchung sagt der Veranstalter selbst ab (AC-21), Erstattung bereits gezahlter Anteile wie heute. Keine automatische Absage durch die Ablehnung.
Erinnerungen (24 h, 6 h) laufen weiter, der Text ändert sich bei Ablehnung auf „Die Halle hat abgesagt. Wähle eine andere Halle oder sage das Turnier ab.“ (kein Satz mit Rechtsfolge).

## 5. Texte und Rechtsfolge
- Grund-Kategorie in Klartext: „Halle belegt“, „Wartung“, „Veranstaltung“, „Sonstiges“ (entspricht den Codes); die Wörter stehen in `src/lib/begriffe` bzw. einer neuen Konstante, nicht im Komponenten-Text.
- **Rechtsfolge nur über zentrale Texte:** Sätze zu Erstattung und Zahlungspflicht („volle Erstattung“, „nichts abgebucht“) kommen ausschließlich aus `src/lib/zahlungspflicht-texte.ts` (ENTWURF-Regime, Streutext-Sperre `zahlungspflicht-texte.test.ts`); der neue Satz wird dort ergänzt und von der Matrix `zahlungspflicht-matrix.test.ts` erfasst. Kein neuer Rechtstext außerhalb.
- Teams werden **ohne Namen Dritter** informiert: Mitteilung nennt Turnier, Halle (Name der Halle ist keine Person) und den Grund-Code in Worten, nie den Freitext, nie den Betreiber-Namen (AC-17).

## 6. Tests (je mit Gegenprobe)
- Unit: Zustandsmatrix je Zeile (Ablehnen erlaubt/verweigert), Rücksetzung bei Halle/Termin/Zusage, Textwahl, Streutext-Sperre.
- Integration (lokale DB): Ablehnen setzt Spalten und schreibt **einen** Beweiseintrag `declined` (Hash-Kette bleibt gültig, `verifyEvidenceChain`), zweimal ablehnen = einmal; Berechtigung (fremder Betreiber, Gast, Veranstalter: neutrale Meldung); nach erster Abbuchungszeile nicht möglich; Abbuchungsjob bucht ein abgelehntes Turnier nicht; Weg „andere Halle“ erstattet und fixiert neu; Weg „absagen“ erstattet; Frist-Job sagt weiter zur Frist ab (keine eigene Absage); Nebenläufigkeit (zwei Ablehnungen, Ablehnung gegen Zusage: genau eine gewinnt); **Randfall Ablehnen nach der ersten Abbuchungszeile** (gesperrt, Entscheid (b); die Abbuchung entsteht bei Snapshot true ohnehin erst nach der Zusage): neutrale Meldung, danach nur Admin-1-Absage mit Erstattung.
- E2E: Betreiber lehnt ab, Veranstalter sieht die Kategorie (nie den Freitext) und zwei Wege (je **eine** Hauptaktion), Teams ohne Namen Dritter; Gast-Sicht-Registry ergänzt (`gast-sicht-routen.ts`).
- Migration: Trigger-Test (Kategorie, Hash), Rollback getestet.

## 7. Dateien (voraussichtlich)
`src/db/schema-league.ts`, neue Migration (`drizzle/00xx_turnier_ablehnen.sql` + Trigger), `src/server/tournament-confirm.ts` (+ `declineTournamentVenue`, Reset-Helfer), `tournament-confirm-actions.ts`, `tournament-venue.ts`, `tournaments.ts` (Reset bei Halle/Termin, Wege), `src/lib/zahlungspflicht-texte.ts`, `src/app/halle/page.tsx` und `src/app/turniere/[id]/page.tsx` (+ `TournamentVenuePick.tsx`), Mitteilungstext, Doku (BETRIEB, Backlog 161 abhaken, Go-live-Audit-Zeile), Tests wie oben.

## 8. Aufwand und Reihenfolge
Zwei PRs: **(1)** Migration, Server-Logik, Beweiseintrag, Tests (Geldnähe: security-reviewer Pflicht, Zwei-Läufe-Regel, Eintrag in `GO-LIVE-AUDIT.md`), ca. 1,5 bis 2 Arbeitstage; **(2)** Oberfläche (Betreiber-Ablehnen, zwei Wege, Texte) und E2E, ca. 1 bis 1,5 Tage. Der frühere dritte PR (Termin ändern) **entfällt**. Start frühestens nach der Pilot-Vorbereitung; Migration nicht parallel zu Schema-nahen Tasks.

## 9. Entscheide t2q (2026-11-24, vorher offene Fragen)
(a) **Termin ändern** nicht im ersten Schnitt; später als eigener Task mit Produktentscheid (Backlog-Zeile). (b) **Ablehnen nach der ersten Abbuchungszeile gesperrt**, danach nur Admin-1-Absage mit Erstattung; im Test abgedeckt. (c) Der Veranstalter sieht **nur die Kategorie**; der Freitext der Halle steht nur im Beweisprotokoll.
