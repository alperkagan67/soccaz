# M3-Vorbereitung: Task-Zerlegung für AppNav, Meine Spiele und Spiel-suchen-Auswahl (Vertrag 013, M3)

Stand: 2026-11-12 · Verfasser: worker-3 · Status: **Plan, Entwurf**. Kein Code, keine Läufe, kein Look-Push. Der Plan ändert weder Vertrag noch `m3-plan.md`; er **zerlegt** dessen Teilbereiche A bis C in Tasks und listet die **AC-5-Freigaben** (bestehende Tests, die Texte oder Abläufe binden). M3 beginnt erst, wenn 012 M5 gemergt und M6a durch ist (`m3-plan.md` 1.1) und der Nutzer die Look-Abnahme M2b beantwortet hat.

Quellen: `docs/design/m3-plan.md` (v2, Abschnitte 0.4, 2, 3, 4, 7, 8), `docs/design/ac15-m2b.md` (Branch `feat/m2b-look`, Auflagen A bis H), `docs/design/begriffe.md`, Vertrag 007 (AC-1, AC-3, AC-8) und 013 (AC-5, AC-14). Zeilenangaben der Tests beziehen sich auf `origin/main` (a6b0824 und neuer); Stellen, die im Branch `feat/m2b-look` liegen, sind als „M2b“ gekennzeichnet.

## 1. Entscheide, auf denen der Plan steht

- **Seitenname (t9):** Menü und Seitentitel heißen **„Meine Spiele“**, „Mein Bereich“ entfällt. Das Menü ist auf `main` schon umgestellt (`ui-usermenu.test.ts:89-93`: „Mein Bereich gibt es nicht mehr“); offen ist der **Seitentitel** von `/app` (heute `metadata.title` „Mein Bereich“ und `h1` „Hey {Name}“). Kein bestehender E2E bindet diesen Titel (Suche: nur Kommentare in `basics.spec.ts:178`, `community.spec.ts:62`); die Umstellung braucht deshalb **keine** AC-5-Freigabe, aber eigene M2b-Tests (`ui-app`, `ui-start`) sind mitzuziehen.
- **Leiste (F1, t9):** Teamspiel | Privatspiel | Spiel suchen (Mittelknopf) | Turniere | Profil, Handy unten und Desktop oben; „Meine Spiele“ im Profil-Tab; „Spiel suchen“ führt in einen Auswahlschritt auf `/suche` (URL und Überschrift „Offene Lobbys“ bleiben).
- **Lobby-Überschrift** behält „VS.“ bis M3 (`community.spec.ts:45`); überall sonst „gegen“.
- **Reihenfolge (bindend):** M2 → M2b → 012 M3b bis M5 → 012 M6a → **M3** → Pilot.

## 2. Was M2b für M3 schon erledigt hat (Delta zu `m3-plan.md` v2)

`m3-plan.md` v2 rechnet mit dem M2b-Stand 6d7de87. Der Branch ist weiter. Folgendes ist **nicht mehr M3-Arbeit**, sondern nur noch zu **übernehmen und abzusichern** (alles auf `feat/m2b-look`, noch nicht auf `main`):

| Plan-Punkt (M3) | Stand nach M2b | Rest für M3 |
|---|---|---|
| „Dein Stand“, eine Hauptaktion je Rolle (Lobby, `/app`) | gebaut (`lobbyStand`, `mainActionFor`, `PageHeader`), Tests und Mutationen | nur Anpassungen durch Texte (3.4) |
| Fehlerzustand, Frist, Betrag, Freigabe | gebaut (Fenster offen/abgelaufen, 3-D-Secure-Label, Übernahme-Betrag) | keine |
| Server-Sperren nach Frist (`joinClosed`/`leaveClosed`) | gebaut, Server-Teil über `fix/lobby-sperren` in Fix-Sammel 2 (PR #117) | keine |
| Aktions-Leiste Handy, Header-„Anmelden“ und Mittelknopf neutral (Backlog 75) | gebaut als CSS-Regeln (`data-page-action`, `data-hero-action`, `data-nav-quiet`) | **in `AppNav` überführen**, nicht doppeln (4.1) |
| Schritte ohne Knopfoptik, Kader mit `StatusBadge`, Dritte neutral | gebaut | Rest-Backlog 80 (`PlayerLight`-Tokens) |
| Stripe-Thema, Preis-Text je Schalter, „gegen“ in „Dein Stand“ und Spielliste | gebaut | „gegen“ in `uebersicht/page.tsx` und Lobby-Überschrift (3.4) |
| `ConfirmDialog` in der Lobby, „Preis bestätigen“, Gruppierung nach Modus, `AppNav`, Auswahlschritt | **nicht gebaut** | M3-1 bis M3-3 |

Vor M3-1 ist der Stand von `feat/m2b-look` gegen `main` zu prüfen (Konfliktkandidaten: `LobbyClient.tsx`, `lobby/[id]/page.tsx`, `lobby.ts`, `globals.css`, `Header.tsx`, `BottomNav.tsx`).

## 3. Task-Zerlegung

Gemeinsame Regeln (aus `m3-plan.md` 1.2, 1.3): ein Writer je Task, Reviewer ≠ Writer, nur Tokens, Begriffe nach `begriffe.md`, keine URL und keine Test-ID ändern, **gemeinsame Dateien seriell**: `layout.tsx`, `Header.tsx`, `BottomNav.tsx`, `UserMenu.tsx`, `Footer.tsx`, `i18n.ts`, `globals.css`. Beleg je Task: `typecheck`, `lint`, Unit, betroffene E2E einzeln, sechs Impeccable-Befehle je Seite und Rolle, Bilder 390/1280 × hell/dunkel.

### 3.1 M3-1: AppNav, Link-Modell, Auswahlschritt (allein, zuerst)

| Schritt | Inhalt | Dateien | Neue Tests | Bestehende Tests |
|---|---|---|---|---|
| 1a | Ein **Link-Modell** `src/lib/nav.ts` (fünf Ziele, Hrefs, Matcher, Gast-Ziele); `AppNav` rendert Handy-Leiste und Desktop-Leiste daraus | `lib/nav.ts` (neu), `AppNav.tsx` (neu), `BottomNav.tsx`, `Header.tsx` | Unit `nav.test.ts` (beide Darstellungen aus demselben Array, ein aktiver Eintrag je Route) | `basics.spec.ts:258-312`, `pwa.spec.ts:62-81` **unverändert grün** |
| 1b | **Desktop-Leiste mit eigenem zugänglichem Namen** (nicht „Hauptnavigation“) | `AppNav.tsx` | E2E: Desktop-Leiste vorhanden, Name ≠ „Hauptnavigation“ | `pwa.spec.ts:107-110` bleibt (Desktop: „Hauptnavigation“ versteckt) |
| 1c | **Orange-Regel** (Backlog 75) in `AppNav`: Mittelknopf und Kopf-„Anmelden“ neutral, wenn die Seite eine eigene Hauptaktion hat; ersetzt die CSS-Regeln aus M2b | `globals.css`, `AppNav.tsx` | E2E (aus M2b `ui-lobby`: Mittelknopf neutral ohne Hauptaktion, gefüllt auf `/`) angepasst | keine |
| 1d | **Aktiver Eintrag mit Wort** und richtiger Matcher (Fund X-06); Gäste sehen keine Reiter für Angemeldete | `lib/nav.ts` | E2E über alle Zielrouten | `basics.spec.ts:176-190` (Menü) unverändert |
| 1e | **Kopf- und Fußzeile**: Fuß nur Rechtliches + Sprache; Tippflächen ≥ 44 px (heute Fußlinks 30–57 × 44, Sprachumschalter 20 px hoch, Kopflinks 20 px hoch) | `Footer.tsx`, `Header.tsx`, `LanguageSwitch.tsx` | DOM-Messung (`adapt`) 35 Messungen als E2E | **Freigabe nötig** für Fußlinks (3.4, Nr. 5) |
| 1f | **Duplikat „Lobby aufmachen“** (Backlog 76): entfällt aus Fuß und `AppNav`-Umfeld; auf `/app` erst mit M3-2 | `Footer.tsx` | – | `basics.spec.ts:39` erst bei M3-2 |
| 1g | **Auswahlschritt „Spiel suchen“** auf `/suche`: Block oben (Teamspiel / Privatspiel / Turnier), darunter Liste; Überschrift „Offene Lobbys“ bleibt | `components/SearchChoice.tsx` (neu), `app/suche/page.tsx`, `i18n.ts` (`nav.*`) | neue Test-IDs `choice-team`, `choice-private`, `choice-tournament`; E2E „Mittelknopf → `/suche$` mit Block und `aria-current`“ | `basics.spec.ts:276-281,310-312` bleiben (URL `/suche$`, Überschrift) |

`GameModes.tsx` bleibt in M3-1 unberührt (Dateien gehören M3-2); `GameModes` rendert weiter auf `/` und `/app` mit `game-modes` und `mode-*` (`phase4.spec.ts:363-366`, `privatspiel.spec.ts:15-20`).

### 3.2 M3-3 zuerst, dann M3-2: Lobby-Rest und Server `myMatches`

Reihenfolge laut `m3-plan.md` Abschnitt 7: **M3-3 vor M3-2**, weil `myMatches` (`kind`) in `lobby.ts` liegt.

| Schritt | Inhalt | Dateien | Neue Tests | Bestehende Tests |
|---|---|---|---|---|
| 3a | `myMatches` um `kind` erweitern (Team/Privat/Turnier), nur eigene Spiele | `src/server/lobby.ts`, `src/server/mygame.ts` | Integration: `kind` gesetzt, nur eigene Spiele, Reihenfolge nach Anstoß | – |
| 3b | **„Preis bestätigen“** statt „Ja, mein Team ist komplett: Spiel bestätigen“; Stufen-Texte (Findet statt / Preis steht fest), Y1-CD-03 | `FinalConfirm.tsx`, `page.tsx` (Lobby), `lobby.ts` (Benachrichtigung `match.confirmed`), `mygame.ts` | Unit `lobbyStand` (Label), E2E | **Freigabe nötig** (3.4, Nr. 1) |
| 3c | **`ConfirmDialog` statt `confirm()`** in der Lobby: „Lobby verlassen“ (Abmelden), „Spieler entfernen“; `ActionButton`-Prop `confirm` für Lobby-Stellen ablösen | `LobbyClient.tsx`, `ActionButton.tsx`, `VetoPanel.tsx` | E2E je Dialog (Fokus, Escape, Fokusrückgabe, Klick auf Bestätigen-Knopf) | **Freigabe nötig** (3.4, Nr. 4) |
| 3d | „gegen“ statt „VS.“ in `uebersicht/page.tsx`; Lobby-Überschrift nach Entscheid F11 | `lobby/[id]/uebersicht/page.tsx`, `page.tsx` | – | `community.spec.ts:45` nur bei „ja“ (3.4, Nr. 3) |
| 3e | M2b-Auflagen: „Karte ändern“ doppelt, „Ich bin bereit“/„Bereit machen“ vereinheitlichen, Zählformat eine Zahl je Team, gedeckter Platz ohne eigene Karte (M3c-3b), Kader-Zeilen am Handy | `LobbyClient.tsx`, `CardForm.tsx`, `page.tsx`, `lobby-stand.ts` | Unit/E2E je Punkt | je Punkt prüfen; Texte aus 3.4 |
| 3f | Backlog 79 bis 86 gegen den M2b-Stand prüfen (Teil erledigt): i18n der Lobby-Dateien, `PlayerLight` auf Tokens, Texte für Nicht-Mitglieder, Kader früher am Handy, Siegchance, Stepper | `lobby/[id]/*`, `LobbyBoard.tsx`, `PlayerLight.tsx` | je Eintrag | – |

### 3.3 M3-2: Meine Spiele nach Modus, Seitentitel, Menü

| Schritt | Inhalt | Dateien | Neue Tests | Bestehende Tests |
|---|---|---|---|---|
| 2a | **Seitentitel „Meine Spiele“** (`metadata.title` und `h1`) statt „Mein Bereich“/„Hey {Name}“; Begrüßung als Zusatzzeile | `app/app/page.tsx` | E2E/Unit: `h1` genau eine, Titel | keine Bindung (3.4) |
| 2b | **Gruppen nach Modus** Teamspiele, Privatspiele, Turniere (007 AC-3), leere Gruppen ausgeblendet, Reihenfolge nach Anstoß; Status mit `StatusBadge` | `app/app/page.tsx`, `MyGamesList.tsx`, `MyGames.tsx` | Unit Gruppierung nach `kind`; E2E je Gruppe | Test-IDs `my-games`, `my-game`, `my-open-lobby`, `first-steps`, `game-modes`, `mode-*` bleiben (`matchmaking.spec.ts:78-80`) |
| 2c | **Fehlerzustand** (Abbuchung fehlgeschlagen) auf `/app` mit Grund und „Karte ändern“ (N4-FZ-1) | `app/app/page.tsx`, `mygame.ts` | E2E, Datenschutz für Dritte | – |
| 2d | **Schnellzugriff** auf `/app` streichen (Duplikat zu Fuß und Menü); „Lobby aufmachen“ entfällt | `app/app/page.tsx` | – | **Freigabe nötig** (3.4, Nr. 2) |
| 2e | Leerzustand: Titel, Grund, eine Handlung (K08); „Team gründen“ ≥ 44 px | `app/app/page.tsx` | E2E Neuling | `basics.spec.ts:28-36` bereits durch M2b angepasst |
| 2f | `GameModes`: Optik, Test-IDs und Linktexte bleiben auf `/` und `/app` | `GameModes.tsx` | – | `phase4.spec.ts:363-366`, `privatspiel.spec.ts:15-20` |

Das **Menü** (`UserMenu`) heißt auf `main` schon „Meine Spiele“; M3-1 prüft nur, dass der Eintrag auf `/app` zeigt und die Rolle im Menü steht (K14).

### 3.4 AC-5-Freigaben: bestehende Tests, die M3 ändern müsste (Liste an t1d)

Bis zur Freigabe gilt AC-5 (keine Änderung bestehender Tests). Jede Änderung steht im PR einzeln mit Grund; Test-IDs und URLs bleiben.

| Nr. | Test (Stelle, `main`) | Bindung heute | geplante Änderung | Task | Freigabe |
|---|---|---|---|---|---|
| 1 | `payments.spec.ts:284,286`; `privatspiel.spec.ts:395`; `uebersicht.spec.ts:41,46` | Knopf „Ja, mein Team ist komplett: Spiel bestätigen“ (`uebersicht`: Regex `/Spiel bestätigen/`) | „Preis bestätigen“ (Entscheid 8, `begriffe.md`) | M3-3b | **ja** |
| 2 | `basics.spec.ts:38-39` | Linkliste im Schnellzugriff von `/app` für neue Nutzer, darin „Lobby aufmachen“ | Eintrag entfällt (Backlog 76); Test ändert die Linkliste | M3-2d | **ja** |
| 3 | `community.spec.ts:45` | Text „VS.“ in der Lobby-Überschrift | nur bei Entscheid „gegen“ (F11); sonst bleibt der Test | M3-3d | **bei „ja“** |
| 4 | Dialog-Handler auf Lobby-Aktionen: `matchmaking.spec.ts:66,74,262`; `payments.spec.ts:242`; `privatspiel.spec.ts:81,218,309,374,458`; `teamspiel-ablauf.spec.ts:58`; `community.spec.ts:31`; `request.spec.ts:136` | nativer Dialog (`page.on("dialog")`, `d.accept()`) für „Abmelden“, „Spieler entfernen“ u. a. | `ConfirmDialog`: der Test klickt den Bestätigen-Knopf im Dialog; je Stelle prüfen, ob sie die Lobby oder eine andere `confirm()`-Stelle betrifft | M3-3c (Lobby), übrige F12 | **ja, je Stelle** |
| 5 | Fußzeilen- und Kopflinks-Tests (`basics.spec.ts`, `a11y.spec.ts`), soweit sie Linknamen der Fußzeile prüfen | Linknamen der 14 Fußzeilen-Links | Fuß nur Rechtliches (Entscheid F2 offen); Tests passen die Linkliste an | M3-1e | **nach F2** |
| 6 | `admin.spec.ts:90,114,147,165`; `phase4.spec.ts:78,110`; `basics.spec.ts:56-57` | nativer Dialog in Admin- und Turnierabläufen | nur falls M3-5 oder ein Mini-Task diese `confirm()`-Stellen mitnimmt (F12) | M3-5 / Mini | **nur bei F12 „ja“** |
| – | `team-invite.spec.ts:33` („Anmelden und beitreten“), `karte-privatsphaere.spec.ts:229` und `card-fail-notify.test.ts:70` („Karte ändern“), `card-form-change.test.ts` („Karte ändern“) | Knopf- bzw. Nachrichtentext | **bleiben unverändert** (Begriff entschieden) | – | keine |
| – | `basics.spec.ts:258-312`, `pwa.spec.ts:62-81,107-110` (Leiste, Mittelknopf, Hrefs, Desktop „Hauptnavigation“ versteckt) | Leiste und Namen | **bleiben unverändert** (Desktop-Leiste mit anderem Namen) | – | keine |
| – | `ui-usermenu.test.ts:89-93` („Mein Bereich gibt es nicht mehr“) | Menü | bleibt | – | keine |

**Eigene M2b-Tests (Branch `feat/m2b-look`, nicht AC-5, aber mitzuziehen):** `ui-lobby.spec.ts` und `ui-lobby-betrag.spec.ts` (Label „Spiel bestätigen“), `lobby-stand.test.ts`, `ui-app`/`ui-start` (Titel „Hey“), E2E zu „VS.“ und „Karte ändern“. Beim Merge von M2b nach `main` werden sie Teil der Basis; M3 ändert sie zusammen mit dem Code.

## 4. Reihenfolge, Writer, Risiken

1. **M3-1** allein (gemeinsame Dateien): 1a bis 1g.
2. **M3-3 ‖ M3-4** (höchstens 2 Writer, disjunkte Dateien): M3-3 enthält 3a bis 3f.
3. **M3-2 ‖ M3-5** nach M3-3: M3-2 enthält 2a bis 2f.
4. **M3-6** Abnahme: Impeccable (je Seite und Rolle sechs Befehle, seriell), Bilder, Fixes.

**Freigaben vor dem jeweiligen Task beantragen** (nicht erst im Review): Nr. 1 und 4 vor M3-3, Nr. 2 vor M3-2, Nr. 5 nach F2 vor M3-1e, Nr. 3 nach F11.

**Risiken:** (1) Desktop-Leiste gegen `pwa.spec.ts:107-110` (zugänglicher Name). (2) Konflikte beim Merge von `feat/m2b-look` (Abschnitt 2). (3) `ConfirmDialog` ändert das Verhalten vieler Tests (Nr. 4): zuerst die Stellen zählen, dann je PR eine Gruppe. (4) `i18n.ts` bleibt gemeinsame Datei: ein Commit je Task. (5) Ohne Entscheid zu F2 (Fußzeile) und F11 („VS.“) bleiben 1e und 3d stehen. (6) Beginn erst nach 012 M5 und M6a und der Nutzer-Antwort zur Look-Abnahme.

## 5. Offene Punkte für diese Vorbereitung

- **F2** (Fußzeilen-Links), **F9** (Auswahlschritt als Block auf `/suche`, neue Komponente `SearchChoice.tsx`: Vorschlag bestätigen), **F10** (Desktop-Kopfleiste: Inhalte neben den fünf Zielen, Name für Screenreader), **F11** („VS.“), **F12** (übrige `confirm()`-Stellen) aus `m3-plan.md` 10.3 bleiben offen; der Plan trifft sie nicht.
- Der Nutzer hat die Look-Abnahme M2b noch nicht beantwortet; ohne „Ja“ beginnt M3 nicht in der Breite.
- Nicht Teil dieser Vorbereitung: Code, Läufe, Bilder, Merge von `feat/m2b-look`.
