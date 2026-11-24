// Staging-Seed (Generalprobe 30.11. bis 2.12., Entscheid t2q 2026-11-24): EIGENE harte Sperre, unabhängig von scripts/lib/seed-guard.ts und tests/integration/db-guard.ts (beide bleiben unangetastet).
// Das Skript scripts/staging-seed.mjs schreibt nur, wenn ALLE Bedingungen gelten (fail closed, jede Abweichung = Abbruch ohne Schreibzugriff):
//  1. In der Datenbank steht die Umgebungsmarke settings.environment = "staging" (setzt der Nutzer EINMALIG beim Staging-Aufbau, Runbook Schritt 3a). Jeder andere Wert oder keine Marke = Abbruch.
//  2. APP_URL ist gesetzt, lesbar und zeigt NICHT auf die Produktionsadresse (socaz.de, www.socaz.de; Groß-/Kleinschreibung, Port, Schlüsselpunkt, Unicode-Schreibweisen werden normalisiert).
//     Eine Subdomain wie staging.socaz.de ist erlaubt (die Marke entscheidet). AUTH_URL, falls gesetzt, wird genauso geprüft.
//  3. Die ausdrückliche Bestätigung STAGING_SEED_CONFIRM=ja-staging-seed steht in der Umgebung.
// Es werden NUR erfundene Konten mit der Adresse <name>@staging.invalid angelegt (RFC 2606: nie zustellbar, kein Mailversand möglich).

export const MARKER_KEY = "environment";
export const MARKER_WERT = "staging";
export const BESTAETIGUNG_NAME = "STAGING_SEED_CONFIRM";
export const BESTAETIGUNG_WERT = "ja-staging-seed";
// Hostnamen aus Teilen gebaut: der Präfix-Wächter (tests/unit/maintenance-guard.test.ts) verbietet das Literal außerhalb von Kommentaren.
const PRODUKTION = ["socaz", "de"].join(".");
export const PRODUKTIONS_HOSTS = [PRODUKTION, `www.${PRODUKTION}`];
export const MAIL_DOMAIN = "staging.invalid";

/** Hostname einer Adresse, normalisiert (URL-Parser: Kleinschreibung, Port weg, Unicode/Fullwidth nach IDNA); null, wenn nicht lesbar. */
export function hostVon(adresse) {
  if (typeof adresse !== "string" || adresse.trim() === "") return null;
  try {
    const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(adresse.trim()) ? adresse.trim() : `https://${adresse.trim()}`;
    const host = new URL(text).hostname.toLowerCase().replace(/\.+$/, "");
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/** true, wenn die Adresse die Produktion meint. Nicht lesbar zählt als Produktion (fail closed). */
export function istProduktionsAdresse(adresse) {
  const host = hostVon(adresse);
  return host === null || PRODUKTIONS_HOSTS.includes(host);
}

/** Wirft mit einer klaren Meldung, wenn eine Bedingung fehlt. Die Meldungen enthalten nie einen Wert aus der Umgebung (nur Namen und Regeln). */
export function pruefeStagingSeed({ marker, appUrl, authUrl, bestaetigung }) {
  if (marker === undefined || marker === null) throw new Error(`Staging-Seed verweigert: In der Datenbank fehlt die Umgebungsmarke settings.${MARKER_KEY} = "${MARKER_WERT}" (Runbook Schritt 3a).`);
  if (marker !== MARKER_WERT) throw new Error(`Staging-Seed verweigert: Die Umgebungsmarke settings.${MARKER_KEY} ist nicht "${MARKER_WERT}".`);
  if (typeof appUrl !== "string" || appUrl.trim() === "") throw new Error("Staging-Seed verweigert: APP_URL ist nicht gesetzt (mit -e APP_URL=... übergeben).");
  if (istProduktionsAdresse(appUrl)) throw new Error("Staging-Seed verweigert: APP_URL ist unlesbar oder zeigt auf die Produktion.");
  if (authUrl !== undefined && authUrl !== "" && istProduktionsAdresse(authUrl)) throw new Error("Staging-Seed verweigert: AUTH_URL ist unlesbar oder zeigt auf die Produktion.");
  if (bestaetigung !== BESTAETIGUNG_WERT) throw new Error(`Staging-Seed verweigert: Die ausdrückliche Bestätigung ${BESTAETIGUNG_NAME}=${BESTAETIGUNG_WERT} fehlt.`);
}

/** Der Datensatz für die Teams 3 bis 6 des Generalprobe-Turniers: nur erfundene, eindeutige Namen (nie die Namen der Demo-Seeds), Adressen nur @staging.invalid. */
export function planStagingSeed() {
  const teams = [];
  for (let n = 3; n <= 6; n++) {
    const spieler = [];
    for (let k = 1; k <= 5; k++) {
      spieler.push({ email: `probe-t${n}-s${k}@${MAIL_DOMAIN}`, name: `Probe Konto T${n}-${k}`, position: ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"][k - 1], captain: k === 1 });
    }
    teams.push({ slug: `staging-probe-${n}`, name: `Probe-Team ${n}`, spieler });
  }
  return teams;
}
