#!/usr/bin/env node
// Smoke-Test nach Start oder Update (Go-live-Runbook, Schritt 5): prüft nur Erreichbarkeit der Hauptseiten, ohne Anmeldung und ohne Schlüssel.
// Aufruf:  node scripts/smoke.mjs https://socaz.de [--turnier-only]
//   --apple         Apple-Anmeldung ist eingeschaltet (APPLE_LOGIN_ENABLED=1): /anmelden MUSS den Apple-Knopf zeigen; ohne die Option darf er NICHT erscheinen
//   --zahlungen-aus Zahlungen AUS (Produktion, beide Zahlungsschalter aus): Turnierliste, Hilfe und die erste Turnierseite dürfen KEIN Zahlungswort enthalten (Wortliste wie src/lib/zahlungen-aus.ts), Liste und Hilfe nennen den Hinweissatz
//   --turnier-only  zusätzlich: /spiele zeigt die "kommt bald"-Seite (Produktion mit TURNIER_ONLY=1)
// Staging mit Zugangsschutz: Umgebungsvariable SMOKE_BASIC_AUTH=<benutzer>:<passwort> (nur in der eigenen Shell setzen, nie ausgeben).
// Ausgabe: je Prüfung eine Zeile OK/FEHLER (nur Pfad und Status, nie Inhalte); Ende-Code 0 = alles bestanden, 1 = mindestens ein Fehler, 2 = falscher Aufruf.

import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 15_000;

// Kopie der Wortliste aus src/lib/zahlungen-aus.ts (dieses Skript läuft ohne Build, reines Node); tests/unit/smoke-script.test.ts hält beide Listen gleich.
export const ZAHLUNGEN_AUS_HINWEIS = "Die Teilnahmegebühr regelt der Veranstalter außerhalb von Soccaz.";
export const ZAHLUNGSWORTE = [/\bampel\b/i, /\bso läuft es ab\b/i, /preis pro spieler/i, /hallenkosten/i, /\bkarten?\b/i, /abbuchung|abgebucht|abbuch/i, /bezahl/i, /zahlungspflicht/i, /treuhand/i, /\banteil übernehmen\b/i];
const FUSSBALL_KARTEN = /\b(?:gelbe[nr]?|rote[nr]?)\s+karten?\b|\btore und karten\b/gi; // keine Zahlungskarten

// Entitäten in EINEM Durchgang auflösen (nie hintereinander: "&amp;quot;" bleibt "&quot;", wird nicht zu einem Anführungszeichen; CodeQL js/double-escaping). Unbekannte Entitäten werden zu einem Leerzeichen.
const ENTITAET_ZEICHEN = { amp: "&", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", quot: "\"", "#x27": "'", "#39": "'", nbsp: " ", lt: "<", gt: ">" };
const ENTITAETEN = /&(amp|auml|ouml|uuml|Auml|Ouml|Uuml|szlig|quot|#x27|#39|nbsp|lt|gt);/g;

/** Sichtbarer Text einer HTML-Seite (Hauptbereich, ohne Skripte, Stile, Tags). */
export function sichtText(html) {
  const main = /<main[\s>][\s\S]*?<\/main>/i.exec(html);
  return (main ? main[0] : html)
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(ENTITAETEN, (_m, name) => ENTITAET_ZEICHEN[name] ?? " ")
    .replace(/\s+/g, " ");
}

/** Welche verbotenen Zahlungswörter stehen im Text? (Hinweissatz und Fußball-Karten zählen nicht.) */
export function zahlungsWorte(text) {
  const rein = text.split(ZAHLUNGEN_AUS_HINWEIS).join(" ").replace(FUSSBALL_KARTEN, " ");
  return ZAHLUNGSWORTE.filter((re) => re.test(rein)).map((re) => re.source);
}

/** Die Prüfungen: Pfad, erwarteter Status, optionale Inhaltsprüfung (nur Ja/Nein, der Inhalt wird nie ausgegeben). */
export function buildChecks({ turnierOnly = false, apple = false } = {}) {
  const checks = [
    { path: "/api/health", status: 200, test: (body) => /"status"\s*:\s*"ok"/.test(body), what: "Gesundheit (Datenbank erreichbar)" },
    { path: "/anmelden", status: 200, test: (body) => /google/i.test(body), what: "Anmeldeseite mit Google" },
    { path: "/anmelden", status: 200, test: (body) => !/dev-login/i.test(body), what: "kein Dev-Login auf der Anmeldeseite" },
    { path: "/anmelden", status: 200, test: (body) => (apple ? /apple/i.test(body) : !/apple/i.test(body)), what: apple ? "Apple-Knopf vorhanden (APPLE_LOGIN_ENABLED=1)" : "kein Apple-Knopf (APPLE_LOGIN_ENABLED nicht gesetzt)" },
    { path: "/turniere", status: 200, what: "Turnierliste" },
    { path: "/impressum", status: 200, what: "Impressum" },
    { path: "/robots.txt", status: 200, test: (body) => /user-agent/i.test(body), what: "robots.txt" },
  ];
  if (turnierOnly) checks.push({ path: "/spiele", status: 200, test: (body) => /bald/i.test(body), what: "/spiele zeigt die „kommt bald“-Seite (TURNIER_ONLY)" });
  return checks;
}

/** Führt die Prüfungen aus. `fetchImpl` ist austauschbar (Test); Rückgabe: Ergebniszeilen und Gesamtergebnis. */
export async function runSmoke({ base, turnierOnly = false, apple = false, zahlungenAus = false, fetchImpl = fetch, basicAuth = "" }) {
  const root = base.replace(/\/+$/, "");
  const headers = basicAuth ? { Authorization: `Basic ${Buffer.from(basicAuth).toString("base64")}` } : {};
  const results = [];
  for (const c of buildChecks({ turnierOnly, apple })) {
    let ok = false;
    let detail = "";
    try {
      const res = await fetchImpl(root + c.path, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = await res.text();
      if (res.status !== c.status) detail = `Status ${res.status} statt ${c.status}`;
      else if (c.test && !c.test(body)) detail = "Inhalt nicht wie erwartet";
      else ok = true;
    } catch (e) {
      detail = `nicht erreichbar (${e && e.name ? e.name : "Fehler"})`;
    }
    results.push({ path: c.path, what: c.what, ok, detail });
  }
  if (zahlungenAus) {
    // Öffentlich prüfbare Folge von "beide Zahlungsschalter AUS": keine Zahlungswörter auf den Seiten der Turnier-Nutzer (bei Preis 0). Die Schalter selbst: Runbook 4a (Admin-Seite, Datenbankprüfung).
    const pruefe = async (pfad, what, mitHinweis) => {
      try {
        const res = await fetchImpl(root + pfad, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
        const html = await res.text();
        const text = sichtText(html);
        const funde = zahlungsWorte(text);
        let detail = "";
        if (res.status !== 200) detail = `Status ${res.status} statt 200`;
        else if (funde.length > 0) detail = `Zahlungswort gefunden (${funde.length}): ${funde.join(", ")}`;
        else if (mitHinweis && !text.includes(ZAHLUNGEN_AUS_HINWEIS)) detail = "Hinweissatz fehlt";
        results.push({ path: pfad, what, ok: detail === "", detail });
        return html;
      } catch (e) {
        results.push({ path: pfad, what, ok: false, detail: `nicht erreichbar (${e && e.name ? e.name : "Fehler"})` });
        return "";
      }
    };
    const liste = await pruefe("/turniere", "Zahlungen AUS: Turnierliste ohne Zahlungswörter, mit Hinweissatz", true);
    await pruefe("/hilfe", "Zahlungen AUS: Hilfe ohne Zahlungswörter, mit Hinweissatz", true);
    const turnier = /href="\/turniere\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i.exec(liste);
    if (turnier) await pruefe("/turniere/" + turnier[1], "Zahlungen AUS: erste Turnierseite ohne Zahlungswörter (Turnier mit Preis = Altbestand, dann Befund prüfen)", false);
    else results.push({ path: "/turniere/<id>", what: "Zahlungen AUS: keine Turnierseite in der Liste (übersprungen)", ok: true, detail: "" });
  }
  return { results, ok: results.every((r) => r.ok) };
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const turnierOnly = args.includes("--turnier-only");
  const apple = args.includes("--apple");
  const zahlungenAus = args.includes("--zahlungen-aus");
  const base = args.find((a) => /^https?:\/\//.test(a));
  if (!base) {
    console.error("Aufruf: node scripts/smoke.mjs <https://adresse> [--turnier-only] [--apple] [--zahlungen-aus]");
    process.exit(2);
  }
  const { results, ok } = await runSmoke({ base, turnierOnly, apple, zahlungenAus, basicAuth: process.env.SMOKE_BASIC_AUTH ?? "" });
  for (const r of results) console.log(`${r.ok ? "OK     " : "FEHLER "} ${r.path}  ${r.what}${r.ok ? "" : `: ${r.detail}`}`);
  console.log(ok ? "Alle Prüfungen bestanden" : "Mindestens eine Prüfung ist fehlgeschlagen");
  process.exit(ok ? 0 : 1);
}
