# Impeccable-Engine-Lauf M3, Lauf 2 (Lobby-Zustände und geänderte Seiten)

Stand: 2026-11-24 · Code-Stand `origin/main` 4d2218a (inkl. 5a #302, 5b #310, #306, #309) · Verfasser: worker-2 · Auftrag: t2s/t2q · Folgt auf [Lauf 1](impeccable-lauf-m3.md) (worker-4)

Zweck: Lobby-Zustände aus 5a/5b, `/app`, `/suche`, `/turniere`, `/`, `/willkommen` und `/einladung/<token>` messen und bewerten. Ergebnis: **keine P0, vier P1, zwölf P2**. Die P1 aus Lauf 1 zu Hauptaktionen und Fehlerzustand sind eingelöst; offen bleiben der Knopf-Innenabstand, Karte in Karte und neu die Lage der Hauptaktion in der Lobby.

## Methode und Grenzen

- Engine 0.1.19, Skill 4.8.1. Ein Dev-Server (3105, node-direkt, `PAYMENTS_FAKE=1`, Kartenmodell an), ein Chromium mit DevTools-Port 9222, strikt nacheinander, danach beendet (Port und Chromium frei geprüft). Vorher bei w1, w3 und w4 erfragt: kein Server und kein Chromium (w1 meldete einen leerlaufenden Server auf 3101, bei meiner Prüfung nicht erreichbar).
- **Assessment B (Engine):** `impeccable detect --cdp 9222 --target imp=<Ansicht> --json` je Ansicht und Breite: 29 Ansichten x 2 Breiten = 58 Scans. Rohdaten (JSON, Screenshots) liegen im Scratchpad der Sitzung, nicht im Repo. **Audit-Teil:** eine Messung im Browser (Zielgrößen unter 44 px, `text-xs`, Eingaben ohne Beschriftung, Überlauf, Anzahl `main .btn-primary`), **kein** axe oder Lighthouse; Kontrast und Tastatur sind durch AC-27 und die E2E-Läufe gedeckt, hier nicht erneut gemessen.
- **Assessment A (critique):** von mir von Hand an Vollseiten-Screenshots (390 px: Freigabe, Letzte Bestätigung, Planung, Betreiber, Herausforderung, `/app`, `/app` ohne Team, Einladung); die übrigen Zustände nur über Engine und DOM-Messung. Ich bin nicht Besitzer dieser Seiten (Lobby 5a/5b: w3, `/app`: w4), die Bewertung ist also unabhängiger als in Lauf 1, aber nicht von einem getrennten Sub-Agenten.
- Nur dunkles Schema; hell nicht gescannt (keine Auffälligkeit im dunklen Lauf, die hell erwarten ließe). Vollseiten-Screenshots zeigen feste Leisten (BottomNav) mitten im Bild: Artefakt der Aufnahme, kein Fehler. Das runde „N“ ist die Dev-Anzeige.
- **Seeds:** Wegwerf-Skripte im Scratchpad über die E2E-Helfer (`seedWorld`, `seedUser`, `addParticipant`, `addTeamMember`) und SQL, nur Datenbank `soccaz_w2`, nur `@test.local`-Konten, danach mit `cleanupTestData` entfernt (0 Testnutzer übrig), Plattform-Schalter zurückgesetzt. Die Daten sind künstlich: Namen sind lang, `/app` zeigt durch das Seeding 13 Spiele.
- **Lücken (nicht erfasst):** Hell; Lobby in der Veto- und Terminphase (Hallen bannen), Lobby „bestätigt“ (Schritt 4), Privatspiel, Anteil übernehmen, abgesagtes Spiel; `/turniere` nur gemessen, nicht neu bewertet (Leerzustand, Lauf 1 P2); AC-30 (a) Abstände aus der Token-Skala und (e) höchstens vier Schriftgrößen nicht gemessen.

## Ansichten und Engine-Funde (Assessment B)

Spalten: Treffer 390 / 1280 insgesamt (inkl. Schrift) · Funde außer `overused-font` bei 390 · bei 1280 · `data-aktion` von „Dein Stand“ · Anzahl `main .btn-primary` · Seitenhöhe bei 390 px.

| Ansicht | Treffer | 390 px | 1280 px | Stand | Primär | Höhe |
|---|---|---|---|---|---|---|
| Gast `/` | 2 / 1 | 1x straggler | nur Schrift | - | 7 | 5341 |
| Gast `/suche` | 2 / 2 | 1x unbalanced-heading | 1x straggler | - | 27 | 12619 |
| Gast `/turniere` | 1 / 1 | nur Schrift | nur Schrift | - | 0 | 844 |
| Gast `/einladung/<token>` | 1 / 1 | nur Schrift | nur Schrift | - | 1 | 844 |
| Gast Lobby | 6 / 3 | 3x straggler, 2x nested-cards | 2x nested-cards | anmelden | 1 | 2503 |
| Neuling `/willkommen` | 2 / 1 | 1x straggler | nur Schrift | - | 0 | 940 |
| Neuling `/app` (leitet auf `/willkommen`) | 0 / 0 | nur Schrift | nur Schrift | - | 0 | 940 |
| Eingerichtet ohne Team `/einladung/<token>` | 1 / 1 | nur Schrift | nur Schrift | - | 1 | 844 |
| Eingerichtet ohne Team Lobby (Ersatz) | 6 / 4 | 3x straggler, 2x nested-cards | 1x straggler, 2x nested-cards | ersatz | 1 | 2627 |
| Spieler `/` | 2 / 1 | 1x straggler | nur Schrift | - | 7 | 7525 |
| Spieler `/suche` | 2 / 2 | 1x unbalanced-heading | 1x straggler | - | 27 | 14767 |
| Spieler `/turniere` | 1 / 1 | nur Schrift | nur Schrift | - | 0 | 864 |
| Spieler `/app` (Fehlerzustand, viele Spiele) | 1 / 1 | nur Schrift | nur Schrift | - | 0 | 3618 |
| Lobby Captain: Karte hinterlegen | 9 / 6 | 4x straggler, 2x cramped-padding, 2x nested-cards | 1x line-length, 2x straggler, 2x nested-cards | karte | 1 | 3688 |
| Lobby Captain: bereit machen | 10 / 6 | 5x straggler, 2x cramped-padding, 2x nested-cards | 1x line-length, 2x straggler, 2x nested-cards | bereit | 1 | 3460 |
| Lobby Captain: bereit, wartet | 9 / 5 | 5x straggler, 1x cramped-padding, 2x nested-cards | 1x line-length, 1x straggler, 2x nested-cards | keine | 0 | 3402 |
| Lobby Captain: Letzte Bestätigung | 9 / 5 | 5x straggler, 1x cramped-padding, 2x nested-cards | 1x line-length, 1x straggler, 2x nested-cards | final | 1 | 3338 |
| Lobby Captain: bestätigt, wartet auf Gegner | 8 / 5 | 5x straggler, 2x nested-cards | 1x line-length, 1x straggler, 2x nested-cards | keine | 0 | 3280 |
| Lobby Captain: Planung (Uhrzeit/Halle) | 5 / 4 | 3x straggler, 1x nested-cards | 1x line-length, 1x straggler, 1x nested-cards | keine | 1 | 2897 |
| Lobby Captain: Herausforderung wartet | 7 / 7 | 3x straggler, 2x cramped-padding, 1x nested-cards | 2x line-length, 3x straggler, 1x nested-cards | keine | 0 | 3687 |
| Lobby Captain Herausforderer (Gegenseite) | 7 / 6 | 3x straggler, 2x cramped-padding, 1x nested-cards | 2x line-length, 2x straggler, 1x nested-cards | keine | 0 | 3650 |
| Lobby Fehlerzustand: Zahlung freigeben | 9 / 6 | 4x straggler, 1x cramped-padding, 3x nested-cards | 1x line-length, 1x straggler, 3x nested-cards | freigeben | 1 | 3572 |
| Lobby Fehlerzustand: Karte ändern | 8 / 5 | 4x straggler, 1x cramped-padding, 2x nested-cards | 1x line-length, 1x straggler, 2x nested-cards | karte | 1 | 3590 |
| Lobby Fehlerzustand: Frist abgelaufen | 8 / 5 | 4x straggler, 1x cramped-padding, 2x nested-cards | 1x line-length, 1x straggler, 2x nested-cards | keine | 0 | 3402 |
| Lobby gespieltes Spiel | 4 / 3 | 3x straggler | 1x line-length, 1x straggler | spielseite | 1 | 1969 |
| Lobby Teammitglied: beitreten | 6 / 4 | 3x straggler, 2x nested-cards | 1x straggler, 2x nested-cards | beitreten | 1 | 2647 |
| Lobby Hallenbetreiber | 6 / 3 | 3x straggler, 2x nested-cards | 2x nested-cards | ersatz | 1 | 2691 |
| Eingerichtet ohne Team `/app` | 1 / 1 | nur Schrift | nur Schrift | - | 0 | 2202 |
| Lobby Captain Zielteam: Herausforderung annehmen | 5 / 4 | 2x straggler, 1x cramped-padding, 1x nested-cards | 1x line-length, 1x straggler, 1x nested-cards | annehmen | 1 | 3256 |

Lobby-Ansichten: 17, davon cramped-padding bei 390: 10, nested-cards (390): 16, line-length bei 1280: 13

**In allen 58 Scans:** `overused-font` (Plus Jakarta Sans): Look-Entscheidung des Nutzers (Lauf 1: behalten), nur gemeldet. **`dark-glow`: 0 Treffer** (die Ampelpunkte sind seit #299 dezent). Kein horizontaler Überlauf in keiner Ansicht.

## Eingelöst gegenüber Lauf 1

- **P1-1 „mehrere Hauptaktionen in der Lobby“:** In allen Spielerzuständen genau eine oder keine `btn-primary` (Spalte Primär); Dein Stand und Hauptknopf stimmen überein (`data-aktion`).
- **P1-3 „Fehlerzustand mit mehreren Wegen“:** Freigabe und Karte zeigen je einen Schritt und eine Hauptaktion; Frist abgelaufen zeigt keinen Schritt und keine Hauptaktion (siehe aber P2-7).
- **P1-4 „Live“ in `text-xs`:** `src/components/LiveIndicator.tsx` enthält kein `text-xs` mehr. `unbalanced-heading` im `/suche`-Titel besteht weiter (P2-10).

## Fundliste

Spalten: Befund | Stufe | Quelle (A = critique, B = Engine, M = DOM-Messung) | Datei:Zeile | Vorschlag | Besitzer

**P1 (vor dem Pilot-Gate)**

| # | Befund | Stufe | Quelle | Datei:Zeile | Vorschlag | Besitzer |
|---|---|---|---|---|---|---|
| 1 | **Karte in Karte in 16 von 17 Lobby-Ansichten** (AC-30 c „keine doppelten Rahmen“): Team-Unterkarten im Schritt-Block und in „Preis bestätigen“ (`div.rounded-lg.border` in `section.card`), im Fehlerzustand zusätzlich `summary.btn` in der Karte. | P1 | B | `src/app/lobby/[id]/Steps.tsx:26`, `FinalConfirm.tsx:22` | Unterkarten ohne Rahmen (Trennlinie oder Fläche), nicht doppelt umrahmen. | Lobby (w3) |
| 2 | **Hauptaktion nicht in der ersten Ansicht** (AC-30 d): Bei 390 px steht der Hauptknopf weit unter dem Falz: Freigabe etwa 1400 px, Letzte Bestätigung fast am Seitenende (rund 2850 von 3338 px), Planung (Vorschlag) bei etwa 1000 px. Dein Stand nennt den Schritt, der Knopf liegt danach unter Stepper, Spielort und Kosten. | P1 | A | `src/app/lobby/[id]/page.tsx:234` (Reihenfolge der Blöcke) | Hauptknopf in oder direkt unter „Dein Stand“, Spielort und Kosten danach (Knopf und Handler bleiben im Baustein, nur die Platzierung ändert sich). | Lobby (w3) |
| 3 | **Knopf-Innenabstand 3,5 px bei 390 px** (Lauf 1 P1-2, offen): `cramped-padding` in 10 von 17 Lobby-Ansichten: `button.btn.w-full` in der Kartenzeile (u. a. das deaktivierte „Bereit machen“) und `span.inline-flex.flex-col > button.btn-ghost`. | P1 | B | `src/app/lobby/[id]/page.tsx:351` und Baustein `btn` | Mindest-Innenabstand im `btn`-Baustein (mindestens 4,8 px bei 16 px Schrift) statt je Seite. | Lobby (w3), geteilter Baustein |
| 4 | **Captain in der Planung: Dein Stand ohne Schritt.** Der Captain sieht „Die Captains wählen Uhrzeit und Halle. Bereit machen kannst du danach.“ (`aktion: keine`), während der orange „Vorschlag machen“ darunter die einzige Hauptaktion ist. Der Text nennt den Schritt nicht. | P1 | A | `src/lib/lobby-stand.ts:41` | Für Captains „Nächster Schritt: Uhrzeit vorschlagen“ (bzw. Hallen bannen), für Nicht-Captains der heutige Text. | Lobby (w3) |

**P2 (Backlog)**

| # | Befund | Stufe | Quelle | Datei:Zeile | Vorschlag | Besitzer |
|---|---|---|---|---|---|---|
| 5 | **Zielgrößen unter 44 px (AC-3, Abgleich mit AC-27 nötig):** Mitspieler-Namen als Links 20 px hoch (über 140 Treffer in den Lobby-Listen), Sprachumschalter „Deutsch/English“ 16 px hoch auf jeder Seite, Link „Teilen“ 16 px, Fußzeilenlinks 20 px, ein 13-px-Kästchen für die Einwilligung. AC-27 hat sie offenbar nicht erfasst. | P2 | M | `src/components/Footer.tsx`, Teamlisten in `src/app/lobby/[id]/page.tsx` | Trefferfläche vergrößern (Padding), nicht die Schrift; Kästchen mit ganzer Zeile als Ziel. | Lobby und Layout |
| 6 | **Fehlerzustand Freigabe: derselbe Satz zweimal** („Die Bank braucht deine Freigabe der Zahlung.“ und „Deine Bank braucht eine Freigabe der Zahlung. Gib sie hier frei (bis …)“) plus vier Knöpfe im Kasten (zwei davon nur im Testmodus) und „Abmelden“. | P2 | A | `src/lib/charge-failure-text.ts:13`, `src/app/lobby/[id]/LobbyClient.tsx:90` | Ein Satz, Frist in Dein Stand; „Abmelden“ aus dem Fehlerkasten lösen. | Lobby (w3) |
| 7 | **Fehlerzustand „Frist abgelaufen“ ohne Handlung:** Dein Stand sagt, dass der Platz neu vergeben wird, es gibt keine Aktion (Hauptaktion 0). Lauf 1 verlangte Grund und eine Handlung. | P2 | A | `src/lib/lobby-stand.ts:52` | Ruhiger Link „Andere Spiele suchen“ als einzige Aktion. | Lobby (w3) |
| 8 | **Hallenbetreiber bekommt „Als Ersatzspieler anbieten“** als orange Hauptaktion (`data-aktion: ersatz`). Der Seed-Betreiber ist zugleich ein normaler Nutzer; ob ein reiner Betreiber diese Aktion sehen soll, ist eine Produktfrage. | P2 | A | `src/lib/lobby-stand.ts:46-48`, `LobbyClient.tsx:154` | Produktentscheid; für reine Betreiber eine neutrale Zeile ohne Hauptaktion. | Produkt (t2q) |
| 9 | **Lobby sehr lang:** 2600 bis 3700 px bei 390 px; Spielort und Kosten stehen vor den Teams, „Für Captains“ und „Spieler einladen“ mitten im Fluss. | P2 | A, M | `src/app/lobby/[id]/page.tsx` | Distill: Teams früher, Kosten einklappen. | Lobby (w3) |
| 10 | **Straggler und Zeilenlänge:** 3 bis 5 Einzelwörter am Absatzende je Lobby bei 390 px, `line-length` ca. 106 Zeichen in der Kostenzeile bei 1280 px (13 von 17), `unbalanced-heading` im `/suche`-Titel, Straggler auf `/` und `/suche` (Lauf 1, offen). | P2 | B | `src/app/lobby/[id]/page.tsx:325` (Kosten) | `text-wrap: balance` für Titel, `pretty` für Fließtext einmal zentral; Kostentext auf höchstens 70 Zeichen Breite. | Layout/Lobby |
| 11 | **Planung: deaktivierter „Bereit machen“-Knopf plus Erklärsatz** wiederholen, was Dein Stand schon sagt. | P2 | A | `src/app/lobby/[id]/page.tsx:351-352` | Knopf und Satz entfallen, solange nicht möglich. | Lobby (w3) |
| 12 | **`text-xs` in globalen Bausteinen** (AC-30: nie `text-xs`): Fußzeile und BottomNav-Beschriftung auf jeder Seite. In Lauf 1 nicht genannt. | P2 | M | `src/components/Footer.tsx:8`, `src/components/BottomNav.tsx:32` | Mindestens `text-sm`; Entscheid mit dem Look-Besitzer. | Layout |
| 13 | **`/app`: „Meine Spiele“ ohne Obergrenze** (13 Karten, 3600 px bei 390 px; durch das Seeding überzeichnet, aber real bei vielen Spielen); Teamnamen werden abgeschnitten („gegen Ko…“). | P2 | A | `src/app/app/page.tsx` | Nach fünf Einträgen „Alle anzeigen“; Zeile mit zwei Namen umbrechen. | w4 |
| 14 | **`/app` eingerichtet ohne Team:** „Team gründen“ dreimal (Karte „So startest du“, feste Leiste, „Meine Teams“); „Du bist noch in keinem Team“ und „So startest du“ sagen dasselbe. | P2 | A | `src/app/app/page.tsx:63-67,121` | Eine Karte mit einer Aktion. | w4 |
| 15 | **`main .btn-primary` auf `/` (7) und `/suche` (27)** (AC-30 b nennt Start ausdrücklich): Hero-Knopf plus „Zur Lobby“-Knöpfe in den Karten sind alle primär. Lauf 1 nannte nur die Konkurrenz im ersten Bildschirm. | P2 | M | `src/app/page.tsx:54`, Lobby-Karten | Karten-Knöpfe als `btn-ghost`, nur der Hero bleibt primär. | w3 |
| 16 | **Lauf 1, weiter offen:** Startseite für angemeldete Spieler zeigt die Gast-Erklärung (7500 px bei 390), `/suche` beginnt mit dem Auswahlschritt (14 800 px), `/turniere` Leerzustand ohne Handlung (nicht neu bewertet). | P2 | A, M | `src/app/page.tsx`, `src/app/suche/page.tsx` | wie Lauf 1. | w3 |

Positiv: `/einladung/<token>`, `/willkommen` und `/turniere` haben außer der Schrift kaum Treffer (je ein Hauptknopf); der Fehlerzustand auf `/app` (roter Kasten mit einer Handlung) ist klar.

## Zusammenhang mit AC-5, AC-15 und AC-30

- AC-15: critique und Detektor sind für die Lobby-Zustände aus 5a/5b, `/app` und die geänderten Seiten nachgeholt; der Vermerk „Degradiert: ja“ der M3-PRs 5a und 5b gilt damit für die erfassten Zustände als eingelöst. Offen: die Lücken oben und das helle Schema.
- AC-30: (b) Hauptaktion je Ansicht ist in der Lobby erfüllt, auf `/` und `/suche` offen (P2-15); (c) Karte in Karte verletzt (P1-1); (d) erste Ansicht auf 390 px verletzt (P1-2); (a) und (e) nicht gemessen.

## Nächste Schritte

1. P1 1 bis 4 gehören in einen Lobby-Fix-PR von w3 (ein Baustein `btn` für Punkt 3), vor dem Pilot-Gate (AC-8).
2. P2 nach Besitzer ins Backlog (Lobby und Layout, w3 für `/` und `/suche`, w4 für `/app`).
3. Look-Entscheid beim Nutzer bleibt: Schrift (`overused-font`), nur gemeldet.
4. Dritter Lauf (klein) nach dem Fix: Lücken (Veto-Phase, bestätigt, Privatspiel, hell).
