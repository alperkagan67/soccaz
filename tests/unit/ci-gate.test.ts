import { describe, expect, it } from "vitest";
import { aggregate, computeDocsOnly, isDocFile, isDocsOnly } from "../../scripts/ci-gate.mjs";

const A = "a".repeat(40);
const B = "b".repeat(40);

describe("ci-gate: reine Doku-Änderungen (docs_only)", () => {
  // Tabelle: Dateiliste -> docs_only
  const cases: [string, string[], boolean][] = [
    ["nur Doku", ["docs/loop/BACKLOG.md", "docs/design/pilot-plan.md"], true],
    ["nur Doku, auch Nicht-md unter docs/", ["docs/analysis/bild.png"], true],
    ["Wurzel-md", ["README.md", "CLAUDE.md"], true],
    ["gemischt", ["docs/a.md", "src/app/page.tsx"], false],
    ["nur Code", ["src/server/lobby.ts", "tests/unit/x.test.ts"], false],
    ["leer", [], false],
    ["Workflow-Änderung", [".github/workflows/ci.yml"], false],
    ["Doku plus Workflow", ["docs/a.md", ".github/workflows/ci.yml"], false],
    ["md unter .github", [".github/pull_request_template.md"], false],
    ["md in src (Code-Baum)", ["src/lib/inhalt.md"], false],
    ["md in tests/scripts/public", ["tests/e2e/README.md", "scripts/README.md", "public/x.md"], false],
    ["md in .claude", [".claude/skills/x/SKILL.md"], false],
    ["package.json", ["package.json"], false],
    ["Lockfile", ["package-lock.json"], false],
    ["Doku plus Lockfile", ["docs/a.md", "package-lock.json"], false],
    ["package.json unter docs/", ["docs/package.json"], false],
    ["Pfad mit ..", ["docs/../src/x.ts"], false],
    ["absoluter Pfad", ["/docs/a.md"], false],
    ["Backslash", ["docs\\a.md"], false],
    ["leerer Name", [""], false],
    ["Endung groß", ["NOTIZ.MD"], true],
    ["Nicht-md in der Wurzel", ["LICENSE.txt"], false],
  ];
  it.each(cases)("%s", (_name, files, expected) => {
    expect(isDocsOnly(files)).toBe(expected);
  });

  it("isDocFile: Einzelfälle", () => {
    expect(isDocFile("docs/x.md")).toBe(true);
    expect(isDocFile("docsx/y.ts")).toBe(false); // Präfix ist "docs/", nicht "docs"
    expect(isDocFile("src/docs/x.md")).toBe(false);
  });
});

describe("ci-gate: computeDocsOnly (Basis/Kopf, sicherer Default)", () => {
  const files = (list: string[]) => () => list;

  it("Doku-PR -> true", () => {
    expect(computeDocsOnly({ base: A, head: B, run: files(["docs/a.md"]) })).toBe(true);
  });
  it("gemischt -> false", () => {
    expect(computeDocsOnly({ base: A, head: B, run: files(["docs/a.md", "src/x.ts"]) })).toBe(false);
  });
  it("leere Liste -> false", () => {
    expect(computeDocsOnly({ base: A, head: B, run: files([]) })).toBe(false);
  });
  it("Fehler von git (z. B. Force-Push, Basis unbekannt) -> false", () => {
    expect(
      computeDocsOnly({
        base: A,
        head: B,
        run: () => {
          throw new Error("fatal: bad object");
        },
      }),
    ).toBe(false);
  });
  it("Push ohne before (leer, fehlt, nur Nullen = neuer Branch) -> false, git wird gar nicht gefragt", () => {
    const boom = () => {
      throw new Error("darf nicht aufgerufen werden");
    };
    let asked = 0;
    const counting = (...a: unknown[]) => {
      asked += 1;
      return (boom as (...x: unknown[]) => string[])(...a);
    };
    for (const base of [undefined, "", "0".repeat(40)]) expect(computeDocsOnly({ base, head: B, run: counting })).toBe(false);
    expect(asked).toBe(0);
  });
  it("ungültige SHA (Option-Einschleusung, zu kurz, Großbuchstaben) -> false", () => {
    for (const base of ["--output=x", "abc", "A".repeat(40), `${A} ${B}`]) expect(computeDocsOnly({ base, head: B, run: files(["docs/a.md"]) })).toBe(false);
    expect(computeDocsOnly({ base: A, head: "HEAD", run: files(["docs/a.md"]) })).toBe(false);
  });
});

describe("ci-gate: Entscheidungstabelle des Sammelchecks 'Browser-Tests'", () => {
  const results = ["success", "skipped", "failure", "cancelled"] as const;
  const docs = ["true", "false"] as const;

  // Erwartung: grün NUR bei (changes=success UND shard=success UND integration=success)
  // ODER (changes=success UND docs_only=true UND shard=skipped UND integration=skipped).
  const expected = (changes: string, docsOnly: string, shard: string, integration: string) =>
    changes === "success" && ((shard === "success" && integration === "success") || (docsOnly === "true" && shard === "skipped" && integration === "skipped"));

  for (const d of docs) {
    for (const shard of results) {
      for (const integration of results) {
        it(`docs_only=${d} shard=${shard} integration=${integration}`, () => {
          expect(aggregate({ changes: "success", docsOnly: d, shard, integration }).ok).toBe(expected("success", d, shard, integration));
        });
      }
    }
  }

  it("Kernfälle ausdrücklich", () => {
    expect(aggregate({ changes: "success", docsOnly: "false", shard: "success", integration: "success" }).ok).toBe(true);
    expect(aggregate({ changes: "success", docsOnly: "true", shard: "skipped", integration: "skipped" }).ok).toBe(true);
    expect(aggregate({ changes: "success", docsOnly: "false", shard: "skipped", integration: "skipped" }).ok).toBe(false); // skipped OHNE docs_only = rot
    expect(aggregate({ changes: "success", docsOnly: "true", shard: "failure", integration: "success" }).ok).toBe(false);
    expect(aggregate({ changes: "success", docsOnly: "true", shard: "cancelled", integration: "skipped" }).ok).toBe(false);
    expect(aggregate({ changes: "success", docsOnly: "true", shard: "success", integration: "skipped" }).ok).toBe(false);
  });

  it("changes fehlgeschlagen/abgebrochen/übersprungen/fehlend -> immer rot", () => {
    for (const changes of ["failure", "cancelled", "skipped", undefined]) {
      expect(aggregate({ changes, docsOnly: "true", shard: "skipped", integration: "skipped" }).ok).toBe(false);
      expect(aggregate({ changes, docsOnly: "false", shard: "success", integration: "success" }).ok).toBe(false);
    }
  });

  it("fehlende Werte (leere Umgebung) -> rot", () => {
    expect(aggregate({}).ok).toBe(false);
    expect(aggregate({ changes: "success" }).ok).toBe(false);
    expect(aggregate({ changes: "success", docsOnly: "", shard: "skipped", integration: "skipped" }).ok).toBe(false);
  });
});
