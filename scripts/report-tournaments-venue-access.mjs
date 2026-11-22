// Altbestand-Bericht (012 M5-7a, Plan 19.9 Punkt 2): Turniere mit Halle, deren Halle inzwischen einen AKTIVEN Betreiber-Zugang hat, getrennt nach Status.
// Nur lesend, keine Personendaten (Anzahl, Turnier-ID, Status, Halle-ID). Aufruf: node --env-file=.env.local scripts/report-tournaments-venue-access.mjs
// Vor M5-7b sind das Turniere, die sich nicht fixieren lassen (Status registration) oder deren Snapshot keine Zusage verlangt (Status payment/running, Luecke G24-012b).
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL fehlt.");
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1"].includes(host)) console.log("Hinweis: nicht-lokale Datenbank, nur lesende Abfrage.");
const c = new pg.Client({ connectionString: url });
await c.connect();
try {
  const { rows } = await c.query(`
    select t.id, t.status, t.venue_id, t.venue_access_required_snapshot as snapshot, t.venue_confirmed_at is not null as confirmed
    from tournaments t
    where t.venue_id is not null and t.status in ('registration', 'payment', 'running')
      and exists (
        select 1 from venue_access a join users u on u.id = a.user_id
        where a.venue_id = t.venue_id and a.status = 'active' and u.banned_at is null and u.role <> 'admin')
    order by t.status, t.id`);
  console.log(`Turniere mit Halle, die einen aktiven Zugang hat: ${rows.length}`);
  const by = {};
  for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
  console.log(JSON.stringify(by));
  for (const r of rows) console.log(`${r.status}\tTurnier ${r.id}\tHalle ${r.venue_id}\tSnapshot ${r.snapshot}\tZusage ${r.confirmed}`);
  const zero = await c.query(`select count(*)::int as n from venues where is_partner and active and commission_percent = 0`);
  console.log(`Aktive Partnerhallen mit Provisionssatz 0: ${zero.rows[0].n}`);
} finally {
  await c.end();
}
