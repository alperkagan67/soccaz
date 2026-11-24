#!/usr/bin/env node
// Staging-Seed für die Generalprobe: legt die Teams 3 bis 6 mit erfundenen Konten (<name>@staging.invalid) an, damit das Gratis-Turnier mit 6 Teams komplett durchgespielt werden kann
// (Teams 1 und 2 sind ECHTE Konten von Nutzer und Partner). Eigene harte Sperre: scripts/lib/staging-seed-guard.mjs (Marke in der Datenbank, nicht socaz.de, ausdrückliche Bestätigung).
// Aufruf (auf dem Staging-Server, Runbook Schritt 3a/10):
//   docker compose -f docker-compose.yml -f docker-compose.staging.yml run --rm -e APP_URL=https://<staging-adresse> -e STAGING_SEED_CONFIRM=ja-staging-seed migrate node scripts/staging-seed.mjs [--turnier <id>] [--clean]
//   --turnier <id>  meldet die vier Teams zusätzlich in diesem GRATIS-Turnier (Status Anmeldung, Preis 0) an und setzt "vollzählig" und "Bereit" für sie (die Captains sind erfundene Konten ohne Anmeldung)
//   --clean         entfernt alle Konten @staging.invalid und die Teams staging-probe-* (gleiche Sperre)
// Ausgabe: nur Anzahlen und Teamnamen; Fehlertexte der Datenbank-Bibliothek können bei Verbindungsfehlern Host und Port zeigen (nie das Passwort).
//   --clean scheitert (fail safe, nichts geht verloren), sobald mit den Probe-Teams Turnierspiele gespielt wurden: dann die Staging-Datenbank zurücksetzen. Ende-Code 0 = fertig, 1 = verweigert oder Fehler.

import pg from "pg";
import { pathToFileURL } from "node:url";
import { BESTAETIGUNG_NAME, MAIL_DOMAIN, MARKER_KEY, planStagingSeed, pruefeStagingSeed } from "./lib/staging-seed-guard.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function markerLesen(pool) {
  const r = await pool.query("select value from settings where key = $1", [MARKER_KEY]);
  return r.rows.length === 0 ? null : r.rows[0].value;
}

/** Lauf mit austauschbarer Umgebung und Datenbank (Test). Wirft bei Verweigerung, BEVOR irgendetwas geschrieben wird. */
export async function lauf({ pool, env = process.env, args = [] }) {
  pruefeStagingSeed({ marker: await markerLesen(pool), appUrl: env.APP_URL, authUrl: env.AUTH_URL, bestaetigung: env[BESTAETIGUNG_NAME] });
  const ausgabe = [];
  const ti = args.indexOf("--turnier");
  const turnierId = ti >= 0 ? args[ti + 1] : null;
  if (ti >= 0 && !(turnierId && UUID.test(turnierId))) throw new Error("--turnier braucht eine Turnier-id (UUID).");

  const client = await pool.connect();
  try {
    await client.query("begin");
    if (args.includes("--clean")) {
      const t = await client.query("delete from teams where slug like 'staging-probe-%'");
      const u = await client.query(`delete from users where email like $1`, [`%@${MAIL_DOMAIN}`]);
      await client.query("commit");
      ausgabe.push(`Entfernt: ${t.rowCount} Teams, ${u.rowCount} Konten.`);
      return ausgabe;
    }
    if (turnierId) {
      const [t] = (await client.query("select status, total_cents, max_teams from tournaments where id = $1 for update", [turnierId])).rows;
      if (!t) throw new Error("Turnier nicht gefunden.");
      if (t.status !== "registration") throw new Error("Das Turnier steht nicht in der Anmeldung.");
      if (t.total_cents !== null && Number(t.total_cents) !== 0) throw new Error("Das Turnier hat einen Preis: der Seed legt nur Gratis-Turniere an (keine Zahlungsdaten).");
      const n = Number((await client.query("select count(*)::int as n from tournament_teams where tournament_id = $1", [turnierId])).rows[0].n);
      if (n + 4 > Number(t.max_teams)) throw new Error("Im Turnier ist nicht genug Platz für vier weitere Teams.");
    }
    let konten = 0;
    for (const team of planStagingSeed()) {
      const ids = [];
      for (const s of team.spieler) {
        const r = await client.query(
          `insert into users (email, name, city, position, onboarded_at, age_confirmed_at, terms_accepted_at)
           values ($1, $2, 'Essen', $3, now(), now(), now())
           on conflict (email) do update set name = excluded.name returning id`,
          [s.email, s.name, s.position],
        );
        ids.push({ id: r.rows[0].id, captain: s.captain });
        konten += 1;
      }
      const cap = ids.find((x) => x.captain).id;
      const tr = await client.query(
        `insert into teams (name, slug, city, strength, created_by) values ($1, $2, 'Essen', 3, $3)
         on conflict (slug) do update set name = excluded.name returning id`,
        [team.name, team.slug, cap],
      );
      const teamId = tr.rows[0].id;
      for (const x of ids) await client.query("insert into team_members (team_id, user_id, role) values ($1, $2, $3) on conflict do nothing", [teamId, x.id, x.captain ? "admin" : "player"]);
      if (turnierId) {
        await client.query(
          "insert into tournament_teams (tournament_id, team_id, captain_id, ready_at, paid_ready_at) values ($1, $2, $3, now(), now()) on conflict (tournament_id, team_id) do nothing",
          [turnierId, teamId, cap],
        );
        for (const x of ids) await client.query("insert into tournament_players (tournament_id, team_id, user_id) values ($1, $2, $3) on conflict do nothing", [turnierId, teamId, x.id]);
      }
      ausgabe.push(`${team.name}: ${ids.length} Konten${turnierId ? ", im Turnier angemeldet und bereit" : ""}`);
    }
    await client.query("commit");
    ausgabe.push(`Fertig: ${konten} erfundene Konten (@${MAIL_DOMAIN}, nie zustellbar), 4 Teams.`);
    return ausgabe;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL fehlt.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const zeile of await lauf({ pool, args: process.argv.slice(2) })) console.log(zeile);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Fehler");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
