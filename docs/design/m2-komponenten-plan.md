# M2-Komponentenplan (Vertrag 013, M2-2 und M2-3)
Stand: 2026-11-11 · Code-Stand `origin/main` 7d8f38a (M2-1 liegt noch auf `feat/m2-1-tokens`, Commit 194d830, nicht gemergt) · Verfasser: worker-4 (Plan, Doku, kein Code) · Status: Entwurf, Review offen

Zweck: Bevor ein Writer die Basiskomponenten baut, steht hier je Komponente: Dateien, Props, Abnahmekriterien, Beleg-Befehle, Konflikte mit `globals.css` und die Abhängigkeit zu `docs/design/begriffe.md`. Der Plan ändert keinen Code und keinen Vertrag.

Quellen: `docs/design/umbauplan-013.md` (Abschnitt 2 Gestaltung, Abschnitt 3 M2; Branch `docs/013-freigabe`), `docs/design/analyse-frontend-verdichtung.md` (Cluster K02, K03, K06, K08, K09, K10, K15, Branch `docs/analyse-frontend-verdichtung`), `docs/decisions/0002-komponenten-grundlage-frontend.md` (nativ, kein shadcn, kein Radix), Vertrag 013 AC-1 bis AC-15 (`docs/013-freigabe`), `docs/design/begriffe.md` (Branch `docs/begriffe-entwurf`, Entwurf mit Entscheiden von t9).

## 1. Rahmen

### 1.1 Technik und Regeln
- **Nativ plus eigene Bausteine** (ADR 0002): `<button>`, `<a>`, `<dialog>`, `<input>`, `<select class="field">`, `<details>`. Kein `shadcn/ui`, kein Radix, keine neue Abhängigkeit. Eine Komponente, die ohne Radix nicht barrierefrei wird, geht als Vorschlag an den Nutzer (ADR: erst bei mehr als etwa vier verschiedenen Overlay-Komponenten oder einer Beanstandung).
- **Ort:** `src/components/ui/<Name>.tsx`, je Komponente eine Datei, direkte Importe ohne `index.ts` (ein Barrel wäre eine gemeinsame Datei und erzeugt Merge-Konflikte).
- **Server/Client:** Standard ist eine Server-Komponente ohne `"use client"`. Nur wo Zustand oder Ereignisse nötig sind (`ConfirmDialog`, `DateTimeField` falls mit Zustand, `Form` mit Pending), kommt `"use client"` dazu.
- **Texte:** keine harten Texte in den Komponenten außer Zugänglichkeits-Standards aus `src/lib/i18n.ts` (neue Schlüssel, siehe 6); alle Begriffe nach `begriffe.md`.
- **Test-IDs und URLs:** bestehende `data-testid` und Routen bleiben (AC-5). Neue Elemente bekommen Test-IDs nach dem vorhandenen Muster (`data-testid="…"`, Kleinschreibung mit Bindestrich).
- **Tokens:** nur vorhandene Tokens (`--tap`, `--fs-*`, `--space-*`, `--ok/--warn/--danger/--info` mit `-ink`/`-soft`, `--focus`, `--focus-w`, `--accent`, `--accent-ink`, `--muted`, `--line`, `--panel`, `--panel-2`, `--w-narrow/std/full`), keine Hex-Werte in Komponenten (AC-10).

### 1.2 Konflikt mit `globals.css` (gehört worker-3 / M2-1 bis zum Merge)
- `src/app/globals.css` wird von M2-1 (`feat/m2-1-tokens`, 194d830) geändert (+82 Zeilen: Status-Tokens, Typo-Skala `--fs-*`, Abstände `--space-*`, `--tap`, `--w-*`). Der Stand auf `origin/main` kennt diese Tokens noch nicht; die Komponenten dürfen daher erst **nach dem Merge von M2-1** gebaut werden, oder auf einem Branch, der M2-1 enthält.
- Die Komponenten brauchen **keine neue CSS-Datei und keine Änderung an `globals.css`**: Sie nutzen Tailwind-Klassen auf den Tokens (`@theme inline` bildet `--color-*` ab) und die bestehenden Klassen `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.field`, `.label`, `.error`, `.card`.
- Falls eine Komponente doch eine neue Klasse braucht (zum Beispiel `.btn-sm` mit größerer Tippfläche, `.sr-only`-Ersatz, Skip-Link-Sichtbarkeit bei Fokus), geht der Wunsch als **eine Zeile an worker-3** (oder erst nach dem M2-1-Merge als eigener kleiner Commit). Bis dahin nicht in `globals.css` schreiben.
- Weitere gemeinsame Dateien: `src/app/layout.tsx` (Skip-Link, `PageShell`-Einbau, Header/BottomNav) gehört zur Navigation (M2/M3, `AppNav`); die Einbindung in das Layout ist ein **eigener, serieller Schritt** (3.2, Schritt C), nicht Teil der Komponenten-Commits.

### 1.3 Aufteilung in Tasks (max. 2 Writer, jede Komponente eigene Dateien)
| Task | Inhalt | Dateien (neu) | Voraussetzung |
|---|---|---|---|
| M2-2a | `Button`, `LinkButton`, `IconButton` | `src/components/ui/Button.tsx`, `LinkButton.tsx`, `IconButton.tsx` | M2-1 gemergt |
| M2-2b | `PageShell`, `PageHeader`, `PageTitle`, `SkipLink` | `src/components/ui/PageShell.tsx`, `PageHeader.tsx`, `PageTitle.tsx`, `SkipLink.tsx` | M2-1, M2-2a (Hauptaktion nutzt `Button`) |
| M2-2c | `StateMessage`, `StatusBadge` | `src/components/ui/StateMessage.tsx`, `StatusBadge.tsx` | M2-2a (Aktion), `begriffe.md` |
| M2-2d | Showcase-Seite und Tests für M2-2 | `src/app/dev/komponenten/page.tsx`, `tests/unit/ui-*.test.ts`, `tests/e2e/ui-regeln.spec.ts`, `tests/e2e/a11y.spec.ts` | M2-2a bis c |
| M2-3a | `Form`, `Field` (Feldgruppe, Fehler am Feld, Pflichtmarke, eine Speichern-Handlung), `DateTimeField` | `src/components/ui/Form.tsx`, `Field.tsx`, `DateTimeField.tsx` | M2-2a |
| M2-3b | `ConfirmDialog` | `src/components/ui/ConfirmDialog.tsx` | M2-2a |
| M2-3c | Showcase und Tests für M2-3 | wie M2-2d, ergänzt | M2-3a, b |

Writer-Plan: M2-2a und (danach) M2-3b können parallel laufen (disjunkte Dateien); M2-2b/c und M2-3a folgen. Reviewer ≠ Writer, wird je Task bestimmt. Layout-Einbau (Schritt C in 3.2) erst nach M2-2b und nur seriell mit der Navigation (`AppNav`).

## 2. Bestand, den die Komponenten ersetzen (Stand 7d8f38a)
- `src/components/ActionButton.tsx`: 20 Dateien, 66 Zeilen; Standard-Klasse `btn btn-ghost !min-h-9 !px-3 text-xs` (36 px hoch, 12 px) und `window.confirm` bei `confirm` (Zeile 16).
- `!min-h…`-Überschreibungen der Knopfhöhe: 78 Stellen in `src/`; `.btn` kommt in 80 Dateien vor.
- `src/components/FormBits.tsx` (`SubmitButton`, `FieldError`; `SubmitButton` in 15 Dateien) und `src/components/ActionForm.tsx` (16 Dateien): Fehler als einzelner Kasten unter dem Formular, nicht am Feld.
- `window.confirm`: `src/components/AcceptSearch.tsx:36`, `src/components/ActionButton.tsx:16`. Natives `<dialog>`: nur `src/app/lobby/[id]/uebersicht/ScoreDialog.tsx`.
- `h1`: 62 Vorkommen in 58 Dateien unter `src/app`; ein `<main>` im Layout (`src/app/layout.tsx:59`, `max-w-3xl`), kein Skip-Link; `src/app/not-found.tsx` mit eigenem Aufbau.
- Nicht vorhanden: `tests/e2e/ui-regeln.spec.ts` und `tests/e2e/a11y.spec.ts` (in AC-3/AC-4 genannt), keine Komponententests (`vitest` läuft ohne DOM, `include: tests/unit/**/*.test.ts`).
- Die **Migration** der Bestandsstellen gehört nicht zu M2-2/M2-3, sondern in die Seitengruppen M3 bis M7 (jeweils mit der Seite). M2-2/3 liefert die Bausteine und beweist sie auf einer Showcase-Seite.

## 3. M2-2: Basiskomponenten

### 3.1 Button, LinkButton, IconButton (K02, K03)
- **Dateien:** `src/components/ui/Button.tsx`, `LinkButton.tsx`, `IconButton.tsx`.
- **Props (Entwurf):**
  - `Button`: `variant: "primary" | "secondary" | "danger"` (Standard `secondary`; `primary` genau einmal je Seite, siehe 3.2), `size: "md" | "sm"` (`sm` nur mit größerer Tippfläche, siehe AC), `pending?: boolean` (zeigt „Bitte warten…“ aus i18n und setzt `aria-busy`), `type` Standard `"button"`, übrige `<button>`-Attribute.
  - `LinkButton`: dieselben Varianten, rendert `next/link` bzw. `<a>`; `href` Pflicht; für Navigation, nie für Aktionen.
  - `IconButton`: `label: string` (Pflicht, wird `aria-label`), `icon: ReactNode`; keine reine Symbol-Beschriftung ohne Namen.
- **AC (M2-2a):**
  1. Jede Variante hat eine Tippfläche von mindestens 44 × 44 px (`min-h-[var(--tap)]`, bei `IconButton` auch `min-w`); `size="sm"` darf optisch kleiner sein, hat aber ein Tippziel von 44 px (Pseudo-Element oder Padding), Vertrag 013 AC-3.
  2. Sichtbarer Fokus-Ring über `:focus-visible` mit `--focus`/`--focus-w`, auf beiden Themen kontraststark (≥ 3:1 gegen den Grund), AC-4.
  3. Schriftgröße mindestens `--fs-sm` (14 px); nie unter 12 px (Lint-Regel `soccaz/min-font-size` aus M2-1), K03.
  4. Zustand ist nicht nur Farbe: `disabled` mit `aria-disabled`/Cursor und sichtbarer Umrandung, `pending` mit Wort, K10-Prinzip.
  5. `primary` benutzt `--accent`/`--accent-ink` (Orange nur Marke und Hauptaktion, K09); `danger` hat Rahmen und Wort, nicht nur eine Farbe.
  6. Kein `!min-h`/`!px` nötig; die Komponente akzeptiert kein `className`, das die Höhe unter 44 px drückt (Typ-Einschränkung oder Lint-Hinweis).
- **Beleg-Befehle:** `npm run typecheck`; `npm run lint`; `npm test -- tests/unit/ui-button.test.ts` (Markup per `react-dom/server`, siehe 5.1: Rolle, `aria-label` bei Icon, `type="button"`, keine Klasse mit `min-h-9`); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "Zielgrößen"` (Showcase `/dev/komponenten`, misst `boundingBox` ≥ 44 px auf 390 px Breite); `npx playwright test tests/e2e/a11y.spec.ts -g "Fokus"` (Tab erreicht den Knopf, Fokus-Ring sichtbar, Enter und Leertaste lösen aus); Kontrast: `tests/unit/contrast.test.ts` um die Paare `accent-ink` auf `accent` je Thema und Fokus gegen Grund erweitern.
- **Konflikte `globals.css`:** nutzt `.btn*`-Klassen; die Klassen gehören M2-1/worker-3. Eine Variante „klein mit großer Tippfläche“ braucht entweder eine neue Klasse (Wunsch an worker-3) oder Tailwind-Utilities (`relative after:absolute after:-inset-2`), dann ohne `globals.css`.
- **Abhängigkeit `begriffe.md`:** Knopftexte kommen von der Seite; Standardtexte „Bitte warten…“ (i18n). Verbotene Wörter in Knöpfen (Abschnitt 2 der Begriffe): „Abmelden“ nur für Logout, „Verlassen“ für Lobby/Team/Turnier, „Entfernen“ für andere, „Preis bestätigen“ (Captain), „Karte ändern“.

### 3.2 PageShell, PageHeader, PageTitle, SkipLink (K04, K06, K13)
- **Dateien:** `src/components/ui/PageShell.tsx`, `PageHeader.tsx`, `PageTitle.tsx`, `SkipLink.tsx`.
- **Props (Entwurf):**
  - `PageShell`: `width: "narrow" | "std" | "full"` (720/1040/1280 px, Tokens `--w-*`, K13), `aside?: ReactNode` (Seitenleiste, am Desktop zweispaltig), `children`.
  - `PageTitle`: `children` (Text), rendert die einzige `h1` der Seite mit `id="seiten-titel"` und `tabIndex={-1}` (Sprungziel); `as` nicht erlaubt (genau eine `h1`).
  - `PageHeader`: `title: string`, `stand?: ReactNode` („Dein Stand“-Block, z. B. „Du bist bereit, Karte hinterlegt“), `action?: { label, href | onClick | form }` (genau eine Hauptaktion), `meta?: ReactNode`. Rendert `PageTitle`, den Stand-Block und die Hauptaktion: Desktop rechts im Kopf, Handy als feste Aktionsleiste unten (`position: sticky/fixed`, `padding-bottom: env(safe-area-inset-bottom)`, Platz über der `BottomNav`).
  - `SkipLink`: ohne Props; Link „Zum Inhalt springen“ (i18n) auf `#inhalt`, nur bei Fokus sichtbar.
- **AC (M2-2b):**
  1. Jede Seite hat genau eine `h1` (`PageTitle`); ein Unit-Test zählt `<h1` im Markup von `PageHeader`; ein E2E-Test prüft auf der Showcase-Seite genau eine `h1`, später je Seite (AC-4, K04).
  2. `SkipLink` ist das erste fokussierbare Element, springt auf `<main id="inhalt" tabIndex={-1}>`, ist bei Fokus sichtbar (Kontrast ≥ 4,5:1).
  3. `PageHeader` erlaubt genau eine Hauptaktion (Typ erlaubt nur ein `action`-Objekt, keine Liste), K06; Der Stand-Block steht über der Aktion.
  4. Handy (390 px): Hauptaktion ist ohne Scrollen im ersten Bildschirm erreichbar (feste Leiste unten), überdeckt keinen Inhalt (Platzhalter-Höhe) und kollidiert nicht mit der `BottomNav`; Desktop (1280 px): Aktion rechts im Kopf.
  5. Kein horizontales Scrollen auf 390 px (AC-3); Breiten aus den `--w-*`-Tokens.
  6. Hell und dunkel ohne Farbe außerhalb der Tokens (AC-10).
- **Einbau ins Layout (Schritt C, eigener serieller Task):** `SkipLink` vor `Header`, `<main id="inhalt">` im Layout (Zeile 59 heute `max-w-3xl`); die Breite wandert von fest `max-w-3xl` in `PageShell`. Das berührt `src/app/layout.tsx`, `Header`, `BottomNav`, später `AppNav` und ist deshalb **serieller Schritt**, nicht parallel zu Navigationsarbeit.
- **Beleg-Befehle:** `npm run typecheck`; `npm run lint`; `npm test -- tests/unit/ui-page.test.ts` (Markup: genau eine `h1`, Skip-Link-Ziel `#inhalt`, `aria-current` nicht hier); `npx playwright test tests/e2e/a11y.spec.ts -g "Skip-Link|h1|Reihenfolge"` (Tab 1 = Skip-Link, Enter springt, Fokus liegt auf `main`); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "Aktionsleiste|horizontal"` (390 px: Aktion im Bild, `scrollWidth <= clientWidth`; 1280 px: Aktion im Kopf).
- **Konflikte `globals.css`:** braucht eine Sichtbarkeitsregel für den Skip-Link (üblich `.sr-only:focus`) und eine sticky/fixed-Leiste; Wunsch als Zeile an worker-3, ersatzweise Tailwind (`sr-only focus:not-sr-only`). `layout.tsx` ist gemeinsame Datei (siehe oben). Die Seitenleiste braucht `--w-*` aus M2-1.
- **Abhängigkeit `begriffe.md`:** Der „Dein Stand“-Block verwendet die Zustandswörter: „Findet statt“, „Preis steht fest“, „Bereit“, „Karte hinterlegt“, „Zahlung ausstehend“ (Dritte), „Abbuchung fehlgeschlagen“ (Betroffene und Captain); die Seitentitel nach Lobby/Spielsuche/Captain-Festlegung.

### 3.3 StateMessage (K08)
- **Datei:** `src/components/ui/StateMessage.tsx`.
- **Props (Entwurf):** `kind: "empty" | "error" | "ended" | "forbidden"`, `title: string`, `reason: string` (ein Satz), `action: { label, href } | { label, onClick }` (Pflicht, genau eine), `tone` aus `kind` abgeleitet; `role="alert"` nur bei `error`, sonst `role="status"`.
- **AC (M2-2c):**
  1. Titel, Grund in genau einem Satz, genau eine nächste Handlung als `LinkButton`/`Button` (Typ erzwingt `action`; Lint/Test: kein Zustand ohne Aktion), Vertrag 013 AC-7, K08.
  2. Der Zustand ist nicht nur Farbe: Symbol und Wort (Titel), `--danger` etc. nur zusätzlich.
  3. Passt für `not-found`, `error`, Sperrseiten („Dafür brauchst du die Rolle X, so bekommst du sie“, K14) und Leerlisten; alle drei Seiten `src/app/not-found.tsx`, `src/app/error.tsx` werden in M3 auf die Komponente umgestellt (nicht in M2-2).
  4. Auf 390 px eine Spalte, Aktion mindestens 44 px, mit Fokus.
- **Beleg-Befehle:** `npm test -- tests/unit/ui-state.test.ts` (Markup enthält Titel, Grund und genau einen Link/Button; `kind="error"` hat `role="alert"`); `npx playwright test tests/e2e/a11y.spec.ts -g "StateMessage"` (Aktion per Tastatur erreichbar); `npm run typecheck`; `npm run lint`.
- **Konflikte `globals.css`:** keine eigene Klasse nötig (`.card`, Tokens).
- **Abhängigkeit `begriffe.md`:** Zustandstexte nutzen „Lobby“, „Spielsuche“, „Findet statt“; Fehlerfall Zahlung: „Abbuchung fehlgeschlagen“ mit Grund und Nachzahl-Weg (Entscheid 6, Vertrag 012 AC-12/AC-20); „Karte ändern“ (Entscheid 5) als typische nächste Handlung.

### 3.4 StatusBadge (K09, K10)
- **Datei:** `src/components/ui/StatusBadge.tsx`.
- **Props (Entwurf):** `status: "ok" | "warn" | "danger" | "info" | "neutral"`, `label: string` (Wort, Pflicht), `icon?` (Standard je Status: Haken, Dreieck, Kreuz, i, Punkt), `viewer?: "self" | "captain" | "third"` — für `third` rendert die Komponente immer `neutral` ohne Namen und ohne Zahlstatus (012 AC-12/AC-20, Fund Y1-GM-07).
- **AC (M2-2c):**
  1. Status = Symbol + Wort + Farbe, nie nur Farbe und nie nur `sr-only`-Text (K10, 012 AC-12).
  2. Farben nur aus `--ok/--warn/--danger/--info` (`-ink` auf `-soft`/Fläche); Orange (`--accent`) kommt nicht vor (K09); Textkontrast ≥ 4,5:1 in beiden Themen, Symbol ≥ 3:1 (AC-3).
  3. Dritte sehen die neutrale Variante: Test mit `viewer="third"` zeigt kein „bezahlt/offen“ namentlich.
  4. Schrift mindestens 12 px, nie als Bedienelement.
  5. Die Legende „In der Lobby / Bereit / Bestätigt“ entfällt (K10); `src/components/PlayerLight.tsx` wird in M3 auf `StatusBadge` umgestellt, nicht in M2-2.
- **Beleg-Befehle:** `npm test -- tests/unit/ui-status.test.ts` (alle Status liefern Symbol und Wort; `third` liefert neutral); `npm test -- tests/unit/contrast.test.ts` (erweitert um jedes Paar `*-ink` auf `*-soft`/Fläche je Thema); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "Status"` (Showcase in hell und dunkel, `prefers-color-scheme` per `page.emulateMedia`); `npm run typecheck`; `npm run lint`.
- **Konflikte `globals.css`:** liest die Status-Tokens aus M2-1 (`--ok` bis `--info`, `-ink`, `-soft`); ohne den M2-1-Merge nicht baubar. Keine eigene Klasse.
- **Abhängigkeit `begriffe.md`:** Wörter genau aus dem Verzeichnis: „Findet statt“, „Preis steht fest“, „Ergebnis bestätigt“, „Bereit“, „Team bereit“ (Turnier), „Karte hinterlegt“/„Keine Karte“, „Zahlung ausstehend“, „Abbuchung fehlgeschlagen“, „Zusage der Halle“/„Absage der Halle“; „bestätigt“ nur für „Ergebnis bestätigt“. Die Wörter kommen als `label` von der Seite, nicht fest in der Komponente.

## 4. M2-3: Formular-Bausteine

### 4.1 Form und Field (K15)
- **Dateien:** `src/components/ui/Form.tsx` (Client, Server-Action-Anbindung), `src/components/ui/Field.tsx`.
- **Props (Entwurf):**
  - `Form`: `action` (wie `ActionForm`: `(prev, formData) => Promise<ActionState>`), `submitLabel: string` (genau eine Speichern-Handlung), `danger?: boolean`, `successText?: string`, `keepOnSuccess?: boolean`; baut auf `useFormAction` und `ActionState` auf (`src/lib/validation.ts`).
  - `Field`: `name`, `label`, `required?: boolean`, `hint?: string`, `error?: string`, Kind = Eingabeelement (`input`/`select.field`/`textarea`/`DateTimeField`); verknüpft `label[for]`, `aria-describedby` (Hinweis, Fehler), `aria-invalid`.
  - `Fieldset`-Variante: Feldgruppe mit `legend`.
- **AC (M2-3a):**
  1. Fehler stehen **am Feld** (unter dem Eingabeelement, `role="alert"`/`aria-live`, per `aria-describedby` verknüpft), nicht nur als Kasten unter dem Formular; die Fehlermeldungen kommen weiter als `ActionState` aus den Server-Aktionen (Schnittstelle bleibt, Fehler brauchen ein optionales Feldmapping, `fieldErrors`).
  2. Pflichtfelder haben eine sichtbare Marke mit Wort („Pflichtfeld“ bzw. „*“ mit Legende), nicht nur Farbe; `required` und `aria-required` gesetzt.
  3. Genau eine Speichern-Handlung je Formular; Knopf nutzt `Button` (≥ 44 px), Pending-Zustand mit Wort; Eingaben bleiben bei Fehler erhalten, Formular leert sich nach Erfolg (außer `keepOnSuccess`), wie `ActionForm` heute.
  4. Eingabefelder ≥ 44 px hoch (`.field`), Schrift ≥ 16 px (kein Zoom auf iOS), Label sichtbar (kein reiner Platzhalter), Autovervollständigung wo sinnvoll.
  5. Feldgruppen per `<fieldset>`/`<legend>`; Reihenfolge der Felder entspricht der Tabulator-Reihenfolge.
  6. Bestehende Test-IDs und Formularnamen bleiben (AC-5): `Form` rendert das gleiche `name`/`id` wie die Seite übergibt.
- **Beleg-Befehle:** `npm test -- tests/unit/ui-form.test.ts` (Markup: `label[for]`↔`id`, `aria-describedby` bei Fehler, Pflichtmarke mit Wort, genau ein Submit); `npx playwright test tests/e2e/a11y.spec.ts -g "Formular"` (Tab-Reihenfolge, Fehlerfokus auf das erste fehlerhafte Feld, Enter sendet); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "Felder"` (Höhe ≥ 44 px, Schrift ≥ 16 px auf 390 px); `npm run typecheck`; `npm run lint`; bestehende E2E (AC-5): `npx playwright test` gegen die umgestellte Seite bei der Migration.
- **Konflikte `globals.css`:** nutzt `.field`, `.label`, `.error` (heute `.error` mit 2-px-Rahmen in Tinte; Vertrag 007: keine eigene Fehlerfarbe, kräftiger Strich). Änderungen an diesen Klassen gehören worker-3/M2-1; Feldfehler kommen mit Symbol und Wort ohne neue Klasse aus.
- **Abhängigkeit `begriffe.md`:** Beschriftungen und Fehlertexte: „Verlassen“ statt „Abmelden“ im Austritts-Formular, „Entfernen“ für andere, „Preis bestätigen“ als Submit-Text des Captains, „Karte ändern“; Pflichtfeld-Wort aus i18n.

### 4.2 ConfirmDialog (K15)
- **Datei:** `src/components/ui/ConfirmDialog.tsx` (Client).
- **Props (Entwurf):** `trigger: { label, variant }` (öffnender Knopf), `title: string`, `body: string` (Folge in einem Satz), `confirmLabel: string` (benennt die Handlung, nie nur „OK“), `cancelLabel` (Standard „Abbrechen“), `onConfirm: () => Promise<ActionState> | void`, `danger?: boolean`, optional `confirmText?: string` (Tippen eines Wortes, z. B. LÖSCHEN, wie heute im Konto-Formular).
- **AC (M2-3b):**
  1. Natives `<dialog>` mit `showModal()`: Fokus wandert in den Dialog, `Escape` schließt, Fokus kehrt zum öffnenden Knopf zurück, Hintergrund inert (Browserverhalten); `aria-labelledby`/`aria-describedby` gesetzt (ADR 0002, AC-4).
  2. Nur für Unumkehrbares oder Folgenreiches (Entfernen, Konto löschen, Spiel absagen, Preis bestätigen); die Bestätigungs-Taste benennt die Handlung („Spieler entfernen“, nicht „OK“); Abbrechen ist der Standardfokus bei `danger`.
  3. Ersetzt `window.confirm` (`src/components/ActionButton.tsx:16`, `src/components/AcceptSearch.tsx:36`); der Dialog ist per Tastatur und auf dem Handy vollständig bedienbar (Knöpfe ≥ 44 px, kein Abschneiden bei 390 px).
  4. Pending-Zustand mit Wort; Fehler der Aktion erscheinen im Dialog (nicht stumm).
  5. Hell und dunkel nach Tokens; `::backdrop` abgedunkelt wie `ScoreDialog`.
- **Beleg-Befehle:** `npm test -- tests/unit/ui-confirm.test.ts` (Markup: `<dialog>` mit `aria-labelledby`, zwei Knöpfe, Bestätigung benannt); `npx playwright test tests/e2e/a11y.spec.ts -g "ConfirmDialog"` (Öffnen per Enter, Fokus im Dialog, Tab bleibt im Dialog, Escape schließt, Fokus zurück zum Auslöser); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "Dialog"` (390 px: Knöpfe sichtbar und ≥ 44 px); `npm run typecheck`; `npm run lint`.
- **Konflikte `globals.css`:** keine; `::backdrop` über Tailwind (`backdrop:bg-black/70` wie `ScoreDialog`). Der Pseudo-Dialog `MatchClient.tsx:68` (ADR 0002) wird bei der Migration geprüft, nicht in M2-3.
- **Abhängigkeit `begriffe.md`:** Dialogtexte nennen die Handlung mit den festgelegten Wörtern: „Spieler entfernen“, „Lobby verlassen“, „Team verlassen“, „Preis bestätigen“, „Spiel absagen“; Rückfrage-Bestätigung ist **nicht** „bestätigt“ im Sinne von „Ergebnis bestätigt“ (Entscheid 8: übrige Bedeutungen je einzeln).

### 4.3 DateTimeField (K15)
- **Datei:** `src/components/ui/DateTimeField.tsx`.
- **Props (Entwurf):** `name`, `label`, `value?`, `min?`, `max?`, `required?`, `error?`; rendert natives `<input type="datetime-local">` in `Field`; Wert bleibt der heutige String (Format `YYYY-MM-DDTHH:mm`), Berliner Ortszeit wie im Server (`src/lib/time.ts:56`).
- **AC (M2-3a):**
  1. Das Feld wird nicht abgeschnitten: auf 390 px volle Breite (`w-full`, `min-w-0`), Wert und Symbol sichtbar, kein horizontales Scrollen (AC-3); Test mit längstem Wert („Mo., 23.11.2026, 15:04“).
  2. Höhe ≥ 44 px, Schrift ≥ 16 px, sichtbares Label, Fokus-Ring.
  3. Zeigt die Zeitzone/Einheit als Hinweis („Uhrzeit in deutscher Zeit“, Wortlaut aus i18n) und nennt Mindest-/Höchstwert in Worten, wenn gesetzt.
  4. Bestehende Namen und Test-IDs bleiben (AC-5); die Stellen mit `datetime-local` (Admin Codes/Profi-Tag, PrivateGameForm, RequestForm, TournamentForm, SchedulingPanel) werden bei der Migration umgestellt.
- **Beleg-Befehle:** `npm test -- tests/unit/ui-datetime.test.ts` (`type="datetime-local"`, `min/max`, Label verknüpft); `npx playwright test tests/e2e/ui-regeln.spec.ts -g "DateTimeField"` (390 px, Breite des Eingabefelds = Containerbreite, `scrollWidth <= clientWidth`); `npx playwright test tests/e2e/a11y.spec.ts -g "DateTimeField"` (per Tastatur ausfüllbar); `npm run typecheck`; `npm run lint`.
- **Konflikte `globals.css`:** nutzt `.field`; die Anpassung der Picker-Symbole je Thema (`color-scheme` ist in `globals.css` gesetzt) bleibt bei worker-3.
- **Abhängigkeit `begriffe.md`:** Beschriftungen wie „Termin“/„Uhrzeit“ nach den Seitenbegriffen; „Termin steht“ ist ein Zustand, kein Feldname.

## 5. Tests und Belege

### 5.1 Unit-Tests (Vitest, ohne DOM)
- `vitest.config.mts` nimmt nur `tests/unit/**/*.test.ts` (kein `.tsx`) und läuft ohne `jsdom`. Komponententests rendern mit `renderToStaticMarkup` aus `react-dom/server` und `React.createElement` (kein JSX in `.ts`) und prüfen das Markup mit Zeichenketten/regulären Ausdrücken. Das ist ohne neue Abhängigkeit möglich (React 19.3.0, `react-dom` vorhanden).
- Dateien: `tests/unit/ui-button.test.ts`, `ui-page.test.ts`, `ui-state.test.ts`, `ui-status.test.ts`, `ui-form.test.ts`, `ui-confirm.test.ts`, `ui-datetime.test.ts`.
- Kontrast: `tests/unit/contrast.test.ts` (in M2-1 erweitert) wird um die Paare der Komponenten erweitert (`accent-ink` auf `accent`, `*-ink` auf `*-soft`, `--focus` gegen Grund, Skip-Link); beide Themen.
- Schrift: ESLint-Regel `soccaz/min-font-size` (M2-1, `eslint-rules/min-font-size.mjs`) deckt `text-[Npx]` unter 12 px ab; `npm run lint` ist der Beleg.

### 5.2 Showcase-Seite und Playwright
- **Showcase:** `src/app/dev/komponenten/page.tsx`, nur in Nicht-Produktion erreichbar (`notFound()` bei `NODE_ENV === "production"`), nach dem Vorbild der Dev-Seite `src/app/dev/pay/[id]/page.tsx` (dort `notFound()`, wenn der Entwicklungs-Anbieter nicht aktiv ist). Sie zeigt jede Komponente in allen Varianten; kein Eintrag in Navigation oder Sitemap. Im Plan zu prüfen: Der Check-Job baut künftig mit `npm run build` (PR `ci/playwright-shards`, noch nicht auf `main`); die Seite darf den Build nicht brechen.
- **E2E:** `tests/e2e/ui-regeln.spec.ts` (Zielgrößen, Schrift, kein horizontales Scrollen auf 390 px, Aktionsleiste, hell/dunkel per `emulateMedia`) und `tests/e2e/a11y.spec.ts` (Tab-Reihenfolge, Fokus-Ring, Skip-Link, genau eine `h1`, Dialog-Fokus). Beide Dateien existieren noch nicht (AC-3/AC-4 verweisen darauf). Geräte: Handy 390 px und Desktop 1280 px, Themen hell und dunkel (wie AC-13).
- **Laufzeit:** Die CI teilt die Browser-Tests in vier Teile (`ci/playwright-shards`); neue Spec-Dateien erhöhen die Laufzeit; hohe Zahl kleiner Tests statt langer Abläufe, ohne Datenbank-Seeding (die Showcase braucht keinen Nutzer).

### 5.3 Beleg je Task (Pflicht im PR-Text)
`npm run typecheck`; `npm run lint`; `npm test` (grün, inkl. neue Unit-Tests); `npx playwright test tests/e2e/ui-regeln.spec.ts tests/e2e/a11y.spec.ts` (grün); Screenshots der Showcase in hell und dunkel auf 390 und 1280 px; Impeccable-Befehle einzeln (AC-6/AC-15: critique, audit, distill, clarify, adapt, polish) auf der Showcase, bei „Degradiert/Blockiert“ sofort `NEEDS-USER`.

## 6. i18n und Begriffe
- Neue Schlüssel in `src/lib/i18n.ts` (Deutsch und Englisch): `ui.pending` („Bitte warten…“), `ui.skipToContent` („Zum Inhalt springen“), `ui.required` („Pflichtfeld“), `ui.cancel` („Abbrechen“), `ui.close` („Schließen“), `ui.dateTimeHint` (Zeitzonenhinweis). `i18n.ts` ist eine gemeinsame Datei: die Schlüssel kommen in einem Commit des ersten Tasks, der sie braucht (M2-2a), die übrigen Tasks lesen nur.
- Alle Zustandswörter, Knopftexte und Dialogtexte in den Komponenten-Showcases und später auf den Seiten halten sich an `docs/design/begriffe.md` (Entscheide 1 bis 10, t9). Verbotene Synonyme gelten auch für Beispieltexte der Showcase.
- Offen für M2 (aus `begriffe.md`): Wortlaut des Zeitzonen-Hinweises und der Pflichtmarke.

## 7. Vertrag 013: Zuordnung der Kriterien
| AC | Beleg durch |
|---|---|
| AC-3 (Kontrast, 44 px, kein horizontales Scrollen) | 3.1, 3.4, 4.1, 4.3; `ui-regeln.spec.ts`, `contrast.test.ts` |
| AC-4 (Tastatur, Fokus) | 3.1, 3.2, 4.1, 4.2; `a11y.spec.ts` |
| AC-5 (keine URL/Test-ID geändert) | 1.1; bei der Migration alle bisherigen E2E |
| AC-6, AC-15 (sechs Impeccable-Befehle einzeln, Blockiert → NEEDS-USER) | 5.3 |
| AC-7 (verständliche Begriffe, klare nächste Handlung) | 3.3, 6 |
| AC-9 (ADR 0002, nativ, kein Radix) | 1.1; kein neues Paket |
| AC-10 (hell und dunkel, nur Tokens) | 1.1, 3.4, 5.2 |
| AC-11 (CI unter 10 Minuten) | 5.2 (Laufzeit) |
| AC-12 (Web Interface Guidelines, sobald der Skill freigegeben ist) | 5.3 (nach Backlog 52) |
| AC-13 (Look-Abnahme M2b, Start und Lobby) | Komponenten sind Voraussetzung; Start und Lobby sind M2b |
| AC-14 (kein Guthaben) | Komponenten enthalten keine Guthaben-Wörter; Altmodell-Zeilen in `begriffe.md` 2.3 |
| AC-1, AC-2, AC-8 | nicht Teil dieses Plans |

## 8. Risiken und offene Punkte
1. **M2-1-Merge:** Ohne ihn fehlen die Status- und Abstands-Tokens; Reihenfolge einhalten (M2-1 vor M2-2a).
2. **Gemeinsame Dateien:** `globals.css` (worker-3), `layout.tsx`/`Header`/`BottomNav` (Navigation), `i18n.ts`: serielle Änderungen, nie parallel.
3. **Keine DOM-Tests:** Verhalten (Fokus, Escape) ist nur per Playwright prüfbar; Markup-Tests per `renderToStaticMarkup` reichen für Struktur. Reicht das nicht, ist `jsdom` eine neue Abhängigkeit und geht als Vorschlag an den Nutzer (Abschnitt 14 `LOOP-SPEC-TEMPLATE`).
4. **Showcase-Seite in der Produktion:** muss `notFound()` liefern; im Review prüfen (kein Zugang in Produktion).
5. **Kein Radix:** `ConfirmDialog` und `PageHeader`-Leiste müssen allein mit nativen Mitteln Fokus und Escape erfüllen; falls Playwright das Gegenteil zeigt, ADR-Regel (Vorschlag an den Nutzer).
6. **Zeitzone bei `DateTimeField`:** `datetime-local` liefert lokale Zeit ohne Zone; die Server-Auswertung steht in `src/lib/time.ts`; Zeitzonen-Fall bei der Migration prüfen.
7. **Umfang:** Der Plan deckt nur die Komponenten und ihren Beweis ab. Der Umbau der Seiten (ActionButton: 20 Dateien/66 Zeilen, 78 `!min-h`, 62 `h1`) ist M3 bis M7.
