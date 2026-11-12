# 013 – Frontend-Überarbeitung (Richtung E „Trikot“, Seite für Seite)
Status: Freigegeben (G1 2026-11-11, durch den Nutzer, mit vier Bedingungen: AC-13 bis AC-15 und die entschiedenen Produktfragen)
Version: 2

## Ziel
Das gesamte Frontend wird überarbeitet, weil der Nutzer Bedienung und Aufbau als „katastrophal“ und „noch fast wie die Vorlage“ beurteilt. Ergebnis: klare Wege, verständliche Texte, gute Bedienung auf dem Handy, ein eigener Look nach `DESIGN.md` (Richtung E „Trikot“) und kein KI-Einheitsaussehen. Vertrag 007 (Navigation, Begriffe, Teamfarbe, Lobby-Feld) bleibt gültig; 013 fasst dessen offene Oberflächenstufen (Meine Spiele, Lobby-Feld) ein und erweitert sie auf alle Seiten (62 Seiten, davon 16 im Admin-Bereich, 34 Komponenten).

## Nutzer und Rollen
Gast, Spieler, Captain, Veranstalter, Hallenbetreiber (011), Admin 1, Admin 2. Geräte: Handy 390 px und Desktop 1280 px.

## Entscheidungen (vom Nutzer, 2026-11-11)
- Phase 1 freigegeben: Analyse (nur lesend), Council zu shadcn/ui (ADR 0002), dieser Vertragsentwurf.
- Ablauf: Erst Analyse aller Seiten als Gast, Spieler, Captain und Admin auf Handy und Desktop, dann Umbauplan an den Nutzer; nach seinem Ja Seite für Seite, jeder PR mit Screenshots vorher/nachher.
- Admin zuletzt (Stufe M7, Desktop zuerst). URLs bleiben unverändert (keine neue Seitenstruktur). Hell/Dunkel nach Systemeinstellung (schon 007).
- Impeccable-Durchlauf über das ganze Frontend: critique, audit, distill (Unnötiges weg), clarify (verständliche Wege), adapt (Handy), polish. Playwright für echte Screenshots.
- Kein shadcn; nativ plus eigene Bausteine (ADR 0002); das Aussehen kommt komplett aus `DESIGN.md` und Impeccable, keine Standardoptik.
- Pilot-Test nach M3: mit Freunden in einer Halle und Stripe-Testkarten, ohne Go-live; der Umbau der übrigen Seiten (M4 bis M7) startet erst nach dem Feedback aus dem Pilot.
- Reihenfolge: Browser-Tests beschleunigen (Ziel unter 10 Minuten) vor dem großen Umbau (nach M1/M2). Die Arbeit an 012 Stufe 3/4 und der Zahlungstest laufen parallel weiter. Offene Oberflächen (012-UI, 009, 011, 010) werden erst auf der Grundlage aus M2 gebaut.

## Freigabe G1 (2026-11-11) und Produktentscheide
Der Nutzer hat G1 für diesen Vertrag erteilt, mit diesen Bedingungen und Entscheiden:
- Look-Abnahme nach M2 (Gate M2b, AC-13), Guthaben vor dem Pilot-Test überall weg (AC-14), alle sechs Impeccable-Befehle einzeln auf jeder Seite und Rolle (AC-15).
- Admin am Handy: nur Übersicht, Moderation, Nutzer sperren, Protokoll lesen; alles andere am Desktop mit Hinweis.
- Namen, Elo und Position sehen nur angemeldete Nutzer; Gäste sehen Zahlen und Initialen (Sichtbarkeitsmatrix Rolle × Datenfeld).
- Unter 16: Rückfrage vor dem Löschen, die Endseite erklärt, was passiert. Die Wiederanmeldungsregel ist eine Rechtsfrage (Anwalt, GO-LIVE-AUDIT G16-013).
- Der Hallenbetreiber bewertet die eigene Halle NICHT.
- Overlay für nicht öffentliche Spiele: leere, transparente Antwort statt Fehlerseite; die Streamer-Anleitung steht beim Veranstalter.
- Ligen, Profitag und Stadt-Challenge sind ZURÜCKGESTELLT und AUSGEBLENDET (nicht verlinken, Stadt-Challenge auf `/rangliste` ausblenden), aber NICHT GELÖSCHT (die Firmenliga aus 014 kann darauf aufbauen).
- Degradiertes oder Blockiertes (Klassifizierer, Impeccable, Playwright) geht sofort als `NEEDS-USER`, spätestens nach 15 Minuten.

### Sichtbarkeitsmatrix Rolle × Datenfeld (Produktfrage 3, vom Nutzer bestätigt; Eintrag 2026-11-12)
Eine Regel für Lobby, Spielsuche und Kader. Zwei Begriffe von „Gast“ (Entscheid t9): Für Namen, Elo und Position heißt Gast „nicht angemeldet“; für den Zahlstatus je Person heißt Gast „keine Teilnahme am Spiel“. Stand der Tabelle: **Soll**; wo die Zelle auf `origin/main` (114ddcc) noch nicht gilt, steht „Soll ab M2b“ (Code auf `feat/m2b-look`, noch nicht gemergt). Die Entscheidung fällt auf dem Server; der Browser bekommt nie den Rohstatus oder den Fehlercode. Code: `src/lib/card-visibility.ts` (`audienceFor`, `canSeeAnyStatus`), `src/app/lobby/[id]/page.tsx`.

| Datenfeld | Gast (nicht angemeldet) | Angemeldet, keine Teilnahme | Mitspieler | Betroffener (der eigene Platz) | Captain/Veranstalter/Admin des Teams, Plattform-Admin |
|---|---|---|---|---|---|
| Plätze und Bereitschaft als Zahlen („3 von 6 Plätzen“, „2 von 4 bereit“) | ja | ja | ja | ja | ja |
| Initialen statt Name | ja (nur das) | nein, Namen | nein, Namen | nein, Namen | nein, Namen |
| Name, Elo, Position je Person | nein | ja | ja | ja | ja |
| Team-Elo und Team-Spielstärke (nicht pro Person; `lobby/[id]/page.tsx:410`, Kopfzeile der Teamkarte) | ja | ja | ja | ja | ja |
| Kartenstatus je Person | nichts | nichts | nur neutral: „Zahlung ausstehend“ (deckt „fehlgeschlagen“ und „keine Karte“ ab) oder „gedeckt“ bzw. „Karte hinterlegt“; nie der Grund | echter Status; bei gültiger Übernahme `card_ready` mit „gedeckt“ (`card-visibility.ts:22`) | echter Status (Captain sieht bei Übernahme den echten Status) |
| Fehlerzustand „Abbuchung fehlgeschlagen“ mit Grund und Weg „Karte ändern“ | nein | nein | nein (nur „Zahlung ausstehend“) | ja | ja (je betroffene Person mit Grund) |
| Bereit-Badge je Person (**Soll ab M2b**: „Bereit“, „Noch nicht bereit“; „Bereit, Zahlung offen“ nur wo der echte Status sichtbar ist). Stand main: im Kartenmodus nur die Ampel `CardLight` aus `cardDisplays` (für Gast und Nichtteilnehmer `null`); der Altmodus zeigt über `canSeeLights` die `PlayerLight` mit „Bereit“ / „Bereit und bezahlt“ | nein | nein | ja (ohne „Zahlung offen“) | ja | ja |
| Ampel-Legende | nein | nein | ja | ja | ja |
| Eintrag „Abbuchung fehlgeschlagen“ in der Legende (**Soll ab M2b**; auf main zeigt `CardLightLegend` immer dieselben `CARD_LEGEND`-Einträge) | nein | nein | nein | ja, wenn der eigene Platz betroffen ist | ja, wenn es einen betroffenen Platz gibt |

Regeln dazu:
- Soll ab M2b: Der Bereit-Badge hängt an `canSeeLights` (`canSeeAnyStatus`): angemeldet und (Teilnahme oder Plattform-Admin oder Admin eines der Teams). Gäste und Fremde sehen ihn nie. Ist-Stand main: `canSeeLights` schaltet nur die `PlayerLight` des Altmodus; im Kartenmodus entscheidet allein `cardDisplays` (für Gast und Nichtteilnehmer `null`).
- Kartenstatus: Dritte sehen nie den Grund; bei „gedeckt“ ist die Folge, dass Dritte erkennen, dass der Platz keine eigene Karte hatte, bewusst angenommen (`begriffe.md` Entscheid 11).
- Soll ab M2b: Die Legende nennt „Abbuchung fehlgeschlagen“ nur, wenn der Betrachter diesen Zustand an einer Zeile sehen darf.
- Prüfung: Tests je Rolle auf Seite und Live-Kanal (SSE) und RSC-Nutzlast, nicht nur auf das sichtbare HTML (012 AC-12/AC-20).

### Entscheide zu AC-5-Konflikten (Auftrag t1d, 2026-11-12)
AC-5 („Keine URL und keine Test-ID geändert, alle bisherigen E2E grün“) gilt weiter; Texte, die ein bestehender Test per Namen bindet, ändern sich deshalb nur zusammen mit dem Test. Daraus folgt für M2b:
- „Ja, mein Team ist komplett: Spiel bestätigen“ (`payments.spec.ts:284,286`, `privatspiel.spec.ts:395`, `uebersicht.spec.ts:41,46`), „Karte ändern“ (`karte-privatsphaere.spec.ts:229`, `card-fail-notify.test.ts:70`) und „Anmelden und beitreten“ (`team-invite.spec.ts:33`) bleiben bis M3 unverändert. Die Wortwahl-Umstellung geschieht zusammen mit den Tests in M3.
- Das Duplikat „Lobby aufmachen“ im Schnellzugriff von `/app` entfällt mit `AppNav` (M3); bis dahin bleibt es, weil `basics.spec.ts:38-39` es für neue Nutzer prüft (Backlog 76).

## Annahmen (Orchestrator-Vorschlag)
- `DESIGN.md` wird in M2 komplett auf Richtung E umgeschrieben (Frontmatter, Tokens, Beispiele); der Ist-Stand-Teil entfällt.
- Teststrategie: bestehende `data-testid` und URLs bleiben; neue Elemente bekommen Test-IDs nach vorhandenem Muster.
- Belege (Screenshots) liegen als PR-Anhang oder CI-Artefakt, nicht im Repo; im Repo nur Fundlisten und Pläne (`docs/design/`).
- Impeccable-Läufe nutzen nach Möglichkeit Sub-Agents statt „degradiert“; ein degradierter Lauf wird im PR vermerkt (Zeile „Degradiert: ja/nein, Grund“).
- Barrierefreiheit: Kontrast mindestens 4,5:1 (Text) und 3:1 (Zeichen), Touch-Ziele mindestens 44 px, vollständige Tastaturbedienung, sichtbarer Fokus, Reduced-Motion.
- Dateien mit gemeinsamer Nutzung (`globals.css`, `layout.tsx`, Header, BottomNav) werden seriell geändert.

## Nicht-Ziele
- Neue Funktionen, Geldlogik, Datenbank (außer wenn eine Oberflächenstufe es zwingend braucht, dann eigener Vertragsnachtrag).
- Neue Seitenstruktur oder neue URLs.
- Neue Sprachen; vorhandene Übersetzungen werden mitgepflegt.
- Mobile App, Logo-Änderung.

## Akzeptanzkriterien (gelten je Meilenstein; PR ohne Beleg wird nicht gemergt)
| ID | Gegeben | Wenn | Dann | Check |
|---|---|---|---|---|
| AC-1 | Jeder UI-PR | PR-Text | Abschnitte „Vertragskriterien (AC → Beleg)“, „Impeccable-Befehle + Fundliste“, „Screenshots vorher/nachher (Handy 390 px und Desktop)“, „Skills/Subagents benutzt“, „Degradiert: ja/nein, Grund“ und als 6. Pflichtabschnitt „Vorgaben: erfüllt/nicht (Liste)“ ausgefüllt | PR-Vorlage + CI-Check der Überschriften |
| AC-2 | Meilenstein M1 | Analyse fertig | Fundliste P0/P1/P2 je Seitengruppe, Matrix Rolle × Gerät vollständig, Umbauplan mit Reihenfolge und Aufwand liegt dem Nutzer vor; Analyse-Gate je Seitengruppe (X, Y1, Y2, Admin): „Zähler angesehen N von N + 5 Analyse-Befehle (critique, audit, distill, clarify, adapt) je Seitengruppe + Liste MUSS WEG“ (polish gehört erst zum Umbau, AC-6); Gate: Nutzer-Ja | docs/design/analyse-frontend-*.md |
| AC-3 | Alle umgebauten Seiten | Kontraste und Touch-Ziele geprüft | Text ≥ 4,5:1, Zeichen ≥ 3:1, Touch ≥ 44 px, kein horizontales Scrollen auf 390 px | tests/e2e/ui-regeln.spec.ts, Impeccable audit |
| AC-4 | Alle umgebauten Seiten | Tastaturbedienung | Alle Funktionen per Tastatur erreichbar, Fokus sichtbar, sinnvolle Reihenfolge | tests/e2e/a11y.spec.ts |
| AC-5 | Alle Seiten | Bestehende Tests laufen | Keine URL und keine Test-ID geändert, alle bisherigen E2E grün | tests/e2e/* |
| AC-6 | Jede Seite und jede Rolle (Umbau) | Impeccable critique, audit, distill, clarify, adapt, polish | Jeder der sechs Befehle (die fünf Analyse-Befehle aus AC-2 plus polish) läuft auf JEDER Seite und Rolle als eigener Durchgang und wird im PR einzeln genannt; Funde P0/P1 behoben oder begründet vertagt, im PR belegt | PR-Text |
| AC-7 | Text auf allen Seiten | Prüfung | Verständliche Begriffe (Offene Lobbys, Spiel mit festem Termin suchen u. a.), keine Fachwörter ohne Erklärung, jeder Weg hat eine klare nächste Handlung | Impeccable clarify, Nutzer-Abnahme |
| AC-8 | Nach M3 | Pilot-Test | Pilot mit Freunden in einer Halle mit Stripe-Testkarten durchgeführt, Feedback liegt vor; M4 bis M7 starten erst danach | Gate durch den Nutzer |
| AC-9 | Komponenten-Grundlage (M2) | ADR 0002 (akzeptiert) | Technik laut ADR 0002: nativ plus eigene Bausteine, kein shadcn/Radix; Radix nur bei echtem Bedarf (mehr als 4 Overlay-Komponenten oder A11y-Beanstandung) nach Vorschlag an den Nutzer; Fremdcode mit Version/Commit festgehalten, Dateien gelesen, kein MCP/Skill dazu (gilt nur für die Komponenten-Grundlage; AC-12 nutzt den Skill aus Backlog 52) | ADR 0002, security-reviewer |
| AC-10 | Hell und dunkel | Systemeinstellung wechselt | Beide Varianten lesbar, keine Farbe außerhalb der Tokens | Screenshots, Impeccable audit |
| AC-11 | Laufzeit | CI-Dauer | Browser-Tests laufen in unter 10 Minuten (Shards), vor M2 (Umbauplan) | CI-Lauf, Ausnahme-PR `.github/` |
| AC-12 | Jede Seite | Prüfung gegen die Web Interface Guidelines (sobald der Skill freigegeben ist, Backlog 52) | Jede Seite wird gegen die Web Interface Guidelines geprüft, Funde im PR belegt | PR-Text, Skill `web-design-guidelines` |
| AC-13 | M2 fertig (Gate M2b, Look-Abnahme) | Start und Lobby sind komplett im neuen Look | Screenshots von Start und Lobby auf Handy 390 px und Desktop 1280 px, jeweils hell UND dunkel (4 Varianten je Seite), gehen als `NEEDS-USER` an den Nutzer; erst nach seinem „Ja“ geht M3 in die Breite | Screenshots als PR-Anhang, Gate durch den Nutzer |
| AC-14 | Vor dem Pilot-Test | Ein Spieler nutzt die Plattform | Kein Spieler sieht Guthaben: Rabattcode-Feld, `/app/guthaben`, Guthaben in Kopfleiste und Konto-Menü sowie alle Guthaben-Texte (Listen MUSS WEG X, Y1, Y2 aus der Analyse) sind vor dem Start von M3 weg. 012 M6 wird geteilt: M6a (Oberfläche und Texte, vor M3), M6b (Code, Schema, Tests entfernen, danach). Voraussetzung für M6a ist 012 M5 (Turnier auf Karte). Bindende Reihenfolge (Nutzerbedingung 2, t9, 2026-11-11): M2 (M2-1 bis M2-5) → M2b (Look-Abnahme Start/Lobby; Guthaben in M2b nur in Start-/Lobby-Texten und der `/app`-Karte, wie in Backlog 63; Lobby-Abnahme im Kartenmodus (`card_payments_enabled = true`), der Altpfad mit Guthaben-Texten entfällt mit M6a/M6b (t9, Lesart a)) → 012 M3b bis M5 → 012 M6a → 013 M3 → Pilot-Test → M4 bis M8; M3 beginnt erst, wenn 012 M5 gemergt und M6a durch ist | Suche in `src/` und E2E: keine Guthaben-Texte und Wege für Spieler, Backlog 58 |
| AC-15 | Jede Seite und jede Rolle | Impeccable | Alle SECHS Befehle (critique, audit, distill, clarify, adapt, polish) laufen EINZELN auf jeder Seite und Rolle, nicht gebündelt, und werden im PR einzeln genannt; Degradiertes oder Blockiertes ist sofort `NEEDS-USER` (spätestens nach 15 Minuten) | PR-Text (Abschnitte aus AC-1) |

## Meilensteine
- M1: Analyse und Umbauplan (nur lesend). Gate: Nutzer-Ja.
- M2 (6 bis 8 Task-Tage), danach Gate M2b (Look-Abnahme, AC-13; in M2b wird Guthaben nur in den Start- und Lobby-Texten und der `/app`-Karte entfernt, Kopfleiste, Konto-Menü und `/app/guthaben` bleiben bis 012 M6a): Grundlage: `DESIGN.md` auf Richtung E umschreiben, Tokens (Typo-Skala, Status, Fokus), Basiskomponenten nach ADR 0002 (`Button`, `PageShell`, `PageHeader`/`PageTitle`/Skip-Link, `StateMessage`, `StatusBadge`, `ConfirmDialog`, `Form`, `DateTimeField`), `format.ts`, Begriffsverzeichnis (`docs/design/begriffe.md`: Findet statt / Preis steht fest / Ergebnis bestätigt), `UserMenu.tsx`-Neubau (natives popover/details, Tastatur- und Fokus-Test per Playwright), Lint- und UI-Regel-Tests, erweiterter Kontrasttest, PR-Vorlage. Voraussetzung: schnellere CI (Backlog 49).
- M3 (8 bis 10 Task-Tage): Navigation und Einstieg: `AppNav`, Start, Spiel suchen, Meine Spiele (`/app`), Lobby (Dein Stand, Hauptaktion, Captain-Leiste, Fehlerzustand mit Grund und Nachzahl-Weg aus 012 M3b), Neuling/Einladung/Onboarding, Turnierliste, UI-Texte (`lobby/[id]/page.tsx:238`: „Findet statt, sobald in beiden Teams mindestens 4 bereit sind“; `FinalConfirm.tsx:8-14`: „Preis steht fest, sobald beide Captains bestätigen“ statt „Letzte Bestätigung“; `mygame.ts:60`: „Findet statt (Preis folgt)“; Benachrichtigung `match.confirmed` (`lobby.ts` ca. 247, Mail/Push): „Spiel bestätigt“ wird „Spiel findet statt“). M3 beginnt erst, wenn 012 M5 gemergt und 012 M6a durch ist; dann ist Guthaben in Oberfläche und Texten weg (AC-14). Gate: Pilot-Test mit Freunden in einer Halle (Stripe-Testkarten), Feedback.
- M4 (5 bis 7 Task-Tage): Team, Profil, Spielersuche, Ranglisten, Benachrichtigungen, Konto und Einstellungen, Spielsuche für Gäste.
- M5 (5 bis 6 Task-Tage): Turnier-Detail, Privatspiel anlegen, Zahlen/Karte erneuern (012-Oberflächen), Spiel und Ergebnis.
- M6 (4 bis 6 Task-Tage): Hallen (öffentlich), `/halle` für Betreiber (011), Spieler-Funktionen (010), Overlay, Hilfe, Rechtliches, Fußzeile; Ligen, Profitag und Stadt-Challenge sind zurückgestellt und ausgeblendet, nicht gelöscht (Entscheid 2026-11-11, Backlog 59).
- M7 (5 bis 7 Task-Tage): Admin-Bereich (Desktop zuerst, Rollen nach 009); am Handy nur Übersicht, Moderation, Nutzer sperren, Protokoll lesen.
- M8 (3 bis 4 Task-Tage): Abnahme: Impeccable polish und audit über alles, Screenshots Gesamtstrecke.
- Aufwand gesamt: 36 bis 48 Task-Tage (Summe der Stufen M2 bis M8; ohne 012 M3b bis M5 und M6a, die jetzt vor M3 liegen: Zeit nicht im 013-Aufwand); Gestaltung, Muster und Reihenfolge: `docs/design/umbauplan-013.md`.

## Betroffene Bereiche
`src/app/**` (62 Seiten), `src/components/**` (34 Komponenten), `src/app/globals.css`, `DESIGN.md`, `docs/design/`, `.github/` (PR-Vorlage, CI), Texte/i18n. Keine Datenbank.

## Risiken und Randfälle
- Dauer (geschätzt 36 bis 48 Task-Tage, siehe `docs/design/umbauplan-013.md`) und Engpass CI (Browser-Tests ca. 25 Minuten): Browser-Tests vor dem Umbau beschleunigen.
- Doppelbau mit 009/010/011 und 012-Oberflächen: sie warten auf die Grundlage aus M2.
- Regression durch Umbau: E2E-Tests als Netz, Test-IDs und URLs fest.
- Einheitsoptik durch Standardkomponenten: kein shadcn, nativ plus eigene Bausteine (ADR 0002), Aussehen aus Tokens; Prüfung in der Abnahme.
- Impeccable-Läufe, die „degradiert“ oder blockiert sind: sofort `NEEDS-USER` (spätestens nach 15 Minuten).
- Gemeinsame Dateien (Layout, `globals.css`, Header): seriell ändern.
- Stripe-Elements, CSP und neue Komponenten: CSP-Regeln beachten (`next.config`/Header).

## Datenschutz / Sicherheit
Keine neuen Daten. Neue Abhängigkeiten (falls Radix, ADR 0002): security-reviewer Pflicht, Version/Commit festhalten, Lockfile-Diff lesen. Screenshots dürfen keine echten personenbezogenen Daten enthalten (Seeds/Testdaten).

## Offene Fragen
- Entschieden: ADR 0002 ist akzeptiert (Option B+: nativ plus eigene Bausteine, kein shadcn).
- Reihenfolge innerhalb von M3 bis M6: festgelegt im Umbauplan (`docs/design/umbauplan-013.md`), Gate G1 beim Nutzer.
- Soll der Pilot-Test eine feste Teilnehmerzahl und Dauer haben? Vorschlag: ein Spiel, 8 bis 10 Spieler, ein Abend.
- Erledigt mit G1 (2026-11-11): Produktfragen sind entschieden (siehe Abschnitt „Freigabe G1“); neu sind AC-13 bis AC-15.
- Hinweis für G1: Gegenüber Entwurf 1: AC-11 geändert (Browser-Tests unter 10 Minuten jetzt vor M2 statt vor M3), AC-13 bis AC-15 neu (G1). Die Shards bleiben Voraussetzung: die Anhebung der Zeitgrenze (PR 95) allein ergibt noch 26 Minuten.

## End-to-End-Nachweis
`tests/e2e/` Gesamtstrecke je Rolle (Gast: Suche und Lobby ansehen; Spieler: beitreten, Karte hinterlegen; Captain: bereit, Termin; Admin: Spiel ansehen) auf 390 px und 1280 px, grün, mit Screenshots im PR; Pilot-Test nach M3 als Gate.
