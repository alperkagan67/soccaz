import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { closeContexts, closeTestDb, run, seedUser } from "./helpers";
import { query } from "./helpers-db";
import { ROUTEN, type Eintrag } from "./gast-sicht-routen";

// AC-17 Gast-Sicht-Gesamtprüfung (Dauertest, Entscheid t2q 2026-11-24): ALLE Routen aus src/app (Registry tests/e2e/gast-sicht-routen.ts, abgeleitet und gepinnt durch tests/unit/gast-sicht-routen.test.ts)
// werden als Gast abgerufen. Ein Seed mit erkennbaren Namen ("Zorro Vollname", "Kapitan Vollname") steht in allen Rollen (Kommentar-Autor, Torschütze, Spieler des Spiels, Rangliste, Mitspieler, Turnier, Lobby, Einladung, ...).
// Je Probe: Vakuum-Schutz (die Seite antwortet und trägt ihren Marker; bei Initialen steht ">ZV<" drin), kein Klarname, kein Nachname, keine Kennung, kein Profilbild-Pfad in HTML, RSC-Nutzlast, JSON, SSE und Bild-Antworten.
// "angemeldet": der Gast bekommt Status 401/403/404/405 oder landet im Browser exakt auf /anmelden (nie ein Textvergleich); Belege, Rechnungen und das Beweisprotokoll werden mit ECHTEN Kennungen abgerufen.
// Es wird kein HTML per Regex bereinigt: Namen und Initialen werden im Roh-HTML gesucht, Ziele und Texte über Browser und Statuscodes geprüft.
// Doku: docs/design/gast-sicht-gesamtpruefung.md. Neue Route ohne Eintrag: rot im Unit-Test.
test.describe.configure({ mode: "serial" });
test.setTimeout(480_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});
test.afterAll(async () => {
  await closeTestDb();
});

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const NAME = `Zorro Vollname${run}`;
const NAME_Y = `Kapitan Vollname${run}`;
const NAME_M = `Mitspieler Vollname${run}`;
const NACHNAME = `Vollname${run}`;
const NULL_ID = "00000000-0000-4000-8000-000000000000";

type Seed = { ids: Record<string, string>; secrets: string[]; avatare: string[] };

async function seed(): Promise<Seed> {
  const z = await seedUser("gsz", NAME);
  const y = await seedUser("gsy", NAME_Y);
  const m = await seedUser("gsm", NAME_M);
  const rival = await seedUser("gsr", "Gegner Beispiel");
  // Profilbilder: ihre Pfade dürfen in keiner Gast-Seite stehen (Backlog 243: /api/media ist öffentlich, die Verweise darauf sind es nicht)
  const avatare = [z, y, m].map(() => `/api/media/${randomUUID()}`);
  for (const [i, u] of [z, y, m].entries()) await query("update users set avatar_url = $1 where id = $2", [avatare[i], u]);
  const mk = async (name: string, slug: string, admin: string) => {
    const [t] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, slug, admin]);
    await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [t.id, admin]);
    return t.id;
  };
  const home = await mk(`Gesamt Heim ${run}`, `e2e-gs-heim-${run}`, z);
  const away = await mk(`Gesamt Gast ${run}`, `e2e-gs-gast-${run}`, rival);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player'), ($1, $3, 'player') on conflict do nothing", [home, y, m]);
  // gespieltes Spiel mit Toren und Spieler des Spiels
  const [played] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at, mvp_user_id) values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour', $3) returning id", [home, away, z]);
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $5)", [played.id, z, home, rival, away]);
  await query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 2, 0, true, true)", [played.id]);
  for (const min of [5, 9]) await query("insert into match_events (match_id, type, user_id, team_id, minute) values ($1, 'goal', $2, $3, $4)", [played.id, z, home, min]);
  // öffentliche Lobby mit Spielern, offene Lobby (Warteschlange), Spielsuche
  const [lobby] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, visibility) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'public') returning id", [home, away]);
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $3), ($1, $5, $6)", [lobby.id, z, home, y, rival, away]);
  const from = new Date(Date.now() + 3 * 86_400_000);
  from.setUTCHours(17, 0, 0, 0);
  const to = new Date(from.getTime() + 3 * 3_600_000);
  const [queue] = await query<{ id: string }>("insert into matchmaking_queue (team_id, created_by, city, duration_min, windows, note, expires_at) values ($1, $2, 'Essen', 60, $3::jsonb, 'Gesamt', now() + interval '2 days') returning id", [home, z, JSON.stringify([{ from: from.toISOString(), to: to.toISOString() }])]);
  const [request] = await query<{ id: string }>("insert into match_requests (team_id, city, starts_at) values ($1, 'Essen', now() + interval '2 day') returning id", [home]);
  // Zahlen und Listen
  await query("insert into player_stats (user_id, matches, goals, elo) values ($1, 12, 5, 1150) on conflict (user_id) do update set matches = 12, goals = 5, elo = 1150", [z]);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await query("insert into free_player_posts (user_id, city, day, note) values ($1, 'Gelsenkirchen', $2, 'Gesamt-Notiz')", [z, tomorrow]);
  // Kommentare auf Team und Halle
  const [venue] = await query<{ id: string }>("insert into venues (name, city, surface, active, approval_status) values ($1, 'Essen', 'Kunstrasen', true, 'approved') returning id", [`Gesamt-Halle ${run}`]);
  await query("insert into player_stats (user_id, matches) values ($1, 4) on conflict (user_id) do update set matches = 4", [y]);
  await query("insert into comments (target_type, target_id, author_id, body) values ('team', $1, $2, 'Gesamt-Kommentar Team'), ('venue', $3, $2, 'Gesamt-Kommentar Halle')", [home, z, venue.id]);
  // Turnier (öffentlich) mit Veranstalter, Captain und Spieler
  const [t] = await query<{ id: string }>(
    `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, final_share_cents, status, registration_deadline, starts_at, is_private, price_round, venue_access_required_snapshot, commission_percent_snapshot)
     values ($1, $2, 'Essen', (now() + interval '5 days')::date, 'knockout', 2, 16000, 8000, 120, 1000, 'payment', now() + interval '3 days', now() + interval '5 days', false, 1, false, 10.00) returning id`,
    [z, `Gesamt-Cup ${run}`],
  );
  await query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at) values ($1, $2, $3, now())", [t.id, home, y]);
  for (const u of [y, m]) await query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3)", [t.id, home, u]);
  // Privatspiel-Einladung (Veranstalter Z) und Team-Einladung
  const [rot] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Rot', $1, 'Essen', $2, 'private') returning id", [`privat-gs-${run}-rot`, z]);
  const [blau] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Blau', $1, 'Essen', $2, 'private') returning id", [`privat-gs-${run}-blau`, z]);
  const [priv] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, kind, visibility) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'private', 'private') returning id", [rot.id, blau.id]);
  const spielToken = `gs-spiel-${run}`;
  const teamToken = `gs-team-${run}`;
  await query("insert into game_invites (token, match_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [spielToken, priv.id, z]);
  await query("insert into invites (token, team_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [teamToken, home, z]);
  // echte Kennungen für die geschützten Datei-Routen (ohne Zugangsschutz gäbe es hier ein PDF, nicht nur ein 404)
  const [receipt] = await query<{ id: string }>("insert into receipts (number, user_id, kind, amount_cents) values ($1, $2, 'topup', 500) returning id", [`GS-B-${run}`, z]);
  const [invoice] = await query<{ id: string }>("insert into invoices (number, venue_id, period, vat_mode, vat_percent, net_cents, vat_cents, gross_cents) values ($1, $2, '2026-11', 'kleinunternehmer', 0, 1000, 0, 1000) returning id", [`GS-R-${run}`, venue.id]);
  return {
    ids: { played: played.id, lobby: lobby.id, queue: queue.id, request: request.id, venue: venue.id, tournament: t.id, z, spielToken, teamToken, homeSlug: `e2e-gs-heim-${run}`, receipt: receipt.id, invoice: invoice.id },
    secrets: [z, y, m],
    avatare,
  };
}

/** Beispielwert für jeden Platzhalter einer Route. */
function urlFor(route: string, s: Seed): string {
  const i = s.ids;
  const map: Record<string, string> = {
    "/spiele/[id]": `/spiele/${i.played}`,
    "/spiele/[id]/opengraph-image": `/spiele/${i.played}/opengraph-image`,
    "/teams/[slug]": `/teams/${i.homeSlug}`,
    "/teams/[slug]/opengraph-image": `/teams/${i.homeSlug}/opengraph-image`,
    "/spieler/[id]": `/spieler/${i.z}`,
    "/turniere/[id]": `/turniere/${i.tournament}`,
    "/lobby/[id]": `/lobby/${i.lobby}`,
    "/lobby/offen/[entryId]": `/lobby/offen/${i.queue}`,
    "/einladung/[token]": `/einladung/${i.teamToken}`,
    "/spiel/[token]": `/spiel/${i.spielToken}`,
    "/suche/[id]": `/suche/${i.request}`,
    "/overlay/[id]": `/overlay/${i.played}`,
    "/hallen/[id]": `/hallen/${i.venue}`,
    "/api/spiele/[id]/live": `/api/spiele/${i.played}/live`,
    "/api/spiele/[id]/events": `/api/spiele/${i.played}/events`,
    "/api/lobby/[id]/events": `/api/lobby/${i.lobby}/events`,
    "/api/karte/[id]": `/api/karte/${i.played}`,
    "/api/belege/[id]": `/api/belege/${i.receipt}`,
    "/api/rechnungen/[id]": `/api/rechnungen/${i.invoice}`,
    "/api/beweis/[matchId]": `/api/beweis/${i.played}`,
    "/admin/finanzen/spiel/[id]": `/admin/finanzen/spiel/${i.played}`,
    "/lobby/[id]/uebersicht": `/lobby/${i.lobby}/uebersicht`,
    "/robots": "/robots.txt",
    "/sitemap": "/sitemap.xml",
    "/manifest": "/manifest.webmanifest",
    "/not-found": `/gibt-es-nicht-${run}`,
  };
  if (map[route]) return map[route];
  if (route.includes("[")) return route.replace(/\[\.\.\.[^\]]+\]/g, "x").replace(/\[[^\]]+\]/g, NULL_ID);
  return route;
}

/** Erwartete Gast-Antwort der geschützten Datei-Routen mit echter Kennung: Belege und Rechnungen prüfen die Anmeldung zuerst (401), das Beweisprotokoll antwortet absichtlich wie bei einer unbekannten Kennung (404). */
const ERWARTET_API: Record<string, number> = { "/api/belege/[id]": 401, "/api/rechnungen/[id]": 401, "/api/beweis/[matchId]": 404 };

const verboten = (s: Seed) => [NAME, NAME_Y, NAME_M, NACHNAME, "Zorro", ...s.secrets, ...s.avatare];

/** Bewusste, benannte Ausnahmen je Route: die eigene Kennung im Weiterleitungsziel ("next=/spieler/<id>"), der Veranstalter heißt "Vorname + Initial" (t2q). */
const AUSNAHME: Record<string, { ohneKennung?: boolean; erlaubt?: string[] }> = {
  "/spieler/[id]": { ohneKennung: true },
  "/spiel/[token]": { erlaubt: ["Zorro V."] },
  "/turniere/[id]": { erlaubt: ["Zorro V."] }, // Veranstalter überall "Vorname + Initial" (t2q)
};

const maskiere = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Entfernt eine erlaubte Zeichenfolge nur als eigenes Wort (Wortgrenze), nie als Teilstring eines längeren Namens. */
function ohneErlaubtes(text: string, erlaubt: string[]): string {
  let t = text;
  for (const ok of erlaubt) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${maskiere(ok)}(?![\\p{L}\\p{N}])`, "gu"), "");
  return t;
}

function pruefeText(text: string, kontext: string, s: Seed, route = "") {
  const a = AUSNAHME[route];
  const t = ohneErlaubtes(text, a?.erlaubt ?? []);
  for (const n of verboten(s)) {
    if (a?.ohneKennung && s.secrets.includes(n)) continue;
    const pos = t.indexOf(n);
    expect(pos, `${kontext}: enthält "${n}" bei ...${pos >= 0 ? t.slice(Math.max(0, pos - 90), pos + n.length + 40).replace(/\s+/g, " ") : ""}...`).toBe(-1);
  }
}

async function sseAnfang(route: string, url: string): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const zeit = setTimeout(() => ctrl.abort(new Error(`${route}: SSE antwortet nicht innerhalb von 20 Sekunden`)), 20_000);
  try {
    const res = await fetch(`${BASE}${url}`, { signal: ctrl.signal });
    if (!res.body) return { status: res.status, text: "" };
    const text = res.status === 200 ? new TextDecoder().decode((await res.body.getReader().read()).value) : await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(zeit);
    ctrl.abort();
  }
}

/** Seite im Browser öffnen und das Ziel nach allen Weiterleitungen (auch dem Weiterleiten im Browser) lesen. */
async function browserZiel(ctx: BrowserContext, url: string, ziel: (u: URL) => boolean): Promise<{ status: number; url: URL }> {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.waitForURL((u) => ziel(u), { timeout: 15_000 }).catch(() => undefined);
    return { status: res?.status() ?? 0, url: new URL(page.url()) };
  } finally {
    await page.close();
  }
}

async function probe(ctx: BrowserContext, request: APIRequestContext, route: string, e: Eintrag, s: Seed) {
  const url = urlFor(route, s);
  if (e.art === "intern" || e.art === "ausnahme") return; // keine Gast-Probe vorgesehen (Begründung in der Registry)
  if (e.art === "geprueft") {
    if (e.probe === "sse") {
      const { status, text } = await sseAnfang(route, url);
      expect(status, `${route}: SSE antwortet`).toBe(200);
      expect(text, `${route}: Marker`).toContain(e.marker);
      pruefeText(text, route, s, route);
      return;
    }
    if (e.probe === "anmeldung") {
      const { url: ziel } = await browserZiel(ctx, url, (u) => u.pathname === "/anmelden");
      expect(ziel.pathname, `${route}: der Gast landet exakt auf /anmelden (nicht nur ein Text mit "Anmelden")`).toBe("/anmelden");
      expect(ziel.searchParams.get("next"), `${route}: Rücksprung auf die angefragte Seite`).toBe(url);
      const res = await request.get(url, { maxRedirects: 0 });
      pruefeText(await res.text(), `${route} (Antworttext)`, s, route);
      return;
    }
    const res = await request.get(url, { maxRedirects: 0 });
    const text = e.probe === "bild" ? "" : await res.text();
    if (e.probe === "bild") {
      expect(res.status(), `${route}: Bild antwortet`).toBe(200);
      expect(res.headers()["content-type"] ?? "", `${route}: Bildtyp`).toContain(e.marker);
      return;
    }
    expect(res.status(), `${route}: Gast-Antwort (${url})`).toBe(200);
    expect(`${res.headers()["location"] ?? ""} ${text}`, `${route}: Marker "${e.marker}" fehlt (Vakuum-Schutz), Adresse ${url}`).toContain(e.marker);
    if (e.initialen) expect(text, `${route}: Initialen ">ZV<" fehlen im Gast-HTML (Vakuum-Schutz)`).toContain(">ZV<");
    pruefeText(text, `${route} (${e.probe})`, s, route);
    if (e.probe === "json") {
      const json = JSON.parse(text);
      expect(JSON.stringify(json.goals), `${route}: Torschützen`).toContain("ZV");
    }
    if (e.probe === "html+rsc") {
      const rsc = await request.get(url, { headers: { RSC: "1" }, maxRedirects: 0 });
      const rtext = await rsc.text();
      if (rsc.status() === 200) {
        expect(rtext.length, `${route}: RSC-Nutzlast ist nicht leer (Vakuum-Schutz)`).toBeGreaterThan(200);
        pruefeText(rtext, `${route} (RSC)`, s, route);
      }
    }
    return;
  }
  if (e.art === "angemeldet") {
    if (route.startsWith("/api/")) {
      const res = await request.get(url, { maxRedirects: 0 });
      const text = await res.text();
      pruefeText(text, `${route} (angemeldet)`, s, route);
      expect([401, 403, 404, 405], `${route}: der Gast bekommt 401/403/404/405 (Status ${res.status()})`).toContain(res.status());
      expect(text.startsWith("%PDF"), `${route}: kein PDF für Gäste`).toBe(false);
      if (ERWARTET_API[route]) expect(res.status(), `${route}: mit echter Kennung genau ${ERWARTET_API[route]}`).toBe(ERWARTET_API[route]);
      return;
    }
    // Seiten und Routen unter /admin und /app: der Gast landet im Browser exakt auf /anmelden oder bekommt 401/403/404/405; nie ein Textvergleich
    const { status, url: ziel } = await browserZiel(ctx, url, (u) => u.pathname === "/anmelden");
    expect([401, 403, 404, 405].includes(status) || ziel.pathname === "/anmelden", `${route}: der Gast landet auf /anmelden oder bekommt 401/403/404/405 (Status ${status}, Ziel ${ziel.pathname})`).toBe(true);
    const res = await request.get(url, { maxRedirects: 0 });
    pruefeText(await res.text(), `${route} (angemeldet)`, s, route);
    return;
  }
  const res = await request.get(url, { maxRedirects: 0 });
  const text = await res.text();
  pruefeText(text, `${route} (${e.art})`, s, route);
  expect([200, 301, 302, 307, 308, 404], `${route}: Status ${res.status()}`).toContain(res.status());
}

test("Gast-Sicht: jede Route der Registry als Gast ohne Klarnamen, Kennungen, Nachnamen und Profilbild-Pfade (Seiten, RSC, JSON, SSE, Bilder, robots, Sitemap)", async ({ browser }) => {
  const s = await seed();
  const ctx = await browser.newContext();
  const gast = ctx.request;
  const fehler: string[] = [];
  const routen = Object.entries(ROUTEN);
  expect(routen.length, "die Registry ist nicht leer").toBeGreaterThan(80);
  for (const [route, e] of routen) {
    try {
      await probe(ctx, gast, route, e, s);
    } catch (err) {
      fehler.push(`${route}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
    }
  }
  expect(fehler, `Gast-Sicht verletzt:\n${fehler.join("\n")}`).toEqual([]);

  // Zusatzwerte: Veranstalter (Turnier UND Privatspiel-Einladung) ist exakt "Vorname + Initial" (t2q), die Sitemap nennt keine Profile
  const seite = await ctx.newPage();
  await seite.goto(`/turniere/${s.ids.tournament}`);
  await expect(seite.getByText("Veranstalter: Zorro V. ·", { exact: false })).toBeVisible();
  await seite.goto(`/spiel/${s.ids.spielToken}`);
  await expect(seite.getByTestId("game-organizer")).toHaveText("Zorro V. lädt dich ein zu einem Privatspiel");
  const sitemap = await (await gast.get("/sitemap.xml")).text();
  expect(sitemap).not.toContain("/spieler/");
  expect(sitemap).not.toContain(s.ids.z);
});
