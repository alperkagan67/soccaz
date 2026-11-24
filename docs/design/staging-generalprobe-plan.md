# Staging-Generalprobe 30.11. bis 2.12.: Plan (Vorprobe vor dem Go-live)

Stand: 2026-11-24 · Verfasser: worker-2 · Status: **Entwurf**, Auftrag t2q/t2s · Rahmen: Code-Freeze Fr 27.11. abends, Generalprobe 30.11. bis 2.12., **Go/No-Go Mi 2.12. abends**, Go-live Do 3.12./Fr 4.12. (Puffer 5.12.), Turnier Sa 12.12. · Grundlage: `docs/design/go-live-runbook.md`, `pilot-staging-checkliste.md`, `google-anmeldung-anleitung.md`, `apple-anmeldung-anleitung.md`, `anbieter-vorlage.md`.

**Ziel:** Ein **Gratis-Turnier mit 6 Teams** läuft auf einer **echten Kopie** (eigener Server, eigene Adresse) **ohne Zahlungen** komplett durch, bedient vom **Handy**. Danach steht fest: Go oder No-Go für Produktion.

**Kennzeichnung:** **[N]** = Schritt des Nutzers (nur Sie können das: Konten, Zahlungen, Google/Apple-Konsole, Handy). **[P]** = Schritt des Partners/Testperson. **[A]** = Schritt der Agenten (Skripte, Prüfungen, Auswertung, Fehlerbehebung).

## 1. Rollen
| Rolle | Wer | Aufgabe |
|---|---|---|
| Nutzer [N] | Betreiber | Server, Domain, Google/Apple-Konsole, Admin 1, Entscheid Go/No-Go; spielt Captain Team 1 |
| Partner [P] | eine zweite Person | spielt Captain Team 2 und prüft auf einem **anderen Handy** (iPhone oder Android, Gegenstück zum Nutzer) |
| Testkonten [N/P] | **Teams 1 und 2: ECHTE Konten** (Google und Apple: der eigentliche Test); **Teams 3 bis 6: erfundene Konten** per `scripts/staging-seed.mjs` (Entscheid t2q Q1) | Seed siehe Abschnitt 3, Runbook 3a/10a |
| Agenten [A] | Task Manager und Worker | Smoke, Lasttest-Light, Backup/Restore-Probe, Protokoll, Fehler beheben (nur Fehlerbehebungen) |

## 2. Zeitplan
| Tag | Wer | Was |
|---|---|---|
| **vor Mo 30.11. (bis So 29.11.)** | [N] | **Anbieter bestellen** (Anbieter-Vorlage), Server + Domain/Staging-Adresse, Google-Projekt begonnen (Wartezeit!), **Apple Developer Program beantragt** (1 bis 2 Tage Prüfung), Google-/Apple-Testkonten bereit |
| **Mo 30.11. vormittags** | [N] mit [A] | Server einrichten nach Runbook 1 bis 4 (Compose, `.env`, Migration, **beide Zahlungsschalter AUS**, `TURNIER_ONLY=1`, Zugangsschutz), `sh scripts/staging-compose.sh up -d --build`; [A] begleitet per Chat (nie Werte nennen) |
| **Mo 30.11. mittags** | [A] | Smoke `node scripts/smoke.mjs https://<staging> --turnier-only` (mit `SMOKE_BASIC_AUTH`), Startwarnung/Schalter prüfen (Runbook 4, 4a), Befund ins Protokoll |
| **Mo 30.11. nachmittags** | [N] | Google-OAuth-Client fertig, Redirect-URI Staging eintragen, **erster Staging-Login** (Annahme belegen: Zugangsschutz + Google-Rückleitung, **Chrome, Safari, Firefox, iPhone/Android je einmal**), Admin 1 festlegen (Runbook 6) |
| **Di 1.12. vormittags** | [N] [P] | **Gratis-Turnier anlegen und 6 Teams komplett durchspielen auf dem Handy** (Abschnitt 3) |
| **Di 1.12. nachmittags** | [A] | **Lasttest-Light** (Abschnitt 4), Auswertung der Fehler vom Vormittag, Fehlerbehebungen (kleine PRs, Freeze beachten) |
| **Di 1.12. abends** | [A] [N] | **Backup/Restore-Probe** (Abschnitt 5) |
| **Mi 2.12. vormittags** | [N] [P] | Zweiter Durchlauf nach Fehlerbehebungen (verkürzt); **Apple-Test** auf Staging (Abschnitt 6) |
| **Mi 2.12. mittags** | [N] | **Apple-Entscheid** mit Testprotokoll |
| **Mi 2.12. abends** | [N] mit [A] | **Go/No-Go** (Abschnitt 7) |

## 3. Ablauf Gratis-Turnier (Di 1.12.) – auf dem Handy
Voraussetzung: **Zahlungen AUS**, das Turnier hat Preis 0, `TURNIER_ONLY=1`. Auf keiner Seite darf ein Zahlungswort stehen.
0. [N] **Einmalig beim Staging-Aufbau: Umgebungsmarke setzen** (Runbook 3a, `settings.environment = "staging"`), sonst verweigert der Seed. [A] prüft: Abfrage zeigt genau eine Zeile.
1. [N] Veranstalter anlegen (Admin: „Als Turnier-Veranstalter freischalten“), Turnier **ohne Preis** anlegen, Teamlimit 16, **6 Teams**, Termin, Name.
2. [N] [P] **Teams 1 und 2** (echte Konten, je 4 bis 6 Spieler) legen Teams an, Mitglieder treten per Einladungslink bei, beide Teams melden sich zum Turnier an. [N] **Teams 3 bis 6:** `staging-seed.mjs --turnier <id>` (Runbook 10a): erfundene Konten `@staging.invalid`, nie zustellbar, vier Teams angemeldet, „vollzählig“ und „Bereit“ gesetzt (**Reihenfolge: erst seeden, danach melden die echten Teams 1 und 2 „vollzählig“**; das letzte „vollzählig“ löst das Bracket aus, Runbook 10a) (Annahme: Ablauf danach bis zum Bracket bei der Probe belegen).
3. Kader füllen, „vollzählig“ melden, „Bereit“ melden; Bracket erscheint (Sichtprüfung: nirgends Preis, Karte, Bezahlen).
4. [N] [P] Ergebnisse melden (Captains), Bracket schreitet fort, Finale, Abschluss, Turnierseite für **Gast** (ohne Anmeldung) prüfen.
5. Zusätzlich auf dem Handy: Anmelden (Google), Abmelden, Hilfe, Impressum/Datenschutz, **gesperrte Bereiche** (`/spiele`, `/suche`, `/hallen` …): „Kommt bald“; Installation als Startbildschirm-App (falls vorgesehen).
6. [A] Skript `node scripts/smoke-turnier-only.mjs` (Sperrpfade; auf Staging mit Zugangsschutz nur der Browser-Teil) und Wortscan der Seiten (Wortliste `src/lib/zahlungen-aus.ts`) als **Abnahme der Textfreiheit**.
Jede Auffälligkeit: Datum, Gerät, Seite, Screenshot ohne Personendaten ins **Testprotokoll** (Abschnitt 8).

## 4. Lasttest-Light (Di 1.12. nachmittags, [A])
Ziel ist **nicht** Belastbarkeit bis zum Äußersten, sondern: trägt der Server **100 Spieler** (Turnier: bis 16 Teams, ca. 100 Spieler)? Das Skript **`scripts/last-light.mjs` ist gebaut** (#388, Erklärung und Rechnung: `docs/design/groesse-turnier-12-12.md`): nur **lesende** GET-Anfragen auf öffentliche Seiten (Start, Turniere, Hilfe, Teams, Anmelden, Impressum), keine Anmeldung, **verweigert die Produktion** ohne `--produktion-bestaetigt` (nicht benutzen), höchstens 100 Verbindungen, bricht bei über 20 % Fehlern ab. Auf **Staging mit der Servergröße der Produktion**, ein Lauf nach dem anderen, Zugangsschutz über `SMOKE_BASIC_AUTH` in der eigenen Shell:
```
node scripts/last-light.mjs https://<Staging-Adresse> --gleichzeitig 20 --anfragen 300
node scripts/last-light.mjs https://<Staging-Adresse> --gleichzeitig 60 --anfragen 1000
```
Erwartet: Bericht mit Antwortzeiten (p50, p95, max), Fehlerrate und Status je Gruppe, am Ende `ERGEBNIS: IM RAHMEN`, Ende-Code 0. **Schwellen für „im Rahmen“** (Quelle: `groesse-turnier-12-12.md` Abschnitt 4, dort steht auch die Erklärung): **vom Skript gemessen:** p95 unter 1,5 s bei 60 gleichzeitig, Fehlerrate unter 1 %, kein Abbruch; **manuell beobachtet mit `docker stats` auf dem Server während des Laufs** (das Skript misst sie **nicht**): CPU des App-Containers unter 80 %, Speicher unter 60 % des Servers. **Liegen die Werte darüber:** erst eine Servergröße hoch, dann erneut messen; bleibt es danach darüber: **No-Go** (Kriterium 6). Hinweise: ein 3xx zählt im Skript als „ok“ (viele 301/302 in der Statuszeile = Adresse prüfen); bei lauter 401 fehlt `SMOKE_BASIC_AUTH`. Die **Live-Verbindungen** eines Spiels (`--sse`) prüft der dritte Lauf der Größen-Doku; er braucht eine Anmeldung von Hand und ist **optional**. Die Messung erfasst nur öffentliche Seiten, **nicht** die angemeldeten Spielseiten: der Puffer in der Empfehlung (Servergröße 4 vCPU/8 GB für den Turnierzeitraum) bleibt dafür bestehen.

## 5. Backup/Restore-Probe (Di 1.12. abends)
1. [A]/[N] `docker compose exec backup sh /backup-loop.sh once`, Erwartet: `socaz-<zeit>.sql.gz` und `.manifest.json`.
2. [A] Wiederherstellung auf einem **lokalen Rechner mit Postgres**: `node scripts/restore-test.mjs backups/socaz-<zeit>.sql.gz` (Runbook 7), Erwartet: Prüfungen `PASS`, Zeilenzahlen gegen das Manifest.
3. [N] Anbieter-Backup (Server-Backup) einschalten und **eine** Wiederherstellung beim Anbieter in einen **neuen** Server probieren (nur, wenn der Anbieter es kostenlos erlaubt; sonst als offenes Risiko ins Protokoll).

## 6. Apple-Test und Entscheid (Mi 2.12.)
Voraussetzung: Apple Developer Program aktiv, Services ID, Schlüssel, Client Secret (`apple-anmeldung-anleitung.md`), `APPLE_LOGIN_ENABLED=1` **nur auf Staging**.
- [N] [P] Je Handy: „Mit Apple anmelden“ **einmal mit Mail teilen, einmal mit Private Relay**, danach erneut anmelden (zweiter Login: Name fehlt, Konto bleibt), Abmelden. [A] Smoke mit `--apple`.
- **Entscheid Mi 2.12. mittags (Testprotokoll):** alle genannten Fälle ohne Fehler → Apple an **mit** dem Go-live. **Sonst gilt die Rückfallregel: Apple wird bis Mi 2.12. nicht getestet oder fehlerhaft = Produktion nur mit Google** (`APPLE_LOGIN_ENABLED` nicht setzen, nichts bricht). Der Entscheid steht mit Datum im Protokoll.

## 7. Abnahmekriterien: Go/No-Go (Mi 2.12. abends)
| # | Kriterium (alle **Go**, sonst **No-Go** oder bewusst benannte Ausnahme) | Wer | Beleg |
|---|---|---|---|
| 1 | Smoke (`smoke.mjs --turnier-only`) und `smoke-turnier-only.mjs` grün auf Staging | [A] | Ausgabe im Protokoll |
| 2 | Beide Zahlungsschalter AUS, `PAYMENTS_FAKE` nicht gesetzt, Startwarnung `TURNIER_ONLY` fehlt | [A] | Runbook 3, 4, 4a |
| 3 | Gratis-Turnier mit 6 Teams komplett durchgespielt (Gast, Captain, Veranstalter), **kein Zahlungswort** | [N] [P] | Protokoll, Screenshots |
| 4 | Bedienung auf **iPhone und Android** ohne blockierenden Fehler | [N] [P] | Protokoll |
| 5 | Google-Anmeldung auf Staging in Chrome/Safari/Firefox ohne zweite Passwortabfrage | [N] | Protokoll |
| 6 | Lasttest-Light „im Rahmen“ (Abschnitt 4: Skript: p95 unter 1,5 s bei 60 gleichzeitig, Fehlerrate unter 1 %, kein Abbruch; manuell mit `docker stats`: CPU unter 80 %, Speicher unter 60 %; sonst eine Größe hoch und erneut messen) | [A] | Bericht des Skripts, Notiz der `docker stats`-Werte |
| 7 | Restore-Probe `PASS`, Server-Backup eingeschaltet | [A] [N] | Ausgabe |
| 8 | Apple: getestet und OK **oder** Rückfall „nur Google“ ausdrücklich entschieden | [N] | Protokoll mit Datum |
| 9 | Keine offenen Fehler der Stufe „blockiert“; offene kleine Fehler mit Entscheid (später beheben) | [A] [N] | Fehlerliste |
| 10 | Rechtstexte: Impressum/Datenschutz ohne Platzhalter erreichbar (Entwürfe, Anwaltsprüfung steht aus: **bewusste Ausnahme** oder erledigt) | [N] | Nutzerliste |

## 8. Testprotokoll
Eine Datei (nicht im Repository, keine Personendaten, keine Schlüssel): je Zeile Datum/Uhrzeit, Gerät + Browser, Schritt (Nummer aus diesem Plan), Ergebnis, Fehlertext/Screenshot. [A] führt sie, [N] und [P] melden per Chat nur Schritt und Ergebnis.

## 9. Offene Fragen an den Nutzer/t2q
1. **Q1 ENTSCHIEDEN (t2q):** Teams 1 und 2 echte Konten (Google und Apple), Teams 3 bis 6 per Staging-Seed mit eigener harter Sperre (Umgebungsmarke, nicht Produktion, ausdrückliche Bestätigung); `seed-guard`/`db-guard` bleiben unberührt. Die Ausnahme vom Grundsatz „keine SQL-Schreibzugriffe“ gilt nur für dieses Skript auf Staging.
2. **Q2 Partner:** Wer ist die zweite Person, die Handy und Captain-Rolle übernimmt (Zeit Mo bis Mi)?
3. **Q3 Server:** Zwei Server (Produktion und Staging) oder Staging nach der Probe wieder löschen (Anbieter-Vorlage)?
4. **Q4 Lasttest-Skript: erledigt** (`scripts/last-light.mjs` gebaut und gemergt, #388; Abschnitt 4).
