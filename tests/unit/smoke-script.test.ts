import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildChecks, runSmoke, sichtText, zahlungsWorte as smokeWorte, ZAHLUNGSWORTE as SMOKE_WORTE, ZAHLUNGEN_AUS_HINWEIS as SMOKE_HINWEIS } from "../../scripts/smoke.mjs";
import { ZAHLUNGEN_AUS_HINWEIS, ZAHLUNGSWORTE, zahlungsWorte } from "@/lib/zahlungen-aus";

// Go-live-Runbook Schritt 5: Smoke-Skript ohne Secrets. Der Abruf wird mit einer Attrappe ersetzt, es gibt kein Netz im Test.

const pages: Record<string, { status: number; body: string }> = {
  "/api/health": { status: 200, body: '{"status":"ok"}' },
  "/anmelden": { status: 200, body: "Mit Google anmelden" },
  "/turniere": { status: 200, body: "Turniere" },
  "/impressum": { status: 200, body: "Impressum" },
  "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:" },
  "/spiele": { status: 200, body: "Spiele kommen bald" },
};
const fake = (over: Record<string, { status: number; body: string }> = {}, seen: { url: string; auth?: string }[] = []) =>
  (async (url: string, init?: { headers?: Record<string, string> }) => {
    const p = new URL(url).pathname;
    seen.push({ url, auth: init?.headers?.Authorization });
    const r = over[p] ?? pages[p] ?? { status: 404, body: "" };
    return { status: r.status, text: async () => r.body };
  }) as unknown as typeof fetch;

describe("scripts/smoke.mjs", () => {
  it("alles in Ordnung: alle Prüfungen bestanden; /spiele nur mit --turnier-only", async () => {
    expect(buildChecks().map((c: { path: string }) => c.path)).toEqual(["/api/health", "/anmelden", "/anmelden", "/anmelden", "/turniere", "/impressum", "/robots.txt"]);
    expect(buildChecks({ turnierOnly: true }).map((c: { path: string }) => c.path)).toContain("/spiele");
    const r = await runSmoke({ base: "https://socaz.de/", fetchImpl: fake(), turnierOnly: true });
    expect(r.ok).toBe(true);
    expect(r.results).toHaveLength(8);
  });
  it("Fehlerfälle: Datenbank down, falscher Status, fehlender Inhalt, Server nicht erreichbar", async () => {
    expect((await runSmoke({ base: "https://x.de", fetchImpl: fake({ "/api/health": { status: 503, body: '{"status":"error"}' } }) })).ok).toBe(false);
    const leer = await runSmoke({ base: "https://x.de", fetchImpl: fake({ "/anmelden": { status: 200, body: "nichts" } }) });
    expect(leer.results.find((x: { path: string }) => x.path === "/anmelden")?.detail).toContain("Inhalt");
    const ohneBald = await runSmoke({ base: "https://x.de", turnierOnly: true, fetchImpl: fake({ "/spiele": { status: 200, body: "Alle Spiele" } }) });
    expect(ohneBald.ok).toBe(false);
    const down = await runSmoke({ base: "https://x.de", fetchImpl: (async () => { throw Object.assign(new Error("x"), { name: "TypeError" }); }) as unknown as typeof fetch });
    expect(down.ok).toBe(false);
    expect(down.results[0]?.detail).toContain("nicht erreichbar");
  });
  it("Anmeldeseite: kein Dev-Login in Produktion; Apple-Knopf nur mit --apple", async () => {
    const dev = await runSmoke({ base: "https://x.de", fetchImpl: fake({ "/anmelden": { status: 200, body: "Mit Google anmelden. Dev-Login (nur lokal)" } }) });
    expect(dev.results.find((x: { what: string }) => x.what.includes("Dev-Login"))?.ok).toBe(false);
    const mitApple = fake({ "/anmelden": { status: 200, body: "Mit Google anmelden. Mit Apple anmelden" } });
    expect((await runSmoke({ base: "https://x.de", fetchImpl: mitApple })).ok).toBe(false); // Apple-Knopf ohne Schalter
    expect((await runSmoke({ base: "https://x.de", fetchImpl: mitApple, apple: true })).ok).toBe(true);
    expect((await runSmoke({ base: "https://x.de", fetchImpl: fake(), apple: true })).ok).toBe(false); // Schalter an, Knopf fehlt
  });
  it("Zugangsschutz (Staging): Basic-Auth nur aus dem Parameter, nie in der Ergebnisausgabe", async () => {
    const seen: { url: string; auth?: string }[] = [];
    const r = await runSmoke({ base: "https://s.de", fetchImpl: fake({}, seen), basicAuth: "u:geheim" });
    expect(seen.every((s) => s.auth === `Basic ${Buffer.from("u:geheim").toString("base64")}`)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("geheim");
  });
  it("Quelltext: keine Schlüssel, keine .env-Zugriffe, keine feste Adresse", () => {
    const src = readFileSync(path.join(process.cwd(), "scripts/smoke.mjs"), "utf8");
    expect(src).not.toMatch(/readFileSync|\.env["'`]|DATABASE_URL|sk_live|sk_test|AUTH_SECRET/);
  });
});

describe("scripts/smoke.mjs --zahlungen-aus (beide Zahlungsschalter AUS)", () => {
  const html = (inner: string) => "<html><head><script>var x = 'Karte bezahlen';</script></head><body><nav>Menü</nav><main>" + inner + "</main></body></html>";
  const uuid = "123e4567-e89b-12d3-a456-426614174000";
  const sauber = {
    ...pages,
    "/turniere": { status: 200, body: html('<a href="/turniere/' + uuid + '">Cup</a> ' + SMOKE_HINWEIS) },
    "/hilfe": { status: 200, body: html("Hilfe. " + SMOKE_HINWEIS + " Tore und Karten erfassen.") },
    ["/turniere/" + uuid]: { status: 200, body: html("Kader füllen. Bereit melden.") },
  };
  const mit = (pfad: string, inner: string) => fake({ ...sauber, [pfad]: { status: 200, body: html(inner) } });
  it("sauber: bestanden (Skripte und Tags zählen nicht, Hinweissatz und Fußball-Karten sind erlaubt)", async () => {
    const r = await runSmoke({ base: "https://x.de", fetchImpl: fake(sauber), zahlungenAus: true });
    expect(r.results.filter((x: { what: string }) => x.what.startsWith("Zahlungen AUS")).map((x: { ok: boolean }) => x.ok)).toEqual([true, true, true]);
    expect(r.ok).toBe(true);
  });
  it("Zahlungswort auf Turnierliste, Hilfe oder Turnierseite, fehlender Hinweissatz: Fehler, ohne den Seiteninhalt auszugeben", async () => {
    expect((await runSmoke({ base: "https://x.de", fetchImpl: mit("/turniere", '<a href="/turniere/' + uuid + '">Cup</a> ' + SMOKE_HINWEIS + " Preis pro Spieler 10 €"), zahlungenAus: true })).ok).toBe(false);
    expect((await runSmoke({ base: "https://x.de", fetchImpl: mit("/hilfe", SMOKE_HINWEIS + " So läuft es ab"), zahlungenAus: true })).ok).toBe(false);
    const turnier = await runSmoke({ base: "https://x.de", fetchImpl: mit("/turniere/" + uuid, "Karte hinterlegt"), zahlungenAus: true });
    expect(turnier.ok).toBe(false);
    expect(JSON.stringify(turnier)).not.toContain("hinterlegt");
    const ohneHinweis = await runSmoke({ base: "https://x.de", fetchImpl: mit("/hilfe", "Hilfe ohne Satz"), zahlungenAus: true });
    expect(ohneHinweis.results.find((x: { path: string }) => x.path === "/hilfe")?.detail).toContain("Hinweissatz");
  });
  it("ohne Option --zahlungen-aus wird nichts davon geprüft", async () => {
    const r = await runSmoke({ base: "https://x.de", fetchImpl: fake() });
    expect(r.results.some((x: { what: string }) => x.what.startsWith("Zahlungen AUS"))).toBe(false);
  });
  it("Wortliste und Hinweissatz sind gleich der Quelle src/lib/zahlungen-aus.ts (die Kopie darf nicht abweichen)", () => {
    expect(SMOKE_HINWEIS).toBe(ZAHLUNGEN_AUS_HINWEIS);
    expect(SMOKE_WORTE.map((re: RegExp) => re.source + re.flags)).toEqual(ZAHLUNGSWORTE.map((re) => re.source + re.flags));
    for (const text of ["Die Ampel wird grün", "Preis pro Spieler 10", "Jeder hinterlegt eine Karte", "Anteil übernehmen", "Alles gut, Bracket erscheint", ZAHLUNGEN_AUS_HINWEIS + " ok"]) expect(smokeWorte(text)).toEqual(zahlungsWorte(text));
  });
  it("sichtText löst Entitäten nur EINMAL auf (kein doppeltes Entschlüsseln: &amp;quot; bleibt &quot;, &amp;lt;b&amp;gt; bleibt Text)", () => {
    expect(sichtText(html("&amp;quot; &amp;amp; &amp;lt;b&amp;gt;")).trim()).toBe("&quot; &amp; &lt;b&gt;");
    expect(sichtText(html("Gr&uuml;&szlig;e &quot;x&quot; a&nbsp;b")).trim()).toBe("Grüße \"x\" a b");
  });
  it("sichtText: nur Hauptbereich, keine Skripte und Tags", () => {
    expect(sichtText(html("A &amp; B <b>fett</b>")).trim()).toBe("A & B fett");
  });
});
