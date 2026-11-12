// Testdaten für die Frontend-Analyse (nur lokale Dev-DB). Beschreibung: docs/design/analyse-seed.md
// Alles ist erfunden (Mails @test.local). Idempotent: Stammdaten (Nutzer, Teams, Hallen) werden per Upsert angelegt,
// abhängige Daten (Spiele, Teilnehmer, Abbuchungszeilen, Einladungen, Turniere, Bewertungen) werden vor dem Anlegen
// gelöscht und neu erzeugt. Gelöscht wird nur, was zu den Seed-Markern gehört (Teams seed-*, Nutzer seed-*@test.local).
import type { Pool } from "pg";

export const SEED_PASSWORDLESS_NOTE = "Anmeldung nur über den Dev-Login (E-Mail eintragen, kein Passwort).";

const H = 3_600_000;
const D = 24 * H;

type Acc = { key: string; email: string; name: string; role?: string; organizer?: boolean; onboarded?: boolean; city?: string; position?: string };

export const ACCOUNTS: Acc[] = [
  { key: "admin", email: "seed-admin@test.local", name: "Seed Admin", role: "admin" },
  { key: "neu", email: "seed-neu@test.local", name: "Seed Neuling", onboarded: false },
  { key: "capA", email: "seed-captain-rot@test.local", name: "Rot Captain" },
  { key: "capB", email: "seed-captain-blau@test.local", name: "Blau Captain" },
  { key: "capC", email: "seed-captain-gruen@test.local", name: "Grün Captain" },
  { key: "capD", email: "seed-captain-gelb@test.local", name: "Gelb Captain" },
  { key: "org", email: "seed-veranstalter@test.local", name: "Seed Veranstalter", organizer: true },
  { key: "halle", email: "seed-halle@test.local", name: "Seed Hallenbetreiber" },
];

const POSITIONS = ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"];
const CITIES = ["Essen", "Köln", "Dortmund", "Gelsenkirchen"];
const FIRST = ["Anton", "Berk", "Caner", "Dario", "Elias", "Fabio", "Gero", "Hannes", "Ilias", "Jakob", "Kerem", "Leon", "Mats", "Noah", "Okan", "Paulo", "Quirin", "Rafael"];
for (let i = 1; i <= 18; i++) {
  const n = String(i).padStart(2, "0");
  ACCOUNTS.push({ key: `p${n}`, email: `seed-spieler-${n}@test.local`, name: `${FIRST[i - 1]} Testmann`, city: CITIES[i % 4], position: POSITIONS[i % 5] });
}

const TEAMS = [
  { key: "rot", slug: "seed-rot", name: "Seed Rot", city: "Essen", strength: 4, color: null as string | null, cap: "capA", members: ["p01", "p02", "p03", "p04"], elo: 1180 },
  { key: "blau", slug: "seed-blau", name: "Seed Blau", city: "Köln", strength: 3, color: null, cap: "capB", members: ["p05", "p06", "p07", "p08"], elo: 1120 },
  { key: "gruen", slug: "seed-gruen", name: "Seed Grün", city: "Dortmund", strength: 3, color: null, cap: "capC", members: ["p09", "p10", "p11", "p12"], elo: 1040 },
  { key: "gelb", slug: "seed-gelb", name: "Seed Gelb", city: "Gelsenkirchen", strength: 2, color: null, cap: "capD", members: ["p13", "p14", "p15", "p16"], elo: 960 },
] as const;

const VENUES = [
  { osm: "seed-venue-1", name: "Seed-Halle Nord", city: "Essen", partner: true, manager: "halle" },
  { osm: "seed-venue-2", name: "Seed-Halle Süd", city: "Köln", partner: false, manager: null },
  { osm: "seed-venue-3", name: "Seed-Halle West", city: "Dortmund", partner: false, manager: null },
] as const;

const REVIEWS = [
  ["Sauberer Boden, gute Duschen.", 5], ["Etwas laut, sonst top.", 4], ["Parken schwierig.", 3], ["Preis okay, Licht dunkel.", 3],
  ["Sehr freundlicher Betreiber.", 5], ["Halle war kalt.", 2],
] as const;

/** Feste IDs der Spielsuchen (/suche/<id>) und offenen Lobbys (/lobby/offen/<id>), damit Analyse und Tests die URLs kennen. */
export const SEED_REQUEST_IDS = {
  offen: "5eed0000-0000-4000-8000-000000000101",
  abgelaufen: "5eed0000-0000-4000-8000-000000000102",
  angenommen: "5eed0000-0000-4000-8000-000000000103",
  zurueckgezogen: "5eed0000-0000-4000-8000-000000000104",
  herausforderung: "5eed0000-0000-4000-8000-000000000105",
} as const;
export const SEED_QUEUE_IDS = {
  wartend: "5eed0000-0000-4000-8000-000000000201",
  abgelaufen: "5eed0000-0000-4000-8000-000000000202",
  angenommen: "5eed0000-0000-4000-8000-000000000203",
  zurueckgezogen: "5eed0000-0000-4000-8000-000000000204",
} as const;

export type SeedCounts = Record<string, number>;

export async function runSeed(pool: Pool): Promise<SeedCounts> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const q = async (text: string, params: unknown[] = []) => (await client.query(text, params)).rows;
    const now = Date.now();
    const at = (ms: number) => new Date(now + ms);

    // 1. Stammdaten per Upsert (IDs bleiben stabil, Dev-Login-Sitzungen bleiben gültig)
    const uid: Record<string, string> = {};
    for (const a of ACCOUNTS) {
      const onboarded = a.onboarded !== false;
      const [r] = await q(
        `insert into users (email, name, role, city, position, is_organizer, onboarded_at, age_confirmed_at, terms_accepted_at)
         values ($1, $2, $3, $4, $5, $6, $7, $7, $7)
         on conflict (email) do update set name = excluded.name, role = excluded.role, city = excluded.city, position = excluded.position,
           is_organizer = excluded.is_organizer, onboarded_at = excluded.onboarded_at, age_confirmed_at = excluded.age_confirmed_at, terms_accepted_at = excluded.terms_accepted_at
         returning id`,
        [a.email, a.name, a.role ?? "player", onboarded ? (a.city ?? "Essen") : null, onboarded ? (a.position ?? "Flexibel") : null, a.organizer ?? false, onboarded ? new Date(now - 30 * D) : null],
      );
      uid[a.key] = r.id;
    }

    const tid: Record<string, string> = {};
    for (const t of TEAMS) {
      const [r] = await q(
        `insert into teams (name, slug, city, strength, created_by) values ($1, $2, $3, $4, $5)
         on conflict (slug) do update set name = excluded.name, city = excluded.city, strength = excluded.strength returning id`,
        [t.name, t.slug, t.city, t.strength, uid[t.cap]],
      );
      tid[t.key] = r.id;
      await q("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [r.id, uid[t.cap]]);
      for (const m of t.members) await q("insert into team_members (team_id, user_id, role) values ($1, $2, 'player') on conflict do nothing", [r.id, uid[m]]);
      await q(
        `insert into team_stats (team_id, matches, wins, draws, losses, goals_for, goals_against, elo, last_played_at) values ($1, 12, 7, 2, 3, 41, 28, $2, $3)
         on conflict (team_id) do update set elo = excluded.elo, matches = excluded.matches, wins = excluded.wins, draws = excluded.draws, losses = excluded.losses, goals_for = excluded.goals_for, goals_against = excluded.goals_against`,
        [r.id, t.elo, at(-3 * D)],
      );
    }
    // Zwei unsichtbare Spiel-Teams für das Privatspiel (kind 'private')
    for (const [slug, name, cap] of [["seed-privat-a", "Seed Privat A", "capA"], ["seed-privat-b", "Seed Privat B", "capB"]] as const) {
      const [r] = await q(
        `insert into teams (name, slug, city, kind, created_by) values ($1, $2, 'Essen', 'private', $3)
         on conflict (slug) do update set name = excluded.name returning id`,
        [name, slug, uid[cap]],
      );
      tid[slug] = r.id;
      await q("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [r.id, uid[cap]]);
    }

    // Rangliste der Spieler (p01 bis p18)
    for (let i = 1; i <= 18; i++) {
      const n = String(i).padStart(2, "0");
      await q(
        `insert into player_stats (user_id, matches, wins, draws, losses, goals, mvps, elo, last_played_at) values ($1, $2, $3, 1, $4, $5, $6, $7, $8)
         on conflict (user_id) do update set matches = excluded.matches, wins = excluded.wins, losses = excluded.losses, goals = excluded.goals, mvps = excluded.mvps, elo = excluded.elo`,
        [uid[`p${n}`], 10 + (i % 5), 4 + (i % 4), 3 + (i % 3), 2 + ((i * 7) % 15), i % 4, 1100 - i * 6, at(-2 * D)],
      );
    }

    const vid: Record<string, string> = {};
    for (const v of VENUES) {
      const [r] = await q(
        `insert into venues (name, city, address, surface, has_showers, has_parking, is_partner, source, osm_id, verified, active, manager_user_id)
         values ($1, $2, 'Teststraße 1', 'Kunstrasen', true, true, $3, 'manual', $4, true, true, $5)
         on conflict (osm_id) do update set name = excluded.name, city = excluded.city, is_partner = excluded.is_partner, manager_user_id = excluded.manager_user_id returning id`,
        [v.name, v.city, v.partner, v.osm, v.manager ? uid[v.manager] : null],
      );
      vid[v.osm] = r.id;
    }

    // Zahlungsprofile (nur Anzeigedaten, erfundene Stripe-IDs, kein Stripe-Aufruf)
    const withCard = ["p01", "p02", "p03", "p05", "p06", "p09", "capA", "capB"];
    for (const k of withCard) {
      await q(
        `insert into payment_profiles (user_id, stripe_customer_id, payment_method_id, card_brand, card_last4, mandate_text, mandate_accepted_at)
         values ($1, $2, $3, 'visa', '4242', 'Testmandat (Seed)', now())
         on conflict (user_id) do update set payment_method_id = excluded.payment_method_id, card_brand = excluded.card_brand, card_last4 = excluded.card_last4`,
        [uid[k], `cus_seed_${k}`, `pm_seed_${k}`],
      );
    }

    // 2. Abhängige Daten löschen (nur Seed-Teams, Seed-Nutzer, Seed-Hallen)
    // Nur feste Seed-Konten (exakte E-Mails) und deren Teams: ein echtes Team mit Slug seed-* eines anderen Nutzers bleibt unberührt.
    const seedUsers = (await q("select id from users where email = any($1::text[])", [ACCOUNTS.map((a) => a.email)])).map((x) => x.id);
    const teamIds = (await q("select id from teams where id = any($1::uuid[]) and created_by = any($2::uuid[])", [Object.values(tid), seedUsers])).map((x) => x.id);
    await q("delete from tournaments where organizer_id = any($1)", [seedUsers]);
    await q("delete from matchmaking_queue where team_id = any($1)", [teamIds]); // queue_participants gehen per Cascade mit
    await q("delete from matches where home_team_id = any($1) or away_team_id = any($1)", [teamIds]);
    await q("delete from match_requests where team_id = any($1)", [teamIds]);
    await q("delete from notifications where user_id = any($1::uuid[])", [seedUsers]);
    await q("delete from comments where target_type = 'venue' and target_id = any($1)", [Object.values(vid)]);
    await q("delete from invites where token like 'seed-%' and created_by = any($1::uuid[])", [seedUsers]);

    // 3. Spiele
    const mkMatch = async (o: { home: string; away: string; startsInMs: number; status: string; kind?: string; venue?: string; visibility?: string; maxPlayers?: number; homeFinal?: boolean; awayFinal?: boolean }) => {
      const venue = VENUES.find((v) => v.osm === (o.venue ?? "seed-venue-1"))!;
      const [r] = await q(
        `insert into matches (home_team_id, away_team_id, starts_at, duration_min, venue_text, venue_id, visibility, price_cents, final_share_cents, kind, max_players, status, home_final_at, away_final_at)
         values ($1, $2, $3, 60, $4, $5, $6, 8000, $7, $8, $9, $10, $11, $12) returning id`,
        [tid[o.home], tid[o.away], at(o.startsInMs), venue.name, vid[venue.osm], o.visibility ?? "public", 800, o.kind ?? "team", o.maxPlayers ?? null, o.status, o.homeFinal ? at(-H) : null, o.awayFinal ? at(-H) : null],
      );
      return r.id as string;
    };
    const part = async (matchId: string, userKey: string, teamKey: string, o: { ready?: boolean; card?: string } = {}) =>
      q(
        `insert into match_participants (match_id, user_id, team_id, ready_at, card_status) values ($1, $2, $3, $4, $5) on conflict do nothing`,
        [matchId, uid[userKey], tid[teamKey], o.ready ? at(-H) : null, o.card ?? "none"],
      );
    const charge = async (matchId: string, userKey: string, status: string, failure: string | null, tag: string) =>
      q(
        `insert into payment_charges (match_id, user_id, amount_cents, status, idempotency_key, failure_code) values ($1, $2, 800, $3, $4, $5)`,
        [matchId, uid[userKey], status, `seed:${tag}:${matchId}:${userKey}`, failure],
      );
    const rot = ["capA", "p01", "p02", "p03", "p04"];
    const blau = ["capB", "p05", "p06", "p07", "p08"];

    // 3a. Lobby offen: nur wenige Teilnehmer, niemand bereit
    const mOffen = await mkMatch({ home: "rot", away: "blau", startsInMs: 6 * D, status: "lobby" });
    for (const u of rot.slice(0, 3)) await part(mOffen, u, "rot", { card: withCard.includes(u) ? "card_ready" : "none" });
    for (const u of blau.slice(0, 2)) await part(mOffen, u, "blau");

    // 3b. Lobby voll (10 Teilnehmer, einige ohne Karte, ein Teil bereit)
    const mVoll = await mkMatch({ home: "gruen", away: "gelb", startsInMs: 5 * D, status: "lobby", venue: "seed-venue-2" });
    const gruen = ["capC", "p09", "p10", "p11", "p12"];
    const gelb = ["capD", "p13", "p14", "p15", "p16"];
    for (const u of gruen) await part(mVoll, u, "gruen", { ready: u === "capC" || u === "p09", card: withCard.includes(u) ? "card_ready" : "none" });
    for (const u of gelb) await part(mVoll, u, "gelb", { ready: u === "capD" });

    // 3c. Lobby bereit: beide Captains bestätigt, alle mit Karte (Status confirmed)
    const mBereit = await mkMatch({ home: "rot", away: "blau", startsInMs: 3 * D, status: "confirmed", homeFinal: true, awayFinal: true });
    for (const u of rot) await part(mBereit, u, "rot", { ready: true, card: "card_ready" });
    for (const u of blau) await part(mBereit, u, "blau", { ready: true, card: "card_ready" });

    // 3d. Karte abgelehnt (card_status failed + payment_charges failed) und Zahlung ausstehend (charge_pending)
    const mFehler = await mkMatch({ home: "gruen", away: "gelb", startsInMs: 2 * D, status: "lobby", venue: "seed-venue-3" });
    const fehler: [string, string, string, string | null][] = [
      ["capC", "gruen", "failed", "card_declined"],
      ["p09", "gruen", "charge_pending", null],
      ["p10", "gruen", "card_ready", null],
      ["p11", "gruen", "none", null],
    ];
    for (const [u, t, card] of fehler) await part(mFehler, u, t, { ready: true, card });
    await charge(mFehler, "capC", "failed", "card_declined", "fehler");
    await charge(mFehler, "p09", "pending", null, "fehler");
    for (const u of gelb.slice(0, 3)) await part(mFehler, u, "gelb", { ready: true, card: "card_ready" });

    // 3e. Abgesagt (hier ohne cancel_requested_at: die Spalte kommt mit PR 83)
    const mAbgesagt = await mkMatch({ home: "rot", away: "gruen", startsInMs: 1 * D, status: "cancelled" });
    for (const u of rot.slice(0, 3)) await part(mAbgesagt, u, "rot", { card: "card_ready" });

    // 3f. Vergangene Spiele mit Ergebnis
    const past: [string, string, number, number, number][] = [["rot", "blau", -7, 5, 3], ["gruen", "gelb", -14, 2, 2], ["blau", "gruen", -21, 1, 4]];
    for (const [h, a, days, hs, as] of past) {
      const m = await mkMatch({ home: h, away: a, startsInMs: days * D, status: "played" });
      await q("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, $2, $3, true, true)", [m, hs, as]);
      const hm = TEAMS.find((t) => t.key === h)!;
      const am = TEAMS.find((t) => t.key === a)!;
      for (const u of [hm.cap, ...hm.members.slice(0, 3)]) await part(m, u, h, { ready: true });
      for (const u of [am.cap, ...am.members.slice(0, 3)]) await part(m, u, a, { ready: true });
    }

    // 3g. Privatspiel (versteckt, mit gültigem und abgelaufenem Einladungslink)
    const mPrivat = await mkMatch({ home: "seed-privat-a", away: "seed-privat-b", startsInMs: 4 * D, status: "lobby", kind: "private", visibility: "private", maxPlayers: 10 });
    for (const u of rot.slice(0, 3)) await part(mPrivat, u, "seed-privat-a");
    for (const u of blau.slice(0, 2)) await part(mPrivat, u, "seed-privat-b");
    await q("insert into game_invites (token, match_id, created_by, expires_at) values ('seed-link-gueltig', $1, $2, $3) on conflict (token) do update set match_id = excluded.match_id, expires_at = excluded.expires_at", [mPrivat, uid.capA, at(3 * D)]);
    await q("insert into game_invites (token, match_id, created_by, expires_at) values ('seed-link-abgelaufen', $1, $2, $3) on conflict (token) do update set match_id = excluded.match_id, expires_at = excluded.expires_at", [mPrivat, uid.capA, at(-2 * D)]);
    // Team-Einladung: gültig und abgelaufen (Einladungslink eines Teams)
    await q("insert into invites (token, team_id, created_by, expires_at) values ('seed-team-gueltig', $1, $2, $3), ('seed-team-abgelaufen', $1, $2, $4)", [tid.rot, uid.capA, at(5 * D), at(-3 * D)]);

    // 3h. Spielsuche-Anfragen (/suche/<id>): offen, abgelaufen, angenommen (mit Spiel), zurückgezogen, Herausforderung
    const rq = SEED_REQUEST_IDS;
    const insertRequest = (id: string, team: string, startsInMs: number, status: string, o: { strength?: number; visibility?: string; note?: string | null; target?: string | null } = {}) =>
      q(
        `insert into match_requests (id, team_id, city, starts_at, duration_min, strength, visibility, status, note, target_team_id)
         values ($1, $2, $3, $4, 60, $5, $6, $7, $8, $9)`,
        [id, tid[team], TEAMS.find((t) => t.key === team)!.city, at(startsInMs), o.strength ?? 3, o.visibility ?? "public", status, o.note ?? null, o.target ? tid[o.target] : null],
      );
    await insertRequest(rq.offen, "blau", 5 * D, "open", { strength: 3, note: "Wir suchen ein faires Spiel, gern abends. Halle Köln." });
    await insertRequest(rq.abgelaufen, "gelb", -1 * D, "expired", { strength: 2, note: "Termin ist verstrichen, niemand hat angenommen." });
    await insertRequest(rq.angenommen, "rot", 3 * D, "matched", { strength: 4 });
    await q("update matches set request_id = $1 where id = $2", [rq.angenommen, mBereit]);
    await insertRequest(rq.zurueckgezogen, "gruen", 7 * D, "cancelled", { strength: 3, note: "Zurückgezogen, Kader zu klein." });
    await insertRequest(rq.herausforderung, "rot", 4 * D, "open", { strength: 4, target: "gelb", note: "Revanche?" });

    // 3i. Offene Lobbys / Warteschlange (/lobby/offen/<id>): wartend (mit Beitritten), abgelaufen, angenommen (leitet zum Spiel), zurückgezogen
    const qid = SEED_QUEUE_IDS;
    const win = (fromMs: number) => JSON.stringify([{ from: at(fromMs).toISOString(), to: at(fromMs + 3 * H).toISOString() }, { from: at(fromMs + D).toISOString(), to: at(fromMs + D + 3 * H).toISOString() }]);
    const insertQueue = (id: string, team: string, status: string, fromMs: number, expiresMs: number, matchId: string | null = null, note: string | null = null) => {
      const t = TEAMS.find((x) => x.key === team)!;
      return q(
        `insert into matchmaking_queue (id, team_id, created_by, city, duration_min, windows, note, status, match_id, expires_at)
         values ($1, $2, $3, $4, 60, $5::jsonb, $6, $7, $8, $9)`,
        [id, tid[team], uid[t.cap], t.city, win(fromMs), note, status, matchId, at(expiresMs)],
      );
    };
    await insertQueue(qid.wartend, "gelb", "waiting", 2 * D, 4 * D, null, "Offene Lobby, wir sind noch nicht vollzählig.");
    for (const u of ["capD", "p13", "p14"]) await q("insert into queue_participants (queue_id, user_id) values ($1, $2)", [qid.wartend, uid[u]]);
    await insertQueue(qid.abgelaufen, "blau", "expired", -3 * D, -1 * D);
    await insertQueue(qid.angenommen, "rot", "matched", 2 * D, 3 * D, mBereit);
    await insertQueue(qid.zurueckgezogen, "gruen", "cancelled", 3 * D, 5 * D, null, "Zurückgezogen.");

    // 3j. Benachrichtigungen (gelesen/ungelesen; Arten aus notification-types)
    const notif = (user: string, type: string, title: string, body: string, url: string | null, ageMs: number, read: boolean) =>
      q(
        "insert into notifications (user_id, type, title, body, url, created_at, read_at, delivered_at) values ($1, $2, $3, $4, $5, $6, $7, $6)",
        [uid[user], type, title, body, url, at(-ageMs), read ? at(-ageMs + H) : null],
      );
    await notif("capC", "payment", "Abbuchung fehlgeschlagen", "Die Abbuchung deines Anteils für Seed Grün gegen Seed Gelb ist fehlgeschlagen (Karte abgelehnt).", `/lobby/${mFehler}`, 2 * H, false);
    await notif("p09", "payment", "Zahlung ausstehend", "Deine Abbuchung für Seed Grün gegen Seed Gelb steht noch aus.", `/lobby/${mFehler}`, 5 * H, false);
    await notif("capA", "match.cancelled", "Spiel abgesagt", "Seed Rot gegen Seed Grün wurde abgesagt.", `/lobby/${mAbgesagt}`, 20 * H, false);
    await notif("p01", "match.cancelled", "Spiel abgesagt", "Seed Rot gegen Seed Grün wurde abgesagt.", `/lobby/${mAbgesagt}`, 20 * H, true);
    await notif("capD", "request.challenge", "Dein Team wurde herausgefordert", "Seed Rot fordert Seed Gelb heraus.", `/suche/${rq.herausforderung}`, 1 * D, false);
    await notif("capA", "request.accepted", "Deine Spielsuche wurde angenommen", "Seed Blau tritt an.", `/lobby/${mBereit}`, 2 * D, true);
    await notif("p01", "match.reminder", "Erinnerung vor dem Anstoß", "Seed Rot gegen Seed Blau startet in drei Tagen.", `/lobby/${mBereit}`, 3 * H, false);
    await notif("p02", "match.reminder", "Erinnerung vor dem Anstoß", "Seed Rot gegen Seed Blau startet in drei Tagen.", `/lobby/${mBereit}`, 3 * H, true);
    await notif("p13", "lobby.joined", "Spieler tritt der Lobby bei", "Ein Spieler ist der offenen Lobby von Seed Gelb beigetreten.", `/lobby/offen/${qid.wartend}`, 6 * H, false);
    await notif("capD", "team.joined", "Neues Mitglied in deinem Team", "Ein neues Mitglied ist Seed Gelb beigetreten (Einladung angenommen).", "/teams/seed-gelb", 3 * D, true);
    await notif("p17", "system", "Willkommen bei Soccaz", "Dies ist eine Testbenachrichtigung aus dem Seed.", null, 4 * D, true);

    // 4. Turniere in vier Phasen (Organisator: seed-veranstalter)
    const tdef = [
      { status: "registration", name: "Seed-Turnier Anmeldung", token: "seed-turnier-anmeldung", teams: ["rot", "blau"], startsInD: 20 },
      { status: "payment", name: "Seed-Turnier Bezahlung", token: "seed-turnier-bezahlung", teams: ["rot", "blau", "gruen", "gelb"], startsInD: 12 },
      { status: "running", name: "Seed-Turnier Laufend", token: "seed-turnier-laufend", teams: ["rot", "blau", "gruen", "gelb"], startsInD: 0 },
      { status: "finished", name: "Seed-Turnier Beendet", token: "seed-turnier-beendet", teams: ["rot", "blau", "gruen", "gelb"], startsInD: -10 },
    ];
    const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
    for (const t of tdef) {
      const day = new Date(now + t.startsInD * D).toISOString().slice(0, 10);
      const reg = t.status === "registration";
      const [tr] = await q(
        `insert into tournaments (organizer_id, name, city, venue_text, starts_on, format, max_teams, entry_fee_cents, final_share_cents, invite_token, registration_deadline, starts_at, status, bracket_generated_at, winner_team_id, settled_at)
         values ($1, $2, 'Essen', 'Seed-Halle Nord', $3, 'round_robin', 4, 500, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
        [uid.org, t.name, day, reg ? null : 500, t.token, at(t.startsInD * D - 2 * D), at(t.startsInD * D), t.status, ["running", "finished"].includes(t.status) ? at(t.startsInD * D - H) : null, t.status === "finished" ? tid.rot : null, t.status === "finished" ? at(-9 * D) : null],
      );
      for (const k of t.teams) {
        const team = TEAMS.find((x) => x.key === k)!;
        await q(
          `insert into tournament_teams (tournament_id, team_id, captain_id, fee_cents, ready_at, paid_ready_at) values ($1, $2, $3, 500, $4, $5)`,
          [tr.id, tid[k], uid[team.cap], reg ? null : at(-D), ["running", "finished"].includes(t.status) ? at(-D) : null],
        );
        const members = [team.cap, ...team.members] as string[];
        for (const [i, u] of members.entries()) {
          // Bezahlphase: etwa die Hälfte hat gezahlt; laufend und beendet: alle
          const paid = t.status === "payment" ? i < 2 : ["running", "finished"].includes(t.status);
          await q(
            `insert into tournament_players (tournament_id, team_id, user_id, paid_cents, paid_at) values ($1, $2, $3, $4, $5)`,
            [tr.id, tid[k], uid[u], paid ? 500 : 0, paid ? at(-D) : null],
          );
        }
      }
      if (t.status === "running" || t.status === "finished") {
        for (const [r, games] of pairs.entries()) {
          for (const [s, [a, b]] of games.entries()) {
            const done = t.status === "finished" || r === 0;
            await q(
              `insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b, score_a, score_b, played_at) values ($1, 'round', $2, $3, $4, $5, $6, $7, $8)`,
              [tr.id, r + 1, s + 1, tid[t.teams[a]], tid[t.teams[b]], done ? (a + b + 1) % 4 : null, done ? (a * 2 + b) % 3 : null, done ? at(t.startsInD * D + r * H) : null],
            );
          }
        }
      }
    }

    // 5. Hallenbewertungen (je Halle mehrere, verschiedene Autoren)
    for (const [vi, v] of VENUES.entries()) {
      for (const [ri, [body, rating]] of REVIEWS.entries()) {
        if ((ri + vi) % 3 === 2) continue;
        await q("insert into comments (target_type, target_id, author_id, body, rating) values ('venue', $1, $2, $3, $4)", [vid[v.osm], uid[`p${String(ri + 1 + vi * 3).padStart(2, "0")}`], body, rating]);
      }
    }

    // 6. Zählung (nur Seed-Daten)
    const venueIds = Object.values(vid);
    const matchSub = "select id from matches where home_team_id = any($1::uuid[])";
    const tourSub = "select id from tournaments where organizer_id = any($1::uuid[])";
    const count = async (label: string, text: string, arg: string[]) => [label, Number((await q(text, [arg]))[0].n)] as const;
    const rows = [
      await count("Nutzer", "select count(*) n from users where id = any($1::uuid[])", seedUsers),
      await count("Teams", "select count(*) n from teams where id = any($1::uuid[])", teamIds),
      await count("Teammitglieder", "select count(*) n from team_members where team_id = any($1::uuid[])", teamIds),
      await count("Hallen", "select count(*) n from venues where id = any($1::uuid[])", venueIds),
      await count("Hallenbewertungen", "select count(*) n from comments where target_type = 'venue' and target_id = any($1::uuid[])", venueIds),
      await count("Spiele", `select count(*) n from matches where home_team_id = any($1::uuid[])`, teamIds),
      await count("Spiele-Teilnehmer", `select count(*) n from match_participants where match_id in (${matchSub})`, teamIds),
      await count("Abbuchungszeilen", `select count(*) n from payment_charges where match_id in (${matchSub})`, teamIds),
      await count("Zahlungsprofile", "select count(*) n from payment_profiles where user_id = any($1::uuid[])", seedUsers),
      await count("Einladungen Privatspiel", `select count(*) n from game_invites where match_id in (${matchSub})`, teamIds),
      await count("Einladungen Team", "select count(*) n from invites where team_id = any($1::uuid[])", teamIds),
      await count("Turniere", `select count(*) n from tournaments where organizer_id = any($1::uuid[])`, seedUsers),
      await count("Turnier-Teams", `select count(*) n from tournament_teams where tournament_id in (${tourSub})`, seedUsers),
      await count("Turnier-Spieler", `select count(*) n from tournament_players where tournament_id in (${tourSub})`, seedUsers),
      await count("Turnier-Spiele", `select count(*) n from tournament_matches where tournament_id in (${tourSub})`, seedUsers),
      await count("Spielsuchen", "select count(*) n from match_requests where team_id = any($1::uuid[])", teamIds),
      await count("Warteschlangen-Einträge", "select count(*) n from matchmaking_queue where team_id = any($1::uuid[])", teamIds),
      await count("Warteschlangen-Beitritte", "select count(*) n from queue_participants where queue_id in (select id from matchmaking_queue where team_id = any($1::uuid[]))", teamIds),
      await count("Benachrichtigungen", "select count(*) n from notifications where user_id = any($1::uuid[])", seedUsers),
      await count("Benachrichtigungen ungelesen", "select count(*) n from notifications where read_at is null and user_id = any($1::uuid[])", seedUsers),
    ];
    await client.query("commit");
    return Object.fromEntries(rows);
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
