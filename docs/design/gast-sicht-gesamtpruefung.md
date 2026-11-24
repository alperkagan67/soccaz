# Gast-Sicht-Gesamtprüfung (AC-17, Dauertest)

Stand: 2026-11-24 · Code-Stand `origin/main` df081e6 · Verfasser: worker-4 · Auftrag: t2s/t2q (Entscheid Datenschutz/AC-17, Namen A bis D)

Zweck: Als **Gast** (nicht angemeldet) steht in keiner öffentlichen Seite und in keinem API-Kanal ein Klarname, ein Nachname oder eine Nutzer-Kennung. Gäste und reine Hallenbetreiber sehen Personen nur als **Initialen** (Veranstalter der Privatspiel-Einladung: „Vorname + Initial“), angemeldete Nutzer Name und Link wie bisher (Sichtbarkeitsmatrix Vertrag 013 G1). Teamnamen und Hallennamen sind keine Personennamen.

## Wie der Dauertest arbeitet

- **Routenliste aus dem Verzeichnis:** `tests/unit/gast-sicht-routen.test.ts` leitet alle Routen aus `src/app` ab (`page.tsx`, `route.ts`, `opengraph-image`, `sitemap`, `robots`, `manifest`, `not-found`). Eine **neue Route ohne Eintrag** in `tests/e2e/gast-sicht-routen.ts` (und in dieser Datei) macht den Test rot; ein Eintrag ohne Route auch. Admin- und Konto-Routen müssen als „angemeldet“ geführt sein, als „statisch“ geführte Seiten dürfen kein Personen-Servermodul importieren.
- **Gast-Probe mit Seed:** `tests/e2e/gast-sicht-gesamt.spec.ts` (eine bestehende E2E-Instanz, kein eigener Server, ein Test) legt Personen mit erkennbaren Namen an („Zorro Vollname…“, „Kapitan Vollname…“, „Mitspieler Vollname…“) in allen Rollen (Kommentar-Autor, Torschütze, Spieler des Spiels, Rangliste, Mitspieler, Turnier-Veranstalter, Captain und Spieler, Lobby, offene Lobby, Privatspiel-Veranstalter) und ruft **jede** Route der Registry als Gast ab: HTML, RSC-Nutzlast (Header `RSC: 1`), JSON, SSE (erste Nachricht), Bild-Antworten (Typ), `robots.txt`, `sitemap.xml`.
- **Vakuum-Schutz:** Jede Probe belegt, dass die Seite antwortet (Status) und ihren Marker trägt; bei Seiten mit Personen müssen die Initialen („>ZV<“) im Gast-HTML **vorkommen**, die RSC-Nutzlast ist nicht leer. Erst danach gelten die Negativprüfungen (kein Name, kein Nachname, keine Kennung; der Fehlertext nennt den Treffer samt Umgebung).
- **Angemeldet-Routen:** der Gast bekommt Status 401, 403, 404 oder 405 oder landet im Browser **exakt** auf `/anmelden` (nie ein Textvergleich mit „Anmelden“); Belege, Rechnungen und das Beweisprotokoll werden mit **echten Kennungen** abgerufen (erwartet 401, 401, 404), damit ein fehlender Zugangsschutz ein PDF liefern würde statt eines unterscheidbaren 404. Zusätzlich prüft der Unit-Test, dass jede angemeldet geführte Route in Datei oder Layout einen Zugangsschutz hat.
- **Profilbilder:** die Seed-Personen haben ein Profilbild (`/api/media/<UUID>`); dieser Pfad darf in keiner Gast-Seite stehen (Spielfotos sind bewusst öffentlich, Backlog 243).
- **Benannte Ausnahmen** (nie stillschweigend): die eigene Kennung im Weiterleitungsziel `/anmelden?next=/spieler/<id>` und „Zorro V.“ als Veranstalter der Einladung (`AUSNAHME` in der Spec); `/api/media/<id>` (Backlog 243).
- **Mutationen** (rot, danach grün): Kommentar-Autor mit Namen, Live-JSON mit Namen, React-Schlüssel mit Nutzerkennung in der Lobby, neue Route ohne Eintrag.

## Fund beim ersten Lauf (behoben im selben PR)

Die Lobby und die Teamseite gaben für Gäste die **Nutzerkennung als React-Schlüssel** in die RSC-Nutzlast (`<li key={p.userId}>` in `lobby/[id]/page.tsx` für Teilnehmer und wartende Spieler, `teams/[slug]/page.tsx` für den Kader): Schlüssel stehen in der Flight-Nutzlast der ausgelieferten Seite. Jetzt `personRef(...).key` (für Nicht-Mitglieder ein Positions-Schlüssel ohne Kennung).

## Geprüft mit Seed (Gast-Probe)

| Route | Kanal und Beleg | Test |
|---|---|---|
| `/` | Startseite und Lobby-Board: Spieler nur als Initialen (guest-board.ts) (Kanal: html+rsc, Initialen belegt, Marker `Hallenfußball`) | gast-sicht-gesamt.spec.ts |
| `/spiele` | Spieleliste: nur Team-Namen und Ergebnisse (Kanal: html, Marker `Livescore`) | gast-sicht-gesamt.spec.ts |
| `/spiele/[id]` | Spielbericht: Torschütze und Spieler des Spiels als Initialen (PR C) (Kanal: html+rsc, Initialen belegt, Marker `Spielverlauf`) | gast-sicht-gesamt.spec.ts; spielbericht-namen.spec.ts (Rollen, Karte, Verlauf) |
| `/spiele/[id]/opengraph-image` | og:image des Spiels = matchCard: Torschützen nur Initialen (R-T382) (Kanal: bild, Marker `image/png`) | gast-sicht-gesamt.spec.ts; match-card-namen.test.ts |
| `/rangliste` | Torjäger und Beste Spieler: Initialen ohne Link (PR B) (Kanal: html+rsc, Initialen belegt, Marker `Torjäger`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts |
| `/spieler` | Spielerliste: Initialen ohne Link, keine Namenssuche (PR B) (Kanal: html+rsc, Initialen belegt, Marker `Spieler`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts |
| `/spieler/[id]` | Profil: Gast wird zur Anmeldung geleitet (Browser-Ziel exakt /anmelden), kein Name im Text (PR D) (Kanal: anmeldung, Marker `/anmelden`) | gast-sicht-gesamt.spec.ts; spieler-profil-gast.spec.ts, spieler-profil-gast.test.ts |
| `/teams/[slug]` | Team: Kommentare (Initialen), Torjäger namenfrei, Karten neutral (PR A, cardViewerFor) (Kanal: html+rsc, Initialen belegt, Marker `Kommentare`) | gast-sicht-gesamt.spec.ts; kommentar-namen.spec.ts |
| `/teams/[slug]/opengraph-image` | og:image des Teams: nur Teamname und Stadt (Kanal: bild, Marker `image/png`) | gast-sicht-gesamt.spec.ts |
| `/turniere` | Turnierliste: Turnier- und Teamnamen, kein Veranstalter-Klarname (Kanal: html, Marker `Turniere`) | gast-sicht-gesamt.spec.ts |
| `/turniere/[id]` | Turnier: Veranstalter als Vorname + Initial (t2q), Captain und Spieler als Initialen (PR B) (Kanal: html+rsc, Marker `Captain:`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts (Rollen) |
| `/lobby/[id]` | Lobby: Teilnehmer und Rest-Kader als Initialen (5a, #302) (Kanal: html+rsc, Initialen belegt, Marker `game-number`) | gast-sicht-gesamt.spec.ts |
| `/lobby/offen/[entryId]` | Offene Lobby: Namen nur für Teammitglieder, Gäste nur Anzahl (PR B) (Kanal: html+rsc, Marker `open-lobby-team`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts (Rollen) |
| `/einladung/[token]` | Team-Einladung: Teamname, Stadt, Spielerzahl, keine Namen (Kanal: html, Marker `Du wurdest eingeladen`) | gast-sicht-gesamt.spec.ts |
| `/spiel/[token]` | Privatspiel-Einladung: Veranstalter als Vorname + Initial (PR B, t2q) (Kanal: html+rsc, Marker `game-organizer`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts |
| `/mitspieler` | Mitspieler gesucht: Initialen ohne Link, keine Position (PR B) (Kanal: html+rsc, Initialen belegt, Marker `Mitspieler gesucht`) | gast-sicht-gesamt.spec.ts; namen-listen.spec.ts |
| `/suche` | Spielsuche: Lobby-Board mit Initialen (Kanal: html+rsc, Initialen belegt, Marker `Offene Lobbys`) | gast-sicht-gesamt.spec.ts |
| `/matchmaking` | Lobby aufmachen: offene Suchen und Warteschlange, Namen nur Mitglieder (Kanal: html+rsc, Marker `Lobby aufmachen`) | gast-sicht-gesamt.spec.ts |
| `/suche/[id]` | Spielsuche-Detail: Kader als Initialen (GuestRoster) (Kanal: html+rsc, Initialen belegt, Marker `Spielsuche`) | gast-sicht-gesamt.spec.ts |
| `/overlay/[id]` | Overlay: nur Teamnamen und Spielstand (Kanal: html, Marker `overlay`) | gast-sicht-gesamt.spec.ts |
| `/hallen/[id]` | Halle: Bewertungen mit Autor als Initialen (PR A, Comments) (Kanal: html+rsc, Initialen belegt, Marker `Bewertungen`) | gast-sicht-gesamt.spec.ts |
| `/api/spiele/[id]/live` | öffentliches Spielstand-JSON: Torschützen immer Initialen (PR C) (Kanal: json, Marker `goals`) | gast-sicht-gesamt.spec.ts; live-kanaele-namen.test.ts |
| `/api/spiele/[id]/events` | SSE Spiel: nur event: update, keine Nutzdaten (Kanal: sse, Marker `verbunden`) | gast-sicht-gesamt.spec.ts; live-kanaele-namen.test.ts |
| `/api/spiele/stream` | SSE Livescore: nur update (Kanal: sse, Marker `verbunden`) | gast-sicht-gesamt.spec.ts; live-kanaele-namen.test.ts |
| `/api/lobby/[id]/events` | SSE Lobby: nur update (Kanal: sse, Marker `verbunden`) | gast-sicht-gesamt.spec.ts |
| `/api/karte/[id]` | Spielbericht-Karte als Bild: Torschützen nur Initialen (R-T382) (Kanal: bild, Marker `image/png`) | gast-sicht-gesamt.spec.ts; match-card-namen.test.ts |
| `/robots` | robots.txt sperrt /spieler/ (PR D) (Kanal: text, Marker `Disallow: /spieler/`) | gast-sicht-gesamt.spec.ts; spieler-profil-gast.test.ts |
| `/sitemap` | Sitemap: Teams, Hallen, feste Seiten, keine Spielerprofile (Kanal: text, Marker `<urlset`) | gast-sicht-gesamt.spec.ts |

## Statisch (keine Personendaten)

| Route | Kanal und Beleg | Test |
|---|---|---|
| `/teams` | Teamliste: nur Teamname, Stadt und Spielerzahl (Teamnamen sind keine Personennamen) | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/hallen` | Hallenliste: Hallenname, Stadt, Bewertung (keine Personen) | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/anmelden` | Anmeldeformular | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/agb` | Rechtstext | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/datenschutz` | Rechtstext | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/hausordnung` | Rechtstext | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/hilfe` | Hilfetext | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/impressum` | Rechtstext (Betreiberangaben stehen im Impressum bewusst) | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/kontakt` | Betreiberangaben (Kontaktadresse), bewusst wie das Impressum | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/offline` | PWA-Offline-Seite | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/unter-16` | Endseite nach Konto-Löschung, keine Daten | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/ligen` | zurückgestellt und ausgeblendet (Vertrag 013): Liganamen und Teams | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/ligen/[id]` | zurückgestellt und ausgeblendet (Vertrag 013): Tabelle mit Teamnamen | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/profitag` | zurückgestellt und ausgeblendet (Vertrag 013): Termine | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/profitag/[id]` | zurückgestellt und ausgeblendet (Vertrag 013): bewerbende Teams | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/manifest` | PWA-Manifest | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/not-found` | 404-Seite | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/api/health` | Zustandsabfrage ohne Daten | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |
| `/api/sponsor/[id]` | Weiterleitung auf die Sponsor-Adresse, zählt den Klick | gast-sicht-gesamt.spec.ts (antwortet, kein Seed-Name), gast-sicht-routen.test.ts (kein Personen-Modul) |

## Nur Angemeldete und Admins (Gast: Weiterleitung, 401, 403, 404, 405)

| Route | Kanal und Beleg | Test |
|---|---|---|
| `/admin` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/beweis` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/buchungen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/einstellungen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/finanzen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/finanzen/ausgaben` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/finanzen/export` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/finanzen/rechnungen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/finanzen/spiel/[id]` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/hallen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/hallen/anfragen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/ligen` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/moderation` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/nutzer` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/profitag` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/protokoll` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/spiele` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/sponsoren` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/teams` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/zahlungsstreit` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/admin/zahlungsstreit/[id]` | Admin-Bereich: requirePermission/requireAdmin, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/benachrichtigungen` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/einstellungen` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/guthaben` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/privatspiel/neu` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/suche/neu` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/teams/neu` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/app/turniere/neu` | Konto-Bereich (/app): requireUser, der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/halle` | Hallenbetreiber-Bereich: requireUser | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/halle/anfragen` | Hallenbetreiber-Bereich: requireUser | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/willkommen` | Einrichtung nach der Anmeldung: der Gast wird zur Anmeldung geleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/lobby/[id]/uebersicht` | Spielübersicht nur für Beteiligte: der Gast wird umgeleitet | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/belege/[id]` | Beleg-PDF: getCurrentUser, 401 ohne Anmeldung | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/rechnungen/[id]` | Rechnungs-PDF: getCurrentUser, 401 ohne Anmeldung | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/beweis/[matchId]` | Beweisprotokoll-PDF: Admin 1 | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/beweis/kette` | Beweisprotokoll-Export: Admin 1 | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/mein-konto/export` | Datenexport des eigenen Kontos: Anmeldung | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |
| `/api/media` | Bild-Upload (POST): Anmeldung | gast-sicht-gesamt.spec.ts (Gast bekommt Weiterleitung oder 401/403/404/405), gast-sicht-routen.test.ts |

## Intern (kein Gast-Zugriff vorgesehen)

| Route | Kanal und Beleg | Test |
|---|---|---|
| `/api/auth/[...nextauth]` | Auth.js: Anmelde- und Sitzungsendpunkte | gast-sicht-routen.test.ts (Eintrag mit Begründung) |
| `/api/jobs/[name]` | Job-Endpunkt mit Geheimnis (Cron), kein Gast-Zugriff vorgesehen | gast-sicht-routen.test.ts (Eintrag mit Begründung) |
| `/api/stripe/webhook` | Stripe-Webhook (POST, Signatur) | gast-sicht-routen.test.ts (Eintrag mit Begründung) |
| `/api/webhooks/stripe` | Stripe-Webhook (POST, Signatur) | gast-sicht-routen.test.ts (Eintrag mit Begründung) |
| `/dev/komponenten` | Entwickler-Showcase, nur außerhalb von Produktion (404 dort) | gast-sicht-routen.test.ts (Eintrag mit Begründung) |

## Ausnahme (zeigt bewusst Daten, Entscheid benannt)

| Route | Kanal und Beleg | Test |
|---|---|---|
| `/api/media/[id]` | liefert Bilder öffentlich per UUID (Profilbilder, Spielfotos; Gesichter, keine Namen): Backlog 243, Produktfrage Sichtbarkeitsmatrix 013 | gast-sicht-routen.test.ts (Eintrag mit Begründung) |

## Grenzen

- Geprüft wird der **Gast** (nicht angemeldet). Die Sicht des reinen Hallenbetreibers und der Rollen Spieler, Captain und Plattform-Admin je Seite belegen die Rollentests der PRs A bis D (`kommentar-namen`, `namen-listen`, `spielbericht-namen`, `spieler-profil-gast`).
- **Bilder:** die Probe prüft nur den Typ (`image/png`) der Antwort; der Inhalt (Torschützen als Initialen) ist per Quelltext-Pin und Funktionstest gesichert (`match-card-namen.test.ts`).
- Die Probe nutzt Teamnamen ohne Personennamen; ein Team, das seinen Namen nach einer Person nennt, wird nicht erkannt (Teamnamen sind keine Personennamen, Entscheid t2q).
- `/api/media/<id>` liefert Bilder öffentlich per UUID (Gesichter ohne Namen): Backlog 243.
- Bereits ausgelieferte Altbestände (Caches, Suchmaschinen): Go-Live-Audit G31-013 und Rechtsliste („Sichtbarkeit von Spielernamen“).
