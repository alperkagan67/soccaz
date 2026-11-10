---
name: Soccaz
description: Dunkles Schwarzgrün mit grünem Signalton und Neon-Akzenten für Hallenfußball auf dem Handy.
colors:
  bg: "#030806"
  panel: "#07110c"
  panel-2: "#0b1a13"
  line: "#12221b"
  ink: "#ffffff"
  muted: "#8ea299"
  green: "#22c55e"
  green-dark: "#15803d"
  lime: "hsl(78, 96%, 56%)"
  cyan: "hsl(190, 93%, 52%)"
  sky: "hsl(211, 95%, 58%)"
  violet: "hsl(262, 86%, 64%)"
  pink: "hsl(327, 92%, 61%)"
  coral: "hsl(12, 95%, 62%)"
  yellow: "hsl(44, 98%, 58%)"
  red: "hsl(0, 75%, 55%)"
typography:
  display:
    fontFamily: "Outfit, Plus Jakarta Sans, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontWeight: 400
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
rounded:
  field: "10px"
  card: "12px"
  panel: "16px"
spacing:
  card: "1rem"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "#03120a"
    rounded: "{rounded.field}"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
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

> Stand der Dinge (Scan-Modus), gelesen aus `src/app/globals.css`, `src/app/layout.tsx`, `BottomNav`, `Header`, `MyGames`, `LobbyBoard`, `PlayerLight`. Die beschreibenden Teile (North Star, Charakter) sind vom Autor abgeleitet und nicht mit dem Projektinhaber abgestimmt. Quelle der Werte ist `globals.css`; der Frontmatter bildet sie ab, ohne sie zu ändern.

## Overview

**Creative North Star: "Die Hallenanzeige"**

Soccaz sieht heute aus wie eine Anzeigetafel bei Nacht: fast schwarzer Grund mit grünem Stich, weiße Schrift, ein einziger kräftiger Signalton (Grün) für Handlung und Zustand. Die Spielnummer `#42` auf grünem Chip ist das wiederkehrende Zeichen. Karten sind flache, dunkle Tafeln mit feiner Linie.

Die Dichte ist mittel: eine Spalte (`max-w-3xl`), Karten mit 1 rem Innenabstand, Text in `text-sm` und `text-xs`. Dazu kommen viele Akzentfarben (Lime, Cyan, Sky, Violet, Pink, Coral, Yellow), die im Token-Satz liegen, aber nur zum Teil benutzt werden (Pink für Auswahl und Badge, Gelb für Status und Warnung, Coral für Fehler).

**Key Characteristics:**
- Dunkel als einziges Thema (`color-scheme: dark`), Hintergrund mit zwei weichen Farbverläufen (grün oben links, cyan unten rechts).
- Grün ist Handlung, Bestätigung und aktiver Navigationspunkt; Gelb ist „wartet“; Pink ist Aufmerksamkeit.
- Spielnummer als Chip, Ampel als leuchtender Punkt.
- Handy zuerst: Bottom-Navigation mit fünf Punkten, Kopfleiste erst ab `sm`.

## Colors

Fast-schwarzes Grün als Grund, ein Grün als Signal, viele Neon-Töne als Reserve.

### Primary
- **Signalgrün** (#22c55e, `--green`): Primärbutton, aktiver Nav-Punkt, „bestätigt“, Fokusring, Rahmen von „Meine Spiele“.
- **Dunkelgrün** (#15803d, `--green-dark`): reserviert, derzeit kaum genutzt.

### Secondary
- **Warngelb** (hsl(44 98% 58%), `--yellow`): Status „wartet“, offene Lobby, Phase eines Spiels.
- **Aufmerksamkeitspink** (hsl(327 92% 61%), `--pink`): Textauswahl (`::selection`), Zähler-Badge ungelesener Nachrichten.
- **Fehlerkoralle** (hsl(12 95% 62%), `--coral`): Fehlermeldungen. **Rot** (hsl(0 75% 55%), `--red`): gefährliche Aktion.

### Tertiary
- Lime, Cyan, Sky, Violet liegen als Tokens bereit. Cyan färbt den Hintergrundschimmer.

### Neutral
- **Nachtgrün** (#030806, `--bg`), **Tafel** (#07110c, `--panel`), **Feld** (#0b1a13, `--panel-2`), **Linie** (#12221b, `--line`), **Gedämpft** (#8ea299, `--muted`), **Weiß** (#ffffff, `--ink`).
- Ampel in `PlayerLight` hat feste Werte außerhalb der Tokens: Rot #ef4444, Orange #f59e0b, Grün #22c55e.

### Named Rules
**The Eine-Handlung Rule.** Grün gehört der einen nächsten Handlung je Karte. Ist alles grün, ist nichts mehr wichtig.
**The Text-neben-Farbe Rule.** Zustand (bezahlt, offen, Frist) steht immer auch als Wort da, nie nur als Punkt.

## Typography

**Display Font:** Outfit (Fallback Plus Jakarta Sans, sans-serif), nur für `h1`–`h3`, Spielnummer und Wortmarke
**Body Font:** Plus Jakarta Sans (Fallback system-ui)

**Character:** Rund, freundlich, geometrisch; die Überschriften sind fett mit leicht engem Satz (-0.01em).

### Hierarchy
- **Display** (700–800, `text-lg`, eng): Kartentitel, „Mein aktuelles Spiel“, Spielnummer.
- **Body** (400–600, `text-sm`/Basis): Fließtext, Teamnamen (semibold).
- **Label** (400, 0.85 rem, gedämpft): Feldbeschriftung `.label`, Hilfetexte (`text-xs`).

### Named Rules
**The Kleine-Zeile Rule.** Metadaten (Elo, Stärke, Kader) stehen in `text-xs` und gedämpft; sie tragen nie die Handlung.

## Layout

Eine Spalte, zentriert, `max-w-3xl`, Seitenrand 1 rem (ab `sm` 1,5 rem), vertikaler Abstand `space-y-4` im Haupt-Layout und `space-y-3` in Listen. Karten mit zwei Teams brechen ab `sm` in zwei Spalten (`sm:grid-cols-2`). Kopfleiste 56 px hoch und sticky; ab `sm` mit Textlinks, am Handy ersetzt die fixierte Bottom-Navigation (mind. 56 px, `safe-area-inset-bottom`) die Links.

## Elevation & Depth

Flach mit Tönung: Tiefe entsteht durch drei Grünstufen (bg, panel, panel-2) und eine 1 px Linie, nicht durch Schatten. Einzige Lichter: Glühen der Ampelpunkte (`box-shadow 0 0 6px`) und `backdrop-blur` auf Kopf- und Bottom-Leiste.

### Named Rules
**The Flat-By-Default Rule.** Karten haben keinen Schatten; Hervorhebung geschieht über Rahmenfarbe oder Tönung (`border-2 border-green bg-green-soft` für „Meine Spiele“).

## Shapes

Weiche, moderate Rundung: Felder und Buttons 10 px, Karten 12 px, hervorgehobene Tafeln `rounded-2xl` (16 px), Chips `rounded-md`, Zähler und Ampel voll rund. Linie 1 px, Hervorhebung 2 px.

## Components

### Buttons
- **Shape:** 10 px, min. 44 px hoch, Schrift 600.
- **Primary:** Signalgrün mit fast schwarzer Schrift (#03120a), Hover heller. Kompakt: `!min-h-9 !px-3 text-sm`.
- **Ghost:** transparent mit Linie, Hover Rahmen grün. **Danger:** Rot umrandet.

### Cards / Containers
- `.card`: Tafelgrün, 1 px Linie, 12 px, 1 rem Innenabstand. Gestrichelter Rahmen (`border-dashed`) für Nebenbox („Gesucht wird ein Gegner“).

### Inputs / Fields
- Feldgrün, Linie, 10 px, 44 px hoch; Fokus: 2 px grüner Umriss mit 1 px Abstand. Fehlertext in Koralle.

### Navigation
- **Bottom-Navigation (Handy):** fünf gleich breite Punkte (Start, Suche, Live, Rangliste, Mein Bereich), 22 px Strichsymbole, Beschriftung `text-xs`, aktiv grün, sonst gedämpft; halbtransparenter Grund mit Unschärfe.
- **Kopfleiste:** Logo + „SOCAZ“, Textlinks ab `sm`, Glocke mit rosa Zähler, Guthaben, Nutzermenü.

### Spielnummer-Chip (Signatur)
- Grüner Chip, `rounded-md`, Outfit 800, schwarze Schrift: `#42`.

### Ampel (Signatur)
- 12 px runder Punkt mit Schein: rot (in der Lobby), orange (bereit/bezahlt), grün (bestätigt). Legende über der Liste.

### Meine Spiele
- Hervorgehobene Tafel oben auf der Startseite: 2 px grüner Rahmen, grüne Tönung, je Spiel eine Zeile mit Chip, Paarung, Uhrzeit, gelber Phase und Button „Zur Lobby“.

## Do's and Don'ts

### Do:
- **Do** Spielnummer und Zustand als Text zeigen und die Ampel nie allein stehen lassen.
- **Do** 44 px Touch-Ziele und `safe-area-inset-bottom` bei fixierten Leisten einhalten.
- **Do** neue Farben aus den Tokens in `globals.css` nehmen, nicht als freie Hex-Werte (die Ampel ist die bekannte Ausnahme).

### Don't:
- **Don't** mehr als eine grüne Hauptaktion pro Karte setzen.
- **Don't** die Hintergrundverläufe (grün/cyan) für Inhalte nutzen; sie sind Atmosphäre.
- **Don't** Privatspiel- oder Kaderdaten gestalterisch sichtbar machen, die das Datenschutzmodell verbirgt (Platzhalter, Unschärfe-Andeutungen).
- **Don't** auf Helligkeit ausweichen, ohne Kontrast (4,5:1) zu prüfen.
