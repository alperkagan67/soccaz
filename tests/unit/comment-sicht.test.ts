import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commentView, type CommentRowIn } from "@/lib/comment-sicht";
import { autorLabel, lobbySicht } from "@/lib/lobby-namen";
import { NAME_HINWEIS } from "@/lib/sichtbarkeit-texte";

// AC-17 (Entscheid t2q 2026-11-24): Autoren in Kommentaren: Angemeldete Name und Link, Gäste und reine Hallenbetreiber Initialen ohne Link; Name und Autor-Kennung stehen nicht im ausgelieferten HTML.
const session = vi.hoisted(() => ({ user: null as null | { id: string; role: "player" | "admin"; onboardedAt: Date | null } }));
const venue = vi.hoisted(() => ({ manager: false, calls: 0 }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/session", () => ({ getCurrentUser: async () => session.user }));
vi.mock("@/server/venue-access-rules", () => ({ isVenueManager: async () => { venue.calls++; return venue.manager; } }));
vi.mock("@/server/content", () => ({ listComments: async () => [] }));
vi.mock("@/server/content-actions", () => ({ postCommentAction: async () => undefined, deleteCommentAction: async () => undefined, reportCommentAction: async () => undefined }));

const NAME = "Zorro Vollname";
const AUTHOR_ID = "11111111-2222-3333-4444-555555555555";
const rows: CommentRowIn[] = [{ id: "c1", body: "Tolles Team", rating: null, createdAt: new Date("2026-11-20T10:00:00Z"), authorId: AUTHOR_ID, authorName: NAME, mine: false }];

const ROLLEN = [
  { rolle: "Gast", user: null, manager: false, erwartet: "guest" },
  { rolle: "Spieler", user: { id: "u1", role: "player" as const, onboardedAt: new Date() }, manager: false, erwartet: "member" },
  { rolle: "reiner Betreiber", user: { id: "u2", role: "player" as const, onboardedAt: new Date() }, manager: true, erwartet: "hall" },
  { rolle: "Plattform-Admin", user: { id: "u3", role: "admin" as const, onboardedAt: new Date() }, manager: false, erwartet: "member" },
  { rolle: "Plattform-Admin und Betreiber", user: { id: "u4", role: "admin" as const, onboardedAt: new Date() }, manager: true, erwartet: "member" },
] as const;

describe("getViewerSicht: EINE Quelle (lobbySicht/cardViewerFor) je Rolle", () => {
  beforeEach(() => { venue.calls = 0; });
  for (const r of ROLLEN) {
    it(r.rolle, async () => {
      session.user = r.user as never;
      venue.manager = r.manager;
      const { getViewerSicht } = await import("@/server/viewer-sicht");
      expect((await getViewerSicht()).sicht).toBe(r.erwartet);
    });
  }
  it("Team-Admin oder Teilnehmer, der zugleich Betreiber ist, sieht Namen (wie in der Lobby) und die Betreiber-Abfrage entfällt", async () => {
    session.user = ROLLEN[2].user as never;
    venue.manager = true;
    const { getViewerSicht } = await import("@/server/viewer-sicht");
    venue.calls = 0;
    expect((await getViewerSicht({ teamAdmin: true })).sicht).toBe("member");
    expect((await getViewerSicht({ participant: true })).sicht).toBe("member");
    expect(venue.calls).toBe(0);
  });
  it("Gast und Plattform-Admin lösen keine Betreiber-Abfrage aus (sie ändert nichts)", async () => {
    const { getViewerSicht } = await import("@/server/viewer-sicht");
    venue.calls = 0;
    session.user = null;
    await getViewerSicht();
    session.user = ROLLEN[3].user as never;
    await getViewerSicht();
    expect(venue.calls).toBe(0);
  });
  it("dieselbe Entscheidung wie lobbySicht (keine zweite Regel)", () => {
    expect(lobbySicht({ userId: null, hallOperator: false, participant: false, teamAdmin: false, platformAdmin: false })).toBe("guest");
    expect(lobbySicht({ userId: "u", hallOperator: true, participant: false, teamAdmin: false, platformAdmin: false })).toBe("hall");
  });
});

describe("commentView und autorLabel", () => {
  it("Name und Link nur für Angemeldete; Gast und Betreiber: Initialen, kein Link, weder Name noch Kennung in der Zeile", () => {
    const member = commentView(rows, "member")[0];
    expect(member.label).toBe(NAME);
    expect(member.href).toBe(`/spieler/${AUTHOR_ID}`);
    for (const sicht of ["guest", "hall"] as const) {
      const z = commentView(rows, sicht)[0];
      expect(z.label).toBe("ZV");
      expect(z.href).toBeNull();
      expect(JSON.stringify(z)).not.toContain(NAME);
      expect(JSON.stringify(z)).not.toContain(AUTHOR_ID);
    }
    expect(autorLabel(NAME, "hall")).toBe("ZV");
  });
});

describe("Kommentarliste und Formular im HTML je Rolle", () => {
  async function html(sicht: "guest" | "member" | "hall", o: { signedIn: boolean; canPost: boolean }) {
    const { CommentList } = await import("@/components/Comments");
    return renderToStaticMarkup(createElement(CommentList, { rows: commentView(rows, sicht), sicht, venue: false, targetType: "team", targetId: "t1", path: "/teams/x", title: "Kommentare", canWrite: true, ...o }));
  }
  it("Gast: kein Name, keine Kennung, kein Link auf /spieler, Anmelden statt Formular", async () => {
    const h = await html("guest", { signedIn: false, canPost: false });
    expect(h).toContain(">ZV<");
    expect(h).not.toContain("Zorro");
    expect(h).not.toContain("Vollname");
    expect(h).not.toContain(AUTHOR_ID);
    expect(h).not.toContain("/spieler/");
    expect(h).toContain("Anmelden");
    expect(h).not.toContain("comment-name-hinweis");
  });
  it("reiner Betreiber (angemeldet, darf schreiben): Initialen ohne Link, Hinweis im Formular", async () => {
    const h = await html("hall", { signedIn: true, canPost: true });
    expect(h).toContain(">ZV<");
    expect(h).not.toContain("Zorro");
    expect(h).not.toContain(AUTHOR_ID);
    expect(h).not.toContain("/spieler/");
    expect(h).toContain('data-testid="comment-name-hinweis"');
  });
  it("Spieler und Plattform-Admin (member): Name mit Link und der Hinweistext beim Schreiben", async () => {
    const h = await html("member", { signedIn: true, canPost: true });
    expect(h).toContain(`href="/spieler/${AUTHOR_ID}"`);
    expect(h).toContain(NAME);
    expect(h).toContain(NAME_HINWEIS);
  });
  it("Hinweistext: Wortlaut aus EINER Konstante (ENTWURF), nennt angemeldete Nutzer", () => {
    expect(NAME_HINWEIS).toMatch(/angemeldete Nutzer/);
  });
});
