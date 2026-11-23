import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 }); // echtes git init, worktree add und Commits je Test: auf langsamen Laufwerken mehr als 5 s
import { classifyEntry, cmdContainsPath, normalizePath, parseNetstat, parseWorktreeList, removeTree, resolveRoots, run } from "../../scripts/worktree-cleanup.mjs";

// Aufraeumen verwaister Worktree-Ordner (scripts/worktree-cleanup.mjs). ALLE Tests laufen in Verzeichnissen unter os.tmpdir() (echtes git init + git worktree add), nie im echten Repo.
// Dev-Server-Teil (netstat, Kommandozeile, Beenden) ist ueber deps eingehaengt: kein echter Prozess wird beruehrt.
const SCRIPT = path.resolve(import.meta.dirname, "../../scripts/worktree-cleanup.mjs");
const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) fs.rmSync(tmps.pop()!, { recursive: true, force: true });
});

const git = (args: string[], cwd: string) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.test", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function world() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wtc-"));
  tmps.push(tmp);
  const main = path.join(tmp, "SoccaV2");
  const root = path.join(tmp, "worktrees");
  fs.mkdirSync(path.join(main, "scripts"), { recursive: true });
  fs.mkdirSync(root);
  git(["init", "-q", "-b", "main"], main);
  git(["commit", "-q", "--allow-empty", "-m", "init"], main);
  const scriptDir = path.join(main, "scripts");
  const known = path.join(root, "bekannt");
  git(["worktree", "add", "-q", known, "-b", "bekannt"], main);
  const fake = { killed: [] as number[], listeners: [] as { port: number; pid: number }[], cmd: {} as Record<number, string> };
  // Standard: "jetzt" liegt 48 h in der Zukunft, damit frisch angelegte Testordner als alt genug gelten; Alterstests geben now: Date.now() explizit mit
  const deps = (over: Record<string, unknown> = {}) => ({
    now: Date.now() + 48 * 3600_000,
    git: (args: string[], cwd: string) => git(args, cwd),
    listeners: () => fake.listeners,
    commandLine: (pid: number) => fake.cmd[pid] ?? "",
    killProcess: (pid: number) => {
      fake.killed.push(pid);
    },
    ...over,
  });
  /** Verwaister Worktree-Rest: .git-Datei mit Gitlink auf ein nicht (mehr) vorhandenes gitdir, dazu ein paar Dateien. */
  const orphan = (name: string, files: Record<string, string> = { "a.txt": "a", "sub/b.txt": "b" }) => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".git"), `gitdir: ${path.join(main, ".git", "worktrees", name)}\n`);
    for (const [f, c] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      fs.writeFileSync(path.join(dir, f), c);
    }
    return dir;
  };
  return { tmp, main, root, scriptDir, known, fake, deps, orphan };
}
const exists = (p: string) => fs.existsSync(p);
const statusOf = (res: ReturnType<typeof run>, name: string) => res.entries.find((e: { name: string }) => e.name === name)?.status;

describe("Worktree-Aufraeumen: Auswahl", () => {
  it("ein bekannter Worktree bleibt, auch mit --apply (und das Hauptrepo)", () => {
    const w = world();
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(exists(w.known)).toBe(true);
    expect(exists(w.main)).toBe(true);
    expect(statusOf(res, "bekannt")).toBe("uebersprungen");
  });

  it("verwaister Worktree-Rest (.git-Gitlink ohne Eintrag): Trockenlauf loescht nichts, --apply loescht ihn", () => {
    const w = world();
    const dir = w.orphan("rest1");
    const dry = run({ scriptDir: w.scriptDir, apply: false, deps: w.deps() });
    expect(exists(dir)).toBe(true);
    expect(statusOf(dry, "rest1")).toBe("wuerde-loeschen");
    expect(dry.lines.join("\n")).toMatch(/rest1.*Dateien/); // grobe Zaehlung im Trockenlauf
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "rest1")).toBe("geloescht");
    expect(exists(dir)).toBe(false);
    expect(exists(w.known)).toBe(true);
  });

  it("VERSCHAERFUNG: ein Ordner OHNE .git-Datei (z. B. Nutzer-Inhalt) wird NICHT geloescht, sondern 'bitte manuell pruefen' gelistet", () => {
    const w = world();
    const dir = path.join(w.root, "keep-pause");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "notizen.md"), "wichtig");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(exists(path.join(dir, "notizen.md"))).toBe(true);
    expect(statusOf(res, "keep-pause")).toBe("uebersprungen");
    expect(res.lines.join("\n")).toContain("bitte manuell pruefen");
  });

  it("leerer Ordner und Ordner mit nur einer node_modules-Verknuepfung gelten als Rest; ein Ordner mit echtem node_modules-VERZEICHNIS nicht", () => {
    const w = world();
    const leer = path.join(w.root, "leer");
    fs.mkdirSync(leer);
    const nm = path.join(w.root, "nurlink");
    fs.mkdirSync(nm);
    const ziel = path.join(w.tmp, "ziel-nm");
    fs.mkdirSync(ziel);
    fs.writeFileSync(path.join(ziel, "bleibt.txt"), "x");
    fs.symlinkSync(ziel, path.join(nm, "node_modules"), "junction");
    const echt = path.join(w.root, "echtnm");
    fs.mkdirSync(path.join(echt, "node_modules"), { recursive: true });
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "leer")).toBe("geloescht");
    expect(statusOf(res, "nurlink")).toBe("geloescht");
    expect(exists(path.join(ziel, "bleibt.txt"))).toBe(true);
    expect(statusOf(res, "echtnm")).toBe("uebersprungen");
    expect(exists(echt)).toBe(true);
  });

  it("Ordner mit .git-VERZEICHNIS (echtes Repo) wird uebersprungen und bleibt", () => {
    const w = world();
    const dir = path.join(w.root, "echtesrepo");
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "x.txt"), "x");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "echtesrepo")).toBe("uebersprungen");
    expect(res.lines.join("\n")).toContain("echtes Repo");
    expect(exists(path.join(dir, "x.txt"))).toBe(true);
  });

  it("lose Dateien: ausserhalb der Allowlist bleibt (auch alt), zu junge bleibt, Allowlist-Datei ab 24 h wird mit --apply geloescht, im Trockenlauf nicht", () => {
    const w = world();
    const alt = Date.now() - 48 * 3600_000;
    const mk = (n: string, old: boolean) => {
      const p = path.join(w.root, n);
      fs.writeFileSync(p, "x");
      if (old) fs.utimesSync(p, alt / 1000, alt / 1000);
      return p;
    };
    const frei = mk("dev-board.log", true);
    const jung = mk("apply-a1.mjs", false);
    const fremd = mk("pr-text-x.md", true);
    const hc = mk("hc-x.txt", true);
    const rollback = mk("rollback-1.mjs", true);
    const dry = run({ scriptDir: w.scriptDir, apply: false, deps: w.deps({ now: Date.now() }) });
    expect(exists(frei)).toBe(true);
    expect(statusOf(dry, "dev-board.log")).toBe("wuerde-loeschen");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(exists(frei)).toBe(false);
    for (const p of [jung, fremd, hc, rollback]) expect(exists(p)).toBe(true);
    expect(statusOf(res, "apply-a1.mjs")).toBe("unbekannt");
    expect(statusOf(res, "pr-text-x.md")).toBe("unbekannt");
    const txt = res.lines.join(String.fromCharCode(10));
    expect(txt).toContain("== Ordner (Worktree-Reste) ==");
    expect(txt).toContain("== Dateien (Allowlist) ==");
    expect(txt).toContain("== unbekannte Dateien");
  });

  it("lose Dateien: ein Symlink mit Allowlist-Namen wird nicht angefasst (Ziel bleibt), Unterordner mit Allowlist-Namen wird nicht rekursiv als Datei behandelt", () => {
    const w = world();
    const alt = Date.now() - 48 * 3600_000;
    const ziel = path.join(w.tmp, "zieldatei.txt");
    fs.writeFileSync(ziel, "bleibt");
    try {
      fs.symlinkSync(ziel, path.join(w.root, "dev-link.log"), "file");
    } catch {
      return; // Symlink-Recht fehlt (Windows ohne Entwicklermodus): dann nicht pruefbar
    }
    const sub = path.join(w.root, "dev-ordner.log");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, "inner.log"), "i");
    fs.utimesSync(path.join(sub, "inner.log"), alt / 1000, alt / 1000);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(exists(ziel)).toBe(true);
    expect(fs.lstatSync(path.join(w.root, "dev-link.log")).isSymbolicLink()).toBe(true);
    expect(statusOf(res, "dev-link.log")).toBe("unbekannt");
    expect(exists(path.join(sub, "inner.log"))).toBe(true);
  });

  it("eine Verknuepfung auf Wurzelebene wird nicht angefasst, auch nicht ihr Ziel", () => {
    const w = world();
    const ziel = path.join(w.tmp, "fremd");
    fs.mkdirSync(ziel);
    fs.writeFileSync(path.join(ziel, "f.txt"), "f");
    fs.symlinkSync(ziel, path.join(w.root, "verknuepfung"), "junction");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(statusOf(res, "verknuepfung")).toBe("unbekannt");
    expect(exists(path.join(ziel, "f.txt"))).toBe(true);
  });
});

describe("Worktree-Aufraeumen: Verknuepfungen und Grenzen", () => {
  it("eine Junction/ein Symlink im Rest (node_modules) wird nur als Verknuepfung entfernt: die Datei im ZIEL bleibt UNVERAENDERT", () => {
    const w = world();
    const dir = w.orphan("rest2");
    const ziel = path.join(w.tmp, "ausserhalb");
    fs.mkdirSync(path.join(ziel, "tief"), { recursive: true });
    fs.writeFileSync(path.join(ziel, "wichtig.txt"), "UNVERAENDERT");
    fs.writeFileSync(path.join(ziel, "tief", "auch.txt"), "auch");
    fs.symlinkSync(ziel, path.join(dir, "node_modules"), "junction");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "rest2")).toBe("geloescht");
    expect(exists(dir)).toBe(false);
    expect(fs.readFileSync(path.join(ziel, "wichtig.txt"), "utf8")).toBe("UNVERAENDERT");
    expect(exists(path.join(ziel, "tief", "auch.txt"))).toBe(true);
  });

  it("removeTree betritt nie eine Verknuepfung (direkter Test)", () => {
    const w = world();
    const baum = path.join(w.tmp, "baum");
    const ziel = path.join(w.tmp, "ziel2");
    fs.mkdirSync(baum);
    fs.mkdirSync(ziel);
    fs.writeFileSync(path.join(ziel, "f.txt"), "f");
    fs.symlinkSync(ziel, path.join(baum, "link"), "junction");
    fs.writeFileSync(path.join(baum, "datei.txt"), "d");
    removeTree(baum);
    expect(exists(baum)).toBe(false);
    expect(exists(path.join(ziel, "f.txt"))).toBe(true);
  });

  it("ein Pfad AUSSERHALB der Wurzel ('..') und das Hauptrepo werden abgelehnt (classifyEntry)", () => {
    const w = world();
    const { realRoot, mainRepoReal } = resolveRoots({ scriptDir: w.scriptDir, git: (a: string[], c: string) => git(a, c) });
    const knownSet = new Set<string>();
    const aus = path.join(w.tmp, "ausserhalb2");
    fs.mkdirSync(aus);
    expect(classifyEntry({ name: "../ausserhalb2", root: w.root, realRoot, mainRepoReal, known: knownSet }).status).toBe("uebersprungen");
    expect(classifyEntry({ name: "../ausserhalb2", root: w.root, realRoot, mainRepoReal, known: knownSet }).reason).toContain("ausserhalb");
    const c = classifyEntry({ name: "../SoccaV2", root: w.root, realRoot, mainRepoReal, known: knownSet });
    expect(c.status).toBe("uebersprungen");
    expect(c.status).not.toBe("kandidat");
    expect(classifyEntry({ name: ".", root: w.root, realRoot, mainRepoReal, known: knownSet }).status).toBe("uebersprungen"); // worktrees/ selbst
  });

  it("Hauptrepo-Ausnahme (zweite Sicherung): selbst wenn das Hauptrepo als Kind unter der Wurzel laege, wird es nie Kandidat", () => {
    const w = world();
    const { realRoot } = resolveRoots({ scriptDir: w.scriptDir, git: (a: string[], c: string) => git(a, c) });
    const kind = path.join(w.root, "wie-hauptrepo");
    fs.mkdirSync(kind);
    const c = classifyEntry({ name: "wie-hauptrepo", root: w.root, realRoot, mainRepoReal: fs.realpathSync(kind), known: new Set<string>() });
    expect(c.status).toBe("uebersprungen");
    expect(c.reason).toContain("Hauptrepo");
  });

  it("eine Symlink-/Junction-Wurzel wird abgelehnt (Abbruch, nichts angefasst)", () => {
    const w = world();
    const echt = path.join(w.tmp, "echte-wurzel");
    fs.renameSync(w.root, echt);
    fs.symlinkSync(echt, w.root, "junction");
    expect(() => resolveRoots({ scriptDir: w.scriptDir, git: (a: string[], c: string) => git(a, c) })).toThrow(/Symlink|Junction/);
    expect(() => run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() })).toThrow();
  });

  it("schlaegt `git worktree list` fehl, bricht alles ab und loescht nichts (fail-closed)", () => {
    const w = world();
    const dir = w.orphan("rest3");
    const kaputt = (args: string[], cwd: string) => {
      if (args[0] === "worktree") throw new Error("git kaputt");
      return git(args, cwd);
    };
    expect(() => run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ git: kaputt }) })).toThrow(/Abbruch/);
    expect(exists(dir)).toBe(true);
  });

  it("Wettlauf: wird der Ordner zwischen Planung und Loeschen ein bekannter Worktree, bleibt er", () => {
    const w = world();
    const dir = w.orphan("rest4");
    let n = 0;
    const git2 = (args: string[], cwd: string) => {
      const out = git(args, cwd);
      if (args[0] === "worktree") {
        n += 1;
        if (n >= 2) return `${out}\nworktree ${dir.replace(/\\/g, "/")}\nHEAD abc\n`; // ab dem zweiten Lesen ist er bekannt
      }
      return out;
    };
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ git: git2 }) });
    expect(exists(dir)).toBe(true);
    expect(statusOf(res, "rest4")).toBe("uebersprungen");
  });
});

describe("Worktree-Aufraeumen: gesperrte Ordner und schreibgeschuetzte Dateien", () => {
  it("ein gesperrter Ordner wird gemeldet, die anderen laufen weiter (kein Abbruch)", () => {
    const w = world();
    const a = w.orphan("gesperrt1", { "fest.txt": "x" });
    const b = w.orphan("frei1", { "y.txt": "y" });
    const fsx = {
      ...fs,
      unlinkSync: (p: string) => {
        if (String(p).endsWith("fest.txt")) throw Object.assign(new Error("busy"), { code: "EBUSY" });
        return fs.unlinkSync(p);
      },
    };
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ fsx }) });
    expect(statusOf(res, "gesperrt1")).toBe("gesperrt");
    expect(res.lines.join("\n")).toContain("EBUSY");
    expect(exists(a)).toBe(true);
    expect(statusOf(res, "frei1")).toBe("geloescht");
    expect(exists(b)).toBe(false);
    expect(res.summary.gesperrt).toBe(1);
  });

  it("eine schreibgeschuetzte Datei wird nach dem Zuruecksetzen des Attributs geloescht", () => {
    const w = world();
    const dir = w.orphan("ro1", { "nurlesen.txt": "r" });
    fs.chmodSync(path.join(dir, "nurlesen.txt"), 0o444);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "ro1")).toBe("geloescht");
    expect(exists(dir)).toBe(false);
  });
});

describe("Worktree-Aufraeumen: Dev-Server", () => {
  it("beendet wird NUR ein Hoerer, dessen Kommandozeile den Pfad des Kandidaten enthaelt; fremde Prozesse bleiben", () => {
    const w = world();
    const dir = w.orphan("rest5");
    w.fake.listeners = [
      { port: 3102, pid: 111 },
      { port: 3103, pid: 222 },
    ];
    w.fake.cmd[111] = `node ${dir}\\node_modules\\next\\dist\\bin\\next dev -p 3102`;
    w.fake.cmd[222] = "node C:\\anderer\\ordner\\next dev -p 3103";
    run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(w.fake.killed).toEqual([111]);
  });

  it("im Trockenlauf wird nie ein Prozess beendet", () => {
    const w = world();
    const dir = w.orphan("rest6");
    w.fake.listeners = [{ port: 3102, pid: 333 }];
    w.fake.cmd[333] = `node ${dir} dev`;
    run({ scriptDir: w.scriptDir, apply: false, deps: w.deps() });
    expect(w.fake.killed).toEqual([]);
  });

  it("parseNetstat: deutsch und englisch, nur Hoerer auf 3101 bis 3109, NIE 3100, Fremdadresse nicht 0:0 wird ignoriert", () => {
    const text = [
      "  Proto  Lokale Adresse         Remoteadresse          Status           PID",
      "  TCP    0.0.0.0:3100           0.0.0.0:0              ABHÖREN          1000",
      "  TCP    0.0.0.0:3102           0.0.0.0:0              ABHÖREN          2000",
      "  TCP    [::]:3104              [::]:0                 LISTENING        3000",
      "  TCP    127.0.0.1:3105         127.0.0.1:50000        HERGESTELLT      4000",
      "  TCP    0.0.0.0:3110           0.0.0.0:0              ABHÖREN          5000",
      "  TCP    0.0.0.0:3109           0.0.0.0:0              ABH?REN          6000",
      "  TCP    0.0.0.0:3102           0.0.0.0:0              ABHÖREN          2000",
    ].join("\r\n");
    expect(parseNetstat(text)).toEqual([
      { port: 3102, pid: 2000 },
      { port: 3104, pid: 3000 },
      { port: 3109, pid: 6000 },
    ]);
    expect(parseNetstat(text).some((l) => l.port === 3100)).toBe(false);
  });

  it("cmdContainsPath: / gegen \\ und Gross-/Kleinschreibung sind egal", () => {
    expect(cmdContainsPath("node C:\\Users\\X\\worktrees\\Rest5\\next dev", "c:/users/x/worktrees/rest5")).toBe(true);
    expect(cmdContainsPath("node C:\\Users\\X\\worktrees\\rest50\\next", "c:/users/x/worktrees/rest5/")).toBe(false);
    expect(cmdContainsPath("node D:\\anders", "c:/users/x/worktrees/rest5")).toBe(false);
    expect(cmdContainsPath("", "c:/x")).toBe(false);
  });
});

describe("Worktree-Aufraeumen: Snapshot-Rest (Ordner ohne .git)", () => {
  const OLD = Date.now() - 48 * 3600_000;
  /** Commit mit n Dateien im Hauptrepo (Blobs in der Objektdatenbank) und eine Kopie davon als Ordner ohne .git unter worktrees/. */
  function snapshot(w: ReturnType<typeof world>, name: string, n = 55) {
    const dir = path.join(w.root, name);
    for (let i = 0; i < n; i++) {
      const rel = `src/dir${i % 5}/file${i}.ts`;
      const content = `export const v${i} = ${i};\n`;
      fs.mkdirSync(path.dirname(path.join(w.main, rel)), { recursive: true });
      fs.writeFileSync(path.join(w.main, rel), content);
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    git(["add", "-A"], w.main);
    git(["commit", "-q", "-m", "snap"], w.main);
    return dir;
  }
  const age = (dir: string, when = OLD) => {
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop()!;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else fs.utimesSync(p, when / 1000, when / 1000);
      }
    }
  };

  it("nur bekannte Blobs plus generierte Dateien (next-env.d.ts, tsbuildinfo, .next, test-results, node_modules-Verknuepfung): wird entfernt, das Ziel der Verknuepfung bleibt", () => {
    const w = world();
    const dir = snapshot(w, "snap1");
    fs.writeFileSync(path.join(dir, "next-env.d.ts"), "generiert");
    fs.writeFileSync(path.join(dir, "tsconfig.tsbuildinfo"), "generiert");
    fs.mkdirSync(path.join(dir, ".next"));
    fs.writeFileSync(path.join(dir, ".next", "x.js"), "x");
    fs.mkdirSync(path.join(dir, "test-results"));
    fs.writeFileSync(path.join(dir, "test-results", "r.txt"), "r");
    const ziel = path.join(w.tmp, "nm-ziel");
    fs.mkdirSync(ziel);
    fs.writeFileSync(path.join(ziel, "bleibt.txt"), "x");
    fs.symlinkSync(ziel, path.join(dir, "node_modules"), "junction");
    age(dir);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(statusOf(res, "snap1")).toBe("geloescht");
    expect(exists(dir)).toBe(false);
    expect(exists(path.join(ziel, "bleibt.txt"))).toBe(true);
  });

  it("eine einzigartige Datei (unbekannter Inhalt) => Ordner bleibt, die Datei steht namentlich in der Ausgabe", () => {
    const w = world();
    const dir = snapshot(w, "snap2");
    fs.writeFileSync(path.join(dir, "src", "meine-arbeit.ts"), "einzigartig, nie committet");
    age(dir);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(statusOf(res, "snap2")).toBe("uebersprungen");
    expect(exists(path.join(dir, "src", "meine-arbeit.ts"))).toBe(true);
    expect(res.lines.join(String.fromCharCode(10))).toContain("src/meine-arbeit.ts");
  });

  it("Windows-Zeilenenden: Dateien mit CRLF (autocrlf-Checkout) gelten als bekannt, eine geaenderte Zeile nicht", () => {
    const w = world();
    const dir = snapshot(w, "snap3");
    const crlf = String.fromCharCode(13, 10);
    for (let i = 0; i < 3; i++) {
      const p = path.join(dir, `src/dir${i % 5}/file${i}.ts`);
      fs.writeFileSync(p, fs.readFileSync(p, "utf8").split(String.fromCharCode(10)).join(crlf));
    }
    age(dir);
    expect(statusOf(run({ scriptDir: w.scriptDir, apply: false, deps: w.deps({ now: Date.now() }) }), "snap3")).toBe("wuerde-loeschen");
    fs.writeFileSync(path.join(dir, "src/dir0/file0.ts"), `export const v0 = 99;${crlf}`);
    age(dir);
    expect(statusOf(run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) }), "snap3")).toBe("uebersprungen");
    expect(exists(dir)).toBe(true);
  });

  it("Mindestalter: ist die NEUESTE Datei juenger als 24 h, bleibt der Ordner; ab 24 h wird er entfernt", () => {
    const w = world();
    const dir = snapshot(w, "snap4");
    age(dir);
    fs.utimesSync(path.join(dir, "src/dir1/file1.ts"), Date.now() / 1000, Date.now() / 1000);
    const jung = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(statusOf(jung, "snap4")).toBe("uebersprungen");
    expect(jung.lines.join(String.fromCharCode(10))).toContain("juenger als 24 h");
    expect(exists(dir)).toBe(true);
    age(dir);
    expect(statusOf(run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) }), "snap4")).toBe("geloescht");
  });

  it("weniger als 50 Dateien bleiben, auch wenn alle bekannt sind", () => {
    const w = world();
    const dir = snapshot(w, "snap5", 49);
    age(dir);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    expect(statusOf(res, "snap5")).toBe("uebersprungen");
    expect(exists(dir)).toBe(true);
  });

  it("scheitert die Blob-Pruefung (Fehler), bleibt der Ordner (fail-closed)", () => {
    const w = world();
    const dir = snapshot(w, "snap6");
    age(dir);
    const res = run({
      scriptDir: w.scriptDir,
      apply: true,
      deps: w.deps({
        blobCheck: () => {
          throw new Error("git kaputt");
        },
      }),
    });
    expect(statusOf(res, "snap6")).toBe("uebersprungen");
    expect(exists(dir)).toBe(true);
  });
});

describe("Worktree-Aufraeumen: Funde des security-reviewers", () => {
  it("Gitlink-Ordner, dessen gitdir NOCH EXISTIERT (nur nicht in worktree list), bleibt zur manuellen Pruefung", () => {
    const w = world();
    const dir = path.join(w.root, "gitlink-lebt");
    fs.mkdirSync(dir);
    const gitdir = path.join(w.tmp, "irgendein-gitdir");
    fs.mkdirSync(gitdir);
    fs.writeFileSync(path.join(dir, ".git"), `gitdir: ${gitdir}\n`);
    fs.writeFileSync(path.join(dir, "arbeit.txt"), "ungepusht");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    expect(statusOf(res, "gitlink-lebt")).toBe("uebersprungen");
    expect(exists(path.join(dir, "arbeit.txt"))).toBe(true);
  });

  it("Mindestalter fuer ALLE Kandidatenarten: junger leerer Ordner, junger Gitlink-Rest und junge node_modules-Verknuepfung bleiben", () => {
    const w = world();
    const leer = path.join(w.root, "jung-leer");
    fs.mkdirSync(leer);
    const rest = w.orphan("jung-rest");
    const nm = path.join(w.root, "jung-nm");
    fs.mkdirSync(nm);
    const ziel = path.join(w.tmp, "z");
    fs.mkdirSync(ziel);
    fs.symlinkSync(ziel, path.join(nm, "node_modules"), "junction");
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    for (const n of ["jung-leer", "jung-rest", "jung-nm"]) expect(statusOf(res, n), n).toBe("uebersprungen");
    expect(exists(leer) && exists(rest) && exists(nm)).toBe(true);
    // dieselben Ordner 48 h spaeter: weg
    const spaeter = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    for (const n of ["jung-leer", "jung-rest", "jung-nm"]) expect(statusOf(spaeter, n), n).toBe("geloescht");
  });

  it("Snapshot: Ausnahmen gelten nur auf oberster Ebene; verschachteltes .git, coverage und *.tsbuildinfo mit eigenem Inhalt halten den Ordner", () => {
    const w = world();
    const versteck = [".git/HEAD", "docs/coverage/einzigartig.md", "pkg/x.tsbuildinfo", "pkg/next-env.d.ts"];
    versteck.forEach((rel, i) => {
      const dir = path.join(w.root, `versteck${i}`);
      for (let k = 0; k < 55; k++) {
        const p = path.join(dir, `src/f${k}.ts`);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, `export const w${i}x${k} = ${k};\n`);
        const q = path.join(w.main, `src/w${i}/f${k}.ts`);
        fs.mkdirSync(path.dirname(q), { recursive: true });
        fs.writeFileSync(q, `export const w${i}x${k} = ${k};\n`);
      }
      const h = path.join(dir, rel.startsWith(".git/") ? "sub/" + rel : rel);
      fs.mkdirSync(path.dirname(h), { recursive: true });
      fs.writeFileSync(h, `eigener Inhalt ${i}`);
      const old = Date.now() - 72 * 3600_000;
      for (const f of fs.readdirSync(path.join(dir, "src"))) fs.utimesSync(path.join(dir, "src", f), old / 1000, old / 1000);
      fs.utimesSync(h, old / 1000, old / 1000);
    });
    git(["add", "-A"], w.main);
    git(["commit", "-q", "-m", "v"], w.main);
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps() });
    versteck.forEach((_, i) => {
      expect(statusOf(res, `versteck${i}`), `versteck${i}`).toBe("uebersprungen");
      expect(exists(path.join(w.root, `versteck${i}`))).toBe(true);
    });
  });

  it("Allowlist: Punkte sind maskiert, 'layout', 'workout', 'dev-xlog', 'chkAxcjs' passen NICHT", () => {
    const w = world();
    const old = Date.now() - 72 * 3600_000;
    const namen = ["layout", "workout", "dev-xlog", "chkAxcjs", "mut-xmjs"];
    for (const n of namen) {
      fs.writeFileSync(path.join(w.root, n), "x");
      fs.utimesSync(path.join(w.root, n), old / 1000, old / 1000);
    }
    const res = run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ now: Date.now() }) });
    for (const n of namen) {
      expect(exists(path.join(w.root, n)), n).toBe(true);
      expect(statusOf(res, n), n).toBe("unbekannt");
    }
  });

  it("Bare-Repo/fremdes common-dir (kein .git-Ordner) wird abgelehnt", () => {
    const w = world();
    const bare = path.join(w.tmp, "fremd.git");
    fs.mkdirSync(bare);
    expect(() => resolveRoots({ scriptDir: w.scriptDir, git: () => bare })).toThrow(/Bare-Repo/);
  });

  it("Abbruch beim erneuten Lesen von worktree list mitten im --apply-Lauf: Fehler traegt die bisherigen Zeilen (partial)", () => {
    const w = world();
    w.orphan("a-rest");
    w.orphan("b-rest");
    let n = 0;
    const g = (args: string[], cwd: string) => {
      if (args[0] === "worktree") {
        n += 1;
        if (n >= 2) throw new Error("git weg");
      }
      return git(args, cwd);
    };
    let err: (Error & { partial?: string[] }) | null = null;
    try {
      run({ scriptDir: w.scriptDir, apply: true, deps: w.deps({ git: g }) });
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(Array.isArray(err!.partial)).toBe(true);
  });
});

describe("Worktree-Aufraeumen: Pfade und Aufruf", () => {
  it("normalizePath: Windows ohne Gross-/Kleinschreibung und ohne Schlussstrich, Linux unterscheidet", () => {
    expect(normalizePath("/Tmp/X/", "win32")).toBe(normalizePath("/tmp/x", "win32"));
    expect(normalizePath("/Tmp/X", "linux")).not.toBe(normalizePath("/tmp/x", "linux"));
  });

  it("parseWorktreeList liest nur 'worktree <pfad>'-Zeilen (auch mit Leerzeichen im Pfad)", () => {
    const t = "worktree C:/a b/SoccaV2\nHEAD abc\nbranch refs/heads/main\n\nworktree C:/a b/worktrees/x\nHEAD def\ndetached\n";
    expect(parseWorktreeList(t)).toEqual(["C:/a b/SoccaV2", "C:/a b/worktrees/x"]);
  });

  it("unbekanntes Argument: Hilfe, Exit 2, nichts geschieht (auch --apply mit Zusatz)", () => {
    for (const args of [["--bogus"], ["--apply", "--x"], ["apply"]]) {
      let code = 0;
      try {
        execFileSync("node", [SCRIPT, ...args], { stdio: "pipe" });
      } catch (e) {
        code = (e as { status: number }).status;
      }
      expect(code, args.join(" ")).toBe(2);
    }
  });
});
