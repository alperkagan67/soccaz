# Größe für das Turnier am 12.12. (16 Teams, ca. 100 Spieler)

Stand: 2026-11-24, Paket (c) von w1. **Alle Zahlen sind aus dem Code gerechnet bzw. geschätzt, NICHT gemessen.** Gemessen wird auf Staging mit `scripts/last-light.mjs` (unten); danach sind die Schätzwerte hier zu ersetzen.

## 1. Was im Code tatsächlich Last erzeugt (belegt)

| Baustein | Befund (Quelle) | Folge |
|---|---|---|
| Live-Verbindungen (SSE) | `src/server/sse.ts`: je Verbindung ein Eintrag in einem Ereignis-Verteiler im Arbeitsspeicher, Herzschlag alle 25 s; `src/server/realtime.ts`: **ein einziger** gemeinsamer Datenbank-Hörer (`LISTEN`) für alle | Eine Live-Verbindung braucht **keine** eigene Datenbankverbindung, nur einen offenen Socket und wenige KB Speicher |
| Datenbank-Pool der App | `src/db/index.ts`: `new Pool({ connectionString })`, **keine** Größenangabe = Standard des Treibers **10** | höchstens 10 gleichzeitige Abfragen der Seiten |
| Zeitplaner | `src/server/scheduler.ts`: pg-boss mit eigenem Pool (Standard 10), `ENABLE_SCHEDULER=1` in `docker-compose.yml` | bis zu 10 weitere Verbindungen |
| Datenbank-Grenze | Postgres 17 Standard `max_connections = 100` (`docker-compose.yml`, keine Anpassung) | 10 + 10 + 1 Hörer = **21 von 100**, genug Luft |
| Speicher/CPU-Grenzen | `docker-compose.yml`: **keine** `mem_limit`/`cpus`, kein `NODE_OPTIONS`; Next.js `output: "standalone"`, **ein** Node-Prozess | ein Prozess = ein Kern für das Rendern; Postgres und Caddy teilen sich denselben Server |
| Das eigentliche Lastmuster | `src/components/LiveIndicator.tsx`: bei **jedem** Ereignis UND alle 30 s ruft jeder Browser `router.refresh()` (= eine Server-Darstellung der Seite mit ihren Datenbankabfragen) | Die Last kommt nicht von den Sockets, sondern von den **Neu-Darstellungen**: n Zuschauer ≈ n/30 Darstellungen je Sekunde als Grundlast, und bei jeder Änderung eines Spiels **alle gleichzeitig** (Herdeneffekt) |

## 2. Rechnung (Annahmen sichtbar)

Annahmen: bis zu 100 Spieler plus Zuschauer, **gleichzeitig angemeldet auf Spiel-/Turnierseiten höchstens 150**; eine Darstellung einer Spielseite kostet ca. 30 bis 80 ms Rechenzeit und 5 bis 15 Abfragen (Schätzung, am Staging zu messen); ein Ergebnis wird etwa alle 1 bis 2 Minuten irgendwo im Turnier gemeldet (mehrere Plätze parallel).

- **Grundlast:** 150 / 30 s = **5 Darstellungen/s** ≈ 0,15 bis 0,4 Kern. Unkritisch.
- **Spitze bei einer Änderung** (nur Zuschauer EINES Spiels hängen am Ereignis-Kanal des Spiels, ca. 10 bis 30 Personen): 30 Darstellungen gleichzeitig ≈ 1 bis 2,5 s Rechenzeit, auf **einem** Kern also bis ca. 2,5 s Wartezeit für die Letzten. Liefe auch der gemeinsame Kanal (`/api/spiele/stream`, 150 Hörer) im Turnierbetrieb nicht gesperrt, wären es 150 gleichzeitig = ca. 5 bis 12 s. **Er ist bei `TURNIER_ONLY=1` gesperrt (403)**: das ist hier ein Vorteil.
- **Datenbank-Pool 10:** 30 gleichzeitige Darstellungen reihen sich hinter 10 Verbindungen ein; bei 5 bis 15 Abfragen je Darstellung ca. 3 bis 8 Wellen à einige ms: erwartet **unter 1 s** zusätzlich. Kein Engpass, solange die Abfragen schnell sind.
- **Live-Sockets:** bis 150 offene Verbindungen × wenige KB = **unter 20 MB**. Der Datei-Deskriptor-Standard (1024 je Prozess) ist weit weg.
- **Arbeitsspeicher:** Next.js-Prozess ca. 300 bis 600 MB (Schätzung, wächst mit Seiten-Cache), Postgres mit Standardwerten ca. 150 bis 400 MB, Caddy unter 50 MB: **zusammen unter 1,5 GB**.

## 3. Empfehlung Mindestgröße

- **Mindestens: 2 vCPU und 4 GB RAM** (die Größe aus `docs/BETRIEB.md`, Hetzner CX22). Das reicht nach der Rechnung für 16 Teams und 100 Spieler, mit Engpass nur bei der gleichzeitigen Neu-Darstellung (Spitzen von 1 bis 3 s).
- **Empfohlen für den Turnierzeitraum (Fr 11.12. bis So 13.12.): 4 vCPU und 8 GB RAM** (eine Stufe größer), weil es billig ist (nur für die Tage; Hetzner erlaubt die Größenänderung mit kurzem Neustart) und die Spitzen halbiert (zwei Kerne für Node-Darstellung, Datenbank und Caddy bekommen eigene Luft). Entscheidung über die Kosten beim Nutzer.
- **Nicht nötig:** zweiter App-Server, Lastverteiler, Pool-Änderung, Postgres-Tuning. Nicht anfassen vor dem 12.12.

## 4. Messen auf Staging (vor dem Code-Freeze-Test, Generalprobe 30.11. bis 2.12.)

Gleiche Servergröße wie Produktion verwenden (sonst sagt die Messung nichts). Ein Lauf nach dem anderen, Staging mit `SMOKE_BASIC_AUTH` in der eigenen Shell:

```
node scripts/last-light.mjs https://<Staging-Adresse> --gleichzeitig 20 --anfragen 300
node scripts/last-light.mjs https://<Staging-Adresse> --gleichzeitig 60 --anfragen 1000
node scripts/last-light.mjs https://<Staging-Adresse> --gleichzeitig 30 --anfragen 300 --sse 60 --sse-pfad /api/spiele/<id>/events --sse-sekunden 30
```

Der dritte Lauf prüft die Live-Verbindungen eines Spiels (die Events-Route verlangt Anmeldung und Berechtigung: ohne Anmeldung kommt 401/403 und zählt als "abgewiesen"; für einen echten Haltetest ein Turnierspiel mit Anmeldung von Hand öffnen und parallel die Messung laufen lassen). Das Skript macht **nur GET**, **verweigert die Produktion** (ohne `--produktion-bestaetigt`), bricht bei Fehlerrate über 20 % ab und hält höchstens 100 Verbindungen gleichzeitig.

**Auswertung (Schwellen für "im Rahmen"):** p95 unter 1,5 s bei 60 gleichzeitig, Fehlerrate unter 1 %, kein Abbruch. Während des Laufs auf dem Staging-Server `docker stats` beobachten (CPU-Auslastung des App-Containers unter 80 %, Speicher unter 60 % des Servers). Liegen die Werte darüber: erst eine Größe hoch, dann erneut messen.

## 5. Offen / Grenzen der Aussage

- Die Darstellungszeit je Seite ist **angenommen**; sie bestimmt die Spitzen am stärksten. Der Staging-Lauf liefert sie.
- Das Skript misst öffentliche Seiten ohne Anmeldung (Startseite, Turniere, Hilfe, Teams, Anmelden, Impressum), **nicht** die angemeldeten Spielseiten mit ihren Abfragen. Die Spielseite kostet mehr; deshalb der Puffer in der Empfehlung.
- Zahlungen sind in Produktion aus: keine zusätzliche Last durch Karten oder Webhooks.
- Backlog-Kandidat (nach dem 12.12., kein Code vor dem Freeze): `router.refresh()` im `LiveIndicator` entschärfen (zufällige Verzögerung bis 2 s, damit nicht alle Zuschauer im selben Moment neu darstellen).
