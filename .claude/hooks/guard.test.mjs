// Tests fuer guard.mjs. Aufruf: node --test .claude/hooks/guard.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./guard.mjs", import.meta.url));

function run(input) {
  const r = spawnSync(process.execPath, [guard], { input, encoding: "utf8" });
  return { code: r.status, stderr: r.stderr };
}
const runCmd = (command) => run(JSON.stringify({ tool_name: "Bash", tool_input: { command } }));

const forbidden = [
  "rm -rf node_modules",
  "rm -r -f build",
  "rm -fr /tmp/x",
  "Remove-Item -Recurse -Force .\\dist",
  'bash -c "rm -rf dist"',
  "sh -c 'rm -rf dist'",
  "cd x && git push --force origin feat/x",
  "git push -f origin feat/x",
  "git push --force-with-lease origin feat/x",
  "git push origin +feat/x",
  "git push origin main",
  "git push origin HEAD:main",
  'bash -c "git push origin main"',
  'psql -c "DROP TABLE users"',
  'psql -c "TRUNCATE TABLE games"',
  "npx drizzle-kit push --url postgres://u:p@db.example.com:5432/soccaz",
  "npx prisma db push --schema prod",
];

const allowed = [
  "git push origin feat/x",
  "git push -u origin feat/loop-e1",
  "git status",
  "git log --oneline -3",
  "npm test",
  "rm notes.txt",
  "rm -f notes.txt",
  "git switch main",
  "git pull --ff-only origin main",
  "npx drizzle-kit push --url postgres://u:p@localhost:5433/soccaz_w1",
  "cat drizzle/0001_migration.sql # DROP TABLE old_table",
  "ls -la",
];

for (const cmd of forbidden) {
  test(`blockiert (Exit 2): ${cmd}`, () => {
    const r = runCmd(cmd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /guard: BLOCKIERT/);
  });
}

for (const cmd of allowed) {
  test(`erlaubt (Exit 0): ${cmd}`, () => {
    assert.equal(runCmd(cmd).code, 0);
  });
}

test("leere Eingabe: Exit 0", () => assert.equal(run("").code, 0));
test("defektes JSON: Exit 0", () => assert.equal(run("{kaputt").code, 0));
test("JSON ohne command: Exit 0", () => assert.equal(run(JSON.stringify({ tool_input: {} })).code, 0));
