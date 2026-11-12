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
- **Schlüssel der Provisionsbuchung:** `commission:t:<tournamentId>` (genau einmal je Turnier, aus der Summe aller erfolgreichen Zeilen, einmal gerundet; abgerundet nach 009 A2). **Storno bei Absage** im selben Schritt wie die Erstattung (Gegenbuchung `commission-reversal:t:<tournamentId>`, zweites Storno bucht nichts; T-26).
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
