import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Freigabe NUR fuer genau zwei Befehle (scripts/worktree-cleanup.mjs, mit und ohne --apply): keine Wildcards, deny und Guard-Hook unveraendert.
// Nicht per Unit pruefbar: das Verketten/Substituieren (&&, ;, $(...)) gegen die Allow-Regel prueft Claude Code selbst (Exakt-Match, sonst Rueckfrage); hier wird nur der Guard-Hook (rm -r) geprueft.
// Das Skript lehnt jedes Argument ausser --apply mit Exit 2 ab (z. B. "--apply x", "foo"): Test in PR 1 (tests/unit/worktree-cleanup.test.ts, "unbekanntes Argument"), das Skript liegt erst nach PR 1 auf main.
// Ausfuehrungsort: die Regel gilt in jedem Worktree relativ zum cwd; Aenderungen an scripts/worktree-cleanup.mjs sind deshalb ein eigener Review-Pruefpunkt (siehe PR-Text, Restrisiko).
const ROOT = path.resolve(import.meta.dirname, "../..");
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude/settings.json"), "utf8"));
const GUARD = path.join(ROOT, ".claude/hooks/guard.mjs");

function guard(command: string): number {
  const r = spawnSync("node", [GUARD], { input: JSON.stringify({ tool_input: { command } }), encoding: "utf8" });
  return r.status ?? -1;
}

describe("Freigabe worktree-cleanup (.claude/settings.json)", () => {
  it("allow enthaelt GENAU die zwei exakten Befehle, ohne Wildcard", () => {
    expect(settings.permissions.allow).toEqual(["Bash(node scripts/worktree-cleanup.mjs)", "Bash(node scripts/worktree-cleanup.mjs --apply)"]);
    for (const rule of settings.permissions.allow as string[]) {
      expect(rule).not.toMatch(/[*?]/);
      expect(rule).not.toContain(":");
    }
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

  it("der Guard-Hook laesst beide freigegebenen Befehle durch und blockiert rm -r in einer Verkettung weiterhin", () => {
    expect(guard("node scripts/worktree-cleanup.mjs")).toBe(0);
    expect(guard("node scripts/worktree-cleanup.mjs --apply")).toBe(0);
    expect(guard("node scripts/worktree-cleanup.mjs --apply && rm -rf x")).toBe(2);
    expect(guard("node scripts/worktree-cleanup.mjs; rm -r x")).toBe(2);
    expect(guard("rm -rf ../worktrees")).toBe(2);
  });

  it("der Guard-Hook ist unveraendert registriert (PreToolUse/Bash)", () => {
    const hook = settings.hooks.PreToolUse[0];
    expect(hook.matcher).toBe("Bash");
    expect(hook.hooks[0].command).toContain(".claude/hooks/guard.mjs");
  });
});
