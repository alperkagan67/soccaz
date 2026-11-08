// Tests fuer die Hilfsfunktionen von scripts/worktree.mjs (ohne DB, ohne git).
// Aufruf: node --test scripts/worktree.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSecret,
  assertBase,
  assertLocalHost,
  resolveDbName,
  assertBranch,
  assertDbName,
  dbNameFor,
  dbNameOfUrl,
  dirNameFor,
  getEnvValue,
  parseArgs,
  parseWorker,
  redact,
  setEnvValue,
  withDbName,
} from "./worktree.mjs";

test("assertDbName: nur soccaz_w1..soccaz_w4", () => {
  for (const ok of ["soccaz_w1", "soccaz_w2", "soccaz_w3", "soccaz_w4"]) assert.equal(assertDbName(ok), ok);
  for (const bad of ["soccav2", "postgres", "soccaz_w5", "soccaz_w0", "soccaz_w1; x", "soccaz_w12", "SOCCAZ_W1", ""]) {
    assert.throws(() => assertDbName(bad), /nicht erlaubt/);
  }
});

test("parseWorker / dbNameFor", () => {
  assert.equal(parseWorker("3"), 3);
  assert.equal(dbNameFor(2), "soccaz_w2");
  for (const bad of ["0", "5", "x", "1.5", ""]) assert.throws(() => parseWorker(bad));
});

test("dirNameFor ersetzt / durch -", () => {
  assert.equal(dirNameFor("feat/loop-e5"), "feat-loop-e5");
  assert.equal(dirNameFor("test/e5-check"), "test-e5-check");
  assert.equal(dirNameFor("fix"), "fix");
});

test("assertBranch lehnt gefaehrliche Namen ab", () => {
  for (const bad of ["", "-x", "../x", "a/../b", "a b", "a;b", "x/", "x.lock", "$(x)"]) assert.throws(() => assertBranch(bad));
});

test("setEnvValue ersetzt oder haengt an, andere Zeilen bleiben", () => {
  const src = "A=1\nDATABASE_URL=x\nB=2\n";
  const out = setEnvValue(setEnvValue(src, "DATABASE_URL", "y"), "PORT", "3101");
  assert.equal(out, "A=1\nDATABASE_URL=y\nB=2\nPORT=3101\n");
  assert.equal(setEnvValue("PORT=1", "PORT", "2"), "PORT=2");
  assert.equal(setEnvValue("A=1\r\nB=2\r\n", "PORT", "3"), "A=1\r\nB=2\r\nPORT=3\r\n");
});

test("getEnvValue", () => {
  assert.equal(getEnvValue("A=1\nB=\"x y\"\n", "B"), "x y");
  assert.equal(getEnvValue("A=1\n", "C"), undefined);
});

test("withDbName behaelt Host/Port/Benutzer/Passwort, aendert nur die DB", () => {
  const u = withDbName("postgres://user:pw@127.0.0.1:5433/soccav2", "soccaz_w1");
  assert.equal(u, "postgres://user:pw@127.0.0.1:5433/soccaz_w1");
  assert.equal(dbNameOfUrl(u), "soccaz_w1");
  assert.equal(dbNameOfUrl("kaputt"), "");
});

test("redact schwaerzt Geheimnisse und Verbindungs-URLs", () => {
  addSecret("geheim-passwort");
  const out = redact("Fehler bei postgres://u:geheim-passwort@h:5433/db und geheim-passwort allein");
  assert.ok(!out.includes("geheim-passwort"));
  assert.ok(!out.includes("postgres://"));
});

test("parseArgs", () => {
  const { positional, flags } = parseArgs(["create", "a/b", "1", "--base", "main", "--no-seed"]);
  assert.deepEqual(positional, ["create", "a/b", "1"]);
  assert.deepEqual(flags, { base: "main", "no-seed": true });
});

// ---- Review-Fixes (Runde 1) ----

test("Fund A: resolveDbName - .env.local ist massgeblich, --worker muss passen", () => {
  const url = "postgres://u@127.0.0.1:5433/soccaz_w1";
  assert.equal(resolveDbName(url, undefined), "soccaz_w1");
  assert.equal(resolveDbName(url, "1"), "soccaz_w1");
  assert.throws(() => resolveDbName(url, "2"), /passt nicht/);
  assert.throws(() => resolveDbName("postgres://u@127.0.0.1:5433/soccav2", "1"), /nicht erlaubt/);
  assert.throws(() => resolveDbName("postgres://u@127.0.0.1:5433/soccav2", undefined), /nicht erlaubt/);
});

test("Fund A: resolveDbName - --worker nur als Fallback ohne .env.local-Name", () => {
  assert.equal(resolveDbName(undefined, "3"), "soccaz_w3");
  assert.equal(resolveDbName("", "4"), "soccaz_w4");
  assert.throws(() => resolveDbName(undefined, undefined), /--worker/);
  assert.throws(() => resolveDbName(undefined, true), /--worker/);
  assert.throws(() => resolveDbName(undefined, "9"), /worker muss/);
});

test("Fund B: assertBase lehnt Optionen und Pfadtricks ab", () => {
  for (const ok of ["main", "origin/main", "feat/loop-setup", "v1.2.3", "a1b2c3d"]) assert.equal(assertBase(ok), ok);
  for (const bad of ["-x", "--orphan", "--detach", "../x", "a..b", "a b", "x/", "", undefined, true]) {
    assert.throws(() => assertBase(bad), /--base/);
  }
});

test("Fund C: assertLocalHost erlaubt nur lokalen Host", () => {
  assert.equal(assertLocalHost("postgres://u@127.0.0.1:5433/x"), "127.0.0.1");
  assert.equal(assertLocalHost("postgres://u@localhost:5433/x"), "localhost");
  assert.equal(assertLocalHost("postgres://u@[::1]:5433/x"), "[::1]");
  for (const bad of ["postgres://u@db.example.com:5432/x", "postgres://u@10.0.0.5/x", "postgres://u@127.0.0.1.evil.com/x", "kaputt"]) {
    assert.throws(() => assertLocalHost(bad), /lokal|lesbar/);
  }
});
