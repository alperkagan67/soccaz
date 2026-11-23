---
name: Soccaz
description: Richtung F „Spielerkarte“ (ENTWURF, Vertrag 013 Version 3, G1 2026-11-23, gilt ab M2c): dunkle Tiefblau-Anthrazit-Grundfläche, EINE Leuchtfarbe (Orange) für Hauptaktion und Glow, Teamfarbe als zweite Akzentfarbe, Stufen Kreide bis Legende, ruhige Bewegung nur mit transform und opacity. Hell ohne Glow. Bis M2c gelten die Werte aus src/app/globals.css (Richtung E, Abschnitt unten).
status: entwurf
colors:
  bg: "#0a0f1c"
  panel: "#121a2c"
  panel-2: "#1b2640"
  line: "#31405f"
  control-line: "#6b7d9c"
  ink: "#f2f6fc"
  muted: "#a8b4cc"
  rim: "#cdd8ec"
  accent: "#ff6a1f"
  accent-ink: "#1d0a00"
  accent-fg: "#ff6a1f"
  accent-text: "#ff8f57"
  focus: "#9ecbff"
  ok: "#4ade80"
  warn: "#facc15"
  danger: "#ff8a8a"
  info: "#6cb2ff"
  tier-ink: "#0a0f1c"
  tier-kreide: "#cfd6e4"
  tier-rasen: "#4fd08a"
  tier-flutlicht: "#ffe27a"
  tier-pokal: "#f0b429"
  tier-legende: "#b794ff"
colors-light:
  bg: "#e4e9f2"
  panel: "#f4f6fb"
  panel-2: "#e9edf6"
  line: "#b8c2d6"
  control-line: "#6b7a94"
  ink: "#101828"
  muted: "#4a566d"
  rim: "#101828"
  accent: "#c2410c"
  accent-ink: "#ffffff"
  accent-fg: "#b23a0a"
  accent-text: "#9a3412"
  focus: "#1a44bd"
  ok: "#0f5f2c"
  warn: "#704800"
  danger: "#a51d12"
  info: "#1a44bd"
tiers:
  kreide: 0
  rasen: 55
  flutlicht: 70
  pokal: 80
  legende: 90
glow:
  color: "accent"
  alpha-low: 0.12
  alpha-high: 0.32
  light: "none"
motion:
  dur-fast: 120
  dur-base: 200
  dur-reveal: 600
  dur-reduced: 120
  ease-out: "cubic-bezier(0.22, 1, 0.36, 1)"
typography:
  display:
    fontFamily: "Outfit, Plus Jakarta Sans, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
rounded:
  field: "10px"
  card: "16px"
spacing:
  card: "1rem"
  touch: "44px"
  block-mobile: "16px"
  block-desktop: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.field}"
    height: "44px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "1rem"
  field:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "44px"
---

# Design System: Soccaz

> **Richtung F „Spielerkarte“ ist der Entwurf der Tokens (Vertrag 013 Version 3, G1 2026-11-23).** Sie wird mit M2c in `src/app/globals.css` umgesetzt; bis dahin gelten die Werte der Richtung E (Abschnitt „Bestand bis M2c“ unten, Quelle `src/app/globals.css`). Der Frontmatter oben zeigt den Entwurf F; ihn prüft `tests/unit/design-tokens.test.ts` (Pflicht-Tokens, Kontrast, Stufen, Bewegung). Nach M2c entfallen die E-Reste (AC-16).

## Richtung F „Spielerkarte“ (ENTWURF)

### Grundsätze (013 Version 3, Abschnitt 3)

- **Dunkle Grundfläche** (Anthrazit/Tiefblau) mit Leucht-Effekten; **Hell** folgt der Systemeinstellung als ruhige Variante derselben Karten: **kein Glow**, dafür Rand und Schatten.
- **Zwei Akzentfarben je Ansicht, nicht mehr:** die **Leuchtfarbe** (Orange, zugleich Hauptaktion und Glow) und die **Teamfarbe**. Die Stufenfarben (`tier-*`, unten) sind davon **ausgenommen** (Entscheid t2q 2026-11-23, Vertrag 013 AC-30), dürfen aber **nur als Chip** auftreten (Wort plus `rim`-Rahmen, nie als Fläche, Text oder Hintergrund der Seite), höchstens eine Stufen-Chip-Farbe je Karte; im Hellmodus ist der Chip nur über Wort und Rahmen erkennbar, nie über die Farbe allein (AC-3, AC-10). Prüfung im Stilregel-Test: `tier-*` kommen nur in den Komponenten Chip und `PlayerCard` vor.
- **Inhalt vor Rahmen** (Anmutung ruhig, großzügig): wenige Linien und Kästen, Typografie trägt die Hierarchie, höchstens **eine Hauptaktion** und **vier Schriftgrößen** je Ansicht, Mindestabstand zwischen Blöcken 16 px (Handy) und 24 px (Desktop), keine doppelten Rahmen, keine Banner-Optik (AC-30).
- **Zustand bleibt Form plus Wort** (Status-Tokens und Navigation aus Richtung E gelten weiter).
- **Eigenständig** gegenüber den Vorbildern (AC-29): eigene Kartensilhouette, eigene Stufennamen, eigene Farbwelt; keine Namen, Logos, Schriften, Kartenvorlagen oder Screenshots der Vorbilder im Repo.

### Flächen und Schrift (gemessen, WCAG 2.x; geprüft von `design-tokens.test.ts`)

| Rolle | Dunkel | Hell |
|---|---|---|
| Grund (`bg`) | `#0a0f1c` | `#e4e9f2` |
| Fläche (`panel`) | `#121a2c` | `#f4f6fb` |
| Fläche 2 (`panel-2`, Feldgrund) | `#1b2640` | `#e9edf6` |
| Tinte (`ink`) | `#f2f6fc` | `#101828` |
| Gedämpft (`muted`) | `#a8b4cc` | `#4a566d` |
| Rahmen/Feldlinie (`rim`) | `#cdd8ec` | `#101828` |
| Linie (`line`, nur Trennlinie, kein Bedienrahmen) | `#31405f` | `#b8c2d6` |
| Rand von Bedienelementen (`control-line`, Felder und ruhige Knöpfe) | `#6b7d9c` | `#6b7a94` |
| Leuchtfarbe (`accent`) / Schrift darauf (`accent-ink`) | `#ff6a1f` / `#1d0a00` | `#c2410c` / `#ffffff` |
| Leuchtfarbe als Schrift/Strich (`accent-fg`) | `#ff6a1f` | `#b23a0a` |
| Leuchtfarbe als Schrift auf Tönung (`accent-text`, auf `accent-soft`) | `#ff8f57` | `#9a3412` |
| Fokusring (`focus`) | `#9ecbff` | `#1a44bd` |

Gemessen Dunkel: Tinte auf Fläche 16,0:1, gedämpft auf Fläche 8,3:1, Leuchtfarbe mit Schrift 6,7:1, Leuchtfarbe gegen Fläche 6,1:1, Fokus gegen Fläche 10,3:1. Hell: Tinte auf Fläche 16,4:1, gedämpft 6,8:1, `accent-fg` auf Fläche 5,6:1, Leuchtfarbe mit weißer Schrift 5,2:1. Die Status-Töne (`ok`, `warn`, `danger`, `info`) behalten ihre Werte und werden auch auf den neuen Flächen mit mindestens 4,5:1 geprüft. **Rand von Bedienelementen und Orange auf Tönung (AC-27, Kontrast-PR):** `control-line` gegen Grund, Fläche und Feldgrund: dunkel 4,59 / 4,16 / 3,60, hell 3,56 / 4,02 / 3,70 (mindestens 3:1; ruhiger als `rim`, das nur für Feldlinien und Rahmen mit hohem Gewicht gilt). `accent-text` auf der Tönung (`accent-soft`: dunkel 0,14, hell 0,12 über Grund, Fläche und Feldgrund) mindestens 5,57:1 dunkel und 5,10:1 hell; der Platzhalter nutzt `muted` (auf dem Feldgrund 7,2:1 dunkel, 6,3:1 hell). Das Messprotokoll für alle neuen Flächen (Glow, Verläufe, Teamfarben, Karten, Rollen, 390 und 1280 px, hell und dunkel) ist AC-27 und liegt VOR M3.

### Leuchtfarbe und Glow

- Es gibt **eine** Leuchtfarbe: Orange (`accent`). Sie steht für die eine nächste Handlung (Hauptknopf), die aktuelle Station und den Glow der Karten.
- **Glow ist eine statische Fläche** (radialer Verlauf oder Pseudo-Element hinter der Karte), nie ein Schatten: Deckkraft `alpha-low` 0,12 im Ruhezustand, `alpha-high` 0,32 bei Hover, Fokus und Aufdecken. **Nur die Deckkraft wird animiert** (AC-22). Hell: `glow.light = none`, stattdessen Rand (`rim`) und ein ruhiger Schatten.
- Text auf Glow wird nie unter 4,5:1 gesetzt (AC-27): der Glow liegt hinter einer `panel`-Fläche für den Text oder bleibt unter 0,32.

### Stufen der Spielerkarte

Die Stufe ist ein **Chip** mit Wort und Rahmen (`rim`) in der Stufenfarbe; sie steht nie nur als Farbe da. Alle fünf Chips tragen dunkle Schrift (`tier-ink`). **Hell:** Der Chip ist über das Wort und den `rim`-Rahmen erkennbar, nicht über die Stufenfarbe allein (die Stufenfarben liegen gegen die helle Fläche nur bei 1,2 bis 2,2:1); dunkel liegen sie bei mindestens 6,2:1 gegen die Fläche.

| Stufe | Wertung ab | Chipfarbe (`tier-*`) | Schrift darauf (`tier-ink`) |
|---|---|---|---|
| Kreide | 0 | `#cfd6e4` | `#0a0f1c` |
| Rasen | 55 | `#4fd08a` | `#0a0f1c` |
| Flutlicht | 70 | `#ffe27a` | `#0a0f1c` |
| Pokal | 80 | `#f0b429` | `#0a0f1c` |
| Legende | 90 | `#b794ff` | `#0a0f1c` |

**Einzige Quelle der Wertungsgrenzen und der Umrechnung Elo → Wertung ist `src/lib/rating.ts`** (`RATING_TIERS`, `ratingFromElo`; vorläufig bis nach dem Pilot an echten Elo-Daten). Die Tabelle hier und `tiers` im Frontmatter spiegeln nur die Stufen ab 0/55/70/80/90 und werden NICHT eigenständig geändert; `design-tokens.test.ts` prüft Lückenlosigkeit und Reihenfolge und gleicht sie mit `rating.ts` ab, sobald die Datei im Repo liegt. Weder Formel noch Elo-Grenzen stehen in diesem Dokument.

### Karten (`PlayerCard`, `TeamCard`)

- **Eigene Silhouette:** Rechteck mit Radius 16 px und einer diagonalen Kerbe an der oberen rechten Ecke (`clip-path`), **keine** Schild- oder Kartenform eines Vorbilds. Der Fokusring liegt außen am Container (Abstand 2 px), damit die Kerbe ihn nicht abschneidet.
- **Inhalt (Spielerkarte):** Wertung groß, Position (Kürzel und Wort), Name (nur angemeldete Nutzer), Initialen statt Foto (keine Fotos, keine Uploads), Teamfarbe als schmaler Streifen links, Stufe als Chip. **Gäste** sehen eine neutrale Karte (Initialen und Zahlen, keine Wertung, kein Name), Hallenbetreiber namenfrei (AC-17).
- **Teamkarte:** Trikotfarbe als Akzent, Wappen-Platzhalter aus Initialen, Teamwertung als Zahl. Text auf der Teamfarbe nach Kontrast (Weiß oder Fast-Schwarz, wie bei den Teamfarben unten).
- **Listen** (Rangliste, Spielersuche) zeigen einfache Zeilen statt Vollkarten; höchstens **sechs gleichzeitig animierte Karten** (AC-21).

### Bewegung

| Token | Wert | Verwendung |
|---|---|---|
| `dur-fast` | 120 ms | Hover, Fokus, Knopfzustand |
| `dur-base` | 200 ms | Kartenaufbau, Ein-/Ausblenden |
| `dur-reveal` | 600 ms | Karten-Aufdecken, Aufstieg |
| `dur-reduced` | 120 ms | `prefers-reduced-motion: reduce`: nur Ein-/Ausblenden, keine Bewegung (unter 150 ms, AC-23) |
| `ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | alle Übergänge |

- **Animiert werden nur `transform` und `opacity`** (AC-22). Nie `width`, `height`, `top`, `left`, `margin`, `box-shadow` oder `filter`. `will-change` nur während der Animation. Keine Animationsbibliothek ohne ADR 0003 (Standard: CSS und Web Animations).
- Jede Animation endet im selben Zustand wie die statische Darstellung; die Information steht immer auch als Text (alte → neue Wertung, Pfeil, Stufenname).
- **Aufstiegsfeier einmal je neuem Höchststand** (`shouldCelebrate` in `src/lib/rating.ts`): Merker nur im Browser. Folge, laut Vertrag so gewollt: auf einem neuen Gerät oder nach gelöschtem Speicher gibt es EINMAL eine Feier für die bereits erreichte Stufe (ab Rasen).

### Schrift, Abstände, Radien

- Schriften unverändert: **Outfit** (Überschriften) und **Plus Jakarta Sans** (Text), beide unter der **SIL Open Font License 1.1**, über `next/font/google` eingebunden (AC-29: Lizenznachweis hier, keine Fremdschriften). Höchstens **vier Schriftgrößen** je Ansicht aus der vorhandenen Skala `--fs-*`.
- Abstände aus der vorhandenen 4er-Skala `--space-*`; Blockabstand mindestens 16 px (Handy) und 24 px (Desktop). Touch-Ziele 44 px bleiben.
- Radien: Feld 10 px, Karte 16 px.

## Bestand bis M2c: Richtung E „Trikot“ (wird mit M2c ersetzt)

> Dieser Abschnitt beschreibt, was heute in `src/app/globals.css` steht. Neutrale Töne und Orange werden durch Richtung F ersetzt; **Teamfarben, Lobby-Feld, Ausnahmen von AC-14, Status, Fokus und Abstände bleiben** (siehe Vertrag 013 Version 3, Abschnitt 2).

### Verbindliche Richtung: E „Trikot“ (Nutzerentscheid 2026-11-10, Vertrag 007)

Seit Vertrag 007 gilt Richtung E, Vertrag 013 baut sie flächendeckend um. Es gibt keinen Ist-Stand-Teil mehr; was hier steht, gilt. Referenz: `docs/design/richtung-e-trikot.html` (Skizze, dunkel und hell), Kontrastwerte: Tabelle in `docs/design/README.md`, Abschnitt „Teamfarben und Lesbarkeit“.

#### Grundsätze

- **Hell und dunkel folgen der Systemeinstellung** (`prefers-color-scheme`). Es gibt keinen eigenen Umschalter und keinen festen Standard.
- **Orange ist die einzige Akzentfarbe, und nur für Marke und Hauptaktion.** Sie steht für die eine nächste Handlung und den aktuellen Stand: Hauptknopf, Mittelknopf „Spiel suchen“, aktiver Navigationsstrich, **aktuelle Station** im Weg bis zum Anstoß (Stationsmarker). Alles andere ist neutral (Fläche, Tinte, gedämpft, Linie) oder Teamfarbe.
- **Teamfarbe ist Identität, nie Funktion.** Sie färbt die Feldhälfte, den Teamnamen-Chip und kleine Farbmarken. Sie trägt weder Handlung noch Status.
- **Zustand ist immer Form plus Wort.** Ampel: Ring = in der Lobby, Halbfläche = bereit und bezahlt, Haken = bestätigt, gestrichelt = Platz frei. Die Legende nennt das Wort.
- **Spielnummer** bleibt als Anzeigetafel-Chip (invertiert: Tinte als Grund, Fläche als Schrift) das wiederkehrende Zeichen.

#### Neutrale Töne und Orange (Tokens in `src/app/globals.css`, Referenzwerte in `src/lib/color.ts`)

| Rolle | Dunkel | Hell |
|---|---|---|
| Grund (`bg`) | `#0f1914` | `#dde5e0` |
| Fläche (`fl`) | `#1b2a23` | `#f1f5f2` |
| Fläche 2 (`fl2`, Feld-Grundfläche) | `#24362d` | `#e3eae5` |
| Tinte (`ink`) | `#eef4f0` | `#12201a` |
| Gedämpft (`muted`) | `#a3b5ab` | `#4a5a51` |
| Rahmen/Feldlinie (`rim`) | `#cfe0d6` | `#12201a` |
| Linie (`line`) | `#3a5043` | `#b3c2b9` |
| Rand von Bedienelementen (`control-line`) | `#6f8a7c` | `#6b7f73` |
| Orange (`o`) / Schrift darauf (`oi`) | `#ff6a1f` / `#1d0a00` | `#c2410c` / `#ffffff` |
| Orange als Schrift (`accent-fg`) | `#ff6e24` | `#b23a0a` |
| Orange als Schrift auf Tönung (`accent-text`, auf `accent-soft`) | `#ff8f57` | `#9a3412` |

Gemessen (WCAG 2.x): Tinte auf Fläche 13,43:1 / 15,30:1, gedämpft auf Fläche 6,96:1 / 6,64:1, Orange mit Schrift 6,69:1 / 5,18:1, Orange gegen Fläche 5,23:1 / 4,71:1. Das helle Orange ist bewusst dunkler als das dunkle, weil `#ff6a1f` auf heller Fläche unter 3:1 fällt.

**Kontrast-PR (AC-27, Befunde 1 bis 4 der Baseline `docs/design/ac27-kontrast-baseline.md`):**
- **Rand von Bedienelementen** (`.btn-ghost`, `.field`, ruhige Knöpfe): `--control-line` statt `--line` (die Trennlinie war als Rand mit 1,44 bis 2,06:1 zu schwach). Gemessen gegen Grund, Fläche und Feldgrund (schlechteste zählt): dunkel `#6f8a7c` 4,79 / 4,00 / 3,41, hell `#6b7f73` 3,33 / 3,89 / 3,50, jeweils mindestens 3:1 und bewusst ruhig (`--rim` mit ca. 12:1 bleibt Feldlinien und Rahmen mit hohem Gewicht vorbehalten). Karten und Trennlinien behalten `--line`; der Hover-Rand bleibt Orange.
- **Platzhalter:** `::placeholder { color: var(--muted); opacity: 1 }` (statt der Tailwind-Vorgabe `currentcolor` zu 50 %): auf dem Feldgrund dunkel 5,95:1, hell 5,98:1 (vorher gemessen 4,12 und 3,13).
- **Orange als Schrift auf Tönung** (`accent-soft`: dunkel 0,14, hell 0,12): `--accent-text` (dunkel `#ff8f57`, hell `#9a3412`) mindestens 4,80:1 dunkel und 4,85:1 hell auf der Tönung über Grund, Fläche und Feldgrund (vorher 3,78 bis 5,26 und 3,98 bis 4,58). Die Regel `.bg-accent-soft.text-accent-fg, .bg-accent-soft .text-accent-fg` setzt es ohne Änderung der Komponenten; `--accent-fg` bleibt für Orange auf Grund und Fläche. Tailwind: `text-accent-text`, `border-control-line`.

#### Teamfarben

- Jedes Team wählt **eine Trikotfarbe aus der festen 12er-Palette**: Rot `#c8102e`, Bordeaux `#7a1f3d`, Pink `#e9498c`, Violett `#6a3fb5`, Marine `#14284b`, Blau `#1f4fd1`, Himmelblau `#4fb3e8`, Türkis `#0fb5a6`, Grün `#1e9e4a`, Gelb `#f2c200`, Weiß `#f4f4f2`, Schwarz `#15181c`. Freie Farbwahl gibt es nicht. Orange ist ausgeschlossen, damit die Akzentfarbe einmalig bleibt.
- **Textfarbe nach Kontrast**: auf jeder Teamfarbe Weiß `#ffffff` oder Fast-Schwarz `#0b1118`, je nachdem, welche das größere Verhältnis ergibt. Alle zwölf erreichen mindestens 4,5:1 (Werte in der Tabelle in `docs/design/README.md`). Auch Spielerzeichen auf der Hälfte (Ring, Halbfläche, Haken) nutzen diese Textfarbe.
- **Ähnliche Teamfarben im selben Spiel sind gesperrt.** Zwei Teams eines Spiels dürfen keine Farben mit einem CIEDE2000-Abstand unter 20 haben (Details und gesperrte Paare in Vertrag 007, AC-9).
- **Neutraler Rahmen um jede Hälfte** in der Feldlinienfarbe (`rim`): Eine Teamfarbe kann zur Fläche unter 3:1 liegen (Marine auf Dunkel 1,02:1, Gelb auf Hell 1,53:1). Der Rahmen und der Teamname als Text halten die Hälfte lesbar.
- Teams ohne gewählte Farbe bekommen eine **Standardfarbe aus dem Slug** (stabil, aus der Palette); das Team kann sie jederzeit ändern.

#### Lobby-Feld

Zwei Hälften nebeneinander auf neutraler Grundfläche (`fl2`): links Heim, rechts Gast, jede in der Teamfarbe, Mittellinie und Mittelkreis in `rim`. Spieler als Zeichen in der Textfarbe der Hälfte, leere Plätze gestrichelt. Darunter die Teamnamen als Chips in Teamfarbe mit Textfarbe, Elo und Stärke als zweite Zeile. Ab einer Schwelle von Spielern (Privatspiel bis 22) wechselt das Feld in eine Liste mit denselben Zeichen.

#### Ausnahmen von AC-14 (Orange einzige Akzentfarbe)

Status-Töne (`--ok`, `--warn`, `--danger`, `--info`, Abschnitt „Status“) sind Zustandsfarben, keine Akzentfarben; sie kommen zu den Ausnahmen unten dazu.

Umgesetzt in `src/app/globals.css` (Vertrag 007, M1). Geprüft von `tests/unit/accent.test.ts`; diese Ausnahmen sind bewusst und kein Verstoß:

- **`--accent-fg`**: Orange als Schrift und Strich. Dunkel `#ff6e24` (ein Hauch heller als `--accent` `#ff6a1f`, damit die Schrift auch auf dem Feldgrund `#24362d` 4,58:1 erreicht statt 4,47:1; AC-27), hell `#b23a0a`, weil `#c2410c` als kleine Schrift auf dem hellen Grund `#dde5e0` nur 4,03:1 erreicht; `#b23a0a` liegt auf Grund und Fläche bei mindestens 4,5:1. Es ist derselbe Orangeton in dunklerer Stufe, keine zweite Akzentfarbe.
- **`--pc-green`, `--pc-cyan`, `--pc-sky`, `--pc-violet`, `--pc-pink`, `--pc-coral`, `--pc-yellow`**: die sieben wählbaren Profilfarben der Spieler (`src/lib/profile-options.ts`). Sie sind Identität, nie Zustand oder Handlung.
- **`--card-yellow` (`#f2c200`), `--card-red` (`#c8102e`)**: Gelbe und Rote Karte im Spielverlauf. Sportdaten, beide Werte stammen aus der Teamfarben-Palette.
- **`.force-dark`**: feste dunkle Werte für das Stream-Overlay, unabhängig von der Systemeinstellung.
- **`src/server`** (OG-Bilder und Karten, zum Beispiel `cards.tsx` mit `#030806`) ist vom AC-14-Test ausgenommen und steht im Backlog.
- Noch offen (M4): die Ampel in `PlayerLight` nutzt feste Hex-Werte außerhalb der Tokens, bis sie auf Form plus Wort umgestellt ist.

## Typografie

- Schriften: Outfit für Überschriften, Plus Jakarta Sans für Text. Hell und Dunkel gleich.
- **Stufen** (Tokens `--fs-*`): xs 12 px, sm 14, base 16, lg 18, xl 22, 2xl 28, 3xl 36. Text im Fluss ist base; Zusatzangaben sm; **xs ist die kleinste erlaubte Stufe und nur für Zusatztext, nie für Bedienelemente oder Pflichtangaben.**
- **Nichts unter 12 px.** Die ESLint-Regel `soccaz/min-font-size` verbietet `text-[Npx]` und `fontSize` unter 12 px in `src/` (ausgenommen der PDF-Beleg, der in Punkt rechnet). Altbestand `LiveBadge.tsx` (`text-[11px]`) ist nur eine Warnung, bis M2b/M3 ihn auf `text-xs` umstellt. `globals.css` wird per Test geprüft.
- Zeilenlänge im Fließtext höchstens etwa 70 Zeichen; Überschriften ohne Großbuchstaben-Blöcke.

## Status

Vier Zustandsfarben, je Dunkel und Hell, jeweils mit `-ink` (Schrift auf voller Fläche) und `-soft` (Tönung, Deckkraft 0,10):

| Token | Bedeutung | Dunkel | Hell |
|---|---|---|---|
| `--ok` | geschafft, bezahlt, bestätigt | `#4ade80` | `#0f5f2c` |
| `--warn` | braucht bald Aufmerksamkeit, offen | `#facc15` | `#704800` |
| `--danger` | fehlgeschlagen, destruktiv | `#ff8a8a` | `#a51d12` |
| `--info` | Hinweis ohne Handlung | `#6cb2ff` | `#1a44bd` |

- **Status ist immer Symbol plus Wort plus Farbe, nie nur Farbe** (013 AC-3; 012 AC-12). Die Komponente dafür ist `StatusBadge` (M2-2).
- Gemessen: Schrift in jedem Status-Ton auf Grund, Fläche, Feldgrund **und** auf der Tönung mindestens 4,5:1; `-ink` auf dem Ton mindestens 4,5:1 (Test).
- Orange ist **kein** Status. Warnung ist gelb, nicht orange.

## Fokus und Tastatur

- Der Fokusring-Token `--focus` (Dunkel `#9ecbff`, Hell `#1a44bd`, Breite `--focus-w` 2 px) ist definiert und gemessen: mindestens 3:1 gegen Grund, Fläche und Feldgrund (Test), bewusst nicht Orange, damit er auf Orange-Knöpfen sichtbar bleibt.
- **Noch nicht angewendet:** `:focus-visible` und `.field:focus` in `globals.css` nutzen vorerst weiter `--accent`, weil M2-1 keine Darstellung ändert. Die Umstellung auf `--focus` kommt in M2b/M3 (zusammen mit den Impeccable-Belegen, 013 AC-15).
- Kein Element entfernt den Fokusring ohne gleichwertigen Ersatz.

- **Konto-Menü, Auslöser (bewusster Wechsel, AC-15):** Der Auslöser nutzt `buttonClasses("secondary", "sm")` statt `btn btn-ghost !min-h-9` (36 px): mit Rahmen, 44 px Tippziel, Chevron und Offen-Zustand über `aria-expanded`. Die Darstellung der Kopfleiste ändert sich dadurch sichtbar (Bilder vorher/nachher im PR).
- **Popover-API (Konto-Menü, M2-4a):** `UserMenu` nutzt `popover` und `popovertarget`. Mindestversionen: Chrome/Edge 114, Safari 17, Firefox 125 (Stand 2026-11). Ältere Browser bekommen das Menü nicht (es bleibt verborgen, `not-supports-[selector(:popover-open)]:hidden`); die Navigation bleibt über die Leiste unten und die Fußzeile erreichbar.

## Abstände, Touch und Breiten

- 4er-Raster: `--space-1..8` = 4, 8, 12, 16, 24, 32, 48, 64 px.
- **Touch-Ziele mindestens 44 px** (`--tap`), auch für Symbol- und Zeilenknöpfe.
- Seitenbreiten (`PageShell`, M2-2): schmal 720 px, Standard 1040 px, voll 1280 px.

## Orange-Regel (Leuchtfarbe)

Orange (`--accent`) steht für die **eine nächste Handlung** (Hauptknopf, Mittelknopf, aktiver Navigationsstrich) und die aktuelle Station im Weg zum Anstoß. Orange als Schrift (`--accent-fg`) ist nur für Marke und Hauptaktion zulässig, nicht für Status, Warnungen oder Fehler. Bestehende Stellen, die Orange als Status nutzen (Verdichtung K09), wechseln in M3 bis M7 mit der jeweiligen Seitengruppe auf die Status-Tokens.

## Bausteine

Native Elemente und eigene Komponenten, kein shadcn/Radix (ADR 0002). Die Basiskomponenten (`Button`, `PageShell`, `PageTitle`, `StateMessage`, `StatusBadge`, `ConfirmDialog`, `Form`, `DateTimeField`) entstehen in M2-2 und M2-3 aus diesen Tokens; bis dahin gelten die Klassen `.card`, `.btn`, `.field` aus `globals.css`.

## Do's and Don'ts

- **Do** Zustand als Symbol und Wort zeigen; die Ampel nie allein stehen lassen.
- **Do** Farben nur aus den Tokens nehmen, keine freien Hex-Werte in Komponenten.
- **Do** 44 px Touch-Ziele und `safe-area-inset-bottom` bei fixierten Leisten einhalten.
- **Don't** Orange für Status, Warnung oder Fehler einsetzen.
- **Don't** Schrift unter 12 px oder Text nur durch Farbe unterscheiden.
- **Don't** Privatspiel- oder Kaderdaten gestalterisch andeuten, die das Datenschutzmodell verbirgt.
- **Don't** Kontrast ohne Messung ändern (Ziel 4,5:1 Text, 3:1 Linien und Symbole).
