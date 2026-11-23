// scripts/worktree-cleanup.mjs - raeumt verwaiste Worktree-Ordner unter ../worktrees/ auf (Auftrag t2s/t2q).
//
// Aufruf (aus SoccaV2 oder einem seiner Worktrees):
//   node scripts/worktree-cleanup.mjs           Trockenlauf (Standard): meldet nur, loescht nichts
//   node scripts/worktree-cleanup.mjs --apply   loescht die als Worktree-Rest erkannten Ordner
// Jedes andere Argument: Hilfe, Exit 2, nichts geschieht. Exit 3: Wurzel oder Git unklar (nichts angefasst). Sonst Exit 0 (auch bei gesperrten Ordnern; sie stehen in der Ausgabe).
//
// Sicherheit (fail-closed):
//  - Die Wurzel kommt aus `git rev-parse --git-common-dir` (Verzeichnis des Skripts), NIE aus dem aktuellen Ordner: <Hauptrepo>/../worktrees. Sie muss `worktrees` heissen, ein echter Ordner
//    sein (kein Symlink/keine Junction) und wird per realpath verglichen. Schlaegt `git worktree list --porcelain` fehl: Abbruch.
//  - Kandidat: ein Ordner, der DIREKTES Kind der Wurzel ist (realpath unter realpath der Wurzel), keine Verknuepfung ist, nicht das Hauptrepo und nicht in `git worktree list` steht.
//  - Nur ein WORKTREE-REST wird geloescht: ein Ordner mit .git-DATEI (Gitlink "gitdir: ...") ohne Eintrag in `git worktree list` (Ziel fehlt oder nicht gelistet), ODER ein leerer Ordner,
//    ODER ein Ordner, der nur eine node_modules-Verknuepfung enthaelt, ODER ein SNAPSHOT-REST (Ordner ohne .git, mind. 50 Dateien, JEDE Datei ausser den generierten (next-env.d.ts, *.tsbuildinfo,
//    .next, test-results, coverage, node_modules) liegt byteGLEICH als Blob in der Objektdatenbank, auch in der CRLF-Fassung; neueste Datei aelter als 24 h). Eine einzige unbekannte Datei: Ordner bleibt,
//    die einzigartigen Dateien werden namentlich gemeldet. Alles andere (auch Ordner mit .git-VERZEICHNIS = echtes Repo, Ordner ohne .git-Datei) wird uebersprungen und im
//    Trockenlauf gelistet ("bitte manuell pruefen"). Lose Dateien direkt unter worktrees/: NUR nach Allowlist der Namensmuster (FILE_ALLOWLIST), nur regulaere Dateien (kein Symlink), nur aelter als 24 h, nie rekursiv; alles andere wird als unbekannt gelistet und nie geloescht.
//  - Loeschen ohne Vertrauen auf rm -r: eigener Durchlauf mit lstat; Symlinks und Junctions (z. B. node_modules) werden NUR als Verknuepfung entfernt, nie betreten, das Ziel bleibt
//    unangetastet; Dateien unlink, Ordner rmdir nach dem Leeren. Schreibgeschuetzt: Attribut zuruecksetzen, einmal wiederholen; bleibt es gesperrt (EBUSY/EPERM/EACCES): Ordner als
//    "gesperrt" melden, die anderen laufen weiter.
//  - Dev-Server (nur Windows, nur mit --apply): Hoerer auf 3101 bis 3109 (NIE 3100) aus `netstat -ano -p TCP` (sprachunabhaengig: Fremdadresse 0.0.0.0:0); beendet wird NUR ein Prozess,
//    dessen Kommandozeile den Pfad des Kandidaten enthaelt. Kein anderer Prozess.
//  - Nur Node-Standardbibliothek, keine Shell, git/powershell/netstat mit Argumentliste.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PORT_MIN = 3101;
export const PORT_MAX = 3109;
const COUNT_CAP = 1000;
const LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"]);

/** Pfad fuer Vergleiche: absolut, nur `/`, ohne Schlussstrich, unter Windows kleingeschrieben. */
export function normalizePath(p, platform = process.platform) {
  const n = path.resolve(String(p)).replace(/\\/g, "/").replace(/\/+$/, "");
  return platform === "win32" ? n.toLowerCase() : n;
}

/** Pfade aus `git worktree list --porcelain` (Zeilen "worktree <pfad>"). */
export function parseWorktreeList(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length).trim())
    .filter(Boolean);
}

/** Hoerer auf 3101 bis 3109 aus `netstat -ano -p TCP` (deutsch oder englisch): Fremdadresse 0.0.0.0:0, [::]:0 oder *:*. */
export function parseNetstat(text) {
  const out = [];
  const seen = new Set();
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 4 || !/^TCP/i.test(t[0])) continue;
    const foreign = t[2];
    if (foreign !== "0.0.0.0:0" && foreign !== "[::]:0" && foreign !== "*:*") continue;
    const pid = Number(t[t.length - 1]);
    const port = Number(t[1].slice(t[1].lastIndexOf(":") + 1));
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(port)) continue;
    if (port < PORT_MIN || port > PORT_MAX) continue; // 3100 gehoert dem Nutzer
    const key = `${port}:${pid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ port, pid });
  }
  return out;
}

/** Steht der Pfad des Kandidaten in der Kommandozeile des Prozesses? (Vergleich ohne Gross-/Kleinschreibung, `/` gegen `\` egal.) */
export function cmdContainsPath(cmd, candidatePath) {
  const c = String(cmd).replace(/\\/g, "/").toLowerCase();
  const p = String(candidatePath).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (p.length === 0) return false;
  // Grenze nach dem Pfad: "rest5" darf nicht auf "rest50" passen
  for (let i = c.indexOf(p); i !== -1; i = c.indexOf(p, i + 1)) {
    const next = c[i + p.length];
    if (next === undefined || !/[a-z0-9._-]/.test(next)) return true;
  }
  return false;
}

// Allowlist fuer lose Hilfsdateien DIREKT unter worktrees/ (Entscheid t2q); alles andere wird nur als "unbekannt" gelistet, nie geloescht.
export const FILE_ALLOWLIST = [
  /^dev-.+\.log$/, /^mut-.+\.cjs$/, /^mut-.+\.mjs$/, /^mutate-.+\.mjs$/, /^.+\.out$/, /^b[0-9]+\.log$/, /^chk.+\.cjs$/, /^fk.+\.cjs$/, /^guard-.+\.txt$/,
  /^apply-.+\.mjs$/, /^add-.+\.mjs$/, /^fix-.+\.mjs$/, /^run-.+\.mjs$/,
];
export const MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Einordnung einer losen Datei direkt unter der Wurzel: { status: "datei-kandidat" | "unbekannt", reason }. Keine Verknuepfung, nur Allowlist, mindestens 24 h alt. */
export function classifyFile({ name, root, fsx = fs, now = Date.now() }) {
  if (name !== path.basename(name) || name === "." || name === "..") return { status: "unbekannt", reason: "kein einfacher Dateiname" };
  let st;
  try {
    st = fsx.lstatSync(path.join(root, name));
  } catch {
    return { status: "unbekannt", reason: "nicht lesbar" };
  }
  if (st.isSymbolicLink() || !st.isFile()) return { status: "unbekannt", reason: "keine regulaere Datei" };
  if (!FILE_ALLOWLIST.some((re) => re.test(name))) return { status: "unbekannt", reason: "nicht in der Allowlist, nie geloescht" };
  if (now - st.mtimeMs <= MIN_AGE_MS) return { status: "unbekannt", reason: "juenger als 24 h, bleibt vorerst" };
  return { status: "datei-kandidat", reason: "Hilfsdatei (Allowlist, aelter als 24 h)" };
}

// Snapshot-Rest (Entscheid t2q): Ordner OHNE .git, dessen Dateien (ausser GENERIERTEN) zu 100 % byteGLEICH als Blob in der Objektdatenbank liegen.
export const SNAPSHOT_MIN_FILES = 50;
export const SNAPSHOT_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_MAX_FILES = 50000;
const SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024;
const GENERATED_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Neueste mtime im Ordner (inkl. Ordner selbst), begrenzt, ohne Verknuepfungen zu betreten, node_modules/.next uebersprungen. Fehler => Infinity (gilt als "zu jung", fail-closed). */
export function newestMtime(dir, fsx = fs) {
  try {
    let newest = fsx.lstatSync(dir).mtimeMs;
    let seen = 0;
    const stack = [dir];
    while (stack.length > 0) {
      const d = stack.pop();
      for (const name of fsx.readdirSync(d)) {
        if (name === "node_modules" || name === ".next") continue;
        const p = path.join(d, name);
        const st = fsx.lstatSync(p);
        if (st.mtimeMs > newest) newest = st.mtimeMs;
        if (st.isDirectory() && !st.isSymbolicLink()) stack.push(p);
        seen += 1;
        if (seen > SNAPSHOT_MAX_FILES) return Number.POSITIVE_INFINITY;
      }
    }
    return newest;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
const GENERATED_DIRS = new Set(["node_modules", ".next", "test-results", "coverage", ".git"]);
export function isGeneratedFile(name) {
  return name === "next-env.d.ts" || name.endsWith(".tsbuildinfo");
}

/** Dateien fuer die Snapshot-Pruefung, ohne Verknuepfungen zu betreten und ohne generierte Ordner. { files: nicht generierte, newest: neueste mtime ALLER Dateien }; null = zu gross. */
export function listSnapshotFiles(dir, fsx = fs) {
  const files = [];
  let newest = 0;
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    const top = d === dir; // Ausnahmen (generierte Ordner/Dateien) gelten NUR auf oberster Ebene; verschachtelt wird alles wie normale Dateien geprueft (kein Versteck)
    for (const name of fsx.readdirSync(d)) {
      if (top && GENERATED_DIRS.has(name)) continue;
      const p = path.join(d, name);
      const st = fsx.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        stack.push(p);
        continue;
      }
      if (!st.isFile()) continue;
      total += 1;
      if (total > SNAPSHOT_MAX_FILES) return null;
      if (st.mtimeMs > newest) newest = st.mtimeMs;
      if (!(top && isGeneratedFile(name) && st.size <= GENERATED_FILE_MAX_BYTES)) files.push(p);
    }
  }
  return { files, newest };
}

function blobId(buf) {
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/**
 * Blob-Pruefung gegen die Objektdatenbank des Hauptrepos (ein Batch: git cat-file --batch-check). Je Datei werden ZWEI Fassungen geprueft, unabhaengig von der autocrlf-Einstellung:
 * die Bytes wie sie sind UND mit CRLF -> LF (Windows-Zeilenenden); bekannt, wenn EINE davon als Blob existiert. Liefert die Pfade OHNE passenden Blob (zu grosse/unlesbare Dateien zaehlen als unbekannt).
 */
export function gitBlobCheck(paths, mainRepo, fsx = fs) {
  if (paths.length === 0) return [];
  const ids = [];
  const unreadable = new Set();
  const own = [];
  paths.forEach((p, i) => {
    try {
      const st = fsx.statSync(p);
      if (st.size > SNAPSHOT_MAX_BYTES) throw new Error("zu gross");
      const buf = fsx.readFileSync(p);
      ids.push(blobId(buf));
      own.push(i);
      const lf = Buffer.from(buf.toString("latin1").split("\r\n").join("\n"), "latin1");
      if (lf.length !== buf.length) {
        ids.push(blobId(lf));
        own.push(i);
      }
    } catch {
      unreadable.add(i);
    }
  });
  const known = new Set();
  if (ids.length > 0) {
    const out = execFileSync("git", ["cat-file", "--batch-check"], { cwd: mainRepo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, input: ids.join("\n") + "\n", stdio: ["pipe", "pipe", "pipe"] })
      .split(/\r?\n/)
      .filter(Boolean);
    if (out.length !== ids.length) throw new Error("cat-file lieferte unerwartet viele Zeilen");
    out.forEach((row, k) => {
      if (!row.endsWith(" missing")) known.add(own[k]);
    });
  }
  return paths.filter((_, i) => unreadable.has(i) || !known.has(i));
}

/** Entscheidung fuer einen Ordner ohne .git: { ok, reason, missing[] }. Jede Unklarheit = nicht ok (manuell pruefen). */
export function snapshotCheck(dir, { blobCheck, fsx = fs, now = Date.now() }) {
  let listed;
  try {
    listed = listSnapshotFiles(dir, fsx);
  } catch {
    return { ok: false, reason: "Dateiliste nicht lesbar", missing: [] };
  }
  if (!listed) return { ok: false, reason: "zu viele Dateien fuer die Pruefung", missing: [] };
  const { files, newest } = listed;
  if (files.length < SNAPSHOT_MIN_FILES) return { ok: false, reason: `nur ${files.length} Dateien (Mindestgroesse ${SNAPSHOT_MIN_FILES})`, missing: [] };
  if (now - newest <= SNAPSHOT_MIN_AGE_MS) return { ok: false, reason: "neueste Datei juenger als 24 h", missing: [] };
  let missing;
  try {
    missing = blobCheck(files);
  } catch (e) {
    return { ok: false, reason: `Blob-Pruefung fehlgeschlagen (${String(e.message).split("\n")[0]})`, missing: [] };
  }
  const names = missing.map((p) => path.relative(dir, p).split(path.sep).join("/"));
  if (names.length > 0) return { ok: false, reason: `${names.length} von ${files.length} Dateien mit unbekanntem Inhalt (einzigartig)`, missing: names };
  return { ok: true, reason: `Snapshot-Rest: alle ${files.length} Dateien (ohne generierte) byteGLEICH als Blob bekannt, neueste Datei aelter als 24 h`, missing: [] };
}

class Locked extends Error {
  constructor(file, code) {
    super(`${code} bei ${file}`);
    this.file = file;
    this.code = code;
  }
}

function underRoot(real, realRoot, platform) {
  const a = normalizePath(real, platform);
  const r = normalizePath(realRoot, platform);
  return a !== r && path.posix.dirname(a) === r; // DIREKTES Kind
}

/** Grobe Zaehlung der Dateien (ohne node_modules, .next, .git, ohne Verknuepfungen zu folgen), gedeckelt. */
export function roughCount(dir, fsx = fs) {
  let n = 0;
  const stack = [dir];
  while (stack.length > 0 && n < COUNT_CAP) {
    const d = stack.pop();
    let names;
    try {
      names = fsx.readdirSync(d);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      const p = path.join(d, name);
      let st;
      try {
        st = fsx.lstatSync(p);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) stack.push(p);
      else n += 1;
      if (n >= COUNT_CAP) break;
    }
  }
  return n;
}

/**
 * Einordnung EINES Eintrags direkt unter der Wurzel. Gibt { status: "kandidat" | "uebersprungen", reason, info? } zurueck;
 * `known` = normalisierte Pfade aus `git worktree list`, `mainRepoReal` = realpath des Hauptrepos.
 */
export function classifyEntry({ name, root, realRoot, mainRepoReal, known, fsx = fs, platform = process.platform, blobCheck = null, now = Date.now() }) {
  const full = path.join(root, name);
  let st;
  try {
    st = fsx.lstatSync(full);
  } catch (e) {
    return { status: "uebersprungen", reason: `nicht lesbar (${e.code ?? "Fehler"})` };
  }
  if (st.isSymbolicLink()) return { status: "uebersprungen", reason: "Verknuepfung auf Wurzelebene, nicht angefasst" };
  if (!st.isDirectory()) return { status: "uebersprungen", reason: "Datei, nie angefasst", silent: true };
  let real;
  try {
    real = fsx.realpathSync(full);
  } catch (e) {
    return { status: "uebersprungen", reason: `realpath nicht moeglich (${e.code ?? "Fehler"})` };
  }
  if (!underRoot(real, realRoot, platform)) return { status: "uebersprungen", reason: "nicht direktes Kind der Wurzel (ausserhalb)" };
  if (normalizePath(real, platform) === normalizePath(mainRepoReal, platform)) return { status: "uebersprungen", reason: "Hauptrepo, nie angefasst" };
  if (known.has(normalizePath(real, platform)) || known.has(normalizePath(full, platform))) return { status: "uebersprungen", reason: "bekannter Worktree" };
  const count = roughCount(full, fsx);
  const info = `enthaelt ${count >= COUNT_CAP ? `mindestens ${COUNT_CAP}` : count} Dateien (ohne node_modules, .next, .git)`;

  const tooYoung = () => now - newestMtime(full, fsx) <= MIN_AGE_MS;
  let gitSt = null;
  try {
    gitSt = fsx.lstatSync(path.join(full, ".git"));
  } catch {
    gitSt = null;
  }
  if (gitSt?.isDirectory()) return { status: "uebersprungen", reason: "echtes Repo (.git-Verzeichnis)", info };
  if (gitSt?.isFile()) {
    let text = "";
    try {
      text = fsx.readFileSync(path.join(full, ".git"), "utf8").slice(0, 4096);
    } catch {
      return { status: "uebersprungen", reason: ".git-Datei nicht lesbar", info };
    }
    const m = /^gitdir:\s*(.+)$/m.exec(text);
    if (!m) return { status: "uebersprungen", reason: ".git-Datei ohne gitdir-Zeile (kein Gitlink), bitte manuell pruefen", info };
    const target = path.resolve(full, m[1].trim());
    // Nur wenn das gitdir FEHLT (kein Branch/Eintrag mehr): existiert es noch (z. B. gepruneter Eintrag, fremdes Repo), bleibt der Ordner zur manuellen Pruefung
    if (fsx.existsSync(target)) return { status: "uebersprungen", reason: "Gitlink, gitdir existiert noch (nicht in worktree list), bitte manuell pruefen", info };
    if (tooYoung()) return { status: "uebersprungen", reason: "Gitlink-Rest, aber juenger als 24 h, bleibt vorerst", info };
    return { status: "kandidat", reason: "Worktree-Rest: Gitlink auf fehlendes gitdir, aelter als 24 h", info };
  }
  // keine .git: nur leer oder nur eine node_modules-Verknuepfung gilt als Rest
  let names = [];
  try {
    names = fsx.readdirSync(full);
  } catch {
    return { status: "uebersprungen", reason: "Ordner nicht lesbar", info };
  }
  if (names.length === 0) {
    if (tooYoung()) return { status: "uebersprungen", reason: "leerer Ordner, aber juenger als 24 h (evtl. gerade angelegt), bleibt vorerst", info };
    return { status: "kandidat", reason: "Worktree-Rest: leerer Ordner, aelter als 24 h", info };
  }
  if (names.length === 1 && names[0] === "node_modules") {
    try {
      if (fsx.lstatSync(path.join(full, "node_modules")).isSymbolicLink()) {
        if (tooYoung()) return { status: "uebersprungen", reason: "nur eine node_modules-Verknuepfung, aber juenger als 24 h, bleibt vorerst", info };
        return { status: "kandidat", reason: "Worktree-Rest: nur eine node_modules-Verknuepfung, aelter als 24 h", info };
      }
    } catch {
      /* faellt unten durch */
    }
  }
  if (blobCheck) {
    const snap = snapshotCheck(full, { blobCheck, fsx, now });
    const list = snap.missing.length > 0 ? `; Ausnahmen: ${snap.missing.slice(0, 20).join(", ")}${snap.missing.length > 20 ? `, ... (+${snap.missing.length - 20})` : ""}` : "";
    if (snap.ok) return { status: "kandidat", reason: snap.reason, info: info + list };
    return { status: "uebersprungen", reason: `kein Worktree-Rest, bitte manuell pruefen (${snap.reason})`, info: info + list };
  }
  return { status: "uebersprungen", reason: "kein Worktree-Rest, bitte manuell pruefen", info };
}

function removeFile(p, fsx) {
  try {
    fsx.unlinkSync(p);
    return;
  } catch (e) {
    if (e.code === "ENOENT") return;
    if (e.code !== "EPERM" && e.code !== "EACCES") throw LOCK_CODES.has(e.code) ? new Locked(p, e.code) : e;
  }
  try {
    fsx.chmodSync(p, 0o666); // schreibgeschuetzt: Attribut zuruecksetzen, einmal wiederholen
    fsx.unlinkSync(p);
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw new Locked(p, e.code ?? "EPERM");
  }
}

function removeLink(p, fsx) {
  try {
    fsx.unlinkSync(p); // Symlink oder Junction NUR als Verknuepfung, das Ziel bleibt
    return;
  } catch (e) {
    if (e.code === "ENOENT") return;
  }
  try {
    fsx.rmdirSync(p); // Junction, die unlink nicht entfernt
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw new Locked(p, e.code ?? "EPERM");
  }
}

/** Entfernt einen Baum, ohne je eine Verknuepfung zu betreten (lstat vor jedem Schritt). Wirft Locked, wenn etwas nicht entfernbar ist. */
export function removeTree(p, fsx = fs) {
  let st;
  try {
    st = fsx.lstatSync(p);
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  if (st.isSymbolicLink()) return removeLink(p, fsx);
  if (st.isDirectory()) {
    for (const name of fsx.readdirSync(p)) removeTree(path.join(p, name), fsx);
    try {
      fsx.rmdirSync(p);
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw new Locked(p, e.code ?? "EPERM");
    }
    return;
  }
  return removeFile(p, fsx);
}

/** Wurzel und Hauptrepo aus Git (Verzeichnis des Skripts), mit allen Pruefungen. Wirft Error mit klarer Meldung (Exit 3). */
export function resolveRoots({ scriptDir, git, fsx = fs }) {
  const commonRaw = git(["rev-parse", "--git-common-dir"], scriptDir).trim();
  if (!commonRaw) throw new Error("git rev-parse --git-common-dir lieferte nichts");
  const common = fsx.realpathSync(path.resolve(scriptDir, commonRaw));
  if (path.basename(common) !== ".git") throw new Error("git-common-dir ist kein .git-Ordner (Bare-Repo?): Abbruch");
  const mainRepo = path.dirname(common);
  const root = path.join(path.dirname(mainRepo), "worktrees");
  let st;
  try {
    st = fsx.lstatSync(root);
  } catch {
    throw new Error(`Wurzel ${root} nicht vorhanden`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error("Wurzel ist ein Symlink/eine Junction oder kein Ordner: Abbruch");
  return { root, realRoot: fsx.realpathSync(root), mainRepo, mainRepoReal: fsx.realpathSync(mainRepo) };
}

function readKnown({ git, mainRepo, platform }) {
  let text;
  try {
    text = git(["worktree", "list", "--porcelain"], mainRepo);
  } catch (e) {
    throw new Error(`git worktree list schlug fehl (${e.message.split("\n")[0]}): Abbruch, nichts wird geloescht`);
  }
  const list = parseWorktreeList(text);
  if (list.length === 0) throw new Error("git worktree list lieferte keinen Eintrag: Abbruch");
  const known = new Set();
  for (const p of list) {
    known.add(normalizePath(p, platform));
    try {
      known.add(normalizePath(fs.realpathSync(p), platform));
    } catch {
      /* Ordner fehlt (prunable): der Pfad selbst reicht */
    }
  }
  return known;
}

/**
 * Hauptablauf. deps: { git(args, cwd) -> text, listeners() -> [{port,pid}], commandLine(pid) -> text, killProcess(pid), fsx, platform }.
 * Gibt { lines, entries, summary } zurueck; die CLI druckt die Zeilen.
 */
export function run({ scriptDir, apply, deps }) {
  const fsx = deps.fsx ?? fs;
  const platform = deps.platform ?? process.platform;
  const { root, realRoot, mainRepo, mainRepoReal } = resolveRoots({ scriptDir, git: deps.git, fsx });
  let known = readKnown({ git: deps.git, mainRepo, platform });
  const blobCheck = deps.blobCheck ?? ((paths) => gitBlobCheck(paths, mainRepo));
  const names = fsx.readdirSync(root).sort();
  const entries = [];
  const lines = [];
  const sections = { ordner: [], dateien: [], unbekannt: [] };
  const add = (e) => {
    entries.push(e);
    if (!e.silent) sections[e.kind ?? "ordner"].push(`${e.label.padEnd(10)} ${e.name} | ${e.reason}${e.info ? ` | ${e.info}` : ""}`);
  };

  for (const name of names) {
    let lst = null;
    try {
      lst = fsx.lstatSync(path.join(root, name));
    } catch {
      lst = null;
    }
    if (lst && !lst.isDirectory()) {
      // lose Datei (oder Verknuepfung) direkt unter der Wurzel: nur Allowlist + Mindestalter, nie rekursiv
      const f = classifyFile({ name, root, fsx, now: deps.now ?? Date.now() });
      if (f.status !== "datei-kandidat") {
        add({ name, status: "unbekannt", kind: "unbekannt", label: "UNBEKANNT", reason: f.reason });
      } else if (!apply) {
        add({ name, status: "wuerde-loeschen", kind: "dateien", label: "WUERDE LOESCHEN", reason: f.reason });
      } else {
        const again = classifyFile({ name, root, fsx, now: deps.now ?? Date.now() });
        if (again.status !== "datei-kandidat") add({ name, status: "unbekannt", kind: "unbekannt", label: "UNBEKANNT", reason: again.reason });
        else {
          try {
            removeFile(path.join(root, name), fsx);
            add({ name, status: "geloescht", kind: "dateien", label: "GELOESCHT", reason: f.reason });
          } catch (e) {
            add({ name, status: "gesperrt", kind: "dateien", label: "GESPERRT", reason: `${e.code ?? "Fehler"}` });
          }
        }
      }
      continue;
    }
    const c = classifyEntry({ name, root, realRoot, mainRepoReal, known, fsx, platform, blobCheck, now: deps.now ?? Date.now() });
    if (c.status !== "kandidat") {
      add({ name, status: "uebersprungen", label: "UEBERSPRUNG", reason: c.reason, info: c.info, silent: c.silent });
      continue;
    }
    if (!apply) {
      add({ name, status: "wuerde-loeschen", label: "WUERDE LOESCHEN", reason: c.reason, info: c.info });
      continue;
    }
    // Wettlauf: vor dem Loeschen die Liste noch einmal lesen
    try {
      known = readKnown({ git: deps.git, mainRepo, platform });
    } catch (e) {
      // Abbruch mitten im Lauf: bereits Erledigtes bleibt nachvollziehbar (die CLI gibt e.partial aus)
      e.partial = [...sections.ordner, ...sections.dateien, ...sections.unbekannt];
      throw e;
    }
    const again = classifyEntry({ name, root, realRoot, mainRepoReal, known, fsx, platform, blobCheck, now: deps.now ?? Date.now() });
    if (again.status !== "kandidat") {
      add({ name, status: "uebersprungen", label: "UEBERSPRUNG", reason: `Zustand hat sich geaendert: ${again.reason}`, info: again.info });
      continue;
    }
    const full = path.join(root, name);
    const killed = [];
    try {
      for (const l of deps.listeners()) {
        const cmd = deps.commandLine(l.pid);
        if (cmd && cmdContainsPath(cmd, full)) {
          deps.killProcess(l.pid);
          killed.push(`${l.port}/PID ${l.pid}`);
        }
      }
    } catch (e) {
      sections.ordner.push(`HINWEIS    ${name} | Dev-Server-Pruefung nicht moeglich (${e.message.split("\n")[0]})`);
    }
    try {
      removeTree(full, fsx);
      add({ name, status: "geloescht", label: "GELOESCHT", reason: c.reason + (killed.length ? `; Dev-Server beendet (${killed.join(", ")})` : ""), info: c.info });
    } catch (e) {
      if (e instanceof Locked) add({ name, status: "gesperrt", label: "GESPERRT", reason: `${e.code}: ${path.relative(root, e.file) || name}${killed.length ? "; Dev-Server wurde beendet" : ""}`, info: c.info });
      else add({ name, status: "gesperrt", label: "GESPERRT", reason: `Fehler ${e.code ?? "unbekannt"}: ${String(e.message).split("\n")[0].replace(root, "<worktrees>")}`, info: c.info });
    }
  }
  const count = (s) => entries.filter((e) => e.status === s).length;
  const summary = { geloescht: count("geloescht"), wuerdeLoeschen: count("wuerde-loeschen"), gesperrt: count("gesperrt"), uebersprungen: entries.filter((e) => e.status === "uebersprungen" && !e.silent).length, unbekannt: count("unbekannt") };
  lines.push("== Ordner (Worktree-Reste) ==", ...sections.ordner, "== Dateien (Allowlist) ==", ...sections.dateien, "== unbekannte Dateien (nur gelistet, nie geloescht) ==", ...sections.unbekannt);
  lines.push(`Summe: ${apply ? `${summary.geloescht} geloescht` : `${summary.wuerdeLoeschen} wuerden geloescht (Trockenlauf)`}, ${summary.gesperrt} gesperrt, ${summary.uebersprungen} uebersprungen, ${summary.unbekannt} unbekannte Dateien (nur gelistet).`);
  return { lines, entries, summary, root };
}

// ---------------------------------------------------------------------------------------------------- echte Abhaengigkeiten + CLI

function realDeps() {
  const isWin = process.platform === "win32";
  return {
    git: (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    listeners: () => (isWin ? parseNetstat(execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "latin1", stdio: ["ignore", "pipe", "ignore"] })) : []),
    commandLine: (pid) => {
      if (!isWin || !Number.isInteger(pid) || pid <= 0) return "";
      return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    },
    killProcess: (pid) => process.kill(pid),
  };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    console.error("Aufruf: node scripts/worktree-cleanup.mjs [--apply]\n  ohne Argument: Trockenlauf (loescht nichts); --apply: loescht verwaiste Worktree-Reste unter ../worktrees/");
    return 2;
  }
  const apply = args[0] === "--apply";
  try {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const res = run({ scriptDir, apply, deps: realDeps() });
    console.log(`Wurzel: ${apply ? "APPLY" : "Trockenlauf"} (${res.entries.length} Eintraege)`);
    for (const l of res.lines) console.log(l);
    return 0;
  } catch (e) {
    for (const l of e.partial ?? []) console.log(l);
    console.error(`Abbruch, nichts angefasst oder Rest unklar: ${String(e.message).split("\n")[0]}`);
    return 3;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv));
