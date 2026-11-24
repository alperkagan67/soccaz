import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BESTAETIGUNG_WERT, MAIL_DOMAIN, hostVon, istProduktionsAdresse, planStagingSeed, pruefeStagingSeed } from "../../scripts/lib/staging-seed-guard.mjs";

// Staging-Seed (Generalprobe): eigene harte Sperre. Jede Verweigerung wirft, bevor irgendetwas geschrieben wird; die Meldungen nennen nie einen Wert.

const gut = { marker: "staging", appUrl: "https://staging.example.org", authUrl: undefined as string | undefined, bestaetigung: BESTAETIGUNG_WERT as string | undefined };
const mit = (over: Partial<typeof gut>) => ({ ...gut, ...over });

describe("pruefeStagingSeed: erlaubt nur mit Marke, Nicht-Produktion und Bestätigung", () => {
  it("alles in Ordnung: kein Fehler (auch Subdomain von socaz.de und AUTH_URL)", () => {
    expect(() => pruefeStagingSeed(gut)).not.toThrow();
    expect(() => pruefeStagingSeed(mit({ appUrl: "https://staging.socaz.de", authUrl: "https://staging.socaz.de" }))).not.toThrow();
  });
  it("keine Marke (fehlende Zeile) oder falsche Marke: verweigert", () => {
    expect(() => pruefeStagingSeed(mit({ marker: null as unknown as string }))).toThrow(/fehlt die Umgebungsmarke/);
    expect(() => pruefeStagingSeed(mit({ marker: undefined as unknown as string }))).toThrow(/fehlt die Umgebungsmarke/);
    for (const m of ["production", "Staging", "STAGING", " staging", "staging ", "", "test", true, 1, { v: "staging" }]) {
      expect(() => pruefeStagingSeed(mit({ marker: m as unknown as string })), String(JSON.stringify(m))).toThrow(/nicht "staging"/);
    }
  });
  it("Produktionsadresse in allen Schreibweisen: verweigert", () => {
    for (const u of [
      "https://socaz.de", "https://socaz.de/", "https://SOCAZ.DE", "https://Socaz.De", "https://socaz.de:443", "https://socaz.de:8443/x?y=1", "http://socaz.de",
      "https://www.socaz.de", "https://WWW.SOCAZ.DE:443", "socaz.de", "SOCAZ.DE:443", "https://socaz.de.", "https://socaz.de..", "https://user:pw@socaz.de",
      "https://ｓｏｃａｚ．ｄｅ", "https://socaz%2ede", "https://SoCaZ.dE/api/auth",
    ]) {
      expect(() => pruefeStagingSeed(mit({ appUrl: u })), u).toThrow(/Produktion/);
    }
  });
  it("APP_URL fehlt, leer oder unlesbar: verweigert (fail closed)", () => {
    for (const u of [undefined, "", "   ", "https://", "http://[::1", "nicht eine adresse"]) {
      expect(() => pruefeStagingSeed(mit({ appUrl: u as string })), String(u)).toThrow();
    }
  });
  it("AUTH_URL auf Produktion oder unlesbar: verweigert, auch wenn APP_URL unverdächtig ist", () => {
    expect(() => pruefeStagingSeed(mit({ authUrl: "https://socaz.de" }))).toThrow(/AUTH_URL/);
    expect(() => pruefeStagingSeed(mit({ authUrl: "https://www.socaz.de:443/" }))).toThrow(/AUTH_URL/);
    expect(() => pruefeStagingSeed(mit({ authUrl: "http://[::1" }))).toThrow(/AUTH_URL/);
  });
  it("ohne ausdrückliche Bestätigung oder mit falschem Wert: verweigert", () => {
    for (const b of [undefined, "", "ja", "1", "true", "ja-staging", "JA-STAGING-SEED", " ja-staging-seed"]) {
      expect(() => pruefeStagingSeed(mit({ bestaetigung: b })), String(b)).toThrow(/Bestätigung/);
    }
  });
  it("die Meldungen nennen nie einen übergebenen Wert (nur Namen und Regeln)", () => {
    const geheim = "https://geheim-host.socaz.de:9999/pfad";
    for (const o of [mit({ marker: "geheimwert" }), mit({ appUrl: "https://SOCAZ.DE/geheimpfad" }), mit({ bestaetigung: "geheimwert" }), mit({ authUrl: "https://socaz.de/geheimpfad" })]) {
      try {
        pruefeStagingSeed(o);
        throw new Error("sollte werfen");
      } catch (e) {
        expect(String((e as Error).message)).not.toMatch(/geheim/);
      }
    }
    expect(geheim).toContain("geheim");
  });
});

describe("hostVon / istProduktionsAdresse", () => {
  it("normalisiert Groß-/Kleinschreibung, Port, Schlüsselpunkt, Unicode", () => {
    expect(hostVon("https://SOCAZ.DE:443/x")).toBe("socaz.de");
    expect(hostVon("socaz.de.")).toBe("socaz.de");
    expect(hostVon("https://ｓｏｃａｚ．ｄｅ")).toBe("socaz.de");
    expect(hostVon("https://staging.socaz.de")).toBe("staging.socaz.de");
    expect(hostVon("")).toBeNull();
    expect(hostVon(undefined as unknown as string)).toBeNull();
  });
  it("Doppelgänger mit anderen Zeichen sind NICHT die Produktion (anderer Host), Unlesbares schon (fail closed)", () => {
    expect(istProduktionsAdresse("https://sоcaz.de")).toBe(false); // kyrillisches o: anderer Host (xn--...)
    expect(istProduktionsAdresse("https://socaz.de.evil.example")).toBe(false);
    expect(istProduktionsAdresse("https://staging.socaz.de")).toBe(false);
    expect(istProduktionsAdresse("https://")).toBe(true);
  });
});

describe("planStagingSeed: nur erfundene, eindeutige Konten", () => {
  const plan = planStagingSeed();
  const alle = plan.flatMap((t) => t.spieler);
  it("vier Teams (3 bis 6), je 5 Konten mit genau einem Captain; mindestens 4 Spieler je Team", () => {
    expect(plan.map((t) => t.name)).toEqual(["Probe-Team 3", "Probe-Team 4", "Probe-Team 5", "Probe-Team 6"]);
    for (const t of plan) {
      expect(t.spieler).toHaveLength(5);
      expect(t.spieler.filter((s: { captain: boolean }) => s.captain)).toHaveLength(1);
    }
  });
  it("alle Adressen enden auf @staging.invalid (nie zustellbar), alle Adressen und Namen sind eindeutig", () => {
    expect(alle.every((s: { email: string }) => s.email.endsWith(`@${MAIL_DOMAIN}`))).toBe(true);
    expect(new Set(alle.map((s: { email: string }) => s.email)).size).toBe(alle.length);
    expect(new Set(alle.map((s: { name: string }) => s.name)).size).toBe(alle.length);
  });
  it("keine Wiederverwendung der Namen anderer Seeds (Demo-Verwechslung): Namen beginnen mit Probe und stehen in keiner Seed-Datei", () => {
    expect(alle.every((s: { name: string }) => s.name.startsWith("Probe Konto"))).toBe(true);
    const dir = path.join(process.cwd(), "scripts");
    const quellen = ["seed-demo.mjs", "lib/seed-frontend-data.ts", "lib/seed-run.ts", "seed-lobby.mts", "seed-tournament.mts"].map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
    for (const s of alle) expect(quellen.includes(s.name)).toBe(false);
    expect(quellen).toContain("Deniz Kaya"); // Beleg, dass die Gegenprobe eine echte Quelle liest
    expect(alle.some((s: { name: string }) => /deniz|kaya/i.test(s.name))).toBe(false);
  });
});

describe("Quelltext der Sperre", () => {
  it("Seed-Skript ruft die Prüfung vor dem ersten Schreiben auf; seed-guard.ts und db-guard.ts werden weder gelesen noch geändert", () => {
    const skript = readFileSync(path.join(process.cwd(), "scripts/staging-seed.mjs"), "utf8");
    expect(skript.indexOf("pruefeStagingSeed(")).toBeGreaterThan(-1);
    expect(skript.indexOf("pruefeStagingSeed(")).toBeLessThan(skript.indexOf("begin"));
    expect(skript).not.toMatch(/seed-guard\.ts|db-guard|NODE_ENV/);
  });
});
