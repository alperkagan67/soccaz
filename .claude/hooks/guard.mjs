#!/usr/bin/env node
// guard.mjs - PreToolUse-Hook "guard-light" (Matcher: Bash), Spec 9.3.
//
// Liest das Hook-JSON von stdin (tool_input.command) und blockiert destruktive
// Muster. Blockieren geht NUR mit EXIT-CODE 2 (Grund auf stderr); Exit 1
// blockiert nicht. Alles andere sowie leere oder defekte Eingabe: Exit 0.
//
// Funktionsweise: Der Befehlstext wird mit einem kleinen Shell-Tokenizer in
// einfache Befehle zerlegt (Trennzeichen ; & | ( ) Zeilenumbruch; Quotes,
// Backslash-Escapes, Kommentare, Heredocs, $(...) und Backticks). Geprueft wird
// nur das KOMMANDO und seine Argumente. Text, der nur erwaehnt wird (Inhalt von
// git commit -m, echo, grep, cat, gh pr create --body, printf sowie Heredoc-
// Koerper dieser Befehle), wird verworfen und nie als Befehl gewertet.
// Als Befehl ausgewertet wird Text nur bei: bash/sh/zsh/dash/ksh -c, eval,
// powershell/pwsh -Command, cmd /c, Heredoc an einen Shell-Interpreter,
// Kommandosubstitution $(...) und Backticks (auch in Anfuehrungszeichen).
//
// Regeln (bewusst einfach gehalten):
//  1. Rekursives Loeschen: das Kommando rm (auch \rm, /bin/rm, "rm", sudo rm,
//     xargs rm) mit -r/-R/--recursive (auch -rf, -r -f); Remove-Item -Recurse;
//     rd/rmdir /s. "git rm" ist KEIN rm und bleibt erlaubt.
//  2. DROP/TRUNCATE (TABLE, DATABASE, SCHEMA, ...) in Argumenten oder Heredocs
//     von DB-Clients (psql, mysql, mariadb, sqlite3, sqlcmd, duckdb; auch via
//     docker exec), ausser der Befehl betrifft Migrationsdateien (Pfad mit
//     drizzle/ oder migrations/).
//  3. Force-Push: git push mit --force, -f (auch gebuendelt, z. B. -fu),
//     --force-with-lease, --force-if-includes oder +refspec; ausserdem
//     --mirror und --all.
//  4. Push auf main/master (Ziel main, HEAD:main, refs/heads/main).
//  5. drizzle-kit push / prisma db push / db:push gegen fremde DBs: blockiert,
//     wenn der Befehl eine Datenbank-URL mit anderem Host als localhost /
//     127.0.0.1 enthaelt oder prod/production nennt.
//
// WICHTIG: Die Deny-Regel Bash(git push --force*) in settings.json trifft auch
// --force-with-lease. Kuenftige Amend + Force-Pushes brauchen damit eine
// bewusste Handlung des Nutzers.
//
// Fail-closed: Interne Fehler (Exception, Stack Overflow) und zu tiefe
// Verschachtelung (mehr als MAX_DEPTH Ebenen bash -c/eval/..., mehr als
// MAX_PARSE_DEPTH Ebenen $( )) blockieren mit Exit 2. Nur leere oder defekte
// Hook-Eingabe (kein command) ergibt Exit 0.
// Shell-Schluesselwoerter/Gruppen (if/then/else/elif/fi/do/done/while/until,
// { } !) am Segmentanfang werden uebersprungen; find -exec/-execdir/-ok/-okdir
// wird wie ein eigener Befehl ausgewertet.
//
// Bekannte Grenzen (guard-light, kein vollstaendiger Parser):
//  - Exotische Heredoc-Faelle: unquoted Heredoc mit Substitution im Body;
//    "bash <<EOF" mit Body als Script nur teilweise.
//  - Umgehungen ueber Variablen (X=rm; $X -rf y), find -delete,
//    python/node-Einzeiler (rmtree/rmSync) werden nicht erkannt.
//  - Der Guard ist nur eine Schicht; die eigentliche Sicherheit tragen
//    Deny-Regeln, Branch Protection (PR-Pflicht, CI-Pflicht, kein Force-Push)
//    und die PR-Pruefung durch den Nutzer.
//  - git reset --hard, git clean -f, DELETE FROM greifen nur ueber die
//    Deny-Regeln in settings.json.
//  - Ein reines "git push" ohne Ziel wird nicht blockiert (der aktuelle Branch
//    ist dem Hook nicht bekannt); dafuer sorgt Branch Protection auf main.

import { readFileSync } from "node:fs";

const MAX_DEPTH = 5;
const MAX_PARSE_DEPTH = 100;

// Wird bei zu tiefer Verschachtelung geworfen; main() faengt sie fail-closed ab.
class DepthError extends Error {}
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);
const WRAPPERS = new Set(["sudo", "doas", "env", "command", "builtin", "nohup", "time", "exec", "xargs", "nice", "stdbuf"]);
// Shell-Schluesselwoerter/Gruppen am Segmentanfang (if true; then rm -rf x; fi, { rm -rf x; })
const KEYWORDS = new Set(["if", "then", "else", "elif", "fi", "do", "done", "while", "until", "{", "}", "!"]);
const DB_CLIENTS =new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlcmd", "duckdb"]);

// ---------------------------------------------------------------- Tokenizer

/** Zerlegt Shell-Text in einfache Befehle { words: string[], heredoc: string }. */
function parse(s) {
  const out = [];
  let i = 0;
  const len = s.length;

  function scan(close, d) {
    if (d > MAX_PARSE_DEPTH) throw new DepthError();
    let cmd = { words: [], heredoc: "" };
    let word = null;
    let pend = [];
    const endWord = () => {
      if (word !== null) {
        cmd.words.push(word);
        word = null;
      }
    };
    const endCmd = () => {
      endWord();
      if (cmd.words.length) out.push(cmd);
      cmd = { words: [], heredoc: "" };
    };

    while (i < len) {
      const c = s[i];
      if (c === "'") {
        word ??= "";
        i++;
        while (i < len && s[i] !== "'") word += s[i++];
        i++;
      } else if (c === '"') {
        word ??= "";
        i++;
        while (i < len && s[i] !== '"') {
          if (s[i] === "\\" && i + 1 < len) {
            word += s[i + 1];
            i += 2;
          } else if (s[i] === "$" && s[i + 1] === "(") {
            i += 2;
            scan(")", d + 1);
          } else if (s[i] === "`") {
            i++;
            scan("`", d + 1);
          } else {
            word += s[i++];
          }
        }
        i++;
      } else if (c === "\\") {
        if (s[i + 1] === "\n") i += 2;
        else if (s[i + 1] === "\r" && s[i + 2] === "\n") i += 3;
        else {
          word ??= "";
          word += s[i + 1] ?? "";
          i += 2;
        }
      } else if (c === "$" && s[i + 1] === "(") {
        word ??= "";
        i += 2;
        scan(")", d + 1);
      } else if (c === "`") {
        if (close === "`") {
          endCmd();
          i++;
          return;
        }
        word ??= "";
        i++;
        scan("`", d + 1);
      } else if (c === ")" && close === ")") {
        endCmd();
        i++;
        return;
      } else if (c === "#" && word === null) {
        while (i < len && s[i] !== "\n") i++;
      } else if (c === "\n") {
        endCmd();
        i++;
        for (const p of pend) {
          let body = "";
          while (i < len) {
            let j = s.indexOf("\n", i);
            if (j < 0) j = len;
            const line = s.slice(i, j);
            i = Math.min(j + 1, len);
            const cmp = (p.strip ? line.replace(/^\t+/, "") : line).replace(/\r$/, "");
            if (cmp === p.delim) break;
            body += line + "\n";
          }
          p.cmd.heredoc += body;
        }
        pend = [];
      } else if (c === " " || c === "\t" || c === "\r") {
        endWord();
        i++;
      } else if (c === ";" || c === "&" || c === "|" || c === "(" || c === ")") {
        endCmd();
        i++;
      } else if (c === "<" && s[i + 1] === "<" && s[i + 2] !== "<") {
        i += 2;
        const strip = s[i] === "-";
        if (strip) i++;
        while (s[i] === " " || s[i] === "\t") i++;
        let delim = "";
        while (i < len && !/[\s;&|<>()]/.test(s[i])) {
          if (s[i] === "'" || s[i] === '"') {
            const q = s[i++];
            while (i < len && s[i] !== q) delim += s[i++];
            i++;
          } else if (s[i] === "\\") {
            delim += s[i + 1] ?? "";
            i += 2;
          } else {
            delim += s[i++];
          }
        }
        endWord();
        pend.push({ cmd, delim, strip });
      } else {
        word ??= "";
        word += c;
        i++;
      }
    }
    endCmd();
  }

  scan(null, 0);
  return out;
}

// ------------------------------------------------------------------ Pruefung

const baseName = (t) =>
  String(t).replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.exe$/, "");

function gitSubcommand(args) {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree" || a === "--namespace") k++;
    else if (a.startsWith("-")) continue;
    else return { sub: a, rest: args.slice(k + 1) };
  }
  return { sub: "", rest: [] };
}

function checkPush(rest) {
  for (const a of rest) {
    if (/^--force(-with-lease|-if-includes)?(=.*)?$/i.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+\S/.test(a)) {
      return "Force-Push (--force, -f, --force-with-lease, +refspec) ist gesperrt.";
    }
    if (a === "--mirror") return "git push --mirror ist gesperrt (ueberschreibt/loescht Remote-Refs).";
    if (a === "--all") return "git push --all ist gesperrt (pusht auch main).";
  }
  for (const a of rest) {
    if (a.startsWith("-")) continue;
    if (/^(\+?[^:\s]*:)?(refs\/heads\/)?(main|master)$/.test(a)) {
      return "Push auf main/master ist gesperrt (nur per PR).";
    }
  }
  return null;
}

function checkDbPush(words) {
  const lower = words.map((w) => w.toLowerCase());
  const isPush =
    (lower.includes("drizzle-kit") && lower.includes("push")) ||
    (lower.includes("prisma") && lower.includes("db") && lower.includes("push")) ||
    lower.includes("db:push");
  if (!isPush) return null;
  const text = words.join(" ");
  if (/\bprod(uction)?\b/i.test(text)) return "DB-Push gegen prod/production ist gesperrt.";
  for (const m of text.matchAll(/[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?([^:/\s?]+)/gi)) {
    const host = m[1].toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1") return `DB-Push gegen fremden Host (${host}) ist gesperrt.`;
  }
  return null;
}

function checkCommand(cmd, depth) {
  const words = cmd.words;
  let k = 0;
  while (k < words.length) {
    if (/^[A-Za-z_]\w*=/.test(words[k]) || KEYWORDS.has(words[k])) k++;
    else if (WRAPPERS.has(baseName(words[k]))) {
      k++;
      while (k < words.length && words[k].startsWith("-")) k++;
    } else break;
  }
  if (k >= words.length) return null;
  const name = baseName(words[k]);
  const args = words.slice(k + 1);

  // SQL: DROP/TRUNCATE nur bei DB-Clients (Argumente + Heredoc)
  if (words.some((w) => DB_CLIENTS.has(baseName(w)))) {
    const text = words.join(" ") + "\n" + cmd.heredoc;
    if (/\b(drop\s+(table|database|schema|index|column|view|type)|truncate(\s+table)?\s+\S)/i.test(text)) {
      if (!/(drizzle|migrations?)\//i.test(text.replace(/\\/g, "/"))) {
        return "DROP/TRUNCATE ausserhalb von Migrationen ist gesperrt.";
      }
    }
  }

  const dbPush = checkDbPush(words);
  if (dbPush) return dbPush;

  if (name === "rm") {
    if (args.some((a) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(a) || a === "--recursive")) {
      return "Rekursives Loeschen (rm -r/-rf) ist gesperrt.";
    }
  } else if (name === "remove-item" || name === "ri") {
    if (args.some((a) => /^-r(e(c(u(r(s(e)?)?)?)?)?)?$/i.test(a))) return "Remove-Item -Recurse ist gesperrt.";
  } else if (name === "rd" || name === "rmdir") {
    if (args.some((a) => a.toLowerCase() === "/s")) return "rd/rmdir /s (rekursives Loeschen) ist gesperrt.";
  } else if (name === "git") {
    const { sub, rest } = gitSubcommand(args);
    if (sub === "push") return checkPush(rest);
  } else if (SHELLS.has(name)) {
    for (let a = 0; a < args.length; a++) {
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(args[a]) && args[a + 1] !== undefined) {
        const r = evaluate(args[a + 1], depth + 1);
        if (r) return r;
      }
    }
    if (cmd.heredoc) return evaluate(cmd.heredoc, depth + 1);
  } else if (name === "eval") {
    return evaluate(args.join(" "), depth + 1);
  } else if (name === "powershell" || name === "pwsh") {
    const a = args.findIndex((x) => ["-c", "-command"].includes(x.toLowerCase()));
    if (a >= 0) return evaluate(args.slice(a + 1).join(" "), depth + 1);
  } else if (name === "find") {
    // Argumente nach -exec/-execdir/-ok/-okdir bis ; oder + wie einen Befehl auswerten
    for (let a = 0; a < args.length; a++) {
      if (!["-exec", "-execdir", "-ok", "-okdir"].includes(args[a])) continue;
      const sub = [];
      let b = a + 1;
      while (b < args.length && args[b] !== ";" && args[b] !== "+") sub.push(args[b++]);
      const r = checkCommand({ words: sub, heredoc: "" }, depth);
      if (r) return r;
      a = b;
    }
  } else if (name === "cmd") {
    const a = args.findIndex((x) => x.toLowerCase() === "/c");
    if (a >= 0) return evaluate(args.slice(a + 1).join(" "), depth + 1);
  }
  return null;
}

function evaluate(text, depth = 0) {
  if (depth > MAX_DEPTH) throw new DepthError();
  for (const cmd of parse(String(text))) {
    const reason = checkCommand(cmd, depth);
    if (reason) return reason;
  }
  return null;
}

// --------------------------------------------------------------------- main

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
  // Fail-closed: jede interne Exception (auch Stack Overflow) blockiert den Befehl.
  let reason;
  try {
    reason = evaluate(command);
  } catch (e) {
    reason =
      e instanceof DepthError
        ? "zu tief verschachtelt, blockiert."
        : "interner Fehler beim Pruefen, Befehl blockiert.";
  }
  if (reason) {
    process.stderr.write(`guard: BLOCKIERT - ${reason}\nBefehl: ${command}\n`);
    return 2;
  }
  return 0;
}

process.exit(main());
