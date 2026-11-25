# Datenliste: welche Daten Soccaz speichert, wer sie sieht, wie lange, wo

Stand: `main` `8f0f333` (2026-11-25) · Verfasser: worker-2 · **Fakten-Doku, keine Rechtsbewertung.** Gelesen aus dem Quelltext (`src/db/schema*.ts`, `src/server/*`, `src/app/*`) und den Betriebsunterlagen; **nichts davon wurde gegen eine laufende Instanz oder eine Datenbank geprüft.** Wo der Code keine Regel enthält, steht wörtlich **NICHT GEREGELT** (nichts erfunden). Wo ich etwas nicht belegen konnte, steht **zu prüfen**. Beleg-Kürzel: `Pfad:Zeile` aus dem Stand oben.

**Geltungsstand 12.12. (geplant):** Zahlungen **AUS** (beide Schalter), `TURNIER_ONLY=1`, Anmeldung mit Google und Apple (Apple hinter `APPLE_LOGIN_ENABLED=1`). Zahlungsdaten fallen nur bei Zahlungen **AN** neu an; Altdaten aus Tests können vorhanden sein.

**Sichten** (Abkürzungen in der Spalte „Wer sieht sie“): **Gast** = nicht angemeldet; **Angemeldet** = Konto, kein besonderer Bezug; **Team** = Mitglied des Teams; **Betroffener** = die Person selbst; **Veranstalter** = Turnierveranstalter; **Halle** = Hallenbetreiber (namenfrei: „Spieler N“); **Admin** = Plattform-Admin; **Admin 1** = Inhaber (Rolle `owner`). Die Namensdarstellung entscheidet `cardViewerFor` (`src/lib/player-card.ts:30-35`): Gast und Halle sehen Initialen bzw. „Spieler N“, Angemeldete den Namen (`src/lib/lobby-namen.ts:9-56`). Die Gast-Sicht prüft ein Dauertest (`tests/e2e/gast-sicht-routen.ts`, `docs/design/gast-sicht-gesamtpruefung.md`); **die Rollen-Sichten (Veranstalter, Halle, Admin) sind dort nicht lückenlos belegt** (Dok.: „Geprüft wird nur der Gast“).

## 1. Konto und Anmeldung
| Daten (Tabelle.Feld) | Zweck (laut Code) | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `users.email`, `name`, `google_id`, `apple_id`, `avatar_url`, `role`, `locale`, `created_at` | Anmeldung (Google/Apple), Zuordnung des Kontos, Darstellung | **E-Mail:** Betroffener (Export), Admin (`src/app/admin/nutzer/page.tsx:67`); nirgends auf öffentlichen Seiten (Gast-Registry). **Name:** Angemeldete voll, Gast Initialen, Halle „Spieler N“. **`google_id`/`apple_id`:** intern, `apple_id` nicht im Export (`src/server/account.ts:132`) | bis Konto-Löschung; dann **anonymisiert** (Abschnitt 14); das Konto bleibt als Zeile bestehen | Postgres (Hetzner), Backups |
| `users.age_confirmed_at`, `terms_accepted_at`, `onboarded_at` | Nachweis Altersprüfung (nur der Zeitpunkt), Zustimmung zu den Bedingungen, Abschluss der Einrichtung (`src/server/actions.ts:48-59`) | intern, Admin | bleiben bei der Konto-Löschung **unverändert** (`account.ts:271-291`); Löschfrist für anonymisierte Konten: **NICHT GEREGELT** | wie oben |
| **Geburtsdatum** | nur zur Prüfung „mindestens 16“ (`src/lib/age.ts:1-17`, `player-onboarding.ts:33-45`) | niemand | **wird nicht gespeichert** (kein Feld in `users`; Eingabe auch nicht im Entwurf im Browser, `player-onboarding.ts:13,20`). Unter 16: das gerade angelegte Konto wird **hart gelöscht** (`actions.ts:39-44`), Seite `/unter-16`; dabei keine Audit-Zeile | – |
| Apple „Private Relay“ | die E-Mail kann eine von Apple erzeugte Weiterleitungsadresse sein | wie `users.email` | wie `users.email` | wie oben |
| `users.banned_at`, `is_owner`, `is_organizer`, `is_verified_pro` | Sperre, Rechte | Admin | bis Konto-Löschung (`banned_at` wird dabei gesetzt) | wie oben |

## 2. Profil und Sichtbarkeit von Personen
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `users.city`, `position`, `bio`, `nickname`, `accent_color`, `shirt_number`, `favorite_club`, `strong_foot`, `profile_public` | Profil, Mitspieler-Suche, Rangliste | **Profil `/spieler/[id]`:** Gast wird zur Anmeldung geleitet (`spieler/[id]/page.tsx:73`); Angemeldete sehen es nur bei `profile_public = true` (Standard **true**, `schema.ts:41`), sonst nur „versteckt“ mit Name; Betroffener und Admin immer (`profiles.ts:58-61`). **Rangliste/Mitspieler:** Gast Initialen ohne Link, Position nur Angemeldete (`rangliste/page.tsx`, `mitspieler/page.tsx:55`); Listen filtern auf `profile_public` (`profiles.ts:104,209,305,366`) | bis Konto-Löschung, dann auf **NULL** gesetzt, `profile_public = false` | Postgres |
| `free_player_posts` (`user_id`, `city`, `day`, `note`) | Mitspieler-Suche („freie Spieler“) | Angemeldete mit Name, Gast Initialen (`mitspieler/page.tsx:17,54`) | Löschung bei Konto-Löschung: in `deleteAccount` **nicht genannt: zu prüfen**; Ablauf der Beiträge: **zu prüfen** | Postgres |
| `player_stats`, `user_badges`, `user_reliability`, `late_cancels`, `rating_history`, `mvp_votes` | Statistik, Abzeichen, Zuverlässigkeit, Wertung, MVP-Wahl | Statistik: wie Profil; Zuverlässigkeit: intern | bei Konto-Löschung **gelöscht:** `player_stats`, `user_badges`, `user_reliability`, `mvp_votes` (`account.ts:261-264`); `late_cancels` und `rating_history`: **nicht genannt, zu prüfen** | Postgres |

## 3. Teams, Spiele, Turniere
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `teams` (`name`, `slug`, `city`, `logo_url`, `bio`, `color`, `created_by`), `team_members` (`user_id`, `role`, `joined_at`) | Team, Einladung | Teamseite: Gast sieht **keine Mitgliedernamen** (`teams/[slug]/page.tsx:71-72`), Logo nur Angemeldete (`:83`); Einladungsseite: Teamname, Stadt, Spielerzahl | `team_members` bei Konto-Löschung gelöscht (`account.ts:253`); Team wird **archiviert**, wenn die Person einziges Mitglied und Admin war (`:250`); Team-Daten sonst bleiben | Postgres |
| `matches`, `match_participants` (`user_id`, `team_id`, `ready_at`, `paid_cents`, `no_show`), `match_results`, `match_events` (Tor, Karte, Minute, Schütze) | Spiele, Ergebnisse, Ereignisse | Spiel `/spiele/[id]`: Gast Initialen (`spiele/[id]/page.tsx:218`); öffentliches Live-JSON nur Initialen (`api/spiele/[id]/live/route.ts:22`); Spielbericht-Karte/og:image Initialen (`match-card-text.ts:12`); Halle „Spieler N“ | bleiben **ohne Personenbezug** erhalten (`account.ts:137-140`; die Zeilen verweisen auf das anonymisierte Konto); `ready_at` wird teils geleert (`:267-268`). Löschfrist für Spiele: **NICHT GEREGELT** | Postgres |
| Lobby/Suche (`matchmaking_queue`, `queue_participants`, `match_options`, `match_option_votes`, `match_veto_halls`, `match_hall_requests`) | Gegner- und Terminsuche, Hallenwahl | Gast: Anzahl und Initialen (`lobby/offen/[entryId]/page.tsx:79`, `suche/[id]/page.tsx:114`), Namen nur Teammitglieder | Fristen: einzelne Ablauf-Jobs (`expire-requests`, `expire-scheduling`), **Löschung abgelaufener Zeilen: NICHT GEREGELT** | Postgres |
| `tournaments` (`organizer_id`, `name`, `city`, `invite_token`, `is_private`, …), `tournament_teams` (`captain_id`), `tournament_players` (`user_id`), `tournament_matches` | Turniere | **Privat:** nur mit Einladungstoken, Veranstalter, Admin oder Mitglied eines angemeldeten Teams, sonst dieselbe neutrale Seite wie bei „unbekannt“ (`turniere/[id]/page.tsx:53-62`). Captain-Name `autorLabel`; Veranstalter für Gast/Halle als „Vorname + Initial“ (`lobby-namen.ts:42-56`). Spiele privater Turniere sind über ihre Spiel-Links teilbar (Backlog 263) | Konto-Löschung **gesperrt**, solange man in einem Turnier in Anmeldung/Zahlung/Lauf steht (`account.ts:169-171`); danach bleiben die Zeilen ohne Personenbezug | Postgres |
| `game_invites`, `invites` (Einladungslinks) | Einladungen zu Spiel/Team | wer den Link hat | Team-Einladungen: **30 Tage nach Ablauf gelöscht** (Job `cleanup`, `scheduled.ts:198,201`); Spiel-Einladungen: `expires_at` = Anstoß + 1 Tag, **Löschjob: NICHT GEREGELT** | Postgres |
| `match_clips` (`url`, `title`, `user_id`) | Videoverweise | **zu prüfen** (Seite nicht Teil der Gast-Registry-Prüfung dieser Doku) | Löschung nur von Hand (`clips.ts:53`), sonst Cascade; Frist **NICHT GEREGELT** | Postgres |

## 4. Beiträge von Nutzern
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `comments` (`author_id`, `body`, `rating`, `status`) | Kommentare | Gast und Halle Initialen, Angemeldete Name (`comment-sicht.ts:14`) | bei Konto-Löschung **gelöscht** (`account.ts:254`) | Postgres |
| `venue_reviews` (`user_id`, Kategorien, `body`) | Hallenbewertung | Gast Initialen, Angemeldete Name, **Halle „Ein Spieler“**, die Hallen-Antwort nennt den Autor nie (`venue-review.ts`) | bei Konto-Löschung: `body` und `user_id` auf **NULL**, die Zahlen bleiben anonym (`account.ts:256`) | Postgres |
| `comment_reports`, `venue_review_reports` (`reporter_id`, `reason`), `user_warnings` (`user_id`, `by_id`, `reason`) | Meldungen und Verwarnungen | Admin (Moderation); Anzeige der Verwarnung beim Betroffenen: **zu prüfen** | **NICHT GEREGELT** (Cascade, aber das Konto wird nie gelöscht) | Postgres |
| `media` (Avatar, Teamlogo, Spielfoto; Bild als `bytea` in der Datenbank) | Profilbild, Logo, Spielfotos | Abruf `/api/media/[id]` **nur Angemeldete** (Gast: 404); **jeder Angemeldete mit der Kennung** bekommt das Bild, eine Besitzerprüfung gibt es nicht (`api/media/[id]/route.ts:6-22`). **Spielfotos sind abgeschaltet** (`media.ts:52`, „bis zum Social-Media-Teil aus“); Hochladen: 5 MB, JPEG/PNG/WebP, serverseitig zu WebP neu kodiert, Metadaten (EXIF/GPS) entfernt (`media.ts:10-33`) | Entfernen durch Besitzer/Admin setzt nur `status = removed` (Zeile **und Bilddaten bleiben**, `media.ts:82-90`); bei Konto-Löschung **endgültig gelöscht:** Avatar und Spielfotos (`account.ts:257`); **Teamlogo bleibt**; zeitliche Frist **NICHT GEREGELT**. Von Google gelieferte Avatar-URLs (`users.avatar_url`) werden **vom Browser direkt bei Google geladen** (`UserMenu.tsx:166-168`, `src/auth.ts:88`): bei Konto-Löschung auf NULL | Postgres (Bild), Google-Server (nur Google-Avatar) |

## 5. Benachrichtigungen, Push, E-Mail
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `notifications` (`title`, `body`, `url`, `read_at`), `delivery_log`, `notification_prefs` | Mitteilungen in der App | nur Betroffener | gelesene: **90 Tage nach Erstellung** gelöscht (`scheduled.ts:199,202`); **ungelesene: NICHT GEREGELT**; `delivery_log` nur per Cascade mit der Mitteilung, eigene Frist **NICHT GEREGELT**; bei Konto-Löschung alles gelöscht (`account.ts:258-260`) | Postgres |
| `push_subscriptions` (`endpoint`, `p256dh`, `auth`, `user_agent` ≤ 200 Zeichen) | Web-Push an das Gerät | nur Server | erst **nach Nutzeraktion** angelegt (`PushToggle.tsx:50`); gelöscht beim Abmelden (`notifications.ts:179-181`), wenn der Push-Dienst „gone“ meldet (`notifications.ts:157`; genaue Statuscodes **zu prüfen**) und bei Konto-Löschung; zeitlicher Ablauf **NICHT GEREGELT** | Postgres; der Endpunkt gehört dem Browser-Hersteller |
| E-Mail (Empfänger, Betreff, Text, Anhänge) über **Resend** | Benachrichtigungen per Mail, Rechnungen an Hallen (PDF) | Empfänger | nur wenn `RESEND_API_KEY` gesetzt ist (`providers/email.ts:6-7`); **Stand Go-live: nicht konfiguriert, offen** (Nutzerliste Nr. 6); Aufbewahrung beim Dienstleister: **zu prüfen** | Resend (siehe `dienstleister.md`) |

## 6. Beweisprotokoll und Prüfspur
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `booking_evidence` (Hash-Kette, `actor_commitment` = Hash über Salz und Nutzer-Kennung) | Nachweis der Hallen-Zusage/-Ablehnung | kein Klartext-Personenbezug in der Zeile (`schema-finance.ts:338-339`) | **append-only**, keine Löschregel (`schema-finance.ts:336`) | Postgres |
| `evidence_actor` (`user_id`, `name`, `email`, Salz) | wer für die Halle entschieden hat | Admin 1 über die Beweis-Seiten (`evidence-export.ts:17,49-50`; ob die Routen tatsächlich nur Admin 1 zulassen: **zu prüfen**) | bis Konto-Löschung, dann auf NULL (`account.ts:243`; Nachlauf `clearOrphanActors` im Tagesjob, `evidence-head.ts:16-30`); ohne Konto-Löschung **NICHT GEREGELT** | Postgres |
| `booking_evidence_reason_text` (Freitext 3 bis 200 Zeichen) | Begründung | wie oben | bei Konto-Löschung gelöscht (`account.ts:242`); sonst nur, wenn die Einstellung `evidence_reason_retention_days` gesetzt ist (1 bis 36500 Tage, **Standard: aus**, `evidence-head.ts:39-48`): **die Dauer ist offene Rechtsfrage R3**; Backups werden nicht erreicht (`evidence-head.ts:49`) | Postgres |
| `audit_log` (`actor_id`, `action`, `entity`, `entity_id`, `before`/`after` als JSON, `at`) | Protokoll von Änderungen | Admin; keine IP-Spalte (`schema.ts:223-236`) | **kein Löschen, keine Frist: NICHT GEREGELT**; bei Konto-Löschung bleibt `actor_id` (das Konto besteht fort); ob `before`/`after` einzelne personenbezogene Werte enthalten: **zu prüfen** | Postgres |

## 7. Hallenbetreiber und Rechnungen
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `venue_access` (`user_id`, `invited_email`, Status), `venues` (`contact`, `invoice_email`, `manager_user_id`) | Zugang der Betreiber, Rechnungsadresse | die eingeladene E-Mail nur **Admin 1** (Entscheid M1-K), Betreiber sehen keine Spielernamen | `invited_email`: Einladung 14 Tage gültig, danach **30 Tage** weiter gespeichert, dann auf NULL (Job `expire-venue-invites`, `venue-access.ts:165-201`); Entzug leert sofort; bei Konto-Löschung Zugang `revoked` und Adresse NULL | Postgres |
| `invoices`, `invoice_lines`, `match_commissions`, `invoice_deliveries` | Provisionsrechnungen an Hallen | Admin 1; Abruf durch Betreiber **nicht ausgeliefert** (Backlog 256, wartet auf Steuerberater) | Rechnungs-Aufbewahrung: **NICHT GEREGELT** (Nutzerliste Nr. 4: Steuerberater) | Postgres |

## 8. Zahlungsdaten (nur bei Zahlungen AN)
| Daten | Zweck | Wer sieht sie | Wie lange | Wo |
|---|---|---|---|---|
| `payment_profiles` (`stripe_customer_id`, Kartenmarke, letzte vier Ziffern, Mandatstext/-zeit), `payment_setup_intents` | Karte hinterlegen (Stripe) | Betroffener (Export), Admin 1 (Finanzen) | bei Konto-Löschung gelöscht (`account.ts:236-237`); der Stripe-Kunde wird per Auftrag `payment_erasure_tasks` bei Stripe gelöscht (Wiederholung bis 10 Versuche, danach manuell, `payments/erasure.ts`); die **Auftragszeile selbst wird nie gelöscht: NICHT GEREGELT** | Postgres, Stripe |
| `payment_charges`, `payment_refunds`, `payment_disputes`, `ledger_entries`, `payments`, `receipts`, `pending_refunds` | Abbuchungen, Erstattungen, Buchhaltung | Betroffener (Export), Admin 1 | bleiben bei Konto-Löschung („Belege und Buchungen müssen wir aufbewahren“, `account.ts:137-140`); **Frist NICHT GEREGELT** | Postgres |
| Bei Zahlungen **AUS** | keine neuen Zahlungsdaten; Stripe.js wird nicht geladen, solange `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` leer ist (Runbook 3) | – | – | – |

## 9. Cookies und Browser-Speicher
| Name / Schlüssel | Zweck | Dauer | Quelle |
|---|---|---|---|
| Sitzungs-Cookie (Auth.js, Sitzung als JWT; Inhalt: Nutzer-Kennung, Rolle, Sperre, E-Mail) | Anmeldung | **Auth.js-Standard**, im Repo nicht gesetzt (kein `maxAge`, `src/auth.ts:29,99-116`); Namen und Lebensdauer **zu prüfen** (im Browser bei der Generalprobe) | `src/auth.ts` |
| weitere Auth.js-Cookies (CSRF, Rückkehr-Adresse) | Anmeldeablauf | Auth.js-Standard, **zu prüfen** | – |
| Apple-Anmeldung: `state`, `pkce`, `nonce` (Präfix `__Secure-`, httpOnly, SameSite None, Secure) | Rückkehr von Apple | kurz (nur Anmeldeablauf); genaue Dauer **zu prüfen** | `src/lib/apple-login.ts:17-26` |
| `socaz_locale` | Sprachwahl | 365 Tage, SameSite lax, nicht httpOnly | `src/server/locale-actions.ts:14` |
| localStorage `socaz.installHint.dismissed` | Installationshinweis weggeklickt | bis der Nutzer löscht | `InstallHint.tsx:8,48` |
| localStorage `soccaz.maxTier` | höchste gezeigte Animationsstufe (kein Personenbezug) | bis der Nutzer löscht | `reveal-motion.ts:5` |
| sessionStorage (Assistent-Entwurf, Klartext) | Entwurf eingegebener Felder bis zum Ende der Browser-Sitzung; **Kontakt, Zustimmung, Passwort/Zahlung und das Geburtsdatum werden nie gespeichert** | Browser-Sitzung | `assistent.ts:13,63`, `venue-onboarding.ts:17`, `player-onboarding.ts:13-20` |
| Service Worker `public/sw.js` | Seiten-Cache nur für statische Dateien (`/_next/static/`, `/icons/`, `/brand/`) und die Offline-Seite; „Nutzerdaten werden bewusst NICHT zwischengespeichert“, `/api/` nie angefasst | bis zur Aktualisierung | `public/sw.js:1-54` |
Eine Cookie-Banner-Komponente gibt es im Code **nicht**; die Datenschutzseite sagt, es würden nur notwendige Cookies gesetzt (Anmelde-Cookie, Sprach-Cookie, keine Werbe- oder Analyse-Cookies, `src/app/datenschutz/page.tsx:39,61-62`). Ob das für die genannten Speicher (insbesondere localStorage und Service Worker) genügt: **zu prüfen** (Anwalt).

## 10. Server-Protokolle und IP-Adressen
| Quelle | Inhalt | Wie lange | Wo |
|---|---|---|---|
| Anwendungs-Fehlerprotokoll (`onRequestError`, `src/instrumentation.ts:43-60`) | JSON auf der Standardausgabe: Meldung, Digest, **Pfad**, Methode, Route, Typ; kein Query-String-Filter (**NICHT GEREGELT**) | Docker-Protokolle begrenzt auf 3 Dateien à 10 MB (Runbook 1f) | Server (Hetzner) |
| Webserver Caddy | in `Caddyfile`/`Caddyfile.staging` **keine** `log`-Direktive: kein konfiguriertes Zugriffsprotokoll (Verhalten laut Caddy-Doku: **zu prüfen**) | – | Server |
| IP-Adresse | **nirgends** im Anwendungscode gespeichert oder geloggt (kein Treffer für `x-forwarded-for`/`remoteAddress`; `audit_log` ohne IP-Spalte); Hetzner-Netz-/Firewall-Protokolle: **zu prüfen** | – | – |
| Sentry (nur wenn `SENTRY_DSN` gesetzt) | Fehlertext, Route, Digest; `sendDefaultPii: false`, `tracesSampleRate 0`; ein Filter für personenbezogene Inhalte der Fehlermeldung: **NICHT GEREGELT**; nur serverseitig, kein Sentry im Browser | **zu prüfen** (Dienstleister) | Sentry |
| Ratenbegrenzung | je Nutzer (Sperren in der Datenbank), **nicht** je IP | – | Postgres |

## 11. Sicherungen
| Was | Inhalt | Wie lange | Wo |
|---|---|---|---|
| Täglicher `pg_dump` (03:30 UTC) mit Manifest | gesamte Datenbank | 14 Tage (`backup-loop.sh`) | Server, `~/soccaz/backups` |
| Spiegel auf Hetzner Storage Box | dieselben Dateien, `--delete` | folgt dem Server (14 Tage), plus bis zu 10 Box-Snapshots (laut Hetzner-Seite) | Hetzner Storage Box (Deutschland wählbar) |
| Hetzner-Server-Backup, Snapshots | ganze Platte | 7 Plätze (Backup), Snapshots nach Bedarf | Hetzner |
Gelöschte oder anonymisierte Daten bleiben bis zum Ablauf dieser Fristen in den Sicherungen; Löschungen erreichen Backups nicht (so auch im Code vermerkt für den Begründungs-Klartext, `evidence-head.ts:49`).

## 12. Daten ohne Personenbezug (der Vollständigkeit halber)
`settings`, `venues` (Name, Adresse, Koordinaten aus OpenStreetMap-Import `data/nrw-hallen-osm.json`, ODbL), `sponsors` (Name, Link, Klickzähler `clicks`, keine Bilder), `team_stats`, `city_challenge_results`, `leagues`, `price_rules`.

## 13. Datenexport (Auskunft)
`/api/mein-konto/export` (`exportMyData`, `exportCardData`, `account.ts:56-135`): **enthalten:** Konto-Felder (E-Mail, Name, Bio, Stadt, Position, Sichtbarkeit, Sprache, Zeitstempel, „mit Apple angemeldet“ ja/nein), Teams, Spielteilnahmen, Kommentare, Statistik, Abzeichen, Zuverlässigkeit, Buchungen/Zahlungen/Belege, Mitteilungen (höchstens 500), MVP-Stimmen, Hallenbewertungen, Kartendaten (Kunden-ID, Marke, letzte vier Ziffern, Mandat, Abbuchungen, Erstattungen, Streite). **Nicht enthalten** (nicht ausgewählt): `age_confirmed_at`, Spitzname, Akzentfarbe, Trikotnummer, Lieblingsverein, starker Fuß, Avatar-URL, Clips, Verwarnungen, Push-Abos, Einstellungen, `audit_log`, `delivery_log`, Medien, Turnier-Spieler, Beweisprotokoll-Akteure; die `apple_id`-Kennung selbst und fremde Namen (Zahler/Platz-Spieler) ausdrücklich nicht.

## 14. Konto-Löschung (was genau passiert)
Das Konto wird **anonymisiert, nie als Zeile gelöscht** (`account.ts:137-140,271-291`). **Anonymisiert:** Name „Gelöschter Nutzer“, E-Mail `geloescht-<id>@geloescht.invalid`; auf NULL: `google_id`, `apple_id`, `avatar_url`, `city`, `bio`, `nickname`, `accent_color`, `shirt_number`, `favorite_club`, `strong_foot`, `position`; `is_verified_pro = false`, `profile_public = false`, `banned_at` gesetzt. **Gelöscht:** `team_members`, `comments`, Avatar und Spielfotos, `notifications` (mit `delivery_log`), `push_subscriptions`, `notification_prefs`, `mvp_votes`, `user_badges`, `player_stats`, `user_reliability`, `payment_profiles`, `payment_setup_intents`, Begründungs-Klartext zu den eigenen Beweiseinträgen. **Auf NULL:** `venue_reviews.body/user_id`, `evidence_actor.user_id/name/email`, `tournaments.venue_confirmed_by`, übernommene Anteile in `tournament_players`, `venue_access` (Zugänge und Adresse). **Bleibt:** Spiele, Ergebnisse, Buchungen, Zahlungen, Belege, `audit_log`, Beweis-Hashes, Teamlogo, `age_confirmed_at`/`terms_accepted_at`/`onboarded_at`/`created_at`/`locale`/`role`. **Sperren der Löschung:** Admin-Rolle, Guthaben, offene Spiele (bis 6 Stunden nach Anstoß), offene Abbuchungen/Erstattungen/Streite, laufendes Turnier, einziger Team-Admin eines Teams mit Mitgliedern, gerade laufende Karteneinrichtung (`account.ts:146-249`).
