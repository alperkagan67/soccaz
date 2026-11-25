import { expect, test } from "@playwright/test";
import { closeContexts, devLogin, run, seedUser } from "./helpers";
import { query, setPlatformSetting } from "./helpers-db";
import { ZAHLUNGEN_AUS_HINWEIS, ZAHLUNGSWORTE, zahlungsWorte } from "@/lib/zahlungen-aus";
import { knockout } from "@/lib/tournament";

test.afterAll(async () => {
  await setPlatformSetting("payments_enabled", false);
});
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

// GESAMT-Wortscan (t2q Prio 1, vor dem Freeze): Zahlungen AUS, Turnier OHNE Preis, Spiele mit Preis in der Datenbank: auf ALLEN öffentlichen und angemeldeten Seiten steht kein Zahlungswort (zahlungsWorte).
// Ausgenommen sind die Rechtstexte (AGB, Datenschutz, Hausordnung, Impressum: dort stehen Zahlungsbedingungen rechtlich korrekt). Alle Funde stehen in EINER Fehlermeldung (Liste für die Fixes).
test("Zahlungen AUS, Gesamt: kein Zahlungswort auf allen öffentlichen und angemeldeten Seiten (Gast, Captain, Spieler, Veranstalter), in allen Zuständen", async ({ browser }) => {
  test.setTimeout(420_000);
  await setPlatformSetting("payments_enabled", false);
  const cap = await seedUser("gesc", "Captain Gesamt");
  const player = await seedUser("gesp", "Spieler Gesamt");
  const rival = await seedUser("gesr", "Gegner Gesamt");
  const org = await seedUser("geso", "Veranstalter Gesamt");
  await query("update users set is_organizer = true where id = $1", [org]);
  const mk = async (name: string, slug: string, admin: string) => {
    const [t] = await query<{ id: string }>("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, slug, admin]);
    await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [t.id, admin]);
    return t.id;
  };
  const home = await mk(`Ges Heim ${run}`, `ges-heim-${run}`, cap);
  const away = await mk(`Ges Gast ${run}`, `ges-gast-${run}`, rival);
  await query("insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [home, player]);
  const [lobby] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, visibility, price_cents, cost_cents) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'public', 8000, 8000) returning id", [home, away]);
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $3), ($1, $5, $6)", [lobby.id, cap, home, player, rival, away]);
  const [played] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at) values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour') returning id", [home, away]);
  await query("insert into match_participants (match_id, user_id, team_id) values ($1, $2, $3), ($1, $4, $5)", [played.id, cap, home, rival, away]);
  await query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 2, 0, true, true)", [played.id]);
  // Turnier ohne Preis in drei Zuständen: Anmeldung (ein Team bereit), läuft (Bracket), beendet
  const turnier = async (key: string, status: string, teams: number) => {
    const [t] = await query<{ id: string }>(
      `insert into tournaments (organizer_id, name, city, starts_on, format, max_teams, total_cents, hourly_cents, duration_min, match_minutes, status, registration_deadline, starts_at, is_private, bracket_generated_at)
       values ($1, $2, 'Essen', (now() + interval '9 days')::date, 'knockout', 4, 0, 0, 120, 15, $3, now() + interval '5 days', now() + interval '9 days', false, $4) returning id`,
      [org, `Ges-Cup ${key} ${run}`, status, status === "registration" ? null : new Date()],
    );
    const ids: string[] = [];
    for (let i = 0; i < teams; i++) {
      const c = await seedUser(`ges${key}${i}`, `Cap ${key}${i}`);
      const id = await mk(`Ges ${key}${i} ${run}`, `ges-${key}${i}-${run}`, c);
      await query("insert into tournament_teams (tournament_id, team_id, captain_id, ready_at, paid_ready_at) values ($1, $2, $3, $4, $4)", [t.id, id, c, i === 0 || status !== "registration" ? new Date() : null]);
      ids.push(id);
    }
    if (status !== "registration") {
      const fixtures = knockout(ids);
      const idOf = new Map<string, string>();
      const k = (s: { stage: string; round: number; slot: number }) => `${s.stage}|${s.round}|${s.slot}`;
      for (const f of fixtures) idOf.set(k(f), (await query<{ id: string }>("insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b) values ($1, $2, $3, $4, $5, $6) returning id", [t.id, f.stage, f.round, f.slot, f.a, f.b]))[0].id);
      for (const f of fixtures) if (f.feeds) await query("update tournament_matches set feeds_match_id = $1, feeds_side = $2 where id = $3", [idOf.get(k(f.feeds)), f.feeds.side, idOf.get(k(f))]);
    }
    return t.id;
  };
  const tReg = await turnier("reg", "registration", 3);
  const tRun = await turnier("run", "running", 4);
  const tEnd = await turnier("end", "finished", 4);
  const spielToken = `ges-spiel-${run}`;
  const [rot] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Rot', $1, 'Essen', $2, 'private') returning id", [`ges-rot-${run}`, cap]);
  const [blau] = await query<{ id: string }>("insert into teams (name, slug, city, created_by, kind) values ('Team Blau', $1, 'Essen', $2, 'private') returning id", [`ges-blau-${run}`, cap]);
  const [priv] = await query<{ id: string }>("insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, kind, visibility, price_cents, cost_cents) values ($1, $2, now() + interval '3 days', 60, 'lobby', 'private', 'private', 8000, 8000) returning id", [rot.id, blau.id]);
  await query("insert into game_invites (token, match_id, created_by, expires_at) values ($1, $2, $3, now() + interval '7 days')", [spielToken, priv.id, cap]);

  const oeffentlich = ["/", "/hilfe", "/hallen", "/ligen", "/rangliste", "/spiele", "/spieler", "/suche", "/teams", "/turniere", "/matchmaking", "/mitspieler", "/profitag", "/unter-16", "/kontakt", "/anmelden", "/offline", `/teams/ges-heim-${run}`, `/spieler/${cap}`, `/lobby/${lobby.id}`, `/lobby/${lobby.id}/uebersicht`, `/spiele/${played.id}`, `/spiel/${spielToken}`, `/turniere/${tReg}`, `/turniere/${tRun}`, `/turniere/${tEnd}`];
  const angemeldet = ["/app", "/app/einstellungen", "/app/guthaben", "/app/benachrichtigungen", "/app/privatspiel/neu", "/app/suche/neu", "/app/teams/neu", "/app/turniere/neu", `/lobby/${lobby.id}`, `/lobby/${lobby.id}/uebersicht`, `/lobby/${priv.id}`, `/spiele/${played.id}`, `/turniere/${tReg}`, `/turniere/${tRun}`];
  const funde: string[] = [];
  const scan = async (page: import("@playwright/test").Page, wer: string, pfad: string) => {
    await page.goto(pfad, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    // sichtbarer Inhalt samt zugeklappter Teile, OHNE script/style (RSC-Nutzlast, Entwicklungspfade)
    const text = await page.locator("body").evaluate((el) => { const c = el.cloneNode(true) as HTMLElement; c.querySelectorAll("script,style,noscript").forEach((n) => n.remove()); return c.textContent ?? ""; });
    const attrs = await page.locator("body").evaluate((el) => [...el.querySelectorAll("[title],[aria-label],[alt],[placeholder]")].map((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("alt"), e.getAttribute("placeholder")].join(" ")).join(" "));
    // keine Ausnahme mehr: bei Zahlungen AUS gibt es im Privatspiel keine Mietwahl ("Kostenlos (0 €)") mehr, nur den Satz "Das Spiel ist kostenlos."
    const alles = `${text} ${attrs}`.replace(/\s+/g, " ");
    const worte = zahlungsWorte(alles);
    if (worte.length) {
      const ohne = alles.split(ZAHLUNGEN_AUS_HINWEIS).join(" ");
      const kontext = ZAHLUNGSWORTE.filter((re) => worte.includes(re.source)).map((re) => {
        const m = re.exec(ohne);
        return m ? ohne.slice(Math.max(0, m.index - 40), m.index + 60) : "";
      });
      funde.push(`${wer} ${pfad.replace(/[0-9a-f-]{36}/g, "<id>")}: ${worte.join(", ")} | ${kontext.join(" || ")}`);
    }
  };
  const gast = await (await browser.newContext()).newPage();
  for (const p of oeffentlich) await scan(gast, "Gast", p);
  for (const [wer, id, name, extra] of [["Captain", cap, "Captain Gesamt", []], ["Spieler", player, "Spieler Gesamt", []], ["Veranstalter", org, "Veranstalter Gesamt", [`/turniere/${tReg}`]]] as const) {
    const page = await (await browser.newContext()).newPage();
    await devLogin(page, (await query<{ email: string }>("select email from users where id = $1", [id]))[0].email, name);
    await page.waitForURL(/\/app|\/willkommen/, { timeout: 60_000 });
    for (const p of [...angemeldet, ...extra]) await scan(page, wer, p);
  }
  expect(funde, `Zahlungswörter bei Zahlungen AUS:\n${funde.join("\n")}`).toEqual([]);
});
