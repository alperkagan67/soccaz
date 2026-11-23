# PAUSE-STAND

Stand: 2026-11-23 (Abend), main = `9a2bfc0` (nach #261 Fristjob PR B, #267 Hero `23b67ab`, #268 PAUSE-STAND `1a9849e`) (Migrationen bis 0057). **PAUSE-MODUS** (Nutzer, via t2q): keine neuen Tasks, nichts Unfertiges pushen; Abschluss siehe Abschnitt 3. Verfasser: worker-4 (t1b); Angaben zu fremden Branches sind aus `gh pr list` und `git worktree list` gelesen, nicht im Code geprüft.
Es gelten die Regeln aus dem Regel-PR #258 (`CLAUDE.md`, `AGENTS-SETUP.md` 2.5/3a/3b, `docs/loop/LOOP-SPEC.md` Abschnitt 14): Änderungen nur über eigenen Branch und PR, Worktrees nur über `worktree.mjs create`, Dev-Server nur nach Speicherregel (höchstens 2, sofort beenden), Port 3100 gehört dem Nutzer, `.env*` nie lesen.

## 1. Seit dem letzten Stand gemergt (einzeln, squash)
| PR | Inhalt |
|---|---|
| #247 bis #250 | 013 M2c Cards C1 und C2 (Wertung aufdecken, Aufdeck-Bewegung), Notschalter-Feinschliff (`system.critical`), **G29-012 Spiele-Teil** (Pause: Frist-Job sagt nicht ab, Karenz 2 h; #250) |
| #251, #253, #256, #262 | 013 AC-27 Kontrastmessung: Rechenkern, Browserschicht (Report-Modus), Textmessung per Range, Messung ohne feste Leisten/Dev-Badge (Rest-Punkte bewiesen als Artefakte) |
| #255 | 013 M2c Cards C3a: Teamseite mit Zeilen und TeamCard (offen: Backlog 216, G30-013) |
| #257 | 013 M2c Kontrast-Tokens (Befunde 1 bis 4 behoben) |
| #258 | **Regel-PR** (Nutzer gemergt): Regeln 1 bis 14, 16 bis 27 |
| #259 | CI: Browser-Test-Shards neu verteilt (Teil 1 und 4 über 10 Minuten) |
| #244 | Dependabot: Actions-Gruppe (laut `git log` gemergt, `aabe47d`) |
| #252, #254, #260, #264 bis #266 | Doku-Sammel 37 bis 41, HERZSCHLAG.md (Verweis statt 30-Minuten-Regel) |

## 2. Offene PRs
| PR | Branch | Hash | Stand |
|---|---|---|---|
| #261 | `feat/pause-karenz-b` (w1) | 9a2bfc0 | **GEMERGT** (21:15 UTC): Fristjob PR B, G29-012 ganz abgehakt (Turnier-Haken in `GO-LIVE-AUDIT.md`); Notschalter für Spiele und Turniere benutzbar |
| #263 | `feat-spieler-onboarding-server` | 480e86a | Spieler-Onboarding PR 1 (Server-Prüfung `player-onboarding.ts`, Aktion, Guard); Lauf 1 grün, 2. Lauf offen |
| #267 | `feat/m2c-hero` (w3) | 23b67ab | **GEMERGT**: Hero Standbild und Scrim; danach AC-27 `enforce`, sobald der main-Lauf 0 Verstöße zeigt |
| #198 | `feat/012-m6b-code` | 6515fad (lokal 7444770, 7 voraus) | Altstand 012 M6b PR 1a: Guthaben-Altpfad im Code entfernen; lokal liegt der Doppelbelastungs-Schutz; **prüfen, ob durch #207ff. überholt, sonst schließen** |

## 3. Worker (Branch | Hash | Stand | nächster Schritt)
Ein Worktree gehört dem Worker, der ihn anlegte; Entfernen nur mit `git worktree remove` nach Freigabe (nicht `worktree.mjs remove`, es löscht die geteilte Worker-DB).

**worker-4 (t1b)** (Reviewer, Doku, kleine Bauten): alles gemergt oder lokal committet, **nichts Unfertiges**; Worktrees `docs-regel-pr`, `ci-shard-rebalance-2`, `test-ac27-rest`, `docs-sammel-39` bis `-41`, `docs-herzschlag-30min` sind weg; Worktree dieser Datei: `docs-pause-stand-3`. **Korrektur:** Dev-Server auf Port 3101 (PID 27364) und 3104 (PID 23588) laufen weiter (die frühere Angabe „nicht mehr aktiv“ war falsch: `netstat` ist deutsch, der Zustand heißt ABHÖREN, nicht LISTEN); der Nutzer beendet sie. Reviews bis R-T353 gemeldet (R-T346c/d, R-T348 bis R-T353). Offene Folgearbeit (nur nach „weiter“): Enforce-PR AC-27, Folge-PR G29-012-Turnier-Haken nach #261.
**worker-1**: `feat/pause-karenz-b` b745cb5 (#261); lokal ältere Branches `feat/1c-ii-b-abrechnung` c122190 (leer, Backlog 206/209), `feat/012-m6b-1c-iii-a` 34cf6a4, `feat/012-m6a-guthaben-ui` ae77b08, `feat/012-m6b-code` 7444770: prüfen, ob überholt, sonst aufräumen.
**worker-2**: `feat/seed-admin` 9cfa78a (Admin-Seed für die Frontend-Analyse, lokal, kein PR). Autor von #263 (Onboarding PR 1): w2, Review w4, security OK.
**worker-3**: `feat/m2c-hero` 86fcac0 (#267); `fix/seed-scripts-guard` c9db0a3 (lokal); `feat/m2b-look` (Worktree `docs-analyse-frontend-y1`) ee2843d, **tabu** (Look-Abnahme beim Nutzer, Referenz für den 94-%-/88-%-Scrim).

## 4. Push-Reihenfolge nach der Pause
1. #261 (Fristjob PR B, zweiter grüner Lauf) und #263 (zweiter Lauf); danach Audit-Zeilen und G29-012-Turnier-Haken (Doku).
2. #267 (Hero), danach main-Lauf prüfen (0 Verstöße im Kontrastprotokoll) und **Enforce-PR** (`AUDIT_MODE` `report` -> `enforce` in `src/lib/contrast-audit.ts`, 1 Lauf).
3. #198 klären (überholt oder zusammenführen), 1c-ii-b (`settleMatch` aus dem Fristjob, Neutraltext, Backlog 206/209).
4. Nächster Regel-PR (NEEDS-USER) mit Kandidat 28 (Server nur mit Beendigung starten; Formulare mit Progressive Enhancement).
Migrationen: Nummer beim Bau, serieller Merge, wer später mergt renummeriert (Journal und Snapshot). Heute main bis 0057; kein Branch trägt eine ungemergte Migration (nicht nachgeprüft für #263).

## 5. Offene Entscheide
- **Hero dunkel: Stopp 70 %** (3,68/4,78 selbst bei Weiß) nur, wenn die AC-27-Messung im main-Lauf nach #267 dunkel kippt; sonst „dunkel unverändert“ (Entscheid t2q).
- **Enforce nach Hero:** erst wenn #267 gemergt und der main-Lauf 0 Verstöße zeigt.
- **Backlog 223 bis 225** (gemergt mit #266): Flake-Familie „Klick vor Hydration“ (vor Go-live), Formulare ohne JavaScript (Produkt, hoch, in 013 M3), Speicherregel-Praxis; **Kandidat 28** wartet auf den nächsten Regel-PR.
- **Neutraltext 1c-ii-b** („Bezahlung ist gerade nicht möglich“ bei Zahlungen AN + Karte AUS).
- Nachzahlfenster nach langer Pause (Karenz für Nachzahlfenster ist in PR B enthalten; Beleg durch den Fristjob-Test).
- Backlog 217/218/221 (Marker aufräumen, Limit 200 und Test mit 11 Pausen, Nachreview-Beobachtungen PR B).

## 6. Punkte, die nur der Nutzer entscheiden oder tun kann
- **Dev-Server auf 3101 und 3104 beenden** (**laufen weiter**: 3101 PID 27364, 3104 PID 23588; `netstat` ist deutsch, Zustand ABHÖREN; mein Beenden verweigerte der Klassifizierer) und den Worktree `test-ac27-rest` (falls noch vorhanden) mit `git worktree remove` entfernen; Port 3100 gehört dem Nutzer.
- **Anbieter-Spike A2** (Entscheid und Konto); **Stripe-Bump** erst nach M6b (stille API-Version, `docs/loop/LOOP-SPEC.md` Abschnitt 14); Dependabot-Regeln siehe `CLAUDE.md`, Merge-Regel.
- **Rechtsliste (`docs/loop/FEHLT-NOCH.md`):** Bedingungstext Hallen-Onboarding (ENTWURF, Anwalt), Partnervertrag Hallen, Markenprüfung Richtung F (Backlog 171), Mindestalter und Zeitzone (Backlog 214), Erstattung und Abschreibung von Guthaben, Hero-Video-Lizenz (Backlog 222).
- **Look-Abnahme M2b / Look-Abnahme 2** (Bilder, Videos, Handy-Prüfung AC-24); Branch `feat/m2b-look` bleibt Referenz.
- **package-lock-Drift im Hauptrepo:** im Arbeitsverzeichnis von SoccaV2 steht `package-lock.json` als geändert (uncommittet, nicht von einem Agenten gewollt): prüfen und zurücksetzen oder bewusst committen.
- **Aufräumen, das nur der Nutzer kann:** `.playwright-mcp/`, nicht löschbare Review-Worktrees, IDE-tsserver-Prozesse.
- Regel-PRs und Änderungen an `.claude/`/`.github/` (auch Actions-Bumps) mergt der Nutzer.

## 7. Neustart-Hinweise
- Nach /clear oder Neustart zuerst diese Datei und `docs/loop/HANDOFF.md` (falls vorhanden) lesen; danach die Regeln aus #258 (`CLAUDE.md`, `AGENTS-SETUP.md`).
- **Node >= 22.13 (22er)** ist Pflicht (`node -v`, Datei `.nvmrc`): `npm run dev|build|lint|test|test:e2e|test:integration|typecheck|db:migrate` prüfen das vor dem Start.
- **Worktrees:** `node scripts/worktree.mjs create <branch> <worker> --base origin/main --no-seed`; Pfade mit Leerzeichen immer quoten; schreibende Befehle nur hinter `cd … &&`, vorher `pwd` und `git branch --show-current` prüfen; Entfernen nur mit `git worktree remove` nach Freigabe.
- **Migrationen in der eigenen Worker-DB:** `npm run db:migrate` im jeweiligen Worktree.
- **hc-Adressen** ändern sich nach Neustart (`hc ls --json --label role=<rolle>`); lange Texte als Datei senden, nie Backticks oder Inline-Kommandos in doppelten Anführungszeichen.
- **Schalterlage:** Produktion `payments_enabled` AUS und `card_payments_enabled` AUS; Dev-Seeds schalten beide EIN, Tests starten und enden AUS/AUS. Notschalter nur Admin 1; **nicht in Produktion benutzen**, bis #261 (Turniere) gemergt und G29-012 ganz abgehakt ist.

## 8. Arbeitsweise (aus den gemerkten Rückmeldungen)
- Der Orchestrator mergt nie; `NEEDS-USER` übergeht kein Agent. Merge-Meldungen nur mit Beleg (`gh pr view --json state,mergedAt,mergeCommit`); `gh pr merge` als Einzelbefehl; Aufräumen erst, wenn der PR als MERGED belegt ist.
- Abläufe selbst entscheiden, Best Practice, keine Leerläufe; Plan-Aussagen immer gegen den Code lesen.
- Öffentliches Repo: keine Secrets, keine lokalen Pfade, keine privaten Mails; `.env*` nie lesen oder ausgeben.
