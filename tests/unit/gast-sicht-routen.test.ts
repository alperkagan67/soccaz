import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTEN } from "../e2e/gast-sicht-routen";

// AC-17 Gast-Sicht-Gesamtprüfung (Entscheid t2q 2026-11-24): Die Routenliste wird aus dem Seitenverzeichnis abgeleitet. Eine neue Route ohne Eintrag in tests/e2e/gast-sicht-routen.ts ist rot, ein Eintrag ohne Route auch;
// die Doku docs/design/gast-sicht-gesamtpruefung.md nennt jede Route. Die Gast-Probe selbst läuft in tests/e2e/gast-sicht-gesamt.spec.ts.
const root = path.resolve(import.meta.dirname, "../..");
const appDir = path.join(root, "src/app");

const DATEIEN: Record<string, (dir: string) => string> = {
  "page.tsx": (d) => d || "/",
  "route.ts": (d) => d,
  "opengraph-image.tsx": (d) => `${d}/opengraph-image`,
  "twitter-image.tsx": (d) => `${d}/twitter-image`,
  "sitemap.ts": () => "/sitemap",
  "robots.ts": () => "/robots",
  "manifest.ts": () => "/manifest",
  "not-found.tsx": () => "/not-found",
};

function ableiten(): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of readdirSync(path.join(appDir, rel), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (DATEIEN[e.name]) out.push(DATEIEN[e.name](rel));
    }
  };
  walk("");
  // Bild-Konventionen mit Endung (icon.png, apple-icon.png, opengraph-image.png) zählen ebenfalls als Route
  return out.sort();
}

describe("Routenliste aus src/app gegen die Registry", () => {
  const routen = ableiten();
  it("die Ableitung findet die bekannten Routen (Vakuum-Schutz)", () => {
    expect(routen.length).toBeGreaterThan(60);
    expect(routen).toContain("/spiele/[id]");
    expect(routen).toContain("/api/spiele/[id]/live");
    expect(routen).toContain("/spiele/[id]/opengraph-image");
  });
  it("jede Route hat einen Eintrag (neue öffentliche Route ohne Eintrag = rot)", () => {
    const fehlt = routen.filter((r) => !(r in ROUTEN));
    expect(fehlt, `Route ohne Eintrag in tests/e2e/gast-sicht-routen.ts und docs/design/gast-sicht-gesamtpruefung.md: ${fehlt.join(", ")}`).toEqual([]);
  });
  it("kein Eintrag ohne Route (veraltet)", () => {
    const alt = Object.keys(ROUTEN).filter((r) => !routen.includes(r));
    expect(alt, `Eintrag ohne Route: ${alt.join(", ")}`).toEqual([]);
  });
  it("Bild-Routen mit Dateiendung (opengraph-image.png, icon.png) werden nicht übersehen", () => {
    const bilder: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(path.join(appDir, rel), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${rel}/${e.name}`);
        else if (/^(opengraph-image|twitter-image|icon|apple-icon)\.(png|jpg|jpeg|gif|ico|svg)$/.test(e.name)) bilder.push(`${rel}/${e.name}`);
      }
    };
    walk("");
    expect(bilder, "statische Bild-Routen brauchen einen Eintrag (Ableitung erweitern)").toEqual([]);
  });
});

describe("Einträge sind vollständig", () => {
  it("jede Gast-Probe hat Marker und Beleg, jede Ausnahme, intern, statisch und angemeldet eine Begründung", () => {
    for (const [route, e] of Object.entries(ROUTEN)) {
      if (e.art === "geprueft") {
        expect(e.marker, `${route}: Marker für den Vakuum-Schutz`).not.toBe("");
        expect(e.beleg, `${route}: Beleg`).not.toBe("");
      } else {
        expect(e.grund.length, `${route}: Begründung`).toBeGreaterThan(8);
      }
    }
  });
  it("Admin- und Konto-Routen sind als angemeldet geführt (nie als geprüft oder statisch)", () => {
    for (const [route, e] of Object.entries(ROUTEN)) {
      if (route.startsWith("/admin") || route.startsWith("/app")) expect(e.art, route).toBe("angemeldet");
    }
  });
  it("jede Route mit Personenbezug in der Quelle (Name/Nutzer) ist nicht still als statisch geführt: statische Seiten importieren keine Personen-Server-Module", () => {
    const PERSONEN = /@\/server\/(profiles|roster|results|lobby|content|freeplayers|tournaments|matchmaking|board)\b/;
    for (const [route, e] of Object.entries(ROUTEN)) {
      if (e.art !== "statisch") continue;
      const datei = route === "/" ? "page.tsx" : DATEIEN["page.tsx"] && `${route}/page.tsx`;
      let src = "";
      try {
        src = readFileSync(path.join(appDir, datei), "utf8");
      } catch {
        continue; // keine Seite (Route oder Metadatei): nur die Begründung zählt
      }
      expect(PERSONEN.test(src), `${route} ist als statisch geführt, importiert aber ein Personen-Modul: Eintrag prüfen`).toBe(false);
    }
  });
});

describe("Doku nennt jede Route", () => {
  const doku = readFileSync(path.join(root, "docs/design/gast-sicht-gesamtpruefung.md"), "utf8");
  it("jede Route der Registry steht in docs/design/gast-sicht-gesamtpruefung.md", () => {
    const fehlt = Object.keys(ROUTEN).filter((r) => !doku.includes(`\`${r}\``));
    expect(fehlt, `nicht in der Doku: ${fehlt.join(", ")}`).toEqual([]);
  });
});
