#!/usr/bin/env node
// Smoke-Test nach Start oder Update (Go-live-Runbook, Schritt 5): prüft nur Erreichbarkeit der Hauptseiten, ohne Anmeldung und ohne Schlüssel.
// Aufruf:  node scripts/smoke.mjs https://socaz.de [--turnier-only]
//   --apple         Apple-Anmeldung ist eingeschaltet (APPLE_LOGIN_ENABLED=1): /anmelden MUSS den Apple-Knopf zeigen; ohne die Option darf er NICHT erscheinen
//   --turnier-only  zusätzlich: /spiele zeigt die "kommt bald"-Seite (Produktion mit TURNIER_ONLY=1)
// Staging mit Zugangsschutz: Umgebungsvariable SMOKE_BASIC_AUTH=<benutzer>:<passwort> (nur in der eigenen Shell setzen, nie ausgeben).
// Ausgabe: je Prüfung eine Zeile OK/FEHLER (nur Pfad und Status, nie Inhalte); Ende-Code 0 = alles bestanden, 1 = mindestens ein Fehler, 2 = falscher Aufruf.

import { pathToFileURL } from "node:url";

const TIMEOUT_MS = 15_000;

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
export async function runSmoke({ base, turnierOnly = false, apple = false, fetchImpl = fetch, basicAuth = "" }) {
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
  return { results, ok: results.every((r) => r.ok) };
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const turnierOnly = args.includes("--turnier-only");
  const apple = args.includes("--apple");
  const base = args.find((a) => /^https?:\/\//.test(a));
  if (!base) {
    console.error("Aufruf: node scripts/smoke.mjs <https://adresse> [--turnier-only] [--apple]");
    process.exit(2);
  }
  const { results, ok } = await runSmoke({ base, turnierOnly, apple, basicAuth: process.env.SMOKE_BASIC_AUTH ?? "" });
  for (const r of results) console.log(`${r.ok ? "OK     " : "FEHLER "} ${r.path}  ${r.what}${r.ok ? "" : `: ${r.detail}`}`);
  console.log(ok ? "Alle Prüfungen bestanden" : "Mindestens eine Prüfung ist fehlgeschlagen");
  process.exit(ok ? 0 : 1);
}
