import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Backlog 243 (Entscheid t2q 2026-11-24): Bilder (/api/media/<id>) nur für Angemeldete, ohne Anmeldung 404 wie ein unbekanntes Bild; Antwort nur privat zwischenspeicherbar;
// Teamlogo für Gäste weggelassen; Spielfotos aus bis zum Social-Media-Teil.
const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
const store = vi.hoisted(() => ({ rows: new Map<string, { data: Buffer; mime: string; status: string }>() }));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/server/media", () => ({ getMedia: async (id: string) => store.rows.get(id) ?? null, removeMedia: async () => undefined }));

const root = join(__dirname, "..", "..");
const src = (f: string) => readFileSync(join(root, f), "utf8");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const ID = "3f2a7c1e-0000-4000-8000-000000000001";

let GET: typeof import("../../src/app/api/media/[id]/route").GET;
beforeEach(async () => {
  ({ GET } = await import("../../src/app/api/media/[id]/route"));
  store.rows.set(ID, { data: Buffer.from("bild"), mime: "image/webp", status: "visible" });
});
afterEach(() => {
  session.user = null;
  store.rows.clear();
});

describe("GET /api/media/[id]", () => {
  it("Gast: 404, derselbe Text wie bei einem unbekannten Bild, nie zwischenspeichern, keine Bilddaten", async () => {
    const r = await GET(new Request("http://x/api/media/" + ID), ctx(ID));
    const unbekannt = await GET(new Request("http://x/api/media/unbekannt"), ctx("00000000-0000-4000-8000-000000000000"));
    expect(r.status).toBe(404);
    expect(await r.text()).toBe(await unbekannt.text());
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("Content-Type")).not.toBe("image/webp");
  });
  it("Angemeldet: 200 mit dem Bild, aber nur privat zwischenspeicherbar (nie public), Vary Cookie", async () => {
    session.user = { id: "u1", role: "player" };
    const r = await GET(new Request("http://x/api/media/" + ID), ctx(ID));
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/webp");
    expect(r.headers.get("Cache-Control")).toMatch(/^private,/);
    expect(r.headers.get("Cache-Control")).not.toContain("public");
    expect(r.headers.get("Vary")).toBe("Cookie");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("Angemeldet, Bild unbekannt oder entfernt: 404", async () => {
    session.user = { id: "u1", role: "player" };
    expect((await GET(new Request("http://x"), ctx("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
  });
});

describe("Einbindung: Gast bekommt kein Bild-Verweis, Spielfotos aus", () => {
  it("Teamseite: Teamlogo nur für Angemeldete (kein <Image> mit /api/media für Gäste)", () => {
    expect(src("src/app/teams/[slug]/page.tsx")).toContain("{user && team.logoUrl && <Image src={team.logoUrl}");
  });
  it("Spielseite: Fotos nur, wenn der Schalter an ist (Standard aus); Upload und Liste prüfen ihn serverseitig", () => {
    expect(src("src/app/spiele/[id]/page.tsx")).toContain("{matchPhotosEnabled() && <MatchPhotos");
    const m = src("src/server/media.ts");
    expect(m).toContain('if (kind === "match_photo" && !matchPhotosEnabled()) throw new DomainError("Spielfotos sind noch nicht verfügbar.")');
    expect(m).toContain("if (!matchPhotosEnabled()) return [];");
  });
  it("Schalter: Standard aus, nur MATCH_PHOTOS_ENABLED=1 schaltet ein", async () => {
    const { matchPhotosEnabled } = await import("@/lib/media-flags");
    vi.stubEnv("MATCH_PHOTOS_ENABLED", "");
    expect(matchPhotosEnabled()).toBe(false);
    vi.stubEnv("MATCH_PHOTOS_ENABLED", "true");
    expect(matchPhotosEnabled()).toBe(false);
    vi.stubEnv("MATCH_PHOTOS_ENABLED", "1");
    expect(matchPhotosEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
  it("Gast-Registry: /api/media/[id] ist kein Ausnahmefall mehr, sondern 'angemeldet'", () => {
    const reg = src("tests/e2e/gast-sicht-routen.ts");
    expect(reg).toMatch(/"\/api\/media\/\[id\]": a\(/);
    expect(reg).not.toMatch(/"\/api\/media\/\[id\]": \{ art: "ausnahme"/);
  });
});
