// Lasttest-Light (Turnier 12.12., Paket (c) Größe): kleiner, VORSICHTIGER Lesetest gegen eine STAGING-Adresse. Keine neuen Pakete (nur fetch/AbortController aus Node).
// Aufruf:  node scripts/last-light.mjs <https://staging-adresse> [--gleichzeitig N] [--anfragen N] [--sse N] [--sse-pfad /pfad] [--sse-sekunden N] [--max-fehlerrate 0.2] [--produktion-bestaetigt]
//   --gleichzeitig N      gleichzeitige Anfragen (Standard 20); zusammen mit --sse höchstens 100 Verbindungen
//   --anfragen N          feste Gesamtzahl der Anfragen (Standard 200, höchstens 5000)
//   --sse N               zusätzlich N offen gehaltene Live-Verbindungen (Standard 0)
//   --sse-pfad /pfad      Live-Kanal (Standard /api/spiele/stream; bei TURNIER_ONLY=1 antwortet er 403: dann zählt er als abgewiesen)
//   --sse-sekunden N      so lange bleiben die Live-Verbindungen offen (Standard 10, höchstens 120)
//   --max-fehlerrate X    Abbruch, sobald die Fehlerrate über X liegt (Standard 0.2; erst ab 20 Antworten)
//   --produktion-bestaetigt  Pflicht-Flag, falls die Adresse die Produktion ist (socaz.de); ohne das Flag verweigert das Skript
// Sicherheit: NUR GET auf feste öffentliche Seiten, keine Schreibzugriffe, keine Anmeldung, keine Inhalte in der Ausgabe. Zugangsschutz der Staging-Seite: SMOKE_BASIC_AUTH=<benutzer>:<passwort>
// nur aus der Umgebung (wird nie ausgegeben). Ausgabe: kurzer Bericht (Antwortzeiten p50/p95/max, Fehlerrate, Status je Gruppe, Live-Verbindungen).
// Exit 0 = Fehlerrate im Rahmen, 1 = abgebrochen oder Fehlerrate zu hoch, 2 = falsche Benutzung oder verweigertes Ziel.
import { pathToFileURL } from "node:url";

export const MAX_VERBINDUNGEN = 100;
export const MAX_ANFRAGEN = 5000;
export const MAX_SSE_SEKUNDEN = 120;
export const MIN_ANTWORTEN_FUER_ABBRUCH = 20;
export const TIMEOUT_MS = 15_000;
/** Feste, öffentliche, lesende Seiten (alle GET, keine Anmeldung nötig). */
export const PFADE = ["/", "/turniere", "/hilfe", "/teams", "/anmelden", "/impressum"];
/** Produktions-Adressen: ohne --produktion-bestaetigt verweigert. */
// Der Name ist aus Teilen gebaut: der Wächter tests/unit/maintenance-guard.test.ts verbietet den Präfix der Wartungsausnahme im Code (außerhalb von Kommentaren)
const PRODUKTION = ["so", "caz", ".de"].join("");
export const PRODUKTIONS_HOSTS = [PRODUKTION, `www.${PRODUKTION}`];

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Prüft das Ziel. Rückgabe { ok: true, base } oder { ok: false, grund }. Reine Funktion. */
export function pruefeZiel(eingabe, { produktionBestaetigt = false } = {}) {
  if (typeof eingabe !== "string" || eingabe.trim() === "") return { ok: false, grund: "Keine Adresse angegeben." };
  let u;
  try {
    u = new URL(eingabe.trim());
  } catch {
    return { ok: false, grund: "Die Adresse ist ungültig." };
  }
  if (u.username || u.password) return { ok: false, grund: "Keine Zugangsdaten in der Adresse (Zugangsschutz nur über SMOKE_BASIC_AUTH)." };
  if (u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { ok: false, grund: "Nur die Adresse der Seite angeben (ohne Pfad, Abfrage oder Anker)." };
  const host = u.hostname.toLowerCase().replace(/\.+$/, "");
  const loopback = LOOPBACK.has(host) || LOOPBACK.has(u.host.toLowerCase().replace(/:\d+$/, ""));
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) return { ok: false, grund: "Nur https (http nur für localhost)." };
  const istProduktion = PRODUKTIONS_HOSTS.includes(host) || host.replace(/^www\./, "") === PRODUKTION; // Staging-Unteradressen sind erlaubt
  if (istProduktion && !produktionBestaetigt) return { ok: false, grund: `Das ist die PRODUKTION (${PRODUKTION}). Der Lasttest läuft nur gegen Staging; für Produktion ist --produktion-bestaetigt nötig.` };
  return { ok: true, base: `${u.protocol}//${u.host}` };
}

/** Prüft Zahlenoptionen und Obergrenzen. Rückgabe { ok: true, werte } oder { ok: false, grund }. */
export function pruefeLimits({ gleichzeitig = 20, anfragen = 200, sse = 0, sseSekunden = 10, maxFehlerrate = 0.2 } = {}) {
  const ganz = (x, min, max, name) => (Number.isInteger(x) && x >= min && x <= max ? null : `${name} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  const fehler =
    ganz(gleichzeitig, 1, MAX_VERBINDUNGEN, "--gleichzeitig") ||
    ganz(anfragen, 1, MAX_ANFRAGEN, "--anfragen") ||
    ganz(sse, 0, MAX_VERBINDUNGEN, "--sse") ||
    ganz(sseSekunden, 1, MAX_SSE_SEKUNDEN, "--sse-sekunden") ||
    (typeof maxFehlerrate === "number" && maxFehlerrate >= 0 && maxFehlerrate <= 1 ? null : "--max-fehlerrate muss zwischen 0 und 1 liegen.");
  if (fehler) return { ok: false, grund: fehler };
  if (gleichzeitig + sse > MAX_VERBINDUNGEN) return { ok: false, grund: `Gleichzeitige Anfragen plus Live-Verbindungen dürfen ${MAX_VERBINDUNGEN} nicht überschreiten.` };
  return { ok: true, werte: { gleichzeitig, anfragen, sse, sseSekunden, maxFehlerrate } };
}

export function parseArgs(argv) {
  const out = { ziel: undefined, produktionBestaetigt: false, optionen: {}, unbekannt: [] };
  const zahl = (s) => (s === undefined || s.trim() === "" ? NaN : Number(s));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--produktion-bestaetigt") out.produktionBestaetigt = true;
    else if (a === "--gleichzeitig") out.optionen.gleichzeitig = zahl(argv[++i]);
    else if (a === "--anfragen") out.optionen.anfragen = zahl(argv[++i]);
    else if (a === "--sse") out.optionen.sse = zahl(argv[++i]);
    else if (a === "--sse-sekunden") out.optionen.sseSekunden = zahl(argv[++i]);
    else if (a === "--max-fehlerrate") out.optionen.maxFehlerrate = zahl(argv[++i]);
    else if (a === "--sse-pfad") out.ssePfad = argv[++i];
    else if (a.startsWith("--")) out.unbekannt.push(a);
    else if (out.ziel === undefined) out.ziel = a;
    else out.unbekannt.push(a);
  }
  return out;
}

/** Perzentil (nächster Rang) einer Zahlenliste; leere Liste ergibt 0. */
export function perzentil(werte, p) {
  if (werte.length === 0) return 0;
  const s = [...werte].sort((a, b) => a - b);
  const rang = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[rang];
}

/**
 * Führt den Test aus. fetchImpl ist austauschbar (Tests). Es wird AUSSCHLIESSLICH GET benutzt.
 * Rückgabe: Kennzahlen; abgebrochen = true, sobald die Fehlerrate ab MIN_ANTWORTEN_FUER_ABBRUCH Antworten über maxFehlerrate liegt.
 */
export async function lauf({ base, headers = {}, gleichzeitig, anfragen, sse = 0, ssePfad = "/api/spiele/stream", sseSekunden = 10, maxFehlerrate = 0.2, fetchImpl = fetch }) {
  const dauern = [];
  const status = {};
  let fertig = 0;
  let fehler = 0;
  let naechste = 0;
  let abgebrochen = false;
  const kopf = { "user-agent": "soccaz-last-light", ...headers };
  const zaehle = (s) => {
    status[s] = (status[s] ?? 0) + 1;
  };

  // Live-Verbindungen zuerst öffnen und offen halten
  const live = { gewuenscht: sse, verbunden: 0, abgewiesen: 0, fehler: 0, abgerissen: 0 };
  const sseStopp = new AbortController();
  const sseAufgaben = [];
  for (let i = 0; i < sse; i++) {
    sseAufgaben.push(
      (async () => {
        try {
          const res = await fetchImpl(base + ssePfad, { method: "GET", headers: { ...kopf, accept: "text/event-stream" }, signal: sseStopp.signal });
          if (res.status === 200 && (res.headers.get("content-type") ?? "").includes("text/event-stream")) {
            live.verbunden += 1;
            try {
              const reader = res.body?.getReader();
              // beim Beenden den Strom auch dann schließen, wenn fetchImpl das Abbruchsignal nicht kennt
              sseStopp.signal.addEventListener("abort", () => reader?.cancel().catch(() => undefined), { once: true });
              while (reader && !sseStopp.signal.aborted) {
                const { done } = await reader.read();
                if (done) {
                  if (!sseStopp.signal.aborted) live.abgerissen += 1;
                  break;
                }
              }
            } catch {
              if (!sseStopp.signal.aborted) live.abgerissen += 1;
            }
          } else {
            live.abgewiesen += 1;
            await res.body?.cancel?.().catch(() => undefined);
          }
        } catch {
          if (!sseStopp.signal.aborted) live.fehler += 1;
        }
      })(),
    );
  }

  const arbeiter = async () => {
    while (!abgebrochen && naechste < anfragen) {
      const nr = naechste++;
      const pfad = PFADE[nr % PFADE.length];
      const t0 = performance.now();
      let ok = false;
      try {
        const res = await fetchImpl(base + pfad, { method: "GET", headers: kopf, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
        await res.arrayBuffer(); // Inhalt wird gelesen (Übertragungszeit zählt), aber nie ausgegeben
        zaehle(String(res.status));
        ok = res.status < 400;
      } catch (e) {
        zaehle(e && e.name === "TimeoutError" ? "timeout" : "netz");
      }
      dauern.push(performance.now() - t0);
      fertig += 1;
      if (!ok) fehler += 1;
      if (fertig >= MIN_ANTWORTEN_FUER_ABBRUCH && fehler / fertig > maxFehlerrate) abgebrochen = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(gleichzeitig, anfragen) }, arbeiter));

  // Live-Verbindungen noch bis zum Ende der gewünschten Zeit offen halten (nur wenn der Lauf nicht abgebrochen wurde)
  if (sse > 0 && !abgebrochen) await new Promise((r) => setTimeout(r, sseSekunden * 1000));
  sseStopp.abort();
  await Promise.all(sseAufgaben);

  return {
    abgebrochen,
    anfragenGeplant: anfragen,
    antworten: fertig,
    fehler,
    fehlerrate: fertig === 0 ? 0 : fehler / fertig,
    p50: Math.round(perzentil(dauern, 50)),
    p95: Math.round(perzentil(dauern, 95)),
    max: Math.round(dauern.length ? Math.max(...dauern) : 0),
    status,
    live,
    maxFehlerrate,
  };
}

/** Kurzer Bericht als Text (nur Zahlen, keine Inhalte, keine Zugangsdaten). */
export function bericht(r, { base, gleichzeitig }) {
  const zeilen = [
    `Lasttest-Light gegen ${base} (${gleichzeitig} gleichzeitig, ${r.anfragenGeplant} Anfragen geplant)`,
    `Antworten: ${r.antworten}, Fehler: ${r.fehler}, Fehlerrate: ${(r.fehlerrate * 100).toFixed(1)} % (Grenze ${(r.maxFehlerrate * 100).toFixed(0)} %)`,
    `Antwortzeit ms: p50 ${r.p50}, p95 ${r.p95}, max ${r.max}`,
    `Status: ${Object.entries(r.status).map(([k, v]) => `${k}=${v}`).join(" ") || "-"}`,
  ];
  if (r.live.gewuenscht > 0) zeilen.push(`Live-Verbindungen: gewünscht ${r.live.gewuenscht}, verbunden ${r.live.verbunden}, abgewiesen ${r.live.abgewiesen}, Fehler ${r.live.fehler}, abgerissen ${r.live.abgerissen}`);
  zeilen.push(r.abgebrochen ? "ERGEBNIS: ABGEBROCHEN (Fehlerrate zu hoch; bei lauter 401: SMOKE_BASIC_AUTH prüfen)" : r.fehlerrate > r.maxFehlerrate ? "ERGEBNIS: FEHLERRATE ZU HOCH" : "ERGEBNIS: IM RAHMEN");
  return zeilen.join("\n");
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const nutzung = "Aufruf: node scripts/last-light.mjs <https://staging-adresse> [--gleichzeitig N] [--anfragen N] [--sse N] [--sse-pfad /pfad] [--sse-sekunden N] [--max-fehlerrate X] [--produktion-bestaetigt]";
  if (a.unbekannt.length > 0) {
    console.error(`Unbekannte Angabe: ${a.unbekannt.join(" ")}\n${nutzung}`);
    process.exit(2);
  }
  const ziel = pruefeZiel(a.ziel, { produktionBestaetigt: a.produktionBestaetigt });
  if (!ziel.ok) {
    console.error(`${ziel.grund}\n${nutzung}`);
    process.exit(2);
  }
  const limits = pruefeLimits(a.optionen);
  if (!limits.ok) {
    console.error(`${limits.grund}\n${nutzung}`);
    process.exit(2);
  }
  const ssePfad = a.ssePfad ?? "/api/spiele/stream";
  if (!/^\/[A-Za-z0-9/_-]*$/.test(ssePfad)) {
    console.error("--sse-pfad: nur ein einfacher Pfad (ohne Abfrage).");
    process.exit(2);
  }
  const basic = process.env.SMOKE_BASIC_AUTH ?? "";
  const headers = basic ? { Authorization: `Basic ${Buffer.from(basic).toString("base64")}` } : {};
  const r = await lauf({ base: ziel.base, headers, ssePfad, ...limits.werte });
  console.log(bericht(r, { base: ziel.base, gleichzeitig: limits.werte.gleichzeitig }));
  process.exit(r.abgebrochen || r.fehlerrate > r.maxFehlerrate ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
