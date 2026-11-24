import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bericht, lauf, MAX_ANFRAGEN, MAX_VERBINDUNGEN, parseArgs, perzentil, pruefeLimits, pruefeZiel } from "../../scripts/last-light.mjs";

// Lasttest-Light: Verweigerungsfälle, Grenzen, nur GET, Abbruch bei Fehlerrate, Live-Verbindungen, keine Zugangsdaten in der Ausgabe
const skript = (args: string[], env: Record<string, string> = {}) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolve) =>
    execFile(process.execPath, ["scripts/last-light.mjs", ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv }, (err: Error | null, stdout: string, stderr: string) =>
      resolve({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout, stderr })));

describe("pruefeZiel: Produktion und unsichere Ziele werden verweigert", () => {
  it("socaz.de in jeder Schreibweise ohne Bestätigung verweigert, mit Flag erlaubt", () => {
    for (const z of ["https://socaz.de", "https://www.socaz.de", "https://SOCAZ.DE", "https://socaz.de.", "https://socaz.de:443", "https://WWW.Socaz.de/"]) {
      const r = pruefeZiel(z);
      expect(r.ok, z).toBe(false);
      expect(r.ok === false && r.grund, z).toMatch(/PRODUKTION/);
      expect(pruefeZiel(z, { produktionBestaetigt: true }).ok, z + " mit Flag").toBe(true);
    }
  });
  it("Staging-Unteradressen sind erlaubt; ähnlich aussehende fremde Adressen sind keine Produktion, aber auch kein Freibrief für http", () => {
    expect(pruefeZiel("https://staging.socaz.de")).toEqual({ ok: true, base: "https://staging.socaz.de" });
    expect(pruefeZiel("https://staging-socaz.example.org")).toMatchObject({ ok: true });
    expect(pruefeZiel("http://staging.socaz.de").ok).toBe(false);
  });
  it("nur https; http nur für localhost; keine Zugangsdaten, Pfade, Abfragen, Anker; keine Müll-Eingaben", () => {
    expect(pruefeZiel("http://127.0.0.1:3101")).toEqual({ ok: true, base: "http://127.0.0.1:3101" });
    expect(pruefeZiel("http://localhost:3101")).toMatchObject({ ok: true });
    for (const z of ["http://example.org", "ftp://example.org", "file:///etc/passwd", "https://user:pw@staging.example.org", "https://staging.example.org/pfad", "https://staging.example.org/?x=1", "https://staging.example.org/#a", "", "   ", "kein url", undefined, 5]) {
      expect(pruefeZiel(z as string).ok, String(z)).toBe(false);
    }
  });
});

describe("pruefeLimits: Obergrenzen", () => {
  it("Standardwerte gültig; zusammen höchstens 100 Verbindungen; Anfragen höchstens 5000", () => {
    expect(pruefeLimits({}).ok).toBe(true);
    expect(pruefeLimits({ gleichzeitig: 100 }).ok).toBe(true);
    expect(pruefeLimits({ gleichzeitig: 101 }).ok).toBe(false);
    expect(pruefeLimits({ gleichzeitig: 60, sse: 41 }).ok).toBe(false);
    expect(pruefeLimits({ gleichzeitig: 60, sse: 40 }).ok).toBe(true);
    expect(pruefeLimits({ anfragen: MAX_ANFRAGEN }).ok).toBe(true);
    expect(pruefeLimits({ anfragen: MAX_ANFRAGEN + 1 }).ok).toBe(false);
    expect(MAX_VERBINDUNGEN).toBe(100);
  });
  it("ungültige Zahlen: 0, negativ, Bruch, NaN, zu lange Haltezeit, Fehlerrate außerhalb 0..1", () => {
    for (const o of [{ gleichzeitig: 0 }, { anfragen: -1 }, { gleichzeitig: 1.5 }, { anfragen: NaN }, { sse: -1 }, { sseSekunden: 0 }, { sseSekunden: 121 }, { maxFehlerrate: 1.5 }, { maxFehlerrate: -0.1 }]) {
      expect(pruefeLimits(o).ok, JSON.stringify(o)).toBe(false);
    }
  });
});

describe("parseArgs und perzentil", () => {
  it("liest Ziel, Optionen und das Produktions-Flag; meldet Unbekanntes", () => {
    const a = parseArgs(["https://s.example.org", "--gleichzeitig", "10", "--anfragen", "50", "--sse", "5", "--produktion-bestaetigt", "--quatsch"]);
    expect(a.ziel).toBe("https://s.example.org");
    expect(a.optionen).toMatchObject({ gleichzeitig: 10, anfragen: 50, sse: 5 });
    expect(a.produktionBestaetigt).toBe(true);
    expect(a.unbekannt).toEqual(["--quatsch"]);
  });
  it("Perzentile (nächster Rang)", () => {
    expect(perzentil([], 95)).toBe(0);
    expect(perzentil([5], 50)).toBe(5);
    const z = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(perzentil(z, 50)).toBe(50);
    expect(perzentil(z, 95)).toBe(95);
    expect(perzentil([3, 1, 2], 100)).toBe(3);
  });
});

describe("lauf mit Fake-fetch", () => {
  const antwort = (status: number) => ({ status, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), body: null }) as unknown as Response;

  it("nur GET, feste Pfade, genau so viele Anfragen wie geplant, nie mehr als 'gleichzeitig' gleichzeitig", async () => {
    const methoden: string[] = [];
    const pfade = new Set<string>();
    let laufend = 0;
    let spitze = 0;
    const fetchImpl = async (url: string, init: RequestInit) => {
      methoden.push(String(init.method));
      pfade.add(new URL(url).pathname);
      laufend += 1;
      spitze = Math.max(spitze, laufend);
      await new Promise((r) => setTimeout(r, 5));
      laufend -= 1;
      return antwort(200);
    };
    const r = await lauf({ base: "https://s.example.org", gleichzeitig: 7, anfragen: 60, fetchImpl: fetchImpl as never });
    expect(r.antworten).toBe(60);
    expect(r.fehler).toBe(0);
    expect(new Set(methoden)).toEqual(new Set(["GET"]));
    expect([...pfade].sort()).toEqual(["/", "/anmelden", "/hilfe", "/impressum", "/teams", "/turniere"]);
    expect(spitze).toBeLessThanOrEqual(7);
  });

  it("Abbruch bei zu hoher Fehlerrate (ab 20 Antworten): stoppt früh, meldet abgebrochen", async () => {
    const r = await lauf({ base: "https://s.example.org", gleichzeitig: 5, anfragen: 1000, maxFehlerrate: 0.2, fetchImpl: (async () => antwort(401)) as never });
    expect(r.abgebrochen).toBe(true);
    expect(r.antworten).toBeLessThan(1000);
    expect(r.antworten).toBeGreaterThanOrEqual(20);
    expect((r.status as Record<string, number>)["401"]).toBe(r.antworten);
    expect(bericht(r, { base: "https://s.example.org", gleichzeitig: 5 })).toMatch(/ABGEBROCHEN/);
  });

  it("Netzfehler und Zeitüberschreitung zählen als Fehler; wenige Fehler unter der Grenze brechen nicht ab", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      if (n % 10 === 0) throw new Error("netz");
      return antwort(200);
    };
    const r = await lauf({ base: "https://s.example.org", gleichzeitig: 3, anfragen: 100, maxFehlerrate: 0.2, fetchImpl: fetchImpl as never });
    expect(r.abgebrochen).toBe(false);
    expect(r.fehler).toBe(10);
    expect((r.status as Record<string, number>).netz).toBe(10);
    expect(r.fehlerrate).toBeCloseTo(0.1, 5);
  });

  it("Zugangsdaten gehen nur als Header raus und stehen nie im Bericht", async () => {
    const gesehen: string[] = [];
    const fetchImpl = async (_u: string, init: RequestInit) => {
      gesehen.push(String((init.headers as Record<string, string>).Authorization));
      return antwort(200);
    };
    const kopf = { Authorization: `Basic ${Buffer.from("benutzer:geheimespasswort").toString("base64")}` };
    const r = await lauf({ base: "https://s.example.org", headers: kopf, gleichzeitig: 2, anfragen: 4, fetchImpl: fetchImpl as never });
    expect(gesehen.every((g) => g === kopf.Authorization)).toBe(true);
    const text = bericht(r, { base: "https://s.example.org", gleichzeitig: 2 });
    expect(text).not.toContain("geheimespasswort");
    expect(text).not.toContain(kopf.Authorization);
  });

  it("Live-Verbindungen: verbunden, abgewiesen (403) und abgerissen werden getrennt gezählt", async () => {
    let i = 0;
    const strom = () => {
      const s = new ReadableStream({ start() {} });
      return { status: 200, headers: new Headers({ "content-type": "text/event-stream" }), body: s, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    };
    const fetchImpl = async (url: string) => {
      if (new URL(url).pathname === "/api/spiele/stream") {
        i += 1;
        return i <= 3 ? strom() : ({ status: 403, headers: new Headers({ "content-type": "text/plain" }), body: null, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response);
      }
      return antwort(200);
    };
    const r = await lauf({ base: "https://s.example.org", gleichzeitig: 2, anfragen: 10, sse: 5, sseSekunden: 1, fetchImpl: fetchImpl as never });
    expect(r.live).toMatchObject({ gewuenscht: 5, verbunden: 3, abgewiesen: 2, fehler: 0 });
  });
});

describe("Skript (eigener Prozess)", () => {
  let server: Server;
  const hits: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      res.setHeader("content-type", "text/html");
      res.end("<h1>ok</h1>");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  });
  afterAll(() => {
    server.close();
  });
  const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  it("verweigert Produktion (Exit 2, nichts angefragt), falsche Benutzung (Exit 2); sauberer Lauf gegen lokalen Server Exit 0 nur mit GET", async () => {
    expect((await skript(["https://socaz.de"])).code).toBe(2);
    expect((await skript(["https://www.socaz.de", "--anfragen", "5"])).code).toBe(2);
    expect((await skript([])).code).toBe(2);
    expect((await skript([url(), "--gleichzeitig", "101"])).code).toBe(2);
    expect((await skript([url(), "--quatsch"])).code).toBe(2);
    expect(hits).toHaveLength(0);
    const r = await skript([url(), "--gleichzeitig", "4", "--anfragen", "30"], { SMOKE_BASIC_AUTH: "u:geheimespasswort" });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Antworten: 30, Fehler: 0/);
    expect(r.stdout).toMatch(/p50/);
    expect(r.stdout + r.stderr).not.toContain("geheimespasswort");
    expect(hits).toHaveLength(30);
    expect(hits.every((h) => h.startsWith("GET /"))).toBe(true);
  });
});
