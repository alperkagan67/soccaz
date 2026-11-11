# M2-5-Plan und M2b-Plan (Vertrag 013)
Stand: 2026-11-11 · Code-Stand `origin/main` 7d8f38a · Verfasser: worker-4 (Plan, Doku, kein Code) · Status: Entwurf, Review offen

Teil A plant M2-5 (`src/lib/format.ts`, i18n-Helfer, Begriffe im Code). Teil B plant M2b, die Look-Abnahme von Start und Lobby (Vertrag 013 AC-13). Der Plan ändert keinen Code und keinen Vertrag.

Quellen: `docs/design/umbauplan-013.md` (Branch `docs/013-freigabe`, Abschnitt 2 Gestaltung, Abschnitt 3 M2/M2b/M3), Vertrag 013 AC-6, AC-13, AC-14, AC-15, `docs/design/m2-komponenten-plan.md` (Branch `docs/m2-komponenten-plan`, M2-2/M2-3), `docs/design/begriffe.md` (Branch `docs/begriffe-entwurf`), `docs/design/analyse-seed.md`, Verdichtung Cluster K17 (Zahlen und Formate), K05, K06, K07, K08, K10.

Annahme zur Nummerierung: M2-1 = Tokens/Design-Fundament (worker-3, `feat/m2-1-tokens`), M2-2 = Button/Seitenkopf/StateMessage/StatusBadge, M2-3 = Form/ConfirmDialog/DateTimeField (beide: `m2-komponenten-plan.md`), M2-5 = `format.ts`. M2-4 ist geteilt (entschieden, t9, 2026-11-11): **M2-4a = `UserMenu`** (Neubau, native Popover/`<details>`, Tastatur-Test), **M2-4b = `AppNav`**; der Bau von `AppNav` (fünf Ziele, Mittelknopf) ist M3, in M2 gibt es nur die Vorbereitung.

---

# Teil A: M2-5 (format.ts, i18n-Helfer, Begriffe im Code)

## A1. Ist-Stand (Code `origin/main` 7d8f38a)
- **Euro:** `formatEuro(cents)` lebt in `src/lib/money.ts:7-10` (Intl.NumberFormat `de-DE`, `EUR`); 24 Dateien, 95 Zeilen nutzen ihn. Dazu rechnet `money.ts` (Anteile, Aufrunden); `parseEuro` liest Eingaben.
- **Datum/Zeit:** `src/lib/time.ts` hat `formatDateTime` (Zeile 44), `formatDate` (48), `formatTime` (52), `toBerlinInputValue` (57), `berlinMonthRange` (63) und die Zeitzone `TZ = "Europe/Berlin"`; 36 Dateien nutzen `formatDateTime`/`formatDate`/`formatTime`/`formatDay`.
- **Daneben eigene Formatierung** (`toLocale*String("de-DE", …)` außerhalb von `time.ts`, 15 Stellen):
  - Seiten und Komponenten: `src/app/lobby/[id]/page.tsx:99`, `src/app/lobby/offen/[entryId]/page.tsx:36`, `src/app/matchmaking/page.tsx:82`, `src/app/turniere/[id]/BracketView.tsx:79`, `src/app/turniere/[id]/page.tsx:106,160,167`, `src/components/LobbyBoard.tsx:11`, `src/components/MyGames.tsx:37`, `src/components/OpenSearches.tsx:7`.
  - Server: `src/server/pro-events.ts:125`, `src/server/receipt-pdf.tsx:26`, `src/server/scheduling.ts:132`, `src/server/tournaments.ts:501`, `src/server/veto.ts:34`.
  - Das Muster „von bis“ (`${formatDateTime(from)} bis ${new Date(to).toLocaleTimeString(…)}`) steht an mindestens vier Stellen (`lobby/offen/[entryId]/page.tsx:36`, `matchmaking/page.tsx:82`, `MyGames.tsx:37`, `lobby/[id]/page.tsx:99`).
- **Zahl als Text:** `toFixed` an 5 Stellen: `src/server/wallet-actions.ts:36` (Bonus, mit `.replace(".", ",")` per Hand), `src/server/tournaments.ts:325`, `src/lib/promo-rules.ts:38`, `src/app/admin/finanzen/spiel/[id]/page.tsx:65` (Eingabewert), `src/components/Sparkline.tsx:12` (Grafikpunkte, kein Anzeigetext).
- **Plural von Hand:** 15 Zeilen in 14 Dateien mit `=== 1 ?`/`!== 1 ?` (u. a. `src/app/teams/page.tsx:66`, `src/app/hallen/page.tsx:38`, `src/app/matchmaking/page.tsx:44`, `src/app/spieler/[id]/page.tsx:55`, `src/components/LobbyBoard.tsx:58`). Zwei belegte Fehler: `src/components/OpenSearches.tsx:59` (`s.members === 1 ? "Spieler" : "Spieler"`, beide Zweige gleich) und `src/app/rangliste/page.tsx:44` („1 Siege in 1 Spielen“, Fund Y2-G-08/K17).
- **Euro im Text:** 54 Zeilen mit „Euro“, „EUR“ oder „€“ außerhalb von `formatEuro`, überwiegend Eingabe-Beschriftungen („Betrag in Euro“), einige feste Beträge in Fließtext (`src/app/app/guthaben/TopUpForm.tsx:52`, `src/app/hilfe/page.tsx:84`; Altmodell).
- **i18n:** `src/lib/i18n.ts` hat 63 Schlüssel (Navigation, Start, Anmeldung, Fußzeile), Deutsch und Englisch; alle anderen Seiten haben harte Texte. Es gibt `translate`/`translator`, aber keinen Plural- oder Zahlenhelfer.
- **Tests:** `tests/unit/money.test.ts`, `time.test.ts`, `time-series.test.ts` existieren; kein Test für Formatierung als Anzeige, keiner für Begriffe.

## A2. Entwurf
- **`src/lib/format.ts`** (neue Datei, reine Funktionen, keine Server-Importe, damit Client und Server sie nutzen):
  - Fassade: `formatEuro`, `formatDateTime`, `formatDate`, `formatTime` werden **re-exportiert** (`money.ts` und `time.ts` bleiben unverändert, weil Server und Tests darauf bauen).
  - Neu: `formatCount(n, one, other)` → „1 Platz“/„3 Plätze“ (ein Plural-Helfer statt 15 handgeschriebener Zweige), `formatDateRange(from, to)` → „Mo., 23.11., 15:04 bis 17:00 Uhr“ (ersetzt das Muster „von bis“), `formatShare(cents)` (ersetzt `toFixed(2).replace`), optional `formatWins(w, g)`-ähnliche Zähler nur, wenn die Rangliste sie braucht.
  - Alle Funktionen deutsch, Zeitzone Berlin, `Intl` mit festem `de-DE`.
- **i18n-Helfer:** Erweiterung in `src/lib/i18n.ts` um (a) Plural-Schlüssel (`"unit.player": { one, other }`) und (b) die Schlüssel für Standardtexte aus M2-2 (`ui.pending` …). `i18n.ts` ist **gemeinsame Datei**: Änderungen seriell.
- **Begriffe als Code:** `src/lib/begriffe.ts` enthält die Pflichtbegriffe aus `begriffe.md` als Konstanten (`TERM.findetStatt = "Findet statt"`, `TERM.preisSteht = "Preis steht fest"`, `TERM.preisBestaetigen = "Preis bestätigen"`, `TERM.ergebnisBestaetigt`, `TERM.verlassen`, `TERM.abmelden`, `TERM.kartAendern = "Karte ändern"`, `TERM.zahlungAusstehend`, `TERM.abbuchungFehlgeschlagen`, `TERM.captain`, `TERM.nachruecker`, `TERM.ersatzspieler`, `TERM.teamBereit`, `TERM.zusageHalle`/`TERM.absageHalle`, `TERM.spielniveau`, `TERM.spielstaerke`) und die **verbotenen Synonyme** als Liste (`{ begriff, verboten: RegExp, ausnahmen: string[] }`). Seiten und Komponenten verwenden die Konstanten statt Freitext, sobald sie umgebaut werden (M3 bis M7).
- **Test gegen verbotene Synonyme:** `tests/unit/begriffe.test.ts` (Vitest ohne DOM, liest `src/**/*.ts(x)` per `node:fs`) zählt Treffer je Wort und Datei. Weil der Bestand heute widerspricht (z. B. „Team-Admin“ in 54 Textzeilen, „Guthaben“ in 43), arbeitet der Test mit einer **Basis-Datei** (`tests/unit/begriffe-baseline.json`: erlaubte Anzahl je Wort und Datei): sie darf nur **sinken**, nie steigen (Ratsche). Neue und umgebaute Dateien starten mit 0. Rechtstexte (`agb`, `datenschutz`, `hausordnung`, nach Entscheid 2) stehen in der Ausnahmeliste.
- **Lint:** Zusätzlich zur Mindestschrift-Regel (M2-1) eine Regel gegen `toFixed`, `toLocale*String` und `new Intl.*` außerhalb von `format.ts`, `money.ts`, `time.ts` für **Anzeige** (Ratsche über dieselbe Basis-Datei-Idee; `Sparkline.tsx:12` als Ausnahme für Grafikkoordinaten).

## A3. Dateien
| Datei | Änderung |
|---|---|
| `src/lib/format.ts` | neu |
| `src/lib/begriffe.ts` | neu |
| `src/lib/i18n.ts` | Plural-Schlüssel und Standardschlüssel (gemeinsame Datei, seriell) |
| `tests/unit/format.test.ts` | neu (Euro, Datum, Spanne, Plural, Ränder: 0, 1, 2, große Zahlen, Sommer-/Winterzeit) |
| `tests/unit/begriffe.test.ts`, `tests/unit/begriffe-baseline.json` | neu (Ratsche gegen verbotene Synonyme) |
| `eslint.config.mjs`, `eslint-rules/…` | Regel gegen Fremdformatierung (M2-1 hat den Ordner `eslint-rules/`) |
| `src/lib/money.ts`, `src/lib/time.ts` | **unverändert** (nur Fassade) |

Die Umstellung der 15 Fremdstellen und der 15 Plural-Stellen gehört nicht zu M2-5, sondern zur jeweiligen Seitengruppe (M3 bis M7), damit M2-5 keine Seiten berührt.

## A4. Abnahmekriterien
1. `formatCount(1, "Platz", "Plätze")` = „1 Platz“, `formatCount(0, …)` und `formatCount(2, …)` = Plural; kein „1 Siege in 1 Spielen“ möglich (Test mit dem Rangliste-Fall).
2. `formatDateRange` liefert für gleichen Tag „Mo., 23.11., 15:04 bis 17:00 Uhr“ (Zeitzone Berlin, auch über die Sommer-/Winterzeit-Grenze), für verschiedene Tage beide Daten; Test mit festen UTC-Zeiten.
3. `formatEuro` bleibt byte-gleich zu heute (Test gegen bekannte Werte aus `money.test.ts`), `formatShare(1250)` = „12,50 €“.
4. `format.ts` importiert nichts aus `src/server` oder `src/db`.
5. Begriffe-Test: Basis-Datei erzeugt aus dem Ist-Stand; Test ist grün; ein neu eingeführtes verbotenes Wort (Probe in Scratch-Kopie) macht ihn rot (Mutation 1 von Hand: Basis-Zahl senken → rot).
6. Rechtstexte stehen in der Ausnahmeliste, **ohne** dass ihre Dateien angefasst werden (Entscheid 2).
7. Keine Änderung an `money.ts`/`time.ts`, alle bisherigen Unit- und Integrationstests grün (AC-5).
8. **Englisch mit Rückfall:** Die englische Tabelle in `src/lib/i18n.ts` darf Schlüssel auslassen (Typ `Partial` statt `Record<MessageKey, string>`; heute zwingt `Record` zu vollständigem Englisch, `i18n.ts:80`). `translate` fällt bei fehlendem englischem Text auf Deutsch zurück, ohne Fehler und ohne Warnung im Browser (der Rückfall steht heute schon in `translate`, Zeile `MESSAGES[locale]?.[key] ?? de[key]`). Test `tests/unit/i18n.test.ts`: (a) fehlender EN-Schlüssel liefert den deutschen Text, (b) vorhandener EN-Schlüssel liefert Englisch, (c) die Pflichtbegriffe aus `begriffe.ts` haben einen englischen Text (Liste der Pflichtbegriffe im Test, Fehlen ist rot), (d) Platzhalter `{count}` bleibt im Rückfall erhalten.

## A5. Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test -- tests/unit/format.test.ts tests/unit/begriffe.test.ts`; `npm test` (alle Unit-Tests); Gegenprobe der Ratsche in Scratch-Kopie (Wort einfügen → rot); `git diff --stat` zeigt nur die Dateien aus A3. Ein Playwright-Lauf ist nicht nötig (keine Seite berührt).

## A6. Konflikte und Abhängigkeiten
- **`src/lib/i18n.ts` ist gemeinsame Datei:** M2-2a legt `ui.pending` u. a. an; M2-5 baut Plural-Schlüssel dazu. Reihenfolge: **M2-5 nach M2-2a**, nie parallel auf `i18n.ts`.
- **`eslint.config.mjs`/`eslint-rules/`:** gehört M2-1 (worker-3) bis zum Merge; die neue Regel erst danach.
- **`begriffe.md`:** muss gemergt und von t9 entschieden sein (alle 10 Entscheide liegen vor, Dokument noch im Review); die Konstanten folgen dem Verzeichnis wörtlich.
- **Seiten:** keine; die Umstellung der Fremdstellen erfolgt mit den Seiten (M3 bis M7). Für M2b (Teil B) nutzen Start und Lobby `format.ts` schon.
- **Englisch (entschieden (t9, 2026-11-11)):** Englische Schlüssel werden mitgepflegt; übersetzt werden nur die Pflichtbegriffe aus `begriffe.md`. Fehlende englische Texte fallen ohne Fehler auf Deutsch zurück (siehe AC 8 und Test in A4).

## A7. Aufwand
Etwa 1 Task-Tag (`format.ts`, Tests) plus 0,5 bis 1 Task-Tag (`begriffe.ts`, Ratsche, Lint-Regel) = 1,5 bis 2 Task-Tage, ein Writer.

---

# Teil B: M2b, Look-Abnahme Start und Lobby (AC-13)

## B1. Ziel und Gate
Nach M2 sind Start und Lobby **komplett im neuen Look** (Richtung E „Trikot“, Komponenten aus M2-2/M2-3, Format aus M2-5). Screenshots von Start und Lobby auf Handy 390 px und Desktop 1280 px, jeweils hell und dunkel (4 Varianten je Seite), gehen als `NEEDS-USER` an den Nutzer. **M3 geht erst nach seinem „Ja“ in die Breite.** M2b ist ein Vorziehen von Start und Lobby aus M3 (Umbauplan: M3 enthält Start, Meine Spiele, Lobby), kein zusätzlicher Umbau; neu ist die Abnahmeschleife.

## B2. Die Seiten heute (Datei:Zeile) und ihr neuer Aufbau

### B2.1 Start
Start (entschieden (t9, 2026-11-11)): Zwei Seiten tragen den „Start“: `/` (`src/app/page.tsx`, 82 Zeilen, Gast und Angemeldete) und `/app` (`src/app/app/page.tsx`, 123 Zeilen, „Meine Spiele“ für Angemeldete; Umbauplan: „Start (Meine Spiele)“). Beide gelten als „Start“ und bekommen je 4 Varianten (12 Pflichtbilder mit der Lobby). Die Guthaben-Karte auf `/app` entfällt (Bedingung 2 der Freigabe, AC-14).

| Seite | Heute | Neu |
|---|---|---|
| `/` | Hero mit `h1` (`page.tsx:55`) und **vier gleichwertigen Knöpfen** (`:61-66`: Team gründen/Anmelden, Lobby aufmachen, Offene Lobbys, Livescore); `MyGames` über dem Hero (`:40`); `GameModes` (`:71`), `HowItWorks` (`:73`), Offene Lobbys (`:75-77`), Sponsoren (`:79`) | `PageShell` + `PageHeader` (eine `h1`), **genau eine Hauptaktion** (Gast: „Anmelden“; Angemeldete: „Spiel suchen“); „So funktioniert es“ und Sponsoren unter dem Falz; Offene Lobbys als Liste mit `StatusBadge` |
| `/app` | `h1` „Hey {Name}“ (`app/page.tsx:28`), `MyGames` (`:32`), `Challenges` (`:34`), Kasten „So startest du“ (`:37-46`, nur bei 0 Teams/Spielen), `GameModes` (`:51`), **Guthaben-Karte** (`:53-56`), fünf Kacheln (`:62-66`), „Meine Spiele“ (`:69ff`), „Meine Teams“ (`:96ff`, Knopf „Team gründen“ `:99` 36 px) | `PageHeader` mit „Dein Stand“ (nächstes Spiel, was fehlt), **eine Hauptaktion**, darunter „Meine Spiele“ und „Meine Teams“; Guthaben-Karte und Fünf-Kachel-Raster entfallen (Navigation übernimmt) |

### B2.2 Lobby (`src/app/lobby/[id]/page.tsx`, 417 Zeilen, plus `LobbyClient.tsx` 245, `FinalConfirm.tsx` 39, `Steps.tsx`, `CardForm.tsx`, `VetoPanel.tsx`, `SchedulingPanel.tsx`)
| Block | Heute | Neu |
|---|---|---|
| Kopf | `h1` mit Teamnamen (`:147`), Livepunkt (`:145`), Countdown (`:154`), Gast-Hinweis „Anmelden“ (`:162`) | `PageHeader`: eine `h1`, Datum/Halle als Meta |
| Stand | nicht vorhanden; Schritt-Chips „Uhrzeit / Halle / Bezahlen“ (`Steps`, `:192`) sehen wie Knöpfe aus (Fund Y1-GM-04) | **„Dein Stand“-Block** (Wort + `StatusBadge`, z. B. „Du bist bereit, Karte hinterlegt“); die Schritte werden eine Fortschrittsanzeige ohne Knopfoptik |
| Hauptaktion | verstreut: `FinalConfirm` (`:397`, am Ende), „Bereit machen“ (`:311`, `:323`), Karten-Formular, Absage (`:414`) | **genau eine Hauptaktion je Rolle und Zustand** (B2.3), Handy: feste Aktionsleiste unten |
| Fehlerzustand | Karte abgelehnt nur als rote Ampel | `StateMessage`: „Abbuchung fehlgeschlagen“ mit Grund und „Karte ändern“ (012 M3b, AC-12/AC-20) |
| Kosten | vier Varianten (`:253-310`), darunter Guthaben-/Reservierungstexte (`:277-305`, `:323` `pay=`, `:328` `LightLegend`) | **nur Kartenmodell** (`cardOn`-Zweig, `:259-269`); Guthaben-Zweig entfällt |
| Kader | Teams mit Spielerzeilen (`:331-375`), `PlayerLight`/`CardLight` je Spieler (`:348`) | `StatusBadge` (Symbol + Wort + Farbe); **Dritte sehen neutral** (012 AC-12) |
| Weitere | Hallenanfrage (`:195`), Spielort (`:245-250`), Einladungslink (`:171-180`), Ersatzspieler (`:381`), Absage (`:414`) | unter „Weitere“ (Details/Disclosure), Absage mit `ConfirmDialog` (heute native `confirm()` in `LobbyClient.tsx:113,211`) |

### B2.3 Hauptaktion je Rolle und Zustand (Entwurf, aus der heutigen Logik und `begriffe.md`)
| Rolle | Zustand | Hauptaktion (genau eine) |
|---|---|---|
| Gast | beliebig | „Anmelden und beitreten“ |
| Spieler (nicht in der Lobby) | Lobby offen | „Beitreten“ |
| Spieler | in der Lobby, keine Karte | „Karte hinterlegen“ |
| Spieler | Karte da, nicht bereit | „Bereit machen“ |
| Spieler | bereit | keine primäre Aktion; „Lobby verlassen“ als Nebenaktion |
| Spieler / Captain | Abbuchung fehlgeschlagen | „Karte ändern“ (StateMessage) |
| Captain | Uhrzeit/Halle offen | „Uhrzeit wählen“ bzw. „Hallen bannen“ |
| Captain | je Team mindestens 4 bereit | „Preis bestätigen“ (heute `FinalConfirm`, „Letzte Bestätigung“) |
| Captain | nach beiden Bestätigungen | „Preis steht fest“ (Status), Hauptaktion: „Zur Spielübersicht“ |

### B2.4 Was entfällt (Altmodell, AC-14)
- Lobby: Guthaben-/Reservierungstexte und `LightLegend` im `!cardOn`-Zweig (`page.tsx:277-305,323,328`), `PlayerLight` im Guthaben-Zweig.
- `/app`: Guthaben-Karte (`app/page.tsx:53-56`, Test-ID `wallet-card`).
- Navigation: Guthaben in der Kopfleiste (`src/components/Header.tsx:17,53`) und im Konto-Menü (`src/components/UserMenu.tsx:69-70`).
- Der Rest des Altmodells (`/app/guthaben`, Rabattcodes, Admin-Seiten) ist 012 M6a, nicht M2b. Für die Abnahme gilt: **auf Start und Lobby ist nirgends Guthaben sichtbar**.

### B2.5 Navigation
Der Look von Start und Lobby wirkt nur mit passender Navigation. Laut Umbauplan gehört `AppNav` zu M3. Für M2b braucht es mindestens: `Header` und `BottomNav` im neuen Look, Guthaben raus, aktiver Eintrag mit `aria-current` und Wort. Entschieden (t9, 2026-11-11): In M2b wird die Navigation **nur restylt** (Header/BottomNav im neuen Look, Guthaben raus, aktiver Eintrag mit Wort); die neue Struktur (`AppNav`, fünf Ziele, Mittelknopf) folgt in M3. Das steht im NEEDS-USER-Paket (B5). `src/components/Header.tsx`, `BottomNav.tsx`, `UserMenu.tsx` (M2-4a) und `layout.tsx` sind gemeinsame Dateien (seriell, siehe `m2-komponenten-plan.md` Schritt C).

## B3. Seed und Screenshot-Matrix
- **Seed:** `scripts/seed-frontend.mts` (Branch `main`, `docs/design/analyse-seed.md`): nur lokale Worker-DB (`soccaz_w1` bis `w4`, Port 5433), Testdaten `@test.local`. Aufruf `npx tsx --env-file=.env.local scripts/seed-frontend.mts` (Nutzer bzw. Worker, nicht ich: `.env*` wird nicht gelesen). Vor dem Lauf `card_payments_enabled` auf `true` setzen (der Seed setzt den Schalter nicht, `analyse-seed.md`), damit die Lobby im Kartenmodell erscheint.
- **Konten und Zustände** (aus der Zustandsmatrix von `analyse-seed.md`):
| Rolle | Konto | Seite und Zustand |
|---|---|---|
| Gast | ohne Anmeldung | `/`; Lobby „offen“ (Rot gegen Blau in 6 Tagen) und „voll“ (Grün gegen Gelb in 5 Tagen) |
| Spieler | ein Spieler aus dem Spiel Grün gegen Gelb (z. B. `p10` mit Karte, `p11` ohne Karte, `p09` mit ausstehender Zahlung) | `/app`; Lobby „voll“ (Ampel grün/rot), „Zahlung ausstehend“ |
| Captain | `seed-captain-rot@test.local` (Karte vorhanden), `seed-captain-gruen@test.local` (Karte abgelehnt) | `/app`; Lobby „voll“; Lobby „Abbuchung fehlgeschlagen“ (Grün gegen Gelb in 2 Tagen) |
- **Matrix:** Seiten **Start `/`**, **Start `/app`**, **Lobby** × Gerät (390 × 844 px, 1280 × 800 px) × Thema (hell, dunkel per `page.emulateMedia({ colorScheme })`) = **4 Varianten je Seite, 12 Pflichtbilder**. Zusatzbilder (nicht Pflicht): Lobby als Captain mit „Preis bestätigen“, Lobby Fehlerzustand, Lobby als Gast.
- **Erstellung:** einmaliges lokales Skript (z. B. `tests/e2e/m2b-screenshots.spec.ts`, läuft nur lokal und nicht in der CI; analog zur Analyse), Dev-Login der Seed-Konten, `fullPage`, Dateiname `m2b_<rolle>_<geraet>_<thema>_<seite>.png`. Die Bilder gehen **als PR-Anhang** an den Nutzer, **nicht ins Repo** (Datenumfang, öffentliches Repository; Seed-Daten sind erfunden, aber die Dateien sind groß).
- **Vorher/Nachher:** dieselbe Matrix auf dem Stand vor M2b (`main`) als Vergleich, damit der Nutzer den Sprung sieht.

## B4. Impeccable: alle sechs Befehle einzeln je Seite und Rolle (AC-6, AC-15)
- Befehle: `critique`, `audit`, `distill`, `clarify`, `adapt`, `polish`; **jeder als eigener Durchgang, nicht gebündelt**, im PR einzeln genannt (je Befehl ein Abschnitt, Funde P0/P1 behoben oder begründet vertagt).
- **Seite × Rolle:** Start `/` (Gast, Spieler), Start `/app` (Spieler, Captain), Lobby (Gast, Spieler, Captain) = **7 Kombinationen × 6 Befehle = 42 Durchgänge**. Entschieden (t9, 2026-11-11): Es werden alle 42 Durchgänge eingeplant (AC-15). Die Sub-Agents laufen **seriell** (nie parallel). Wird ein Lauf „Degradiert“ oder „Blockiert“, steht das **offen** im PR („Degradiert: ja, Grund“) und geht sofort als `NEEDS-USER`.
- **Degradiert oder Blockiert** (Klassifizierer, Impeccable, Playwright): sofort `NEEDS-USER`, spätestens nach 15 Minuten; kein Umgehen.
- Belege im PR: Befehl, Seite, Rolle, Funde (ID), Ergebnis (behoben/vertagt mit Grund), „Degradiert: ja/nein, Grund“ (AC-1).

## B5. NEEDS-USER-Paket für den Nutzer
Der Nutzer bekommt **einen** Draft-PR (Ausnahme: keine Änderung an `.github/` oder Regeln, daher normaler Merge-Weg; die Abnahme selbst ist das Gate) mit:
1. **Was er sehen soll:** die 12 Pflichtbilder (Start `/`, Start `/app`, Lobby; je 390/1280 × hell/dunkel) plus Vorher-Bilder; Zusatzbilder Captain und Fehlerzustand.
2. **Was er entscheiden soll** (Ja/Nein je Punkt): (a) Look Richtung E „Trikot“ trifft (Farben, Typografie, Dichte); (b) eine Hauptaktion pro Seite und die feste Aktionsleiste am Handy; (c) „Dein Stand“-Block; (d) Wortwahl der Zustände (Findet statt, Preis steht fest, Abbuchung fehlgeschlagen, Karte ändern); (e) Navigation (Handy unten, Desktop oben) und fehlendes Guthaben.
3. **Was nicht gefragt wird:** Funktionen und Rechte (unverändert), Rechtstexte (Anwalt), Seiten außerhalb von Start und Lobby.
4. **Ergebnis:** „Ja“ → M3 startet in der Breite; „Ja mit Änderungen“ → Änderungsliste, nur diese Seiten, neue Abnahme der geänderten Bilder; „Nein“ → Gründe, zurück an Gestaltung (Impeccable `critique` neu).
5. **Vermerk zur Navigation:** „Navigation nur restylt, neue Struktur folgt in M3.“
6. **Zusammenfassung der Impeccable-Läufe** (Anzahl Funde, offene P1 mit Begründung) und die Test-Belege (typecheck, lint, Unit, Playwright inkl. AC-5: keine URL und keine Test-ID geändert).

## B6. Abhängigkeiten und Reihenfolge
```
M2-1 Tokens (worker-3)  ->  M2-2a Button  ->  M2-2b/M2-2c  \
                                     M2-3a Form/DateTimeField, M2-3b ConfirmDialog  ->  M2-5 format.ts
012 M3b (Fehlerzustand, Datenschutz-Fix, feat/charge-m3b, worker-1)  ----------------> M2b Lobby
Navigation (nur Restyle von Header/BottomNav und UserMenu M2-4a; AppNav M2-4b erst in M3)  --> M2b Start + Lobby
```
- **M2-1 bis M2-5** (s. o.) müssen gemergt sein; M2b nutzt `PageShell`, `PageHeader`, `StatusBadge`, `StateMessage`, `Button`, `ConfirmDialog`, `format.ts`.
- **012 M3b** (Fehlerzustand mit Grund und Nachzahl-Weg, Datenschutz-Fix „Dritte sehen neutral“, Benachrichtigung bei Fehlschlag) muss **vor der Lobby** in M2b stehen (Umbauplan Abhängigkeiten); der Branch `feat/charge-m3b` läuft bei worker-1. Ohne ihn zeigt die Lobby den Fehlerzustand nicht.
- **012 M6a-Teil für Start und Lobby:** Guthaben-Texte dieser Seiten und der Kopfleiste/des Menüs werden **in M2b** entfernt (sonst enthält die Abnahme Altmodell); der Rest von 012 M6a bleibt spätestens M3 (AC-14). Voraussetzung für M6a ist 012 M5 (Turnier auf Karte).
- **`begriffe.md`** gemergt und die zehn Entscheide von t9 gültig (die Seiten benutzen sie ab M2b).
- **Seed:** `scripts/seed-frontend.mts` und `card_payments_enabled = true`; `PAYMENTS_FAKE=1` nur für die Fake-Testkarte lokal (nicht in Produktion).
- **Gemeinsame Dateien seriell:** `globals.css` (M2-1), `layout.tsx`, `Header`, `BottomNav`, `i18n.ts`.
- **Seiten-Dateien von M2b:** `src/app/page.tsx`, `src/app/app/page.tsx`, `src/app/lobby/[id]/page.tsx` und deren Komponenten (`LobbyClient.tsx`, `FinalConfirm.tsx`, `Steps.tsx`, `CardForm.tsx`, `MyGames.tsx`, `GameModes.tsx`, `PlayerLight.tsx`, `Header.tsx`, `UserMenu.tsx`, `BottomNav.tsx`); zwei Writer parallel nur bei disjunkten Dateien (Start und Lobby sind disjunkt, die Navigation ist gemeinsam).

## B7. Aufwand (Task-Tage, ein Writer, grob)
| Posten | Tage |
|---|---|
| Start `/` und `/app` (Aufbau, Altmodell raus, Tests anpassen) | 1,5 bis 2 |
| Lobby (Aufbau „Dein Stand“, Hauptaktion je Rolle, StatusBadge, StateMessage, ConfirmDialog, Guthaben-Zweig raus) | 2,5 bis 3,5 |
| Navigation (nur Restyle von Header/BottomNav, Guthaben raus; `AppNav`-Bau in M3) | 1 |
| Screenshots, Vorher/Nachher, Impeccable (42 Durchgänge), Fixes der Funde | 1,5 bis 2 |
| Abnahmeschleife mit dem Nutzer (eine Änderungsrunde) | 0,5 bis 1 |
| **Summe M2b** | **7 bis 9,5** (davon etwa 5,5 bis 7,5 ohnehin in M3 geplant; zusätzlich entsteht vor allem die Abnahmeschleife, etwa 1,5 bis 3 Tage) |

Teil A (M2-5): 1,5 bis 2 Tage (A7). Die Umbauplan-Summe M2 (6 bis 8) und M3 (8 bis 10) ändert sich dadurch nicht in der Summe, wohl aber in der Reihenfolge.

## B8. Beleg-Befehle (Abnahme M2b)
`npm run typecheck`; `npm run lint`; `npm test`; `npx playwright test` (alle bisherigen E2E, AC-5: keine URL und keine Test-ID geändert; angepasst werden nur Tests, die Guthaben-Elemente prüfen, mit Begründung im PR); `npx playwright test tests/e2e/ui-regeln.spec.ts tests/e2e/a11y.spec.ts` (M2-2d) auf Start und Lobby; Screenshot-Skript B3; Suche in `src/app/page.tsx`, `src/app/app/page.tsx`, `src/app/lobby/[id]/page.tsx`, `Header.tsx`, `UserMenu.tsx`: kein „Guthaben“; Begriffe-Test (A2) grün; Impeccable-Protokoll (B4).

## B9. Entscheide (t9, 2026-11-11) und Risiken
Entschieden (t9, 2026-11-11): (1) Start = `/` und `/app`, 12 Pflichtbilder, Guthaben-Karte auf `/app` entfällt; (2) Navigation in M2b nur restylen, `AppNav` in M3; (3) 42 Durchgänge, Sub-Agents seriell, Degradiert offen ausweisen; (4) M2-4a `UserMenu`, M2-4b `AppNav` (Bau in M3); (5) Englisch mit Rückfall auf Deutsch (Teil A, AC 8). Offen ist davon nichts mehr; die folgenden Punkte sind Risiken.

1. **012 M3b noch nicht gemergt** (Branch `feat/charge-m3b`): blockiert den Fehlerzustand; Reihenfolge einhalten.
2. **Zeitzone/Seed-Zeiten:** Spiele liegen relativ zum Seed-Lauf (1 bis 6 Tage); Seed kurz vor den Screenshots neu aufrufen, sonst „abgelaufen“.
3. **Öffentliches Repository:** keine Screenshots, Pfade oder Mails ins Repo (CLAUDE.md); Anhänge nur am PR.
4. **Look-Entscheid ist subjektiv:** das Paket muss Vorher/Nachher und eine kurze Begründung der Hauptaktions-Regel enthalten, sonst bleibt „gefällt mir nicht“ ohne Richtung.
5. **Seriell statt parallel:** 42 Impeccable-Durchgänge nacheinander verlängern die Laufzeit der Abnahme; die Schätzung in B7 (1,5 bis 2 Tage) ist grob.
