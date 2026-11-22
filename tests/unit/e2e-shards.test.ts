import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkShards, filterFor, main, parseShards, SHARDS_FILE, SPEC_DIR } from "../../scripts/e2e-shards.mjs";

// Aufteilung der Browser-Tests in der CI (.github/e2e-shards.json): jede Spec-Datei in genau einem Shard, sonst faellt ein Test still aus der CI.
const specs = readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.ts"));
const shards = parseShards(readFileSync(SHARDS_FILE, "utf8"));

describe("e2e-shards: Zuordnung im Repository", () => {
  it("jede Spec-Datei steht in genau einem Shard, keine fehlt, keine ist erfunden, kein Shard ist leer", () => {
    expect(checkShards(specs, shards)).toEqual([]);
  });

  it("die Zahl der Shards stimmt mit dem Workflow ueberein (Matrix und Name 'Teil N/<Zahl>')", () => {
    const wf = readFileSync(".github/workflows/ci.yml", "utf8");
    const count = Object.keys(shards).length;
    expect(wf).toContain(`name: Browser-Tests Teil \${{ matrix.shard }}/${count}`);
    const m = wf.match(/shard:\s*\[([0-9,\s]+)\]/);
    expect(m && m[1].split(",").map((s) => Number(s.trim()))).toEqual(Array.from({ length: count }, (_, i) => i + 1));
  });

  it("jeder Dateifilter trifft genau seine Datei (Punkte maskiert, Ende verankert)", () => {
    for (const f of specs) {
      const re = new RegExp(filterFor(f));
      const hits = specs.filter((g) => re.test(`/work/${SPEC_DIR}/${g}`));
      expect(hits, f).toEqual([f]);
    }
  });
});

describe("e2e-shards: checkShards", () => {
  const ok = { "1": ["a.spec.ts"], "2": ["b.spec.ts", "c.spec.ts"] };
  it("gueltige Zuordnung ohne Meldung", () => {
    expect(checkShards(["a.spec.ts", "b.spec.ts", "c.spec.ts"], ok)).toEqual([]);
  });
  it("neue Spec ohne Eintrag wird gemeldet", () => {
    expect(checkShards(["a.spec.ts", "b.spec.ts", "c.spec.ts", "neu.spec.ts"], ok).join("|")).toMatch(/neu\.spec\.ts' steht in keinem Shard/);
  });
  it("doppelter Eintrag wird gemeldet", () => {
    expect(checkShards(["a.spec.ts", "b.spec.ts"], { "1": ["a.spec.ts", "b.spec.ts"], "2": ["b.spec.ts"] }).join("|")).toMatch(/b\.spec\.ts' steht in mehreren Shards \(1, 2\)/);
  });
  it("eingetragene, nicht vorhandene Datei wird gemeldet", () => {
    expect(checkShards(["a.spec.ts"], { "1": ["a.spec.ts", "weg.spec.ts"] }).join("|")).toMatch(/weg\.spec\.ts' .* gibt es unter tests\/e2e\/ nicht/);
  });
  it("leerer Shard und Luecke in den Nummern werden gemeldet", () => {
    expect(checkShards(["a.spec.ts"], { "1": ["a.spec.ts"], "2": [] }).join("|")).toMatch(/Shard 2 ist leer/);
    expect(checkShards(["a.spec.ts", "b.spec.ts"], { "1": ["a.spec.ts"], "3": ["b.spec.ts"] }).join("|")).toMatch(/ohne Luecke/);
  });
  it("ungueltiger Dateiname (Pfad, Leerzeichen, Gross) wird gemeldet", () => {
    for (const bad of ["../x.spec.ts", "a b.spec.ts", "A.spec.ts", "x.ts"]) {
      expect(checkShards(["x.spec.ts"], { "1": ["x.spec.ts", bad] }).join("|"), bad).toMatch(/ungueltiger Dateiname/);
    }
  });
});

describe("e2e-shards: Aufruf (main)", () => {
  const json = JSON.stringify({ shards: { "1": ["a.spec.ts"], "2": ["b.spec.ts"] } });
  const io = (specsOnDisk: string[]) => ({ readText: () => json, listSpecs: () => specsOnDisk });
  it("check: Exit 0 bei vollstaendiger, Exit 1 bei unvollstaendiger Zuordnung", () => {
    expect(main("check", [], io(["a.spec.ts", "b.spec.ts"]))).toBe(0);
    expect(main("check", [], io(["a.spec.ts", "b.spec.ts", "c.spec.ts"]))).toBe(1);
  });
  it("list: unbekannter Shard und unbekannter Modus sind Fehler", () => {
    expect(main("list", ["3"], io([]))).toBe(2);
    expect(main("list", [], io([]))).toBe(2);
    expect(main("zeige", [], io([]))).toBe(2);
  });
  it("filterFor maskiert Punkte und verankert das Ende", () => {
    expect(filterFor("karte-lobby.spec.ts")).toBe("tests/e2e/karte-lobby\\.spec\\.ts$");
  });
  it("parseShards: kaputte Dateien werden abgelehnt", () => {
    expect(() => parseShards("{}")).toThrow(/shards/);
    expect(() => parseShards(JSON.stringify({ shards: { x: [] } }))).toThrow(/Shard-Nummer/);
    expect(() => parseShards(JSON.stringify({ shards: { "1": [1] } }))).toThrow(/Liste/);
  });
});
