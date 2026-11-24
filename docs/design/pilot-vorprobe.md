# Vorprobe T-1: prüfbare Liste (Pilot, Vertrag 013 AC-8)
Stand: 2026-11-24 · Code-Stand `origin/main` 78170a4 · Verfasser: worker-4 · Auftrag: t2q/t2s „Vorprobe-Skript“ · Status: Entwurf, Review offen

Zweck: Die Vorprobe am Tag vor dem Pilot (`pilot-plan.md` 4.4, ca. 30 Minuten, zwei Personen) als **Liste mit einer Prüfung je Zeile: Befehl oder Handlung und erwartetes Ergebnis**. Abweichung = Zeile rot, Eintrag in die Vorprobe-Notiz, vor dem Abend klären. Alle Werte (Schlüssel, Domain) stehen nur in der Umgebung, hier nur Platzhalter in `<…>`; **nie** Schlüssel in die Notiz oder den Chat. Die Daten auf Staging entstehen **ohne Seed** (der Seed-Guard verweigert Staging, `pilot-technik.md` 4); die Anlage von Hand beschreibt der Pilot-Daten-Plan von w1 (noch nicht auf `main`; Zeilen D1 bis D8 sind dann an ihn anzupassen).

**Zeitrahmen:** rund 30 Minuten für zwei Personen. Die Teile **A, B und G** sind reine Technik und laufen **vorab oder parallel** zu C bis F (Technik am Server, Spielleitung mit der zweiten Person am Handy); die Liste ist länger als 30 Minuten, weil Teil C bis F in Gruppen aufgeteilt werden.

Kürzel: **T** = Technik, **S** = Spielleitung, **A** = Admin 1. Spalte „Rot, wenn“ nennt das Abbruchsignal; rote Zeilen in Teil A und B stoppen die Vorprobe.

## A. Staging-Gesundheit (T, am Server)
| # | Befehl / Handlung | Erwartet | Rot, wenn |
|---|---|---|---|
| A1 | `curl -s https://<Domain>/api/health` | `{"status":"ok"}`, HTTP 200 | anderes Ergebnis, Zertifikatsfehler |
| A2 | `docker compose ps` | Dienste `app`, `db`, `caddy`, `backup` laufen; `migrate` beendet mit Code 0 | ein Dienst startet neu oder fehlt |
| A3 | `docker compose logs migrate` | alle Migrationen angewendet, bis zur letzten der Datei `drizzle/` | Fehler, fehlende Migration |
| A4 | `docker compose exec app printenv PAYMENTS_FAKE` | **keine Ausgabe** | irgendein Wert (Abbruch: Fake-Pfad darf nie laufen) |
| A5 | `docker compose exec app printenv NODE_ENV` | `production` | etwas anderes |
| A6 | Stripe-Schlüssel nur als Präfix prüfen: `docker compose exec app sh -c 'printenv STRIPE_SECRET_KEY \| cut -c1-8'` | `sk_test_` | `sk_live_` (Abbruch) oder leer |
| A7 | `docker compose exec app sh -c 'printenv STRIPE_CARD_WEBHOOK_SECRET \| cut -c1-6'` | `whsec_` | leer |
| A8 | Einstellungen `payments_enabled` und `card_payments_enabled` im Admin (`/admin/einstellungen`) ansehen | beide **AN** | eine AUS (dann Spiele gratis, Kartenablauf ungeprüft) |
| A9 | `docker compose exec db psql -U socaz -c "select name, state, completedon from pgboss.job where name in ('card-charges','card-refunds') order by completedon desc limit 4"` (der Zeitplaner schreibt nur bei einem Ergebnis ins Protokoll, Stille ist kein Fehler); zusätzlich `docker compose logs app \| grep "[scheduler] gestartet"` | Zeilen mit `state` = `completed`, `completedon` jünger als 10 Minuten (Takt alle 5 Minuten); Start-Meldung vorhanden | `failed`, `completedon` älter als 10 Minuten, keine Start-Meldung |
| A10 | Zugangsschutz: Staging-Adresse in einem privaten Fenster ohne Zugangsdaten öffnen | Schutzabfrage bzw. Einladung nötig, kein offener Zugang | Seite offen für Fremde |

## B. Stripe-Webhook (T, Testmodus)
| # | Befehl / Handlung | Erwartet | Rot, wenn |
|---|---|---|---|
| B1 | Stripe-Dashboard (Testmodus) → Entwickler → Webhooks: Endpunkt `https://<Domain>/api/stripe/webhook` | angelegt, Ereignisse: `setup_intent.succeeded`, `setup_intent.setup_failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.requires_action`, `charge.updated`, dazu für Erstattungen `refund.created`, `refund.updated`, `refund.failed`, `charge.refund.updated`, `charge.refunded` und die Streit-Ereignisse `charge.dispute.*` | Endpunkt fehlt, falsche Adresse, zwei Endpunkte mit demselben Geheimnis |
| B2 | `stripe trigger setup_intent.succeeded --api-key <Testschlüssel aus der Umgebung>` (Stripe CLI, ein Ereignis an den Testmodus senden; der Schlüssel kommt aus der Umgebung des Rechners, nie eintippen im Chat) | im Dashboard unter dem Endpunkt: Zustellversuch mit **HTTP 200** | 400 (Signatur ungültig: falsches Geheimnis), 503 (nicht konfiguriert), 500 |
| B3 | `stripe trigger payment_intent.payment_failed` | Zustellversuch **200**; in `docker compose logs app` kein Stacktrace | 500 oder Stacktrace |
| B4 | Signaturprüfung (negativ): `curl -s -o /dev/null -w "%{http_code}" -X POST -H "stripe-signature: t=1,v1=00" -d "{}" https://<Domain>/api/stripe/webhook` | **400** | 200 (Signatur wird nicht geprüft!) |
| B5 | Dasselbe ohne Kopfzeile `stripe-signature` | **400** | 200 oder 500 |
| B6 | Alter Endpunkt: `curl -s -o /dev/null -w "%{http_code}" -X POST -d "{}" https://<Domain>/api/webhooks/stripe` | 400 oder 503, nie 200 mit Verbuchung | 200 |
| B7 | Karteneingabe-Formular: Lobby eines Spiels als Spieler **ohne** Karte öffnen | Stripe-Formular sichtbar (nicht nur „Kartenzahlung nicht verfügbar“) | Formular fehlt: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` nicht im Build, neu bauen |

## C. Anmeldung je Rolle (S + Person 2, Handy 390 px und Desktop)
Fünf Konten: Gast (kein Konto, zweites Gerät), Spieler, Captain, Betreiber (Zugang `venue_access`, **nicht** im Spiel), Admin 1.
| # | Handlung | Erwartet | Rot, wenn |
|---|---|---|---|
| C1 | `/anmelden` öffnen | nur Google-Anmeldung; **kein Dev-Login** | Dev-Login sichtbar |
| C2 | Gast: `/` und `/suche` | Seiten laden ohne Anmeldung, Hauptaktion „Anmelden“ bzw. „Spiel suchen“, **eine** orange Hauptaktion | Fehler, mehrere Hauptaktionen |
| C3 | Gast: offene Lobby und Spiel (`/lobby/offen/<id>`, `/spiel/<token>`) | nur Zahlen und **Initialen**, kein Zahlstatus, „Anmelden“ als Hauptaktion | ein Klarname, Nachname, Zahlstatus |
| C4 | Gast: HTML-Stichprobe: `curl -s https://<Domain>/lobby/<id> \| grep -c "<Nachname eines Testkontos>"` (je Fläche: Lobby, Team, Rangliste, Spielbericht, Turnier) **und** derselbe Aufruf mit `-H "RSC: 1"` (Daten, die die Seite im Hintergrund lädt; dort dürfen auch keine Nutzerkennungen stehen, Gesamtprüfung #323) | **0** in beiden Fällen | > 0 |
| C5 | Gast: `https://<Domain>/spieler/<id>` | Weiterleitung auf `/anmelden?next=…` | Profil mit Name sichtbar |
| C6 | Spieler anmelden (eigenes Google-Konto bzw. Testkonto), Onboarding durchlaufen | `/willkommen` → `/app` „Meine Spiele“; „Dein Stand“ nennt den nächsten Schritt | Schleife, Fehlerseite |
| C7 | Captain: eigenes Team, `/app` | eine Hauptaktion; bei eingehender Herausforderung „Herausforderung ansehen“ | mehrere orange Knöpfe |
| C8 | Betreiber: Lobby und Teamseite eines Spiels seiner Halle | Personen nur als Initialen, kein Link; keine Zahlstände | Klarname sichtbar |
| C9 | Admin 1: `/admin` und `/admin/einstellungen` | erreichbar; Notabschaltung Kartenzahlung einmal AUS und wieder AN (ohne offene bezahlte Spiele) | Admin-Seite für andere Rollen erreichbar |
| C10 | Spieler öffnet `/admin` | Weiterleitung oder 403/404, nie die Seite | Seite sichtbar |

## D. Spiel von Hand, ohne Seed (A + T, Anlage per Oberfläche; Details im Pilot-Daten-Plan, w1)
| # | Handlung | Erwartet | Rot, wenn |
|---|---|---|---|
| D1 | Halle mit Preis anlegen bzw. prüfen (Admin); Betreiber-Zugang vergeben | Halle in „Spiel suchen“ sichtbar, Preis steht | Halle fehlt |
| D2 | Zwei Teams mit je 4 Mitgliedern einrichten (echte Einladungslinks, keine Skripte) | Teams in `/teams`, Captain je Team | Einladung scheitert |
| D3 | Captain 1 fordert Team 2 heraus (oder Lobby aufmachen, offen); Captain 2 nimmt an | Lobby zeigt „Dein Stand“; Termin steht nach gleicher Wahl beider Teams („dieselbe Uhrzeit“) | Termin bleibt offen |
| D4 | Spiel mit Anstoß in **unter 48 Stunden** anlegen (Sofortbuchung, AC-5) | Karte nötig, Preis wird beim Bereit/Bestätigen fest | Spiel lässt sich ohne Karte bereitmachen |
| D5 | `docker compose exec db psql -U socaz -c "select count(*) from venues where osm_id like 'seed-venue-%'"` | **0** (keine Seed-Hallen) | größer als 0: Seed-Daten auf Staging |

## E. Testkarten (Spieler, Handy 390 px) — Karten nur im Testmodus, Ablaufdatum Zukunft, beliebige Prüfziffer
| # | Karte | Handlung | Erwartet | Rot, wenn |
|---|---|---|---|---|
| E1 | 4242 4242 4242 4242 | Karte in der Lobby hinterlegen, „Bereit“ | Karte hinterlegt (Marke, letzte vier Ziffern), Bereit möglich; vor dem Klick ist das Mandat sichtbar | Bereit ohne Karte möglich, Mandat nicht sichtbar |
| E2 | 4000 0000 0000 0002 | Abbuchung auslösen (beide Captains „Preis bestätigen“) | Fehlerzustand mit Grund im Klartext, **einzige** Hauptaktion „Karte ändern“; Dritte sehen nur „Zahlung ausstehend“ | zwei Hauptaktionen, Grund für Dritte sichtbar |
| E3 | 4000 0027 6000 3184 | Abbuchung auslösen | „Zahlung freigeben“ als einzige Hauptaktion, „andere Karte“ eingeklappt, Frist sichtbar | Freigabe führt ins Leere |
| E4 | 4000 0000 0000 9995 | Abbuchung auslösen | Grund „nicht gedeckt“, Aktion „Karte ändern“ | Grund fehlt |
| E5 | zuerst E2, dann 4242… hinterlegen | Neuer Versuch im Nachzahlfenster | Zahlung geht durch, Stand „bezahlt“; in `payment_charge_attempts` Versuche **gezählt**, jeder Spieler genau **einmal** belastet | doppelte Belastung |
| E6 | Captain-Leiste | „Anteil übernehmen“ bei einem Spieler ohne Karte | Anteil wandert, Dritte sehen neutral „Gedeckt“ ohne Namen | Name oder Grund bei Dritten |
| E7 | Stripe-Dashboard (Testmodus) | Zahlungen der Zeilen E2 bis E5 ansehen | je Versuch ein Eintrag, Status passt zur Lobby | Abweichung zwischen Lobby und Stripe |
| E8 | Absage nach der ersten Abbuchung (Admin 1) | Absage mit Erstattung | Erstattung auf die Karte im Dashboard sichtbar; Captain kann nach der ersten Abbuchung **nicht** selbst absagen | Captain kann absagen |
| E9 | Texte prüfen (Lobby, Mails) | nirgends „Guthaben“, „Aufladung“, „Code“; Wörter „Preis steht fest“, „Karte ändern“, „Zahlung freigeben“; Zahlungsknöpfe tragen die zentralen Texte (ENTWURF-Hinweis) | verbotener Begriff |

## F. Handy 390 px und Messpunkte (Plan 6a, einmal vorab; Zahlen in die Vorprobe-Notiz)
| # | Messpunkt | Handlung | Erwartet | Rot, wenn |
|---|---|---|---|---|
| F1 | Touch-Ziele | Hauptaktion und Knöpfe der Lobby mit dem Daumen tippen, 10 Mal | keine Fehltreffer | Fehltreffer an eng stehenden Knöpfen (bekannt: Sprachumschalter, Zustimmungs-Kästchen unter 44 px: als „bekannt“ notieren) |
| F2 | Laden | Stoppuhr: Tippen auf Lobby-Link bis „Dein Stand“ sichtbar, drei Messungen im Mobilfunk | Meldemodus; notieren | ab 3 Sekunden: notieren, kein Abbruch |
| F3 | Kontrast | Lobby und `/app` hell und dunkel im Tageslicht lesen | Hauptaktion, Zustandswörter, Ampelpunkte lesbar | unlesbar |
| F4 | Knopf vor der Hydration | Lobby öffnen und **sofort** „Bereit“ tippen | kein Seitenwechsel auf einen GET-Aufruf, Knopf kurz gesperrt | URL mit Parametern, Fehlerseite |
| F5 | Länge | Lobby: Wie weit bis zur Hauptaktion? | Hauptaktion in der ersten Bildschirmhöhe (Ausnahme Planung, bekannt: Lauf 3 P2-1 mit #329 behoben, prüfen) | Hauptaktion nicht auffindbar |
| F6 | Umbruch | alle Seiten des Abends auf 390 px | kein seitliches Scrollen, Schrift ab 12 px | Überlauf |

## G. Sicherung und Rückspielen (T)
| # | Befehl | Erwartet | Rot, wenn |
|---|---|---|---|
| G1 | `docker compose exec backup sh /backup-loop.sh once` | Datei `socaz-<zeit>.sql.gz` und `socaz-<zeit>.manifest.json` im Sicherungsordner | Fehler, keine Manifest-Datei |
| G2 | `RESTORE_ADMIN_URL=postgres://<konto>@127.0.0.1:5432/postgres node scripts/restore-test.mjs backups/socaz-<zeit>.sql.gz --head-hash <hash> --count <n>` (Hash und Anzahl der Beweiskette aus der **externen** Kopie, der Benachrichtigung an Admin 1). Die Probe braucht `psql` und einen **lokalen** Postgres (127.0.0.1) auf dem ausführenden Rechner, nicht im Staging-Container | kein FAIL, Beweiskette PASS, Wegwerf-Datenbank entfernt (ohne Anker nur WARN; mit `--strict` Exit-Code 1) | FAIL oder Beweiskette nicht PASS |
| G3 | Sicherungs-Zeitpunkt in die Vorprobe-Notiz | Zeit unmittelbar vor dem Pilot | fehlt |

**Probelauf von G1/G2 lokal (2026-11-24, worker-1; Stand `origin/main`; noch NICHT mit der echten Hoster-Sicherung, die der Nutzer beibringt):** Auf einem lokalen **Wegwerf-Postgres 17** (Port 5544, nur für die Probe) wurde die Probe mit demselben Weg wie `backup-loop.sh` durchgespielt: Manifest (`MANIFEST_SQL`), dann `pg_dump --no-owner --clean --if-exists | gzip -9`, dann `scripts/restore-test.mjs <datei> --head-hash <hash> --count <n>` (Hash und Anzahl aus dem Manifest als Ersatz für die externe Kopie). Die Probedaten (ein Spiel, eine Buchung über 800 Cent, zwei Beweiseinträge) kamen aus den Test-Helfern, nicht aus einem Seed.
| Schritt | Erwartet (G1/G2) | Echtes Ergebnis |
|---|---|---|
| Manifest und Sicherung | Datei `.sql.gz` und `.manifest.json` | Manifest 87 ms, Sicherung 168 ms, 33,5 KB; 77 Tabellen, 60 Migrationen, Buchungssumme 800 Cent, 2 Beweiseinträge |
| `restore-test.mjs` | kein FAIL, Beweiskette PASS, Wegwerf-Datenbank entfernt | **Exit 0, 13,8 s: 11 PASS, 1 WARN, 0 FAIL, 0 SKIP** (Einspielen, Tabellen, Zeilen wachsend, Buchungssumme, Kopf-Hash, 60 Migrationen gleich dem Repo, Beweiskette gültig mit externem Anker, Schutz-Trigger an Hauptbuch und Beweisprotokoll); danach 0 Datenbanken `restore_check_*` |
| WARN `salden-guard` | (Befund, kein Restore-Fehler) | „1 Nutzer mit Saldo != 0 (Summe −800 Cent)“: Artefakt der Probedaten (die Probebuchung ist eine Altguthaben-Buchung); auf einer Staging-Sicherung ohne Altguthaben erwartet: PASS „Alle Altsalden 0“ |
Beobachtet am ersten Lauf auf einer leeren, um eine Migration älteren Datenbank: Migrationen WARN „59 von 60“ (vor dem Einsatz `npm run db:migrate`), Beweiskette PASS mit 0 Einträgen, die beiden Schutz-Trigger-Zeilen SKIP („keine Zeile“): so sieht eine Sicherung ohne Daten aus, sie belegt dann nur das Einspielen, nicht die Trigger. Die Dauer 14 s gilt für eine kleine Datenbank (33 KB Sicherung); auf Staging mit den Pilotdaten bleibt sie klein, bei einer größeren Produktionssicherung wächst sie mit dem Einspielen. **Grenzen:** lokaler Wegwerf-Server, Postgres 17 (Staging und Produktion laufen mit dem Image der `docker-compose.yml`), keine Rollen (`db-roles.mjs`) angelegt; die **echte Hoster-Sicherung und die Wiederherstellung beim Hoster (PITR)** stehen weiter beim Nutzer aus, E8 bleibt bis dahin offen.

## H. Abschluss
- Die Vorprobe-Notiz (eine Zeile je rote oder auffällige Zeile, mit Uhrzeit) geht an Orchestrator und Task Manager; **S** entscheidet mit ihnen: Freigabe des Abends, Verschiebung oder Beheben (S1 aus Plan Abschnitt 8 gilt schon in der Vorprobe).
- Aufräumen der Vorprobe-Daten: Testspiele absagen oder stehen lassen, wenn sie Spiel A/B sind; die Spiele A und B aus Plan 4.3 gehören **nicht** zur Vorprobe und sind spätestens bei T-3 angelegt.
- Playwright-Gerüst: bewusst nicht gebaut; Teile C bis F brauchen Google-Anmeldung und das Handy, Teil B das Stripe-Konto, und ein lauffähiges Gerüst hätte Zugangsdaten gebraucht.
