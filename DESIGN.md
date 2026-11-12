---
name: Soccaz
description: Richtung E „Trikot“: neutrale Grüngrau-Töne, Orange nur für Marke und Hauptaktion, Teamfarbe als Identität, Status mit Symbol und Wort. Hell und Dunkel folgen dem System.
colors:
  bg: "#0f1914"
  panel: "#1b2a23"
  panel-2: "#24362d"
  line: "#3a5043"
  ink: "#eef4f0"
  muted: "#a3b5ab"
  rim: "#cfe0d6"
  accent: "#ff6a1f"
  accent-ink: "#1d0a00"
  ok: "#4ade80"
  warn: "#facc15"
  danger: "#ff8a8a"
  info: "#6cb2ff"
  focus: "#9ecbff"
typography:
  display:
    fontFamily: "Outfit, Plus Jakarta Sans, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "1rem"
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  field: "10px"
  card: "12px"
spacing:
  card: "1rem"
  touch: "44px"
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

> Verbindlich seit Vertrag 007 (Richtung E „Trikot“), erweitert in Vertrag 013 M2-1 (Typo-Skala, Status, Fokus, Abstände). Quelle der Werte ist `src/app/globals.css`; Kontrast und Übereinstimmung prüfen `tests/unit/contrast.test.ts` und `tests/unit/accent.test.ts`. Der Frontmatter zeigt die dunklen Werte.

## Verbindliche Richtung: E „Trikot“ (Nutzerentscheid 2026-11-10, Vertrag 007)

Seit Vertrag 007 gilt Richtung E, Vertrag 013 baut sie flächendeckend um. Es gibt keinen Ist-Stand-Teil mehr; was hier steht, gilt. Referenz: `docs/design/richtung-e-trikot.html` (Skizze, dunkel und hell), Kontrastwerte: Tabelle in `docs/design/README.md`, Abschnitt „Teamfarben und Lesbarkeit“.

### Grundsätze

- **Hell und dunkel folgen der Systemeinstellung** (`prefers-color-scheme`). Es gibt keinen eigenen Umschalter und keinen festen Standard.
- **Orange ist die einzige Akzentfarbe, und nur für Marke und Hauptaktion.** Sie steht für die eine nächste Handlung und den aktuellen Stand: Hauptknopf, Mittelknopf „Spiel suchen“, aktiver Navigationsstrich, **aktuelle Station** im Weg bis zum Anstoß (Stationsmarker). Alles andere ist neutral (Fläche, Tinte, gedämpft, Linie) oder Teamfarbe.
- **Teamfarbe ist Identität, nie Funktion.** Sie färbt die Feldhälfte, den Teamnamen-Chip und kleine Farbmarken. Sie trägt weder Handlung noch Status.
- **Zustand ist immer Form plus Wort.** Ampel: Ring = in der Lobby, Halbfläche = bereit und bezahlt, Haken = bestätigt, gestrichelt = Platz frei. Die Legende nennt das Wort.
- **Spielnummer** bleibt als Anzeigetafel-Chip (invertiert: Tinte als Grund, Fläche als Schrift) das wiederkehrende Zeichen.

### Neutrale Töne und Orange (Tokens in `src/app/globals.css`, Referenzwerte in `src/lib/color.ts`)

| Rolle | Dunkel | Hell |
|---|---|---|
| Grund (`bg`) | `#0f1914` | `#dde5e0` |
| Fläche (`fl`) | `#1b2a23` | `#f1f5f2` |
| Fläche 2 (`fl2`, Feld-Grundfläche) | `#24362d` | `#e3eae5` |
| Tinte (`ink`) | `#eef4f0` | `#12201a` |
| Gedämpft (`muted`) | `#a3b5ab` | `#4a5a51` |
| Rahmen/Feldlinie (`rim`) | `#cfe0d6` | `#12201a` |
| Linie (`line`) | `#3a5043` | `#b3c2b9` |
| Orange (`o`) / Schrift darauf (`oi`) | `#ff6a1f` / `#1d0a00` | `#c2410c` / `#ffffff` |

Gemessen (WCAG 2.x): Tinte auf Fläche 13,43:1 / 15,30:1, gedämpft auf Fläche 6,96:1 / 6,64:1, Orange mit Schrift 6,69:1 / 5,18:1, Orange gegen Fläche 5,23:1 / 4,71:1. Das helle Orange ist bewusst dunkler als das dunkle, weil `#ff6a1f` auf heller Fläche unter 3:1 fällt.

### Teamfarben

- Jedes Team wählt **eine Trikotfarbe aus der festen 12er-Palette**: Rot `#c8102e`, Bordeaux `#7a1f3d`, Pink `#e9498c`, Violett `#6a3fb5`, Marine `#14284b`, Blau `#1f4fd1`, Himmelblau `#4fb3e8`, Türkis `#0fb5a6`, Grün `#1e9e4a`, Gelb `#f2c200`, Weiß `#f4f4f2`, Schwarz `#15181c`. Freie Farbwahl gibt es nicht. Orange ist ausgeschlossen, damit die Akzentfarbe einmalig bleibt.
- **Textfarbe nach Kontrast**: auf jeder Teamfarbe Weiß `#ffffff` oder Fast-Schwarz `#0b1118`, je nachdem, welche das größere Verhältnis ergibt. Alle zwölf erreichen mindestens 4,5:1 (Werte in der Tabelle in `docs/design/README.md`). Auch Spielerzeichen auf der Hälfte (Ring, Halbfläche, Haken) nutzen diese Textfarbe.
- **Ähnliche Teamfarben im selben Spiel sind gesperrt.** Zwei Teams eines Spiels dürfen keine Farben mit einem CIEDE2000-Abstand unter 20 haben (Details und gesperrte Paare in Vertrag 007, AC-9).
- **Neutraler Rahmen um jede Hälfte** in der Feldlinienfarbe (`rim`): Eine Teamfarbe kann zur Fläche unter 3:1 liegen (Marine auf Dunkel 1,02:1, Gelb auf Hell 1,53:1). Der Rahmen und der Teamname als Text halten die Hälfte lesbar.
- Teams ohne gewählte Farbe bekommen eine **Standardfarbe aus dem Slug** (stabil, aus der Palette); das Team kann sie jederzeit ändern.

### Lobby-Feld

Zwei Hälften nebeneinander auf neutraler Grundfläche (`fl2`): links Heim, rechts Gast, jede in der Teamfarbe, Mittellinie und Mittelkreis in `rim`. Spieler als Zeichen in der Textfarbe der Hälfte, leere Plätze gestrichelt. Darunter die Teamnamen als Chips in Teamfarbe mit Textfarbe, Elo und Stärke als zweite Zeile. Ab einer Schwelle von Spielern (Privatspiel bis 22) wechselt das Feld in eine Liste mit denselben Zeichen.

### Ausnahmen von AC-14 (Orange einzige Akzentfarbe)

Status-Töne (`--ok`, `--warn`, `--danger`, `--info`, Abschnitt „Status“) sind Zustandsfarben, keine Akzentfarben; sie kommen zu den Ausnahmen unten dazu.

Umgesetzt in `src/app/globals.css` (Vertrag 007, M1). Geprüft von `tests/unit/accent.test.ts`; diese Ausnahmen sind bewusst und kein Verstoß:

- **`--accent-fg`**: Orange als Schrift und Strich. Dunkel `#ff6a1f` (wie `--accent`), hell `#b23a0a`, weil `#c2410c` als kleine Schrift auf dem hellen Grund `#dde5e0` nur 4,03:1 erreicht; `#b23a0a` liegt auf Grund und Fläche bei mindestens 4,5:1. Es ist derselbe Orangeton in dunklerer Stufe, keine zweite Akzentfarbe.
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

## Orange-Regel

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
