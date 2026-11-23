import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// E2E-Nutzerschlüssel (CI #256): `run` (tests/e2e/helpers.ts) ist je Worker-Prozess konstant und die CI fährt mit einem Worker je Shard. Zwei Specs im SELBEN Shard, die denselben Nutzerschlüssel
// anlegen (newUser, setupLobby legt <Schlüssel>a und <Schlüssel>b an, seedUser/seedAdmin/seedOwner), teilen die E-Mail <Schlüssel>-<Lauf>@test.local: der zweite "frische" Nutzer ist schon
// eingerichtet und der Test scheitert (karte-lobby "km" gegen community2 "kma"). In verschiedenen Shards ist derselbe Schlüssel unkritisch (eigene Datenbank). Schlüssel mit Platzhaltern
// (${...}) kann der Scan nicht auflösen und lässt er aus.
const root = process.cwd();
const dir = path.join(root, "tests/e2e");

type Source = { name: string; text: string };
type Shards = Record<string, string[]>;

/** Nutzerschlüssel (E-Mail-Teil vor dem Lauf-Schlüssel), die eine Spec anlegt. */
export function userKeysOf(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/newUser\(\s*\w+\s*,\s*["`]([^"`$]+)["`]/g)) keys.add(m[1]);
  for (const m of text.matchAll(/setupLobby\(\s*\w+\s*,\s*["`]([^"`$]+)["`]/g)) {
    keys.add(`${m[1]}a`);
    keys.add(`${m[1]}b`);
  }
  for (const m of text.matchAll(/seed(?:User|Admin|Owner|UserRole)\(\s*["`]([^"`$]+)["`]/g)) keys.add(m[1]);
  return [...keys];
}

/** Kollisionen: derselbe Schlüssel in zwei verschiedenen Specs desselben Shards. */
export function collisions(sources: readonly Source[], shards: Shards): string[] {
  const shardOf = new Map<string, string>();
  for (const [shard, files] of Object.entries(shards)) for (const f of files) shardOf.set(f, shard);
  const seen = new Map<string, string>(); // "<shard>|<schlüssel>" -> erste Spec
  const out: string[] = [];
  for (const s of sources) {
    const shard = shardOf.get(s.name);
    if (shard === undefined) continue; // keine Spec eines Shards (Hilfsdatei)
    for (const key of userKeysOf(s.text)) {
      const id = `${shard}|${key}`;
      const first = seen.get(id);
      if (first && first !== s.name) out.push(`Schlüssel "${key}" in Shard ${shard}: ${first} und ${s.name}`);
      else if (!first) seen.set(id, s.name);
    }
  }
  return out;
}

describe("E2E-Nutzerschlüssel: keine Kollision zwischen Specs desselben Shards", () => {
  it("die Specs im Repository: nach tests/e2e-shards.json keine doppelten Schlüssel je Shard", () => {
    const shards = (JSON.parse(readFileSync(path.join(root, "tests/e2e-shards.json"), "utf8")) as { shards: Shards }).shards;
    const sources: Source[] = readdirSync(dir)
      .filter((f) => f.endsWith(".spec.ts"))
      .map((name) => ({ name, text: readFileSync(path.join(dir, name), "utf8") }));
    expect(sources.length).toBeGreaterThan(40); // der Scan sieht die Specs wirklich
    expect(sources.flatMap((s) => userKeysOf(s.text)).length).toBeGreaterThan(100); // und findet Schlüssel
    expect(collisions(sources, shards)).toEqual([]);
  });

  it("Erkennung: setupLobby legt <Schlüssel>a und <Schlüssel>b an (km erzeugt kma wie newUser 'kma')", () => {
    expect(userKeysOf('await setupLobby(browser, "km");').sort()).toEqual(["kma", "kmb"]);
    expect(userKeysOf('await newUser(page, "kma"); await seedAdmin("kmmod"); await seedUser(`x${i}`);').sort()).toEqual(["kma", "kmmod"]);
  });

  it("Mutation (derselbe Schlüssel): zwei Specs im selben Shard melden eine Kollision, in verschiedenen Shards nicht", () => {
    const a: Source = { name: "community2.spec.ts", text: 'await newUser(author, "kma");' };
    const b: Source = { name: "karte-lobby.spec.ts", text: 'await setupLobby(browser, "km");' };
    expect(collisions([a, b], { "1": ["community2.spec.ts", "karte-lobby.spec.ts"] })).toEqual(['Schlüssel "kma" in Shard 1: community2.spec.ts und karte-lobby.spec.ts']);
    expect(collisions([a, b], { "1": ["community2.spec.ts"], "2": ["karte-lobby.spec.ts"] })).toEqual([]);
    expect(collisions([a, { name: "x.spec.ts", text: 'await newUser(p, "kma");' }], { "1": ["community2.spec.ts"] })).toEqual([]); // Datei ohne Shard (Hilfsdatei) wird übergangen
  });
});
