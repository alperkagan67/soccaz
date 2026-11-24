# Pilot: offene Reste (Formulare vor der Hydration, P2 mit Pilot-Wirkung): Plan

Stand: 2026-11-24 · Code-Stand `origin/main` cee1cd4 · Verfasser: worker-4 · Auftrag: t2q/t2s · Status: **Plan, kein Bau bis zum OK des Task Managers** · Quellen: `docs/loop/BACKLOG.md` (224), `tests/unit/forms-action.test.ts`, `impeccable-lauf-m3-3.md`, `m3-abschluss-pilot-check.md`

## 1. Formulare vor der Hydration: was ist noch offen? (Backlog 224)
„Hydration“ = die Seite wird im Browser „lebendig“. Klickt jemand vorher (langsames Handy in der Halle), schickte ein Formular ohne `action` seine Eingaben früher als Adresse (GET) ab.

**Stand:** Die Wellen 1 bis 5 sind gemergt (#273, #275, #276, #277 und Welle 5, Commit 78af004). Alle 14 Formulare bzw. Bausteine mit Server-Aktion (`PrefsForm`, `ProfileForm`, `TeamForm`, `JoinForm`, `ActionForm`, `ui/Form` und weitere) haben `action={formAction}` (Server-Aktion läuft auch vor der Hydration), alle Such- und Filterformulare sind bewusst GET, die Sprachumschalter-Formulare haben `action`. Offen sind nur die **7 Formulare mit reinem Browser-Handler**, die nicht auf `formAction` umstellbar sind:

| Formular | Schutz heute | Rest |
|---|---|---|
| `LobbyClient` (2 Formulare), `MatchClient` (3) | `method="post"` und Knopf gesperrt bis `useHydrated` (Wächter erzwingt das) | Enter-Taste vor der Hydration schickt per POST an die Seite: kein Datenleck, aber die Aktion läuft nicht; die Eingabe ist weg (harmlos, kein Geld) |
| `Assistent` (1) | Felder und Knöpfe gesperrt bis `bereit` (fieldset disabled, SSR-Standard) | Ausnahmeliste, bewusst |
| `CardForm` (1, Stripe) | Knopf gesperrt, bis Stripe geladen ist | Ausnahmeliste, bewusst: Zahlungsform wird nicht angefasst |

**Rest-Liste und Plan (nur Pilot-relevantes zuerst):**
1. **Backlog 224 nachführen** (Stand „offen“ ist veraltet: Wellen 3 bis 5 mit PR-Nummern, Ausnahmen benannt, Rest = Tabelle oben): Doku, **0,1 Tag**.
2. **Probe „ohne JavaScript / vor der Hydration“ als Test** für die 7 Rest-Formulare (E2E mit ausgeschaltetem JavaScript: es darf keine Eingabe in der Adresse landen, Knopf gesperrt, kein Fehler): **0,5 Tag**. Das ist zugleich der Messpunkt „Knopf vor der Hydration“ aus `pilot-plan.md` 6a und `pilot-vorprobe.md` F4; ohne Test bleibt er Augenschein.
3. **Nicht bauen:** Umstellung der 7 auf `formAction` (Client-Handler mit Stripe, Live-Daten, Zwischenspeicher; Nutzen klein, Risiko in Zahlungs- und Ergebnispfaden). Entscheid nur, falls die Probe 2 ein Datenleck zeigt.
4. **Regel für neue Formulare** (Regelkandidat 28 in `REGELVORSCHLAG.md`): Wächter `forms-action.test.ts` erzwingt sie schon; die Regel selbst braucht den nächsten Regel-PR (NEEDS-USER), kein Pilot-Punkt.

## 2. P2 mit Pilot-Wirkung: Plan mit Aufwand
Quelle: Impeccable Lauf 3 (P2-3 bis P2-7) und `m3-abschluss-pilot-check.md` Abschnitt 4 (Priorität H und M), gegen `main` geprüft (P2-1 Planung und P2-2 „Zur Lobby“ sind mit #329 und #332 erledigt). Reihenfolge: **kleinster Aufwand zuerst**; jeder Punkt hat „Test“ (Kein Bau ohne maschinellen Check).

| # | Punkt (Fundstelle) | Wirkung im Pilot | Maßnahme | Aufwand | Test |
|---|---|---|---|---|---|
| 1 | **Doppelter Freigabe-Satz:** `charge-failure-text.ts` („Die Bank braucht deine Freigabe der Zahlung.“) plus `LobbyClient.tsx:90` („Deine Bank braucht eine Freigabe der Zahlung. Gib sie hier frei …“) | Block 4 Verständlichkeit: derselbe Satz zweimal | zweiten Satz kürzen auf „Gib sie hier frei (bis …).“ | 0,1 Tag | Unit `lobby-fehler`/E2E `lobby-captain` (Text) |
| 2 | **Sprachumschalter 16 px hoch** (`LanguageSwitch.tsx`: Knopf ohne Mindesthöhe) | Messpunkt Touch-Ziele (6a), jede Seite | Knopf `inline-flex min-h-11 min-w-11 items-center justify-center px-2` | 0,1 Tag | `ui-seiten.spec` (Zielgröße ≥ 44 px) |
| 3 | **Link „Teilen“ 16 px, `text-xs`** (`LobbyBoard.tsx:107` und `:219`) | Touch-Ziele auf `/` und `/suche` | `inline-flex min-h-11 items-center px-2 text-sm` | 0,1 Tag | `ui-seiten.spec`, `board.spec` |
| 4 | **„Frist abgelaufen“ ohne Handlung** (`LobbyClient.tsx:87`, `lobby-stand.ts:76`: Aktion `null`; `lobby-fehler.ts`: „abgelaufen = keiner“) | Block 4, Spiel B „Fenster abgelaufen“: Spieler steht ohne Ausweg | ruhiger (ghost) Link „Andere Spiele suchen“ nach `/suche`, **kein** oranger Knopf (eine Hauptaktion bleibt); Entscheid t2q: ändert die Aussage „keine Aktion“ des Plans 5b | 0,25 Tag | Unit `lobby-stand`, E2E `lobby-captain` (Primär = 0, Link da) |
| 5 | **Mandats-Kästchen 13×13 px** (`CardForm.tsx:139` und `:158`, `className="mt-1"`) | Block 2 Karte hinterlegen: Daumen-Treffer; Zahlungsnahe Maske | Kästchen `size-5` und die ganze Zeile (Label) `min-h-11` anklickbar; **nur Layout, Text und Stripe-Teil unverändert** | 0,25 Tag | `ui-seiten`/E2E `karte-lobby`; security-reviewer (Zahlungsmaske, Zwei-Läufe-Regel nur wenn Logik berührt) |
| 6 | **`text-xs` in Fußzeile und BottomNav** (`Footer.tsx:8`, `BottomNav.tsx:32,56`): Beschriftungen 12 px | Lesbarkeit im Hallenlicht (6a) | Fußzeile `text-sm` (Links sind schon 44 px hoch); BottomNav-Beschriftung `text-sm`, **bei 390 px und Englisch auf Umbruch prüfen** (5 Einträge) | 0,25 Tag | `ui-seiten.spec` (Schrift ≥ 12, Überlauf), Screenshot-Prüfung 390 px; Look-Besitzer-Entscheid (Backlog 237 Rest) |
| 7 | **Listenlinks 20 px** (Teamname- und Spielerlinks in den Lobby-Zeilen auf `/` und `/suche`, `LobbyBoard.tsx`/`MyGames.tsx`) | Fehltreffer an eng stehenden Links (6a) | `inline-flex min-h-11 items-center` je Link oder Zeilenpolster; Dichte der Liste prüfen | 0,5 Tag | `ui-seiten.spec`, `board.spec` |
| – | nicht in dieser Liste (andere Besitzer): Start `/` und `/suche` für Spieler mit Team (Produktentscheid, Backlog 240), Hallenbetreiber „Ersatzspieler“ als Hauptknopf (Produktentscheid t2q), Lobby-Länge (DESIGN-F), `/app` ohne Team „Team gründen“ dreimal (Plan w4, 0,25 Tag, Rest nach dem Pilot) | – | – | – | – |

**Vorschlag zum Zuschnitt:** PR A = Punkte 1 bis 3 (0,3 Tag, reine Texte und Zielgrößen, keine Logik); PR B = Punkte 4 und 7 (0,75 Tag, Entscheid t2q zu Punkt 4); PR C = Punkte 5 und 6 (0,5 Tag, Zahlungsmaske und Look-Besitzer). Summe **rund 1,5 Arbeitstage**; vor jedem Merge `security-reviewer` nur für C (Punkt 5). Beginn: PR A sofort nach dem OK; PR B und C nach den Pilot-Prioritäten und den Entscheiden.

## 3. Offene Fragen an den Task Manager
1. Punkt 4 („Frist abgelaufen“): ruhiger Link „Andere Spiele suchen“ erlaubt (ändert die Aussage „keine Aktion“ von 5b)?
2. Punkt 6: BottomNav-Beschriftung auf `text-sm` (Look-Besitzer) oder bei `text-xs` bleiben und nur die Fußzeile ändern?
3. Probe 1.2 („ohne JavaScript“) als eigener kleiner Test-PR vor dem Pilot, oder erst nach der Vorprobe?
