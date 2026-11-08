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

// ---- Review-Fixes (Runde 1) ----

// 1) Text, der Muster nur ERWAEHNT, ist erlaubt (Quotes, Heredocs, echo/grep/cat/gh).
const mentionOnly = [
  'git commit -m "remove recursive deletes, rm -rf docs"',
  'git commit -m "docs: erklaert git push --force"',
  "git commit -F - <<EOF\nFix: dokumentiert git push --force-with-lease und rm -rf\nEOF",
  'echo "git push --force" > notes.txt',
  'grep -rn "rm -rf" docs',
  "cat <<EOF\nrm -rf x\nEOF",
  `gh pr create --title "t" --body "$(cat <<'EOF'\nEs gibt kein 'git push --force' und kein rm -rf, don't worry\nEOF\n)"`,
  "printf '%s' 'psql -c DROP TABLE users'",
  'echo "DROP TABLE users" # nur Text',
];
for (const cmd of mentionOnly) {
  test(`erlaubt (nur erwaehnt): ${cmd.split("\n")[0]}`, () => assert.equal(runCmd(cmd).code, 0));
}

// ... aber als Befehl ausgewertet bleibt es verboten.
const evaluated = [
  'eval "rm -rf x"',
  "echo $(rm -rf x)",
  "echo `rm -rf x`",
  'echo "$(git push --force origin feat/x)"',
  "bash -c \"sh -c 'rm -rf x'\"",
  "bash <<EOF\nrm -rf x\nEOF",
  'powershell -NoProfile -Command "Remove-Item -Recurse -Force dist"',
  "psql <<EOF\nDROP TABLE users;\nEOF",
];
for (const cmd of evaluated) {
  test(`blockiert (ausgewertet): ${cmd.split("\n")[0]}`, () => assert.equal(runCmd(cmd).code, 2));
}

// 2) git rm ist kein rm
for (const cmd of ["git rm -r src/old", "git rm -rf --cached x", "git -C sub rm -r dir"]) {
  test(`erlaubt (git rm): ${cmd}`, () => assert.equal(runCmd(cmd).code, 0));
}

// 3) Umgehung per Backslash / Pfad / Quotes
for (const cmd of [String.raw`\rm -rf x`, "/bin/rm -rf x", '"rm" -rf x', "sudo rm -r -f x", "ls | xargs rm -rf"]) {
  test(`blockiert (rm-Umweg): ${cmd}`, () => assert.equal(runCmd(cmd).code, 2));
}

// 4) git push --mirror / --all
for (const cmd of ["git push --mirror", "git push --all", "git push origin --all", "git push --mirror origin"]) {
  test(`blockiert (push mirror/all): ${cmd}`, () => {
    const r = runCmd(cmd);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--mirror|--all/);
  });
}
test("erlaubt: Branch mit all im Namen", () => assert.equal(runCmd("git push origin feat/all-in-one").code, 0));
