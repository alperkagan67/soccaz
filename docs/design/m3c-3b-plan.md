# Plan 012 M3c-3b: Oberfläche "Anteil übernehmen"

> **Archivkopie (Stand 2026-11-22):** Dieser Plan (nach Review R-T168) wurde nie als eigener Doku-PR gemergt; die Umsetzung (M3c-3b, Oberfläche „Anteil übernehmen“) steht mit #114 auf `main`. Die Datei bleibt unverändert als Nachweis der Entscheide und Abgrenzungen.


Stand: 2026-11-12. Autor: worker-2 (Planer, nur Doku, kein Code). Grundlage: Vertrag 012 (AC-12, AC-13, AC-14, AC-20, Risiken "Anteil übernehmen"), die Antworten von t9 (im Auftrag genannt), M3c-3a Variante B (`payer_user_id`, **Branch von worker-1 liegt noch nicht vor**) und der Bestand auf `feat/charge-m3c1c` (52f7e1a, enthält M3c-1c mit dem Freigabe-Knopf `AuthorizeButton` und `CardDisplay.authorize`; Zeilennummern daraus, ±3 korrigiert nach R-T168; vor dem Schreiben des Codes gegen den dann aktuellen `main` prüfen). **E1 bis E3 setzen auf M3c-1c auf**, weil dieselben Dateien geändert wurden (`page.tsx`, `LobbyClient.tsx`, `card-status.ts`, `card-visibility.ts`).

Dieser Plan ändert keine Regel und keinen Vertrag. Er braucht G1 nur, wenn die offenen Fragen (Abschnitt 10) anders entschieden werden als vorgeschlagen.

## 1. Zusammenfassung

- **Was:** Ein berechtigter Mitspieler B übernimmt den Endanteil eines roten Spielers A (Knopf neben A). B stimmt in einem Dialog dem Betrag und einem Mandatszusatz zu; zur Frist wird B zusätzlich belastet (nicht sofort). B kann bis zur Frist zurücknehmen, A fällt dann wieder auf rot.
- **Wer sieht was:** B: "Du übernimmst den Anteil von {Name}" mit "Zurücknehmen". A: "Dein Anteil wird übernommen". Captain/Veranstalter: beides mit Namen. Dritte: neutral grün "Gedeckt", ohne Namen und ohne Grund. Gäste: nichts je Person.
- **Aufteilung:** M3c-3a (worker-1, Server und Schema, Variante B) liefert Aktionen und Daten. M3c-3b (dieser Plan) ist die Oberfläche, die Anzeigeregeln, die Benachrichtigungen und die Tests der Sichtbarkeit.
- **Aufwand:** 5 Etappen, 3 PRs (E1+E2, E3+E4, E5), zusammen 2 bis 3 Arbeitstage eines Writers plus Reviews. Nicht vor M3c-3a und nicht vor dem Merge von M3c-1c und `feat/m2-3b-consent` beginnbar.

## 2. Voraussetzungen und Schnittstelle zu M3c-3a

M3c-3a ist noch nicht sichtbar. Dieser Plan **nimmt** die folgende Schnittstelle an. Sobald der Branch da ist, wird sie gegen den Code abgeglichen; Abweichungen ändern nur die Namen in E2, nicht die Anzeigeregeln.

| Annahme | Bedeutung | Prüfen in M3c-3a |
|---|---|---|
| Übernahme je Platz gespeichert (Vertrag: `covered_by_user_id` am Platz; Variante B: Abbuchungszeile des Platzes A trägt `payer_user_id = B`) | Es gibt einen Eintrag "A wird von B gedeckt" mit Zeitpunkt der Zustimmung und gespeichertem Zusatztext | Spalten, Migration, Eindeutigkeit |
| Server-Funktionen `coverShare(actorId, matchId, targetUserId, consent)` und `uncoverShare(actorId, matchId, targetUserId)` | Prüfen alle Regeln (Abschnitt 3) **auf dem Server**; die Oberfläche blendet nur aus | Fehlermeldungen als `DomainError`, Idempotenz bei Doppelklick |
| `getCoverState(matchId, viewer)` oder Erweiterung von `getCardDisplays` (`src/server/payments/card-status.ts:16`) | Liefert je Platz: `covered: boolean` und für Berechtigte den Namen des Übernehmers; **Rohdaten verlassen die Funktion nie** | Gleiches Muster wie `cardDisplayFor` |
| `chargeEligibility` (`src/server/payments/charge-run.ts:58-72`, `chargeEligibility` ab Z.58) zählt gedeckte Plätze als bereit; die Zeile des Plätzes A wird B belastet | Ohne das wäre "cards_missing" (Zeile 69) weiter rot | AC-13 |
| Bereit-Sperre `src/server/lobby.ts:446` ("Bitte hinterlege zuerst eine Karte") lässt gedeckte Plätze zu | Sonst kann A nie "Bereit" drücken | AC-13, Entscheid in 3a |
| Absage/Rücknahme/Austritt: Erstattung geht an den Übernehmer (AC-14), Übernahme endet beim Austritt von A oder bei Ersatz durch einen Nachrücker | Oberfläche zeigt dann wieder rot und B erhält eine Nachricht | AC-14 |

Reihenfolge: M3c-1c, `feat/m2-3b-consent` (ConfirmDialog mit `consent`) und M3c-3a vor E3. E1 und E2 (reine Funktionen, Anzeige) können auf der Schnittstelle als Attrappe beginnen, sind aber erst mit M3c-3a lieferbar.

## 3. Regeln: wer sieht den Knopf (alles serverseitig entschieden)

Der Server bestimmt je Betrachter und je Platz **vor dem Rendern**, ob der Knopf erscheint (`canCover: { targetUserId }[]`); die Seite und der Client bekommen nur diese Liste. Gleiche reine Funktion wie die Sichtbarkeit (`src/lib/card-visibility.ts:13-36`, `cardDisplayFor` Z.13, `audienceFor` Z.36), mit Tests.

Der Knopf "Anteil übernehmen" erscheint neben Platz A für Betrachter B genau dann, wenn **alle** gelten:

1. Kartenmodell für dieses Spiel aktiv (`cardOn`, `src/app/lobby/[id]/page.tsx:63`); sonst nirgends ein Knopf (Guthaben-Spiele bleiben unberührt).
2. B ist angemeldet, Teilnehmer, eingeteilt und hat selbst eine Karte (`card_ready`, Ampel grün). B ist nicht A.
3. Gleiches Team wie A. **Im Privatspiel** (keine Teams im Sinn von Captain gegen Captain) genügt "beide sind eingeteilt".
4. A ist rot **aus Sicht von B**: Karte fehlt oder Abbuchung offen/fehlgeschlagen sind für Dritte dieselbe neutrale rote Ampel; der Knopf darf nicht verraten, welcher der beiden Fälle vorliegt (Abschnitt 5, Datenschutz).
5. A ist nicht schon gedeckt (keine zweite Übernahme je Platz) und deckt selbst niemanden (keine Kette).
6. B deckt noch niemanden (ein Platz je Übernehmer) und ist nicht selbst gedeckt.
7. **Vor der Abbuchung:** es existieren **noch keine** Abbuchungszeilen für das Spiel, und die Frist (Countdown "Lobby schließt", `chargeDue`, `charge-run.ts:45`) ist noch nicht erreicht. Phase A legt Zeilen nur an, wenn **alle** Sitzenden `card_ready` sind (`cards_missing`, `charge-run.ts:69`); solange A rot ist, gibt es also keine Zeilen. Sobald Zeilen existieren, gibt es bei **keinem** Platz mehr einen Knopf (Eigenschaft des Spiels, nicht von A). *Offen (3a/Bestand):* Wird die Frist ohne Übernahme erreicht, bleibt A rot und es entstehen keine Zeilen; die Oberfläche zeigt dann keinen Knopf mehr.
8. Das Spiel ist offen (`lobby`/`confirmed`, nicht abgesagt, nicht gestartet).

Zusätzlich sieht der Captain/Veranstalter die Übernahmen mit beiden Namen und darf **zurücknehmen**, aber nicht für B übernehmen (die Zustimmung zum Mandat gehört B).

## 4. Anzeige je Betrachter (Matrix)

Neue Anzeige-Stufe `covered` in `src/lib/card-view.ts:22-39` (Switch mit `satisfies never` bricht den Build, bis alle Fälle behandelt sind).

| Betrachter | Platz A (gedeckt) | Platz B (Übernehmer) | Knopf |
|---|---|---|---|
| A selbst | Grün ✓ "Dein Anteil wird übernommen" (kein Name von B nötig) | n/a | keiner |
| B selbst | Grün ✓ "Karte hinterlegt" bei der eigenen Zeile; Zeile von A: "Du übernimmst den Anteil von {Name A}" | | "Zurücknehmen" (bis zur Frist) |
| Captain/Veranstalter | "Anteil von {A} übernimmt {B}" | "übernimmt für {A}" | "Zurücknehmen" je Übernahme |
| Mitspieler (Dritte) | Grün ✓ "Gedeckt" (vierter, unterscheidbarer Zustand), **ohne Namen** | unverändert (Karte hinterlegt) | nur nach Abschnitt 3 |
| Gast (nicht angemeldet / kein Teilnehmer) | nichts je Person (wie heute, `audienceFor` "guest") | | keiner |

Form und Wort zusätzlich zur Farbe (DESIGN.md Richtung E). **Entscheidung (t9 hat "gedeckt" entschieden): Variante (b).** "Gedeckt" ist ein eigener Zustand neben "Karte hinterlegt", "Keine Karte" und "Zahlung ausstehend" und bekommt einen Eintrag in `CARD_LEGEND` (`card-view.ts:42`) mit dem Hinweis "Anteil von einem Mitspieler übernommen" ohne Namen. **Folge, bewusst angenommen:** Dritte erkennen daran, dass A keine eigene Karte hatte (sie sahen vorher ohnehin "Zahlung ausstehend"). Variante (a) (dieselbe grüne "Karte hinterlegt") wäre unauffälliger, wurde aber nicht gewählt.

## 5. Datenschutz (Pflicht, AC-12/AC-20)

- Dritte sehen **nie**: wer deckt, den Grund des Rots, "fehlgeschlagen", Beträge von anderen.
- Der Rohstatus und alle Übernehmer-Namen verlassen den Server nur in der Form, die die Funktion für diesen Betrachter freigibt (Muster `getCardDisplays`, `card-status.ts:16-34`).
- Der Knopf ist nach Abschnitt 3 Nr. 7 spiel-weit, damit er bei "keine Karte" und "fehlgeschlagen" nicht unterscheidbar ist.
- Die Nachricht an A, B und den Captain nennt **keine** Dritten; die Nachricht an A nennt den Namen von B nicht zwingend.
- **Board, Start/Suche und Übersicht zeigen keinen Übernahme-Zustand.** `src/server/board.ts:125` (`lightFor({ ready, paid })`), `LobbyBoard.tsx` und `src/app/lobby/[id]/uebersicht/page.tsx:122` kennen den Kartenstatus nicht und bleiben so; es kommt **kein** `covered`, kein Name, kein Knopf dazu. Negativtest in E5: weder `covered` noch Übernehmer-Namen im Board-Payload (Antwort der Board-Schnittstelle und Live-Kanal).
- Prüfpunkte: HTML, RSC-Payload (Header `RSC: 1`) **und** Live-Kanal (`/api/lobby/<id>/events`, siehe `readSse` in `tests/e2e/karte-privatsphaere.spec.ts:57`, genutzt Z.132), jeweils für Dritte, Gäste, A, B, Captain (Abschnitt 8).

## 6. Dialog und Zustimmung

- `ConfirmDialog` aus M2-3b (`src/components/ui/ConfirmDialog.tsx`), Knopf "Anteil übernehmen" (Pflichtwort aus 012; `begriffe.md`: nicht "für jemanden zahlen", nicht "bezahlen").
- Titel "Anteil von {Name} übernehmen?"; `consequence` (sichtbarer Betrag, M2-3b): "Zur Frist werden von deiner Karte abgebucht: dein Anteil {X} und der Anteil von {Name} {Y}, zusammen {Z}." Vor "Preis steht fest" ist der Betrag **voraussichtlich** und so beschriftet; Mindestbetrag 0,50 € je Posten (AC-19, zwei Posten, AC-13).
- Bestätigung "Anteil übernehmen", Abbrechen als Startfokus (Geld, `danger` nicht nötig; Rahmen nur bei Zurücknehmen nicht).
- **Zustimmung zum Mandatszusatz (Schnittstelle ist gebaut: `feat/m2-3b-consent`, Commits 4205a77 und e688d60):** `ConfirmDialog` hat die Prop `consent: { label }` (Kästchen, Text von der Seite). Die Bestätigung bleibt bis zum Haken gesperrt, der Haken wird bei jedem Öffnen zurückgesetzt, der Startfokus liegt auf dem Kästchen, und `onConfirmAction({ consent })` bekommt `consent: true` (nur dann ruft `CoverShare` `coverShareAction` mit der Zustimmung auf; der Server prüft sie zusätzlich und speichert Text und Zeitpunkt). Der Showcase-Text ("Ich stimme zu.") ist ein Platzhalter; der echte Text kommt aus `card.coverMandate` und ist als **Entwurf, Rechtstext durch Anwalt** gekennzeichnet.
- Mandatszusatz als i18n-Schlüssel `card.coverMandate` (de/en) mit sichtbarer Kennzeichnung im Quelltext und im PR: "Entwurf, Rechtstext durch Anwalt" (Eintrag in `docs/loop/GO-LIVE-AUDIT.md`). Der Server speichert den Text **zum Zeitpunkt der Zustimmung** zusammen mit dem Zeitstempel (wie `MANDATE_TEXT`, `src/server/payments/card-setup.ts:10`, `payment_setup_intents.mandate_text`), nicht den Schlüssel; Hinweis: Der geltende Text kommt nie vom Client.
- Fehler im Dialog (M2-3b): "Das Spiel hat sich geändert" (Frist vorbei, Platz nicht mehr rot, schon gedeckt) kommt als `DomainError`-Text und bleibt im Dialog stehen.

## 7. Fehlerfälle und Benachrichtigungen

| Fall | Verhalten | Wer erfährt es |
|---|---|---|
| B scheitert bei der Abbuchung (Vertrag, Risiken): A zählt als ausgefallen, B bekommt dieselbe Nachzahlung | B sieht "Abbuchung fehlgeschlagen" mit "Karte ändern" (M3c-1, `charge-retry.ts`); Nachzahlfenster wie für jeden Spieler | B (echter Grund), Captain (echter Grund), A neutral "Dein Platz ist ausstehend"; **Dritte neutral** |
| Platz ausgefallen / A vom Nachrücker ersetzt (AC-8/AC-14) | Übernahme verfällt, B wird erstattet | B und Captain: "Übernahme verfallen"; A: "Dein Platz wurde vergeben" (bestehend) |
| A tritt aus der Lobby aus oder wird entfernt | Übernahme endet automatisch | B und Captain |
| B tritt aus / wird entfernt | Übernahme endet, A wieder rot | A und Captain |
| B nimmt zurück (bis zur Frist) | A fällt auf rot (Karte oder neutral "Zahlung ausstehend") | A und Captain |
| Doppelklick / zwei B gleichzeitig | Zweiter wird abgewiesen ("Der Anteil ist schon übernommen"); Server unter der Spielsperre | der Abgewiesene (Dialogfehler) |
| Karte von B wird ungültig vor der Frist | B wird nicht mehr als berechtigt gezeigt; die bestehende Übernahme bleibt bis zur Frist, dann Fehlerfall oben | B, Captain |
| Spiel wird abgesagt | Erstattung je Posten an B (AC-14) | B, A, Captain (bestehende Absage-Nachricht, ein Satz ergänzt) |

Benachrichtigungen **nur** A, B, Captain/Veranstalter, über `notifyUsers` in der Transaktion (Muster `charge-notify.ts`: gesperrte Nutzer ausschließen, Captain über `teamAdminIds`; im Privatspiel der Veranstalter). Neue Datei `src/server/payments/cover-notify.ts`. Texte ohne die Wörter "fehlgeschlagen"/"abgelehnt" in Nachrichten, die A oder Dritte erreichen können.

## 8. Teile, Dateien, ACs, Belege, Mutationen

Zeilenangaben: Stand `feat/charge-m3c1c` 52f7e1a (±3 nach R-T168 korrigiert).

### E1: Anzeigeregeln (reine Funktionen)
- **Dateien:** `src/lib/card-view.ts` (Switch Z.19-39, `CARD_LEGEND` Z.42 bleibt), `src/lib/card-visibility.ts` (`cardDisplayFor` Z.14-25, `audienceFor` Z.34+), neu `src/lib/cover-rules.ts` (`canCoverTargets(viewer, seats, match)`: Abschnitt 3), Tests `tests/unit/card-view.test.ts`, `tests/unit/card-visibility.test.ts`, neu `tests/unit/cover-rules.test.ts`.
- **AC:** (1) `covered` hat Symbol, Wort und Farbe; (2) Dritte bekommen nie einen Namen oder Grund; (3) `canCoverTargets` liefert für jede Zeile der Matrix in Abschnitt 3 das erwartete Ergebnis; (4) der Knopf ist für "none" und "failed" aus Sicht von Dritten identisch.
- **Beleg:** `npm test -- tests/unit/cover-rules.test.ts tests/unit/card-view.test.ts tests/unit/card-visibility.test.ts`, `npm run typecheck`, `npm run lint`.
- **Mutationen (je rot):** Bedingung Nr. 7 (spiel-weit) auf "nur Platz A" ändern; Bedingung "gleiches Team" entfernen; "ein Platz je Übernehmer" entfernen; `covered` für Dritte mit Namen füllen; `satisfies never` im Switch entfernen und einen Status auslassen.

### E2: Daten für die Seite und Server-Aktionen
- **Dateien:** `src/server/payments/card-status.ts` (`getCardDisplays` Z.16 um `covered` und für Berechtigte den Übernehmer-Namen erweitern, Namen nur für Captain und beide Beteiligte), `src/server/actions.ts` (Aktionen neben `payShareAction` Z.189: `coverShareAction`, `uncoverShareAction`), `src/app/lobby/[id]/page.tsx` (Z.63-85 Daten, Z.140 `canAdminTeam`), Integration `tests/integration/card-status-view.test.ts` (erweitern).
- **AC:** (1) Server liefert `canCover` nur nach Abschnitt 3; (2) die Aktionen prüfen dieselben Regeln noch einmal (Oberfläche ist nie die Sperre); (3) Doppelklick und Gleichzeitigkeit erzeugen genau eine Übernahme; (4) Captain sieht beide Namen, Dritte keinen.
- **Beleg:** `npm run test:integration -- card-status-view card-cover`, `npm run typecheck`.
- **Mutationen:** Aktion ohne Teamprüfung; Aktion ohne "vor der Abbuchung"; Namen an Mitspieler durchreichen; `uncover` durch Fremde (A darf nicht zurücknehmen).

### E3: Oberfläche (Knopf, Dialog, Zustände)
- **Dateien:** neu `src/app/lobby/[id]/CoverShare.tsx` (Client: Knopf, `ConfirmDialog`, "Zurücknehmen"), `src/app/lobby/[id]/page.tsx` (Z.382 Zeile je Platz: `CardLight` plus `CoverShare`), `src/components/PlayerLight.tsx` (`CardLight` Z.48 für `covered`), `src/lib/i18n.ts` (nur anhängen: `card.cover*`, `card.coverMandate`), kein Eingriff in `src/components/ui/ConfirmDialog.tsx` (die Prop `consent` gibt es schon). Eigene Datei für die neue Oberfläche, damit die Konflikte mit dem Look-Umbau M3-3 (`docs/design/m3-plan.md` Z.204, gleiche Dateien) klein bleiben.
- **AC:** (1) Knopf nur für Berechtigte (Server-Liste); (2) Dialog zeigt Betrag und Zustimmung; ohne Häkchen keine Abbuchungszusage; (3) mit Tastatur bedienbar, Knöpfe ≥ 44 px, 390 px ohne Abschneiden; (4) nach Übernahme sofort die richtige Anzeige je Rolle (`router.refresh`); (5) kein neues Wort ausser dem Pflichtwort aus 012.
- **Beleg:** `npm test -- tests/unit/cover-share-view.test.ts` (Static-Markup), Playwright `tests/e2e/ui-regeln.spec.ts -g "Dialog"` (falls Showcase-Eintrag), `npm run typecheck`, `npm run lint`.
- **Mutationen:** Dialog ohne Betrag; Bestätigen ohne Häkchen möglich; Knopf für alle Teilnehmer; "Zurücknehmen" nach der Frist sichtbar.

### E4: Benachrichtigungen
- **Dateien:** neu `src/server/payments/cover-notify.ts`, Aufrufe in `coverShare`/`uncoverShare`/Austritt/Absage (M3c-3a-Dateien, Absprache), Tests `tests/integration/card-cover-notify.test.ts`.
- **AC:** (1) Empfänger nur A, B, Captain/Veranstalter; (2) keine gesperrten Nutzer; (3) Texte enthalten nie "fehlgeschlagen"/Grund für Dritte; (4) pro Ereignis genau eine Nachricht je Empfänger.
- **Beleg:** `npm run test:integration -- card-cover-notify`.
- **Mutationen:** Nachricht auch an andere Teilnehmer; Captain fehlt; gesperrter Nutzer bekommt Nachricht.

### E5: Datenschutz-Payload-Tests, E2E, Doku
- **Dateien:** erweitern `tests/e2e/karte-privatsphaere.spec.ts` (Test Z.78 "Dritte sehen nur die neutrale rote Ampel", Z.159 "Captain sieht den echten Zustand"; `LEAKS` Z.21-26 um die neuen Wörter für Dritte erweitern: `/übernommen/i`, `/übernimmt/i`, `/Zurücknehmen/`, dazu die Namen von A und B in Verbindung mit der Übernahme), neu `tests/e2e/karte-uebernahme.spec.ts` (E2E "dritter Lauf" aus Vertrag 012, siehe unten), `docs/BETRIEB.md` (Abschnitt "Kartenzahlung": Übernahme, Alarm/Prüfung bei Fehlern, Mandatszusatz-Entwurf), `docs/loop/GO-LIVE-AUDIT.md` (Mandatszusatz = Entwurf), `docs/design/begriffe.md` (Eintrag "Anteil übernehmen", "Zurücknehmen", "Gedeckt").
- **AC:** (1) HTML, RSC und Live-Kanal enthalten für Dritte und Gäste weder Namen des Übernehmers noch "übernommen" noch den Grund; der Live-Kanal (`/api/lobby/<id>/events`) wird in `karte-uebernahme.spec.ts` ausdrücklich als **"ohne Kartendaten"** geprüft (kein `covered`, kein Status, kein Name im Ereignisstrom); das Board (`board.ts`) enthält nichts zur Übernahme; (2) A, B, Captain sehen genau ihre Zeilen; (3) E2E: A ohne Karte, B mit Karte übernimmt, Zustimmung, A gedeckt für Dritte, zur Frist zwei Posten bei B (Testmodus-Karte), Zurücknehmen vor der Frist, Absage mit Erstattung an B.
- **Beleg:** `npx playwright test tests/e2e/karte-privatsphaere.spec.ts tests/e2e/karte-uebernahme.spec.ts`, `npm test`, `npm run test:integration`.
- **Mutationen:** Name des Übernehmers in den RSC-Payload für Dritte; Knopf nach Abbuchung bei einzelnen Plätzen; Live-Kanal sendet `covered` an Gäste; Board-Payload enthält `covered`.

## 9. E2E-Bestand, der betroffen ist (Lehre #98: vorher festlegen)

Nur Specs mit **eingeschaltetem** Kartenmodell sehen die neue Oberfläche (`card_payments_enabled`). Das tun heute nur die beiden folgenden; alle anderen laufen im Guthaben-Modell und bleiben unberührt (zu belegen mit Mutation: Kartenmodell AUS, trotzdem Knopf, dann sind alle diese Specs rot).

| Spec | Stelle | Auswirkung | Maßnahme |
|---|---|---|---|
| `karte-lobby.spec.ts` | Z.23-50 ("ohne Karte rot ... grün"), Z.71-90, Z.112 | `setupLobby` (`tests/e2e/flows.ts:5`) legt je Team **nur den Captain** an: es gibt keinen Mitspieler desselben Teams, also **keinen** Knopf in den bestehenden Tests (Bedingung Abschnitt 3 Nr. 3). Trotzdem gilt für `[data-card-light="red"]`/`"green"`: `covered` (grün) würde mitzählen | Unverändert lassen; `data-card-light="green"` gilt weiter nur für "Karte hinterlegt" und `covered` bekommt ein eigenes Attribut `data-card-covered`, damit `.first()`-Selektoren nicht kippen. Z.36-38: die Wortliste ohne "Guthaben/aufladen/Code/Rabatt" gilt auch für die neuen Texte (keine solchen Wörter verwenden). |
| `karte-privatsphaere.spec.ts` | Z.78-137, Z.139-157, Z.159-213, `LEAKS` Z.21-26 | Rote Plätze und "Abbuchung fehlgeschlagen" bei Dritten: der Knopf darf bei `failed` und `none` nicht abweichen; `LEAKS` (`/failed/`, `/fehlgeschlagen/`) darf in den neuen Texten für Dritte nicht vorkommen | Test erweitern (E5), nicht umbauen |
| `karte-freigabe.spec.ts` (M3c-1c, 3 Tests, Kartenmodell AN) | Z.39 "Freigabe: Knopf für den Betroffenen ... Dritte sehen weder Knopf noch Secret noch PaymentIntent-ID", Z.69 "gescheiterte Freigabe: ... kein Freigabe-Knopf mehr, 'Karte ändern' bleibt", Z.82 "Konto: Offene Freigaben" | Der Freigabe-Knopf (`AuthorizeButton`, `CardDisplay.authorize`) und der neue Knopf "Anteil übernehmen" stehen in derselben Seite; beide dürfen sich nicht stören (andere Rollen: Freigabe nur Betroffener, Übernahme nur berechtigte Mitspieler) | Spec mit der neuen Seite laufen lassen (`npx playwright test tests/e2e/karte-freigabe.spec.ts`); Dritte sehen weiter weder Freigabe-Knopf noch Secret; Test ergänzen, dass auch "Anteil übernehmen" bei einer fehlgeschlagenen Freigabe nirgends erscheint (Zeilen existieren) |
| `payments.spec.ts` | Z.196 "Lobby: Anteil beim Bereitmachen ..." (Guthaben) | Heißt "Anteil", ist aber Guthaben-Modell und bleibt unberührt | nichts; **Hinweis:** der Vertrag nennt `payments.spec.ts` für den "dritten Lauf", die Karten-E2Es liegen aber in `karte-*.spec.ts`; `payments.spec.ts` fällt mit M6 (Guthaben) weg. Der dritte Lauf kommt deshalb in die **neue** Datei `karte-uebernahme.spec.ts` |
| `board.spec.ts`, `lobby.spec.ts`, `teamspiel-ablauf.spec.ts`, `privatspiel.spec.ts`, `notifications.spec.ts`, `basics.spec.ts` | `setupLobby`-Flüsse im Guthaben-Modell; `LobbyBoard`/Live-Kanal | Kein Kartenmodell, kein Knopf | Vor dem PR vollständig laufen lassen: `npx playwright test tests/e2e/board.spec.ts tests/e2e/lobby.spec.ts tests/e2e/teamspiel-ablauf.spec.ts tests/e2e/privatspiel.spec.ts tests/e2e/notifications.spec.ts tests/e2e/karte-lobby.spec.ts tests/e2e/karte-privatsphaere.spec.ts` |
| `ui-*.spec.ts`, `a11y.spec.ts` (M2) | Showcase | `consent` ist schon gebaut und getestet (`ui-confirm.spec.ts`, `a11y.spec.ts`, `ui-regeln.spec.ts` mit dem fünften Dialog) | keine Änderung nötig; nach jedem Merge von Showcase-Branches alle Showcase-Specs gemeinsam fahren |

Der Look-Umbau M3-3 (Frontend-Meilenstein, `m3-plan.md` Z.204) ändert dieselben Seiten. M3c-3b kommt **zuerst**; M3-3 baut darauf auf (keine Neugestaltung vor dem Pilot-Gate).

## 10. Offene Fragen (Vorschläge in Klammern; nur bei Abweichung G1)

1. A hinterlegt nachträglich selbst eine Karte: Übernahme bleibt bis B zurücknimmt (Vorschlag), B wird nicht entlastet.
2. Darf der Captain auch **für** einen Spieler übernehmen, statt nur zurückzunehmen? (Nein; die Zustimmung zum Mandat gehört dem Zahler.)
3. "Gedeckt" ist für Dritte ein vierter, unterscheidbarer Zustand und verrät, dass A keine eigene Karte hatte; entschieden (t9): (b) mit Legendeneintrag. Variante (a) (dieselbe grüne "Karte hinterlegt") ist die datensparsamere Alternative, falls der Anwalt oder der Nutzer das anders sieht.
4. Mandatszusatz: Kästchen in `ConfirmDialog` (Empfehlung) oder Knopfbeschriftung.
5. Gäste im Privatspiel (Initialen): Übernahme nur unter angemeldeten Teilnehmern.

## 11. Etappen und Reihenfolge

| Etappe | Inhalt | PR | Abhängig von |
|---|---|---|---|
| E1 | Anzeigeregeln, reine Funktionen, Unit-Tests | PR 1 | nichts (Attrappe der Schnittstelle) |
| E2 | Server-Daten und Aktionen (nur Aufruf der 3a-Funktionen) | PR 1 | M3c-3a gemergt |
| E3 | Oberfläche, Dialog, i18n (nutzt die vorhandene `consent`-Prop) | PR 2 | E2, `feat/m2-3b-consent` gemergt, M3c-1c gemergt |
| E4 | Benachrichtigungen | PR 2 | E2, 3a-Ereignisse |
| E5 | Payload-Tests, E2E "dritter Lauf", BETRIEB.md, begriffe.md, GO-LIVE-AUDIT | PR 3 | E1 bis E4 |

Security-Review (`security-reviewer`) Pflicht für PR 1 bis 3 (Geld, Sichtbarkeit). Writer ≠ Reviewer. Kein Schema-Eingriff in 3b; Migrationen gehören ausschließlich M3c-3a.
