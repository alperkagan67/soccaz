# 0002 – Komponenten-Grundlage des Frontends: nativ plus kleine eigene Bausteine statt shadcn/ui
Status: vorgeschlagen (wartet auf Bestätigung des Nutzers mit Vertrag 013)
Datum: 2026-11-12

## Kontext und Problem
Für die Frontend-Überarbeitung (Vertrag 013) soll Bedienbarkeit, Barrierefreiheit und Tastatur gesichert sein, während das Aussehen komplett aus `DESIGN.md` (Richtung E „Trikot“) und Impeccable kommt, ohne Standardoptik. Frage: shadcn/ui als technisches Grundgerüst, eigene Komponenten oder nur Radix-Primitives?

## Betrachtete Optionen
- A: shadcn/ui (per CLI kopierter Code, Radix, clsx, cva, tailwind-merge, lucide-react).
- B: eigene Komponenten nach Tokens, nativ wo möglich (B+: native Elemente plus kleine eigene Bausteine).
- C: nur Radix-Primitives einzeln, in dünnen eigenen Hüllen.

## Entscheidung (Vorschlag)
Gewählt: B+ zum Start, C nur punktuell bei echtem Bedarf; kein shadcn/ui, keine `components.json`, kein Radix auf Vorrat. Native Elemente bleiben Standard: `<dialog>` (ScoreDialog), `<select class="field">` (rund 45 bis 60 Stellen), `<details>`, Formularfelder und Buttons nur über Tokens. Der einzige belegte Problemfall `src/components/UserMenu.tsx` (role="menu" ohne Pfeiltasten und Fokusrückgabe) wird auf das native Popover-Attribut bzw. ein `<details>`-Disclosure umgebaut, ebenso klärt `MatchClient.tsx:68` (Pseudo-Dialog) sich als `<dialog>` oder normales Panel. Toast, Tabs und Tooltip entfallen mangels belegten Bedarfs. Neu prüfen und gezielt ein Radix-Paket nachrüsten (Vorschlag mit Quelle, Version, Dateiliste, Risiko an den Nutzer, Regel Abschnitt 14), wenn mehr als etwa vier verschiedene Overlay-Komponenten gebraucht werden (Combobox mit Suche, Mehrfach-Select, Toast nach Redirect, Tabs) oder eine Barrierefreiheitsprüfung die handgebauten Teile beanstandet.

Begründung: Das Projekt hat keine UI-Bibliothek (`package.json:17-32`), nutzt bereits natives `<dialog>` (`src/app/lobby/[id]/uebersicht/ScoreDialog.tsx:12,36`), natives `<select>` und `<details>`; die Tokens in `src/app/globals.css:63ff` heißen anders als bei shadcn; ein Austausch der Selects wäre ein Regressionsrisiko für Server Actions und die 576 Test-Fundstellen. shadcn per CLI brächte Fremdcode, fünf Hilfspakete und genau die Standardoptik, die der Nutzer nicht will.

## Konsequenzen
Gut: keine neue Abhängigkeit, kleinste Supply-Chain-Fläche, volle Kontrolle über das Aussehen, kleiner Aufwand (rund 0,5 bis 1 Task-Tag statt 2 bis 3 bei shadcn).
Schlecht: Eigene Bausteine müssen gepflegt und per Playwright auf Tastatur und Fokus getestet werden (Test für UserMenu: Pfeile, Escape, Fokusrückgabe); das Popover-Attribut ist modern (Browserzielmatrix prüfen, Fallback `<details>`).
Wann neu prüfen: siehe oben; vor einer Radix-Übernahme ein kurzer Spike (Peer-Ranges mit React 19.3.0 und Next 16.4.2, Bundle-Zuwachs, Fokusfalle um Stripe Elements).

## Council-Stimmen (kurz)
Antwort 1: B+ (nativ plus kleiner Menü-Baustein), kein shadcn, kein Radix jetzt; einziger Problemfall UserMenu. Antwort 2: C schlank (Radix-Primitives einzeln in eigenen Hüllen, nur wo nativ nicht reicht), kein shadcn-CLI; zuerst UserMenu mit Tastatur-Test. Antwort 3: C vor A vor B, Spike vor Entscheidung. Einigkeit: kein shadcn/ui, native Elemente bleiben, UserMenu ist der Problemfall. Uneinigkeit: Radix jetzt (C) oder erst bei Bedarf (B+). Regel: Pareto-Lösung gewinnt, da kein Sicherheits- oder Datenrisiko belegt ist (Skeptiker: nein). Nicht frisch geprüft: Aussagen zu ui.shadcn.com und zur Radix-Doku stammen aus dem Gedächtnis der Agents; Popover-Unterstützung nur Annahme.
