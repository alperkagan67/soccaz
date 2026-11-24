import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Das Aufraeum-Skript (scripts/worktree-cleanup.mjs) darf der Task Manager nur ueber eine LOKALE Allow-Regel (settings.local.json des Nutzers, nicht versioniert) ohne Rueckfrage starten.
// Die versionierte .claude/settings.json darf KEINE solche Regel enthalten: sie gilt in jedem Worktree, ein Writer koennte dort eine eigene Skript-Version ohne Rueckfrage ausfuehren.
// Verketten/Substituieren gegen eine Allow-Regel prueft Claude Code selbst; hier wird nur der Guard-Hook (rm -r) geprueft.
const ROOT = path.resolve(import.meta.dirname, "../..");
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
const GUARD = path.join(ROOT, ".claude/hooks/guard.mjs");
const SCRIPT = path.join(ROOT, "scripts/worktree-cleanup.mjs");

function guard(command: string): number {
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });
  return r.status ?? -1;
}

describe("Aufraeum-Skript: keine versionierte Allow-Regel", () => {
  it("die versionierte settings.json enthaelt keine Allow-Regel fuer worktree-cleanup (Regel nur lokal)", () => {
    const allow: string[] = settings.permissions?.allow ?? [];
    expect(allow.filter((rule) => rule.includes("worktree-cleanup"))).toEqual([]);
    expect(JSON.stringify(settings)).not.toContain("worktree-cleanup");
  });

  it("deny bleibt unveraendert (rm -rf, Force-Push, reset --hard, .env-Lesen)", () => {
    expect(settings.permissions.deny).toEqual([
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git push * --force*)",
      "Bash(git push origin main*)",
      "Bash(git reset --hard*)",
      "Bash(git clean -f*)",
      "Bash(rm -rf*)",
      "Read(./.env*)",
      "Read(**/.env.local)",
    ]);
  });

  it("der Guard-Hook blockiert rm -r in einer Verkettung mit dem Skript weiterhin und ist unveraendert registriert", () => {
    expect(guard("node scripts/worktree-cleanup.mjs")).toBe(0);
    expect(guard("node scripts/worktree-cleanup.mjs --apply && rm -rf x")).toBe(2);
    expect(guard("node scripts/worktree-cleanup.mjs; rm -r x")).toBe(2);
    expect(guard("rm -rf ../worktrees")).toBe(2);
    const hook = settings.hooks.PreToolUse[0];
    expect(hook.matcher).toBe("Bash");
    expect(hook.hooks[0].command).toContain(".claude/hooks/guard.mjs");
  });

  // Das Skript liegt erst nach PR 1 auf main; bis dahin wird der Test uebersprungen (der gleiche Fall steht dort in tests/unit/worktree-cleanup.test.ts, "unbekanntes Argument").
  it.runIf(fs.existsSync(SCRIPT))("das Skript bricht bei fremden Argumenten mit Exit 2 ab und loescht nichts", () => {
    for (const args of [["--apply", "x"], ["foo"], ["--bogus"]]) {
      const r = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
      expect(r.status, args.join(" ")).toBe(2);
    }
  });
});
