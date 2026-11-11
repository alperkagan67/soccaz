// Schutz für scripts/seed-frontend.mts: Der Seed läuft nur gegen die lokale Dev-Datenbank.
// Allowlist: Host localhost bzw. 127.0.0.1, Port 5433, Datenbank soccav2 oder soccaz_w1 bis soccaz_w4.
// Bei Produktion oder jeder anderen URL gibt es einen Abbruch mit klarer Meldung; es wird nichts angefasst.

export const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];
export const ALLOWED_PORT = "5433";
export const ALLOWED_DATABASES = ["soccav2", "soccaz_w1", "soccaz_w2", "soccaz_w3", "soccaz_w4"];

export type SeedEnv = { nodeEnv?: string; databaseUrl?: string };

/** Wirft einen Fehler, wenn der Seed hier nicht laufen darf. Gibt Host, Port und Datenbankname zurück (nie Zugangsdaten). */
export function assertSeedAllowed(env: SeedEnv): { host: string; port: string; database: string } {
  if (env.nodeEnv === "production") {
    throw new Error("Abbruch: seed-frontend läuft nie mit NODE_ENV=production. Es wurde nichts verändert.");
  }
  if (!env.databaseUrl) {
    throw new Error("Abbruch: DATABASE_URL fehlt (aus der Prozessumgebung, z. B. node --env-file=.env.local). Es wurde nichts verändert.");
  }
  let url: URL;
  try {
    url = new URL(env.databaseUrl);
  } catch {
    throw new Error("Abbruch: DATABASE_URL ist keine gültige URL. Es wurde nichts verändert.");
  }
  // pg übernimmt Query-Parameter (host, hostaddr, port, database) mit Vorrang vor dem URL-Teil: jede Query und jedes Fragment ist verboten.
  if (env.databaseUrl.includes("?") || env.databaseUrl.includes("#") || url.search !== "" || url.hash !== "") {
    throw new Error("Abbruch: DATABASE_URL darf keine Query-Parameter oder Fragmente enthalten (sie könnten Host, Port oder Datenbank ersetzen). Es wurde nichts verändert.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Abbruch: DATABASE_URL muss mit postgres:// oder postgresql:// beginnen. Es wurde nichts verändert.");
  }
  if (url.hostname.includes("@")) {
    throw new Error("Abbruch: DATABASE_URL hat einen ungültigen Host. Es wurde nichts verändert.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const host = url.hostname;
  const port = url.port;
  if (!ALLOWED_HOSTS.includes(host) || port !== ALLOWED_PORT || !ALLOWED_DATABASES.includes(database)) {
    throw new Error(
      `Abbruch: erlaubt sind nur ${ALLOWED_HOSTS.join(" oder ")}:${ALLOWED_PORT} mit einer der Datenbanken ${ALLOWED_DATABASES.join(", ")}. Gefunden: ${host}:${port || "(kein Port)"}/${database || "(keine Datenbank)"}. Es wurde nichts verändert.`,
    );
  }
  return { host, port, database };
}
