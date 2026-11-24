# Gratis-Turnier PR D: E2E-Skizze (nicht gebaut)

Stand: 2026-11-27 · Verfasser: worker-4 · Status: **Skizze** für den Bau von PR D (kein Code, keine Specs) · Grundlage: PR A bis C (Gratis-Turnier, Zahlungen AUS), `tests/e2e/turnier-gratis-anlegen.spec.ts`, `tests/e2e/zahlungen-aus-matrix.spec.ts`, `docs/design/go-live-runbook.md` 5a und 9a.

**Bau-Gate:** Die Schritte 2.1 bis 2.3 sind auf `main` baubar. Schritt **2.4 (Abpfiff, Kampflos, `end-match`, `end-match-draw`, `manual-result`, `forfeit`) erst nach dem Merge von PR C (#387)**: die Testkennungen existieren nur im PR-C-Branch (Stand #387 bb36ad9).

Ziel: Der Turniertag (12.12.) als **ein durchgehender Ablauf** automatisiert absichern, in zwei Größen (6 und 16 Teams), auf dem Handy (390 px), mit **neuem Nutzer über den Einladungslink**. Zahlungen sind **AUS** (Standard der CI, `global-setup`), die Spec setzt keinen Zahlungsschalter.

## 1. Rahmen und Lage im Repo
- Neue Datei `tests/e2e/turnier-tag.spec.ts` (nach Bau: in `tests/e2e-shards.json` eintragen, Notiz einzeilig; `node scripts/e2e-shards.mjs check`). Zwei `test()` mit `test.setTimeout(300_000)`: **6 Teams** (Standard, Shard 4) und **16 Teams** (Obergrenze, **eigene Spec-Datei in einem bestehenden Shard** (nicht in dem des 6-Teams-Tests; die CI-Matrix ist fest 1 bis 5, `ci.yml` ist NEEDS-USER, es gibt **keinen 6. Shard**); es gibt kein `@slow`).
- Seeding **per SQL** (Muster `zahlungen-aus-matrix.spec.ts` `seedTournament`, `seedUser`): Veranstalter (`is_organizer = true`), N Teams mit je 5 Spielern und einem Captain, ein Turnier mit `total_cents = 0`, `max_teams = N`, Status `registration`. Nur **eine** Schleife über die Teams ist echte Bedienung (siehe 2.2), der Rest per SQL, damit die Laufzeit stabil bleibt.
- Anmeldung nur über `devLogin` (Dev-Login existiert nur außerhalb der Produktion; Smoke prüft, dass er dort fehlt).
- Viewport `390 × 844` für **alle** Kontexte (`browser.newContext({ viewport })`), nie nur Desktop.

## 2. Ablauf (Schritte und Erwartet)
### 2.1 Veranstalter legt an (Handy)
1. `/app/turniere/neu`: Formular **ohne Preisfeld**, Hinweissatz sichtbar, Teamlimit 16 (`#maxTeams[max=16]`), Anmeldeschluss-Vorschlag 4 Tage vorher.
2. Termin eintragen, „Turnier anlegen“.
3. **Erwartet:** Turnierseite mit Kasten „Ablauf des Turniers“ (`data-testid=free-flow`); `tournaments.total_cents = 0`.

### 2.2 Neuer Nutzer über den Einladungslink
1. Einladungslink des (privaten) Turniers als **Gast** öffnen: **kein 404**, die Seite zeigt „Anmelden und mitmachen“. Der Hinweis „Zum Mitmachen brauchst du ein Google- oder Apple-Konto (kostenlos)“ ist **noch nicht gebaut** (eigener kleiner PR mit Wortscan, Flag `APPLE_LOGIN_ENABLED`: aus = nur Google-Konto); der Test prüft ihn erst nach dessen Merge.
2. `devLogin` mit neuer E-Mail → Onboarding → zurück zum Turnier (`next=`).
3. Team gründen, Captain tritt dem Turnier bei (`register-team`), Spieler treten über die Teamfunktion bei.
4. **Erwartet:** `register-hint` zeigt den Hinweissatz, **kein Zahlungswort** (Wortscan `zahlungsWorte` auf `main`).
- Nur **ein** echter neuer Nutzer pro Lauf (er ist der Beweis für den Link-Weg); die übrigen Captains kommen per SQL.

### 2.3 Teams werden vollzählig, Anmeldung schließen
1. Captains melden „Team ist vollzählig“ (6 Teams: alle; 16 Teams: mindestens 14, **zwei bleiben unvollzählig**).
2. **Erwartet bei 16 Teams:** beim Veranstalter erscheint „Anmeldung schließen und mit den 14 bereiten Teams starten“ (genau **eine** Hauptaktion im Veranstalterkasten, 44 px). Rückfrage lesen, bestätigen.
3. **Erwartet:** die zwei unvollzähligen Teams sind raus (Benachrichtigung „Euer Team ist nicht dabei“ ohne Namen Dritter), Bracket steht, `tournament_matches` > 0.
4. **Bei 6 Teams:** alle bereit → Bracket entsteht **ohne** Klick auf „Schließen“ und **ohne** zweites „Bereit“.

### 2.4 Spieltag (Handy; erst nach Merge #387)
**Rollen (Stand #387):** „Abpfiff“ und das eingeklappte `manual-result` sehen **nur Veranstalter/Admin ohne Team im Spiel**. Captains behalten das Formular (ScoreDialog): Ergebnis melden, der Gegner-Captain bestätigt.

**A) Veranstalter/Admin:**
1. Spielseite eines Turnierspiels öffnen: **eine** Hauptaktion „Abpfiff“ (`data-testid=end-match`); die Ergebnisfelder liegen **eingeklappt** in `<details data-testid="manual-result">` (zum Eintragen von Hand erst aufklappen).
2. Tore per Recorder, **Abpfiff** → Rückfrage mit großem Spielstand („A 3 : 2 B“) und „endgültig“ → bestätigen. **Erwartet:** Ergebnis sofort endgültig, Sieger rückt weiter.
3. **Unentschieden** im K.-o.-Spiel: Hinweis „Siebenmeterschießen“ (`end-match-draw`); Veranstalter trägt den Sieger ein („Entscheiden“, Runbook 11.1).
4. **Kampflos:** am Bracket unter „Kampflos werten“ (`data-testid=forfeit`) „X gewinnt kampflos (3:0)“ → Rückfrage → **Erwartet:** 3:0, Gegner rückt weiter, Audit-Eintrag.
5. **Fehlerpfad:** Serveraktion erzwingen zu scheitern (Route blockieren, `page.route`) → Meldung bleibt im Dialog sichtbar („Lade die Seite neu und prüfe den Stand…“), nichts verschwindet still.
6. Bis zum Finale weiterspielen (6 Teams: 3 Runden mit Freilosen; 16 Teams: 4 Runden) → **Erwartet:** Turnier „beendet“, Sieger sichtbar.

**B) Captain und Negativfälle:**
1. **Captain-Pfad (a):** Captain A meldet das Ergebnis (Formular), Captain B bestätigt → Ergebnis endgültig, Sieger rückt weiter.
2. **Negativ (b):** der Captain sieht **kein** `end-match` und **kein** `manual-result`.
3. **Negativ (c):** ein Veranstalter, der im Spiel selbst Team-Admin ist, sieht **keinen** Abpfiff (er handelt wie ein Captain).
4. **AC-30 (d):** `.btn-primary` genau **1** je Ansicht, auch in der Captain-Ansicht (Veranstalter ohne aufgeklapptes `manual-result`).

## 3. Prüfpunkte quer über alle Schritte
- **Wortscan** (`zahlungsWorte`, inkl. `title`/`aria-label`) auf jeder besuchten Turnierseite: nirgends Bezahlen/Ampel/Preis/Karte.
- **Handy:** kein horizontales Scrollen (`scrollWidth ≤ clientWidth`), jede Hauptaktion `≥ 44 px` hoch.
- **AC-30:** je Ansicht genau **eine** Hauptaktion (`.btn-primary` zählen, bei Abpfiff-Ansicht: genau 1 ohne aufgeklapptes `manual-result`).
- **Gast-Sicht** (AC-5-Wächter): der Einladungsweg bleibt für Gäste lesbar; Teilnehmerlisten nur für Berechtigte.
- Keine Console-Fehler/Hydration-Warnungen auf den Turnierseiten (Muster `hydration`-Specs).
- Nach dem Lauf: **Aufräumen** der geseedeten Zeilen (Muster `cleanup`) und Zahlungsschalter unverändert.

## 4. Checkliste `is_organizer` (Veranstalter-Rechte)
| Prüfung | Erwartet |
|---|---|
| Nutzer ohne `is_organizer` öffnet `/app/turniere/neu` | Hinweis „nur freigeschaltete Veranstalter“, **kein** Formular |
| Admin schaltet frei (`/admin/nutzer`, „Als Turnier-Veranstalter freischalten“) | `users.is_organizer = true`, Formular erscheint |
| Veranstalter A im Turnier von Veranstalter B: Ergebnis, Abpfiff, Kampflos, Ereignisse | **abgewiesen** („Nur Team-Admins …“), keine Schaltflächen sichtbar |
| Veranstalter im **eigenen** Turnier: Planzeit nur Richtwert (Eintrag vor Anstoß möglich) | erlaubt; **im Team-/Privatspiel** gilt sie weiter (nicht Turnier) |
| Veranstalter entzogen (`is_organizer = false`) | bestehende Turniere bleiben lesbar, **keine** neuen Eingriffe mehr (zu klären: Entzug mitten im Turnier, Entscheid t2q) |
| Captain ohne Veranstalterrecht: „Anmeldung schließen“ | Knopf **nicht** sichtbar, Aufruf per Action abgewiesen |

## 5. Offene Punkte vor dem Bau (Entscheide)
1. **Laufzeit (entschieden, t2q):** zwei Specs, 6 Teams in Shard 4, 16 Teams in einer eigenen Spec-Datei in einem anderen bestehenden Shard (kein 6. Shard). Erwartung 3 bis 5 Minuten je Spec.
2. **Zeitabhängiges:** die 24-h-Erinnerung läuft im Frist-Job (`scheduled.ts`, Funktion `notifyFreeTournamentReminders`), **nicht** als eigener `JOBS`-Eintrag: den Aufrufweg vor dem Bau prüfen; Empfänger ist **nur der Veranstalter**. Uhr nicht verstellen.
3. **Apple-Hinweistext** wird nur geprüft, wenn `APPLE_LOGIN_ENABLED` im Lauf gesetzt ist (zwei Zustände wie bei der Zustand-Matrix: Flag aus = Google-Konto, an = Google- oder Apple-Konto).
4. Der Fall „Veranstalter-Recht entzogen mitten im Turnier“ braucht eine Produktentscheidung (Abschnitt 4, Zeile 5), keine Annahme im Test.
