import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// AC-17 (Entscheid t2q 2026-11-24), PR D: Das Spielerprofil ist für Gäste nicht öffentlich: Weiterleitung zur Anmeldung mit Rücksprung, nie indexierbar, kein Name im Head, nicht in der Sitemap.
const NAME = "Zorro Vollname";
const sess = vi.hoisted(() => ({ user: null as null | { id: string; role: "player" | "admin" } }));
const prof = vi.hoisted(() => ({ calls: [] as unknown[], value: null as unknown }));
const nav = vi.hoisted(() => ({ redirected: null as null | string }));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => sess.user }));
vi.mock("@/server/profiles", () => ({
  getPlayerProfile: async (...args: unknown[]) => {
    prof.calls.push(args);
    return prof.value;
  },
  playerSchedule: async () => ({ rows: [], hasMore: false }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (to: string) => {
    nav.redirected = to;
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/components/Comments", () => ({ Comments: () => null }));

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const params = (id: string) => ({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }) as never;

beforeEach(() => {
  sess.user = null;
  prof.calls = [];
  prof.value = { hidden: false, user: { name: NAME } };
  nav.redirected = null;
});

describe("generateMetadata des Profils", () => {
  it("Gast: allgemeiner Titel, noindex/nofollow, das Profil wird gar nicht erst geladen (kein Name im Head)", async () => {
    const { generateMetadata } = await import("@/app/spieler/[id]/page");
    const md = await generateMetadata(params("u1"));
    expect(md.title).toBe("Spielerprofil");
    expect(md.robots).toMatchObject({ index: false, follow: false });
    expect(JSON.stringify(md)).not.toContain("Zorro");
    expect(prof.calls).toHaveLength(0);
  });
  it("Angemeldet: der Name steht im Titel, die Seite bleibt noindex; ein verstecktes Profil bekommt den allgemeinen Titel", async () => {
    sess.user = { id: "v1", role: "player" };
    const { generateMetadata } = await import("@/app/spieler/[id]/page");
    const md = await generateMetadata(params("u1"));
    expect(md.title).toBe(NAME);
    expect(md.robots).toMatchObject({ index: false });
    prof.value = { hidden: true, name: NAME };
    expect((await generateMetadata(params("u1"))).title).toBe("Spielerprofil");
  });
});

describe("Seite: Gäste werden zur Anmeldung geleitet", () => {
  it("Weiterleitung mit Rücksprung auf das Profil, ohne das Profil zu laden", async () => {
    const { default: PlayerPage } = await import("@/app/spieler/[id]/page");
    await expect(PlayerPage(params("u1"))).rejects.toThrow("NEXT_REDIRECT");
    expect(nav.redirected).toBe(`/anmelden?next=${encodeURIComponent("/spieler/u1")}`);
    expect(prof.calls).toHaveLength(0);
  });
  it("angemeldet: keine Weiterleitung, das Profil wird mit dem Betrachter geladen", async () => {
    sess.user = { id: "v1", role: "player" };
    prof.value = null;
    const { default: PlayerPage } = await import("@/app/spieler/[id]/page");
    await expect(PlayerPage(params("u1"))).rejects.toThrow("NOT_FOUND");
    expect(nav.redirected).toBeNull();
    expect(prof.calls).toEqual([["u1", { id: "v1", role: "player" }]]);
  });
});

describe("Suchmaschinen", () => {
  it("robots.txt sperrt /spieler/ (die Liste /spieler bleibt erlaubt)", async () => {
    const { default: robots } = await import("@/app/robots");
    const rules = (robots().rules as { disallow: string[] }[])[0];
    expect(rules.disallow).toContain("/spieler/");
    expect(rules.disallow).not.toContain("/spieler");
  });
  it("die Sitemap nennt keine Spielerprofile (nur die Liste /spieler)", () => {
    const src = read("src/app/sitemap.ts");
    expect(src).not.toMatch(/\/spieler\//);
    expect(src).not.toMatch(/\bplayers?\b.*from\(/);
  });
});
