import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canUser, type Permission, type Role } from "@/lib/roles";

// Vertrag 009 M1, E1b (docs/design/009-m1-plan.md 3.2): Berechtigungsmatrix Rolle × Seite × Server-Aktion.
// Die Seiten und Aktionen werden aus dem Quelltext gelesen (requirePermission / guarded), damit eine neue Seite ohne Eintrag hier den Test bricht.

type Who = "player" | "moderator" | "finance" | "booking" | "admin" | "owner";
const USERS: Record<Who, { role: Role; isOwner: boolean }> = {
  player: { role: "player", isOwner: false },
  moderator: { role: "moderator", isOwner: false },
  finance: { role: "finance", isOwner: false },
  booking: { role: "booking", isOwner: false },
  admin: { role: "admin", isOwner: false }, // Admin 2
  owner: { role: "admin", isOwner: true }, // Admin 1
};

// Soll: wer darf welche Berechtigung (Plan 3.2). Admin 2 hat KEINE Finanzen und keine Einstellungen/Rollen.
const ALLOWED: Record<Permission, Who[]> = {
  dashboard: ["moderator", "finance", "booking", "admin", "owner"],
  admin: ["admin", "owner"],
  moderation: ["moderator", "admin", "owner"],
  booking: ["booking", "admin", "owner"],
  finance: ["finance", "owner"],
  owner: ["owner"],
};

// Soll je Admin-Seite (Pfad unter src/app/admin) und je Server-Aktion mit Wächter
const PAGES: Record<string, Permission> = {
  "page.tsx": "dashboard",
  "buchungen/page.tsx": "booking",
  "codes/page.tsx": "finance",
  "einstellungen/page.tsx": "owner",
  "finanzen/page.tsx": "finance",
  "finanzen/ausgaben/page.tsx": "finance",
  "finanzen/spiel/[id]/page.tsx": "finance",
  "hallen/page.tsx": "booking",
  "ligen/page.tsx": "admin",
  "moderation/page.tsx": "moderation",
  "nutzer/page.tsx": "admin",
  "profitag/page.tsx": "admin",
  "protokoll/page.tsx": "admin",
  "spiele/page.tsx": "admin",
  "sponsoren/page.tsx": "admin",
  "teams/page.tsx": "admin",
  "zahlungsstreit/page.tsx": "admin", // M4a-2: Admin 2 liest Liste und Detail (m4-plan), Entscheidungen gehoeren Admin 1 (Vertrag 009)
  "zahlungsstreit/[id]/page.tsx": "admin",
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const adminDir = path.resolve(import.meta.dirname, "../../src/app/admin");
const guardOf = (file: string) => /requirePermission\("(\w+)"/.exec(readFileSync(file, "utf8"))?.[1];

describe("Admin-Seiten: Wächter je Seite", () => {
  const pages = walk(adminDir).filter((p) => p.endsWith("page.tsx")).map((p) => path.relative(adminDir, p).split(path.sep).join("/"));
  it("jede Admin-Seite steht in der Matrix (neue Seite ohne Eintrag bricht den Test)", () => {
    expect(pages.sort()).toEqual(Object.keys(PAGES).sort());
  });
  for (const [page, permission] of Object.entries(PAGES)) {
    it(`${page}: requirePermission("${permission}")`, () => {
      expect(guardOf(path.join(adminDir, page))).toBe(permission);
    });
  }
  it("Finanz-Export: nur wer Finanzen darf (canUser finance)", () => {
    expect(readFileSync(path.join(adminDir, "finanzen/export/route.ts"), "utf8")).toContain('canUser(user, "finance")');
  });
});

describe("Server-Aktionen mit Wächter", () => {
  const src = (f: string) => readFileSync(path.resolve(import.meta.dirname, "../../src/server", f), "utf8");
  it("Einstellungen speichern: nur Admin 1", () => {
    expect(src("admin-finance-actions.ts")).toContain('guarded("owner", "/admin/einstellungen"');
  });
  it("Finanz-Aktionen (Codes, Erstattung, Preisregeln): finance", () => {
    const finance = src("admin-finance-actions.ts").match(/guarded\("finance"/g) ?? [];
    expect(finance.length).toBeGreaterThanOrEqual(5);
  });
  it("Rolle vergeben: nur Admin 1 (Wächter owner)", () => {
    expect(src("admin-actions.ts")).toContain('"owner"); // nur Admin 1 vergibt Rollen');
  });
});

describe("Matrix: Rolle × Berechtigung (canUser)", () => {
  for (const [permission, who] of Object.entries(ALLOWED) as [Permission, Who[]][]) {
    for (const [name, user] of Object.entries(USERS) as [Who, (typeof USERS)[Who]][]) {
      it(`${permission}: ${name} ${who.includes(name) ? "darf" : "darf nicht"}`, () => {
        expect(canUser(user, permission)).toBe(who.includes(name));
      });
    }
  }
  it("is_owner ohne Rolle admin zählt nie (der CHECK der Datenbank verbietet es, die Funktion auch)", () => {
    expect(canUser({ role: "player", isOwner: true }, "finance")).toBe(false);
    expect(canUser({ role: "moderator", isOwner: true }, "owner")).toBe(false);
  });
  it("kein Nutzer: nichts", () => {
    expect(canUser(null, "dashboard")).toBe(false);
  });
});
