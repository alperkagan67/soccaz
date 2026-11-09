import { describe, expect, it, vi } from "vitest";

// requireUser meldet das Rücksprungziel (next), das die Aktion berechnet hat, als Fehler zurück. So lässt sich safePath ohne Anfrage prüfen.
const requireUser = vi.fn(async (next?: string) => {
  throw new Error(`NEXT:${next}`);
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ requireUser: (next?: string) => requireUser(next), requirePermission: vi.fn() }));

import { deleteCommentAction, postCommentAction, reportCommentAction } from "@/server/content-actions";

const BS = String.fromCharCode(92);
const nextOf = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return (e as Error).message.replace(/^NEXT:/, "");
  }
  return "kein requireUser-Aufruf";
};

describe("Kommentar-Aktionen: Rücksprungziel (safePath)", () => {
  it("fremde, kaputte und nicht-interne Pfade fallen auf '/'", async () => {
    for (const bad of [`/${BS}evil.example`, "//evil.example", "https://evil.example", "evil.example", "/\t/evil.example", " /x", ""]) {
      expect(await nextOf(() => deleteCommentAction("c1", bad)), JSON.stringify(bad)).toBe("/");
      expect(await nextOf(() => reportCommentAction("c1", bad, "grund")), JSON.stringify(bad)).toBe("/");
    }
  });

  it("interne Pfade bleiben unverändert", async () => {
    expect(await nextOf(() => deleteCommentAction("c1", "/teams/abc?x=1#k"))).toBe("/teams/abc?x=1#k");
  });

  it("postCommentAction: Backslash-Pfad wird ebenfalls zu '/'", async () => {
    const f = new FormData();
    f.set("targetType", "team");
    f.set("targetId", "2f1c4b0e-8f0a-4a52-9a43-5b8d8e1d9c11");
    f.set("body", "Hallo");
    f.set("path", `/${BS}evil.example`);
    expect(await nextOf(() => postCommentAction({}, f))).toBe("/");
    f.set("path", "/spieler/xyz");
    expect(await nextOf(() => postCommentAction({}, f))).toBe("/spieler/xyz");
  });
});
