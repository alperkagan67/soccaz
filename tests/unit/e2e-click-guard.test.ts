import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Backlog 249 (Flake-Familie 223): Ein Klick VOR der Hydration geht verloren, und die danach folgende Erwartung mit der 5-s-Standardgrenze scheitert unter Last (lobby.spec, board.spec, karte-finanzen ...).
// Dieser Wächter hält die Regel fest, ohne still überall auszunehmen:
//  1. Ein roher Klick auf einen KNOPF (getByRole("button")), direkt gefolgt von einer Erwartung ohne eigenes Timeout, ist verboten: stattdessen clickWhenReady (Seite) bzw. clickReady (eingegrenzter Locator) aus tests/e2e/flows.ts.
//  2. Andere rohe Klicks (Link, Test-ID, Label, Dialog-Auslöser) mit derselben Folge sind je Datei nur in der Zahl der Ausnahmeliste erlaubt; die Zahl darf nur SINKEN (gleich = Liste ehrlich, kleiner = Liste verkleinern, größer = Fehler).
//  3. Die globale Erwartungsgrenze (playwright.config expect.timeout 15 s) bleibt; der Test-Timeout wird dadurch NICHT erhöht.
const root = join(__dirname, "..", "..");
const dir = join(root, "tests", "e2e");
const specs = readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));

type Site = { file: string; line: number; button: boolean; text: string };

/** Zeilen mit einem rohen .click() am Zeilenende (Kette aufeinanderfolgender Klickzeilen), danach direkt eine Erwartung ohne timeout. */
export function riskyClicks(file: string, source: string): Site[] {
  const lines = source.split("\n");
  const blank = (s: string) => /^\s*(\/\/.*)?$/.test(s);
  const clickLine = (s: string) => /\.click\([^)]*\)\s*;?\s*(\/\/.*)?$/.test(s) && /^\s*await /.test(s);
  const nextIdx = (i: number) => {
    let j = i + 1;
    while (j < lines.length && blank(lines[j])) j++;
    return j;
  };
  // Tests, die bewusst VOR der Hydration klicken (Titel oder Kommentar nennt "Hydration"), sind ausgenommen: dort ist der frühe Klick der Test.
  const preHydration = new Set<number>();
  let start = -1;
  let skip = false;
  for (let k = 0; k <= lines.length; k++) {
    if (k === lines.length || lines[k].startsWith("test(")) {
      if (skip) for (let q = start; q < k; q++) preHydration.add(q);
      if (k === lines.length) break;
      skip = /Hydration/.test(lines.slice(Math.max(0, k - 4), k + 1).join(" "));
      start = k;
    }
  }
  const out: Site[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (preHydration.has(i) || !clickLine(lines[i]) || /clickWhenReady|clickReady/.test(lines[i])) continue;
    let j = nextIdx(i);
    while (j < lines.length && (clickLine(lines[j]) || /^\s*await (clickWhenReady|clickReady)\(/.test(lines[j]))) j = nextIdx(j); // Kette: auch Helferzeilen setzen sie fort (der ERSTE rohe Klick der Kette geht sonst vor der Hydration verloren)
    const after = lines[j] ?? "";
    if (/^\s*await expect\(/.test(after) && !/timeout/.test(after)) out.push({ file, line: i + 1, button: lines[i].includes('getByRole("button"'), text: lines[i].trim().slice(0, 100) });
  }
  return out;
}

// Ausnahmeliste: rohe Klicks auf Nicht-Knöpfe nach Rolle (Link, Test-ID, nativer Popover/details, Helfer-Locator) mit Erwartung ohne Timeout. Die Wartezeit deckt dort die globale Erwartungsgrenze (15 s).
// "Kandidat für clickReady" = Client-Knopf, der besser über clickReady ginge (dann Zahl senken). Neue Stellen gehören NICHT hierher, sondern auf clickReady.
const AUSNAHMEN: Record<string, { n: number; grund: string }> = {
  "admin-zahlungsstreit.spec.ts": { n: 3, grund: "Filter-Link, Test-ID einer Listenzeile, Test-ID-Knopf dispute-mark-open (Client-Knopf: Kandidat für clickReady)" },
  "admin.spec.ts": { n: 1, grund: "Link" },
  "app-meine-spiele.spec.ts": { n: 1, grund: "Link auf die Lobby" },
  "basics.spec.ts": { n: 5, grund: "Links, aufklappbare Frage (natives details) und Menü (natives Popover)" },
  "community.spec.ts": { n: 1, grund: "Test-ID accept-challenge (Link auf die Lobby)" },
  "halle-formular.spec.ts": { n: 2, grund: "natives details/summary (Halle ist belegt) und Test-ID" },
  "community2.spec.ts": { n: 1, grund: "natives details (Konto löschen)" },
  "halle-onboarding.spec.ts": { n: 14, grund: "Assistenten-Knöpfe Weiter/Zurück/Abschluss und Wieder-einreichen (Client-Knöpfe: Hauptkandidaten für clickReady) und ein Link" },
  "karte-finanzen.spec.ts": { n: 1, grund: "Knopf Halle anlegen: die Hydration wird in der Zeile davor per expect.poll abgewartet" },
  "karte-lobby.spec.ts": { n: 1, grund: "Test-ID card-use-stored (Client-Knopf: Kandidat für clickReady)" },
  "matchmaking.spec.ts": { n: 1, grund: "Link auf die Lobby" },
  "notifications.spec.ts": { n: 1, grund: "Link in der Mitteilung" },
  "phase4.spec.ts": { n: 2, grund: "Links" },
  "privatspiel.spec.ts": { n: 2, grund: "Links" },
  "request.spec.ts": { n: 1, grund: "Knopf aus einer Variable (Kandidat für clickReady)" },
  "suche-auswahl.spec.ts": { n: 1, grund: "Link" },
  "turnier-ablauf.spec.ts": { n: 2, grund: "Links" },
  "turniere-liste.spec.ts": { n: 1, grund: "Link Team anmelden" },
  "ui-confirm.spec.ts": { n: 3, grund: "Auslöser des Bestätigungsdialogs (Client-Knopf: Kandidat für clickReady)" },
  "user-menu.spec.ts": { n: 14, grund: "natives Popover (popovertarget): React ist dort nicht aktiv, darf nicht auf Hydration warten; Menüeinträge" },
  "willkommen-onboarding.spec.ts": { n: 3, grund: "Assistenten-Knöpfe Weiter/Abschluss (Client-Knöpfe: Kandidaten für clickReady)" },
};

const all = specs.flatMap((f) => riskyClicks(f, readFileSync(join(dir, f), "utf8")));

describe("E2E-Klickwächter (Backlog 249)", () => {
  it("kein roher Knopf-Klick direkt vor einer Erwartung ohne eigenes Timeout: clickWhenReady/clickReady benutzen", () => {
    const knoepfe = all.filter((s) => s.button).map((s) => `${s.file}:${s.line} ${s.text}`);
    expect(knoepfe, "diese Stellen auf clickWhenReady (Seite) oder clickReady (Locator) aus tests/e2e/flows.ts umstellen").toEqual([]);
  });

  it("andere rohe Klicks: je Datei genau die Zahl der Ausnahmeliste (neue Stellen scheitern, abgebaute zwingen zum Verkleinern)", () => {
    const ist: Record<string, number> = {};
    for (const s of all.filter((x) => !x.button)) ist[s.file] = (ist[s.file] ?? 0) + 1;
    expect(ist).toEqual(Object.fromEntries(Object.entries(AUSNAHMEN).map(([f, v]) => [f, v.n])));
  });

  it("jede Ausnahme hat einen Grund und gehört zu einer vorhandenen Datei", () => {
    for (const [f, v] of Object.entries(AUSNAHMEN)) {
      expect(specs, f).toContain(f);
      expect(v.grund.length, f).toBeGreaterThanOrEqual(4);
    }
  });

  it("der Wächter erkennt die Muster (Gegenprobe): roher Knopf-Klick mit Erwartung ohne Timeout, auch in einer Klickkette", () => {
    const roh = ['await a.getByRole("button", { name: "Ich bin bereit" }).click();', 'await expect(a.getByTestId("x")).toBeVisible();'].join("\n");
    expect(riskyClicks("x.spec.ts", roh)).toHaveLength(1);
    expect(riskyClicks("x.spec.ts", roh)[0].button).toBe(true);
    const kette = ['await a.getByRole("button", { name: "A" }).click();', 'await b.getByRole("button", { name: "B" }).click();', 'await expect(b.getByTestId("x")).toBeVisible();'].join("\n");
    expect(riskyClicks("x.spec.ts", kette)).toHaveLength(2);
    const mitTimeout = ['await a.getByRole("button", { name: "A" }).click();', 'await expect(a.getByTestId("x")).toBeVisible({ timeout: 15_000 });'].join("\n");
    expect(riskyClicks("x.spec.ts", mitTimeout)).toHaveLength(0);
    const bereit = ['await clickWhenReady(a, "A");', 'await expect(a.getByTestId("x")).toBeVisible();'].join("\n");
    expect(riskyClicks("x.spec.ts", bereit)).toHaveLength(0);
    const vorHydration = ['test("Formular vor der Hydration", async () => {', 'await a.getByRole("button", { name: "A" }).click();', 'await expect(a.getByTestId("x")).toBeVisible();', "});"].join("\n");
    expect(riskyClicks("x.spec.ts", vorHydration)).toHaveLength(0);
  });

  it("globale Erwartungsgrenze 15 s in der Playwright-Konfiguration, Test-Timeout unverändert 60 s", () => {
    const cfg = readFileSync(join(root, "playwright.config.ts"), "utf8");
    expect(cfg).toMatch(/expect: \{ timeout: 15_000 \}/);
    expect(cfg).toMatch(/^\s*timeout: 60_000,/m);
  });

  it("flows.ts bietet die zwei Helfer (clickWhenReady für die Seite, clickReady für einen Locator)", () => {
    const flows = readFileSync(join(dir, "flows.ts"), "utf8");
    expect(flows).toMatch(/export async function clickWhenReady\(/);
    expect(flows).toMatch(/export async function clickReady\(/);
  });
});
