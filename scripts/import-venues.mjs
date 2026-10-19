// Spielt data/nrw-hallen-osm.json in die Tabelle venues ein (mehrfach ausführbar).
// Neue Hallen kommen als "ungeprüft" hinein; bereits geprüfte oder bearbeitete Hallen werden nicht überschrieben.
// Aufruf: node --env-file=.env.local scripts/import-venues.mjs   (im Container: DATABASE_URL ist gesetzt)
import { readFileSync } from "node:fs";
import pg from "pg";

const data = JSON.parse(readFileSync(new URL("../data/nrw-hallen-osm.json", import.meta.url), "utf8"));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let added = 0;
let updated = 0;
for (const v of data.venues) {
  const r = await pool.query(
    `insert into venues (name, city, address, lat, lng, website, surface, has_showers, source, osm_id, verified)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'osm', $9, false)
     on conflict (osm_id) do update set lat = excluded.lat, lng = excluded.lng, website = coalesce(venues.website, excluded.website)
       where venues.verified = false
     returning (xmax = 0) as inserted`,
    [v.name, v.city, v.address, v.lat, v.lng, v.website, v.surface, v.hasShowers, v.osmId],
  );
  if (r.rows[0]?.inserted) added += 1;
  else if (r.rowCount) updated += 1;
}
console.log(`Hallen: ${added} neu, ${updated} aktualisiert (Quelle: ${data.source}, Stand ${data.fetchedAt.slice(0, 10)})`);
await pool.end();
