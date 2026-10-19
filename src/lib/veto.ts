// Hallen-Veto wie die Map-Veto-Phase bei Counter-Strike und FACEIT: Abwechselnd bannen beide Teams Hallen, die letzte übrige wird gespielt.

export const VETO_POOL_SIZE = 7; // 7 Hallen: sechs Banns, jedes Team dreimal
export const VETO_TURN_MS = 2 * 3_600_000; // wer in zwei Stunden nicht bannt, bei dem bannt das System zufällig
export const MIN_POOL = 2;

export type PoolVenue = { id: string; name: string; city: string; lat: number | null; lng: number | null; partner: boolean; verified: boolean };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Wählt die Hallen für das Veto: zuerst die der Spielstadt (Partner und geprüfte Hallen vorn), danach die nächstgelegenen in NRW.
 * Ohne Koordinaten der Spielstadt entscheidet nur die Reihenfolge Partner, geprüft, Name.
 */
export function buildPool(all: PoolVenue[], city: string, size = VETO_POOL_SIZE): PoolVenue[] {
  const rank = (v: PoolVenue) => (v.partner ? 0 : v.verified ? 1 : 2);
  const byQuality = (a: PoolVenue, b: PoolVenue) => rank(a) - rank(b) || a.name.localeCompare(b.name, "de");
  const here = all.filter((v) => v.city === city).sort(byQuality);
  const withCoords = here.filter((v) => v.lat !== null && v.lng !== null);
  const centre = withCoords.length ? { lat: withCoords.reduce((s, v) => s + v.lat!, 0) / withCoords.length, lng: withCoords.reduce((s, v) => s + v.lng!, 0) / withCoords.length } : null;
  const others = all
    .filter((v) => v.city !== city)
    .sort((a, b) => {
      if (centre && a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null) {
        const d = distanceKm(centre, { lat: a.lat, lng: a.lng }) - distanceKm(centre, { lat: b.lat, lng: b.lng });
        if (Math.abs(d) > 0.5) return d;
      }
      return byQuality(a, b);
    });
  return [...here, ...others].slice(0, size);
}

/** Wer ist bei Bann Nummer n (ab 0) dran? Die Teams wechseln sich ab. */
export const turnOf = (banNumber: number, first: string, second: string) => (banNumber % 2 === 0 ? first : second);

/** Ein Veto ist fertig, wenn nur noch eine Halle übrig ist. */
export const vetoDone = (remaining: number) => remaining <= 1;

/** Anzahl der Banns, bis eine Halle übrig bleibt. */
export const totalBans = (poolSize: number) => Math.max(poolSize - 1, 0);
