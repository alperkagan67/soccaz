# Impeccable-Engine-Lauf: Turnier-Ablehnen (Backlog 161 PR 2, AC-15)

Stand: 2026-11-24 · Code-Stand `origin/main` 3666ee7 (#355) · Verfasser: worker-4 · Auftrag: t2q/t2s · Folgt auf [Lauf 3](impeccable-lauf-m3-3.md)

Zweck: die **neuen** Seiten der Turnier-Ablehnung (Halle `/halle`: Ablehnen-Block; Veranstalter `/turniere/[id]`: Kasten mit zwei Wegen und Neuwahl; Captain und Gast als Gegenprobe) mit der Engine messen und die Bewertung ehrlich dokumentieren. Ergebnis: **keine P0, kein P1**, vier P2 (ein Touch-Ziel unter 44 px, ein Widerspruch im Wortlaut, Zeilenlänge, ein altes Listenlink-Ziel), dazu die Schrift (`overused-font`, Look-Entscheid des Nutzers).

## Methode und Grenzen (Degradiert-Zeile)
- Engine 0.1.19, **ein** Dev-Server (3104, `PAYMENTS_FAKE=1`, node-direkt) und **ein** Chromium mit DevTools-Port 9222 (`impeccable detect --cdp 9222 --target <Kennung> --json`), 16 Scans (8 Ansichten × 390 und 1280 px), danach alles beendet (3104 und 9222 ohne lauschenden Socket, kein Chromium-Prozess). Port 3100 nicht berührt.
- **Assessment B (Engine)** plus **Messwerte per Skript** (Hauptaktionen `main .btn-primary`, Knöpfe und Links unter 44 px, Schrift unter 12 px, Seitenhöhe und -breite) und **Sicht auf die Screenshots** (Assessment A). Die Seiten stammen von w3, die Bewertung von mir; die Bewertung ist **nicht** durch einen zweiten Reviewer geprüft, der Engine-Lauf ist die unabhängige Messung.
- **Seeds:** Wegwerf-Daten per DB (Betreiber mit aktivem Zugang, Veranstalter, Captain, Halle, drei Turniere: ohne Ablehnung, abgelehnt in der Zahlungsphase, abgelehnt nach „Andere Halle wählen“ in der Anmeldephase), nur Datenbank `soccaz_w4`, nur `@test.local`-Konten; Anmeldung über den Dev-Login.
- **Ansichten (je 390 und 1280 px):** a1 Halle, Liste (Ablehnen eingeklappt, dunkel), a2 Halle mit **geöffnetem** Ablehnen-Block, a3 Halle hell, b1 Veranstalter abgelehnt (dunkel), b2 hell, b3 Veranstalter nach „Andere Halle wählen“ (Neuwahl), c1 Captain, d1 Gast.
- **Lücken (nicht erfasst):** der Zustand „Die Abbuchung hat begonnen: Ablehnen ist nicht mehr möglich“ (`tournament-decline-locked`, braucht Abbuchungszeilen); Veranstalter-Kasten hell nur im Zustand b1; Kontrastmessung AC-27 der neuen Zustände (die Engine misst keinen WCAG-Kontrast, die Baseline der Kontrastmessung deckt die neuen Seiten nicht ab); Mitteilungstexte (kein UI); Teamsicht mit Karte und Zahlstand; Englisch; Tablet. Anmutung (AC-30 a, e) nicht gemessen.

## Ansichten und Funde (Assessment B)
Spalten: Engine-Funde außer `overused-font` · Hauptaktionen (`main .btn-primary`) · Knöpfe oder Links unter 44 px · Seitenhöhe.
| Ansicht | Funde | Primär | unter 44 px | Höhe (390 / 1280) |
|---|---|---|---|---|
| a1 Halle, Liste | 1280: 1× straggler | 0 (siehe unten) | – | 1336 / 1012 |
| a2 Halle, Ablehnen geöffnet | 1280: 1× straggler | 0 (siehe unten) | – | 1877 / 1533 |
| a3 Halle, hell | 1280: 1× straggler | 0 (siehe unten) | – | 1336 / 1012 |
| b1 Veranstalter, abgelehnt | 1280: 1× line-length | 1 | Teamlink 20 px | 1822 / 1338 |
| b2 Veranstalter, abgelehnt, hell | 1280: 1× line-length | 1 | Teamlink 20 px | 1822 / 1338 |
| b3 Veranstalter, Neuwahl | 1280: 2× line-length | 0 | „Turnier absagen“ 36 px | 1863 / 1355 |
| c1 Captain | 1280: 1× straggler | 0 | Teamlink 20 px | 1472 / 1056 |
| d1 Gast | – | 1 | Teamlink 20 px | 1422 / 1026 |

In allen 16 Scans: `overused-font` (Look-Entscheid des Nutzers, nur gemeldet). **`cramped-padding`: 0, `nested-cards`: 0, `dark-glow`: 0**, kein horizontaler Überlauf (Breite gleich Fensterbreite), keine Schrift unter 12 px. Auf der Halle-Seite zeigt das Messskript „Primär 0“, obwohl „Zusagen“ als einziger gefüllter oranger Knopf sichtbar ist: der Baustein trägt eine andere Klasse als `btn-primary`; „Turnier ablehnen (Grund angeben)“ ist ein ruhiger Ghost, „Ablehnung senden“ eine rote Gefahr-Fläche. Auf dem d1-Gast steht die eine Hauptaktion der Turnierseite, nicht die der Ablehnung.

## Prüfung gegen AC-5, AC-15 und AC-30
- **Hauptaktion je Zustand:** Halle: „Zusagen“ (1 orange), Ablehnen ruhig; Veranstalter abgelehnt: „Andere Halle wählen“ (1 orange), „Turnier absagen“ ruhig und 44 px; Neuwahl: „Halle speichern“ ist bis zur Auswahl gesperrt (0 aktive Hauptaktionen, ruhiger gestrichelter Stil, bewusst); Captain und Gast: nur die Seite des Turniers.
- **Sichtbarkeit (AC-17):** der Veranstalter sieht „Grund: Belegt“, nie den Freitext; Gast und Captain sehen im Lauf nichts von der Ablehnung außer dem neutralen Satz für Teammitglieder.
- **AC-30 (c) Karte in Karte:** keine; **(d) erste Ansicht bei 390 px:** die Hauptaktion liegt in beiden Veranstalter-Zuständen in der ersten Bildschirmhöhe (y rund 400), bei der Halle liegt „Zusagen“ bei rund 640 (erste Ansicht 844 px).

## Fundliste
**P0:** keine. **P1:** keine.
| # | Befund | Stufe | Quelle | Fundstelle | Vorschlag | Pilot |
|---|---|---|---|---|---|---|
| 1 | **„Turnier absagen“ im Veranstalter-Kasten der Neuwahl nur 36 px hoch** (alter Knopf, `!min-h-9 !px-3`) | P2 | B | `src/app/turniere/[id]/page.tsx` (Knopf „Turnier absagen“, `btn-danger`) | `!min-h-11 !px-4` wie die neuen Knöpfe | Touch-Ziele (6a), nur Zustand Neuwahl |
| 2 | **Wortlaut widerspricht sich:** „Die Entscheidung der Halle ist **endgültig**. Wähle eine andere Halle (oder **dieselbe erneut**)“ und in der Neuwahl „Die Entscheidung ist endgültig … oder dieselbe erneut, dann wird sie neu angefragt“ | P2 | A | `page.tsx` (`venue-declined-reason`), `TournamentVenuePick.tsx` | mit t2q klären, z. B. „endgültig für diese Anfrage; eine neue Anfrage ist möglich“ (zusammen mit dem Soll aus R-T412: der Server lässt eine Zusage nach der Ablehnung zu) | Verständlichkeit, Block 4 |
| 3 | **Zeilenlänge** (1280 px): die Sätze im Kasten und in der Neuwahl laufen über rund 100 Zeichen | P2 | B | `venue-declined-reason`, `venue-pick-declined` | `max-w-prose` am Absatz | nein (nur Desktop) |
| 4 | **Teamlink in der Kaderliste 20 px** auf der Turnierseite für alle Rollen; der Listenlink-Punkt aus Pilot-P2 PR B betraf nur `LobbyBoard` | P2 | B | `src/app/turniere/[id]/page.tsx` (Turnier-Lobby) | `inline-flex min-h-11 items-center` | Touch-Ziele |
| – | Straggler (Halle, Captain; 1280 px), `overused-font` | P2 / Look | B | – | zentral `text-wrap: pretty`; Schrift: Look-Entscheid (Backlog 239) | nein |

Positiv: Der Ablehnen-Block ist kompakt (ein Disclosure, Kategorien als große Auswahlzeilen mit mindestens 44 px, Hinweissatz mit Symbol und Wort **vor** dem Absenden, „Bitte keine Namen von Personen“), der Veranstalter-Kasten hat genau einen orangen Knopf, die Rechtsfolge steht einmal, kein horizontaler Überlauf, keine Schrift unter 12 px.

## Zusammenhang mit AC-5, AC-15 und AC-30
- AC-15: Engine-Durchgang für die neuen Seiten **erfolgt** (kein P0, kein P1); der Vermerk „Degradiert“ der PR-2-Beschreibung gilt für die erfassten Ansichten als eingelöst, **nicht** für den Zustand „Abbuchung begonnen“, den Kontrast (AC-27) und die zweite, unabhängige Bewertung.
- AC-30: (b), (c), (d) erfüllt; (a) und (e) nicht gemessen.
- Pilot: kein neuer Blocker; P2 1 und 4 sind kleine Touch-Ziel-Änderungen, die zu den Pilot-P2-PRs passen.

## Nebenbefund: lokale Neulade-Schleife auf `/anmelden` (kein Produktfehler)
Gegenprobe auf **sauberem `origin/main` 3666ee7** (frischer Worktree, frisch gestarteter Server, `APP_ENV` nicht gesetzt, `.env.local` unverändert): der Dev-Login lief ohne Schleife (3 Navigationen bis `/app`, Probe-Spec grün), und alle Anmeldungen dieses Laufs funktionierten. Die Schleife trat nur im Worktree des PR C auf (Zustand dieses Worktrees oder Servers): **Umgebung, kein Befund für das Produkt**; kein Backlog-Eintrag.
