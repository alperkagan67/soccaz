# Socaz (SoccaV2)

Matchmaking für Hobby-Hallenfußball. Team gründen, Spieler per Link einladen, Gegner finden, Lobby, Ergebnis, Statistik. Start: NRW.

> Status: Phase 1 im Aufbau. Fertig: Login, Onboarding (ab 16), Team gründen, Einladungslinks, Teamseite. Als Nächstes: Spielsuche und Lobby.

## Technik

Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind 4, PostgreSQL, Drizzle ORM, Auth.js (Google), Zod, Vitest, Playwright.

## Lokal starten

Voraussetzungen: Node 22, PostgreSQL 16 oder neuer.

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run db:migrate
npm run dev
```

Umgebungsvariablen (`.env.local`):

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `AUTH_SECRET` | Geheimer Schlüssel für Sitzungen, z. B. `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google-OAuth-Zugangsdaten. Redirect-URI: `http://localhost:3000/api/auth/callback/google` |

Ohne Google-Zugangsdaten steht lokal ein Dev-Login zur Verfügung. Er ist in Produktion abgeschaltet.

## Tests

```bash
npm run typecheck
npm test            # Unit-Tests
npm run test:e2e    # Browser-Tests, Dev-Server muss laufen (E2E_BASE_URL setzen, falls nicht Port 3100)
```

## Dokumentation

- [PLAN.md](PLAN.md): Vision, Rollen, Phasen, Entscheidungen
- [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) und [docs/ARCHITEKTUR-DETAIL.md](docs/ARCHITEKTUR-DETAIL.md): Diagramme (Mermaid)
- [docs/architektur.html](docs/architektur.html): alle Diagramme im Browser (Datei herunterladen und öffnen)
