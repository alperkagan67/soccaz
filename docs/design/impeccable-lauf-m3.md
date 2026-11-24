# Impeccable-Engine-Lauf M3 (gebündelt nach Welle B)

Stand: 2026-11-24 · Code-Stand `origin/main` 05e36b7 (M3 PR 1 bis 4 gemergt) · Verfasser: worker-4 · Auftrag: t2s/t2q (Plan PLAN-OK, Ausführung nach Welle B) · Status: Lauf 1 von 2 (Lobby-Zustände aus 5a/5b folgen im zweiten Lauf)

Zweck: Der Vermerk „Degradiert: ja“ der M3-PRs (Engine-Lauf nachholen, AC-1/AC-15) wird für neun Ansichten eingelöst. Ergebnis: **keine P0, vier P1 (AC-30, AC-3, Fehlerzustand), Rest P2 und Look**. P0 und P1 vor dem Pilot-Gate (AC-8), P2 ins Backlog.

## Methode und Grenzen

- Engine 0.1.19, ein Dev-Server (3105, node-direkt, danach beendet, Port frei, PID 11004), ein Chromium mit DevTools-Port 9222, strikt nacheinander. Vorher bei w1 bis w3 erfragt: kein Chromium, w1 hatte nur einen leerlaufenden Server auf 3101.
- **Assessment B (Engine):** `impeccable detect --cdp 9222 --target imp=<Ansicht> --json` je Ansicht. 9 Ansichten x 2 Breiten = 18 Scans. Die Rohdaten (JSON je Ansicht) liegen im Scratchpad der Sitzung, nicht im Repo.
- **Assessment A (critique):** von mir von Hand nach `reference/critique.md` an Vollseiten-Screenshots, **nicht** als getrennter Sub-Agent. Es ist also nicht unabhängig von meinem eigenen PR 4 (`/app`); die Funde dort sind gegen die Engine-Treffer gegengelesen.
- Nur **dunkles** Schema; hell nicht gescannt (der Kontrast hell ist durch AC-27 gedeckt). Seeds: `seedWorld` aus `tests/e2e/kontrast/seiten.ts` (Gast, Spieler mit Team, offene Lobby, gespieltes Spiel, Einladung), dazu eine fehlgeschlagene eigene Abbuchung und ein eingerichteter Nutzer ohne Team (Neuling).
- Vollseiten-Screenshots zeigen feste Leisten (BottomNav, Aktionsleiste) mitten im Bild: Artefakt der Vollseitenaufnahme, kein Seitenfehler. Das runde „N“ unten links ist die Dev-Anzeige von `next dev`.
- Lobby: nur ein Zustand (Captain, Spiel angesetzt, vor „Bezahlen“, mit Fehlerzustand der Karte). Die Zustände aus 5a/5b folgen im zweiten Lauf.

## Ansichten und Engine-Funde (Assessment B)

| Ansicht (Rolle, Pfad) | Treffer 390 px | Treffer 1280 px | Funde außer „overused-font“ |
|---|---|---|---|
| v1 Gast `/` | 2 | 2 | Straggler („heraus.“, 390); cramped-padding (1280) |
| v2 Gast `/suche` | 2 | 2 | Straggler (1280), unbalanced-heading im h1 (390) |
| v3 Gast `/turniere` | 1 | 1 | keine |
| v4 Spieler `/` | 7 | 7 | 5x dark-glow (Ampelpunkte), Straggler (390), cramped-padding (1280) |
| v5 Spieler `/suche` | 7 | 7 | 5x dark-glow, unbalanced-heading (390), Straggler (1280) |
| v6 Spieler `/app` (Stand, Fehlerzustand, Listen) | 1 | 2 | cramped-padding (1280, „Offene Lobbys ansehen“) |
| v7 Neuling `/app` | 1 | 2 | cramped-padding (1280, dieselbe Stelle) |
| v8 Spieler Lobby | 11 | 6 | 4x nested-cards, 5 Straggler und cramped-padding am Knopf (390), line-length (1280) |
| v9 Spieler `/turniere` | 1 | 1 | keine |

**In allen 18 Scans:** `overused-font` („Plus Jakarta Sans“, 87 % des Textes). Das ist kein M3-Fund, sondern eine **Look-Entscheidung des Nutzers**: nicht ändern, nur melden.

## Fundliste mit Stufe und Besitzer

**P1 (vor dem Pilot-Gate)**
1. **Lobby, mehrere Hauptaktionen gleichzeitig (AC-30 „höchstens eine“):** orange „Einladungslink erstellen“, orange „Ja, mein Team ist komplett: Preis bestätigen und zahlungspflichtig zusagen“ und der orange Schritt „3 Bezahlen“. Besitzer: Lobby nach Zuweisung (5a/5b). Der Knopftext ist die Button-Lösung § 312j (ENTWURF, Rechtsprüfung); hier geht es nur um die Gewichtung (ein Hauptknopf, die anderen ruhig).
2. **Lobby, ein Knopf bei 390 px zu eng (cramped-padding 3,5 px, Detektor: `span.inline-flex.flex-col > button.btn.btn-primary`):** Zielgröße und Innenabstand prüfen (AC-3). Besitzer: Lobby.
3. **Lobby, Fehlerzustand mit mehreren Wegen:** Der Kasten „Abbuchung fehlgeschlagen“ sagt „Das Zeitfenster ist abgelaufen. Dein Platz wird neu vergeben“, während darüber der Schritt „Bezahlen“ und darunter „Preis bestätigen“ stehen. Ein Fehlerzustand braucht Grund und eine Handlung. Besitzer: Lobby; inhaltlich mit der Button-Lösung abstimmen.
4. **`/suche` (und Spielseiten): „● Live“ mit `text-xs`, im `h1`:** AC-30 (nie `text-xs`); der Titel lautet „Offene Lobbys anderer Teams ● Live“ und „Live“ bricht bei 390 px in eine eigene Zeile. Besitzer: w3 (`/suche`); Quelle `src/components/LiveIndicator.tsx` Z. 24 (Backlog 237).

**P2 (Backlog)**
- **`/app` (mein Teil):** „Offene Lobbys ansehen“ bricht bei 1280 px in zwei Zeilen und ist niedriger als der Nachbarknopf (cramped-padding 3,5 px, `GameModes`, Karte Teamspiel): Knopfhöhe und Umbruch angleichen. Der Block „Was möchtest du spielen?“ ist am Handy lang (drei Karten, fünf Knöpfe) und schiebt „Meine Teams“ nach unten; bekannt aus PR 4, bleibt wegen AC-5. Sonst sind Stand, Fehlerzustand, Liste und die eine Hauptaktion bei 390 und 1280 px klar geordnet.
- **Gast `/`, Spieler `/`, `/app`:** dieselbe Ursache für cramped-padding bei 1280 px (zweiter ghost-Knopf in der Karte, `!min-h-9`): eine Korrektur im geteilten Baustein statt je Seite.
- **Start `/` (Spieler mit Team):** zeigt die Gast-Erklärung („So funktioniert Socaz“, Zahlenleiste, vier Schritte, Hero-Bild) über rund 2200 px, obwohl der Spieler schon Team und Spiel hat. „Mein aktuelles Spiel“ steht als orange Karte oben, der Hero-Knopf konkurriert im ersten Bildschirm. Distill für angemeldete Spieler. Besitzer: w3 (`/`).
- **`/suche` (Spieler):** Der Auswahlschritt „Was möchtest du spielen?“ steht vor dem Lobby-Board; die Lobbys beginnen bei 390 px erst nach rund 1100 px. Besitzer: w3.
- **Ampelpunkte (`dark-glow`, 5 Treffer auf `/` und `/suche`):** Legende und Zeilen der Lobbyliste nutzen Punkte mit Leuchtschatten (#ef4444, #f59e0b, #22c55e). Look-Frage: bewusst oder entfernen? Die Farbe ist nicht alleiniger Träger, Wörter stehen daneben.
- **`/turniere` (Leerzustand):** „Aktuell sind keine Turniere eingetragen.“ hat einen Grund im Absatz darüber, aber keine Handlung (Link oder Knopf). Soll: Titel, Grund, eine Handlung. Besitzer: w3.
- **Lobby:** `nested-cards` (4 Treffer), Seite sehr lang (rund 2600 px bei 390), Straggler („Std“, „Spieler.“, „abgebucht.“, „geklappt.“, „bereit.“), `line-length` 106 Zeichen in der Kostenzeile (1280). Besitzer: Lobby.
- **Straggler und Titelumbruch (advisory):** `/` („heraus.“), `/suche` („Nummer.“): `text-wrap: balance` für Titel und `pretty` für Fließtext einmal zentral prüfen.

## Zusammenhang mit AC-5 und AC-15

- AC-15: critique (A, von Hand) und Detektor (B, Engine) sind für neun Ansichten nachgeholt. Der Audit-Teil (Touch, Kontrast, Tastatur) ist durch E2E und AC-27 gedeckt (Run 45306653373: 2296 und 2500 Messpunkte, 0 durchgefallen). Distill, clarify, adapt und polish laufen je Fix-PR der Besitzer.
- Der Vermerk „Degradiert: ja“ der M3-PRs 1 bis 4 gilt damit **für diese neun Ansichten** als eingelöst. Lobby-Zustände (5a/5b) und das helle Schema fehlen und stehen im zweiten Lauf.

## Nächste Schritte

1. Fixes nach Besitzer: `/`, `/turniere`, `/suche` w3; `/app` ich (nur der Knopf im geteilten Baustein); Lobby nach Zuweisung. P1 1 bis 4 vor dem Pilot-Gate.
2. Zweiter Lauf nach 5a/5b: Lobby-Zustände (Captain mit Leiste, Phasen, Bestätigt, Gespielt), hell, `/willkommen` und `/einladung`.
3. Look-Entscheid beim Nutzer: Schrift (`overused-font`) und Leuchtpunkte (`dark-glow`).
