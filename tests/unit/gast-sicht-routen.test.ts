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
  it("statisch geführte Seiten haben keinen Personenbezug in der Quelle: kein Personen-Servermodul, kein users-Import, keine Personen-Felder; Ausnahmen je Route mit Begründung", () => {
    // Module, die Personen liefern (Namen, Spieler, Kommentare, Turnier-Teilnehmer, Lobbys ...)
    const PERSONEN = /@\/server\/(profiles|roster|results|lobby|content|freeplayers|tournaments|matchmaking|board|account|clips|teams|admin|notifications)\b/;
    const USERS_IMPORT = /import\s*\{[^}]*\busers\b[^}]*\}\s*from\s*"@\/db\/schema/;
    const PERSONEN_FELDER = /\.(userName|authorName|organizerName|captainName|scorer|nickname)\b/;
    // Daten-Module, die ausschließlich Team-, Liga-, Hallen- oder Termin-Namen liefern (geprüft: sie importieren users nicht): je Route benannt statt pauschal erlaubt
    const ERLAUBT: Record<string, string[]> = {
      "/anmelden": ["locale", "session"],
      "/agb": ["zahlungen-aus"], // Schalter Zahlungen AUS (nur Anzeige, keine Personendaten)
      "/hausordnung": ["zahlungen-aus"], // Schalter Zahlungen AUS (nur Anzeige, keine Personendaten)
      "/datenschutz": ["zahlungen-aus"], // Schalter Zahlungen AUS (nur Anzeige, keine Personendaten)
      "/hilfe": ["pricing", "zahlungen-aus"], // Preisliste und der Schalter Zahlungen AUS (nur Anzeige, keine Personendaten)
      "/ligen": ["leagues"],
      "/ligen/[id]": ["leagues", "league-actions", "requests", "session"], // Tabelle mit Teamnamen; session/requests nur für die Beitrittsschaltfläche der Team-Admins
      "/profitag": ["pro-events"],
      "/profitag/[id]": ["pro-events", "league-actions", "requests", "session"], // bewerbende Teams; session/requests nur für die Bewerbung der Team-Admins
      "/hallen": ["venues"],
    };
    let gelesen = 0;
    for (const [route, e] of Object.entries(ROUTEN)) {
      if (e.art !== "statisch") continue;
      const datei = route === "/" ? "page.tsx" : `${route.slice(1)}/page.tsx`;
      const pfad = path.join(appDir, datei);
      let src: string;
      try {
        src = readFileSync(pfad, "utf8");
      } catch {
        continue; // Route ohne Seitendatei (Metadatei, Route): nur die Begründung zählt; gezählt wird unten
      }
      gelesen++;
      const importe = [...src.matchAll(/from\s+"@\/server\/([a-z-]+)"/g)].map((m) => m[1]);
      for (const modul of importe) {
        if (ERLAUBT[route]?.includes(modul)) continue;
        expect(PERSONEN.test(`@/server/${modul}`), `${route} ist als statisch geführt, importiert aber das Personen-Modul ${modul}: Eintrag prüfen`).toBe(false);
        expect(false, `${route}: Server-Modul ${modul} ist nicht als Daten-Modul der statischen Seite benannt (ERLAUBT in diesem Test)`).toBe(true);
      }
      expect(USERS_IMPORT.test(src), `${route} importiert users aus dem Schema`).toBe(false);
      expect(PERSONEN_FELDER.test(src), `${route} nutzt ein Personen-Feld`).toBe(false);
    }
    expect(gelesen, "genug statische Seiten wurden wirklich gelesen (Vakuum-Schutz: ein Pfadfehler ließe sonst alle durch)").toBeGreaterThanOrEqual(12);
  });
  it("angemeldet geführte Seiten und Routen haben einen Zugangsschutz in Datei oder Layout (requireUser, requireAdmin, requirePermission, requireLoggedIn oder getCurrentUser mit Antwort 401)", () => {
    const SCHUTZ = /(requireUser|requireAdmin|requirePermission|requireLoggedIn|requireVenueManager|getCurrentUser)/;
    let geprueft = 0;
    for (const [route, e] of Object.entries(ROUTEN)) {
      if (e.art !== "angemeldet") continue;
      const teile = route.split("/").filter(Boolean);
      const dateien: string[] = [];
      for (const name of ["page.tsx", "route.ts"]) dateien.push(path.join(appDir, ...teile, name));
      for (let n = teile.length; n >= 1; n--) dateien.push(path.join(appDir, ...teile.slice(0, n), "layout.tsx"));
      const quellen = dateien.flatMap((d) => {
        try {
          return [readFileSync(d, "utf8")];
        } catch {
          return [];
        }
      });
      expect(quellen.length, `${route}: Datei nicht gefunden`).toBeGreaterThan(0);
      // Entfernte Seite (AC-14, /app/guthaben): leitet alle ohne jede Datenabfrage um (kein Servermodul), braucht keinen Zugangsschutz
      const nurUmleitung = quellen.length === 1 && /redirect\("\/app"\)/.test(quellen[0]) && !/@\/server\//.test(quellen[0]);
      expect(nurUmleitung || quellen.some((q) => SCHUTZ.test(q)), `${route}: weder Seite noch Layout prüfen die Anmeldung`).toBe(true);
      geprueft++;
    }
    expect(geprueft).toBeGreaterThanOrEqual(30);
  });
});

describe("Doku nennt jede Route", () => {
  const doku = readFileSync(path.join(root, "docs/design/gast-sicht-gesamtpruefung.md"), "utf8");
  it("jede Route der Registry steht in docs/design/gast-sicht-gesamtpruefung.md", () => {
    const fehlt = Object.keys(ROUTEN).filter((r) => !doku.includes(`\`${r}\``));
    expect(fehlt, `nicht in der Doku: ${fehlt.join(", ")}`).toEqual([]);
  });
});
