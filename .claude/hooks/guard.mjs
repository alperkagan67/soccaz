#!/usr/bin/env node
// guard.mjs - PreToolUse-Hook "guard-light" (Matcher: Bash), Spec 9.3.
//
// Liest das Hook-JSON von stdin (tool_input.command) und blockiert destruktive
// Muster. Blockieren geht NUR mit EXIT-CODE 2 (Grund auf stderr); Exit 1
// blockiert nicht. Alles andere sowie leere oder defekte Eingabe: Exit 0.
//
// Regeln (bewusst einfach gehalten):
//  1. Rekursives Loeschen: rm mit -r/-R/--recursive (auch -rf, -r -f),
//     Remove-Item mit -Recurse, rd/rmdir mit /s.
//  2. DROP/TRUNCATE (TABLE, DATABASE, SCHEMA, ...) ausser der Befehl betrifft
//     Migrationsdateien (Pfad mit drizzle/ oder migrations/).
//  3. Force-Push: git push mit --force, -f (auch gebuendelt, z. B. -fu),
//     --force-with-lease, --force-if-includes oder +refspec.
//  4. Push auf main/master (Ziel main, HEAD:main, refs/heads/main).
//  5. drizzle-kit push / prisma db push / db:push gegen fremde DBs: blockiert,
//     wenn der Befehl eine Datenbank-URL mit anderem Host als localhost /
//     127.0.0.1 enthaelt oder prod/production nennt.
//
// Umwege wie bash -c "..." oder sh -c '...' werden erkannt: Der Befehlstext
// wird normalisiert (Anfuehrungszeichen, $( ), Backticks und Klammern werden zu
// Trennern) und dann je Segment (getrennt an ; & | und Zeilenumbruch) geprueft.
//
// WICHTIG: Die Deny-Regel Bash(git push --force*) in settings.json trifft auch
// --force-with-lease. Kuenftige Amend + Force-Pushes brauchen damit eine
// bewusste Handlung des Nutzers.
//
// Grenzen: Textvergleich, kein Parser. Ein reiner "git push" ohne Ziel wird
// nicht blockiert (der aktuelle Branch ist dem Hook nicht bekannt); dafuer
// sorgt Branch Protection auf main.

import { readFileSync } from "node:fs";

function normalize(cmd) {
  return String(cmd)
    .replace(/\\\r?\n/g, " ")
    .replace(/\$\(|[`()]/g, ";")
    .replace(/["']/g, " ")
    .replace(/[ \t]+/g, " ");
}

function segments(cmd) {
  return normalize(cmd)
    .split(/[;&|\r\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const baseName = (t) => t.replace(/\\/g, "/").split("/").pop().toLowerCase();

function checkSegment(seg) {
  const tokens = seg.split(" ");
  const lower = tokens.map((t) => t.toLowerCase());
  const bases = tokens.map(baseName);

  // 1. Rekursives Loeschen
  const rmAt = bases.findIndex((t) => t === "rm" || t === "rm.exe");
  if (rmAt >= 0 && tokens.slice(rmAt + 1).some((t) => /^-[a-z]*r[a-z]*$/i.test(t) || t === "--recursive")) {
    return "Rekursives Loeschen (rm -r/-rf) ist gesperrt.";
  }
  if (bases.includes("remove-item") || bases.includes("ri")) {
    if (lower.some((t) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/.test(t))) {
      return "Remove-Item -Recurse ist gesperrt.";
    }
  }
  if ((bases.includes("rd") || bases.includes("rmdir")) && lower.includes("/s")) {
    return "rd/rmdir /s (rekursives Loeschen) ist gesperrt.";
  }

  // 2. DROP / TRUNCATE ausserhalb von Migrationen
  if (/\b(drop\s+(table|database|schema|index|column|view|type)|truncate(\s+table)?\s+\S)/i.test(seg)) {
    if (!/(drizzle|migrations?)\//i.test(seg.replace(/\\/g, "/"))) {
      return "DROP/TRUNCATE ausserhalb von Migrationen ist gesperrt.";
    }
  }

  // 3./4. git push
  const gitAt = bases.indexOf("git");
  if (gitAt >= 0) {
    const pushAt = lower.indexOf("push", gitAt + 1);
    if (pushAt >= 0) {
      const args = tokens.slice(pushAt + 1);
      for (const a of args) {
        if (/^--force(-with-lease|-if-includes)?(=.*)?$/i.test(a) || /^-[a-z]*f[a-z]*$/.test(a) || /^\+\S/.test(a)) {
          return "Force-Push (--force, -f, --force-with-lease, +refspec) ist gesperrt.";
        }
      }
      for (const a of args) {
        if (a.startsWith("-")) continue;
        if (/^(\+?[^:\s]*:)?(refs\/heads\/)?(main|master)$/.test(a)) {
          return "Push auf main/master ist gesperrt (nur per PR).";
        }
      }
    }
  }

  // 5. drizzle/prisma push gegen fremde DBs
  const isDbPush =
    /\bdrizzle-kit\b.*\bpush\b/i.test(seg) || /\bprisma\b.*\bdb\s+push\b/i.test(seg) || /\bdb:push\b/i.test(seg);
  if (isDbPush) {
    if (/\bprod(uction)?\b/i.test(seg)) return "DB-Push gegen prod/production ist gesperrt.";
    for (const m of seg.matchAll(/[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?([^:/\s?]+)/gi)) {
      const host = m[1].toLowerCase();
      if (host !== "localhost" && host !== "127.0.0.1") {
        return `DB-Push gegen fremden Host (${host}) ist gesperrt.`;
      }
    }
  }

  return null;
}

function check(command) {
  for (const seg of segments(command)) {
    const reason = checkSegment(seg);
    if (reason) return reason;
  }
  return null;
}

function main() {
  let command = "";
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw.trim()) return 0;
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    return 0;
  }
  if (typeof command !== "string" || !command) return 0;
  const reason = check(command);
  if (reason) {
    process.stderr.write(`guard: BLOCKIERT - ${reason}\nBefehl: ${command}\n`);
    return 2;
  }
  return 0;
}

process.exit(main());
