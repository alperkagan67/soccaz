// Holt Fußball- und Soccerhallen in NRW aus OpenStreetMap (Overpass) und ergänzt fehlende Städte über Nominatim.
// Ergebnis: data/nrw-hallen-osm.json. Daten: © OpenStreetMap-Mitwirkende, ODbL. Buchbarkeit und Preise sind NICHT geprüft.
// Aufruf: node scripts/fetch-venues-osm.mjs
import { writeFileSync } from "node:fs";

const QUERY = `[out:json][timeout:180];
area["ISO3166-2"="DE-NW"]->.a;
(
  nwr["leisure"~"sports_centre|pitch|sports_hall"]["sport"~"soccer|futsal"]["indoor"="yes"](area.a);
  nwr["leisure"="sports_hall"]["sport"~"soccer|futsal"](area.a);
  nwr["building"="sports_hall"]["sport"~"soccer|futsal"](area.a);
  nwr["leisure"="sports_centre"]["sport"~"soccer|futsal"]["name"~"halle|arena|indoor|soccer|cage|futsal|kick|fu(ß|ss)ball ?(center|centre|park|zentrum)",i](area.a);
);
out center tags;`;

// Keine Schul- und Vereinshallen, keine Außenplätze, keine Spielereien
const EXCLUDE = /sportplatz|rasen|stadion|vereinsheim|tennis|tischfu|golf|schule|gymnasium|berufskolleg|sporthalle|rundsporthalle|dreifachhalle|bolzplatz|kleinspielfeld|sparkassen|herxfeldhalle|ballsporthalle|ahorn|gesundheit|move factory|lfg/i;

let elements;
for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass-api.de/api/interpreter"]) {
  const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(QUERY), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "socaz-venue-import/1.0" } }).catch(() => null);
  if (res?.ok) {
    elements = (await res.json()).elements;
    break;
  }
  console.log("Overpass-Server antwortet nicht (" + (res?.status ?? "kein Netz") + "), neuer Versuch …");
  await new Promise((r) => setTimeout(r, 8000));
}
if (!elements) throw new Error("Overpass nicht erreichbar");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const seen = new Set();
for (const e of elements) {
  const t = e.tags ?? {};
  if (!t.name || EXCLUDE.test(t.name) || /table_soccer/.test(t.sport ?? "")) continue;
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) continue;
  const key = `${e.type}/${e.id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  let city = t["addr:city"] ?? null;
  if (!city) {
    await sleep(1100); // Nominatim erlaubt eine Anfrage pro Sekunde
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`, { headers: { "User-Agent": "socaz-venue-import/1.0" } });
    if (r.ok) {
      const j = await r.json();
      city = j.address?.city ?? j.address?.town ?? j.address?.village ?? j.address?.municipality ?? null;
    }
  }
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  out.push({
    osmId: key,
    name: t.name.trim(),
    city: city ?? "NRW",
    address: [street, [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
    lat,
    lng,
    website: t.website ?? t["contact:website"] ?? null,
    surface: t.surface ?? null,
    hasShowers: t.shower === "yes",
    hasParking: null,
  });
}
out.sort((a, b) => a.city.localeCompare(b.city, "de") || a.name.localeCompare(b.name, "de"));
writeFileSync("data/nrw-hallen-osm.json", JSON.stringify({ source: "OpenStreetMap (ODbL)", fetchedAt: new Date().toISOString(), venues: out }, null, 2));
console.log(out.length, "Hallen gespeichert");
