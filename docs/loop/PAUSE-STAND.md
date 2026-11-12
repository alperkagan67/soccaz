# PAUSE-STAND

Stand: 2026-11-12, ca. 18:10 UTC (Pause-Modus durch den Nutzer, über t9). Geschrieben vom Task Manager.
Alle vier Worker haben ihren Schritt lokal committet und ruhen. Nichts außer #138 und diesem Doku-PR ist offen oder wird gepusht.

## 1. Seit dem letzten Bericht gemergt (Auszug, alle einzeln, squash)
| PR | Inhalt |
|---|---|
| #124, #125 | Doku 009 (Release-Bedingung E1c+E2, Klarstellung Admin 1) |
| #126 | 012 M4b-1: Export und Löschung der Kartendaten (Migration 0043) |
| #127 | Doku-Sammel 5: Backlog 90-113, Go-Live-Audit G2/G22/G23 |
| #128 | 009 M1 E1a-E1c: Admin 1 (`is_owner`), Admin 2 ohne Finanzen, Teilrollen entfallen (Migrationen 0044, 0045) |
| #129, #131, #133, #135 | Doku-Sammel: Pläne 012 M5, 009 M2, 011 M1, 013 M3-Vorbereitung; Entscheide t9; Backlog 114-136; CI-Matrix-Vorschlag |
| #130 | Fix: Betreiber-Zuordnung nur Admin 1 (`setVenueManagerAction` owner) |
| #132 | 012 M5-2a/2b: `tournament_id` an Zahlungszeilen, `match_id` nullable + XOR (Migrationen 0046, 0047) |
| #134 | 009 M2: Provision je Halle, 10er-Bonus, Monatsrechnung, USt-Schalter (Migration 0048) |
| #136 | Doku: Wartungsausnahme und DB-Rollenmodell (G25-009) |
| #137 | Fix: Gast/Nichtteilnehmer sehen keinen persönlichen Betrag/Kartentext in der Lobby (Payload-Härtung) |

Main-Stand beim Schreiben: 636b6d7 (Migrationen bis 0048 auf main).

## 2. Offene PRs
| PR | Stand |
|---|---|
| #138 011 M1 (venue_access, Migration 0049, Einladung, Migrationsbericht, Aufräum-Job R1) | Code- und Security-Review OK (Server, Fix, Nachlauf, Merge-Teil). CI: Typen/Lint/Unit, Integration, Browser 3/4 und 4/4 grün; Browser 1/4 und 2/4 liefen beim Schreiben noch. Merge einzeln, sobald alles grün und CLEAN; danach Worktree/Branch aufräumen (`docs-analyse-frontend-y1` hält `feat/011-m1-nachlauf`). |
| dieser Doku-PR (PAUSE-STAND) | Doku, Browser-Tests übersprungen. |

## 3. Worker (Branch | Hash | fertig | offen | nächster Schritt)
**worker-1 (t17)**: 012 M5 (Turnier auf Karte)
- `feat/m5-1` | 1e4d046 | M5-1 fertig (Partnerhalle, Zusage-Attrappe, Snapshot), Reviews OK | Rebase-Umbau, Commits VOR M5-3 ordnen | Migration lokal 0049 -> geplant 0050.
- `feat/m5-3` | 8f45c88 | M5-3 (Kartenmodell Turnier, Übernahme, Sichtbarkeit) fertig, Reviews OK | Rebase-Umbau | lokal 0048/0050 -> geplant 0051.
- `feat/m5-4` | 5e94615 | M5-4a (Abbuchung zur Frist, Webhook/Streit-Zweig, `venue_payable`, Provision aus Snapshot, Belege, Alarme, Notabschaltung) fertig, Delta-Reviews OK | Rebase auf main (009-M2-Merge 5a12ad4 entfällt) | lokal 0051 -> geplant 0053.
- `feat/m5-5` | 56f22c0 | ZWISCHENSTAND lauffähig, UNVOLLSTÄNDIG: Absage im Kartenmodell (Erstattungszeilen, Provisions-Storno `commission-reversal:t`, Owner-Regel, Kartentexte, "hängt ohne Zeilen"); Tournament-Tests grün | offen: Fensterablauf-Job, Versand der Turnier-Erstattungen (`refund.ts` turnierfähig, Alarm ersetzen), Wiederholen im Fenster, 3-D-Secure für Turnierzeilen, DSGVO-Löschsperre, Mutationen; Voll-Integration vor Weiterarbeit fahren | keine neue Migration bisher.
- `docs/012-m5-nachtrag2` | 1d0a0b9 | Plan-Nachträge M5-4a, Plan 3.5 Hallenmiete (P6) | Nachtrag M5-5 offen.
- Hinweis: w1-DB steht auf Migrationsstand 0051; vor Branchwechsel `db:migrate`/Reset.

**worker-2 (t1c)**: 009 M3 (Beweisprotokoll, Variante G)
- `feat/009-m3a` | 9677632 | M3a fertig (Schema, Trigger, `recordEvidence`, `verifyEvidenceChain`, 21 Tests, Security/Code-Delta OK, TRUNCATE-Trigger) | Migration neu als 0052, BETRIEB-Nachtrag `evidence_insert`/`booking_evidence` | lokal 0049_volatile_tomas -> geplant 0052.
- `feat/009-m3b` | fe248e7 | nur Vorbereitung (M3a + Merge 011-M1), KEIN Haken-Code | Haken in `veto.ts`/`booking.ts`/`venue-access.ts`/`account.ts`: Einträge in der Tx sammeln und am Ende schreiben ODER DB-seitig per DEFERRABLE-Constraint-Trigger (Gegenvorschlag, ENTSCHEID nötig) | lokal 0050 -> geplant 0052.
- `docs/009-m3-plan` | 9fa5e71 | Plan v3 + Nachträge, noch in keinem PR | in nächsten Doku-PR bündeln.

**worker-3 (t19)**: 011 M1 / Lobby / Look
- `feat/011-m1-nachlauf` | 537cfe3 (Stand in #138) | 011 M1 komplett, im PR #138.
- `docs/011-m2-plan` | 2e292f5 | Plan v1 (Entscheidung + Pflicht-Begründung, Beweisprotokoll-Anbindung, Frist/Karenz, 12-h-Regel, Wechsel); Fragen P1-P8, PL1-4, R-M2-1..3 | Review durch anderen Worker, Fragen beantworten lassen; Schnittstelle `appendHallEvidence` ist Annahme.
- `feat/m2b-look` | e2442b0 | Look Start/`/app`/Lobby, NUTZERPAKET v2 liegt vor | wartet auf Look-Abnahme des Nutzers, Hero-Standbild.
- `fix/gast-kosten` | 06e7b55 | Fix auf dem Look-Stand | beim Merge von `m2b-look`: main mergen, Konflikt `page.tsx` per "ours" (Look-Stand).

**worker-4 (t1b)**: Reviewer (ohne eigenen Code)
- Alle Reviews bis R-T218b gemeldet. Checklisten im Scratchpad: M5, 009 M2, 011 M1, 009 M3, M3b-Vorbereitung, Kontrast-Messprotokoll, Look-Abnahme.

## 4. Geplante Push-Reihenfolge (Migrationen) und Abhängigkeiten
Journal-`when` muss in der Nummernreihenfolge STRENG aufsteigend sein, sonst überspringt der Migrator eingeschobene Migrationen still. Je Schritt: main mergen, Nummer neu erzeugen, `db:generate` = "No schema changes", `migrate-check` frisch + bestehend, einzeln pushen, ein Browser-Lauf zur Zeit, CI grün abwarten, einzeln mergen.

| Reihenfolge | Inhalt | Migration |
|---|---|---|
| 0 (läuft) | #138 011 M1 | 0049 |
| 1 | M5-1 (Umordnung VOR M5-3) | 0050 |
| 2 | M5-3 | 0051 |
| 3 | 009 M3a (Marke im `migrate-check` per `findIndex`; die 4 Prüfungen aus 011 übernehmen, "full - 2" streichen) | 0052 |
| 4 | M5-4 (braucht M5-1, M5-3, M3a) | 0053 |
| 5+ | M5-5 (nur falls nötig 0054+), 009 M3b (Haken, Entscheid DEFERRABLE offen) | – |

Weitere Doku-PRs ohne Browser-Tests: `docs/009-m3-plan`, `docs/012-m5-nachtrag2`, `docs/011-m2-plan` (nach Review).

## 5. Offene Entscheide beim Nutzer
- **Look-Abnahme M2b (NUTZERPAKET v2, 8 Punkte):** Look insgesamt; Abschluss-"Anmelden"; Rand ruhiger Knöpfe; test-gebundene Texte mit M3; Hero-Video/Standbild bis Lizenz; Kopfleisten-Betrag 0,00 € und `/app/guthaben` stehen lassen; Kader-Zeilen am Handy; Abnahme trotz ungeprüftem letztem Lobby-Stand und ungemessenem Kontrast (Messung nach dem Ja durch worker-3, Protokoll liegt).
- **Ausnahme-PRs (Nutzer mergt):** `.claude/`, `.github/`; **PR B** (`.github`-Sammel): CI-Matrix-Lauf der Karten-/Hauptbuch-Suiten mit `TEST_LEDGER_MODEL=commission` (Vorschlag `docs/loop/VORSCHLAG-CI-LEDGER-MATRIX.md`) und `PAYMENTS_FAKE` auch im Playwright-Schritt (damit `karte-*`-Specs in der CI laufen); `tests/e2e/global-teardown.ts` setzt `card_payments_enabled` nicht zurück (Ausnahmeliste).
- **Regel-PR:** Speicherregel als Zeile in `docs/loop/REGELVORSCHLAG.md`; `axe-core` nur transitiv (Vorschlag: explizite devDependency, Regel 14).
- **Rechts-/Steuer-Liste (kein Agent entscheidet):** R1 (Aufbewahrung abgelaufener Einladungsadressen, 30 Tage Annahme), R3 (Beweisprotokoll: Aufbewahrung/Löschung/Beweiswert, Personenfelder `evidence_actor`), Ablageort Kopf-Hash (Anwalt), S2 (Nummernjahr), S3 (Gutschrift), E4 (Kontenrahmen), Hero-Video-Lizenz, Datenschutz-Entwurf.
- **Produkt:** 009 M3b Haken-Design (Sammeln-am-Ende vs. DEFERRABLE-Trigger); Fragen 011 M2 (P1-P8, PL1-4).
- **Aufräumen, das nur der Nutzer kann (NEEDS-USER):** `.playwright-mcp/`, `worktrees/review-m3c-1c`, `worktrees/review-e1c` (nicht löschbar, "Invalid argument"); IDE-tsserver-Prozesse mit hohem Speicher beenden/neu starten.

## 6. Bekannte Risiken und Blockaden
- **CI:** Browser-Tests laufen derzeit 30+ Minuten je PR (4 Shards); höchstens ein Browser-Lauf zur Zeit; main-Push-CI wird durch spätere Läufe abgebrochen (kein Befund, PR-CI war grün).
- **DB-Rollenmodell (G25-009, blockiert Go-live):** `socaz.ledger_maintenance`/`socaz.evidence_insert` sind freie Sitzungswerte; getrennte DB-Rollen + REVOKE vor Live.
- **Attrappen G24-012:** `hallZusageOk`, `venueHasAccess`, `venueCommissionPercent` bis M5-7 (vor Go-live Pflicht).
- **Schalter `card_payments_enabled`:** in Produktion AUS; Abbuchung, Turnier-Karte und Provision erst mit Gating (Kette M3c, M4, M5, 3-D-Secure, Alarmanzeige).
- **Video-Lizenz, Stripe-Schlüssel:** Hero-Video-Lizenz ungeklärt; Stripe-Testschlüssel trägt der Nutzer selbst in `.env.local` ein (nie Live-Schlüssel); `.env*` wird nie gelesen.
- **Offene Backlog-/FEHLT-NOCH-Punkte:** `docs/loop/BACKLOG.md` (90-136+), `docs/loop/FEHLT-NOCH.md`, `docs/loop/GO-LIVE-AUDIT.md` (G18-G25).
- **Zwei stille Hängerlagen in M5-4a:** "Turnier wartet auf Karten" (Alarm vorhanden), Restfenster Notabschaltung (in `BETRIEB.md`).

## 7. Hinweise zum Neustart
- Herzschlag neu setzen aus `docs/loop/HERZSCHLAG.md`; nach `/clear` zuerst `docs/loop/HANDOFF.md` bzw. diese Datei lesen.
- Worker-DBs `soccaz_w1` bis `soccaz_w4`: Migrationsstände weichen ab (w1 auf 0051, ältere 0046/0049 auf anderen Ständen); bei Zweifel mit `node scripts/worktree.mjs` neu anlegen. Alte lokale DBs mit früherem 0049/`venue_access` müssen `venue_access` verwerfen.
- Ports: Haupt-Dev-Server 3100; Worker 3101 bis 3104; Postgres 5433. Höchstens zwei Dev-Server gleichzeitig, jeder nach Gebrauch beenden; Playwright höchstens `--workers=2` (besser 1) und nur betroffene Specs; Vitest mit Zeitlimit; keine Integrationsläufe parallel.
- `.env.local` lässt sich nicht in neue Worktrees kopieren (Deny-Regel); `worktree.mjs create` legt sie an.
- Hauptrepo nie auschecken; Arbeit nur in Worktrees; Aufräumen erst nach `MERGED`-Prüfung, nie in einer Kette mit dem Merge.
