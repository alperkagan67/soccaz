import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// T151 / Backlog 71: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY wird von Next beim BAUEN in den Browser-Code eingebettet (CardForm.tsx). Im Docker-Betrieb muss er deshalb als Build-Argument
// ankommen (Dockerfile ARG/ENV im Build-Stage, docker-compose.yml build.args); `env_file` wirkt erst zur Laufzeit. Der Test prueft nur die Struktur (kein Docker noetig) und dass kein Wert im Repo steht.
const root = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");
const NAME = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";

describe("Dockerfile", () => {
  const docker = read("Dockerfile");
  const stages = docker.split(/^FROM /m).slice(1);
  const build = stages.find((s) => /\sAS build\b/.test(s.split("\n")[0])) ?? "";
  const runner = stages.find((s) => /\sAS runner\b/.test(s.split("\n")[0])) ?? "";

  it("der Build-Stage nimmt den Schluessel als ARG (ohne Wert) und setzt ihn als ENV vor 'npm run build'", () => {
    expect(build).not.toBe("");
    const arg = build.indexOf(`ARG ${NAME}`);
    const env = build.indexOf(`ENV ${NAME}=$${NAME}`);
    const run = build.indexOf("RUN npm run build");
    expect(arg).toBeGreaterThan(-1);
    expect(env).toBeGreaterThan(arg);
    expect(run).toBeGreaterThan(env);
    expect(build).toMatch(new RegExp(`ARG ${NAME}=""`)); // Standard leer
  });

  it("der Schluessel steht nur im Build-Stage, nie im Laufzeit-Stage (runner) und nie als fester Wert", () => {
    expect(runner).not.toContain(NAME);
    expect(docker).not.toMatch(/pk_(test|live)_/);
    expect(docker).not.toMatch(new RegExp(`${NAME}=(?!\\$|"")\\S`)); // nur $-Verweis oder leer
  });
});

describe("docker-compose.yml", () => {
  const compose = read("docker-compose.yml");
  const app = (compose.match(/^ {2}app:\n([\s\S]*?)(?=^ {2}[a-z]+:\n)/m) ?? [])[1] ?? "";

  it("der Dienst app reicht den Schluessel als build.args aus der Umgebung/.env (Standard leer) weiter", () => {
    expect(app).not.toBe("");
    const build = (app.match(/^ {4}build:\n([\s\S]*?)(?=^ {4}[a-z_]+:)/m) ?? [])[1] ?? "";
    expect(build).toContain("target: runner");
    expect(build).toMatch(/^ {6}args:\n(?: {8}#.*\n)* {8}NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: \$\{NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-\}$/m);
  });

  it("kein fester Schluesselwert in compose, Dockerfile oder .env.example", () => {
    for (const f of ["docker-compose.yml", "Dockerfile", ".env.example"]) expect(read(f), f).not.toMatch(/pk_(test|live)_[A-Za-z0-9]/);
    expect(compose).not.toMatch(new RegExp(`^\\s+${NAME}:\\s+(?!\\$)[^\\s#]`, "m")); // der Eintrag ist nur ein $-Verweis, nie ein Wert
  });
});
