# Product

<!-- impeccable:product-schema 1 -->

> Abgeleitet aus Code und docs/ (CLAUDE.md, docs/ARCHITEKTUR.md, src/). Es gab kein Interview: Aussagen, die nur aus dem Repository folgen, sind mit **(abgeleitet)** markiert und vom Projektinhaber noch zu bestätigen.

## Platform

web

## Stack

Next.js (App Router, Cache Components), Postgres mit Drizzle, Tailwind v4 (`@theme inline` in `src/app/globals.css`), Schriften Outfit und Plus Jakarta Sans über `next/font`. Installierbare PWA (Service Worker, Manifest, Web-Push). Sprache Deutsch (de-DE, Zeitzone Europe/Berlin), weitere Sprachen über `getT()`.

## Users

- **Spieler und Teamkapitäne im Hallenfußball (NRW)**, meist am Handy, oft unterwegs oder in der Halle. Sie wollen Gegner finden, einen Termin klären, ihren Anteil zahlen und am Spieltag wissen, wo sie hin müssen. **(abgeleitet)**
- **Zuschauer** ohne Konto: Spielsuchen, Teamseiten, Livescore und Ranglisten sind öffentlich.
- **Betreiber, Finanzen, Moderation, Hallen- und Turnierveranstalter** arbeiten im Admin-Bereich (`/admin`) am Desktop.
- **Profis** (Profi-Tag), **Sponsoren** und **Streamer** (OBS-Overlay) sind Nebenrollen.
- Minderjährige: unter 16 wird das Konto gelöscht; Jugendschutz zählt.

## Product Purpose

Soccaz bringt Hallenfußballteams zusammen: Team gründen, Spieler einladen, Gegner suchen oder herausfordern, Termin und Halle gemeinsam festlegen, den Hallenpreis pro Spieler teilen und bezahlen, spielen, Ergebnis und Elo festhalten. Dazu Ligen, Turniere, Profi-Tag und Stadt-Challenge. Erfolg heißt: ein bestätigtes, bezahltes Spiel mit vollem Kader, ohne dass jemand in WhatsApp-Gruppen hinterherlaufen muss.

## Positioning

Ein Ablauf aus einer Hand, den eine Chat-Gruppe nicht leistet: Gegnersuche nach Spielstärke (Elo, Stufe 1 bis 5), gemeinsame Terminwahl mit Hallen-Veto, geteilte Miete mit Erstattungsfristen, Ampel pro Spieler (in der Lobby, bereit und bezahlt, bestätigt) und Privatspiele per Einladungslink.

## Operating Context

- Meist mobil, einhändig, mit schlechtem Netz in Hallen; Touch-Ziele mindestens 44 px, `BottomNav` am Handy, Kopfleiste ab `sm`.
- Zeitkritische Abläufe: Fristen (48 h Austritt, 24 h Absage), Lobby in Echtzeit (SSE), Push-Nachrichten.
- Geld ist real: Guthaben, Aufladen, Anteile, Erstattungen, Belege als PDF. Zahlungsstatus muss auf einen Blick eindeutig sein.
- Teilen per WhatsApp (Einladungslink, „Teilen“ je Spiel) ist ein Kernweg, kein Beiwerk.
- Jedes Spiel hat eine Spielnummer (`#42`), die Teams im Gespräch benutzen.

## Capabilities and Constraints

- Spielarten: Teamspiel (Lobby, Herausforderung, offene Suche), Privatspiel (Miete teilen, Einladungslink, nicht öffentlich), Liga, Turnier (Bracket, Eintritt pro Spieler), Profi-Tag.
- Sichtbarkeit: Privatspiele und Kader sind für Fremde unsichtbar oder neutral; Fremde und Anonyme sehen dieselbe Fehlerseite wie bei einem nicht vorhandenen Spiel. Gestaltung darf nichts offenlegen, was die Datenschutzregeln verbergen.
- Nicht festgelegt: Markenfarbe als verbindlicher Wert, Wortmarke jenseits des Textlogos „SOCAZ“, Sprachumfang außerhalb Deutsch.
- Öffentliches Repo: keine Secrets, keine echten Namen oder Kontodaten in Beispielen.

## Brand Commitments

- Name „Socaz“, Wortmarke in Versalien „SOCAZ“ mit Logo (`public/brand/socca-logo.jpeg`, `socaz-logo.jpg`). Das Logo ist ein Bild und bleibt bestehen.
- Vorhandene Markenbilder: `public/brand/stadium-hero.png`, vier „socca-reel“-Aufnahmen.
- Bestehende Ampel-Semantik (rot, orange, grün) in der Lobby ist Produktvertrag und bleibt erkennbar.
- Ansprache: Du-Form, direkt, deutsch („Gegner gesucht“, „Zur Lobby“). **(abgeleitet)**

## Evidence on Hand

- Echte Oberflächen: Startseite, Spielsuche, Live (`/spiele`), Rangliste, Lobby (`/lobby/[id]`), „Meine Spiele“ (`MyGames`), Team-, Spieler- und Hallenseiten, Admin.
- Keine Kundenstimmen, keine Zahlen zu Nutzern, keine Pressestimmen im Repo: nicht erfinden.

## Product Principles

1. **Der nächste Schritt zuerst.** Jede Ansicht zeigt, was der Nutzer jetzt tun muss (zahlen, bereit machen, Termin wählen), vor Statistik.
2. **Geld und Status sind unmissverständlich.** Bezahlt, offen, erstattet, Frist: nie nur über Farbe, immer mit Text.
3. **Handy in der Halle.** Einhändig, große Ziele, wenig Text, funktioniert bei schlechtem Netz.
4. **Teilen ist der Wachstumsweg.** Spielnummer und Link sind Gestaltungsobjekte.
5. **Sichtbarkeit ist Produktentscheidung.** Öffentliche und private Daten sind gestalterisch getrennt, nichts „scheint durch“.

## Accessibility & Inclusion

- Touch-Ziel mindestens 44 px, sichtbarer Fokus, `prefers-reduced-motion` wird beachtet (in `globals.css`).
- Die Ampel braucht neben der Farbe immer Text oder Form (bei Rot-Grün-Schwäche), derzeit steht der Text nur in der Legende. **(abgeleitet, Lücke)**
- Deutsche Beschriftungen, kein Fachjargon; `lang` wird pro Sprache gesetzt.
