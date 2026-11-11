# M3-Plan: Navigation und Einstieg (Vertrag 013, M3)
Stand: 2026-11-11 · Code-Stand `origin/main` 31e0aa2 · Verfasser: worker-4 (Plan, Doku, kein Code) · Status: Entwurf, Review offen

Zweck: Plan für M3 (Umbauplan: 8 bis 10 Task-Tage): `AppNav`, Start, Spiel suchen, Meine Spiele (`/app`), Lobby (Dein Stand, Hauptaktion, Captain-Leiste, Fehlerzustand), Neuling/Einladung/Onboarding, Turnierliste. Der Plan ändert keinen Code und keinen Vertrag. **Er trifft keine Entscheide; offene Punkte stehen als Fragen in Abschnitt 10.**

Quellen: `docs/design/umbauplan-013.md` (Abschnitt 2 und M3-Zeile, Branch `docs/013-freigabe`), Vertrag 013 (AC-1 bis AC-15, Meilenstein M3), Vertrag 007 (AC-1 bis AC-4: Leiste, „Meine Spiele“, Begriffe), `docs/design/analyse-frontend-verdichtung.md` (Cluster K06, K08, K11, K12, K14; Top-30-Funde), die Funde der Analysen X/Y1/Y2 mit den im Text genannten IDs, `docs/design/begriffe.md` (Branch `docs/begriffe-entwurf`, Entscheide 1 bis 10 von t9), `docs/design/m2-komponenten-plan.md` (M2-2/M2-3), `docs/design/m2b-und-m2-5-plan.md` (M2b, M2-5), Backlog 58 und 63.

## 1. Rahmen

### 1.1 Reihenfolge und Voraussetzungen (bindend, Backlog 63 / AC-14)
M2 (M2-1 bis M2-5) → M2b (Look-Abnahme Start/Lobby, Option B) → 012 M3b bis M5 → 012 M6a → **M3** → Pilot-Test → M4 bis M8. **M3 beginnt erst, wenn 012 M5 gemergt und M6a durch ist.** Daraus folgt für M3:
- Die Komponenten aus M2-2/M2-3 (`Button`/`LinkButton`/`IconButton`, `PageShell`/`PageHeader`/`PageTitle`/`SkipLink`, `StateMessage`, `StatusBadge`, `Form`/`Field`/`DateTimeField`, `ConfirmDialog`), `format.ts`/`begriffe.ts` (M2-5), `UserMenu` (M2-4a) sind vorhanden. M2-4b (`AppNav`) ist in M2 nur vorbereitet; **der Bau von `AppNav` ist M3**.
- Guthaben ist in Oberfläche und Texten weg (M6a); der Altpfad der Lobby (`!cardOn`) ist damit entfernt oder steht zur Entfernung (M6b: Code). M3 baut **nur das Kartenmodell**.
- Die Seiten Start `/` und Lobby wurden in M2b schon im neuen Look abgenommen; M3 setzt sie in der Breite fertig (Hauptaktion je Rolle, Captain-Leiste, vollständige Zustände), übernimmt aber die in M2b abgenommene Gestaltung.
- Der Look-Entscheid des Nutzers (AC-13, „Ja“) liegt vor; ohne ihn beginnt M3 nicht in der Breite.

### 1.2 Regeln für jeden Task
- Nativ plus eigene Bausteine (ADR 0002), keine neue Abhängigkeit; nur Tokens aus `globals.css`; Begriffe nach `begriffe.md` (z. B. „Findet statt“, „Preis steht fest“, Knopf „Preis bestätigen“, „Karte ändern“, „Zahlung ausstehend“/„Abbuchung fehlgeschlagen“, „Verlassen“, „Captain“, „Nachrücker“); Zahlen/Datum über `format.ts`; keine URL und keine Test-ID ändern (AC-5), außer in den benannten, freigegebenen Fällen (Abschnitt 8).
- Jeder UI-PR: alle **sechs** Impeccable-Befehle einzeln (critique, audit, distill, clarify, adapt, polish) je Seite und Rolle (AC-6, AC-15), „Degradiert/Blockiert“ sofort `NEEDS-USER` (spätestens 15 Minuten), Screenshots vorher/nachher, Web Interface Guidelines (sobald der Skill nach Backlog 52 freigegeben ist, AC-12). Sub-Agents seriell.
- Reviewer ≠ Writer; Merge nach Merge-Regel durch den Task Manager.

### 1.3 Gemeinsame Dateien (seriell, nie parallel)
`src/app/layout.tsx`, `src/components/Header.tsx`, `src/components/BottomNav.tsx`, `src/components/UserMenu.tsx`, `src/components/Footer.tsx`, `src/lib/i18n.ts`, `src/app/globals.css` (nach M2-1 bei worker-3 bzw. dem M2-Stand). Das neue Link-Modell (M3-1) ist die Basis für alle anderen Teilbereiche; die Seiten-Tasks (M3-2 bis M3-5) fassen diese Dateien **nicht** an.

## 2. Teilbereich A: AppNav (K11, K14), Task M3-1

### 2.1 Bestand (Code 31e0aa2)
- `src/components/BottomNav.tsx` (68 Zeilen): fünf Einträge, Teamspiel (`/matchmaking`), Privatspiel (`/app/privatspiel/neu`), Mittelknopf „Spiel suchen“ (`/suche`), Turniere (`/turniere`), Profil (`/app`); aktive Seite per `aria-current` und Strich; nur auf dem Handy (`sm:hidden`).
- `src/components/Header.tsx` (79 Zeilen): Logo, Links „Offene Lobbys“ (`/suche`), „Livescore“ (`/spiele`), „Rangliste“ (`/rangliste`) ab `sm`, Glocke mit Zähler, Guthaben-Betrag (`header-wallet`), `UserMenu`, oder „Anmelden“. **Eigene Linkliste, getrennt von der BottomNav** (zwei Modelle).
- `src/components/UserMenu.tsx` (97 Zeilen): Profil, Mein Bereich, Guthaben, Benachrichtigungen, Konto und Einstellungen, Admin, Abmelden.
- `src/components/Footer.tsx` (28 Zeilen): **14 Links** (Hilfe, Kontakt, Livescore, Rangliste, Teams, Impressum, Datenschutz, AGB, Hausordnung, Lobby aufmachen, Spieler, Hallen, Mitspieler gesucht, „Für Hallenbetreiber“) und Sprachumschalter (Fund Y2-C-25: 14 Textlinks).
- Funde: X-06 (falscher aktiver Reiter, Gäste sehen Reiter für Angemeldete), Y1-GD-26 (Navigation kennt kein „Turniere“ in Kopfleiste/Fußzeile; `Header.tsx:26-35`, `Footer.tsx:10-23`), K11 (145 Funde), K14 (65 Funde: stille Sperren, Rolle nicht sichtbar).

### 2.2 Ziel (Umbauplan Abschnitt 2, K11)
- **Ein Link-Modell** (z. B. `src/lib/nav.ts`: Ziele, Matcher, Icons, Rollenbereiche) für `Header` (ab `sm`) und `BottomNav` (Handy): **fünf Ziele: Start/Meine Spiele, Spiel suchen (Mittelknopf, Orange), Turniere, Team, Profil.** `AppNav` (M2-4b) rendert beide Darstellungen aus diesem Modell.
- Aktiver Eintrag mit `aria-current="page"` und **Wort** (nicht nur Strich/Farbe).
- Rollenbereiche (Hallenbetreiber, Admin) im **Profilmenü** (`UserMenu`), nicht in der Hauptnavigation; die Rolle steht im Menü (K14).
- Fußzeile **nur Rechtliches** (Impressum, Datenschutz, AGB, Hausordnung, Hilfe, Kontakt, Sprache); die übrigen 8 Links wandern in die Navigation oder entfallen (Frage F2).
- Gäste: Mittelknopf führt zur Suche, Profil zur Anmeldung (007 AC-2); Gäste sehen keine Reiter für Angemeldete (X-06).

### 2.3 Dateien
`src/lib/nav.ts` (neu), `src/components/AppNav.tsx` (neu, M2-4b-Vorbereitung ausbauen), `src/components/Header.tsx`, `src/components/BottomNav.tsx`, `src/components/UserMenu.tsx`, `src/components/Footer.tsx`, `src/app/layout.tsx` (Skip-Link und `PageShell`, siehe `m2-komponenten-plan.md` Schritt C), `src/lib/i18n.ts` (Schlüssel `nav.*`), Tests.

### 2.4 Komponenten aus M2
`LinkButton`/`IconButton` (Glocke), `StatusBadge` (ungelesen), `SkipLink`, `UserMenu` (M2-4a), `format.ts` (Zähler).

### 2.5 ACs
1. Genau ein Link-Modell; Header und BottomNav zeigen dieselben fünf Ziele in derselben Reihenfolge und Beschriftung (Unit-Test: beide Darstellungen aus demselben Array).
2. Aktiver Eintrag: `aria-current="page"` **und** sichtbares Wort; der Matcher markiert für jede Seite genau einen Eintrag (E2E über alle Zielrouten); der in X-06 beschriebene Fehlmatch ist behoben.
3. Touch-Ziele ≥ 44 px, Mittelknopf Orange nur für „Spiel suchen“ (K09), kein horizontales Scrollen auf 390 px (AC-3).
4. Tastatur: Tab-Reihenfolge Skip-Link → Navigation → Inhalt, Fokus-Ring sichtbar (AC-4).
5. Rollenbereiche nur im Profilmenü; ein Spieler sieht keinen Hallen- oder Admin-Eintrag; die Rolle steht im Menü (K14).
6. Fußzeile enthält nur die vereinbarten Rechtliches-Links; „Turniere“ ist in der Navigation (Y1-GD-26).
7. Hell und dunkel, nur Tokens (AC-10).
8. Guthaben-Rest (Kopfleiste/Menü) ist nach M6a entfernt; M3 baut ihn nicht neu.

### 2.6 Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test -- tests/unit/nav.test.ts` (neu); `npx playwright test tests/e2e/basics.spec.ts tests/e2e/a11y.spec.ts tests/e2e/ui-regeln.spec.ts` (Navigation Handy 390 und Desktop 1280, Gast/Spieler); bestehende Tests, die die alte Leiste prüfen, siehe Abschnitt 8.

## 3. Teilbereich B: Meine Spiele `/app` (K06, K08), Task M3-2

### 3.1 Bestand
- `src/app/app/page.tsx` (123 Zeilen): `h1` „Hey {Name}“ (`:28`), `MyGames` (`:32`), `Challenges` (`:34`), Kasten „So startest du“ (`:37-46`), `GameModes` (`:51`), Kachelraster (`:62-66`), Liste „Meine Spiele“ (`:69-93`, **eine flache Liste** der Spiele ohne Gruppen), „Meine Teams“ (`:96ff`). Nach M2b/M6a sind Guthaben-Karte und Fünf-Kachel-Raster entfernt.
- `src/components/MyGames.tsx` (47 Zeilen): Kasten „Mein aktuelles Spiel“ mit Spielen und eigenen offenen Lobbys; Knopf „Zur Lobby“ `btn-primary !min-h-9` (36 px, Fund K02).
- `src/server/lobby.ts:606` `myMatches` liefert `id, startsAt, status, durationMin, homeName, awayName` **ohne `kind`** (Team/Privat/Turnier): die Gruppierung nach Modus braucht `matches.kind` (`kind` existiert im Schema, `lobby.ts:61`); Änderung an `myMatches` (Server) und `src/server/mygame.ts`.
- Funde: N4-FZ-1 (Fehlerzustand auf `/app` nirgends sichtbar, `mygame.ts:60`), K06, K08, `/app`: 33 Funde (16 P1).
- Vertrag 007 AC-3 (schon gültig): „Meine Spiele“ in Gruppen Teamspiele, Privatspiele, Turniere; Turnierliste zeigt Status; Weg bis Anstoß in vier Stationen, jetzige Station orange, Teamfarben als kleine Marken.

### 3.2 Ziel
- `PageHeader` mit **„Dein Stand“** (nächstes Spiel, was fehlt) und **einer Hauptaktion** (z. B. nächste Handlung im nächsten Spiel; ohne Spiel: „Spiel suchen“).
- „Meine Spiele“ **nach Modus gruppiert** (Teamspiele, Privatspiele, Turniere), je Spiel Status mit `StatusBadge` (Wort + Symbol) und Station im Weg bis Anstoß; Fehlerzustand (z. B. „Abbuchung fehlgeschlagen“) als `StateMessage`-Hinweis oben (N4-FZ-1).
- Leerzustand: Titel, Grund, genau eine nächste Handlung (K08).
- „Meine Teams“ darunter; „Team gründen“ ≥ 44 px.

### 3.3 Dateien
`src/app/app/page.tsx`, `src/components/MyGames.tsx`, `src/components/GameModes.tsx`, `src/components/Challenges.tsx` (nur Optik), `src/server/lobby.ts` (`myMatches`: `kind` ergänzen), `src/server/mygame.ts` (`phase`, Zeile 60: Text „Findet statt (Preis folgt)“), `src/lib/result-rules.ts` (`PHASE_LABEL`), Tests.

### 3.4 Komponenten aus M2
`PageShell`, `PageHeader` („Dein Stand“, Hauptaktion), `StatusBadge`, `StateMessage`, `Button`/`LinkButton`, `format.ts` (`formatDateRange`, `formatCount`).

### 3.5 ACs
1. Gruppen Teamspiele/Privatspiele/Turniere (007 AC-3), leere Gruppen ausgeblendet; Reihenfolge nach Anstoß.
2. Genau eine Hauptaktion; „Dein Stand“ nennt Zustand mit den Begriffen aus `begriffe.md` („Findet statt“, „Preis steht fest“, „Zahlung ausstehend“ für Dritte, „Abbuchung fehlgeschlagen“ für Betroffene/Captain).
3. Ein Fehlerzustand (fehlgeschlagene Abbuchung) ist auf `/app` sichtbar mit Grund und „Karte ändern“ (N4-FZ-1, 012 AC-20); für Dritte nie namentlich (K12).
4. Alle Knöpfe ≥ 44 px, `h1` genau eine, kein horizontales Scrollen 390 px.
5. Leerzustand mit Titel, Grund, einer Handlung (K08).
6. Die bestehenden Test-IDs (`my-games`, `my-game`, `my-open-lobby`, `first-steps`, `game-modes`, `mode-*`) bleiben (AC-5).

### 3.6 Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test -- tests/unit/mygame.test.ts` (neu: Gruppierung nach `kind`); `npm run test:integration -- tests/integration/…` (falls `myMatches` Integrationstests hat); `npx playwright test tests/e2e/phase4.spec.ts tests/e2e/matchmaking.spec.ts tests/e2e/privatspiel.spec.ts tests/e2e/basics.spec.ts` (Teile, die `my-games`, `game-modes`, `first-steps` nutzen).

## 4. Teilbereich C: Lobby (K06, K08, K12), Task M3-3

### 4.1 Bestand (`src/app/lobby/[id]/page.tsx`, 417 Zeilen, plus `LobbyClient.tsx` 245, `FinalConfirm.tsx` 39, `Steps.tsx`, `CardForm.tsx`, `VetoPanel.tsx`, `SchedulingPanel.tsx`, `PrivateTools.tsx`, `ChallengePanel.tsx`, `VenueBox.tsx`)
Aufbau und Zeilen siehe `m2b-und-m2-5-plan.md` B2.2: `h1` `:147`, Schritt-Chips `Steps` `:192`, Hallenanfrage `:195`, Spielort `:245-250`, Kosten `:253-310`, Kader `:331-375`, Ersatzspieler `:381`, `FinalConfirm` `:397`, `CancelForm` `:414`. Der Satz **„Das Spiel gilt als bestätigt, sobald in beiden Teams mindestens 4 Spieler bereit sind“ steht bei `page.tsx:238`; `:286` sagt „Mit dem Bestätigen beider Captains steht er fest“** (Fund Y1-CD-03: Widerspruch auf einer Seite).
- Funde: 140 auf `/lobby/[id]` (106 P1); Y1-XM-01 (Fehlerzustand ohne Grund, Frist, Nachzahl-Weg), Y1-XM-06 („Zahlung ausstehend“ fehlt, `PlayerLight` zeigt allen den Fehler), Y1-GM-07 (Gast sieht Zahlstatus namentlich), Y1-CM-01/Y1-CD-01 (Captain-Handlungen über ~2100 px verteilt, „Spiel bestätigen“ zuletzt), Y1-SD-01 (Bereit unter dem Falz), Y1-SD-02 (eigener Stand nicht sichtbar), Y1-GM-04 (Schritt-Chips wie Knöpfe).
- Nach M2b/012 M3b: „Dein Stand“-Block und Datenschutz-Fix („Dritte sehen neutral“) existieren teilweise; M3 vervollständigt.

### 4.2 Ziel
- **„Dein Stand“-Block** (Wort + `StatusBadge`) und **genau eine Hauptaktion je Rolle und Zustand** (Tabelle `m2b-und-m2-5-plan.md` B2.3: Gast „Anmelden und beitreten“, Spieler „Beitreten“/„Karte hinterlegen“/„Bereit machen“, Captain „Uhrzeit wählen“/„Hallen bannen“/„Preis bestätigen“).
- **Captain-Leiste unten (Handy)**: die Captain-Handlungen (Preis bestätigen, Absage) in der festen Aktionsleiste; Desktop rechts im Kopf. Löst Y1-CM-01/Y1-CD-01.
- **Fehlerzustand** (`StateMessage`): „Abbuchung fehlgeschlagen“ mit **Grund** und Weg „**Karte ändern**“ (012 M3b, AC-12/AC-20); alle anderen sehen nur „Zahlung ausstehend“.
- **Y1-CD-03 beheben:** `page.tsx:238` und `:286` zu einer Aussage: „Findet statt, sobald in beiden Teams mindestens 4 bereit sind“ (Stufe 1) und „Preis steht fest, sobald beide Captains bestätigen“ (Stufe 2), Knopf „Preis bestätigen“ (`FinalConfirm.tsx:8-14`, Entscheid 8).
- Texte: `mygame.ts:60` „Findet statt (Preis folgt)“; Benachrichtigung `match.confirmed` (`lobby.ts` ca. 249) „Spiel bestätigt“ wird „Spiel findet statt“ (Umbauplan M3).
- Schritte als Fortschrittsanzeige ohne Knopfoptik (Y1-GM-04); Kader mit `StatusBadge`, Dritte neutral; „(du)“ im Kader (Y1-SD-02).
- Native `confirm()` (`LobbyClient.tsx:113,211`) → `ConfirmDialog` („Lobby verlassen“, „Spieler entfernen“).
- Kartenmodell only; Altpfad weg (M6a/M6b).

### 4.3 Dateien
`src/app/lobby/[id]/page.tsx`, `LobbyClient.tsx`, `FinalConfirm.tsx`, `Steps.tsx`, `CardForm.tsx`, `VetoPanel.tsx`, `SchedulingPanel.tsx`, `PrivateTools.tsx`, `ChallengePanel.tsx`, `VenueBox.tsx`, `src/components/LobbyBoard.tsx`, `src/components/PlayerLight.tsx` (→ `StatusBadge`), `src/lib/card-view.ts`, `src/server/lobby.ts` (Texte), `src/server/mygame.ts` (Text), `src/lib/lobby-rules.ts` (nur lesen), Tests.

### 4.4 Komponenten aus M2
`PageHeader` („Dein Stand“, Hauptaktion, Handy-Leiste), `StatusBadge`, `StateMessage`, `Button`, `ConfirmDialog`, `Form`/`Field` (Spielort, Absage-Grund), `DateTimeField` (Terminvorschlag), `format.ts`.

### 4.5 ACs
1. Genau eine `h1`, ein „Dein Stand“-Block, **genau eine** Hauptaktion je Rolle/Zustand (Tabelle), am Handy in der festen Leiste im ersten Bildschirm erreichbar, Captain-Leiste unten (390 px).
2. Fehlerzustand zeigt Grund und „Karte ändern“ für Betroffenen/Captain, „Zahlung ausstehend“ für Dritte, nichts namentlich für Gäste (012 AC-12/AC-20, K12).
3. Y1-CD-03: keine zwei widersprüchlichen Sätze mehr; Begriffe nach `begriffe.md` (Test: Begriffe-Ratsche grün, Datei `lobby/[id]/*` ohne verbotene Synonyme).
4. Kein Guthaben, keine Reservierung, keine Legende des Altpfads sichtbar; Kader-Anzeige ohne `PlayerLight`.
5. Bestehende Test-IDs und Abläufe bleiben (`card-ready-text`, `card-confirm`, `card-use-stored`, `hall-check`, `due-hint`, `invite-admin`, `final-confirm`, …; AC-5), alle E2E in `lobby.spec.ts`, `karte-lobby.spec.ts`, `payments.spec.ts`, `privatspiel.spec.ts`, `teamspiel-ablauf.spec.ts` grün.
6. Native `confirm()` in der Lobby ersetzt durch `ConfirmDialog` (Fokus, Escape, Fokusrückgabe).
7. Kontrast, Touch ≥ 44 px, Tastatur (AC-3, AC-4), hell/dunkel.

### 4.6 Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test`; `npm run test:integration` (Lobby-Server berührt: `lobby.ts` Textänderung); `npx playwright test tests/e2e/lobby.spec.ts tests/e2e/karte-lobby.spec.ts tests/e2e/payments.spec.ts tests/e2e/privatspiel.spec.ts tests/e2e/teamspiel-ablauf.spec.ts tests/e2e/matchmaking.spec.ts`; Begriffe-Test; Screenshot-Matrix Abschnitt 9.

## 5. Teilbereich D: Neuling, Einladung, Onboarding (K15, K08), Task M3-4

### 5.1 Bestand
- `src/app/willkommen/page.tsx` (22 Zeilen): `h1` „Willkommen bei Socaz“, Formular `OnboardingForm.tsx` (58 Zeilen); leitet nach `next` weiter, wenn `onboardedAt` gesetzt ist. **Kein Hinweis, woher der Neuling kommt** (Fund Y1-XM-35: alle Einladungslinks enden auf derselben Seite ohne Hinweis).
- `src/app/einladung/[token]/page.tsx` (49 Zeilen): Team-Einladung; Neuling wird zu `/willkommen?next=…` umgeleitet (`:14`); Text „Spieler/Spieler“ (`:29`, beide Zweige gleich, siehe M2-5); „Team-Admin“ (`:17,20`, wird „Captain“). Fund SM-EL-1: bestehendes Mitglied wird nicht erkannt, Klick endet still.
- `src/app/spiel/[token]/page.tsx`: Privatspiel-Einladung; Neuling zu `/willkommen?next=…` (`:15`), ungültiger Link nur mit Titel/Text.
- `src/app/lobby/[id]/LobbyClient.tsx:125-127` „Dir fehlt ein Team? Biete dich als Ersatzspieler an“ (Fund Y1-XD-48/Y1-XM-38: Neuling wird auf der Lobby nicht zum Onboarding geführt; erst die Aktion löst die Weiterleitung aus).
- `src/app/unter-16/page.tsx` (Endseite Unter 16; Inhalt und Regel sind **Rechtsfrage** und werden hier nicht geplant).
- Funde: `/einladung/[token]` 24 (13 P1), `/willkommen` 21 (10 P1), `/spiel/[token]` 14.

### 5.2 Ziel
- **Einladungshinweis auf `/willkommen`:** Der Neuling sieht, wozu er eingeladen wurde („Du wurdest zu {Team/Spiel} eingeladen“) und was nach den Angaben folgt; dafür liest die Seite die Einladung aus `next` (nur Anzeige, keine neuen Rechte).
- Onboarding als `Form` mit Feldgruppen, Pflichtmarke, einer Speichern-Handlung (K15); Stadtliste mit Weg für „andere Stadt“ (Fund N1-WK-3), „Flexibel“ erklärt.
- Einladungsseiten als `StateMessage` für ungültig/abgelaufen mit einer nächsten Handlung; Mitglied erkannt (SM-EL-1); „Captain“ statt „Team-Admin“; Plural über `formatCount`.
- Lobby: Neuling wird an der Stelle zum Onboarding geführt, an der er sonst stecken bleibt (Y1-XM-38), mit Rückkehr zur Lobby.
- Kein Guthaben-/Zahlungs-Text im Onboarding.

### 5.3 Dateien
`src/app/willkommen/page.tsx`, `OnboardingForm.tsx`, `src/app/einladung/[token]/page.tsx`, `JoinForm.tsx`, `src/app/spiel/[token]/page.tsx`, `src/app/lobby/[id]/LobbyClient.tsx` (nur die Neuling-Stelle; **Abstimmung mit M3-3**, Datei gehört dort), `src/server/teams.ts` (`getInvitePreview`), `src/server/privategame.ts` (`getGameInvitePreview`), Tests.

### 5.4 Komponenten aus M2
`Form`/`Field`, `StateMessage`, `PageShell` (schmal), `PageHeader`, `Button`/`LinkButton`, `format.ts`.

### 5.5 ACs
1. `/willkommen` zeigt bei `next` auf eine Einladung den Einladungshinweis (Team- oder Spielname), bei anderem `next` nichts Falsches; Parameter wird wie bisher durch `safeInternalPath` geprüft (Sicherheit, 013 K-Regel).
2. Ungültige/abgelaufene Einladung: Titel, Grund in einem Satz, genau eine Handlung (K08); Bestandsmitglied wird erkannt und bekommt „Zum Team“.
3. Formular: Pflichtmarke mit Wort, Fehler am Feld, eine Speichern-Handlung, Felder ≥ 44 px (K15).
4. Wörter: „Captain“ statt „Team-Admin“, korrekter Plural, keine Fachwörter ohne Erklärung (AC-7).
5. Der Neuling auf der Lobby kommt über das Onboarding zurück zur Lobby (E2E).
6. Datenschutz/Unter 16: Verhalten unverändert; die Endseite wird hier nicht inhaltlich geändert (Rechtsfrage, G16-013/G17-013).
7. Bestehende Test-IDs/URLs bleiben (AC-5).

### 5.6 Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test`; `npx playwright test tests/e2e/team-invite.spec.ts tests/e2e/privatspiel.spec.ts tests/e2e/turnier-ablauf.spec.ts tests/e2e/basics.spec.ts` (Einladung, Onboarding, Unter-16); neue E2E „Einladung → Willkommen mit Hinweis → Rückkehr“.

## 6. Teilbereich E: Turnierliste und Turnier-Phasen (K06, K10), Task M3-5

### 6.1 Bestand
- `src/app/turniere/page.tsx` (65 Zeilen): Liste mit `STATUS = { registration: "Kader füllen", payment: "Zahlung läuft", running: "Läuft", finished: "Beendet", cancelled: "Abgesagt" }` (`:11`); Formate `FORMAT` (`:10`); Hinweis nur freigeschaltete Veranstalter (`:38`).
- `src/app/turniere/[id]/page.tsx` (291 Zeilen): `h1` (`:65`), Gast-Knopf „Anmelden und mitmachen“ (`:84`) **in allen Phasen** (Y1-GM-21), „So läuft es ab“ (`:95-101`) mit „Ampel wird grün“, Preisinfo `reservation-info` (`:111`), Veranstalter-Block (`:118-134`), Dashboard (`:136ff`), Turnier-Lobby (`:186ff`) mit Kaderlisten (Zahlstatus des Spielers erst nach vier Teamlisten, Y1-SM-29), `Bracket` (`BracketView.tsx`).
- Funde: `/turniere/[id]` 54 (46 P1), `/turniere` 14 (10 P1); Jargon (K.-o.-System, Kader füllen, vollzählig, Bracket; Y1-GD-24, Y1-SM-32).

### 6.2 Ziel
- Phasen als **Status mit Wort + Symbol** (`StatusBadge`): Anmeldung, Zahlung, Läuft, Beendet, Abgesagt; „Zahlung läuft“ wird zu den Begriffen aus `begriffe.md` („Zahlung ausstehend“ je Spieler; Turnier-Phase: Wortwahl offen, Frage F5). Turnier-„Bereit“ heißt „**Team bereit**“.
- Je Phase **eine** Hauptaktion je Rolle; „Anmelden und mitmachen“ nur in der Anmeldephase (Y1-GM-21).
- Eigener Zahlstatus des Spielers im „Dein Stand“-Block oben (Y1-SM-29); Dritte sehen neutral.
- Jargon erklärt (Kurztexte), Metazeile auf wenige Angaben (Y1-SM-32).
- Turnierliste: Status je Eintrag, Sortierung, eigene Turniere zuerst (007 AC-3).
- Voraussetzung: 012 M5 (Turnier auf Karte) ist gemergt; M3 baut keine Zahlungslogik.

### 6.3 Dateien
`src/app/turniere/page.tsx`, `src/app/turniere/[id]/page.tsx`, `BracketView.tsx`, `RegisterForm.tsx`, `CopyLink.tsx`, `src/components/OpenSearches.tsx` nicht; `src/server/tournaments.ts` (nur Texte: „Der Preis steht fest“ `:325`, „Bereit“ `:276-281`), Tests.

### 6.4 Komponenten aus M2
`PageHeader` („Dein Stand“), `StatusBadge`, `StateMessage` (leer/abgesagt), `Button`/`LinkButton`, `ConfirmDialog` (Team entfernen/abmelden → „Team verlassen“, Absagen), `format.ts`.

### 6.5 ACs
1. Jede Phase hat genau eine Hauptaktion je Rolle; Gast sieht „Anmelden und mitmachen“ nur in der Anmeldephase.
2. Phasen und Zahlstatus mit Wort + Symbol + Farbe (K10); Dritte neutral (012 AC-12).
3. Eigener Zahlstatus des Spielers im ersten Bildschirm.
4. Begriffe nach `begriffe.md` (Team bereit, Preis steht fest, Verlassen, Entfernen); Fachwörter erklärt (AC-7).
5. Native `confirm()` der Turnierseite (über `ActionButton`/`confirm=`) → `ConfirmDialog`.
6. Bestehende Test-IDs/URLs bleiben (AC-5): `tournament-name`, `reservation-info`, …

### 6.6 Beleg-Befehle
`npm run typecheck`; `npm run lint`; `npm test`; `npm run test:integration` (Textänderungen in `tournaments.ts`); `npx playwright test tests/e2e/turnier-ablauf.spec.ts tests/e2e/phase4.spec.ts tests/e2e/payments.spec.ts`.

## 7. Task-Schnitt, Reihenfolge, Writer
| Task | Inhalt | Dateien (Kern) | Voraussetzung |
|---|---|---|---|
| M3-1 | AppNav, Link-Modell, Header/BottomNav/Footer/UserMenu, Layout | `lib/nav.ts`, `AppNav.tsx`, `Header.tsx`, `BottomNav.tsx`, `Footer.tsx`, `UserMenu.tsx`, `layout.tsx`, `i18n.ts` | M2 komplett, 012 M5 + M6a, M2b „Ja“ |
| M3-2 | Meine Spiele `/app` | `app/app/page.tsx`, `MyGames.tsx`, `GameModes.tsx`, `lobby.ts` (`myMatches`), `mygame.ts` | M3-1 gemergt (Navigation steht) |
| M3-3 | Lobby | `app/lobby/[id]/*`, `LobbyBoard.tsx`, `PlayerLight.tsx`, `card-view.ts` | M3-1, 012 M3b |
| M3-4 | Neuling/Einladung/Onboarding | `app/willkommen/*`, `app/einladung/*`, `app/spiel/*` | M3-1 |
| M3-5 | Turnierliste/Phasen | `app/turniere/*`, `tournaments.ts` (Texte) | M3-1, 012 M5 |
| M3-6 | Abnahme-Lauf: Impeccable-Protokoll, Screenshots, Fixes | – | M3-2 bis M3-5 |

- **Writer:** M3-1 zuerst (allein, wegen gemeinsamer Dateien). Danach höchstens **2 Writer** parallel, jeweils zwei Tasks mit disjunkten Dateien: (M3-2 ‖ M3-3) oder (M3-4 ‖ M3-5). M3-2 und M3-3 sind disjunkt (kein gemeinsames Modul außer `lobby.ts`: M3-2 ändert nur `myMatches`, M3-3 nur Texte und Kartenpfad; **vor dem Start abstimmen oder seriell**). M3-3 ändert `LobbyClient.tsx`, M3-4 braucht dort eine Stelle (5.3): M3-4 danach oder die Stelle in M3-3.
- `i18n.ts` bleibt gemeinsame Datei: neue Schlüssel nur in einem Commit je Task, in dem die Konflikte auflösbar sind (Frage F6).
- Reviewer ≠ Writer je Task; Review von Datei + Impeccable-Belegen.

## 8. Bestehende Tests und freigabepflichtige Ausnahmen (AC-5)
Diese Tests prüfen die heutige Navigation oder Texte und würden brechen; jede Änderung ist eine **begründete Ausnahme von AC-5** und braucht eine Freigabe (Frage F1):
- `tests/e2e/basics.spec.ts:258-300` („Untere Leiste (Handy): Teamspiel, Privatspiel, Mittelknopf Spiel suchen, Turniere, Profil“) und `:303` (Gäste-Leiste): erwarten die Einträge **Teamspiel** und **Privatspiel** (Vertrag 007 AC-1, Nutzerentscheid Q6 vom 2026-11-10); `AppNav` laut Umbauplan hat **Start, Spiel suchen, Turniere, Team, Profil**. Das ist ein **Widerspruch** zwischen Vertrag 007 AC-1 und dem Umbauplan (Frage F1).
- `tests/e2e/basics.spec.ts:28-36` ist durch M2b/M6a schon angepasst (Guthaben).
- `tests/e2e/matchmaking.spec.ts:78-80` (`my-games`, `my-game`, „Zur Lobby“) und `tests/e2e/privatspiel.spec.ts:17-18` (`game-modes`, `mode-team`): bleiben, solange die Test-IDs bleiben.
- Hilfe-Texte und `i18n.test.ts`: nach M2-5 angepasst.

## 9. Impeccable-Durchgänge und Screenshot-Matrix
Sechs Befehle **einzeln** (critique, audit, distill, clarify, adapt, polish) je Seite und Rolle (AC-6, AC-15); Sub-Agents seriell. Vorschlag zur Zählung (Seite × Rolle):
| Teilbereich | Seite × Rolle | Kombinationen | Durchgänge (×6) |
|---|---|---|---|
| A AppNav | Start `/`: Gast, Spieler, Captain; `/app` mit Hallenbetreiber und Admin-Menü: Betreiber, Admin | 5 | 30 |
| B Meine Spiele | `/app`: Neuling (leer), Spieler, Captain | 3 | 18 |
| C Lobby | Gast, Spieler, Captain, Veranstalter (Privatspiel) | 4 | 24 |
| D Onboarding | `/willkommen`: Neuling; `/einladung/[token]`: Gast, Spieler; `/spiel/[token]`: Gast, Spieler | 5 | 30 |
| E Turniere | `/turniere`: Gast, Spieler; `/turniere/[id]`: Gast, Spieler, Captain, Veranstalter | 6 | 36 |
| **Summe** | | **23** | **138** |
Die Zählung ist ein Vorschlag aus AC-15; eine Kürzung ist ein Entscheid (Frage F3). Dazu kommen die bereits in M2b gelaufenen Durchgänge für Start `/`, `/app` und Lobby (42), die nur bei Änderungen wiederholt werden.

**Screenshot-Matrix** (je Seite/Zustand 4 Varianten: 390 und 1280 px × hell und dunkel; Seed `scripts/seed-frontend.mts`, Schalter `card_payments_enabled = true`, Anhänge am PR, nicht im Repo):
| Teilbereich | Seiten/Zustände | Bilder |
|---|---|---|
| A | Start `/` Gast und Spieler, Profilmenü offen (Spieler, Betreiber/Admin) | 16 |
| B | `/app` leer, Spieler, Captain mit Fehlerzustand | 12 |
| C | Lobby: Gast, Spieler (Karte fehlt, bereit), Captain (Preis bestätigen), Fehlerzustand | 20 |
| D | `/willkommen` (mit Einladungshinweis), Einladung gültig/abgelaufen, Spiel-Einladung gültig/abgelaufen | 20 |
| E | `/turniere`, `/turniere/[id]` in Anmeldung, Zahlung, Läuft, Beendet | 20 |
| **Summe** | | **88** |

## 10. Risiken, Aufwand, offene Fragen

### 10.1 Aufwand (Task-Tage, ein Writer; Umbauplan: M3 = 8 bis 10)
| Posten | Tage |
|---|---|
| M3-1 AppNav, Link-Modell, Footer, Profilmenü | 1,5 bis 2 |
| M3-2 Meine Spiele (inkl. `kind` im Server) | 1,5 bis 2 |
| M3-3 Lobby (Aufbau aus M2b vervollständigen, Captain-Leiste, Texte) | 2 bis 2,5 |
| M3-4 Onboarding/Einladung | 1 bis 1,5 |
| M3-5 Turnierliste/Phasen | 1,5 bis 2 |
| M3-6 Impeccable (138 Durchgänge), Screenshots (88), Fixes | 1,5 bis 2 |
| **Summe** | **9 bis 12** (Umbauplan: 8 bis 10; Abweichung durch die Zählung der Impeccable-Läufe und die Gruppierung in Meine Spiele) |
Zwei Writer parallel verkürzen die Laufzeit, nicht die Task-Tage.

### 10.2 Risiken
1. **Widerspruch 007 AC-1 / Umbauplan:** Die Leiste mit Teamspiel/Privatspiel (Nutzerentscheid Q6) steht gegen die fünf Ziele der `AppNav`; E2E `basics.spec.ts:258-300` bricht (Abschnitt 8, F1).
2. **Voraussetzungen verzögern M3:** 012 M3b bis M5 und M6a liegen davor; ohne sie gibt es keinen Fehlerzustand, kein Turnier auf Karte und noch Guthaben-Reste.
3. **Gemeinsame Dateien:** `layout.tsx`, `Header`, `BottomNav`, `UserMenu`, `Footer`, `i18n.ts` verlangen M3-1 zuerst und seriell.
4. **Server-Änderung in „Meine Spiele“:** `myMatches` braucht `kind`; Integrationstests und `mygame.ts` prüfen, damit keine Zahlungs-/Rechtepfade berührt werden (Datenschutz: nur eigene Spiele).
5. **Umfang:** 138 Impeccable-Durchgänge und 88 Bilder sind der größte Einzelposten; ein „Degradiert“ verzögert (sofort `NEEDS-USER`).
6. **Pilot:** M3 muss vor dem Pilot gemergt sein; jede Verzögerung verschiebt den Pilot (`pilot-plan.md`).
7. **Rechtstexte unberührt:** Die Begriffsabweichungen in AGB/Datenschutz/Hausordnung (G17-013) bleiben; M3 ändert sie nicht.

### 10.3 Offene Fragen (nicht entschieden)
- **F1:** Wie wird der Widerspruch Vertrag 007 AC-1 (Teamspiel, Privatspiel, Turniere, Profil + Mittelknopf; Entscheid Q6) gegen Umbauplan (Start, Spiel suchen, Turniere, Team, Profil) aufgelöst, und wer gibt die AC-5-Ausnahme für `basics.spec.ts:258-300` frei?
- **F2:** Welche der 14 Fußzeilen-Links gehören in die Navigation (z. B. Livescore, Rangliste, Teams, Spieler, Hallen, Mitspieler gesucht, „Lobby aufmachen“, „Für Hallenbetreiber“) und welche entfallen?
- **F3:** Sind 138 Impeccable-Durchgänge (23 Seite-Rolle-Kombinationen × 6) so gewollt, oder gilt für Seiten mit gleichen Komponenten eine Zusammenfassung?
- **F4:** Gehört `AppNav` in M3-1 allein, oder soll `UserMenu`-Erweiterung (Rollenbereiche) eigener Task sein?
- **F5:** Wortwahl der Turnier-Phase „Zahlung läuft“ (Phase vs. „Zahlung ausstehend“ je Spieler).
- **F6:** `i18n.ts` pro Bereich aufteilen (Dateien je Namensraum) oder weiter eine Datei mit seriellen Commits?
- **F7:** Soll „Meine Spiele“ auf `/app` bleiben oder auf `/` für Angemeldete wandern („Start/Meine Spiele“ als ein Ziel)?
- **F8:** Wo erscheint der Fehlerzustand „Abbuchung fehlgeschlagen“ zusätzlich zu Lobby und `/app` (Benachrichtigung, Glocke)? (Fund N4-FZ-2: keine Benachrichtigung; 012 M3b)
