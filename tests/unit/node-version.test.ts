import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_MAJOR_EXCLUSIVE, MIN_VERSION, nodeVersionMessage, nodeVersionOk, parseNodeVersion } from "../../scripts/lib/node-version.mjs";

// Früher Versionscheck (scripts/check-node.mjs): reine Funktionen, Grenzwerte 22.12 / 22.13 / 23.
describe("nodeVersionOk", () => {
  it("Grenzwerte: 22.12.x zu alt, 22.13.0 ok, 22.x neuer ok, 23.0.0 zu neu", () => {
    expect(nodeVersionOk("22.12.0")).toBe(false);
    expect(nodeVersionOk("22.12.9")).toBe(false);
    expect(nodeVersionOk("22.13.0")).toBe(true);
    expect(nodeVersionOk("v22.13.1")).toBe(true);
    expect(nodeVersionOk("22.22.2")).toBe(true);
    expect(nodeVersionOk("23.0.0")).toBe(false);
    expect(nodeVersionOk("24.1.0")).toBe(false);
  });
  it("der bekannte Fehlerfall 22.9.0 und ältere Hauptversionen werden abgewiesen", () => {
    for (const v of ["22.9.0", "v22.9.0", "22.0.0", "21.7.3", "20.19.0", "18.20.4"]) expect(nodeVersionOk(v), v).toBe(false);
  });
  it("Unsinn wird abgewiesen, ohne zu werfen", () => {
    for (const v of ["", "abc", "22", "22.13", null, undefined, 22 as never]) expect(nodeVersionOk(v as never), String(v)).toBe(false);
  });
});

describe("parseNodeVersion und Meldung", () => {
  it("zerlegt mit und ohne v", () => {
    expect(parseNodeVersion("v22.9.0")).toEqual({ major: 22, minor: 9, patch: 0 });
    expect(parseNodeVersion("22.13.2")).toEqual({ major: 22, minor: 13, patch: 2 });
    expect(parseNodeVersion("x")).toBeNull();
  });
  it("Meldung auf Deutsch mit gefundener Version und Behebung; leer, wenn alles passt", () => {
    const m = nodeVersionMessage("22.9.0");
    expect(m).toContain("Node >=22.13 und <23 nötig, gefunden 22.9.0");
    expect(m).toContain("So beheben");
    expect(m).toContain(".nvmrc");
    expect(nodeVersionMessage("22.13.0")).toBe("");
  });
});

describe("Übereinstimmung der Angaben (eine Quelle für die Grenzen)", () => {
  const root = process.cwd();
  it("package.json engines, .nvmrc und .npmrc passen zu den Grenzen in scripts/lib/node-version.mjs", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.engines.node).toBe(`>=${MIN_VERSION.major}.${MIN_VERSION.minor} <${MAX_MAJOR_EXCLUSIVE}`);
    const nvmrc = readFileSync(path.join(root, ".nvmrc"), "utf8").trim();
    expect(nvmrc).toBe(`${MIN_VERSION.major}.${MIN_VERSION.minor}`);
    expect(nodeVersionOk(`${nvmrc}.0`)).toBe(true);
    expect(readFileSync(path.join(root, ".npmrc"), "utf8")).toMatch(/^engine-strict=true$/m);
  });
  it("die Hooks rufen das Skript vor dev, build, lint, test, test:e2e, test:integration, typecheck und db:migrate auf; kein preinstall (der Docker-Build kopiert vor npm ci nur package.json)", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    for (const s of ["dev", "build", "lint", "test", "test:e2e", "test:integration", "typecheck", "db:migrate"]) expect(pkg.scripts[`pre${s}`], s).toBe("node scripts/check-node.mjs");
    expect(pkg.scripts.preinstall).toBeUndefined();
    expect(pkg.scripts.postinstall).toBeUndefined();
  });
  it("Docker und CI erfüllen die Mindestversion (Node 22, jeweils die neueste 22er); jeder setup-node-Eintrag in der CI nennt 22", () => {
    expect(readFileSync(path.join(root, "Dockerfile"), "utf8")).toMatch(/^FROM node:22-alpine AS base$/m);
    const versions = [...readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8").matchAll(/^\s*node-version:\s*(\S+)\s*$/gm)].map((m) => m[1]);
    expect(versions.length).toBeGreaterThanOrEqual(1);
    for (const v of versions) expect(v).toBe("22");
  });

  it("engine-strict bricht keine Installation: JEDES nicht optionale Paket im package-lock erlaubt Node 22.13.0 UND eine hohe 22er (fängt künftige Dependabot-Updates); optionale Pakete werden von npm übersprungen", () => {
    const semver = createRequire(import.meta.url)("semver") as { satisfies: (v: string, range: string) => boolean };
    const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8")) as { packages: Record<string, { engines?: { node?: string }; optional?: boolean }> };
    const checked: string[] = [];
    const verstoesse: string[] = [];
    for (const [name, pkg] of Object.entries(lock.packages)) {
      const range = pkg.engines?.node;
      if (!name || !range || pkg.optional) continue;
      checked.push(name);
      for (const v of ["22.13.0", "22.99.0"]) if (!semver.satisfies(v, range)) verstoesse.push(`${name} (${range}) gegen ${v}`);
    }
    expect(checked.length).toBeGreaterThan(100); // die Prüfung läuft wirklich über die Pakete
    expect(verstoesse).toEqual([]);
  });
});
