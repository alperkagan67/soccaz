# 012 M5: Plan v3 (Turnier auf Karte)

Stand: Plan v3, 2026-11-12 (v1: fd3f951, v2: 9d6aa28) · Code-Stand `origin/main` 8c26498 · Verfasser: worker-1 · Status: **Entwurf zum Mergen; offene Fragen bleiben Fragen**. Freigegeben für den Start: nur M5-0 und M5-2a (Schema additiv, Branch `feat/m5-schema`, Commit 69e4e1b, Migration 0046); alles Weitere nach Review-OK zu diesem Plan.
Grundlage: Vertrag `docs/contracts/012-zahlung-karte-lobby.md` v3 (Meilenstein M5, AC-1 bis AC-21, „Offene Fragen“ Turnier-Anteil), ADR 0001, Vertrag 011 (Zusage der Halle), Vertrag 009 (Provision je Halle), Vertrag 005/008 (Turnier), `docs/design/m4-plan.md`.
Markierungen: **[FRAGE-PRODUKT]** Entscheid Nutzer/Orchestrator, **[FRAGE-RECHT]** beantwortet kein Agent, **[FRAGE-PLAN]** technische Wahl für den Reviewer, **[ANNAHME]** vorläufig.

## 0. Neu in v3 (Re-Review, REVIEW-CHANGES, 10 Punkte)

| Punkt | Wo umgesetzt |
|---|---|
| 1 Stand main 8c26498 (0044/0045 gemergt, 009 M1 erledigt: `users.is_owner`, genau ein Admin 1) | Abschnitte 2, 5, 12, 14 |
| 2 Provision/Doppelzählung mit 009 M2: `tournament_share` nicht als Ertrag, sondern nach 009-M2-Buchungsschnitt (Variante A, S1 offen); Summen-Test; Schlüssel und Storno der Provision; 10er-Bonus im Turnier zählt in M5 nicht | Abschnitt 3.5, T-25 bis T-27 |
| 3 Provision ohne Quelle: Satz 0 und Snapshot-Spalte, Kopplung an 009 M2f | Abschnitt 3.5, 12 |
| 4 `hasVenueAccess` nicht auf main: Zugangspflicht beim Fixieren einfrieren, Schnittstelle `hallZusageOk` mit Signatur, Test Attrappe = Echtlogik | Abschnitt 3.6, T-8 |
| 5 Migrationen: w1 `0046` (M5-2a), 009 M2 ab `0047` | Abschnitt 5 |
| 6 Matrix: Admin 2 und Betreiber der Halle | Abschnitt 13 |
| 7 Z5: Vorschlagsweg Admin 2; offene 3-D-Secure-Zeile nach Absage | Abschnitt 3.1, T-9 |
| 8 `lockTournament` exportieren (M5-2b); Z1 prüft, dass keine Zeile übersprungen wurde | Abschnitte 3.1, 6, 8, 10 |
| 9 `settled_at` behalten, `booked_at` gestrichen; Turnier ohne Partnerhalle in der Zustandstabelle | Abschnitte 3.1, 5, 9 |
| 10 `tests/cleanup.ts` in die Dateiliste; T-18 mit Testziel | Abschnitte 6, 7 |

## 0b. Neu in v2 (Review R-M5-Plan, REVIEW-CHANGES, 10 Punkte)

| Punkt | Wo umgesetzt |
|---|---|
| 1 Option A vollständig spezifizieren (Tabellen, FK ohne cascade, Zeilenlebenszyklus, Schlüsselformen, Webhook-Lock, M5-2 teilen) | Abschnitte 4 und 8, Etappen in 12 |
| 2 Teilausfälle, Zeitleiste, `substitute*` nicht angeschlossen, Austritt nach Fixieren, Division durch 0 | Abschnitte 3.1 bis 3.4, ACs T-19 bis T-22 |
| 3 Provision einfrieren; Spannung „direkt an die Halle“ vs. alles bei Soccaz | Abschnitt 3.5, FRAGE-PRODUKT 1 |
| 4 Startbedingungen hart (Zusage-Schnittstelle mit Attrappe, Provision erst nach 009 M1 oder 0, T-15 erst mit 009 M1) | Abschnitt 12 (Vorbedingungen) |
| 5 Migrationsnummern nicht fest, Journal/Snapshot, Rollback, Widerspruch DROP | Abschnitt 5 |
| 6 Sichtbarkeitsmatrix, T-6/Abschnitt-13-Widerspruch, Löschsperre als Frage | Abschnitt 13, T-14a/T-14b |
| 7 Tests/Mutationen ergänzt, maschineller Check M5-0/M5-6 | Abschnitt 10 |
| 8 Altturniere: zurücksetzen statt migrieren (Vertrag) | T-18, FRAGE-PRODUKT 5 gestrichen |
| 9 Dateiliste per Grep | Abschnitt 6 |
| 10 Empfehlungen zu den PLAN-Fragen übernommen (A mit Ergänzungen, `tournament_share`, eigener Turnier-Job) | Abschnitte 4, 5, 12 |

## 1. Ziel und Abgrenzung

Das Turnier zahlt wie Team- und Privatspiel per Karte (Vertrag 012, M5):

- **Anteil je Spieler** = aufgerundet Hallenmiete des Turniers ÷ **tatsächliche** Spielerzahl (`shareCents`, heute `finalSharePerPlayer` in `maybeFixPrice`).
- **Keine Zahlung bei Beitritt**: Spieler hinterlegt eine Karte; „Bereit“ heißt „Karte hinterlegt“. Abgebucht wird einmal zur Frist (48 h vor Start; bei kürzerem Vorlauf sofort), Alles-oder-nichts.
- **Das Geld gehört der Halle** abzüglich Provision (Vertrag 009); der **Veranstalter bekommt kein Geld**: `settle()`, Auszahlung und Konto `tournament` entfallen.
- **Zusage der Halle** ist Buchungsbedingung (falls die Halle einen Zugang hat, Vertrag 011).
- Erstattung immer auf die Karte; „Anteil übernehmen“ (M3c-3) im eigenen Team; Dispute und DSGVO wie im Teamspiel.

Nicht Teil von M5: Guthaben entfernen (M6), Preisgelder, echte Auszahlung an Hallen (Stripe Connect, E3 bis E6), Anwaltstexte, Bracket-/Spielplan-Logik, Ligen, **Nachrücker und Warteliste im Turnier** (`substitute*` wird für Turniere NICHT angeschlossen, Abschnitt 3.3).

## 2. Ist-Stand (aus dem Code)

**Turnier heute (`src/server/tournaments.ts`, 816 Zeilen):**
- Anmeldung `registerTeam`, `joinAsPlayer`, `leavePlayer` (erstattet aufs **Guthaben**, `refundPlayer`), `unlockTeam`.
- Preis: `setRosterComplete` → `maybeFixPrice`: sind alle Plätze belegt und alle Teams vollzählig (4 bis 6 Spieler), wird `final_share_cents = finalSharePerPlayer(total_cents, Spieler)` gesetzt, Status `registration → payment`, `price_round + 1`. `total_cents = tournamentTotalCents(hourly_cents, duration_min)`; ohne `total_cents` gilt das alte Festgeld `entry_fee_cents`.
- Zahlung: `payEntry`/`payForTeam` buchen vom Wallet (`debitWallet`, Konto `tournament`, Art `tournament_entry`) und setzen `tournament_players.paid_cents/paid_at/paid_by`.
- „Bereit“: `setPaidReady` (Captain, erst wenn das ganze Team bezahlt hat) → `tournament_teams.paid_ready_at`; `maybeGenerateBracket`: alle Teams vollzählig und bezahlt-bereit → `running`, Bracket und Spiele (`matches.kind = 'tournament'`).
- Absage/Frist: `cancelTournamentTx` (Erstattung aufs Guthaben), `closeTournamentsAtDeadline` (5-Minuten-Job; `dueOf`: 48 h bzw. 1 h vor Start plus 12 h Karenz ab Preisfestlegung `dueWithGrace`, Altturniere unberührt), `reopenRosters` (Veranstalter; erstattet alles).
- Ende: `finishTournament` → `settle`: Auszahlung an den Veranstalter (`tournament_payout`, `splitEntryFees`, Einstellung `tournament_commission_percent`, Standard 10 %), Buchung `tournament → revenue` (`tournament_commission`).
- **Keine Halle am Turnier**: nur `venue_text` (Freitext) und `hourly_cents`. Kein `venue_id`, keine Provision je Halle, keine Zusage.

**Kartenmodell heute:**
- `payment_charges` (Zeile je Platz, `match_id NOT NULL`, `ON DELETE CASCADE` auf `matches`, UNIQUE `(match_id, user_id)`, `payer_user_id`, `slot_of`, `slot_team_id`), `payment_charge_attempts` (an `charge_id`), `payment_refunds` (`match_id NOT NULL` cascade, `charge_id` cascade), `payment_setup_intents` (`match_id` optional), `payment_disputes` (`match_id` nullable, `charge_id`), `payment_dispute_entries` (an `dispute_row_id`).
- Zeilen entstehen in **Phase A** von `runCharges` (`charge-run.ts:99`), nicht beim Beitritt; Nachrücker-Zeilen in `substitute.ts:138`.
- Webhook ordnet über `payment_intent_id` zu und prüft die Metadaten `matchId`/`userId` gegen die Zeile (`charge.ts:104,105`, `webhook.ts:34,53`).
- Ledger: `clearing → revenue`, Art `match_share`, Schlüssel `charge:<PI>`; `ledger_entries.tournament_id` existiert schon (Schema-Kommentar: Fremdschlüssel in der Migration).
- `receipts.match_id` (nullable), `kind` `topup | match`.
- Rund 330 Stellen mit `match_id`/`matchId` in 27 Dateien unter `src/server/payments/` (`refund.ts` 53, `substitute.ts` 35, `charge-run.ts` 34, `charge.ts` 30, `authorize.ts` 20, `charge-retry.ts` 20).

**Stand `origin/main` 8c26498:** 009 M1 ist gemergt (`users.is_owner`, genau ein Admin 1 als Rolle `owner`, Teilrollen; Migrationen `0044_light_naoko.sql`, `0045_teilrollen_aufloesen.sql`). Damit sind T-15 (nur `owner` sagt nach der ersten Abbuchung ab) und der Satz-Schutz (nur Admin 1) **echt prüfbar**. **Nicht auf main:** 011 M1 (Betreiber-Zugang): `hasVenueAccess` gibt es auf main nicht (Plan `docs/011-m1-plan`: nur **aktive** Zugänge zählen). **009 M2** (Provision je Halle: `venues.commission_percent`, Hauptbuch „Provision“, 10er-Zähler) ist nur als Plan v2 da (`docs/009-m2-plan`, 08a0729); `venues` hat heute **kein** `commission_percent`.

## 3. Zielbild

Status bleibt `registration → payment → running → finished/cancelled`; **die Bedeutung von `payment` ändert sich** zu „Karten sammeln und Frist abwarten“.

1. **registration**: Teams melden an, Kader füllen sich, Spieler hinterlegen jederzeit eine Karte. Keine Geldbewegung. Vorschau des Anteils: `shareRange`.
2. **Preis fix** (`maybeFixPrice`, unverändert): alle Plätze belegt, alle Teams vollzählig → `final_share_cents`, Kader gesperrt, `price_round + 1`, Status `payment`.
3. **Bereit** (Captain) heißt: alle Spieler des Teams haben eine Karte oder einen Übernehmer; der Server prüft das (AC-2).
4. **Frist** → Abbuchung aller Spieler aller Teams (Abschnitt 3.1), nur mit Zusage der Halle (falls Zugang).
5. **Gebucht**: alle Zeilen erfolgreich + Zusage → `settled_at`, Bracket genau einmal, Belege je Zahler.
6. **Absage**: alle bereits Abgebuchten werden auf die Karte erstattet, ohne Plattform-Übertrag.
7. **Ende**: keine Veranstalter-Auszahlung.

### 3.1 Zustandstabelle der Abbuchung (alle ok / teilweise / Fenster / Absage)

| Zustand | Bedingung | Folge | Erstattung |
|---|---|---|---|
| **Z0 offen** | Frist noch nicht erreicht | nichts | nichts |
| **Z1 alle ok** | jede Zeile `succeeded` (nach `resolution`-Regel), **kein Spieler ohne Zeile und keine Zeile übersprungen** (Zeilenanzahl = Spielerzahl, nichts durch SKIP LOCKED oder einen Webhook-Halter ausgelassen), Zusage da (oder keine Zusage nötig) | `settled_at` (einmal), Bracket, Belege, Provisionsbuchung | nein |
| **Z2 teilweise** | einige `succeeded`, einige `pending`/`requires_action`/`failed`, Fenster läuft | Turnier bleibt `payment`, kein Bracket; Betroffene bekommen Nachzahl-Weg | nein, die bereits Abgebuchten bleiben abgebucht (Alles-oder-nichts gilt am Ende, nicht pro Zeile) |
| **Z3 Fenster abgelaufen** | mindestens eine Zeile nach `effectiveGraceEnd` nicht `succeeded` | **Absage des Turniers** [ANNAHME, FRAGE-PRODUKT 3] | **sofort** im selben Job und derselben Transaktion: je Zeile eine Erstattung in Höhe des gezahlten Betrags (Zeile `payment_refunds`, `pending`) **und das Storno einer schon gebuchten Provision im selben Schritt**; Versand durch den bestehenden Erstattungslauf, Zeile `failed` bleibt bis Admin sie klärt |
| **Z4 Zusage fehlt zur Frist** | `hallZusageOk` falsch | nichts wird abgebucht; Turnier fällt aus | nichts zu erstatten (nichts abgebucht); Vorlauf < 48 h: bis 1 h vor Start warten, dann Absage |
| **Z5 Absage durch Berechtigte** | nach der ersten Abbuchung nur Admin 1 (`owner`, AC-21); **Admin 2 kann nur vorschlagen** (Vorschlagsweg 009 AC-9, auch für Turniere; Test); Absage bei laufender Phase B/C mit Zeilen `pending`/`requires_action`: diese Zeilen werden terminal (`tournament_cancelled`, nie mehr gesendet); eine **offene 3-D-Secure-Zeile** kann nach der Absage noch erfolgreich werden: späte Zahlung wird **gebucht und sofort voll erstattet** (wie M3c-2b), Admin-Alarm (T-9) | wie Z3 | sofort wie Z3 (Erstattung + Provisions-Storno im selben Schritt) |
| **Z7 Turnier ohne Partnerhalle** | `venue_id` leer (Freitext-Halle) | **Provision 0, keine Zusage nötig**; sonst gleiche Zustände Z0 bis Z6; Anzeige „Halle ohne Zugang/Partner“ | wie Z3 |
| **Z6 Streit** | `charge.dispute.*` zu einer Zeile | Markierung, `chargeback`; strittige Zahlung wird nicht erstattet (AC-11) | alle anderen wie Z3 |

Erstattungszeitpunkt ist immer „im Absage-Schritt erzeugt“ (Zeilen in derselben Transaktion wie die Absage), Versand zeitlich nachgelagert wie im Teamspiel (`refund.ts`).

### 3.2 Zeitleiste (Beispiel Start Samstag 18:00)

| Zeitpunkt | Vorlauf ≥ 48 h (Anlage ≥ 48 h vor Start) | Vorlauf < 48 h (Anlage z. B. Freitag 12:00) |
|---|---|---|
| Anmeldung, Karten | bis zur Frist, `registration_deadline` ≤ Frist | ab Anlage |
| Preis fix | sobald alle Teams vollzählig (jederzeit vor der Frist) | wie links |
| `payOpenAt` | letzter `tournament.price`-Eintrag | wie links |
| **Frist (Abbuchung)** | **Donnerstag 18:00** (`fixDeadline` = Start − 48 h); mit Karenz `dueWithGrace`: früheste Frist `payOpenAt + 12 h`, nie später als Start − 15 min | **sofort**, sobald alle Teams bereit (+ Zusage); sonst spätestens Abbruch |
| Nachzahlfenster | `min(Fehler + 2 h, Start − 1 h)` | `min(Fehler + 2 h, Start − 1 h)`; bei ≤ 1 h Rest kein Fenster |
| **Abbruch** | Frist erreicht, nicht gebucht → Absage | Start − 1 h (`abortDeadline`) → Absage |
| Bracket | direkt nach Z1 | direkt nach Z1 |

Karenz: gilt wie im Bestand nur, wenn `payOpenAt > createdAt`; sie schiebt die Frist nie über Start − 15 min. Beide Quellen (`deadlines.ts`, `grace.ts`) bleiben unverändert und werden aus dem Turnier-Job aufgerufen.

### 3.3 Nachrücker/Warteliste (nicht angeschlossen)

`substitute*` bleibt dem Teamspiel vorbehalten (Warteliste = nicht eingeteilte Teilnehmer mit Karte). Im Turnier gibt es sie nicht: Der Kader ist ab Preis-Fix gesperrt. Test: Kein Turnierpfad ruft `substitute*` auf (Grep-Beleg + Testfall „Zeile `failed` im Turnier erzeugt keine Nachrücker-Zeile“). `slot_of`/`slot_team_id` bleiben für Turnierzeilen `NULL` (CHECK).

### 3.4 Austritt, Beitritt, Division durch 0, Hallenpreis

- **Austritt oder Beitritt nach dem Fixieren**: nicht möglich (`registrationOpen` false). Einzige Ausnahme: `reopenRosters` (Veranstalter), nur **solange noch keine Zeile in `payment_charges` für das Turnier existiert**; Preis wird neu berechnet, `price_round + 1`, „Bereit“ aller Teams zurückgesetzt (AC T-19). Existiert schon eine Abbuchungszeile, ist `reopenRosters` abgewiesen (`DomainError`); der Weg ist dann die Absage (Z5).
- **Division durch 0**: `finalSharePerPlayer` rechnet mit `max(players, 1)`; zusätzlich Guard: ein Turnier ohne Spieler wird nie fixiert (AC T-21, Test).
- **Turnier ohne Hallenpreis** (`total_cents` leer und `entry_fee_cents = 0`): **nicht fixierbar** im Kartenmodell (Vertrag-Annahme); `maybeFixPrice` bricht ab, Anzeige „Hallenpreis fehlt“ (AC T-22, Test). Das alte `entry_fee_cents` als Einsatz entfällt.

### 3.5 Geld und Provision (ohne Doppelzählung)

- **Buchungsschnitt nach 009 M2, nicht nach dem Teamspiel-Altstand.** Heute bucht `charge.ts` die Abbuchung `clearing → revenue` (Art `match_share`); käme eine Provision zusätzlich auf `revenue`, zählten dieselben Euro doppelt (Befund im Review 009 M2). Deshalb gilt für das Turnier: **`tournament_share` ist kein Ertrag.** Die Abbuchung wird nach dem Buchungsschnitt von 009 M2 gebucht (**Variante A: Verbindlichkeit Halle, nur die Provision ist Ertrag**: `clearing → venue_payable`, Provision `venue_payable → commission`). Solange S1 (Entscheid Buchungsschnitt, Vertrag 009) **offen** ist, wartet M5-4 (Abbuchung/Buchung) darauf; M5-0 bis M5-3 sind davon nicht berührt. **FRAGE-PRODUKT 1:** S1 entscheiden oder M5-4 bis dahin zurückstellen.
- **Test Hauptbuch Turnier (Pflicht):** Summe (`commission` + Rest an der Halle) = Summe der erfolgreichen Abbuchungen, Soll = Haben, keine Doppelzählung (T-25); nach Absage (Z3/Z5) ist die Summe wieder 0.
- **Schlüssel der Provisionsbuchung:** `commission:t:<tournamentId>` (genau einmal je Turnier; **Bemessungsgrundlage ist die Hallenmiete (`total_cents`, Entscheid P6), NICHT die Summe der Abbuchungen** (ersetzt durch Nachtrag M5-4a: die frühere Fassung „Summe aller erfolgreichen Zeilen“ und der Verweis auf 009 A2 gelten nicht mehr); abgerundet auf Cent). **Storno bei Absage** im selben Schritt wie die Erstattung (Gegenbuchung `commission-reversal:t:<tournamentId>`, zweites Storno bucht nichts; T-26).
- **Provision einfrieren:** Beim Fixieren des Preises wird der Satz in `tournaments.commission_percent_snapshot` gespeichert; spätere Änderungen durch Admin 1 wirken nicht rückwirkend; Admin 2 kann den Satz nicht ändern (Mutation).
- **Provision ohne Quelle:** `venues` hat heute kein `commission_percent` (kommt mit 009 M2a). **M5-1 bleibt bei Satz 0** und legt nur die Snapshot-Spalte und die Hook-Funktion `venueCommissionPercent(venueId)` an (liefert 0); die Kopplung an den echten Satz ist **009 M2f** (Turnier-Etappe von 009 M2). T-24 läuft bis dahin mit einem festen Testsatz im Hook.
- **10er-Bonus im Turnier:** In M5 **zählt das Turnier nicht** und löst keinen Bonus aus (Abgrenzung zu 009 M2f, Zählung „jeder gebuchte Hallenslot“); T-27 prüft, dass ein gebuchtes Turnier den Zähler nicht verändert.
- **Spannung „direkt an die Halle“:** Der Vertrag sagt „Geld geht direkt an die Halle“; M5 hält das Geld als Verbindlichkeit bei Soccaz, die echte Auszahlung ist außerhalb (Connect, E3 bis E6). **FRAGE-PRODUKT 1b:** Genügt das für M5, oder ist „direkt an die Halle“ Bedingung?

### 3.6 Zusage der Halle: Schnittstelle und Einfrieren

- `hasVenueAccess` ist nicht auf main (011 M1 nur als Plan). Darum friert M5-1 **beim Fixieren des Preises** ein, ob die Halle einen Zugang hat (`tournaments.venue_access_required_snapshot`, boolean) und setzt `venue_confirmed_at` erst durch die Zusage; ein später eingerichteter oder entzogener Zugang ändert ein laufendes Turnier nicht (analog zur Provision).
- Schnittstelle: `hallZusageOk(tournament: { id: string; venueId: string | null; venueAccessRequiredSnapshot: boolean; venueConfirmedAt: Date | null }): boolean` in `src/server/payments/venue-confirm.ts`. Regel: `!venueAccessRequiredSnapshot || venueConfirmedAt !== null`. M5-1 liefert die Attrappe (Zugang nie nötig); nach 011 M1 wird nur die Quelle des Snapshots ausgetauscht (M5-7).
- **Test „Attrappe = Echtlogik“:** derselbe Testkatalog (Zugang nötig/nicht nötig, Zusage vorhanden/fehlt, Zusage gleichzeitig mit Absage) läuft gegen die Attrappe und, sobald 011 M1 da ist, unverändert gegen die Echtlogik; die Wahrheitstabelle ist ein Unit-Test.

## 4. Datenmodell (Option A, vollständig spezifiziert) [FRAGE-PLAN 1: bestätigt]

Option A: `tournament_id` neben `match_id`. B (eigene Tabellen) und C (Sammel-Spiel) sind verworfen.

### 4.1 Inventur: jede Tabelle mit `match_id` (Ergebnis von M5-0 wird gegen diese Liste geprüft, Grep-Beleg)

| Tabelle | `match_id` heute | `tournament_id` | Bemerkung |
|---|---|---|---|
| `payment_charges` | NOT NULL, cascade | **ja**, nullable, FK **NO ACTION** | 2a nullable zusätzlich; 2b `match_id` nullable + XOR-CHECK; UNIQUE `(tournament_id, user_id)` partiell (`WHERE tournament_id IS NOT NULL`) |
| `payment_charge_attempts` | keine (hängt an `charge_id`) | nein | erbt über die Zeile |
| `payment_refunds` | NOT NULL, cascade | **ja**, nullable, FK **NO ACTION** | `charge_id` ist cascade auf `payment_charges`: ein Löschen der Zeile würde Erstattungen mitnehmen; wie heute, Lösch-Pfade nur im Test-Cleanup (`tests/cleanup.ts` wird erweitert) |
| `payment_setup_intents` | nullable, cascade | **ja**, nullable, FK **NO ACTION** | Platz-Kontext beim Karten hinterlegen im Turnier; NO ACTION, weil Mandatsnachweis erhalten bleibt |
| `payment_disputes` | nullable, kein cascade | **ja**, nullable, FK **NO ACTION** | Zuordnung primär über `charge_id`/`payment_intent_id` |
| `payment_dispute_entries` | keine (an `dispute_row_id`) | nein | erbt |
| `slot_of`/`slot_team_id` (in `payment_charges`) | Nachrücker-Kette | nein | bleiben für Turnierzeilen `NULL`, CHECK `tournament_id IS NULL OR (slot_of IS NULL AND slot_team_id IS NULL)` + Test |
| `ledger_entries` | nullable | `tournament_id` **existiert** | Art `tournament_share`; FK existiert nur in der Migration; Prüfung in M5-0 |
| `receipts` | nullable | **ja**, nullable (M5-4), `kind = 'tournament'` | Beleg je Zahler über die Summe |
| `match_participants` | NOT NULL, cascade | nein | Teamspiel-Tabelle, unverändert |
| `match_events`, `match_results`, `reminders_sent` | NOT NULL | nein | Spielereignisse, Turnier-Spiele nutzen `matches` weiter |
| `booking_jobs`, `expenses`, `pending_refunds` | siehe Schema | nein | Wallet-/Spielaltlast, nicht angefasst (M6) |
| `tournament_matches.match_id` | nullable, set null | nein | Bracket-Spiele, unverändert |
| `tournament_players` | – | – | neue Spalten `covered_by_user_id`, `cover_mandate_text`, `cover_accepted_at`; `paid_*` bleiben (Altdaten), werden im neuen Pfad nicht geschrieben (Test: `paid_cents` bleibt 0) |

**FK ohne cascade:** Alle `tournament_id`-Fremdschlüssel auf den Zahlungstabellen sind `NO ACTION`. Ein Turnier mit Zahlungszeilen lässt sich nicht löschen (Zahlungsnachweise bleiben). Test: `delete from tournaments` mit Abbuchungszeile schlägt fehl; Test-Cleanup löscht erst die Zahlungstabellen.

### 4.2 Zeilenlebenszyklus (neu / erneut / storniert)

- Zeilen entstehen **erst in Phase A** der Abbuchung (nicht beim Beitritt, nicht beim Preis-Fix), eine je Spieler: `(tournament_id, user_id)` UNIQUE.
- **Vor der Abbuchung** (Beitritt, Austritt, Wiedereintritt, `reopenRosters`): keine Zeilen, daher kein Lebenszyklus-Problem. `price_round` zählt jede Preisfestlegung.
- **Nach Abbuchungsbeginn**: Kader gesperrt; Austritt/Beitritt/`reopenRosters` abgewiesen. Eine fehlgeschlagene Zeile wird über Nachzahlfenster (neuer Versuch derselben Zeile, `current_attempt`, Historie in `payment_charge_attempts`) wiederholt, nie neu angelegt.
- **Storniert** bei Absage: die Zeile bleibt (Zahlungsnachweis); bereits `succeeded` bekommt eine Erstattungszeile; nicht gesendete Zeilen werden mit `failure_code = 'tournament_cancelled'` terminal (ohne Versand). Die Wiederverwendung einer Zeile für einen späteren neuen Preis gibt es nicht.
- Damit genügt UNIQUE `(tournament_id, user_id)`; `price_round` steht im Schlüssel nur als Sicherheitsnetz.

### 4.3 Idempotenzschlüssel: zwei Formen sauber trennen

- Teamspiel (unverändert): `charge:<matchId>:<userId>…` (Bestand) und `charge:<PI>` im Ledger.
- Turnier: `charge:t:<tournamentId>:<userId>:<priceRound>:<attempt>`; Erstattung `refund:t:<tournamentId>:<userId>:<n>`.
- Trennung durch die Pflicht-Vorsilbe `t:` und den Test, dass **kein** Teamspiel-Schlüssel mit `charge:t:` beginnt (UUID-Muster) und umgekehrt.
- **Zuordnung**: Webhook, Dispute und Export ordnen über `payment_intent_id`/`charge_id` zu, nicht über den Schlüsseltext; die Form des Schlüssels wird nie geparst. Die Metadaten des PaymentIntents tragen `tournamentId` **statt** `matchId` (genau eines); die Metadaten-Prüfung bleibt streng (`metadata_mismatch`).
- Export und Dispute-Admin lesen `tournament_id` oder `match_id` und zeigen das passende Ziel (Spielseite oder Turnier-Lobby).
- **Test: Teamspiel-Schema unverändert**: bestehende Integrationstests laufen unverändert grün (Beleg der Etappe M5-2); zusätzlich ein Schema-Test, dass für jede Teamspiel-Zeile `tournament_id IS NULL` gilt und dass **kein Teamspiel-Pfad `tournament_id` schreibt**.

## 5. Migrationen (seriell, nie parallel zu anderen Tasks mit Schema-Annahmen)

**Absprache (Stand 8c26498):** w1 nimmt **0046** (M5-2a, erledigt auf `feat/m5-schema`); 009 M2 beginnt ab **0047**; alle weiteren M5-Migrationen nehmen die jeweils nächste freie Nummer. Nummern werden sonst **nicht fest vergeben**: Jede Etappe nimmt die nächste freie Nummer aus `drizzle/` auf **aktuellem** `origin/main` (und prüft offene Branches, z. B. `docs/009-m2-plan` für 0047 ff.); `db:generate` erzeugt die Nummer selbst, wir benennen sie nicht vor.

| Etappe | Inhalt (additiv) |
|---|---|
| M5-1 | `tournaments.venue_id` (FK `venues`, nullable), `venue_confirmed_at`, `venue_access_required_snapshot` (boolean), `commission_percent_snapshot` (Dezimal, nullable). **`settled_at` bleibt** und bedeutet im Kartenmodell „gebucht“ (kein `booked_at`) |
| **M5-2a (Migration 0046, Commit 69e4e1b auf `feat/m5-schema`)** | `payment_charges`/`payment_refunds`/`payment_setup_intents`/`payment_disputes`: `tournament_id` nullable (FK NO ACTION, in der Migration, weil `schema-league` aus `schema` importiert); **`match_id` bleibt NOT NULL**; partieller UNIQUE `(tournament_id, user_id)` |
| M5-2b | `match_id` nullable (wo NOT NULL) + XOR-CHECK `(match_id IS NULL) <> (tournament_id IS NULL)` (erst nach 2b, wenn alle Pfade den Kontext nutzen) |
| M5-3 | `tournament_players.covered_by_user_id`, `cover_mandate_text`, `cover_accepted_at` |
| M5-4 | Enum-Wert `tournament_share` (ledger_kind), `receipts.tournament_id` |

Regeln: Journal (`_journal.json`) und Snapshot lückenlos und nur die eigene Nummer gegenüber `main` (Beleg: `git diff --stat origin/main -- drizzle`); `db:generate` meldet nach jeder Etappe „No schema changes“; Migrationsprüfung (Skript für Journal/Snapshot-Lücken: Name in M5-0 klären, falls keines existiert, Grep/`ls`-Beleg) ; **Rollback-Hinweis** je Migration in `docs/BETRIEB.md` (additive Spalten bleiben bei Rollback der App ungenutzt; Enum-Werte lassen sich nicht löschen; XOR-CHECK vor App-Rollback nicht nötig zu entfernen, solange Teamspiel-Zeilen `tournament_id IS NULL` haben).
**Widerspruch geklärt:** `card_ready_at` wird **nicht** eingeführt und entfällt aus dem Plan (der Kartenstatus lebt in `payment_profiles`); kein `DROP`. `paid_*` bleiben bis M6.

## 6. Dateiliste (per Grep, M5-0 bestätigt sie)

`grep -rln "paidCents|paid_cents|debitWallet|tournament_entry|tournament_refund|tournament_payout|tournament_commission" src tests` ergibt (Stand 1f55a8a):
- **Server:** `src/server/tournaments.ts`, `wallet.ts`, `ledger.ts`, `finance.ts`, `lobby.ts`, `privategame.ts`, `board.ts`, `scheduled.ts`; **Schema:** `src/db/schema.ts`, `schema-finance.ts`, `schema-league.ts`; **UI:** `src/app/admin/finanzen/spiel/[id]/page.tsx`; **Tests:** `tests/integration/{card-charge,card-lobby,card-run,card-setup,card-stored,card-trigger,final,finance,ledger,privategame,tournament,wallet}.test.ts`, `tests/e2e/{board,karte-lobby,privatspiel}.spec.ts`, `tests/e2e/helpers-db.ts`.
- Zusätzlich (Fristen/Auslöser, nicht im Grep, aber betroffen): `src/lib/deadlines.ts`, `src/lib/grace.ts`, `src/server/payments/charge-trigger.ts`, `src/server/scheduled.ts` (Job), `src/server/jobs.ts`.

**Neu:** `src/server/payments/charge-context.ts` (Kontext `match | tournament`: Preis, Teilnehmer, Frist, Zusage, Bereit-Prüfung, Absageweg), `src/server/payments/tournament-charge.ts` (Turnier-Zweig, `settleTournamentIfComplete`), `src/server/payments/tournament-job.ts` (eigener Turnier-Job, Abschnitt 8), `src/lib/tournament-card.ts` (reine Funktionen), Tests (Abschnitt 10).
**Geändert:** `src/server/tournaments.ts`, `tournament-actions.ts`, die Zahlungsdateien (`charge-run`, `charge`, `charge-trigger`, `charge-retry`, `refund`, `authorize`, `card-setup`, `card-status`, `cover*`, `webhook`, `dispute*`, `erasure`) im Refactoring M5-2b, Schema und `drizzle/`, `src/app/turniere/[id]/*` und `src/app/turniere/neu/*`, `src/server/account.ts`, `docs/BETRIEB.md`, Verträge 005/008/012.
**Zusätzlich (v3):** `tests/cleanup.ts` (Zahlungszeilen eines Turniers vor dem Turnier löschen; in M5-2a ergänzt), `src/server/tournaments.ts` (**`lockTournament` exportieren**, M5-2b, damit der Zahlungskontext die Turniersperre nehmen kann), `src/server/payments/venue-confirm.ts` (neu, `hallZusageOk`), `src/server/payments/commission.ts` (neu, Hook `venueCommissionPercent`, Provisionsbuchung/-storno, nach S1).
**Entfällt im Turnierpfad:** `payEntry`, `payForTeam`, `settle`, `splitEntryFees`, `commissionPercent`-Nutzung (Einstellung bleibt bis M6).

## 7. Akzeptanzkriterien (gegen Vertrag 012 AC-1 bis AC-21)

Nummern **T-**; Vertrags-ACs in Klammern. Jede Zeile bekommt Testdatei und mindestens eine Mutation (Abschnitt 10).

| ID | Gegeben | Wenn | Dann | Vertrag |
|---|---|---|---|---|
| T-1 | Spieler im Turnier-Kader | Karte hinterlegt | `card_ready`, nichts abgebucht, kein Ledger-Eintrag, Mandat gespeichert | AC-1 |
| T-2 | Kein Zahlungsmittel | Captain drückt „Bereit“ | abgelehnt; erst bereit, wenn jeder Spieler Karte oder Übernehmer hat | AC-2 |
| T-3 | Kader ändert sich vor dem Fixieren | Beitritt/Austritt/Rauswurf | Anteil neu angezeigt, keine Geldbewegung | AC-3 |
| T-4 | Preis fix, alle Teams bereit, Zusage (falls Zugang), Vorlauf ≥ 48 h, Frist erreicht (Job auch doppelt/parallel) | Abbuchung | jeder Spieler genau einmal mit `final_share_cents` (min. 0,50 €), Hauptbuch ausgeglichen, `settled_at`, Bracket **genau einmal** | AC-4, AC-19 |
| T-5 | Vorlauf < 48 h | alle bereit (+ Zusage) | sofortige Abbuchung wie T-4 | AC-5 |
| T-6 | Abbuchung scheitert | `payment_failed` | Nachzahlfenster, Link; Sichtbarkeit nach Matrix (Abschnitt 13) | AC-6, AC-20 |
| T-7 | Fenster abgelaufen | Job | Z3 (Absage, Erstattungen sofort erzeugt) [ANNAHME] | AC-8, AC-9 |
| T-8 | Zusage fehlt | Frist erreicht | Z4, gegen die Attrappe `hallZusageOk` | Vertrag 011 |
| T-9 | Webhook doppelt/verspätet/Metadaten vertauscht; **offene 3-D-Secure-Zeile (`requires_action`) bei der Absage** | `payment_intent.succeeded` | einmal verbucht; Metadaten-Mismatch ignoriert; später Erfolg nach Absage wird **gebucht und sofort voll erstattet** (Admin-Alarm), nie stilles Behalten | AC-10 |
| T-10 | Streit zu einer Turnier-Abbuchung | `charge.dispute.*` | Zuordnung zum Turnier, `chargeback` je Balance-Transaction einmal, Markierung | AC-11 |
| T-11 | Spieler ohne Karte | Ampel und „Anteil übernehmen“ | nur im eigenen Team [ANNAHME]; Dritte sehen neutral | AC-12, AC-13 |
| T-12 | Übernahme, Absage | Erstattung | je Posten an den Übernehmer | AC-14 |
| T-13 | Turnier-Lobby/Texte | Anzeige | kein Guthaben, keine Aufladung, keine Veranstalter-Auszahlung; Texte nennen Karte; **kein Wallet-Konto und kein Konto `tournament` für den Veranstalter** | AC-15 |
| T-14a | Export | DSGVO | Turnier-Abbuchungen im Export (nur eigene, als Platz und als Zahler), keine Namen Dritter | AC-16 |
| T-14b | Löschung | DSGVO | **Sperre** bei laufender Abbuchung/Erstattung/Streit bzw. offenem Turnier mit Abbuchung; Buchungen bleiben anonymisiert. **FRAGE-PRODUKT 6:** Sperre oder Anonymisierung ohne Sperre (Platz bleibt, Name entfällt)? | AC-16 |
| T-15 | Turnier mit Abbuchungen | Absage | nach der ersten Abbuchung nur Rolle `owner` (**jetzt echt prüfbar**, `users.is_owner`); Admin 2 nur Vorschlag (009 AC-9); Auto-Absage ausgenommen; Veranstalter nur vorher | AC-21 |
| T-16 | Turnier beendet | `finishTournament` | keine Auszahlung, keine `tournament_commission`; Hauptbuch ausgeglichen | Vertrag |
| T-17 | Stripe-Testmodus | Testkarten | T-1 bis T-14 grün (manuell, Muster `tests/e2e-stripe/`) | AC-17 |
| T-18 | Altturnier mit Wallet-Zahlung (`paid_cents > 0`) | Karten-Modus an | **zurücksetzen statt migrieren** (Vertrag: kein `pay_model`-Flag): Hinweis in `docs/BETRIEB.md`. **Testziel:** (a) ein Turnier mit `paid_cents > 0` wird im Kartenmodell nicht fortgesetzt (Zahlungsphase abgewiesen, klare Meldung), (b) der Rücksetz-Pfad (Erstattung auf das Guthaben bzw. Löschen der Testdaten) lässt das Hauptbuch ausgeglichen, (c) kein Code im Turnierpfad fragt ein Zahlungsmodell ab (Grep-Beleg) | Vertrag |
| T-19 | Preis fix | Austritt/Beitritt | abgewiesen; `reopenRosters` nur ohne Abbuchungszeile, danach `price_round + 1`, Anteil neu, „Bereit“ zurückgesetzt | – |
| T-20 | Abbuchung läuft | `reopenRosters` | abgewiesen (Absage ist der Weg) | – |
| T-21 | Turnier ohne Spieler | Fixieren | nie fixiert, keine Division durch 0 | – |
| T-22 | Turnier ohne Hallenpreis | Fixieren | nicht fixierbar, klare Meldung | – |
| T-23 | Zusage gleichzeitig mit Absage | parallele Aufrufe | genau ein Ausgang, kein Bracket nach Absage, keine Abbuchung nach Absage | – |
| T-24 | Provision | Fixieren, dann Satzänderung | Snapshot gilt, Summe einmal gerundet; Admin 2 kann Satz nicht ändern (**echt prüfbar**, 009 M1); bis 009 M2f mit festem Testsatz im Hook | 009 |
| T-25 | Turnier gebucht (Z1) | Hauptbuch | Summe (`commission` + Rest an der Halle) = Summe der Abbuchungen, ausgeglichen, **keine Doppelzählung**; `tournament_share` nicht als Ertrag | 009 M2 |
| T-26 | Provision gebucht, dann Absage (Z3/Z5) | Absage | Erstattung und Provisions-Storno im selben Schritt; zweites Storno bucht nichts; Schlüssel `commission:t:…`/`commission-reversal:t:…` | 009 M2 |
| T-27 | Turnier gebucht | 10er-Zähler der Halle | Zähler unverändert (Turnier zählt in M5 nicht; 009 M2f entscheidet später) | 009 M2 |

## 8. Lock-Reihenfolge, Webhook, Turnier-Job

Bestehend: Spiel → Abbuchungszeile → `payment_refunds` → Nutzer; Streit zuletzt.
Turnier: **Turnier (`lockTournament`, FOR UPDATE) → Abbuchungszeilen des Turniers (nach `user_id` sortiert, SKIP LOCKED in Batches) → `payment_refunds` → Nutzer (`payment_profiles`) → Streit.** Stripe-Aufrufe laufen außerhalb der Transaktion mit Lease (Phase B/C).

**Webhook-Reihenfolge (Deadlock-Risiko):** Der Webhook kennt zuerst nur die Zahlungs-ID. Ablauf: (1) Zeile **ohne Sperre** über `payment_intent_id` lesen (nur `id`, `tournament_id`/`match_id`); (2) den Kontext sperren (Turnier bzw. Spiel); (3) Zeile **erneut sperren und prüfen** (Status, Zahlungs-ID, Metadaten noch gleich; sonst ignorieren/wiederholen). Nie Zeile → Kontext. Test: `webhook-lockorder` mit NOWAIT-Positionen (kein zeitabhängiger Deadlock-Test).

**Eigener Turnier-Job** (Empfehlung 5): `tournament-job.ts` führt die Abbuchung aus (bis 192 Zeilen in Batches, Lease, Wiederaufnahme); der 5-Minuten-Job (`scheduled.ts`) ist nur der **Auslöser** (prüft Frist, Zusage, startet den Lauf). Doppelter Aufruf ist harmlos (SKIP LOCKED, `settled_at IS NULL`).

## 9. Idempotenz

- Abbuchung: Schlüssel Abschnitt 4.3, Stripe-Idempotency-Key identisch; UNIQUE `(tournament_id, user_id)`; SKIP LOCKED + Lease.
- `settled_at` nur einmal (`UPDATE … WHERE settled_at IS NULL`); Bracket über `bracket_generated_at IS NULL` genau einmal, auch bei parallelem Aufruf (Test).
- Erstattung: eine `payment_refunds`-Zeile je Abbuchung (`ensureRefundRow`); doppelte Absage erzeugt nichts Zweites (Status-Prüfung).
- Webhook: `stripe_events`; späte/doppelte Erfolge → Erstattung wie im Teamspiel.
- Zusage: `venue_confirmed_at` nur einmal setzen; Zusage und Absage laufen unter der Turniersperre (T-23).

## 10. Tests und Mutationen

Test-first. Integration gegen die Worker-DB, Stripe-Attrappe, Muster `card-*.test.ts`.

| Datei | deckt |
|---|---|
| `tests/unit/tournament-card.test.ts` | Anteil (aufgerundet, Summe deckt Miete, min. 0,50 €), Frist/Zeitleiste, Bereit-Prüfung, Provisionsrundung, Ampel-Sichtbarkeit pro Rolle |
| `tests/integration/tournament-card-setup.test.ts` | T-1 bis T-3, T-19 bis T-22 |
| `tests/integration/tournament-card-charge.test.ts` | T-4, T-5, T-9, Doppel-/Parallellauf, 32 Teams, Bracket genau einmal |
| `tests/integration/tournament-card-grace.test.ts` | T-6, T-7, Zustandstabelle Z1 bis Z6 |
| `tests/integration/tournament-card-venue.test.ts` | T-8, T-23 (Attrappe `hallZusageOk`, Zusage gleichzeitig mit Absage) |
| `tests/integration/tournament-card-cancel.test.ts` | Absage, Erstattung je Posten (auch nicht nur `charged`), T-12, T-15 |
| `tests/integration/tournament-card-dispute.test.ts` | T-10 |
| `tests/integration/tournament-card-cover.test.ts` | T-11 (nur im Team) |
| `tests/integration/tournament-card-lockorder.test.ts` | Sperrreihenfolge, **Webhook-Lockorder** |
| `tests/integration/tournament-card-schema.test.ts` | FK NO ACTION (Turnier mit Zeile nicht löschbar), XOR-CHECK, kein Teamspiel-Pfad schreibt `tournament_id`, Schlüsselformen getrennt, `paid_cents` bleibt 0 |
| `tests/integration/tournament-card-visibility.test.ts` | Sichtbarkeitsmatrix: HTML, RSC-Payload und Live-Kanal (SSE) |
| `tests/integration/tournament-card-wallet.test.ts` | kein Wallet-Konto und kein Konto `tournament` für Veranstalter, keine `tournament_payout`-Buchung |
| `tests/integration/account.test.ts` (ergänzt) | T-14a/b |
| `tests/e2e-stripe/tournament.spec.ts` | T-17, manuell |
| `tests/e2e/turnier-*.spec.ts` (angepasst) | T-13, nur betroffene Specs lokal (`--workers=2`) |

**Mutationen (ROT = gut):** Schlüssel ohne `priceRound`; Abbuchung ohne Zusage-Prüfung; Bracket vor „gebucht“; Beanspruchung ohne SKIP LOCKED; Lease ignoriert; Anteil abgerundet; Mindestbetrag entfernt; Erstattung an den Spieler statt Übernehmer; `settled_at` doppelt; Veranstalter-Auszahlung noch gebucht; **Division durch geplante statt tatsächliche Spielerzahl**; **Anteil nach dem Fixieren neu berechnet**; **Absage-Erstattung nur für `charged`/erste Zeilen**; **Webhook ohne Signatur**; **Webhook ohne Metadaten-Prüfung (vertauschte Metadaten)**; **Provision doppelt oder nie**; **Provision aus aktuellem statt eingefrorenem Satz**; **Beitritt nach Fixieren erlaubt**; **Admin 2 ändert Provision**; **Turnier ohne Hallenpreis fixierbar**; Sichtbarkeit „fehlgeschlagen“ für Dritte; Sperrreihenfolge vertauscht (Zeile vor Kontext); Erstattung der strittigen Zahlung; Löschung trotz laufender Abbuchung; `substitute*` für Turnier aufgerufen. Gleichwertige Mutanten werden dokumentiert verworfen.

**Maschinelle Checks für M5-0 und M5-6 (kein Test nötig, aber Beleg):** `npm run typecheck`; Grep-Beleg `grep -rn "debitWallet" src/server/tournaments.ts` ohne Treffer im Turnierpfad (M5-6); Grep-Beleg der Inventur (Abschnitt 4.1) vollständig (M5-0: jede `match_id`-Zeile des Schemas steht in der Tabelle).

## 11. Beleg-Befehle (je Etappe, mit Zeitlimit, nie parallel in mehreren Worktrees)

```
npm run typecheck
npm run lint
npm test
timeout 590 npm run test:integration          # Worker-DB soccaz_w1, Vordergrund, Ausgabe in Datei
npm run db:generate                            # "No schema changes"; git diff --stat origin/main -- drizzle zeigt nur die eigene Migration
npx playwright test <betroffene Specs> --workers=2   # nur lokal bei UI-Änderung, den vollen Lauf macht die CI
npm run test:e2e:stripe                        # nur manuell, Testschlüssel, nie in der CI
```
Belege im DONE: Befehl + Ergebnis (Dateien/Tests), rote Tests mit Namen, Hashes, Mutationsliste. Vor jedem Integrationslauf: Worker-DB prüfen (keine Waisen-Sitzungen, kein Altbestand an `@test.local`-Nutzern).

## 12. Etappen, Vorbedingungen, Startbedingungen (hart)

Jede Etappe ein PR mit eigener Migration (seriell), `security-reviewer` bei Geld/Webhook/Datenschutz/Migration, Code-Review durch einen anderen Worker.

| Etappe | Inhalt | Migration | Art |
|---|---|---|---|
| **M5-0** | Inventur (Doku, Abschnitt 4.1 gegen Grep belegen), Kontext-Schnittstelle, Check-Skript-Frage | keine | Doku |
| **M5-1** | Halle am Turnier (`venue_id`, Wahl in der Anlage), **Zusage-Schnittstelle `hallZusageOk(tournament)` mit Attrappe**, Provisions-Snapshot (Satz 0 bis 009 M1), T-8 gegen die Attrappe | ja | Migration |
| **M5-2a** | Schema additiv: `tournament_id` nullable (NO ACTION), `match_id` bleibt NOT NULL | ja | Migration, security |
| **M5-2b** | Kontext-Helfer/Typen im Zahlungsmodul (rund 330 Stellen), **ohne Verhaltensänderung**; danach XOR-CHECK und `match_id` nullable; Test: kein Teamspiel-Pfad schreibt `tournament_id`; **Beleg: alle bestehenden Integrationstests unverändert grün** | ja (CHECK) | Geld, security |
| **M5-3** | Karte/Ampel/„Bereit“ im Turnier, Übernahme im Team, Wallet-Pfade aus dem Turnierpfad, Sichtbarkeit | ja | Geld, UI |
| **M5-4** | Eigener Turnier-Job: Abbuchung zur Frist, „gebucht“, Bracket, `tournament_share`, Belege | ja | Geld/Job, security |
| **M5-5** | Teilausfälle (Z2 bis Z6), Absage/Erstattung, Dispute, DSGVO | keine | Geld/Datenschutz, security |
| **M5-6** | Texte/Oberfläche (`begriffe.md`), `settle` und Auszahlung entfernen, Verträge/Doku, Altturniere zurücksetzen, E2E Stripe | keine | UI, Doku |
| **M5-7 (später)** | Echte Zusage nach 011 M1 anbinden (`hallZusageOk` real), T-8 gegen die Echtlogik | ggf. | Anbindung |

**Startbedingungen:**
1. M4 (a bis d) gemergt.
2. **Zusage:** M5-1 liefert nur die Schnittstelle mit Attrappe; die echte Anbindung ist eigene Etappe nach 011 M1 (M5-7). Bis dahin gelten alle Hallen als ohne Zugang (keine Zusage nötig).
3. **Provision:** 009 M1 ist gemergt; M5-1 bleibt bei **Satz 0** und Snapshot-Spalte, die Kopplung an den echten Satz ist 009 M2f (`venues.commission_percent` kommt erst mit 009 M2a); T-24 mit festem Testsatz im Hook.
4. **T-15 `owner`:** jetzt echt prüfbar (009 M1 gemergt). **Buchungsschnitt:** M5-4 wartet auf S1 (Abschnitt 3.5).
5. `card_payments_enabled` bleibt in Produktion AUS bis M3, M4 und M5 deployt sind.
6. Migrationen nie parallel zu anderen Schema-Tasks; höchstens 2 Writer + 1 Reviewer.

## 13. Datenschutz und Sicherheit

- Gespeichert werden nur Stripe-IDs, Marke/letzte vier Ziffern, Mandatstext/-zeit, Beträge, Status; nie PAN/CVC. M5 ergänzt nur die Zuordnung (`tournament_id`).
- **Entscheid für die Matrix (v3):** Der Betreiber der Halle sieht keine Karten-Fehler einzelner Spieler (nur Summen); Admin 2 sieht Fehlergrund und Betrag nur in der Support-Sicht.
- **Veranstalter ohne Geldrechte** (AC-20 gilt auch im Turnier): Der Veranstalter sieht keine Karten-, Fehler- oder Betragsdetails einzelner Spieler. Er sieht je Team nur den Zustand „komplett/unvollständig“ und Gesamtzahlen. „Abbuchung fehlgeschlagen“ sehen **nur der Betroffene und der Captain des eigenen Teams**. (Das ersetzt die Aussage aus v1 und löst den Widerspruch T-6 gegen v1-Abschnitt 13.)

**Sichtbarkeitsmatrix (Soll):**

| Betrachter | Ampel eigene | Ampel Team-Kollege | Fehlergrund (z. B. abgelehnt) | Betrag/Anteil | Andere Teams |
|---|---|---|---|---|---|
| Spieler selbst | ja (grün/rot) | ja (nur Ampel, neutral „Zahlung ausstehend“) | **ja** für sich | eigener Anteil, Summe der Übernahmen | nur Anzahl bereiter Teams |
| Captain eigenes Team | ja | ja | **ja** für sein Team („Abbuchung fehlgeschlagen“) | Anteil des Teams | nein |
| Veranstalter | nein | nein | **nein** | Gesamtzahlen, Anteil je Spieler (öffentlich) | je Team „komplett/unvollständig“ |
| Spieler anderes Team | nein | nein | nein | öffentlicher Anteil | nur „bereit/nicht bereit“ je Team |
| Gast (nicht angemeldet) | nein | nein | nein | öffentlicher Anteil, Teamzahl | nur öffentliche Angaben |
| Admin 1 (`owner`) | ja | ja | ja | alle | alle |
| Admin 2 | ja (Support-Sicht) | ja | **ja, nur in der Support-Sicht** (zum Beraten und Vorschlagen, keine Aktionen am Geld) | alle | alle |
| Betreiber der Halle (011) | nein | nein | **nein** (Entscheid, kann der Nutzer ändern) | nur die Gesamtsumme der Abbuchungen des Turniers (für die Rechnung), nie je Spieler | nein |

Tests: HTML, RSC-Payload und Live-Kanal (SSE) je Rolle (`tournament-card-visibility.test.ts`), dazu ein Test, dass Fehlergründe nie im Payload anderer Rollen stehen. Übernommene Anteile erscheinen für Dritte neutral als „gedeckt“.
- **Export/Löschung:** T-14a/b; Löschtexte nach M4b (sachlich, einfache Wörter). Dispute nach Löschung wie M4 (FRAGE-RECHT).
- **Webhook:** Signatur geprüft, Zuordnung nur über Zahlungs-ID, Metadaten nur als Gegenprüfung. Keine Schlüssel in Logs/Tests/Docs; E2E nur Testschlüssel.
- **Rechtliches** beantwortet dieser Plan nicht (FRAGE-RECHT unten).

## 14. Risiken

1. Refactoring Zahlungsmodul (rund 330 Stellen): Regression im Teamspiel. Gegenmittel: M5-2a/2b getrennt, bestehende Tests unverändert grün, Mutationen auf den Kontext-Helfer.
2. Bis zu 192 Abbuchungen: Dauer, Ratelimit, Lease. Gegenmittel: eigener Turnier-Job mit Batches.
3. Alles-oder-nichts bei vielen Teams: ein Fehlschlag bedroht das ganze Turnier (Z3).
4. Bracket erst nach Abbuchung: später sichtbar als heute (FRAGE-PRODUKT 4).
5. Frist-Logik (12 h Karenz, Altturniere) kollidiert mit Abbuchungsfrist und Fenster; Zusammenführung über `deadlines.ts`/`grace.ts`, Zeitleiste 3.2 als Testgrundlage.
6. Zusage der Halle hängt an 011 M1 (nicht auf main): Attrappe und eingefrorener Zugangs-Snapshot begrenzen das Risiko. Provision hängt an 009 M2 (nur Plan): Satz 0 im Hook. T-15 und T-24 sind seit 009 M1 echt prüfbar. **Buchungsschnitt S1 offen:** Doppelzählungsrisiko, bis entschieden.
7. Spannung „direkt an die Halle“ (Vertrag) gegen „alles bei Soccaz“ (M5): FRAGE-PRODUKT 1.
8. Stripe-Gebühr bei Erstattung bleibt hängen: viele Erstattungen bei Absage, Gebühr trägt Soccaz; Alarm in der Finanzübersicht.
9. Migrationsnummern: 0044/0045 sind auf main; w1 hat 0046 (M5-2a), 009 M2 beginnt ab 0047; Kollision bleibt möglich, Nummer erst bei der Etappe aus `main` nehmen und `db:generate` erzeugen lassen.

## 15. Fragen (nur Fragen, keine Entscheidungen)

> **Beantwortet:** Die Produktfragen unten (S1, 1b, 2 bis 4, 6 bis 9) sind von t9 entschieden, siehe Abschnitt 16. Der Wortlaut bleibt als Verlauf stehen; maßgeblich ist Abschnitt 16.

**FRAGE-PRODUKT**
1. **S1 (Buchungsschnitt, Vertrag 009):** Variante A (Verbindlichkeit Halle, nur Provision ist Ertrag) entscheiden, oder M5-4 bis zum Entscheid zurückstellen? [ANNAHME: Variante A, M5-4 wartet]
1b. Genügt es in M5, dass das Geld als Verbindlichkeit bei Soccaz liegt und der Hallenanteil nur buchhalterisch geführt wird (Vertrag: „direkt an die Halle“), oder ist Stripe Connect Bedingung? [ANNAHME: Buchhaltung]
2. Zusage der Halle: M5 mit Attrappe starten und echte Anbindung nach 011 M1 (M5-7)? [ANNAHME: ja]
3. Fehlschlag einer Abbuchung nach Ablauf des Fensters: Turnier komplett absagen, Team ausschließen oder Veranstalter entscheidet? [ANNAHME: Absage]
4. Darf das Bracket schon vor der Abbuchung als „vorläufig“ sichtbar sein, oder erst nach „gebucht“ (Vertrag)?
5. *(gestrichen: Altturniere werden zurückgesetzt, Vertrag; kein Doppelmodell)*
6. Löschung eines Kontos bei offenem Turnier mit Abbuchung: Sperre (wie im Teamspiel) oder Anonymisierung ohne Sperre?
7. Turnier ohne Partnerhalle (Freitext): erlaubt (ohne Provision/Zusage) oder Pflicht zur Partnerhalle?
8. „Anteil übernehmen“ nur im eigenen Team oder turnierweit? [ANNAHME: eigenes Team]
9. Mindestbetrag 0,50 € und Rundungsüberschuss im Turnier wie im Teamspiel?

**FRAGE-PLAN (Reviewer)** — Empfehlungen aus dem Review sind übernommen:
1. Datenmodell **A mit Ergänzungen** (bestätigt).
2. Kontext-Helfer als Funktion (nicht Strategie-Objekt), eine Stelle mit Fallunterscheidung.
3. `settled_at` am Turnier: **entschieden: behalten** (bedeutet im Kartenmodell „gebucht“), `booked_at` entfällt, damit es keine zwei überlappenden Spalten gibt.
4. Ledger-Art **`tournament_share`** (additive Enum-Migration), nicht `match_share` — übernommen.
5. **Eigener Turnier-Job** für die Abbuchung; der 5-Minuten-Job nur als Auslöser — übernommen.

**FRAGE-RECHT** (beantwortet kein Agent)
1. Erlaubnis für den Geldfluss Spieler → Stripe → Halle (E3 bis E6).
2. Vertragsbeziehung Spieler–Halle/Veranstalter, AGB, Widerruf bei Turnier.
3. Preisgelder aus Einsätzen (Glücksspielrecht), falls später gewünscht.
4. Aufbewahrung der Belege und Mandatsnachweise für Turnier-Abbuchungen.
5. Steuerliche Behandlung der Provision und der Erstattungsgebühren.

## 16. Entscheide t9 zu 012 M5 (Stand 2026-11-12, maßgeblich vor Abschnitt 15)

| Frage | Entscheid | Folge im Plan |
|---|---|---|
| **S1** Buchungsschnitt | **Variante A**: Verbindlichkeit Halle (`venue_payable`), nur die Provision ist Ertrag | **M5-4 ist freigegeben, nach 009 M2** (Abschnitt 3.5, Startbedingung 4) |
| **1b** Hallenanteil | **Buchhaltung genügt**; Stripe Connect später | kein Connect in M5 |
| **2** Zusage der Halle | **Attrappe** für die Zusage, **echte Anbindung nach 011 M1** (M5-7) | Abschnitt 3.6 und 12 unverändert |
| **3** Fehlschlag nach Ablauf des Fensters | **Absage, Alles-oder-nichts** (Turnier komplett abgesagt, alle erstattet) | Zustände Z2 bis Z6 enden in der Absage; kein Ausschluss einzelner Teams |
| **4** Bracket | **erst nach „gebucht“**, nicht vorläufig | kein Bracket vor `settled_at` |
| **6** Konto-Löschung bei offenem Turnier mit Abbuchung | **Löschsperre wie im Teamspiel** | `deleteAccount` blockiert; Pflichten siehe unten |
| **7** Partnerhalle | **Pflicht**: ein Turnier braucht eine Partnerhalle (`venue_id`) | **Z7 „ohne Partnerhalle“ entfällt** (Abschnitt 3.1); Anlage ohne Halle nicht möglich; die Provisionsregel „Z7: 0“ gilt nicht mehr |
| **8** „Anteil übernehmen“ | **nur im eigenen Team** | wie Annahme |
| **9** Mindestbetrag und Rundung | **0,50 € Mindestbetrag, Rundung wie im Teamspiel** | wie Annahme |

**Sichtbarkeit (Entscheid):** Das Aggregat „Karten komplett / unvollständig“ sehen nur **Mitglieder dieses Teams, der Captain, der Veranstalter und Plattform-Admins** (`isPlatformAdmin`); keine anderen Teams, keine Gäste, keine Halle. Einzelne Zahlungsstände (wer hat bezahlt) bleiben wie im Teamspiel nur den Betroffenen und dem Captain.

**Reihenfolge und Schalter:** **M5-3 darf vor der Impeccable-Prüfung der Turnierseiten gemergt werden**, weil der Schalter (`card_payments_enabled`) AUS bleibt (Status Degradiert, nicht Fertig). Die Impeccable-Pflicht (013 M5, AC-15) steht als **Backlog 114** und ist Bedingung für das Einschalten und den Pilot Turnier.

**Migrationsnummern:** 0046 und 0047 sind gemergt (#132); 009 M2 nimmt 0048, 011 M1 0049; **0050 = M5-1**, **0051 = M5-3**. Die Nummer wird erst beim Merge endgültig (nie parallel zu anderen Schema-Tasks, Abschnitt 5).

**Pflichten aus den Reviews (Backlog 117 bis 123, Einzelheiten dort):** `ensureRefundRow` mit `scopeOf` (117); Webhook: `scopeOf`-Zweige und Alarm bei unbekanntem Bereich (118); `finance.ts` Alarmliste: Link bei `matchId = null` (119); `deleteAccount`: `lockTournament`, offene Turnierzahlungen, `covered_by_user_id` aufräumen (120); `validCoversOf` bei der Abbuchung (121); Indizes (122); Seeds und `tests/cleanup.ts` löschen Zahlungszeilen zuerst (123). Sie gehören in M5-4 und M5-5 und sind dort Abnahmebedingung.

**Nachtrag M5-1 (Reviews R-T207b):** (a) `hallZusageOk` hat die Signatur `{ venueAccessRequiredSnapshot: boolean | null; venueConfirmedAt: Date | null }` (null = noch nicht fixiert = keine Zusage verlangt, **fail-open nur mit der Attrappe**); mit der Echtlogik (M5-7) ist NULL im Kartenmodell in der Zahlungsphase ein **Fehler (fail-closed)** (G24-012). (b) Die Sackgasse „Turnier ohne Halle bei Schalter AUS angelegt, später AN“ ist mit einer Auswahl auf der Turnierseite (nur Veranstalter, Kader offen, `TournamentVenuePick`) behoben. (c) Das Formular verlangt die Halle serverkonform (nur bei Gesamtbetrag > 0), nicht per `required`. (d) Offen für M5-7: `maybeFixPrice` prüft vor `freezeVenueTerms` nicht erneut, dass die Halle aktiv und Partner ist; `setTournamentVenueAction` prüft Schalter/Kartenmodell nicht (wirkungslos).

**Nachtrag M5-4a (Reviews R-T214 und Security):** (a) **Provisionsbasis = Hallenmiete (Entscheid P6, gilt auch im Turnier):** Bemessung ist `total_cents` (Hallenkosten), nicht die Summe der Abbuchungen; der Verweis auf A2 in 3.5 ist damit auf „Hallenmiete (P6)“ gezogen. Test: 12,5 % von 160 EUR = 20 EUR (`tournament-charge.test.ts`). (b) **Migrationsnummern beim Push:** 0050 M5-1, 0051 M5-3, 0052 009 M3a, 0053 M5-4; `when` in `_journal.json` muss in der Nummernreihenfolge streng aufsteigend sein, sonst überspringt der Migrator eingeschobene; M3a vor M5-4 mergen, danach main mergen (migrate-check, feste Marke aus M3a). (c) `tournament_closed` ist kein Kartenproblem (`NON_CARD_CODES`, Ausnahme bei `legacyFailed` und `tournamentChargeStuck`). (d) **[ANNAHME, M5-5 sicherstellen]:** Ein Turnier ohne Abbuchungszeilen kann in „payment“ hängen (alle Teams bereit, Zusage da, aber `cards_missing`, z. B. Karte nach „Bereit“ entfernt): `chargeUnderway` verhindert die Frist-Absage, es gibt keinen Alarm. M5-5 entscheidet: Absage bei `cards_missing` nach der Frist oder Alarm. (e) **M5-5 vermerken:** Der Absagetext „… Dein Eintritt wurde vollständig erstattet“ ist im Kartenmodell falsch, solange nichts abgebucht wurde; die Texte der Absage und Erstattung folgen dem Kartenmodell (nur bei erfolgter Abbuchung „auf deine Karte erstattet“). (f) Offen für M5-5: Wiederholen im Nachzahlfenster, Absage bei Fensterablauf und Versand der Turnier-Erstattungen (bis dahin Alarme `card:tournament-charge-stuck` und `card:tournament-refund-open`), Kontolöschung (`lockTournament`, `covered_by_user_id`), 3-D-Secure-Freigabe für Turnierzeilen.

**Nachtrag M5-4a (2), Delta-Review R-T216:** (g) **Schalter AUS bei offenem Turnier:** Die Zeilen bleiben `pending`, es wird nichts gesendet; `tournament_closed` (terminal) gibt es nur, wenn das Turnier selbst nicht mehr offen ist (abgesagt, gestartet, gebucht, anderer Status). Wird der Schalter wieder EIN geschaltet, bucht der nächste Lauf nach. (h) **Zweite stille Hängelage:** Alarm `card:tournament-waits-for-cards` (Zahlungsphase, alle Teams bereit, Frist erreicht, keine Abbuchungszeilen; nur im Kartenmodell). Absage bei `cards_missing` nach der Frist bleibt offene Entscheidung für M5-5.

**Nachtrag M5-4a (3), R-T217:** (i) **Notabschaltung:** `sendCharge` liest den Schalter unmittelbar VOR dem Netzaufruf; eine beanspruchte Zeile bleibt `pending`, die Beanspruchung wird zurückgenommen. Restfenster (Millisekunden zwischen Select und Aufruf) steht in BETRIEB. (j) Wird `tournamentCardMode` aus einem anderen Grund falsch (Geld im Turnier, `paid_cents > 0`), bleiben vorhandene Kartenzeilen still `pending` (Guthabenturnier läuft im alten Modell weiter). (k) Der Alarm „Turnier wartet auf Karten“ nutzt Start minus 48 h statt `dueWithGrace` (kann kurz vor der echten Fälligkeit anschlagen) und wartet 10 Minuten nach dem letzten „Bereit“ (Kurzvorlauf).


## 17. Nachtrag M5-5 (Plan, Stand 2026-11-22; nur Doku, keine Entscheidung durch den Plan)
Quellen: dieser Plan mit den Nachträgen M5-1, M5-4a (1d0a0b9, d398098, 5e94615) und Abschnitt 16, Review-Funde R-T214, R-T216, R-T217, Backlog 117 bis 123, Code-Stand worker-1 `feat/m5-5` **56f22c0** (ZWISCHENSTAND, lauffähig, unvollständig; hier **nur gelesen**). Markierungen wie oben. Dieser Abschnitt ersetzt nichts in 3.1/12, er macht M5-5 baubar.

### 17.1 Stand des Codes und was fehlt
- **Vorhanden (56f22c0):** `prepareCardCancel` (`payments/tournament-cancel.ts`): je erfolgreicher Abbuchung eine Erstattungszeile über `ensureRefundRow` (Schlüssel `refund:<Zeile>`, an den **Zahler**), nie gesendete offene Zeilen enden mit `tournament_cancelled`, bereits gesendete offene Zeilen werden `unknown_outcome` markiert (kein Aufruf, Alarm), Provisions-Storno `commission-reversal:t:<Turnier>` über `reverseEntry`; `cancelTournamentTx` ruft das im Kartenmodell statt `refundPlayer`; Absage nach der ersten Abbuchung nur durch Admin 1 (`isOwner`), der Job ist ausgenommen; Absagetext je Kartenmodell (nichts abgebucht / auf die Karte erstattet); `chargeUnderway` fällt zur Frist **ohne vollständige Karten** in die Absage statt zu hängen (`tournamentAllCardsReady`); `tournament_cancelled` ist kein Kartenproblem (`NON_CARD_CODES`) und kein Alarm.
- **Fehlt (Plan unten):** (a) **Versand** der Turnier-Erstattungen: `runRefunds`/`sendPendingRefunds` laufen heute **über `matches`** (`refund.ts`: `join matches m on m.id = r.match_id`); Erstattungszeilen mit `match_id` leer (Turnier) werden **nie gesendet**. (b) **Absage bei Fensterablauf** (Z3) als Job-Pfad. (c) **Wiederholen/neue Karte** im Nachzahlfenster für Turnierzeilen. (d) **3-D-Secure** für Turnierzeilen. (e) DSGVO: Löschsperre, `covered_by`, offene Turnierzahlungen. (f) Texte und Oberfläche der Absage im Kartenmodell. (g) Zahlungsstreit-Sicht und Alarmlisten für Turnierzeilen (Link statt Spiel, Backlog 119).

### 17.2 Absage bei Fensterablauf (Z3) und bei fehlenden Karten
- **Auslöser:** der Turnier-Job (nicht der Mensch) in **einer** Transaktion unter der Turniersperre: Zahlungsphase, Abbuchung angelaufen, mindestens eine Zeile ist nach `effectiveGraceEnd` **nicht** `succeeded` (und kein Zahlungsstreit/`resolution`, der sie erledigt). Das Ende rechnet **eine** Funktion (`effectiveGraceEnd`, `src/lib/grace.ts`), dieselbe wie die Anzeige „Frist bis …“; Test: Anzeige und Entscheidung nennen dieselbe Zeit.
- **Reihenfolge in der Transaktion:** Turnier sperren → alle Abbuchungszeilen `FOR UPDATE` (nach Nutzer sortiert, wie `prepareCardCancel`) → Erstattungszeilen + Beenden nie gesendeter Zeilen + `unknown_outcome` für gesendete, offene Zeilen + Provisions-Storno → Turnier `cancelled` → Benachrichtigungen. **Kein Netzaufruf** in dieser Transaktion (Stripe nur im Versandlauf, 17.4). Idempotent: zweiter Lauf findet `cancelled` und tut nichts (Test, auch parallel).
- **Alles-oder-nichts (Entscheid 3):** keine Einzelausschlüsse; Erstattung **jeder** erfolgreichen Zeile, auch der anderer Teams. Strittige Zeilen (Z6, `chargeback`) werden **nicht** erstattet (AC-11); alle anderen schon.
- **Fehlende Karten zur Frist (R-T216 h, R-T214 d):** Ist die Abbuchung noch **nicht** angelaufen (keine Zeilen) und `tournamentAllCardsReady` ist falsch, wird zur Frist (mit der bestehenden Karenz) **abgesagt** („nichts abgebucht“), nicht gehangen; der Alarm „Turnier wartet auf Karten“ bleibt als Vorwarnung **vor** der Frist. [Entspricht dem Code 56f22c0; **FRAGE-PRODUKT Q1** zur Bestätigung.]
- **Schalter AUS bei offenem Turnier (R-T216 g):** Zeilen bleiben `pending`, nichts wird gesendet; läuft das Fenster oder die Frist dabei ab, wird **nicht** abgesagt, solange der Schalter AUS ist (sonst würden Spieler wegen einer Plattformabschaltung bestraft). **FRAGE-PRODUKT Q2:** Wie lange darf ein Turnier so „eingefroren“ bleiben, bevor Admin 1 entscheidet; Alarm nach X Stunden?
- **Absage durch Menschen (Z5/AC-21):** nach der ersten Abbuchungszeile nur Admin 1; **Admin 2 kann nur vorschlagen** (Vorschlagsweg 009 AC-9, auch für Turniere; im Code 56f22c0 nicht geprüft, **Test nötig**: Admin 2 ruft die Absage auf → abgelehnt, Vorschlag gespeichert, keine Erstattung). Der Veranstalter sagt nur **vor** der ersten Abbuchungszeile ab (Rückfall auf das alte Modell nur ohne Zeilen).

### 17.3 Erstattungen aller Turnierzeilen und Provisions-Storno
- **Umfang:** je `succeeded`-Zeile **eine** volle Erstattung (Betrag der Abbuchung, an den **Zahler**; bei Übernahme erstattet der Zahler, nicht der Gedeckte); Schlüssel `refund:<chargeId>` (genau einmal, `ensureRefundRow` mit `scopeOf`, Backlog 117, Test). Gebühren des Zahlungsanbieters trägt nicht der Spieler (Vertrag 012). **FRAGE-RECHT R-M5-5-1:** Erstattung der Stripe-Gebühr im Kartenmodell und Behandlung in der Buchhaltung (Steuer).
- **Provisions-Storno:** `commission-reversal:t:<Turnier>` genau einmal im selben Schritt (`reverseTournamentCommission`); nur wenn `commission:t:<Turnier>` existiert (vor `settled_at` gibt es keine Provision); Hauptbuch **ausgeglichen** nach der Absage: Test summiert alle Buchungen mit `tournament_id` zu 0 (Abbuchung, Verbindlichkeit Halle `venue_payable`, Provision, Storno, Erstattung). **FRAGE-PLAN PL-M5-1:** Wie wird die Verbindlichkeit Halle (`venue_payable`, Variante A) bei der **Erstattung** zurückgebucht (Zweig in `applyRefundInTx` für Turniere statt `matchId`)? Der Code dazu ist in 56f22c0 nicht gelesen; wird nur die Provision storniert, bleibt `venue_payable` stehen: **der Test muss das fangen**.
- **Zeilen anderer Art:** `pending` mit PaymentIntent (laufender Versuch) wird **nicht** gekappt, sondern bleibt, bis Stripe antwortet (Webhook); kommt später `succeeded`, gilt „Abbuchung nach Absage“ → **sofortige** Erstattung (Turnier-Zweig im Webhook, Backlog 118; Test mit später eingehender Zahlung und doppeltem Webhook).

### 17.4 Versand der Turnier-Erstattungen (Lücke in `refund.ts`)
- **Befund:** `runRefunds` findet Arbeit nur über `matches` (`cancel_requested_at`) und `payment_refunds.match_id`; Turnierzeilen (`match_id` NULL, `tournament_id` gesetzt) werden weder erkannt noch gesendet. **Ohne Fix bleiben alle Erstattungen eines abgesagten Turniers `pending`.** (`getRefundAlerts` kennt „Erstattung hängt“ für `tournament_id`, zeigt es aber nur an.)
- **Entwurf:** eigener Lauf `tournament-refund.ts` (oder Erweiterung `runRefunds` um einen Turnier-Zweig; **PL-M5-2** für den Reviewer): Auswahl `payment_refunds where tournament_id is not null and status = 'pending' and refund_id is null and failure_code is distinct from unknown_outcome`, **beanspruchen** mit `FOR UPDATE SKIP LOCKED` und Lease (wie `claimRefund`), Netzaufruf **außerhalb** der Transaktion, feste Idempotenz-Schlüssel (`refund:<chargeId>` an Stripe), Ergebnis in einer zweiten Transaktion; Wiederholung mit Backoff; nach N Fehlschlägen **ein** Alarm (nicht je Lauf). `unknown_outcome` (Netzabbruch) wird nie blind wiederholt (Alarm, Klärung im Stripe-Dashboard, wie im Teamspiel).
- **Vorbedingung:** `ensureRefundRow` und der Webhook-Zweig kennen den Bereich (`scopeOf`, Backlog 117/118); der Versand liest `tournament_id` statt `match_id`.
- **Tests:** zwei parallele Läufe senden jede Zeile genau einmal; ein Stripe-Fehler beendet die Transaktion nicht; Neustart nach Absturz setzt die Lease zurück; Erstattung mit Stripe-Fake (kein echtes Netz) kommt als `succeeded` an; Summe der Erstattungen = Summe der erfolgreichen Abbuchungen (außer strittige).

### 17.5 Wiederholen und neue Karte im Nachzahlfenster
- **Fenster:** Ein Kartenproblem (abgelehnt, keine Karte, Schlüssel geändert) beginnt wie im Teamspiel das Nachzahlfenster (`graceUntil(now, start)`; nur der erste Versuch setzt das Ende, ein späterer Versuch ändert es nicht); der Betroffene und der **Captain des eigenen Teams** werden benachrichtigt (Sichtbarkeitsmatrix, Abschnitt 13: nie Veranstalter oder andere Teams).
- **Neue Karte:** speichert der Spieler (oder Übernehmer) eine neue Karte, setzt der nächste Lauf einen **neuen Versuch** mit eigenem Idempotenz-Schlüssel (Versuchsnummer im Schlüssel), sofern das Fenster offen und das Turnier `payment` ist; die alte Zeile bleibt als Verlauf. **Anteil übernehmen** (`covered_by`) bleibt im Fenster möglich und löst eine neue Abbuchung auf dem Konto des Übernehmers aus (Entscheid 8: nur im eigenen Team; `validCoversOf` bei der Abbuchung, Backlog 121).
- **Wiederholung ohne Zutun:** bis zum Fensterende mit Backoff (nicht bei hartem Kartenfehler); Anzahl und Takt wie im Teamspiel (`charge-run`). **FRAGE-PRODUKT Q3:** gleiche Fensterlänge wie im Teamspiel oder eigene für Turniere (Start in Tagen)?
- **Ende des Fensters:** keine erfolgreiche Zeile mehr möglich → Z3 (17.2). **Tests:** Nachzahlung im Fenster → Turnier wird gebucht (Z1); Fensterende → Absage; zwei parallele Karten-Speicherungen → ein Versuch; der zweite Versuch verlängert das Fenster **nicht** (Mutation: Ende überschreiben → rot).

### 17.6 3-D-Secure bei Turnierzeilen
- Eine Zeile `requires_action` bekommt auf der **Turnierseite** den Freigabe-Weg wie im Teamspiel („Deine Bank braucht eine Freigabe“, `AuthorizeButton`); die Freigabe läuft bis `effectiveGraceEnd`. Nach der Freigabe kommt `succeeded` über den Webhook (Turnier-Zweig, Zuordnung nur über die Zahlungs-ID).
- **Absage vor der Freigabe:** Die Zeile wird **nicht** auf `tournament_cancelled` gesetzt, solange ein PaymentIntent offen ist (sie könnte noch erfolgreich werden); sie wird wie `unknown_outcome` behandelt. Kommt die Freigabe nach der Absage, erstattet der Webhook **sofort** („Abbuchung nach Absage“), mit Alarm nur, wenn das fehlschlägt. **Test:** späte Freigabe nach Absage → Erstattungszeile, Hauptbuch ausgeglichen; doppelter Webhook → eine Erstattung.
- **Texte:** „Freigabe fehlt“ nennt die Frist, nie Kartennummern; sichtbar für Betroffenen und Captain, für andere Rollen nur „Zahlung ausstehend“.

### 17.7 DSGVO: Export, Löschsperre, `covered_by`
- **Export:** liefert Abbuchungen, Erstattungen, Mandate und Übernahmen **auch für Turniere** (der Code 56f22c0 enthält in `account.ts` bereits Turnier-Übernahmen und `tournament_id` an den Zeilen; **Test nötig**, dass ein Turnier-Spieler alles zu seiner Zahlung im Export findet: Zeilen, Erstattungen, Übernahmen als Übernehmer und als Gedeckter, Streit).
- **Löschsperre (Entscheid 6, wie Teamspiel):** `deleteAccount` wird **abgelehnt**, solange der Nutzer an einem Turnier beteiligt ist, dessen Zahlungsstand nicht terminal ist: Turnier in `payment`/laufender Abbuchung, **offene** Turnierzahlungen (`pending`/`requires_action`), **offene Erstattungen** (`pending`, `unknown_outcome`), laufender Zahlungsstreit. Der Hinweistext ist sachlich und nennt, wann die Löschung möglich wird (Backlog 120). **`lockTournament` in der Löschtransaktion**, damit Abbuchungslauf und Löschung nicht gleichzeitig laufen (Sperrreihenfolge Turnier vor Zahlungszeilen; verschränkter Test).
- **`covered_by_user_id`:** Wird ein **Übernehmer** gelöscht (nach Ablauf der Sperre), werden seine Übernahmen im Turnier **aufgeräumt** (Übernahme beendet, Anteil wieder beim Gedeckten), **bevor** anonymisiert wird; sonst bliebe ein Verweis auf ein anonymisiertes Konto stehen. Der **Mandatsnachweis** der Übernahme (`cover_mandate_text`, `cover_accepted_at`) bleibt als Beleg ohne Personenbezug, soweit zulässig (**FRAGE-RECHT R-M5-5-2**, FEHLT-NOCH „Mandatsnachweis“). Test: gelöschter Übernehmer → kein Verweis mehr.
- **Zahlungsdaten nach der Löschung:** Beträge, Status, Stripe-IDs bleiben (Aufbewahrung) ohne Personenbezug; Dispute nach Löschung wie M4 (FRAGE-RECHT).

### 17.8 Absagetexte im Kartenmodell (Entwürfe, Wortwahl nach `begriffe.md` zu prüfen)
Nie „Guthaben“, nie „Eintritt vollständig erstattet“ ohne Abbuchung, nie Kartendaten. Je Fall **ein** Text in Benachrichtigung, Turnierseite und Mail (Spieler und Captain; der Veranstalter bekommt nur die Absage selbst, ohne Beträge einzelner):

| Fall | Entwurf |
|---|---|
| Frist, nichts abgebucht (fehlende Karten oder Zusage fehlt) | „<Turnier> findet nicht statt: Zur Frist waren nicht alle Teams vollzählig, mit Karte und bereit. Es wurde nichts von deiner Karte abgebucht.“ |
| Fenster abgelaufen, schon abgebucht | „<Turnier> findet nicht statt: Die Zahlung eines Teams ist nicht zustande gekommen. Dein Anteil von <Betrag> wird auf deine Karte erstattet.“ |
| Erstattung unterwegs, danach abgeschlossen | bis `succeeded`: „wird erstattet“; erst danach „Die Erstattung von <Betrag> wurde veranlasst“; keine feste Dauer bei der Bank nennen [ANNAHME] |
| Absage durch Admin 1 | „<Turnier> wurde von der Plattform abgesagt: <Grund>.“ plus je nach Lage der Satz zu Abbuchung/Erstattung |
| Übernommener Anteil | Übernehmer: „Dein übernommener Anteil für <Name> wird erstattet.“ Gedeckter: „Dein Anteil wurde für dich bezahlt; die Erstattung geht an den Zahler“, **ohne** Betrag |
| Unbekannter Ausgang | an den Betroffenen **nichts** Technisches; Alarm für Admin 1 |

Tests: Notification-Body und Turnierseite je Fall (kein „Guthaben“, kein Betrag fremder Zeilen), HTML und RSC.

### 17.9 Zuordnung der Review-Funde R-T214, R-T216, R-T217
| Fund | Stand | M5-5 |
|---|---|---|
| R-T214 (c) `tournament_closed` kein Kartenproblem | erledigt (M5-4) | `tournament_cancelled` ebenso (`NON_CARD_CODES`) |
| R-T214 (d) Turnier ohne Zeilen hängt | M5-4: Alarm | 17.2: Absage zur Frist (Code 56f22c0), Alarm bleibt Vorwarnung |
| R-T214 (e) Absagetext falsch im Kartenmodell | offen | 17.8 |
| R-T214 (f) Wiederholen, Absage bei Fensterablauf, Versand | offen | 17.2, 17.4, 17.5 |
| R-T216 (g) Schalter AUS | erledigt (Zeilen bleiben `pending`) | Frage Q2 (Dauer) |
| R-T216 (h) zweite Hängelage, Alarm | erledigt (Alarm) | Entscheid in 17.2 |
| R-T217 (i) Notabschaltung vor dem Netzaufruf | erledigt, Restfenster in BETRIEB | gleiche Prüfung im Versandlauf (17.4) |
| R-T217 (j) Geld im Turnier, Zeilen still `pending` | erledigt | die Absage fasst das Altmodell nicht an |
| R-T217 (k) Alarm-Zeitpunkt | erledigt | – |
| Backlog 117 bis 123 | Pflichten M5-4/5 | 117 (17.3), 118 (17.3, 17.6), 119 (Alarmliste Link), 120 (17.7), 121 (17.5), 122 (Indizes `payment_refunds(tournament_id, status)`, `payment_charges(tournament_id, status)`), 123 (Seeds/Cleanup) |

### 17.10 Tests und Mutationen (Auswahl, zusätzlich zu Abschnitt 10)
Absage idempotent und parallel (Mutation: zweiter Lauf erstattet doppelt → rot); Erstattung je erfolgreicher Zeile, **keine** für Strittige; Provisions-Storno genau einmal; Hauptbuch Summe 0 (Mutation: Storno weglassen → rot); späte 3-D-Secure-Zahlung nach Absage wird erstattet; Versandlauf parallel und nach Absturz; Admin 2 kann nicht absagen (Vorschlag); Veranstalter nach der ersten Zeile abgelehnt; Löschsperre in jedem nicht-terminalen Stand, verschränkt mit dem Abbuchungslauf; Sichtbarkeit der Fehlergründe je Rolle (HTML, RSC, SSE); Fensterende nicht überschreibbar (Mutation). Belege nur lokal ohne Netz (Stripe-Fake), keine Schlüssel in Tests oder Logs.

### 17.11 Fragen (nur Fragen, keine Entscheidungen)
**FRAGE-PRODUKT:** **Q1** Absage bei fehlenden Karten zur Frist bestätigen (17.2)? **Q2** Wie lange darf ein Turnier bei Schalter AUS nach Fristablauf eingefroren bleiben, ab wann Alarm und Entscheidung Admin 1? **Q3** Länge und Takt des Nachzahlfensters für Turniere (wie Teamspiel oder eigene)? **Q4** Entscheid 3 (Alles-oder-nichts) nur zur Bestätigung: Sollen die Teams ohne Fehler nie die Wahl bekommen, mit weniger Teams zu spielen? **Q5** Erhält der Veranstalter bei einer Absage die Gründe je Team (laut Sichtbarkeitsmatrix nein) oder nur „Zahlung nicht zustande gekommen“?
**FRAGE-PLAN (Reviewer):** **PL-M5-1** Rückbuchung `venue_payable` bei Erstattung (Turnier-Zweig in `applyRefundInTx`) belegen. **PL-M5-2** Versand als eigener Lauf oder Erweiterung von `runRefunds`. **PL-M5-3** Reihenfolge Turniersperre → Zahlungszeilen auch im Löschpfad dokumentieren und verschränkt testen.
**FRAGE-RECHT (beantwortet kein Agent):** **R-M5-5-1** Erstattung der Zahlungsanbieter-Gebühr und steuerliche Behandlung; **R-M5-5-2** Mandatsnachweis und Aufbewahrung nach Löschung (Übernahmen); **R-M5-5-3** Wortlaut der Absage- und Erstattungstexte (Widerruf, Frist der Bank) und Aufbewahrung der Belege.

## 18. Umsetzungsstand M5-5 und Abweichungen vom Nachtrag 17 (Stand 2026-11-22; nur Doku)
Code: Branch `feat/m5-5-pr` (Stand 1858f0b, auf M5-4). Integrationslauf gegen echte DB (soccaz_w1, Migration 0053): tournament-cancel*, -reminder, -retry, -authorize, account-tournament, -cancel-perm = 8 Dateien, 29 von 29 Tests grün, einschließlich des Streit-Tests im Turnierzweig und der Tests für Alarm, Absagevorschlag (Mitteilung an Admin 1, Doppelvorschlag, Statusprüfung). Davor (Stand 1cbd193): 13 Dateien grün (zusätzlich tournament-charge*, -card, -venue, finance, ledger).

### 18.1 Abweichungen und Klarstellungen zu 17.2
- **Schalter AUS (Entscheid R-T216, Review w4/w2):** Frist-Job (`closeTournamentsAtDeadline` über `chargeUnderway`) und Fensterablauf-Job (`cancelTournamentsAfterWindow`) sagen bei Schalter AUS **nicht** ab. Gilt für Turniere mit Zeilen und für Turniere ohne Zeilen mit gesetztem Zugangs-Snapshot ohne Spieler mit `paid_cents > 0`. Das Turnier bleibt `payment`; nach dem Wiedereinschalten buchen Abbuchungslauf und Fensterprüfung nach (Test: „Schalter AUS zur Frist“). Lücke, bewusst dokumentiert: ein Turnier mit gescheiterter Abbuchung „hängt“ bei Schalter AUS; der Alarm `card:tournament-charge-stuck` greift. Frage Q2 (wie lange eingefroren) bleibt offen.
- **Unabhängig vom Schalter** laufen (Geld muss zurück): Versand und Verbuchung der Turnier-Erstattungen (`runRefunds` → `runTournamentRefunds`) und das Abbrechen offener PaymentIntents bereits **abgesagter** Turniere (höchstens 100 Zeilen je Lauf). Nur bei Schalter EIN: Fensterablauf-Absage, Vorwarnung, Wiederholen bei neuer Karte.
- **Vorschlagsweg (Z5, 009 AC-9):** Nach der ersten Abbuchungszeile sagt nur Admin 1 (`isOwner`) ab. Veranstalter und Admin 2 werden abgelehnt; es wird ein Audit-Eintrag `tournament.cancel_proposal` (Akteur, Turnier) gespeichert, keine Erstattung, kein Lauf. Admin 1 bekommt eine Mitteilung (nur für offene Turniere, einmal je Person und Turnier) und sieht den Vorschlag im Eingriffsprotokoll; eine eigene Oberfläche und eine Begründung (Pflichtfeld laut 009) gibt es hier noch **nicht** (gehört zu 009 M1).
- **Fehlende Karten zur Frist (Entscheid t2q zu B7):** sofortige Absage zur Frist (Alles-oder-nichts, nichts abgebucht), mit Vorwarnung per Mitteilung 24 h und 6 h vor der Frist (`notifyMissingCardReminders`), je Stufe einmal je Turnier (Audit `tournament.card_reminder.<Stunden>`), nur an Betroffene und den Captain ihres Teams, ohne Namen Dritter, nie an den Veranstalter.

### 18.2 Befund aus dem Integrationslauf
- `reverseEntry` (`src/server/ledger.ts`) übernahm `tournament_id` nicht: das Provisions-Storno hatte keinen Turnierbezug, die Summe je `tournament_id` blieb 1600 Cent statt 0 (der globale `trialBalance` war trotzdem ausgeglichen und hätte es nie gezeigt). Behoben (Gegenbuchung trägt die `tournament_id` der Ursprungsbuchung); Test „Summe 0 je tournament_id“ über Abbuchung, `venue_payable`, Provision, Storno und Erstattung.
- Die Testbereinigung (`tests/cleanup.ts`) löschte Belege mit `tournament_id` nicht; ergänzt.

### 18.3 Weitere Punkte
- **Wiederholen/neue Karte:** `retryTournamentChargesInWindow` (Webhook mit Zeitbudget und Job). Ereignisse eines alten Versuchs werden über `payment_charge_attempts` der Zeile zugeordnet: ein Fehlschlag ändert nichts, ein Erfolg wird gebucht (succeeded gewinnt; ein zweiter Erfolg wird voll erstattet).
- **3-D-Secure:** `getTournamentAuthorizationSecret` (nur der Zahler, Fenster, Turnier `payment`, Kartenmodell, neutrale Fehler, Rate-Limit). **Im Fake-Pfad (Dev/E2E) gibt es für Turnierzeilen keine Freigabe-Knöpfe** (`fake` gilt nur für Spiele); eine E2E-Abdeckung der Turnier-Freigabe fehlt, bis ein Fake-Pfad gebaut wird.
- **DSGVO:** Löschsperre bei Turnieren in `registration`, `payment`, `running` (breiter als im Plan, auch ohne Abbuchung), Sperrreihenfolge Turnier → Zeile → Nutzer, `covered_by`, Mandatstext und Zeit werden aufgeräumt. Eine noch nicht gesendete Turnier-Erstattung blockiert die Löschung nicht.
- **Alarme:** `card:tournament-refund-open` erst für Zeilen älter als 30 Minuten; neu `card:tournament-late-payment`. Index `payment_refunds(tournament_id, status)` gehört in die nächste Migration (Backlog 122).

### 18.4 Neue Fragen (nur Fragen, keine Entscheidungen)
**FRAGE-PLAN:** **PL-M5-5-1** Provisions-Storno und Beleg (`issueReceipt`) bei Absage **nach** Abrechnung der Monatsrechnung (S3): Gutschrift oder Verrechnung in der nächsten Rechnung? Heute wird nur die Provisionsbuchung storniert. **PL-M5-5-2** Eine Erstattung, zu der erst **nach** ihrem Anlegen ein Zahlungsstreit eintrifft, wird als `cancelled_dispute` angelegt und nie gesendet (Streit-Test belegt es); ein gewonnener Streit nach entfallener Erstattung löst einen Alarm aus (`won_after_cancel`). Gewollt? **PL-M5-5-3** Nimmt Stripe eine Erstattung noch an, nachdem der Kunde per `payment_erasure_tasks` gelöscht wurde (Löschung eines Zahlers bei offener, nicht gesendeter Erstattung)? Beleg beim Zahlungsanbieter nötig. **PL-M5-5-4** Backoff für das Abbrechen offener PaymentIntents (heute nur Begrenzung je Lauf).
**FRAGE-RECHT (beantwortet kein Agent):** **R-M5-5-4** Löschsperre für **jedes** laufende Turnier (auch ohne Abbuchung): zulässig und verhältnismäßig, oder nur bei laufenden Zahlungen?

### 18.5 Entscheid-Vorschlag und Backlog aus R-T225b (nur Doku)
- **Löschung bei offener Turnier-Erstattung (zu 17.7/Entscheid 6):** Im Code blockiert eine **noch nicht gesendete** Turnier-Erstattung die Kontolöschung **nicht** (gesperrt wird nur bei bereits an Stripe gesendeten Zeilen, `attempt_started_at`). Das ist bewusst gewählt, aber **nicht entschieden**: die Erstattung läuft über die PaymentIntent-ID, nicht über den Kunden; ob Stripe sie nach dem Löschen des Stripe-Kunden (`payment_erasure_tasks`) noch annimmt, ist im Stripe-Testmodus **nicht belegt** (PL-M5-5-3, R-M5-5-2). Bis zur Klärung ist der Entscheid „Löschung geht, Erstattung bleibt offen und der Alarm `card:tournament-refund-open` meldet sie“ ein **Vorschlag**.
- **Backlog (aus Q2):** Ein bei Schalter AUS eingefrorenes Turnier hat keine Dauerbegrenzung und keinen eigenen Alarm; vorgeschlagen: Alarm nach X Stunden Einfrierung und Entscheidung durch Admin 1.
- **Neu im Code:** Alarm `card:tournament-open-intent` (offene Zahlung bei abgesagtem Turnier, älter als 1 Stunde); Absagevorschlag von Admin 2 nur für offene Turniere, einmal je Person und Turnier, Mitteilung an Admin 1.

## 19. Nachtrag M5-6/M5-7: Attrappen ersetzen (G24-012). Analyse und Plan (Stand 2026-11-22; nur Doku, keine Entscheidung durch den Plan)
Code-Stand: `origin/main` 7e19c88 (011 M1 mit Migration 0049, 009 M2 mit `venues.commission_percent`, 009 M3, M5-1, M5-3, M5-4a mit 0053). M5-5 ist als PR #147 offen und wird hier nicht angefasst; Abschnitt 18 beschreibt seinen Stand.

### 19.1 Was die Attrappen heute tun und wer sie aufruft
| Attrappe (`src/server/tournament-venue.ts`) | Heute | Aufrufer |
|---|---|---|
| `venueHasAccess(venueId)` | immer `false` | nur `freezeVenueTerms` (beim Fixieren des Preises, `tournaments.ts` um Zeile 356, nur Kartenmodell mit Halle) |
| `venueCommissionPercent(venueId)` | immer `0` | nur `freezeVenueTerms`; der Satz wird als `commission_percent_snapshot` eingefroren und von der Provisionsbuchung (`tournament-charge.ts` um Zeile 368) benutzt; NULL zählt dort als 0 |
| `hallZusageOk(t)` | `snapshot !== true \|\| venueConfirmedAt !== null` (NULL = Zusage nicht nötig = **fail-open**) | `eligibility` in `tournament-charge.ts` (Zeilen 58 und 59: ein NULL-Snapshot wird **vorher** als `not_fixed` abgewiesen) und `chargeUnderway` in `tournaments.ts` (um Zeile 683, ebenfalls erst nach der NULL-Prüfung) |
- `venue_confirmed_at` wird **nirgends gesetzt**, nur beim Hallenwechsel auf NULL (`setTournamentVenue`). Es gibt keine Betreiber-Aktion „Turnier bestätigen“.
- Das Fixieren verweigert im Kartenmodell ein Turnier ohne Halle (um Zeile 354). Der Snapshot ist nach dem Fixieren also nie NULL; NULL kann nur bei Altbestand oder Handeingriff auftreten. Phase A der Abbuchung und `chargeUnderway` sind schon fail-closed (NULL → nicht abbuchbar). **Offen** ist die Signatur von `hallZusageOk` selbst (NULL → `true`), die einen späteren Aufrufer ohne Vorprüfung durchrutschen ließe (R-T207b, G24-012).

### 19.2 Echte Quellen auf `main`
- **Zugang (011 M1):** `src/server/venue-access-rules.ts` ist die **eine** Quelle: `hasVenueAccess(venueId, userId)` (je Konto), `accessHolders()` (Halle → Konto) und `venueIdsOf`. „Aktiv“ heißt: Zeile `status = 'active'`, Konto nicht gesperrt (`banned_at` NULL) und **kein Admin** (`role <> 'admin'`, Entscheid t9 P4). Für „Halle hat Zugang“ (ohne Konto) fehlt eine Funktion je Halle; sie wird **dort** ergänzt (`venueHasActiveAccess(venueId, exec)`, dieselbe Bedingung wie `accessHolders`), nie eine zweite Auslegung in `tournament-venue.ts`.
- **Provisionssatz (009 M2):** `venues.commission_percent` (`numeric(5,2) NOT NULL DEFAULT 0`, CHECK 0 bis 100); Lesehilfe `percentFromDb` (`src/lib/commission.ts`). Altbestand steht auf 0; der Standardsatz 10 gilt nur im Anlagepfad `src/server/venues.ts` (um Zeile 52, `defaultCommissionPercent()`), nicht als Spaltenstandard. Hallen aus anderen Wegen (Import-Skripte, Seeds, E2E-Anlage) behalten 0, bis der Admin sie setzt.
- **Zusage (011):** gibt es für **Teamspiele** (`answerHallRequest`, `match_hall_requests`, Beweisprotokoll 009 M3). Für Turniere gibt es **nichts**; der Plan 011 M2 führt „Turnier-Zusage“ ausdrücklich als „nein, 012 M5-7“. Das Beweisprotokoll hängt an `match_id`; ob ein Turnier dort eintragen kann, ist eine Schemafrage (19.8, PL-M57-2).

### 19.3 Zerlegung
**M5-7a: baubar jetzt, ohne 011 M2 und ohne Migration (Zugang, Satz, fail-closed, Vertragstest):**
1. `venueHasAccess(venueId)` ruft die neue Einquellen-Funktion `venueHasActiveAccess` in `venue-access-rules.ts`.
2. `venueCommissionPercent(venueId)` liest `venues.commission_percent` (`percentFromDb`); unbekannte Halle oder ungültiger Wert → Fehler, nie stilles 0.
3. `freezeVenueTerms` friert beides weiter beim Fixieren ein (Reihenfolge unverändert: Turniersperre, dann Lesen).
4. `hallZusageOk` wird **fail-closed**: Snapshot `null` → `false` (Signatur bleibt `boolean | null`, damit die Aufrufer nicht brechen; die Attrappen-Anmerkung im Kommentar entfällt).
5. Vertragstest „Attrappe = Echtlogik“ (T-8, 19.6).
6. G24-012 im GO-LIVE-AUDIT schließen, sobald auch M5-7b (oder die Übergangsregel 19.4) steht.

**M5-7b: braucht eine Entscheidung und hängt an 011 M2/M4 (Zusage setzen):** Wer setzt `venue_confirmed_at`? Ein Betreiber mit Zugang bestätigt in `/halle` eine Turnier-Anfrage. „Ablehnen“, die 12-Stunden-Antwortfrist, die Wiederholung bei Hallenwechsel und der Eintrag im Beweisprotokoll sind genau der Teil von 011 M2/M4, der für Teamspiele noch fehlt.
- **Ohne 011 M2 baubar (kleiner Kern):** Aktion `confirmTournamentVenue(userId, tournamentId)` (Zugang mit `hasVenueAccess` prüfen, Turnier unter Sperre, nur Status `payment` und nur die eingefrorene Halle, setzt `venue_confirmed_at`, Audit, Mitteilung an den Veranstalter, idempotent) mit einer schlichten Liste in `/halle`.
- **Nicht ohne 011 M2 baubar:** Beweisprotokoll-Eintrag, Antwortfrist 12 h mit automatischem „abgelehnt“, „Ablehnen“ mit Rückfall auf eine andere Halle, Rundenlogik.
- Empfehlung des Plans: M5-7b erst nach 011 M2, damit die Zusage nicht zweimal gebaut wird (**FRAGE-PRODUKT P-M57-1**).

**M5-6 (Rest laut Plan Abschnitt 12, ohne Bezug zu den Attrappen):** Texte nach `begriffe.md`, `settle` und Auszahlung entfernen, Doku, Altturniere zurücksetzen, E2E. Berührungspunkt: die Texte „Die Halle hat noch nicht zugesagt“ und „wartet auf Zusage der Halle“ gehören zu M5-7b.

### 19.4 Übergangsregel, solange M5-7b fehlt (Risiko bei M5-7a allein)
Sobald `venueHasAccess` echt ist, bekommt jedes Turnier in einer **Halle mit Zugang** den Snapshot `true`. Ohne Zusage ist es dann **nie abbuchbar** (`no_zusage`), und `closeTournamentsAtDeadline` sagt es zur Frist ab. M5-7a allein macht Hallen mit Zugang für Turniere also **unbuchbar**.
- Vorschlag (**FRAGE-PRODUKT P-M57-2**): bis M5-7b die Auswahl im Kartenmodell auf Hallen **ohne** Zugang einschränken (`listPartnerVenueOptions` und `isPartnerVenue`, dieselbe Bedingung an beiden Stellen, mit Hinweis „Hallen mit Betreiber-Zugang folgen“), oder M5-7a und M5-7b zusammen ausliefern.
- Wird der Zugang **nach** dem Fixieren erteilt, gilt weiter der eingefrorene Snapshot (`false`, keine Zusage nötig); wird er entzogen, bleibt `true` und die Zusage bleibt Pflicht (**FRAGE-PRODUKT P-M57-3**: gewollt?).

### 19.5 Dateiliste (M5-7a, per Grep zu bestätigen)
`src/server/venue-access-rules.ts` (neue Funktion), `src/server/tournament-venue.ts` (Attrappen ersetzen, `hallZusageOk` fail-closed, ggf. Hallenliste ohne Zugang), `src/server/tournaments.ts` (nur Kommentar, keine Logikänderung), `src/server/payments/tournament-charge.ts` (nur falls die NULL-Prüfung zusammengelegt wird), `tests/unit/hall-zusage.test.ts` (der NULL-Fall dreht sich), `tests/integration/tournament-venue.test.ts` (Erwartung `commission_percent_snapshot` je Halle, Zugang je Halle), neu `tests/integration/tournament-venue-contract.test.ts`, `docs/loop/GO-LIVE-AUDIT.md` (G24-012), `docs/BETRIEB.md` (Provisionssatz je Halle, Altbestand 0). **Keine Migration** in M5-7a. M5-7b zusätzlich: eine Datei für die Zusage-Aktion, `src/app/halle/*`, gegebenenfalls eine Migration für das Beweisprotokoll (PL-M57-2).

### 19.6 Tests und Mutationen
- **Vertragstest T-8 gegen die Echtlogik:** Matrix je Halle: Zugang aktiv / eingeladen / entzogen / Konto gesperrt / Konto ist Admin × `venue_confirmed_at` gesetzt oder NULL → Snapshot und `hallZusageOk`. „Attrappe = Echtlogik“ heißt: dieselbe Tabelle gilt für die Funktion (Unit) und für den Weg vom Fixieren bis `eligibility` (Integration: Turnier ohne Zusage wird nicht abgebucht, mit Zusage gebucht, NULL-Snapshot nie).
- **Satz je Halle:** Halle mit 0, 10 und 12,5 % → Snapshot `0.00`, `10.00`, `12.50`; eine spätere Änderung des Satzes ändert das fixierte Turnier nicht; Hallenwechsel vor dem Fixieren nimmt den neuen Satz; Wieder-Öffnen setzt den Snapshot auf NULL (besteht schon).
- **Fail-closed:** `hallZusageOk` mit Snapshot NULL ist `false`; ein per Hand auf NULL gesetztes Turnier in `payment` wird weder abgebucht noch als „abbuchbar“ gewertet (`chargeUnderway`), der Alarm `card:tournament-waits-for-cards` bleibt.
- **Mutationen (müssen rot werden):** `venueHasActiveAccess` ohne `banned_at`-Bedingung; ohne `role <> 'admin'`; ohne `status = 'active'`; `venueCommissionPercent` liefert 0 statt der Spalte; Snapshot wird beim Hallenwechsel nicht neu gelesen; `hallZusageOk` NULL → `true`; Zugang wird live gelesen statt eingefroren.
- **Grep-Beleg:** `grep -rn "venueHasAccess\|venueCommissionPercent\|hallZusageOk" src` ohne Treffer außerhalb der Dateiliste; keine zweite Auslegung von „Zugang“ außerhalb `venue-access-rules.ts`.

### 19.7 Backlog 117 bis 123 (Pflichtliste M5, Stand `main` 7e19c88 und PR #147)
| Nr. | Stand | Rest für M5-7 |
|---|---|---|
| 117 `ensureRefundRow` beachtet `scopeOf` | im Code durch M5-4/M5-5 (Turnier- und Spielzeilen getrennt, `tournamentId` oder `matchId` je Zeile); per Grep zu belegen | nur Beleg |
| 118 Webhook: `scopeOf`-Zweige, unbekannter Bereich = Alarm | Turnier-Zweige für Abbuchung, Erstattung und Streit vorhanden; ein unbekannter Bereich endet in `ignored` mit Audit, aber **ohne eigenen Alarm** | **offen:** Alarm oder Zählung (PL-M57-3) |
| 119 Alarmliste: Link auf das Turnier statt ins Leere | Alarme nennen die Turnier-ID; ein **Link** in der Oberfläche ist nicht belegt | prüfen und bauen (kleiner UI-Teil, M5-6) |
| 120 `deleteAccount` sperrt das Turnier, räumt `covered_by` auf | M5-5 (PR #147) | nach dem Merge schließen |
| 121 `validCoversOf` bei der Abbuchung | M5-4 | Beleg |
| 122 Indizes für die neuen Abfragen | `payment_charges_tournament_user_idx` besteht; **fehlt:** `payment_refunds(tournament_id, status)` (Erstattungsjob, Alarm) und `payment_charges(tournament_id, status)` (Fensterjob, Alarme) | **Migration 0054** (klein, mit `EXPLAIN`-Beleg), serielle Nummer abstimmen |
| 123 Seeds und `tests/cleanup.ts` | `cleanup.ts` räumt seit M5-5 auch Belege; Seeds (`scripts/seed-*.mts`) für Turnierzahlungszeilen nicht belegt | Beleg, ggf. kleine Änderung |

### 19.8 Fragen und Entscheide (Stand 2026-11-22)
**ENTSCHIEDEN t2q (M5-7):**
- **P-M57-1 ENTSCHIEDEN (t2q): ja, präzisiert in 19.9 (3):** M5-7b (Zusage setzen) ist eine **eigene Etappe nach 011 M1 und M5-7a**, nicht abhängig von 011 M2/M4; M5-7a läuft bis dahin mit der Übergangsregel aus 19.4.
- **P-M57-2 ENTSCHIEDEN (t2q): ja.** Bis M5-7b sind im Kartenmodell nur Hallen **ohne** Betreiber-Zugang wählbar, **serverseitig** in `listPartnerVenueOptions` **und** `isPartnerVenue` (dieselbe Bedingung an beiden Stellen, Test für beide). Statt stillem Fehlen bekommt der Veranstalter den Hinweistext „Halle noch ohne Online-Zusage“ zu den Hallen mit Zugang.
- **P-M57-3 ENTSCHIEDEN (t2q): ja.** Der eingefrorene Snapshot bleibt maßgeblich (Zugang später erteilt: keine Zusage nötig; später entzogen: Zusage bleibt Pflicht). Ein dadurch festhängendes Turnier sagt Admin 1 ab.
- **P-M57-4 ENTSCHIEDEN (t2q): ja.** Hallen mit Satz 0 (Import, Seeds, E2E): Warnung im Admin und in `docs/BETRIEB.md`, **kein** Mindestsatz.
- **PL-M57-1 ENTSCHIEDEN (t2q, wie Empfehlung):** `venueHasActiveAccess` liegt in `venue-access-rules.ts`; ein Grep-Test sichert, dass „Zugang“ nur dort ausgelegt wird.
- **PL-M57-2 ENTSCHIEDEN (t2q, wie Empfehlung):** Der Beweisprotokoll-Anschluss für Turniere wird erst in M5-7b gemeinsam mit 011 M2 entschieden (Schemafrage `booking_evidence.match_id`).
- **PL-M57-3 ENTSCHIEDEN (t2q, wie Empfehlung, ergänzt durch P-M57-6):** Webhook, unbekannter Bereich (Backlog 118): Audit mit Zähler; Alarm erst bei mehr als 5 Fällen in 24 Stunden, **ausgenommen** erfolgreiche Zahlungen ohne Zuordnung (sofort, siehe 19.9 Punkt 7).
- **P-M57-6 ENTSCHIEDEN (t2q): ja.** Erfolgreiche Zahlung ohne Zuordnung = sofortiger Admin-1-Alarm, ohne Personendaten, je Ereignis-ID einmal; Schwelle nur für andere unbekannte Ereignisse; Test für beide Zweige (19.9 Punkt 7).
- **R-M57-1:** geht an die Anwaltsliste (Aufbewahrung des Zusage-Nachweises einer Halle zu einem Turnier). Beantwortet kein Agent.

**Folgen für 19.3 bis 19.6:** M5-7a enthält zusätzlich (a) die serverseitige Beschränkung der Hallenauswahl auf Hallen ohne Zugang mit dem Hinweistext, (b) einen Test je Stelle (`listPartnerVenueOptions` führt Hallen mit Zugang nicht als wählbar; `isPartnerVenue` lehnt sie ab, auch bei direktem Aufruf der Server-Aktion mit der Hallen-ID), (c) die Warnung zum Satz 0 in `docs/BETRIEB.md` und im Admin, (d) den Webhook-Zähler zu Backlog 118. Mutationen dazu: Bedingung in `isPartnerVenue` entfernt; Bedingung nur in der Liste, nicht im Server-Check. Die Frage 19.4 „oder gemeinsam ausliefern“ entfällt. G24-012 wird mit M5-7b geschlossen, nicht mit M5-7a.

### 19.9 Änderungen v3 (Plan-Review R-T230, w4; ersetzen widersprechende Sätze in 19.3 bis 19.8)
1. **Testwechsel einzeln begründen:** `tests/unit/hall-zusage.test.ts` ändert sich (Snapshot `null` → `false`, vorher `true`). Das ist eine **Änderung eines Bestandstests** und wird im PR als eigene Zeile begründet (fail-open war nur mit der Attrappe vertretbar, G24-012; keine Abschwächung). Ebenso jede geänderte Zeile in `tests/integration/tournament-venue.test.ts` einzeln (Satz 0 → Wert aus der Halle).
2. **Auswahl ohne Zugang reicht nicht (Lücke Wahl → Fixieren):** Zugang kann **nach der Wahl und vor dem Fixieren** erteilt werden (Einladung wird beim Login eingelöst). Dann friert `freezeVenueTerms` `true` ein und das Turnier ist unbuchbar (Absage zur Frist). Deshalb **zusätzlich** (neben `listPartnerVenueOptions` und `isPartnerVenue`):
   - `freezeVenueTerms` verweigert das Fixieren mit einer klaren `DomainError` („Diese Halle hat inzwischen einen Betreiber-Zugang; die Online-Zusage für Turniere folgt. Bitte wähle eine andere Halle.“), solange `venueHasActiveAccess(Halle)` gilt und M5-7b fehlt. Kein Absturz in der Transaktion; der Fehler kommt **vor** dem Statuswechsel auf `payment` (die Prüfung steht vor dem `update` in `tournaments.ts`, nicht erst im Einfrieren).
   - **Altbestand:** vor dem Bau eine Abfrage/Bericht: Turniere in `registration` mit Halle, die einen aktiven Zugang hat (Anzahl, Turnier-IDs); Ergebnis in den PR. Kein stilles Umschreiben.
   - **Zugang nach dem Fixieren erteilt** (Snapshot `false`, Zusage wird nie verlangt) widerspricht dem Vertrag 011 (Zusage bei Hallen mit Zugang). Bis M5-7b als **GO-LIVE-AUDIT-Eintrag** (siehe 8). **Entzug nach dem Fixieren** (Snapshot `true`, keine Zusage möglich): Admin-1-Eingriff, nämlich Absage des Turniers oder Hallenwechsel (nur im Status `registration`) beziehungsweise später die Zusage per M5-7b; im BETRIEB zu nennen.
3. **Kein Zirkel; 7b ist eine eigene kleine Etappe:** 011 M2 baut die **Teamspiel**-Antwort, **nicht** eine Turnier-Antwort; der Plan 011 M2 führt „Turnier-Zusage“ als „nein, 012 M5-7“. M5-7b hängt deshalb **nicht** an 011 M2. **ENTSCHIEDEN (t2q, 2026-11-22):** 7b bleibt eine **eigene kleine Etappe** und hängt nur an **011 M1** (Zugang), **nicht** an 011 M2/M4; P-M57-1 ist entsprechend zu lesen („7b nach 011 M1 und M5-7a“, nicht nach M2/M4). Die Sperre in `freezeVenueTerms` (siehe 2) ist bestätigt. Inhalt von 7b (`confirmTournamentVenue`, 19.3): `hasVenueAccess` **in** der Transaktion; Reihenfolge **Turniersperre vor der Zeile**; nur Status `payment` und nur für die **eingefrorene** Halle (Hallenwechsel setzt `venue_confirmed_at` auf NULL: Test); **keine Rücknahme** (P7 des 011-M2-Plans); Zeitpunkt aus der **DB-Uhr**; Zusage zu einem abgesagten Turnier wird abgelehnt (Test); der Betreiber sieht **keine Spielernamen** (nur Turnier, Termin, Teamzahl).
   **Beweisprotokoll für die Turnierzusage:** `booking_evidence.match_id` ist `NOT NULL` und geht in den Hash ein. Ein Turnier-Betreff braucht Schema (`tournament_id` oder Betreffart) **und** eine Hash-Erweiterung und darf **nicht** als **dritte** Änderung von `evidence_hash` nach der Nachlieferung kommen. Zwei Varianten waren zur Wahl; **ENTSCHIEDEN (t2q): Variante A.**
   - **Variante A (ENTSCHIEDEN t2q):** Turnier-Betreff in die Migration der **Nachlieferung 009 M3** (worker-2; eine einzige Hash-Änderung); 7b schreibt von Anfang an ins Beweisprotokoll. **Schnittstelle:** worker-2 liefert die Funktionen für den Turnier-Betreff (Aufruf aus `confirmTournamentVenue`, Signatur und Betreffart mit worker-2 abzustimmen, Plan 16b); worker-1 ruft sie nur auf und fasst `evidence.ts`, `evidence-write.ts`, `evidence-head.ts` und das Schema nicht an. Test in 7b: Zusage erzeugt genau einen Beweiseintrag mit Turnier-Betreff, zweiter Aufruf keinen zweiten (idempotent).
   - **Variante B (verworfen):** 7b nur mit Audit-Eintrag, Beweisprotokoll später mit R-M57-1. Nicht gewählt (Nachweis mit geringerer Beweiskraft und eine spätere dritte Hash-Änderung).
4. **`venueCommissionPercent`:** liefert den Satz oder wirft eine `DomainError` mit einem Text für den Veranstalter (Halle unbekannt, Satz ungültig); der Zahlenwert geht durch `percentFromDb` und wird mit `toFixed(2)` eingefroren. Eine Partnerhalle ohne **gesetzten** Satz (Wert 0 aus dem Altbestand) wird beim Fixieren **nicht stumm** mit 0 geführt: **Warnung im Admin** (P-M57-4: Warnung, kein Zwang) und im BETRIEB. Test: 12,5 / 0 / 100.
5. **`venueHasActiveAccess` mit einer SQL-Bedingung:** `hasVenueAccess`, `accessHolders` und `venueHasActiveAccess` teilen **eine** Bedingung (eine Hilfsfunktion in `venue-access-rules.ts`). Test: alle drei laufen über **dieselbe Fixture-Matrix**; eine Mutation in nur **einer** Funktion wird rot. Die Matrix wird erweitert um: abgelaufene Einladung (`status` nicht `active`), **mehrere Konten teilen sich den Zugang**, **Konto anonymisiert** (E-Mail `geloescht-…@geloescht.invalid`, kein aktiver Zugang), **Admin-Konto mit Zugang gilt nicht** (t9 P4). Sperrreihenfolge im Plan festhalten: **Turnier (gesperrt) → Halle-Zugang (nur gelesen)**; kein Sperren der Zugangszeilen aus dem Turnierpfad.
6. **Dateiliste 7a (Ergänzung):** `src/server/tournament-venue.ts` (`freezeVenueTerms`, `isPartnerVenue`, `listPartnerVenueOptions`), `src/server/tournaments.ts` (Prüfung vor dem Statuswechsel, siehe 2), `tests/e2e/*` und die Seeds: `halle.spec` und `user-menu` legen `venue_access` an. **Prüfen**, ob ein Turnier-E2E (zum Beispiel `tournament-card.spec`) eine solche Halle wählt; falls ja, auf eine Halle ohne Zugang umstellen oder die Hallen trennen. Jede geänderte Testzeile steht einzeln im PR.
7. **Backlog 118 (Webhook, unbekannter Bereich):** t2q hat „Zähler, Alarm ab Schwelle > 5 in 24 Stunden“ entschieden (bleibt). **P-M57-6 ENTSCHIEDEN (t2q): ja.** Eine **erfolgreiche** Stripe-Zahlung ohne Zuordnung (`succeeded` ohne passende Zeile = echtes Geld ohne Buchung) löst **sofort** einen Admin-1-Alarm aus: ohne Personendaten (nur Ereignis-ID, Art, Betrag und Zeit), **entprellt** (je Ereignis-ID genau einmal). Die Schwelle (mehr als 5 in 24 Stunden) gilt nur für die **übrigen** unbekannten Ereignisse. Test für **beide** Zweige: (a) `payment_intent.succeeded` ohne Zeile → ein Alarm sofort, Wiederholung derselben Ereignis-ID kein zweiter; (b) andere unbekannte Ereignisse → kein Alarm bei 5, Alarm ab dem sechsten innerhalb 24 Stunden; Mutationen: Entprellung entfernt; Schwelle auf den succeeded-Zweig angewandt; Personendaten im Alarmtext. **Backlog 122 (Indizes):** Migrationsnummern erst beim Bau (die Nachlieferung 009 M3 nimmt die nächste freie Nummer und blockiert 011 M2a); die Indizes `payment_refunds(tournament_id, status)` und `payment_charges(tournament_id, status)` nur bei messbarem Seq Scan (`EXPLAIN`), **vor dem Pilot nicht vorziehen**. **Backlog 120** schließt nach dem Merge von #147.
8. **G24-012 in zwei Zeilen teilen:** (a) **G24-012** „Attrappen, fail-open“ (`hallZusageOk`, `venueHasAccess`, `venueCommissionPercent`): **geschlossen mit M5-7a**; (b) **neu** „**Zusage der Halle für Turniere fehlt (M5-7b)**“: **offen bis M5-7b**; Go-live nur mit Schalter AUS **oder** mit Turnieren in Hallen ohne Zugang. Beide Zeilen und die Lücke aus 2 (Zugang nach dem Fixieren) stehen im GO-LIVE-AUDIT.
9. **Tests und Mutationen (Ergänzung zu 19.6):** (a) Sperre in `freezeVenueTerms` (Fixieren verweigert bei Hallen mit Zugang): Mutation „Sperre entfernt“ wird rot; (b) **Konsistenz Auswahlliste = Validator** (`listPartnerVenueOptions` ⊆ Hallen, die `isPartnerVenue` annimmt) mit Mutation, die nur eine der beiden Stellen ändert; (c) **Admin mit Zugang gilt nicht als Zugang** (Matrix aus 5, t9 P4); (d) Satz-Test 12,5 / 0 / 100 aus 4; (e) die Sperrreihenfolge aus 5 als Kommentar-Beleg und Grep (kein Zugriff auf `venue_access` mit `for update` im Turnierpfad).
