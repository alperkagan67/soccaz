# Impeccable-Engine-Lauf M3, Lauf 3 (nach .btn-Fix und Lobby-Fix)

Stand: 2026-11-24 · Code-Stand `origin/main` 1e1f24d (inkl. #317 Lobby-Fix, #321 `.btn`) · Verfasser: worker-3 · Auftrag: t2s/t2q (Pilot-Gate P1-3) · Folgt auf [Lauf 1](impeccable-lauf-m3.md) und [Lauf 2](impeccable-lauf-m3-2.md)

Zweck: Prüfen, ob die P1 aus Lauf 2 weg sind (P1-3 Knopf-Innenabstand, Karte in Karte, Hauptaktion in der ersten Ansicht), und die Zielgrößen unter 44 px, `/` und `/suche` mit vielen orangen Knöpfen und die Lobby-Zustände aus den Lücken von Lauf 2 nachmessen. Ergebnis: **keine P0, kein offener P1**. Offen bleiben sieben P2 (Abschnitt „Fundliste“), davon eine Planungs-Hauptaktion unter dem Falz (P2-hoch).

## Methode und Grenzen
- Engine 0.1.19, Skill 4.8.1. **Ein** Dev-Server (3103, `PAYMENTS_FAKE=1`, Kartenmodell an, node-direkt) und **ein** Chromium mit DevTools-Port 9222, alles in einem Lauf nacheinander (4 Minuten), danach beendet (Port 3103 und 9222 frei, kein Chromium-Prozess; vorher bei w2 und w4 erfragt). Port 3100 nicht berührt.
- **Assessment B (Engine):** `impeccable detect --cdp 9222 --target <Kennung> --json` je Ansicht, Schema und Breite (die Breite stellt der Lauf am Browser ein, `--viewport` gilt mit `--cdp` nicht): 29 Seitenstände, 58 Scans (390 und 1280 px, dunkel; `/`, `/suche`, `/app`, Lobby „Karte fehlt“, „Freigabe“, „Letzte Bestätigung“ zusätzlich hell). **Audit-Teil (DOM-Messung im selben Browser):** Zielgrößen unter 44 px, Innenabstand aller `.btn`, `text-xs`, Anzahl und Lage von `main .btn-primary`, Seitenhöhe, Überlauf, verschachtelte Karten und Rahmen in Karten. Kein axe und kein Lighthouse (Kontrast: AC-27 in der CI; Tastatur: die E2E).
- **Assessment A (critique):** diesmal **nicht** von Hand an Screenshots; die Bewertung stützt sich auf die gemessenen Größen und die Engine-Funde. Der Lobby-Fix (#317) stammt von mir; die Bewertung ist also **nicht unabhängig**.
- **Seeds:** Wegwerf-Spezifikation über die E2E-Helfer (`setupLobby`, `seedUser`, `addParticipant`, `addTeamMember`, `devLogin`) und SQL, nur Datenbank `soccaz_w3`, nur `@test.local`-Konten; Lobby-Zustände über Kartenstatus, Abbuchungszeilen (Freigabe, abgelehnt, abgelaufenes Fenster), Bereit-Zeitstempel und je 4 Spieler je Team (Letzte Bestätigung), Terminwahl (`scheduling_open` mit zwei Optionen), gespieltes und abgesagtes Spiel, Hallenbetreiber mit `venue_access`. Die Wegwerf-Spezifikation wurde nicht committet. Die Daten sind künstlich (Namen mit Laufnummer).
- **Lücken (nicht erfasst):** Veto-Phase (Hallen bannen), Lobby „bestätigt“ (Schritt 4, beide Captains bestätigt), Privatspiel, „Anteil übernehmen“, hell für die übrigen Ansichten, `/turniere` nur gemessen, AC-30 (a) Abstände aus der Token-Skala nicht gemessen; Nicht-Captain-Teilnehmer (Beitreten) nicht gesondert.

## Ansichten und Engine-Funde (Assessment B, 390 px)
Spalten: Funde außer `overused-font` · Primär = Anzahl `main .btn-primary`, `@` = Oberkante in px · Seitenhöhe · Zielgrößen unter 44 px (Anzahl, davon Fließtext-Links).
| Ansicht | Funde | Primär | Höhe | klein |
|---|---|---|---|---|
| Gast `/` | 1x straggler | 2 @469 | 3143 | 12 (2) |
| Gast `/suche` | 1x unbalanced-heading | 2 @382 | 1869 | 11 (2) |
| Gast `/einladung/<token>` | - | 1 @233 | 844 | 7 |
| Gast Lobby | 2x straggler | 1 @398 (Anmelden) | 2348 | 7 |
| Neuling `/willkommen` | - | 0 | 955 | 7 |
| Spieler `/` | 1x straggler | 2 @741 | 3499 | 14 (2) |
| Spieler `/suche` | 1x unbalanced-heading | 2 @382 | 2165 | 13 (2) |
| Spieler `/app` | 1x straggler | 0 | 1900 | 7 |
| Spieler `/turniere` | - | 0 | 864 | 7 |
| Lobby: Karte fehlt | 3x straggler | 1 @664 (Testkarte hinterlegen) | 3449 | 8 |
| Lobby: Bereit machen | 5x straggler | 1 @492 | 3221 | 7 |
| Lobby: bereit, wartet | 5x straggler | 0 | 3155 | 7 |
| Lobby: Letzte Bestätigung | 5x straggler | 1 @476 | 3175 | 7 |
| Lobby: Fehler Freigabe | 3x straggler | 1 @552 | 3364 | 9 |
| Lobby: Fehler Karte | 3x straggler | 1 @684 | 3388 | 9 |
| Lobby: Fehler Frist abgelaufen | 3x straggler | 0 | 3200 | 8 |
| Lobby: Captain-Leiste mit Fehlerzeile | 4x straggler | 0 | 3263 | 7 |
| Lobby: Planung (Termin) | 3x straggler | 1 @**932** | 2926 | 7 |
| Lobby: Hallenbetreiber | 2x straggler | 1 @492 (Als Ersatzspieler anbieten) | 2372 | 7 |
| Lobby: gespielt | 3x straggler | 1 @374 | 1756 | 7 |
| Lobby: abgesagt | 2x straggler | 0 | 1754 | 7 |

Bei 1280 px: nur `line-length` in 13 von 14 Lobby-Ansichten (Kostenzeile) und vereinzelt `straggler`. **In allen Scans:** `overused-font` (Look-Entscheid des Nutzers, nur gemeldet). **`dark-glow`: 0, `cramped-padding`: 0, `nested-cards`: 0**, kein horizontaler Überlauf, keine Karte in Karte (DOM-Messung: `main .card .card` und `div.rounded-lg.border` in Karten je 0 in allen 29 Ständen). Hell: gleiche Funde wie dunkel.

## Eingelöst gegenüber Lauf 2
- **P1-3 Knopf-Innenabstand:** In allen 29 Ständen hat **kein** `.btn` weniger als 4 px senkrechten Innenabstand (kleinster Wert 4 px, `/app` 8 px); die Engine meldet **0 `cramped-padding`** (Lauf 2: 10 von 17 Lobby-Ansichten). Behoben mit #321.
- **P1-1 Karte in Karte:** Engine 0 `nested-cards` (Lauf 2: 16 von 17), DOM 0 (#317).
- **P1-2 Hauptaktion in der ersten Ansicht (390×844):** Karte hinterlegen @664, Bereit machen @492, Letzte Bestätigung @476, Fehler Freigabe @552, Fehler Karte @684, Anmelden @398: alle in der ersten Ansicht (Lauf 2: Freigabe ca. 1400, Bestätigung ca. 2850). **Ausnahme: Planung (Vorschlag machen) @932.**
- **P1-4 Captain in der Planung:** „Dein Stand“ nennt den Schritt (e2e `matchmaking`, Unit `lobby-fix`); der Primary ist „Vorschlag machen“ (Stand und Knopf stimmen überein).
- Aus Lauf 2: `/` hat 2 statt 7, `/suche` 2 statt 27 orange Knöpfe (P2-15 verbessert, nicht ganz erledigt), die Mitspieler-Links in den Lobby-Listen und die Fußzeilenlinks fallen nicht mehr unter die Zielgrößen (Fußzeilenlinks 44 px hoch).

## Fundliste
**P0:** keine. **P1:** keine offen.

**P2 (Backlog, mit Pilot-Bezug)**
| # | Befund | Stufe | Quelle | Datei:Zeile | Vorschlag | Pilot |
|---|---|---|---|---|---|---|
| 1 | **Planung (Termin): Hauptaktion „Vorschlag machen“ @932 bei 390 px** (unter dem Falz): die zwei Terminoptionen mit Stimm-Knöpfen stehen darüber, das Formular „Eigener Vorschlag“ darunter. Dein Stand nennt den Schritt, der Knopf liegt eine Bildschirmhöhe tiefer (AC-30 d). | P2 (hoch) | M | `src/app/lobby/[id]/SchedulingPanel.tsx` (Reihenfolge), `lobby-stand.ts` | Formular „Eigener Vorschlag“ kompakt vor die Optionsliste oder die erste Option mit „Dafür stimmen“ als Hauptaktion; Entscheid mit t2q (Pilot: nur bei freier Terminwahl) | Block 1/2 |
| 2 | **Kleine Knöpfe unter 44 px:** „Zur Lobby“ (93×36 px) auf `/` und `/suche` (`LinkButton size="sm"` in Meine Spiele und `!min-h-9 !px-3` im Lobby-Board); zugleich zweiter orange Knopf neben Hero/„Lobby aufmachen“ (Primär 2 statt 1, AC-30 b). | P2 | B, M | `src/components/MyGames.tsx:28` und `:41` (`LinkButton size="sm"`, 36 px), `src/components/LobbyBoard.tsx:98` bis `:103` (`!min-h-9 !px-3`) | `!min-h-9 !px-3` entfernen, „Zur Lobby“ ruhig und mit 44 px Höhe | Block 1 |
| 3 | **Zielgrößen unter 44 px:** Sprachumschalter „Deutsch/English“ (16 px hoch, jede Seite), Kästchen der Mandatszustimmung (13×13, `CardForm`), Link „Teilen“ (16 px, `text-xs`), Teamname- und Spielerlinks in den Listen von `/` und `/suche` (20 px), „Alles genau erklärt: Hilfe und Fragen“ (18 px). Fußzeilen- und Lobby-Links sind seit #317 in Ordnung. | P2 | M | `src/components/Footer.tsx` (Sprache), `src/app/lobby/[id]/CardForm.tsx`, `src/components/LobbyBoard.tsx`, `MyGames.tsx`, Link „Teilen“ in den Spielkarten | Trefferfläche vergrößern (Padding), Kästchen mit ganzer Zeile als Ziel | Messpunkt Touch (6a) |
| 4 | **`text-xs` in globalen Bausteinen:** BottomNav-Beschriftung und Fußzeile (8 sichtbare Treffer bei 390 px, 3 bei 1280 px), „Teilen“. | P2 | M | `src/components/BottomNav.tsx`, `Footer.tsx` | mindestens `text-sm`; Entscheid mit dem Look-Besitzer (Backlog 237 Rest) | Messpunkt Lesbarkeit |
| 5 | **Lobby sehr lang:** 3150 bis 3450 px bei 390 px in den Zuständen mit Karte und Kosten; Spielort, Kosten und Teams zwischen Hauptaktion und Teilnehmern. | P2 | M | `src/app/lobby/[id]/page.tsx` | Teams früher, Kosten einklappen (DESIGN-F, Lauf 2 P2-9) | Messpunkt Länge |
| 6 | **Straggler (2 bis 5 je Lobby bei 390 px), `line-length` 106 Zeichen (Kosten, 1280 px), `unbalanced-heading` auf `/suche`.** | P2 | B | Lobby-Kostenzeile, Titel von `/suche` | `text-wrap: balance` für Titel, `pretty` für Fließtext einmal zentral; Kostentext auf höchstens 70 Zeichen | nein |
| 7 | **Hallenbetreiber bekommt „Als Ersatzspieler anbieten“ als orange Hauptaktion** (unverändert aus Lauf 2 P2-8). | P2 | A | `src/lib/lobby-stand.ts` | Produktentscheid t2q: reine Betreiber neutrale Zeile ohne Hauptaktion | Betreiber-Rolle |

**Aus Lauf 2 weiter offen und hier nicht neu gemessen:** `/app` ohne Team (Team gründen dreimal), `/app` „Meine Spiele“ ohne Obergrenze, Start `/` für Spieler mit Team (3499 px, Gast-Erklärung) und `/suche` mit dem Auswahlschritt vor dem Board (Backlog 240), Frist-abgelaufen ohne Handlung und doppelter Freigabe-Satz (Lauf 2 P2-6/7; im Check #322 als Vor-Pilot-Vorschlag). Der Zustand „Frist abgelaufen“ hat weiter keine Aktion (Primär 0).

Positiv: `/einladung`, `/willkommen`, `/turniere` und `/app` sind ohne Funde außer Schrift und Straggler; die Lobby hat in jedem Spielerzustand genau einen oder keinen orangen Knopf, und „Dein Stand“ nennt den Schritt; Fehlerzustände zeigen je einen Schritt.

## Zusammenhang mit AC-5, AC-15 und AC-30
- AC-15: critique und Detektor für die Lobby-Zustände, `/app`, `/suche`, `/turniere`, `/`, `/willkommen`, `/einladung` nachgeholt; Lücken siehe oben. Der Vermerk „Degradiert: ja“ der M3-PRs gilt für die erfassten Zustände als eingelöst, für Veto, bestätigt, Privatspiel und Übernahme bleibt er offen (kleiner Lauf nach der Behebung von P2-1).
- AC-30: (b) Hauptaktion je Ansicht ist in der Lobby erfüllt, auf `/` und `/suche` noch 2 statt 1 (P2-2); (c) Karte in Karte erfüllt; (d) erste Ansicht auf 390 px erfüllt bis auf die Planung (P2-1); (a) und (e) nicht gemessen.

## Pilot-Gate
- P1-3 ist behoben, es gibt **keinen offenen P1 und keine P0**: Impeccable ist für das Pilot-Gate **nicht mehr blockierend**.
- Vor dem Pilot sinnvoll (klein): P2-2 (Zur Lobby ruhig, 36-px-Override weg), P2-3 (Sprachumschalter und Mandats-Kästchen), P2-1 (Planung), Produktentscheid P2-7. Die übrigen bleiben im Backlog (`docs/loop/BACKLOG.md` 240 und neu).
- Der Check `docs/design/m3-abschluss-pilot-check.md` ist mit diesem Lauf im Punkt P1-3 überholt (offen → erledigt): bei Bedarf im nächsten Sammel-PR nachziehen.
