# M3-Abschluss: Pilot-Gate-Check (Vertrag 013 AC-8)
Stand: 2026-11-24 · Code-Stand `origin/main` a0c6391 (M3 PR 1 bis 5b, Lobby-Fix #317, Namen-PRs A bis D gemergt) · Verfasser: worker-3 (Doku, kein Code) · Auftrag: t2q „M3-Abschluss“ · Status: Entwurf, Review offen (w4/w1)

Zweck: Jede Voraussetzung aus `docs/design/pilot-plan.md` Abschnitt 1 mit Beleg und Status, dazu die offenen P2 aus Impeccable Lauf 1 und 2, die den Pilot stören könnten, mit Priorität. Quellen: `pilot-plan.md`, `impeccable-lauf-m3.md` (Lauf 1, #297), `impeccable-lauf-m3-2.md` (Lauf 2, #314), `docs/loop/GO-LIVE-AUDIT.md`, `docs/loop/BACKLOG.md` (237 bis 243), `git log origin/main`, CI-Läufe auf `main` (`gh run`).

## 1. Ergebnis in fünf Zeilen
1. **Erfüllt:** M3 PR 1 bis 5b und der Lobby-Fix (#317), M6a (Guthaben aus der Oberfläche), § 312j-Texte (Entwurf), AC-27 verbindlich, Restore-Probe, Namen-PRs A bis D, `main` grün (Lauf zu df081e6; der Lauf zu a0c6391 war beim Erstellen noch nicht fertig).
2. **Offener P1:** Lauf 2 P1-3 (Knopf-Innenabstand im Baustein `btn`, 3,5 px bei 390 px, Besitzer w4): **nicht gemergt**. Das ist der Auslöser für **Impeccable Lauf 3** (klein: Hell, die Lücken aus Lauf 2, nur nach dem `btn`-Merge).
3. **Teilweise:** „E2E im Stripe-Testmodus“ (012 AC-17): die CI läuft mit dem Fake-Pfad (`PAYMENTS_FAKE=1`), der **echte** Stripe-Testmodus wird erst in der Vorprobe T-1 belegt (kein Mangel, aber der Beleg liegt später als im Plan formuliert).
4. **Zu beobachten:** `willkommen-onboarding` (axe, Kontrast auf `.border-transparent`) ist in einem #317-Lauf rot gewesen (Teil 4/5); gehört zum Onboarding, nicht zur Lobby; der Browser-Teil 5/5 lag mit 568 s knapp unter der 10-Minuten-Grenze (AC-11).
5. **Empfehlung vor dem Pilot (klein, Besitzer in Abschnitt 4):** Zielgrößen unter 44 px (Mitspieler-Links, Sprachumschalter, Fußzeile), „Frist abgelaufen“ mit einer Handlung, doppelter Freigabe-Satz, viele orange Knöpfe auf `/` und `/suche`; dazu zwei Produktentscheide für t2q (Start und `/suche` für Spieler, Betreiber und „Ersatzspieler“).

## 2. Check gegen pilot-plan.md Abschnitt 1
Status: **erfüllt** (Beleg liegt vor), **teilweise** (Beleg fehlt in einem Teil), **offen**.
| Voraussetzung | Status | Beleg |
|---|---|---|
| 012 M3b: Fehlerzustand mit Grund und Nachzahl-Weg | erfüllt | Lobby 5b (#310) und #317; e2e `lobby-captain` (Freigabe, Karte, abgelaufen), Unit `lobby-fehler`; Impeccable Lauf 2: Freigabe und Karte je ein Schritt und eine Hauptaktion |
| 012 M4: Zahlungsstreit, DSGVO | erfüllt | #119 (Migration 0042), #126 (Migration 0043, Löschaufträge); Integrationstests `card-erasure*`, `card-dispute`; Go-live-Prüfpunkte G18/G19/G22/G23 bleiben (Recht, Betrieb). Hinweis: GO-LIVE-AUDIT G23-012 nennt den Stand noch „Branch `feat/charge-m4b`, nicht auf main“: überholt (#126 ist gemergt), Textkorrektur im Audit |
| 012 M5: Turnier auf Karte | erfüllt | #147 (M5-5), #150 und #155 (M5-7a/b); Audit G24-012/G24-012b geschlossen; im Pilot optional (Plan Abschnitt 9) |
| 012 M6a: Guthaben aus Oberfläche und Texten (013 AC-14) | erfüllt | #163; Stichprobe `git grep -i guthaben` in `src/app` und `src/components`: nur Admin-Finanzseite und Belege-Route, kein Spieler-UI; e2e prüfen „kein Guthaben-Text“ (`karte-lobby`, `karte-privatsphaere`); Rechtstexte zu M6a sind Entwurf (G28-012), blockieren den Pilot nicht |
| 013 M3: Navigation, Start, Spiel suchen, `/app`, Lobby „Dein Stand“ mit EINER Hauptaktion, Fehlerzustand, Captain-Leiste | erfüllt | PR 1 bis 5b (#281, #284, #290, #293, #302, #310), Lobby-Fix (#317); Hauptaktion je Zustand per Unit und e2e (390 px, lange Namen); AC-30 b für die Lobby erfüllt (Lauf 2), für `/` und `/suche` offen (Abschnitt 4, P2-15) |
| Zahlungstexte nach § 312j BGB, zentral, nur bei echter Abbuchung | erfüllt (Entwurf) | #286, Streutext-Sperre `zahlungspflicht-texte.test.ts`, Zustand-Matrix `zahlungspflicht-matrix.test.ts`; **Rechtsprüfung offen**, im Pilot als Entwurf sichtbar (Plan Abschnitt 15.2) |
| AC-27 Kontrastmessung verbindlich (390/1280, hell/dunkel) | erfüllt | #271 (enforce), Messfix #290; CI-Läufe grün (0 durchgefallen); lokal im Dev-Modus fallen 4 Punkte auf `gast-hallen` hell, CI-Baseline 0. Grenze: neue Fehlerzustände sind nicht im AC-27-Umfang (globaler Schalter, Entscheid TM, Abschnitt 4) |
| Restore-Probe (E8-Werkzeug) | erfüllt (Werkzeug) | #301 (`scripts/restore-test.mjs`, Manifest, BETRIEB); der Rundlauf in der CI ist voraussichtlich übersprungen; **Probelauf mit der echten Hoster-Sicherung steht aus** (Nutzer, Plan Abschnitt 15) |
| Namen-PRs (Sichtbarkeit, Entscheid t2q 2026-11-24) | erfüllt | A #306 (Kommentare), B #315 (Listen: Rangliste, Spielerliste, Mitspieler, Turnier, offene Lobby, Einladung), C #318 (Spielbericht, `/api/spiele/[id]/live`), D #320 (Spielerprofil für Gäste nicht öffentlich, noindex); Lobby und Teamkarten für Betreiber #302. Nachläufer Backlog 242 (niedrig) und 243 (Bildcache, Produktfrage). Das **Gäste-Szenario ist freigegeben**; als Teil der Vorprobe eine HTML-Stichprobe je Fläche als Gast und als Betreiber |
| Impeccable-Engine-Lauf 2 (Lobby-Zustände, `/app`, `/suche`, `/turniere`, `/`, `/willkommen`, `/einladung`) | erfüllt | #314: keine P0, vier P1, zwölf P2; P1 1, 2, 4 behoben mit #317; **P1-3 offen** (Abschnitt 3); Lücken: hell, Veto-/Terminphase, bestätigt, Privatspiel, Übernahme, abgesagt |
| E2E im Stripe-Testmodus grün (012 AC-17), Browser-Tests unter 10 Minuten je Teil (013 AC-11) | teilweise | CI-Lauf zu df081e6: Teil 1 bis 5 grün, Jobdauer 464, 485, 500, 467, **568** Sekunden (Integration 326 s, Typen/Lint/Unit 163 s); die E2E laufen mit dem Fake-Pfad, der echte Testmodus kommt in der Vorprobe. Teil 5/5 hat nur rund 30 s Luft; weitere Specs in Shard 5 vermeiden |
| `main` grün (CI), Staging aus `main` gebaut | teilweise | `main` grün bis df081e6; a0c6391 lief beim Erstellen; Staging ist Aufgabe der Technik (T-7), noch nicht begonnen |

## 3. P1-Stand (Lauf 1 und Lauf 2)
| Befund | Stand |
|---|---|
| Lauf 1 P1-1 mehrere Hauptaktionen in der Lobby | behoben (5a/5b, #317), Lauf 2 bestätigt |
| Lauf 1 P1-3 Fehlerzustand mit mehreren Wegen | behoben (5b), Lauf 2 bestätigt |
| Lauf 1 P1-4 „Live“ in `text-xs` | behoben (#296) |
| Lauf 1 P1-2 und Lauf 2 P1-3: Knopf-Innenabstand 3,5 px (Baustein `btn`) | **offen, Besitzer w4**; Auslöser für Lauf 3 |
| Lauf 2 P1-1 Karte in Karte | behoben (#317), HTML-Tests je Baustein |
| Lauf 2 P1-2 Hauptaktion in der ersten Ansicht (390 px) | behoben (#317), e2e mit langen Namen |
| Lauf 2 P1-4 Captain in der Planung ohne Schritt | behoben (#317) |

## 4. Offene P2, die den Pilot stören könnten (mit Priorität)
Nur Punkte, die einen der Pilot-Blöcke (Plan Abschnitt 6) oder die Messpunkte (6a) berühren; der Rest bleibt im Backlog. Priorität: **H** vor dem Pilot erledigen, **M** möglichst vorher oder als bekannte Grenze benennen, **N** nicht vor dem Pilot.
| Pr. | Befund (Quelle) | Betroffener Pilot-Punkt | Besitzer | Empfehlung |
|---|---|---|---|---|
| H | **Zielgrößen unter 44 px:** Mitspieler-Namen als Links (20 px), Sprachumschalter „Deutsch/English“ (16 px), Link „Teilen“, Fußzeilenlinks (Lauf 2 P2-5) | Messpunkt „Touch-Ziele“ (6a) und Block 1; AC-3 | Lobby/Layout | Trefferfläche vergrößern (Padding), nicht die Schrift; vor dem Pilot, sonst misst der Abend das bekannte Ergebnis |
| H | **`/` (7) und `/suche` (27) mit vielen orangen Knöpfen** (AC-30 b nennt Start ausdrücklich; Lauf 2 P2-15) | Block 1 „Einstieg ohne Erklärung“ | w3 | Karten-Knöpfe ruhig, nur der Hero bleibt primär (klein) |
| H | **„Frist abgelaufen“ ohne Handlung** (Lauf 2 P2-7) | Block 4, Spiel B „Fenster abgelaufen“ | w3 | ruhiger Link „Andere Spiele suchen“ als einzige Aktion |
| M | **Freigabe-Fehler: derselbe Satz zweimal**, vier Knöpfe im Kasten, „Abmelden“ im Fehlerkasten (Lauf 2 P2-6) | Block 4 Verständlichkeit | w3 | ein Satz, Frist in „Dein Stand“; klein, gleiche Dateien wie P2-7 |
| M | **Start `/` für angemeldete Spieler zeigt die Gast-Erklärung (7500 px bei 390), `/suche` beginnt mit dem Auswahlschritt (14 800 px)** (Lauf 1 und 2; Backlog 240 Punkt 1, 2) | Block 1 „finden Freunde ohne Erklärung den nächsten Schritt?“ | **Produktentscheid t2q**, dann w3 | Entscheid vor dem Pilot: Kurzfassung für Spieler mit Team; Board vor Auswahl oder Auswahl einklappen |
| M | **Hallenbetreiber bekommt „Als Ersatzspieler anbieten“ als orange Hauptaktion** (Lauf 2 P2-8) | Betreiber-Rolle (Plan Abschnitt 3, namenfreie Sicht) | **Produktentscheid t2q** | für reine Betreiber eine neutrale Zeile ohne Hauptaktion, sonst verwirrt die Rolle im Test |
| M | **`/app` ohne Team: „Team gründen“ dreimal** (Lauf 2 P2-14) | Block 1, Neulinge | w4 | eine Karte mit einer Aktion |
| M | **Lobby sehr lang (2600 bis 3700 px bei 390)** (Lauf 1/2, P2-9) | Messpunkt „Scrollen/Länge“ | w3 (DESIGN-F) | bekannte Grenze, im Plan benannt; kein Blocker |
| M | **`text-xs` in globalen Bausteinen: Fußzeile und BottomNav-Beschriftung** (Lauf 2 P2-12) | Handy-Lesbarkeit im Hallenlicht (6a) | Layout, Entscheid mit Look-Besitzer | mindestens `text-sm`, klein |
| M | **Hell nicht gescannt** (Lauf 2 Lücke) | Handy-Systemschema der Teilnehmenden kann hell sein | Lauf 3 | in Lauf 3 abdecken; AC-27 deckt den Kontrast hell ab |
| M | **Bildcache und öffentliche Bilder** (Backlog 243: `/api/media` öffentlich per UUID, Karte bis ein Jahr im Cache) | Datenschutz-Information an die Teilnehmenden | t2q | Produktfrage; im Pilot als Hinweis, nicht blockierend |
| N | Stragglers, Zeilenlänge 106 Zeichen, `unbalanced-heading` (Lauf 2 P2-10) | kosmetisch | Layout | zentral per `text-wrap`, nach dem Pilot |
| N | `/app` „Meine Spiele“ ohne Obergrenze (Lauf 2 P2-13) | Pilot hat wenige Spiele je Konto | w4 | nach dem Pilot |
| N | Planung: deaktivierter „Bereit machen“-Knopf plus Satz (Lauf 2 P2-11) | wiederholt „Dein Stand“ | w3 | braucht Testwechsel (`matchmaking.spec`), nach dem Pilot |
| N | Schrift Plus Jakarta Sans (`overused-font`) | Look-Entscheid des Nutzers (Backlog 239: Figtree nach dem Pilot) | Nutzer | nicht ändern |
| N | `/turniere` Leerzustand ohne Handlung (Backlog 240 Punkt 3) | Turnier ist im Pilot optional | w3 | nach dem Pilot |
| N | AC-17-Nachläufer (Backlog 242 a bis d) | Sortierung nach Namen, Betreiber+Team-Admin, „ß“ | w3/w4 | bewusst akzeptiert, nach dem Pilot |

## 5. Offene Punkte außerhalb der Listen
- **Lauf 3 (Impeccable):** Auslöser ist der offene P1-3. Sinnvoll erst nach dem `btn`-Merge (sonst doppelter Aufwand). Umfang: Lobby-Zustände aus den Lücken (Veto-/Terminphase, bestätigt, Privatspiel, Übernahme, abgesagt), hell, `/willkommen`, `/einladung`. Für diesen Check wurde **kein** Lauf gestartet (Auftrag: nur bei offenem P1; der offene P1 hat einen Besitzer und ist gleichzeitig der Grund, warum Lauf 3 abzuwarten ist).
- **Onboarding-Kontrast:** `willkommen-onboarding.spec` (axe auf `.border-transparent`) ist in einem Lauf rot gewesen, im Diff des Lobby-Fix nicht berührt; Befund liegt beim TM (Backlog), vor dem Pilot zu klären, weil Block 1 durch `/willkommen` geht.
- **Shard-Luft:** Teil 5/5 568 s; Teil 3 500 s; Messung nach jedem neuen Spec; keine Specs mehr in Shard 5 ohne Neuverteilung.
- **Audit-Text:** G23-012 (Stand „Branch noch nicht auf main“) ist überholt: im nächsten Sammel-PR korrigieren.
- **Plan:** `pilot-plan.md` Abschnitte 1, 6 und 10 sind mit diesem PR auf den Stand der Namen-PRs und der Lauf-2-Behebung gebracht.

## 6. Vorschlag zur Reihenfolge bis zur Terminfreigabe
1. **Jetzt:** `btn`-Baustein (w4, P1-3) mergen; danach Lauf 3 (klein).
2. **Klein vor dem Pilot (ein Lobby-/Layout-PR):** Zielgrößen (P2-5), Karten-Knöpfe auf `/` und `/suche` ruhig (P2-15), „Frist abgelaufen“ mit Handlung (P2-7), Freigabe-Satz (P2-6), Fußzeile und BottomNav `text-sm` (P2-12).
3. **Produktentscheide t2q:** Start und `/suche` für Spieler (Backlog 240), Betreiber und „Ersatzspieler“ (P2-8), Profilbilder ohne Anmeldung (243).
4. **Betrieb:** Onboarding-Kontrast klären, Staging und Vorprobe (Plan Abschnitt 4), Restore-Probe mit der echten Sicherung (Nutzer).
