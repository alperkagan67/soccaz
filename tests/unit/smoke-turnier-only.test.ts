import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lauf, pruefeSeite } from "../../scripts/smoke-turnier-only.mjs";

// Rauchtest TURNIER_ONLY (Skript scripts/smoke-turnier-only.mjs): Auswertung rein und gegen einen lokalen Wegwerf-Server, der eine Instanz mit Sperre bzw. ohne Sperre nachstellt.
// Das Skript läuft als eigener Prozess ASYNCHRON (die Wegwerf-Server leben in diesem Prozess und müssen währenddessen antworten)
const skript = (args: string[]) => new Promise<{ status: number; stdout: string }>((resolve) => execFile(process.execPath, ["scripts/smoke-turnier-only.mjs", ...args], { encoding: "utf8" }, (err, stdout) => resolve({ status: err ? Number((err as { code?: number }).code ?? 1) : 0, stdout })));

describe("pruefeSeite", () => {
  it("gesperrt: 200, 'Kommt bald' und noindex; 404, Weiterleitung, fehlender Text oder fehlendes noindex sind Fehler", () => {
    const gut = '<meta name="robots" content="noindex, nofollow"/><h1>Kommt bald</h1>';
    expect(pruefeSeite("gesperrt", 200, gut)).toBeNull();
    expect(pruefeSeite("gesperrt", 404, gut)).toMatch(/404/);
    expect(pruefeSeite("gesperrt", 307, gut)).toMatch(/307/);
    expect(pruefeSeite("gesperrt", 200, "<h1>Spiele</h1>")).toMatch(/Kommt bald/);
    expect(pruefeSeite("gesperrt", 200, "<h1>Kommt bald</h1>")).toMatch(/noindex/);
  });
  it("offen und Kanal", () => {
    expect(pruefeSeite("offen", 200, "<h1>Turniere</h1>")).toBeNull();
    expect(pruefeSeite("offen", 200, '<h1>Kommt bald</h1><section data-testid="kommt-bald">')).toMatch(/fälschlich/);
    expect(pruefeSeite("offen", 500, "")).toMatch(/500/);
    expect(pruefeSeite("kanal", 403, "")).toBeNull();
    expect(pruefeSeite("kanal", 200, "")).toMatch(/200/);
  });
});

describe("lauf gegen einen lokalen Wegwerf-Server", () => {
  let gesperrt: Server;
  let offen: Server;
  const start = (sperre: boolean) =>
    new Promise<Server>((resolve) => {
      const s = createServer((req, res) => {
        const p = req.url ?? "/";
        const istKanal = p.startsWith("/api/");
        const istSpiel = ["/spiele", "/matchmaking", "/suche", "/hallen", "/rangliste", "/mitspieler", "/ligen"].includes(p);
        if (istKanal) {
          res.statusCode = sperre ? 403 : 200;
          res.end("x");
        } else if (istSpiel && sperre) {
          res.setHeader("content-type", "text/html");
          res.end('<meta name="robots" content="noindex"/><section data-testid="kommt-bald"><h1>Kommt bald</h1></section>');
        } else {
          res.setHeader("content-type", "text/html");
          res.end("<h1>Seite</h1>");
        }
      });
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
  beforeAll(async () => {
    gesperrt = await start(true);
    offen = await start(false);
  });
  afterAll(async () => {
    gesperrt.close();
    offen.close();
  });
  const url = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

  it("Instanz MIT Sperre: alle Prüfungen bestanden", async () => {
    const erg = await lauf(url(gesperrt));
    expect(erg.filter((r: { ok: boolean }) => !r.ok)).toEqual([]);
    expect(erg.length).toBeGreaterThanOrEqual(12);
  });
  it("Instanz OHNE Sperre (Variable fehlt in Produktion): rot, Exit-Code 1 des Skripts", async () => {
    const erg = await lauf(url(offen));
    expect(erg.some((r: { ok: boolean }) => !r.ok)).toBe(true);
    const r = await skript([url(offen)]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("NICHT BESTANDEN");
    const gut = await skript([url(gesperrt)]);
    expect(gut.status).toBe(0);
    expect((await skript([])).status).toBe(2);
  });
  it("nicht erreichbar: Fehler statt Absturz", async () => {
    const erg = await lauf("http://127.0.0.1:9");
    expect(erg.every((r: { ok: boolean }) => !r.ok)).toBe(true);
  });
});
