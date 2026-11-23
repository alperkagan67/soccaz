# PAUSE-STAND

Stand: 2026-11-23, nach Doku-Sammel 35 (#241), main = `bcd35e1` (Migrationen bis 0057). Pause-Modus durch den Nutzer (über t2q/t2s). Verfasser: worker-4 (t1b), nach den Meldungen der Worker und dem Zustand der Worktrees; Angaben zu fremden Branches sind gelesen, nicht geprüft. Der Stand vom 2026-11-12 (t9) ist ersetzt.
Regel für die Pause: KEINE neuen Tasks, KEIN neuer Push oder PR; fertiges ist lokal committet, Halbfertiges als `WIP:`-Commit auf dem lokalen Branch.

## 1. Seit dem letzten Stand gemergt (Auszug, einzeln, squash)
| PR | Inhalt |
|---|---|
| #207, #205, #209-#218 | 012 M6b: Zahlungen AUS = Gratis im Kartenmodell, Admin-Finanzen im Kartenmodell, Salden-Guard, Turnier ohne Guthabenweg |
| #222, #233, #236, #239 | 012 M6b Kartenfixtures 1 bis 4 (nur Tests) |
| #225, #226, #228, #229, #234 | 013 M2c: Wertung aus Elo (`rating.ts`), Baustein `Assistent`, DESIGN.md Richtung F, Karten-Logik (Cards A) und Karten-Komponenten (Cards B) |
| #227 | 013 AC-31 Hallen-Freischaltung (Migration 0056, DB-CHECK, Admin 1 und 2) |
| #235 | 013 M2d-1 Hallen-Anfrage Server (Migration 0057 `court_count`, Rate-Limit 5 je Stunde) |
| #230 | Schalter-Flip: Dev-Seeds Kartenmodell AN, Tests starten und enden AUS/AUS |
| #238 | Notschalter Kartenzahlung (Admin 1) |
| #231, #232, #237, #241 | Doku-Sammel 31 bis 35 (Audit, Backlog bis 210, Regelvorschlag 27, BETRIEB Notabschaltung, Blocker G29-012) |

## 2. Offene PRs
| PR | Branch | Hash | Stand |
|---|---|---|---|
| #198 | `feat/012-m6b-code` | 6515fad (lokal weiter 7444770, 7 Commits voraus) | 012 M6b PR 1a: Guthaben-Altpfad im Code entfernen; lokal liegt der Doppelbelastungs-Schutz in `cardModeActive` (noch nicht gepusht) |
| #240 | `feat/013-halle-onboarding` | 8a143c7 | 013 M2d-2: Seite `/halle/anfragen`, Assistent, Einstiegslinks, E2E (`halle-onboarding.spec.ts`, Shard 1). Reviews: security OK, w2 R-T335/R-T335b umgesetzt. CI: der strict-mode-Fehler (Stadt-Feld der Vorseite) ist behoben (Felder nur im Assistenten adressiert), CI-Lauf nach dem Fix und Laufzeit Shard 1 ausstehend; nach dem Merge: Audit-Zeile in die nächste Doku-Sammlung |
| #242 | `feat-venue-requests-ui` | 9e1ef3c | 013 AC-31 UI Admin-Anfragen (w2): ConfirmDialog mit Grund-Feld, Statusbereich, E2E Shard 3. security OK, Review R-T337 (w4) OK mit 3 kleinen Hinweisen |

## 3. Worker (Branch | Hash | Stand | nächster Schritt)
**worker-1**: 012 M6b, Fristjob-Fix
- `feat/pause-fristjob` | c122190 (= main), 3 Dateien uncommitted | **GO-LIVE-BLOCKER G29-012:** Fix „Pause: Frist-Job sagt nicht ab“ (`closeLobbiesAtDeadline` kennt den Kartenschalter nicht, Spiele ohne Abbuchungszeilen können bei Zahlungen AN + Karte AUS an der Frist abgesagt werden) | als `WIP:`-Commit sichern; Plan: Frist-Job und `cardModeActive`-Pfade bei Karte AUS pausieren; Tests: „pausiert: Frist-Job sagt nicht ab“ (Spiel nahe 48-h-Frist, Karte AUS, bleibt unverändert), Nachzahl-/Übernahmefenster (AC-9) während der Pause, Tabelle Job × Schalterzustand × erwartetes Verhalten für BETRIEB.
- `feat/1c-ii-b-abrechnung` | c122190 (leer) | 1c-ii-b: `settleMatch` aus dem Fristjob löschen (Backlog 206), neutraler Text „Bezahlung ist gerade nicht möglich“ (Backlog 209) | nach dem Fristjob-Fix.
- `feat/012-m6b-1c-iii-a` | 34cf6a4, 13 voraus | 1c-iii (a) Nachläufer (hasPaidNow netto, Konsistenztest) | prüfen, ob schon in main enthalten (#205), sonst aufräumen.
- `feat/012-m6a-guthaben-ui` | ae77b08, 10 voraus | 012 M6a Reste (E2E ohne Bezahlen-Knopf) | prüfen, ob durch #207ff. überholt.

**worker-2**: Admin-Anfragen-UI
- `feat-venue-requests-ui` | 9e1ef3c | #242 (siehe oben) | Merge nach beiden OK und grüner CI.
- `feat/seed-admin` | 9cfa78a, 1 voraus | Admin-Seed für die Frontend-Analyse | lokal, kein PR.

**worker-3**: Cards, Kartenfixture
- `feat/013-cards-c1` | cf444bc (Vorgänger 6532afc/b36553e), 3 voraus | Cards C1 (Wertung aufdecken als Text und Karte, `/spiele/[id]`), Review R-T336 umgesetzt (E2E in Shard 4, ruhiger Wortlaut bei gesunkener Stufe, Überschrift „Deine Wertung nach diesem Spiel“) | PR öffnen nach der Pause; danach C2 (Animation, AC-21 bis AC-23) und PR B Nachläufer.
- `feat/012-m6b-kartenfixture-4` | 7c61099, 11 voraus | Nachtrag zu Paket 4 (R-T334, über 12 Spieler) | prüfen, ob in #239 enthalten.
- `fix/seed-scripts-guard` | c9db0a3, 5 voraus | Seed-Skript-Wächter | lokal.
- `feat/m2b-look` (Worktree `docs-analyse-frontend-y1`) | ee2843d, 79 voraus, 5 uncommitted | Look-Stand, **tabu** (Look-Abnahme beim Nutzer).

**worker-4 (t1b)**: Reviewer, Onboarding, Doku
- `feat/013-halle-onboarding` | 8a143c7 | #240 offen, Arbeitsbaum sauber | auf CI-Lauf warten; keine eigene Nacharbeit offen.
- `docs/sammel-34` | 66cdda5 | ÜBERHOLT durch #241 (Backlog 209 ist in main); Worktree kann entfernt werden.
- `docs/pause-stand-2` | dieser Stand | Doku-PR nach der Pause.
- Alle Reviews bis R-T337 gemeldet (R-T328 bis R-T337: Kartenfixtures, Schalter-Flip, Cards B und C1, Notschalter, Admin-Anfragen-UI).

## 4. Push-Reihenfolge nach der Pause
1. **Fristjob-Fix (w1, `feat/pause-fristjob`)**: Go-live-Blocker, zuerst; danach BETRIEB-Tabelle Job × Schalterzustand und die Warnung „Notschalter nicht in Produktion nutzen“ entfernen, G29-012 abhaken.
2. 1c-ii-b (w1): `settleMatch` raus, Neutraltext.
3. #198 (012 M6b PR 1a) samt Doppelbelastungs-Schutz.
4. #240 (Onboarding) und #242 (Admin-Anfragen-UI), unabhängig voneinander, CI je einzeln (höchstens ein Browser-Lauf zur Zeit; Shard 1 und 3 messen).
5. Cards C1, dann C2 und PR B Nachläufer.
6. Doku-Sammel 36: Audit #240, #242, #198, Fristjob-Fix; Tabelle Job × Schalter.
Migrationen: Nummer beim Bau, serieller Merge, wer später mergt renummeriert (Journal und Snapshot). Heute main bis 0057; kein Branch trägt eine ungemergte Migration.

## 5. Offene Entscheide
- **Nachzahlfenster nach langer Pause:** laufen Nachzahl- und Übernahmefristen (AC-9) während der Notabschaltung weiter und sagen Spiele ab, oder wird verlängert? Beleg durch den Fristjob-Test.
- **Neutraltext 1c-ii-b:** „Bezahlung ist gerade nicht möglich“ bei Zahlungen AN + Karte AUS (Lobby, Bereit, Beitritt), bis dahin Support-Hinweis.
- **Tabelle Job × Schalterzustand × erwartetes Verhalten** (liefert w1, für BETRIEB).
- Wortlaut bei sinkender Stufe (umgesetzt „ruhig“, Entscheid t2q bestätigen); `rating_history` je (Spieler, Spiel) eindeutig machen (Backlog).

## 6. Punkte, die nur der Nutzer entscheiden oder tun kann
- **Anbieter-Spike A2** (Entscheid und Konto).
- **Regel-PRs 23 bis 27** (`docs/loop/REGELVORSCHLAG.md`; Nutzer mergt, `.claude/` und `.github/` ebenso).
- **Rechtsliste (`docs/loop/FEHLT-NOCH.md`):** Bedingungstext Hallen-Onboarding (ENTWURF, Anwalt), Partnervertrag Hallen, Markenprüfung Richtung F (Backlog 171), Erstattung und Abschreibung von Guthaben-Ansprüchen, Steuerberater (Kontenzuordnung, USt).
- **Look-Abnahme M2b / Look-Abnahme 2** (Bilder, Videos, Handy-Prüfung AC-24), Hero-Video-Lizenz.
- **Aufräumen, das nur der Nutzer kann:** `.playwright-mcp/`, nicht löschbare Review-Worktrees (siehe alter Stand), IDE-tsserver-Prozesse.
- Port 3100 gehört dem Nutzer (nicht beenden).

## 7. Neustart-Hinweise
- Nach /clear oder Neustart zuerst diese Datei und `docs/loop/HANDOFF.md` (falls vorhanden) lesen.
- **Migrationen in der eigenen Worker-DB:** `npm run db:migrate` im jeweiligen Worktree (0056 und 0057 sind neu; Worker-DBs mit einem früheren Stand von 0056 neu aufbauen, siehe `docs/BETRIEB.md`). Vorher `pwd`, `git branch --show-current` und die Ziel-DB prüfen (Regelvorschlag 27); nie in `SoccaV2` (Haupt-DB `soccav2`).
- **Worktrees:** `node scripts/worktree.mjs create <branch> <worker> --base origin/main --no-seed` bzw. `remove <branch>`; Pfade mit Leerzeichen immer quoten; schreibende Befehle nur hinter `cd … &&`, nie hinter einem `cd`, das fehlschlagen kann.
- **hc-Adressen:** t2q (Orchestrator), t2r, t2s (Task Manager), t2t, t2v, t2w; lange Texte als Datei senden, nie Backticks oder `$(…)` direkt in doppelte Anführungszeichen.
- **Aktuelle Schalterlage:** Produktion `payments_enabled` AUS und `card_payments_enabled` AUS; Dev-Seeds schalten beide EIN, Tests starten und enden AUS/AUS. Notschalter nur Admin 1, **nicht benutzen, bis der Fristjob-Fix gemergt ist** (G29-012).

## 8. Speicherregeln (Arbeitsweise, aus den gemerkten Rückmeldungen)
- Der Orchestrator mergt nie; `NEEDS-USER` (`.claude/`, `.github/`, Regel-PRs) übergeht kein Agent.
- Aufräumen (Worktrees, Branches) erst, nachdem `gh pr view` den PR als MERGED zeigt; nie in einer Kette mit dem Merge-Check.
- `gh pr merge` immer als Einzelbefehl, nie mit `&&` verkettet; Merge-Meldung nur mit Beleg (`gh pr view --json state,mergedAt`).
- Abläufe (Weiterleitung, Format, Reihenfolge) selbst entscheiden und nicht beim Nutzer erfragen; Best Practice, keine Leerläufe, freie Worker sofort mit Vorarbeit einsetzen.
- Plan-Aussagen immer gegen den Code lesen (R-T313, R-T333); Folgetexte nur mit Beleg.
- Öffentliches Repo: keine Secrets, keine lokalen Pfade, keine privaten Mails; `.env*` nie lesen oder ausgeben.
