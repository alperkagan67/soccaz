# 013 – Frontend-Überarbeitung (Richtung E „Trikot“, Seite für Seite)
Status: Entwurf (2026-11-11); Phase 1 (Analyse, Council, dieser Entwurf) vom Nutzer freigegeben; G1 für den Vertrag steht aus
Version: 1

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
| AC-11 | Laufzeit | CI-Dauer | Browser-Tests laufen in unter 10 Minuten (Shards), vor M3 | CI-Lauf, Ausnahme-PR `.github/` |
| AC-12 | Jede Seite | Prüfung gegen die Web Interface Guidelines (sobald der Skill freigegeben ist, Backlog 52) | Jede Seite wird gegen die Web Interface Guidelines geprüft, Funde im PR belegt | PR-Text, Skill `web-design-guidelines` |

## Meilensteine
- M1: Analyse und Umbauplan (nur lesend). Gate: Nutzer-Ja.
- M2: Grundlage: `DESIGN.md` auf Richtung E umschreiben, Tokens, Komponenten-Grundlage (nach ADR 0002), `UserMenu.tsx`-Neubau (natives popover/details, Tastatur- und Fokus-Test per Playwright), PR-Vorlage, schnellere CI.
- M3: Navigation, Startseite, Suche, Lobby (inklusive Lobby-Feld und Meine Spiele aus 007). Gate: Pilot-Test mit Freunden in einer Halle (Stripe-Testkarten), Feedback.
- M4: Team, Profil, Spielerseiten, Ranglisten.
- M5: Turnier, Privatspiel, Zahlen/Karte (012-Oberflächen).
- M6: Hallen, Halle-Dashboard (011), Spieler-Funktionen (010), Rest.
- M7: Admin-Bereich (Desktop zuerst, 009).
- M8: Abnahme: Impeccable polish und audit über alles, Screenshots Gesamtstrecke.

## Betroffene Bereiche
`src/app/**` (62 Seiten), `src/components/**` (34 Komponenten), `src/app/globals.css`, `DESIGN.md`, `docs/design/`, `.github/` (PR-Vorlage, CI), Texte/i18n. Keine Datenbank.

## Risiken und Randfälle
- Dauer (geschätzt 25 bis 40 Task-Tage) und Engpass CI (Browser-Tests ca. 25 Minuten): Browser-Tests vor dem Umbau beschleunigen.
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
- Reihenfolge innerhalb von M3 bis M6 nach den Funden aus M1 (Umbauplan).
- Soll der Pilot-Test eine feste Teilnehmerzahl und Dauer haben? Vorschlag: ein Spiel, 8 bis 10 Spieler, ein Abend.

## End-to-End-Nachweis
`tests/e2e/` Gesamtstrecke je Rolle (Gast: Suche und Lobby ansehen; Spieler: beitreten, Karte hinterlegen; Captain: bereit, Termin; Admin: Spiel ansehen) auf 390 px und 1280 px, grün, mit Screenshots im PR; Pilot-Test nach M3 als Gate.
